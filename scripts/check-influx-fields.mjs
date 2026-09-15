/**
 * ตอบคำถามเดียว: InfluxDB บนบอร์ด CMTK เก็บ field อะไรบ้าง
 * มีแค่ 3 สเกลาร์เหมือนที่ MQTT ส่ง หรือมี waveform / FFT band ซ่อนอยู่
 *
 * ตั้งค่าจากหน้า "Enable external InfluxDB access" ของ CMTK
 *   user cmtk · port 8086 · database balluffCMTKDatabase  (InfluxDB 1.x)
 *
 * รหัสผ่านรับจาก env ไม่ต้องพิมพ์ลงที่ไหน:
 *   $env:INFLUX_PASS='...'; node scripts/check-influx-fields.mjs
 */
const HOSTS = (process.env.INFLUX_HOST ?? '192.168.50.140,192.168.50.141').split(',');
const PORT = process.env.INFLUX_PORT ?? '8086';
const USER = process.env.INFLUX_USER ?? 'cmtk';
const PASS = process.env.INFLUX_PASS ?? '';
const DB = process.env.INFLUX_DB ?? 'balluffCMTKDatabase';

if (!PASS) {
  console.log("ตั้งรหัสก่อน:  $env:INFLUX_PASS='<รหัสจากหน้า CMTK>'");
  process.exit(1);
}

// ใบรับรองของบอร์ดเป็น self-signed — ยอมรับเฉพาะสคริปต์ตรวจสอบตัวนี้
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SCHEME = process.env.INFLUX_SCHEME ?? 'https';

const q = async (host, sql) => {
  const url = `${SCHEME}://${host}:${PORT}/query?db=${encodeURIComponent(DB)}&q=${encodeURIComponent(sql)}`;
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
};

/** InfluxDB คืนผลเป็น series/values — แบนให้อ่านง่าย */
const rows = (json) => json?.results?.[0]?.series?.flatMap((s) => s.values.map((v) => [s.name, ...v])) ?? [];

for (const host of HOSTS) {
  console.log(`\n================ ${host}:${PORT} · db=${DB} ================`);
  try {
    const m = rows(await q(host, 'SHOW MEASUREMENTS'));
    console.log(`measurement ${m.length} อัน:`, m.map((r) => r[1]).join(', ') || '(ไม่มี)');

    const f = rows(await q(host, 'SHOW FIELD KEYS'));
    console.log(`\nfield ทั้งหมด ${f.length} อัน:`);
    for (const [, meas, key, type] of f.map((r) => [null, r[0], r[1], r[2]])) {
      console.log(`  ${String(meas).padEnd(28)} ${String(key).padEnd(40)} ${type ?? ''}`);
    }

    const t = rows(await q(host, 'SHOW TAG KEYS'));
    console.log(`\ntag: ${t.map((r) => r[1]).join(', ') || '(ไม่มี)'}`);

    // นับว่าเก็บถี่แค่ไหนจริง
    const c = await q(host, `SELECT count(*) FROM /.*/ WHERE time > now() - 10m`);
    console.log('\nนับ 10 นาทีล่าสุด:', JSON.stringify(rows(c)).slice(0, 600));

    const uniq = [...new Set(f.map((r) => String(r[1])))];
    // waveform/สเปกตรัมจริงเท่านั้น — peak/crest เป็นสเกลาร์ ไม่ใช่ข้อมูลความถี่
    const spectral = uniq.filter((k) => /spectr|fft|band|envelop|wave|harmon|raw/i.test(k));
    const extraScalars = uniq.filter((k) => /peak|crest|kurt|accel|a-rms|skew/i.test(k));
    console.log('\n' + '='.repeat(60));
    if (hits.length) {
      console.log('🎯 เจอ field ที่ไปต่อได้:', hits.map((r) => r[1]).join(', '));
      console.log('   → คุยเรื่อง Python / FFT ได้เลย');
    } else {
      console.log('เจอแต่สเกลาร์ที่ประมวลผลแล้ว ไม่มี waveform');
      console.log('   → เซ็นเซอร์คือเพดานจริง InfluxDB ให้แค่ถี่ขึ้น ไม่ได้ให้มิติใหม่');
    }
  } catch (e) {
    console.log('ต่อไม่ได้:', e.message);
  }
}
