import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Info, Target, TriangleAlert } from 'lucide-react';

import { api, type ApiError } from '../services/api';

interface Score {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  accuracy: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  mae: number;
  mape: number;
  reliable: boolean;
}

interface Summary {
  month: string;
  threshold: number;
  overall: Score | null;
  perMotor: { motorId: number; tag: string; metric: string; score: Score | null }[];
  hasData: boolean;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: Summary }
  | { kind: 'error'; message: string };

/** null คือ "คำนวณไม่ได้" ไม่ใช่ศูนย์ — 0% แปลว่าทำนายแล้วผิดหมด คนละเรื่องกัน */
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const name = new Intl.DateTimeFormat('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
  return `${name} ${y + 543}`;
};

const recentMonths = () => {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

function Metric({ label, value, formula, hint }: { label: string; value: string; formula: string; hint: string }) {
  return (
    <div className="rounded-sm border border-hairline p-3">
      <div className="text-caption font-medium text-ink-muted">{label}</div>
      <div className="text-metric-hero font-semibold tabular-nums text-primary">{value}</div>
      <div className="mt-1 text-caption text-ink-faint">{formula}</div>
      <div className="mt-1 text-caption leading-snug text-ink-muted">{hint}</div>
    </div>
  );
}

export function MonthlySummary() {
  const months = useMemo(recentMonths, []);
  const [month, setMonth] = useState(months[0]);
  const [threshold, setThreshold] = useState(2.8);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const monthId = useId();
  const thrId = useId();

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    api<Summary>(`/predictions/summary?month=${month}&threshold=${threshold}`)
      .then((summary) => setView({ kind: 'ready', summary }))
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, [month, threshold]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title font-semibold text-ink">สรุปรายเดือน</h1>
          <p className="text-body text-ink-muted">
            ค่าที่ทำนายไว้ เทียบกับค่าที่วัดได้จริงเมื่อถึงวันนั้น
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={monthId} className="mb-1 block text-caption font-medium text-ink-secondary">
              เดือน
            </label>
            <select
              id={monthId}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-11 min-w-44 rounded-sm border border-hairline bg-surface px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {months.map((k) => (
                <option key={k} value={k}>
                  {monthLabel(k)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={thrId} className="mb-1 block text-caption font-medium text-ink-secondary">
              เกณฑ์ที่ใช้ตัดสิน (mm/s)
            </label>
            <input
              id={thrId}
              type="number"
              step="0.1"
              min="0.1"
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0.1, Number(e.target.value) || 0.1))}
              className="min-h-11 w-32 rounded-sm border border-hairline bg-surface px-3 text-body tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>
        </div>
      </div>

      {view.kind === 'loading' && (
        <p role="status" aria-live="polite" className="text-body text-ink-secondary">
          กำลังโหลดผลการทำนาย…
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Target size={16} className="text-primary" aria-hidden="true" />
            <h2 className="text-section font-semibold text-ink">ความแม่นยำของการทำนาย</h2>
            {/* DSN §7 · อย่าทำให้ระบบดูฉลาดกว่าที่เป็น */}
            <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-caption text-ink-secondary">
              สถิติเชิงเส้น · ยังไม่ใช่ ML
            </span>
          </div>

          {!view.summary.hasData || !view.summary.overall ? (
            <div className="space-y-3 py-6">
              <p className="text-center text-body font-medium text-ink">
                {monthLabel(month)} ยังไม่มีการทำนายที่ตรวจสอบผลได้
              </p>
              <p className="mx-auto max-w-2xl text-center text-body leading-relaxed text-ink-muted">
                ตัวเลขจะขึ้นเมื่อมีครบสองอย่าง: ระบบบันทึกค่าที่ทำนายไว้ล่วงหน้า
                และวันที่ทำนายถึงผ่านไปแล้วจนมีค่าจริงมาเทียบ
                <br />
                ตอนนี้ยังฟิตเส้นไม่ได้เพราะต้องมีค่าเฉลี่ยรายวันอย่างน้อย 4 วัน —
                ระบบเลือกที่จะไม่เดามากกว่าเดาแล้วให้ตัวเลขที่เชื่อไม่ได้
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-sm bg-canvas p-3">
                  <div className="text-caption text-ink-faint">คลาดเคลื่อนเฉลี่ย (MAE)</div>
                  <div className="text-metric-hero font-semibold tabular-nums text-ink">
                    {view.summary.overall.mae.toFixed(3)}
                    <span className="ml-1 text-body font-normal text-ink-faint">mm/s</span>
                  </div>
                  <div className="mt-1 text-caption text-ink-muted">
                    ทำนายพลาดจากค่าจริงเฉลี่ยเท่านี้ ยิ่งน้อยยิ่งดี
                  </div>
                </div>
                <div className="rounded-sm bg-canvas p-3">
                  <div className="text-caption text-ink-faint">คลาดเคลื่อนเป็นสัดส่วน (MAPE)</div>
                  <div className="text-metric-hero font-semibold tabular-nums text-ink">
                    {view.summary.overall.mape.toFixed(1)}
                    <span className="ml-1 text-body font-normal text-ink-faint">%</span>
                  </div>
                  <div className="mt-1 text-caption text-ink-muted">เทียบเป็นเปอร์เซ็นต์ของค่าจริง</div>
                </div>
              </div>

              <p className="mb-2 text-body text-ink-secondary">
                แปลงเป็นคำถามว่า{' '}
                <strong className="text-ink">“จะเกิน {view.summary.threshold} mm/s ไหม”</strong>{' '}
                แล้วนับผลได้ดังนี้
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-md">
                {(
                  [
                    ['TP', view.summary.overall.tp, 'ทำนายว่าเกิน · เกินจริง', 'text-ok'],
                    ['FP', view.summary.overall.fp, 'ทำนายว่าเกิน · ไม่เกินจริง', 'text-warning'],
                    ['FN', view.summary.overall.fn, 'ทำนายว่าไม่เกิน · แต่เกินจริง', 'text-alarm'],
                    ['TN', view.summary.overall.tn, 'ทำนายว่าไม่เกิน · ไม่เกินจริง', 'text-ok'],
                  ] as const
                ).map(([k, v, d, c]) => (
                  <div key={k} className="rounded-sm border border-hairline p-3">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-caption font-semibold ${c}`}>{k}</span>
                      <span className="text-metric font-semibold tabular-nums text-ink">{v}</span>
                    </div>
                    <div className="mt-0.5 text-caption leading-snug text-ink-muted">{d}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Accuracy" value={pct(view.summary.overall.accuracy)} formula="(TP+TN) ÷ ทั้งหมด" hint="ทายถูกกี่ครั้งจากทั้งหมด" />
                <Metric label="Precision" value={pct(view.summary.overall.precision)} formula="TP ÷ (TP+FP)" hint="เวลาบอกว่าจะเกิน เชื่อได้แค่ไหน" />
                <Metric label="Recall" value={pct(view.summary.overall.recall)} formula="TP ÷ (TP+FN)" hint="ของที่เกินจริง จับได้กี่เปอร์เซ็นต์" />
                <Metric label="F1" value={pct(view.summary.overall.f1)} formula="ค่าเฉลี่ยฮาร์มอนิก" hint="สมดุลระหว่างสองตัวบน" />
              </div>

              <div className="mt-4 border-t border-hairline pt-4">
                <h3 className="mb-1 text-body font-medium text-ink">แยกรายมอเตอร์</h3>
                <p className="mb-3 text-body text-ink-muted">
                  ค่ารวมด้านบนเฉลี่ยทุกตัวเข้าด้วยกัน ตารางนี้บอกว่าจริง ๆ แล้วพลาดที่ตัวไหน
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-body">
                    <thead>
                      <tr className="text-ink-faint">
                        {['มอเตอร์', 'เมตริก', 'ครั้ง', 'TP', 'FP', 'FN', 'TN', 'Accuracy', 'Recall', 'MAE'].map((h) => (
                          <th key={h} className="border-b border-hairline py-2 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {view.summary.perMotor.map((r) => (
                        <tr key={`${r.motorId}-${r.metric}`}>
                          <td className="border-b border-hairline py-2 font-medium text-ink">
                            {r.tag}
                            {r.score && !r.score.reliable && (
                              <span className="ml-2 text-caption text-warning">ยังเชื่อไม่ได้</span>
                            )}
                          </td>
                          <td className="border-b border-hairline py-2 text-ink-secondary">{r.metric}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ink-secondary">{r.score?.n ?? 0}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ok">{r.score?.tp ?? 0}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-warning">{r.score?.fp ?? 0}</td>
                          <td className="border-b border-hairline py-2 tabular-nums font-semibold text-alarm">{r.score?.fn ?? 0}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ink-secondary">{r.score?.tn ?? 0}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ink">{pct(r.score?.accuracy ?? null)}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ink">{pct(r.score?.recall ?? null)}</td>
                          <td className="border-b border-hairline py-2 tabular-nums text-ink-secondary">{r.score ? r.score.mae.toFixed(3) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {!view.summary.overall.reliable && (
                  <p className="flex items-start gap-2 rounded-sm bg-canvas p-3 text-body text-ink-secondary">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      <strong className="text-ink">ตัวอย่างน้อยเกินกว่าจะสรุปได้</strong> — มีเพียง{' '}
                      {view.summary.overall.n} ครั้ง การเปลี่ยนผลแค่ครั้งเดียวขยับตัวเลขได้ถึง{' '}
                      {(100 / view.summary.overall.n).toFixed(1)}% ควรมีอย่างน้อย 30 ครั้งก่อนใช้ตัดสินใจ
                    </span>
                  </p>
                )}
                <p className="flex items-start gap-2 rounded-sm bg-canvas p-3 text-body text-ink-secondary">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                  <span>
                    <strong className="text-ink">ค่ารวมนี้ดูดีเกินจริง</strong> —
                    มอเตอร์ที่อยู่ห่างเกณฑ์มากทำให้ได้ TN มาฟรี ๆ ซึ่งไปดัน Accuracy ขึ้น
                    ทั้งที่ตัวที่ยากจริงอาจพลาดอยู่ ให้ดูตารางแยกรายมอเตอร์ประกอบเสมอ
                    อย่าตัดสินจากตัวเลขรวมอย่างเดียว
                  </span>
                </p>
                <p className="flex items-start gap-2 rounded-sm bg-canvas p-3 text-body text-ink-secondary">
                  <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <strong className="text-ink">ในงานบำรุงรักษา Recall สำคัญกว่า Precision</strong> —
                    FN คือเครื่องที่กำลังจะมีปัญหาแต่ระบบบอกว่าปกติ ซึ่งแพงกว่า FP ที่แค่ทำให้ช่างเดินไปดูเก้อ
                  </span>
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
