import type { RequestHandler } from 'express';

import type { MotorService } from '../services/motorService.js';

export function createMotorController(service: MotorService) {
  const list: RequestHandler = (_req, res, next) => {
    service
      .list()
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  // ค่าที่ผ่าน Zod แล้วอยู่ที่ res.locals — express 5 เขียนทับ req.params/query ไม่ได้
  const detail: RequestHandler = (_req, res, next) => {
    service
      .detail(res.locals.params.id)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  const readings: RequestHandler = (_req, res, next) => {
    service
      .readings(res.locals.params.id, res.locals.query)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  const update: RequestHandler = (req, res, next) => {
    service
      .update(res.locals.params.id, req.body, req.user?.role)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  return { list, detail, readings, update };
}
