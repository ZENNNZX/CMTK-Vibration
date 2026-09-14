import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(m: string) {
    super(400, m);
  }
}
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `ไม่พบ${resource}`);
  }
}
export class UnavailableError extends AppError {
  constructor(m: string) {
    super(503, m);
  }
}

/** เส้นทางที่ไม่มีจริง — ตอบรูปแบบเดียวกับ error อื่น ไม่ใช่ HTML ของ express */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: 'ไม่พบเส้นทางที่เรียก' });
};

/**
 * NFR-07 · error ที่ไม่คาดคิดห้าม echo err.message ออกไป
 * log เต็มฝั่งเซิร์ฟเวอร์ ส่งกลับเฉพาะข้อความกลาง ๆ
 */
export const errorHandler =
  (log: Logger): ErrorRequestHandler =>
  (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    log.error({ err }, 'error ที่ไม่คาดคิด');
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
  };
