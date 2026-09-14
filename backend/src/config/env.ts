import { z } from 'zod';

/** ตรวจ env ตอนบูต — ขาดตัวไหนตายทันทีพร้อมบอกชื่อ (แบบเดียวกับ ingestion) */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(8),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`ตัวแปร environment ไม่ถูกต้อง\n${lines.join('\n')}`);
  }
  return parsed.data;
}
