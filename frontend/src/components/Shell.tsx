import type { ComponentType, ReactNode } from 'react';
import { BarChart3, CalendarDays, Gauge, LogOut, Users, Wrench } from 'lucide-react';

export type Screen = 'dash' | 'history' | 'month' | 'maint' | 'admin';

/** แท็บทั้งหมดตามต้นแบบ — ทุกอันมีหน้าจริงแล้ว */
export const NAV: { id: Screen; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'dash', label: 'ภาพรวม', icon: Gauge },
  { id: 'history', label: 'ประวัติแจ้งเตือน', icon: CalendarDays },
  { id: 'month', label: 'สรุปรายเดือน', icon: BarChart3 },
  { id: 'maint', label: 'บันทึกซ่อม', icon: Wrench },
  { id: 'admin', label: 'ผู้ดูแลระบบ', icon: Users },
];

/**
 * DSN-CMTK-001 §0 · chrome ถอยให้ข้อมูลพูด
 * แถบบางติดบน ไม่มีเงา ไม่มี hero — ทุกหน้าใช้โครงเดียวกัน
 */
export function Shell({
  children,
  onSignOut,
  screen,
  onScreen,
}: {
  children: ReactNode;
  onSignOut: () => void;
  screen: Screen;
  onScreen: (s: Screen) => void;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-caption font-bold text-on-primary"
          >
            GS
          </span>
          <span className="text-section font-semibold text-ink">Condition Monitoring</span>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="ออกจากระบบ"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-md border border-hairline text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>

        <nav className="mx-auto max-w-[1280px] overflow-x-auto px-4 sm:px-6" aria-label="เมนูหลัก">
          <div className="flex gap-1">
            {NAV.map((n) => {
              const on = screen === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onScreen(n.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted'
                  }`}
                >
                  <n.icon size={16} />
                  {n.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
