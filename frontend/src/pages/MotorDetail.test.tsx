import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MotorDetail, breakGaps } from './MotorDetail';

const detail = (over = {}) => ({
  id: 1, tag: 'MOTOR-01', name: 'ปั๊มน้ำ 1', masterNo: 2, portNo: 0,
  ratedKw: 22, isoGroup: 2, mountingRigid: true, sensorMount: 'DE-H', sensorMountOffset: null,
  warningThreshold: 2.8, alarmThreshold: 4.5, runHours: 1284.5, isOnline: true, ...over,
});
const reading = (over = {}) => ({
  ts: '2026-09-14T09:00:00.000Z', vrmsY: 1.44, vrmsZ: 1.28, temperature: 47, zone: 'B', ...over,
});

/** ตอบตาม path — หน้านี้ยิงสาม endpoint พร้อมกัน (รายละเอียด · ค่าที่วัด · ค่าทำนาย) */
const routes = (d: unknown, r: unknown, status = 200, fc: unknown = []) =>
  vi.fn(async (url: string) => {
    const data = url.includes('/predictions') ? fc : url.includes('/readings') ? r : d;
    return new Response(JSON.stringify({ success: status === 200, data, message: 'พัง' }), { status });
  });

const forecast = (over = {}) => ({
  targetDay: '2026-09-22', horizonDays: 1, predicted: 1.9, ciLow: 1.4, ciHigh: 2.4, ...over,
});

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
      const data = url.includes('/predictions') ? [] : url.includes('/readings') ? [reading()] : detail();
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

  // ── เลือกช่วงวันที่เอง ──

  const readingsUrls = (m: ReturnType<typeof vi.fn>) =>
    m.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/readings'));

  it('ไม่มีค่าทำนาย → บอกเงื่อนไขที่ยังไม่ครบ ไม่ปล่อยกราฟเงียบ ๆ', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, []));
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(screen.getByText(/ยังไม่มีค่าทำนาย/)).toBeInTheDocument();
  });

  it('ค่าทำนายแตะเกณฑ์ Warning → บอกวันที่และอีกกี่วัน', async () => {
    // detail() ตั้ง warningThreshold ไว้ 2.8 — ทำนาย 3.2 จึงต้องเตือน
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, [forecast({ predicted: 3.2, targetDay: '2999-01-01' })]));
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(screen.getByText(/แตะเกณฑ์ Warning/)).toBeInTheDocument();
    expect(screen.getByText(/อีก 1 วัน/)).toBeInTheDocument();
  });

  it('ค่าทำนายยังไม่ถึงเกณฑ์ → บอกว่ายังไม่แตะ ไม่ทำให้ตกใจฟรี', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, [forecast({ predicted: 1.2, targetDay: '2999-01-01' })]));
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(screen.getByText(/ยังไม่แตะเกณฑ์ Warning/)).toBeInTheDocument();
  });

  it('เส้นทำนายล้ม → กราฟหลักต้องยังขึ้นตามปกติ', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/predictions')) return new Response('{}', { status: 500 });
      const data = url.includes('/readings') ? [reading()] : detail();
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    show();
    expect(await screen.findByRole('heading', { name: 'MOTOR-01' })).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีค่าทำนาย/)).toBeInTheDocument();
  });

  it('ตั้งต้นแสดงครบทุกเส้น · กดปุ่มแล้วแยกดูทีละเส้น · กดซ้ำกลับมาครบ', async () => {
    // ค่าทำนายวันถัดจากค่าที่วัด และดูช่วง 7 วัน — สั้นกว่านี้เส้นประอยู่นอกช่วงที่วาด
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, [forecast({ targetDay: '2026-09-15' })]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: '7 วัน' }));
    const y = await screen.findByRole('button', { name: /v-RMS แกน Y/ });
    const fcBtn = screen.getByRole('button', { name: /ค่าทำนาย/ });
    // ยังไม่กด = ไม่มีปุ่มไหนติด เพราะกราฟแสดงครบอยู่แล้ว
    expect(y).toHaveAttribute('aria-pressed', 'false');
    expect(fcBtn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(fcBtn);
    expect(fcBtn).toHaveAttribute('aria-pressed', 'true');
    expect(y).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(fcBtn);
    expect(fcBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('ไม่มีค่าทำนาย → ปุ่มค่าทำนายกดไม่ได้ ไม่ใช่กดแล้วกราฟว่าง', async () => {
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, []));
    show();
    expect(await screen.findByRole('button', { name: /ค่าทำนาย/ })).toBeDisabled();
  });

  it('ค่าทำนายไกลกว่าช่วงที่ดูอยู่ → ไม่ยืดแกนเวลาไปทั้งสัปดาห์ แต่บอกว่าต้องเลือกช่วงไหน', async () => {
    // ค่าที่วัด 14 ก.ย. · ทำนาย 22 ก.ย. · ช่วงตั้งต้น 6 ชม. — ถ้าวาดด้วย ข้อมูลจริงจะถูกบีบจนอ่านไม่ออก
    vi.stubGlobal('fetch', routes(detail(), [reading()], 200, [forecast()]));
    show();
    expect(await screen.findByRole('button', { name: /ค่าทำนาย/ })).toBeDisabled();
    expect(screen.getByText(/ไกลกว่าช่วงที่ดูอยู่/)).toBeInTheDocument();
  });

  it('ขอค่าทำนายทั้งสองแกน — เส้นประของ Z ต้องมีข้อมูลของมันเอง ไม่ใช่ซ้ำของ Y', async () => {
    const fetchMock = routes(detail(), [reading()], 200, [forecast()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('metric=vrms_y'))).toBe(true);
    expect(urls.some((u) => u.includes('metric=vrms_z'))).toBe(true);
  });

  it('ปุ่มสำเร็จรูปยิงเป็น hours ตามเดิม', async () => {
    const fetchMock = routes(detail(), [reading()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    expect(readingsUrls(fetchMock)[0]).toContain('hours=6');
  });

  it('เลือก 18 ก.ย. – 20 ต.ค. → ยิง from/to ผูกเวลาไทย และนับรวมทั้งวันสุดท้าย', async () => {
    const fetchMock = routes(detail(), [reading()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });

    await userEvent.click(screen.getByRole('button', { name: 'กำหนดเอง' }));
    // fireEvent ผ่าน userEvent.type ไม่เวิร์กกับ input[type=date] — ตั้งค่าตรง ๆ
    const from = screen.getByLabelText('ตั้งแต่วันที่') as HTMLInputElement;
    const to = screen.getByLabelText('ถึงวันที่') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-09-18' } });
    fireEvent.change(to, { target: { value: '2026-10-20' } });
    await userEvent.click(screen.getByRole('button', { name: 'ดูกราฟ' }));

    const url = readingsUrls(fetchMock).at(-1)!;
    const q = new URLSearchParams(url.split('?')[1]);
    // 18 ก.ย. 00:00 น. ไทย = 17 ก.ย. 17:00 UTC — ถ้าหลุดไปเป็น UTC เที่ยงคืน ข้อมูลเช้าวันแรกจะหาย
    expect(new Date(q.get('from')!).toISOString()).toBe('2026-09-17T17:00:00.000Z');
    expect(new Date(q.get('to')!).toISOString()).toBe('2026-10-20T16:59:59.999Z');
    expect(q.get('hours')).toBeNull();
  });

  it('วันสิ้นสุดอยู่ก่อนวันเริ่ม → เตือนตรงนั้น ไม่ยิง API', async () => {
    const fetchMock = routes(detail(), [reading()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    const before = readingsUrls(fetchMock).length;

    await userEvent.click(screen.getByRole('button', { name: 'กำหนดเอง' }));
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-18' } });
    await userEvent.click(screen.getByRole('button', { name: 'ดูกราฟ' }));

    expect(screen.getByRole('alert')).toHaveTextContent('ต้องไม่อยู่ก่อนวันที่เริ่ม');
    expect(readingsUrls(fetchMock)).toHaveLength(before);
  });

  it('ช่วงยาวเกิน 90 วัน → เตือนก่อนยิง ไม่ปล่อยไปโดน 400', async () => {
    const fetchMock = routes(detail(), [reading()]);
    vi.stubGlobal('fetch', fetchMock);
    show();
    await screen.findByRole('heading', { name: 'MOTOR-01' });
    const before = readingsUrls(fetchMock).length;

    await userEvent.click(screen.getByRole('button', { name: 'กำหนดเอง' }));
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-18' } });
    await userEvent.click(screen.getByRole('button', { name: 'ดูกราฟ' }));

    expect(screen.getByRole('alert')).toHaveTextContent('90 วัน');
    expect(readingsUrls(fetchMock)).toHaveLength(before);
  });
});

describe('breakGaps', () => {
  const row = (t: number) => ({
    ts: new Date(t).toISOString(), t, vrmsY: 3, vrmsZ: 2, temperature: 40, aPeak: null, aRms: null, zone: null,
    crest: null, fcY: null, fcZ: null,
  });

  it('ช่วงที่บอร์ดไม่ได้บันทึก → แทรกแถว null ให้กราฟขาดเส้น ไม่ลากเส้นตรงข้ามไป', () => {
    const m = 60_000;
    const out = breakGaps([row(0), row(m), row(2 * m), row(3 * m), row(60 * m), row(61 * m)]);
    expect(out).toHaveLength(7);
    expect(out[4]).toMatchObject({ t: 4 * m, vrmsY: null, vrmsZ: null });
    expect(out.at(-1)?.vrmsY).toBe(3); // แถวสุดท้ายยังเป็นค่าจริง — latest ไม่พัง
  });

  it('ช่วง 1 ชม. ข้อมูลเว้นไม่กี่นาที (บอร์ดเก็บไม่ครบ) → ไม่ตัดเส้นเป็นท่อน ๆ', () => {
    const s = 15_000;
    const rows = [row(0), row(s), row(2 * s), row(2 * s + 4 * 60_000), row(3 * s + 4 * 60_000)];
    expect(breakGaps(rows)).toEqual(rows);
  });

  it('ข้อมูลต่อเนื่อง → ไม่แตะอะไร', () => {
    const rows = [row(0), row(5000), row(10_000)];
    expect(breakGaps(rows)).toEqual(rows);
  });
});
