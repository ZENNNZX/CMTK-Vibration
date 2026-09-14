/**
 * ตัวห่อ fetch — ไม่ใช้ axios ตาม docs/04 §1
 * รูปแบบ response ตายตัวทั้งระบบตาม SOP-DEV-001 · แกะ data ออกให้ที่เดียว
 */
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
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
  } catch {
    // เน็ตขาดหรือเซิร์ฟเวอร์ไม่ตอบ — ไม่ใช่ error ที่มี body ให้อ่าน
    throw { status: 0, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' } satisfies ApiError;
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw {
      status: res.status,
      message: body?.message ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    } satisfies ApiError;
  }
  return body.data as T;
}
