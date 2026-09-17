import { describe, it, expect } from 'vitest';
import { parseMessage, parseTopic, sensorTime, unknownNumericFields, FIELD } from '../src/schema.js';

/** payload จริงจาก master2/port0 · 2026-09-11 */
const REAL_DATA = JSON.stringify({
  data: {
    isValid: true,
    items: {
      'Lower Alarm Contact Temperature': false,
      'Main Alarm Vibration Velocity, RMS': false,
      'Pre-Alarm Vibration Velocity, RMS': false,
      'Severity Zone A': false,
      'Severity Zone B': true,
      'Severity Zone C': false,
      'Severity Zone D': false,
      Temperature: 50.099998474121094,
      'Upper Alarm Contact Temperature': false,
      'Vibration Velocity, RMS Y': 1.410402774810791,
      'Vibration Velocity, RMS Z': 1.3166662454605103,
    },
  },
  timestamp: '2026-09-11T08:41:42.726858375Z',
  type: 'dataFromDevice',
});

const REAL_PORT_EVENT = JSON.stringify({
  data: { deviceId: 917768, event: 'CONNECTED', vendorId: 888 },
  origin: 'IOLINK',
  timestamp: '2026-09-07T08:21:59.454821375Z',
  type: 'iolinkPortEvent',
});

const REAL_UNITS = JSON.stringify({
  data: {
    Temperature: '°C',
    'Vibration Velocity, RMS Y': 'mm/s',
    'Vibration Velocity, RMS Z': 'mm/s',
  },
  timestamp: '2026-09-07T08:22:00.883012875Z',
  type: 'unitsFromDevice',
});

describe('parseMessage', () => {
  it('อ่าน payload จริงของ dataFromDevice ได้', () => {
    const r = parseMessage(REAL_DATA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.type).toBe('dataFromDevice');
    if (r.message.type !== 'dataFromDevice') return;
    expect(r.message.data.items[FIELD.vrmsY]).toBeCloseTo(1.4104, 4);
    expect(r.message.data.items[FIELD.zoneB]).toBe(true);
  });

  it('อ่าน iolinkPortEvent และ unitsFromDevice ได้', () => {
    expect(parseMessage(REAL_PORT_EVENT).ok).toBe(true);
    expect(parseMessage(REAL_UNITS).ok).toBe(true);
  });

  it('AC-004-06 · type ที่ไม่รู้จักถูกข้าม ไม่ throw', () => {
    const future = JSON.stringify({ type: 'somethingBalluffAddsLater', data: {} });
    const r = parseMessage(future);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unknown_type');
  });

  it('AC-004-04 · JSON พังถูกปฏิเสธ ไม่ throw', () => {
    const r = parseMessage('{ ไม่ใช่ json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid_json');
  });

  it('AC-004-04 · ชนิดข้อมูลผิดถูกปฏิเสธ', () => {
    const bad = JSON.stringify({
      type: 'dataFromDevice',
      timestamp: '2026-09-11T08:41:42Z',
      data: { isValid: true, items: { Temperature: 'ร้อนมาก' } },
    });
    const r = parseMessage(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('schema_error');
  });

  it('field หายไปบางตัวยังผ่าน — Data selector เปลี่ยนได้', () => {
    const partial = JSON.stringify({
      type: 'dataFromDevice',
      timestamp: '2026-09-11T08:41:42Z',
      data: { isValid: true, items: { Temperature: 50.1 } },
    });
    expect(parseMessage(partial).ok).toBe(true);
  });
});

describe('parseTopic', () => {
  it('แยก master กับ port ได้', () => {
    expect(parseTopic('balluff/cmtk/master2/iolink/devices/port0/data/fromdevice')).toEqual({
      master: 2,
      port: 0,
      leaf: 'data',
    });
    expect(parseTopic('balluff/cmtk/master2/iolink/devices/port3/events')).toEqual({
      master: 2,
      port: 3,
      leaf: 'events',
    });
  });

  it('topic ที่ไม่เข้าแบบคืน null', () => {
    expect(parseTopic('balluff/cmtk/master2/iolink/devices/events')).toBeNull();
    expect(parseTopic('random/topic')).toBeNull();
  });
});

describe('sensorTime', () => {
  it('offset 0 → ได้เวลาเดิมเป๊ะ', () => {
    expect(sensorTime('2026-09-15T12:53:45.439Z', 0).toISOString()).toBe('2026-09-15T12:53:45.439Z');
  });

  it('บอร์ด CMTK ส่งเวลาไทยแต่ติดป้าย Z → ถอย 420 นาทีได้ UTC จริง', () => {
    expect(sensorTime('2026-09-15T12:53:45.439Z', -420).toISOString()).toBe('2026-09-15T05:53:45.439Z');
  });

  it('ข้ามวันแล้วต้องถอยวันที่ให้ถูก ไม่ใช่แค่ลบชั่วโมง', () => {
    expect(sensorTime('2026-09-15T03:00:00.000Z', -420).toISOString()).toBe('2026-09-14T20:00:00.000Z');
  });
});

describe('field ที่เพิ่มจาก monitoring function ใหม่', () => {
  const payload = (items: Record<string, unknown>) =>
    JSON.stringify({
      type: 'dataFromDevice',
      timestamp: '2026-09-17T11:20:34.229083625Z',
      data: { isValid: true, items },
    });

  it('a-Peak ต้องผ่าน Zod ไม่ถูกตัดทิ้ง', () => {
    const r = parseMessage(Buffer.from(payload({ 'Vibration Acceleration, Peak Magnitude': 0.27 })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.message as unknown as { data: { items: Record<string, number> } }).data.items).toHaveProperty(
      'Vibration Acceleration, Peak Magnitude',
      0.27,
    );
  });

  it('a-RMS ต้องผ่านด้วย — ใช้คู่กับ a-Peak คำนวณ crest factor', () => {
    const r = parseMessage(Buffer.from(payload({ 'Vibration Acceleration, RMS Magnitude': 0.08 })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.message as unknown as { data: { items: Record<string, number> } }).data.items).toHaveProperty(
      'Vibration Acceleration, RMS Magnitude',
      0.08,
    );
  });

  it('unknownNumericFields บอกชื่อ field ที่ยังไม่รู้จัก — กันโดนตัดเงียบเหมือน a-Peak', () => {
    expect(unknownNumericFields({ Temperature: 30, 'Brand New Metric': 1.5 })).toEqual([
      'Brand New Metric',
    ]);
    expect(unknownNumericFields({ Temperature: 30, 'Severity Zone A': true })).toEqual([]);
  });
});
