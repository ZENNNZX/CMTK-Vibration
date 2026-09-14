import express from 'express';
import helmet from 'helmet';
import pino from 'pino';

import type { Db } from './config/db.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { healthRoute } from './routes/health.js';

/** รับ db เข้ามาแทนที่จะสร้างเอง — เทสต์จึงรันได้โดยไม่ต้องมี PostgreSQL */
export function createApp(
  db: Db,
  log = pino({ level: 'silent' }),
  staticDir = process.env.STATIC_DIR,
): express.Express {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.use('/api', healthRoute(db));

  // ไม่มี nginx — Express เสิร์ฟไฟล์ที่ build แล้วเอง (docs/04 §3)
  // ตั้ง STATIC_DIR เฉพาะใน container ที่มี frontend build อยู่จริง เทสต์ไม่ต้องมีไฟล์
  if (staticDir) app.use(express.static(staticDir));

  app.use(notFound);
  app.use(errorHandler(log));

  return app;
}
