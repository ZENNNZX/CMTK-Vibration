import type { Db } from '../config/db.js';

export interface PredictionRow {
  motor_id: number;
  tag: string;
  metric: string;
  target_day: string;
  horizon_days: number;
  predicted_value: string;
  actual_value: string | null;
}

export interface DailyAvgRow {
  day: string;
  avg: string;
}

export interface UpcomingRow {
  target_day: string;
  horizon_days: number;
  predicted_value: string;
  ci_low: string;
  ci_high: string;
}

/**
 * วันที่เครื่องเดินน้อยกว่านี้ไม่นับเป็นจุดข้อมูล — เศษกะครึ่งชั่วโมง
 * ไม่ใช่ตัวแทนของทั้งวัน แต่ถ่วงเส้นฟิตได้เท่ากับวันที่เดินเต็ม
 */
const MIN_RUNNING_MINUTES = 30;

/**
 * ค่าเฉลี่ยรายวันต่อเมตริก — อ่านจาก v_motor_daily ซึ่งกรองเฉพาะนาทีที่เครื่องเดินไว้แล้ว
 * เกณฑ์ "เดิน" อยู่ใน migration 013 ที่เดียว ห้ามเขียนซ้ำที่นี่
 */
const DAILY_AVG = (col: string) => `
  SELECT day::text AS day, ${col}::text AS avg
    FROM v_motor_daily
   WHERE motor_id = $1
     AND ${col} IS NOT NULL
     AND n_running >= ${MIN_RUNNING_MINUTES}
     AND day >= (NOW() AT TIME ZONE 'Asia/Bangkok')::date - ($2)::int
   ORDER BY day`;

// เมตริกมาจากคีย์ตายตัวสามตัวนี้เท่านั้น ไม่มีอะไรจากผู้ใช้เข้าไปในสตริง SQL (NFR-07)
const COLUMN: Record<string, string> = {
  vrms_y: 'vrms_y',
  vrms_z: 'vrms_z',
  temperature: 'temperature',
};
export const METRICS = Object.keys(COLUMN);

export function createPredictionRepository(db: Db) {
  return {
    async dailyAverages(motorId: number, metric: string, days: number): Promise<DailyAvgRow[]> {
      const col = COLUMN[metric];
      if (!col) throw new Error(`เมตริกที่ไม่รู้จัก: ${metric}`);
      const res = (await db.query(DAILY_AVG(col), [motorId, days])) as { rows: DailyAvgRow[] };
      return res.rows;
    },

    /** ทำนายซ้ำรอบเดิมไม่ทับของเก่า — ค่าที่บันทึกไว้แล้วคือหลักฐาน ห้ามแก้ย้อนหลัง */
    async insert(p: {
      motorId: number;
      metric: string;
      targetDay: string;
      horizonDays: number;
      sampleCount: number;
      predictedValue: number;
      ciLow: number;
      ciHigh: number;
    }): Promise<void> {
      await db.query(
        `INSERT INTO predictions
           (motor_id, metric, target_day, horizon_days, sample_count, predicted_value, ci_low, ci_high)
         VALUES ($1, $2::predict_metric, $3::date, $4, $5, $6, $7, $8)
         ON CONFLICT ON CONSTRAINT uq_prediction DO NOTHING`,
        [p.motorId, p.metric, p.targetDay, p.horizonDays, p.sampleCount, p.predictedValue, p.ciLow, p.ciHigh],
      );
    },

    /**
     * เติมค่าจริงให้แถวที่ถึงกำหนดแล้ว — จับคู่กับค่าเฉลี่ยรายวันของวันนั้น
     * ทำทีเดียวทั้งตารางด้วย UPDATE...FROM เพราะวนทีละแถวจะยิงคิวรีเป็นร้อย
     */
    async fillActuals(): Promise<number> {
      // LATERAL ใน UPDATE...FROM อ้างตารางเป้าหมายไม่ได้ — ต้องเขียน CASE ตรง ๆ ทั้งใน SET และ WHERE
      const res = (await db.query(
        `UPDATE predictions p
            SET actual_value = CASE p.metric
                                 WHEN 'vrms_y' THEN r.vrms_y
                                 WHEN 'vrms_z' THEN r.vrms_z
                                 ELSE r.temperature
                               END,
                scored_at = NOW()
           FROM (
             SELECT motor_id,
                    (minute_ts AT TIME ZONE 'Asia/Bangkok')::date AS day,
                    AVG(vrms_y_avg) AS vrms_y,
                    AVG(vrms_z_avg) AS vrms_z,
                    AVG(temperature_avg) AS temperature
               FROM readings_minute
              GROUP BY 1, 2
           ) r
          WHERE p.actual_value IS NULL
            AND p.motor_id = r.motor_id
            AND p.target_day = r.day
            AND p.target_day < (NOW() AT TIME ZONE 'Asia/Bangkok')::date
            AND CASE p.metric
                  WHEN 'vrms_y' THEN r.vrms_y
                  WHEN 'vrms_z' THEN r.vrms_z
                  ELSE r.temperature
                END IS NOT NULL`,
      )) as { rowCount?: number };
      return res.rowCount ?? 0;
    },

    /** เฉพาะแถวที่ให้คะแนนแล้ว — แถวที่ยังไม่ถึงกำหนดเอามานับไม่ได้ */
    async scoredInMonth(firstDay: string): Promise<PredictionRow[]> {
      const res = (await db.query(
        `SELECT p.motor_id, m.tag, p.metric::text, p.target_day::text,
                p.horizon_days, p.predicted_value, p.actual_value
           FROM predictions p
           JOIN motors m ON m.id = p.motor_id
          WHERE p.actual_value IS NOT NULL
            AND p.target_day >= $1::date
            AND p.target_day <  ($1::date + INTERVAL '1 month')
          ORDER BY p.target_day`,
        [firstDay],
      )) as { rows: PredictionRow[] };
      return res.rows;
    },

    /**
     * ค่าที่ทำนายไว้ 90 วันย้อนหลังถึงวันข้างหน้า — ใช้วาดเส้นประบนกราฟหน้ารายละเอียด
     * ย้อนหลังเพื่อเทียบกับค่าจริง · 90 = ช่วงยาวสุดที่หน้านั้นให้เลือก
     * DISTINCT ON เลือก horizon สั้นสุดของแต่ละวัน เพราะทำนายใกล้กว่าย่อมแม่นกว่า
     * และวันเดียวกันถูกทำนายได้หลายรอบจากคนละ horizon
     */
    async upcoming(motorId: number, metric: string): Promise<UpcomingRow[]> {
      if (!COLUMN[metric]) throw new Error(`เมตริกที่ไม่รู้จัก: ${metric}`);
      const res = (await db.query(
        `SELECT DISTINCT ON (target_day)
                target_day::text, horizon_days, predicted_value, ci_low, ci_high
           FROM predictions
          WHERE motor_id = $1
            AND metric = $2::predict_metric
            AND target_day >= (NOW() AT TIME ZONE 'Asia/Bangkok')::date - 90
          ORDER BY target_day, horizon_days`,
        [motorId, metric],
      )) as { rows: UpcomingRow[] };
      return res.rows;
    },

    async activeMotorIds(): Promise<number[]> {
      const res = (await db.query(`SELECT id FROM motors WHERE is_active ORDER BY id`)) as {
        rows: { id: number }[];
      };
      return res.rows.map((r) => Number(r.id));
    },
  };
}

export type PredictionRepository = ReturnType<typeof createPredictionRepository>;
