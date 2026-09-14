import type { Db } from '../config/db.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'maintenance' | 'manager' | 'admin';
  is_active: boolean;
}

/** ชั้นนี้ทำแค่ query — ไม่มีตรรกะธุรกิจ (SOP-DEV-001) */
export function createUserRepository(db: Db) {
  return {
    async findByEmail(email: string): Promise<UserRow | null> {
      const res = (await db.query(
        `SELECT id, email, password_hash, display_name, role::text, is_active
           FROM users WHERE lower(email) = lower($1)`,
        [email],
      )) as { rows: UserRow[] };
      return res.rows[0] ?? null;
    },

    async touchLastLogin(id: number): Promise<void> {
      await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id]);
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
