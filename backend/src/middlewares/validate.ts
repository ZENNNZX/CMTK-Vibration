import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/** NFR-07 · ทุก body/query/params ผ่าน Zod — ผิดตอบ 400 พร้อมบอก field */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
        // เหลือ field ละข้อความเดียว — z.string().min(1).email() ยิงสองข้อพร้อมกันเมื่อค่าว่าง
        // ผู้ใช้ต้องแก้ทีละอย่างอยู่แล้ว บอกข้อแรกพอ
        errors: [...parsed.error.issues
          .reduce((m, i) => {
            const field = i.path.join('.');
            return m.has(field) ? m : m.set(field, { field, message: i.message });
          }, new Map<string, { field: string; message: string }>())
          .values()],
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
