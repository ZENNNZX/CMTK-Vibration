/**
 * field ไหน "มีข้อมูลเข้าใน 10 นาทีล่าสุด" — ไม่ใช่แค่เคยมีใน schema
 * ใช้เช็คหลังไปติ๊ก Data selector ว่ามีผลจริงไหม
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

const keys = await q('SHOW FIELD KEYS FROM "port0"');
const fields = keys[0]?.values?.map((v) => v[0]) ?? [];
console.log('field ใน schema ของ port0:', fields.length, 'อัน\n');

const live = [];
const dead = [];
for (const f of fields) {
  const s = await q(`SELECT count("${f}") FROM "port0" WHERE time > now() - 10m`);
  const n = s[0]?.values?.[0]?.[1] ?? 0;
  (n > 0 ? live : dead).push({ field: f, จุดใน10นาที: n });
}

console.log('🟢 มีข้อมูลเข้าจริง', live.length, 'อัน');
console.table(live);
console.log('🔴 ไม่มีข้อมูลเข้า', dead.length, 'อัน');
console.log('   ' + dead.map((d) => d.field).join('\n   '));
