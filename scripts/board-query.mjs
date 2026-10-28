/**
 * ยิง InfluxQL อะไรก็ได้ไปที่ InfluxDB บนบอร์ด CMTK แล้วพิมพ์เป็นตาราง
 *
 *   node scripts/board-query.mjs 'SHOW MEASUREMENTS'
 *   node scripts/board-query.mjs 'SELECT last("Vibration Velocity, RMS Y [mm/s]") FROM "port0"'
 *   node scripts/board-query.mjs 'SELECT count(*) FROM "port1" WHERE time > now() - 10m'
 *
 * ⚠️ เวลาที่บอร์ดคืนมาเป็น "เวลาไทยติดป้าย Z" ล้ำหน้าความจริง 7 ชม.
 *    พิสูจน์เทียบ NTP แล้ว 5 ต.ค. 2026 — คอลัมน์ time จึงพิมพ์ทั้งป้ายดิบและเวลาจริง
 *    ตราบที่ยังไม่แก้ timezone ที่ตัวบอร์ด อย่าเอาป้ายดิบไปเทียบกับเวลาของเราตรง ๆ
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// ไม่ตัดคอมเมนต์ท้ายบรรทัด — MQTT_TOPIC มี # เป็น wildcard ตัดแล้ว subscribe ไม่เจออะไรเลย
const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../ingestion/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const OFFSET_MS = Number(env.SENSOR_CLOCK_OFFSET_MINUTES ?? -420) * 60_000;

const sql = process.argv.slice(2).join(' ');
if (!sql) {
  console.error('ใช้: node scripts/board-query.mjs \'<InfluxQL>\'');
  process.exit(1);
}

const query = (q) =>
  new Promise((resolve, reject) => {
    const u = new URL(env.INFLUX_URL + '/query');
    u.searchParams.set('db', env.INFLUX_DB);
    u.searchParams.set('q', q);
    u.searchParams.set('epoch', 'ms');
    const lib = u.protocol === 'https:' ? https : http;
    const auth = 'Basic ' + Buffer.from(`${env.INFLUX_USER}:${env.INFLUX_PASS}`).toString('base64');
    const req = lib.request(
      u,
      { headers: { Authorization: auth }, rejectUnauthorized: false, timeout: 180_000 },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${b.slice(0, 200)}`));
          const j = JSON.parse(b);
          if (j.results?.[0]?.error) return reject(new Error(j.results[0].error));
          resolve(j.results?.[0]?.series ?? []);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });

const cell = (v, col) => {
  if (v === null || v === undefined) return '';
  if (col === 'time' && typeof v === 'number') {
    // ป้ายดิบ | เวลาจริง — ให้เห็นทั้งคู่ จะได้ไม่เผลอเทียบผิดฝั่ง
    return `${new Date(v).toISOString().slice(0, 19)} | ${new Date(v + OFFSET_MS).toISOString().slice(0, 19)}`;
  }
  return typeof v === 'number' ? String(+v.toFixed(5)) : String(v);
};

const series = await query(sql);
if (series.length === 0) {
  console.log('(ไม่มีผลลัพธ์)');
  process.exit(0);
}

for (const s of series) {
  const tags = s.tags ? ' ' + JSON.stringify(s.tags) : '';
  console.log(`\n── ${s.name}${tags} · ${s.values.length} แถว ──`);
  const cols = s.columns.map((c) => (c === 'time' ? 'time (ป้ายบอร์ด | เวลาจริง)' : c));
  const rows = s.values.map((v) => v.map((x, i) => cell(x, s.columns[i])));
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  console.log(w.map((n) => '─'.repeat(n)).join('  '));
  for (const r of rows) console.log(r.map((x, i) => x.padEnd(w[i])).join('  '));
}
