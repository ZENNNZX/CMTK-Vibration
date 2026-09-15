import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createPredictionController } from '../controllers/predictionController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validateQuery } from '../middlewares/validate.js';
import { createPredictionRepository } from '../repositories/predictionRepository.js';
import { createPredictionService } from '../services/predictionService.js';
import { summaryQuerySchema } from '../validators/predictionValidators.js';

export function predictionRoute(db: Db, jwtSecret: string): Router {
  const c = createPredictionController(createPredictionService(createPredictionRepository(db)));
  const router = Router();
  const auth = authenticate(jwtSecret);

  router.get('/predictions/summary', auth, validateQuery(summaryQuerySchema), c.summary);

  // เขียนลง predictions ได้เฉพาะ admin — ตารางนี้คือหลักฐานการวัดผล ไม่ใช่ข้อมูลทั่วไป
  router.post('/predictions/run', auth, authorize('admin'), c.run);
  return router;
}
