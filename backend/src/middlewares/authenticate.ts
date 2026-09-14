import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import type { TokenClaims } from '../services/authService.js';
import { AppError } from './errorHandler.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenClaims;
  }
}

/** AC-002-04 · ไม่มี token หรือ token ใช้ไม่ได้ → 401 (รวมกรณีหมดอายุ AC-001-04) */
export const authenticate =
  (jwtSecret: string): RequestHandler =>
  (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next(new AppError(401, 'กรุณาเข้าสู่ระบบ'));

    try {
      req.user = jwt.verify(token, jwtSecret) as unknown as TokenClaims;
      next();
    } catch {
      // ไม่แยกว่าหมดอายุหรือลายเซ็นผิด — ฝั่งผู้ใช้ทำอย่างเดียวกันคือ login ใหม่
      next(new AppError(401, 'กรุณาเข้าสู่ระบบใหม่'));
    }
  };

/** AC-002-01, AC-002-02 · role ไม่พอ → 403 ห้ามตอบ 404 แทน */
export const authorize =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) =>
    next(req.user && roles.includes(req.user.role) ? undefined : new AppError(403, 'สิทธิ์ไม่เพียงพอ'));
