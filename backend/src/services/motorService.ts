import type { MotorRepository, MotorWithLatestRow } from '../repositories/motorRepository.js';

export interface MotorCard {
  id: number;
  tag: string;
  name: string;
  masterNo: number;
  portNo: number;
  zone: string | null;
  vrmsY: number | null;
  vrmsZ: number | null;
  temperature: number | null;
  lastMinuteTs: string | null;
  isOnline: boolean;
}

/** เท่ากับ STALE_THRESHOLD_SECONDS ของ ingestion — เงียบเกินนี้ถือว่าไม่มีข้อมูล (AC-011-04) */
const STALE_MS = 300_000;

// pg คืน NUMERIC เป็น string เพื่อไม่ให้เสียความละเอียด — แปลงที่ชั้นนี้ที่เดียว
const num = (v: string | null): number | null => (v === null ? null : Number(v));

export function createMotorService(repo: MotorRepository) {
  return {
    async list(now = new Date()): Promise<MotorCard[]> {
      const rows = await repo.listWithLatest();
      return rows.map((r: MotorWithLatestRow) => ({
        id: r.id,
        tag: r.tag,
        name: r.name,
        masterNo: r.master_no,
        portNo: r.port_no,
        zone: r.zone,
        vrmsY: num(r.vrms_y_avg),
        vrmsZ: num(r.vrms_z_avg),
        temperature: num(r.temperature_avg),
        lastMinuteTs: r.minute_ts ? new Date(r.minute_ts).toISOString() : null,
        isOnline: r.last_seen_at !== null && now.getTime() - new Date(r.last_seen_at).getTime() < STALE_MS,
      }));
    },
  };
}

export type MotorService = ReturnType<typeof createMotorService>;
