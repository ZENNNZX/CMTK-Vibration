import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const sign = (role: string) =>
  jwt.sign({ sub: 1, email: 'a@b.c', displayName: 'x', role }, SECRET);

const upcomingRow = (over: Record<string, unknown> = {}) => ({
  target_day: '2026-09-23',
  horizon_days: 1,
  predicted_value: '1.900',
  ci_low: '1.400',
  ci_high: '2.400',
  ...over,
});

/** เก็บ SQL กับพารามิเตอร์ที่ยิงจริง — เทสต์ต้องพิสูจน์ได้ว่า metric ที่ขอไปถึงคิวรี */
const spyDb = (rows: unknown[] = [upcomingRow()]) => {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    db: {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return { rows };
      },
    },
  };
};

describe('GET /api/predictions/motor/:id', () => {
  it('คืนค่าทำนายในรูปที่หน้าเว็บใช้ได้ ไม่ใช่ชื่อคอลัมน์ดิบ', async () => {
    const { db } = spyDb();
    const res = await request(createApp(db, { jwtSecret: SECRET }))
      .get('/api/predictions/motor/1')
      .set('Authorization', `Bearer ${sign('maintenance')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { targetDay: '2026-09-23', horizonDays: 1, predicted: 1.9, ciLow: 1.4, ciHigh: 2.4 },
    ]);
  });

  it('ไม่ส่ง metric → ใช้ vrms_y เป็นค่าตั้งต้น', async () => {
    const { db, calls } = spyDb();
    await request(createApp(db, { jwtSecret: SECRET }))
      .get('/api/predictions/motor/1')
      .set('Authorization', `Bearer ${sign('maintenance')}`);

    expect(calls.at(-1)!.params).toContain('vrms_y');
  });

  it('ขอ metric=vrms_z → ค่านั้นต้องไปถึงคิวรีจริง ไม่ใช่ถูกกลืน', async () => {
    const { db, calls } = spyDb();
    await request(createApp(db, { jwtSecret: SECRET }))
      .get('/api/predictions/motor/1?metric=vrms_z')
      .set('Authorization', `Bearer ${sign('maintenance')}`);

    expect(calls.at(-1)!.params).toContain('vrms_z');
  });

  it('metric ที่ไม่รู้จัก → 400 ตั้งแต่ชั้น validate ไม่ปล่อยลงไปถึง SQL', async () => {
    const { db, calls } = spyDb();
    const res = await request(createApp(db, { jwtSecret: SECRET }))
      .get('/api/predictions/motor/1?metric=DROP TABLE')
      .set('Authorization', `Bearer ${sign('maintenance')}`);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('ไม่มี token → 401', async () => {
    const { db } = spyDb();
    const res = await request(createApp(db, { jwtSecret: SECRET })).get('/api/predictions/motor/1');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/predictions/run', () => {
  it('role maintenance สั่งรันงานทำนายไม่ได้ → 403', async () => {
    const { db } = spyDb();
    const res = await request(createApp(db, { jwtSecret: SECRET }))
      .post('/api/predictions/run')
      .set('Authorization', `Bearer ${sign('maintenance')}`);

    expect(res.status).toBe(403);
  });
});
