import { MASTER_PORTS, ZONE, type Zone } from '../constants/tokens';

interface Slot {
  id: number;
  tag: string;
  portNo: number;
  zone: Zone | null;
  isOnline: boolean;
}

/**
 * DSN-CMTK-001 §4 · port-rail — จำลองตัว IO-Link Master จริงทั้ง 8 ช่อง
 * ช่องว่างแสดงเป็นเส้นประคำว่า "ว่าง" เพราะนั่นคือข้อมูล (ขยายได้อีก 4 มอเตอร์)
 * ช่างที่ยืนหน้าตู้แปลเป็นของจริงได้โดยไม่ต้องตีความ
 */
export function PortRail({
  motors,
  masterNo,
  onPick,
}: {
  motors: Slot[];
  masterNo: number;
  onPick?: (id: number) => void;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-section font-semibold text-ink">
            IO-Link Master {masterNo} · BNI XG5-508
          </h2>
          <p className="text-caption text-ink-muted">อ่านค่าทุก 0.5 วินาที · สรุปเป็นรายนาที</p>
        </div>
        <span className="text-caption text-ink-muted">
          ใช้งาน {motors.length} จาก {MASTER_PORTS} พอร์ต
        </span>
      </div>

      <ul className="flex gap-1 overflow-x-auto pb-1">
        {Array.from({ length: MASTER_PORTS }, (_, port) => {
          const m = motors.find((x) => x.portNo === port);

          if (!m) {
            return (
              <li
                key={port}
                className="flex min-w-16 flex-1 flex-col items-center rounded-sm border border-dashed border-hairline py-3 text-caption text-ink-muted"
              >
                <span>{port}</span>
                <span className="mt-2">ว่าง</span>
              </li>
            );
          }

          return (
            <li key={port} className="flex min-w-16 flex-1">
              <button
                type="button"
                onClick={() => onPick?.(m.id)}
                className="flex w-full flex-col items-center rounded-sm border border-hairline py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                // NFR-09 · จุดสีอ่านไม่ได้ด้วยตัวเอง — อ่านออกเสียงเป็นข้อความเต็ม
                aria-label={`พอร์ต ${port} ${m.tag} ${m.isOnline && m.zone ? `โซน ${m.zone}` : 'ไม่มีข้อมูลเข้ามา'}`}
              >
              <span className="text-caption text-ink-faint" aria-hidden="true">
                {port}
              </span>
              <span
                aria-hidden="true"
                className={`mt-1 h-8 w-8 rounded-full ${
                  m.isOnline && m.zone ? ZONE[m.zone].fill : 'bg-offline'
                }`}
              />
              <span className="mt-2 text-caption font-semibold text-ink" aria-hidden="true">
                {m.tag}
              </span>
              <span className="text-caption text-ink-faint" aria-hidden="true">
                {m.isOnline && m.zone ? m.zone : '—'}
              </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
