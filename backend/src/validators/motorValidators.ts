import { z } from 'zod';

export const motorIdSchema = z.object({
  id: z.coerce.number({ invalid_type_error: 'id ต้องเป็นตัวเลข' }).int('id ต้องเป็นจำนวนเต็ม').positive('id ต้องมากกว่า 0'),
});

/** เพดานเดิม 2160 ชม. (90 วัน) — ยาวกว่านี้คิวรีเกิน 2 วินาที (AC-007-02) */
export const MAX_RANGE_HOURS = 2160;
const HOUR_MS = 3_600_000;

/**
 * ขอได้สองแบบ แต่ข้างในเหลือรูปเดียวคือ { start, stop }
 *   ?hours=24                     ← ปุ่มช่วงสำเร็จรูป = ย้อนหลังจากตอนนี้
 *   ?from=...&to=...              ← เลือกวันที่เอง
 * ปลายทางทั้ง InfluxDB และ Postgres รับช่วงเวลาเหมือนกัน จึงไม่ต้องมีสองเส้นทาง
 */
export const readingsQuerySchema = z
  .object({
    hours: z.coerce
      .number({ invalid_type_error: 'hours ต้องเป็นตัวเลข' })
      .int('hours ต้องเป็นจำนวนเต็ม')
      .min(1, 'hours ต้องอย่างน้อย 1')
      .max(MAX_RANGE_HOURS, `hours ได้มากสุด ${MAX_RANGE_HOURS} (90 วัน)`)
      .optional(),
    from: z.coerce.date({ invalid_type_error: 'from ต้องเป็นวันที่' }).optional(),
    to: z.coerce.date({ invalid_type_error: 'to ต้องเป็นวันที่' }).optional(),
  })
  // ส่งมาข้างเดียวแล้วเดาอีกข้างให้ = เดาผิดแล้วผู้ใช้ไม่รู้ตัว ขอให้ชัดว่าต้องมาคู่
  .refine((v) => (v.from === undefined) === (v.to === undefined), {
    message: 'ต้องส่ง from และ to มาคู่กัน',
    path: ['from'],
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.to > v.from, {
    message: 'วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่ม',
    path: ['to'],
  })
  .refine(
    (v) =>
      v.from === undefined ||
      v.to === undefined ||
      v.to.getTime() - v.from.getTime() <= MAX_RANGE_HOURS * HOUR_MS,
    { message: `ช่วงที่เลือกยาวได้มากสุด ${MAX_RANGE_HOURS / 24} วัน`, path: ['to'] },
  )
  .transform((v) => {
    // to ที่เลยปัจจุบันไม่ต้องตัด — ปลายทางคืนเท่าที่มีอยู่แล้ว ตัดเองมีแต่จะเพิ่มโค้ด
    const stop = v.to ?? new Date();
    const start = v.from ?? new Date(stop.getTime() - (v.hours ?? 24) * HOUR_MS);
    return { start, stop };
  });

export type ReadingsRange = z.infer<typeof readingsQuerySchema>;

/** ISO 20816 · จุดวัดมาตรฐาน — ตรงกับ enum mount_point ใน migration 001 */
export const MOUNT_POINTS = ['DE-H', 'DE-V', 'DE-A', 'NDE-H', 'NDE-V'] as const;

/**
 * แก้ได้ทีละ field หรือหลาย field — แต่ต้องมีอย่างน้อยหนึ่ง
 * เกณฑ์สลับกันแล้วแถบโซนในกราฟพลิก อ่านผิดทั้งหน้า จึงตรวจคู่กันที่นี่
 */
/** field ป้ายชื่อ — admin เท่านั้นที่แก้ได้ ตรวจสิทธิ์ที่ service ไม่ใช่ที่นี่ */
export const NAMEPLATE_FIELDS = ['tag', 'name', 'ratedKw'] as const;

export const motorPatchSchema = z
  .object({
    // ความยาวตรงกับ VARCHAR ใน migration 002 — ให้ 400 พร้อมเหตุผล ดีกว่าให้ Postgres โยน 500
    tag: z.string().trim().min(1, 'รหัสต้องไม่ว่าง').max(32, 'รหัสยาวได้ไม่เกิน 32 ตัวอักษร').optional(),
    name: z.string().trim().min(1, 'ชื่อต้องไม่ว่าง').max(120, 'ชื่อยาวได้ไม่เกิน 120 ตัวอักษร').optional(),
    // NUMERIC(6,2) → มากสุด 9999.99 · มอเตอร์จริงหลักสิบ แต่ไม่ปิดทางเครื่องใหญ่
    ratedKw: z.number().positive('กำลังต้องมากกว่า 0').max(9999.99, 'กำลังเกินที่เก็บได้').optional(),

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
