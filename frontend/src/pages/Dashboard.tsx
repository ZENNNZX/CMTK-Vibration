import { useCallback, useEffect, useState } from 'react';

import { PortRail } from '../components/PortRail';
import { ZoneBand } from '../components/ZoneBand';
import { ZONE, alertOf, type Zone } from '../constants/tokens';
import { api, clearToken, type ApiError } from '../services/api';

interface Motor {
  id: number;
  tag: string;
  name: string;
  masterNo: number;
  portNo: number;
  zone: Zone | null;
  vrmsY: number | null;
  vrmsZ: number | null;
  temperature: number | null;
  lastMinuteTs: string | null;
  isOnline: boolean;
}

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; motors: Motor[] }
  | { kind: 'error'; message: string };

const timeTH = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(iso))
    : '—';

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-caption text-ink-faint">{label}</div>
      {/* หน่วยแยกจากตัวเลขและอ่อนกว่าเสมอ · ตัวเลขใช้ tabular-nums (DSN-CMTK-001 §2) */}
      <div className="text-metric font-semibold text-ink">{value}</div>
      <div className="text-caption text-ink-faint">{unit}</div>
    </div>
  );
}

const CARD = 'w-full rounded-lg bg-surface p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function MotorCard({ m, onOpen }: { m: Motor; onOpen: () => void }) {
  if (!m.isOnline) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`ดูรายละเอียด ${m.tag} ${m.name} ไม่มีข้อมูลเข้ามา`}
        className={`${CARD} border border-offline`}
      >
        <header className="mb-3">
          <h3 className="text-section font-semibold text-ink">{m.tag}</h3>
          <p className="text-body text-ink-muted">{m.name}</p>
        </header>
        {/* AC-011-04 · เงียบไม่ได้แปลว่าปลอดภัย — ห้ามโชว์ค่าเก่าค้าง */}
        <p className="rounded-sm bg-surface-sunken px-3 py-4 text-center text-body font-medium text-ink-secondary">
          <span aria-hidden="true">■ </span>ไม่มีข้อมูลเข้ามา
        </p>
        <p className="mt-2 text-caption text-ink-muted">ล่าสุด {timeTH(m.lastMinuteTs)} น.</p>
      </button>
    );
  }

  // DSN §4 card-alert · โซน C/D ขึ้นขอบหนาพร้อมป้าย ไม่ใช่เปลี่ยนแค่สี (NFR-09)
  const alert = alertOf(m.zone);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`ดูรายละเอียด ${m.tag} ${m.name}${alert ? ` ${alert.text}` : ''}`}
      className={`${CARD} ${alert ? alert.border : 'border border-hairline'}`}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-section font-semibold text-ink">{m.tag}</h3>
          <p className="text-body text-ink-muted">{m.name}</p>
        </div>
        {alert && (
          <span
            className={`shrink-0 rounded-sm px-2 py-1 text-caption font-semibold ${alert.badge}`}
          >
            <span aria-hidden="true">{alert.glyph} </span>
            {alert.text}
          </span>
        )}
      </header>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <Metric label="v-RMS Y" value={m.vrmsY?.toFixed(2) ?? '—'} unit="mm/s" />
        <Metric label="v-RMS Z" value={m.vrmsZ?.toFixed(2) ?? '—'} unit="mm/s" />
        <Metric label="อุณหภูมิ" value={m.temperature?.toFixed(1) ?? '—'} unit="°C" />
      </div>

      <ZoneBand zone={m.zone} />
      <p className="mt-2 text-caption text-ink-muted">
        {m.zone ? ZONE[m.zone].label : 'ยังไม่ทราบระดับ'} · ล่าสุด {timeTH(m.lastMinuteTs)} น.
      </p>
    </button>
  );
}

export function Dashboard({
  onSignedOut,
  onOpenMotor,
}: {
  onSignedOut: () => void;
  onOpenMotor?: (id: number) => void;
}) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(() => {
    api<Motor[]>('/motors')
      .then((motors) => setView({ kind: 'ready', motors }))
      .catch((err: ApiError) => {
        setView({ kind: 'error', message: err.message });
        // AC-001-04 · token หมดอายุแล้วต้องเด้งกลับหน้า login ไม่ค้างหน้าเปล่า
        if (err.status === 401) {
          clearToken();
          onSignedOut();
        }
      });
  }, [onSignedOut]);

  useEffect(() => {
    load();
    // ข้อมูลเข้าทุกนาที — ดึงซ้ำถี่กว่านั้นไม่ได้อะไรเพิ่ม
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const open = (id: number) => onOpenMotor?.(id);

  return (
    <>
        <h1 className="mb-1 text-page-title font-semibold text-ink">สถานะมอเตอร์</h1>
        <p className="mb-4 text-caption text-ink-muted">GS Battery · โรงงาน CMTK</p>

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

        {view.kind === 'ready' &&
          (view.motors.length === 0 ? (
            <p className="text-body text-ink-muted">ยังไม่มีมอเตอร์ในระบบ</p>
          ) : (
            <div className="space-y-4">
              <PortRail motors={view.motors} masterNo={view.motors[0].masterNo} onPick={open} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {view.motors.map((m) => (
                  <MotorCard key={m.id} m={m} onOpen={() => open(m.id)} />
                ))}
              </div>
            </div>
          ))}
    </>
  );
}
