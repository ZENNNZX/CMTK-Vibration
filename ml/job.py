"""งาน ML รายชั่วโมง — คำนวณดัชนีสุขภาพรายวันของทุกมอเตอร์

เป็น batch loop ไม่ใช่ web service: ไม่มี endpoint ให้ยิง ไม่มี auth ให้ดูแล
วนรอบเหมือน setInterval ใน backend/src/server.ts เพื่อให้พฤติกรรมเดาได้เหมือนกันทั้งสแตก

รันครั้งแรกจะเติมย้อนหลังทั้งชุดเอง เพราะเขียนเฉพาะวันที่ยังไม่มีในตาราง
"""

from __future__ import annotations

import os
import sys
import time
from datetime import date

import numpy as np
import psycopg

from health import BASELINE_DAYS, MODEL, OK, ALARM, fit_baseline, level

# ตัวแปรที่ใช้รอบแรก — a_peak กับ crest ยังมีข้อมูลไม่ถึงเดือน (ดู STATUS) ค่อยเติมเมื่อครบ
FEATURES = ("vrms_y", "vrms_z", "temperature")

# วันที่เครื่องเดินน้อยกว่านี้ไม่นับ — ต้องตรงกับ MIN_RUNNING_MINUTES ฝั่ง backend
MIN_RUNNING_MINUTES = 30

INTERVAL_SECONDS = int(os.getenv("ML_INTERVAL_SECONDS", "3600"))

# ขอบบนของคอลัมน์ในฐาน — D² ของวันที่เพี้ยนมาก ๆ ทะลุได้ง่าย ตัดก่อนเขียนดีกว่าให้ INSERT ล้ม
D2_CAP = 9_999_999.999
EVENT_VALUE_CAP = 9_999.999

DAILY_SQL = f"""
  SELECT day, {', '.join(FEATURES)}, n_running
    FROM v_motor_daily
   WHERE motor_id = %s
     AND n_running >= {MIN_RUNNING_MINUTES}
     AND {' AND '.join(f'{f} IS NOT NULL' for f in FEATURES)}
   ORDER BY day
"""


def log(msg: str) -> None:
    print(f"[ml] {msg}", flush=True)


def motors(conn) -> list[tuple[int, str]]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, tag FROM motors WHERE is_active ORDER BY id")
        return cur.fetchall()


def daily_rows(conn, motor_id: int):
    with conn.cursor() as cur:
        cur.execute(DAILY_SQL, (motor_id,))
        return cur.fetchall()


def write_health(conn, motor_id: int, rows, base, baseline_span: tuple[date, date]) -> int:
    """เขียนเฉพาะวันที่ยังไม่มี — ค่าที่คำนวณไว้แล้วคือหลักฐาน ไม่ทับของเก่า"""
    written = 0
    with conn.cursor() as cur:
        for day, *feats, n_running in rows:
            d2 = min(base.d2(np.array(feats, dtype=float)), D2_CAP)
            cur.execute(
                """INSERT INTO health_daily
                       (motor_id, day, model, d2, dof, n_running, baseline_from, baseline_to)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (motor_id, day, model) DO NOTHING""",
                (motor_id, day, MODEL, round(d2, 3), base.dof, n_running, *baseline_span),
            )
            written += cur.rowcount
    return written


def sync_event(conn, motor_id: int, day: date, d2: float, state: str, worst_z: float) -> None:
    """เปิดเหตุการณ์เมื่อผิดปกติหนัก ปิดเมื่อกลับมาปกติ

    uq_open_event ในฐานบังคับอยู่แล้วว่าเปิดค้างได้รายการเดียวต่อ (มอเตอร์, ชนิด, เมตริก)
    จึงไม่ต้องเช็คซ้ำในโค้ด ปล่อยให้ ON CONFLICT ทำงาน
    """
    # เตือนเฉพาะตอนที่ผิดปกติไปทาง "แย่ลง" — วันที่เครื่องเดินเบากว่าปกติมากก็ได้ D² สูงเหมือนกัน
    # แต่นั่นคือโหลดเบา ไม่ใช่เครื่องเสื่อม ปลุกช่างกลางดึกเพราะเรื่องนั้นคือวิธีทำให้คนปิดการแจ้งเตือน
    with conn.cursor() as cur:
        if state == ALARM and worst_z > 0:
            cur.execute(
                """INSERT INTO alarm_events (motor_id, kind, metric, raised_at, value_at_raise)
                   VALUES (%s, 'health_anomaly', 'vibration', NOW(), %s)
                   ON CONFLICT (motor_id, kind, metric) WHERE resolved_at IS NULL DO NOTHING""",
                (motor_id, min(d2, EVENT_VALUE_CAP)),
            )
            if cur.rowcount:
                log(f"motor {motor_id} · เปิดเหตุการณ์ health_anomaly · D²={d2:.1f} ({day})")
        elif state == OK:
            cur.execute(
                """UPDATE alarm_events SET resolved_at = NOW(), updated_at = NOW()
                    WHERE motor_id = %s AND kind = 'health_anomaly' AND resolved_at IS NULL""",
                (motor_id,),
            )
            if cur.rowcount:
                log(f"motor {motor_id} · ปิดเหตุการณ์ health_anomaly ({day})")


def run_once(conn) -> None:
    for motor_id, tag in motors(conn):
        rows = daily_rows(conn, motor_id)
        if len(rows) < BASELINE_DAYS:
            log(f"{tag} · มีข้อมูลเดินเครื่อง {len(rows)} วัน ยังไม่ถึง {BASELINE_DAYS} — ข้ามไปก่อน")
            continue

        head = rows[:BASELINE_DAYS]
        base = fit_baseline(np.array([r[1 : 1 + len(FEATURES)] for r in head], dtype=float))
        if base is None:
            log(f"{tag} · ประมาณค่าฐานไม่ได้ — ข้าม")
            continue

        span = (head[0][0], head[-1][0])
        written = write_health(conn, motor_id, rows, base, span)

        last_day, *feats, _ = rows[-1]
        d2 = base.d2(np.array(feats, dtype=float))
        state = level(d2, base.dof)
        worst_z = base.worst_z(np.array(feats, dtype=float))
        sync_event(conn, motor_id, last_day, d2, state, worst_z)
        conn.commit()

        log(f"{tag} · เขียนใหม่ {written} วัน · ล่าสุด {last_day} D²={d2:.2f} z={worst_z:+.1f} → {state}")


def main() -> int:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        log("ไม่มี DATABASE_URL — ออก")
        return 1

    once = "--once" in sys.argv
    while True:
        try:
            with psycopg.connect(dsn) as conn:
                run_once(conn)
        except Exception as e:  # งาน ML ล้มไม่ควรลากอย่างอื่นล้มตาม — log แล้วรอรอบหน้า
            log(f"รอบนี้ล้มเหลว: {e}")
        if once:
            return 0
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
