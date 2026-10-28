import type { RequestHandler } from 'express';

import type { PredictionService } from '../services/predictionService.js';

export function createPredictionController(service: PredictionService) {
  const summary: RequestHandler = (_req, res, next) => {
    service
      .summary(res.locals.query.month, res.locals.query.threshold)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  const upcoming: RequestHandler = (_req, res, next) => {
    service
      .upcoming(res.locals.params.id, res.locals.query.metric)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  // เรียกมือได้ตอนตรวจงาน — ปกติ job รันเองทุกชั่วโมง
  const run: RequestHandler = (_req, res, next) => {
    Promise.all([service.generate(), service.scoreDue()])
      .then(([written, scored]) => res.json({ success: true, data: { written, scored } }))
      .catch(next);
  };

  return { summary, upcoming, run };
}
