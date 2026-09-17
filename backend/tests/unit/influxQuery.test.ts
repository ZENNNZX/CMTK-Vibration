import { describe, it, expect } from 'vitest';

import { pickWindow, buildFluxQuery, parseFluxCsv } from '../../src/repositories/influxQuery.js';

describe('pickWindow', () => {
  it('ช่วงสั้นได้ความละเอียดสูง ช่วงยาวถูกย่อ — จุดบนกราฟต้องอยู่ราว 300-600 เสมอ', () => {
    for (const hours of [1, 6, 24, 168, 720, 2160]) {
      const w = pickWindow(hours);
      const points = (hours * 3600) / w.seconds;
      expect(points).toBeGreaterThan(100);
      expect(points).toBeLessThan(1000);
    }
  });

  it('1 ชม. → หน้าต่างเล็กพอเห็นรายละเอียดจริง ไม่ใหญ่กว่า 1 นาที', () => {
    expect(pickWindow(1).seconds).toBeLessThanOrEqual(60);
  });

  it('คืนสตริงที่ Flux อ่านได้', () => {
    expect(pickWindow(24).flux).toMatch(/^\d+[smh]$/);
  });
});

describe('buildFluxQuery', () => {
  const q = buildFluxQuery({ bucket: 'vibration_expand', motorId: 3, hours: 24 });

  it('กรองด้วย motor_id ที่ขอ ไม่ดึงทั้ง bucket', () => {
    expect(q).toContain('r.motor_id == "3"');
    expect(q).toContain('from(bucket: "vibration_expand")');
    expect(q).toContain('range(start: -24h)');
  });

  it('ย่อด้วย aggregateWindow — ไม่ส่งจุดดิบเป็นแสนมาให้เบราว์เซอร์', () => {
    expect(q).toContain('aggregateWindow');
  });

  it('pivot ให้ทุก field อยู่แถวเดียวกัน หน้าเว็บจะได้ไม่ต้องจับคู่เอง', () => {
    expect(q).toContain('pivot');
  });

  it('bucket ที่มีอักขระพิเศษต้องไม่หลุดออกจาก string — กัน Flux injection', () => {
    expect(() => buildFluxQuery({ bucket: 'a"b', motorId: 1, hours: 1 })).toThrow();
    expect(() => buildFluxQuery({ bucket: 'ok', motorId: 1.5, hours: 1 })).toThrow();
  });
});

describe('parseFluxCsv', () => {
  const csv = [
    ',result,table,_start,_stop,_time,motor_id,tag,a_peak,temperature,vrms_y,vrms_z',
    ',_result,0,2026-09-17T00:00:00Z,2026-09-17T01:00:00Z,2026-09-17T00:05:00Z,3,MOTOR-03,0.19,48.5,1.21,0.94',
    ',_result,0,2026-09-17T00:00:00Z,2026-09-17T01:00:00Z,2026-09-17T00:10:00Z,3,MOTOR-03,,48.6,1.25,0.97',
  ].join('\n');

  it('แปลงเป็นรูปแบบเดียวกับที่ API เคยส่งจาก Postgres', () => {
    const rows = parseFluxCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      ts: '2026-09-17T00:05:00.000Z',
      vrmsY: 1.21,
      vrmsZ: 0.94,
      temperature: 48.5,
      aPeak: 0.19,
      zone: null,
    });
  });

  it('ช่องว่างใน CSV → null ไม่ใช่ 0 (0 แปลว่าเครื่องหยุด คนละเรื่องกับไม่มีข้อมูล)', () => {
    expect(parseFluxCsv(csv)[1].aPeak).toBeNull();
  });

  it('CSV ว่าง → array ว่าง ไม่ throw', () => {
    expect(parseFluxCsv('')).toEqual([]);
    expect(parseFluxCsv('\r\n\r\n')).toEqual([]);
  });

  it('เรียงตามเวลาจากเก่าไปใหม่ — กราฟวาดผิดทางถ้าสลับ', () => {
    const rows = parseFluxCsv(csv);
    expect(new Date(rows[0].ts).getTime()).toBeLessThan(new Date(rows[1].ts).getTime());
  });
});
