import { Router } from 'express';

import type { Db } from '../config/db.js';
import { UnavailableError } from '../middlewares/errorHandler.js';

/**
 * public โดยตั้งใจ — docker healthcheck กับ Portainer เรียกตัวนี้ ไม่มี token ให้ (NFR-01)
 * ไม่แยก controller/service/repository เพราะยังไม่มี business logic ให้แยก
 * ชั้นเต็มเริ่มที่ endpoint แรกที่มีตรรกะจริง (US-001 auth)
 */
export function healthRoute(db: Db): Router {
  const router = Router();

  router.get('/health', async (_req, res, next) => {
    try {
      await db.query('SELECT 1');
      res.json({ success: true, data: { status: 'ok', database: 'up' } });
    } catch {
      next(new UnavailableError('ฐานข้อมูลไม่ตอบสนอง'));
    }
  });

  return router;
}
