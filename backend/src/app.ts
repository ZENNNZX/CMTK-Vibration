import express from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';

import type { Db } from './config/db.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { authRoute } from './routes/auth.js';
import { healthRoute } from './routes/health.js';
import { eventRoute } from './routes/events.js';
import { maintenanceRoute } from './routes/maintenance.js';
import { motorRoute, type InfluxSource } from './routes/motors.js';
import { predictionRoute } from './routes/predictions.js';

export interface AppOptions {
  log?: Logger;
  staticDir?: string;
  jwtSecret?: string;
  /** ไม่ส่งมา = กราฟใช้ readings_minute ของ Postgres เหมือนเดิม */
  influx?: InfluxSource;
}

/** รับ db เข้ามาแทนที่จะสร้างเอง — เทสต์จึงรันได้โดยไม่ต้องมี PostgreSQL */
export function createApp(db: Db, opts: AppOptions = {}): express.Express {
  const {
    log = pino({ level: 'silent' }),
    staticDir = process.env.STATIC_DIR,
    jwtSecret = process.env.JWT_SECRET ?? '',
    influx,
  } = opts;

  const app = express();

  // เว็บเสิร์ฟผ่าน http ธรรมดาใน LAN ไม่มี TLS — ค่า default ของ helmet สั่งเบราว์เซอร์อัปเกรดเป็น https
  // แล้ว JS/CSS โหลดไม่ขึ้น (ERR_SSL_PROTOCOL_ERROR) · ใส่ TLS เมื่อไหร่ค่อยเปิดสองตัวนี้คืน
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
      strictTransportSecurity: false,
    }),
  );
  app.use(express.json());

  app.use('/api', healthRoute(db));
  app.use('/api', authRoute(db, jwtSecret));
  app.use('/api', motorRoute(db, jwtSecret, influx));
  app.use('/api', eventRoute(db, jwtSecret));
  app.use('/api', maintenanceRoute(db, jwtSecret));
  app.use('/api', predictionRoute(db, jwtSecret));

  // ไม่มี nginx — Express เสิร์ฟไฟล์ที่ build แล้วเอง (docs/04 §3)
  // ตั้ง STATIC_DIR เฉพาะใน container ที่มี frontend build อยู่จริง เทสต์ไม่ต้องมีไฟล์
  if (staticDir) app.use(express.static(staticDir));

  app.use(notFound);
  app.use(errorHandler(log));

  return app;
}
