import { Router } from 'express';

import type { Db } from '../config/db.js';
import { createAuthController } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAuthService } from '../services/authService.js';
import { loginSchema } from '../validators/authValidators.js';

export function authRoute(db: Db, jwtSecret: string): Router {
  const c = createAuthController(createAuthService(createUserRepository(db), jwtSecret));
  const router = Router();

  // public โดยตั้งใจ — จุดเดียวที่ยังไม่มี token ให้ตรวจ (NFR-01)
  router.post('/auth/login', validateBody(loginSchema), c.login);

  router.get('/auth/me', authenticate(jwtSecret), c.me);
  router.post('/auth/logout', authenticate(jwtSecret), c.logout);

  return router;
}
