import { NotFoundError } from '../middlewares/errorHandler.js';
import type { EventRepository, EventRow } from '../repositories/eventRepository.js';

export interface AlarmEvent {
  id: number;
  motorId: number;
  tag: string;
  motorName: string;
  kind: string;
  metric: string;
  raisedAt: string;
  resolvedAt: string | null;
  value: number | null;
  zoneFrom: string | null;
  zoneTo: string | null;
  acknowledgedBy: number | null;
  acknowledgedName: string | null;
  acknowledgedAt: string | null;
}

// pg คืน NUMERIC เป็น string เพื่อไม่ให้เสียความละเอียด — แปลงที่ชั้นนี้ที่เดียว
const num = (v: string | null): number | null => (v === null ? null : Number(v));
const iso = (d: Date | null): string | null => (d === null ? null : new Date(d).toISOString());

const toEvent = (r: EventRow): AlarmEvent => ({
  // alarm_events.id เป็น BIGSERIAL — pg คืน BIGINT เป็น string กัน precision หาย
  // จำนวนเหตุการณ์ไม่มีทางเกิน 2^53 จึงแปลงเป็น number ได้ปลอดภัย
  id: Number(r.id),
  motorId: Number(r.motor_id),
  tag: r.tag,
  motorName: r.name,
  kind: r.kind,
  metric: r.metric,
  raisedAt: new Date(r.raised_at).toISOString(),
  resolvedAt: iso(r.resolved_at),
  value: num(r.value_at_raise),
  zoneFrom: r.zone_from,
  zoneTo: r.zone_to,
  acknowledgedBy: r.acknowledged_by,
  acknowledgedName: r.acknowledged_name,
  acknowledgedAt: iso(r.acknowledged_at),
});

export function createEventService(repo: EventRepository) {
  return {
    /** month มาเป็น YYYY-MM · ต่อ -01 ให้เป็นวันแรกของเดือนก่อนส่งเข้าคิวรี */
    async listByMonth(month: string): Promise<AlarmEvent[]> {
      const rows = await repo.listByMonth(`${month}-01`);
      return rows.map(toEvent);
    },

    async acknowledge(id: number, userId: number): Promise<AlarmEvent> {
      if ((await repo.ack(id, userId)) === null) throw new NotFoundError('เหตุการณ์');
      const row = await repo.findById(id);
      if (!row) throw new NotFoundError('เหตุการณ์');
      return toEvent(row);
    },
  };
}

export type EventService = ReturnType<typeof createEventService>;
