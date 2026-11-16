// Scene dressing: the clutter and small life that make the reference shorts (audio-sample/) feel lived in.
// Measured on the samples: no frame shows bare ground or a bare wall. Outdoors there are grass tufts along every
// verge, gravel and pebbles on the roads and track beds, rocks, bushes, fence lines and telegraph poles receding
// to the horizon, birds in the sky and drifting clouds. Indoors there is a plank floor, wainscot with panels,
// framed pictures, shelves of books, a rug, a plant, curtains, lamps and small things on every desk. Crowd shots
// fill the back with extras.
// Everything here is STATIC background (merged into the Batch, never bounces) except Birds, leaves and smoke,
// which are ambient life driven by time only (deterministic: any frame renders alone).
// No text anywhere: pictures, books and maps are painted shapes only.
// Copy next to build.ts / paint.ts / particles.ts.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, quad } from "./build";
import { ctex, rng } from "./paint";
import { NOINK } from "./ink";
import type { FxCard, V3 } from "./particles";
import { hash } from "./particles";

export type XZ = [number, number];
type Keep = (x: number, z: number) => boolean;
const mat4 = (x: number, y: number, z: number, yaw = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s, s));

/** n random points in a rectangle that pass keep(x, z) */
export const scatter = (seed: number, n: number, x0: number, x1: number, z0: number, z1: number, keep: Keep = () => true): XZ[] => {
  const r = rng(seed), out: XZ[] = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (keep(x, z)) out.push([x, z]); }
  return out;
};
/** points along a polyline every `step` m, jittered sideways by `jit` */
export const along = (seed: number, path: XZ[], step: number, side = 0, jit = 0): XZ[] => {
  const r = rng(seed), out: XZ[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let d = 0; d < L; d += step) { const u = d / L, o = side + (r() - 0.5) * 2 * jit; out.push([ax + (bx - ax) * u + nx * o, az + (bz - az) * u + nz * o]); }
  }
  return out;
};

// ---------------- outdoors: ground cover ----------------
const TUFT = ["#6fae4a", "#5f9e40", "#7dba55", "#4f8a3a"], DRY = ["#b9a456", "#a8944a"];
let tuftGeo: THREE.BufferGeometry | null = null;
const tuftShape = () => {
  if (tuftGeo) return tuftGeo;
  const r = rng(5), parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) { // 5 blades leaning out from the centre
    const h = 0.22 + r() * 0.16, a = (k / 5) * Math.PI * 2 + r(), lean = 0.25 + r() * 0.3;
    const g = new THREE.ConeGeometry(0.035, h, 3, 1, true).translate(0, h / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(V(Math.cos(a), 0, Math.sin(a)), lean)); g.translate(Math.sin(a) * 0.04, 0, -Math.cos(a) * 0.04);
    parts.push(g.toNonIndexed());
  }
  tuftGeo = parts.reduce((acc, g) => { const m = new THREE.BufferGeometry(); const pa = [...(acc.attributes.position?.array ?? []), ...g.attributes.position.array];
    m.setAttribute("position", new THREE.Float32BufferAttribute(pa, 3)); m.computeVertexNormals(); return m; }, new THREE.BufferGeometry());
  return tuftGeo;
};
/** grass tufts (5-blade clumps, 0.2-0.4 m). Reference: every verge and field edge, densest next to roads and walls */
export const tufts = (b: Batch, pts: XZ[], o: { seed?: number; scale?: number; dry?: number; y?: number } = {}) => {
  const r = rng(o.seed ?? 3), g = tuftShape();
  pts.forEach(([x, z], i) => {
    const dry = r() < (o.dry ?? 0), col = dry ? DRY[i % 2] : TUFT[i % 4];
    b.add(g, lam("tuft" + col, () => ({ color: col, side: THREE.DoubleSide })), mat4(x, o.y ?? 0, z, r() * 6.28, (o.scale ?? 1) * (0.7 + r() * 0.7)));
  });
};
/** wildflowers: a stem and a bright head (white / yellow / violet / red), in small patches */
export const flowers = (b: Batch, pts: XZ[], seed = 4) => {
  const r = rng(seed), cols = ["#fbf6ea", "#f4cf3a", "#a777d8", "#e2574c"], stem = lam("stem", () => ({ color: "#4f8a3a" }));
  pts.forEach(([x, z], i) => {
    const h = 0.18 + r() * 0.15, c = cols[(i * 7 + Math.floor(r() * 2)) % 4];
    b.add(new THREE.CylinderGeometry(0.008, 0.01, h, 3).translate(x, h / 2, z), stem);
    b.add(new THREE.IcosahedronGeometry(0.04, 0).translate(x, h, z), lam("flower" + c, () => ({ color: c })));
  });
};
/** gravel and pebbles: flattened low-poly stones, grey-brown mix. Reference: road shoulders and track beds are full of them */
export const pebbles = (b: Batch, pts: XZ[], o: { seed?: number; size?: number; cols?: string[]; y?: number } = {}) => {
  const r = rng(o.seed ?? 6), cols = o.cols ?? ["#a59a88", "#8c8274", "#bdb3a2", "#9a8a72", "#7c7366"];
  pts.forEach(([x, z], i) => {
    const s = (o.size ?? 0.08) * (0.5 + r() * 1.2), c = cols[i % cols.length];
    b.add(new THREE.DodecahedronGeometry(1, 0).scale(s * (1 + r() * 0.5), s * 0.45, s).rotateY(r() * 6), lam("peb" + c, () => ({ color: c })), mat4(x, (o.y ?? 0) + s * 0.15, z));
  });
};
/** boulders / rocks 0.3-1.2 m, half sunk */
export const rocks = (b: Batch, pts: XZ[], seed = 7, size = 0.6) => {
  const r = rng(seed), cols = ["#a39a8a", "#948b7c", "#b2a998"];
  pts.forEach(([x, z], i) => { const s = size * (0.5 + r()); b.add(new THREE.DodecahedronGeometry(1, 0).scale(s * 1.3, s * 0.75, s), lam("rock" + cols[i % 3], () => ({ color: cols[i % 3] })), mat4(x, s * 0.2, z, r() * 6)); });
};
/** round bushes: 3-4 overlapping blobs */
export const bushes = (b: Batch, pts: XZ[], seed = 8, size = 0.7, cols = ["#4f8f45", "#5fa04c", "#3f7a3e"]) => {
  const r = rng(seed);
  pts.forEach(([x, z], i) => {
    const s = size * (0.6 + r() * 0.8), c = cols[i % cols.length], m = lam("bush" + c, () => ({ color: c }));
    for (let k = 0; k < 4; k++) { const a = r() * 6.28, d = s * 0.45; b.add(new THREE.IcosahedronGeometry(s * (0.5 + r() * 0.25), 1), m, mat4(x + Math.cos(a) * d, s * 0.45, z + Math.sin(a) * d)); }
  });
};

// ---------------- outdoors: lines that lead the eye ----------------
/** rustic post-and-rail fence along a path (posts every `gap` m, two rails) */
export const fence = (b: Batch, path: XZ[], o: { gap?: number; h?: number; col?: string } = {}) => {
  const gap = o.gap ?? 2.4, h = o.h ?? 1.1, m = lam("fence" + (o.col ?? "w"), () => ({ color: o.col ?? "#a07a52" }));
  const posts = along(11, path, gap);
  posts.forEach(([x, z], i) => {
    b.add(boxGeo(V(-0.06, 0, -0.06), V(0.06, h, 0.06)), m, mat4(x, 0, z));
    const nx = posts[i + 1]; if (!nx) return;
    const L = Math.hypot(nx[0] - x, nx[1] - z), yaw = Math.atan2(-(nx[1] - z), nx[0] - x);
    for (const y of [h * 0.45, h * 0.85]) b.add(boxGeo(V(0, y - 0.04, -0.03), V(L, y + 0.04, 0.03)), m, mat4(x, 0, z, yaw));
  });
};
/** telegraph / power poles with a cross-arm, insulators and sagging wires. Reference: they recede along every road */
export const poles = (b: Batch, root: THREE.Object3D, path: XZ[], o: { gap?: number; h?: number } = {}) => {
  const gap = o.gap ?? 22, h = o.h ?? 7.5, wood = lam("pole", () => ({ color: "#6e5038" })), ins = lam("insul", () => ({ color: "#e9eef2" }));
  const pts = along(12, path, gap), tops: THREE.Vector3[][] = [];
  pts.forEach(([x, z], i) => {
    const nx = pts[Math.min(i + 1, pts.length - 1)], px = pts[Math.max(i - 1, 0)], yaw = Math.atan2(-(nx[1] - px[1]), nx[0] - px[0]) + Math.PI / 2, M = mat4(x, 0, z, yaw);
    b.add(new THREE.CylinderGeometry(0.11, 0.15, h, 7).translate(0, h / 2, 0), wood, M);
    b.add(boxGeo(V(-0.9, h - 0.65, -0.06), V(0.9, h - 0.52, 0.06)), wood, M);
    const t: THREE.Vector3[] = [];
    for (const dx of [-0.75, -0.3, 0.3, 0.75]) { b.add(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6).translate(dx, h - 0.45, 0), ins, M); t.push(V(dx, h - 0.4, 0).applyMatrix4(M)); }
    tops.push(t);
  });
  const wire = new THREE.MeshBasicMaterial({ color: "#2b2a30" });
  for (let i = 0; i + 1 < tops.length; i++) for (let k = 0; k < 4; k++) {
    const a = tops[i][k], c = tops[i + 1][k], mid = a.clone().lerp(c, 0.5); mid.y -= a.distanceTo(c) * 0.035; // catenary sag
    const me = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, c), 12, 0.012, 3, false), wire);
    me.layers.set(NOINK); root.add(me);
  }
};

// ---------------- outdoors: props ----------------
export const crate = (b: Batch, x: number, z: number, s = 0.6, yaw = 0, y = 0) => {
  const M = mat4(x, y, z, yaw), w = lam("crate", () => ({ color: "#b08452" })), d = lam("crateEdge", () => ({ color: "#8a6238" }));
  b.add(boxGeo(V(-s / 2, 0, -s / 2), V(s / 2, s, s / 2)), w, M);
  for (const [x0, x1, y0, y1] of [[-s / 2 - 0.01, s / 2 + 0.01, 0, 0.07 * s / 0.6], [-s / 2 - 0.01, s / 2 + 0.01, s - 0.07 * s / 0.6, s]]) b.add(boxGeo(V(x0, y0, -s / 2 - 0.01), V(x1, y1, s / 2 + 0.01)), d, M);
};
export const barrel = (b: Batch, x: number, z: number, h = 0.9, y = 0) => {
  b.add(new THREE.CylinderGeometry(h * 0.32, h * 0.32, h, 14).scale(1, 1, 1).translate(x, y + h / 2, z), lam("barrel", () => ({ color: "#9a6a40" })));
  for (const k of [0.15, 0.85]) b.add(new THREE.CylinderGeometry(h * 0.335, h * 0.335, h * 0.06, 14).translate(x, y + h * k, z), lam("hoop", () => ({ color: "#4a4448" })));
};
/** a low wall of sandbags (military posts), along yaw */
export const sandbags = (b: Batch, x: number, z: number, len = 2.4, rows = 3, yaw = 0) => {
  const m = lam("sandbag", () => ({ color: "#c8b48a" })), M = mat4(x, 0, z, yaw);
  for (let row = 0; row < rows; row++) for (let k = 0; k * 0.5 < len; k++) {
    const g = new THREE.SphereGeometry(1, 10, 6).scale(0.27, 0.12, 0.17).translate(-len / 2 + k * 0.5 + (row % 2) * 0.25, 0.11 + row * 0.2, 0);
    b.add(g, m, M);
  }
};
export const woodpile = (b: Batch, x: number, z: number, yaw = 0) => {
  const m = lam("log", () => ({ color: "#8a5a3c" })), e = lam("logEnd", () => ({ color: "#e0bf8a" })), M = mat4(x, 0, z, yaw);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
    const px = -0.45 + k * 0.3 + row * 0.15, py = 0.13 + row * 0.24;
    b.add(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 8).rotateX(Math.PI / 2).translate(px, py, 0), m, M);
    b.add(new THREE.CircleGeometry(0.12, 8).translate(px, py, 0.551), e, M);
  }
};
export const bench = (b: Batch, x: number, z: number, yaw = 0) => {
  const w = lam("benchWood", () => ({ color: "#a8724a" })), M = mat4(x, 0, z, yaw);
  b.add(boxGeo(V(-0.8, 0.42, -0.2), V(0.8, 0.48, 0.2)), w, M);
  b.add(boxGeo(V(-0.8, 0.6, -0.22), V(0.8, 0.85, -0.16)), w, M);
  for (const s of [-0.7, 0.7]) b.add(boxGeo(V(s - 0.05, 0, -0.2), V(s + 0.05, 0.85, 0.18)), w, M);
};
/** a blank wooden signpost (no text in the world: arrows only) */
export const signpost = (b: Batch, x: number, z: number, yaw = 0) => {
  const w = lam("signWood", () => ({ color: "#b08452" })), M = mat4(x, 0, z, yaw);
  b.add(boxGeo(V(-0.06, 0, -0.06), V(0.06, 2.0, 0.06)), w, M);
  b.add(boxGeo(V(-0.1, 1.55, -0.04), V(0.75, 1.8, 0.04)), w, M);
  b.add(new THREE.ConeGeometry(0.16, 0.22, 3).rotateZ(-Math.PI / 2).translate(0.85, 1.675, 0), w, M);
};

// ---------------- indoors ----------------
/** matrix on a wall: a -> b is the wall's run, the wall's room side faces n; u in metres along it, y up, z off the wall */
export const onWall = (a: XZ, bb: XZ, u: number, y: number, z = 0) => {
  const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]), dx = (bb[0] - a[0]) / L, dz = (bb[1] - a[1]) / L;
  // local x = along the wall, local z = the room normal (left of a->b seen from above)
  const nx = -dz, nz = dx;
  return new THREE.Matrix4().makeBasis(V(dx, 0, dz), V(0, 1, 0), V(nx, 0, nz)).setPosition(a[0] + dx * u + nx * z, y, a[1] + dz * u + nz * z);
};
/** wainscot: a darker panelled band below 0.95 m with a rail and a baseboard. Pass the wall from left to right as seen from inside */
export const wainscot = (b: Batch, a: XZ, bb: XZ, col = "#8a5a3a", skip: [number, number][] = []) => {
  const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]), p = lam("wain" + col, () => ({ color: col })), dk = lam("wainD" + col, () => ({ color: new THREE.Color(col).multiplyScalar(0.72).getStyle() }));
  b.add(boxGeo(V(0, 0, 0), V(L, 0.95, 0.03)), p, onWall(a, bb, 0, 0));
  b.add(boxGeo(V(0, 0.92, 0), V(L, 0.99, 0.07)), dk, onWall(a, bb, 0, 0)); // chair rail
  b.add(boxGeo(V(0, 0, 0), V(L, 0.12, 0.06)), dk, onWall(a, bb, 0, 0));    // baseboard
  for (let u = 0.2; u + 0.6 < L; u += 0.8) if (!skip.some(([s0, s1]) => u + 0.6 > s0 && u < s1)) b.add(boxGeo(V(0, 0.22, 0), V(0.6, 0.8, 0.05)), dk, onWall(a, bb, u, 0)); // raised panels
};
const paintingTex = (kind: "landscape" | "portrait" | "sea" | "map", seed: number) => ctex(`paint_${kind}${seed}`, 256, 200, (g, r) => {
  const R = () => r();
  if (kind === "map") { // a regional map: cream paper, blue sea, green land, a red line (no text)
    g.fillStyle = "#eadfbf"; g.fillRect(0, 0, 256, 200); g.fillStyle = "#9cc4dc"; g.fillRect(0, 130, 256, 70);
    g.fillStyle = "#b9cf8a"; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 120 + Math.sin(x * 0.05 + seed) * 18 + R() * 8); g.lineTo(256, 0); g.fill();
    g.strokeStyle = "#c33"; g.lineWidth = 3; g.setLineDash([8, 5]); g.beginPath(); g.moveTo(30, 70); g.bezierCurveTo(90, 40, 150, 100, 230, 60); g.stroke(); g.setLineDash([]);
    return;
  }
  const sky = g.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, kind === "sea" ? "#7fb2de" : "#9cc7ea"); sky.addColorStop(1, "#f3e6c4"); g.fillStyle = sky; g.fillRect(0, 0, 256, 200);
  if (kind === "portrait") { g.fillStyle = "#4a3a4a"; g.fillRect(0, 0, 256, 200); g.fillStyle = "#2b2a30"; g.beginPath(); g.ellipse(128, 210, 80, 70, 0, 0, 7); g.fill(); g.fillStyle = "#f2d6b8"; g.beginPath(); g.ellipse(128, 95, 42, 52, 0, 0, 7); g.fill(); g.fillStyle = "#3a2a20"; g.beginPath(); g.ellipse(128, 60, 46, 26, 0, Math.PI, 0); g.fill(); g.fillRect(104, 112, 48, 8); return; }
  g.fillStyle = kind === "sea" ? "#3f78b0" : "#7aa860"; g.beginPath(); g.moveTo(0, 200); for (let x = 0; x <= 256; x += 8) g.lineTo(x, 120 + Math.sin(x * 0.03 + seed) * 22); g.lineTo(256, 200); g.fill();
  g.fillStyle = kind === "sea" ? "#f6f1e4" : "#5d8a4c"; for (let i = 0; i < 4; i++) { const x = 30 + R() * 200, y = 95 + R() * 30; g.beginPath(); if (kind === "sea") { g.moveTo(x, y); g.lineTo(x + 14, y - 30); g.lineTo(x + 20, y); } else g.ellipse(x, y, 14, 22, 0, 0, 7); g.fill(); }
});
/** a framed picture hung at height y (centre). Gilt or wood frame, painted canvas (no text) */
export const picture = (b: Batch, M: THREE.Matrix4, w: number, h: number, kind: "landscape" | "portrait" | "sea" | "map", seed = 1, gilt = true) => {
  const fr = gilt ? lam("gilt", () => ({ color: "#c9a24e" })) : lam("frameWood", () => ({ color: "#5a3a26" })), t = 0.07;
  b.add(boxGeo(V(-w / 2 - t, -h / 2 - t, 0), V(w / 2 + t, h / 2 + t, 0.035)), fr, M);
  b.add(quad(V(-w / 2, -h / 2, 0.04), V(w / 2, -h / 2, 0.04), V(w / 2, h / 2, 0.04), V(-w / 2, h / 2, 0.04)), lam(`canvas_${kind}${seed}`, () => ({ map: paintingTex(kind, seed) })), M);
};
const booksTex = (seed: number) => ctex("books" + seed, 256, 128, (g, r) => {
  g.fillStyle = "#3a2a20"; g.fillRect(0, 0, 256, 128);
  const cols = ["#8a2f2f", "#2f5a8a", "#2f7a4a", "#c9a24e", "#5a3a6a", "#a8724a", "#2b2a30", "#d8c8a0"];
  for (let x = 2; x < 254;) { const w = 7 + r() * 12, h = 84 + r() * 40; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, 128 - h, w, h); g.fillStyle = "rgba(255,230,160,0.55)"; g.fillRect(x + 2, 128 - h + 10, w - 4, 3); g.fillRect(x + 2, 116, w - 4, 3); x += w + 1; }
});
/** bookcase against a wall: carcass + shelves of painted spines. M = onWall(...) at floor height */
export const bookcase = (b: Batch, M: THREE.Matrix4, w = 1.2, h = 2.0, seed = 1) => {
  const wd = lam("caseWood", () => ({ color: "#6a4228" })), d = 0.35, n = Math.max(2, Math.round(h / 0.45));
  b.add(boxGeo(V(-w / 2, 0, 0), V(w / 2, h, 0.03)), wd, M);
  for (const s of [-1, 1]) b.add(boxGeo(V(s * w / 2 - 0.03, 0, 0), V(s * w / 2 + 0.03, h, d)), wd, M);
  for (let k = 0; k <= n; k++) b.add(boxGeo(V(-w / 2, (k * h) / n, 0), V(w / 2, (k * h) / n + 0.04, d)), wd, M);
  for (let k = 0; k < n; k++) { const y0 = (k * h) / n + 0.04, y1 = y0 + h / n - 0.1; b.add(quad(V(-w / 2 + 0.04, y0, d - 0.06), V(w / 2 - 0.04, y0, d - 0.06), V(w / 2 - 0.04, y1, d - 0.06), V(-w / 2 + 0.04, y1, d - 0.06)), lam("books" + ((seed + k) % 4), () => ({ map: booksTex((seed + k) % 4) })), M); }
};
const rugTex = (c1: string, c2: string, c3: string) => ctex(`rug${c1}${c2}`, 512, 512, (g) => {
  g.fillStyle = c1; g.fillRect(0, 0, 512, 512); g.fillStyle = c2; g.fillRect(28, 28, 456, 456); g.fillStyle = c1; g.fillRect(52, 52, 408, 408);
  g.fillStyle = c3; for (let i = 0; i < 10; i++) { g.save(); g.translate(256, 256); g.rotate((i / 10) * Math.PI * 2); g.beginPath(); g.ellipse(0, 90, 22, 52, 0, 0, 7); g.fill(); g.restore(); }
  g.fillStyle = c2; g.beginPath(); g.arc(256, 256, 40, 0, 7); g.fill();
  for (let x = 40; x < 480; x += 32) for (const y of [40, 472]) { g.fillStyle = c3; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 10, y); g.lineTo(x, y + 8); g.lineTo(x - 10, y); g.fill(); }
});
/** a patterned rug lying on the floor (floorY = top of the floor) */
export const rug = (b: Batch, x: number, z: number, w: number, d: number, floorY = 0.06, cols: [string, string, string] = ["#8a2f2f", "#d8b878", "#2f4a6a"], yaw = 0) => {
  const m = lam(`rugM${cols[0]}${cols[1]}`, () => ({ map: rugTex(...cols), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  b.add(boxGeo(V(-w / 2, 0, -d / 2), V(w / 2, 0.015, d / 2)), m, mat4(x, floorY, z, yaw));
};
/** a potted plant: clay pot + a leafy ball on stems */
export const plant = (b: Batch, x: number, z: number, h = 1.1, y = 0) => {
  b.add(new THREE.CylinderGeometry(0.2, 0.14, 0.32, 12).translate(x, y + 0.16, z), lam("pot", () => ({ color: "#c0643e" })));
  const lf = lam("leaf", () => ({ color: "#4f9a45" })), lf2 = lam("leaf2", () => ({ color: "#6ab656" }));
  for (let k = 0; k < 11; k++) { const a = k * 2.4, rr = k ? 0.12 + (k % 3) * 0.05 : 0; b.add(new THREE.IcosahedronGeometry(0.12 + (k % 2) * 0.04, 1).scale(1, 1.4, 1).translate(x + Math.cos(a) * rr, y + h - 0.3 + (k % 3) * 0.12 - (k ? 0.1 : 0), z + Math.sin(a) * rr), k % 2 ? lf : lf2); }
};
/** filing cabinet: a metal box with drawer fronts and brass handles */
export const cabinet = (b: Batch, M: THREE.Matrix4, w = 0.55, h = 1.3) => {
  const body = lam("cabinet", () => ({ color: "#6f7a6a" })), front = lam("cabinetF", () => ({ color: "#7f8a78" })), hd = lam("handle", () => ({ color: "#c9a24e" }));
  b.add(boxGeo(V(-w / 2, 0, 0), V(w / 2, h, 0.6)), body, M);
  for (let k = 0; k < 4; k++) { const y0 = 0.05 + (k * (h - 0.1)) / 4; b.add(boxGeo(V(-w / 2 + 0.03, y0 + 0.02, 0.6), V(w / 2 - 0.03, y0 + (h - 0.1) / 4 - 0.02, 0.62)), front, M); b.add(boxGeo(V(-0.07, y0 + (h - 0.1) / 8 - 0.015, 0.62), V(0.07, y0 + (h - 0.1) / 8 + 0.015, 0.65)), hd, M); }
};
/** wall clock (round, no numerals: tick marks only). Hands are static unless you pose them */
export const wallClock = (b: Batch, M: THREE.Matrix4, r = 0.22) => {
  b.add(new THREE.CylinderGeometry(r, r, 0.06, 24).rotateX(Math.PI / 2).translate(0, 0, 0.03), lam("clockRim", () => ({ color: "#5a3a26" })), M);
  b.add(new THREE.CircleGeometry(r * 0.85, 24).translate(0, 0, 0.065), lam("clockFace", () => ({ color: "#f6f1e4" })), M);
  const k = lam("clockHand", () => ({ color: "#2b2a30" }));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add(boxGeo(V(-0.008, r * 0.68, 0.066), V(0.008, r * 0.8, 0.07)).rotateZ(a), k, M); }
  b.add(boxGeo(V(-0.012, 0, 0.07), V(0.012, r * 0.55, 0.075)).rotateZ(-0.9), k, M);
  b.add(boxGeo(V(-0.01, 0, 0.075), V(0.01, r * 0.75, 0.08)).rotateZ(0.5), k, M);
};
/** curtains either side of a window (folds = vertical cylinders). M at the window centre-bottom on the wall */
export const curtains = (b: Batch, M: THREE.Matrix4, winW: number, h: number, col = "#9a2f3a") => {
  const c = lam("curtain" + col, () => ({ color: col })), rod = lam("rod", () => ({ color: "#c9a24e" }));
  b.add(new THREE.CylinderGeometry(0.025, 0.025, winW + 1.2, 8).rotateZ(Math.PI / 2).translate(0, h + 0.12, 0.12), rod, M);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) b.add(new THREE.CylinderGeometry(0.07, 0.09, h + 0.1, 8).translate(s * (winW / 2 + 0.05 + k * 0.11), (h + 0.1) / 2, 0.12), c, M);
};
/** small things on a desk top at height y: paper stacks, a book pile, a pen pot, a candlestick telephone */
export const deskClutter = (b: Batch, x: number, y: number, z: number, seed = 1, phone = false, books = true) => {
  const r = rng(seed), paper = lam("paperS", () => ({ color: "#f6efd9" })), paper2 = lam("paperS2", () => ({ color: "#e9dfc2" }));
  for (let k = 0; k < 2; k++) { const px = x + (k ? 0.45 : -0.35), pz = z + r() * 0.2, n = 3 + Math.floor(r() * 4); for (let j = 0; j < n; j++) b.add(boxGeo(V(-0.14, 0, -0.1), V(0.14, 0.012, 0.1)).rotateY((r() - 0.5) * 0.3), j % 2 ? paper : paper2, mat4(px, y + j * 0.012, pz)); }
  const bc = ["#8a2f2f", "#2f5a8a", "#2f7a4a"];
  if (books) for (let j = 0; j < 3; j++) b.add(boxGeo(V(-0.13, 0, -0.09), V(0.13, 0.045, 0.09)), lam("bookD" + bc[j], () => ({ color: bc[j] })), mat4(x + 0.05, y + j * 0.045, z - 0.25, (r() - 0.5) * 0.4));
  b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10).translate(x - 0.6, y + 0.05, z - 0.2), lam("penPot", () => ({ color: "#3a5a7a" })));
  for (let j = 0; j < 3; j++) b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4).rotateZ((j - 1) * 0.2).translate(x - 0.6 + (j - 1) * 0.01, y + 0.13, z - 0.2), lam("pen", () => ({ color: "#2b2a30" })));
  if (phone) { const k = lam("phone", () => ({ color: "#2b2a30" })); b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.03, 12).translate(x + 0.75, y + 0.015, z - 0.25), k); b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8).translate(x + 0.75, y + 0.17, z - 0.25), k); b.add(new THREE.CylinderGeometry(0.035, 0.025, 0.06, 10).translate(x + 0.75, y + 0.33, z - 0.25), k); }
};

// ---------------- ambient life (animated, deterministic) ----------------
/** a loose flock of birds (dark V shapes, flapping) circling far off. Reference: one or two birds glide through
 *  most outdoor skies. place(...) once per frame with the shot's anchor; they never bounce */
export class Birds {
  private birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; ph: number; rad: number; h: number; sp: number }[] = [];
  constructor(root: THREE.Object3D, n = 5) {
    const mat = new THREE.MeshBasicMaterial({ color: "#2b2a30", side: THREE.DoubleSide, fog: false });
    const wing = new THREE.BufferGeometry(); wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.12, 1, 0, 0.1], 3));
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(), l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat); r.scale.x = -1;
      g.add(l, r); g.layers.set(NOINK); l.layers.set(NOINK); r.layers.set(NOINK); g.visible = false; root.add(g);
      this.birds.push({ g, l, r, ph: hash(i, 3) * 6.28, rad: 8 + hash(i, 4) * 10, h: hash(i, 5) * 6, sp: 0.18 + hash(i, 6) * 0.1 });
    }
  }
  /** centre = a point in the sky the shot sees (e.g. focus + forward*60 + up*25); size = wingspan scale in m */
  place(t: number, centre: THREE.Vector3 | null, size = 0.9) {
    for (const [i, b] of this.birds.entries()) {
      b.g.visible = !!centre; if (!centre) continue;
      const a = b.ph + t * b.sp * (i % 2 ? 1 : -1);
      b.g.position.set(centre.x + Math.cos(a) * b.rad, centre.y + b.h + Math.sin(t * 0.7 + i) * 0.6, centre.z + Math.sin(a) * b.rad * 0.6);
      b.g.rotation.set(0, -a + (i % 2 ? 0 : Math.PI), 0);
      const flap = (i % 3 === 0 && Math.sin(t * 0.9 + i) > 0.3) ? 0.15 : Math.sin(t * 11 + b.ph) * 0.6; // some glide, some flap
      b.l.rotation.z = flap; b.r.rotation.z = -flap; b.g.scale.setScalar(size);
    }
  }
}
const leafDraw = (col: string) => (p: { g: CanvasRenderingContext2D }) => {
  const g = p.g; g.translate(32, 32); g.fillStyle = col; g.strokeStyle = "#2b1d1a"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(22, -4, 0, 26); g.quadraticCurveTo(-22, -4, 0, -26); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 22); g.lineWidth = 2.5; g.stroke(); g.setTransform(1, 0, 0, 1, 0, 0);
};
/** falling leaves drifting and spinning down around `c` (loops forever). Autumn / tree shots */
export const leaves = (t: number, c: V3, seed = 1, o: { n?: number; radius?: number; height?: number; size?: number; cols?: string[] } = {}): FxCard[] => {
  const n = o.n ?? 10, R = o.radius ?? 4, H = o.height ?? 4, s = o.size ?? 0.12, cols = o.cols ?? ["#e0902e", "#c9562f", "#e8c04a", "#9a6a2a"], out: FxCard[] = [];
  for (let i = 0; i < n; i++) {
    const per = 4 + hash(i, seed) * 3, u = ((t + hash(i, seed + 1) * per) % per) / per, col = cols[i % cols.length];
    const a = hash(i, seed + 2) * 6.28, d = R * Math.sqrt(hash(i, seed + 3));
    out.push({ key: "leaf" + col, cw: 64, ch: 64, draw: leafDraw(col) as never, x: c[0] + Math.cos(a) * d + Math.sin(t * 1.6 + i) * 0.35, y: c[1] + H * (1 - u), z: c[2] + Math.sin(a) * d, w: s, h: s, rot: t * (2 + (i % 3)) + i });
  }
  return out;
};
const smokeDraw = (p: { g: CanvasRenderingContext2D }) => { const g = p.g, gr = g.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, "rgba(236,232,226,0.85)"); gr.addColorStop(1, "rgba(236,232,226,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); };
/** chimney smoke: soft puffs rising, growing and fading, drifting with the wind */
export const smoke = (t: number, c: V3, seed = 1, o: { n?: number; rise?: number; size?: number; wind?: [number, number] } = {}): FxCard[] => {
  const n = o.n ?? 6, rise = o.rise ?? 3, s = o.size ?? 0.7, [wx, wz] = o.wind ?? [0.6, 0], out: FxCard[] = [];
  for (let i = 0; i < n; i++) { const u = (t * 0.35 + i / n + hash(seed, 9)) % 1, k = s * (0.5 + u * 1.6); out.push({ key: "smoke", cw: 128, ch: 128, draw: smokeDraw as never, soft: true, x: c[0] + wx * u * rise, y: c[1] + u * rise, z: c[2] + wz * u * rise, w: k * (1 - u * 0.3), h: k * (1 - u * 0.3) }); }
  return out;
};
/** dust motes floating in a sunbeam (indoors): tiny glowing dots that drift slowly */
export const motes = (t: number, c: V3, seed = 1, o: { n?: number; size?: [number, number, number] } = {}): FxCard[] => {
  const [sx, sy, sz] = o.size ?? [1.2, 1.4, 1.2], out: FxCard[] = [];
  for (let i = 0; i < (o.n ?? 14); i++) out.push({ key: "mote", cw: 32, ch: 32, draw: ((p: { g: CanvasRenderingContext2D }) => { const g = p.g, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }) as never,
    x: c[0] + (hash(i, seed) - 0.5) * sx + Math.sin(t * 0.4 + i) * 0.08, y: c[1] + (((hash(i, seed + 1) + t * 0.03) % 1) - 0.5) * sy, z: c[2] + (hash(i, seed + 2) - 0.5) * sz, w: 0.025, h: 0.025, glow: 1.6, tint: [1, 0.85, 0.6] });
  return out;
};
