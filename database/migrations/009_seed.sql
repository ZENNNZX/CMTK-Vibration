-- 009 · seed ที่ไม่มีความลับ — รันอัตโนมัติได้ตอน initdb
-- ผู้ใช้ admin สร้างแยกต่างหาก (ดู 010) เพื่อไม่ให้รหัสผ่านอยู่ในไฟล์ที่ commit
-- rollback: DELETE FROM notification_recipients; DELETE FROM motors;

-- มอเตอร์ 4 ตัวบน master2 port 0–3
-- ชื่อและ rated_kw เป็นค่าชั่วคราว รอ B-7 — ไม่บล็อกการเริ่มเก็บข้อมูล
INSERT INTO motors (tag, name, master_no, port_no, sensor_mount) VALUES
  ('MOTOR-01', 'รอตั้งชื่อจริง', 2, 0, 'DE-H'),
  ('MOTOR-02', 'รอตั้งชื่อจริง', 2, 1, 'DE-H'),
  ('MOTOR-03', 'รอตั้งชื่อจริง', 2, 2, 'DE-H'),
  ('MOTOR-04', 'รอตั้งชื่อจริง', 2, 3, 'DE-H')
ON CONFLICT (master_no, port_no) DO NOTHING;

-- broadcast = ไม่ต้องมี userId ไม่ต้องมี webhook
INSERT INTO notification_recipients (channel, target, label)
VALUES ('line', '@broadcast', 'ทุกคนที่แอดบอท')
ON CONFLICT (channel, target) DO NOTHING;
