# CMTK Condition Monitoring — GS Battery

ระบบเฝ้าระวังสภาพมอเตอร์ผ่าน Balluff CMTK Gateway · Phase 1–4 ตาม SOP-SDLC

**สถานะ:** `ingestion` service เขียนเสร็จและเทสต์ผ่าน · พร้อม deploy ขึ้นบอร์ด

---

## เริ่มอ่านจากตรงไหน

| ถ้าคุณคือ | อ่าน |
|---|---|
| ผู้อนุมัติ | `docs/01` §0 และ §7 → `docs/02` §0 → `docs/03` §7 + ภาคผนวก A |
| คนเขียนโค้ด | `docs/04` → `ingestion/src/` → `prototype/` |
| auditor | `docs/01` §4 (AC) → `ingestion/tests/` (ทุกเทสต์มีรหัส AC ในชื่อ) |
| คน deploy | ข้ามไปหัวข้อ **Deploy** ด้านล่าง |

---

## โครงสร้าง

```
DEPLOY_PORTAINER.md   ← คู่มือ deploy ทีละขั้น
docker-compose.yml    stack สำหรับ Portainer — db + api + ingestion
.env.example          ตัวแปรของ stack ตรงกับ ${...} ทุกตัวใน compose
docs/          4 เอกสาร Phase 1–4
prototype/     ต้นแบบคลิกได้ 7 หน้าจอ (React)
database/
└── migrations/  001–009 · ตรวจ syntax ด้วย PostgreSQL parser แล้ว
frontend/      🟡 React + TS + Tailwind · หน้าสถานะระบบ 1 หน้า · 4 tests ผ่าน · token จาก DSN-CMTK-001
backend/       🟡 โครงบูตได้ · 3 tests ผ่าน · ยังมีแค่ /api/health · เสิร์ฟ frontend ด้วย
├── src/
│   ├── config/env.ts        Zod ตรวจ env ตอนบูต
│   ├── config/db.ts         pg Pool + interface Db (inject เข้า app ได้)
│   ├── middlewares/errorHandler.ts  AppError + 404 + 500 ที่ไม่ echo err.message
│   ├── routes/health.ts     GET /api/health · public โดยตั้งใจ
│   ├── app.ts               createApp(db) — รับ db เข้ามา เทสต์ไม่ต้องมี DB จริง
│   └── server.ts            listen + graceful shutdown
└── tests/integration/health.test.ts   เขียนก่อนโค้ดตาม TDD

   ยังไม่มี controllers/ services/ repositories/ validators/ — โฟลเดอร์เกิดตอนมีไฟล์แรกที่ใช้จริง
   (US-001 auth) ไม่สร้างโฟลเดอร์เปล่ารอไว้
ingestion/     ✅ พร้อมใช้ · 47 tests ผ่าน · TypeScript strict ผ่าน
├── src/
│   ├── config/env.ts   ตรวจ env ตอนบูต ขาดตัวไหนตายทันที
│   ├── schema.ts       Zod discriminated union + parse topic
│   ├── aggregator.ts   รวมค่าดิบ 0.5 วิ → 1 แถว/นาที
│   ├── edgeDetector.ts จับขอบขาขึ้น ไม่ใช่ค่าปัจจุบัน
│   ├── notifier.ts     คุมโควตา LINE 3 ชั้น
│   ├── line.ts         ตัวส่งจริง (broadcast)
│   ├── repository.ts   query pg ทั้งหมด
│   ├── mqtt.ts         subscribe + exponential backoff
│   └── index.ts        ประกอบ + timer + graceful shutdown
└── tests/        47 tests
```

---

## Deploy

👉 **ดู `DEPLOY_PORTAINER.md`** — วิธีขึ้น stack ผ่าน Portainer ทีละขั้น

<details><summary>วิธีทำมือ (ถ้าไม่ใช้ Portainer)</summary>

### 1 · เตรียมฐานข้อมูล

```bash
psql "$DATABASE_URL" -f database/migrations/001_extensions_and_enums.sql
psql "$DATABASE_URL" -f database/migrations/002_core_tables.sql
# ... 003 ถึง 008 ตามลำดับ

# 009 รับรหัสจากตัวแปร ไม่ฝังในไฟล์
psql "$DATABASE_URL" \
  -v admin_email="$SEED_ADMIN_EMAIL" \
  -v admin_hash="$SEED_ADMIN_HASH" \
  -f database/migrations/009_seed.sql
```

`SEED_ADMIN_HASH` สร้างด้วย bcrypt saltRounds 10 · **ห้ามส่งรหัสดิบ**

### 2 · ตั้งค่า

```bash
cd ingestion
cp .env.example .env      # แล้วเติมค่าจริง — .env ห้ามเข้า git
```

### 3 · รัน

```bash
docker compose up -d ingestion
docker compose logs -f ingestion
```

### 4 · ยืนยันว่าทำงาน

```sql
-- ควรมีแถวเพิ่มทุกนาที
SELECT motor_id, minute_ts, vrms_y_avg, zone, sample_count
  FROM readings_minute ORDER BY minute_ts DESC LIMIT 10;
```

**`sample_count` ควรใกล้ 120** ที่ logging 0.5 วินาที
ถ้าต่ำกว่ามากแปลว่าข้อความหายระหว่างทาง (QoS 0) — ไม่ใช่บั๊ก แต่ต้องรู้

</details>

---

## รันบนเครื่องตัวเอง (dev)

```bash
# 1 · ฐานข้อมูล — compose ไม่ publish พอร์ต 5432 ออกนอก stack ตอน dev จึงยกตัวชั่วคราว
docker run --rm -p 5432:5432 \
  -e POSTGRES_USER=cmtk -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=cmtk_monitoring \
  -v "$PWD/database/migrations:/docker-entrypoint-initdb.d:ro" \
  postgres:16-alpine

# 2 · API
cd backend && cp .env.example .env   # แล้วแก้ DATABASE_URL ให้ชี้ localhost
npm run dev                          # build แล้วรัน · http://localhost:3000/api/health

# 3 · หน้าเว็บ
cd frontend && npm run dev           # http://localhost:5173 · proxy /api ไปที่ 3000
```

`npm run dev` **build ก่อนรันทุกครั้ง** ไม่ได้รัน `.ts` ตรง ๆ เพราะ import ในโค้ดลงท้าย `.js`
(จำเป็นสำหรับ ESM ที่ compile แล้ว) ซึ่ง Node ไม่ map กลับไปหา `.ts` ให้
แก้โค้ดแล้วสั่งใหม่ ไม่มี watch — ใส่เมื่อเริ่มรำคาญจริง

---

## รันเทสต์

```bash
cd ingestion   # หรือ backend — สคริปต์ชุดเดียวกัน
npm install
npm test            # ingestion 47 · backend 3 · frontend 4
npm run type-check  # strict mode
npm run lint        # eslint · SOP Gate 1
```

---

## ข้อมูลระบบที่ยืนยันแล้ว

| | |
|---|---|
| CMTK Gateway | `192.168.50.140` · firmware 2.4.1 · Debian 12 aarch64 |
| ทรัพยากร | 4 CPU · RAM 3.9 GB (ว่าง 2.9) · SD card 28.8 GB (เหลือ 27) |
| Portainer | `192.168.50.140/portainer/` · Docker 28.5.1 rootless · root บน SD card |
| Grafana | `192.168.50.140/graphs/` · **10.4.1 หมด support → นอก audit scope** |
| IO-Link Master | BNI XG5-508-1B5-Z067 @ `192.168.50.141` · **master2** |
| เซ็นเซอร์ | BCM R16E-004-CI02-01,5-S4 × 4 · พอร์ต 0–3 · logging 0.5 วินาที |
| MQTT | `172.16.0.2:1883` จาก container บนบอร์ด · **QoS 0** · auth เปิด |
| ข้อมูลที่ได้จริง | Temperature · v-RMS Y · v-RMS Z + boolean 8 ตัว (**ไม่มีแกน X ไม่มี a-RMS**) |
| LINE | Communication plan 500 ข้อความ/เดือน · ผู้รับ 5 คน → 1 เหตุการณ์ = 5 ข้อความ |
| Outbound 443 | ✅ ทดสอบแล้ว (`api.line.me` ตอบ 401) · **7844 ถูกบล็อก** |

---

## การตัดสินใจที่ทุกอย่างตั้งอยู่บนนั้น

**Node-RED ถูกลบออกทั้งหมด** — CMTK เก็บข้อมูลเองอยู่แล้ว Node-RED เป็นชั้นซ้ำซ้อน

**เซ็นเซอร์ประเมิน alarm และ ISO zone ให้เอง** — ระบบเราเป็นผู้บันทึก แจ้งเตือน และสืบย้อน
ไม่ใช่ผู้ตัดสิน ตัดงานเขียน threshold engine ออกทั้งก้อน

**เกณฑ์ 1.0 mm/s ของระบบเดิมต้องเลิกใช้** — ค่าปัจจุบัน 1.41 / 1.32 mm/s และเซ็นเซอร์
รายงาน Zone B (ปกติตาม ISO 10816) ระบบเก่าจะเตือนตลอดเวลาทั้งที่เครื่องปกติ

**ยังไม่มี ML และอาจไม่มีวันมี** — ที่ 4 มอเตอร์ เคสที่พังสะสมช้าเกินกว่าจะเทรน
สิ่งที่ทำได้จริงคือ ISO zone (ฟรีจากฮาร์ดแวร์) + trend slope + เก็บ cause code ทุกครั้งที่ซ่อม

**LINE ใช้ broadcast** — ไม่ต้องมี userId ไม่ต้องมี webhook เพราะบอร์ดรับ inbound ไม่ได้

---

## Blocker ที่ยังเปิด

| # | เรื่อง | ใคร | บล็อกอะไร |
|---|---|---|---|
| **B-1** | รหัส IO-Link รั่ว · **ยังใช้งานได้อยู่** | admin | Gate 5 |
| B-7 | kW + วิธียึด มอเตอร์ 4 ตัว | maintenance | ตั้งโซนในเซ็นเซอร์ · ไม่บล็อก ingestion |
| B-11 | ยืนยันโควตา LINE ในคอนโซล | manager | ค่าเพดานใน `.env` |
| B-14 | อนุมัติข้อมูลออกคลาวด์ (Supabase) | ผู้มีอำนาจ | service `backup` |

**ไม่มีข้อไหนบล็อกการ deploy `ingestion`** — seed ใส่ชื่อมอเตอร์ชั่วคราวไว้แล้ว แก้ทีหลังได้

---

## งานถัดไป

1. **Deploy `ingestion` ขึ้นบอร์ด** ← ทำก่อน ทุกวันที่เลื่อนคือเลื่อนวันที่เส้นทำนายใช้ได้จริง
2. Backend API ตาม `docs/04` §4 — โครงกับ `/api/health` เสร็จแล้ว เหลือ 18 endpoints เริ่มที่ US-001
3. Frontend แปลงจาก prototype — โครง + หน้าสถานะระบบเสร็จแล้ว เหลืออีก 7 หน้าจอ
4. `backup` service ตาม `docs/03` ภาคผนวก A
