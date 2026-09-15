import type { Db } from '../config/db.js';

export interface MaintenanceRow {
  id: number;
  motor_id: number;
  tag: string;
  motor_name: string;
  alarm_event_id: number | null;
  cause: string;
  description: string | null;
  performed_by: number;
  performed_name: string | null;
  performed_at: Date;
  reset_run_hours: boolean;
}

const SELECT_LOG = `
  SELECT l.id, l.motor_id, m.tag, m.name AS motor_name, l.alarm_event_id,
         l.cause::text, l.description, l.performed_by,
         u.display_name AS performed_name, l.performed_at, l.reset_run_hours
    FROM maintenance_logs l
    JOIN motors m ON m.id = l.motor_id
    LEFT JOIN users u ON u.id = l.performed_by`;

export function createMaintenanceRepository(db: Db) {
  return {
    async list(motorId?: number): Promise<MaintenanceRow[]> {
      const res = (await db.query(
        `${SELECT_LOG}
          WHERE ($1::int IS NULL OR l.motor_id = $1)
          ORDER BY l.performed_at DESC
          LIMIT 200`,
        [motorId ?? null],
      )) as { rows: MaintenanceRow[] };
      return res.rows;
    },

    async findById(id: number): Promise<MaintenanceRow | null> {
      const res = (await db.query(`${SELECT_LOG} WHERE l.id = $1`, [id])) as { rows: MaintenanceRow[] };
      return res.rows[0] ?? null;
    },

    /** performed_at เป็น NOW() ฝั่งเซิร์ฟเวอร์ — เวลาของเครื่องผู้ใช้เชื่อไม่ได้ */
    async insert(p: {
      motorId: number;
      cause: string;
      description?: string;
      alarmEventId?: number;
      performedBy: number;
      resetRunHours: boolean;
    }): Promise<number> {
      const res = (await db.query(
        `INSERT INTO maintenance_logs
           (motor_id, alarm_event_id, cause, description, performed_by, performed_at, reset_run_hours)
         VALUES ($1, $2, $3::cause_code, $4, $5, NOW(), $6)
         RETURNING id`,
        [p.motorId, p.alarmEventId ?? null, p.cause, p.description ?? null, p.performedBy, p.resetRunHours],
      )) as { rows: { id: number }[] };
      return res.rows[0].id;
    },

    /** AC-018 · เปลี่ยนแบริ่งแล้วชั่วโมงเดินเครื่องต้องเริ่มนับใหม่ */
    async resetRunHours(motorId: number): Promise<void> {
      await db.query(
        `UPDATE motors SET run_hours = 0, run_hours_reset_at = NOW() WHERE id = $1`,
        [motorId],
      );
    },
  };
}

export type MaintenanceRepository = ReturnType<typeof createMaintenanceRepository>;
