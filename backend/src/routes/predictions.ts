import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createPredictionController } from '../controllers/predictionController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validateParams, validateQuery } from '../middlewares/validate.js';
import { createPredictionRepository } from '../repositories/predictionRepository.js';
import { createPredictionService } from '../services/predictionService.js';
import { motorIdSchema } from '../validators/motorValidators.js';
import { summaryQuerySchema, upcomingQuerySchema } from '../validators/predictionValidators.js';

export function predictionRoute(db: Db, jwtSecret: string): Router {
  const c = createPredictionController(createPredictionService(createPredictionRepository(db)));
  const router = Router();
  const auth = authenticate(jwtSecret);

  router.get('/predictions/summary', auth, validateQuery(summaryQuerySchema), c.summary);

  // เส้นทำนายของมอเตอร์ตัวเดียว — ทุก role ดูได้เหมือนกราฟอื่น (NFR-01)
  router.get(
    '/predictions/motor/:id',
    auth,
    validateParams(motorIdSchema),
    validateQuery(upcomingQuerySchema),
    c.upcoming,
  );

  // เขียนลง predictions ได้เฉพาะ admin — ตารางนี้คือหลักฐานการวัดผล ไม่ใช่ข้อมูลทั่วไป
  router.post('/predictions/run', auth, authorize('admin'), c.run);
  return router;
}
