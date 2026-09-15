/**
 * คณิตล้วน ไม่มี I/O — แยกไว้ให้เทสต์ยิงตรงได้โดยไม่ต้องมี DB
 * ตัวเลขทุกตัวที่หน้าสรุปรายเดือนแสดงมาจากที่นี่
 */

export interface Fit {
  slope: number;
  intercept: number;
  se: number;
  n: number;
}

/** ต้องมีอย่างน้อย 4 จุดถึงจะฟิต — น้อยกว่านั้น se ไม่มีความหมาย (หาร n-2) */
const MIN_POINTS = 4;

export function fitLinear(points: { x: number; y: number }[]): Fit | null {
  const n = points.length;
  if (n < MIN_POINTS) return null;

  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  // x ทุกตัวเท่ากัน → ไม่มีความชันให้หา คืน 0 ไม่ใช่ NaN
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const se = Math.sqrt(
    points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0) / Math.max(1, n - 2),
  );
  return { slope, intercept, se, n };
}

export interface Score {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  accuracy: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  mae: number;
  mape: number;
  reliable: boolean;
}

/** ต่ำกว่านี้การเปลี่ยนผลครั้งเดียวขยับตัวเลขเกิน 3% — ยังใช้ตัดสินใจไม่ได้ */
const RELIABLE_N = 30;

/**
 * แปลงค่าที่ทำนายกับค่าจริงเป็นคำถาม "จะเกินเกณฑ์ไหม" แล้วนับผล
 * หารด้วยศูนย์ไม่ได้ → คืน null ไม่ใช่ 0 · 0% แปลว่า "ทำนายแล้วผิดหมด"
 * ซึ่งคนละเรื่องกับ "ไม่เคยทำนายว่าจะเกินเลย"
 */
export function score(
  rows: { predicted: number; actual: number }[],
  threshold: number,
): Score | null {
  const n = rows.length;
  if (n === 0) return null;

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let absErr = 0;
  let pctErr = 0;

  for (const { predicted, actual } of rows) {
    const p = predicted >= threshold;
    const a = actual >= threshold;
    if (p && a) tp++;
    else if (p && !a) fp++;
    else if (!p && a) fn++;
    else tn++;
    absErr += Math.abs(predicted - actual);
    pctErr += Math.abs(predicted - actual) / Math.max(Math.abs(actual), 1e-6);
  }

  const div = (x: number, y: number) => (y > 0 ? x / y : null);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);

  return {
    n,
    tp,
    fp,
    fn,
    tn,
    accuracy: (tp + tn) / n,
    precision,
    recall,
    f1:
      precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null,
    mae: absErr / n,
    mape: (pctErr / n) * 100,
    reliable: n >= RELIABLE_N,
  };
}
