import { ZONE, ZONES, type Zone } from '../constants/tokens';

/**
 * NFR-09 · สีห้ามเป็นสัญญาณเดียว — ทุกช่องมีตัวอักษร A B C D กำกับ
 * ให้ข้อมูลสองชั้น: อยู่โซนไหน และเหลือระยะห่างจากโซน D เท่าไหร่ (DSN-CMTK-001 §4)
 * size sm = บนการ์ด · lg = หน้ารายละเอียด (DSN §4)
 */
export function ZoneBand({ zone, size = 'sm' }: { zone: Zone | null; size?: 'sm' | 'lg' }) {
  return (
    <div
      className={`flex w-full overflow-hidden rounded-sm ${size === 'lg' ? 'h-9' : 'h-5'}`}
      role="img"
      aria-label={zone ? `ระดับความรุนแรง ISO 10816 โซน ${zone}` : 'ไม่มีข้อมูลระดับความรุนแรง'}
    >
      {ZONES.map((k) => (
        <div
          key={k}
          className={`flex flex-1 items-center justify-center border-r border-surface text-caption font-semibold last:border-r-0 ${
            k === zone ? `${ZONE[k].fill} ${ZONE[k].on}` : 'bg-surface-sunken text-ink-muted'
          }`}
        >
          {k}
        </div>
      ))}
    </div>
  );
}
