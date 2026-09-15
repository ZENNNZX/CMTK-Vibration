-- 011 · predictions — เก็บ "ค่าที่ทำนายไว้" ตั้งแต่ตอนทำนาย
--
-- ทำไมต้องมีตารางนี้: หน้าสรุปรายเดือนวัด Accuracy / Precision / Recall / F1
-- จากการเทียบค่าที่ทำนาย กับค่าที่วัดได้จริงเมื่อถึงวันนั้น
-- ถ้าไม่บันทึกไว้ตอนทำนาย ย้อนกลับไปสร้างทีหลังไม่ได้ —
-- คำนวณใหม่จากข้อมูลที่รู้แล้วทั้งหมดคือการโกงตัวเอง ไม่ใช่การวัดผล
--
-- rollback:
--   DROP TABLE IF EXISTS predictions;
--   DROP TYPE IF EXISTS predict_metric;

DO $$ BEGIN CREATE TYPE predict_metric AS ENUM ('vrms_y', 'vrms_z', 'temperature');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS predictions (
    id              BIGSERIAL      PRIMARY KEY,
    motor_id        INTEGER        NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
    metric          predict_metric NOT NULL,

    -- ชื่อโมเดลที่ออกค่านี้ — เปลี่ยนโมเดลแล้วคะแนนเก่าต้องไม่ปนกับของใหม่
    model           VARCHAR(30)    NOT NULL DEFAULT 'linear-ols',

    predicted_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),  -- ทำนายตอนไหน
    target_day      DATE           NOT NULL,                -- ทำนายถึงวันไหน
    horizon_days    SMALLINT       NOT NULL,                -- ล่วงหน้ากี่วัน
    sample_count    SMALLINT       NOT NULL,                -- ใช้ข้อมูลกี่จุดฟิต

    predicted_value NUMERIC(7,3)   NOT NULL,
    ci_low          NUMERIC(7,3),                           -- ช่วงความเชื่อมั่น 95%
    ci_high         NUMERIC(7,3),

    -- เติมเมื่อถึงวันจริงแล้วเท่านั้น · NULL = ยังไม่ถึงกำหนดให้คะแนน
    actual_value    NUMERIC(7,3),
    scored_at       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    -- ทำนายซ้ำรอบเดิมไม่เกิดแถวซ้ำ (แบบเดียวกับ uq_reading)
    CONSTRAINT uq_prediction UNIQUE (motor_id, metric, model, target_day, horizon_days),

    CONSTRAINT ck_pred_horizon  CHECK (horizon_days BETWEEN 1 AND 90),
    CONSTRAINT ck_pred_value    CHECK (predicted_value >= 0),
    CONSTRAINT ck_pred_actual   CHECK (actual_value IS NULL OR actual_value >= 0),
    CONSTRAINT ck_pred_samples  CHECK (sample_count > 0),
    CONSTRAINT ck_pred_ci       CHECK (ci_low IS NULL OR ci_high IS NULL OR ci_low <= ci_high),
    -- ให้คะแนนแล้วต้องมีทั้งค่าจริงและเวลาที่ให้คะแนน ขาดอย่างใดอย่างหนึ่งไม่ได้
    CONSTRAINT ck_pred_scored   CHECK ((actual_value IS NULL) = (scored_at IS NULL))
);

-- หน้ารายละเอียดมอเตอร์: ดึงของตัวเดียวเรียงตามวัน
CREATE INDEX IF NOT EXISTS idx_pred_motor_day ON predictions (motor_id, target_day DESC);
-- หน้าสรุปรายเดือน: กวาดทั้งเดือนของทุกมอเตอร์
CREATE INDEX IF NOT EXISTS idx_pred_day       ON predictions (target_day DESC);
-- งานเติมค่าจริง: หาเฉพาะแถวที่ถึงกำหนดแล้วแต่ยังไม่ได้คะแนน
CREATE INDEX IF NOT EXISTS idx_pred_unscored  ON predictions (target_day) WHERE actual_value IS NULL;

CREATE OR REPLACE TRIGGER trg_predictions_updated
    BEFORE UPDATE ON predictions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
