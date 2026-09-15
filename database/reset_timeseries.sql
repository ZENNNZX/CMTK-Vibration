-- ล้างข้อมูลอนุกรมเวลาที่ timestamp เพี้ยน +7 ชม. แล้วเริ่มนับใหม่
-- เหตุ: บอร์ด CMTK ส่งเวลาไทยแต่ติดป้าย Z (วัดจริง 2026-09-15)
-- แก้ที่ต้นทางแล้วด้วย SENSOR_CLOCK_OFFSET_MINUTES=-420
--
-- รันครั้งเดียว หลังรีสตาร์ท ingestion ที่มีตัวแก้แล้ว
-- ไม่แตะ users / motors / maintenance_logs

BEGIN;

TRUNCATE readings_minute, alarm_events, predictions, notification_log
  RESTART IDENTITY CASCADE;

-- ให้ isOnline กลับไปพูดความจริง: ยังไม่เคยเห็นข้อมูลหลังรีเซ็ต
UPDATE motors SET last_seen_at = NULL;

-- ตรวจก่อน COMMIT — ทุกตัวต้องเป็น 0 และ motors ต้องยังครบ 4
SELECT
  (SELECT count(*) FROM readings_minute) AS readings,
  (SELECT count(*) FROM alarm_events)    AS events,
  (SELECT count(*) FROM predictions)     AS predictions,
  (SELECT count(*) FROM motors WHERE is_active) AS motors_kept,
  (SELECT count(*) FROM users)           AS users_kept;

COMMIT;
