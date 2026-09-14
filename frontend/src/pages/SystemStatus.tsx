import { useCallback, useEffect, useState } from 'react';

import { api, type ApiError } from '../services/api';

interface Health {
  status: string;
  database: string;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; health: Health }
  | { kind: 'error'; message: string };

/**
 * หน้าสถานะระบบ — หน้าจอแรกที่พิสูจน์ว่าสายทั้งเส้นต่อถึงกัน
 * frontend → express.static → /api/health → PostgreSQL
 *
 * NFR-09 · สีห้ามเป็นสัญญาณเดียว ทุกสถานะมีสัญลักษณ์ + ข้อความกำกับ
 * NFR-10 · มีครบ loading / error + ปุ่มลองใหม่ (ไม่มี empty เพราะสถานะมีค่าเสมอ)
 */
export function SystemStatus() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const check = useCallback(() => {
    setView({ kind: 'loading' });
    api<Health>('/health')
      .then((health) => setView({ kind: 'ok', health }))
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, []);

  useEffect(check, [check]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-page-title font-semibold text-ink">สถานะระบบ</h1>
      <p className="mt-1 text-caption text-ink-muted">CMTK Condition Monitoring · GS Battery</p>

      <section className="mt-4 rounded-lg border border-hairline bg-surface p-4">
        {view.kind === 'loading' && (
          <p role="status" aria-live="polite" className="text-body text-ink-secondary">
            ● กำลังตรวจสอบการเชื่อมต่อ…
          </p>
        )}

        {view.kind === 'ok' && (
          <p role="status" aria-live="polite" className="text-body text-ok">
            ● <span className="text-ink">ฐานข้อมูลเชื่อมต่อได้</span>
          </p>
        )}

        {view.kind === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-body text-alarm">
              ■ <span className="text-ink">{view.message}</span>
            </p>
            <button
              type="button"
              onClick={check}
              className="min-h-[44px] rounded-md bg-primary px-4 text-body font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              ลองใหม่
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
