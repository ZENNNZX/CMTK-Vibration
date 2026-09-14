import type { Logger } from 'pino';

const LINE_BROADCAST = 'https://api.line.me/v2/bot/message/broadcast';

export interface LineOptions {
  token: string;
  enabled: boolean;
}

/**
 * broadcast ส่งถึงทุกคนที่แอดบอท — ไม่ต้องมี userId ไม่ต้องมี webhook
 * ซึ่งสำคัญเพราะบอร์ดรับ inbound ไม่ได้ (พอร์ต 7844 ถูกบล็อก)
 *
 * ⚠️ โควตานับตามจำนวนผู้รับ ไม่ใช่จำนวนคำขอ (NFR-06)
 *    ส่ง 1 ครั้งถึง 5 คน = 5 ข้อความ — การคุมโควตาอยู่ใน Notifier
 */
export function createLineSender(opts: LineOptions, log: Logger) {
  return async function send(text: string): Promise<void> {
    if (!opts.enabled) {
      log.info({ text }, 'LINE ปิดอยู่ — ข้ามการส่ง');
      return;
    }

    const res = await fetch(LINE_BROADCAST, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ type: 'text', text }] }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 429 = เกินโควตา · ไม่ควรถึงตรงนี้ถ้าชั้น 3 ทำงานถูก
      throw new Error(`LINE ${res.status}: ${detail.slice(0, 200)}`);
    }
  };
}
