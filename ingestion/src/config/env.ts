import { z } from 'zod';

/**
 * ตรวจ env ตอนบูต — ขาดตัวไหนให้ตายทันทีพร้อมบอกชื่อ
 * อย่าปล่อยให้รันไปแล้วพังตอนตี 3 ตอนจะส่ง LINE
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(4),

  MQTT_URL: z.string().url(),
  MQTT_USER: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),
  MQTT_TOPIC: z.string().min(1).default('balluff/cmtk/+/iolink/devices/#'),

  AGGREGATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  STALE_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(300),

  // ปุ่มปรับนาฬิกาเซ็นเซอร์ — บอร์ด CMTK ส่ง timestamp ลงท้าย Z แต่ค่าเป็นเวลาไทย
  // วัดจริง: payload 12:53 ขณะ UTC จริง 05:53 → ต้องตั้ง -420
  // แก้ที่ตัวบอร์ดได้เมื่อไหร่ ให้กลับเป็น 0 โดยไม่ต้องแตะโค้ด
  SENSOR_CLOCK_OFFSET_MINUTES: z.coerce.number().int().min(-1440).max(1440).default(0),

  LINE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().default(''),
  // NFR-06 · โควตานับตาม "ผู้รับ × ข้อความ" — broadcast ไม่บอกจำนวนคนที่แอดบอท
  // จึงต้องตั้งเอง แล้วตรวจกับคอนโซล LINE (B-11)
  LINE_RECIPIENT_COUNT: z.coerce.number().int().positive().default(5),
  LINE_DEBOUNCE_MINUTES: z.coerce.number().int().positive().default(60),
  LINE_DAILY_CAP_PER_MOTOR: z.coerce.number().int().positive().default(3),
  LINE_MONTHLY_MESSAGE_CAP: z.coerce.number().int().positive().default(350),
  LINE_MONTHLY_RESERVE: z.coerce.number().int().nonnegative().default(150),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`ตัวแปร environment ไม่ถูกต้อง\n${lines.join('\n')}`);
  }

  // เปิด LINE แล้วต้องมี token — ปล่อยผ่านไม่ได้ เพราะจะรู้ตอนมี alarm จริง
  if (parsed.data.LINE_ENABLED && parsed.data.LINE_CHANNEL_ACCESS_TOKEN === '') {
    throw new Error('LINE_ENABLED=true แต่ไม่มี LINE_CHANNEL_ACCESS_TOKEN');
  }
  return parsed.data;
}
