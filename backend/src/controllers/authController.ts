import type { RequestHandler } from 'express';

import type { AuthService } from '../services/authService.js';

/** ชั้นนี้รับ request กับส่ง response เท่านั้น ตรรกะอยู่ใน service (SOP-DEV-001) */
export function createAuthController(service: AuthService) {
  const login: RequestHandler = (req, res, next) => {
    const { email, password } = req.body as { email: string; password: string };
    service
      .login(email, password)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  };

  const me: RequestHandler = (req, res) => {
    res.json({
      success: true,
      data: {
        id: req.user!.sub,
        email: req.user!.email,
        displayName: req.user!.displayName,
        role: req.user!.role,
      },
    });
  };

  // JWT ไม่มี state ฝั่งเซิร์ฟเวอร์ — logout คือฝั่งผู้ใช้ทิ้ง token
  // ponytail: ไม่ทำ blacklist จนกว่าจะมีข้อกำหนดให้ยกเลิก token กลางคัน
  const logout: RequestHandler = (_req, res) => {
    res.json({ success: true, data: { message: 'ออกจากระบบแล้ว' } });
  };

  return { login, me, logout };
}
