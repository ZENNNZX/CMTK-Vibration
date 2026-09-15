import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Admin } from './Admin';

const motor = (over = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  zone: 'B', vrmsY: 1.44, vrmsZ: 1.28, temperature: 47,
  lastMinuteTs: '2026-09-14T09:00:00.000Z', isOnline: true,
  ratedKw: 22, sensorMount: 'DE-H', ...over,
});

const ok = (data: unknown) =>
  vi.fn(async (_url: string) => new Response(JSON.stringify({ success: true, data }), { status: 200 }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('Admin', () => {
  it('AC-002-02 · ไม่ใช่ admin → บอกว่าเข้าไม่ได้ ไม่ยิง API ทิ้ง', () => {
    const fetchMock = ok([motor()]);
    vi.stubGlobal('fetch', fetchMock);
    render(<Admin role="maintenance" />);
    expect(screen.getByText(/เฉพาะ admin/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admin เห็นตารางผูกพอร์ตพร้อมค่าตั้งของแต่ละตัว', async () => {
    vi.stubGlobal('fetch', ok([motor()]));
    render(<Admin role="admin" />);
    expect(await screen.findByText('MOTOR-01')).toBeInTheDocument();
    expect(screen.getByText('master2 / 0')).toBeInTheDocument();
    expect(screen.getByText('DE-H')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('kW ยังไม่ได้กรอก → บอกว่ายังไม่มี ไม่ใช่โชว์ 0 ให้เข้าใจผิด', async () => {
    vi.stubGlobal('fetch', ok([motor({ ratedKw: null })]));
    render(<Admin role="admin" />);
    await screen.findByText('MOTOR-01');
    expect(screen.getByText(/ยังไม่ระบุ/)).toBeInTheDocument();
  });

  it('เซ็นเซอร์หลุด → ตารางบอกด้วยข้อความ ไม่ใช่แค่สี (NFR-09)', async () => {
    vi.stubGlobal('fetch', ok([motor({ isOnline: false })]));
    render(<Admin role="admin" />);
    expect(await screen.findByText('หลุด')).toBeInTheDocument();
  });
});
