import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MotorDetail } from './MotorDetail';

const detail = (over = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  ratedKw: 22, isoGroup: 2, mountingRigid: true, sensorMount: 'DE-H', sensorMountOffset: null,
  warningThreshold: 2.8, alarmThreshold: 4.5, runHours: 1284.5, isOnline: true, ...over,
});
const reading = (over = {}) => ({
  ts: '2026-09-14T09:00:00.000Z', vrmsY: 1.44, vrmsZ: 1.28, temperature: 47, zone: 'B', ...over,
});

/** ตอบตาม path — หน้านี้ยิงสอง endpoint พร้อมกัน */
const routes = (d: unknown, r: unknown, status = 200) =>
  vi.fn(async (url: string) =>
    new Response(
      JSON.stringify({ success: status === 200, data: url.includes('/readings') ? r : d, message: 'พัง' }),
      { status },
    ));

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const show = (role = 'maintenance') =>
  render(<MotorDetail motorId={1} onBack={() => {}} role={role} />);

describe('MotorDetail', () => {
  it('AC-007-04 · ระหว่างรอ ต้องบอกว่ากำลังโหลด', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    show();
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด');
  });

  it('แสดงหัวเรื่องพร้อมพิกัดพอร์ตจริง และชั่วโมงเดินเครื่อง', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    expect(await screen.findByRole('heading', { name: 'MOTOR-01' })).toBeInTheDocument();
    expect(screen.getByText(/master2 \/ port0/)).toBeInTheDocument();
    expect(screen.getByText('1,284.5')).toBeInTheDocument();
  });

  it('AC-007-01 · บอกเกณฑ์ Warning และ Alarm ที่ใช้จริงของมอเตอร์ตัวนั้น', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    expect(await screen.findByText(/Warning 2\.8/)).toBeInTheDocument();
    expect(screen.getByText(/Alarm 4\.5/)).toBeInTheDocument();
  });

  it('AC-007-03 · ยังไม่มีข้อมูลในช่วงนี้ → empty state ที่อ่านรู้เรื่อง ไม่ใช่กราฟเปล่า', async () => {
    vi.stubGlobal('fetch', routes(detail(), []));
    show();
    expect(await screen.findByText(/ยังไม่มีข้อมูลในช่วงเวลานี้/)).toBeInTheDocument();
  });

  it('AC-007-05 · API พัง → error state + ปุ่มลองใหม่ ไม่โชว์ stack trace', async () => {
    vi.stubGlobal('fetch', routes(null, null, 500));
    show();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeInTheDocument();
  });

  it('NFR-09 · โซนบนหน้ารายละเอียดบอกด้วยตัวอักษร', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    expect(await screen.findByRole('img', { name: /โซน B/ })).toBeInTheDocument();
  });

  it('เปลี่ยนช่วงเวลาแล้วต้องยิงคิวรีใหม่ตามจำนวนชั่วโมงที่เลือก', async () => {
    const fetchMock = routes(detail(), [reading()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    await userEvent.click(screen.getByRole('button', { name: '24 ชม.' }));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('hours=24'))).toBe(true);
  });

  it('กดกลับต้องเรียก onBack', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    const onBack = vi.fn();
    render(<MotorDetail motorId={1} onBack={onBack} role="maintenance" />);
    await userEvent.click(await screen.findByRole('button', { name: /กลับหน้ารวม/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it('DSN §4 · ยังไม่แก้อะไร ไม่ต้องมีแถบบันทึกมากวน', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument();
  });

  it('DSN §4 · แก้เกณฑ์แล้วแถบบันทึกโผล่ พร้อมบอกว่าเปลี่ยนอะไร', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    const warn = await screen.findByLabelText(/เส้น Warning/);
    await userEvent.clear(warn);
    await userEvent.type(warn, '3.1');
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeInTheDocument();
    expect(screen.getByText(/เส้น Warning → 3\.1/)).toBeInTheDocument();
  });

  it('กดบันทึกแล้วยิง PATCH ด้วยค่าที่แก้', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH')
        return new Response(JSON.stringify({ success: true, data: detail({ warningThreshold: 3.1 }) }), { status: 200 });
      const data = url.includes('/readings') ? [reading()] : detail();
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    show();
    const warn = await screen.findByLabelText(/เส้น Warning/);
    await userEvent.clear(warn);
    await userEvent.type(warn, '3.1');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    const patched = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(patched).toBeDefined();
    expect(JSON.parse(String((patched![1] as RequestInit).body))).toMatchObject({ warningThreshold: 3.1 });
  });

  it('กดยกเลิกแล้วค่ากลับเป็นเดิม แถบบันทึกหาย', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    const warn = await screen.findByLabelText(/เส้น Warning/);
    await userEvent.clear(warn);
    await userEvent.type(warn, '3.1');
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument();
    expect(warn).toHaveValue(2.8);
  });

  it('DSN §4 · มี dropdown จุดวัดที่ใช้คีย์บอร์ดได้ — WebGL อย่างเดียวตก Gate', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show();
    const mount = await screen.findByLabelText('จุดวัด');
    expect(mount).toHaveValue('DE-H');
    await userEvent.selectOptions(mount, 'NDE-V');
    expect(screen.getByText(/จุดวัด → NDE-V/)).toBeInTheDocument();
  });

  it('AC-002-01 · role manager แก้ไม่ได้ ช่องกรอกถูกล็อก', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()]));
    show('manager');
    expect(await screen.findByLabelText(/เส้น Warning/)).toBeDisabled();
    expect(screen.getByLabelText('จุดวัด')).toBeDisabled();
  });
});
