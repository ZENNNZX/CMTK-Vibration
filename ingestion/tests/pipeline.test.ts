import { describe, it, expect } from 'vitest';
import { Aggregator, zoneOf } from '../src/aggregator.js';
import { EdgeDetector } from '../src/edgeDetector.js';
import { FIELD, type DeviceData } from '../src/schema.js';

type Items = DeviceData['data']['items'];

function msg(over: Partial<Items> = {}, isValid = true): DeviceData {
  return {
    type: 'dataFromDevice',
    timestamp: '2026-09-11T08:41:42.726Z',
    data: {
      isValid,
      items: {
        [FIELD.temperature]: 50.1,
        [FIELD.vrmsY]: 1.41,
        [FIELD.vrmsZ]: 1.32,
        [FIELD.preAlarm]: false,
        [FIELD.mainAlarm]: false,
        [FIELD.tempHigh]: false,
        [FIELD.tempLow]: false,
        [FIELD.zoneA]: false,
        [FIELD.zoneB]: true,
        [FIELD.zoneC]: false,
        [FIELD.zoneD]: false,
        ...over,
      },
    },
  };
}

const at = (iso: string) => new Date(iso);

describe('zoneOf · AC-008-07', () => {
  it('bit เดียวเป็น true → คืนโซนนั้น', () => {
    expect(zoneOf(msg().data.items)).toBe('B');
  });

  it('หลาย bit เป็น true → คืน null ไม่เดา', () => {
    expect(zoneOf(msg({ [FIELD.zoneB]: true, [FIELD.zoneC]: true }).data.items)).toBeNull();
  });

  it('ไม่มี bit ไหนเป็น true → คืน null', () => {
    expect(zoneOf(msg({ [FIELD.zoneB]: false }).data.items)).toBeNull();
  });
});

describe('Aggregator', () => {
  it('AC-004-02 · สรุปเป็น 1 แถวต่อนาที พร้อม min/avg/max', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:00Z'), msg({ [FIELD.vrmsY]: 1.0 }));
    agg.add(1, at('2026-09-11T08:41:30Z'), msg({ [FIELD.vrmsY]: 2.0 }));
    agg.add(1, at('2026-09-11T08:41:59Z'), msg({ [FIELD.vrmsY]: 3.0 }));

    const rows = agg.flush(at('2026-09-11T08:42:10Z'));
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.vrmsYMin).toBe(1);
    expect(r.vrmsYAvg).toBe(2);
    expect(r.vrmsYMax).toBe(3);
    expect(r.sampleCount).toBe(3);
    expect(r.zone).toBe('B');
  });

  it('ไม่ flush นาทีที่ยังเปิดอยู่', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:10Z'), msg());
    expect(agg.flush(at('2026-09-11T08:41:40Z'))).toHaveLength(0);
    expect(agg.pending).toBe(1);
  });

  it('AC-004-05 · isValid=false นับไว้แต่ไม่เอาค่าไปคำนวณ', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:10Z'), msg({ [FIELD.vrmsY]: 2.0 }));
    agg.add(1, at('2026-09-11T08:41:20Z'), msg({ [FIELD.vrmsY]: 999 }, false));

    const r = agg.flush(at('2026-09-11T08:42:00Z'))[0]!;
    expect(r.sampleCount).toBe(2);
    expect(r.invalidCount).toBe(1);
    expect(r.vrmsYMax).toBe(2); // 999 ต้องไม่หลุดเข้ามา
  });

  it('NFR-05 · sample ขาดแล้วยังทำงานได้ แต่ sampleCount บอกความจริง', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:10Z'), msg());
    const r = agg.flush(at('2026-09-11T08:42:00Z'))[0]!;
    expect(r.sampleCount).toBe(1); // ควรได้ 120 ที่ 0.5 วิ → UI ต้องแสดงว่าข้อมูลขาด
  });

  it('field ที่หายไปให้คอลัมน์เป็น null ไม่ใช่ 0', () => {
    const agg = new Aggregator();
    const partial = msg();
    delete partial.data.items[FIELD.vrmsZ];
    agg.add(1, at('2026-09-11T08:41:10Z'), partial);
    const r = agg.flush(at('2026-09-11T08:42:00Z'))[0]!;
    expect(r.vrmsZAvg).toBeNull();
    expect(r.vrmsYAvg).not.toBeNull();
  });

  it('แยกถังตามมอเตอร์', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:10Z'), msg());
    agg.add(2, at('2026-09-11T08:41:10Z'), msg());
    expect(agg.flush(at('2026-09-11T08:42:00Z'))).toHaveLength(2);
  });

  it('drain เอาของค้างออกตอน shutdown — ข้อมูลไม่หาย', () => {
    const agg = new Aggregator();
    agg.add(1, at('2026-09-11T08:41:10Z'), msg());
    expect(agg.drain()).toHaveLength(1);
    expect(agg.pending).toBe(0);
  });
});

describe('EdgeDetector · AC-008', () => {
  it('AC-008-03 · bit ค้าง true → สร้าง event ครั้งเดียว', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');

    expect(det.feed(1, msg(), t)).toHaveLength(0);

    const rise = det.feed(1, msg({ [FIELD.mainAlarm]: true }), t);
    expect(rise).toHaveLength(1);
    expect(rise[0]).toMatchObject({ kind: 'alarm', edge: 'rise' });

    // ← ข้อที่พลาดกันบ่อยที่สุด ถ้าพลาด LINE จะยิงทุก 0.5 วินาที
    expect(det.feed(1, msg({ [FIELD.mainAlarm]: true }), t)).toHaveLength(0);
    expect(det.feed(1, msg({ [FIELD.mainAlarm]: true }), t)).toHaveLength(0);
  });

  it('AC-008-04 · กลับเป็น false → ปิด event', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');
    det.feed(1, msg(), t);
    det.feed(1, msg({ [FIELD.mainAlarm]: true }), t);

    const fall = det.feed(1, msg({ [FIELD.mainAlarm]: false }), t);
    expect(fall).toHaveLength(1);
    expect(fall[0]).toMatchObject({ kind: 'alarm', edge: 'fall' });
  });

  it('AC-008-05 · อุณหภูมิเป็น event คนละอันกับการสั่น', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');
    det.feed(1, msg(), t);
    const out = det.feed(1, msg({ [FIELD.tempHigh]: true }), t);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ metric: 'temperature', kind: 'warning' });
  });

  it('AC-008-06 · เปลี่ยนโซนบันทึกไว้ แต่ไม่ใช่ alarm', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');
    det.feed(1, msg(), t);
    const out = det.feed(1, msg({ [FIELD.zoneB]: false, [FIELD.zoneC]: true }), t);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'zone_change', zoneFrom: 'B', zoneTo: 'C' });
  });

  it('เปิดมาแล้ว alarm อยู่แล้ว → ต้องแจ้ง ไม่ใช่เงียบ', () => {
    const det = new EdgeDetector();
    const out = det.feed(1, msg({ [FIELD.mainAlarm]: true }), at('2026-09-11T08:00:00Z'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'alarm', edge: 'rise' });
  });

  it('isValid=false ไม่ทำให้สถานะเปลี่ยน', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');
    det.feed(1, msg(), t);
    expect(det.feed(1, msg({ [FIELD.mainAlarm]: true }, false), t)).toHaveLength(0);
  });

  it('AC-011-01 · DISCONNECTED สร้าง event · CONNECTED ปิด', () => {
    const det = new EdgeDetector();
    const t = at('2026-09-11T08:00:00Z');
    det.feed(1, msg(), t);

    const down = det.feedPortEvent(1, 'DISCONNECTED', t);
    expect(down[0]).toMatchObject({ kind: 'offline', edge: 'rise' });

    expect(det.feedPortEvent(1, 'DISCONNECTED', t)).toHaveLength(0); // ซ้ำไม่สร้างใหม่

    const up = det.feedPortEvent(1, 'CONNECTED', t);
    expect(up[0]).toMatchObject({ kind: 'offline', edge: 'fall' });
  });

  it('AC-011-03 · เงียบเกินกำหนดถือว่าหลุด แม้ไม่มี event (QoS 0)', () => {
    const det = new EdgeDetector();
    const now = at('2026-09-11T08:10:00Z');
    det.feed(1, msg(), at('2026-09-11T08:00:00Z'));

    const seen = new Map([[1, at('2026-09-11T08:00:00Z')]]);
    const stale = det.checkStale(seen, now, 300);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ kind: 'offline', edge: 'rise' });

    expect(det.checkStale(seen, now, 300)).toHaveLength(0); // ไม่ซ้ำ
  });
});
