-- 003 · readings_minute — ตารางที่โตที่สุด ~300 MB/ปี
-- rollback: DROP TABLE readings_minute;

CREATE TABLE IF NOT EXISTS readings_minute (
    id              BIGSERIAL PRIMARY KEY,
    motor_id        INTEGER     NOT NULL REFERENCES motors(id),
    minute_ts       TIMESTAMPTZ NOT NULL,

    vrms_y_min      NUMERIC(7,3),
    vrms_y_avg      NUMERIC(7,3),
    vrms_y_max      NUMERIC(7,3),
    vrms_z_min      NUMERIC(7,3),
    vrms_z_avg      NUMERIC(7,3),
    vrms_z_max      NUMERIC(7,3),
    temperature_min NUMERIC(6,2),
    temperature_avg NUMERIC(6,2),
    temperature_max NUMERIC(6,2),

    zone            severity_zone,
    sample_count    SMALLINT    NOT NULL,
    invalid_count   SMALLINT    NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- เขียนซ้ำตอน reconnect ไม่เกิดแถวซ้ำ
    CONSTRAINT uq_reading UNIQUE (motor_id, minute_ts)
);

CREATE INDEX IF NOT EXISTS idx_readings_motor_time ON readings_minute (motor_id, minute_ts DESC);
CREATE INDEX IF NOT EXISTS idx_readings_time       ON readings_minute (minute_ts DESC);
