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

export interface Upcoming {
  targetDay: string;
  horizonDays: number;
  predicted: number;
  ciLow: number;
  ciHigh: number;
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

/**
 * ระยะห่างเป็นวันระหว่างสองวันตามปฏิทินไทย — ใช้เป็นแกน x ของเส้นฟิต
 * ผูก +07:00 ให้ชัด ไม่งั้น 'YYYY-MM-DD' จะถูกอ่านเป็นเที่ยงคืน UTC แล้วเพี้ยนไป 7 ชั่วโมง
 */
const dayIndex = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00+07:00`) - Date.parse(`${from}T00:00:00+07:00`)) / 86_400_000);

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
          if (!rows.length) continue;

          // x เป็นจำนวนวันจริงนับจากวันแรกของชุด ไม่ใช่ลำดับแถว —
          // วันที่เครื่องไม่เดินเลยจะไม่มีแถว ถ้านับตามลำดับแถวจะกลายเป็นว่าวันหายไม่เคยมีอยู่
          // ความชันที่ได้จึงชันเกินจริง และ "อีก h วัน" ก็ไม่ได้แปลว่า h วันจริง ๆ
          const points = rows.map((r) => ({ x: dayIndex(rows[0].day, r.day), y: Number(r.avg) }));
          const fit = fitLinear(points);
          if (!fit) continue;

          for (const h of HORIZONS) {
            const target = new Date(now.getTime() + h * 86_400_000);
            const targetDay = dayKeyTH(target);
            // วางค่าที่จะทำนายบนแกนเดียวกับชุดที่ฟิต — วันสุดท้ายที่มีข้อมูลอาจไม่ใช่วันนี้
            const value = fit.slope * dayIndex(rows[0].day, targetDay) + fit.intercept;
            // ช่วงความเชื่อมั่นกว้างขึ้นตามระยะที่ทำนายไกลออกไป
            const spread = fit.se * 1.96 * (1 + h / Math.max(...HORIZONS));
            await repo.insert({
              motorId,
              metric,
              targetDay,
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

    /**
     * เส้นทำนายสำหรับกราฟหน้ารายละเอียด — คืนค่าที่ "บันทึกไว้ตอนทำนาย" ไม่ใช่ฟิตใหม่ตอนเรียก
     * ถ้าฟิตใหม่ เส้นที่ผู้ใช้เห็นจะไม่ใช่เส้นเดียวกับที่หน้าสรุปรายเดือนเอาไปให้คะแนน
     * กลายเป็นคนละคำทำนายที่อ้างคะแนนเดียวกัน
     */
    async upcoming(motorId: number, metric = 'vrms_y'): Promise<Upcoming[]> {
      const rows = await repo.upcoming(motorId, metric);
      return rows.map((r) => ({
        targetDay: r.target_day,
        horizonDays: Number(r.horizon_days),
        predicted: Number(r.predicted_value),
        ciLow: Number(r.ci_low),
        ciHigh: Number(r.ci_high),
      }));
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
