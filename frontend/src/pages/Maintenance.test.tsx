import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Maintenance } from './Maintenance';

const motor = { id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1' };
const log = (over = {}) => ({
  id: 5, motorId: 1, tag: 'MOTOR-01', motorName: 'ปั๊มน้ำ 1',
  alarmEventId: null, cause: 'bearing', description: 'เปลี่ยนแบริ่ง DE',
  performedBy: 1, performedName: 'สมชาย',
  performedAt: '2026-09-12T02:00:00.000Z', resetRunHours: false, ...over,
});

const routes = (logs: unknown[] = []) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true, data: log() }), { status: 201 });
    }
    const data = url.includes('/maintenance') ? logs : [motor];
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  });

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Maintenance', () => {
  it('NFR-10 · ระหว่างรอ ต้องบอกว่ากำลังโหลด', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<Maintenance role="maintenance" />);
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
  });

  it('AC-014-02 · ยังไม่เลือกสาเหตุ → กดบันทึกแล้วเตือน ไม่ยิง POST', async () => {
    const fetchMock = routes();
    vi.stubGlobal('fetch', fetchMock);
    render(<Maintenance role="maintenance" />);
    await userEvent.click(await screen.findByRole('button', { name: 'บันทึกงานซ่อม' }));
    expect(screen.getByRole('alert')).toHaveTextContent('เลือกสาเหตุ');
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'POST')).toBe(false);
  });

  it('เลือกสาเหตุแล้วบันทึกได้ → ยิง POST แล้วรายการเพิ่มขึ้น', async () => {
    const fetchMock = routes();
    vi.stubGlobal('fetch', fetchMock);
    render(<Maintenance role="maintenance" />);
    await userEvent.click(await screen.findByRole('button', { name: 'bearing' }));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกงานซ่อม' }));
    expect(await screen.findByText(/เปลี่ยนแบริ่ง DE/)).toBeInTheDocument();
  });

  it('AC-002-01 · role manager บันทึกไม่ได้ — ไม่มีฟอร์มให้กรอก', async () => {
    vi.stubGlobal('fetch', routes([log()]));
    render(<Maintenance role="manager" />);
    await screen.findByText(/เปลี่ยนแบริ่ง DE/);
    expect(screen.queryByRole('button', { name: 'บันทึกงานซ่อม' })).not.toBeInTheDocument();
    expect(screen.getByText(/role manager บันทึกไม่ได้/)).toBeInTheDocument();
  });

  it('ยังไม่มีประวัติซ่อม → บอกให้รู้ ไม่ใช่ตารางเปล่า', async () => {
    vi.stubGlobal('fetch', routes([]));
    render(<Maintenance role="maintenance" />);
    expect(await screen.findByText(/ยังไม่มีประวัติงานซ่อม/)).toBeInTheDocument();
  });

  it('อธิบายว่าทำไมต้องกรอกสาเหตุ — ไม่งั้นทุกคนจะเลือก other', async () => {
    vi.stubGlobal('fetch', routes([]));
    render(<Maintenance role="maintenance" />);
    expect(await screen.findByText(/ย้อนกลับไปสร้างทีหลังไม่ได้/)).toBeInTheDocument();
  });
});
