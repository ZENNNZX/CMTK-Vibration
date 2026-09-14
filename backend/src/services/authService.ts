import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AppError } from '../middlewares/errorHandler.js';
import type { UserRepository } from '../repositories/userRepository.js';

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

export interface TokenClaims {
  sub: number;
  email: string;
  displayName: string;
  role: string;
}

const TOKEN_TTL = '8h';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

/**
 * AC-001-02 · รหัสผิดกับไม่มีผู้ใช้ต้องแยกไม่ออก — ข้อความและ status เดียวกันเสมอ
 * ห้ามบอกใบ้ว่า email นั้นมีอยู่จริง
 */
const SAME_ANSWER = () => new AppError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');

export function createAuthService(repo: UserRepository, jwtSecret: string) {
  // AC-001-05 · นับความพยายามที่ล้มเหลวต่ออีเมล
  // ponytail: นับในหน่วยความจำของ process เดียว — ย้ายไปเก็บใน DB หรือ Redis เมื่อมี API หลาย instance
  const failures = new Map<string, { n: number; until: number }>();

  return {
    async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
      const key = email.toLowerCase();
      const state = failures.get(key);
      if (state && state.n >= MAX_ATTEMPTS && Date.now() < state.until) {
        throw new AppError(429, 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่');
      }

      const user = await repo.findByEmail(email);
      // เทียบ hash เสมอแม้ไม่พบผู้ใช้ ไม่งั้นเวลาตอบต่างกันจนเดาได้ว่า email มีจริง
      const hash = user?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
      const ok = await bcrypt.compare(password, hash);

      if (!user || !user.is_active || !ok) {
        const n = (state?.n ?? 0) + 1;
        failures.set(key, { n, until: Date.now() + LOCK_MS });
        throw SAME_ANSWER();
      }

      failures.delete(key);
      await repo.touchLastLogin(user.id);

      const claims: TokenClaims = {
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      };
      return {
        token: jwt.sign(claims, jwtSecret, { expiresIn: TOKEN_TTL }),
        user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
      };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
