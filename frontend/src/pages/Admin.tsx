import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';

import { MASTER_PORTS } from '../constants/tokens';
import { api, type ApiError } from '../services/api';

interface Motor {
  id: number;
  tag: string;
  name: string;
  masterNo: number;
  portNo: number;
  ratedKw: number | null;
  sensorMount: string | null;
  isOnline: boolean;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; motors: Motor[] }
  | { kind: 'error'; message: string };

export function Admin({ role }: { role: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const isAdmin = role === 'admin';

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    api<Motor[]>('/motors')
      .then((motors) => setView({ kind: 'ready', motors }))
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, []);

  // AC-002-02 · ไม่ใช่ admin ไม่ต้องยิง API เลย — backend ตอบ 403 อยู่แล้ว ยิงไปก็เสียเปล่า
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin)
    return (
      <div className="rounded-lg border border-hairline bg-surface p-8 text-center">
        <Lock size={24} className="mx-auto mb-3 text-ink-muted" aria-hidden="true" />
        <p className="text-body font-medium text-ink">หน้านี้เปิดให้เฉพาะ admin</p>
        <p className="mt-1 text-body text-ink-muted">role ปัจจุบันคือ {role} · API จะตอบ 403</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-page-title font-semibold text-ink">ผู้ดูแลระบบ</h1>
        <p className="text-body text-ink-muted">มอเตอร์และการผูกพอร์ตบน IO-Link Master</p>
      </div>

      {view.kind === 'loading' && (
        <p role="status" aria-live="polite" className="text-body text-ink-secondary">
          กำลังโหลดรายการมอเตอร์…
        </p>
      )}

      {view.kind === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-body text-ink">
            <span aria-hidden="true">■ </span>
            {view.message}
          </p>
          <button
            type="button"
            onClick={load}
            className="min-h-11 rounded-md bg-primary px-4 text-body font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {view.kind === 'ready' && (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <p className="mb-3 text-caption text-ink-muted">
            ใช้งาน {view.motors.length} จาก {MASTER_PORTS} พอร์ต
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="text-ink-faint">
                  {['พอร์ต', 'รหัส', 'ชื่อ', 'kW', 'จุดวัด', 'สถานะ'].map((h) => (
                    <th key={h} className="border-b border-hairline py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.motors.map((m) => (
                  <tr key={m.id}>
                    <td className="border-b border-hairline py-2.5 tabular-nums text-ink">
                      master{m.masterNo} / {m.portNo}
                    </td>
                    <td className="border-b border-hairline py-2.5 font-medium text-ink">{m.tag}</td>
                    <td className="border-b border-hairline py-2.5 text-ink-secondary">{m.name}</td>
                    <td className="border-b border-hairline py-2.5 tabular-nums text-ink-secondary">
                      {/* B-7 ยังไม่ปิด — 0 กับ "ไม่รู้" ต่างกัน ห้ามโชว์ 0 ให้เข้าใจผิด */}
                      {m.ratedKw ?? <span className="text-warning">ยังไม่ระบุ (B-7)</span>}
                    </td>
                    <td className="border-b border-hairline py-2.5 text-ink-secondary">
                      {m.sensorMount ?? '—'}
                    </td>
                    <td className="border-b border-hairline py-2.5">
                      <span className={m.isOnline ? 'text-ok' : 'text-offline'}>
                        <span aria-hidden="true">{m.isOnline ? '● ' : '■ '}</span>
                        {m.isOnline ? 'เชื่อมต่อ' : 'หลุด'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
