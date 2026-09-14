import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { createApp } from '../../src/app.js';

const SECRET = 'test-secret-ที่ยาวพอสำหรับการทดสอบเท่านั้น';
const HASH = bcrypt.hashSync('correct-horse', 10);

const USER = {
  id: 1,
  email: 'admin@gsbattery.co.th',
  password_hash: HASH,
  display_name: 'ผู้ดูแลระบบ',
  role: 'admin',
  is_active: true,
};

/** db ปลอม — คืน user ตาม email ที่ค้น ไม่ต้องมี PostgreSQL จริง */
function fakeDb(user: typeof USER | null = USER) {
  return {
    query: async (sql: string) =>
      sql.includes('FROM users') && !sql.startsWith('UPDATE')
        ? { rows: user ? [user] : [] }
        : { rows: [] },
  };
}

const app = (user?: typeof USER | null) =>
  createApp(fakeDb(user === undefined ? USER : user), { jwtSecret: SECRET });

const login = (body: unknown, user?: typeof USER | null) =>
  request(app(user)).post('/api/auth/login').send(body as object);

describe('AC-001-01 · credential ถูก', () => {
  it('ออก JWT พร้อมข้อมูลผู้ใช้ ไม่มี password_hash ติดออกไป', async () => {
    const res = await login({ email: USER.email, password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toMatch(/^ey/);
    expect(res.body.data.user).toEqual({
      id: 1,
      email: USER.email,
      displayName: 'ผู้ดูแลระบบ',
      role: 'admin',
    });
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });
});

describe('AC-001-02 · รหัสผิด ห้ามบอกว่า email มีจริงหรือไม่', () => {
  it('รหัสผิดกับ email ไม่มีในระบบ ต้องได้ข้อความและ status เหมือนกันเป๊ะ', async () => {
    const wrongPassword = await login({ email: USER.email, password: 'nope' });
    const noSuchUser = await login({ email: 'ghost@gsbattery.co.th', password: 'nope' }, null);

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(noSuchUser.body);
    expect(JSON.stringify(wrongPassword.body)).not.toMatch(/ไม่พบผู้ใช้|ไม่มี email|not found/i);
  });

  it('ผู้ใช้ที่ถูกปิดใช้งานก็ตอบเหมือนกัน', async () => {
    const res = await login({ email: USER.email, password: 'correct-horse' }, {
      ...USER,
      is_active: false,
    });
    expect(res.status).toBe(401);
  });
});

describe('AC-001-03 · เว้นว่าง', () => {
  it('ต้องบอกว่า field ไหนผิด', async () => {
    const res = await login({ email: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'email',
      'password',
    ]);
  });
});

describe('AC-001-04 · token หมดอายุ', () => {
  it('token ที่หมดอายุแล้วตอบ 401 ไม่ใช่ 500', async () => {
    const expired =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ sub: 1, role: 'admin', exp: 1 })).toString('base64url') +
      '.x';
    const res = await request(app()).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('AC-001-05 · ล็อกอินผิดถี่เกิน', () => {
  it('ผิดครบเพดานแล้วตอบ 429 แม้จะใส่รหัสถูกก็ตาม', async () => {
    const one = app();
    for (let i = 0; i < 5; i++) {
      await request(one).post('/api/auth/login').send({ email: USER.email, password: 'nope' });
    }
    const res = await request(one)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'correct-horse' });
    expect(res.status).toBe(429);
  });
});

describe('AC-002 · role', () => {
  let token: string;
  const one = app();

  beforeEach(async () => {
    const res = await request(one)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'correct-horse' });
    token = res.body.data?.token;
  });

  it('AC-002-04 · ไม่มี token → 401', async () => {
    expect((await request(one).get('/api/auth/me')).status).toBe(401);
  });

  it('AC-002-03 · admin เรียกได้', async () => {
    const res = await request(one).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('token ปลอมที่เซ็นด้วยกุญแจอื่น → 401', async () => {
    const other = await request(app())
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'correct-horse' });
    void other;
    const res = await request(one).get('/api/auth/me').set('Authorization', 'Bearer ey.fake.sig');
    expect(res.status).toBe(401);
  });

  it('logout ตอบ 200 (JWT ไม่มี state ฝั่งเซิร์ฟเวอร์)', async () => {
    const res = await request(one).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
