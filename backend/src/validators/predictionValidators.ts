import { z } from 'zod';

const currentMonthTH = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);

/** เลือกแกนที่จะดูเส้นทำนาย — ชื่อเดียวกับ metric ในตาราง predictions */
export const upcomingQuerySchema = z.object({
  metric: z.enum(['vrms_y', 'vrms_z', 'temperature']).default('vrms_y'),
});

export const summaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month ต้องอยู่ในรูปแบบ YYYY-MM')
    .default(currentMonthTH),
  // เกณฑ์ที่ใช้แปลงค่าทำนายเป็นคำตอบ เกิน/ไม่เกิน — ต่างจากเส้น Warning ที่ใช้เตือนจริง (DSN §7)
  // 1.8 = ขอบโซน B→C ตาม ISO 10816-1 Class I ตรงกับ warning_threshold หลัง migration 012
  // ค่าเดิม 2.8 มาจาก ISO 20816-3 Group 2 ซึ่งเลิกใช้กับมอเตอร์ 11 kW ชุดนี้แล้ว
  // ถ้าปล่อยไว้ หน้าสรุปรายเดือนจะวัดผลด้วยเส้นที่ระบบไม่ได้ใช้เตือนจริง
  threshold: z.coerce
    .number({ invalid_type_error: 'threshold ต้องเป็นตัวเลข' })
    .positive('threshold ต้องมากกว่า 0')
    .max(100)
    .default(1.8),
});
