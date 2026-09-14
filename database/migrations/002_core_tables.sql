-- 002 · users + motors
-- rollback: DROP TABLE motors, users;

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    role          user_role    NOT NULL DEFAULT 'maintenance',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE is_active;

CREATE TABLE IF NOT EXISTS motors (
    id                  SERIAL PRIMARY KEY,
    tag                 VARCHAR(32)   NOT NULL UNIQUE,
    name                VARCHAR(120)  NOT NULL,
    master_no           SMALLINT      NOT NULL,
    port_no             SMALLINT      NOT NULL,
    rated_kw            NUMERIC(6,2),
    iso_group           SMALLINT,
    mounting_rigid      BOOLEAN       NOT NULL DEFAULT TRUE,
    sensor_mount        mount_point   NOT NULL DEFAULT 'DE-H',
    sensor_mount_offset JSONB,
    warning_threshold   NUMERIC(6,3)  NOT NULL DEFAULT 2.800,
    alarm_threshold     NUMERIC(6,3)  NOT NULL DEFAULT 4.500,
    run_hours           NUMERIC(10,2) NOT NULL DEFAULT 0,
    run_hours_reset_at  TIMESTAMPTZ,
    last_seen_at        TIMESTAMPTZ,
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_motor_port UNIQUE (master_no, port_no),
    CONSTRAINT ck_threshold  CHECK (warning_threshold < alarm_threshold),
    CONSTRAINT ck_port       CHECK (port_no BETWEEN 0 AND 7)
);
