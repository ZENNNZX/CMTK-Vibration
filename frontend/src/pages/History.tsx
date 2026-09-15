import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';

import { KIND_RANK, kindOf, type EventKind } from '../constants/tokens';
import { api, type ApiError } from '../services/api';

interface AlarmEvent {
  id: number;
  motorId: number;
  tag: string;
  motorName: string;
  kind: string;
  metric: string;
  raisedAt: string;
  value: number | null;
  zoneFrom: string | null;
  zoneTo: string | null;
  acknowledgedBy: number | null;
  acknowledgedName: string | null;
  acknowledgedAt: string | null;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; events: AlarmEvent[] }
  | { kind: 'error'; message: string };

const TZ = 'Asia/Bangkok';
const partsTH = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

const dayOf = (iso: string) => Number(partsTH(iso).day);
const hhmm = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** ป้ายเดือนเป็น พ.ศ. ตามที่ใช้ทั้งระบบ */
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const name = new Intl.DateTimeFormat('th-TH', { month: 'long', timeZone: TZ }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
  return `${name} ${y + 543}`;
};

/** ย้อนหลัง 6 เดือนจากเดือนปัจจุบัน — ระบบเพิ่งเริ่มเก็บ ไกลกว่านี้ไม่มีอะไร */
const recentMonths = (now = new Date()) => {
  const p = partsTH(now.toISOString());
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1 - i, 15));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const daysInMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** สัปดาห์เริ่มวันจันทร์ — ปฏิทินโรงงานไทยอ่านแบบนี้ */
const leadingBlanks = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
};

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

/** วันหนึ่งมีหลายเหตุการณ์ — ปฏิทินโชว์ตัวที่หนักสุด */
const worst = (evs: AlarmEvent[]): EventKind =>
  KIND_RANK.find((k) => evs.some((e) => e.kind === k)) ?? 'zone_change';

export function History({ role }: { role: string }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0]);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [pick, setPick] = useState<number | null>(null);
  const selectId = useId();
  const canAck = role === 'maintenance' || role === 'admin';

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    api<AlarmEvent[]>(`/events?month=${month}`)
      .then((events) => setView({ kind: 'ready', events }))
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, [month]);

  useEffect(load, [load]);

  const byDay = useMemo(() => {
    if (view.kind !== 'ready') return new Map<number, AlarmEvent[]>();
    const m = new Map<number, AlarmEvent[]>();
    view.events.forEach((e) => {
      const d = dayOf(e.raisedAt);
      m.set(d, [...(m.get(d) ?? []), e]);
    });
    return m;
  }, [view]);

  // เลือกวันล่าสุดที่มีเหตุการณ์ให้เอง — เปิดมาต้องเห็นของ ไม่ใช่ช่องว่าง
  useEffect(() => {
    const days = [...byDay.keys()].sort((a, b) => a - b);
    setPick(days.length ? days[days.length - 1] : null);
  }, [byDay]);

  const ack = (e: AlarmEvent) => {
    api<AlarmEvent>(`/events/${e.id}/ack`, { method: 'POST' })
      .then((updated) =>
        setView((v) =>
          v.kind === 'ready'
            ? { ...v, events: v.events.map((x) => (x.id === updated.id ? updated : x)) }
            : v,
        ),
      )
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  };

  const total = view.kind === 'ready' ? view.events.length : 0;
  const unacked = view.kind === 'ready' ? view.events.filter((e) => !e.acknowledgedBy).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title font-semibold text-ink">ประวัติแจ้งเตือน</h1>
          {view.kind === 'ready' && (
            <p className="text-body text-ink-muted">
              {total > 0 ? (
                <>
                  {monthLabel(month)} มี {total} เหตุการณ์
                  {unacked > 0 ? (
                    <span className="text-warning"> · ยังไม่รับทราบ {unacked} รายการ</span>
                  ) : (
                    <span className="text-ok"> · รับทราบครบแล้ว</span>
                  )}
                </>
              ) : (
                `${monthLabel(month)} ไม่มีเหตุการณ์แจ้งเตือน`
              )}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={selectId} className="mb-1 block text-caption font-medium text-ink-secondary">
            เดือน
          </label>
          <select
            id={selectId}
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
      </div>

      {view.kind === 'loading' && (
        <p role="status" aria-live="polite" className="text-body text-ink-secondary">
          กำลังโหลดประวัติแจ้งเตือน…
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
        <div className="grid gap-4 lg:grid-cols-5">
          <section className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-3">
            <h2 className="mb-4 text-section font-semibold text-ink">{monthLabel(month)}</h2>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-caption text-ink-faint">
                  {d}
                </div>
              ))}
              {Array.from({ length: leadingBlanks(month) }, (_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {Array.from({ length: daysInMonth(month) }, (_, i) => {
                const day = i + 1;
                const evs = byDay.get(day);
                const on = pick === day;
                const k = evs ? kindOf(worst(evs)) : null;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!evs}
                    onClick={() => setPick(day)}
                    // AC-012-05 · Tab + Enter ใช้ได้เหมือนคลิก · วันที่ว่าง disabled ไม่ดูด focus
                    aria-label={`${day} ${monthLabel(month)} ${evs ? `มี ${evs.length} เหตุการณ์` : 'ไม่มีเหตุการณ์'}`}
                    aria-pressed={on}
                    className={`flex aspect-square flex-col items-center justify-center rounded-sm text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      on ? 'border-2 border-primary' : 'border border-hairline'
                    } ${evs ? 'bg-surface text-ink' : 'bg-canvas text-ink-faint'}`}
                  >
                    <span className={evs ? 'font-semibold' : ''}>{day}</span>
                    {k && <span className={`text-caption leading-none ${k.ink}`}>{k.glyph}</span>}
                  </button>
                );
              })}
            </div>

            {/* NFR-09 · สัญลักษณ์ต้องมีคำอธิบาย ไม่งั้นก็เป็นแค่สีอีกแบบ */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-hairline pt-3 text-caption text-ink-muted">
              {KIND_RANK.map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={kindOf(k).ink}>{kindOf(k).glyph}</span> {kindOf(k).text}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-2">
            <h2 className="mb-3 text-section font-semibold text-ink">
              {pick ? `${pick} ${monthLabel(month)}` : 'เลือกวัน'}
            </h2>

            {!pick ? (
              <p className="py-12 text-center text-body text-ink-muted">
                {total === 0 ? 'ไม่มีรายการให้แสดง' : 'คลิกวันที่มีเครื่องหมายในปฏิทิน'}
              </p>
            ) : (
              <ul className="space-y-2">
                {(byDay.get(pick) ?? []).map((e) => {
                  const k = kindOf(e.kind);
                  return (
                    <li key={e.id} className="rounded-sm border border-hairline p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-body font-medium text-ink">{e.tag}</div>
                          <div className="text-caption text-ink-muted">
                            {e.motorName}
                            {e.value !== null && <> · {e.value.toFixed(2)} mm/s</>}
                            {e.zoneFrom && e.zoneTo && <> · โซน {e.zoneFrom} → {e.zoneTo}</>}
                          </div>
                        </div>
                        <span className="shrink-0 text-caption tabular-nums text-ink-faint">
                          {hhmm.format(new Date(e.raisedAt))} น.
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-sm px-2 py-0.5 text-caption font-semibold ${k.badge}`}>
                          <span aria-hidden="true">{k.glyph} </span>
                          {k.text}
                        </span>

                        {e.acknowledgedBy ? (
                          <span className="flex items-center gap-1 text-caption text-ok">
                            <Check size={13} aria-hidden="true" /> รับทราบโดย {e.acknowledgedName ?? '—'}
                          </span>
                        ) : canAck ? (
                          <button
                            type="button"
                            onClick={() => ack(e)}
                            className="min-h-11 rounded-md border border-hairline px-3 text-body font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            รับทราบ
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-caption text-ink-faint">
                            <Lock size={12} aria-hidden="true" /> role manager กดไม่ได้
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
