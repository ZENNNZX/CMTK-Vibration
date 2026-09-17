/**
 * แปลงค่าจาก payload ของ BCM เป็น InfluxDB line protocol
 * แยกเป็นฟังก์ชันล้วนไม่มี I/O — เทสต์ยิงตรงได้โดยไม่ต้องมี InfluxDB
 */

/**
 * ชื่อ field ของ Balluff มีจุลภาคและช่องว่าง ซึ่งเป็นตัวคั่นของ line protocol
 * แม็ปเป็นชื่อสั้นที่ปลอดภัยตั้งแต่ต้นทาง — และทำให้ schema ของเราไม่ผูกกับ
 * การตั้งชื่อของ Balluff ที่เปลี่ยนได้ทุกครั้งที่แก้ monitoring function
 */
export const FIELD_MAP: Record<string, string> = {
  Temperature: 'temperature',
  'Vibration Velocity, RMS Y': 'vrms_y',
  'Vibration Velocity, RMS Z': 'vrms_z',
  'Vibration Velocity, RMS X': 'vrms_x',
  'Vibration Acceleration, Peak Magnitude': 'a_peak',
  'Vibration Acceleration, RMS Magnitude': 'a_rms',
  'Contact Temperature': 'contact_temp',
};

export interface PointTags {
  motorId: number;
  tag: string;
  port: number;
}

/** line protocol ใช้ comma / space / equals เป็นตัวคั่น — ต้อง escape ในค่า tag */
const escapeTag = (v: string) => v.replace(/([,= ])/g, '\\$1');

/**
 * คืน null เมื่อไม่มี field ตัวเลขที่ใช้ได้เลย — ส่งบรรทัดที่ไม่มี field ขึ้นไป
 * InfluxDB จะปฏิเสธทั้ง batch ไม่ใช่แค่บรรทัดนั้น
 */
export function toLineProtocol(
  tags: PointTags,
  items: Record<string, unknown>,
  at: Date,
): string | null {
  const fields: string[] = [];
  for (const [rawKey, value] of Object.entries(items)) {
    const key = FIELD_MAP[rawKey];
    // boolean ของ Balluff (zone flag / alarm) ไม่ใช่อนุกรมเวลาเชิงปริมาณ เก็บใน Postgres แทน
    if (!key || typeof value !== 'number' || !Number.isFinite(value)) continue;
    fields.push(`${key}=${value}`);
  }
  if (fields.length === 0) return null;

  const tagSet = `motor_id=${tags.motorId},tag=${escapeTag(tags.tag)},port=${tags.port}`;
  // InfluxDB รับ timestamp เป็นนาโนวินาที — Date ให้มิลลิวินาที ต้องคูณหกศูนย์
  return `reading,${tagSet} ${fields.join(',')} ${at.getTime()}000000`;
}
