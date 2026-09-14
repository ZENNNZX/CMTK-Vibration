-- 008 · updated_at trigger
-- re-runnable — CREATE OR REPLACE TRIGGER มีตั้งแต่ PostgreSQL 14 (image ใช้ 16)
-- rollback: DROP FUNCTION set_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','motors','alarm_events',
                             'maintenance_logs','notification_recipients']
    LOOP
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END $$;

-- readings_minute · notification_log · audit_logs ไม่มี trigger เพราะเขียนแล้วไม่แก้
