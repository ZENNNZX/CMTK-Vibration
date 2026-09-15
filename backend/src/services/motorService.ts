import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';
import type {
  MotorDetailRow,
  MotorRepository,
  MotorWithLatestRow,
  ReadingRow,
} from '../repositories/motorRepository.js';

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
  ratedKw: number | null;
  sensorMount: string | null;
}

export interface MotorDetail {
  id: number;
  tag: string;
  name: string;
  masterNo: number;
  portNo: number;
  ratedKw: number | null;
  isoGroup: number | null;
  mountingRigid: boolean | null;
  sensorMount: string | null;
  sensorMountOffset: unknown;
  warningThreshold: number | null;
  alarmThreshold: number | null;
  runHours: number | null;
  isOnline: boolean;
}

export interface Reading {
  ts: string;
  vrmsY: number | null;
  vrmsZ: number | null;
  temperature: number | null;
  zone: string | null;
}

/** เท่ากับ STALE_THRESHOLD_SECONDS ของ ingestion — เงียบเกินนี้ถือว่าไม่มีข้อมูล (AC-011-04) */
const STALE_MS = 300_000;

// pg คืน NUMERIC เป็น string เพื่อไม่ให้เสียความละเอียด — แปลงที่ชั้นนี้ที่เดียว
// undefined เกิดได้เมื่อคิวรีไม่ได้ SELECT คอลัมน์นั้นมา — ต้องได้ null ไม่ใช่ NaN
const num = (v: string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

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
        ratedKw: num(r.rated_kw),
        sensorMount: r.sensor_mount ?? null,
        isOnline: r.last_seen_at !== null && now.getTime() - new Date(r.last_seen_at).getTime() < STALE_MS,
      }));
    },

    async detail(id: number, now = new Date()): Promise<MotorDetail> {
      const r: MotorDetailRow | null = await repo.findById(id);
      if (!r) throw new NotFoundError('มอเตอร์');
      return {
        id: r.id,
        tag: r.tag,
        name: r.name,
        masterNo: r.master_no,
        portNo: r.port_no,
        ratedKw: num(r.rated_kw),
        isoGroup: r.iso_group,
        mountingRigid: r.mounting_rigid,
        sensorMount: r.sensor_mount,
        sensorMountOffset: r.sensor_mount_offset ?? null,
        warningThreshold: num(r.warning_threshold),
        alarmThreshold: num(r.alarm_threshold),
        runHours: num(r.run_hours),
        isOnline:
          r.last_seen_at !== null && now.getTime() - new Date(r.last_seen_at).getTime() < STALE_MS,
      };
    },

    /**
     * ส่งมาแค่ field เดียวก็ต้องยังตรวจคู่กับค่าเดิมในฐานข้อมูล
     * Zod เทียบได้เฉพาะตอนส่งมาทั้งคู่ — ส่ง warning=5 เดี่ยว ๆ ทับ alarm=4.5 เดิมได้ ถ้าไม่ดักตรงนี้
     */
    async update(
      id: number,
      patch: {
        warningThreshold?: number;
        alarmThreshold?: number;
        sensorMount?: string;
        sensorMountOffset?: [number, number, number] | null;
      },
    ): Promise<MotorDetail> {
      const current = await repo.findById(id);
      if (!current) throw new NotFoundError('มอเตอร์');

      const warn = patch.warningThreshold ?? num(current.warning_threshold);
      const alarm = patch.alarmThreshold ?? num(current.alarm_threshold);
      if (warn !== null && alarm !== null && warn >= alarm) {
        throw new ValidationError('เกณฑ์ Warning ต้องน้อยกว่า Alarm');
      }

      // เปลี่ยนจุดวัดโดยไม่ได้ส่ง offset มาด้วย = ตำแหน่งเดิมไม่ใช่ของจุดใหม่แล้ว ต้องล้างทิ้ง
      const movedMount = patch.sensorMount !== undefined && patch.sensorMount !== current.sensor_mount;
      const touchOffset = 'sensorMountOffset' in patch || movedMount;
      const offset = 'sensorMountOffset' in patch ? patch.sensorMountOffset : null;

      if ((await repo.update(id, { ...patch, sensorMountOffset: offset, touchOffset })) === null) {
        throw new NotFoundError('มอเตอร์');
      }
      return this.detail(id);
    },

    /** AC-007-03 · ไม่มีข้อมูลคือ array ว่าง ไม่ใช่ 404 — 404 สงวนไว้ให้ "ไม่มีมอเตอร์ตัวนี้" */
    async readings(id: number, hours: number): Promise<Reading[]> {
      if (!(await repo.findById(id))) throw new NotFoundError('มอเตอร์');
      const rows: ReadingRow[] = await repo.listReadings(id, hours);
      return rows.map((r) => ({
        ts: new Date(r.minute_ts).toISOString(),
        vrmsY: num(r.vrms_y_avg),
        vrmsZ: num(r.vrms_z_avg),
        temperature: num(r.temperature_avg),
        zone: r.zone,
      }));
    },
  };
}

export type MotorService = ReturnType<typeof createMotorService>;
