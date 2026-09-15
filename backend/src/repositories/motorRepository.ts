import type { Db } from '../config/db.js';

export interface MotorWithLatestRow {
  id: number;
  tag: string;
  name: string;
  master_no: number;
  port_no: number;
  last_seen_at: Date | null;
  minute_ts: Date | null;
  vrms_y_avg: string | null;
  vrms_z_avg: string | null;
  temperature_avg: string | null;
  zone: string | null;
}

export function createMotorRepository(db: Db) {
  return {
    /** มอเตอร์ทุกตัวพร้อมค่าล่าสุดหนึ่งแถว — LATERAL ใช้ index (motor_id, minute_ts DESC) ได้ตรง ๆ */
    async listWithLatest(): Promise<MotorWithLatestRow[]> {
      const res = (await db.query(
        `SELECT m.id, m.tag, m.name, m.master_no, m.port_no, m.last_seen_at,
                r.minute_ts, r.vrms_y_avg, r.vrms_z_avg, r.temperature_avg, r.zone::text
           FROM motors m
           LEFT JOIN LATERAL (
             SELECT minute_ts, vrms_y_avg, vrms_z_avg, temperature_avg, zone
               FROM readings_minute
              WHERE motor_id = m.id
              ORDER BY minute_ts DESC
              LIMIT 1
           ) r ON TRUE
          WHERE m.is_active
          ORDER BY m.master_no, m.port_no`,
      )) as { rows: MotorWithLatestRow[] };
      return res.rows;
    },
  };
}

export type MotorRepository = ReturnType<typeof createMotorRepository>;
