/**
 * ตัวห่อ fetch — ไม่ใช้ axios ตาม docs/04 §1
 * รูปแบบ response ตายตัวทั้งระบบตาม SOP-DEV-001 · แกะ data ออกให้ที่เดียว
 */
const TOKEN_KEY = 'cmtk.token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export interface ApiError {
  status: number;
  message: string;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw { status: 0, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' } satisfies ApiError;
  }

  // AC-001-04 · token หมดอายุต้องเด้งออก ไม่ค้างหน้าเปล่า — ทิ้ง token ให้ที่นี่ที่เดียว
  if (res.status === 401) clearToken();

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw {
      status: res.status,
      message: body?.message ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    } satisfies ApiError;
  }
  return body.data as T;
}
