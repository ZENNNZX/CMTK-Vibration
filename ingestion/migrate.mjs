// รัน migration 001–009 ตามลำดับชื่อไฟล์
// ไม่มีตารางบันทึกว่า migration ไหนรันแล้ว เพราะทุกไฟล์ re-runnable อยู่แล้ว
// (IF NOT EXISTS · DO $$ ครอบ CREATE TYPE · CREATE OR REPLACE TRIGGER)
// ponytail: รันซ้ำทั้งชุดทุกครั้ง — ใส่ตาราง schema_migrations เมื่อไฟล์เกิน ~30 หรือมีไฟล์ที่ซ้ำไม่ได้
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const dir = new URL('../database/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const f of files) {
  const sql = readFileSync(new URL(f, dir), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`✔ ${f}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✘ ${f}\n  ${err.message}`);
    process.exit(1);
  }
}

const { rows } = await client.query('SELECT tag, master_no, port_no FROM motors ORDER BY port_no');
console.table(rows);
await client.end();
