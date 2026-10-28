-- 014 · health_daily — ดัชนีสุขภาพหลายตัวแปรรายวัน (Mahalanobis)
--
-- ทำไมต้องมี: เส้นทำนายตอบได้แค่ "อีกกี่วันจะแตะเกณฑ์" ซึ่งต้องรอค่าไต่ขึ้นไปถึงเส้นก่อน
-- ดัชนีนี้ตอบคนละคำถาม — "วันนี้ต่างจากตอนที่เครื่องยังปกติแค่ไหน" โดยดูหลายตัวแปรพร้อมกัน
-- ค่าที่แต่ละตัวยังไม่ผิดปกติ แต่ผิดปกติเมื่อดูพร้อมกัน (เช่น สั่นขึ้นนิดพร้อมร้อนขึ้นนิด)
-- จะโผล่ที่นี่ก่อนที่ค่าตัวเดียวจะข้ามเกณฑ์ ISO
--
-- D² = (x−μ)ᵀ Σ⁻¹ (x−μ) โดย μ, Σ มาจากช่วงฐานของมอเตอร์ตัวนั้นเอง
-- ภายใต้สมมติฐาน normal, D² ~ χ²(df) จึงใช้ตารางไคสแควร์เป็นเกณฑ์ได้เลย ไม่ต้องจูนตัวเลขเอง
--
-- ⚠ ช่วงฐานคือ "30 วันแรกที่มีข้อมูลเดินเครื่อง" ซึ่ง **ยังไม่มีใครยืนยันว่าเครื่องปกติจริง**
-- ถ้ามอเตอร์เสื่อมมาตั้งแต่ก่อนหน้านั้น D² จะดูปกติทั้งที่เครื่องแย่
-- เก็บ baseline_from / baseline_to ไว้ทุกแถวเพื่อให้ย้อนไปตรวจสมมติฐานนี้ได้
--
-- rollback:
--   DROP TABLE IF EXISTS health_daily;
--   -- ถอน enum value ไม่ได้ใน PostgreSQL ต้องสร้าง type ใหม่ทั้งตัว

-- เหตุการณ์ชนิดใหม่สำหรับดัชนีนี้ — ไม่ปนกับ warning/alarm ที่มาจากเกณฑ์ ISO ตรง ๆ
ALTER TYPE event_kind ADD VALUE IF NOT EXISTS 'health_anomaly';

CREATE TABLE IF NOT EXISTS health_daily (
    id            BIGSERIAL    PRIMARY KEY,
    motor_id      INTEGER      NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
    day           DATE         NOT NULL,

    -- ชื่อโมเดล — เปลี่ยนสูตรแล้วค่าเก่าต้องไม่ถูกอ่านปนกับค่าใหม่
    model         VARCHAR(30)  NOT NULL DEFAULT 'mahalanobis-v1',

    d2            NUMERIC(10,3) NOT NULL,
    -- จำนวนตัวแปรที่ใช้ — เกณฑ์ไคสแควร์เปลี่ยนตามค่านี้ ต้องเก็บคู่กับ d2 เสมอ
    dof           SMALLINT     NOT NULL,
    n_running     SMALLINT     NOT NULL,

    baseline_from DATE         NOT NULL,
    baseline_to   DATE         NOT NULL,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_health_d2       CHECK (d2 >= 0),
    CONSTRAINT ck_health_dof      CHECK (dof BETWEEN 2 AND 10),
    CONSTRAINT ck_health_baseline CHECK (baseline_to >= baseline_from),
    CONSTRAINT uq_health          UNIQUE (motor_id, day, model)
);

CREATE INDEX IF NOT EXISTS idx_health_motor_day ON health_daily (motor_id, day DESC);
