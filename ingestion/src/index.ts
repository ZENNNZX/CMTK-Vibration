import pg from 'pg';
import pino from 'pino';

import { loadEnv } from './config/env.js';
import { parseMessage, parseTopic, type DeviceData } from './schema.js';
import { Aggregator } from './aggregator.js';
import { EdgeDetector, type Transition } from './edgeDetector.js';
import { Notifier, type NotifiableEvent } from './notifier.js';
import { Repository, type MotorRef } from './repository.js';
import { connectMqtt } from './mqtt.js';
import { createLineSender } from './line.js';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
const repo = new Repository(pool);
const agg = new Aggregator();
const det = new EdgeDetector();

const lastSeen = new Map<number, Date>();
let motors = new Map<string, MotorRef>();
const byId = new Map<number, MotorRef>();

/** ตัวนับสำหรับดูสุขภาพ — log ทุกนาทีตอน flush */
const stat = { received: 0, parsed: 0, unknownType: 0, badPayload: 0, unmapped: 0 };

const sendLine = createLineSender(
  { token: env.LINE_CHANNEL_ACCESS_TOKEN, enabled: env.LINE_ENABLED },
  log,
);

const notifier = new Notifier(
  {
    debounceMinutes: env.LINE_DEBOUNCE_MINUTES,
    dailyCapPerMotor: env.LINE_DAILY_CAP_PER_MOTOR,
    monthlyMessageCap: env.LINE_MONTHLY_MESSAGE_CAP,
    monthlyReserve: env.LINE_MONTHLY_RESERVE,
    // NFR-06 · broadcast กินโควตาตามจำนวนคนที่แอดบอท ซึ่งตาราง recipients ไม่รู้
    recipientCount: env.LINE_RECIPIENT_COUNT,
  },
  {
    lastSentAt: (id) => repo.lastSentAt(id),
    sentTodayForMotor: (id, now) => repo.sentTodayForMotor(id, now),
    messagesThisMonth: (now) => repo.messagesThisMonth(now),
    send: sendLine,
    record: (id, status, count, err) => repo.recordNotification(id, status, count, err),
  },
);

async function refreshMotors(): Promise<void> {
  motors = await repo.loadMotors();
  byId.clear();
  for (const m of motors.values()) byId.set(m.id, m);
  log.info({ count: motors.size }, 'โหลดรายการมอเตอร์');
}

/** ตอน restart ต้องรู้ว่า event ไหนค้างอยู่ ไม่งั้นจะเปิดซ้ำหรือพลาดขอบขาลง */
async function hydrate(): Promise<void> {
  const open = await repo.loadOpenEvents();
  const state = new Map<number, Record<string, boolean>>();
  for (const e of open) {
    const s = state.get(e.motorId) ?? {};
    if (e.kind === 'alarm') s.mainAlarm = true;
    if (e.kind === 'warning') s.preAlarm = true;
    if (e.kind === 'offline') s.online = false;
    state.set(e.motorId, s);
  }
  for (const [motorId, s] of state) {
    det.hydrate(motorId, {
      mainAlarm: s.mainAlarm ?? false,
      preAlarm: s.preAlarm ?? false,
      online: s.online ?? true,
    });
  }
  log.info({ openEvents: open.length }, 'กู้สถานะ event ที่ค้างอยู่');
}

async function handleTransitions(list: Transition[]): Promise<void> {
  for (const t of list) {
    if (t.edge === 'fall') {
      await repo.closeEvent(t);
      log.info({ motorId: t.motorId, kind: t.kind }, 'ปิด event');
      continue;
    }

    const eventId = await repo.openEvent(t);
    if (eventId === null) continue;   // มี event เดิมเปิดอยู่ — uq_open_event กันไว้

    const motor = byId.get(t.motorId);
    log.warn({ eventId, motor: motor?.tag, kind: t.kind, metric: t.metric }, 'เปิด event ใหม่');

    const payload: NotifiableEvent = {
      eventId,
      motorId: t.motorId,
      motorTag: motor?.tag ?? `motor-${t.motorId}`,
      kind: t.kind,
      metric: t.metric,
      value: t.value ?? null,
      zone: t.zoneTo ?? null,
      at: t.at,
    };
    const status = await notifier.maybeSend(payload, new Date());
    log.info({ eventId, status }, 'ผลการแจ้งเตือน');
  }
}

function onMessage(topic: string, raw: Buffer): void {
  stat.received += 1;

  const parts = parseTopic(topic);
  if (!parts) return;

  const parsed = parseMessage(raw);
  if (!parsed.ok) {
    if (parsed.reason === 'unknown_type') stat.unknownType += 1;
    else stat.badPayload += 1;
    // AC-004-06 · ไม่รู้จักก็ข้าม ห้ามทำให้ service ตาย
    log.debug({ topic, reason: parsed.reason, detail: parsed.detail }, 'ข้ามข้อความ');
    return;
  }

  const motor = motors.get(`${parts.master}:${parts.port}`);
  if (!motor) {
    // AC-004-03 · พอร์ตที่ยังไม่ผูกมอเตอร์ → log แล้วทิ้ง
    stat.unmapped += 1;
    return;
  }

  const msg = parsed.message;
  const at = new Date(msg.timestamp);

  if (msg.type === 'dataFromDevice') {
    stat.parsed += 1;
    lastSeen.set(motor.id, at);
    agg.add(motor.id, at, msg as DeviceData);
    void handleTransitions(det.feed(motor.id, msg as DeviceData, at)).catch((err) =>
      log.error({ err }, 'จัดการ transition ไม่สำเร็จ'),
    );
    return;
  }

  if (msg.type === 'iolinkPortEvent') {
    void handleTransitions(det.feedPortEvent(motor.id, msg.data.event, at)).catch((err) =>
      log.error({ err }, 'จัดการ port event ไม่สำเร็จ'),
    );
  }
  // unitsFromDevice ไม่ต้องทำอะไร — หน่วยตายตัวแล้ว
}

async function flushTick(): Promise<void> {
  const now = new Date();
  const rows = agg.flush(now);

  if (rows.length > 0) {
    try {
      const written = await repo.insertReadings(rows);
      await repo.touchLastSeen([...new Set(rows.map((r) => r.motorId))], now);
      log.info({ rows: rows.length, written, ...stat }, 'เขียนข้อมูลรายนาที');
    } catch (err) {
      // AC-004-08 · DB ล้มชั่วคราวต้องไม่ทำให้ service ตาย
      log.error({ err, rows: rows.length }, 'เขียน readings ไม่สำเร็จ — ข้อมูลรอบนี้หาย');
    }
  }

  Object.assign(stat, { received: 0, parsed: 0, unknownType: 0, badPayload: 0, unmapped: 0 });

  // AC-011-03 · QoS 0 ทำให้ disconnect event หายได้ ต้องเช็คความเงียบด้วย
  const stale = det.checkStale(lastSeen, now, env.STALE_THRESHOLD_SECONDS);
  if (stale.length > 0) {
    log.warn({ count: stale.length }, 'พบเซ็นเซอร์เงียบเกินกำหนด');
    await handleTransitions(stale);
  }
}

async function main(): Promise<void> {
  log.info('เริ่ม ingestion service');

  await refreshMotors();
  await hydrate();

  const client = connectMqtt(
    {
      url: env.MQTT_URL,
      username: env.MQTT_USER,
      password: env.MQTT_PASSWORD,
      topic: env.MQTT_TOPIC,
    },
    log,
    onMessage,
  );

  const flushTimer = setInterval(() => {
    void flushTick().catch((err) => log.error({ err }, 'flush ไม่สำเร็จ'));
  }, env.AGGREGATE_WINDOW_SECONDS * 1000);

  // มอเตอร์ที่เพิ่งลงทะเบียนต้องเริ่มรับข้อมูลโดยไม่ต้อง restart
  const motorTimer = setInterval(() => {
    void refreshMotors().catch((err) => log.error({ err }, 'refresh มอเตอร์ไม่สำเร็จ'));
  }, 5 * 60 * 1000);

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'กำลังปิดระบบ');
    clearInterval(flushTimer);
    clearInterval(motorTimer);
    client.end(true);

    // เอาของค้างในบัฟเฟอร์ลง DB ก่อน ไม่ให้ข้อมูลนาทีสุดท้ายหาย
    const remaining = agg.drain();
    if (remaining.length > 0) {
      try {
        await repo.insertReadings(remaining);
        log.info({ rows: remaining.length }, 'บันทึกข้อมูลค้างก่อนปิด');
      } catch (err) {
        log.error({ err }, 'บันทึกข้อมูลค้างไม่สำเร็จ');
      }
    }
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.fatal({ err }, 'เริ่ม service ไม่สำเร็จ');
  process.exit(1);
});
