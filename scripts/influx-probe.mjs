/**
 * ตรวจ InfluxDB ก่อนตัดสินใจย้ายท่อ — ตอบ 3 คำถาม
 *   1 ต่อติดไหม
 *   2 timestamp เพี้ยน +7 ชม. เหมือน MQTT ไหม
 *   3 GROUP BY time(1m) ให้ผลตรงกับ aggregator ที่เราเขียนเองไหม
 * อ่าน config จาก ingestion/.env — รหัสไม่ต้องพิมพ์ที่ไหน
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../ingestion/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const BASE = env.INFLUX_URL;
const DB = env.INFLUX_DB;
const AUTH = 'Basic ' + Buffer.from(`${env.INFLUX_USER}:${env.INFLUX_PASS}`).toString('base64');

/**
 * fetch ของ Node ใช้ undici ซึ่งไม่รับ https.Agent — ยิงด้วย https.request ตรง ๆ แทน
 * rejectUnauthorized:false ผูกกับคำขอนี้เท่านั้น ไม่ได้ปิดการตรวจทั้ง process
 */
const q = (sql, db = DB) =>
  new Promise((resolve, reject) => {
    const u = new URL(BASE + '/query');
    u.searchParams.set('db', db);
    u.searchParams.set('q', sql);
    u.searchParams.set('epoch', 'ms');
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { headers: { Authorization: AUTH }, rejectUnauthorized: false, timeout: 15000 },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error('HTTP ' + res.statusCode + ' ' + body.slice(0, 200)));
          }
          try {
            const j = JSON.parse(body);
            if (j.results?.[0]?.error) return reject(new Error(j.results[0].error));
            resolve(j.results?.[0]?.series ?? []);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });

const show = (series) =>
  series.flatMap((s) => s.values.map((v) => Object.fromEntries(s.columns.map((c, i) => [c, v[i]]))));

console.log('=== 1. ต่อติดไหม ===');
const meas = show(await q('SHOW MEASUREMENTS'));
console.log('measurement:', meas.map((m) => m.name).join(', '));

console.log('\n=== 2. timestamp เพี้ยนไหม ===');
const last = show(await q('SELECT last("PD v-RMS Y [mm/s]") FROM "port0"'));
const ts = Number(last[0]?.time);
const now = Date.now();
console.log('จุดล่าสุดใน InfluxDB :', new Date(ts).toISOString());
console.log('เวลาเครื่องเราตอนนี้   :', new Date(now).toISOString());
const diffMin = (ts - now) / 60000;
console.log('ต่างกัน              :', diffMin.toFixed(1), 'นาที (' + (diffMin / 60).toFixed(2) + ' ชม.)');
console.log(
  Math.abs(diffMin) > 60
    ? '❌ เพี้ยน — ต้องชดเชยใน query เหมือนที่ทำกับ MQTT'
    : '✅ ตรงเวลาจริง — ไม่ต้องชดเชย',
);

console.log('\n=== 3. GROUP BY time(1m) ทำงานไหม ===');
const rows = show(
  await q(
    'SELECT mean("PD v-RMS Y [mm/s]") AS y_avg, min("PD v-RMS Y [mm/s]") AS y_min,' +
      ' max("PD v-RMS Y [mm/s]") AS y_max, mean("PD v-Peak Y [mm/s]") AS ypk,' +
      ' mean("PD v-RMS X [mm/s]") AS x_avg, mean("Temperature [°C]") AS temp,' +
      ' count("PD v-RMS Y [mm/s]") AS n' +
      ' FROM "port0" WHERE time > now() - 10m GROUP BY time(1m) fill(none)',
  ),
);
console.table(
  rows.slice(-6).map((r) => ({
    นาที: new Date(Number(r.time)).toISOString().slice(11, 16),
    y_avg: r.y_avg?.toFixed(4),
    y_min: r.y_min?.toFixed(4),
    y_max: r.y_max?.toFixed(4),
    y_peak: r.ypk?.toFixed(4),
    x_avg: r.x_avg?.toFixed(4),
    temp: r.temp?.toFixed(2),
    n: r.n,
  })),
);

console.log('\n=== 4. zone flag กับ alarm ใช้ได้ไหม ===');
const z = show(
  await q(
    'SELECT last("Severity Zone A") AS a, last("Severity Zone B") AS b,' +
      ' last("Severity Zone C") AS c, last("Severity Zone D") AS d,' +
      ' last("Pre-Alarm Vibration Velocity, RMS") AS pre,' +
      ' last("Main Alarm Vibration Velocity, RMS") AS main FROM "port0"',
  ),
);
console.log(JSON.stringify(z[0]));

console.log('\n=== 5. เก็บถี่แค่ไหนจริง ===');
const rate = show(await q('SELECT count("PD v-RMS Y [mm/s]") AS n FROM "port0" WHERE time > now() - 1m'));
console.log('ตัวอย่างใน 1 นาทีล่าสุด:', rate[0]?.n, '(MQTT ให้ 120)');
