import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const token = jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role: 'maintenance' }, SECRET);

const motorRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tag: 'MOTOR-01',
  name: 'ปั๊มน้ำ 1',
  master_no: 2,
  port_no: 0,
  rated_kw: '22.0',
  iso_group: 2,
  mounting_rigid: true,
  sensor_mount: 'DE-H',
  sensor_mount_offset: null,
  warning_threshold: '2.800',
  alarm_threshold: '4.500',
  run_hours: '1284.50',
  last_seen_at: new Date(),
  is_active: true,
  ...over,
});

const readingRow = (over: Record<string, unknown> = {}) => ({
  minute_ts: new Date('2026-09-14T09:00:00.000Z'),
  vrms_y_avg: '1.446',
  vrms_z_avg: '1.289',
  temperature_avg: '47.00',
  zone: 'B',
  ...over,
});

/** แยกคิวรีด้วยชื่อตาราง — mock ตัวเดียวรับใช้ทั้งสอง endpoint */
const db = (motors: unknown[], readings: unknown[] = []) => ({
  query: async (sql: string) => ({
    rows: sql.includes('FROM readings_minute') ? readings : motors,
  }),
});
const app = (motors: unknown[] = [motorRow()], readings: unknown[] = []) =>
  createApp(db(motors, readings), { jwtSecret: SECRET });

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

describe('GET /api/motors/:id', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).get('/api/motors/1')).status).toBe(401);
  });

  it('คืนค่าที่หน้ารายละเอียดต้องใช้ · ตัวเลขเป็น number ไม่ใช่ string', async () => {
    const res = await auth(request(app()).get('/api/motors/1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tag: 'MOTOR-01',
      ratedKw: 22,
      sensorMount: 'DE-H',
      warningThreshold: 2.8,
      alarmThreshold: 4.5,
      runHours: 1284.5,
    });
  });

  it('ไม่มีมอเตอร์ตาม id → 404 ไม่ใช่ 500', async () => {
    const res = await auth(request(app([])).get('/api/motors/999'));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('id ไม่ใช่ตัวเลข → 400 พร้อมบอก field (SOP-DEV-001 · Zod ทุก params)', async () => {
    const res = await auth(request(app()).get('/api/motors/abc'));
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toBe('id');
  });
});

describe('GET /api/motors/:id/readings', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).get('/api/motors/1/readings')).status).toBe(401);
  });

  it('AC-007-01 · คืนอนุกรมเวลาพร้อมค่าทั้งสองแกนและอุณหภูมิ', async () => {
    const res = await auth(request(app([motorRow()], [readingRow()])).get('/api/motors/1/readings'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ vrmsY: 1.446, vrmsZ: 1.289, temperature: 47, zone: 'B' });
    expect(res.body.data[0].ts).toBe('2026-09-14T09:00:00.000Z');
  });

  it('AC-007-03 · มอเตอร์เพิ่งลงทะเบียน ยังไม่มีข้อมูล → 200 พร้อม array ว่าง ไม่ใช่ 404', async () => {
    const res = await auth(request(app([motorRow()], [])).get('/api/motors/1/readings'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('hours นอกช่วงที่ยอมรับ → 400 ไม่ใช่ยิงคิวรีทั้งตาราง', async () => {
    const res = await auth(request(app()).get('/api/motors/1/readings?hours=99999'));
    expect(res.status).toBe(400);
  });

  it('ไม่มีมอเตอร์ตาม id → 404', async () => {
    const res = await auth(request(app([], [])).get('/api/motors/1/readings'));
    expect(res.status).toBe(404);
  });
});
