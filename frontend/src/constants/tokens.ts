/**
 * สถานะเครื่องจักรจาก DSN-CMTK-001 §1 — ใช้บอกสถานะเท่านั้น ห้ามใช้ตกแต่ง
 * ค่าสีจริงอยู่ใน @theme ของ index.css ที่เดียว — ที่นี่เก็บแค่ชื่อคลาส
 * (index.css §บนสุด · "ห้ามใส่ hex ตรง ๆ ในคอมโพเนนต์")
 */
export const ZONE = {
  A: { fill: 'bg-zone-a', on: 'text-white', label: 'เครื่องใหม่ · เดินได้ไม่จำกัด' },
  B: { fill: 'bg-zone-b', on: 'text-ink', label: 'ปกติ · เดินต่อเนื่องได้ไม่จำกัด' },
  C: { fill: 'bg-zone-c', on: 'text-ink', label: 'เดินได้ชั่วคราว · วางแผนซ่อม' },
  D: { fill: 'bg-zone-d', on: 'text-white', label: 'เสี่ยงเสียหาย · หยุดตรวจ' },
} as const;

export type Zone = keyof typeof ZONE;
export const ZONES = Object.keys(ZONE) as Zone[];

/**
 * card-alert (DSN §4) — โซน C/D ขึ้นขอบหนา 2px พร้อมป้าย
 * NFR-09 · ป้ายมีทั้งสัญลักษณ์และข้อความ สีไม่ใช่สัญญาณเดียว
 * ป้าย warning ใช้ตัวอักษรเข้ม — ส้ม+ขาว contrast 2.23 ตก AA (DSN §1)
 */
export const ALERT = {
  C: { text: 'Warning', glyph: '◆', border: 'border-2 border-warning', badge: 'bg-warning text-ink' },
  D: { text: 'Alarm', glyph: '▲', border: 'border-2 border-alarm', badge: 'bg-alarm text-white' },
} as const;

export const alertOf = (zone: Zone | null) => (zone === 'C' || zone === 'D' ? ALERT[zone] : null);

/** จำนวนพอร์ตของ IO-Link Master (BNI XG5-508) — ว่างอยู่ก็คือข้อมูล (DSN §4 port-rail) */
export const MASTER_PORTS = 8;

/**
 * ประเภทเหตุการณ์ (DSN §6) — NFR-09 สีห้ามเป็นสัญญาณเดียว ทุกอันมีสัญลักษณ์ + ข้อความ
 * ค่า kind ตรงกับ enum event_kind ใน migration 001
 */
export const EVENT_KIND = {
  alarm: { text: 'Alarm', glyph: '▲', badge: 'bg-alarm text-white', ink: 'text-alarm' },
  warning: { text: 'Warning', glyph: '◆', badge: 'bg-warning text-ink', ink: 'text-warning' },
  zone_change: { text: 'เปลี่ยนโซน', glyph: '●', badge: 'bg-secondary text-ink', ink: 'text-secondary' },
  offline: { text: 'เซ็นเซอร์หลุด', glyph: '■', badge: 'bg-offline text-white', ink: 'text-offline' },
} as const;

export type EventKind = keyof typeof EVENT_KIND;
export const kindOf = (k: string) => EVENT_KIND[k as EventKind] ?? EVENT_KIND.offline;

/** ความรุนแรงเรียงจากมากไปน้อย — วันหนึ่งมีหลายเหตุการณ์ ปฏิทินโชว์ตัวที่หนักสุด */
export const KIND_RANK: EventKind[] = ['alarm', 'warning', 'offline', 'zone_change'];
