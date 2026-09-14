import type { EventKind } from './edgeDetector.js';

export type NotifyStatus =
  | 'sent'
  | 'failed'
  | 'suppressed_debounce'
  | 'suppressed_daily_cap'
  | 'suppressed_quota'
  | 'skipped_not_notifiable';

export interface NotifiableEvent {
  eventId: number;
  motorId: number;
  motorTag: string;
  kind: EventKind;
  metric: string;
  value: number | null;
  zone: string | null;
  at: Date;
}

export interface QuotaConfig {
  debounceMinutes: number;
  dailyCapPerMotor: number;
  monthlyMessageCap: number;
  /** โควตาที่สงวนไว้ให้ Main Alarm เท่านั้น */
  monthlyReserve: number;
  recipientCount: number;
}

export interface NotifierPorts {
  lastSentAt(eventId: number): Promise<Date | null>;
  sentTodayForMotor(motorId: number, now: Date): Promise<number>;
  messagesThisMonth(now: Date): Promise<number>;
  send(text: string): Promise<void>;
  record(eventId: number, status: NotifyStatus, messageCount: number, error?: string): Promise<void>;
}

/** REQ-008 · แจ้ง LINE เฉพาะ Main Alarm และเซ็นเซอร์หลุด — Pre-Alarm ดูในหน้าเว็บพอ */
const NOTIFIABLE: ReadonlySet<EventKind> = new Set<EventKind>(['alarm', 'offline']);

export class Notifier {
  constructor(
    private readonly cfg: QuotaConfig,
    private readonly ports: NotifierPorts,
  ) {}

  /**
   * คุมสามชั้น — แต่ละชั้นแก้ปัญหาคนละแบบ
   *  1 debounce   กัน event เดิมยิงซ้ำ
   *  2 daily cap  กันมอเตอร์ตัวเดียวกินโควตาทั้งหมด
   *  3 monthly    กันเซ็นเซอร์เสียทำให้ทั้งระบบเงียบทั้งเดือน
   */
  async maybeSend(ev: NotifiableEvent, now = new Date()): Promise<NotifyStatus> {
    if (!NOTIFIABLE.has(ev.kind)) return 'skipped_not_notifiable';

    // ── ชั้น 1
    const last = await this.ports.lastSentAt(ev.eventId);
    if (last && now.getTime() - last.getTime() < this.cfg.debounceMinutes * 60_000) {
      await this.ports.record(ev.eventId, 'suppressed_debounce', 0);
      return 'suppressed_debounce';
    }

    // ── ชั้น 2
    const today = await this.ports.sentTodayForMotor(ev.motorId, now);
    if (today >= this.cfg.dailyCapPerMotor) {
      await this.ports.record(ev.eventId, 'suppressed_daily_cap', 0);
      return 'suppressed_daily_cap';
    }

    // ── ชั้น 3
    const used = await this.ports.messagesThisMonth(now);
    const cost = this.cfg.recipientCount;
    const budget =
      ev.kind === 'alarm'
        ? this.cfg.monthlyMessageCap + this.cfg.monthlyReserve // Main Alarm ใช้โควตาสงวนได้
        : this.cfg.monthlyMessageCap;

    if (used + cost > budget) {
      await this.ports.record(ev.eventId, 'suppressed_quota', 0);
      return 'suppressed_quota';
    }

    try {
      await this.ports.send(format(ev));
      await this.ports.record(ev.eventId, 'sent', cost);
      return 'sent';
    } catch (err) {
      // AC-009-02 · ส่งไม่สำเร็จต้องไม่ทำให้ event ใน DB หาย
      const detail = err instanceof Error ? err.message : 'unknown';
      await this.ports.record(ev.eventId, 'failed', 0, detail);
      return 'failed';
    }
  }
}

const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

export function format(ev: NotifiableEvent): string {
  const d = ev.at;
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;

  if (ev.kind === 'offline') {
    return [
      '■ เซ็นเซอร์หลุด',
      `มอเตอร์: ${ev.motorTag}`,
      `เวลา: ${when}`,
      'ไม่มีข้อมูลเข้ามา — ตรวจสายและพอร์ต IO-Link',
    ].join('\n');
  }

  return [
    '▲ ALARM การสั่นสะเทือนเกินเกณฑ์',
    `มอเตอร์: ${ev.motorTag}`,
    ev.value !== null ? `ค่าที่วัดได้: ${ev.value.toFixed(2)} mm/s` : null,
    ev.zone ? `ระดับ ISO: โซน ${ev.zone}` : null,
    `เวลา: ${when}`,
  ]
    .filter(Boolean)
    .join('\n');
}
