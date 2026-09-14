import { describe, it, expect, vi } from 'vitest';
import { Notifier, format, type NotifiableEvent, type NotifierPorts, type QuotaConfig } from '../src/notifier.js';

const CFG: QuotaConfig = {
  debounceMinutes: 60,
  dailyCapPerMotor: 3,
  monthlyMessageCap: 350,
  monthlyReserve: 150,
  recipientCount: 5,
};

function ports(over: Partial<NotifierPorts> = {}) {
  const records: Array<{ status: string; count: number }> = [];
  const p: NotifierPorts = {
    lastSentAt: async () => null,
    sentTodayForMotor: async () => 0,
    messagesThisMonth: async () => 0,
    send: async () => {},
    record: async (_id, status, messageCount) => {
      records.push({ status, count: messageCount });
    },
    ...over,
  };
  return { p, records };
}

const ev = (over: Partial<NotifiableEvent> = {}): NotifiableEvent => ({
  eventId: 1,
  motorId: 1,
  motorTag: 'CONV-303',
  kind: 'alarm',
  metric: 'vibration',
  value: 4.71,
  zone: 'D',
  at: new Date('2026-09-11T08:41:00Z'),
  ...over,
});

describe('Notifier · REQ-008 ส่งเฉพาะ Main Alarm และเซ็นเซอร์หลุด', () => {
  it('Pre-Alarm ไม่ส่ง LINE — ดูในหน้าเว็บพอ', async () => {
    const { p } = ports();
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ kind: 'warning' }))).toBe('skipped_not_notifiable');
  });

  it('zone_change ไม่ส่ง LINE', async () => {
    const { p } = ports();
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ kind: 'zone_change' }))).toBe('skipped_not_notifiable');
  });

  it('Main Alarm และ offline ส่ง', async () => {
    const { p } = ports();
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ kind: 'alarm' }))).toBe('sent');
    expect(await n.maybeSend(ev({ kind: 'offline' }))).toBe('sent');
  });
});

describe('ชั้น 1 · debounce', () => {
  it('AC-010-01 · ส่งซ้ำในช่วง debounce ถูกระงับ แต่ยังบันทึก', async () => {
    const { p, records } = ports({
      lastSentAt: async () => new Date('2026-09-11T08:00:00Z'),
    });
    const n = new Notifier(CFG, p);
    const r = await n.maybeSend(ev(), new Date('2026-09-11T08:30:00Z'));
    expect(r).toBe('suppressed_debounce');
    expect(records[0]).toEqual({ status: 'suppressed_debounce', count: 0 });
  });

  it('พ้นช่วง debounce แล้วส่งได้', async () => {
    const { p } = ports({ lastSentAt: async () => new Date('2026-09-11T08:00:00Z') });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev(), new Date('2026-09-11T09:30:00Z'))).toBe('sent');
  });
});

describe('ชั้น 2 · เพดานรายวันต่อมอเตอร์', () => {
  it('ครบ 3 ครั้งแล้วหยุด', async () => {
    const { p } = ports({ sentTodayForMotor: async () => 3 });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev())).toBe('suppressed_daily_cap');
  });

  it('มอเตอร์ตัวหนึ่งเต็มแล้ว ตัวอื่นยังส่งได้', async () => {
    const { p } = ports({ sentTodayForMotor: async (motorId) => (motorId === 1 ? 3 : 0) });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ motorId: 1 }))).toBe('suppressed_daily_cap');
    expect(await n.maybeSend(ev({ motorId: 2 }))).toBe('sent');
  });
});

describe('ชั้น 3 · โควตาเดือน และการสงวนไว้ให้ Main Alarm', () => {
  it('offline หยุดที่ 350 ข้อความ', async () => {
    const { p } = ports({ messagesThisMonth: async () => 346 });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ kind: 'offline' }))).toBe('suppressed_quota');
  });

  it('⭐ เซ็นเซอร์เสียกินโควตาจนเต็ม แต่ Main Alarm ยังส่งได้', async () => {
    const { p } = ports({ messagesThisMonth: async () => 400 });
    const n = new Notifier(CFG, p);
    // offline โดนกันไว้แล้ว
    expect(await n.maybeSend(ev({ kind: 'offline' }))).toBe('suppressed_quota');
    // แต่เครื่องกำลังจะพังยังแจ้งได้ — นี่คือเหตุผลที่มีชั้น 3
    expect(await n.maybeSend(ev({ kind: 'alarm' }))).toBe('sent');
  });

  it('เกินแม้โควตาสงวนแล้ว Main Alarm ก็หยุด', async () => {
    const { p } = ports({ messagesThisMonth: async () => 499 });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev({ kind: 'alarm' }))).toBe('suppressed_quota');
  });

  it('คิดต้นทุนตามจำนวนผู้รับ ไม่ใช่ 1 ต่อครั้ง', async () => {
    const { p, records } = ports();
    const n = new Notifier(CFG, p);
    await n.maybeSend(ev());
    expect(records[0]).toEqual({ status: 'sent', count: 5 });
  });
});

describe('AC-009-02 · ส่งไม่สำเร็จ', () => {
  it('LINE ตอบ error → บันทึก failed และไม่ throw ออกไป', async () => {
    const { p, records } = ports({
      send: vi.fn(async () => {
        throw new Error('429 Too Many Requests');
      }),
    });
    const n = new Notifier(CFG, p);
    expect(await n.maybeSend(ev())).toBe('failed');
    expect(records[0]?.status).toBe('failed');
  });
});

describe('รูปแบบข้อความ', () => {
  it('alarm มีชื่อมอเตอร์ ค่า โซน และเวลา', () => {
    const text = format(ev());
    expect(text).toContain('CONV-303');
    expect(text).toContain('4.71 mm/s');
    expect(text).toContain('โซน D');
    expect(text).toContain('ALARM');
  });

  it('offline บอกว่าไม่มีข้อมูล ไม่ใช่แสดงค่าเก่า', () => {
    const text = format(ev({ kind: 'offline', value: null, zone: null }));
    expect(text).toContain('เซ็นเซอร์หลุด');
    expect(text).not.toContain('mm/s');
  });
});
