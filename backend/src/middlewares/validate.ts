import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import type { ZodIssue } from 'zod';

/**
 * เหลือ field ละข้อความเดียว — z.string().min(1).email() ยิงสองข้อพร้อมกันเมื่อค่าว่าง
 * ผู้ใช้ต้องแก้ทีละอย่างอยู่แล้ว บอกข้อแรกพอ
 */
const firstPerField = (issues: ZodIssue[]) => [
  ...issues
    .reduce((m, i) => {
      const field = i.path.join('.');
      return m.has(field) ? m : m.set(field, { field, message: i.message });
    }, new Map<string, { field: string; message: string }>())
    .values(),
];

const reject = (res: Parameters<RequestHandler>[1], issues: ZodIssue[]) => {
  res.status(400).json({
    success: false,
    message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
    errors: firstPerField(issues),
  });
};

/** NFR-07 · ทุก body/query/params ผ่าน Zod — ผิดตอบ 400 พร้อมบอก field */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reject(res, parsed.error.issues);
    req.body = parsed.data;
    next();
  };

/**
 * express 5 ทำ req.query / req.params เป็น getter เขียนทับไม่ได้
 * จึงวางค่าที่แปลงชนิดแล้วไว้ที่ res.locals ให้ controller หยิบต่อ
 */
export const validateParams =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) return reject(res, parsed.error.issues);
    res.locals.params = parsed.data;
    next();
  };

export const validateQuery =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reject(res, parsed.error.issues);
    res.locals.query = parsed.data;
    next();
  };
