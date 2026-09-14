import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Area, ComposedChart, BarChart, Bar, Legend,
} from "recharts";
import {
  Gauge, CalendarDays, Wrench, Users, LogOut, ChevronLeft, AlertTriangle,
  WifiOff, Download, RotateCcw, Check, Lock, Box, TrendingUp, Info,
  Bell, Save, X, Move3d, BarChart3, Target,
} from "lucide-react";
import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────
   GS Battery — CMTK Condition Monitoring · prototype v2
   เพิ่มจาก v1: 3D เลือกตำแหน่งติดเซ็นเซอร์ · เส้น warning/alarm
   ปรับได้ · เส้นทำนายแนวโน้ม + กล่องวิเคราะห์
   ───────────────────────────────────────────────────────────── */

const GS = {
  blue: "#005baa", cyan: "#00b6f1", ink: "#231f20",
  lime: "#c7eb02", orange: "#ff9300", paper: "#f4f6f9", line: "#dfe5ec",
};

const ZONE = {
  A: { fill: "#157a52", label: "เครื่องใหม่ · เดินได้ไม่จำกัด" },
  B: { fill: GS.lime, label: "ปกติ · เดินต่อเนื่องได้ไม่จำกัด" },
  C: { fill: GS.orange, label: "เดินได้ชั่วคราว · วางแผนซ่อม" },
  D: { fill: "#d92d20", label: "เสี่ยงเสียหาย · หยุดตรวจ" },
};
const ZONE_TEXT = { A: "#fff", B: GS.ink, C: GS.ink, D: "#fff" };

/* ตำแหน่งวัดมาตรฐานตาม ISO 20816 — DE = ด้านขับ, NDE = ด้านท้าย */
const MOUNTS = [
  { id: "DE-H", name: "DE แนวนอน", desc: "ด้านขับ · จับ imbalance และ misalignment ได้ดีที่สุด", pos: [0.95, 0.32, 0.62] },
  { id: "DE-V", name: "DE แนวตั้ง", desc: "ด้านขับ · จับฐานหลวมและ soft foot", pos: [0.95, 0.78, 0] },
  { id: "DE-A", name: "DE แนวแกน", desc: "ด้านขับ · จับ misalignment แบบเชิงมุม", pos: [1.62, 0.1, 0] },
  { id: "NDE-H", name: "NDE แนวนอน", desc: "ด้านท้าย · เทียบกับ DE เพื่อหาว่าปัญหาอยู่ฝั่งไหน", pos: [-0.95, 0.32, 0.62] },
  { id: "NDE-V", name: "NDE แนวตั้ง", desc: "ด้านท้าย · จับฐานหลวมฝั่งท้าย", pos: [-0.95, 0.78, 0] },
];

const MOTORS = [
  { port: 0, tag: "P-101", name: "ปั๊มจ่ายกรด", temp: 50.1, y: 1.4104, z: 1.3167,
    zone: "B", pre: false, main: false, online: true, runHours: 1284, kw: 22, mount: "DE-H", days: 96 },
  { port: 1, tag: "FAN-202", name: "พัดลมดูดอากาศ", temp: 46.9, y: 1.1203, z: 1.0841,
    zone: "A", pre: false, main: false, online: true, runHours: 3120, kw: 15, mount: "DE-H", days: 210 },
  { port: 2, tag: "CONV-303", name: "มอเตอร์สายพานลำเลียง", temp: 58.4, y: 3.0216, z: 2.8803,
    zone: "C", pre: true, main: false, online: true, runHours: 842, kw: 37, mount: "NDE-H", days: 58 },
  { port: 3, tag: "MIX-404", name: "เครื่องผสมเพสต์", temp: null, y: null, z: null,
    zone: null, pre: false, main: false, online: false, runHours: 2410, kw: 45, mount: "DE-V", days: 0 },
];

const EVENTS = [
  // กันยายน 2569
  { id: 9, mon: "2026-09", day: 11, time: "08:41", motor: "CONV-303", kind: "warning", metric: "Pre-Alarm v-RMS", value: "3.02 mm/s", ack: null },
  { id: 8, mon: "2026-09", day: 11, time: "06:15", motor: "MIX-404", kind: "offline", metric: "พอร์ตหลุด", value: "DISCONNECTED", ack: null },
  { id: 7, mon: "2026-09", day: 9, time: "22:07", motor: "CONV-303", kind: "zone", metric: "โซนเปลี่ยน B → C", value: "2.91 mm/s", ack: "สมชาย" },
  { id: 6, mon: "2026-09", day: 9, time: "14:52", motor: "CONV-303", kind: "warning", metric: "Pre-Alarm v-RMS", value: "2.88 mm/s", ack: "สมชาย" },
  { id: 5, mon: "2026-09", day: 4, time: "03:18", motor: "P-101", kind: "alarm", metric: "Main Alarm v-RMS", value: "4.71 mm/s", ack: "ปรีชา" },
  { id: 4, mon: "2026-09", day: 4, time: "03:02", motor: "P-101", kind: "warning", metric: "Pre-Alarm v-RMS", value: "2.95 mm/s", ack: "ปรีชา" },
  { id: 3, mon: "2026-09", day: 2, time: "11:44", motor: "FAN-202", kind: "warning", metric: "อุณหภูมิสูง", value: "71.2 °C", ack: "สมชาย" },
  // สิงหาคม 2569
  { id: 24, mon: "2026-08", day: 28, time: "19:33", motor: "CONV-303", kind: "alarm", metric: "Main Alarm v-RMS", value: "4.62 mm/s", ack: "ปรีชา" },
  { id: 23, mon: "2026-08", day: 28, time: "19:10", motor: "CONV-303", kind: "warning", metric: "Pre-Alarm v-RMS", value: "3.41 mm/s", ack: "ปรีชา" },
  { id: 22, mon: "2026-08", day: 22, time: "10:05", motor: "CONV-303", kind: "zone", metric: "โซนเปลี่ยน B → C", value: "2.84 mm/s", ack: "สมชาย" },
  { id: 21, mon: "2026-08", day: 17, time: "02:47", motor: "P-101", kind: "warning", metric: "Pre-Alarm v-RMS", value: "2.86 mm/s", ack: "สมชาย" },
  { id: 20, mon: "2026-08", day: 12, time: "23:58", motor: "MIX-404", kind: "offline", metric: "พอร์ตหลุด", value: "DISCONNECTED", ack: "ธนกร" },
  { id: 19, mon: "2026-08", day: 12, time: "16:20", motor: "FAN-202", kind: "warning", metric: "อุณหภูมิสูง", value: "69.8 °C", ack: "สมชาย" },
  { id: 18, mon: "2026-08", day: 5, time: "07:12", motor: "CONV-303", kind: "warning", metric: "Pre-Alarm v-RMS", value: "2.90 mm/s", ack: "ปรีชา" },
  // กรกฎาคม 2569 — เพิ่งติดตั้งระบบวันที่ 25
  { id: 12, mon: "2026-07", day: 30, time: "13:26", motor: "CONV-303", kind: "warning", metric: "Pre-Alarm v-RMS", value: "2.97 mm/s", ack: "สมชาย" },
  { id: 11, mon: "2026-07", day: 27, time: "09:03", motor: "P-101", kind: "zone", metric: "โซนเปลี่ยน A → B", value: "1.52 mm/s", ack: "ธนกร" },
];

const KIND = {
  alarm: { text: "Alarm", fill: "#d92d20", glyph: "▲" },
  warning: { text: "Warning", fill: GS.orange, glyph: "◆" },
  zone: { text: "เปลี่ยนโซน", fill: GS.cyan, glyph: "●" },
  offline: { text: "เซ็นเซอร์หลุด", fill: "#6b7684", glyph: "■" },
};

const CAUSE_CODES = ["bearing", "misalignment", "imbalance", "looseness", "lubrication", "other"];

/* ── เวลา ──────────────────────────────────────────────────── */

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const HOUR = 3600e3, DAY = 24 * HOUR;
const NOW = new Date(2026, 8, 13, 9, 0, 0).getTime(); // 13 ก.ย. 2026 09:00 — ตรึงไว้ให้ต้นแบบนิ่ง

const hh = (d) => String(d.getHours()).padStart(2, "0");
const mm = (d) => String(d.getMinutes()).padStart(2, "0");

/** ช่วงเวลาของปุ่มสำเร็จรูป — 24 ชม. คือ "วันนี้ทั้งวัน" ไม่ใช่ย้อนหลัง 24 ชม. */
function presetWindow(days) {
  const d = new Date(NOW);
  if (days === 1) {
    const from = new Date(d); from.setHours(0, 0, 0, 0);
    const to = new Date(d); to.setHours(23, 59, 59, 999);
    return { from: from.getTime(), to: to.getTime() };
  }
  const from = new Date(NOW - (days - 1) * DAY);
  from.setHours(0, 0, 0, 0);
  return { from: from.getTime(), to: NOW };
}

/** เลือกความถี่และรูปแบบป้ายจากความยาวของช่วง */
function axisPlan(from, to) {
  const span = to - from;
  if (span <= 36 * HOUR) return { step: HOUR, fmt: "hour", note: "แกนนอน: เวลา (นาฬิกา) แบ่งทีละ 1 ชั่วโมง" };
  if (span <= 3 * DAY) return { step: 3 * HOUR, fmt: "dayhour", note: "แกนนอน: วันที่และเวลา แบ่งทีละ 3 ชั่วโมง" };
  if (span <= 16 * DAY) return { step: DAY, fmt: "daymon", note: "แกนนอน: วันที่ แบ่งทีละ 1 วัน" };
  if (span <= 45 * DAY) return { step: 2 * DAY, fmt: "dm", note: "แกนนอน: วันที่/เดือน แบ่งทีละ 2 วัน" };
  return { step: 5 * DAY, fmt: "dm", note: "แกนนอน: วันที่/เดือน แบ่งทีละ 5 วัน" };
}

function tickLabel(ts, fmt) {
  const d = new Date(ts);
  if (fmt === "hour") return hh(d);
  if (fmt === "dayhour") return `${d.getDate()} ${hh(d)}:00`;
  if (fmt === "daymon") return `${d.getDate()} ${TH_MON[d.getMonth()]}`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** ป้ายใน tooltip — เต็มรูปแบบ พ.ศ. */
function fullLabel(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${d.getFullYear() + 543} · ${hh(d)}:${mm(d)} น.`;
}

function axisTicks(from, to, plan) {
  const out = [];
  const s = new Date(from);
  if (plan.step < DAY) { s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); }
  else { s.setHours(0, 0, 0, 0); s.setDate(s.getDate() + 1); }
  for (let t = s.getTime(); t <= to; t += plan.step) out.push(t);
  return out;
}

/* แปลงไปกลับกับ input type="datetime-local" */
const toInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${hh(d)}:${mm(d)}`;
};
const fromInput = (s) => new Date(s).getTime();

const rangeCaption = (from, to) => {
  const a = new Date(from), b = new Date(to);
  const sameDay = a.toDateString() === b.toDateString();
  const dd = (d) => `${d.getDate()} ${TH_MON[d.getMonth()]}`;
  return sameDay
    ? `${dd(a)} ${hh(a)}:${mm(a)}–${hh(b)}:${mm(b)} น.`
    : `${dd(a)} ${hh(a)}:${mm(a)} – ${dd(b)} ${hh(b)}:${mm(b)} น.`;
};

/* ── data + stats ──────────────────────────────────────────── */

function history(motor, from, to) {
  if (!motor.online) return [];
  const end = Math.min(to, NOW);
  if (end <= from) return [];
  const span = end - from;
  const grain = span <= 36 * HOUR ? 30 * 60e3 : span <= 16 * DAY ? 3 * HOUR : 12 * HOUR;
  const n = Math.max(8, Math.min(140, Math.round(span / grain)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rise = motor.zone === "C" ? t * 0.85 : motor.zone === "B" ? t * 0.14 : t * 0.03;
    const wob = Math.sin(i / 3.1) * 0.045 + Math.sin(i / 7.7) * 0.028;
    const ts = Math.round(from + t * span);
    out.push({
      i, ts, full: fullLabel(ts),
      y: +(motor.y - rise + wob).toFixed(3),
      z: +(motor.z - rise * 0.94 + wob * 0.8).toFixed(3),
    });
  }
  return out;
}

/** linear regression บนชุดข้อมูล → slope, intercept, ค่าคลาดเคลื่อนมาตรฐาน */
function fit(points) {
  const n = points.length;
  if (n < 4) return null;
  const mx = points.reduce((s, p) => s + p.i, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  points.forEach((p) => { num += (p.i - mx) * (p.y - my); den += (p.i - mx) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const resid = points.map((p) => p.y - (slope * p.i + intercept));
  const se = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  return { slope, intercept, se, n };
}

/* ── shared ────────────────────────────────────────────────── */

function ZoneBand({ zone, size = "md" }) {
  const h = size === "lg" ? "h-9" : size === "sm" ? "h-5" : "h-7";
  const fs = size === "lg" ? "text-base" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className={`flex w-full overflow-hidden rounded ${h}`} role="img"
      aria-label={zone ? `ระดับความรุนแรง ISO 10816 โซน ${zone}` : "ไม่มีข้อมูล"}>
      {["A", "B", "C", "D"].map((k) => {
        const on = k === zone;
        return (
          <div key={k} className={`flex flex-1 items-center justify-center font-semibold ${fs}`}
            style={{
              background: on ? ZONE[k].fill : "#eef1f5",
              color: on ? ZONE_TEXT[k] : "#a8b1bd",
              borderRight: k === "D" ? "none" : "1px solid #fff",
            }}>{k}</div>
        );
      })}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, full, icon: Icon }) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";
  const st = {
    primary: { background: GS.blue, color: "#fff" },
    ghost: { background: "transparent", color: GS.blue, border: `1px solid ${GS.line}` },
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${base} ${full ? "w-full" : ""}`} style={st}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}

const inputCls = "w-full min-h-11 rounded border px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2";

/* ── toast ─────────────────────────────────────────────────── */

const ToastCtx = React.createContext(() => { });
const useToast = () => React.useContext(ToastCtx);

function ToastHost({ items, onClose }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-white px-4 py-3"
          style={{ borderColor: GS.line, boxShadow: "0 6px 24px rgba(16,32,56,.14)" }}>
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: t.tone === "warn" ? GS.orange : "#157a52" }}>
            <Check size={13} color="#fff" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: GS.ink }}>{t.title}</div>
            {t.detail && <div className="mt-0.5 text-xs" style={{ color: "#6b7684" }}>{t.detail}</div>}
          </div>
          <button onClick={() => onClose(t.id)} aria-label="ปิดการแจ้งเตือน"
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2" style={{ color: "#6e7685" }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: GS.ink }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: "#6e7685" }}>{hint}</span>}
    </label>
  );
}

/* ── 3D motor · เลือกตำแหน่งติดเซ็นเซอร์ ───────────────────── */

function MotorMount3D({ value, onChange, canEdit, offsets, onDrag }) {
  const host = useRef(null);
  const api = useRef({});
  const [hover, setHover] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2f6");

    const cam = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100);
    cam.position.set(3.6, 2.5, 4.4);
    cam.lookAt(0, 0.25, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(4, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x99bbdd, 0.4);
    rim.position.set(-5, 2, -3);
    scene.add(rim);

    const rig = new THREE.Group();
    scene.add(rig);

    const steel = new THREE.MeshLambertMaterial({ color: 0x2f6fb0 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3c4654 });
    const metal = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.75, 32), steel);
    body.rotation.z = Math.PI / 2; body.position.y = 0.42; rig.add(body);

    for (let i = 0; i < 11; i++) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.045, 24), steel);
      fin.rotation.z = Math.PI / 2;
      fin.position.set(-0.8 + i * 0.16, 0.42, 0);
      rig.add(fin);
    }
    [0.92, -0.92].forEach((x) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.2, 28), dark);
      cap.rotation.z = Math.PI / 2; cap.position.set(x, 0.42, 0); rig.add(cap);
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.78, 20), metal);
    shaft.rotation.z = Math.PI / 2; shaft.position.set(1.35, 0.42, 0); rig.add(shaft);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.46), dark);
    tb.position.set(0, 1.08, 0); rig.add(tb);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.1), dark);
    base.position.y = -0.32; rig.add(base);

    /* พื้นผิวล่องหนสำหรับลากจุดให้เกาะติดตัวมอเตอร์ */
    const ghost = new THREE.MeshBasicMaterial({ visible: false });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.95, 28, 1, true), ghost);
    shell.rotation.z = Math.PI / 2; shell.position.y = 0.42;
    shell.userData.kind = "shell"; rig.add(shell);
    const capTargets = [1.02, -1.02].map((x) => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), ghost);
      d.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      d.position.set(x, 0.42, 0);
      d.userData.kind = "cap"; rig.add(d); return d;
    });
    const dragTargets = [shell, ...capTargets];

    const dots = MOUNTS.map((m) => {
      const g = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16),
        new THREE.MeshLambertMaterial({ color: 0xff9300 }));
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 24),
        new THREE.MeshBasicMaterial({ color: 0x005baa, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
      g.add(pin); g.add(halo);
      g.position.set(...m.pos);
      g.userData = { id: m.id, pin, halo };
      rig.add(g);
      return g;
    });

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let spin = false, pinDrag = false, lastX = 0, yaw = 0, moved = 0;

    const cast = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, cam);
    };
    const pickPin = (ev) => {
      cast(ev);
      const hit = ray.intersectObjects(dots.map((d) => d.userData.pin));
      return hit.length ? dots.find((d) => d.userData.pin === hit[0].object) : null;
    };

    const onDown = (e) => {
      const d = pickPin(e);
      if (d && d.userData.id === api.current.value && api.current.canEdit) {
        pinDrag = true; api.current.setDragging?.(true);
      } else { spin = true; lastX = e.clientX; moved = 0; }
    };

    const onMove = (e) => {
      if (pinDrag) {
        cast(e);
        const hits = ray.intersectObjects(dragTargets);
        if (hits.length) {
          const p = rig.worldToLocal(hits[0].point.clone());
          if (hits[0].object.userData.kind === "shell") {
            const dy = p.y - 0.42, r = Math.hypot(dy, p.z) || 1e-6, s = (r + 0.07) / r;
            p.y = 0.42 + dy * s; p.z = p.z * s;
            p.x = Math.max(-1.0, Math.min(1.0, p.x));
          } else {
            p.x += Math.sign(p.x || 1) * 0.07;
          }
          api.current.drag?.(api.current.value, [
            +p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3),
          ]);
        }
        return;
      }
      if (spin) {
        moved += Math.abs(e.clientX - lastX);
        yaw += (e.clientX - lastX) * 0.008;
        lastX = e.clientX;
      } else {
        const d = pickPin(e);
        renderer.domElement.style.cursor = d
          ? (d.userData.id === api.current.value && api.current.canEdit ? "move" : "pointer")
          : "grab";
        api.current.setHover?.(d ? d.userData.id : null);
      }
    };

    const onUp = (e) => {
      if (pinDrag) { pinDrag = false; api.current.setDragging?.(false); }
      else if (spin && moved < 4) {
        const d = pickPin(e);
        if (d) api.current.pick?.(d.userData.id);
      }
      spin = false;
    };

    const cv = renderer.domElement;
    cv.style.cursor = "grab";
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    let raf;
    const tick = () => {
      rig.rotation.y = yaw;
      const sel = api.current.value, hov = api.current.hover, off = api.current.offsets || {};
      dots.forEach((d) => {
        const id = d.userData.id;
        const base = MOUNTS.find((m) => m.id === id).pos;
        const p = off[id] || base;
        d.position.set(p[0], p[1], p[2]);
        d.userData.halo.lookAt(new THREE.Vector3(p[0] * 3, (p[1] - 0.42) * 3 + 0.42, p[2] * 3));
        const on = id === sel;
        d.userData.pin.material.color.set(on ? 0x005baa : id === hov ? 0xffb84d : 0xff9300);
        const target = on ? 0.85 : 0;
        d.userData.halo.material.opacity += (target - d.userData.halo.material.opacity) * 0.2;
        d.scale.setScalar(on ? 1.25 : 1);
      });
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    };
  }, []);

  api.current.value = value;
  api.current.hover = hover;
  api.current.offsets = offsets;
  api.current.canEdit = canEdit;
  api.current.setHover = setHover;
  api.current.setDragging = setDragging;
  api.current.pick = (id) => canEdit && onChange(id);
  api.current.drag = (id, pos) => canEdit && onDrag(id, pos);

  const active = MOUNTS.find((m) => m.id === value);
  const moved = !!offsets[value];

  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
      <div className="mb-1 flex items-center gap-2">
        <Box size={16} style={{ color: GS.blue }} />
        <h2 className="font-semibold" style={{ color: GS.ink }}>ตำแหน่งติดตั้งเซ็นเซอร์</h2>
      </div>
      <p className="mb-3 text-sm" style={{ color: "#6b7684" }}>
        เลือกจุดจากรายการ แล้วลากจุดสีน้ำเงินบนโมเดลเพื่อปรับให้ตรงกับของจริง · ลากที่พื้นว่างเพื่อหมุน
      </p>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="จุดวัด">
          <select className={inputCls} style={{ borderColor: GS.line }} value={value}
            disabled={!canEdit} onChange={(e) => onChange(e.target.value)}>
            {MOUNTS.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
        </Field>
        <div className="flex items-end">
          <p className="text-sm" style={{ color: "#46505e" }}>{active?.desc}</p>
        </div>
      </div>

      <div className="relative">
        <div ref={host} className="h-72 overflow-hidden rounded" style={{ background: "#eef2f6" }} />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded px-2 py-1 text-xs"
          style={{ background: "rgba(255,255,255,.9)", color: dragging ? GS.blue : "#6b7684" }}>
          <Move3d size={13} />
          {dragging ? "กำลังลากจุด…" : canEdit ? "ลากจุดสีน้ำเงินเพื่อปรับตำแหน่ง" : "อ่านอย่างเดียว"}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: GS.line }}>
        <p className="text-sm" style={{ color: "#46505e" }}>
          บันทึกไว้ที่ <strong style={{ color: GS.ink }}>{active?.name}</strong>
          {moved && <span style={{ color: GS.blue }}> · ปรับตำแหน่งเองแล้ว</span>}
        </p>
        {moved && canEdit && (
          <button onClick={() => onDrag(value, null)}
            className="rounded px-2 py-1 text-xs focus:outline-none focus-visible:ring-2"
            style={{ border: `1px solid ${GS.line}`, color: GS.blue }}>
            คืนค่าตำแหน่งมาตรฐาน
          </button>
        )}
      </div>
      <p className="mt-2 text-xs" style={{ color: "#6e7685" }}>
        โมเดล 3D ใช้บันทึกตำแหน่งเท่านั้น ไม่ได้แสดงค่าการสั่น · dropdown ด้านบนใช้คีย์บอร์ดได้ (NFR-09)
      </p>
    </div>
  );
}

/* ── login ─────────────────────────────────────────────────── */

function Login({ onIn }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (!email || !pw) return setErr("กรอกอีเมลและรหัสผ่านให้ครบ");
    setBusy(true); setErr("");
    setTimeout(() => {
      setBusy(false);
      if (pw !== "demo") return setErr("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      onIn();
    }, 500);
  };
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: GS.paper }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded font-bold text-white" style={{ background: GS.blue }}>GS</div>
          <span className="text-lg font-semibold" style={{ color: GS.ink }}>Condition Monitoring</span>
        </div>
        <div className="space-y-4 rounded-lg border bg-white p-6" style={{ borderColor: GS.line }}>
          <Field label="อีเมล">
            <input className={inputCls} style={{ borderColor: GS.line }} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          <Field label="รหัสผ่าน" hint="ตัวอย่างนี้ใช้รหัส demo">
            <input className={inputCls} style={{ borderColor: GS.line }} type="password" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          {err && (
            <div className="flex gap-2 rounded px-3 py-2 text-sm" style={{ background: "#fdeceb", color: "#a4201a" }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />{err}
            </div>
          )}
          <Btn full onClick={submit} disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── dashboard ─────────────────────────────────────────────── */

function PortRail({ onPick }) {
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold" style={{ color: GS.ink }}>IO-Link Master 2 · BNI XG5-508</h2>
          <p className="text-sm" style={{ color: "#6b7684" }}>192.168.50.141 · อ่านค่าทุก 0.5 วินาที</p>
        </div>
        <span className="text-sm" style={{ color: "#6b7684" }}>ใช้งาน 4 จาก 8 พอร์ต</span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {Array.from({ length: 8 }, (_, p) => {
          const m = MOTORS.find((x) => x.port === p);
          if (!m) return (
            <div key={p} className="flex min-w-16 flex-1 flex-col items-center rounded border border-dashed py-3"
              style={{ borderColor: GS.line, color: "#b9c0c9" }}>
              <span className="text-xs">{p}</span><span className="mt-2 text-xs">ว่าง</span>
            </div>
          );
          return (
            <button key={p} onClick={() => onPick(p)}
              className="flex min-w-16 flex-1 flex-col items-center rounded border bg-white py-3 focus:outline-none focus-visible:ring-2"
              style={{ borderColor: GS.line }}
              aria-label={`พอร์ต ${p} ${m.tag} ${m.online ? `โซน ${m.zone}` : "ออฟไลน์"}`}>
              <span className="text-xs" style={{ color: "#6e7685" }}>{p}</span>
              <span className="mt-1 h-8 w-8 rounded-full" style={{ background: m.online ? ZONE[m.zone].fill : "#6b7684" }} />
              <span className="mt-2 text-xs font-semibold" style={{ color: GS.ink }}>{m.tag}</span>
              <span className="text-xs" style={{ color: "#6e7685" }}>{m.online ? m.zone : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MotorCard({ m, onOpen }) {
  if (!m.online) return (
    <button onClick={() => onOpen(m.port)} className="w-full rounded-lg border bg-white p-4 text-left focus:outline-none focus-visible:ring-2" style={{ borderColor: "#c9cfd8" }}>
      <div className="mb-3 flex items-start justify-between">
        <div><div className="font-semibold" style={{ color: GS.ink }}>{m.tag}</div>
          <div className="text-sm" style={{ color: "#6b7684" }}>{m.name}</div></div>
        <WifiOff size={18} style={{ color: "#6b7684" }} />
      </div>
      <div className="rounded px-3 py-4 text-center" style={{ background: "#f1f3f6" }}>
        <div className="text-sm font-medium" style={{ color: "#46505e" }}>ไม่มีข้อมูลเข้ามา</div>
        <div className="mt-1 text-xs" style={{ color: "#6b7684" }}>เซ็นเซอร์หลุดตั้งแต่ 06:15 น.</div>
      </div>
    </button>
  );
  const alert = m.main ? "alarm" : m.pre ? "warning" : null;
  return (
    <button onClick={() => onOpen(m.port)} className="w-full rounded-lg border bg-white p-4 text-left focus:outline-none focus-visible:ring-2"
      style={{ borderColor: alert ? KIND[alert].fill : GS.line, borderWidth: alert ? 2 : 1 }}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><div className="font-semibold" style={{ color: GS.ink }}>{m.tag}</div>
          <div className="text-sm" style={{ color: "#6b7684" }}>{m.name}</div></div>
        {alert && <span className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-white" style={{ background: KIND[alert].fill }}>
          {KIND[alert].glyph} {KIND[alert].text}</span>}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        {[["v-RMS Y", m.y.toFixed(2), "mm/s"], ["v-RMS Z", m.z.toFixed(2), "mm/s"], ["อุณหภูมิ", m.temp.toFixed(1), "°C"]].map(([k, v, u]) => (
          <div key={k}>
            <div className="text-xs" style={{ color: "#6e7685" }}>{k}</div>
            <div className="text-xl font-semibold tabular-nums" style={{ color: GS.ink }}>{v}</div>
            <div className="text-xs" style={{ color: "#6e7685" }}>{u}</div>
          </div>
        ))}
      </div>
      <ZoneBand zone={m.zone} size="sm" />
      <div className="mt-2 text-xs" style={{ color: "#6b7684" }}>{ZONE[m.zone].label}</div>
    </button>
  );
}

/* ── motor detail ──────────────────────────────────────────── */

function MotorDetail({ port, role, onBack }) {
  const m = MOTORS.find((x) => x.port === port);
  const [range, setRange] = useState(7);                       // 1 | 7 | 30 | "custom"
  const [custom, setCustom] = useState(() => presetWindow(7));
  const [pickOpen, setPickOpen] = useState(false);
  const [draft, setDraft] = useState(() => presetWindow(7));
  const [pickErr, setPickErr] = useState("");
  const [state, setState] = useState("ok");
  const [warn, setWarn] = useState(2.8);
  const [alarm, setAlarm] = useState(4.5);
  const [showFc, setShowFc] = useState(true);
  const [mount, setMount] = useState(m.mount);
  const [offsets, setOffsets] = useState({});
  const [saved, setSaved] = useState({ mount: m.mount, offsets: {}, warn: 2.8, alarm: 4.5 });
  const canEdit = role === "maintenance" || role === "admin";
  const toast = useToast();

  useEffect(() => {
    setMount(m.mount); setOffsets({}); setWarn(2.8); setAlarm(4.5);
    setSaved({ mount: m.mount, offsets: {}, warn: 2.8, alarm: 4.5 });
  }, [m]);

  const changes = useMemo(() => {
    const out = [];
    if (mount !== saved.mount) {
      out.push(`จุดวัด → ${MOUNTS.find((x) => x.id === mount)?.name}`);
    }
    if (JSON.stringify(offsets) !== JSON.stringify(saved.offsets)) {
      out.push("ตำแหน่งบนโมเดล 3D");
    }
    if (warn !== saved.warn) out.push(`เส้น Warning → ${warn} mm/s`);
    if (alarm !== saved.alarm) out.push(`เส้น Alarm → ${alarm} mm/s`);
    return out;
  }, [mount, offsets, warn, alarm, saved]);

  const dirty = changes.length > 0;

  const onDragPin = (id, pos) => {
    setOffsets((o) => {
      const next = { ...o };
      if (pos === null) delete next[id]; else next[id] = pos;
      return next;
    });
  };

  const doSave = () => {
    setSaved({ mount, offsets: { ...offsets }, warn, alarm });
    toast({
      title: "บันทึกสำเร็จ",
      detail: `${m.tag} · ${changes.length} รายการ — ${changes.join(" · ")}`,
    });
  };

  const doRevert = () => {
    setMount(saved.mount); setOffsets({ ...saved.offsets });
    setWarn(saved.warn); setAlarm(saved.alarm);
  };
  useEffect(() => {
    if (state !== "loading") return;
    const t = setTimeout(() => setState("ok"), 800);
    return () => clearTimeout(t);
  }, [state]);

  const win = useMemo(() => (range === "custom" ? custom : presetWindow(range)), [range, custom]);
  const hist = useMemo(() => (state === "empty" ? [] : history(m, win.from, win.to)), [m, win, state]);
  const model = useMemo(() => fit(hist), [hist]);
  const spanDays = (win.to - win.from) / DAY;

  const chart = useMemo(() => {
    if (!hist.length) return [];
    const rows = hist.map((p, idx) => ({
      ...p,
      fc: idx === hist.length - 1 ? p.y : null,
      band: idx === hist.length - 1 ? [p.y, p.y] : null,
    }));
    if (!model || !showFc) return rows;
    const lastTs = hist[hist.length - 1].ts;
    // ถ้าช่วงที่เลือกยังไม่จบ ให้ทำนายไปจนสุดช่วง · ถ้าจบแล้วให้ต่อออกไป 40%
    const fcEnd = win.to > lastTs ? win.to : lastTs + (win.to - win.from) * 0.4;
    const steps = Math.max(4, Math.round(hist.length * 0.4));
    const stepMs = (fcEnd - lastTs) / steps;
    for (let k = 1; k <= steps; k++) {
      const i = hist.length - 1 + k;
      const v = model.slope * i + model.intercept;
      const spread = model.se * 1.96 * (1 + k / steps);
      const ts = Math.round(lastTs + k * stepMs);
      rows.push({
        i, ts, full: `${fullLabel(ts)} (ทำนาย)`,
        y: null, z: null,
        fc: +v.toFixed(3),
        band: [+(v - spread).toFixed(3), +(v + spread).toFixed(3)],
      });
    }
    return rows;
  }, [hist, model, showFc, win]);

  const xDomain = chart.length
    ? [win.from, Math.max(win.to, chart[chart.length - 1].ts)]
    : [win.from, win.to];
  const plan = axisPlan(xDomain[0], xDomain[1]);
  const xTicks = axisTicks(xDomain[0], xDomain[1], plan);

  // วันคงเหลือก่อนแตะเกณฑ์ ตามอัตราปัจจุบัน
  const eta = useMemo(() => {
    if (!model || model.slope <= 0 || hist.length < 2) return null;
    const last = hist[hist.length - 1];
    const perPoint = ((Math.min(win.to, NOW) - win.from) / DAY) / (hist.length - 1);
    const toWarn = (warn - last.y) / model.slope * perPoint;
    const toAlarm = (alarm - last.y) / model.slope * perPoint;
    return {
      warn: toWarn > 0 ? Math.round(toWarn) : 0,
      alarm: toAlarm > 0 ? Math.round(toAlarm) : 0,
      perDay: model.slope / perPoint,
    };
  }, [model, hist, warn, alarm, win]);

  const yMax = Math.max(alarm * 1.15, ...(hist.length ? hist.map((p) => p.y) : [1]));

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm focus:outline-none focus-visible:ring-2" style={{ color: GS.blue }}>
        <ChevronLeft size={16} /> กลับหน้ารวม
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: GS.ink }}>{m.tag}</h1>
          <p className="text-sm" style={{ color: "#6b7684" }}>{m.name} · {m.kw} kW · master2 / port{m.port}</p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* ชั่วโมงเดินเครื่อง — ชิปเล็ก ไม่กินการ์ดทั้งใบ */}
          <div className="flex items-center gap-2 rounded border bg-white px-3 py-2" style={{ borderColor: GS.line }}>
            <div>
              <div className="text-xs leading-none" style={{ color: "#6e7685" }}>ชั่วโมงเดินเครื่อง</div>
              <div className="text-lg font-semibold leading-tight tabular-nums" style={{ color: GS.blue }}>
                {m.runHours.toLocaleString()}
                <span className="ml-1 text-xs font-normal" style={{ color: "#6e7685" }}>ชม.</span>
              </div>
            </div>
            <button disabled={!canEdit} title={canEdit ? "รีเซ็ตหลังซ่อม" : "role manager แก้ไม่ได้"}
              aria-label="รีเซ็ตชั่วโมงเดินเครื่องหลังซ่อม"
              className="rounded p-1.5 focus:outline-none focus-visible:ring-2 disabled:opacity-35"
              style={{ border: `1px solid ${GS.line}`, color: GS.blue }}>
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="w-full sm:w-64">
            <ZoneBand zone={m.zone} size="lg" />
            <div className="mt-1 text-xs" style={{ color: "#6b7684" }}>{m.zone ? ZONE[m.zone].label : "ไม่มีข้อมูล"}</div>
          </div>
        </div>
      </div>

      {/* 3D mount — อยู่เหนือกราฟ เพราะตำแหน่งติดตั้งเป็นบริบทของตัวเลขที่จะอ่านต่อ */}
      <MotorMount3D value={mount} onChange={setMount} canEdit={canEdit}
        offsets={offsets} onDrag={onDragPin} />

      {/* chart */}
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold" style={{ color: GS.ink }}>แนวโน้มการสั่นสะเทือน</h2>
            <p className="text-xs" style={{ color: "#6b7684" }}>{rangeCaption(win.from, win.to)}</p>
          </div>

          <div className="relative flex flex-wrap gap-1">
            {[1, 7, 30].map((d) => (
              <button key={d} onClick={() => { setRange(d); setPickOpen(false); setState("loading"); }}
                className="min-h-11 rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                style={{
                  background: range === d ? GS.blue : "transparent",
                  color: range === d ? "#fff" : GS.ink,
                  border: `1px solid ${range === d ? GS.blue : GS.line}`,
                }}>{d === 1 ? "วันนี้" : `${d} วัน`}</button>
            ))}

            <button onClick={() => {
              setDraft(range === "custom" ? custom : presetWindow(range));
              setPickErr(""); setPickOpen((v) => !v);
            }}
              aria-expanded={pickOpen}
              className="flex min-h-11 items-center gap-1.5 rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{
                background: range === "custom" ? GS.blue : "transparent",
                color: range === "custom" ? "#fff" : GS.ink,
                border: `1px solid ${range === "custom" ? GS.blue : GS.line}`,
              }}>
              <CalendarDays size={14} /> กำหนดเอง
            </button>

            {pickOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border bg-white p-4"
                  style={{ borderColor: GS.line, boxShadow: "0 10px 32px rgba(16,32,56,.16)" }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium" style={{ color: GS.ink }}>เลือกช่วงเวลา</span>
                    <button onClick={() => setPickOpen(false)} aria-label="ปิด"
                      className="rounded p-0.5 focus:outline-none focus-visible:ring-2" style={{ color: "#6e7685" }}>
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <Field label="ตั้งแต่">
                      <input type="datetime-local" className={inputCls} style={{ borderColor: GS.line }}
                        value={toInput(draft.from)}
                        onChange={(e) => { setDraft((d) => ({ ...d, from: fromInput(e.target.value) })); setPickErr(""); }} />
                    </Field>
                    <Field label="ถึง">
                      <input type="datetime-local" className={inputCls} style={{ borderColor: GS.line }}
                        value={toInput(draft.to)}
                        onChange={(e) => { setDraft((d) => ({ ...d, to: fromInput(e.target.value) })); setPickErr(""); }} />
                    </Field>

                    <div className="flex flex-wrap gap-1">
                      {[["สัปดาห์นี้", 7], ["เดือนนี้", 30], ["3 เดือน", 90]].map(([lb, dd]) => (
                        <button key={lb} onClick={() => setDraft(presetWindow(dd))}
                          className="rounded px-2 py-1 text-xs focus:outline-none focus-visible:ring-2"
                          style={{ border: `1px solid ${GS.line}`, color: GS.blue }}>{lb}</button>
                      ))}
                    </div>

                    {pickErr && (
                      <div className="flex gap-2 rounded px-3 py-2 text-xs" style={{ background: "#fdeceb", color: "#a4201a" }}>
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />{pickErr}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" onClick={() => setPickOpen(false)}>ยกเลิก</Btn>
                      <Btn onClick={() => {
                        if (!draft.from || !draft.to || Number.isNaN(draft.from) || Number.isNaN(draft.to))
                          return setPickErr("กรอกวันและเวลาให้ครบ");
                        if (draft.to <= draft.from) return setPickErr("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
                        if (draft.to - draft.from < HOUR) return setPickErr("ช่วงเวลาต้องยาวอย่างน้อย 1 ชั่วโมง");
                        setCustom(draft); setRange("custom"); setPickOpen(false); setState("loading");
                      }}>ใช้ช่วงนี้</Btn>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {state === "loading" && <div className="flex h-72 items-center justify-center text-sm" style={{ color: "#6b7684" }}>กำลังโหลดข้อมูล…</div>}
        {state === "error" && (
          <div className="flex h-72 flex-col items-center justify-center gap-3">
            <AlertTriangle size={28} style={{ color: GS.orange }} />
            <p className="text-sm" style={{ color: GS.ink }}>โหลดข้อมูลไม่สำเร็จ</p>
            <Btn variant="ghost" onClick={() => setState("loading")}>ลองใหม่</Btn>
          </div>
        )}
        {state === "empty" && (
          <div className="flex h-72 flex-col items-center justify-center gap-2">
            <p className="text-sm font-medium" style={{ color: GS.ink }}>ยังไม่มีข้อมูลในช่วงเวลานี้</p>
            <p className="text-sm" style={{ color: "#6b7684" }}>มอเตอร์นี้เพิ่งลงทะเบียน ข้อมูลจะเริ่มแสดงภายในหนึ่งนาที</p>
          </div>
        )}

        {state === "ok" && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                {/* กรอบสีบอกช่วง */}
                <ReferenceArea y1={0} y2={warn} fill="#157a52" fillOpacity={0.09} />
                <ReferenceArea y1={warn} y2={alarm} fill={GS.orange} fillOpacity={0.11} />
                <ReferenceArea y1={alarm} y2={yMax} fill="#d92d20" fillOpacity={0.1} />
                <CartesianGrid stroke={GS.line} vertical={false} />
                <XAxis dataKey="ts" type="number" scale="time" domain={xDomain} ticks={xTicks}
                  tickFormatter={(v) => tickLabel(v, plan.fmt)}
                  tick={{ fontSize: plan.fmt === "hour" ? 10 : 11, fill: "#6e7685" }}
                  tickMargin={6} />
                <YAxis domain={[0, +yMax.toFixed(1)]} tick={{ fontSize: 11, fill: "#6e7685" }} unit=" mm/s" width={70} />
                <Tooltip labelFormatter={(v, p) => p?.[0]?.payload?.full ?? fullLabel(v)} />
                <Legend />
                {showFc && <ReferenceLine x={NOW} stroke="#6e7685" strokeDasharray="3 3"
                  label={{ value: "วันนี้", position: "top", fill: "#6e7685", fontSize: 11 }} />}
                {showFc && <Area type="monotone" dataKey="band" name="ช่วงความเชื่อมั่น 95%"
                  stroke="none" fill={GS.blue} fillOpacity={0.13} connectNulls />}
                <Line type="monotone" dataKey="y" name="v-RMS Y" stroke={GS.blue} dot={false} strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="z" name="v-RMS Z" stroke={GS.cyan} dot={false} strokeWidth={2} connectNulls={false} />
                {showFc && <Line type="monotone" dataKey="fc" name="เส้นทำนาย" stroke={GS.blue}
                  strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls />}
                <ReferenceLine y={warn} stroke={GS.orange} strokeWidth={2}
                  label={{ value: `Warning ${warn}`, position: "insideTopRight", fill: GS.orange, fontSize: 11 }} />
                <ReferenceLine y={alarm} stroke="#d92d20" strokeWidth={2}
                  label={{ value: `Alarm ${alarm}`, position: "insideTopRight", fill: "#d92d20", fontSize: 11 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ตัวควบคุมเส้นเกณฑ์ */}
        <div className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-3" style={{ borderColor: GS.line }}>
          <Field label="เส้น Warning (mm/s)">
            <input type="number" step="0.1" min="0" max={alarm} value={warn} disabled={!canEdit}
              onChange={(e) => setWarn(Math.min(+e.target.value || 0, alarm))}
              className={inputCls} style={{ borderColor: GS.line }} />
          </Field>
          <Field label="เส้น Alarm (mm/s)">
            <input type="number" step="0.1" min={warn} value={alarm} disabled={!canEdit}
              onChange={(e) => setAlarm(Math.max(+e.target.value || 0, warn))}
              className={inputCls} style={{ borderColor: GS.line }} />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm" style={{ color: GS.ink }}>
              <input type="checkbox" checked={showFc} onChange={(e) => setShowFc(e.target.checked)} />
              แสดงเส้นทำนาย
            </label>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs" style={{ color: "#6e7685" }}>สถานะหน้าจอ:</span>
              {["ok", "loading", "empty", "error"].map((s) => (
                <button key={s} onClick={() => setState(s)}
                  className="rounded px-2 py-0.5 text-xs focus:outline-none focus-visible:ring-2"
                  style={{ border: `1px solid ${state === s ? GS.blue : GS.line}`, color: state === s ? GS.blue : "#6b7684" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs" style={{ color: "#6e7685" }}>
          {plan.note} · ค่าเริ่มต้น 2.8 / 4.5 คือขอบโซน B→C และ C→D ตาม ISO 10816-3 กลุ่ม 2 ยึดแบบแข็ง ·
          ตัวเลขจริงต้องยืนยันกับคลาสของมอเตอร์แต่ละตัว
        </p>
      </div>

      {/* วิเคราะห์ + เทียบแกน */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnalysisBox motor={m} model={model} eta={eta} range={Math.round(spanDays)} warn={warn} alarm={alarm}
            hasData={state === "ok" && hist.length > 0} />
        </div>

        <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
          <h2 className="mb-1 font-semibold" style={{ color: GS.ink }}>เทียบสองแกน</h2>
          <p className="mb-3 text-sm" style={{ color: "#6b7684" }}>สัดส่วนระหว่างแกนบอกทิศทางปัญหาคร่าว ๆ</p>
          {m.online ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ axis: "แกน Y", v: m.y }, { axis: "แกน Z", v: m.z }]} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={GS.line} vertical={false} />
                    <XAxis dataKey="axis" tick={{ fontSize: 12, fill: "#6e7685" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6e7685" }} />
                    <Tooltip />
                    <Bar dataKey="v" name="mm/s" fill={GS.blue} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs" style={{ color: "#6e7685" }}>
                Y:Z = {(m.y / m.z).toFixed(2)} · ค่า RMS ไม่มี phase จึงไม่ใช่ orbit plot
              </p>
            </>
          ) : <div className="flex h-40 items-center justify-center text-sm" style={{ color: "#6b7684" }}>ไม่มีข้อมูล</div>}
        </div>
      </div>

      {/* แถบบันทึก — โผล่เฉพาะตอนมีของค้างยังไม่บันทึก */}
      {dirty && (
        <div className="sticky bottom-3 z-40">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3"
            style={{ borderColor: GS.blue, boxShadow: "0 6px 24px rgba(16,32,56,.14)" }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GS.orange }} />
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: GS.ink }}>
                มี {changes.length} รายการที่ยังไม่ได้บันทึก
              </div>
              <div className="text-xs" style={{ color: "#6b7684" }}>{changes.join(" · ")}</div>
            </div>
            <Btn variant="ghost" onClick={doRevert}>ยกเลิก</Btn>
            <Btn icon={Save} onClick={doSave} disabled={!canEdit}>บันทึก</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisBox({ motor, model, eta, range, warn, alarm, hasData }) {
  const months = Math.round(motor.days / 30);
  const ready = motor.days >= 90;

  let verdict, tone;
  if (!hasData || !model) { verdict = "ยังไม่มีข้อมูลพอจะวิเคราะห์"; tone = "#6b7684"; }
  else if (!eta || model.slope <= 0) { verdict = "ค่าทรงตัวหรือลดลง ไม่พบแนวโน้มขาขึ้น"; tone = "#157a52"; }
  else if (eta.warn === 0) { verdict = `เกินเส้น Warning แล้ว · จะแตะ Alarm ในราว ${eta.alarm} วัน`; tone = "#d92d20"; }
  else if (eta.warn < 30) { verdict = `จะแตะเส้น Warning ในราว ${eta.warn} วัน`; tone = GS.orange; }
  else { verdict = `จะแตะเส้น Warning ในราว ${eta.warn} วัน`; tone = "#157a52"; }

  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={16} style={{ color: GS.blue }} />
        <h2 className="font-semibold" style={{ color: GS.ink }}>การวิเคราะห์แนวโน้ม</h2>
        <span className="rounded px-2 py-0.5 text-xs" style={{ background: "#f1f3f6", color: "#46505e" }}>
          สถิติ · ยังไม่ใช่ ML
        </span>
      </div>

      <p className="mb-3 text-lg font-semibold" style={{ color: tone }}>{verdict}</p>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["อัตราเปลี่ยนแปลง", model && eta ? `${(eta.perDay >= 0 ? "+" : "") + eta.perDay.toFixed(3)}` : "—", "mm/s ต่อวัน"],
          ["ถึงเส้น Warning", eta ? (eta.warn === 0 ? "เกินแล้ว" : eta.warn) : "—", eta && eta.warn ? "วัน" : ""],
          ["ถึงเส้น Alarm", eta ? (eta.alarm === 0 ? "เกินแล้ว" : eta.alarm) : "—", eta && eta.alarm ? "วัน" : ""],
          ["ข้อมูลสะสม", months, "เดือน"],
        ].map(([k, v, u]) => (
          <div key={k} className="rounded p-3" style={{ background: GS.paper }}>
            <div className="text-xs" style={{ color: "#6e7685" }}>{k}</div>
            <div className="text-xl font-semibold tabular-nums" style={{ color: GS.ink }}>{v}</div>
            <div className="text-xs" style={{ color: "#6e7685" }}>{u}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded p-3" style={{ background: "#eaf3fb" }}>
        <Info size={16} className="mt-0.5 shrink-0" style={{ color: GS.blue }} />
        <div className="text-sm leading-relaxed" style={{ color: "#31414f" }}>
          {model && eta && model.slope > 0 ? (
            <>เส้นประคือการต่อแนวโน้มเชิงเส้นจากข้อมูลช่วงที่เลือก แถบรอบเส้นคือช่วงความเชื่อมั่น 95%
              ซึ่งกว้างขึ้นเมื่อทำนายไกลออกไป ตัวเลขวันเป็นค่าประมาณที่ตั้งอยู่บนสมมติฐานว่าอัตราปัจจุบันคงที่ —
              ถ้าโหลดหรืออุณหภูมิแวดล้อมเปลี่ยน ตัวเลขนี้จะเปลี่ยนตาม</>
          ) : (
            <>ยังไม่พบแนวโน้มขาขึ้นในช่วงที่เลือก การทำนายจะแสดงเมื่อข้อมูลมีทิศทางชัดเจนพอ</>
          )}
        </div>
      </div>

      <div className="mt-3 border-t pt-3" style={{ borderColor: GS.line }}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium" style={{ color: GS.ink }}>ความพร้อมสำหรับโมเดลทำนาย</span>
          <span className="text-sm" style={{ color: ready ? "#157a52" : GS.orange }}>
            {months} จาก 12 เดือน
          </span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded" style={{ background: "#eef1f5" }}>
          <div className="h-full rounded" style={{ width: `${Math.min(100, (months / 12) * 100)}%`, background: ready ? "#157a52" : GS.orange }} />
        </div>
        <ul className="space-y-1 text-sm" style={{ color: "#46505e" }}>
          <li>{months >= 1 ? "✓" : "○"} 1 เดือน — เห็นรูปแบบรายวันและรอบกะ</li>
          <li>{months >= 3 ? "✓" : "○"} 3 เดือน — เส้นทำนายเชื่อถือได้ (ที่แสดงอยู่ตอนนี้)</li>
          <li>{months >= 6 ? "✓" : "○"} 6 เดือน — จับความผิดปกติได้โดยไม่ต้องมีเคสที่พัง</li>
          <li>{months >= 12 ? "✓" : "○"} 12 เดือน — ปรับตามอุณหภูมิแวดล้อมรายฤดู</li>
          <li>○ ต้องมีเคสที่พังพร้อม cause code ≥ 10 เคส จึงเริ่ม supervised ได้</li>
        </ul>
        <p className="mt-2 text-xs" style={{ color: "#6e7685" }}>
          ที่ 4 มอเตอร์ เคสที่พังจะสะสมช้ามาก — การจำแนกสาเหตุอัตโนมัติต้องขยายจำนวนมอเตอร์ ไม่ใช่รอเวลา
        </p>
      </div>
    </div>
  );
}

/* ── history / maintenance / admin (เหมือน v1) ─────────────── */

function History({ events, onAck, role }) {
  const [monKey, setMonKey] = useState(MONTHS[0].key);
  const month = MONTHS.find((x) => x.key === monKey);
  const canAck = role === "maintenance" || role === "admin";

  const byDay = useMemo(() => {
    const map = {};
    events.filter((e) => e.mon === monKey).forEach((e) => { (map[e.day] ||= []).push(e); });
    return map;
  }, [monKey, events]);

  const daysWithEvents = useMemo(() => Object.keys(byDay).map(Number).sort((a, b) => a - b), [byDay]);
  const [pick, setPick] = useState(null);

  // เลือกวันล่าสุดที่มีเหตุการณ์ให้อัตโนมัติเมื่อเปลี่ยนเดือน
  useEffect(() => {
    setPick(daysWithEvents.length ? daysWithEvents[daysWithEvents.length - 1] : null);
  }, [monKey]);

  const worst = (evs) => evs.some((e) => e.kind === "alarm") ? "alarm"
    : evs.some((e) => e.kind === "warning") ? "warning"
      : evs.some((e) => e.kind === "offline") ? "offline" : "zone";

  const dow = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
  const [y, mIdx] = monKey.split("-").map(Number);
  const lead = (new Date(y, mIdx - 1, 1).getDay() + 6) % 7;   // สัปดาห์เริ่มวันจันทร์
  const monthEvents = events.filter((e) => e.mon === monKey);
  const total = monthEvents.length;
  const unacked = monthEvents.filter((e) => !e.ack).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: GS.ink }}>ประวัติแจ้งเตือน</h1>
          <p className="text-sm" style={{ color: "#6b7684" }}>
            {total > 0
              ? <>{month.label} มี {total} เหตุการณ์
                {unacked > 0
                  ? <span style={{ color: GS.orange }}> · ยังไม่รับทราบ {unacked} รายการ</span>
                  : <span style={{ color: "#157a52" }}> · รับทราบครบแล้ว</span>}
              </>
              : `${month.label} ไม่มีเหตุการณ์`}
          </p>
        </div>
        <Field label="เดือน">
          <select className={inputCls} style={{ borderColor: GS.line, minWidth: 170 }}
            value={monKey} onChange={(e) => setMonKey(e.target.value)}>
            {MONTHS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border bg-white p-4 lg:col-span-3" style={{ borderColor: GS.line }}>
          <h2 className="mb-4 font-semibold" style={{ color: GS.ink }}>{month.label}</h2>
          <div className="grid grid-cols-7 gap-1">
            {dow.map((d) => <div key={d} className="pb-1 text-center text-xs" style={{ color: "#6e7685" }}>{d}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={`lead${i}`} />)}
            {Array.from({ length: month.days }, (_, i) => {
              const day = i + 1, evs = byDay[day], on = pick === day, k = evs && worst(evs);
              return (
                <button key={day} onClick={() => evs && setPick(day)} disabled={!evs}
                  aria-label={evs ? `${day} ${month.label} มี ${evs.length} เหตุการณ์` : `${day} ${month.label} ไม่มีเหตุการณ์`}
                  className="flex aspect-square flex-col items-center justify-center rounded text-sm focus:outline-none focus-visible:ring-2 disabled:cursor-default"
                  style={{
                    border: `1px solid ${on ? GS.blue : GS.line}`, borderWidth: on ? 2 : 1,
                    background: evs ? "#fff" : GS.paper, color: evs ? GS.ink : "#b9c0c9",
                  }}>
                  <span className={evs ? "font-semibold" : ""}>{day}</span>
                  {evs && <span className="text-xs leading-none" style={{ color: KIND[k].fill }}>{KIND[k].glyph}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-xs" style={{ borderColor: GS.line }}>
            {Object.entries(KIND).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1" style={{ color: "#6b7684" }}>
                <span style={{ color: v.fill }}>{v.glyph}</span> {v.text}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 lg:col-span-2" style={{ borderColor: GS.line }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: GS.ink }}>
              {pick ? `${pick} ${month.label.split(" ")[0]}` : "เลือกวัน"}
            </h2>
            <Btn variant="ghost" icon={Download} disabled={!pick}>CSV</Btn>
          </div>

          {!pick ? (
            <div className="py-12 text-center text-sm" style={{ color: "#6b7684" }}>
              {total === 0 ? "เดือนนี้ไม่มีเหตุการณ์แจ้งเตือน" : "คลิกวันที่มีเครื่องหมายในปฏิทิน"}
            </div>
          ) : (
            <ul className="space-y-2">
              {(byDay[pick] || []).map((e) => (
                <li key={e.id} className="rounded border p-3" style={{ borderColor: GS.line }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium" style={{ color: GS.ink }}>{e.motor}</div>
                      <div className="text-sm" style={{ color: "#6b7684" }}>{e.metric} · {e.value}</div>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums" style={{ color: "#6e7685" }}>{e.time}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: KIND[e.kind].fill }}>
                      {KIND[e.kind].glyph} {KIND[e.kind].text}
                    </span>
                    {e.ack
                      ? <span className="flex items-center gap-1 text-xs" style={{ color: "#157a52" }}>
                        <Check size={13} /> รับทราบโดย {e.ack}
                      </span>
                      : canAck
                        ? <Btn variant="ghost" icon={Check} onClick={() => onAck(e)}>รับทราบ</Btn>
                        : <span className="flex items-center gap-1 text-xs" style={{ color: "#6e7685" }}>
                          <Lock size={12} /> role manager กดไม่ได้
                        </span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MaintenanceLog() {
  const [cause, setCause] = useState("");
  const [err, setErr] = useState("");
  const toast = useToast();
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="rounded-lg border bg-white p-5 lg:col-span-3" style={{ borderColor: GS.line }}>
        <h2 className="mb-1 font-semibold" style={{ color: GS.ink }}>บันทึกงานซ่อมบำรุง</h2>
        <p className="mb-4 text-sm" style={{ color: "#6b7684" }}>ทุกครั้งที่เข้าซ่อม ต้องระบุสาเหตุ</p>
        <div className="space-y-4">
          <Field label="มอเตอร์">
            <select className={inputCls} style={{ borderColor: GS.line }}>
              {MOTORS.map((m) => <option key={m.port}>{m.tag} — {m.name}</option>)}
            </select>
          </Field>
          <Field label="สาเหตุ" hint="ไม่เลือกจะบันทึกไม่ได้ — AC-014-02">
            <div className="flex flex-wrap gap-2">
              {CAUSE_CODES.map((c) => (
                <button key={c} onClick={() => { setCause(c); setErr(""); }}
                  className="min-h-11 rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                  style={{
                    border: `1px solid ${cause === c ? GS.blue : GS.line}`,
                    background: cause === c ? GS.blue : "#fff", color: cause === c ? "#fff" : GS.ink,
                  }}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="รายละเอียดงาน"><textarea rows={3} className={inputCls} style={{ borderColor: GS.line }} /></Field>
          {err && <div className="flex gap-2 rounded px-3 py-2 text-sm" style={{ background: "#fdeceb", color: "#a4201a" }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{err}</div>}
          <Btn icon={Save} onClick={() => {
            if (!cause) return setErr("เลือกสาเหตุก่อนบันทึก");
            setErr("");
            toast({ title: "บันทึกงานซ่อมสำเร็จ", detail: `สาเหตุ: ${cause} · เพิ่มเข้าชุดข้อมูลสำหรับโมเดลในอนาคตแล้ว` });
          }}>บันทึกงานซ่อม</Btn>
        </div>
      </div>
      <div className="rounded-lg border bg-white p-5 lg:col-span-2" style={{ borderColor: GS.line }}>
        <h2 className="mb-2 font-semibold" style={{ color: GS.ink }}>ทำไมต้องกรอกสาเหตุ</h2>
        <p className="text-sm leading-relaxed" style={{ color: "#46505e" }}>
          เส้นทำนายในหน้ามอเตอร์ใช้สถิติ ทำนายได้แค่ว่าค่าจะขึ้นไปถึงไหน แต่บอกไม่ได้ว่าเพราะอะไร
        </p>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#46505e" }}>
          ช่องสาเหตุนี้คือสิ่งเดียวที่จะทำให้ระบบบอกได้ในอนาคตว่า "แนวโน้มแบบนี้ที่ผ่านมาคือแบริ่ง"
          ย้อนกลับไปสร้างทีหลังไม่ได้
        </p>
      </div>
    </div>
  );
}

function Admin({ role }) {
  if (role !== "admin") return (
    <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: GS.line }}>
      <Lock size={24} className="mx-auto mb-3" style={{ color: "#6e7685" }} />
      <p className="font-medium" style={{ color: GS.ink }}>หน้านี้เปิดให้เฉพาะ admin</p>
      <p className="mt-1 text-sm" style={{ color: "#6b7684" }}>role ปัจจุบันคือ {role} · API จะตอบ 403</p>
    </div>
  );
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: GS.line }}>
      <h2 className="mb-3 font-semibold" style={{ color: GS.ink }}>มอเตอร์และการผูกพอร์ต</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ color: "#6e7685" }}>
            {["พอร์ต", "รหัส", "ชื่อ", "kW", "จุดติดตั้ง", "สถานะ"].map((h) => (
              <th key={h} className="border-b py-2 text-left font-medium" style={{ borderColor: GS.line }}>{h}</th>))}
          </tr></thead>
          <tbody>
            {MOTORS.map((m) => (
              <tr key={m.port}>
                <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>master2 / {m.port}</td>
                <td className="border-b py-2 font-medium" style={{ borderColor: GS.line, color: GS.ink }}>{m.tag}</td>
                <td className="border-b py-2" style={{ borderColor: GS.line, color: "#46505e" }}>{m.name}</td>
                <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: "#46505e" }}>{m.kw}</td>
                <td className="border-b py-2" style={{ borderColor: GS.line, color: "#46505e" }}>{m.mount}</td>
                <td className="border-b py-2" style={{ borderColor: GS.line, color: m.online ? "#157a52" : "#6b7684" }}>
                  {m.online ? "เชื่อมต่อ" : "หลุด"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** tooltip ของกราฟรายเดือน — แสดงเฉพาะเส้นที่มองเห็นอยู่ */
function MonthTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: GS.line, boxShadow: "0 4px 16px rgba(16,32,56,.12)" }}>
      <div className="mb-1.5 text-xs font-medium" style={{ color: GS.ink }}>วันที่ {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <svg width="16" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="16" y2="4" stroke={p.stroke} strokeWidth="2"
              strokeDasharray={String(p.dataKey).startsWith("pv_") ? "4 3" : undefined} />
          </svg>
          <span style={{ color: "#46505e" }}>{p.name}</span>
          <span className="ml-3 tabular-nums font-semibold" style={{ color: GS.ink }}>
            {Number(p.value).toFixed(2)} <span className="font-normal" style={{ color: "#6e7685" }}>mm/s</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** legend ที่แสดงลักษณะเส้นจริง และคลิกเพื่อโฟกัสเส้นเดียว */
function ChartLegend({ items, focus, onPick }) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {items.map((it) => {
        const dim = focus && focus !== it.key;
        const on = focus === it.key;
        return (
          <button key={it.key} onClick={() => onPick(on ? null : it.key)}
            aria-pressed={on}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs focus:outline-none focus-visible:ring-2"
            style={{
              opacity: dim ? 0.38 : 1,
              background: on ? "#eaf3fb" : "transparent",
              border: `1px solid ${on ? GS.blue : "transparent"}`,
              color: GS.ink,
            }}>
            <svg width="24" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="23" y2="5" stroke={it.color}
                strokeWidth={it.dashed ? 1.8 : 2.4}
                strokeDasharray={it.dashed ? "5 4" : undefined} />
            </svg>
            {it.label}
          </button>
        );
      })}
      {focus && (
        <button onClick={() => onPick(null)}
          className="rounded px-2 py-1 text-xs focus:outline-none focus-visible:ring-2"
          style={{ color: GS.blue, border: `1px solid ${GS.line}` }}>
          แสดงทั้งหมด
        </button>
      )}
    </div>
  );
}

/* ── สรุปรายเดือน + วัดผลการทำนาย ──────────────────────────── */

const MONTHS = [
  { key: "2026-09", label: "กันยายน 2569", days: 30, from: 1, to: 13, partial: true, seed: 1127, sigma: 0.30 },
  { key: "2026-08", label: "สิงหาคม 2569", days: 31, from: 1, to: 31, seed: 11831, sigma: 0.50 },
  { key: "2026-07", label: "กรกฎาคม 2569", days: 31, from: 25, to: 31, thin: true, seed: 1111, sigma: 0.60 },
];

/** สุ่มแบบกำหนดผลซ้ำได้ เพื่อให้ต้นแบบแสดงตัวเลขเดิมทุกครั้ง */
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const gauss = (r) => (r() + r() + r() + r() - 2) * 0.9;

/**
 * ค่ารายวันของเดือน — หนึ่งแถวต่อมอเตอร์ต่อวัน
 * pv = ค่าที่ระบบทำนายไว้ล่วงหน้า (เส้นแนวโน้มเรียบ)
 * av = ค่าที่วัดได้จริงในวันนั้น
 */
function predictionLog(month) {
  const r = rng(month.seed);
  const live = MOTORS.filter((x) => x.online);
  const n = month.to - month.from + 1;
  const out = [];
  live.forEach((mo) => {
    const ceil = mo.zone === "C" ? 3.7 : mo.zone === "B" ? 3.05 : 2.55;
    for (let day = month.from; day <= month.to; day++) {
      const t = n > 1 ? (day - month.from) / (n - 1) : 0;
      const pv = +(mo.y + (ceil - mo.y) * t + Math.sin(day / 4.2) * 0.12).toFixed(3);
      const av = +Math.max(0.2, pv + gauss(r) * month.sigma).toFixed(3);
      out.push({ day, tag: mo.tag, pv, av });
    }
  });
  return out.sort((a, b) => a.day - b.day);
}

function scoreLog(log, threshold) {
  const n = log.length;
  if (!n) return null;
  let tp = 0, fp = 0, fn = 0, tn = 0, absErr = 0, pctErr = 0;
  log.forEach(({ pv, av }) => {
    const p = pv >= threshold, a = av >= threshold;
    if (p && a) tp++; else if (p && !a) fp++; else if (!p && a) fn++; else tn++;
    absErr += Math.abs(pv - av);
    pctErr += Math.abs(pv - av) / Math.max(av, 1e-6);
  });
  const div = (x, y) => (y > 0 ? x / y : null);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  return {
    n, tp, fp, fn, tn,
    accuracy: (tp + tn) / n,
    precision, recall,
    f1: precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall) : null,
    mae: absErr / n,
    mape: (pctErr / n) * 100,
  };
}

const pct = (v) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function MonthlySummary() {
  const [key, setKey] = useState(MONTHS[0].key);
  const [threshold, setThreshold] = useState(2.8);
  const [tag, setTag] = useState("ALL");
  const month = MONTHS.find((x) => x.key === key);
  const prev = MONTHS[MONTHS.findIndex((x) => x.key === key) + 1];

  const allLog = useMemo(() => predictionLog(month), [month]);
  const log = useMemo(() => (tag === "ALL" ? allLog : allLog.filter((l) => l.tag === tag)), [allLog, tag]);
  const score = useMemo(() => scoreLog(log, threshold), [log, threshold]);
  const prevScore = useMemo(() => {
    if (!prev) return null;
    const p = predictionLog(prev);
    return scoreLog(tag === "ALL" ? p : p.filter((l) => l.tag === tag), threshold);
  }, [prev, threshold, tag]);

  // คะแนนแยกรายมอเตอร์ — ตัวที่บอกความจริงมากกว่าค่ารวม
  const perMotor = useMemo(() => MOTORS.filter((x) => x.online).map((mo) => ({
    mo, s: scoreLog(allLog.filter((l) => l.tag === mo.tag), threshold),
  })), [allLog, threshold]);

  // สรุปรายมอเตอร์
  const rows = useMemo(() => MOTORS.filter((x) => x.online).map((mo) => {
    const mine = allLog.filter((l) => l.tag === mo.tag);
    const avg = mine.reduce((s, l) => s + l.av, 0) / (mine.length || 1);
    const max = Math.max(...mine.map((l) => l.av));
    const first = mine[0]?.av ?? avg, last = mine[mine.length - 1]?.av ?? avg;
    const zone = max >= 4.5 ? "D" : max >= 2.8 ? "C" : max >= 1.4 ? "B" : "A";
    return { mo, avg, max, delta: ((last - first) / Math.max(first, 1e-6)) * 100, zone, n: mine.length };
  }), [allLog]);

  // กราฟรายวัน — เต็มเดือน ไม่เฉลี่ยข้ามมอเตอร์เพราะค่าคนละสเกลกัน
  const daily = useMemo(() => {
    const byDay = {};
    for (let d = 1; d <= month.days; d++) byDay[d] = { day: `${d}` };
    allLog.forEach((l) => {
      byDay[l.day][`av_${l.tag}`] = l.av;
      byDay[l.day][`pv_${l.tag}`] = l.pv;
    });
    return Object.keys(byDay).map(Number).sort((a, b) => a - b).map((d) => byDay[d]);
  }, [allLog, month]);

  const reliable = score && score.n >= 30;
  const MO_COLORS = { "P-101": GS.blue, "FAN-202": "#157a52", "CONV-303": GS.orange };

  const [focus, setFocus] = useState(null);
  useEffect(() => { setFocus(null); }, [tag, key]);

  const series = useMemo(() => (
    tag === "ALL"
      ? MOTORS.filter((x) => x.online).flatMap((mo) => [
        { key: `av_${mo.tag}`, label: `${mo.tag} จริง`, color: MO_COLORS[mo.tag], dashed: false },
        { key: `pv_${mo.tag}`, label: `${mo.tag} ทำนาย`, color: MO_COLORS[mo.tag], dashed: true },
      ])
      : [
        { key: `av_${tag}`, label: "ค่าจริง", color: GS.blue, dashed: false },
        { key: `pv_${tag}`, label: "ค่าที่ทำนาย", color: GS.cyan, dashed: true },
      ]
  ), [tag]);


  return (
    <div className="space-y-4">
      {/* หัวเรื่อง + ตัวเลือกเดือน */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: GS.ink }}>สรุปรายเดือน</h1>
          <p className="text-sm" style={{ color: "#6b7684" }}>
            แนวโน้มการสั่นสะเทือนและผลการทำนายของเดือนที่เลือก
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="เดือน">
            <select className={inputCls} style={{ borderColor: GS.line, minWidth: 170 }}
              value={key} onChange={(e) => setKey(e.target.value)}>
              {MONTHS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="มอเตอร์">
            <select className={inputCls} style={{ borderColor: GS.line, minWidth: 150 }}
              value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="ALL">ทั้งหมด (รวมกัน)</option>
              {MOTORS.filter((x) => x.online).map((mo) => <option key={mo.tag} value={mo.tag}>{mo.tag}</option>)}
            </select>
          </Field>
          <Field label="เกณฑ์ที่ใช้ตัดสิน (mm/s)" hint="ใช้แปลงค่าทำนายเป็นคำตอบว่า เกิน / ไม่เกิน">
            <input type="number" step="0.1" min="0.1" value={threshold}
              onChange={(e) => setThreshold(Math.max(0.1, +e.target.value || 0.1))}
              className={inputCls} style={{ borderColor: GS.line, minWidth: 120 }} />
          </Field>
        </div>
      </div>

      {month.partial && (
        <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: GS.line, background: "#fff8ec", color: "#7a5a12" }}>
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: GS.orange }} />
          เดือนนี้ยังไม่จบ ตัวเลขคำนวณจากข้อมูลเท่าที่มีถึงปัจจุบัน
        </div>
      )}

      {/* สรุปรายมอเตอร์ */}
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
        <h2 className="mb-3 font-semibold" style={{ color: GS.ink }}>ภาพรวมรายมอเตอร์</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#6e7685" }}>
                {["มอเตอร์", "เฉลี่ย", "สูงสุด", "เปลี่ยนแปลงในเดือน", "โซนสูงสุดที่แตะ"].map((h) => (
                  <th key={h} className="border-b py-2 text-left font-medium" style={{ borderColor: GS.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mo.tag}>
                  <td className="border-b py-2.5" style={{ borderColor: GS.line }}>
                    <span className="font-medium" style={{ color: GS.ink }}>{r.mo.tag}</span>
                    <span className="ml-2 text-xs" style={{ color: "#6e7685" }}>{r.mo.name}</span>
                  </td>
                  <td className="border-b py-2.5 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>
                    {r.avg.toFixed(2)} <span className="text-xs" style={{ color: "#6e7685" }}>mm/s</span>
                  </td>
                  <td className="border-b py-2.5 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>
                    {r.max.toFixed(2)}
                  </td>
                  <td className="border-b py-2.5 tabular-nums" style={{ borderColor: GS.line }}>
                    <span style={{ color: r.delta > 10 ? "#d92d20" : r.delta > 0 ? GS.orange : "#157a52" }}>
                      {r.delta >= 0 ? "▲ +" : "▼ "}{r.delta.toFixed(1)}%
                    </span>
                  </td>
                  <td className="border-b py-2.5" style={{ borderColor: GS.line }}>
                    <span className="rounded px-2 py-0.5 text-xs font-semibold"
                      style={{ background: ZONE[r.zone].fill, color: ZONE_TEXT[r.zone] }}>
                      โซน {r.zone}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ทำนาย vs จริง */}
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
        <div className="mb-1 flex items-center gap-2">
          <Target size={16} style={{ color: GS.blue }} />
          <h2 className="font-semibold" style={{ color: GS.ink }}>ค่าที่ทำนายไว้ เทียบกับค่าที่วัดได้จริง</h2>
        </div>
        <p className="mb-3 text-sm" style={{ color: "#6b7684" }}>
          {tag === "ALL"
            ? "เส้นทึบคือค่าจริง เส้นประคือค่าที่ทำนายไว้ จับคู่กันด้วยสีเดียวกันต่อมอเตอร์"
            : "เส้นทึบคือค่าที่วัดได้จริง เส้นประคือค่าที่ระบบทำนายไว้ล่วงหน้า"}
          {" · "}
          <span style={{ color: "#6e7685" }}>
            มีข้อมูลวันที่ {month.from}–{month.to} จาก {month.days} วัน
            {month.from > 1 ? " (เริ่มเก็บกลางเดือน)" : month.partial ? " (เดือนยังไม่จบ)" : ""}
          </span>
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={GS.line} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6e7685" }} interval={1}
                label={{ value: "วันที่", position: "insideBottom", offset: -2, fontSize: 11, fill: "#6e7685" }} />
              <YAxis domain={[0, (max) => Math.ceil((max + 0.3) * 2) / 2]}
                tick={{ fontSize: 11, fill: "#6e7685" }} unit=" mm/s" width={70} />
              <Tooltip content={<MonthTip />} />
              <ReferenceLine y={threshold} stroke="#d92d20" strokeWidth={2}
                label={{ value: `เกณฑ์ตัดสิน ${threshold}`, position: "insideTopRight", fill: "#d92d20", fontSize: 11 }} />
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={s.color} strokeWidth={s.dashed ? 1.8 : 2.4}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  hide={!!focus && focus !== s.key}
                  dot={false} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ChartLegend items={series} focus={focus} onPick={setFocus} />
        <p className="mt-1 text-center text-xs" style={{ color: "#6e7685" }}>
          {focus
            ? "กำลังดูเส้นเดียว — กดชื่อเส้นซ้ำ หรือกดแสดงทั้งหมด เพื่อกลับไปดูทุกเส้น"
            : "คลิกที่ชื่อเส้นเพื่อดูเฉพาะเส้นนั้น"}
        </p>
      </div>

      {/* คะแนนการทำนาย */}
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: GS.line }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" style={{ color: GS.ink }}>ความแม่นยำของการทำนาย</h2>
          <span className="rounded px-2 py-0.5 text-xs"
            style={{ background: reliable ? "#e8f6ef" : "#fff1e0", color: reliable ? "#146c46" : "#7a5a12" }}>
            {score ? `${score.n} ครั้ง` : "ไม่มีข้อมูล"}
          </span>
        </div>

        {!score ? (
          <p className="py-8 text-center text-sm" style={{ color: "#6b7684" }}>เดือนนี้ยังไม่มีการทำนายที่ตรวจสอบผลได้</p>
        ) : (
          <>
            {/* ความคลาดเคลื่อนเชิงค่า */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded p-3" style={{ background: GS.paper }}>
                <div className="text-xs" style={{ color: "#6e7685" }}>คลาดเคลื่อนเฉลี่ย (MAE)</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: GS.ink }}>
                  {score.mae.toFixed(3)} <span className="text-sm font-normal" style={{ color: "#6e7685" }}>mm/s</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "#6b7684" }}>
                  ทำนายพลาดจากค่าจริงเฉลี่ยเท่านี้ ยิ่งน้อยยิ่งดี
                </div>
              </div>
              <div className="rounded p-3" style={{ background: GS.paper }}>
                <div className="text-xs" style={{ color: "#6e7685" }}>คลาดเคลื่อนเป็นสัดส่วน (MAPE)</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: GS.ink }}>
                  {score.mape.toFixed(1)}<span className="text-sm font-normal" style={{ color: "#6e7685" }}>%</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "#6b7684" }}>
                  เทียบเป็นเปอร์เซ็นต์ของค่าจริง
                </div>
              </div>
            </div>

            {/* ตารางความสับสน */}
            <p className="mb-2 text-sm" style={{ color: "#46505e" }}>
              แปลงเป็นคำถามว่า <strong style={{ color: GS.ink }}>"จะเกิน {threshold} mm/s ไหม"</strong> แล้วนับผลได้ดังนี้
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-md">
              {[
                ["TP", score.tp, "ทำนายว่าเกิน · เกินจริง", "#157a52"],
                ["FP", score.fp, "ทำนายว่าเกิน · ไม่เกินจริง", GS.orange],
                ["FN", score.fn, "ทำนายว่าไม่เกิน · แต่เกินจริง", "#d92d20"],
                ["TN", score.tn, "ทำนายว่าไม่เกิน · ไม่เกินจริง", "#157a52"],
              ].map(([k, v, d, c]) => (
                <div key={k} className="rounded border p-3" style={{ borderColor: GS.line }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold" style={{ color: c }}>{k}</span>
                    <span className="text-xl font-semibold tabular-nums" style={{ color: GS.ink }}>{v}</span>
                  </div>
                  <div className="mt-0.5 text-xs leading-snug" style={{ color: "#6b7684" }}>{d}</div>
                </div>
              ))}
            </div>

            {/* เมตริก */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Accuracy", score.accuracy, "(TP+TN) ÷ ทั้งหมด", "ทายถูกกี่ครั้งจากทั้งหมด"],
                ["Precision", score.precision, "TP ÷ (TP+FP)", "เวลาบอกว่าจะเกิน เชื่อได้แค่ไหน"],
                ["Recall", score.recall, "TP ÷ (TP+FN)", "ของที่เกินจริง จับได้กี่เปอร์เซ็นต์"],
                ["F1", score.f1, "ค่าเฉลี่ยฮาร์มอนิก", "สมดุลระหว่างสองตัวบน"],
              ].map(([k, v, f, d]) => (
                <div key={k} className="rounded border p-3" style={{ borderColor: GS.line }}>
                  <div className="text-xs font-medium" style={{ color: "#6b7684" }}>{k}</div>
                  <div className="text-2xl font-semibold tabular-nums" style={{ color: GS.blue }}>{pct(v)}</div>
                  <div className="mt-1 font-mono text-xs" style={{ color: "#6e7685" }}>{f}</div>
                  <div className="mt-1 text-xs leading-snug" style={{ color: "#6b7684" }}>{d}</div>
                </div>
              ))}
            </div>

            {prevScore && (
              <p className="mt-3 text-sm" style={{ color: "#46505e" }}>
                เทียบกับ {prev.label}: Accuracy {pct(prevScore.accuracy)} → <strong style={{ color: GS.ink }}>{pct(score.accuracy)}</strong>
                {" · "}MAE {prevScore.mae.toFixed(3)} → <strong style={{ color: GS.ink }}>{score.mae.toFixed(3)}</strong> mm/s
              </p>
            )}

            {/* แยกรายมอเตอร์ */}
            <div className="mt-4 border-t pt-4" style={{ borderColor: GS.line }}>
              <h3 className="mb-1 font-medium" style={{ color: GS.ink }}>แยกรายมอเตอร์</h3>
              <p className="mb-3 text-sm" style={{ color: "#6b7684" }}>
                ค่ารวมด้านบนเฉลี่ยทั้ง 3 ตัวเข้าด้วยกัน ตารางนี้บอกว่าจริง ๆ แล้วพลาดที่ตัวไหน
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "#6e7685" }}>
                      {["มอเตอร์", "ครั้ง", "TP", "FP", "FN", "TN", "Accuracy", "Precision", "Recall", "MAE"].map((h) => (
                        <th key={h} className="border-b py-2 text-left font-medium" style={{ borderColor: GS.line }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perMotor.map(({ mo, s }) => {
                      const on = tag === mo.tag;
                      return (
                        <tr key={mo.tag} style={{ background: on ? "#eaf3fb" : "transparent" }}>
                          <td className="border-b py-2" style={{ borderColor: GS.line }}>
                            <button onClick={() => setTag(on ? "ALL" : mo.tag)}
                              className="rounded font-medium focus:outline-none focus-visible:ring-2"
                              style={{ color: on ? GS.blue : GS.ink }}>{mo.tag}</button>
                          </td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: "#46505e" }}>{s?.n ?? 0}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: "#157a52" }}>{s?.tp ?? 0}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: GS.orange }}>{s?.fp ?? 0}</td>
                          <td className="border-b py-2 tabular-nums font-semibold" style={{ borderColor: GS.line, color: s?.fn ? "#d92d20" : "#6e7685" }}>{s?.fn ?? 0}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: "#46505e" }}>{s?.tn ?? 0}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>{pct(s?.accuracy ?? null)}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>{pct(s?.precision ?? null)}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: GS.ink }}>{pct(s?.recall ?? null)}</td>
                          <td className="border-b py-2 tabular-nums" style={{ borderColor: GS.line, color: "#46505e" }}>{s ? s.mae.toFixed(3) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: "#6e7685" }}>
                คลิกชื่อมอเตอร์เพื่อกรองทั้งหน้าให้เหลือตัวนั้น · Precision เป็น “—” แปลว่าเดือนนั้นไม่เคยทำนายว่าจะเกินเลย จึงคำนวณไม่ได้
              </p>
            </div>

            {/* คำเตือนสำคัญ */}
            <div className="mt-4 space-y-2">
              {!reliable && (
                <div className="flex items-start gap-2 rounded p-3 text-sm"
                  style={{ background: "#fff1e0", color: "#7a5a12" }}>
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: GS.orange }} />
                  <div>
                    <strong>ตัวอย่างน้อยเกินกว่าจะสรุปได้</strong> — มีเพียง {score.n} ครั้ง
                    การเปลี่ยนผลแค่ครั้งเดียวขยับตัวเลขได้ถึง {(100 / score.n).toFixed(1)}%
                    ควรมีอย่างน้อย 30 ครั้งก่อนใช้ตัวเลขนี้ตัดสินใจ
                  </div>
                </div>
              )}
              {tag === "ALL" && (
                <div className="flex items-start gap-2 rounded p-3 text-sm"
                  style={{ background: "#fff1e0", color: "#7a5a12" }}>
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: GS.orange }} />
                  <div>
                    <strong>ค่ารวมนี้ดูดีเกินจริง</strong> — มอเตอร์ที่อยู่ห่างเกณฑ์มากทำให้ได้ TN มาฟรี ๆ
                    ซึ่งไปดัน Accuracy ขึ้น ทั้งที่ตัวที่ยากจริงอาจพลาดอยู่
                    ให้ดูตารางแยกรายมอเตอร์ประกอบเสมอ อย่าตัดสินจากตัวเลขรวมอย่างเดียว
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 rounded p-3 text-sm" style={{ background: "#eaf3fb", color: "#31414f" }}>
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: GS.blue }} />
                <div>
                  <strong>ในงานบำรุงรักษา Recall สำคัญกว่า Precision</strong> — FN คือเครื่องที่กำลังจะมีปัญหาแต่ระบบบอกว่าปกติ
                  ซึ่งแพงกว่า FP ที่แค่ทำให้ช่างเดินไปดูเก้อ ถ้าต้องเลือกอย่างใดอย่างหนึ่ง ให้ยอม FP เพิ่มเพื่อลด FN
                </div>
              </div>
              <div className="flex items-start gap-2 rounded p-3 text-sm" style={{ background: GS.paper, color: "#46505e" }}>
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: "#6e7685" }} />
                <div>
                  ตัวเลขชุดนี้วัด <strong>การทำนายค่าการสั่นด้วยสถิติเชิงเส้น</strong> ไม่ได้วัดโมเดล ML
                  และไม่ได้วัดว่าทำนาย <em>สาเหตุ</em> ของปัญหาถูกหรือไม่ — เรื่องนั้นต้องรอให้มีประวัติการซ่อมพร้อม cause code สะสมพอ
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── กระดิ่งแจ้งเตือน ──────────────────────────────────────── */

function NotificationBell({ events, onGo }) {
  const [open, setOpen] = useState(false);
  const pending = events.filter((e) => !e.ack);
  const urgent = pending.filter((e) => e.kind === "alarm" || e.kind === "warning").length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        aria-label={`การแจ้งเตือน ${pending.length} รายการที่ยังไม่รับทราบ`}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded focus:outline-none focus-visible:ring-2"
        style={{ color: pending.length ? GS.ink : "#6b7684" }}>
        <Bell size={18} />
        {pending.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
            style={{ background: urgent ? "#d92d20" : "#6b7684" }}>
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-80 rounded-lg border bg-white"
            style={{ borderColor: GS.line, boxShadow: "0 10px 32px rgba(16,32,56,.16)" }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: GS.line }}>
              <span className="font-medium" style={{ color: GS.ink }}>ยังไม่รับทราบ</span>
              <span className="text-xs" style={{ color: "#6e7685" }}>{pending.length} รายการ</span>
            </div>

            {pending.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "#6b7684" }}>
                ไม่มีการแจ้งเตือนค้าง
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {pending.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => { setOpen(false); onGo(); }}
                      className="flex w-full items-start gap-3 border-b px-4 py-3 text-left focus:outline-none focus-visible:ring-2"
                      style={{ borderColor: GS.line }}>
                      <span className="mt-0.5 text-sm" style={{ color: KIND[e.kind].fill }}>{KIND[e.kind].glyph}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium" style={{ color: GS.ink }}>{e.motor}</span>
                        <span className="block text-xs" style={{ color: "#6b7684" }}>{e.metric} · {e.value}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: "#6e7685" }}>
                        {e.day} {TH_MON[Number(e.mon.split("-")[1]) - 1]} {e.time}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={() => { setOpen(false); onGo(); }}
              className="w-full rounded-b-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2"
              style={{ color: GS.blue }}>
              ดูประวัติทั้งหมด
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── shell ─────────────────────────────────────────────────── */

const NAV = [
  { id: "dash", label: "ภาพรวม", icon: Gauge },
  { id: "history", label: "ประวัติแจ้งเตือน", icon: CalendarDays },
  { id: "month", label: "สรุปรายเดือน", icon: BarChart3 },
  { id: "maint", label: "บันทึกซ่อม", icon: Wrench },
  { id: "admin", label: "ผู้ดูแลระบบ", icon: Users },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState("dash");
  const [port, setPort] = useState(null);
  const [role, setRole] = useState("maintenance");
  const [toasts, setToasts] = useState([]);
  const [events, setEvents] = useState(EVENTS);

  const USER_NAME = { maintenance: "สมชาย ก.", admin: "ธนกร ค.", manager: "วิไล ม." };
  const ackEvent = (e) => {
    setEvents((xs) => xs.map((x) => (x.id === e.id ? { ...x, ack: USER_NAME[role] } : x)));
    notify({
      title: "รับทราบเหตุการณ์แล้ว",
      detail: `${e.motor} · ${e.metric} · ${e.day} ${TH_MON[Number(e.mon.split("-")[1]) - 1]} ${e.time}`,
    });
  };

  const notify = React.useCallback((t) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs, { id, ...t }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  const closeToast = (id) => setToasts((xs) => xs.filter((x) => x.id !== id));

  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  const open = (p) => { setPort(p); setScreen("motor"); };

  return (
    <ToastCtx.Provider value={notify}>
      <div className="min-h-screen" style={{ background: GS.paper, color: GS.ink }}>
        <header className="sticky top-0 z-30 border-b bg-white" style={{ borderColor: GS.line }}>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white" style={{ background: GS.blue }}>GS</div>
            <span className="font-semibold">Condition Monitoring</span>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell events={events} onGo={() => { setScreen("history"); setPort(null); }} />
              <label className="text-xs" style={{ color: "#6e7685" }}>ดูในฐานะ</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="rounded border px-2 py-1 text-sm focus:outline-none focus-visible:ring-2" style={{ borderColor: GS.line }}>
                <option value="maintenance">maintenance</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
              <button onClick={() => setAuthed(false)} className="flex h-11 w-11 items-center justify-center rounded focus:outline-none focus-visible:ring-2" aria-label="ออกจากระบบ">
                <LogOut size={16} style={{ color: "#6b7684" }} />
              </button>
            </div>
          </div>
          <nav className="mx-auto max-w-7xl overflow-x-auto px-4">
            <div className="flex gap-1">
              {NAV.map((n) => {
                const on = screen === n.id || (n.id === "dash" && screen === "motor");
                return (
                  <button key={n.id} onClick={() => { setScreen(n.id); setPort(null); }}
                    className="flex h-11 shrink-0 items-center gap-2 px-3 text-sm focus:outline-none focus-visible:ring-2"
                    style={{ color: on ? GS.blue : "#6b7684", borderBottom: `2px solid ${on ? GS.blue : "transparent"}`, fontWeight: on ? 600 : 400 }}>
                    <n.icon size={16} />{n.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-5">
          {screen === "dash" && (
            <div className="space-y-4">
              <PortRail onPick={open} />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {MOTORS.map((m) => <MotorCard key={m.port} m={m} onOpen={open} />)}
              </div>
            </div>
          )}
          {screen === "motor" && <MotorDetail port={port} role={role} onBack={() => setScreen("dash")} />}
          {screen === "history" && <History events={events} onAck={ackEvent} role={role} />}
          {screen === "month" && <MonthlySummary />}
          {screen === "maint" && <MaintenanceLog />}
          {screen === "admin" && <Admin role={role} />}
        </main>

        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs" style={{ color: "#6e7685" }}>
          ต้นแบบ Phase 2 v2 · ข้อมูลจำลอง · เส้นทำนายเป็นสถิติเชิงเส้น ยังไม่ใช่โมเดล ML
        </footer>

        <ToastHost items={toasts} onClose={closeToast} />
      </div>
    </ToastCtx.Provider>
  );
}
