import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Login } from './Login';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Login', () => {
  it('AC-001-03 · ยังไม่กรอก → บอกให้กรอกก่อน ไม่ยิง API ทิ้ง', async () => {
    const f = reply(200, {});
    vi.stubGlobal('fetch', f);
    render(<Login onSignedIn={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('กรอกอีเมลและรหัสผ่านให้ครบ');
    expect(f).not.toHaveBeenCalled();
  });

  it('AC-001-02 · รหัสผิด → แสดงข้อความจากเซิร์ฟเวอร์ ไม่บอกว่า email มีจริงไหม', async () => {
    vi.stubGlobal('fetch', reply(401, { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }));
    render(<Login onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText('อีเมล'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('AC-001-01 · สำเร็จ → เก็บ token แล้วแจ้งกลับ', async () => {
    vi.stubGlobal('fetch', reply(200, { success: true, data: { token: 'jwt.tok.en', user: { role: 'admin' } } }));
    const onSignedIn = vi.fn();
    render(<Login onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('อีเมล'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(localStorage.getItem('cmtk.token')).toBe('jwt.tok.en');
  });
});
