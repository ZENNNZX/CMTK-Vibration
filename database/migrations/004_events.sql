-- 004 · alarm_events
-- rollback: DROP TABLE alarm_events;

CREATE TABLE IF NOT EXISTS alarm_events (
    id              BIGSERIAL PRIMARY KEY,
    motor_id        INTEGER      NOT NULL REFERENCES motors(id),
    kind            event_kind   NOT NULL,
    metric          event_metric NOT NULL,

    raised_at       TIMESTAMPTZ  NOT NULL,
    resolved_at     TIMESTAMPTZ,
    value_at_raise  NUMERIC(7,3),
    zone_from       severity_zone,
    zone_to         severity_zone,

    acknowledged_by INTEGER      REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    ack_note        TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_resolve CHECK (resolved_at IS NULL OR resolved_at >= raised_at),
    CONSTRAINT ck_ack     CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL))
);

-- AC-008-03 · ฐานข้อมูลบังคับเองว่า event ประเภทเดียวกันที่ยังไม่ปิด มีได้รายการเดียว
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_event
    ON alarm_events (motor_id, kind, metric)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_calendar ON alarm_events (raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_unacked  ON alarm_events (raised_at DESC)
    WHERE acknowledged_at IS NULL;
