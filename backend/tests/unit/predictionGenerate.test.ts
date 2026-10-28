import { describe, it, expect } from 'vitest';

import { createPredictionRepository } from '../../src/repositories/predictionRepository.js';
import { createPredictionService } from '../../src/services/predictionService.js';

type Inserted = Parameters<ReturnType<typeof createPredictionRepository>['insert']>[0];

/**
 * ชุดข้อมูลที่ "วันหาย" — 1, 2, 3 ก.ย. แล้วข้ามไป 8 ก.ย.
 * ค่าเดินตรงตามวันจริงที่ 0.1 mm/s ต่อวัน เริ่มที่ 1.0
 * ถ้าโมเดลนับตามลำดับแถว (0,1,2,3) จะเห็นความชัน 0.213 แทนที่จะเป็น 0.1 — ชันเกินจริงเท่าตัว
 */
const GAPPED = [
  { day: '2026-09-01', avg: '1.0' },
  { day: '2026-09-02', avg: '1.1' },
  { day: '2026-09-03', avg: '1.2' },
  { day: '2026-09-08', avg: '1.7' },
];

const fakeRepo = (rows: { day: string; avg: string }[], out: Inserted[]) =>
  ({
    activeMotorIds: async () => [1],
    dailyAverages: async () => rows,
    insert: async (p: Inserted) => {
      out.push(p);
    },
  }) as unknown as ReturnType<typeof createPredictionRepository>;

describe('generate', () => {
  it('วันหายในชุดฟิต → ความชันยังเป็นต่อวันจริง ไม่ใช่ต่อแถว', async () => {
    const out: Inserted[] = [];
    const svc = createPredictionService(fakeRepo(GAPPED, out));

    // 8 ก.ย. 2026 เวลาไทยเที่ยงวัน — วันสุดท้ายที่มีข้อมูลพอดี
    await svc.generate(new Date('2026-09-08T05:00:00.000Z'));

    const vy = out.filter((p) => p.metric === 'vrms_y');
    expect(vy.map((p) => p.targetDay)).toEqual(['2026-09-09', '2026-09-11', '2026-09-15']);
    // เส้นจริงคือ 1.0 + 0.1 × (จำนวนวันจาก 1 ก.ย.) → 9 ก.ย. = 1.8 · 11 ก.ย. = 2.0 · 15 ก.ย. = 2.4
    expect(vy.map((p) => p.predictedValue)).toEqual([1.8, 2.0, 2.4]);
  });

  it('วันสุดท้ายที่มีข้อมูลไม่ใช่วันนี้ → ค่าทำนายยังอยู่บนแกนวันเดียวกัน', async () => {
    const out: Inserted[] = [];
    const svc = createPredictionService(fakeRepo(GAPPED, out));

    // ทำนายวันที่ 10 ก.ย. ทั้งที่ข้อมูลหยุดที่ 8 ก.ย. — ห่างจาก 1 ก.ย. 10 วัน
    await svc.generate(new Date('2026-09-10T05:00:00.000Z'));

    const first = out.find((p) => p.metric === 'vrms_y')!;
    expect(first.targetDay).toBe('2026-09-11');
    expect(first.predictedValue).toBe(2.0);
  });

  it('ไม่มีข้อมูลเลย → ไม่เขียนอะไรและไม่ระเบิด', async () => {
    const out: Inserted[] = [];
    const svc = createPredictionService(fakeRepo([], out));
    expect(await svc.generate(new Date('2026-09-08T05:00:00.000Z'))).toBe(0);
    expect(out).toHaveLength(0);
  });
});
