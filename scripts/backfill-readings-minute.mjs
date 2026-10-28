/**
 * ย่อข้อมูลดิบใน InfluxDB ของเรา เป็นสรุปรายนาที แล้วเติมลง readings_minute ย้อนหลัง
 *
 *   node scripts/backfill-readings-minute.mjs                 # ทุกวันที่ InfluxDB มี
 *   node scripts/backfill-readings-minute.mjs 2026-06-01 2026-06-30
 *
 * ทำไมต้องมี: backfill-from-board เติมแต่ InfluxDB ส่วนหน้า History และ MonthlySummary
 * อ่านจาก Postgres ทั้งคู่ จึงยังมองไม่เห็นเดือนที่ดึงกลับมา — ตัวนี้ปิดช่องนั้น
 *
 * อ่านจาก InfluxDB ในเครื่องเราเอง ไม่แตะบอร์ด จึงเร็วและไม่ไปแย่งงาน real-time
 *
 * ON CONFLICT DO NOTHING — ของที่ ingestion เขียนไว้ตอนรันสดถือเป็นของจริงกว่า
 * เพราะมันเห็น zone กับ invalid_count ที่ InfluxDB ไม่ได้เก็บ ตัวนี้เติมเฉพาะรูที่ว่าง
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';

// scripts/ ไม่มี node_modules ของตัวเอง — ยืม pg ของ ingestion ที่ migrate.mjs ใช้อยู่แล้ว
// ดีกว่าลง dependency ซ้ำให้โฟลเดอร์สคริปต์
const pg = createRequire(new URL('../ingestion/package.json', import.meta.url))('pg');

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../ingestion/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).split('#')[0].trim().replace(/^["']|["']$/g, '')];
    }),
);

const MOTORS = [
  { id: 1, tag: 'MOTOR-01' },
  { id: 2, tag: 'MOTOR-02' },
  { id: 3, tag: 'MOTOR-03' },
  { id: 4, tag: 'MOTOR-04' },
];

const DAY_MS = 86_400_000;
const CHUNK_MS = 6 * 3_600_000;
const INSERT_ROWS = 500; // 500 × 14 พารามิเตอร์ = 7,000 ยังห่างเพดาน 65,535 ของ Postgres

const flux = (body) =>
  new Promise((resolve, reject) => {
    const u = new URL(`${env.INFLUX2_URL}/api/v2/query?org=${encodeURIComponent(env.INFLUX2_ORG)}`);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = Buffer.from(body, 'utf8');
    const req = lib.request(
      u,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${env.INFLUX2_TOKEN}`,
          'Content-Type': 'application/vnd.flux',
          Accept: 'application/csv',
          'Content-Length': payload.length,
        },
        timeout: 120_000,
      },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () =>
          res.statusCode === 200 ? resolve(b) : reject(new Error(`InfluxDB HTTP ${res.statusCode} ${b.slice(0, 160)}`)),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('InfluxDB timeout')));
    req.write(payload);
    req.end();
  });

/** ดึงค่าดิบแบบ pivot — หนึ่งแถวต่อหนึ่ง timestamp ได้ครบทุก field ในคิวรีเดียว */
const rawRows = async (tag, startMs, stopMs) => {
  const csv = await flux(`from(bucket:"${env.INFLUX2_BUCKET}")
  |> range(start: ${new Date(startMs).toISOString()}, stop: ${new Date(stopMs).toISOString()})
  |> filter(fn:(r) => r.tag == "${tag}")
  |> filter(fn:(r) => r._field == "vrms_y" or r._field == "vrms_z" or r._field == "temperature")
  |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
  |> keep(columns:["_time","vrms_y","vrms_z","temperature"])`);

  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  const at = (n) => head.indexOf(n);
  const iT = at('_time');
  if (iT === -1) return [];
  const iY = at('vrms_y');
  const iZ = at('vrms_z');
  const iP = at('temperature');

  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const t = c[iT]?.trim();
    if (!t) continue;
    const num = (i) => {
      if (i === -1) return null;
      const v = c[i]?.trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    out.push({ ms: Date.parse(t), y: num(iY), z: num(iZ), p: num(iP) });
  }
  return out;
};

/** ย่อเป็นถังนาที — สูตรเดียวกับ Aggregator ของ ingestion (min/avg/max + นับตัวอย่าง) */
const toMinutes = (rows) => {
  const buckets = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.ms)) continue;
    const key = Math.floor(r.ms / 60_000) * 60_000;
    let b = buckets.get(key);
    if (!b) {
      b = { y: [], z: [], p: [], n: 0 };
      buckets.set(key, b);
    }
    b.n++;
    if (r.y !== null) b.y.push(r.y);
    if (r.z !== null) b.z.push(r.z);
    if (r.p !== null) b.p.push(r.p);
  }
  const stat = (a, d) =>
    a.length === 0
      ? [null, null, null]
      : [
          +Math.min(...a).toFixed(d),
          +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(d),
          +Math.max(...a).toFixed(d),
        ];
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, b]) => ({ ms, y: stat(b.y, 3), z: stat(b.z, 3), p: stat(b.p, 2), n: b.n }));
};

// ── main ──────────────────────────────────────────────────
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();

const argFrom = process.argv[2] ? Date.parse(process.argv[2] + 'T00:00:00Z') : null;
const argTo = process.argv[3] ? Date.parse(process.argv[3] + 'T00:00:00Z') + DAY_MS : null;

// ขอบเขตจาก InfluxDB เอง — ไม่ต้องให้คนมาบอกว่ามีข้อมูลตั้งแต่เมื่อไหร่
let from = argFrom;
let to = argTo ?? Date.now();
if (from === null) {
  const csv = await flux(`from(bucket:"${env.INFLUX2_BUCKET}")
  |> range(start: -400d) |> filter(fn:(r) => r._field == "vrms_y") |> group() |> first()`);
  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const h = lines[0].split(',').map((s) => s.trim());
  from = Math.floor(Date.parse(lines[1].split(',')[h.indexOf('_time')]) / DAY_MS) * DAY_MS;
}

console.log('เติม readings_minute จาก', new Date(from).toISOString().slice(0, 10), 'ถึง', new Date(to).toISOString().slice(0, 10), '\n');

let inserted = 0;
let skipped = 0;
const t0 = Date.now();

for (let day = from; day < to; day += DAY_MS) {
  const label = new Date(day).toISOString().slice(0, 10);

  for (const m of MOTORS) {
    const { rows: [{ n: have }] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM readings_minute
        WHERE motor_id = $1 AND minute_ts >= $2 AND minute_ts < $3`,
      [m.id, new Date(day), new Date(day + DAY_MS)],
    );
    if (have >= 1430) {
      skipped++;
      continue;
    }

    const minutes = [];
    for (let c = day; c < day + DAY_MS && c < to; c += CHUNK_MS) {
      minutes.push(...toMinutes(await rawRows(m.tag, c, Math.min(c + CHUNK_MS, to))));
    }
    if (minutes.length === 0) continue;

    let wrote = 0;
    for (let i = 0; i < minutes.length; i += INSERT_ROWS) {
      const slice = minutes.slice(i, i + INSERT_ROWS);
      const vals = [];
      const tuples = slice.map((r, k) => {
        const b = k * 14;
        // zone กับ invalid_count ไม่มีใน InfluxDB — ปล่อย null ไว้ตรง ๆ ดีกว่าเดา
        vals.push(m.id, new Date(r.ms), r.y[0], r.y[1], r.y[2], r.z[0], r.z[1], r.z[2], r.p[0], r.p[1], r.p[2], null, r.n, 0);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
      });
      const res = await db.query(
        `INSERT INTO readings_minute
           (motor_id, minute_ts, vrms_y_min, vrms_y_avg, vrms_y_max,
            vrms_z_min, vrms_z_avg, vrms_z_max,
            temperature_min, temperature_avg, temperature_max,
            zone, sample_count, invalid_count)
         VALUES ${tuples.join(',')}
         ON CONFLICT (motor_id, minute_ts) DO NOTHING`,
        vals,
      );
      wrote += res.rowCount ?? 0;
    }
    inserted += wrote;
    console.log(`${label}  ${m.tag}  เติม ${wrote.toLocaleString()} นาที (มีอยู่เดิม ${have.toLocaleString()})`);
  }
}

await db.end();
console.log(
  `\nเสร็จใน ${((Date.now() - t0) / 60_000).toFixed(1)} นาที · เติมใหม่ ${inserted.toLocaleString()} แถว · ข้ามวันที่ครบแล้ว ${skipped} วัน-มอเตอร์`,
);
