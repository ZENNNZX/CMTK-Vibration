import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { createApp } from '../../src/app.js';

const up = { query: async () => ({ rows: [{ ok: 1 }] }) };
const down = {
  query: async () => {
    throw new Error('connection refused at 10.0.0.9:5432');
  },
};

describe('GET /api/health', () => {
  it('DB ตอบ → 200 รูปแบบ response ตาม SOP', async () => {
    const res = await request(createApp(up)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
  });

  it('DB ล่ม → 503 และห้าม echo err.message ออกไป (NFR-07)', async () => {
    const res = await request(createApp(down)).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });
});

describe('header ความปลอดภัย บนเว็บที่เสิร์ฟผ่าน http ธรรมดา (192.168.50.65:49180)', () => {
  it('ห้ามสั่งเบราว์เซอร์อัปเกรดเป็น https — ไม่มี TLS ไฟล์ JS/CSS จะโหลดไม่ขึ้น (ERR_SSL_PROTOCOL_ERROR)', async () => {
    const res = await request(createApp(up)).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('เส้นทางที่ไม่มีจริง', () => {
  it('→ 404 รูปแบบเดียวกับ error อื่น', async () => {
    const res = await request(createApp(up)).get('/api/no-such-thing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'ไม่พบเส้นทางที่เรียก' });
  });
});
