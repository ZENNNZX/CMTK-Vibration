import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createMotorController } from '../controllers/motorController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createMotorRepository } from '../repositories/motorRepository.js';
import { createMotorService } from '../services/motorService.js';

export function motorRoute(db: Db, jwtSecret: string): Router {
  const c = createMotorController(createMotorService(createMotorRepository(db)));
  const router = Router();
  // ทุก role อ่านได้ แต่ต้องล็อกอินก่อน (NFR-01)
  router.get('/motors', authenticate(jwtSecret), c.list);
  return router;
}
