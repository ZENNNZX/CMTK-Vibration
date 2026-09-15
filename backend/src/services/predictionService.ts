import type { PredictionRepository } from '../repositories/predictionRepository.js';
import { METRICS } from '../repositories/predictionRepository.js';
import { fitLinear, score, type Score } from './predictionMath.js';

/** ใช้ข้อมูลย้อนหลังเท่านี้ฟิตเส้น — สั้นกว่านี้เส้นแกว่งตามกะ ยาวกว่านี้ตามแนวโน้มใหม่ไม่ทัน */
const FIT_DAYS = 14;
/** ทำนายล่วงหน้าถึงกี่วัน — ไกลกว่านี้ช่วงความเชื่อมั่นกว้างจนไม่มีประโยชน์ */
const HORIZONS = [1, 3, 7];

export interface MotorScore {
  motorId: number;
  tag: string;
  metric: string;
  score: Score | null;
}

export interface MonthSummary {
  month: string;
  threshold: number;
  overall: Score | null;
  perMotor: MotorScore[];
  /** ไม่มีข้อมูลเลยกับทำนายแล้วผิดหมด คนละเรื่อง — หน้าเว็บต้องแยกให้ออก */
  hasData: boolean;
}

const dayKeyTH = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

export function createPredictionService(repo: PredictionRepository) {
  return {
    /**
     * บันทึกค่าที่ทำนายไว้ ณ ตอนนี้ สำหรับวันข้างหน้า
     * ต้องเขียนตอนทำนาย ไม่ใช่ตอนจะดูคะแนน — ไม่งั้นเป็นการวัดตัวเองด้วยเฉลยที่เปิดดูแล้ว
     */
    async generate(now = new Date()): Promise<number> {
      let written = 0;
      for (const motorId of await repo.activeMotorIds()) {
        for (const metric of METRICS) {
          const rows = await repo.dailyAverages(motorId, metric, FIT_DAYS);
          const points = rows.map((r, i) => ({ x: i, y: Number(r.avg) }));
          const fit = fitLinear(points);
          if (!fit) continue;

          const lastX = points.length - 1;
          for (const h of HORIZONS) {
            const target = new Date(now.getTime() + h * 86_400_000);
            const value = fit.slope * (lastX + h) + fit.intercept;
            // ช่วงความเชื่อมั่นกว้างขึ้นตามระยะที่ทำนายไกลออกไป
            const spread = fit.se * 1.96 * (1 + h / Math.max(...HORIZONS));
            await repo.insert({
              motorId,
              metric,
              targetDay: dayKeyTH(target),
              horizonDays: h,
              sampleCount: fit.n,
              predictedValue: Math.max(0, +value.toFixed(3)),
              ciLow: Math.max(0, +(value - spread).toFixed(3)),
              ciHigh: Math.max(0, +(value + spread).toFixed(3)),
            });
            written++;
          }
        }
      }
      return written;
    },

    /** เติมค่าจริงให้แถวที่วันนั้นผ่านไปแล้ว */
    async scoreDue(): Promise<number> {
      return repo.fillActuals();
    },

    async summary(month: string, threshold: number): Promise<MonthSummary> {
      const rows = await repo.scoredInMonth(`${month}-01`);
      const pairs = rows.map((r) => ({
        predicted: Number(r.predicted_value),
        actual: Number(r.actual_value),
        motorId: Number(r.motor_id),
        tag: r.tag,
        metric: r.metric,
      }));

      const keys = [...new Set(pairs.map((p) => `${p.motorId}|${p.metric}`))];
      return {
        month,
        threshold,
        overall: score(pairs, threshold),
        perMotor: keys.map((k) => {
          const mine = pairs.filter((p) => `${p.motorId}|${p.metric}` === k);
          return {
            motorId: mine[0].motorId,
            tag: mine[0].tag,
            metric: mine[0].metric,
            score: score(mine, threshold),
          };
        }),
        hasData: pairs.length > 0,
      };
    },
  };
}

export type PredictionService = ReturnType<typeof createPredictionService>;
