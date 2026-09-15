import { describe, it, expect } from 'vitest';

import { fitLinear, score } from '../../src/services/predictionMath.js';

describe('fitLinear', () => {
  it('เส้นตรงชัดเจน → slope ตรงตามจริง', () => {
    const f = fitLinear([1, 2, 3, 4, 5].map((i) => ({ x: i, y: 2 * i + 1 })));
    expect(f!.slope).toBeCloseTo(2, 6);
    expect(f!.intercept).toBeCloseTo(1, 6);
    expect(f!.se).toBeCloseTo(0, 6);
  });

  it('จุดน้อยเกินไป → null ไม่ใช่เดาเอา', () => {
    expect(fitLinear([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBeNull();
  });

  it('ค่าคงที่ → slope 0 ไม่ใช่ NaN', () => {
    const f = fitLinear([1, 2, 3, 4].map((i) => ({ x: i, y: 5 })));
    expect(f!.slope).toBe(0);
  });
});

describe('score', () => {
  const rows = (pairs: [number, number][]) =>
    pairs.map(([predicted, actual]) => ({ predicted, actual }));

  it('ยังไม่มีคู่ที่ให้คะแนนได้ → null ไม่ใช่ 0% ที่ดูเหมือนแย่', () => {
    expect(score([], 2.8)).toBeNull();
  });

  it('นับ TP FP FN TN ตามเกณฑ์ที่กำหนด', () => {
    const s = score(rows([[3, 3], [3, 2], [2, 3], [1, 1]]), 2.8)!;
    expect(s).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1, n: 4 });
    expect(s.accuracy).toBeCloseTo(0.5, 6);
    expect(s.precision).toBeCloseTo(0.5, 6);
    expect(s.recall).toBeCloseTo(0.5, 6);
    expect(s.f1).toBeCloseTo(0.5, 6);
  });

  it('ไม่เคยทำนายว่าจะเกินเลย → precision เป็น null ไม่ใช่ 0', () => {
    const s = score(rows([[1, 1], [1, 3]]), 2.8)!;
    expect(s.precision).toBeNull();
    expect(s.f1).toBeNull();
    expect(s.recall).toBe(0);
  });

  it('MAE กับ MAPE คิดจากค่าจริงทุกคู่', () => {
    const s = score(rows([[2, 1], [4, 5]]), 2.8)!;
    expect(s.mae).toBeCloseTo(1, 6);
    expect(s.mape).toBeCloseTo(((1 / 1 + 1 / 5) / 2) * 100, 6);
  });

  it('ตัวอย่างน้อยกว่า 30 → บอกว่ายังเชื่อไม่ได้', () => {
    expect(score(rows([[3, 3]]), 2.8)!.reliable).toBe(false);
  });
});
