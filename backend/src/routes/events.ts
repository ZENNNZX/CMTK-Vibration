import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createEventController } from '../controllers/eventController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validateParams, validateQuery } from '../middlewares/validate.js';
import { createEventRepository } from '../repositories/eventRepository.js';
import { createEventService } from '../services/eventService.js';
import { eventIdSchema, eventsQuerySchema } from '../validators/eventValidators.js';

export function eventRoute(db: Db, jwtSecret: string): Router {
  const c = createEventController(createEventService(createEventRepository(db)));
  const router = Router();
  const auth = authenticate(jwtSecret);

  // ทุก role อ่านประวัติได้ (NFR-01)
  router.get('/events', auth, validateQuery(eventsQuerySchema), c.list);

  // AC-002-01 · manager กด ack ไม่ได้ — ดูได้อย่างเดียว
  router.post(
    '/events/:id/ack',
    auth,
    authorize('maintenance', 'admin'),
    validateParams(eventIdSchema),
    c.acknowledge,
  );
  return router;
}
