import type { RequestHandler } from 'express';

import type { MaintenanceService } from '../services/maintenanceService.js';

export function createMaintenanceController(service: MaintenanceService) {
  const list: RequestHandler = (_req, res, next) => {
    service
      .list(res.locals.query.motorId)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  // performedBy มาจาก token เสมอ — body ส่งมาไม่ได้ (schema เป็น strict)
  const create: RequestHandler = (req, res, next) => {
    service
      .create({ ...req.body, performedBy: req.user!.sub })
      .then((data) => res.status(201).json({ success: true, data }))
      .catch(next);
  };

  return { list, create };
}
