import pg from 'pg';

/** สิ่งเดียวที่ route ต้องการจาก pool — ทำให้เทสต์ส่งตัวปลอมเข้ามาได้โดยไม่ต้องมี DB จริง */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export const createPool = (connectionString: string, max: number): pg.Pool =>
  new pg.Pool({ connectionString, max });
