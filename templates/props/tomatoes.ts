// The props of "The Fruit Europe Was Afraid to Eat" as real 3D models (they turn with the camera, cast shadows, take ink):
//  - heroTomato(): one glossy lobed tomato with its green star calyx and stem; a hidden pair of wolf ears ("ears")
//  - hornworm(): the fat green tomato hornworm (white side slashes, a horn on its tail end); segments animate (crawl,
//    munch) through pose()
//  - tomatoPlant() / urn() / galleon() / pizza(): Batch scenery (and one movable pizza group)
// Local axes: y up, origin on the ground under the middle; the worm crawls toward local +x.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Batch, boxGeo, V, lam } from "./build";
import { ctex, rep } from "./paint";
import { glossy } from "./glow";

type Part = [THREE.BufferGeometry, THREE.Material];
const nonIdx = (g: THREE.BufferGeometry) => { const x = g.index ? g.toNonIndexed() : g; if (!x.attributes.uv) x.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; };
const merged = (parts: Part[], name = "") => {
  const g = new THREE.Group(); g.name = name;
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) { const l = by.get(m); const n = nonIdx(geo); if (l) l.push(n); else by.set(m, [n]); }
  for (const [m, list] of by) { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = true; me.receiveShadow = true; g.add(me); }
  return g;
};
const tube = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};
const rnd = (seed: number) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// ---------------- materials ----------------
export const TOM_RED = () => glossy("#e0352a", 90, 0.85);
const TOM_GREEN = () => glossy("#8cb84a", 70, 0.6);
const LEAF = [() => lam("tleaf0", () => ({ color: "#4f8f45", side: THREE.DoubleSide })), () => lam("tleaf1", () => ({ color: "#3f7a3e", side: THREE.DoubleSide })), () => lam("tleaf2", () => ({ color: "#5fa04c", side: THREE.DoubleSide }))];
const STEM = () => lam("tstem", () => ({ color: "#5a8a3a" }));
const CALYX = () => lam("tcalyx", () => ({ color: "#3f8a3a", side: THREE.DoubleSide }));

/** a lobed tomato body of radius r (slightly flattened, five soft lobes) */
export const tomatoBodyGeo = (r: number) => {
  const g = new THREE.SphereGeometry(r, 24, 16), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), lob = 1 + 0.045 * Math.cos(a * 5) * (1 - Math.abs(v.y / r));
    const top = v.y > 0 ? 1 - 0.18 * Math.pow(Math.max(0, 1 - Math.hypot(v.x, v.z) / (r * 0.5)), 2) : 1; // a dimple at the stem
    p.setXYZ(i, v.x * lob, v.y * 0.84 * top, v.z * lob);
  }
  g.computeVertexNormals();
  return g;
};
/** the green star calyx on top (r = tomato radius), y at the top of the body */
const calyxGeo = (r: number) => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.12 : r * 0.55; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: r * 0.04, bevelEnabled: false }).rotateX(-Math.PI / 2);
};

/** one movable tomato (radius r): body, calyx, stem, and hidden wolf ears (child "ears") */
export const heroTomato = (r = 0.05, unripe = false) => {
  const top = r * 0.84;
  const g = merged([
    [tomatoBodyGeo(r), unripe ? TOM_GREEN() : TOM_RED()],
    [calyxGeo(r).translate(0, top * 0.92, 0), CALYX()],
    [tube(V(0, top * 0.9, 0), V(r * 0.08, top + r * 0.32, 0), r * 0.07, r * 0.05), STEM()],
  ], "tomato");
  const ears = new THREE.Group(); ears.name = "ears";
  const fur = lam("wolfFur", () => ({ color: "#7d848c" })), pink = lam("wolfEarIn", () => ({ color: "#d8a0a8" }));
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, r * 0.85, 4).rotateY(Math.PI / 4).scale(1, 1, 0.4), fur);
    e.position.set(s * r * 0.55, top + r * 0.2, -r * 0.1); e.rotation.z = -s * 0.35; ears.add(e);
    const ei = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 0.5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3), pink);
    ei.position.set(s * r * 0.55, top + r * 0.12, r * 0.02); ei.rotation.z = -s * 0.35; ears.add(ei);
  }
  ears.visible = false; g.add(ears);
  return g;
};

// ---------------- the hornworm ----------------
const wormTex = () => ctex("wormSkin", 256, 128, (g) => {
  g.fillStyle = "#7cc044"; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#9ad65a"; g.fillRect(0, 0, 256, 30);
  // the white diagonal side slash with a dark edge
  g.strokeStyle = "#2f5a2a"; g.lineWidth = 16; g.beginPath(); g.moveTo(60, 110); g.lineTo(150, 40); g.stroke();
  g.strokeStyle = "#f6f4e8"; g.lineWidth = 11; g.beginPath(); g.moveTo(60, 110); g.lineTo(150, 40); g.stroke();
  g.fillStyle = "#24151e"; g.beginPath(); g.arc(196, 84, 7, 0, 7); g.fill(); // spiracle
});
export type Worm = { g: THREE.Group; segs: THREE.Object3D[]; head: THREE.Object3D; L: number };
/** a fat green hornworm, length L (comic size): 11 segments along +x, head at +x, the horn on the tail */
export const hornworm = (L = 0.34): Worm => {
  const g = new THREE.Group(); g.name = "worm";
  const skin = lam("wormSkinM", () => ({ map: wormTex() })), belly = lam("wormBelly", () => ({ color: "#5f9a3a" }));
  const segs: THREE.Object3D[] = [], n = 13, r0 = L * 0.085;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), r = r0 * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12).scale(1.25, 1, 1), skin); body.castShadow = true; s.add(body);
    if (i > 0 && i < n - 2) for (const sd of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.16, r * 0.5, 6), belly); leg.position.set(0, -r * 0.85, sd * r * 0.5); s.add(leg); }
    s.position.set((u - 0.5) * L, r, 0); s.userData = { x: (u - 0.5) * L, r };
    g.add(s); segs.push(s);
  }
  // the head: a slightly darker cap with two shiny black eyes (comic) and little mandibles
  const head = segs[n - 1], hr = head.userData.r as number;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.02, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateZ(-Math.PI / 2), lam("wormHead", () => ({ color: "#6aa83a" })));
  cap.position.x = hr * 0.15; head.add(cap);
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.24, 10, 8), glossy("#1c1519", 120, 1.0)); e.position.set(hr * 0.75, hr * 0.35, sd * hr * 0.45); head.add(e); }
  // the horn on the tail end: red-orange with a black tip, curving back
  const tail = segs[0], tr = tail.userData.r as number;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(tr * 0.32, tr * 2.2, 8).translate(0, tr * 1.1, 0), glossy("#d8582a", 80, 0.6));
  horn.position.set(-tr * 0.1, tr * 0.7, 0); horn.rotation.z = 0.55; tail.add(horn);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(tr * 0.14, tr * 0.6, 8).translate(0, tr * 0.3, 0), lam("hornTip", () => ({ color: "#1c1519" })));
  tip.position.set(-Math.sin(0.55) * tr * 2.0 - tr * 0.1, tr * 0.7 + Math.cos(0.55) * tr * 2.0, 0); tip.rotation.z = 0.55; tail.add(tip);
  g.traverse((m) => { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; });
  return { g, segs, head, L };
};
/** pose the worm: crawl = a travelling hump (0 still .. 1), munch = head bobbing 0..1, rear = head lifted (fright) */
export const poseWorm = (w: Worm, t: number, crawl: number, munch: number, rear = 0) => {
  const n = w.segs.length;
  w.segs.forEach((s, i) => {
    const u = i / (n - 1), x0 = s.userData.x as number, r = s.userData.r as number;
    const hump = crawl * Math.max(0, Math.sin(u * Math.PI * 2 - t * 7)) * r * 0.45;
    const lift = rear * Math.max(0, u - 0.6) / 0.4 * r * 3.2;
    const bob = i === n - 1 ? munch * Math.abs(Math.sin(t * 14)) * r * 0.5 : 0;
    s.position.set(x0 - crawl * 0.04 * w.L * Math.sin(u * Math.PI * 2 - t * 7), r + hump + lift + bob, 0);
    s.rotation.z = i === n - 1 ? rear * 0.6 - munch * 0.25 * Math.abs(Math.sin(t * 14)) : 0;
  });
};

// ---------------- scenery ----------------
/** a staked tomato plant h tall on matrix M (Batch): stake, stem, side shoots, leaf clusters, fruit. Returns fruit spots
 *  (local) so the stage can hang movable tomatoes where the batch left gaps. */
export const tomatoPlant = (b: Batch, M: THREE.Matrix4, h = 1.2, seed = 1, fruit = 6, stake = true, ripe = 0.7) => {
  const r = rnd(seed), stem = STEM(), red = TOM_RED(), green = TOM_GREEN();
  if (stake) b.add(new THREE.CylinderGeometry(0.018, 0.022, h + 0.15, 6).translate(0.05, (h + 0.15) / 2, -0.03), lam("stakeWood", () => ({ color: "#9a7448" })), M);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) pts.push(V(0.03 * Math.sin(i * 1.3 + seed), (h * i) / 6, 0.03 * Math.cos(i * 1.7 + seed)));
  for (let i = 0; i < 6; i++) b.add(tube(pts[i], pts[i + 1], 0.016 - i * 0.0015, 0.014 - i * 0.0015, 6), stem, M);
  const leaf = (c: THREE.Vector3, s: number, yaw: number) => {
    for (let k = 0; k < 5; k++) {
      const a = yaw + (k - 2) * 0.55, d = s * (0.6 + 0.4 * r());
      const geo = new THREE.IcosahedronGeometry(s * 0.55, 0).scale(1.5, 0.28, 0.9).rotateY(-a).rotateZ(0.25 * (r() - 0.5)).translate(c.x + Math.cos(a) * d, c.y - 0.02 * k + 0.03 * r(), c.z + Math.sin(a) * d);
      b.add(geo, LEAF[(k + seed) % 3](), M);
    }
  };
  for (let i = 1; i <= 6; i++) {
    const p = pts[i], yaw = i * 2.1 + seed, len = 0.16 + 0.1 * r(), tip = V(p.x + Math.cos(yaw) * len, p.y - 0.02 + 0.06 * r(), p.z + Math.sin(yaw) * len);
    b.add(tube(p, tip, 0.008, 0.006, 5), stem, M);
    leaf(tip, 0.09 + 0.03 * r(), yaw);
  }
  leaf(pts[6], 0.1, seed);
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < fruit; i++) {
    const p = pts[1 + (i % 4)], yaw = i * 2.4 + seed * 0.7, rr = 0.035 + 0.015 * r(), c = V(p.x + Math.cos(yaw) * 0.1, p.y - 0.06 - (i % 2) * 0.05, p.z + Math.sin(yaw) * 0.1);
    b.add(tomatoBodyGeo(rr).translate(c.x, c.y, c.z), r() < ripe ? red : green, M);
    b.add(calyxGeo(rr).translate(c.x, c.y + rr * 0.8, c.z), CALYX(), M);
    spots.push(c);
  }
  return spots;
};
/** a stone garden urn on a square plinth (Batch), rim at height ~0.95 * s */
export const urn = (b: Batch, M: THREE.Matrix4, s = 1) => {
  const st = lam("urnStone", () => ({ color: "#d8d0bc" })), dk = lam("urnStoneD", () => ({ color: "#bdb39c" }));
  b.add(boxGeo(V(-0.24 * s, 0, -0.24 * s), V(0.24 * s, 0.35 * s, 0.24 * s)), dk, M);
  b.add(boxGeo(V(-0.27 * s, 0.35 * s, -0.27 * s), V(0.27 * s, 0.4 * s, 0.27 * s)), st, M);
  const prof = [[0.12, 0.4], [0.08, 0.46], [0.09, 0.52], [0.2, 0.6], [0.27, 0.72], [0.29, 0.86], [0.33, 0.9], [0.33, 0.95], [0.26, 0.95]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  b.add(new THREE.LatheGeometry(prof, 20), st, M);
  b.add(new THREE.CylinderGeometry(0.27 * s, 0.27 * s, 0.02, 20).translate(0, 0.93 * s, 0), lam("soil", () => ({ color: "#5a3e2a" })), M);
};
/** a 1500s carrack moored broadside along local x (Batch): hull, castles, three masts with furled + set sails */
export const galleon = (b: Batch, M: THREE.Matrix4) => {
  const hullM = lam("hullWood", () => ({ map: rep(planksTex(), 3, 1) })), dk = lam("hullDark", () => ({ color: "#4a2e1c" })), trim = lam("hullTrim", () => ({ color: "#c9a24e" }));
  const red = lam("hullRed", () => ({ color: "#a8323a" })), sail = lam("sailCloth", () => ({ color: "#f2e8d0", side: THREE.DoubleSide })), mast = lam("mastWood", () => ({ color: "#6a4a30" }));
  // hull: a side profile (bow up at +x, high stern castle at -x) extruded across 4.4 m
  const s = new THREE.Shape();
  s.moveTo(-8, 1.2); s.lineTo(-7.6, 5.4); s.lineTo(-4.6, 5.4); s.lineTo(-4.4, 3.6); s.lineTo(4.6, 3.4); s.lineTo(5.0, 4.4); s.lineTo(7.4, 4.6); s.quadraticCurveTo(8.6, 2.6, 6.8, 0.6); s.quadraticCurveTo(0, -0.6, -6.6, 0.4); s.closePath();
  const hull = new THREE.ExtrudeGeometry(s, { depth: 4.0, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.35, bevelSegments: 3, curveSegments: 12 }).translate(0, 0, -2.0);
  b.add(hull, hullM, M);
  b.add(boxGeo(V(-4.4, 3.35, -2.1), V(4.6, 3.45, 2.1)), lam("deck", () => ({ color: "#b8925e" })), M);
  for (const y of [1.6, 2.6]) b.add(boxGeo(V(-7.4, y, 2.32), V(7.6, y + 0.18, 2.42)), trim, M);
  b.add(boxGeo(V(-7.0, 2.85, 2.3), V(6.9, 3.25, 2.4)), red, M);
  for (let x = -5.5; x < 6; x += 1.4) b.add(boxGeo(V(x, 2.0, 2.33), V(x + 0.4, 2.35, 2.45)), dk, M); // gun ports
  // masts: main, fore, mizzen; yards; sails (the fore and main set, gently bellied)
  for (const [x, hgt, setSail] of [[0.4, 13, true], [4.4, 10, true], [-5.6, 9.5, false]] as const) {
    b.add(new THREE.CylinderGeometry(0.14, 0.2, hgt, 10).translate(x, 3.4 + hgt / 2, 0), mast, M);
    b.add(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10).translate(x, 3.4 + hgt * 0.72, 0), mast, M); // fighting top
    for (const [yy, w] of [[hgt * 0.62, 5.6], [hgt * 0.9, 3.6]] as const) {
      b.add(new THREE.CylinderGeometry(0.08, 0.08, w, 8).rotateX(Math.PI / 2).rotateY(0.55).translate(x, 3.4 + yy, 0), mast, M);
      if (setSail) {
        const sg = new THREE.PlaneGeometry(w * 0.95, hgt * 0.28, 8, 6), p = sg.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (w * 0.475), v = p.getY(i) / (hgt * 0.14); p.setZ(i, 0.6 * (1 - u * u) * (1 - 0.5 * v * v)); }
        sg.computeVertexNormals();
        b.add(sg.rotateY(Math.PI / 2 + 0.55).translate(x + 0.2, 3.4 + yy - hgt * 0.15, 0), sail, M);
      } else b.add(new THREE.CylinderGeometry(0.16, 0.16, w * 0.9, 8).rotateX(Math.PI / 2).translate(x, 3.4 + yy - 0.18, 0), sail, M);
    }
  }
  // bowsprit and a few stays
  b.add(tube(V(7.2, 4.4, 0), V(10.4, 6.0, 0), 0.12), mast, M);
  const rope = lam("rope", () => ({ color: "#3a2a20" }));
  for (const [a, c] of [[V(10.2, 5.9, 0), V(4.4, 13.0, 0)], [V(4.4, 13.0, 0), V(0.4, 16.0, 0)], [V(0.4, 16.0, 0), V(-5.6, 12.6, 0)], [V(-5.6, 12.6, 0), V(-7.8, 5.4, 0)]] as const) b.add(tube(a, c, 0.025, 0.025, 4), rope, M);
  for (const x of [0.4, 4.4]) for (const sd of [-1, 1]) b.add(tube(V(x, 3.5 + (x ? 9 : 12), 0), V(x - 0.8, 3.5, sd * 2.1), 0.02, 0.02, 4), rope, M);
  // stern lanterns and a pennant
  b.add(new THREE.SphereGeometry(0.22, 10, 8).translate(-8.0, 5.9, 0), lam("lanternGold", () => ({ color: "#f2c94c" })), M);
  b.add(new THREE.PlaneGeometry(1.6, 0.4).translate(0.8, 0, 0).rotateY(0.2).translate(0.4, 16.8, 0), lam("pennant", () => ({ color: "#c8322a", side: THREE.DoubleSide })), M);
};
const planksTex = () => ctex("hullPlanks", 512, 256, (g, r) => {
  for (let y = 0; y < 256; y += 32) { g.fillStyle = ["#7a5234", "#6e4a2e", "#84593a"][Math.floor(r() * 3)]; g.fillRect(0, y, 512, 32); g.fillStyle = "rgba(30,20,10,0.5)"; g.fillRect(0, y, 512, 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(30,20,10,0.35)"; g.fillRect(r() * 512, Math.floor(r() * 8) * 32 + 14, 4, 4); }
});
/** a Neapolitan pizza (movable): dough, tomato, mozzarella, basil; radius ~0.17 m */
export const pizza = () => merged([
  [new THREE.CylinderGeometry(0.17, 0.165, 0.025, 28).translate(0, 0.0125, 0), lam("dough", () => ({ color: "#e8b868" }))],
  [new THREE.TorusGeometry(0.155, 0.018, 8, 28).rotateX(Math.PI / 2).translate(0, 0.026, 0), lam("crust", () => ({ color: "#d89a4a" }))],
  [new THREE.CylinderGeometry(0.14, 0.14, 0.01, 28).translate(0, 0.03, 0), glossy("#d8382c", 60, 0.5)],
  ...[[0.05, 0.03], [-0.06, 0.04], [0.0, -0.07], [-0.04, -0.05], [0.07, -0.04]].map(([x, z]) => [new THREE.SphereGeometry(0.03, 10, 6).scale(1, 0.35, 1).translate(x, 0.036, z), lam("mozz", () => ({ color: "#fbf4dc" }))] as Part),
  ...[[0.02, 0.07], [-0.08, -0.01], [0.08, 0.02]].map(([x, z]) => [new THREE.SphereGeometry(0.02, 8, 4).scale(1.4, 0.2, 0.8).translate(x, 0.04, z), lam("basil", () => ({ color: "#3f8a3a" }))] as Part),
], "pizza");
