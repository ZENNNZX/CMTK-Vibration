# Phase 4 — Development
## GS Battery · CMTK Condition Monitoring

| | |
|---|---|
| Document ID | DEV-CMTK-001 |
| Version | 1.0 |
| อ้างอิง | REQ-CMTK-001 v0.3 · DSN-CMTK-001 · DB-CMTK-001 · SOP `04_DEVELOPMENT` |
| Status | 🟡 รอ senior review |

---

## 1. Dependencies — ตัดออก 6 ตัวจากรายการมาตรฐาน

SOP ให้ "เลือก dependency ตามชนิดแอป" แอปนี้คือ dashboard ภายใน 7 หน้า ผู้ใช้ 5 คน
ทุกตัวที่ตัดออกมีของที่ทำแทนได้อยู่แล้วในภาษาหรือในเบราว์เซอร์

### Frontend

| แพ็กเกจ | เอา | เหตุผล |
|---|---|---|
| `react-router-dom` | ✅ | 7 หน้า ต้องการ deep link เข้าหน้ามอเตอร์ |
| `zod` | ✅ | ใช้ schema ชุดเดียวกับ backend |
| `recharts` | ✅ | กราฟ 4 แบบ เขียน SVG เองไม่คุ้ม |
| `lucide-react` | ✅ | ไอคอน |
| `three` | ✅ | REQ-034 · **ต้อง lazy load** ไม่ให้ถ่วงหน้าแรก · ดู §1.1 |
| ~~`zustand`~~ | ❌ | state ที่แชร์ทั้งแอปมีแค่ user กับ role — `useContext` พอ |
| ~~`axios`~~ | ❌ | `fetch` มีในเบราว์เซอร์ · wrapper 20 บรรทัดใส่ header กับแปลง error ก็ครบ |
| ~~`react-hook-form`~~ | ❌ | มี 4 ฟอร์ม ฟอร์มละไม่เกิน 6 ช่อง · controlled input + zod พอ |
| ~~`@hookform/resolvers`~~ | ❌ | ตามข้างบน |
| ~~`clsx`~~ | ❌ | class เงื่อนไขมีไม่กี่จุด template literal พอ |
| ~~`react-icons`~~ | ❌ | ซ้ำกับ lucide — เลือกชุดเดียว |
| ~~`date-fns`~~ | ❌ | **`Intl.DateTimeFormat('th-TH')` ให้เดือนไทยและ พ.ศ. ในตัว** ดีกว่า date-fns ด้วยซ้ำ |

> ถ้าวันหนึ่งฟอร์มเกิน 10 ช่องหรือมี field แบบ dynamic ค่อยเอา `react-hook-form` กลับมา
> **อย่าใส่ไว้ก่อนเพราะเผื่อ**

### 1.1 three.js — ข้อกำหนดเฉพาะ

ต้นแบบรันบน three r128 ซึ่งไม่มี `OrbitControls` และไม่มี `CapsuleGeometry`
ผมจึงเขียนการหมุนด้วยมือและประกอบมอเตอร์จาก cylinder กับ box
**ในโปรเจกต์จริงติดตั้งผ่าน npm จะได้เวอร์ชันปัจจุบัน** → ใช้ `OrbitControls` จาก
`three/examples/jsm/controls/OrbitControls.js` แทนโค้ดหมุนเองได้ทั้งก้อน

| ข้อกำหนด | เหตุผล |
|---|---|
| **Lazy load ด้วย `React.lazy` + dynamic import** | three ~150 KB gzipped · หน้า dashboard ที่เปิดบ่อยสุดต้องไม่จ่ายค่านี้ |
| **import แบบ named เท่านั้น** | `import { Scene, Mesh } from 'three'` ให้ tree-shake ได้ · ห้าม `import * as THREE` ในโค้ด production |
| **ไม่ใช้ไฟล์โมเดลภายนอก** | ประกอบจาก primitive ล้วน → ไม่มี GLTFLoader ไม่มี asset ให้ดูแล ไม่มี CORS |
| **`dispose()` ใน cleanup** | renderer กับ geometry ไม่คืนหน่วยความจำเอง · หน้านี้เข้าออกบ่อย |
| **ต้องมี dropdown คู่ขนาน** | canvas กด Tab ไม่ได้ — AC-022-05 |
| **ตรวจว่าไม่มี WebGL แล้วไม่พัง** | แท็บเล็ตเก่าบางรุ่นปิด WebGL → แสดง dropdown อย่างเดียว ไม่ใช่จอขาว |

`react-three-fiber` **ไม่เอา** — เพิ่ม abstraction layer + reconciler เพื่อฉาก 1 ฉากที่มี
มอเตอร์ตัวเดียวกับจุด 5 จุด เขียน three ตรง ๆ สั้นกว่าและ debug ง่ายกว่า

### Backend

```
express  pg  zod  bcrypt  jsonwebtoken  helmet  cors  mqtt  pino
```

**ไม่มี ORM** — SOP บังคับ parameterized query อยู่แล้ว `pg` ทำได้ตรง ๆ
Prisma/TypeORM เพิ่ม build step, migration engine ซ้อน และ query ที่เดาไม่ได้ว่าออกมาหน้าตาไหน

**ไม่มี dotenv** — Node 20+ มี `--env-file` ในตัว

---

## 2. โครงสร้างโปรเจกต์

```
✅ มีจริงแล้ว · 🟡 มีโครงแล้วยังไม่ครบ · ⬜ ยังไม่สร้าง (สร้างตอนมีไฟล์แรกที่ใช้จริง)

cmtk-monitoring/
├── ✅ README.md
├── ✅ DEPLOY_PORTAINER.md          คู่มือขึ้น stack ผ่าน Portainer
├── ✅ docker-compose.yml           db + api + ingestion
├── ✅ .env.example                 ตรงกับ ${...} ทุกตัวใน compose · .env อยู่ใน .gitignore
├── ✅ .dockerignore                build context ของ api เป็นรากแล้ว ต้องกัน node_modules
├── ✅ docs/                        01 Requirements · 02 Design · 03 Database · 04 Development
├── ✅ prototype/                   ต้นแบบคลิกได้ 7 หน้าจอ (.jsx ไฟล์เดียว)
│
├── ✅ database/
│   └── migrations/                 001–009 · seed อยู่ใน 009 ไม่มีโฟลเดอร์ seeds/ แยก
│                                   schema doc อยู่ docs/03 ไม่มีโฟลเดอร์ schemas/ แยก
│
├── ✅ ingestion/                   แยกจาก backend ตาม NFR-05 · 47 tests
│   ├── Dockerfile · package.json · tsconfig.json · eslint.config.js · .env.example
│   ├── src/
│   │   ├── config/env.ts           Zod ตรวจ env ตอนบูต
│   │   ├── schema.ts               discriminated union + parseTopic
│   │   ├── aggregator.ts           buffer 1 นาที
│   │   ├── edgeDetector.ts         ขอบขาขึ้นของ boolean
│   │   ├── notifier.ts             LINE + คุมโควตา 3 ชั้น
│   │   ├── line.ts                 ตัวส่งจริง (broadcast อย่างเดียว)
│   │   ├── repository.ts           query pg ทั้งหมด
│   │   ├── mqtt.ts                 subscribe + backoff
│   │   └── index.ts                ประกอบ + timer + graceful shutdown
│   └── tests/
│
├── 🟡 backend/                     บูตได้ · มี /api/health · 3 tests
│   ├── Dockerfile · package.json · tsconfig.json · eslint.config.js · .env.example
│   ├── src/
│   │   ├── ✅ config/              env.ts db.ts — ไม่มี logger.ts เพราะ pino คือ 1 บรรทัดใน server.ts
│   │   ├── ✅ middlewares/         errorHandler.ts (AppError + 404 + 500 ที่ไม่ echo err.message)
│   │   ├── ✅ routes/              health.ts
│   │   ├── ✅ app.ts · server.ts
│   │   ├── ⬜ controllers/         ↓
│   │   ├── ⬜ services/            business logic ทั้งหมดอยู่ที่นี่
│   │   ├── ⬜ repositories/        ↓
│   │   ├── ⬜ validators/          zod schemas
│   │   ├── ⬜ types/ · utils/      เกิดตอนมีตัวที่ใช้ร่วมกันจริงตัวแรก
│   │   └─                          ทั้ง 5 อันบนเกิดพร้อม US-001 (auth) = endpoint แรกที่มีตรรกะ
│   └── tests/integration/          health.test.ts — เขียนก่อนโค้ดตาม TDD
│
├── 🟡 frontend/                    React + TS + Tailwind v4 · หน้าสถานะระบบ 1 หน้า
│   ├── index.html · package.json · tsconfig.json · vite.config.ts · eslint.config.js
│   └── src/
│       ├── ✅ index.css            design token จาก DSN-CMTK-001 ทั้งชุด (@theme)
│       ├── ✅ services/api.ts      ตัวห่อ fetch ~30 บรรทัด — ไม่ใช้ axios
│       ├── ✅ pages/SystemStatus.tsx  + .test.tsx (เขียน test ก่อน)
│       └── ✅ main.tsx             ยังไม่มี router — เพิ่มตอนมีหน้าที่สอง
│       ⬜ components/ hooks/ store/ types/ utils/ constants/  เกิดตอนมีหน้าที่ใช้ร่วมกันจริง
└── ⬜ backup/                      รอ B-14 อนุมัติข้อมูลออกนอกองค์กร · ตามภาคผนวก A ของ docs/03
```

**ไม่สร้างโฟลเดอร์เปล่ารอไว้** — โฟลเดอร์ที่ว่างคือคำสัญญาที่ยังไม่มีใครถือ อ่านแล้วแยกไม่ออกว่า
"ยังไม่ทำ" กับ "ทำแล้วแต่ลืม" เครื่องหมาย ⬜ ข้างบนบอกได้ตรงกว่าและไม่ต้องดูแล

**ทำไม `ingestion` แยกจาก `backend`** — NFR-05 บอกว่า API ล่มแล้วการเก็บข้อมูลต้องไม่หยุด
คนละ failure domain คนละรอบ deploy ถ้ารวมกัน deploy API ทีเดียวข้อมูลขาดไปหนึ่งช่วง

---

## 3. Services — ปลายทาง 4 ตัว ไม่ใช่ 5

**ของจริงอยู่ที่ `docker-compose.yml` ไฟล์เดียว** — ไม่คัดลอก yaml มาไว้ที่นี่
สำเนาที่สองคือสำเนาที่จะเก่าก่อนเสมอ (เคยเกิดมาแล้วกับ `LINE_MODE`)

| service | สถานะ | หน้าที่ | พอร์ต |
|---|---|---|---|
| `db` | ✅ ใน compose | postgres:16-alpine · `synchronous_commit=off` · migrations รันตอน initdb | ไม่ publish |
| `api` | ✅ ใน compose | Express + TS · build frontend เข้า image เดียวกันแล้วเสิร์ฟด้วย `express.static` (`STATIC_DIR`) | `49180:3000` |
| `ingestion` | ✅ ใน compose | MQTT → Postgres · แยก failure domain ตาม NFR-05 | ไม่ publish (ออกอย่างเดียว) |
| `backup` | ⬜ ยังไม่มี | pg_dump → Supabase · **รอ B-14** อนุมัติข้อมูลออกนอกองค์กร | — |

### ตัด nginx ออก

ของเดิมมี nginx เพราะต้อง proxy ไป Node-RED **ตอนนี้ Node-RED ไม่มีแล้ว จึงไม่เหลืออะไรให้ proxy**

Express เสิร์ฟไฟล์ static ที่ build แล้วด้วย `express.static` ได้ — ผู้ใช้ 5 คน ไม่มีเหตุผลให้มี
reverse proxy อีกชั้น ตัดได้ 1 container 1 ไฟล์คอนฟิก และ 1 จุดที่ตั้งค่าผิดได้

> เอา nginx กลับมาเมื่อ: ต้องเสิร์ฟ TLS เอง · ต้องทำ rate limit ระดับ edge · มีผู้ใช้พร้อมกันเกินหลักสิบ

**`backup` แยกเป็น container ของตัวเอง** ทั้งที่สคริปต์แค่ 30 บรรทัด เพราะมันคือสิ่งที่ต้องรอด
ตอนที่ของอื่นพัง ถ้าฝังใน `api` แล้ว API crash loop = ไม่มี backup โดยไม่มีใครรู้

---

## 4. API Contract

ทุก endpoint ยกเว้น `/api/auth/login` และ `/api/health` ต้องผ่าน `authenticate`

| Method | Path | Role | Story |
|---|---|---|---|
| POST | `/api/auth/login` | public | US-001 |
| POST | `/api/auth/logout` | ทุก role | US-001 |
| GET | `/api/auth/me` | ทุก role | US-001 |
| GET | `/api/motors` | ทุก role | US-005 |
| GET | `/api/motors/:id` | ทุก role | US-006 |
| POST | `/api/motors` | admin | US-003 |
| PATCH | `/api/motors/:id` | maintenance, admin | US-003, US-008 |
| DELETE | `/api/motors/:id` | admin | US-003 (soft delete) |
| GET | `/api/motors/:id/readings` | ทุก role | US-007 |
| GET | `/api/motors/:id/trend` | ทุก role | US-020 |
| POST | `/api/motors/:id/run-hours/reset` | maintenance, admin | US-018 |
| GET | `/api/events` | ทุก role | US-012 |
| POST | `/api/events/:id/ack` | maintenance, admin | US-013 |
| GET | `/api/maintenance` | ทุก role | US-014 |
| POST | `/api/maintenance` | maintenance, admin | US-014 |
| GET | `/api/reports/monthly` | ทุก role | สรุปรายเดือน |
| GET | `/api/export/readings.csv` | ทุก role | US-017 |
| GET | `/api/users` | admin | US-002 |
| POST · PATCH | `/api/users/:id?` | admin | US-002 |
| GET | `/api/health` | public | ใช้กับ healthcheck |

### รูปแบบ response — ตายตัวทั้งระบบ (ตาม SOP-DEV-001)

```ts
// สำเร็จ · รายการเดียว
{ success: true, data: T }

// สำเร็จ · เป็นชุด
{ success: true, data: T[],
  pagination: { page, pageSize, total, totalPages } }

// ผิดพลาด — ห้าม echo err.message (NFR-07)
{ success: false, message: 'ข้อความที่ผู้ใช้อ่านรู้เรื่อง' }

// ผิดพลาดจาก validation
{ success: false, message: 'Validation failed',
  errors: [{ field: 'email', message: '...' }] }
```

> เดิมเอกสารฉบับนี้กำหนด `{ data }` / `{ error: { code } }` — เปลี่ยนมาใช้รูปแบบ SOP
> ตอนที่ backend ยังไม่เขียนสักบรรทัด จุดที่ถูกที่สุดที่จะเปลี่ยน

| HTTP | ใช้เมื่อ |
|---|---|
| 400 | zod ปฏิเสธ |
| 401 | ไม่มี token หรือหมดอายุ |
| 403 | role ไม่พอ — **ห้ามตอบ 404 แทน** (AC-002-01) |
| 409 | ผูกพอร์ตซ้ำ · ack ซ้ำ |
| 429 | ล็อกอินผิดถี่เกิน (AC-001-05) |
| 500 | ไม่คาดคิด — log เต็มฝั่งเซิร์ฟเวอร์ ส่งกลับเฉพาะข้อความกลาง ๆ |

---

## 5. Environment

`.env.example` ต้องมีทุกตัว ค่าว่าง **ห้ามใส่ค่าจริง**

```bash
# Database
DB_USER=
DB_PASSWORD=
DATABASE_URL=postgresql://user:pass@db:5432/cmtk_monitoring

# Auth
JWT_SECRET=
JWT_EXPIRES_IN=8h              # ยาวกว่ากะทำงาน 1 กะ

# MQTT — จาก container บนบอร์ดใช้ที่อยู่ภายใน ไม่ต้อง TLS
MQTT_URL=mqtt://172.16.0.2:1883
MQTT_USER=user
MQTT_PASSWORD=
MQTT_TOPIC=balluff/cmtk/+/iolink/devices/#

# LINE — broadcast ไม่ต้องมี userId ไม่ต้องมี webhook
LINE_CHANNEL_ACCESS_TOKEN=
LINE_RECIPIENT_COUNT=5         # NFR-06 · 1 เหตุการณ์ = 5 ข้อความ (B-11)
LINE_DEBOUNCE_MINUTES=60
LINE_DAILY_CAP_PER_MOTOR=3
LINE_MONTHLY_MESSAGE_CAP=350
LINE_MONTHLY_RESERVE=150       # สงวนให้ Main Alarm

# Backup
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
BACKUP_PASSPHRASE=             # ⚠️ เก็บสำเนาไว้นอกบอร์ดด้วย

# Ingestion
AGGREGATE_WINDOW_SECONDS=60
STALE_THRESHOLD_SECONDS=300
```

**ตรวจ env ตอนบูตด้วย zod** — ขาดตัวไหนให้ตายทันทีพร้อมบอกชื่อ
อย่าปล่อยให้รันไปแล้วพังตอนตี 3 ตอนจะส่ง LINE

---

## 6. TDD — เขียน test ก่อน

SOP บังคับ TDD และ coverage BE ≥ 80% / FE ≥ 70%

**ลำดับที่ต้องทำ:** AC ในการ์ด Notion → test case → โค้ดที่ทำให้ผ่าน

```
backend/tests/
├── unit/
│   ├── services/            # business logic ล้วน
│   └── validators/          # zod schema
├── integration/
│   └── routes/              # ทุก endpoint อย่างน้อย happy path + 403
└── fixtures/

ingestion/tests/
├── schema.test.ts           # payload จริง 3 แบบ + type ที่ไม่รู้จัก
├── aggregator.test.ts       # sample ขาด · isValid false
└── edgeDetector.test.ts     # ขอบขาขึ้น · ค้าง true · ขอบขาลง
```

### Test ที่สำคัญที่สุดของโปรเจกต์นี้

ไม่ใช่ CRUD แต่เป็นสามข้อนี้ — พลาดแล้วระบบเตือนจะโกหก

| Test | AC | ทำไมสำคัญ |
|---|---|---|
| `edgeDetector` ไม่สร้าง event ซ้ำตอน bit ค้าง true | 008-03 | ไม่งั้น LINE ยิงทุก 0.5 วินาที |
| `notifier` หยุดส่งเมื่อถึงเพดาน แต่ยังบันทึก event | 010-03 | โควตาหมด = alarm จริงเงียบทั้งเดือน |
| `schema` เจอ `type` ที่ไม่รู้จักแล้วข้าม ไม่ throw | 004-06 | Balluff ออกเฟิร์มแวร์ใหม่แล้ว ingestion ตาย |

### เชื่อมกับ AC จริง

```ts
// tests/unit/services/edgeDetector.test.ts
describe('AC-008-03 · จับเฉพาะขอบขาขึ้น', () => {
  it('bit ค้าง true หลายข้อความ → สร้าง event ครั้งเดียว', async () => {
    const det = new EdgeDetector();
    expect(det.feed({ mainAlarm: false })).toBeNull();
    expect(det.feed({ mainAlarm: true })).toMatchObject({ kind: 'alarm' });
    expect(det.feed({ mainAlarm: true })).toBeNull();   // ← ข้อที่พลาดกันบ่อย
    expect(det.feed({ mainAlarm: true })).toBeNull();
  });
});
```

---

## 7. Sprint Plan

ผูกกับ Notion `Stories — CMTK Monitoring` แล้ว

| Sprint | Pts | ส่งอะไร | ตรวจว่าสำเร็จยังไง |
|---|---|---|---|
| **1** | 19 | auth · motors CRUD · **ingestion ขึ้นบอร์ด** | `readings_minute` มีแถวเพิ่มทุกนาที |
| 2 | 16 | dashboard · drill-down · กราฟ | เปิด `:49180` เห็นค่าจริงของ 4 มอเตอร์ |
| 3 | 18 | alarm capture · LINE · connectivity | ถอดสายเซ็นเซอร์ → ได้ LINE ภายใน 5 นาที |
| 4 | 19 | ปฏิทิน · ack · cause code · retention | purge job ลบของเกิน 1 ปีได้จริง |
| 5 | 16 | schematic · CSV · run hours · แกน Y:Z | เปิด CSV ใน Excel ภาษาไทยไม่เพี้ยน |
| 6 | 8 | trend slope · audit log | แก้ threshold แล้วมีแถวใน `audit_logs` |

### 🔴 ข้อเสนอที่ยังรอคำตอบ — แยก ingestion ออกมา deploy ก่อนเพื่อน

`ingestion` ไม่ต้องพึ่ง UI เลย ต้องการแค่ `db` + `motors` ที่ลงทะเบียนแล้ว

ถ้าขึ้นตั้งแต่**สัปดาห์แรกของ Sprint 1** แล้วปล่อยเก็บเงียบ ๆ ระหว่างทำอีก 5 sprint
พอ dashboard เสร็จจะมีข้อมูลประมาณ **3 เดือน** รออยู่แล้ว — ซึ่งพอดีกับเกณฑ์ที่เส้นทำนายเริ่มเชื่อถือได้

ถ้ารอ deploy พร้อมกันทั้งระบบ วันที่ dashboard เปิดใช้คือวันที่เริ่มนับจากศูนย์
กราฟจะว่างเปล่าและเส้นทำนายจะไม่มีความหมายไปอีก 3 เดือน

**ทุกวันที่เลื่อน = เลื่อนวันที่ predictive maintenance ใช้ได้จริงไปหนึ่งวัน**

---

## 8. Git

```
main      ── production เท่านั้น · merge จาก develop
develop   ── ปลายทางของ feature ทุกอัน
feature/US-004-mqtt-ingestion
fix/US-012-calendar-lead-offset
```

**Commit message ต้องมี story id**

```
feat(US-004): subscribe MQTT และเขียน readings รายนาที
fix(US-012): แก้ช่องว่างต้นเดือนที่ฮาร์ดโค้ดไว้
```

**ก่อน push (Husky + lint-staged)** — lint · type-check · test ที่เกี่ยว
**ก่อน merge** — DoD ครบ 7 ข้อ ติ๊กในการ์ด Notion · peer review ไม่มี MUST comment ค้าง

---

## 9. Phase 4 Checklist

- [x] เลือก dependency พร้อมเหตุผลที่ตัด — §1
- [x] โครงสร้างโฟลเดอร์ตาม Code Standard Guide — §2
- [x] docker-compose ครบทุก service — §3
- [x] API contract ครบทุก endpoint — §4
- [x] `.env.example` ครบ — §5
- [x] แผน test ผูกกับ AC — §6
- [x] Sprint plan ผูก Notion — §7
- [ ] repo จริง + first commit
- [ ] ESLint · Prettier · Husky ทำงาน
- [ ] `npm run build` ผ่านทั้ง FE และ BE
- [ ] **senior review**

---

## 10. Blockers ที่ยังเปิด

| # | เรื่อง | บล็อกอะไร |
|---|---|---|
| B-1 | รหัส IO-Link รั่ว (พักไว้) | Gate 5 |
| B-7 | kW + วิธียึด มอเตอร์ 4 ตัว | `009_seed.sql` · ตั้งโซนในเซ็นเซอร์ |
| B-11 | ยืนยันโควตา LINE ในคอนโซล | ค่า `LINE_MONTHLY_MESSAGE_CAP` |
| B-14 | **อนุมัติข้อมูลออกนอกองค์กร (Supabase)** | service `backup` |
| B-15 | **ใครเป็น senior reviewer** | ทุก gate ตั้งแต่ Phase 1 |

**B-15 เป็นข้อที่เงียบที่สุดแต่กระทบมากที่สุด** — SOP ให้ senior เป็นคนอนุมัติ gate และ review
ตอนนี้ทุก phase ค้างที่ "รอ senior review" โดยยังไม่รู้ว่าใคร ถ้าไม่มีคนรับบทนี้
เอกสารทั้งสาม phase จะค้างอยู่ตรงนี้ไปเรื่อย ๆ และ Sprint 1 เริ่มไม่ได้
