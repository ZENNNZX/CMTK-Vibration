import { z } from 'zod';

export const motorIdSchema = z.object({
  id: z.coerce.number({ invalid_type_error: 'id ต้องเป็นตัวเลข' }).int('id ต้องเป็นจำนวนเต็ม').positive('id ต้องมากกว่า 0'),
});

/**
 * AC-007-02 · นับเป็นชั่วโมงไม่ใช่วัน — ระบบเพิ่งเริ่มเก็บ ช่วงที่ใช้จริงคือหลักนาทีถึงหลักชั่วโมง
 * เพดาน 2160 ชม. (90 วัน) เท่าเดิม ยาวกว่านั้นคิวรีเกิน 2 วินาที
 */
export const readingsQuerySchema = z.object({
  hours: z.coerce
    .number({ invalid_type_error: 'hours ต้องเป็นตัวเลข' })
    .int('hours ต้องเป็นจำนวนเต็ม')
    .min(1, 'hours ต้องอย่างน้อย 1')
    .max(2160, 'hours ได้มากสุด 2160 (90 วัน)')
    .default(24),
});

/** ISO 20816 · จุดวัดมาตรฐาน — ตรงกับ enum mount_point ใน migration 001 */
export const MOUNT_POINTS = ['DE-H', 'DE-V', 'DE-A', 'NDE-H', 'NDE-V'] as const;

/**
 * แก้ได้ทีละ field หรือหลาย field — แต่ต้องมีอย่างน้อยหนึ่ง
 * เกณฑ์สลับกันแล้วแถบโซนในกราฟพลิก อ่านผิดทั้งหน้า จึงตรวจคู่กันที่นี่
 */
export const motorPatchSchema = z
  .object({
    warningThreshold: z.number().positive('เกณฑ์ Warning ต้องมากกว่า 0').max(100).optional(),
    alarmThreshold: z.number().positive('เกณฑ์ Alarm ต้องมากกว่า 0').max(100).optional(),
    sensorMount: z.enum(MOUNT_POINTS, {
      errorMap: () => ({ message: `จุดวัดต้องเป็นหนึ่งใน ${MOUNT_POINTS.join(' · ')}` }),
    }).optional(),
    /**
     * ตำแหน่งที่ลากบนโมเดล 3D · null = คืนค่ามาตรฐานของจุดวัดนั้น
     * ขอบเขต ±3 คือขนาดโมเดลจริง — กันพิกัดมั่วที่ทำให้จุดลอยนอกตัวมอเตอร์
     */
    sensorMountOffset: z
      .tuple([z.number().min(-3).max(3), z.number().min(-3).max(3), z.number().min(-3).max(3)], {
        invalid_type_error: 'sensorMountOffset ต้องเป็นพิกัดสามแกน [x, y, z]',
      })
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'ต้องระบุอย่างน้อยหนึ่งค่าที่จะแก้' })
  .refine(
    (v) =>
      v.warningThreshold === undefined ||
      v.alarmThreshold === undefined ||
      v.warningThreshold < v.alarmThreshold,
    { message: 'เกณฑ์ Warning ต้องน้อยกว่า Alarm', path: ['warningThreshold'] },
  );
