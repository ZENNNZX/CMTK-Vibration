import { useEffect, useId, useRef, useState } from 'react';
import { Box, Move3d } from 'lucide-react';
import * as THREE from 'three';

export type Offset = [number, number, number];

/** ตำแหน่งวัดมาตรฐานตาม ISO 20816 — DE = ด้านขับ, NDE = ด้านท้าย */
export const MOUNTS: { id: string; name: string; desc: string; pos: Offset }[] = [
  { id: 'DE-H', name: 'DE แนวนอน', desc: 'ด้านขับ · จับ imbalance และ misalignment ได้ดีที่สุด', pos: [0.95, 0.32, 0.62] },
  { id: 'DE-V', name: 'DE แนวตั้ง', desc: 'ด้านขับ · จับฐานหลวมและ soft foot', pos: [0.95, 0.78, 0] },
  { id: 'DE-A', name: 'DE แนวแกน', desc: 'ด้านขับ · จับ misalignment แบบเชิงมุม', pos: [1.62, 0.1, 0] },
  { id: 'NDE-H', name: 'NDE แนวนอน', desc: 'ด้านท้าย · เทียบกับ DE เพื่อหาว่าปัญหาอยู่ฝั่งไหน', pos: [-0.95, 0.32, 0.62] },
  { id: 'NDE-V', name: 'NDE แนวตั้ง', desc: 'ด้านท้าย · จับฐานหลวมฝั่งท้าย', pos: [-0.95, 0.78, 0] },
];

/** สีของวัตถุในฉาก 3D ไม่ใช่ chrome ของ UI — แต่สีจุดที่เลือกต้องตรงกับ token ที่เดียว */
const cssColor = (name: string, fallback: number): number => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? new THREE.Color(v).getHex() : fallback;
};

interface Props {
  mount: string;
  offset: Offset | null;
  canEdit: boolean;
  onMount: (id: string) => void;
  onOffset: (o: Offset | null) => void;
}

export function MotorMount3D({ mount, offset, canEdit, onMount, onOffset }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // ค่าล่าสุดที่ loop ต้องอ่าน — เก็บใน ref เพราะ scene สร้างครั้งเดียวตอน mount
  const live = useRef({ mount, offset, canEdit, onMount, onOffset });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const selectId = useId();

  live.current = { mount, offset, canEdit, onMount, onOffset };

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // ไม่มี WebGL (jsdom, GPU ถูกบล็อก, เครื่องเก่า) — dropdown ทำงานแทนได้ทั้งหมด
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cssColor('--color-surface-sunken', 0xeef2f6));

    const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    cam.position.set(3.6, 2.5, 4.4);
    cam.lookAt(0, 0.25, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    setReady(true);

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
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.42;
    rig.add(body);

    // ครีบระบายความร้อน — ทำให้ดูเป็นมอเตอร์จริง ไม่ใช่กระบอกเปล่า
    for (let i = 0; i < 11; i++) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.045, 24), steel);
      fin.rotation.z = Math.PI / 2;
      fin.position.set(-0.8 + i * 0.16, 0.42, 0);
      rig.add(fin);
    }
    for (const x of [0.92, -0.92]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.2, 28), dark);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x, 0.42, 0);
      rig.add(cap);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.78, 20), metal);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(1.35, 0.42, 0);
    rig.add(shaft);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.46), dark);
    tb.position.set(0, 1.08, 0);
    rig.add(tb);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.1), dark);
    base.position.y = -0.32;
    rig.add(base);

    // พื้นผิวล่องหนสำหรับลากจุดให้เกาะติดตัวมอเตอร์เสมอ (docs/02 §4)
    const ghost = new THREE.MeshBasicMaterial({ visible: false });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.95, 28, 1, true), ghost);
    shell.rotation.z = Math.PI / 2;
    shell.position.y = 0.42;
    shell.userData.kind = 'shell';
    rig.add(shell);
    const capTargets = [1.02, -1.02].map((x) => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), ghost);
      d.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      d.position.set(x, 0.42, 0);
      d.userData.kind = 'cap';
      rig.add(d);
      return d;
    });
    const dragTargets = [shell, ...capTargets];

    const PIN_ON = cssColor('--color-primary', 0x005baa);
    const PIN_OFF = cssColor('--color-warning', 0xff9300);

    const dots = MOUNTS.map((m) => {
      const g = new THREE.Group();
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 20, 16),
        new THREE.MeshLambertMaterial({ color: PIN_OFF }),
      );
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.17, 0.22, 24),
        new THREE.MeshBasicMaterial({ color: PIN_ON, side: THREE.DoubleSide, transparent: true, opacity: 0 }),
      );
      g.add(pin, halo);
      g.position.set(...m.pos);
      g.userData = { id: m.id, pin, halo };
      rig.add(g);
      return g;
    });

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let spin = false;
    let pinDrag = false;
    let lastX = 0;
    let yaw = 0;
    let moved = 0;

    const cast = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, cam);
    };
    const pickPin = (ev: PointerEvent) => {
      cast(ev);
      const hit = ray.intersectObjects(dots.map((d) => d.userData.pin as THREE.Mesh));
      return hit.length ? dots.find((d) => d.userData.pin === hit[0].object) : undefined;
    };

    const onDown = (e: PointerEvent) => {
      const d = pickPin(e);
      if (d && d.userData.id === live.current.mount && live.current.canEdit) {
        pinDrag = true;
        setDragging(true);
      } else {
        spin = true;
        lastX = e.clientX;
        moved = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (pinDrag) {
        cast(e);
        const hits = ray.intersectObjects(dragTargets);
        if (!hits.length) return;
        const p = rig.worldToLocal(hits[0].point.clone());
        if (hits[0].object.userData.kind === 'shell') {
          // ดันออกจากผิวเล็กน้อยให้จุดลอยเหนือผิว ไม่จมเข้าไปในเนื้อ
          const dy = p.y - 0.42;
          const r = Math.hypot(dy, p.z) || 1e-6;
          const s = (r + 0.07) / r;
          p.y = 0.42 + dy * s;
          p.z = p.z * s;
          p.x = Math.max(-1, Math.min(1, p.x));
        } else {
          p.x += Math.sign(p.x || 1) * 0.07;
        }
        live.current.onOffset([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
        return;
      }
      if (spin) {
        moved += Math.abs(e.clientX - lastX);
        yaw += (e.clientX - lastX) * 0.008;
        lastX = e.clientX;
      } else {
        const d = pickPin(e);
        renderer.domElement.style.cursor = d
          ? d.userData.id === live.current.mount && live.current.canEdit
            ? 'move'
            : 'pointer'
          : 'grab';
      }
    };

    const onUp = (e: PointerEvent) => {
      if (pinDrag) {
        pinDrag = false;
        setDragging(false);
      } else if (spin && moved < 4) {
        // ลากน้อยกว่า 4px ถือว่าเป็นการคลิก ไม่ใช่หมุน
        const d = pickPin(e);
        if (d && live.current.canEdit) live.current.onMount(d.userData.id as string);
      }
      spin = false;
    };

    const cv = renderer.domElement;
    cv.style.cursor = 'grab';
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const tick = () => {
      rig.rotation.y = yaw;
      const sel = live.current.mount;
      const off = live.current.offset;
      for (const d of dots) {
        const id = d.userData.id as string;
        const on = id === sel;
        const base = MOUNTS.find((m) => m.id === id)!.pos;
        const p = on && off ? off : base;
        d.position.set(p[0], p[1], p[2]);
        // วงแหวนต้องหันออกจากแกนมอเตอร์ ไม่งั้นมองจากด้านข้างจะเห็นเป็นเส้น
        (d.userData.halo as THREE.Mesh).lookAt(
          new THREE.Vector3(p[0] * 3, (p[1] - 0.42) * 3 + 0.42, p[2] * 3),
        );
        ((d.userData.pin as THREE.Mesh).material as THREE.MeshLambertMaterial).color.setHex(
          on ? PIN_ON : PIN_OFF,
        );
        const halo = (d.userData.halo as THREE.Mesh).material as THREE.MeshBasicMaterial;
        halo.opacity += ((on ? 0.85 : 0) - halo.opacity) * 0.2;
        d.scale.setScalar(on ? 1.25 : 1);
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      renderer.dispose();
      cv.remove();
    };
  }, []);

  const active = MOUNTS.find((m) => m.id === mount);

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <Box size={16} className="text-primary" aria-hidden="true" />
        <h2 className="text-section font-semibold text-ink">ตำแหน่งติดตั้งเซ็นเซอร์</h2>
      </div>
      <p className="mb-3 text-body text-ink-muted">
        เลือกจุดจากรายการ แล้วลากจุดสีน้ำเงินบนโมเดลเพื่อปรับให้ตรงกับของจริง · ลากที่พื้นว่างเพื่อหมุน
      </p>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={selectId} className="mb-1 block text-caption font-medium text-ink-secondary">
            จุดวัด
          </label>
          {/* docs/02 §4 · dropdown ต้องมีคู่กับ 3D เสมอ — WebGL canvas กด Tab เข้าไม่ได้ */}
          <select
            id={selectId}
            value={mount}
            disabled={!canEdit}
            onChange={(e) => onMount(e.target.value)}
            className="min-h-11 w-full rounded-sm border border-hairline bg-surface px-3 text-body disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {MOUNTS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>
        <p className="flex items-end text-body text-ink-secondary">{active?.desc}</p>
      </div>

      <div className="relative">
        <div ref={host} className="h-72 overflow-hidden rounded-sm bg-surface-sunken" />
        {ready ? (
          <p
            className={`pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-sm bg-surface/90 px-2 py-1 text-caption ${
              dragging ? 'text-primary' : 'text-ink-muted'
            }`}
          >
            <Move3d size={13} aria-hidden="true" />
            {dragging ? 'กำลังลากจุด…' : canEdit ? 'ลากจุดสีน้ำเงินเพื่อปรับตำแหน่ง' : 'อ่านอย่างเดียว'}
          </p>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-body text-ink-muted">
            แสดงโมเดล 3 มิติไม่ได้บนเครื่องนี้ — ใช้รายการด้านบนเลือกจุดวัดได้ตามปกติ
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <p className="text-body text-ink-secondary">
          บันทึกไว้ที่ <strong className="text-ink">{active?.name}</strong>
          {offset && <span className="text-primary"> · ปรับตำแหน่งเองแล้ว</span>}
        </p>
        {offset && canEdit && (
          <button
            type="button"
            onClick={() => onOffset(null)}
            className="min-h-11 rounded-md border border-hairline px-3 text-body text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            คืนค่าตำแหน่งมาตรฐาน
          </button>
        )}
      </div>
      <p className="mt-2 text-caption text-ink-faint">
        โมเดล 3D ใช้บันทึกตำแหน่งเท่านั้น ไม่ได้แสดงค่าการสั่น · dropdown ด้านบนใช้คีย์บอร์ดได้ (NFR-09)
      </p>
    </section>
  );
}
