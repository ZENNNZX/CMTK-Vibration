import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    expect(await screen.findByRole('heading', { name: 'MOTOR-01' })).toBeInTheDocument();
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

  it('DSN §4 · port rail แสดงครบ 8 พอร์ต พอร์ตที่ไม่มีมอเตอร์บอกว่าว่าง', async () => {
    const two = [motor(), motor({ id: 2, tag: 'MOTOR-02', portNo: 1 })];
    vi.stubGlobal('fetch', reply(200, { success: true, data: two }));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(await screen.findByText(/ใช้งาน 2 จาก 8 พอร์ต/)).toBeInTheDocument();
    expect(screen.getAllByText('ว่าง')).toHaveLength(6);
  });

  it('DSN §4 · card-alert · โซน D ต้องมีป้ายเตือน ไม่ใช่แค่เปลี่ยนสีขอบ', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor({ zone: 'D' })] }));
    render(<Dashboard onSignedOut={() => {}} />);
    expect(await screen.findByText('Alarm')).toBeInTheDocument();
  });

  it('DSN §4 · โซน B ปกติ ไม่ต้องมีป้ายเตือน', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor()] }));
    render(<Dashboard onSignedOut={() => {}} />);
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(screen.queryByText(/^(Alarm|Warning)$/)).not.toBeInTheDocument();
  });

  it('US-006 · การ์ดกดได้ และส่ง id ของมอเตอร์ตัวที่กด', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: [motor({ id: 7 })] }));
    const onOpenMotor = vi.fn();
    render(<Dashboard onSignedOut={() => {}} onOpenMotor={onOpenMotor} />);
    await userEvent.click(await screen.findByRole('button', { name: /ดูรายละเอียด MOTOR-01/ }));
    expect(onOpenMotor).toHaveBeenCalledWith(7);
  });
});
