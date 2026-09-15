import { z } from 'zod';

/** ตรงกับ enum cause_code ใน migration 001 */
export const CAUSE_CODES = [
  'bearing', 'misalignment', 'imbalance', 'looseness', 'lubrication', 'other',
] as const;

/**
 * AC-014-02 · สาเหตุบังคับ — ถ้าเว้นได้ ทุกคนจะเว้น
 * แล้วตารางนี้จะไร้ค่าสำหรับโมเดลในอนาคต (docs/03 §4.5)
 * strict() กันการยัด performed_by มาเอง — คนทำมาจาก token เท่านั้น
 */
export const maintenanceBodySchema = z
  .object({
    motorId: z.number().int().positive('motorId ต้องมากกว่า 0'),
    cause: z.enum(CAUSE_CODES, {
      errorMap: () => ({ message: `สาเหตุต้องเป็นหนึ่งใน ${CAUSE_CODES.join(' · ')}` }),
    }),
    description: z.string().max(2000).optional(),
    alarmEventId: z.number().int().positive().optional(),
    resetRunHours: z.boolean().optional().default(false),
  })
  .strict();

export const maintenanceQuerySchema = z.object({
  motorId: z.coerce.number({ invalid_type_error: 'motorId ต้องเป็นตัวเลข' }).int().positive().optional(),
});
