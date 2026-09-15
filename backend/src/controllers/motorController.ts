import type { RequestHandler } from 'express';

import type { MotorService } from '../services/motorService.js';

export function createMotorController(service: MotorService) {
  const list: RequestHandler = (_req, res, next) => {
    service
      .list()
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };
  return { list };
}
