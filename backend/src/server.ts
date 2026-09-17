import pino from 'pino';

import { createApp } from './app.js';
import { createPool } from './config/db.js';
import { loadEnv } from './config/env.js';
import { createPredictionRepository } from './repositories/predictionRepository.js';
import { createPredictionService } from './services/predictionService.js';
import { createInfluxReadingRepository } from './repositories/influxReadingRepository.js';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const pool = createPool(env.DATABASE_URL, env.DB_POOL_MAX);

/** ไม่ครบทั้งสี่ค่า = ไม่เปิดใช้ กราฟใช้ Postgres เหมือนเดิม */
const influx =
  env.INFLUX2_URL && env.INFLUX2_TOKEN && env.INFLUX2_ORG && env.INFLUX2_BUCKET
    ? createInfluxReadingRepository({
        url: env.INFLUX2_URL,
        org: env.INFLUX2_ORG,
        bucket: env.INFLUX2_BUCKET,
        token: env.INFLUX2_TOKEN,
      })
    : undefined;
log.info({ influx: influx ? 'เปิด' : 'ปิด (ใช้ Postgres)' }, 'แหล่งอนุกรมเวลา');

const server = createApp(pool, { log, jwtSecret: env.JWT_SECRET, influx }).listen(env.PORT, () => {
  log.info({ port: env.PORT }, 'API พร้อมรับคำขอ');
});

/**
 * งานทำนาย — ต้องบันทึกค่าที่ทำนาย "ตอนทำนาย" ไม่ใช่ตอนจะดูคะแนน
 * ทำนายรายวัน รันถี่กว่านั้นก็ได้แถวเดิม (uq_prediction กันซ้ำอยู่แล้ว)
 * ยิงทุกชั่วโมงเพื่อให้บอร์ดที่เพิ่งบูตไม่ต้องรอถึงวันรุ่งขึ้น
 */
const PREDICT_INTERVAL_MS = 3_600_000;
const predictions = createPredictionService(createPredictionRepository(pool));

const runPredictionJob = (): void => {
  void Promise.all([predictions.generate(), predictions.scoreDue()])
    .then(([written, scored]) => {
      // written = 0 เป็นเรื่องปกติตอนข้อมูลยังไม่ถึง 4 วัน — ปฏิเสธที่จะเดาดีกว่าเดามั่ว
      log.info({ written, scored }, 'งานทำนายเสร็จรอบหนึ่ง');
    })
    .catch((err) => log.error({ err }, 'งานทำนายล้มเหลว — ไม่กระทบ API'));
};

runPredictionJob();
const predictionTimer = setInterval(runPredictionJob, PREDICT_INTERVAL_MS);

const shutdown = (signal: string): void => {
  log.info({ signal }, 'กำลังปิด API');
  clearInterval(predictionTimer);
  server.close(() => void pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
