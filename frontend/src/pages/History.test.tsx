import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { History } from './History';

const ev = (over = {}) => ({
  id: 9, motorId: 3, tag: 'MOTOR-03', motorName: 'สายพานลำเลียง',
  kind: 'warning', metric: 'vibration',
  raisedAt: '2026-09-11T01:41:00.000Z', resolvedAt: null,
  value: 3.02, zoneFrom: 'B', zoneTo: 'C',
  acknowledgedBy: null, acknowledgedName: null, acknowledgedAt: null, ...over,
});

const ok = (data: unknown) =>
  vi.fn(async (_url: string) => new Response(JSON.stringify({ success: true, data }), { status: 200 }));

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const show = (role = 'maintenance') => render(<History role={role} />);

describe('History', () => {
  it('NFR-10 · ระหว่างรอ ต้องบอกว่ากำลังโหลด', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    show();
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
  });

  it('AC-012-01 · วันที่มีเหตุการณ์ต้องมีสัญลักษณ์ ไม่พึ่งสีอย่างเดียว', async () => {
    vi.stubGlobal('fetch', ok([ev()]));
    show();
    const day = await screen.findByRole('button', { name: /11 .* มี 1 เหตุการณ์/ });
    expect(within(day).getByText('◆')).toBeInTheDocument();
  });

  it('AC-012-03 · วันที่ไม่มีเหตุการณ์ กดไม่ได้', async () => {
    vi.stubGlobal('fetch', ok([ev()]));
    show();
    expect(await screen.findByRole('button', { name: /^12 .* ไม่มีเหตุการณ์/ })).toBeDisabled();
  });

  it('AC-012-02 · กดวันที่มีเหตุการณ์ → เห็นรายการของวันนั้น', async () => {
    vi.stubGlobal('fetch', ok([ev()]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: /11 .* มี 1 เหตุการณ์/ }));
    expect(screen.getByText('MOTOR-03')).toBeInTheDocument();
    expect(screen.getByText(/3\.02/)).toBeInTheDocument();
    expect(screen.getByText(/โซน B → C/)).toBeInTheDocument();
  });

  it('AC-012-04 · เปลี่ยนเดือนแล้วยิงคิวรีเดือนใหม่', async () => {
    const fetchMock = ok([ev()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('button', { name: /11 .* มี 1 เหตุการณ์/ });
    await userEvent.selectOptions(screen.getByLabelText('เดือน'), '2026-08');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("month=2026-08"))).toBe(true);
  });

  it('AC-002-01 · role manager กด ack ไม่ได้ และบอกเหตุผล', async () => {
    vi.stubGlobal('fetch', ok([ev()]));
    show('manager');
    await userEvent.click(await screen.findByRole('button', { name: /11 .* มี 1 เหตุการณ์/ }));
    expect(screen.queryByRole('button', { name: 'รับทราบ' })).not.toBeInTheDocument();
    expect(screen.getByText(/role manager กดไม่ได้/)).toBeInTheDocument();
  });

  it('role maintenance กด ack → ยิง POST แล้วแสดงชื่อคนที่รับทราบ', async () => {
    const acked = ev({ acknowledgedBy: 1, acknowledgedName: 'สมชาย', acknowledgedAt: '2026-09-11T02:00:00.000Z' });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const data = init?.method === 'POST' ? acked : [ev()];
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /11 .* มี 1 เหตุการณ์/ }));
    await userEvent.click(screen.getByRole('button', { name: 'รับทราบ' }));
    expect(await screen.findByText(/รับทราบโดย สมชาย/)).toBeInTheDocument();
  });

  it('เดือนที่ไม่มีเหตุการณ์ → บอกว่าไม่มี ไม่ใช่ปฏิทินเปล่าเงียบ ๆ', async () => {
    vi.stubGlobal('fetch', ok([]));
    show();
    expect(await screen.findByText(/ไม่มีเหตุการณ์แจ้งเตือน/)).toBeInTheDocument();
  });
});
