import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Dashboard } from './Dashboard';

const motor = (over = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  zone: 'B', vrmsY: 1.446, vrmsZ: 1.289, temperature: 47,
  lastMinuteTs: '2026-09-14T09:00:00.000Z', isOnline: true, ...over,
});
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Dashboard', () => {
  it('NFR-10 · ระหว่างรอ ต้องบอกว่ากำลังโหลด', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
  });

  it('แสดงค่าจริงของมอเตอร์ พร้อมหน่วยแยกจากตัวเลข', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor()] }));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(await screen.findByText('MOTOR-01')).toBeInTheDocument();
    expect(screen.getByText('1.45')).toBeInTheDocument();
    expect(screen.getByText('47.0')).toBeInTheDocument();
    expect(screen.getAllByText('mm/s')).toHaveLength(2);
  });

  it('AC-011-04 · เซ็นเซอร์หลุด ห้ามโชว์ค่าเก่าเป็นค่าปัจจุบัน', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor({ isOnline: false })] }));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(await screen.findByText('ไม่มีข้อมูลเข้ามา')).toBeInTheDocument();
    expect(screen.queryByText('1.45')).not.toBeInTheDocument();
  });

  it('NFR-09 · โซนบอกด้วยตัวอักษร ไม่ใช่แค่สี', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor()] }));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(await screen.findByRole('img', { name: /โซน B/ })).toBeInTheDocument();
  });

  it('AC-001-04 · token หมดอายุ → เด้งออก ไม่ค้างหน้าเปล่า', async () => {
    localStorage.setItem('cmtk.token', 'old');
    vi.stubGlobal('fetch', reply(401, { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }));
    const onSignedOut = vi.fn();
    render(<Dashboard onSignedOut={onSignedOut} />);
    await screen.findByRole('alert');
    expect(onSignedOut).toHaveBeenCalled();
    expect(localStorage.getItem('cmtk.token')).toBeNull();
  });
});
