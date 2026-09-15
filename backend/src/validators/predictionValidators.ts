import { z } from 'zod';

const currentMonthTH = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);

export const summaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month ต้องอยู่ในรูปแบบ YYYY-MM')
    .default(currentMonthTH),
  // เกณฑ์ที่ใช้แปลงค่าทำนายเป็นคำตอบ เกิน/ไม่เกิน — ต่างจากเส้น Warning ที่ใช้เตือนจริง (DSN §7)
  threshold: z.coerce
    .number({ invalid_type_error: 'threshold ต้องเป็นตัวเลข' })
    .positive('threshold ต้องมากกว่า 0')
    .max(100)
    .default(2.8),
});
