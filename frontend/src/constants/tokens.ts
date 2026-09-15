/** สีสถานะเครื่องจักรจาก DSN-CMTK-001 §1 — ใช้บอกสถานะเท่านั้น ห้ามใช้ตกแต่ง */
export const ZONE = {
  A: { fill: '#157a52', text: '#ffffff', label: 'เครื่องใหม่ · เดินได้ไม่จำกัด' },
  B: { fill: '#c7eb02', text: '#231f20', label: 'ปกติ · เดินต่อเนื่องได้ไม่จำกัด' },
  C: { fill: '#ff9300', text: '#231f20', label: 'เดินได้ชั่วคราว · วางแผนซ่อม' },
  D: { fill: '#d92d20', text: '#ffffff', label: 'เสี่ยงเสียหาย · หยุดตรวจ' },
} as const;

export type Zone = keyof typeof ZONE;
export const ZONES = Object.keys(ZONE) as Zone[];
