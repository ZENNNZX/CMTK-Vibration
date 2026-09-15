import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const tokenFor = (role: string) =>
  jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role }, SECRET);
const maintenance = tokenFor('maintenance');
const manager = tokenFor('manager');

const motorRow = (over: Record<string, unknown> = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', master_no: 2, port_no: 0,
  rated_kw: '22.0', iso_group: 2, mounting_rigid: true,
  sensor_mount: 'DE-H', sensor_mount_offset: null,
  warning_threshold: '2.800', alarm_threshold: '4.500', run_hours: '0.00',
  last_seen_at: new Date(), is_active: true, ...over,
});

const db = (rows: unknown[], seen: string[] = []) => ({
  query: async (sql: string) => {
    seen.push(sql);
    return { rows };
  },
});
const app = (rows: unknown[] = [motorRow()], seen?: string[]) =>
  createApp(db(rows, seen), { jwtSecret: SECRET });

const patch = (body: object, token = maintenance, rows?: unknown[], seen?: string[]) =>
  request(app(rows, seen)).patch('/api/motors/1').set('Authorization', `Bearer ${token}`).send(body);

describe('PATCH /api/motors/:id', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).patch('/api/motors/1').send({})).status).toBe(401);
  });

  it('AC-002-01 · role manager แก้ค่าไม่ได้ → 403', async () => {
    expect((await patch({ warningThreshold: 3 }, manager)).status).toBe(403);
  });

  it('แก้เกณฑ์ได้ และเขียน UPDATE จริง', async () => {
    const seen: string[] = [];
    const res = await patch(
      { warningThreshold: 3.1, alarmThreshold: 5 },
      maintenance,
      [motorRow({ warning_threshold: '3.100', alarm_threshold: '5.000' })],
      seen,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ warningThreshold: 3.1, alarmThreshold: 5 });
    expect(seen.some((s) => s.trimStart().toUpperCase().startsWith('UPDATE'))).toBe(true);
  });

  it('Warning ต้องน้อยกว่า Alarm — สลับกันแล้วกราฟอ่านไม่ได้ → 400', async () => {
    const res = await patch({ warningThreshold: 5, alarmThreshold: 4 });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.message).toMatch(/Warning/);
  });

  it('เกณฑ์ติดลบ → 400', async () => {
    expect((await patch({ warningThreshold: -1 })).status).toBe(400);
  });

  it('จุดวัดนอกมาตรฐาน ISO 20816 → 400 ไม่ปล่อยลง DB', async () => {
    const res = await patch({ sensorMount: 'ตรงไหนก็ได้' });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toBe('sensorMount');
  });

  it('จุดวัดที่ถูกต้องผ่าน', async () => {
    const res = await patch({ sensorMount: 'NDE-V' }, maintenance, [
      motorRow({ sensor_mount: 'NDE-V' }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.sensorMount).toBe('NDE-V');
  });

  it('body ว่าง → 400 ไม่ยิง UPDATE เปล่า', async () => {
    const seen: string[] = [];
    const res = await patch({}, maintenance, [motorRow()], seen);
    expect(res.status).toBe(400);
    expect(seen.some((s) => s.trimStart().toUpperCase().startsWith('UPDATE'))).toBe(false);
  });

  it('ไม่มีมอเตอร์ตาม id → 404', async () => {
    expect((await patch({ warningThreshold: 3 }, maintenance, [])).status).toBe(404);
  });

  it('ลากจุดบนโมเดล 3D → เก็บตำแหน่งเป็นพิกัดสามแกน', async () => {
    const res = await patch({ sensorMountOffset: [0.95, 0.32, 0.62] }, maintenance, [
      motorRow({ sensor_mount_offset: [0.95, 0.32, 0.62] }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.sensorMountOffset).toEqual([0.95, 0.32, 0.62]);
  });

  it('คืนค่าตำแหน่งมาตรฐาน → ส่ง null ได้ ไม่ใช่ต้องลบทั้งมอเตอร์', async () => {
    const res = await patch({ sensorMountOffset: null }, maintenance, [
      motorRow({ sensor_mount_offset: null }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.sensorMountOffset).toBeNull();
  });

  it('พิกัดไม่ครบสามแกน → 400 ไม่ปล่อย JSON มั่วลง DB', async () => {
    const res = await patch({ sensorMountOffset: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toMatch(/sensorMountOffset/);
  });

  it('พิกัดหลุดขอบเขตโมเดล → 400', async () => {
    expect((await patch({ sensorMountOffset: [99, 0, 0] })).status).toBe(400);
  });
});
