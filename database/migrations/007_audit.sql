-- 007 · audit_logs — INSERT และ SELECT เท่านั้น
-- rollback: DROP TABLE audit_logs;

CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    actor_id     INTEGER     REFERENCES users(id),
    action       VARCHAR(64) NOT NULL,
    entity_type  VARCHAR(40) NOT NULL,
    entity_id    BIGINT,
    before_value JSONB,
    after_value  JSONB,
    ip_address   INET,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_logs (actor_id, created_at DESC);

-- ห้ามแก้หรือลบหลักฐาน — บังคับที่ระดับฐานข้อมูล ไม่พึ่งวินัยของโค้ด
CREATE OR REPLACE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
