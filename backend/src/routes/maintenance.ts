import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createMaintenanceController } from '../controllers/maintenanceController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { createMaintenanceRepository } from '../repositories/maintenanceRepository.js';
import { createMaintenanceService } from '../services/maintenanceService.js';
import {
  maintenanceBodySchema,
  maintenanceQuerySchema,
} from '../validators/maintenanceValidators.js';

export function maintenanceRoute(db: Db, jwtSecret: string): Router {
  const c = createMaintenanceController(createMaintenanceService(createMaintenanceRepository(db)));
  const router = Router();
  const auth = authenticate(jwtSecret);

  // ทุก role อ่านประวัติซ่อมได้ (NFR-01)
  router.get('/maintenance', auth, validateQuery(maintenanceQuerySchema), c.list);

  // AC-002-01 · manager บันทึกงานซ่อมไม่ได้
  router.post(
    '/maintenance',
    auth,
    authorize('maintenance', 'admin'),
    validateBody(maintenanceBodySchema),
    c.create,
  );
  return router;
}
