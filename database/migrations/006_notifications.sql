-- 006 · notification_recipients + notification_log
-- rollback: DROP TABLE notification_log, notification_recipients;

CREATE TABLE IF NOT EXISTS notification_recipients (
    id         SERIAL PRIMARY KEY,
    channel    notify_channel NOT NULL,
    target     VARCHAR(255)   NOT NULL,   -- userId / groupId / '@broadcast' / อีเมล
    label      VARCHAR(100)   NOT NULL,
    active     BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_recipient UNIQUE (channel, target)
);

CREATE TABLE IF NOT EXISTS notification_log (
    id             BIGSERIAL PRIMARY KEY,
    alarm_event_id BIGINT         REFERENCES alarm_events(id),
    recipient_id   INTEGER        REFERENCES notification_recipients(id),
    channel        notify_channel NOT NULL,
    status         notify_status  NOT NULL,
    message_count  SMALLINT       NOT NULL DEFAULT 0,
    error_detail   TEXT,
    sent_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notify_debounce ON notification_log (alarm_event_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notify_month    ON notification_log (sent_at) WHERE status = 'sent';
