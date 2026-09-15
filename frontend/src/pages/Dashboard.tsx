import { useCallback, useEffect, useState } from 'react';

import { ZoneBand } from '../components/ZoneBand';
import { ZONE, type Zone } from '../constants/tokens';
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

function MotorCard({ m }: { m: Motor }) {
  if (!m.isOnline) {
    return (
      <article className="rounded-lg border border-offline bg-surface p-4">
        <header className="mb-3">
          <h2 className="text-section font-semibold text-ink">{m.tag}</h2>
          <p className="text-body text-ink-muted">{m.name}</p>
        </header>
        {/* AC-011-04 · เงียบไม่ได้แปลว่าปลอดภัย — ห้ามโชว์ค่าเก่าค้าง */}
        <p className="rounded-sm bg-surface-sunken px-3 py-4 text-center text-body font-medium text-ink-secondary">
          <span aria-hidden="true">■ </span>ไม่มีข้อมูลเข้ามา
        </p>
        <p className="mt-2 text-caption text-ink-muted">ล่าสุด {timeTH(m.lastMinuteTs)} น.</p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-hairline bg-surface p-4">
      <header className="mb-3">
        <h2 className="text-section font-semibold text-ink">{m.tag}</h2>
        <p className="text-body text-ink-muted">{m.name}</p>
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
    </article>
  );
}

export function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
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

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title font-semibold text-ink">สถานะมอเตอร์</h1>
          <p className="text-caption text-ink-muted">CMTK Condition Monitoring · GS Battery</p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearToken();
            onSignedOut();
          }}
          className="min-h-11 rounded-md border border-hairline px-4 text-body font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ออกจากระบบ
        </button>
      </header>

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {view.motors.map((m) => (
              <MotorCard key={m.id} m={m} />
            ))}
          </div>
        ))}
    </main>
  );
}
