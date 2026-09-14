-- 005 · maintenance_logs — ทรัพย์สินระยะยาว สร้างย้อนหลังไม่ได้
-- rollback: DROP TABLE maintenance_logs;

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              SERIAL PRIMARY KEY,
    motor_id        INTEGER     NOT NULL REFERENCES motors(id),
    alarm_event_id  BIGINT      REFERENCES alarm_events(id),
    cause           cause_code  NOT NULL,
    description     TEXT,
    performed_by    INTEGER     NOT NULL REFERENCES users(id),
    performed_at    TIMESTAMPTZ NOT NULL,
    reset_run_hours BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_motor ON maintenance_logs (motor_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_maint_cause ON maintenance_logs (cause, performed_at DESC);
