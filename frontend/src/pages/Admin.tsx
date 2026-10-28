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

const CELL = 'border-b border-hairline py-2.5';
const INPUT =
  'min-h-11 w-full rounded-md border border-hairline bg-surface px-2 text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';
const BTN =
  'min-h-11 rounded-md px-3 text-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * แก้ในแถวเลย ไม่เปิด modal — สามช่อง กรอกเสร็จใน 10 วินาที
 * state อยู่ในแถวของตัวเอง ตารางข้างนอกจึงไม่ต้องรู้ว่าแถวไหนกำลังถูกแก้
 */
function Row({ m, onSaved }: { m: Motor; onSaved: (m: Motor) => void }) {
  const [draft, setDraft] = useState<{ tag: string; name: string; ratedKw: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = () =>
    setDraft({ tag: m.tag, name: m.name, ratedKw: m.ratedKw === null ? '' : String(m.ratedKw) });

  const close = () => {
    setDraft(null);
    setError('');
  };

  const save = () => {
    if (!draft) return;
    const kw = draft.ratedKw.trim();
    // เว้นว่าง = ไม่แตะค่าเดิม · ล้างค่าให้เป็น "ไม่ระบุ" ยังทำไม่ได้ ยังไม่มีใครขอ
    if (kw !== '' && !(Number(kw) > 0)) return setError('kW ต้องเป็นตัวเลขมากกว่า 0');

    setBusy(true);
    setError('');
    api<Motor>(`/motors/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        tag: draft.tag.trim(),
        name: draft.name.trim(),
        ...(kw === '' ? {} : { ratedKw: Number(kw) }),
      }),
    })
      .then((updated) => {
        onSaved(updated);
        close();
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setBusy(false));
  };

  if (!draft) {
    return (
      <tr>
        <td className={`${CELL} tabular-nums text-ink`}>
          master{m.masterNo} / {m.portNo}
        </td>
        <td className={`${CELL} font-medium text-ink`}>{m.tag}</td>
        <td className={`${CELL} text-ink-secondary`}>{m.name}</td>
        <td className={`${CELL} tabular-nums text-ink-secondary`}>
          {/* 0 กับ "ไม่รู้" ต่างกัน ห้ามโชว์ 0 ให้เข้าใจผิด */}
          {m.ratedKw ?? <span className="text-warning">ยังไม่ระบุ</span>}
        </td>
        <td className={`${CELL} text-ink-secondary`}>{m.sensorMount ?? '—'}</td>
        <td className={CELL}>
          <span className={m.isOnline ? 'text-ok' : 'text-offline'}>
            <span aria-hidden="true">{m.isOnline ? '● ' : '■ '}</span>
            {m.isOnline ? 'เชื่อมต่อ' : 'หลุด'}
          </span>
        </td>
        <td className={`${CELL} text-right`}>
          <button
            type="button"
            onClick={open}
            className={`${BTN} border border-hairline text-primary`}
          >
            แก้ไข
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className={`${CELL} tabular-nums text-ink`}>
        master{m.masterNo} / {m.portNo}
      </td>
      <td className={CELL}>
        <input
          className={INPUT}
          value={draft.tag}
          maxLength={32}
          aria-label={`รหัสของ ${m.tag}`}
          onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
        />
      </td>
      <td className={CELL}>
        <input
          className={INPUT}
          value={draft.name}
          maxLength={120}
          aria-label={`ชื่อของ ${m.tag}`}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </td>
      <td className={CELL}>
        <input
          className={`${INPUT} tabular-nums`}
          value={draft.ratedKw}
          inputMode="decimal"
          aria-label={`กำลัง kW ของ ${m.tag}`}
          onChange={(e) => setDraft({ ...draft, ratedKw: e.target.value })}
        />
      </td>
      <td className={`${CELL} text-ink-muted`} colSpan={2}>
        {error ? (
          <span role="alert" className="text-danger-ink">
            <span aria-hidden="true">■ </span>
            {error}
          </span>
        ) : (
          <span className="text-caption">จุดวัดกับสถานะแก้ที่หน้ารายละเอียดมอเตอร์</span>
        )}
      </td>
      <td className={`${CELL} whitespace-nowrap text-right`}>
        <button
          type="button"
          onClick={save}
          disabled={busy || draft.tag.trim() === '' || draft.name.trim() === ''}
          className={`${BTN} bg-primary text-on-primary disabled:opacity-40`}
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className={`${BTN} ml-2 border border-hairline text-ink`}
        >
          ยกเลิก
        </button>
      </td>
    </tr>
  );
}

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
                  <th className="border-b border-hairline py-2 text-right font-medium">
                    <span className="sr-only">การจัดการ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.motors.map((m) => (
                  <Row
                    key={m.id}
                    m={m}
                    onSaved={(updated) =>
                      setView({
                        kind: 'ready',
                        motors: view.motors.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)),
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
