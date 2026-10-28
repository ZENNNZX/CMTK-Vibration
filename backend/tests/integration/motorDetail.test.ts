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

describe('GET /api/motors/:id/readings · ดึงจาก InfluxDB', () => {
  const influxRow = { ts: '2026-09-17T04:00:00.000Z', vrmsY: 1.4, vrmsZ: 1.2, temperature: 48.3, aPeak: 0.27, zone: null };
  const withInflux = (influx: {
    listReadings: (id: number, start: Date, stop: Date) => Promise<unknown[]>;
  }) => createApp(db([motorRow()], [readingRow()]), { jwtSecret: SECRET, influx });

  it('มี InfluxDB → ใช้ค่าจาก InfluxDB และส่ง aPeak ออกไปด้วย', async () => {
    const app2 = withInflux({ listReadings: async () => [influxRow] });
    const res = await auth(request(app2).get('/api/motors/1/readings?hours=1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ vrmsY: 1.4, aPeak: 0.27 });
  });

  it('hours=72 → แปลงเป็นช่วงเวลายาว 72 ชม. นับถอยจากตอนนี้', async () => {
    const seen: { start: Date; stop: Date }[] = [];
    const app2 = withInflux({
      listReadings: async (_id, start, stop) => {
        seen.push({ start, stop });
        return [influxRow];
      },
    });
    await auth(request(app2).get('/api/motors/1/readings?hours=72'));
    expect(seen).toHaveLength(1);
    const spanHours = (seen[0].stop.getTime() - seen[0].start.getTime()) / 3_600_000;
    expect(spanHours).toBeCloseTo(72, 2);
  });

  it('เลือกวันที่เอง → ส่ง from/to ต่อไปให้ InfluxDB ตรง ๆ ไม่แปลงเป็น hours', async () => {
    const seen: { start: Date; stop: Date }[] = [];
    const app2 = withInflux({
      listReadings: async (_id, start, stop) => {
        seen.push({ start, stop });
        return [influxRow];
      },
    });
    await auth(
      request(app2).get(
        '/api/motors/1/readings?from=2026-09-18T00:00:00%2B07:00&to=2026-10-20T23:59:59%2B07:00',
      ),
    );
    expect(seen[0].start.toISOString()).toBe('2026-09-17T17:00:00.000Z');
    expect(seen[0].stop.toISOString()).toBe('2026-10-20T16:59:59.000Z');
  });

  it('ส่ง from มาข้างเดียว → 400 ไม่เดาปลายอีกข้างให้', async () => {
    const res = await auth(request(app()).get('/api/motors/1/readings?from=2026-09-18'));
    expect(res.status).toBe(400);
  });

  it('วันที่สิ้นสุดอยู่ก่อนวันที่เริ่ม → 400', async () => {
    const res = await auth(
      request(app()).get('/api/motors/1/readings?from=2026-10-20&to=2026-09-18'),
    );
    expect(res.status).toBe(400);
  });

  it('ช่วงยาวเกิน 90 วัน → 400 ไม่ปล่อยให้คิวรีทะลุเพดาน AC-007-02', async () => {
    const res = await auth(
      request(app()).get('/api/motors/1/readings?from=2026-01-01&to=2026-09-18'),
    );
    expect(res.status).toBe(400);
  });

  it('InfluxDB ล่ม → ถอยไปใช้ readings_minute ของ Postgres ไม่ใช่พังทั้งหน้า', async () => {
    const app2 = withInflux({
      listReadings: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    const res = await auth(request(app2).get('/api/motors/1/readings?hours=1'));
    expect(res.status).toBe(200);
    // ค่าจาก readingRow() ของ Postgres
    expect(res.body.data[0]).toMatchObject({ vrmsY: 1.446, vrmsZ: 1.289 });
  });

  it('ไม่ตั้งค่า InfluxDB เลย → ใช้ Postgres เหมือนเดิม ไม่ต้องแก้อะไร', async () => {
    const res = await auth(request(app([motorRow()], [readingRow()])).get('/api/motors/1/readings'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ vrmsY: 1.446 });
  });

  it('ไม่มีมอเตอร์ตาม id → 404 ก่อนจะไปแตะ InfluxDB', async () => {
    let called = false;
    const app2 = createApp(db([], []), {
      jwtSecret: SECRET,
      influx: {
        listReadings: async () => {
          called = true;
          return [];
        },
      },
    });
    const res = await auth(request(app2).get('/api/motors/9/readings'));
    expect(res.status).toBe(404);
    expect(called).toBe(false);
  });
});
