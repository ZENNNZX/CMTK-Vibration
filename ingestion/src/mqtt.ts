import mqtt, { type MqttClient } from 'mqtt';
import type { Logger } from 'pino';

export interface MqttOptions {
  url: string;
  username: string;
  password: string;
  topic: string;
}

export type MessageHandler = (topic: string, payload: Buffer) => void;

/**
 * AC-004-07 · broker หลุดต้อง reconnect เอง
 *
 * ⚠️ broker เป็น QoS 0 — ข้อความที่หายระหว่างหลุดจะไม่ถูกส่งซ้ำ
 * ห้ามออกแบบโดยสมมติว่าข้อมูลต่อเนื่อง (NFR-05)
 * ฝั่งเรากัน duplicate ด้วย ON CONFLICT ที่ readings_minute แทน
 */
export function connectMqtt(
  opts: MqttOptions,
  log: Logger,
  onMessage: MessageHandler,
): MqttClient {
  const client = mqtt.connect(opts.url, {
    username: opts.username,
    password: opts.password,
    clean: true,
    reconnectPeriod: 2000,          // ฐานของ backoff
    connectTimeout: 10_000,
    keepalive: 30,
    resubscribe: true,
  });

  let attempts = 0;

  client.on('connect', () => {
    attempts = 0;
    client.subscribe(opts.topic, { qos: 0 }, (err) => {
      if (err) log.error({ err, topic: opts.topic }, 'subscribe ไม่สำเร็จ');
      else log.info({ topic: opts.topic }, 'เชื่อมต่อ MQTT และ subscribe แล้ว');
    });
  });

  client.on('reconnect', () => {
    attempts += 1;
    // exponential backoff มีเพดาน 60 วินาที
    const delay = Math.min(2000 * 2 ** Math.min(attempts, 5), 60_000);
    client.options.reconnectPeriod = delay;
    log.warn({ attempts, delayMs: delay }, 'กำลังเชื่อมต่อ MQTT ใหม่');
  });

  client.on('error', (err) => log.error({ err }, 'MQTT error'));
  client.on('offline', () => log.warn('MQTT offline'));
  client.on('close', () => log.debug('MQTT ปิดการเชื่อมต่อ'));

  client.on('message', (topic, payload) => {
    try {
      onMessage(topic, payload);
    } catch (err) {
      // ข้อความเดียวพังต้องไม่ล้มทั้ง service
      log.error({ err, topic }, 'ประมวลผลข้อความไม่สำเร็จ');
    }
  });

  return client;
}
