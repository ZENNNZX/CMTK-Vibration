import { FIELD, type DeviceData } from './schema.js';

export type Zone = 'A' | 'B' | 'C' | 'D';

export interface MinuteRow {
  motorId: number;
  minuteTs: Date;
  vrmsYMin: number | null;
  vrmsYAvg: number | null;
  vrmsYMax: number | null;
  vrmsZMin: number | null;
  vrmsZAvg: number | null;
  vrmsZMax: number | null;
  temperatureMin: number | null;
  temperatureAvg: number | null;
  temperatureMax: number | null;
  zone: Zone | null;
  sampleCount: number;
  invalidCount: number;
}

interface Stat {
  min: number;
  max: number;
  sum: number;
  n: number;
}

interface Bucket {
  motorId: number;
  minuteMs: number;
  vrmsY: Stat | null;
  vrmsZ: Stat | null;
  temperature: Stat | null;
  zoneCount: Record<Zone, number>;
  zoneAnomalies: number;
  sampleCount: number;
  invalidCount: number;
}

const push = (s: Stat | null, v: number): Stat =>
  s === null
    ? { min: v, max: v, sum: v, n: 1 }
    : { min: Math.min(s.min, v), max: Math.max(s.max, v), sum: s.sum + v, n: s.n + 1 };

const round = (v: number, d: number): number => Number(v.toFixed(d));

export const floorMinute = (ts: Date): number => Math.floor(ts.getTime() / 60_000) * 60_000;

/**
 * AC-008-07 · zone bit ควร true เพียงตัวเดียว
 * ถ้าไม่ใช่ ให้คืน null และนับเป็น anomaly แทนที่จะเดา
 */
export function zoneOf(items: DeviceData['data']['items']): Zone | null {
  const on = (['A', 'B', 'C', 'D'] as const).filter(
    (z) => items[FIELD[`zone${z}` as 'zoneA' | 'zoneB' | 'zoneC' | 'zoneD']] === true,
  );
  return on.length === 1 ? on[0]! : null;
}

/**
 * บัฟเฟอร์ค่าดิบ 0.5 วินาที แล้วสรุปเป็น 1 แถวต่อมอเตอร์ต่อนาที
 * ไม่เก็บค่าดิบลงฐานข้อมูล (REQ-033) — ของดิบอยู่ใน InfluxDB ของ CMTK
 */
export class Aggregator {
  private buckets = new Map<string, Bucket>();

  add(motorId: number, sampleTs: Date, msg: DeviceData): void {
    const minuteMs = floorMinute(sampleTs);
    const key = `${motorId}:${minuteMs}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        motorId,
        minuteMs,
        vrmsY: null,
        vrmsZ: null,
        temperature: null,
        zoneCount: { A: 0, B: 0, C: 0, D: 0 },
        zoneAnomalies: 0,
        sampleCount: 0,
        invalidCount: 0,
      };
      this.buckets.set(key, b);
    }

    b.sampleCount += 1;

    // AC-004-05 · isValid = false → นับไว้แต่ไม่เอาค่าไปคำนวณ
    if (!msg.data.isValid) {
      b.invalidCount += 1;
      return;
    }

    const it = msg.data.items;
    const y = it[FIELD.vrmsY];
    const z = it[FIELD.vrmsZ];
    const t = it[FIELD.temperature];
    if (typeof y === 'number') b.vrmsY = push(b.vrmsY, y);
    if (typeof z === 'number') b.vrmsZ = push(b.vrmsZ, z);
    if (typeof t === 'number') b.temperature = push(b.temperature, t);

    const zone = zoneOf(it);
    if (zone) b.zoneCount[zone] += 1;
    else b.zoneAnomalies += 1;
  }

  /** คืนเฉพาะนาทีที่ปิดแล้ว — นาทีปัจจุบันยังรับข้อมูลเพิ่มได้ */
  flush(now: Date): MinuteRow[] {
    const cutoff = floorMinute(now);
    const out: MinuteRow[] = [];
    for (const [key, b] of this.buckets) {
      if (b.minuteMs >= cutoff) continue;
      out.push(toRow(b));
      this.buckets.delete(key);
    }
    return out.sort((a, c) => a.minuteTs.getTime() - c.minuteTs.getTime());
  }

  /** ใช้ตอน shutdown — เอาทุกอย่างที่ค้างออกมา ไม่ให้ข้อมูลหาย */
  drain(): MinuteRow[] {
    const out = [...this.buckets.values()].map(toRow);
    this.buckets.clear();
    return out.sort((a, c) => a.minuteTs.getTime() - c.minuteTs.getTime());
  }

  get pending(): number {
    return this.buckets.size;
  }
}

function toRow(b: Bucket): MinuteRow {
  const zones = (Object.entries(b.zoneCount) as [Zone, number][])
    .filter(([, n]) => n > 0)
    .sort((a, c) => c[1] - a[1]);

  return {
    motorId: b.motorId,
    minuteTs: new Date(b.minuteMs),
    vrmsYMin: b.vrmsY && round(b.vrmsY.min, 3),
    vrmsYAvg: b.vrmsY && round(b.vrmsY.sum / b.vrmsY.n, 3),
    vrmsYMax: b.vrmsY && round(b.vrmsY.max, 3),
    vrmsZMin: b.vrmsZ && round(b.vrmsZ.min, 3),
    vrmsZAvg: b.vrmsZ && round(b.vrmsZ.sum / b.vrmsZ.n, 3),
    vrmsZMax: b.vrmsZ && round(b.vrmsZ.max, 3),
    temperatureMin: b.temperature && round(b.temperature.min, 2),
    temperatureAvg: b.temperature && round(b.temperature.sum / b.temperature.n, 2),
    temperatureMax: b.temperature && round(b.temperature.max, 2),
    zone: zones[0]?.[0] ?? null,
    sampleCount: b.sampleCount,
    invalidCount: b.invalidCount,
  };
}
