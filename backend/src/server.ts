import pino from 'pino';

import { createApp } from './app.js';
import { createPool } from './config/db.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const pool = createPool(env.DATABASE_URL, env.DB_POOL_MAX);

const server = createApp(pool, { log, jwtSecret: env.JWT_SECRET }).listen(env.PORT, () => {
  log.info({ port: env.PORT }, 'API พร้อมรับคำขอ');
});

const shutdown = (signal: string): void => {
  log.info({ signal }, 'กำลังปิด API');
  server.close(() => void pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
