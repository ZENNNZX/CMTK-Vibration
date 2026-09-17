import http from 'node:http';
import https from 'node:https';

import { buildFluxQuery, parseFluxCsv, type InfluxReading } from './influxQuery.js';

export interface InfluxConfig {
  url: string;
  org: string;
  bucket: string;
  token: string;
}

/** AC-007-02 กำหนด 2 วินาที — ตัดที่ 8 เพื่อให้ยังเหลือเวลาถอยไป Postgres ทัน */
const TIMEOUT_MS = 8_000;

export function createInfluxReadingRepository(cfg: InfluxConfig) {
  const query = (flux: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const u = new URL(cfg.url + '/api/v2/query');
      u.searchParams.set('org', cfg.org);
      const lib = u.protocol === 'https:' ? https : http;
      const payload = Buffer.from(flux, 'utf8');
      const req = lib.request(
        u,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${cfg.token}`,
            'Content-Type': 'application/vnd.flux',
            Accept: 'application/csv',
            'Content-Length': payload.length,
          },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          let b = '';
          res.on('data', (d) => (b += d));
          res.on('end', () =>
            res.statusCode === 200
              ? resolve(b)
              : reject(new Error(`HTTP ${res.statusCode} ${b.slice(0, 200)}`)),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(payload);
      req.end();
    });

  return {
    async listReadings(motorId: number, hours: number): Promise<InfluxReading[]> {
      const csv = await query(buildFluxQuery({ bucket: cfg.bucket, motorId, hours }));
      return parseFluxCsv(csv);
    },
  };
}

export type InfluxReadingRepository = ReturnType<typeof createInfluxReadingRepository>;
