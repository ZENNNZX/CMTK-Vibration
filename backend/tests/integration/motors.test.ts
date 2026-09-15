import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const token = jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role: 'maintenance' }, SECRET);

const MINUTE = '2026-09-14T09:00:00.000Z';
const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tag: 'MOTOR-01',
  name: 'ปั๊มน้ำ 1',
  master_no: 2,
  port_no: 0,
  last_seen_at: new Date(),
  minute_ts: new Date(MINUTE),
  vrms_y_avg: '1.446',
  vrms_z_avg: '1.289',
  temperature_avg: '47.00',
  zone: 'B',
  ...over,
});

const db = (rows: unknown[]) => ({
  query: async (sql: string) => ({ rows: sql.includes('FROM motors') ? rows : [] }),
});
const app = (rows: unknown[] = [row()]) => createApp(db(rows), { jwtSecret: SECRET });
const get = (rows?: unknown[]) =>
  request(app(rows)).get('/api/motors').set('Authorization', `Bearer ${token}`);

describe('GET /api/motors', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).get('/api/motors')).status).toBe(401);
  });

  it('AC-005-01 · คืนค่าล่าสุดของทุกมอเตอร์ · ตัวเลขเป็น number ไม่ใช่ string', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({
      id: 1,
      tag: 'MOTOR-01',
      name: 'ปั๊มน้ำ 1',
      masterNo: 2,
      portNo: 0,
      zone: 'B',
      vrmsY: 1.446,
      vrmsZ: 1.289,
      temperature: 47,
      lastMinuteTs: MINUTE,
      isOnline: true,
      // หน้า Admin ใช้สองตัวนี้ — อยู่ในแถวเดียวกันอยู่แล้ว ไม่ต้องยิงคิวรีเพิ่ม
      ratedKw: null,
      sensorMount: null,
    });
  });

  it('AC-011-04 · เงียบเกินกำหนด → isOnline false และห้ามโชว์ค่าเก่าเป็นค่าปัจจุบัน', async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const res = await get([row({ last_seen_at: old })]);
    expect(res.body.data[0].isOnline).toBe(false);
  });

  it('มอเตอร์ที่ยังไม่เคยมีข้อมูล → คืน null ไม่ใช่ 0', async () => {
    const res = await get([
      row({ minute_ts: null, vrms_y_avg: null, vrms_z_avg: null, temperature_avg: null, zone: null, last_seen_at: null }),
    ]);
    expect(res.body.data[0]).toMatchObject({
      zone: null,
      vrmsY: null,
      vrmsZ: null,
      temperature: null,
      lastMinuteTs: null,
      isOnline: false,
    });
  });
});
