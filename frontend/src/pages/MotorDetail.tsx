import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, Save } from 'lucide-react';
import {
  CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import { MotorMount3DLazy, type Offset } from '../components/MotorMount3DLazy';
import { ZoneBand } from '../components/ZoneBand';
import { ZONE, type Zone } from '../constants/tokens';
import { api, type ApiError } from '../services/api';

interface Detail {
  id: number;
  tag: string;
  name: string;
  masterNo: number;
  portNo: number;
  ratedKw: number | null;
  sensorMount: string | null;
  sensorMountOffset: Offset | null;
  warningThreshold: number | null;
  alarmThreshold: number | null;
  runHours: number | null;
  isOnline: boolean;
}

interface Reading {
  ts: string;
  vrmsY: number | null;
  vrmsZ: number | null;
  temperature: number | null;
  zone: Zone | null;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: Detail; readings: Reading[] }
  | { kind: 'error'; message: string };

/**
 * ช่วงเวลาไล่จากสั้นไปยาว — ระบบเพิ่งเริ่มเก็บ ช่วงที่มีข้อมูลจริงคือหลักชั่วโมง
 * ปุ่มที่กดแล้วได้กราฟว่างทุกครั้งไม่ช่วยใคร ขยับเพดานขึ้นเมื่อข้อมูลสะสมพอ
 */
const RANGES = [
  { hours: 1, label: '1 ชม.' },
  { hours: 6, label: '6 ชม.' },
  { hours: 24, label: '24 ชม.' },
  { hours: 168, label: '7 วัน' },
];

const TZ = 'Asia/Bangkok';
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('th-TH', { timeZone: TZ, ...opts });
const hhmm = fmt({ hour: '2-digit', minute: '2-digit' });
const dayMon = fmt({ day: 'numeric', month: 'short' });
const full = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** ช่วงสั้นอ่านเป็นนาฬิกา ช่วงยาวอ่านเป็นวันที่ — ป้ายแกนต้องเปลี่ยนตามความยาวของช่วง */
const tick = (hours: number) => (ts: number) => (hours <= 24 ? hhmm : dayMon).format(new Date(ts));


interface Draft {
  warningThreshold: number | null;
  alarmThreshold: number | null;
  sensorMount: string | null;
  sensorMountOffset: Offset | null;
}

/**
 * DSN §4 save-bar · แถบบันทึกโผล่เฉพาะตอนมีของค้าง และต้องบอกว่าเปลี่ยนอะไรไปบ้าง
 * เก็บ draft แยกจากค่าจริง เพื่อให้ยกเลิกแล้วกลับเป็นเดิมได้จริง
 */
function useEdit(m: Detail, onSaved: (d: Detail) => void, role: string) {
  const saved: Draft = useMemo(
    () => ({
      warningThreshold: m.warningThreshold,
      alarmThreshold: m.alarmThreshold,
      sensorMount: m.sensorMount,
      sensorMountOffset: m.sensorMountOffset,
    }),
    [m.warningThreshold, m.alarmThreshold, m.sensorMount, m.sensorMountOffset],
  );
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(saved), [saved]);

  const changes = useMemo(() => {
    const out: string[] = [];
    if (draft.warningThreshold !== saved.warningThreshold)
      out.push(`เส้น Warning → ${draft.warningThreshold ?? '—'} mm/s`);
    if (draft.alarmThreshold !== saved.alarmThreshold)
      out.push(`เส้น Alarm → ${draft.alarmThreshold ?? '—'} mm/s`);
    if (draft.sensorMount !== saved.sensorMount) out.push(`จุดวัด → ${draft.sensorMount ?? '—'}`);
    // เทียบพิกัดด้วย JSON — เป็น array สามตัว เทียบ !== ตรง ๆ จะไม่ตรงทุกครั้งที่ re-render
    if (JSON.stringify(draft.sensorMountOffset) !== JSON.stringify(saved.sensorMountOffset))
      out.push(draft.sensorMountOffset ? 'ตำแหน่งบนโมเดล 3D' : 'คืนตำแหน่งมาตรฐาน');
    return out;
  }, [draft, saved]);

  const save = () => {
    const body: Record<string, unknown> = {};
    if (draft.warningThreshold !== saved.warningThreshold) body.warningThreshold = draft.warningThreshold;
    if (draft.alarmThreshold !== saved.alarmThreshold) body.alarmThreshold = draft.alarmThreshold;
    if (draft.sensorMount !== saved.sensorMount) body.sensorMount = draft.sensorMount;
    if (JSON.stringify(draft.sensorMountOffset) !== JSON.stringify(saved.sensorMountOffset))
      body.sensorMountOffset = draft.sensorMountOffset;
    setBusy(true);
    setError('');
    api<Detail>(`/motors/${m.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(onSaved)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return {
    draft,
    set: (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })),
    revert: () => { setDraft(saved); setError(''); },
    changes,
    dirty: changes.length > 0,
    canEdit: role === 'maintenance' || role === 'admin',
    busy,
    error,
    save,
  };
}

export function MotorDetail({
  motorId,
  onBack,
  role,
}: {
  motorId: number;
  onBack: () => void;
  role: string;
}) {
  const [hours, setHours] = useState(6);
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    Promise.all([
      api<Detail>(`/motors/${motorId}`),
      api<Reading[]>(`/motors/${motorId}/readings?hours=${hours}`),
    ])
      .then(([detail, readings]) => setView({ kind: 'ready', detail, readings }))
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, [motorId, hours]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1 text-body text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronLeft size={16} aria-hidden="true" /> กลับหน้ารวม
      </button>

      {view.kind === 'loading' && (
        <p role="status" aria-live="polite" className="text-body text-ink-secondary">
          กำลังโหลดข้อมูลมอเตอร์…
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
        <Ready
          detail={view.detail}
          readings={view.readings}
          hours={hours}
          onHours={setHours}
          role={role}
          onSaved={(d) => setView({ kind: 'ready', detail: d, readings: view.readings })}
        />
      )}
    </div>
  );
}

function Ready({
  detail: m,
  readings,
  hours,
  onHours,
  role,
  onSaved,
}: {
  detail: Detail;
  readings: Reading[];
  hours: number;
  onHours: (h: number) => void;
  role: string;
  onSaved: (d: Detail) => void;
}) {
  const edit = useEdit(m, onSaved, role);
  const latest = readings.length ? readings[readings.length - 1] : null;
  const warn = edit.draft.warningThreshold;
  const alarm = edit.draft.alarmThreshold;
  const rows = readings.map((r) => ({ ...r, t: new Date(r.ts).getTime() }));
  const peak = rows.reduce((mx, r) => Math.max(mx, r.vrmsY ?? 0, r.vrmsZ ?? 0), 0);
  const yMax = Math.max((alarm ?? 0) * 1.15, peak * 1.1, 1);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page-title font-semibold text-ink">{m.tag}</h1>
          <p className="text-body text-ink-muted">
            {m.name}
            {m.ratedKw !== null && <> · {m.ratedKw} kW</>} · master{m.masterNo} / port{m.portNo}
            {m.sensorMount && <> · จุดวัด {m.sensorMount}</>}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="rounded-md border border-hairline bg-surface px-3 py-2">
            <div className="text-caption leading-none text-ink-faint">ชั่วโมงเดินเครื่อง</div>
            <div className="text-metric font-semibold leading-tight text-primary">
              {(m.runHours ?? 0).toLocaleString('th-TH')}
              <span className="ml-1 text-caption font-normal text-ink-faint">ชม.</span>
            </div>
          </div>

          <div className="w-full sm:w-64">
            <ZoneBand zone={latest?.zone ?? null} size="lg" />
            <p className="mt-1 text-caption text-ink-muted">
              {latest?.zone ? ZONE[latest.zone].label : 'ยังไม่ทราบระดับ'}
            </p>
          </div>
        </div>
      </div>

      {/* อยู่เหนือกราฟ เพราะตำแหน่งติดตั้งเป็นบริบทของตัวเลขที่จะอ่านต่อ */}
      <MotorMount3DLazy
        mount={edit.draft.sensorMount ?? 'DE-H'}
        offset={edit.draft.sensorMountOffset}
        canEdit={edit.canEdit}
        onMount={(id) => edit.set({ sensorMount: id, sensorMountOffset: null })}
        onOffset={(o) => edit.set({ sensorMountOffset: o })}
      />

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-section font-semibold text-ink">แนวโน้มการสั่นสะเทือน</h2>
            <p className="text-caption text-ink-muted">
              {rows.length
                ? `${full.format(new Date(rows[0].t))} – ${full.format(new Date(rows[rows.length - 1].t))} น. · ${rows.length.toLocaleString('th-TH')} จุด`
                : 'ไม่มีข้อมูลในช่วงที่เลือก'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1" role="group" aria-label="ช่วงเวลา">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                type="button"
                onClick={() => onHours(r.hours)}
                aria-pressed={hours === r.hours}
                className={`min-h-11 rounded-md border px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  hours === r.hours
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-hairline text-ink'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
            <p className="text-body font-medium text-ink">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
            <p className="text-body text-ink-muted">
              ระบบเก็บค่าทุกนาที · ถ้าเพิ่งติดตั้งเซ็นเซอร์ ข้อมูลจะเริ่มแสดงภายในหนึ่งนาที
            </p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                {/* แถบโซนเป็นพื้นหลัง — บอกว่าค่าที่เห็นอยู่ตรงไหนของ ISO 10816 โดยไม่ต้องเทียบตัวเลข */}
                {warn !== null && <ReferenceArea y1={0} y2={warn} fill="var(--color-ok)" fillOpacity={0.09} />}
                {warn !== null && alarm !== null && (
                  <ReferenceArea y1={warn} y2={alarm} fill="var(--color-warning)" fillOpacity={0.11} />
                )}
                {alarm !== null && (
                  <ReferenceArea y1={alarm} y2={yMax} fill="var(--color-alarm)" fillOpacity={0.1} />
                )}
                <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={tick(hours)}
                  tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                  tickMargin={6}
                />
                <YAxis
                  domain={[0, +yMax.toFixed(1)]}
                  tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                  unit=" mm/s"
                  width={70}
                />
                <Tooltip
                  labelFormatter={(v) => `${full.format(new Date(Number(v)))} น.`}
                  formatter={(v, n) => [typeof v === 'number' ? `${v.toFixed(3)} mm/s` : '—', n]}
                />
                <Line type="monotone" dataKey="vrmsY" name="v-RMS Y" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="vrmsZ" name="v-RMS Z" stroke="var(--color-secondary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                {warn !== null && (
                  <ReferenceLine y={warn} stroke="var(--color-warning)" strokeWidth={2}
                    label={{ value: `Warning ${warn}`, position: 'insideTopRight', fill: 'var(--color-warning)', fontSize: 11 }} />
                )}
                {alarm !== null && (
                  <ReferenceLine y={alarm} stroke="var(--color-alarm)" strokeWidth={2}
                    label={{ value: `Alarm ${alarm}`, position: 'insideTopRight', fill: 'var(--color-alarm)', fontSize: 11 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* NFR-09 · เส้นในกราฟแยกด้วยสี จึงต้องมีคำอธิบายเป็นข้อความกำกับเสมอ */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-3 text-caption text-ink-muted">
          <span>เส้นน้ำเงิน = v-RMS แกน Y</span>
          <span>เส้นฟ้า = v-RMS แกน Z</span>
          {warn !== null && <span>เส้นส้ม = Warning {warn} mm/s</span>}
          {alarm !== null && <span>เส้นแดง = Alarm {alarm} mm/s</span>}
        </div>
        <p className="mt-2 text-caption text-ink-faint">
          ค่าเริ่มต้น 2.8 / 4.5 คือขอบโซน B→C และ C→D ตาม ISO 10816-3 กลุ่ม 2 ยึดแบบแข็ง ·
          ตัวเลขจริงต้องยืนยันกับคลาสของมอเตอร์แต่ละตัว (B-7)
        </p>
      </section>

      <EditPanel edit={edit} />

      {/* DSN §4 save-bar · โผล่เฉพาะตอนมีของค้างยังไม่บันทึก */}
      {edit.dirty && (
        <div className="sticky bottom-3 z-40">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary bg-surface px-4 py-3 shadow-[0_6px_24px_rgba(16,32,56,.14)]">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            <div className="flex-1">
              <p className="text-body font-medium text-ink">
                มี {edit.changes.length} รายการที่ยังไม่ได้บันทึก
              </p>
              <p className="text-caption text-ink-muted">{edit.changes.join(' · ')}</p>
              {edit.error && (
                <p role="alert" className="mt-1 text-caption text-danger-ink">
                  <span aria-hidden="true">■ </span>
                  {edit.error}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={edit.revert}
              className="min-h-11 rounded-md border border-hairline px-4 text-body font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={edit.save}
              disabled={edit.busy}
              className="flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-body font-semibold text-on-primary disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Save size={16} aria-hidden="true" />
              บันทึก
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function EditPanel({ edit }: { edit: ReturnType<typeof useEdit> }) {
  const warnId = useId();
  const alarmId = useId();
  const { draft, set, canEdit } = edit;

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h2 className="mb-1 text-section font-semibold text-ink">ค่าตั้งของมอเตอร์ตัวนี้</h2>
      <p className="mb-3 text-caption text-ink-muted">
        {canEdit
          ? 'เกณฑ์ที่ตั้งไว้ใช้กับกราฟด้านบนและการแจ้งเตือน'
          : 'role manager ดูได้อย่างเดียว · แก้ค่าไม่ได้'}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={warnId} className="mb-1 block text-caption font-medium text-ink-secondary">
            เส้น Warning (mm/s)
          </label>
          <input
            id={warnId}
            type="number"
            step="0.1"
            min="0"
            disabled={!canEdit}
            value={draft.warningThreshold ?? ''}
            onChange={(e) => set({ warningThreshold: e.target.value === '' ? null : Number(e.target.value) })}
            className="min-h-11 w-full rounded-sm border border-hairline bg-surface px-3 text-body tabular-nums disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <div>
          <label htmlFor={alarmId} className="mb-1 block text-caption font-medium text-ink-secondary">
            เส้น Alarm (mm/s)
          </label>
          <input
            id={alarmId}
            type="number"
            step="0.1"
            min="0"
            disabled={!canEdit}
            value={draft.alarmThreshold ?? ''}
            onChange={(e) => set({ alarmThreshold: e.target.value === '' ? null : Number(e.target.value) })}
            className="min-h-11 w-full rounded-sm border border-hairline bg-surface px-3 text-body tabular-nums disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

      </div>
    </section>
  );
}
