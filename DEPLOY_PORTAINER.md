# Deploy `ingestion` ผ่าน Portainer

บอร์ด CMTK ไม่มี SSH และ Portainer CE ไม่มีช่องให้อัปโหลดโค้ดทั้งโฟลเดอร์
จึงต้องให้ Portainer **ดึงจาก Git แล้ว build บนบอร์ดเอง** ซึ่งได้ผลดีกว่าด้วย
เพราะบอร์ดเป็น arm64 — build ที่นั่นตรงสถาปัตยกรรม ไม่ต้อง cross-compile

---

## ทางที่แนะนำ · Repository stack

### 0 · ต่อ environment ก่อน (ทำครั้งเดียว)

Portainer ที่เพิ่งติดตั้งจะยังไม่มี environment — **สร้าง Stack ไม่ได้จนกว่าจะต่อ**
ถ้าเปิดมาเจอหน้า **Quick Setup / Environment Wizard** ให้ทำตามนี้

1. ติ๊ก **Docker Standalone** → **Start Wizard**
2. เลือกแท็บ **Socket** (ไม่ใช่ API/Agent) — Portainer อยู่บนเครื่องเดียวกับ Docker
3. ตั้งชื่อ เช่น `cmtk-local` → **Connect**

> ⚠️ **บอร์ดใช้ Docker แบบ rootless** socket จึงไม่ได้อยู่ที่ `/var/run/docker.sock`
> ถ้าต่อไม่ติด ให้ดูว่า container ของ Portainer mount socket ตัวไหนเข้ามา
> (rootless อยู่ที่ `/run/user/<uid>/docker.sock` บนโฮสต์)

> ⚠️ **ต้องเป็น Portainer บนบอร์ด CMTK เท่านั้น** — ตั้งบนเครื่องตัวเองไว้ลองเล่นได้
> แต่ deploy stack จริงที่นั่นไม่ได้ เพราะ MQTT `172.16.0.2:1883` เข้าถึงได้
> จาก container บนบอร์ดเท่านั้น (NFR-15)

---

### 1 · เอาโค้ดขึ้น Git

repo ส่วนตัวได้ ขอแค่บอร์ดเข้าถึงได้ผ่าน HTTPS 443 (ยืนยันแล้วว่าออกได้)

```
cmtk-monitoring/
├── docker-compose.yml
├── database/migrations/     001–009
└── ingestion/               src · tests · Dockerfile · package.json
```

**`.gitignore` ต้องมี `.env` และ `node_modules`**

### 2 · Portainer → Stacks → Add stack

| ช่อง | ค่า |
|---|---|
| Name | `cmtk` |
| Build method | **Repository** |
| Repository URL | URL ของ repo |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.yml` |
| Authentication | เปิดถ้า repo เป็น private (ใช้ personal access token) |

### 3 · Environment variables

กดปุ่ม **Add an environment variable** ใส่ทีละตัว

| Name | Value |
|---|---|
| `DB_USER` | `cmtk` |
| `DB_PASSWORD` | รหัสที่สุ่มมา · **อย่าใช้ซ้ำกับที่อื่น** |
| `MQTT_URL` | `mqtt://172.16.0.2:1883` |
| `MQTT_USER` | `user` |
| `MQTT_PASSWORD` | รหัส MQTT จากหน้า Settings → MQTT |
| `LINE_ENABLED` | `false` ← **รอบแรกปิดไว้ก่อน** |
| `LINE_RECIPIENT_COUNT` | `5` ← จำนวนคนที่แอดบอท · โควตานับตามคน (NFR-06) |
| `LOG_LEVEL` | `info` |

> **ทำไมปิด LINE รอบแรก** — ถ้ามี config ผิดแล้ว event เด้งรัว จะกินโควตา 500 ข้อความ
> ตั้งแต่ชั่วโมงแรก เปิดเมื่อยืนยันแล้วว่าข้อมูลเข้าถูกและ event เกิดตามที่ควร

### 4 · Deploy the stack

build ครั้งแรกใช้เวลาราว 2–4 นาที (npm ci บน arm64)

---

## ยืนยันว่าทำงาน

### ก · ดู log

Containers → `cmtk-ingestion` → Logs

ควรเห็นตามลำดับนี้
```
เริ่ม ingestion service
โหลดรายการมอเตอร์ {"count":4}
กู้สถานะ event ที่ค้างอยู่ {"openEvents":0}
เชื่อมต่อ MQTT และ subscribe แล้ว
```

แล้วทุกนาทีจะมี
```
เขียนข้อมูลรายนาที {"rows":4,"written":4,"received":480,"parsed":480,...}
```

**`received` ควรราว 480** (4 มอเตอร์ × 2 ข้อความ/วินาที × 60 วินาที)

### ข · เช็คข้อมูลใน DB

Containers → `cmtk-db` → Console → `/bin/sh`

```sh
psql -U cmtk -d cmtk_monitoring -c "
  SELECT m.tag, r.minute_ts, r.vrms_y_avg, r.vrms_z_avg,
         r.temperature_avg, r.zone, r.sample_count
    FROM readings_minute r JOIN motors m ON m.id = r.motor_id
   ORDER BY r.minute_ts DESC LIMIT 8;"
```

**`sample_count` ควรใกล้ 120** ที่ logging 0.5 วินาที
ต่ำกว่ามาก = ข้อความหายระหว่างทาง (QoS 0) ไม่ใช่บั๊ก แต่ต้องรู้ก่อนเชื่อกราฟ

### ค · สร้างผู้ใช้ admin

ยังไม่ต้องทำตอนนี้ — `ingestion` ไม่ใช้ตาราง `users`
ทำตอนขึ้น API ตามขั้นตอนใน `database/migrations/010_admin_user.sql.README`

---

## ถ้าใช้ Git ไม่ได้

### ทางเลือก · build image ที่อื่นแล้ว push registry

```bash
# บนเครื่องที่มี docker buildx — ต้องระบุ arm64 เพราะบอร์ดไม่ใช่ x86
docker buildx build --platform linux/arm64 \
  -t <registry>/cmtk-ingestion:1.0.0 --push ./ingestion
```

แล้วใน Portainer ใช้ **Web editor** วาง compose เดิม แต่เปลี่ยน

```yaml
  ingestion:
    image: <registry>/cmtk-ingestion:1.0.0   # แทน build:
```

**แต่ migration จะไม่ถูก mount** เพราะไม่มีไฟล์บนบอร์ด ต้องรันเองผ่าน Console ของ `cmtk-db`
โดยวาง SQL ทีละไฟล์ — น่าเบื่อแต่ทำครั้งเดียว

> ทาง Git ดีกว่าชัดเจน ถ้ายังไม่มี repo ภายใน ใช้ GitHub private ก็ได้
> บอร์ดออก 443 ได้แล้ว (ทดสอบกับ `api.line.me` มาแล้ว)

---

## ปัญหาที่น่าจะเจอ

| อาการ | สาเหตุ |
|---|---|
| `เชื่อมต่อ MQTT ใหม่` วนไม่หยุด | รหัส MQTT ผิด หรือ `172.16.0.2` เข้าไม่ถึงจากใน stack — ลองเปลี่ยนเป็น `192.168.50.140` |
| `count: 0` ตอนโหลดมอเตอร์ | migration ไม่ได้รัน — volume `pgdata` มีอยู่ก่อนแล้ว initdb เลยข้าม · ต้องลบ volume แล้ว deploy ใหม่ |
| `received` ขึ้นแต่ `rows: 0` | topic ไม่ตรง หรือ master/port ไม่ตรงกับที่ seed ไว้ (seed ตั้งเป็น master2 port 0–3) |
| `ตัวแปร environment ไม่ถูกต้อง` | service ตายตอนบูตตามตั้งใจ — อ่าน log จะบอกชื่อตัวแปรที่ขาด |
| build ล้มตอน `npm ci` | บอร์ดออกเน็ตไม่ได้ชั่วคราว หรือ registry.npmjs.org ถูกบล็อก |

---

## หลัง deploy สำเร็จ

1. ปล่อยไว้ **1 ชั่วโมง** แล้วเช็คว่า `readings_minute` มี 60 แถวต่อมอเตอร์
2. ถอดสายเซ็นเซอร์ตัวหนึ่งเพื่อทดสอบ — ควรเห็น event `offline` ใน `alarm_events`
3. เสียบกลับ — event ควรถูกปิด (`resolved_at` มีค่า)
4. **ยืนยัน `LINE_RECIPIENT_COUNT` กับคอนโซล LINE ก่อน** แล้วค่อยเปิด `LINE_ENABLED=true` และ redeploy stack
