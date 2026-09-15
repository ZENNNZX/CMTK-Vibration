import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const tokenFor = (role: string) =>
  jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role }, SECRET);
const maintenance = tokenFor('maintenance');
const manager = tokenFor('manager');

const logRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  motor_id: 1,
  tag: 'MOTOR-01',
  motor_name: 'ปั๊มน้ำ 1',
  alarm_event_id: null,
  cause: 'bearing',
  description: 'เปลี่ยนแบริ่ง DE',
  performed_by: 1,
  performed_name: 'สมชาย',
  performed_at: new Date('2026-09-12T02:00:00.000Z'),
  reset_run_hours: false,
  ...over,
});

const db = (rows: unknown[], seen: string[] = []) => ({
  query: async (sql: string) => {
    seen.push(sql);
    return { rows };
  },
});
const app = (rows: unknown[] = [logRow()], seen?: string[]) =>
  createApp(db(rows, seen), { jwtSecret: SECRET });

const post = (body: object, token = maintenance, rows?: unknown[], seen?: string[]) =>
  request(app(rows, seen)).post('/api/maintenance').set('Authorization', `Bearer ${token}`).send(body);

const valid = { motorId: 1, cause: 'bearing', description: 'เปลี่ยนแบริ่ง DE' };

describe('GET /api/maintenance', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).get('/api/maintenance')).status).toBe(401);
  });

  it('ทุก role อ่านประวัติซ่อมได้ พร้อมชื่อคนทำและรหัสมอเตอร์', async () => {
    const res = await request(app()).get('/api/maintenance').set('Authorization', `Bearer ${manager}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 5,
      motorId: 1,
      tag: 'MOTOR-01',
      cause: 'bearing',
      performedName: 'สมชาย',
    });
  });

  it('motorId ไม่ใช่ตัวเลข → 400', async () => {
    const res = await request(app())
      .get('/api/maintenance?motorId=abc')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.status).toBe(400);
  });

  it('ยังไม่มีประวัติ → 200 พร้อม array ว่าง', async () => {
    const res = await request(app([])).get('/api/maintenance').set('Authorization', `Bearer ${maintenance}`);
    expect(res.body.data).toEqual([]);
  });
});

describe('POST /api/maintenance', () => {
  it('AC-002-01 · role manager บันทึกงานซ่อมไม่ได้ → 403', async () => {
    expect((await post(valid, manager)).status).toBe(403);
  });

  it('AC-014-02 · ไม่เลือกสาเหตุ → 400 บอก field ไม่ปล่อยลง DB', async () => {
    const seen: string[] = [];
    const res = await post({ motorId: 1, description: 'ซ่อมแล้ว' }, maintenance, [logRow()], seen);
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toBe('cause');
    expect(seen.some((s) => s.trimStart().toUpperCase().startsWith('INSERT'))).toBe(false);
  });

  it('สาเหตุนอกรายการที่กำหนด → 400', async () => {
    expect((await post({ ...valid, cause: 'เดาเอา' })).status).toBe(400);
  });

  it('บันทึกได้ → 201 พร้อมข้อมูลที่บันทึก', async () => {
    const seen: string[] = [];
    const res = await post(valid, maintenance, [logRow()], seen);
    expect(res.status).toBe(201);
    expect(res.body.data.cause).toBe('bearing');
    expect(seen.some((s) => s.trimStart().toUpperCase().startsWith('INSERT'))).toBe(true);
  });

  it('คนที่บันทึกมาจาก token ไม่ใช่จาก body — ปลอมเป็นคนอื่นไม่ได้', async () => {
    const res = await post({ ...valid, performedBy: 999 }, maintenance, [logRow()]);
    expect(res.status).toBe(400);
  });
});
