import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
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
  /** เร่งสูงสุด (g) — มาทาง InfluxDB เท่านั้น และเฉพาะพอร์ตที่เปิด a-Peak ใน BCM Assistant */
  aPeak: number | null;
  /** เร่ง RMS (g) — หน่วยเดียวกับ aPeak · ยังไม่เปิดทุกพอร์ต */
  aRms: number | null;
  zone: Zone | null;
}

/** แถวที่พร้อมวาด — crest คำนวณตอนวาด ไม่เก็บลงฐาน ค่าที่หารได้จากสองคอลัมน์ไม่ต้องมีที่อยู่ของตัวเอง */
type Row = Reading & {
  t: number;
  crest: number | null;
  /** ค่าทำนายของแต่ละแกน — วันที่ผ่านไปแล้ววางบนแถวจริงใกล้เที่ยงที่สุด ให้เทียบกับเส้นจริงได้ */
  fcY: number | null;
  fcZ: number | null;
};

/**
 * backend ไม่ส่งช่วงที่ว่าง (createEmpty: false) จึงไม่มี null ให้ connectNulls={false} ตัดเส้น
 * กราฟเลยลากเส้นตรงข้ามช่วงที่บอร์ดไม่ได้บันทึก ดูเหมือนมีค่าจริง — แทรกแถว null ตรงช่องที่ห่างเกิน 3 เท่าของระยะปกติ
 * และต้องห่างอย่างน้อย 5 นาที: วันที่บอร์ดเก็บได้ไม่ครบ ข้อมูลจะเว้นช่วงละไม่กี่นาทีถี่ ๆ (วัดได้สูงสุดราว 4.5 นาที)
 * ถ้าตัดตามระยะปกติอย่างเดียว ช่วง 1 ชม./6 ชม. (หน้าต่าง 15 วิ/1 นาที) จะขาดเป็นท่อน ๆ และมีจุดโดดที่มองไม่เห็น
 * ทำฝั่งนี้แทน backend เพราะครอบทั้งทาง InfluxDB และทางถอยไป Postgres และไม่ทำให้แถวสุดท้าย (latest) กลายเป็น null
 */
const MIN_GAP_MS = 5 * 60_000;

export function breakGaps(rows: Row[]): Row[] {
  const steps = rows.slice(1).map((r, i) => r.t - rows[i].t).sort((a, b) => a - b);
  const step = steps[Math.floor(steps.length / 2)];
  if (!step) return rows;
  const out: Row[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (prev && r.t - prev.t > Math.max(step * 3, MIN_GAP_MS)) {
      const t = prev.t + step;
      out.push({
        ...prev, t, ts: new Date(t).toISOString(),
        vrmsY: null, vrmsZ: null, temperature: null, aPeak: null, aRms: null, crest: null, zone: null,
      });
    }
    out.push(r);
  }
  return out;
}

/** ค่าที่ระบบทำนายไว้ล่วงหน้า — อ่านจากตาราง predictions ไม่ได้ฟิตใหม่ที่ฝั่งนี้ */
interface Forecast {
  targetDay: string;
  horizonDays: number;
  predicted: number;
}

type View =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      detail: Detail;
      readings: Reading[];
      forecast: Forecast[];
      forecastZ: Forecast[];
    }
  | { kind: 'error'; message: string };

/**
 * ขอข้อมูลได้สองแบบ — ปุ่มสำเร็จรูป (ย้อนหลังจากตอนนี้) หรือเลือกวันที่เอง
 * เก็บเป็นชนิดเดียวกัน เพราะทั้งกราฟหลักและกราฟรองต้องรู้ความยาวช่วงเหมือนกัน
 */
type Range = { kind: 'preset'; hours: number } | { kind: 'custom'; from: string; to: string };

/**
 * `<input type="date">` คืน 'YYYY-MM-DD' ซึ่งหมายถึงวันตามปฏิทินของผู้ใช้
 * ถ้าปล่อยให้ new Date() เดาเอง มันจะอ่านเป็นเที่ยงคืน UTC = 07:00 น. บ้านเรา ข้อมูลเช้าหาย 7 ชม.
 * ทั้งระบบแสดงเวลาไทยอยู่แล้ว (TZ ข้างบน) จึงผูก offset ให้ชัดตรงนี้
 */
const TZ_OFFSET = '+07:00';
const startOf = (d: string) => `${d}T00:00:00.000${TZ_OFFSET}`;
const endOf = (d: string) => `${d}T23:59:59.999${TZ_OFFSET}`;

const rangeQuery = (r: Range): string =>
  r.kind === 'preset'
    ? `hours=${r.hours}`
    : `from=${encodeURIComponent(startOf(r.from))}&to=${encodeURIComponent(endOf(r.to))}`;

/** ความยาวช่วงเป็นชั่วโมง — ใช้เลือกรูปแบบป้ายแกน X */
const rangeHours = (r: Range): number =>
  r.kind === 'preset'
    ? r.hours
    : (new Date(endOf(r.to)).getTime() - new Date(startOf(r.from)).getTime()) / 3_600_000;

/** เพดานเดียวกับ MAX_RANGE_HOURS ฝั่ง backend — ดักตรงนี้เพื่อบอกเหตุผลก่อนยิงแล้วโดน 400 */
const MAX_RANGE_DAYS = 90;

/**
 * ช่วงเวลาไล่จากสั้นไปยาว — ระบบเพิ่งเริ่มเก็บ ช่วงที่มีข้อมูลจริงคือหลักชั่วโมง
 * ปุ่มที่กดแล้วได้กราฟว่างทุกครั้งไม่ช่วยใคร ขยับเพดานขึ้นเมื่อข้อมูลสะสมพอ
 * ช่วงที่ยาวกว่านี้เลือกวันที่เองได้ที่ปุ่ม "กำหนดเอง"
 */
const RANGES = [
  { hours: 1, label: '1 ชม.' },
  { hours: 6, label: '6 ชม.' },
  { hours: 24, label: '24 ชม.' },
  { hours: 168, label: '7 วัน' },
];

/**
 * ตั้งต้นแสดงทุกเส้น — กราฟที่ซ่อนข้อมูลไว้ตั้งแต่แรกทำให้คนอ่านพลาดสิ่งที่ไม่รู้ว่ามี
 * ปุ่มมีไว้ตอนอยากแยกดูทีละเส้น กดซ้ำที่ปุ่มเดิมกลับมาเห็นครบ
 */
/** เส้นทำนายใช้สีเดียวกับเส้นจริงของแกนนั้น ต่างกันที่เป็นเส้นประ — สีบอกแกน ลายเส้นบอกจริง/ทำนาย */
const FC = [
  { axis: 'Y', owner: 'vrmsY', key: 'fcY', color: 'var(--color-primary)' },
  { axis: 'Z', owner: 'vrmsZ', key: 'fcZ', color: 'var(--color-secondary)' },
] as const;

const SERIES = [
  { key: 'vrmsY', label: 'v-RMS แกน Y', color: 'var(--color-primary)' },
  { key: 'vrmsZ', label: 'v-RMS แกน Z', color: 'var(--color-secondary)' },
  {
    key: 'fc',
    label: 'ค่าทำนาย',
    color: 'linear-gradient(90deg, var(--color-primary) 50%, var(--color-secondary) 50%)',
  },
] as const;
type Series = (typeof SERIES)[number]['key'];

const TZ = 'Asia/Bangkok';
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('th-TH', { timeZone: TZ, ...opts });
const hhmm = fmt({ hour: '2-digit', minute: '2-digit' });
const dayMon = fmt({ day: 'numeric', month: 'short' });
const full = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** ช่วงสั้นอ่านเป็นนาฬิกา ช่วงยาวอ่านเป็นวันที่ — ป้ายแกนต้องเปลี่ยนตามความยาวของช่วง */
const tick = (hours: number) => (ts: number) => (hours <= 24 ? hhmm : dayMon).format(new Date(ts));

/** วันนี้ตามปฏิทินไทย ในรูป YYYY-MM-DD ที่ <input type="date"> ต้องการพอดี */
const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

const label = (r: Range) =>
  r.kind === 'custom'
    ? `${dayMon.format(new Date(startOf(r.from)))} – ${dayMon.format(new Date(endOf(r.to)))}`
    : 'กำหนดเอง';

/**
 * เลือกวันที่เอง — ใช้ <input type="date"> ของเบราว์เซอร์ ไม่ลงไลบรารีปฏิทิน
 * ได้ปฏิทินพื้นเมือง การพิมพ์ด้วยคีย์บอร์ด และ screen reader มาครบโดยไม่ต้องเขียนเอง
 */
function CustomRange({ range, onRange }: { range: Range; onRange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.kind === 'custom' ? range.from : todayTH());
  const [to, setTo] = useState(range.kind === 'custom' ? range.to : todayTH());
  const [error, setError] = useState('');
  const fromId = useId();
  const toId = useId();

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setError('กรอกวันที่ให้ครบทั้งสองช่อง');
    // 'YYYY-MM-DD' เทียบเป็นสตริงได้ตรง ๆ เรียงตามเวลาอยู่แล้ว ไม่ต้องแปลงเป็น Date
    if (to < from) return setError('วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่ม');
    const days = (new Date(endOf(to)).getTime() - new Date(startOf(from)).getTime()) / 86_400_000;
    if (days > MAX_RANGE_DAYS) return setError(`ช่วงที่เลือกยาวได้มากสุด ${MAX_RANGE_DAYS} วัน`);
    setError('');
    setOpen(false);
    onRange({ kind: 'custom', from, to });
  };

  const field = 'min-h-11 w-full rounded-md border border-hairline bg-surface px-2 text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-pressed={range.kind === 'custom'}
        className={`min-h-11 rounded-md border px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          range.kind === 'custom'
            ? 'border-primary bg-primary text-on-primary'
            : 'border-hairline text-ink'
        }`}
      >
        {label(range)}
      </button>

      {open && (
        <form
          onSubmit={apply}
          className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-hairline bg-surface p-4 shadow-[0_6px_24px_rgba(16,32,56,.14)]"
        >
          <div className="space-y-3">
            <div>
              <label htmlFor={fromId} className="mb-1 block text-caption font-medium text-ink-secondary">
                ตั้งแต่วันที่
              </label>
              <input id={fromId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor={toId} className="mb-1 block text-caption font-medium text-ink-secondary">
                ถึงวันที่
              </label>
              <input id={toId} type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-caption text-danger-ink">
              <span aria-hidden="true">■ </span>
              {error}
            </p>
          )}

          <p className="mt-2 text-caption text-ink-faint">นับรวมทั้งวันของทั้งสองวันที่ · ยาวได้ถึง {MAX_RANGE_DAYS} วัน</p>

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-md bg-primary px-3 text-body font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              ดูกราฟ
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-md border border-hairline px-3 text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              ปิด
            </button>
          </div>
        </form>
      )}
    </div>
  );
}


/**
 * กราฟรองที่อ่านคู่กับกราฟสั่นสะเทือน — คนละหน่วยจึงต้องแยกกราฟ ไม่ใช่แค่แยกเส้น
 * ซ้อนบนแกน mm/s ไม่ได้: อุณหภูมิ ~50 °C จะกดเส้นสั่นสะเทือน (0–5) แบนติดพื้นจนอ่านไม่ออก
 */
function SubChart({
  title,
  hint,
  rows,
  dataKey,
  unit,
  color,
  range,
  digits,
}: {
  title: string;
  hint: string;
  rows: Row[];
  dataKey: 'temperature' | 'aPeak' | 'crest';
  unit: string;
  color: string;
  range: Range;
  digits: number;
}) {
  const points = rows.filter((r) => r[dataKey] !== null).length;

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      <p className="mb-3 text-caption text-ink-muted">{hint}</p>

      {points === 0 ? (
        <p className="rounded-sm bg-surface-sunken px-3 py-6 text-center text-body text-ink-secondary">
          <span aria-hidden="true">■ </span>ยังไม่มีข้อมูลในช่วงนี้
        </p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tick(rangeHours(range))}
                tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                tickMargin={6}
              />
              {/* ไม่ยึดฐานที่ 0 เหมือนกราฟสั่นสะเทือน — อุณหภูมิแกว่งไม่กี่องศา ถ้าเริ่มจาก 0 จะเป็นเส้นตรง */}
              {/* อัตราส่วนอย่าง crest ไม่มีหน่วย — ต่อช่องว่างเปล่าท้ายตัวเลขไม่ได้ */}
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                unit={unit ? ` ${unit}` : undefined}
                width={70}
              />
              <Tooltip
                labelFormatter={(v) => `${full.format(new Date(Number(v)))} น.`}
                formatter={(v) => [
                  typeof v === 'number' ? `${v.toFixed(digits)}${unit ? ` ${unit}` : ''}` : '—',
                  title,
                ]}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                name={title}
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

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
  const [range, setRange] = useState<Range>({ kind: 'preset', hours: 6 });
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    Promise.all([
      api<Detail>(`/motors/${motorId}`),
      api<Reading[]>(`/motors/${motorId}/readings?${rangeQuery(range)}`),
      // เส้นทำนายพังไม่ควรลากกราฟหลักพังไปด้วย — ล้มแล้วคืน array ว่าง กราฟก็แค่ไม่มีเส้นประ
      api<Forecast[]>(`/predictions/motor/${motorId}?metric=vrms_y`).catch(() => [] as Forecast[]),
      api<Forecast[]>(`/predictions/motor/${motorId}?metric=vrms_z`).catch(() => [] as Forecast[]),
    ])
      .then(([detail, readings, forecast, forecastZ]) =>
        setView({ kind: 'ready', detail, readings, forecast, forecastZ }),
      )
      .catch((err: ApiError) => setView({ kind: 'error', message: err.message }));
  }, [motorId, range]);

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
          forecast={view.forecast}
          forecastZ={view.forecastZ}
          range={range}
          onRange={setRange}
          role={role}
          onSaved={(d) =>
            setView({
              kind: 'ready',
              detail: d,
              readings: view.readings,
              forecast: view.forecast,
              forecastZ: view.forecastZ,
            })
          }
        />
      )}
    </div>
  );
}

function Ready({
  detail: m,
  readings,
  forecast,
  forecastZ,
  range,
  onRange,
  role,
  onSaved,
}: {
  detail: Detail;
  readings: Reading[];
  forecast: Forecast[];
  forecastZ: Forecast[];
  range: Range;
  onRange: (r: Range) => void;
  role: string;
  onSaved: (d: Detail) => void;
}) {
  const edit = useEdit(m, onSaved, role);
  // null = ยังไม่แยก แสดงครบทุกเส้น
  const [series, setSeries] = useState<Series | null>(null);
  const shown = (k: Series) => series === null || series === k;
  const latest = readings.length ? readings[readings.length - 1] : null;
  const warn = edit.draft.warningThreshold;
  const alarm = edit.draft.alarmThreshold;
  const history: Row[] = breakGaps(readings.map((r) => ({
    ...r,
    t: new Date(r.ts).getTime(),
    // a-Peak กับ a-RMS เป็น g ทั้งคู่ หารกันได้ตรง ๆ · aRms เป็น 0 หรือ null = พอร์ตนั้นยังไม่เปิด
    crest: r.aPeak !== null && r.aRms ? r.aPeak / r.aRms : null,
    fcY: null,
    fcZ: null,
  })));
  const last = history[history.length - 1];

  /**
   * ค่าทำนายไกลได้ถึง 7 วัน ถ้าปล่อยลงกราฟตอนดูย้อนหลัง 6 ชม. แกนเวลาจะยาว 7 วันกว่า
   * ข้อมูลจริงถูกบีบเหลือ 3% ของความกว้าง และป้ายแกนกลายเป็นเวลานาฬิกาซ้ำวันละสองรอบ
   * จึงวาดเฉพาะค่าทำนายที่ไม่ไกลกว่าช่วงที่กำลังดูอยู่ — อยากเห็นทั้ง 7 วันก็เลือกช่วง 7 วัน
   */
  const spanMs = rangeHours(range) * 3_600_000;

  /**
   * เวลาของค่าทำนายคือเที่ยงวันตามเวลาไทย เพราะมันคือค่าเฉลี่ยทั้งวัน
   * วันที่ผ่านไปแล้ว → ใส่ในแถวจริงที่ใกล้เที่ยงที่สุด (แทรกแถวใหม่จะทำให้เส้นจริงขาดตรงนั้น)
   * วันข้างหน้า → แถวใหม่ต่อท้าย · สองแกนวันเดียวกันต้องลงแถวเดียวกัน ไม่งั้นเส้นเจอ null สลับกัน
   */
  const ahead = new Map<number, Row>();
  const addFc = (list: Forecast[], axis: 'Y' | 'Z') => {
    for (const fc of list) {
      const t = new Date(`${fc.targetDay}T12:00:00${TZ_OFFSET}`).getTime();
      if (last && t <= last.t) {
        const near = history.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
        // วันนั้นไม่มีข้อมูลจริงในช่วงที่ดู — ไม่มีอะไรให้เทียบ
        if (Math.abs(near.t - t) < 12 * 3_600_000) near[`fc${axis}`] = fc.predicted;
        continue;
      }
      if (last && t - last.t > spanMs) continue;
      const row = ahead.get(t) ?? {
        t,
        ts: new Date(t).toISOString(),
        vrmsY: null, vrmsZ: null, temperature: null, aPeak: null, aRms: null, zone: null,
        crest: null, fcY: null, fcZ: null,
      };
      row[`fc${axis}`] = fc.predicted;
      ahead.set(t, row);
    }
  };
  addFc(forecast, 'Y');
  addFc(forecastZ, 'Z');
  const rows: Row[] = [...history, ...[...ahead.values()].sort((a, b) => a.t - b.t)];

  /** ช่วงที่วาดจริง = ข้อมูลจริง + ค่าทำนายที่รอดมา · ป้ายแกนต้องเปลี่ยนตามนี้ ไม่ใช่ตามช่วงที่ขอ */
  const spanHours = rows.length
    ? (rows[rows.length - 1].t - rows[0].t) / 3_600_000
    : rangeHours(range);

  /** กดแกนไหนได้เส้นจริงกับเส้นทำนายของแกนนั้นคู่กัน — ทำนายแล้วเทียบของจริงไม่ได้ก็ไม่มีประโยชน์ */
  const fcLines = FC.filter(
    (a) => (shown(a.owner) || shown('fc')) && rows.some((r) => r[a.key] !== null),
  );

  /** มีค่าทำนายอยู่ แต่ไกลเกินช่วงที่ดู — ต้องบอก ไม่ใช่ปล่อยให้เข้าใจว่าระบบทำนายไม่ได้ */
  const fcTooFar = fcLines.length === 0 && forecast.length + forecastZ.length > 0;

  /** วันแรกข้างหน้าที่ค่าทำนายแตะเกณฑ์ Warning — ตัวเลขที่ใช้วางแผนซ่อมได้จริง */
  const upcoming = forecast.filter((f) => f.targetDay >= todayTH());
  const hit = warn === null ? undefined : upcoming.find((f) => f.predicted >= warn);

  const peak = rows.reduce(
    (mx, r) =>
      Math.max(
        mx, r.vrmsY ?? 0, r.vrmsZ ?? 0, r.fcY ?? 0, r.fcZ ?? 0,
      ),
    0,
  );
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
            {RANGES.map((r) => {
              const on = range.kind === 'preset' && range.hours === r.hours;
              return (
                <button
                  key={r.hours}
                  type="button"
                  onClick={() => onRange({ kind: 'preset', hours: r.hours })}
                  aria-pressed={on}
                  className={`min-h-11 rounded-md border px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on ? 'border-primary bg-primary text-on-primary' : 'border-hairline text-ink'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
            <CustomRange range={range} onRange={onRange} />
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
                  tickFormatter={tick(spanHours)}
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
                {shown('vrmsY') && <Line type="monotone" dataKey="vrmsY" name="v-RMS Y" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
                {shown('vrmsZ') && <Line type="monotone" dataKey="vrmsZ" name="v-RMS Z" stroke="var(--color-secondary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
                {fcLines.map((a) => (
                  <Line
                    key={a.key}
                    type="monotone"
                    dataKey={a.key}
                    name={`ค่าทำนาย แกน ${a.axis}`}
                    stroke={a.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: a.color }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
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

        {/* NFR-09 · เส้นแยกด้วยสี จึงต้องมีชื่อเส้นเป็นข้อความกำกับเสมอ — ปุ่มนี้ทำหน้าที่ทั้งคำอธิบายและตัวเลือก */}
        <div
          className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3"
          role="group"
          aria-label="เส้นที่แสดงในกราฟ"
        >
          {SERIES.map((s) => {
            const on = series === s.key;
            // กดซ้ำที่ปุ่มเดิม = เลิกแยก กลับไปเห็นครบ
            const none = s.key === 'fc' && ahead.size === 0;
            return (
              <button
                key={s.key}
                type="button"
                disabled={none}
                onClick={() => setSeries(on ? null : s.key)}
                aria-pressed={on}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? 'border-primary bg-primary text-on-primary' : 'border-hairline text-ink'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1 w-5 rounded-full"
                  style={{ background: on ? 'currentColor' : s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
          {warn !== null && <span>เส้นส้ม = Warning {warn} mm/s</span>}
          {alarm !== null && <span>เส้นแดง = Alarm {alarm} mm/s</span>}
          {fcLines.length > 0 && (
            <span>เส้นประ = ค่าทำนายของแกนสีเดียวกัน · วันที่ผ่านไปแล้วเทียบกับเส้นจริงได้ตรง ๆ</span>
          )}
          {fcTooFar && <span>ค่าทำนายอยู่ไกลกว่าช่วงที่ดูอยู่ — เลือกช่วง 7 วันเพื่อให้เห็นเส้นประ</span>}
          <span>{series === null ? 'กดปุ่มด้านบนเพื่อแยกดูทีละเส้น' : 'กดปุ่มเดิมซ้ำเพื่อกลับมาดูครบทุกเส้น'}</span>
        </div>
        <p className="mt-2 text-caption text-ink-faint">
          {upcoming.length === 0 ? (
            <span className="block">
              <span aria-hidden="true">■ </span>ยังไม่มีค่าทำนาย — ต้องมีค่าเฉลี่ยรายวันอย่างน้อย 4 วันใน 14 วันหลังสุด
            </span>
          ) : hit ? (
            <span className="block text-warning">
              <span aria-hidden="true">■ </span>ค่าทำนายแตะเกณฑ์ Warning {warn} mm/s ในวันที่{' '}
              {dayMon.format(new Date(`${hit.targetDay}T12:00:00${TZ_OFFSET}`))} (อีก {hit.horizonDays} วัน)
            </span>
          ) : (
            <span className="block">
              <span aria-hidden="true">■ </span>ค่าทำนาย {upcoming[upcoming.length - 1].horizonDays} วันข้างหน้า
              ยังไม่แตะเกณฑ์ Warning
            </span>
          )}
          1.8 / 4.5 คือขอบโซน B→C และ C→D ตาม ISO 10816-1 Class I (เครื่องไม่เกิน 15 kW) ·
          มอเตอร์ชุดนี้ 11 kW ยืนยันหน้างาน 2026-09-17
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SubChart
          title="อุณหภูมิผิวเครื่อง"
          hint="ไต่ขึ้นช้า ๆ พร้อมกับการสั่นที่สูงขึ้น มักหมายถึงลูกปืนหรือการหล่อลื่น"
          rows={history}
          dataKey="temperature"
          unit="°C"
          color="var(--color-warning)"
          range={range}
          digits={1}
        />
        <SubChart
          title="เร่งสูงสุด a-Peak"
          hint="ไวต่อความเสียหายของลูกปืนมากกว่า v-RMS — จับการกระแทกสั้น ๆ ที่ค่าเฉลี่ยกลบไป"
          rows={history}
          dataKey="aPeak"
          unit="g"
          color="var(--color-primary)"
          range={range}
          digits={3}
        />
        <SubChart
          title="Crest factor"
          hint="a-Peak ÷ a-RMS · ไต่ขึ้นเมื่อเริ่มมีการกระแทก แล้วตกลงเมื่อความเสียหายลามจนพื้นสั่นสูงตาม"
          rows={history}
          dataKey="crest"
          unit=""
          color="var(--color-secondary)"
          range={range}
          digits={2}
        />
      </div>
      <p className="text-caption text-ink-faint">
        Crest factor ต้องเปิด a-RMS ที่พอร์ตนั้นใน BCM Assistant ก่อนถึงจะมีค่า ·
        ค่าที่วัดได้ตอนตั้งต้น 2.99 – 3.28 ใช้เป็นเส้นฐานเทียบของเครื่องที่ยังปกติ
      </p>

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
