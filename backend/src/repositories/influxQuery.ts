/**
 * สร้างและแปลงผล Flux — ฟังก์ชันล้วนไม่มี I/O เทสต์ยิงตรงได้โดยไม่ต้องมี InfluxDB
 */

export interface Window {
  seconds: number;
  flux: string;
}

/** ขั้นหน้าต่างที่เลือกได้ — ให้จุดบนกราฟอยู่ราว 300-600 เสมอไม่ว่าขอช่วงไหน */
const STEPS = [
  { seconds: 5, flux: '5s' },
  { seconds: 15, flux: '15s' },
  { seconds: 60, flux: '1m' },
  { seconds: 300, flux: '5m' },
  { seconds: 900, flux: '15m' },
  { seconds: 3600, flux: '1h' },
  { seconds: 10800, flux: '3h' },
  { seconds: 21600, flux: '6h' },
];

/** เป้าจำนวนจุด — มากกว่านี้เบราว์เซอร์วาดช้า น้อยกว่านี้พีคหาย */
const TARGET_POINTS = 450;

export function pickWindow(hours: number): Window {
  const ideal = (hours * 3600) / TARGET_POINTS;
  return STEPS.find((s) => s.seconds >= ideal) ?? STEPS[STEPS.length - 1];
}

export interface QueryInput {
  bucket: string;
  motorId: number;
  hours: number;
}

/**
 * Flux ไม่มี parameterized query แบบ SQL — ค่าที่ประกอบเข้าสตริงจึงต้องตรวจเอง
 * bucket มาจาก env ส่วน motorId/hours ผ่าน Zod มาแล้ว แต่ตรวจซ้ำที่นี่
 * เพราะฟังก์ชันนี้อาจถูกเรียกจากที่อื่นในอนาคต (NFR-07)
 */
export function buildFluxQuery({ bucket, motorId, hours }: QueryInput): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(bucket)) throw new Error(`ชื่อ bucket ไม่ปลอดภัย: ${bucket}`);
  if (!Number.isInteger(motorId) || motorId <= 0) throw new Error('motorId ต้องเป็นจำนวนเต็มบวก');
  if (!Number.isInteger(hours) || hours <= 0) throw new Error('hours ต้องเป็นจำนวนเต็มบวก');

  const w = pickWindow(hours);
  return `from(bucket: "${bucket}")
  |> range(start: -${hours}h)
  |> filter(fn: (r) => r._measurement == "reading" and r.motor_id == "${motorId}")
  |> aggregateWindow(every: ${w.flux}, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])`;
}

export interface InfluxReading {
  ts: string;
  vrmsY: number | null;
  vrmsZ: number | null;
  temperature: number | null;
  aPeak: number | null;
  /** โซนไม่ได้เก็บใน InfluxDB (เป็น boolean อยู่ใน Postgres) — คงรูปแบบเดิมไว้ */
  zone: string | null;
}

// ช่องว่างใน CSV คือ "ไม่มีข้อมูล" ไม่ใช่ 0 — 0 แปลว่าเครื่องหยุด คนละเรื่องกัน
const num = (v: string | undefined): number | null =>
  v === undefined || v.trim() === '' ? null : Number(v);

export function parseFluxCsv(csv: string): InfluxReading[] {
  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const head = lines[0].split(',').map((h) => h.trim());
  const at = (name: string) => head.indexOf(name);
  const iTime = at('_time');
  if (iTime === -1) return [];

  const out: InfluxReading[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const t = c[iTime]?.trim();
    if (!t) continue;
    out.push({
      ts: new Date(t).toISOString(),
      vrmsY: num(c[at('vrms_y')]),
      vrmsZ: num(c[at('vrms_z')]),
      temperature: num(c[at('temperature')]),
      aPeak: num(c[at('a_peak')]),
      zone: null,
    });
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}
