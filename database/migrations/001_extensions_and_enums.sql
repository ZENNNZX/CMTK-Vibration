-- 001 · Enums
-- re-runnable ตาม SOP Phase 3 — CREATE TYPE ไม่มี IF NOT EXISTS จึงต้องดัก duplicate_object
-- rollback: DROP TYPE notify_status, notify_channel, mount_point, cause_code,
--                     event_metric, event_kind, severity_zone, user_role;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('maintenance', 'manager', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE severity_zone AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE event_kind AS ENUM ('alarm', 'warning', 'zone_change', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE event_metric AS ENUM ('vibration', 'temperature', 'connectivity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE cause_code AS ENUM ('bearing', 'misalignment', 'imbalance',
                                            'looseness', 'lubrication', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE mount_point AS ENUM ('DE-H', 'DE-V', 'DE-A', 'NDE-H', 'NDE-V');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE notify_channel AS ENUM ('line', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE notify_status AS ENUM ('sent', 'failed', 'suppressed_debounce',
                                               'suppressed_daily_cap', 'suppressed_quota',
                                               'skipped_not_notifiable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
