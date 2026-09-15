import { useCallback, useEffect, useId, useState } from 'react';
import { Lock, Save } from 'lucide-react';

import { api, type ApiError } from '../services/api';

/** ตรงกับ enum cause_code ใน migration 001 — ฝั่ง backend ตรวจซ้ำอีกชั้น */
const CAUSE_CODES = ['bearing', 'misalignment', 'imbalance', 'looseness', 'lubrication', 'other'];

interface MotorOption {
  id: number;
  tag: string;
  name: string;
}

interface Log {
  id: number;
  motorId: number;
  tag: string;
  motorName: string;
  cause: string;
  description: string | null;
  performedName: string | null;
  performedAt: string;
  resetRunHours: boolean;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; motors: MotorOption[]; logs: Log[] }
  | { kind: 'error'; message: string };

const dateTH = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function Maintenance({ role }: { role: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [motorId, setMotorId] = useState<number | null>(null);
  const [cause, setCause] = useState('');
  const [description, setDescription] = useState('');
  const [resetRunHours, setResetRunHours] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const motorSelectId = useId();
  const descId = useId();
  const canWrite = role === 'maintenance' || role === 'admin';

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    Promise.all([api<MotorOption[]>('/motors'), api<Log[]>('/maintenance')])
      .then(([motors, logs]) => {
        setView({ kind: 'ready', motors, logs });
        setMotorId((cur) => cur ?? motors[0]?.id ?? null);
      })
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, []);

  useEffect(load, [load]);

  const submit = () => {
    // AC-014-02 · ไม่เลือกสาเหตุแล้วบันทึกไม่ได้ — ดักฝั่งนี้ก่อนเพื่อบอกทันที
    if (!cause) return setFormError('เลือกสาเหตุก่อนบันทึก');
    if (motorId === null) return setFormError('เลือกมอเตอร์ก่อนบันทึก');
    setFormError('');
    setBusy(true);
    api<Log>('/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        motorId,
        cause,
        resetRunHours,
        ...(description ? { description } : {}),
      }),
    })
      .then((created) => {
        setView((v) => (v.kind === 'ready' ? { ...v, logs: [created, ...v.logs] } : v));
        setCause('');
        setDescription('');
        setResetRunHours(false);
      })
      .catch((err: ApiError) => setFormError(err.message))
      .finally(() => setBusy(false));
  };

  if (view.kind === 'loading')
    return (
      <p role="status" aria-live="polite" className="text-body text-ink-secondary">
        กำลังโหลดประวัติงานซ่อม…
      </p>
    );

  if (view.kind === 'error')
    return (
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
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-page-title font-semibold text-ink">บันทึกซ่อม</h1>
        <p className="text-body text-ink-muted">ทุกครั้งที่เข้าซ่อม ต้องระบุสาเหตุ</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-3">
          {canWrite ? (
            <div className="space-y-4">
              <div>
                <label htmlFor={motorSelectId} className="mb-1 block text-caption font-medium text-ink-secondary">
                  มอเตอร์
                </label>
                <select
                  id={motorSelectId}
                  value={motorId ?? ''}
                  onChange={(e) => setMotorId(Number(e.target.value))}
                  className="min-h-11 w-full rounded-sm border border-hairline bg-surface px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {view.motors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="mb-1 block text-caption font-medium text-ink-secondary">สาเหตุ</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="สาเหตุ">
                  {CAUSE_CODES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCause(c);
                        setFormError('');
                      }}
                      aria-pressed={cause === c}
                      className={`min-h-11 rounded-md border px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        cause === c ? 'border-primary bg-primary text-on-primary' : 'border-hairline text-ink'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-caption text-ink-faint">
                  ไม่เลือกจะบันทึกไม่ได้ — AC-014-02
                </span>
              </div>

              <div>
                <label htmlFor={descId} className="mb-1 block text-caption font-medium text-ink-secondary">
                  รายละเอียดงาน
                </label>
                <textarea
                  id={descId}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                />
              </div>

              <label className="flex items-center gap-2 text-body text-ink">
                <input
                  type="checkbox"
                  checked={resetRunHours}
                  onChange={(e) => setResetRunHours(e.target.checked)}
                  className="h-5 w-5"
                />
                รีเซ็ตชั่วโมงเดินเครื่องหลังซ่อม
              </label>

              {formError && (
                <p role="alert" className="rounded-sm bg-danger-surface px-3 py-2 text-body text-danger-ink">
                  <span aria-hidden="true">■ </span>
                  {formError}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-body font-semibold text-on-primary disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Save size={16} aria-hidden="true" />
                {busy ? 'กำลังบันทึก…' : 'บันทึกงานซ่อม'}
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-2 py-8 text-body text-ink-muted">
              <Lock size={16} aria-hidden="true" /> role manager บันทึกไม่ได้ — ดูประวัติได้อย่างเดียว
            </p>
          )}
        </section>

        <section className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-2">
          <h2 className="mb-2 text-section font-semibold text-ink">ทำไมต้องกรอกสาเหตุ</h2>
          <p className="text-body leading-relaxed text-ink-secondary">
            เส้นทำนายในหน้ามอเตอร์ใช้สถิติ ทำนายได้แค่ว่าค่าจะขึ้นไปถึงไหน แต่บอกไม่ได้ว่าเพราะอะไร
          </p>
          <p className="mt-3 text-body leading-relaxed text-ink-secondary">
            ช่องสาเหตุนี้คือสิ่งเดียวที่จะทำให้ระบบบอกได้ในอนาคตว่า “แนวโน้มแบบนี้ที่ผ่านมาคือแบริ่ง”
            <strong className="text-ink"> ย้อนกลับไปสร้างทีหลังไม่ได้</strong>
          </p>
        </section>
      </div>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-section font-semibold text-ink">ประวัติงานซ่อม</h2>
        {view.logs.length === 0 ? (
          <p className="py-8 text-center text-body text-ink-muted">
            ยังไม่มีประวัติงานซ่อม — บันทึกแรกจะขึ้นที่นี่
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="text-ink-faint">
                  {['เมื่อไหร่', 'มอเตอร์', 'สาเหตุ', 'รายละเอียด', 'ผู้บันทึก'].map((h) => (
                    <th key={h} className="border-b border-hairline py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="border-b border-hairline py-2.5 tabular-nums text-ink-secondary">
                      {dateTH.format(new Date(l.performedAt))} น.
                    </td>
                    <td className="border-b border-hairline py-2.5 font-medium text-ink">{l.tag}</td>
                    <td className="border-b border-hairline py-2.5 text-ink">{l.cause}</td>
                    <td className="border-b border-hairline py-2.5 text-ink-secondary">
                      {l.description ?? '—'}
                      {l.resetRunHours && (
                        <span className="ml-2 text-caption text-primary">· รีเซ็ตชั่วโมงแล้ว</span>
                      )}
                    </td>
                    <td className="border-b border-hairline py-2.5 text-ink-secondary">
                      {l.performedName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
