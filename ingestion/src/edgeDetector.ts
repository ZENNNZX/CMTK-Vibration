import { FIELD, type DeviceData } from './schema.js';
import { zoneOf, type Zone } from './aggregator.js';

export type EventKind = 'alarm' | 'warning' | 'zone_change' | 'offline';
export type EventMetric = 'vibration' | 'temperature' | 'connectivity';

export interface Transition {
  motorId: number;
  kind: EventKind;
  metric: EventMetric;
  /** rise = เปิด event ใหม่ · fall = ปิด event ที่เปิดอยู่ */
  edge: 'rise' | 'fall';
  at: Date;
  value?: number | null;
  zoneFrom?: Zone | null;
  zoneTo?: Zone | null;
}

interface Flags {
  preAlarm: boolean;
  mainAlarm: boolean;
  tempAlarm: boolean;
  zone: Zone | null;
}

interface State extends Flags {
  online: boolean;
}

const SIGNALS: ReadonlyArray<{
  key: keyof Flags & ('preAlarm' | 'mainAlarm' | 'tempAlarm');
  kind: EventKind;
  metric: EventMetric;
}> = [
  { key: 'mainAlarm', kind: 'alarm', metric: 'vibration' },
  { key: 'preAlarm', kind: 'warning', metric: 'vibration' },
  { key: 'tempAlarm', kind: 'warning', metric: 'temperature' },
];

function flagsOf(msg: DeviceData): Flags {
  const it = msg.data.items;
  return {
    preAlarm: it[FIELD.preAlarm] === true,
    mainAlarm: it[FIELD.mainAlarm] === true,
    tempAlarm: it[FIELD.tempHigh] === true || it[FIELD.tempLow] === true,
    zone: zoneOf(it),
  };
}

/**
 * จับ "ขอบ" ของสัญญาณ ไม่ใช่ค่าปัจจุบัน
 *
 * เซ็นเซอร์ BCM ประเมิน alarm ให้แล้วทุก 0.5 วินาที ถ้าส่ง event ทุกครั้งที่ bit เป็น true
 * จะได้ 120 event ต่อนาทีต่อมอเตอร์ และ LINE จะถูกยิงจนโควตาหมดภายในไม่กี่นาที
 *
 * AC-008-03 · bit ค้าง true → สร้าง event ครั้งเดียว
 */
export class EdgeDetector {
  private states = new Map<number, State>();

  /** ข้อความค่าเซ็นเซอร์ */
  feed(motorId: number, msg: DeviceData, at: Date): Transition[] {
    if (!msg.data.isValid) return [];

    const next = flagsOf(msg);
    const prev = this.states.get(motorId);
    const out: Transition[] = [];

    if (!prev) {
      // ข้อความแรกคือการตั้งค่าเริ่มต้น ไม่ใช่เหตุการณ์
      // แต่ถ้าเปิดมาก็ alarm อยู่แล้ว ต้องแจ้ง ไม่งั้นจะเงียบจนกว่าจะหายแล้วกลับมา
      for (const s of SIGNALS) {
        if (next[s.key]) {
          out.push({ motorId, kind: s.kind, metric: s.metric, edge: 'rise', at, value: valueFor(msg, s.metric) });
        }
      }
      this.states.set(motorId, { ...next, online: true });
      return out;
    }

    for (const s of SIGNALS) {
      if (!prev[s.key] && next[s.key]) {
        out.push({ motorId, kind: s.kind, metric: s.metric, edge: 'rise', at, value: valueFor(msg, s.metric) });
      } else if (prev[s.key] && !next[s.key]) {
        out.push({ motorId, kind: s.kind, metric: s.metric, edge: 'fall', at });
      }
    }

    // AC-008-06 · เปลี่ยนโซนบันทึกไว้ แต่ไม่ใช่ alarm
    if (next.zone !== null && prev.zone !== null && next.zone !== prev.zone) {
      out.push({
        motorId,
        kind: 'zone_change',
        metric: 'vibration',
        edge: 'rise',
        at,
        zoneFrom: prev.zone,
        zoneTo: next.zone,
        value: valueFor(msg, 'vibration'),
      });
    }

    this.states.set(motorId, { ...next, online: prev.online });
    return out;
  }

  /** iolinkPortEvent — CONNECTED / DISCONNECTED */
  feedPortEvent(motorId: number, event: string, at: Date): Transition[] {
    const prev = this.states.get(motorId);
    const online = event.toUpperCase() === 'CONNECTED';
    const wasOnline = prev?.online ?? true;

    this.states.set(motorId, {
      preAlarm: prev?.preAlarm ?? false,
      mainAlarm: prev?.mainAlarm ?? false,
      tempAlarm: prev?.tempAlarm ?? false,
      zone: prev?.zone ?? null,
      online,
    });

    if (wasOnline === online) return [];
    return [
      { motorId, kind: 'offline', metric: 'connectivity', edge: online ? 'fall' : 'rise', at },
    ];
  }

  /**
   * AC-011-03 · QoS 0 ทำให้ event หายได้ ห้ามพึ่ง disconnect event อย่างเดียว
   * เรียกจาก timer เพื่อหาเซ็นเซอร์ที่เงียบเกินกำหนด
   */
  checkStale(lastSeen: Map<number, Date>, now: Date, thresholdSeconds: number): Transition[] {
    const out: Transition[] = [];
    for (const [motorId, seen] of lastSeen) {
      const silent = (now.getTime() - seen.getTime()) / 1000;
      const st = this.states.get(motorId);
      if (silent > thresholdSeconds && st?.online !== false) {
        this.states.set(motorId, {
          preAlarm: st?.preAlarm ?? false,
          mainAlarm: st?.mainAlarm ?? false,
          tempAlarm: st?.tempAlarm ?? false,
          zone: st?.zone ?? null,
          online: false,
        });
        out.push({ motorId, kind: 'offline', metric: 'connectivity', edge: 'rise', at: now });
      }
    }
    return out;
  }

  /** ใช้ตอน restart — โหลดสถานะจาก event ที่ยังเปิดอยู่ใน DB */
  hydrate(motorId: number, state: Partial<State>): void {
    this.states.set(motorId, {
      preAlarm: state.preAlarm ?? false,
      mainAlarm: state.mainAlarm ?? false,
      tempAlarm: state.tempAlarm ?? false,
      zone: state.zone ?? null,
      online: state.online ?? true,
    });
  }
}

function valueFor(msg: DeviceData, metric: EventMetric): number | null {
  const it = msg.data.items;
  if (metric === 'temperature') return it[FIELD.temperature] ?? null;
  const y = it[FIELD.vrmsY];
  const z = it[FIELD.vrmsZ];
  if (typeof y === 'number' && typeof z === 'number') return Math.max(y, z);
  return y ?? z ?? null;
}
