/**
 * field ไหนยังเขียนอยู่จริง field ไหนตายไปแล้ว
 * SHOW FIELD KEYS บอกแค่ schema ที่เคยมี ไม่ได้บอกว่ายังมีข้อมูลเข้า
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

const q = (sql) =>
  new Promise((resolve, reject) => {
    const u = new URL(BASE + '/query');
    u.searchParams.set('db', DB);
    u.searchParams.set('q', sql);
    u.searchParams.set('epoch', 'ms');
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { headers: { Authorization: AUTH }, rejectUnauthorized: false, timeout: 20000 },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + body.slice(0, 200)));
          const j = JSON.parse(body);
          if (j.results?.[0]?.error) return reject(new Error(j.results[0].error));
          resolve(j.results?.[0]?.series ?? []);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });

const FIELDS = [
  'PD Contact Temp. [°C]',
  'PD v-Peak X [mm/s]',
  'PD v-Peak Y [mm/s]',
  'PD v-Peak Z [mm/s]',
  'PD v-RMS X [mm/s]',
  'PD v-RMS Y [mm/s]',
  'PD v-RMS Z [mm/s]',
  'Temperature [°C]',
  'Vibration Velocity, RMS Y [mm/s]',
  'Vibration Velocity, RMS Z [mm/s]',
];

// InfluxDB เก็บเวลาแบบเดียวกับที่บอร์ดส่ง MQTT — ชดเชยตอนอ่านเพื่อเทียบกับนาฬิกาจริง
const OFFSET_MS = -7 * 3600_000;
const now = Date.now();

console.log('เวลาเครื่องเราตอนนี้ (UTC):', new Date(now).toISOString());
console.log('เทียบโดยชดเชย InfluxDB -7 ชม.\n');

const out = [];
for (const f of FIELDS) {
  try {
    const s = await q(`SELECT last("${f}") FROM "port0"`);
    const t = Number(s[0]?.values?.[0]?.[0]);
    const v = s[0]?.values?.[0]?.[1];
    const ageMin = (now - (t + OFFSET_MS)) / 60000;
    out.push({
      field: f,
      ค่าล่าสุด: typeof v === 'number' ? v.toFixed(4) : String(v),
      'เมื่อ (ชดเชยแล้ว)': new Date(t + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' '),
      'เก่าไป(นาที)': ageMin > 99999 ? '>99999' : Math.round(ageMin),
      สถานะ: ageMin < 10 ? '🟢 สด' : ageMin < 1440 ? '🟡 ช้า' : '🔴 ตายแล้ว',
    });
  } catch (e) {
    out.push({ field: f, ค่าล่าสุด: 'ERR ' + e.message.slice(0, 40) });
  }
}
console.table(out);

console.log('\n=== นับตัวอย่างใน 5 นาทีล่าสุดตามนาฬิกาของ InfluxDB เอง ===');
for (const f of ['Vibration Velocity, RMS Y [mm/s]', 'PD v-RMS Y [mm/s]', 'PD v-RMS X [mm/s]', 'Temperature [°C]']) {
  const s = await q(`SELECT count("${f}") FROM "port0" WHERE time > now() - 5m`);
  console.log(String(s[0]?.values?.[0]?.[1] ?? 0).padStart(6), ' ', f);
}
