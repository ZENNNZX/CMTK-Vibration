# Phase 1 — Requirements
## GS Battery — CMTK Condition Monitoring System (rebuild)

| | |
|---|---|
| Document ID | REQ-CMTK-001 |
| Version | **0.4** — ปรับ scope ให้ตรงกับ Phase 2 ที่ออกแบบจริง · อนุมัติโดย senior reviewer |
| Phase | 1 · Requirements |
| Status | 🟢 อนุมัติแล้ว · blocker เหลือ B-1, B-7, B-11, B-14 |
| Stack (fixed by SOP) | React + TS + Tailwind / Node + Express + TS / PostgreSQL / Docker Compose |
| Roles | maintenance · manager · admin |

---

## ข้อมูลระบบ — ยืนยันแล้วทั้งหมด

| รายการ | ค่า |
|---|---|
| CMTK firmware | 2.4.1 |
| Grafana (ฝังมากับเฟิร์มแวร์) | 10.4.1 — หมด support → นอก audit scope |
| IO-Link Master | BNI XG5-508-1B5-Z067 @ `192.168.50.141` · **master2** · deviceId 21808 · 8 พอร์ต |
| เซ็นเซอร์ | BCM R16E-004-CI02-01,5-S4 × **4** · พอร์ต 0–3 · deviceId 917768 · vendorId 888 (Balluff) |
| master1 | ว่าง |
| Logging interval | 0.5 s (ยืนยันจาก message count) |
| MQTT broker | `192.168.50.140:1883` (และ 8883 TLS) · user `user` · **auth เปิด** · QoS 0 |
| InfluxDB (CMTK) | 4 GB auto-purge · `172.16.0.2:8086` read-only เฉพาะ container บนบอร์ด |
| สถานะเครื่องปัจจุบัน | **Severity Zone B** · v-RMS Y 1.41 · Z 1.32 mm/s · Temp 50.1 °C |

---

## 0. Scope decisions

### 0.1 3D — ตัดของเดิม แต่รับของใหม่ที่เป็นคนละเรื่อง

**v0.1–0.3 ตัด "3D แสดงค่าการสั่นสะเทือน" ทิ้ง** และยังคงตัดอยู่ เหตุผลเดิมไม่เปลี่ยน:
payload มีแค่ v-RMS Y กับ Z เป็นสเกลาร์ไม่มี phase วาดเป็น 3 มิติก็ไม่ได้ข้อมูลเพิ่ม

**แต่ระหว่าง Phase 2 มีความต้องการใหม่เข้ามา: "3D เพื่อระบุตำแหน่งติดตั้งเซ็นเซอร์"**
ซึ่งเป็นการ **เก็บข้อมูล** ไม่ใช่การ **แสดงผล** — และตำแหน่งติดตั้งมีผลต่อการแปลผลจริง
วัดที่ DE bearing แนวนอนกับ NDE แนวตั้งให้ค่าต่างกันและบอกอาการคนละอย่าง

| | ตัดทิ้ง (REQ-029) | รับเข้า (REQ-034) |
|---|---|---|
| ทำอะไร | วาดค่าการสั่นบนโมเดล | เลือกและบันทึกจุดติดตั้ง |
| ข้อมูลที่ต้องใช้ | phase ซึ่งไม่มี | ตำแหน่งตามมาตรฐาน ISO 20816 |
| ผลถ้าไม่มี | ไม่เสียอะไร | แปลผลผิดได้ |

**เงื่อนไขบังคับ:** WebGL canvas กด Tab เข้าไม่ได้ → **ต้องมี dropdown คู่ขนานเสมอ**
ทำงานแทนได้ทุกอย่าง ถ้ามีแต่ 3D จะตก Phase 2 Gate

### 0.2 ML — โมเดลยังตัด แต่การทำนายด้วยสถิติรับเข้า

**REQ-030 (โมเดล ML/DL) ยังเป็น Won't Have** เหตุผลเต็มอยู่ใน §7 — ไม่มีเคสที่พังให้เรียน
และที่ 4 มอเตอร์จะสะสมได้ช้ามากจนอาจไม่มีวันพอ

**แต่สิ่งที่ Phase 2 สร้างขึ้นไม่ใช่ ML** — เป็น linear regression + ช่วงความเชื่อมั่น
ซึ่งใช้ได้ตั้งแต่เดือนแรกและไม่ต้องรอเคสที่พัง เข้ามาเป็น REQ-035 และ REQ-036

**หน้าจอติดป้ายกำกับว่า "สถิติ · ยังไม่ใช่ ML" อย่างชัดเจน** — ข้อบังคับ ไม่ใช่ทางเลือก
ถ้าไม่เขียน คนใช้จะเชื่อตัวเลขมากเกินกว่าที่วิธีการรองรับ

### 0.3 ตัด: threshold engine + ISO zone calculation ที่เขียนเอง

เซ็นเซอร์ส่ง alarm bit และ Severity Zone มาให้แล้ว (§3.2) และประเมินทุก 0.5 s โดยไม่ขึ้นกับว่า service เราล่มหรือไม่

**ระบบเราเปลี่ยนจาก *ผู้ตัดสิน* เป็น *ผู้บันทึก แจ้งเตือน และสืบย้อน***

### 0.4 ลดขนาด: Excel → CSV ก่อน

### 0.5 **ใหม่ — เกณฑ์ 1.0 mm/s ของระบบเดิมต้องเลิกใช้**

ค่าปัจจุบัน 1.41 / 1.32 mm/s และเซ็นเซอร์รายงาน **Zone B** = เดินต่อเนื่องได้ไม่จำกัดตาม ISO 10816

ระบบเดิมที่ตั้ง 1.0 mm/s จะเตือนตลอดเวลาทั้งที่เครื่องปกติ ซึ่งเป็นรูปแบบที่ทำให้คนเลิกสนใจการแจ้งเตือน — ปัญหาใหญ่กว่าการไม่มีระบบเตือนเลย

→ ระบบใหม่ใช้ Pre-Alarm / Main-Alarm bit จากเซ็นเซอร์เป็นเกณฑ์ ไม่ตั้งตัวเลขเอง

---

## 1. Raw Requirement List (MoSCoW)

| ID | Requirement | Description | Priority | Category |
|---|---|---|---|---|
| REQ-001 | Authentication | Login email + password, JWT | Must | Security |
| REQ-002 | Role-based access | maintenance / manager / admin | Must | Security |
| REQ-003 | Dashboard overview | การ์ด 4 มอเตอร์ · temp · v-RMS Y/Z · zone · alarm | Must | Core |
| REQ-004 | Click-through drill-down | คลิกการ์ด → หน้ารายละเอียด | Must | Core |
| REQ-005 | Trend chart | กราฟ temp + v-RMS Y/Z เลือกช่วงเวลา | Must | Core |
| REQ-006 | Alarm event capture | จับขอบขาขึ้นของ Pre-Alarm / Main Alarm / Temp alarm bit | Must | Core |
| REQ-007 | Severity zone display | อ่าน Zone A–D จากเซ็นเซอร์ แสดงเป็นตัวอักษร + สี | Must | Core |
| REQ-008 | LINE notification | LINE Messaging API | Must | Notification |
| REQ-009 | Notification debounce | จำกัดความถี่ + เพดานรายเดือน | Must | Notification |
| REQ-010 | Alarm history + calendar | ปฏิทินรายเดือน ไฮไลต์วันที่มี event | Must | Core |
| REQ-011 | Alarm acknowledge | ack พร้อมหมายเหตุ | Must | Core |
| REQ-012 | Maintenance event log | บันทึกงานซ่อม + **cause code** | Must | Core |
| REQ-013 | MQTT ingestion | subscribe → Zod → downsample → Postgres | Must | Integration |
| REQ-014 | Retention & rollup | 1 แถว/นาที/sensor เก็บ 1 ปี | Must | Data |
| REQ-015 | Motor master data | CRUD มอเตอร์ ผูก master/port | Must | Core |
| REQ-016 | **Sensor connectivity monitoring** | บันทึก CONNECTED/DISCONNECTED · แจ้งเตือนเมื่อเงียบเกินกำหนด | **Must** | Core |
| REQ-017 | Line schematic (SVG) | 4 จุด สีตามสถานะ คลิกได้ | Should | UI/UX |
| REQ-018 | CSV export | ส่งออกตามช่วงเวลาที่เลือก | Should | Reporting |
| REQ-019 | Run hours | ชั่วโมงสะสม + reset | Should | Core |
| REQ-020 | Y:Z axis comparison | เทียบสองแกนในหน้ารายละเอียด | Should | Analytics |
| REQ-021 | Trend slope | อัตราเปลี่ยนแปลง 7 d / 30 d | Should | Analytics |
| REQ-022 | User management | admin จัดการบัญชี | Should | Security |
| REQ-023 | Audit log | บันทึกการ ack และการแก้ค่าตั้ง | Should | Security |
| REQ-024 | Threshold write-back (ISDU) | แก้เกณฑ์เซ็นเซอร์ผ่านหน้าเว็บ | Could | Core |
| REQ-025 | Excel (.xlsx) export | ถ้า CSV ไม่พอ | Could | Reporting |
| REQ-026 | Alarm heatmap calendar | ไล่เฉดตามจำนวน event | Could | UI/UX |
| REQ-027 | Email notification | สำรองจาก LINE (CMTK มี SMTP ในตัว) | Could | Notification |
| REQ-028 | Multi-master | รองรับ master เพิ่ม | Could | Platform |
| REQ-029 | 3D WebGL model | | **Won't** | UI/UX |
| REQ-030 | ML / DL model | | **Won't** | Analytics |
| REQ-031 | Remote access (internet) | | **Won't** | Platform |
| REQ-032 | Mobile native app | | **Won't** | Platform |
| REQ-033 | เก็บ raw 0.5 s ลง Postgres | InfluxDB ของ CMTK ทำอยู่แล้ว | **Won't** | Data |

| Priority | Count |
|---|---|
| Must | 16 |
| Should | 10 |
| Could | 5 |
| Won't | 5 |
| **รวม** | **36** |

---

## 2. User Story List

| ID | Role | Story | Pri | Pts | Sprint | REQ |
|---|---|---|---|---|---|---|
| US-001 | ทุก role | As a **user**, I want to **log in with email and password**, so that **only authorised staff see plant data** | Must | 5 | 1 | 001 |
| US-002 | admin | As an **admin**, I want to **assign roles**, so that **each person changes only what they should** | Must | 3 | 1 | 002, 022 |
| US-003 | admin | As an **admin**, I want to **register motors against master and port**, so that **readings map to the right machine** | Must | 3 | 1 | 015 |
| US-004 | admin | As an **admin**, I want **MQTT readings written to the database automatically**, so that **the dashboard has data without manual work** | Must | 8 | 1 | 013 |
| US-005 | maintenance | As a **maintenance engineer**, I want **one card per motor showing temperature, both axes and severity zone**, so that **I can spot trouble at a glance** | Must | 5 | 2 | 003, 007 |
| US-006 | maintenance | As a **maintenance engineer**, I want to **click a card into that motor's detail page**, so that **I can investigate quickly** | Must | 3 | 2 | 004 |
| US-007 | maintenance | As a **maintenance engineer**, I want **a trend chart over a selectable period**, so that **I can tell a spike from a rising trend** | Must | 8 | 2 | 005 |
| US-008 | maintenance | As a **maintenance engineer**, I want **an event recorded when the sensor raises an alarm**, so that **nothing is missed while no one is watching** | Must | 5 | 3 | 006 |
| US-009 | manager | As a **manager**, I want **a LINE message when an alarm is raised**, so that **I know away from my desk** | Must | 5 | 3 | 008 |
| US-010 | manager | As a **manager**, I want **repeat notifications suppressed**, so that **one faulty sensor does not exhaust the monthly quota** | Must | 3 | 3 | 009 |
| US-011 | maintenance | As a **maintenance engineer**, I want **to be told when a sensor disconnects or goes silent**, so that **I do not mistake no data for no problem** | Must | 5 | 3 | 016 |
| US-012 | manager | As a **manager**, I want **a monthly calendar marking days that had alarms**, so that **I can find a past incident by date** | Must | 8 | 4 | 010 |
| US-013 | maintenance | As a **maintenance engineer**, I want to **acknowledge an alarm with a note**, so that **the team knows it is handled** | Must | 3 | 4 | 011 |
| US-014 | maintenance | As a **maintenance engineer**, I want to **log a maintenance job with a cause code**, so that **we build the failure history a model will need later** | Must | 5 | 4 | 012 |
| US-015 | admin | As an **admin**, I want **minute-level data kept for a year and nothing finer**, so that **gateway flash does not fill up** | Must | 3 | 4 | 014 |
| US-016 | maintenance | As a **maintenance engineer**, I want **an SVG schematic with sensor dots coloured by status**, so that **I can locate the machine on the floor** | Should | 5 | 5 | 017 |
| US-017 | manager | As a **manager**, I want to **export the displayed data as CSV**, so that **I can analyse it myself** | Should | 3 | 5 | 018 |
| US-018 | maintenance | As a **maintenance engineer**, I want **run hours with a reset after service**, so that **I can schedule by actual usage** | Should | 5 | 5 | 019 |
| US-019 | maintenance | As a **maintenance engineer**, I want to **compare the Y and Z axes side by side**, so that **I can guess at the fault type before opening the machine** | Should | 3 | 5 | 020 |
| US-020 | manager | As a **manager**, I want **the 7-day and 30-day rate of change**, so that **I can act before an alarm fires** | Should | 5 | 6 | 021 |
| US-021 | admin | As an **admin**, I want **every acknowledgement and setting change recorded**, so that **the audit can trace who did what** | Should | 3 | 6 | 023 |

| US-022 | maintenance | As a **maintenance engineer**, I want to **mark on a 3D model where the sensor is actually mounted**, so that **readings are interpreted against the right measurement point** | Should | 8 | 6 | 034 |
| US-023 | manager | As a **manager**, I want to **see a forecast line with its confidence band**, so that **I know roughly how many days remain before the threshold** | Should | 5 | 7 | 035 |
| US-024 | manager | As a **manager**, I want to **see last month's forecasts scored against what actually happened**, so that **I know whether to trust the forecast at all** | Should | 8 | 7 | 036 |

**24 stories · 112 points**

| Sprint | Pts | Theme |
|---|---|---|
| 1 | 19 | Auth · master data · ingestion |
| 2 | 16 | Dashboard · drill-down · chart |
| 3 | 18 | Alarm capture · LINE · debounce · connectivity |
| 4 | 19 | Calendar · ack · cause code · retention |
| 5 | 16 | Schematic · export · run hours · axes |
| 6 | 16 | Trend · audit · 3D จุดติดตั้ง |
| 7 | 13 | เส้นทำนาย · สรุปรายเดือน + วัดผล |

---

## 3. Ingestion contract — ยืนยันจากข้อมูลสด

### 3.1 Topics

```
balluff/cmtk/master2/iolink/devices/events                      ← master-level
balluff/cmtk/master2/iolink/devices/port{0..3}/events            ← port connect/disconnect
balluff/cmtk/master2/iolink/devices/port{0..3}/units             ← หน่วยของแต่ละ field
balluff/cmtk/master2/iolink/devices/port{0..3}/data/fromdevice   ← process data 0.5 s
```

subscribe: `balluff/cmtk/+/iolink/devices/#`

`deviceAlias` = `port0`–`port3` ตรง ๆ ยืนยันแล้ว

### 3.2 Field inventory — ครบถ้วน 11 field

**Numeric (3):**

| Field | หน่วย | ตัวอย่าง |
|---|---|---|
| `Temperature` | °C | 50.099998474121094 |
| `Vibration Velocity, RMS Y` | mm/s | 1.410402774810791 |
| `Vibration Velocity, RMS Z` | mm/s | 1.3166662454605103 |

> ไม่มีแกน X · ไม่มี a-RMS · ไม่มี Magnitude — ต่างจากตัวอย่างในเอกสาร Balluff

**Boolean (8):**

| Field | ความหมาย |
|---|---|
| `Lower Alarm Contact Temperature` | อุณหภูมิต่ำกว่าเกณฑ์ |
| `Upper Alarm Contact Temperature` | อุณหภูมิสูงกว่าเกณฑ์ |
| `Pre-Alarm Vibration Velocity, RMS` | เตือนล่วงหน้า (→ warning) |
| `Main Alarm Vibration Velocity, RMS` | เตือนหลัก (→ alarm) |
| `Severity Zone A` / `B` / `C` / `D` | ISO 10816 zone — **exclusive จริงเพียงตัวเดียว** |

**ข้อสังเกตสำคัญ:**
- alarm ของ vibration **ไม่แยกตามแกน** เป็นค่ารวมตัวเดียว
- ชื่อ field **มีจุลภาคอยู่ข้างใน** (`Vibration Velocity, RMS Y`) → ห้ามใช้ comma เป็น delimiter ที่ใดก็ตามในระบบ
- Severity Zone เป็น one-hot → เก็บเป็น **enum column เดียว** ไม่ใช่ 4 boolean

### 3.3 Zod schema

```ts
import { z } from 'zod';

const isoTimestamp = z.string().datetime({ offset: true });

const dataFromDevice = z.object({
  type: z.literal('dataFromDevice'),
  timestamp: isoTimestamp,
  data: z.object({
    isValid: z.boolean(),
    items: z.object({
      'Temperature': z.number(),
      'Vibration Velocity, RMS Y': z.number(),
      'Vibration Velocity, RMS Z': z.number(),
      'Lower Alarm Contact Temperature': z.boolean(),
      'Upper Alarm Contact Temperature': z.boolean(),
      'Pre-Alarm Vibration Velocity, RMS': z.boolean(),
      'Main Alarm Vibration Velocity, RMS': z.boolean(),
      'Severity Zone A': z.boolean(),
      'Severity Zone B': z.boolean(),
      'Severity Zone C': z.boolean(),
      'Severity Zone D': z.boolean(),
    }).partial(),   // ⚠️ partial เพราะ Data selector เปลี่ยนได้ → field หายได้โดยไม่ควรทำให้ service ตาย
  }),
});

const unitsFromDevice = z.object({
  type: z.literal('unitsFromDevice'),
  timestamp: isoTimestamp,
  data: z.record(z.string()),
});

const iolinkPortEvent = z.object({
  type: z.literal('iolinkPortEvent'),
  origin: z.string(),
  timestamp: isoTimestamp,
  data: z.object({
    deviceId: z.number(),
    vendorId: z.number(),
    event: z.string(),              // CONNECTED / DISCONNECTED / อื่น ๆ ที่ยังไม่รู้
    numberOfPorts: z.number().optional(),
  }),
});

export const messageSchema = z.discriminatedUnion('type', [
  dataFromDevice,
  unitsFromDevice,
  iolinkPortEvent,
]);
```

**หลักการ: unknown ต้องไม่ทำให้ล่ม**
- `type` ที่ไม่รู้จัก → log แล้วข้าม **ห้าม throw** (Balluff ปล่อยเฟิร์มแวร์ใหม่แล้วเพิ่ม type ได้)
- `items` ใช้ `.partial()` เพราะ Data selector เปลี่ยนแล้ว field หายได้
- `event` เป็น `string` ไม่ใช่ `enum` เพราะยังไม่รู้ค่าที่เป็นไปได้ทั้งหมด

### 3.4 Mapping → คอลัมน์ (snake_case ตาม SOP)

| MQTT field | คอลัมน์ |
|---|---|
| `Temperature` | `temperature_c` |
| `Vibration Velocity, RMS Y` | `vrms_y` |
| `Vibration Velocity, RMS Z` | `vrms_z` |
| `Severity Zone A–D` | `severity_zone` (enum `A`/`B`/`C`/`D`) |
| `Pre-Alarm Vibration Velocity, RMS` | `vib_pre_alarm` |
| `Main Alarm Vibration Velocity, RMS` | `vib_main_alarm` |
| `Lower/Upper Alarm Contact Temperature` | `temp_low_alarm` / `temp_high_alarm` |
| `timestamp` | `recorded_at TIMESTAMPTZ` |
| topic `master{N}` + `port{N}` | → `motor_id` (lookup) |

> `timestamp` ละเอียดระดับนาโนวินาที แต่ `TIMESTAMPTZ` เก็บถึงไมโครวินาที → ถูกตัดทอน ยอมรับได้ที่ 0.5 s

### 3.5 Downsampling

| | |
|---|---|
| เข้ามา | 4 sensor × 2 Hz = 8 ข้อความ/วินาที ≈ **691,200 ข้อความ/วัน** |
| ถ้าเก็บดิบ | flash ของเกตเวย์รับไม่ไหว |
| เก็บจริง | **1 แถว/นาที/sensor** — min / max / avg ของ 3 ค่าตัวเลข |
| ผลลัพธ์ | 5,760 แถว/วัน ≈ **2.1 ล้านแถว/ปี** คงที่ |

**ยกเว้น boolean:** ไม่ downsample — จับขอบขาขึ้นทันที ไม่งั้น alarm ที่ขึ้นและหายภายในนาทีเดียวจะหลุด

**Zone change:** บันทึกทุกครั้งที่เปลี่ยน (เช่น B → C) เป็น event แยกจาก alarm

ข้อมูลดิบ 0.5 s ยังอยู่ใน InfluxDB ของ CMTK ดูผ่าน Grafana ได้ ไม่ต้องทำซ้ำ

---

## 4. Acceptance Criteria

### US-004 · MQTT ingestion

| AC | Given | When | Then |
|---|---|---|---|
| 004-01 | broker ออนไลน์ · มอเตอร์ผูก master/port แล้ว | `dataFromDevice` เข้ามา | เก็บลง buffer พร้อม `motor_id` และ `recorded_at` จาก `timestamp` |
| 004-02 | ครบ 1 นาที | ตัวจับเวลาทำงาน | เขียน 1 แถว/sensor ด้วย batch insert (min/max/avg) |
| 004-03 | ข้อความจาก port ที่ยังไม่ผูกมอเตอร์ | ข้อความเข้ามา | log warning · ทิ้ง · **service ไม่ล้ม** |
| 004-04 | payload ผิดรูปแบบ | ข้อความเข้ามา | Zod ปฏิเสธ · log · ไม่เขียน DB |
| 004-05 | `isValid: false` | ข้อความเข้ามา | ไม่เขียนค่า · นับเป็น invalid sample |
| 004-06 | `type` ที่ไม่รู้จัก | ข้อความเข้ามา | log · ข้าม · **ไม่ throw** |
| 004-07 | broker หลุด | service ตรวจพบ | reconnect exponential backoff · ไม่เขียนซ้ำเมื่อกลับมา |
| 004-08 | Postgres หลุดชั่วคราว | ถึงเวลาเขียน batch | buffer จนถึงเพดาน แล้วทิ้งเก่าสุด · log · ไม่ crash |

### US-008 · Alarm event capture

| AC | Given | When | Then |
|---|---|---|---|
| 008-01 | `Pre-Alarm` เป็น false | ข้อความใหม่เป็น true | สร้าง event `warning` พร้อมค่า v-RMS Y/Z และเวลา |
| 008-02 | `Main Alarm` เป็น false | เปลี่ยนเป็น true | สร้าง event `alarm` |
| 008-03 | bit เป็น true ต่อเนื่อง | ข้อความเข้ามาเรื่อย ๆ | **ไม่สร้าง event ซ้ำ** — จับเฉพาะขอบขาขึ้น |
| 008-04 | bit เป็น true | กลับเป็น false | ปิด event · ลง `resolved_at` |
| 008-05 | `Upper Alarm Contact Temperature` เปลี่ยนเป็น true | ข้อความเข้ามา | สร้าง event ประเภท temperature แยกจาก vibration |
| 008-06 | Zone เปลี่ยน B → C | ข้อความใหม่ | บันทึก zone change event (ไม่ใช่ alarm แต่ต้องมีในประวัติ) |
| 008-07 | Zone bit เป็น true มากกว่า 1 ตัว หรือไม่มีเลย | ข้อความเข้ามา | log เป็น anomaly · เก็บ zone เป็น null · ไม่ crash |

### US-011 · Sensor connectivity

| AC | Given | When | Then |
|---|---|---|---|
| 011-01 | พอร์ตเชื่อมต่ออยู่ | ได้รับ `iolinkPortEvent` `DISCONNECTED` | สร้าง event · เปลี่ยนสถานะการ์ดเป็น offline |
| 011-02 | พอร์ต offline | ได้รับ `CONNECTED` | ปิด event · กลับเป็น online |
| 011-03 | ไม่มี `dataFromDevice` เกินเวลาที่กำหนด แม้ไม่มี disconnect event | ตัวตรวจทำงาน | เปลี่ยนสถานะเป็น stale · แจ้งเตือน (QoS 0 ทำให้ event หายได้ ห้ามพึ่ง event อย่างเดียว) |
| 011-04 | เซ็นเซอร์ offline | ดู dashboard | การ์ดต้องแสดงชัดว่า **ไม่มีข้อมูล** ไม่ใช่โชว์ค่าเก่าเงียบ ๆ |

### US-009 / US-010 · LINE + debounce

| AC | Given | When | Then |
|---|---|---|---|
| 009-01 | มีผู้รับและ token ถูกต้อง | เกิด event `alarm` | ส่งข้อความ: ชื่อมอเตอร์ · ประเภท · ค่า · zone · เวลา |
| 009-02 | LINE API ตอบ 5xx/timeout | พยายามส่ง | retry ตามจำนวนที่กำหนด แล้ว log — **event ใน DB ต้องไม่หาย** |
| 010-01 | เพิ่งส่งของมอเตอร์ A | event เดียวกันซ้ำในช่วง debounce | ไม่ส่งซ้ำ · ยังบันทึก event ตามปกติ |
| 010-02 | alarm ค้างเกินเวลาที่กำหนด | ครบกำหนด | ส่งซ้ำได้ 1 ครั้ง |
| 010-03 | ส่งครบเพดานรายเดือน | เกิด event ใหม่ | ระงับการส่ง · log · แจ้ง admin ในหน้าเว็บ |

### US-005 · Dashboard card

| AC | Given | When | Then |
|---|---|---|---|
| 005-01 | มี 4 มอเตอร์ | เปิด dashboard | แสดง 4 การ์ด: temp · v-RMS Y · v-RMS Z · zone · สถานะ alarm |
| 005-02 | มอเตอร์อยู่ Zone B | เปิด dashboard | แสดง **ตัวอักษร "B" และสี** ไม่ใช่สีอย่างเดียว (NFR-09) |
| 005-03 | ไม่มีข้อมูลเกินช่วงที่กำหนด | เปิด dashboard | แสดง stale ไม่ใช่ค่าเก่า |
| 005-04 | จอ 375 px | โหลดหน้า | คอลัมน์เดียว ไม่มี horizontal scroll |

### US-007 · Trend chart

| AC | Given | When | Then |
|---|---|---|---|
| 007-01 | เปิดหน้ารายละเอียด | โหลดเสร็จ | แสดง 7 วันล่าสุด แกนมีหน่วย mm/s และ °C |
| 007-02 | อยู่ในหน้ากราฟ | เลือก 30 วัน | แสดงผลภายใน **2 วินาที** |
| 007-03 | มอเตอร์เพิ่งลงทะเบียน | เปิดกราฟ | empty state ที่อ่านรู้เรื่อง |
| 007-04 | กำลังโหลด | ระหว่างรอ | loading indicator |
| 007-05 | API ตอบ 500 | เปิดกราฟ | error state + ปุ่มลองใหม่ ไม่โชว์ stack trace |

### US-012 · Calendar

| AC | Given | When | Then |
|---|---|---|---|
| 012-01 | เปิดหน้าประวัติ | โหลดเสร็จ | เดือนปัจจุบัน · วันที่มี event มีเครื่องหมายแยก warning/alarm โดยไม่พึ่งสีอย่างเดียว |
| 012-02 | อยู่ในปฏิทิน | คลิกวันที่มีเครื่องหมาย | รายการ event เรียงตามเวลา |
| 012-03 | อยู่ในปฏิทิน | คลิกวันที่ไม่มี event | กดไม่ได้ หรือแจ้งว่าไม่มีเหตุการณ์ |
| 012-04 | อยู่เดือนปัจจุบัน | กดย้อนเดือน | โหลดเดือนก่อนโดยไม่รีเฟรชทั้งหน้า |
| 012-05 | ใช้คีย์บอร์ดอย่างเดียว | Tab เข้าปฏิทิน กด Enter | เปิดรายการวันนั้นได้เหมือนคลิก |

### US-001 · Authentication

| AC | Given | When | Then |
|---|---|---|---|
| 001-01 | อยู่หน้า login | ใส่ credential ถูกต้อง | ออก JWT · redirect ไป dashboard |
| 001-02 | อยู่หน้า login | รหัสผิด | ข้อความ error ที่**ไม่บอก**ว่า email มีอยู่จริงหรือไม่ |
| 001-03 | อยู่หน้า login | เว้นว่าง | validation error ระบุ field |
| 001-04 | ล็อกอินอยู่ | token หมดอายุ | redirect ไป login ไม่ค้างหน้าเปล่า |
| 001-05 | ล็อกอินผิดหลายครั้งติด | พยายามอีก | ชะลอหรือล็อกชั่วคราวตามที่กำหนด |

### US-002 · Roles

| AC | Given | When | Then |
|---|---|---|---|
| 002-01 | role manager | เรียก endpoint ack alarm | ตอบ **403** |
| 002-02 | role maintenance | เรียก endpoint จัดการ user | ตอบ **403** |
| 002-03 | role admin | เรียก endpoint ใด ๆ | ผ่าน |
| 002-04 | ไม่มี token | เรียก endpoint ที่ไม่ public | ตอบ **401** |

### US-003 · Motor master data

| AC | Given | When | Then |
|---|---|---|---|
| 003-01 | role admin | สร้างมอเตอร์ผูก master2/port0 | บันทึกสำเร็จ · ข้อมูลจาก port0 เริ่มเข้ามอเตอร์นี้ |
| 003-02 | port0 ผูกกับมอเตอร์อื่นอยู่แล้ว | สร้างซ้ำ | ปฏิเสธ 409 — หนึ่งพอร์ตผูกได้มอเตอร์เดียว |
| 003-03 | มอเตอร์มีข้อมูลย้อนหลัง | ลบมอเตอร์ | soft delete · ข้อมูลย้อนหลังไม่หาย |

### US-013 · Acknowledge

| AC | Given | When | Then |
|---|---|---|---|
| 013-01 | role maintenance · มี event เปิดอยู่ | ack พร้อมหมายเหตุ | บันทึก user · เวลา · หมายเหตุ |
| 013-02 | event ถูก ack แล้ว | ack ซ้ำ | ปฏิเสธ หรือแสดงว่าใคร ack ไปแล้ว |
| 013-03 | ack สำเร็จ | บันทึกเสร็จ | มีแถวใน `audit_logs` |

### US-014 · Maintenance log

| AC | Given | When | Then |
|---|---|---|---|
| 014-01 | role maintenance | บันทึกงานซ่อมพร้อม cause code | บันทึกสำเร็จ ผูกกับมอเตอร์และช่วงเวลา |
| 014-02 | ไม่เลือก cause code | กดบันทึก | ปฏิเสธ — **cause code เป็น field บังคับ** (§7.3) |
| 014-03 | มี alarm event ในช่วงก่อนหน้า | บันทึกงานซ่อม | เสนอให้ผูกกับ event นั้น (สร้าง label สำหรับ ML) |

### US-015 · Retention

| AC | Given | When | Then |
|---|---|---|---|
| 015-01 | มีข้อมูลเกิน 1 ปี | purge job รายวันทำงาน | ลบเฉพาะแถวที่เกินกำหนด |
| 015-02 | purge job ทำงาน | ระหว่างลบ | ใช้ DELETE แบบมีเงื่อนไข **ห้าม TRUNCATE/DROP** |
| 015-03 | purge job ล้ม | ครั้งถัดไป | รันใหม่ได้โดยไม่ลบเกิน · log ผลทุกครั้ง |

---

### US-022 · 3D เลือกจุดติดตั้ง

| AC | Given | When | Then |
|---|---|---|---|
| 022-01 | role maintenance อยู่หน้ามอเตอร์ | เลือกจุดจาก dropdown | จุดบนโมเดลไฮไลต์ตรงกัน · ยังไม่บันทึกจนกว่าจะกดปุ่ม |
| 022-02 | เลือกจุดแล้ว | ลากจุดบนโมเดล | จุดเกาะผิวมอเตอร์เสมอ ไม่ลอยกลางอากาศ ไม่หลุดนอกตัวเครื่อง |
| 022-03 | มีการแก้ยังไม่บันทึก | ดูหน้าจอ | แถบบันทึกโผล่พร้อมรายการสิ่งที่เปลี่ยน |
| 022-04 | กดบันทึก | สำเร็จ | แจ้งผลสำเร็จ · ลง `audit_logs` · แถบบันทึกหาย |
| 022-05 | **ใช้คีย์บอร์ดอย่างเดียว** | Tab เข้าหน้านี้ | **เลือกจุดได้ครบทุกจุดผ่าน dropdown โดยไม่ต้องแตะ canvas** |
| 022-06 | role manager | เปิดหน้านี้ | dropdown และการลากถูกปิด · มีข้อความบอกเหตุผล |

### US-023 · เส้นทำนาย

| AC | Given | When | Then |
|---|---|---|---|
| 023-01 | มีข้อมูลพอคำนวณแนวโน้ม | เปิดกราฟ | เส้นประต่อจากข้อมูลจริง · แถบความเชื่อมั่น **กว้างขึ้นเมื่อทำนายไกลออกไป** |
| 023-02 | แนวโน้มขาขึ้น | ดูกล่องวิเคราะห์ | บอกจำนวนวันถึง Warning และ Alarm |
| 023-03 | ค่าทรงตัวหรือลดลง | ดูกล่องวิเคราะห์ | บอกว่าไม่พบแนวโน้มขาขึ้น **ห้ามแสดงตัวเลขวันที่ไร้ความหมาย** |
| 023-04 | ข้อมูลน้อยเกินกว่าจะ fit | เปิดกราฟ | ไม่แสดงเส้นทำนาย · บอกว่าข้อมูลยังไม่พอ |
| 023-05 | หน้าจอใดก็ตามที่มีเส้นทำนาย | — | **มีป้าย "สถิติ · ยังไม่ใช่ ML" เสมอ** |

### US-024 · สรุปรายเดือน + วัดผลการทำนาย

| AC | Given | When | Then |
|---|---|---|---|
| 024-01 | เลือกเดือนที่มีข้อมูล | เปิดหน้า | แสดง MAE, MAPE, Accuracy, Precision, Recall, F1 คำนวณจากข้อมูลจริง |
| 024-02 | เปลี่ยนค่าเกณฑ์ตัดสิน | กรอกค่าใหม่ | TP/FP/FN/TN และเมตริกทั้งหมดคำนวณใหม่ทันที |
| 024-03 | ตัวอย่างน้อยกว่า 30 ครั้ง | ดูผล | **ขึ้นคำเตือนว่าสรุปไม่ได้** พร้อมบอกว่าเปลี่ยนผล 1 ครั้งขยับตัวเลขกี่เปอร์เซ็นต์ |
| 024-04 | ดูแบบรวมทุกมอเตอร์ | ดูผล | **เตือนว่าค่ารวมถูกดันด้วย TN จากมอเตอร์ที่อยู่ห่างเกณฑ์** |
| 024-05 | เดือนนั้นไม่เคยทำนายว่าจะเกิน | ดู Precision | แสดง "—" ไม่ใช่ 0% (หารด้วยศูนย์ ไม่ใช่ทำนายแย่) |
| 024-06 | เลือกมอเตอร์ตัวเดียว | ดูผล | ทุกตัวเลขและกราฟกรองตามมอเตอร์นั้น |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | JWT + bcrypt (10) · `authenticate` + `authorize(...roles)` ทุก endpoint ที่ไม่ public · public ต้องมีคอมเมนต์เหตุผล |
| NFR-02 | P95 < 2 s บน critical path |
| NFR-03 | 1 แถว/นาที/sensor · retention 1 ปี · ไม่เก็บ raw 0.5 s · purge รายวัน · ห้าม DROP/TRUNCATE อัตโนมัติ |
| NFR-04 | Postgres data dir ไม่โตเกินเพดานที่ตกลง · batch insert · `synchronous_commit=off` |
| NFR-05 | **MQTT QoS 0 — ข้อความหายได้** ระบบต้องทนต่อ sample ขาดหาย ห้ามสมมติข้อมูลต่อเนื่อง · ingestion หลุดต้องกลับมาเอง · dashboard ล่มต้องไม่หยุดการเก็บข้อมูล |
| NFR-06 | LINE นับเป็น *ผู้รับ × ข้อความ* → debounce + เพดานรายเดือนที่ตั้งค่าได้ |
| NFR-07 | Zod ทุก body/query/params · parameterized query · secrets ใน env · ไม่ echo `err.message` ใน 5xx |
| NFR-08 | mobile-first · 375 px ไม่แตก |
| NFR-09 | Tab เข้าถึงได้ทุก interactive element · Enter/Space ใช้ได้ · focus ring เห็นชัด · **สีห้ามเป็นสัญญาณเดียว** |
| NFR-10 | loading + empty + error ทุกหน้าที่ดึงข้อมูล |
| NFR-11 | Dockerfile เป็นปัจจุบัน · root `docker-compose.yml` · target `linux/arm64` |
| NFR-12 | **Grafana 10.4.1 นอก scope ผลิตภัณฑ์** — vendor tool · จำกัดใน LAN · ห้ามพึ่งพา |
| NFR-13 | `TIMESTAMPTZ` · payload เป็น UTC · แสดงผล Asia/Bangkok |
| NFR-14 | Coverage FE ≥ 70% · BE ≥ 80% · integration ครอบคลุมทุก endpoint |
| NFR-15 | **ingestion ต้องรันเป็น container บนตัว CMTK** — InfluxDB เปิดเฉพาะ `172.16.0.2` จาก container บนบอร์ด |
| NFR-16 | **ห้ามใช้ comma เป็น delimiter ที่ใดก็ตาม** — ชื่อ field จาก MQTT มีจุลภาคอยู่ข้างใน (`Vibration Velocity, RMS Y`) · CSV export ต้อง quote ให้ถูก |

---

## 6. Architecture

```
BCM R16E × 4 ── ประเมิน Pre-Alarm / Main Alarm / Severity Zone ในตัวเซ็นเซอร์ ทุก 0.5 s
      │ IO-Link
BNI XG5-508 (192.168.50.141) = master2, port0–3
      │
CMTK Gateway (192.168.50.140) · firmware 2.4.1
  ├── CMTK core (yaasy) ── InfluxDB 172.16.0.2:8086 (4 GB, auto-purge, raw 0.5 s)
  ├── Grafana 10.4.1 @ /graphs            ← นอก audit scope (NFR-12)
  ├── MQTT broker :1883 / :8883 · QoS 0
  │        │
  │   ┌────▼────────────────┐
  │   │ ingestion (TS)      │ subscribe → Zod discriminated union
  │   │                     │ ├─ boolean: edge detect → alarm_events ทันที
  │   │                     │ ├─ numeric: buffer 1 นาที → batch insert
  │   │                     │ └─ portEvent: connect/disconnect → alarm_events
  │   └────┬────────────────┘
  │   ┌────▼────────────────┐
  │   │    PostgreSQL       │ motors · readings_minute · alarm_events
  │   └────┬────────────────┘ maintenance_logs · users · audit_logs
  │   ┌────▼────────────────┐
  │   │   Express + TS      │ Controller → Service → Repository
  │   └────┬────────────────┘ Zod ทุก request · authorize() ทุก endpoint
  │   ┌────▼────────────────┐
  │   │    React + TS       │ เสิร์ฟด้วย express.static — ตัด nginx ออก (docs/04 §3)
  │   └─────────────────────┘
  └── LINE Messaging API (outbound 443) ← ⚠️ B-2 ยังไม่ยืนยัน
```

**Node-RED ถูกลบออกทั้งหมด** — ไม่เหลือหน้าที่ใด

**ทำไม ingestion แยกจาก API:** NFR-05 — API ล่มแล้วการเก็บข้อมูลต้องไม่หยุด failure mode คนละแบบ

**Trade-off:** ข้อมูลอยู่สองที่โดยตั้งใจ — InfluxDB (raw, ควบคุมไม่ได้) กับ Postgres (สรุป, audit ได้) ต้นทุนคือพื้นที่ ผลตอบแทนคือไม่พึ่ง component นอกการควบคุม

---

## 7. Machine Learning หรือ Deep Learning

**ยังไม่ใช่ทั้งคู่ — และข้อมูลจริงยิ่งยืนยันข้อสรุปนี้**

### 7.1 DL ตกก่อน

payload มี **ค่าตัวเลขเพียง 3 ตัว** ต่อเซ็นเซอร์: temperature + v-RMS Y + v-RMS Z ทั้งหมดเป็นสเกลาร์ที่ประมวลผลมาแล้ว ไม่ใช่ raw waveform

จุดแข็งของ DL อยู่ที่การเรียน pattern จาก raw waveform หรือ FFT spectrum — CNN บน spectrogram จับ bearing defect frequency, sideband, harmonic ได้เพราะข้อมูลมีมิติเป็นพัน

time series 3 มิติ ไม่มีอะไรให้ DL เรียนที่วิธีคลาสสิกสกัดไม่ได้ และรันบน ARM ไม่มี GPU = จ่ายแพงเพื่อผลแย่กว่า

> **DL กลับมาน่าสนใจเมื่อ:** เปลี่ยนเป็นเซ็นเซอร์ที่ให้ raw spectrum หรือ FFT band

### 7.2 supervised ML ก็ยังไม่ได้

| ต้องมี | สถานะ |
|---|---|
| ประวัติความเสียหายพร้อมข้อมูลเซ็นเซอร์ | ~0 เคส |
| ข้อมูลย้อนหลัง | InfluxDB auto-purge |
| cause code มาตรฐาน | ยังไม่มี |

เทรนด้วยข้อมูลที่ไม่มี failure = โมเดลที่ตอบ "ปกติ" แม่นยำ 100% ไร้ประโยชน์ 100%

### 7.3 ที่ทำแทน — ส่วนใหญ่ได้มาฟรีแล้ว

**ชั้น 1 — ISO 10816 Severity Zone: ✅ มีอยู่แล้วในฮาร์ดแวร์**  
เซ็นเซอร์ส่ง Zone A–D มาให้ตรง ๆ ปัจจุบันอยู่ **Zone B**

> **แต่ต้องยืนยัน:** โซนจะถูกต้องก็ต่อเมื่อพารามิเตอร์ในเซ็นเซอร์ตั้งตรงกับคลาสเครื่องจริง → ยังต้องการ B-7 (kW + วิธียึด) แต่ไปตั้งที่เซ็นเซอร์ ไม่ใช่ในแอปเรา

**ชั้น 2 — Trend slope** (REQ-021) linear regression บน `readings_minute` — SQL อย่างเดียวพอ

**ชั้น 3 — Y:Z ratio** (REQ-020) สองแกนก็ยังบอกทิศทางได้ และเป็น feature ที่โมเดลระยะ B จะใช้

**ชั้น 4 — เก็บ label ตั้งแต่วันนี้** (REQ-012) ← **สำคัญที่สุด**  
cause code บังคับกรอกทุกครั้งที่ซ่อม (AC-014-02) ถูกที่สุดตอนนี้ แพงที่สุดถ้าไม่ทำ — ย้อนกลับไปสร้างไม่ได้

### 7.4 แผนระยะยาว

| ระยะ | เงื่อนไขเข้า | วิธี |
|---|---|---|
| A — ตอนนี้ | — | Severity Zone (ฟรี) + trend slope + Y:Z ratio + เก็บ cause code |
| B — 12–18 เดือน | labeled failure ≥ 10–20 เคส | ML คลาสสิก: gradient boosting บน feature ที่สกัดเอง — อธิบายผลให้ auditor ฟังได้ |
| C — เปลี่ยนเซ็นเซอร์ | ได้ raw spectrum | DL: CNN บน spectrogram |

---

## 8. Definition of Ready / Done

### DoR
1. มี Task Description
2. มี AC อย่างน้อย 1 ข้อ
3. เสร็จได้ใน 1–3 วัน
4. มี story point ที่ senior + junior ตกลงกัน
5. ไม่มี blocker ค้าง

UI task ต้องมี wireframe + responsive target · API task ต้องมี endpoint/method/request/response + schema · bug ต้องมี steps to reproduce + expected vs actual

### DoD
1. ผ่าน AC ทุกข้อ
2. มี unit test สำหรับ logic ใหม่
3. sandbox checks เขียว: lint · type-check · test · build
4. ไม่เหลือ `console.log` / debug code / hardcoded value
5. peer review ผ่าน ไม่มี MUST comment ค้าง
6. อัปเดตเอกสารถ้า API หรือ flow เปลี่ยน
7. Dockerfile เป็นปัจจุบัน รันได้ผ่าน root `docker-compose.yml`

---

## 9. Blockers

### ปิดแล้ว
| # | ผล |
|---|---|
| B-3 data rate | 🟢 0.5 s |
| B-4 เซ็นเซอร์ | 🟢 BCM R16E × 4 · master2 port0–3 |
| B-8 LINE | 🟢 มี bot แล้ว |
| B-9 MQTT broker | 🟢 เปิด 1883 + 8883 · auth เปิด |
| B-10 field names | 🟢 ยืนยันครบ 11 field (§3.2) |

### ยังเปิด
| # | Blocker | ทำไมบล็อก | ใคร |
|---|---|---|---|
| **B-1** | รหัส IO-Link Master รั่วในเอกสารสรุป | ผิด NFR-07 · ถ้าเคย commit ต้องล้าง git history | admin — **ทำได้เลย** |
| **B-2** | ไฟร์วอลล์เปิด outbound 443 ไป `api.line.me` ไหม | ถ้าปิด → REQ-008 ตาย ต้องสลับไป REQ-027 (email) กระทบ sprint 3 ทั้งก้อน | IT — **ส่งวันนี้** |
| B-5 | มี PostgreSQL ในระบบแล้วหรือยัง | Grafana มี datasource entry แต่ยังไม่ยืนยัน — กด Save & test | admin |
| B-6 | RAM / flash เหลือบนบอร์ด | ตัดสินว่า Postgres อยู่บนบอร์ดได้ไหม | admin |
| B-7 | kW + วิธียึด ของมอเตอร์ 4 ตัว | ใช้ตั้งพารามิเตอร์ในเซ็นเซอร์ให้ Severity Zone ถูกต้อง | maintenance |

### ยืนยันเพิ่มเติม (ไม่บล็อก)
- ค่าที่เป็นไปได้ทั้งหมดของ `iolinkPortEvent.event` (รู้แค่ `CONNECTED`)
- Process Data slot 4/5/6 (4.48 / 5.01 / 5.28) คืออะไร — ไม่ถูก publish ทาง MQTT จึงไม่กระทบ ingestion

---

## 10. Phase 1 Quality Gate

- [x] MoSCoW ครบทุก requirement — §1
- [x] ทุก Must story มี AC — §4 (16/16) · Should story ใหม่ US-022/023/024 มี AC แล้ว
- [x] NFR ระบุชัดเจน — §5
- [x] DoR/DoD ยืนยันแล้ว — §8 · ฝังเป็น checkbox ในทุกการ์ด Notion
- [x] roadmap ผูก task tracker — Notion `Stories — CMTK Monitoring` · 24 การ์ด · 7 sprint
- [ ] Blocker เคลียร์หมด — เหลือ B-1 · B-7 · B-11 · B-14 (ติดตามระหว่าง sprint)

**สถานะ Gate: ผ่าน** — อนุมัติโดย senior reviewer (เจ้าของงาน) · B-1/B-7/B-11/B-14 ติดตามต่อระหว่าง sprint ไม่บล็อกการเริ่ม

**ด่วนที่สุด:** B-1 (รหัส IO-Link ที่ยังใช้ได้อยู่และอยู่ในเอกสารที่ไม่เข้ารหัส)

---

## ภาคผนวก — จะทบทวนเมื่อระบบโตขึ้น

- **PostgreSQL บน flash ของเกตเวย์** จะพังก่อนเพื่อน ถ้า retention ยาวขึ้นหรือเซ็นเซอร์เพิ่ม ให้ย้ายออกไป server ก่อนเจอ wear-out
- **QoS 0** ถ้าวันหนึ่งต้องรับประกันว่าไม่มี sample หาย ต้องคุยกับ Balluff เรื่อง QoS 1 — อย่าเขียน dedup layer เผื่อไว้ตอนนี้
- **`items` เป็น partial** ถ้าเปิด Data selector เพิ่ม (เช่น a-RMS, แกน X) schema รองรับอยู่แล้ว แค่เพิ่ม mapping — อย่าเผื่อคอลัมน์ไว้ล่วงหน้า
- **calendar query** ยิงตรงที่ `alarm_events` พอเกิน 1 ปีค่อยทำ materialized view รายวัน
- **Severity Zone พึ่งการตั้งค่าในเซ็นเซอร์** ถ้าวันหนึ่งต้องการเกณฑ์ที่ปรับตามโหลด ค่อยย้ายการประเมินมาฝั่งเรา
