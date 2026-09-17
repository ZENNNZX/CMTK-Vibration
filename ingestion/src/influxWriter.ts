import http from 'node:http';
import https from 'node:https';
import type { Logger } from 'pino';

import { toLineProtocol, type PointTags } from './influxLine.js';

export interface InfluxConfig {
  url: string;
  org: string;
  bucket: string;
  token: string;
}

/** ส่งทีละบรรทัดคือยิง HTTP วินาทีละ 8 ครั้ง — รวมเป็นก้อนแล้วส่งรอบเดียว */
const FLUSH_MS = 5_000;
/** กันหน่วยความจำบวมตอน InfluxDB ล่ม — เกินนี้ทิ้งของเก่าสุด */
const MAX_QUEUE = 20_000;

export function createInfluxWriter(cfg: InfluxConfig, log: Logger) {
  let queue: string[] = [];
  let dropped = 0;
  let failed = 0;

  const post = (body: string) =>
    new Promise<void>((resolve, reject) => {
      const u = new URL(cfg.url + '/api/v2/write');
      u.searchParams.set('org', cfg.org);
      u.searchParams.set('bucket', cfg.bucket);
      u.searchParams.set('precision', 'ns');
      const lib = u.protocol === 'https:' ? https : http;
      const payload = Buffer.from(body, 'utf8');
      const req = lib.request(
        u,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${cfg.token}`,
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': payload.length,
          },
          timeout: 15_000,
        },
        (res) => {
          let b = '';
          res.on('data', (d) => (b += d));
          res.on('end', () =>
            res.statusCode === 204
              ? resolve()
              : reject(new Error(`HTTP ${res.statusCode} ${b.slice(0, 200)}`)),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(payload);
      req.end();
    });

  const flush = async (): Promise<void> => {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      await post(batch.join('\n'));
      if (failed > 0) {
        log.info({ failed, dropped }, 'InfluxDB กลับมาเขียนได้แล้ว');
        failed = 0;
      }
    } catch (err) {
      failed += batch.length;
      // AC-004-08 แบบเดียวกับ Postgres — ปลายทางล่มต้องไม่ทำให้ ingestion ตาย
      // เอาของกลับเข้าคิวหัวแถวเพื่อลองใหม่รอบหน้า
      queue = [...batch, ...queue].slice(-MAX_QUEUE);
      log.warn({ err, queued: queue.length }, 'เขียน InfluxDB ไม่สำเร็จ จะลองใหม่รอบหน้า');
    }
  };

  const timer = setInterval(() => void flush(), FLUSH_MS);

  return {
    add(tags: PointTags, items: Record<string, unknown>, at: Date): void {
      const line = toLineProtocol(tags, items, at);
      if (!line) return;
      queue.push(line);
      if (queue.length > MAX_QUEUE) {
        queue = queue.slice(-MAX_QUEUE);
        dropped++;
      }
    },
    flush,
    stats: () => ({ queued: queue.length, dropped, failed }),
    async close(): Promise<void> {
      clearInterval(timer);
      await flush();
    },
  };
}

export type InfluxWriter = ReturnType<typeof createInfluxWriter>;
