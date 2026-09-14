import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { SystemStatus } from './SystemStatus';

const reply = (ok: boolean, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 }));

afterEach(() => vi.unstubAllGlobals());

describe('SystemStatus', () => {
  it('ระหว่างรอ → บอกว่ากำลังตรวจสอบ ไม่ปล่อยจอว่าง (NFR-10)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SystemStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('กำลังตรวจสอบ');
  });

  it('ต่อได้ → บอกด้วยข้อความ ไม่ใช่แค่สี (NFR-09)', async () => {
    vi.stubGlobal('fetch', reply(true, { success: true, data: { status: 'ok', database: 'up' } }));
    render(<SystemStatus />);
    expect(await screen.findByText('ฐานข้อมูลเชื่อมต่อได้')).toBeInTheDocument();
  });

  it('ล่ม → บอกว่าล่ม พร้อมปุ่มลองใหม่ที่ Tab ถึง (NFR-09, NFR-10)', async () => {
    vi.stubGlobal('fetch', reply(false, { success: false, message: 'ฐานข้อมูลไม่ตอบสนอง' }));
    render(<SystemStatus />);
    expect(await screen.findByText('ฐานข้อมูลไม่ตอบสนอง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeInTheDocument();
  });

  it('กดลองใหม่ → เรียก API อีกครั้ง', async () => {
    const f = reply(false, { success: false, message: 'ฐานข้อมูลไม่ตอบสนอง' });
    vi.stubGlobal('fetch', f);
    render(<SystemStatus />);
    (await screen.findByRole('button', { name: 'ลองใหม่' })).click();
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  });
});
