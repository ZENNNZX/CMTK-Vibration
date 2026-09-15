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

/** ค่าเฉลี่ยรายวันต่อเมตริก — ทำนายเป็นรายวัน จึงต้องย่อจากรายนาทีก่อน */
const DAILY_AVG = (col: string) => `
  SELECT (minute_ts AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
         AVG(${col})::text AS avg
    FROM readings_minute
   WHERE motor_id = $1
     AND ${col} IS NOT NULL
     AND minute_ts >= NOW() - ($2 || ' days')::interval
   GROUP BY 1
   ORDER BY 1`;

// เมตริกมาจากคีย์ตายตัวสามตัวนี้เท่านั้น ไม่มีอะไรจากผู้ใช้เข้าไปในสตริง SQL (NFR-07)
const COLUMN: Record<string, string> = {
  vrms_y: 'vrms_y_avg',
  vrms_z: 'vrms_z_avg',
  temperature: 'temperature_avg',
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

    async activeMotorIds(): Promise<number[]> {
      const res = (await db.query(`SELECT id FROM motors WHERE is_active ORDER BY id`)) as {
        rows: { id: number }[];
      };
      return res.rows.map((r) => Number(r.id));
    },
  };
}

export type PredictionRepository = ReturnType<typeof createPredictionRepository>;
