// The carts of "The Cart Nobody Would Push" as real 3D props (they turn with the camera, cast shadows, take ink):
//  - goldmanCart(): the 1937 folding-chair cart: a tubular frame on four casters, a wire basket on top and one below,
//    a push bar at the back. Groceries (goods1..3) sit in the baskets by fill level.
//  - nestCart(): Watson's 1946 telescoping cart: one tapered basket with a swinging back gate, so carts nest.
//  - chairParts(): the wooden folding chair from the CHAIR shot plus the parts that pop onto it (basket on the seat,
//    basket underneath, wheels on the legs).
// Local axes: +z = the cart's front (its direction of travel), y up, origin on the floor under the middle.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lam } from "./build";
import { ctex } from "./paint";
import { glossy, chrome } from "./glow";

type Part = [THREE.BufferGeometry, THREE.Material];
const nonIdx = (g: THREE.BufferGeometry) => { const x = g.index ? g.toNonIndexed() : g; if (!x.attributes.uv) x.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; };
/** merge parts per material into one mesh each */
const merged = (parts: Part[], name = "") => {
  const g = new THREE.Group(); g.name = name;
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) { const l = by.get(m); const n = nonIdx(geo); if (l) l.push(n); else by.set(m, [n]); }
  for (const [m, list] of by) { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = true; me.receiveShadow = true; g.add(me); }
  return g;
};
/** a tube from a to b */
const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------- materials ----------------
const wireTex = () => ctex("cartWire", 128, 128, (g) => {
  g.clearRect(0, 0, 128, 128); g.strokeStyle = "#e8ecf0"; g.lineWidth = 7;
  for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
});
export const M = {
  wire: () => { const m = lam("cartWireM", () => ({ map: wireTex(), alphaTest: 0.5, side: THREE.DoubleSide, color: "#c9d2da" })); return m; },
  frame: () => chrome(),
  red: () => glossy("#c8322a", 70, 0.6),
  rubber: () => lam("cartRubber", () => ({ color: "#2b2a30" })),
  wood: () => lam("chairWood", () => ({ color: "#b07a48" })),
  woodD: () => lam("chairWoodD", () => ({ color: "#86552e" })),
};

/** an open-topped wire box (x0..x1, y0..y1, z0..z1) with a solid rim along the top edges */
const basket = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, out: Part[], taper = 0) => {
  const W = M.wire(), F = M.frame(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, h = y1 - y0;
  // bottom (smaller when tapered)
  const bw = w * (1 - taper), bd = d * (1 - taper * 0.5);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3, ru: number, rv: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, e].flatMap((v) => [v.x, v.y, v.z]), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, ru, 0, ru, rv, 0, 0, ru, rv, 0, rv], 2));
    g.computeVertexNormals(); return g;
  };
  const b00 = P(cx - bw / 2, y0, cz - bd / 2), b10 = P(cx + bw / 2, y0, cz - bd / 2), b11 = P(cx + bw / 2, y0, cz + bd / 2), b01 = P(cx - bw / 2, y0, cz + bd / 2);
  const t00 = P(x0, y1, z0), t10 = P(x1, y1, z0), t11 = P(x1, y1, z1), t01 = P(x0, y1, z1);
  const k = 7; // wire squares per metre-ish
  out.push([quad(b00, b10, b11, b01, w * k, d * k), W]);
  out.push([quad(b00, b10, t10, t00, w * k, h * k), W]); out.push([quad(b01, b11, t11, t01, w * k, h * k), W]);
  out.push([quad(b00, b01, t01, t00, d * k, h * k), W]); out.push([quad(b10, b11, t11, t10, d * k, h * k), W]);
  const r = 0.011;
  for (const [a, b] of [[t00, t10], [t10, t11], [t11, t01], [t01, t00], [b00, b10], [b10, b11], [b11, b01], [b01, b00], [b00, t00], [b10, t10], [b11, t11], [b01, t01]] as const) out.push([tube(a, b, r, 6), F]);
};
/** a caster: fork + wheel at (x, z) */
const caster = (x: number, z: number, out: Part[], R = 0.065) => {
  out.push([new THREE.CylinderGeometry(R, R, 0.035, 14).rotateZ(Math.PI / 2).translate(x, R, z), M.rubber()]);
  out.push([new THREE.CylinderGeometry(R * 0.45, R * 0.45, 0.04, 10).rotateZ(Math.PI / 2).translate(x, R, z), M.frame()]);
  out.push([tube(P(x, R, z), P(x, R + 0.09, z), 0.01, 6), M.frame()]);
};

// ---------------- groceries ----------------
const GOODS: [string, "can" | "box" | "loaf" | "bottle" | "ball", number][] = [
  ["#d23b3b", "can", 0.06], ["#f2c94c", "box", 0.1], ["#e0b06a", "loaf", 0.09], ["#f6f4ee", "bottle", 0.12], ["#7ab04a", "ball", 0.07],
  ["#3f6fb5", "box", 0.11], ["#f08a2c", "ball", 0.06], ["#d23b3b", "box", 0.09], ["#2f8a4f", "can", 0.06], ["#c25a7a", "box", 0.08],
];
const good = (i: number, x: number, y: number, z: number, out: Part[]) => {
  const [col, kind, s] = GOODS[i % GOODS.length], m = kind === "bottle" ? glossy(col, 90, 0.7) : lam("good" + col + kind, () => ({ color: col }));
  const yaw = i * 0.7;
  let g: THREE.BufferGeometry;
  if (kind === "can") g = new THREE.CylinderGeometry(s, s, s * 2.2, 12).translate(0, s * 1.1, 0);
  else if (kind === "box") g = new THREE.BoxGeometry(s * 1.4, s * 2.0, s * 0.8).translate(0, s, 0);
  else if (kind === "loaf") g = new THREE.SphereGeometry(s, 12, 8).scale(1.6, 0.8, 0.9).translate(0, s * 0.7, 0);
  else if (kind === "bottle") g = new THREE.CylinderGeometry(s * 0.35, s * 0.4, s * 2.0, 12).translate(0, s, 0);
  else g = new THREE.SphereGeometry(s, 12, 8).translate(0, s, 0);
  out.push([g.rotateY(yaw).translate(x, y, z), m]);
  if (kind === "can") out.push([new THREE.CylinderGeometry(s * 1.01, s * 1.01, s * 0.7, 12).rotateY(yaw).translate(x, y + s * 1.1, z), lam("label" + i % 3, () => ({ color: ["#f6f1e4", "#f2c94c", "#3f6fb5"][i % 3] }))]);
};
/** goods heaped in a basket box (x0..x1 at floor y, z0..z1): n items in layers, heap rises in the middle */
const fillBox = (x0: number, x1: number, y: number, z0: number, z1: number, n: number, seed: number, out: Part[], heap = 0) => {
  for (let i = 0; i < n; i++) {
    const cols = 3, row = Math.floor(i / cols) % 2, lay = Math.floor(i / (cols * 2));
    const u = ((i % cols) + 0.5) / cols, v = (row + 0.5) / 2;
    const x = x0 + (x1 - x0) * (0.15 + 0.7 * u) + 0.02 * Math.sin(i * 3 + seed), z = z0 + (z1 - z0) * (0.2 + 0.6 * v);
    const h = lay * 0.14 * (1 + heap) + heap * 0.12 * Math.sin(Math.PI * u) * lay;
    good(i + seed, x, y + h, z, out);
  }
};

// ---------------- the 1937 cart ----------------
const GX = 0.27, GZ = 0.22;
export const GOLD_TOP: [number, number] = [0.6, 0.86], GOLD_LOW: [number, number] = [0.17, 0.38];
const goldParts = (frame: Part[], top: Part[], low: Part[], wheels: Part[]) => {
  const F = M.frame();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push([tube(P(sx * GX, 0.14, sz * GZ), P(sx * GX, sz < 0 ? 1.02 : 0.9, sz * GZ), 0.014), F]);
  for (const sx of [-1, 1]) { frame.push([tube(P(sx * GX, 0.9, GZ), P(sx * GX, 1.02, -GZ - 0.06), 0.012), F]); }
  frame.push([tube(P(-GX - 0.04, 1.02, -GZ - 0.06), P(GX + 0.04, 1.02, -GZ - 0.06), 0.02), M.red()]); // the push bar (red grip)
  for (const sx of [-1, 1]) frame.push([tube(P(sx * GX, 1.02, -GZ), P(sx * GX, 1.02, -GZ - 0.06), 0.013), F]);
  // the folding-chair X braces on each side
  for (const sx of [-1, 1]) { frame.push([tube(P(sx * GX, 0.14, -GZ), P(sx * GX, 0.55, GZ), 0.01), F]); frame.push([tube(P(sx * GX, 0.14, GZ), P(sx * GX, 0.55, -GZ), 0.01), F]); }
  basket(-GX + 0.01, GX - 0.01, GOLD_TOP[0], GOLD_TOP[1], -GZ + 0.01, GZ - 0.01, top);
  basket(-GX + 0.01, GX - 0.01, GOLD_LOW[0], GOLD_LOW[1], -GZ + 0.01, GZ - 0.01, low);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(sx * GX, sz * GZ, wheels);
};
export const goldmanCart = () => {
  const g = new THREE.Group(), frame: Part[] = [], top: Part[] = [], low: Part[] = [], wheels: Part[] = [];
  goldParts(frame, top, low, wheels);
  g.add(merged([...frame, ...top, ...low, ...wheels], "body"));
  // goods by fill level (1: a few things on top; 2: both baskets; 3: heaped high)
  const g1: Part[] = [], g2: Part[] = [], g3: Part[] = [];
  fillBox(-GX, GX, GOLD_TOP[0] + 0.01, -GZ, GZ, 3, 0, g1);
  fillBox(-GX, GX, GOLD_TOP[0] + 0.01, -GZ, GZ, 3, 3, g2); fillBox(-GX, GX, GOLD_LOW[0] + 0.01, -GZ, GZ, 5, 6, g2);
  fillBox(-GX, GX, GOLD_TOP[0] + 0.15, -GZ, GZ, 14, 11, g3, 0.6);
  // later layers sit above the earlier ones
  for (const [parts, name] of [[g1, "goods1"], [g2, "goods2"], [g3, "goods3"]] as const) { const m = merged(parts, name); m.visible = false; g.add(m); }
  return g;
};

// ---------------- the 1946 telescoping cart ----------------
export const NEST_STEP = 0.24; // nested carts sit this far apart
export const nestCart = () => {
  const parts: Part[] = [], F = M.frame();
  // the basket: wide at the back, narrow at the front, high up; the back gate is the basket's back face
  basket(-0.28, 0.28, 0.55, 0.92, -0.42, 0.42, parts, 0.35);
  // the low frame: two side rails sloping down to the casters, a narrow front so the next cart slides in
  for (const sx of [-1, 1]) {
    parts.push([tube(P(sx * 0.26, 0.14, -0.4), P(sx * 0.18, 0.14, 0.42), 0.014), F]);
    parts.push([tube(P(sx * 0.27, 0.14, -0.42), P(sx * 0.29, 1.02, -0.5), 0.015), F]);
    parts.push([tube(P(sx * 0.18, 0.14, 0.42), P(sx * 0.2, 0.55, 0.42), 0.012), F]);
    parts.push([tube(P(sx * 0.26, 0.55, -0.42), P(sx * 0.2, 0.55, 0.4), 0.01), F]);
  }
  parts.push([tube(P(-0.32, 1.02, -0.5), P(0.32, 1.02, -0.5), 0.02), M.red()]);
  for (const [x, z] of [[-0.26, -0.4], [0.26, -0.4], [-0.18, 0.42], [0.18, 0.42]] as const) caster(x, z, parts);
  const g = new THREE.Group(); g.add(merged(parts, "body"));
  return g;
};

// ---------------- the folding chair that becomes a cart ----------------
/** groups: chair (wood), top (basket on the seat), low (basket underneath), wheels (casters on the legs) */
export const chairParts = () => {
  const W = M.wood(), Wd = M.woodD(), chair: Part[] = [];
  // a slatted wooden folding chair: back legs run up into the backrest, front legs cross them under the seat
  for (const sx of [-1, 1]) {
    chair.push([new THREE.BoxGeometry(0.04, 1.0, 0.04).translate(0, 0.5, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.12)).translate(sx * GX, 0.02, -GZ + 0.02), Wd]);
    chair.push([new THREE.BoxGeometry(0.04, 0.66, 0.04).translate(0, 0.33, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(0.22)).translate(sx * GX, 0.0, GZ - 0.04), Wd]);
  }
  for (let k = 0; k < 5; k++) chair.push([new THREE.BoxGeometry(0.58, 0.022, 0.07).translate(0, 0.56, -GZ + 0.04 + k * 0.095), W]); // seat slats
  for (let k = 0; k < 3; k++) chair.push([new THREE.BoxGeometry(0.58, 0.07, 0.022).translate(0, 0.78 + k * 0.1, -GZ - 0.06 + k * 0.012), W]); // back slats
  chair.push([new THREE.BoxGeometry(0.58, 0.03, 0.03).translate(0, 0.2, 0), Wd]);
  const top: Part[] = [], low: Part[] = [], wheels: Part[] = [];
  basket(-GX + 0.01, GX - 0.01, 0.58, 0.82, -GZ + 0.01, GZ - 0.01, top);
  basket(-GX + 0.01, GX - 0.01, 0.17, 0.38, -GZ + 0.01, GZ - 0.01, low);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(sx * GX, sz * GZ, wheels, 0.06);
  return { chair: merged(chair, "chair"), top: merged(top, "top"), low: merged(low, "low"), wheels: merged(wheels, "wheels") };
};
