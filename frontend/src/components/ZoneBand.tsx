import { ZONE, ZONES, type Zone } from '../constants/tokens';

/**
 * NFR-09 · สีห้ามเป็นสัญญาณเดียว — ทุกช่องมีตัวอักษร A B C D กำกับ
 * ให้ข้อมูลสองชั้น: อยู่โซนไหน และเหลือระยะห่างจากโซน D เท่าไหร่ (DSN-CMTK-001 §4)
 */
export function ZoneBand({ zone }: { zone: Zone | null }) {
  return (
    <div
      className="flex h-5 w-full overflow-hidden rounded-sm"
      role="img"
      aria-label={zone ? `ระดับความรุนแรง ISO 10816 โซน ${zone}` : 'ไม่มีข้อมูลระดับความรุนแรง'}
    >
      {ZONES.map((k) => {
        const on = k === zone;
        return (
          <div
            key={k}
            className="flex flex-1 items-center justify-center border-r border-white text-caption font-semibold last:border-r-0"
            style={{
              background: on ? ZONE[k].fill : '#eef1f5',
              color: on ? ZONE[k].text : '#a8b1bd',
            }}
          >
            {k}
          </div>
        );
      })}
    </div>
  );
}
