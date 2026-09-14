import type { Pool } from 'pg';
import type { MinuteRow } from './aggregator.js';
import type { Transition } from './edgeDetector.js';
import type { NotifyStatus } from './notifier.js';

export interface MotorRef {
  id: number;
  tag: string;
  masterNo: number;
  portNo: number;
}

/** state ของ event ที่ยังเปิดอยู่ ใช้ hydrate ตอน service restart */
export interface OpenEvent {
  id: number;
  motorId: number;
  kind: string;
  metric: string;
}

export class Repository {
  constructor(private readonly pool: Pool) {}

  /** map "master2/port0" → motor_id — โหลดครั้งเดียวตอนบูต แล้ว refresh เป็นระยะ */
  async loadMotors(): Promise<Map<string, MotorRef>> {
    const { rows } = await this.pool.query<{
      id: number;
      tag: string;
      master_no: number;
      port_no: number;
    }>(
      `SELECT id, tag, master_no, port_no
         FROM motors
        WHERE is_active
        ORDER BY master_no, port_no`,
    );
    const map = new Map<string, MotorRef>();
    for (const r of rows) {
      map.set(`${r.master_no}:${r.port_no}`, {
        id: r.id,
        tag: r.tag,
        masterNo: r.master_no,
        portNo: r.port_no,
      });
    }
    return map;
  }

  /**
   * AC-004-02 · batch insert รายนาที
   * ON CONFLICT DO NOTHING — เขียนซ้ำตอน reconnect ไม่เกิดแถวซ้ำ (AC-004-07)
   */
  async insertReadings(rows: MinuteRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const cols = 14;
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      const b = i * cols;
      values.push(
        r.motorId, r.minuteTs,
        r.vrmsYMin, r.vrmsYAvg, r.vrmsYMax,
        r.vrmsZMin, r.vrmsZAvg, r.vrmsZMax,
        r.temperatureMin, r.temperatureAvg, r.temperatureMax,
        r.zone, r.sampleCount, r.invalidCount,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
    });

    const { rowCount } = await this.pool.query(
      `INSERT INTO readings_minute
         (motor_id, minute_ts,
          vrms_y_min, vrms_y_avg, vrms_y_max,
          vrms_z_min, vrms_z_avg, vrms_z_max,
          temperature_min, temperature_avg, temperature_max,
          zone, sample_count, invalid_count)
       VALUES ${tuples.join(',')}
       ON CONFLICT (motor_id, minute_ts) DO NOTHING`,
      values,
    );
    return rowCount ?? 0;
  }

  async touchLastSeen(motorIds: number[], at: Date): Promise<void> {
    if (motorIds.length === 0) return;
    await this.pool.query(
      `UPDATE motors SET last_seen_at = $2 WHERE id = ANY($1::int[])`,
      [motorIds, at],
    );
  }

  /**
   * ขอบขาขึ้น → เปิด event ใหม่
   * unique index uq_open_event กันไม่ให้ซ้อน — ถ้าชนแปลว่ามีอันเดิมเปิดอยู่ คืน null
   */
  async openEvent(t: Transition): Promise<number | null> {
    const { rows } = await this.pool.query<{ id: number }>(
      `INSERT INTO alarm_events
         (motor_id, kind, metric, raised_at, value_at_raise, zone_from, zone_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [t.motorId, t.kind, t.metric, t.at, t.value ?? null, t.zoneFrom ?? null, t.zoneTo ?? null],
    );
    return rows[0]?.id ?? null;
  }

  /** ขอบขาลง → ปิด event ที่เปิดอยู่ (AC-008-04) */
  async closeEvent(t: Transition): Promise<void> {
    await this.pool.query(
      `UPDATE alarm_events
          SET resolved_at = $4
        WHERE motor_id = $1 AND kind = $2 AND metric = $3
          AND resolved_at IS NULL`,
      [t.motorId, t.kind, t.metric, t.at],
    );
  }

  /** ตอน restart ต้องรู้ว่าอะไรค้างอยู่ ไม่งั้นจะเปิด event ซ้ำหรือพลาดขอบขาลง */
  async loadOpenEvents(): Promise<OpenEvent[]> {
    const { rows } = await this.pool.query<OpenEvent>(
      `SELECT id, motor_id AS "motorId", kind::text, metric::text
         FROM alarm_events
        WHERE resolved_at IS NULL`,
    );
    return rows;
  }

  // ── โควตา LINE ──

  async lastSentAt(eventId: number): Promise<Date | null> {
    const { rows } = await this.pool.query<{ sent_at: Date }>(
      `SELECT sent_at FROM notification_log
        WHERE alarm_event_id = $1 AND status = 'sent'
        ORDER BY sent_at DESC LIMIT 1`,
      [eventId],
    );
    return rows[0]?.sent_at ?? null;
  }

  async sentTodayForMotor(motorId: number, now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM notification_log n
         JOIN alarm_events e ON e.id = n.alarm_event_id
        WHERE e.motor_id = $1
          AND n.status = 'sent'
          AND n.sent_at >= date_trunc('day', $2::timestamptz)`,
      [motorId, now],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async messagesThisMonth(now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(message_count), 0)::text AS n
         FROM notification_log
        WHERE status = 'sent'
          AND sent_at >= date_trunc('month', $1::timestamptz)`,
      [now],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** บันทึกทุกครั้งรวมที่ถูกระงับ — เวลามีคนถามว่าทำไมไม่ได้รับแจ้งเตือน ต้องตอบได้ */
  async recordNotification(
    eventId: number,
    status: NotifyStatus,
    messageCount: number,
    error?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO notification_log
         (alarm_event_id, channel, status, message_count, error_detail)
       VALUES ($1, 'line', $2, $3, $4)`,
      [eventId, status, messageCount, error ?? null],
    );
  }
}
