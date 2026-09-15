import { Suspense, lazy } from 'react';

import type { Offset } from './MotorMount3D';

/**
 * three ก้อนใหญ่ ~900 kB — หน้าภาพรวมที่คนเปิดบ่อยที่สุดไม่ควรต้องจ่ายค่านี้
 * โหลดตอนเปิดหน้ารายละเอียดเท่านั้น
 */
const MotorMount3D = lazy(() =>
  import('./MotorMount3D').then((m) => ({ default: m.MotorMount3D })),
);

export type { Offset };

export function MotorMount3DLazy(props: {
  mount: string;
  offset: Offset | null;
  canEdit: boolean;
  onMount: (id: string) => void;
  onOffset: (o: Offset | null) => void;
}) {
  return (
    <Suspense
      fallback={
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <p role="status" aria-live="polite" className="text-body text-ink-secondary">
            กำลังโหลดโมเดล 3 มิติ…
          </p>
        </section>
      }
    >
      <MotorMount3D {...props} />
    </Suspense>
  );
}
