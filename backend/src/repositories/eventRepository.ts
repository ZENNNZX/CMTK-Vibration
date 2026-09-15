import type { Db } from '../config/db.js';

export interface EventRow {
  id: number;
  motor_id: number;
  tag: string;
  name: string;
  kind: string;
  metric: string;
  raised_at: Date;
  resolved_at: Date | null;
  value_at_raise: string | null;
  zone_from: string | null;
  zone_to: string | null;
  acknowledged_by: number | null;
  acknowledged_name: string | null;
  acknowledged_at: Date | null;
}

const SELECT_EVENT = `
  SELECT e.id, e.motor_id, m.tag, m.name, e.kind::text, e.metric::text,
         e.raised_at, e.resolved_at, e.value_at_raise,
         e.zone_from::text, e.zone_to::text,
         e.acknowledged_by, u.display_name AS acknowledged_name, e.acknowledged_at
    FROM alarm_events e
    JOIN motors m ON m.id = e.motor_id
    LEFT JOIN users u ON u.id = e.acknowledged_by`;

export function createEventRepository(db: Db) {
  return {
    /** AC-012-01 · ทั้งเดือนในคิวรีเดียว — ปฏิทินต้องรู้ทุกวันพร้อมกันอยู่แล้ว */
    async listByMonth(firstDay: string): Promise<EventRow[]> {
      const res = (await db.query(
        `${SELECT_EVENT}
          WHERE e.raised_at >= $1::date
            AND e.raised_at <  ($1::date + INTERVAL '1 month')
          ORDER BY e.raised_at DESC`,
        [firstDay],
      )) as { rows: EventRow[] };
      return res.rows;
    },

    async findById(id: number): Promise<EventRow | null> {
      const res = (await db.query(`${SELECT_EVENT} WHERE e.id = $1`, [id])) as { rows: EventRow[] };
      return res.rows[0] ?? null;
    },

    /**
     * กดซ้ำไม่เปลี่ยนคนที่รับทราบคนแรก — COALESCE กันคนที่สองมาทับชื่อคนแรก
     * คืน id ที่แก้จริงเพื่อแยก "ไม่มีเหตุการณ์นี้" ออกจาก "แก้แล้ว"
     */
    async ack(id: number, userId: number): Promise<number | null> {
      const res = (await db.query(
        `UPDATE alarm_events
            SET acknowledged_by = COALESCE(acknowledged_by, $2),
                acknowledged_at = COALESCE(acknowledged_at, NOW())
          WHERE id = $1
        RETURNING id`,
        [id, userId],
      )) as { rows: { id: number }[] };
      return res.rows[0]?.id ?? null;
    },
  };
}

export type EventRepository = ReturnType<typeof createEventRepository>;
