import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MonthlySummary } from './MonthlySummary';

const empty = { month: '2026-09', threshold: 2.8, overall: null, perMotor: [], hasData: false };
const filled = {
  month: '2026-09',
  threshold: 2.8,
  hasData: true,
  overall: { n: 40, tp: 10, fp: 5, fn: 5, tn: 20, accuracy: 0.75, precision: 0.667, recall: 0.5, f1: 0.571, mae: 0.12, mape: 5.4, reliable: true },
  perMotor: [{ motorId: 1, tag: 'MOTOR-01', metric: 'vrms_y', score: { n: 20, tp: 5, fp: 2, fn: 3, tn: 10, accuracy: 0.75, precision: 0.714, recall: 0.625, f1: 0.667, mae: 0.1, mape: 4.2, reliable: false } }],
};

const ok = (data: unknown) =>
  vi.fn(async (_url: string) => new Response(JSON.stringify({ success: true, data }), { status: 200 }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('MonthlySummary', () => {
  it('NFR-10 · ระหว่างรอ ต้องบอกว่ากำลังโหลด', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MonthlySummary />);
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
  });

  it('ยังไม่มีคู่ที่ให้คะแนนได้ → อธิบายว่าทำไม ไม่ใช่โชว์ 0%', async () => {
    vi.stubGlobal('fetch', ok(empty));
    render(<MonthlySummary />);
    expect(await screen.findByText(/ยังไม่มีการทำนายที่ตรวจสอบผลได้/)).toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('มีข้อมูลแล้ว → แสดง Accuracy / Precision / Recall / F1 และ MAE', async () => {
    vi.stubGlobal('fetch', ok(filled));
    render(<MonthlySummary />);
    // 75.0% โผล่ทั้งค่ารวมและรายมอเตอร์ — ตั้งใจให้เทียบกันได้ในหน้าเดียว
    expect((await screen.findAllByText('75.0%')).length).toBeGreaterThan(0);
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('0.120')).toBeInTheDocument();
  });

  it('เตือนว่าค่ารวมดูดีเกินจริง ให้ดูรายมอเตอร์ประกอบ', async () => {
    vi.stubGlobal('fetch', ok(filled));
    render(<MonthlySummary />);
    expect(await screen.findByText(/ดูตารางแยกรายมอเตอร์ประกอบเสมอ/)).toBeInTheDocument();
  });

  it('บอกว่าเป็นสถิติ ไม่ใช่ ML — อย่าทำให้ระบบดูฉลาดกว่าที่เป็น (DSN §7)', async () => {
    vi.stubGlobal('fetch', ok(filled));
    render(<MonthlySummary />);
    expect(await screen.findByText(/ยังไม่ใช่ ML/)).toBeInTheDocument();
  });

  it('ตัวอย่างน้อยกว่า 30 ในรายมอเตอร์ → ติดป้ายว่ายังเชื่อไม่ได้', async () => {
    vi.stubGlobal('fetch', ok(filled));
    render(<MonthlySummary />);
    expect(await screen.findByText(/ยังเชื่อไม่ได้/)).toBeInTheDocument();
  });
});
