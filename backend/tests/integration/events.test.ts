import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const tokenFor = (role: string) =>
  jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role }, SECRET);
const maintenance = tokenFor('maintenance');
const manager = tokenFor('manager');

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 9,
  motor_id: 3,
  tag: 'MOTOR-03',
  name: 'สายพานลำเลียง',
  kind: 'warning',
  metric: 'vibration',
  raised_at: new Date('2026-09-11T01:41:00.000Z'),
  resolved_at: null,
  value_at_raise: '3.020',
  zone_from: 'B',
  zone_to: 'C',
  acknowledged_by: null,
  acknowledged_name: null,
  acknowledged_at: null,
  ...over,
});

const db = (rows: unknown[], onWrite?: (sql: string, params: unknown[]) => void) => ({
  query: async (sql: string, params: unknown[] = []) => {
    onWrite?.(sql, params);
    if (sql.trimStart().toUpperCase().startsWith('UPDATE')) {
      return { rows: rows.length ? [rows[0]] : [] };
    }
    return { rows };
  },
});
const app = (rows: unknown[] = [eventRow()], onWrite?: (s: string, p: unknown[]) => void) =>
  createApp(db(rows, onWrite), { jwtSecret: SECRET });

describe('GET /api/events', () => {
  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(app()).get('/api/events?month=2026-09')).status).toBe(401);
  });

  it('AC-012-01 · คืนเหตุการณ์ของเดือนที่ขอ พร้อมรหัสมอเตอร์และระดับ', async () => {
    const res = await request(app())
      .get('/api/events?month=2026-09')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 9,
      motorId: 3,
      tag: 'MOTOR-03',
      kind: 'warning',
      value: 3.02,
      zoneFrom: 'B',
      zoneTo: 'C',
      acknowledgedBy: null,
    });
    expect(res.body.data[0].raisedAt).toBe('2026-09-11T01:41:00.000Z');
  });

  it('pg คืน BIGINT เป็น string — id ต้องออกไปเป็น number', async () => {
    const res = await request(app([eventRow({ id: '7520', motor_id: '3' })]))
      .get('/api/events?month=2026-09')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.body.data[0].id).toBe(7520);
    expect(res.body.data[0].motorId).toBe(3);
  });

  it('month ผิดรูปแบบ → 400 บอก field ไม่ใช่ 500', async () => {
    const res = await request(app())
      .get('/api/events?month=กันยา')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toBe('month');
  });

  it('ไม่ส่ง month → ใช้เดือนปัจจุบัน ไม่ใช่ 400', async () => {
    const res = await request(app())
      .get('/api/events')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.status).toBe(200);
  });

  it('เดือนที่ไม่มีเหตุการณ์ → 200 พร้อม array ว่าง', async () => {
    const res = await request(app([]))
      .get('/api/events?month=2026-01')
      .set('Authorization', `Bearer ${maintenance}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('POST /api/events/:id/ack', () => {
  it('AC-002-01 · role manager กด ack → 403 ไม่ใช่ 404', async () => {
    const res = await request(app())
      .post('/api/events/9/ack')
      .set('Authorization', `Bearer ${manager}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('role maintenance กด ack ได้ และบันทึกว่าใครกด', async () => {
    const seen: string[] = [];
    const acked = eventRow({ acknowledged_by: 1, acknowledged_name: 'สมชาย', acknowledged_at: new Date() });
    const res = await request(app([acked], (sql) => seen.push(sql)))
      .post('/api/events/9/ack')
      .set('Authorization', `Bearer ${maintenance}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedBy).toBe(1);
    expect(seen.some((s) => s.trimStart().toUpperCase().startsWith('UPDATE'))).toBe(true);
  });

  it('ไม่มีเหตุการณ์ตาม id → 404', async () => {
    const res = await request(app([]))
      .post('/api/events/999/ack')
      .set('Authorization', `Bearer ${maintenance}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it('id ไม่ใช่ตัวเลข → 400', async () => {
    const res = await request(app())
      .post('/api/events/abc/ack')
      .set('Authorization', `Bearer ${maintenance}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
