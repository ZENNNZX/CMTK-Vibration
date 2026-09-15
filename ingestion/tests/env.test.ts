import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@db:5432/cmtk_monitoring',
  MQTT_URL: 'mqtt://172.16.0.2:1883',
  MQTT_USER: 'user',
  MQTT_PASSWORD: 'secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'token',
};

describe('loadEnv', () => {
  it('ค่าครบ → ผ่าน พร้อมค่า default', () => {
    const env = loadEnv(BASE);
    expect(env.AGGREGATE_WINDOW_SECONDS).toBe(60);
    expect(env.STALE_THRESHOLD_SECONDS).toBe(300);
    expect(env.LINE_RECIPIENT_COUNT).toBe(5);
    expect(env.LINE_MONTHLY_RESERVE).toBe(150);
  });

  it('ขาดตัวแปร → ตายทันทีพร้อมบอกชื่อ', () => {
    const { DATABASE_URL, ...rest } = BASE;
    void DATABASE_URL;
    expect(() => loadEnv(rest)).toThrowError(/DATABASE_URL/);
  });

  it('URL ผิดรูปแบบ → ปฏิเสธ', () => {
    expect(() => loadEnv({ ...BASE, DATABASE_URL: 'ไม่ใช่ url' })).toThrowError(/DATABASE_URL/);
  });

  it('เปิด LINE แต่ไม่มี token → ตาย ไม่ปล่อยผ่าน', () => {
    const { LINE_CHANNEL_ACCESS_TOKEN, ...rest } = BASE;
    void LINE_CHANNEL_ACCESS_TOKEN;
    expect(() => loadEnv(rest)).toThrowError(/LINE_CHANNEL_ACCESS_TOKEN/);
  });

  it('ปิด LINE แล้วไม่ต้องมี token', () => {
    const { LINE_CHANNEL_ACCESS_TOKEN, ...rest } = BASE;
    void LINE_CHANNEL_ACCESS_TOKEN;
    expect(() => loadEnv({ ...rest, LINE_ENABLED: 'false' })).not.toThrow();
  });

  it('ตัวเลขจาก string ถูกแปลงให้', () => {
    const env = loadEnv({ ...BASE, LINE_DAILY_CAP_PER_MOTOR: '5' });
    expect(env.LINE_DAILY_CAP_PER_MOTOR).toBe(5);
    expect(typeof env.LINE_DAILY_CAP_PER_MOTOR).toBe('number');
  });

  it('ค่าติดลบหรือศูนย์ถูกปฏิเสธ', () => {
    expect(() => loadEnv({ ...BASE, AGGREGATE_WINDOW_SECONDS: '0' })).toThrowError();
    expect(() => loadEnv({ ...BASE, DB_POOL_MAX: '-1' })).toThrowError();
  });
});

describe('SENSOR_CLOCK_OFFSET_MINUTES', () => {
  it('ไม่ตั้งค่า → 0 ไม่แก้เวลาที่บอร์ดส่งมา', () => {
    expect(loadEnv(BASE).SENSOR_CLOCK_OFFSET_MINUTES).toBe(0);
  });

  it('รับค่าติดลบได้ — บอร์ด CMTK ส่งเวลาไทยแต่ติดป้าย Z ต้องถอย 7 ชม.', () => {
    expect(loadEnv({ ...BASE, SENSOR_CLOCK_OFFSET_MINUTES: '-420' }).SENSOR_CLOCK_OFFSET_MINUTES).toBe(-420);
  });

  it('เกินหนึ่งวัน → ไม่ให้บูต เพราะนั่นคือพิมพ์ผิด ไม่ใช่การปรับนาฬิกา', () => {
    expect(() => loadEnv({ ...BASE, SENSOR_CLOCK_OFFSET_MINUTES: '5000' })).toThrow();
  });
});
