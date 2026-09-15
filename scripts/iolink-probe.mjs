/**
 * อ่าน process data ดิบจาก IO-Link Master แล้วถอดเป็น float32 8 สล็อต
 * Master ใช้ Bearer token — ต้อง POST /api/balluff/v1/users/login ก่อน
 * เป้าหมาย: ได้ครบ 8 ค่าโดยไม่ต้องพึ่ง Data selector ของ CMTK
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

const BASE = env.IOLINK_URL;

const req = (path, { method = 'GET', body, token } = {}) =>
  new Promise((resolve) => {
    const u = new URL(BASE + path);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;
    const r = lib.request(
      u,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        rejectUnauthorized: false,
        timeout: 10000,
      },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      },
    );
    r.on('error', (e) => resolve({ status: 0, body: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (payload) r.write(payload);
    r.end();
  });

console.log('=== login ===');
const login = await req('/api/balluff/v1/users/login', {
  method: 'POST',
  body: { username: env.IOLINK_USER, password: env.IOLINK_PASS },
});
console.log('HTTP', login.status, login.body.slice(0, 200).replace(/"(token|jwt)":"[^"]+"/g, '"$1":"***"'));
if (login.status !== 200) {
  console.log('\nล็อกอินไม่ผ่าน — ตรวจ IOLINK_USER / IOLINK_PASS ว่าเป็นของ Master (.141) ไม่ใช่ของ CMTK (.140)');
  process.exit(1);
}

const j = JSON.parse(login.body);
const token = j.token ?? j.accessToken ?? j.jwt ?? j.access_token;
console.log('ได้ token ยาว', String(token ?? '').length, 'ตัวอักษร');

const decode = (hexish) => {
  const clean = String(hexish).replace(/[^0-9a-fA-F]/g, '');
  const buf = Buffer.from(clean, 'hex');
  const slots = [];
  for (let i = 0; i + 4 <= buf.length; i += 4) slots.push(Number(buf.readFloatBE(i).toFixed(4)));
  return { bytes: buf.length, slots };
};

console.log('\n=== process data ทุกพอร์ต ===');
for (const port of [1, 2, 3, 4]) {
  for (const path of [
    `/iolink/v1/devices/master1port${port}/processdata/value`,
    `/api/balluff/v1/iolink/devices/port${port}/processdatabytes/in`,
  ]) {
    const r = await req(path, { token });
    if (r.status !== 200) {
      console.log(`port${port} ${path.split('/api/')[1] ? 'balluff' : 'iolink'} → ${r.status}`);
      continue;
    }
    console.log(`\nport${port} ← ${path}`);
    console.log('  raw:', r.body.slice(0, 220));
    try {
      const o = JSON.parse(r.body);
      const hex = o.value ?? o.processData ?? o.data ?? o.bytes ?? o.pdIn ?? '';
      const d = decode(hex);
      if (d.slots.length) {
        console.log(`  ${d.bytes} ไบต์ = ${d.slots.length} สล็อต:`, d.slots.join(' · '));
        if (d.slots.length >= 6) {
          console.log(
            '  crest Y =', (d.slots[4] / d.slots[0]).toFixed(2),
            '· crest Z =', (d.slots[5] / d.slots[1]).toFixed(2),
          );
        }
      }
    } catch {
      /* ไม่ใช่ JSON */
    }
    break;
  }
}
