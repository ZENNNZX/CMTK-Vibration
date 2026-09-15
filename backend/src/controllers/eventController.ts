import type { RequestHandler } from 'express';

import type { EventService } from '../services/eventService.js';

export function createEventController(service: EventService) {
  const list: RequestHandler = (_req, res, next) => {
    service
      .listByMonth(res.locals.query.month)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  // req.user มาจาก authenticate เสมอ — route นี้ไม่มีทางถึงถ้าไม่มี token
  const acknowledge: RequestHandler = (req, res, next) => {
    service
      .acknowledge(res.locals.params.id, req.user!.sub)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  return { list, acknowledge };
}
