import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App';

const motor = (over = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  zone: 'B', vrmsY: 1.44, vrmsZ: 1.28, temperature: 47,
  lastMinuteTs: '2026-09-14T09:00:00.000Z', isOnline: true, ...over,
});
const detail = {
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  ratedKw: 22, sensorMount: 'DE-H', warningThreshold: 2.8, alarmThreshold: 4.5,
  runHours: 1284.5, isOnline: true,
};

const api = vi.fn(async (url: string) => {
  const body = url.includes('/readings') ? [] : url.match(/\/motors\/\d+$/) ? detail : [motor()];
  return new Response(JSON.stringify({ success: true, data: body }), { status: 200 });
});

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('App', () => {
  it('ยังไม่ล็อกอิน → เห็นหน้า login ไม่ใช่ dashboard', () => {
    vi.stubGlobal('fetch', api);
    render(<App />);
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
  });

  it('DSN §0 · ล็อกอินแล้วมีแถบหัวติดบนพร้อมชื่อระบบ', async () => {
    localStorage.setItem('cmtk.token', 'ok');
    vi.stubGlobal('fetch', api);
    render(<App />);
    expect(await screen.findByRole('banner')).toHaveTextContent('Condition Monitoring');
  });

  it('US-006 · กดการ์ดมอเตอร์ → เข้าหน้ารายละเอียดของตัวนั้น', async () => {
    localStorage.setItem('cmtk.token', 'ok');
    vi.stubGlobal('fetch', api);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /ดูรายละเอียด MOTOR-01/ }));
    expect(await screen.findByRole('heading', { name: 'MOTOR-01' })).toBeInTheDocument();
    expect(screen.getByText(/master2 \/ port0/)).toBeInTheDocument();
  });

  it('กลับหน้ารวมได้ ไม่ค้างอยู่หน้ารายละเอียด', async () => {
    localStorage.setItem('cmtk.token', 'ok');
    vi.stubGlobal('fetch', api);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /ดูรายละเอียด MOTOR-01/ }));
    await userEvent.click(await screen.findByRole('button', { name: /กลับหน้ารวม/ }));
    expect(await screen.findByRole('heading', { name: 'สถานะมอเตอร์' })).toBeInTheDocument();
  });
});
