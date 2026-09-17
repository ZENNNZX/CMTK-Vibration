import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createMotorController } from '../controllers/motorController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.js';
import { createMotorRepository } from '../repositories/motorRepository.js';
import { createMotorService } from '../services/motorService.js';
import { motorIdSchema, motorPatchSchema, readingsQuerySchema } from '../validators/motorValidators.js';

/** ที่มาของอนุกรมเวลาความละเอียดสูง — ไม่มีก็ใช้ Postgres แทน */
export interface InfluxSource {
  listReadings(motorId: number, hours: number): Promise<unknown[]>;
}

export function motorRoute(db: Db, jwtSecret: string, influx?: InfluxSource): Router {
  const c = createMotorController(createMotorService(createMotorRepository(db), influx));
  const router = Router();
  const auth = authenticate(jwtSecret);

  // ทุก role อ่านได้ แต่ต้องล็อกอินก่อน (NFR-01)
  router.get('/motors', auth, c.list);
  router.get('/motors/:id', auth, validateParams(motorIdSchema), c.detail);
  router.get(
    '/motors/:id/readings',
    auth,
    validateParams(motorIdSchema),
    validateQuery(readingsQuerySchema),
    c.readings,
  );

  // AC-002-01 · manager ดูได้อย่างเดียว แก้ค่าตั้งไม่ได้
  router.patch(
    '/motors/:id',
    auth,
    authorize('maintenance', 'admin'),
    validateParams(motorIdSchema),
    validateBody(motorPatchSchema),
    c.update,
  );
  return router;
}
