/**
 * ดึงอนุกรมเวลาดิบย้อนหลังจาก InfluxDB บนบอร์ด CMTK มาเขียนลง InfluxDB 2 ของเรา
 *
 *   node scripts/backfill-from-board.mjs                 # ทั้งหมดเท่าที่บอร์ดมี
 *   node scripts/backfill-from-board.mjs 2026-09-01      # ตั้งแต่วันนี้เป็นต้นไป
 *   node scripts/backfill-from-board.mjs 2026-09-01 2026-09-10
 *
 * สามอย่างที่ทำให้สคริปต์นี้ปลอดภัยกับการรันซ้ำ:
 *
 * 1. InfluxDB ทับจุดเดิมเมื่อ measurement + tag + timestamp + field ตรงกัน
 *    รันซ้ำจึงไม่เกิดข้อมูลซ้ำ ไม่ต้องมีไฟล์จำสถานะ ขาดตอนแล้วรันใหม่ได้เลย
 * 2. ก่อนดึงแต่ละวันจะนับของที่มีอยู่แล้วก่อน ครบแล้วข้าม — resume ได้โดยไม่ต้องจำอะไร
 * 3. เว้นจังหวะระหว่างคิวรี เพราะบอร์ดตัวเดียวกันนี้กำลังทำงาน real-time อยู่
 *    ยิงรัวจะไปแย่งทรัพยากรกับการเก็บข้อมูลสดซึ่งพลาดไม่ได้
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

// ── config ────────────────────────────────────────────────
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

/**
 * นาฬิกาของ InfluxDB บนบอร์ดเป็นเวลาไทยแต่ติดป้าย Z เหมือน payload MQTT
 * พิสูจน์แล้ว 21 ก.ย. 2026: mean(vrms_y) ของบอร์ดที่ 11:00Z = ของเราที่ 04:00Z ตรงกันทุกหลัก
 * ใช้ค่าเดียวกับ SENSOR_CLOCK_OFFSET_MINUTES เพื่อให้แก้ที่เดียวเมื่อบอร์ดแก้ firmware
 */
const OFFSET_MS = Number(env.SENSOR_CLOCK_OFFSET_MINUTES ?? -420) * 60_000;

/** ชื่อคอลัมน์บนบอร์ดมีหน่วยต่อท้าย ต่างจากชื่อใน payload MQTT จึงใช้ FIELD_MAP ของ ingestion ไม่ได้ */
const FIELDS = {
  'Temperature [°C]': 'temperature',
  'Vibration Velocity, RMS Y [mm/s]': 'vrms_y',
  'Vibration Velocity, RMS Z [mm/s]': 'vrms_z',
  'Vibration Acceleration, Peak Magnitude [g]': 'a_peak',
  'Vibration Acceleration, RMS Magnitude [g]': 'a_rms',
};

/** ตรงกับ motors.port_no → id/tag ใน Postgres · 4 แถวตายตัว ไม่คุ้มต่อ pg แค่เพื่ออ่านสี่บรรทัด */
const MOTORS = [
  { port: 0, id: 1, tag: 'MOTOR-01' },
  { port: 1, id: 2, tag: 'MOTOR-02' },
  { port: 2, id: 3, tag: 'MOTOR-03' },
  { port: 3, id: 4, tag: 'MOTOR-04' },
];

const DAY_MS = 86_400_000;
const CHUNK_MS = 6 * 3_600_000; // ดึงทีละ 6 ชม. — ทั้งวันทีเดียวบอร์ดคืน JSON ~30 MB และเสี่ยง timeout
const BATCH_LINES = 5000;
const PACE_MS = 250; // เว้นให้บอร์ดหายใจ
const EXPECT_PER_DAY = 172_800; // 2 Hz × 86400
/**
 * มีเกินนี้ถือว่าวันนั้นครบแล้ว
 * ponytail: วันที่บอร์ดเองมีไม่ครบ (ช่วงติดตั้งต้น มิ.ย. มี 21–75%) จะไม่ถึงเกณฑ์นี้
 * จึงถูกดึงซ้ำทุกครั้งที่รันใหม่ — เสียเวลาไม่กี่นาที ไม่เสียความถูกต้อง
 * ถ้าวันไหนรำคาญ ให้ถามจำนวนจากบอร์ดมาเทียบแทนค่าคงที่ แลกกับคิวรีบอร์ดเพิ่มวันละครั้ง
 */
const SKIP_AT = 0.97;

// ── board (InfluxDB 1.x, self-signed) ─────────────────────
const boardQuery = (sql) =>
  new Promise((resolve, reject) => {
    const u = new URL(env.INFLUX_URL + '/query');
    u.searchParams.set('db', env.INFLUX_DB);
    u.searchParams.set('q', sql);
    u.searchParams.set('epoch', 'ms');
    const auth = 'Basic ' + Buffer.from(`${env.INFLUX_USER}:${env.INFLUX_PASS}`).toString('base64');
    const req = https.request(
      u,
      { headers: { Authorization: auth }, rejectUnauthorized: false, timeout: 120_000 },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`บอร์ดตอบ HTTP ${res.statusCode} ${b.slice(0, 160)}`));
          let j;
          try {
            j = JSON.parse(b);
          } catch {
            return reject(new Error('บอร์ดตอบไม่ใช่ JSON'));
          }
          if (j.results?.[0]?.error) return reject(new Error(j.results[0].error));
          resolve(j.results?.[0]?.series?.[0] ?? null);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('บอร์ด timeout')));
    req.end();
  });

// ── ของเรา (InfluxDB 2) ───────────────────────────────────
const ours = (path, { method = 'POST', body = '', type = 'application/vnd.flux', accept = 'application/csv' } = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(env.INFLUX2_URL + path);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = Buffer.from(body, 'utf8');
    const req = lib.request(
      u,
      {
        method,
        headers: {
          Authorization: `Token ${env.INFLUX2_TOKEN}`,
          'Content-Type': type,
          Accept: accept,
          'Content-Length': payload.length,
        },
        timeout: 60_000,
      },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(b)
            : reject(new Error(`InfluxDB เราตอบ HTTP ${res.statusCode} ${b.slice(0, 160)}`)),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('InfluxDB เรา timeout')));
    req.write(payload);
    req.end();
  });

const countOurs = async (tag, startMs, endMs) => {
  const flux = `from(bucket:"${env.INFLUX2_BUCKET}")
  |> range(start: ${new Date(startMs).toISOString()}, stop: ${new Date(endMs).toISOString()})
  |> filter(fn:(r) => r._field == "vrms_y" and r.tag == "${tag}")
  |> group() |> count()`;
  const csv = await ours(`/api/v2/query?org=${encodeURIComponent(env.INFLUX2_ORG)}`, { body: flux });
  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return 0;
  const i = lines[0].split(',').map((s) => s.trim()).indexOf('_value');
  return Number(lines[1].split(',')[i]) || 0;
};

const write = (lines) =>
  ours(
    `/api/v2/write?org=${encodeURIComponent(env.INFLUX2_ORG)}&bucket=${encodeURIComponent(env.INFLUX2_BUCKET)}&precision=ns`,
    { body: lines.join('\n'), type: 'text/plain; charset=utf-8', accept: 'application/json' },
  );

// ── line protocol (ต้องตรงกับ ingestion/src/influxLine.ts เป๊ะ ไม่งั้นได้ series คนละชุด) ──
const escapeTag = (v) => v.replace(/([,= ])/g, '\\$1');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString();
const ymd = (ms) => iso(ms).slice(0, 10);

/**
 * ลองใหม่เมื่อพลาด — ปลายทางล้มชั่วคราวได้ทั้งสองฝั่ง และทั้งสองแบบไม่ใช่ความผิดของข้อมูล
 *   บอร์ด: อยู่ปลาย Wi-Fi ที่พิสูจน์แล้วว่าหลุดเป็นช่วง
 *   เราเอง: วัดจริง 21 ก.ย. — ตอบ HTTP 500 "timeout" ระหว่าง compaction หนัก ทั้งที่ CPU/MEM ยังเหลือเยอะ
 * การเขียนทับจุดเดิมได้อยู่แล้ว ส่งก้อนเดิมซ้ำจึงไม่ทำให้ข้อมูลซ้ำหรือเพี้ยน
 */
const retry = async (what, fn, tries = 5) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      const wait = 2000 * i;
      console.log(`   ! ${what} พลาดครั้งที่ ${i}/${tries} — ${err.message.slice(0, 90)} · รอ ${wait / 1000} วิ แล้วลองใหม่`);
      await sleep(wait);
    }
  }
};

// ── main ──────────────────────────────────────────────────
for (const k of ['INFLUX_URL', 'INFLUX_DB', 'INFLUX_USER', 'INFLUX_PASS', 'INFLUX2_URL', 'INFLUX2_TOKEN', 'INFLUX2_ORG', 'INFLUX2_BUCKET']) {
  if (!env[k]) {
    console.error(`ขาดตัวแปร ${k} ใน ingestion/.env`);
    process.exit(1);
  }
}

console.log('ชดเชยนาฬิกาบอร์ด', OFFSET_MS / 60_000, 'นาที · ดึงทีละ', CHUNK_MS / 3_600_000, 'ชม.\n');

/** field ที่พอร์ตนั้นมีจริง — เลือก field ที่ไม่มีอยู่ InfluxDB 1.x จะคืนซีรีส์เปล่าทั้งก้อน */
const fieldsOf = async (port) => {
  const s = await boardQuery(`SHOW FIELD KEYS FROM "port${port}"`);
  const have = new Set((s?.values ?? []).map((v) => v[0]));
  return Object.keys(FIELDS).filter((f) => have.has(f));
};

// ขอบเขตเวลา — ตามนาฬิกาของบอร์ด
const argFrom = process.argv[2] ? Date.parse(process.argv[2] + 'T00:00:00Z') : null;
const argTo = process.argv[3] ? Date.parse(process.argv[3] + 'T00:00:00Z') + DAY_MS : null;

// first() สแกนประวัติทั้งหมดบนบอร์ด — ช้าและเคยทำบอร์ดตัดการเชื่อมต่อ จึงถามเฉพาะตอนไม่ได้ระบุวันเริ่ม
let boardFirst = null;
if (argFrom === null) {
  const firstRow = await retry('อ่านจุดแรกจากบอร์ด', () =>
    boardQuery('SELECT first("Vibration Velocity, RMS Y [mm/s]") FROM "port0"'),
  );
  boardFirst = Number(firstRow?.values?.[0]?.[0]);
  if (!boardFirst) {
    console.error('อ่านจุดแรกจากบอร์ดไม่ได้');
    process.exit(1);
  }
}

// อาร์กิวเมนต์เป็นวันตามเวลาจริง แปลงกลับเป็นนาฬิกาบอร์ดเพื่อถามให้ตรงช่อง
const from = argFrom !== null ? argFrom - OFFSET_MS : Math.floor(boardFirst / DAY_MS) * DAY_MS;
const to = argTo !== null ? argTo - OFFSET_MS : Date.now() - OFFSET_MS;

const fieldsByPort = {};
for (const m of MOTORS) fieldsByPort[m.port] = await retry(`อ่าน field port${m.port}`, () => fieldsOf(m.port));

let totalWritten = 0;
let totalSkipped = 0;
const t0 = Date.now();

for (let day = from; day < to; day += DAY_MS) {
  const realDay = day + OFFSET_MS;
  const label = ymd(realDay);

  for (const m of MOTORS) {
    const fields = fieldsByPort[m.port];
    if (fields.length === 0) {
      console.log(`${label}  ${m.tag}  ข้าม — พอร์ตนี้ไม่มี field ที่ใช้ได้`);
      continue;
    }

    const have = await countOurs(m.tag, realDay, realDay + DAY_MS);
    if (have >= EXPECT_PER_DAY * SKIP_AT) {
      totalSkipped += have;
      console.log(`${label}  ${m.tag}  มีอยู่แล้ว ${have.toLocaleString()} จุด — ข้าม`);
      continue;
    }

    let wrote = 0;
    const cols = fields.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(',');

    for (let c = day; c < day + DAY_MS && c < to; c += CHUNK_MS) {
      const s = await retry(`อ่านบอร์ด port${m.port} ${iso(c).slice(0, 13)}`, () =>
        boardQuery(
          `SELECT ${cols} FROM "port${m.port}" WHERE time >= '${iso(c)}' AND time < '${iso(Math.min(c + CHUNK_MS, to))}'`,
        ),
      );
      await sleep(PACE_MS);
      if (!s?.values?.length) continue;

      // คอลัมน์ในผลลัพธ์อาจเรียงไม่ตรงกับที่ขอ — จับคู่ด้วยชื่อเสมอ
      const idx = s.columns.map((c2, i) => [FIELDS[c2], i]).filter(([k]) => k);
      const batch = [];
      for (const row of s.values) {
        const ns = (row[0] + OFFSET_MS) * 1e6;
        const f = [];
        for (const [key, i] of idx) {
          const v = row[i];
          if (typeof v === 'number' && Number.isFinite(v)) f.push(`${key}=${v}`);
        }
        // บรรทัดที่ไม่มี field เลยทำให้ InfluxDB ปฏิเสธทั้ง batch ไม่ใช่แค่บรรทัดนั้น
        if (f.length === 0) continue;
        batch.push(`reading,motor_id=${m.id},tag=${escapeTag(m.tag)},port=${m.port} ${f.join(',')} ${ns}`);
        if (batch.length >= BATCH_LINES) {
          const chunk = batch.splice(0, batch.length);
          await retry(`เขียน ${m.tag} ${label}`, () => write(chunk));
          wrote += BATCH_LINES;
        }
      }
      if (batch.length) {
        await retry(`เขียน ${m.tag} ${label}`, () => write(batch));
        wrote += batch.length;
      }
    }

    totalWritten += wrote;
    console.log(`${label}  ${m.tag}  เขียน ${wrote.toLocaleString()} จุด`);
  }
}

const mins = ((Date.now() - t0) / 60_000).toFixed(1);
console.log(`\nเสร็จใน ${mins} นาที · เขียนใหม่ ${totalWritten.toLocaleString()} จุด · ข้ามของเดิม ${totalSkipped.toLocaleString()} จุด`);
