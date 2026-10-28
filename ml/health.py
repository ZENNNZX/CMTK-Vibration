"""ดัชนีสุขภาพหลายตัวแปร — คณิตล้วน ไม่มี I/O

แยกจาก job.py ด้วยเหตุผลเดียวกับ predictionMath.ts ฝั่ง Node:
เทสต์ยิงตรงได้โดยไม่ต้องมีฐานข้อมูล และตัวเลขทุกตัวที่หน้าเว็บแสดงมาจากที่นี่
"""

from __future__ import annotations

import numpy as np

MODEL = "mahalanobis-v1"

# กี่วันแรกที่ถือเป็น "ช่วงเครื่องปกติ" — สั้นกว่านี้ Σ ไม่นิ่ง ยาวกว่านี้กลืนการเสื่อมช่วงต้นเข้าไปในค่าฐาน
BASELINE_DAYS = 30

# ต้องมีอย่างน้อยกี่วันถึงจะประมาณ Σ ได้ — น้อยกว่า d+2 เมทริกซ์จะเอกฐานหรือใกล้เอกฐาน
MIN_BASELINE_DAYS = 10

# ค่าวิกฤตไคสแควร์ที่ 95% และ 99% ต่อองศาอิสระ
# ตัวเลขจากตารางมาตรฐาน ไม่ได้จูนกับข้อมูลชุดนี้ — เปลี่ยนจำนวนตัวแปรแล้วเกณฑ์ขยับตามเอง
CHI2 = {
    2: (5.991, 9.210),
    3: (7.815, 11.345),
    4: (9.488, 13.277),
    5: (11.070, 15.086),
}

OK, WARNING, ALARM = "ok", "warning", "alarm"


class Baseline:
    """μ กับ Σ⁻¹ ของช่วงที่ถือว่าเครื่องปกติ"""

    def __init__(self, mu: np.ndarray, inv_cov: np.ndarray, sd: np.ndarray, dof: int):
        self.mu = mu
        self.inv_cov = inv_cov
        self.sd = sd
        self.dof = dof

    def d2(self, x: np.ndarray) -> float:
        """ระยะ Mahalanobis กำลังสองของจุดเดียว"""
        diff = np.asarray(x, dtype=float) - self.mu
        return float(diff @ self.inv_cov @ diff)

    def worst_z(self, x: np.ndarray) -> float:
        """คะแนน z ของตัวแปรที่ห่างจากค่าฐานมากที่สุด — เครื่องหมายบอกทิศ

        D² เป็นสองทาง วันที่เครื่องเดินเบากว่าปกติมาก ๆ ก็ได้ค่าสูงเหมือนกัน
        ซึ่งไม่ใช่อาการเสีย การเตือนจึงต้องรู้ว่าที่ผิดปกติคือสูงขึ้นหรือต่ำลง
        """
        z = (np.asarray(x, dtype=float) - self.mu) / self.sd
        return float(z[np.argmax(np.abs(z))])


def fit_baseline(rows: np.ndarray) -> Baseline | None:
    """สร้างค่าฐานจากเมทริกซ์ (จำนวนวัน × จำนวนตัวแปร)

    คืน None เมื่อวันไม่พอ — เดาให้ไม่ได้ และตัวเลขที่เดามาก็ไม่มีใครตรวจได้ว่าผิด
    """
    X = np.asarray(rows, dtype=float)
    if X.ndim != 2 or X.shape[0] < MIN_BASELINE_DAYS:
        return None

    d = X.shape[1]
    mu = X.mean(axis=0)
    cov = np.cov(X, rowvar=False)
    cov = np.atleast_2d(cov)

    # shrinkage — 30 วัน × 3 ตัวแปรน้อยเกินกว่าจะได้ Σ ที่กลับด้านได้เสมอ
    # บวกแนวทแยงเล็กน้อยแทนการใช้ pseudo-inverse เพราะยังตีความเป็นความแปรปรวนได้อยู่
    lam = 0.1 * np.trace(cov) / d
    cov = cov + lam * np.eye(d)

    return Baseline(mu, np.linalg.inv(cov), np.sqrt(np.diag(cov)), d)


def level(d2: float, dof: int) -> str:
    """แปลง D² เป็นระดับตามตารางไคสแควร์ — ไม่มีเลขจูนมือ"""
    warn, alarm = CHI2[dof]
    if d2 >= alarm:
        return ALARM
    if d2 >= warn:
        return WARNING
    return OK


def _demo() -> None:
    """ตรวจเร็ว ๆ โดยไม่ต้องมี pytest — ฉีดการเสื่อมที่รู้คำตอบแล้ว D² ต้องขึ้น"""
    rng = np.random.default_rng(7)
    healthy = rng.normal([1.5, 1.0, 45.0], [0.08, 0.05, 1.0], size=(40, 3))
    base = fit_baseline(healthy)
    assert base is not None

    assert level(base.d2(healthy.mean(axis=0)), 3) == OK
    # สั่นขึ้น 0.4 mm/s พร้อมร้อนขึ้น 4 °C — แต่ละตัวยังไม่ข้ามเกณฑ์ ISO ใด ๆ
    assert level(base.d2([1.9, 1.4, 49.0]), 3) == ALARM
    assert fit_baseline(healthy[:5]) is None

    # วันที่เครื่องเดินเบากว่าปกติมาก — D² สูงเหมือนกัน แต่ทิศติดลบ ไม่ใช่อาการเสื่อม
    quiet = [0.5, 0.3, 42.0]
    assert level(base.d2(quiet), 3) == ALARM
    assert base.worst_z(quiet) < 0
    assert base.worst_z([1.9, 1.4, 49.0]) > 0
    print("health.py ok")


if __name__ == "__main__":
    _demo()
