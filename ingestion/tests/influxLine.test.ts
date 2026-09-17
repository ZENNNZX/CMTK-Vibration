import { describe, it, expect } from 'vitest';

import { toLineProtocol, FIELD_MAP } from '../src/influxLine.js';

const at = new Date('2026-09-17T04:00:00.000Z');

describe('toLineProtocol', () => {
  it('แปลงค่าจาก payload เป็นบรรทัดเดียวพร้อม tag และ timestamp นาโนวินาที', () => {
    const line = toLineProtocol(
      { motorId: 3, tag: 'MOTOR-03', port: 2 },
      { Temperature: 48.5, 'Vibration Velocity, RMS Y': 0.7938 },
      at,
    );
    expect(line).toBe(
      'reading,motor_id=3,tag=MOTOR-03,port=2 temperature=48.5,vrms_y=0.7938 1789617600000000000',
    );
  });

  it('ชื่อ field จาก Balluff มีจุลภาคและช่องว่าง ต้องแปลงเป็นชื่อสั้นที่ปลอดภัย', () => {
    const line = toLineProtocol(
      { motorId: 1, tag: 'M1', port: 0 },
      { 'Vibration Acceleration, Peak Magnitude': 0.2717, 'Vibration Velocity, RMS Z': 1.2141 },
      at,
    );
    expect(line).toContain('a_peak=0.2717');
    expect(line).toContain('vrms_z=1.2141');
    // NFR-16 · จุลภาคในชื่อ field ของ Balluff ห้ามหลุดเข้า line protocol
    expect(line!.split(" ")[1]).not.toContain("Vibration");
  });

  it('field ที่ไม่รู้จัก → ข้ามไป ไม่ทำให้ทั้งบรรทัดพัง', () => {
    const line = toLineProtocol(
      { motorId: 1, tag: 'M1', port: 0 },
      { Temperature: 30, 'Something New From Firmware': 1 },
      at,
    );
    expect(line).toBe('reading,motor_id=1,tag=M1,port=0 temperature=30 1789617600000000000');
  });

  it('ไม่มี field ที่ใช้ได้เลย → คืน null ไม่ส่งบรรทัดว่างขึ้น InfluxDB', () => {
    expect(toLineProtocol({ motorId: 1, tag: 'M1', port: 0 }, { 'Severity Zone A': true }, at)).toBeNull();
  });

  it('ค่า boolean กับ null ไม่ถือเป็นตัวเลข ต้องไม่หลุดเข้า field', () => {
    const line = toLineProtocol(
      { motorId: 1, tag: 'M1', port: 0 },
      { Temperature: 30, 'Vibration Velocity, RMS Y': null as unknown as number },
      at,
    );
    expect(line).toBe('reading,motor_id=1,tag=M1,port=0 temperature=30 1789617600000000000');
  });

  it('tag ที่มีช่องว่างต้อง escape ตามกติกา line protocol', () => {
    const line = toLineProtocol({ motorId: 1, tag: 'PUMP 01', port: 0 }, { Temperature: 30 }, at);
    expect(line).toContain('tag=PUMP\\ 01');
  });

  it('NaN กับ Infinity ต้องไม่หลุดออกไป — InfluxDB ปฏิเสธทั้ง batch', () => {
    const line = toLineProtocol(
      { motorId: 1, tag: 'M1', port: 0 },
      { Temperature: NaN, 'Vibration Velocity, RMS Y': Infinity, 'Vibration Velocity, RMS Z': 1.5 },
      at,
    );
    expect(line).toBe('reading,motor_id=1,tag=M1,port=0 vrms_z=1.5 1789617600000000000');
  });
});

describe('FIELD_MAP', () => {
  it('ครอบชื่อที่บอร์ดส่งมาจริงครบทุกตัว', () => {
    for (const k of [
      'Temperature',
      'Vibration Velocity, RMS Y',
      'Vibration Velocity, RMS Z',
      'Vibration Acceleration, Peak Magnitude',
    ]) {
      expect(FIELD_MAP[k]).toBeTruthy();
    }
  });
});
