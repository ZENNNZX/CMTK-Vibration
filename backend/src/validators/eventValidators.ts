import { z } from 'zod';

/** เดือนปัจจุบันตามเวลาไทย — ปฏิทินเปิดมาต้องอยู่เดือนที่ผู้ใช้กำลังอยู่ ไม่ใช่ UTC */
const currentMonthTH = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);

export const eventsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month ต้องอยู่ในรูปแบบ YYYY-MM')
    .default(currentMonthTH),
});

export const eventIdSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'id ต้องเป็นตัวเลข' })
    .int('id ต้องเป็นจำนวนเต็ม')
    .positive('id ต้องมากกว่า 0'),
});
