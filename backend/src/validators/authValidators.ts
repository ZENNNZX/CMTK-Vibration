import { z } from 'zod';

// AC-001-03 · เว้นว่างต้องบอกว่า field ไหน
export const loginSchema = z.object({
  email: z.string().min(1, 'กรุณากรอกอีเมล').email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});
