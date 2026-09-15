import { z } from 'zod';

/**
 * ชื่อ field จาก payload จริงของ BCM R16E-004 (master2/port0 · 2026-09-11)
 * ⚠️ ชื่อมีจุลภาคอยู่ข้างใน — ห้ามใช้ comma เป็น delimiter ที่ใดก็ตาม (NFR-16)
 */
export const FIELD = {
  temperature: 'Temperature',
  vrmsY: 'Vibration Velocity, RMS Y',
  vrmsZ: 'Vibration Velocity, RMS Z',
  preAlarm: 'Pre-Alarm Vibration Velocity, RMS',
  mainAlarm: 'Main Alarm Vibration Velocity, RMS',
  tempLow: 'Lower Alarm Contact Temperature',
  tempHigh: 'Upper Alarm Contact Temperature',
  zoneA: 'Severity Zone A',
  zoneB: 'Severity Zone B',
  zoneC: 'Severity Zone C',
  zoneD: 'Severity Zone D',
} as const;

const isoTimestamp = z.string().datetime({ offset: true });

/**
 * `.partial()` เพราะ Data selector บน CMTK เปลี่ยนได้
 * ถ้า field หายไปต้องไม่ทำให้ service ตาย (AC-004-06)
 */
const itemsSchema = z
  .object({
    [FIELD.temperature]: z.number(),
    [FIELD.vrmsY]: z.number(),
    [FIELD.vrmsZ]: z.number(),
    [FIELD.preAlarm]: z.boolean(),
    [FIELD.mainAlarm]: z.boolean(),
    [FIELD.tempLow]: z.boolean(),
    [FIELD.tempHigh]: z.boolean(),
    [FIELD.zoneA]: z.boolean(),
    [FIELD.zoneB]: z.boolean(),
    [FIELD.zoneC]: z.boolean(),
    [FIELD.zoneD]: z.boolean(),
  })
  .partial();

export const deviceDataSchema = z.object({
  type: z.literal('dataFromDevice'),
  timestamp: isoTimestamp,
  data: z.object({
    isValid: z.boolean(),
    items: itemsSchema,
  }),
});

export const unitsSchema = z.object({
  type: z.literal('unitsFromDevice'),
  timestamp: isoTimestamp,
  data: z.record(z.string()),
});

export const portEventSchema = z.object({
  type: z.literal('iolinkPortEvent'),
  origin: z.string(),
  timestamp: isoTimestamp,
  data: z.object({
    deviceId: z.number(),
    vendorId: z.number(),
    // ไม่ใช้ enum — ยังไม่รู้ค่าที่เป็นไปได้ทั้งหมด เฟิร์มแวร์ใหม่อาจเพิ่ม
    event: z.string(),
    numberOfPorts: z.number().optional(),
  }),
});

export const messageSchema = z.discriminatedUnion('type', [
  deviceDataSchema,
  unitsSchema,
  portEventSchema,
]);

export type DeviceData = z.infer<typeof deviceDataSchema>;
export type PortEvent = z.infer<typeof portEventSchema>;
export type Message = z.infer<typeof messageSchema>;

export type ParseResult =
  | { ok: true; message: Message }
  | { ok: false; reason: 'unknown_type' | 'invalid_json' | 'schema_error'; detail?: string };

/**
 * AC-004-04 · payload ผิดรูปแบบ → ปฏิเสธ ไม่เขียน DB
 * AC-004-06 · type ที่ไม่รู้จัก → ข้าม **ห้าม throw**
 */
export function parseMessage(raw: Buffer | string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString());
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  const type = (json as { type?: unknown })?.type;
  const known = ['dataFromDevice', 'unitsFromDevice', 'iolinkPortEvent'];
  if (typeof type !== 'string' || !known.includes(type)) {
    return { ok: false, reason: 'unknown_type', detail: String(type) };
  }

  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: 'schema_error', detail: parsed.error.issues[0]?.message };
  }
  return { ok: true, message: parsed.data };
}

export interface TopicParts {
  master: number;
  port: number;
  leaf: 'data' | 'events' | 'units' | 'other';
}

/** balluff/cmtk/master2/iolink/devices/port0/data/fromdevice */
export function parseTopic(topic: string): TopicParts | null {
  const m = /^balluff\/cmtk\/master(\d+)\/iolink\/devices\/port(\d+)\/(.+)$/.exec(topic);
  if (!m) return null;
  const tail = m[3]!;
  const leaf = tail.startsWith('data/')
    ? 'data'
    : tail.startsWith('events')
      ? 'events'
      : tail.startsWith('units')
        ? 'units'
        : 'other';
  return { master: Number(m[1]), port: Number(m[2]), leaf };
}

/**
 * เวลาที่บอร์ดส่งมา ปรับด้วย offset ที่ตั้งไว้
 * บอร์ด CMTK ติดป้าย Z ให้เวลาไทย ทำให้ new Date() ได้ค่าล้ำหน้าจริง 7 ชม.
 * ไม่ hardcode -420 ไว้ในโค้ด เพราะนาฬิกาฮาร์ดแวร์เป็นของที่ปรับได้และควรปรับที่ต้นทาง
 */
export const sensorTime = (iso: string, offsetMinutes: number): Date =>
  new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
