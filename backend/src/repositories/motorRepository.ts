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
  rated_kw: string | null;
  sensor_mount: string | null;
}

export interface MotorDetailRow {
  id: number;
  tag: string;
  name: string;
  master_no: number;
  port_no: number;
  rated_kw: string | null;
  iso_group: number | null;
  mounting_rigid: boolean | null;
  sensor_mount: string | null;
  sensor_mount_offset: unknown;
  warning_threshold: string | null;
  alarm_threshold: string | null;
  run_hours: string | null;
  last_seen_at: Date | null;
  is_active: boolean;
}

export interface ReadingRow {
  minute_ts: Date;
  vrms_y_avg: string | null;
  vrms_z_avg: string | null;
  temperature_avg: string | null;
  zone: string | null;
}

export function createMotorRepository(db: Db) {
  return {
    /** มอเตอร์ตัวเดียวพร้อมค่าตั้งของมัน — หน้ารายละเอียดต้องใช้เกณฑ์และจุดติดตั้งด้วย */
    async findById(id: number): Promise<MotorDetailRow | null> {
      const res = (await db.query(
        `SELECT id, tag, name, master_no, port_no, rated_kw, iso_group, mounting_rigid,
                sensor_mount, sensor_mount_offset, warning_threshold, alarm_threshold,
                run_hours, last_seen_at, is_active
           FROM motors WHERE id = $1 AND is_active`,
        [id],
      )) as { rows: MotorDetailRow[] };
      return res.rows[0] ?? null;
    },

    /**
     * แก้เฉพาะ field ที่ส่งมา — COALESCE กับค่าเดิมทำให้ NULL แปลว่า "ไม่แตะ"
     * ประกอบ SQL จากคีย์ตายตัวสามตัว ไม่มีอะไรจากผู้ใช้เข้าไปในสตริง (NFR-07)
     */
    async update(
      id: number,
      p: {
        warningThreshold?: number;
        alarmThreshold?: number;
        sensorMount?: string;
        sensorMountOffset?: [number, number, number] | null;
        touchOffset: boolean;
      },
    ): Promise<number | null> {
      const res = (await db.query(
        `UPDATE motors
            SET warning_threshold = COALESCE($2, warning_threshold),
                alarm_threshold   = COALESCE($3, alarm_threshold),
                sensor_mount      = COALESCE($4::mount_point, sensor_mount),
                -- offset ต่างจากตัวอื่น: null คือ "คืนค่ามาตรฐาน" ไม่ใช่ "ไม่แตะ"
                -- จึงต้องมีธงแยกว่าคำขอนี้พูดถึง offset หรือเปล่า
                sensor_mount_offset = CASE WHEN $5 THEN $6::jsonb ELSE sensor_mount_offset END
          WHERE id = $1 AND is_active
        RETURNING id`,
        [
          id,
          p.warningThreshold ?? null,
          p.alarmThreshold ?? null,
          p.sensorMount ?? null,
          p.touchOffset,
          p.sensorMountOffset === null || p.sensorMountOffset === undefined
            ? null
            : JSON.stringify(p.sensorMountOffset),
        ],
      )) as { rows: { id: number }[] };
      return res.rows[0]?.id ?? null;
    },

    /** อนุกรมเวลาย้อนหลัง N ชั่วโมง — ใช้ index (motor_id, minute_ts DESC) ตรง ๆ */
    async listReadings(motorId: number, hours: number): Promise<ReadingRow[]> {
      const res = (await db.query(
        `SELECT minute_ts, vrms_y_avg, vrms_z_avg, temperature_avg, zone::text
           FROM readings_minute
          WHERE motor_id = $1 AND minute_ts >= NOW() - ($2 || ' hours')::interval
          ORDER BY minute_ts`,
        [motorId, hours],
      )) as { rows: ReadingRow[] };
      return res.rows;
    },

    /** มอเตอร์ทุกตัวพร้อมค่าล่าสุดหนึ่งแถว — LATERAL ใช้ index (motor_id, minute_ts DESC) ได้ตรง ๆ */
    async listWithLatest(): Promise<MotorWithLatestRow[]> {
      const res = (await db.query(
        `SELECT m.id, m.tag, m.name, m.master_no, m.port_no, m.last_seen_at,
                m.rated_kw, m.sensor_mount,
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
