// Architecture kit: buildings and street objects built from many small parts, the way the reference shorts
// (audio-sample/) build them. Measured on the samples: no wall is a bare box. Every building shows
//   - a plinth (stone or dark board) where it meets the ground, and corner boards proud of the wall,
//   - siding with readable courses (clapboard / board-and-batten / logs), a frieze board under the eaves,
//   - windows with a casing, a deeper sill, a header cap, a cross mullion, glass with a painted sky + two white
//     streaks, curtains inside, and often shutters or a flower box,
//   - a door with a casing, two raised panels, a knob, a transom and a step,
//   - a roof with THICKNESS, an overhang, fascia and barge boards and a ridge cap (never a paper-thin quad),
//   - a chimney with a cap, a porch / boardwalk with posts, brackets and a railing, a lantern by the door,
//   - clutter at its feet: barrels, crates, a bench, a rain barrel, a woodpile.
// The parts are what make the ink pass draw lots of small interior lines, which is most of the "detailed" look.
// No text anywhere: signs carry pictograms (pick, loaf, bed, anvil, bottle, coin, shovel).
// Everything is STATIC (merged into the Batch). Local frame of a building: footprint centred on the origin,
// ground at y = 0, the FRONT faces +z, x runs across the front. Pass a matrix to place / turn it.
// Copy next to build.ts / paint.ts / dressing.ts.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, tri } from "./build";
import { ctex, rep, rng, roofHD, stoneHD } from "./paint";

type M4 = THREE.Matrix4;
const E = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")).setPosition(x, y, z);
const dk = (c: string, k: number) => "#" + new THREE.Color(c).multiplyScalar(k).getHexString();
const lt = (c: string, k: number) => "#" + new THREE.Color(c).lerp(new THREE.Color("#ffffff"), k).getHexString();
const flatM = (c: string) => lam("arch_" + c, () => ({ color: c }));

/** a local "pen": every piece goes through the building matrix */
const pen = (b: Batch, M: M4) => {
  const add = (g: THREE.BufferGeometry, m: THREE.Material, L?: M4) => b.add(g, m, L ? M.clone().multiply(L) : M);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, L?: M4, tile = 0) =>
    add(boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile), m, L);
  return { add, box };
};

// ---------------- textures ----------------
/** siding: "clap" (horizontal lap boards with a shadow under each), "board" (board and batten), "log" (round logs with
 *  light chinking), "plank" (weathered vertical planks). 512 px = 2 m: use tile 2 on boxGeo */
export type Siding = "clap" | "board" | "log" | "plank" | "brick";
export const sidingTex = (col: string, kind: Siding) => ctex(`siding_${kind}_${col}`, 512, 512, (g, r) => {
  const c = new THREE.Color(col), s = (k: number) => "#" + c.clone().multiplyScalar(k).getHexString();
  g.fillStyle = col; g.fillRect(0, 0, 512, 512);
  if (kind === "clap") {
    for (let y = 0; y < 512; y += 51) {
      const gr = g.createLinearGradient(0, y, 0, y + 51); gr.addColorStop(0, s(1.08)); gr.addColorStop(0.85, s(0.94)); gr.addColorStop(1, s(0.62));
      g.fillStyle = gr; g.fillRect(0, y, 512, 51);
      for (let k = 0; k < 2; k++) { const x = r() * 512; g.fillStyle = s(0.7); g.fillRect(x, y, 2, 51); }               // board butt joints
    }
  } else if (kind === "board" || kind === "plank") {
    const bw = kind === "board" ? 64 : 42;
    for (let x = 0; x < 512; x += bw) {
      g.fillStyle = s(0.9 + r() * 0.2); g.fillRect(x, 0, bw, 512);
      g.fillStyle = s(0.6); g.fillRect(x, 0, 3, 512);
      if (kind === "board") { g.fillStyle = s(1.12); g.fillRect(x - 7, 0, 14, 512); g.fillStyle = s(0.7); g.fillRect(x + 7, 0, 3, 512); } // batten + its shadow
      for (let k = 0; k < 4; k++) { g.fillStyle = s(0.78); g.fillRect(x + 8 + r() * (bw - 16), r() * 512, 2, 30 + r() * 80); } // grain
      g.fillStyle = s(0.45); for (const y of [40, 470]) { g.beginPath(); g.arc(x + bw / 2, y, 3, 0, 7); g.fill(); }        // nails
    }
  } else if (kind === "brick") {
    // running bond, 16 courses per 2 m: each brick a slightly different tone, light mortar, a dark lower lip per course
    g.fillStyle = "#d8cbb8"; g.fillRect(0, 0, 512, 512);
    for (let y = 0, row = 0; y < 512; y += 32, row++) for (let x = (row % 2) * -32; x < 512; x += 64) {
      g.fillStyle = s(0.82 + r() * 0.3); g.fillRect(x + 3, y + 3, 58, 26);
      g.fillStyle = s(0.6); g.fillRect(x + 3, y + 25, 58, 4);
      if (r() < 0.25) { g.fillStyle = "rgba(255,240,220,0.12)"; g.fillRect(x + 8, y + 6, 20, 6); }
    }
  } else {
    for (let y = 0; y < 512; y += 64) {
      const gr = g.createLinearGradient(0, y, 0, y + 64); gr.addColorStop(0, s(0.72)); gr.addColorStop(0.3, s(1.12)); gr.addColorStop(0.75, s(0.95)); gr.addColorStop(1, s(0.6));
      g.fillStyle = gr; g.fillRect(0, y + 3, 512, 58);
      g.fillStyle = "#e8dcc4"; g.fillRect(0, y, 512, 3);                                                                 // chinking
      for (let k = 0; k < 6; k++) { g.strokeStyle = s(0.7); g.lineWidth = 2; const x = r() * 512; g.beginPath(); g.moveTo(x, y + 18 + r() * 20); g.lineTo(x + 40 + r() * 60, y + 22 + r() * 20); g.stroke(); }
    }
  }
  // weathering: darker splash band at the foot, faint streaks down from the top
  const foot = g.createLinearGradient(0, 430, 0, 512); foot.addColorStop(0, "rgba(60,40,25,0)"); foot.addColorStop(1, "rgba(60,40,25,0.28)");
  g.fillStyle = foot; g.fillRect(0, 430, 512, 82);
  for (let k = 0; k < 10; k++) { g.fillStyle = "rgba(40,30,20,0.06)"; g.fillRect(r() * 512, 0, 6 + r() * 14, 80 + r() * 200); }
});
/** window glass by day: painted sky gradient, a darker lower half (the room), two white diagonal streaks */
export const glassTex = (lit: boolean) => ctex(lit ? "glassLit" : "glassDay", 128, 128, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 128);
  if (lit) { gr.addColorStop(0, "#ffe2a0"); gr.addColorStop(1, "#ffb860"); } else { gr.addColorStop(0, "#cfe6f5"); gr.addColorStop(0.55, "#8fb8d6"); gr.addColorStop(0.56, "#5d7f9c"); gr.addColorStop(1, "#4a6a86"); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineCap = "round";
  for (const [x, w] of [[30, 12], [58, 6]] as const) { g.lineWidth = w; g.beginPath(); g.moveTo(x, 118); g.lineTo(x + 50, 10); g.stroke(); }
});

// ---------------- pictograms (signs carry shapes, never words) ----------------
export type Picto = "pick" | "shovel" | "loaf" | "bed" | "anvil" | "bottle" | "coin" | "tooth" | "boot" | "cross" | "flask" | "egg" | "cart";
const shapeGeo = (draw: (s: THREE.Shape) => void, depth = 0.03) => { const s = new THREE.Shape(); draw(s); return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }); };
/** a pictogram ~1 m across centred on the origin in the xy plane, 3 cm thick toward +z */
export const pictoGeo = (k: Picto): THREE.BufferGeometry[] => {
  const rect = (x0: number, y0: number, x1: number, y1: number) => shapeGeo((s) => { s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); });
  const ell = (cx: number, cy: number, rx: number, ry: number) => shapeGeo((s) => s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0));
  switch (k) {
    case "pick": return [rect(-0.05, -0.45, 0.05, 0.3), shapeGeo((s) => { s.moveTo(-0.45, 0.18); s.quadraticCurveTo(0, 0.48, 0.45, 0.18); s.lineTo(0.42, 0.12); s.quadraticCurveTo(0, 0.36, -0.42, 0.12); s.closePath(); })];
    case "shovel": return [rect(-0.04, -0.1, 0.04, 0.45), rect(-0.14, 0.4, 0.14, 0.47), shapeGeo((s) => { s.moveTo(-0.2, -0.1); s.lineTo(0.2, -0.1); s.lineTo(0.18, -0.35); s.quadraticCurveTo(0, -0.52, -0.18, -0.35); s.closePath(); })];
    case "loaf": return [shapeGeo((s) => { s.moveTo(-0.45, -0.15); s.lineTo(0.45, -0.15); s.quadraticCurveTo(0.5, 0.3, 0, 0.3); s.quadraticCurveTo(-0.5, 0.3, -0.45, -0.15); })];
    case "bed": return [rect(-0.45, -0.1, 0.45, 0.05), rect(-0.45, -0.3, -0.38, 0.3), rect(0.38, -0.3, 0.45, 0.1), ell(-0.25, 0.12, 0.1, 0.07)];
    case "anvil": return [shapeGeo((s) => { s.moveTo(-0.45, 0.2); s.lineTo(0.35, 0.2); s.lineTo(0.35, 0.05); s.lineTo(0.1, 0.0); s.lineTo(0.15, -0.2); s.lineTo(0.3, -0.3); s.lineTo(-0.25, -0.3); s.lineTo(-0.1, -0.2); s.lineTo(-0.05, 0.0); s.quadraticCurveTo(-0.35, 0.05, -0.45, 0.2); })];
    case "bottle": return [rect(-0.05, 0.15, 0.05, 0.42), shapeGeo((s) => { s.moveTo(-0.16, -0.42); s.lineTo(0.16, -0.42); s.lineTo(0.16, 0.05); s.quadraticCurveTo(0.12, 0.18, 0, 0.18); s.quadraticCurveTo(-0.12, 0.18, -0.16, 0.05); s.closePath(); })];
    case "coin": return [ell(0, 0, 0.4, 0.4)];
    case "tooth": return [shapeGeo((s) => { s.moveTo(-0.3, 0.3); s.quadraticCurveTo(0, 0.45, 0.3, 0.3); s.lineTo(0.22, -0.4); s.lineTo(0.08, -0.4); s.lineTo(0, -0.1); s.lineTo(-0.08, -0.4); s.lineTo(-0.22, -0.4); s.closePath(); })];
    case "cross": return [rect(-0.13, -0.42, 0.13, 0.42), rect(-0.42, -0.13, 0.42, 0.13)];
    case "flask": return [rect(-0.07, 0.1, 0.07, 0.42), shapeGeo((s) => { s.moveTo(-0.07, 0.1); s.lineTo(0.07, 0.1); s.lineTo(0.36, -0.36); s.quadraticCurveTo(0.38, -0.42, 0.3, -0.42); s.lineTo(-0.3, -0.42); s.quadraticCurveTo(-0.38, -0.42, -0.36, -0.36); s.closePath(); })];
    case "egg": return [shapeGeo((s) => { s.moveTo(0, 0.5); s.bezierCurveTo(0.17, 0.5, 0.29, 0.18, 0.29, -0.02); s.bezierCurveTo(0.29, -0.2, 0.16, -0.3, 0, -0.3); s.bezierCurveTo(-0.16, -0.3, -0.29, -0.2, -0.29, -0.02); s.bezierCurveTo(-0.29, 0.18, -0.17, 0.5, 0, 0.5); }),
      rect(-0.46, -0.5, 0.46, -0.34), rect(-0.46, -0.33, -0.2, -0.31), rect(0.2, -0.33, 0.46, -0.31)];
    case "cart": return [shapeGeo((s) => { s.moveTo(-0.42, 0.25); s.lineTo(0.38, 0.25); s.lineTo(0.28, -0.12); s.lineTo(-0.3, -0.12); s.closePath(); }), rect(-0.48, 0.22, -0.38, 0.42), ell(-0.22, -0.3, 0.09, 0.09), ell(0.18, -0.3, 0.09, 0.09)];
    case "boot": return [shapeGeo((s) => { s.moveTo(-0.2, 0.42); s.lineTo(0.1, 0.42); s.lineTo(0.1, -0.15); s.lineTo(0.42, -0.25); s.lineTo(0.42, -0.42); s.lineTo(-0.2, -0.42); s.closePath(); })];
  }
};

// ---------------- building parts (each on a wall matrix: local z = out of the wall, y = up, origin at the wall surface) ----------------
export type WinOpts = { lit?: boolean; shutters?: string; curtains?: string; box?: boolean; panes?: 1 | 2 | 4 | 6 };
/** a window centred at (0, 0) on the wall: casing, sill, header cap, mullions, glass, curtains, shutters, flower box */
export const windowAt = (b: Batch, L: M4, w: number, h: number, trim: string, o: WinOpts = {}) => {
  const { add, box } = pen(b, L), T = flatM(trim), Td = flatM(dk(trim, 0.72)), c = 0.09;
  add(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.015), lam(o.lit ? "glassLitM" : "glassDayM", () => ({ map: glassTex(!!o.lit), ...(o.lit ? { emissive: new THREE.Color("#ffb860"), emissiveIntensity: 0.55 } : {}) })));
  if (o.curtains) { const C = flatM(o.curtains); for (const s of [-1, 1]) add(new THREE.PlaneGeometry(w * 0.22, h * 0.92).translate(s * w * 0.38, 0.02, 0.02), C); add(new THREE.PlaneGeometry(w * 0.98, h * 0.12).translate(0, h * 0.42, 0.022), C); }
  box(-w / 2 - c, -h / 2 - c, 0, w / 2 + c, -h / 2, 0.06, T); box(-w / 2 - c, h / 2, 0, w / 2 + c, h / 2 + c, 0.06, T);     // casing
  box(-w / 2 - c, -h / 2, 0, -w / 2, h / 2, 0.06, T); box(w / 2, -h / 2, 0, w / 2 + c, h / 2, 0.06, T);
  box(-w / 2 - c - 0.07, -h / 2 - c - 0.06, 0, w / 2 + c + 0.07, -h / 2 - c + 0.01, 0.14, Td);                               // sill
  box(-w / 2 - c - 0.06, h / 2 + c, 0, w / 2 + c + 0.06, h / 2 + c + 0.07, 0.1, Td);                                        // header cap
  const panes = o.panes ?? 4, m = 0.035;
  if (panes >= 2) box(-m / 2, -h / 2, 0.01, m / 2, h / 2, 0.045, T);
  if (panes >= 4) box(-w / 2, -m / 2, 0.01, w / 2, m / 2, 0.045, T);
  if (panes >= 6) for (const s of [-1, 1]) box(s * w / 4 - m / 2, -h / 2, 0.01, s * w / 4 + m / 2, h / 2, 0.045, T);
  if (o.shutters) {
    const S = flatM(o.shutters), Sd = flatM(dk(o.shutters, 0.7)), sw = w * 0.5;
    for (const s of [-1, 1]) {
      const x0 = s * (w / 2 + c + 0.03), x1 = x0 + s * sw;
      box(x0, -h / 2 - 0.02, 0.0, x1, h / 2 + 0.02, 0.04, S);
      for (let k = 1; k < 7; k++) box(x0 + s * 0.04, -h / 2 + (k * h) / 7 - 0.012, 0.04, x1 - s * 0.04, -h / 2 + (k * h) / 7 + 0.012, 0.055, Sd); // louvres
    }
  }
  if (o.box) { // flower box under the sill with blooms
    box(-w / 2 - 0.05, -h / 2 - c - 0.3, 0.02, w / 2 + 0.05, -h / 2 - c - 0.07, 0.3, flatM(dk(trim, 0.8)));
    const r = rng(Math.round(w * 100 + h * 10)), cols = ["#e2453c", "#f2c94c", "#f6f1e4", "#d85aa0"];
    for (let k = 0; k < 9; k++) add(new THREE.IcosahedronGeometry(0.06 + r() * 0.03, 0).translate(-w / 2 + 0.08 + (k / 8) * (w - 0.16), -h / 2 - c - 0.03 + r() * 0.05, 0.16 + (r() - 0.5) * 0.1), flatM(k % 3 ? "#4f8f45" : cols[k % 4]));
  }
};
/** a door (bottom centre at the origin): casing, two raised panels, knob, optional transom and a step */
export const doorAt = (b: Batch, L: M4, w: number, h: number, col: string, trim: string, o: { transom?: boolean; step?: boolean; glass?: boolean } = {}) => {
  const { add, box } = pen(b, L), D = flatM(col), Dd = flatM(dk(col, 0.72)), T = flatM(trim), c = 0.1;
  box(-w / 2, 0, -0.02, w / 2, h, 0.03, D);
  if (o.glass) add(new THREE.PlaneGeometry(w * 0.6, h * 0.3).translate(0, h * 0.72, 0.035), lam("glassDayM", () => ({ map: glassTex(false) })));
  else box(-w * 0.32, h * 0.56, 0.03, w * 0.32, h * 0.9, 0.055, Dd);
  box(-w * 0.32, h * 0.1, 0.03, w * 0.32, h * 0.46, 0.055, Dd);
  add(new THREE.SphereGeometry(0.045, 8, 6).translate(w * 0.36, h * 0.48, 0.07), lam("brassKnob", () => ({ color: "#d9b25a" })));
  box(-w / 2 - c, 0, 0, -w / 2, h + c, 0.07, T); box(w / 2, 0, 0, w / 2 + c, h + c, 0.07, T); box(-w / 2 - c - 0.05, h + c, 0, w / 2 + c + 0.05, h + c + 0.08, 0.11, T);
  if (o.transom) { add(new THREE.PlaneGeometry(w, 0.3).translate(0, h + c + 0.25, 0.015), lam("glassDayM", () => ({ map: glassTex(false) }))); box(-w / 2 - c, h + c + 0.4, 0, w / 2 + c, h + c + 0.48, 0.08, T); }
  if (o.step) { box(-w / 2 - 0.2, -0.3, 0, w / 2 + 0.2, 0, 0.4, flatM(dk(trim, 0.8))); box(-w / 2 - 0.3, -0.3, 0.4, w / 2 + 0.3, -0.15, 0.72, flatM(dk(trim, 0.8))); }
};
/** a wall lantern: bracket + glowing box (lit) */
export const lanternAt = (b: Batch, L: M4, lit = false) => {
  const { add, box } = pen(b, L), I = flatM("#2b2a30");
  box(-0.02, 0.0, 0, 0.02, 0.04, 0.3, I); box(-0.11, -0.3, 0.2, 0.11, -0.27, 0.42, I); box(-0.12, 0.0, 0.19, 0.12, 0.03, 0.43, I);
  add(new THREE.BoxGeometry(0.18, 0.26, 0.18).translate(0, -0.14, 0.31), lam(lit ? "lanternLit" : "lanternDay", () => ({ color: lit ? "#ffd08a" : "#f2e2b0", ...(lit ? { emissive: new THREE.Color("#ffb860"), emissiveIntensity: 0.9 } : {}) })));
  add(new THREE.ConeGeometry(0.15, 0.12, 4).rotateY(Math.PI / 4).translate(0, 0.08, 0.31), I);
};

export type HouseSpec = {
  w: number; d: number; h: number;                  // footprint and eave height (all floors)
  floors?: 1 | 2;
  wall: string; trim: string; roof?: string;        // colours
  siding?: Siding;
  /** parapet: a flat roof hidden behind a stone-capped parapet with a cornice and chimney stacks (city terraces) */
  roofKind?: "gable" | "gableFront" | "falseFront" | "shed" | "parapet";
  rise?: number;                                    // roof rise above the eave
  door?: { x: number; w?: number; h?: number; col?: string; glass?: boolean };
  windows?: { x: number; y: number; w?: number; h?: number; side?: "front" | "left" | "right" | "back"; o?: WinOpts }[];
  porch?: { depth: number; roof?: "shed" | "awning" | "none"; awning?: [string, string]; rail?: boolean; posts?: number; y?: number };
  balcony?: { y: number; depth: number };
  chimney?: { side: "left" | "right" | "back" | "in"; u?: number; stone?: boolean };
  sign?: { col: string; icon?: Picto; iconCol?: string; hang?: boolean };
  lantern?: boolean; lit?: boolean;
  clutter?: number; seed?: number;
};
export type HouseOut = { smoke: THREE.Vector3 | null; front: number; top: number };

/** a whole building (see the header for what the reference always shows). Returns the chimney top (local) for smoke. */
export const house = (b: Batch, M: M4, s: HouseSpec): HouseOut => {
  const { add, box } = pen(b, M), r = rng(s.seed ?? 7), { w, d, h } = s;
  const sid = s.siding ?? "clap", W = lam(`wall_${sid}_${s.wall}`, () => ({ map: rep(sidingTex(s.wall, sid), 1, 1) }));
  const T = flatM(s.trim), Td = flatM(dk(s.trim, 0.75)), RC = s.roof ?? "#6a4a34";
  const roofM = lam("shingle_" + RC, () => ({ map: rep(roofHD(RC, false), 1, 1) })), RD = flatM(dk(RC, 0.6));
  const stone = lam("archStone", () => ({ map: rep(stoneHD("archStoneHD", ["#9a8e80", "#8a7e70", "#aa9e90", "#7e7266"], "#5a5048"), 1, 1) }));
  // plinth, walls, corner boards, frieze, belt course
  box(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, 0.28, d / 2 + 0.06, stone, undefined, 1.2);
  box(-w / 2, 0.28, -d / 2, w / 2, h, d / 2, W, undefined, 2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(x * w / 2 - 0.08, 0.28, z * d / 2 - 0.08, x * w / 2 + 0.08, h, z * d / 2 + 0.08, T);
  box(-w / 2 - 0.05, h - 0.22, -d / 2 - 0.05, w / 2 + 0.05, h, d / 2 + 0.05, T);
  box(-w / 2 - 0.04, 0.28, -d / 2 - 0.04, w / 2 + 0.04, 0.36, d / 2 + 0.04, Td);                     // water table
  if ((s.floors ?? 1) === 2) box(-w / 2 - 0.05, h / 2 - 0.06, -d / 2 - 0.05, w / 2 + 0.05, h / 2 + 0.06, d / 2 + 0.05, Td);
  // roof
  const rise = s.rise ?? (s.roofKind === "falseFront" ? 0.7 : 1.3), oh = 0.45, th = 0.12, kind = s.roofKind ?? "gable";
  let top = h + rise;
  /** pitched roof with its ridge along local x (or z); trimFront keeps the street end inside a false front */
  const gable = (along: "x" | "z", trimFront = false) => {
    const A = along === "x" ? w : d, Dd = along === "x" ? d : w, R = along === "x" ? E(0, 0, 0) : E(0, 0, 0, Math.PI / 2);
    const a = Math.atan2(rise, Dd / 2), Ls = (Dd / 2 + oh) / Math.cos(a);
    // along z the ry = 90 deg turn maps local -x to world +z (the street side)
    const x0 = -A / 2 - (trimFront && along === "z" ? -0.16 : 0.35), x1 = A / 2 + (trimFront && along === "x" ? -0.16 : 0.35);
    for (const side of [0, Math.PI]) {
      const S = R.clone().multiply(E(0, h + rise, 0, side, a)), sx0 = side ? -x1 : x0, sx1 = side ? -x0 : x1;
      box(sx0, 0, 0, sx1, th, Ls, roofM, S, 1.5);
      box(sx0, -0.1, Ls - 0.06, sx1, th + 0.02, Ls, RD, S);                                            // fascia
      for (const xe of [sx0, sx1]) box(xe - 0.05, -0.14, 0, xe + 0.05, th + 0.03, Ls, T, S);          // barge boards
    }
    box(x0, h + rise - 0.02, -0.12, x1, h + rise + 0.16, 0.12, RD, R);                                // ridge cap
    for (const sx of [-1, 1]) add(tri(V(sx * A / 2, h, (sx * Dd) / 2), V(sx * A / 2, h, (-sx * Dd) / 2), V(sx * A / 2, h + rise, 0)), W, R); // gable ends (outward)
  };
  if (kind === "gable") gable("x");
  else if (kind === "gableFront") gable("z");
  else if (kind === "parapet") {
    const ph = 0.75; top = h + ph + 1.1;
    box(-w / 2 + 0.1, h - 0.1, -d / 2 + 0.1, w / 2 - 0.1, h + 0.1, d / 2 - 0.1, RD);                          // flat roof
    for (const [x0, z0, x1, z1] of [[-w / 2, d / 2 - 0.25, w / 2, d / 2], [-w / 2, -d / 2, w / 2, -d / 2 + 0.25], [-w / 2, -d / 2, -w / 2 + 0.25, d / 2], [w / 2 - 0.25, -d / 2, w / 2, d / 2]] as const)
      box(x0, h, z0, x1, h + ph, z1, W, undefined, 2);                                                        // parapet
    box(-w / 2 - 0.08, h + ph, -d / 2 - 0.08, w / 2 + 0.08, h + ph + 0.1, d / 2 + 0.08, flatM("#d8d0c0"));  // stone coping
    box(-w / 2 - 0.16, h - 0.32, d / 2, w / 2 + 0.16, h - 0.14, d / 2 + 0.2, flatM("#e8e0d0"));               // cornice
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.25; x += 0.45) box(x - 0.05, h - 0.5, d / 2, x + 0.05, h - 0.32, d / 2 + 0.14, flatM("#e8e0d0")); // dentils
    for (const sx of [-1, 1]) { // chimney stacks on the party walls with pots
      const cx = sx * (w / 2 - 0.45);
      box(cx - 0.4, h, -0.5, cx + 0.4, h + ph + 1.0, 0.5, W, undefined, 2);
      box(cx - 0.46, h + ph + 1.0, -0.56, cx + 0.46, h + ph + 1.1, 0.56, flatM("#d8d0c0"));
      for (const pz of [-0.25, 0.0, 0.25]) add(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8).translate(cx, h + ph + 1.3, pz), flatM("#b8643a"));
    }
  }
  else if (kind === "shed") { const a = Math.atan2(rise, d), Ls = (d + 2 * oh) / Math.cos(a); box(-w / 2 - 0.3, 0, 0, w / 2 + 0.3, th, Ls, roofM, E(0, h + rise + oh * Math.tan(a), -d / 2 - oh, 0, a), 1.5); }
  else { // false front: a low gable hidden behind a tall flat front with a stepped parapet, a cornice on brackets and a sign
    gable("z", true);
    const fh = 1.7; top = h + fh + 0.45;
    box(-w / 2, h, d / 2 - 0.14, w / 2, h + fh, d / 2, W, undefined, 2);
    box(-w * 0.22, h + fh, d / 2 - 0.14, w * 0.22, h + fh + 0.4, d / 2, W, undefined, 2);               // stepped crown
    box(-w / 2 - 0.12, h + fh - 0.08, d / 2 - 0.2, w / 2 + 0.12, h + fh + 0.04, d / 2 + 0.16, Td);       // cornice
    box(-w * 0.22 - 0.1, h + fh + 0.36, d / 2 - 0.2, w * 0.22 + 0.1, h + fh + 0.46, d / 2 + 0.14, Td);
    for (let x = -w / 2 + 0.25; x <= w / 2 - 0.2; x += 0.5) box(x - 0.05, h + fh - 0.28, d / 2, x + 0.05, h + fh - 0.08, d / 2 + 0.13, T); // brackets
    for (const sx of [-1, 1]) box(sx * w / 2 - 0.1, h, d / 2 - 0.16, sx * w / 2 + 0.1, h + fh, d / 2 + 0.04, T);
  }
  // sign: a framed board with a pictogram (no words)
  if (s.sign) {
    const sy = kind === "falseFront" ? h + 0.85 : h - 0.55, sw = Math.min(w * 0.62, 3.2), shh = kind === "falseFront" ? 0.95 : 0.6;
    const SB = flatM(s.sign.col), z0 = d / 2 + (kind === "falseFront" ? 0 : 0.02);
    box(-sw / 2, sy - shh / 2, z0, sw / 2, sy + shh / 2, z0 + 0.05, SB);
    for (const [x0, y0, x1, y1] of [[-sw / 2 - 0.07, sy - shh / 2 - 0.07, sw / 2 + 0.07, sy - shh / 2], [-sw / 2 - 0.07, sy + shh / 2, sw / 2 + 0.07, sy + shh / 2 + 0.07], [-sw / 2 - 0.07, sy - shh / 2, -sw / 2, sy + shh / 2], [sw / 2, sy - shh / 2, sw / 2 + 0.07, sy + shh / 2]]) box(x0, y0, z0, x1, y1, z0 + 0.09, Td);
    if (s.sign.icon) { const k = shh * 0.75, P = flatM(s.sign.iconCol ?? "#2b2a30"); for (const g of pictoGeo(s.sign.icon)) add(g.scale(k, k, 1), P, E(0, sy, z0 + 0.05)); }
  }
  // door + windows
  const wallL = (side: "front" | "left" | "right" | "back", u: number, y: number) =>
    side === "front" ? E(u, y, d / 2) : side === "back" ? E(-u, y, -d / 2, Math.PI) : side === "right" ? E(w / 2, y, -u, Math.PI / 2) : E(-w / 2, y, u, -Math.PI / 2);
  if (s.door) doorAt(b, M.clone().multiply(wallL("front", s.door.x, 0.3)), s.door.w ?? 0.95, s.door.h ?? 2.0, s.door.col ?? "#5a3a22", s.trim, { transom: (s.door.w ?? 0.95) > 1, step: !s.porch, glass: s.door.glass });
  for (const wd of s.windows ?? []) windowAt(b, M.clone().multiply(wallL(wd.side ?? "front", wd.x, wd.y)), wd.w ?? 0.8, wd.h ?? 1.0, s.trim, { lit: s.lit, ...wd.o });
  if (s.lantern && s.door) lanternAt(b, M.clone().multiply(wallL("front", s.door.x + (s.door.w ?? 0.95) / 2 + 0.35, 2.15)), s.lit);
  // porch / boardwalk: deck with board lines, steps, posts with brackets, rail with balusters, shed roof or striped awning
  if (s.porch) {
    const p = s.porch, pd = p.depth, py = p.y ?? 0.3, PL = lam("deck_" + s.trim, () => ({ map: rep(sidingTex(lt(dk(s.trim, 0.85), 0.05), "plank"), 1, 1) }));
    box(-w / 2, 0, d / 2, w / 2, py, d / 2 + pd, PL, E(0, 0, 0, 0), 2);
    box(-w / 2, py - 0.06, d / 2 + pd - 0.06, w / 2, py, d / 2 + pd, Td);
    if (py > 0.2) box(-0.7, 0, d / 2 + pd, 0.7, py / 2, d / 2 + pd + 0.3, Td);                         // step
    const n = p.posts ?? Math.max(2, Math.round(w / 1.8) + 1), ph = s.balcony ? s.balcony.y - 0.1 : p.roof === "awning" ? 2.55 : Math.min(h - 0.42, 2.7);
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + 0.12 + (k / (n - 1)) * (w - 0.24);
      box(x - 0.07, py, d / 2 + pd - 0.2, x + 0.07, ph, d / 2 + pd - 0.06, T);
      if (p.roof !== "none" && !s.balcony) for (const sx of [-1, 1]) if ((k > 0 || sx > 0) && (k < n - 1 || sx < 0)) box(x, ph - 0.35, d / 2 + pd - 0.17, x + sx * 0.32, ph - 0.27, d / 2 + pd - 0.09, T, E(0, 0, 0, 0, 0, 0)); // brackets
      if (p.rail && k < n - 1) {
        const x2 = -w / 2 + 0.12 + ((k + 1) / (n - 1)) * (w - 0.24), mid = Math.abs(x + x2) / 2 < 0.8;
        if (!mid) { box(x, py + 0.8, d / 2 + pd - 0.17, x2, py + 0.88, d / 2 + pd - 0.09, T); for (let xb = x + 0.18; xb < x2 - 0.1; xb += 0.18) box(xb - 0.025, py, d / 2 + pd - 0.15, xb + 0.025, py + 0.8, d / 2 + pd - 0.11, T); }
      }
    }
    if (p.roof === "awning") {
      const [a, c] = p.awning ?? ["#2f6f4a", "#f2ead6"];
      const aw = lam(`awn_${a}_${c}`, () => ({ map: ctex(`awnT_${a}_${c}`, 256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c : a; g.fillRect(i * 32, 0, 32, 64); } }), side: THREE.DoubleSide }));
      const ang = Math.atan2(0.45, pd + 0.1), Ls = (pd + 0.1) / Math.cos(ang);
      box(-w / 2 - 0.05, 0, 0, w / 2 + 0.05, 0.04, Ls, aw, E(0, ph + 0.45, d / 2, 0, ang));
      for (let x = -w / 2; x < w / 2 - 0.01; x += 0.32) add(tri(V(x, ph, d / 2 + pd + 0.1), V(x + 0.16, ph - 0.2, d / 2 + pd + 0.1), V(x + 0.32, ph, d / 2 + pd + 0.1)), flatM(Math.round(x / 0.32) % 2 ? a : c)); // scalloped valance
    } else if (p.roof !== "none" && !s.balcony) {
      const ang = Math.atan2(0.4, pd + 0.2), Ls = (pd + 0.25) / Math.cos(ang);
      box(-w / 2 - 0.2, 0, 0, w / 2 + 0.2, th, Ls, roofM, E(0, ph + 0.42, d / 2, 0, ang), 1.5);
      box(-w / 2 - 0.2, ph - 0.05, d / 2 + pd - 0.2, w / 2 + 0.2, ph + 0.08, d / 2 + pd - 0.04, Td);     // beam
    }
  }
  if (s.balcony) { // upper balcony on brackets with a railing
    const { y, depth } = s.balcony;
    box(-w / 2, y - 0.1, d / 2, w / 2, y, d / 2 + depth, Td);
    box(-w / 2, y + 0.85, d / 2 + depth - 0.08, w / 2, y + 0.93, d / 2 + depth, T);
    for (let x = -w / 2 + 0.05; x <= w / 2; x += 0.2) box(x - 0.025, y, d / 2 + depth - 0.07, x + 0.025, y + 0.85, d / 2 + depth - 0.02, T);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 1.2) box(x - 0.05, y - 0.5, d / 2, x + 0.05, y - 0.1, d / 2 + depth * 0.7, T);
  }
  // chimney: stone stack with a cap and a dark flue
  let smoke: THREE.Vector3 | null = null;
  if (s.chimney) {
    const c = s.chimney, u = c.u ?? 0, cw = 0.7, ch = top + 0.7;
    let cx = u, cz = 0;
    if (c.side === "right") { cx = w / 2 + cw / 2 - 0.05; cz = -u; } else if (c.side === "left") { cx = -w / 2 - cw / 2 + 0.05; cz = u; } else if (c.side === "back") { cx = u; cz = -d / 2 - cw / 2 + 0.05; } else { cx = u; cz = -d * 0.2; }
    const CM = c.stone === false ? flatM("#8a4a3a") : stone;
    if (c.side !== "in") box(cx - cw / 2 - 0.1, 0, cz - cw / 2 - 0.1, cx + cw / 2 + 0.1, h * 0.55, cz + cw / 2 + 0.1, CM, undefined, 1.2); // wider firebox base
    box(cx - cw / 2, c.side === "in" ? h : 0, cz - cw / 2, cx + cw / 2, ch, cz + cw / 2, CM, undefined, 1.2);
    box(cx - cw / 2 - 0.08, ch, cz - cw / 2 - 0.08, cx + cw / 2 + 0.08, ch + 0.12, cz + cw / 2 + 0.08, flatM("#6a625c"));
    add(new THREE.PlaneGeometry(cw - 0.2, cw - 0.2).rotateX(-Math.PI / 2).translate(cx, ch + 0.125, cz), flatM("#1c1519"));
    smoke = V(cx, ch + 0.25, cz);
  }
  // clutter at its feet
  const cl = s.clutter ?? 2, fz = d / 2 + (s.porch ? s.porch.depth : 0) + 0.5;
  const spots: [number, number][] = [[-w / 2 - 0.6, fz - 0.6], [w / 2 + 0.6, fz - 0.4], [-w / 2 - 0.5, -d / 2 + 0.6], [w / 2 + 0.55, 0], [-w / 2 + 0.6, fz + 0.1]];
  for (let k = 0; k < Math.min(cl, spots.length); k++) {
    const [x, z] = spots[k], kind = Math.floor(r() * 4);
    const L = M.clone().multiply(E(x, 0, z, r() * Math.PI));
    if (kind === 0) barrel2(b, L, 0.85); else if (kind === 1) crate2(b, L, 0.6); else if (kind === 2) { crate2(b, L, 0.65); crate2(b, L.clone().multiply(E(0.05, 0.65, 0, 0.4)), 0.45); } else { barrel2(b, L, 0.8); crate2(b, L.clone().multiply(E(0.65, 0, 0.1, 0.3)), 0.5); }
  }
  return { smoke, front: d / 2 + (s.porch?.depth ?? 0), top };
};

// ---------------- street objects ----------------
/** a plank crate: body, corner posts, top/bottom bands, a diagonal brace on two faces (local origin = bottom centre) */
export const crate2 = (b: Batch, L: M4, s = 0.6) => {
  const { box } = pen(b, L), B = lam("crate2", () => ({ map: rep(sidingTex("#b08452", "plank"), 1, 1) })), D = flatM("#7a5432"), e = 0.06 * s / 0.6, h = s / 2;
  box(-h, 0, -h, h, s, h, B, undefined, 2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(x * h - e * x, 0, z * h - e * z, x * h + 0.01 * x, s, z * h + 0.01 * z, D);
  for (const y of [0, s - e]) { box(-h - 0.01, y, -h - 0.01, h + 0.01, y + e, -h + e, D); box(-h - 0.01, y, h - e, h + 0.01, y + e, h + 0.01, D); box(-h - 0.01, y, -h, -h + e, y + e, h, D); box(h - e, y, -h, h + 0.01, y + e, h, D); }
  const diag = Math.hypot(s - 2 * e, s - 2 * e);
  for (const z of [h + 0.012, -h - 0.012]) box(-diag / 2, -e / 2, -0.01, diag / 2, e / 2, 0.01, D, E(0, s / 2, z, 0, 0, Math.PI / 4));
};
/** a bulged stave barrel with three hoops and a lid (local origin = bottom centre) */
export const barrel2 = (b: Batch, L: M4, hh = 0.9) => {
  const { add } = pen(b, L), r0 = hh * 0.29, r1 = hh * 0.34;
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 8; i++) { const u = i / 8; prof.push(new THREE.Vector2(r0 + (r1 - r0) * Math.sin(Math.PI * u), u * hh)); }
  const stave = lam("barrelStave", () => ({ map: ctex("staves", 256, 64, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#9a6a40" : "#8a5e38"; g.fillRect(i * 16, 0, 16, 64); g.fillStyle = "#5a3a22"; g.fillRect(i * 16, 0, 2, 64); } }) }));
  add(new THREE.LatheGeometry(prof, 16), stave);
  add(new THREE.CircleGeometry(r0 * 0.98, 16).rotateX(-Math.PI / 2).translate(0, hh - 0.02, 0), flatM("#7a5232"));
  for (const u of [0.12, 0.5, 0.88]) { const rr = r0 + (r1 - r0) * Math.sin(Math.PI * u) + 0.012; add(new THREE.CylinderGeometry(rr, rr, hh * 0.05, 16, 1, true).translate(0, u * hh, 0), flatM("#4a4448")); }
};
/** a spoked wheel standing in the local xy plane, hub at the origin */
export const wheelAt = (b: Batch, L: M4, R = 0.5) => {
  const { add, box } = pen(b, L), Wd = flatM("#6a4a30"), I = flatM("#3a3438");
  add(new THREE.TorusGeometry(R, 0.05, 6, 24), Wd); add(new THREE.TorusGeometry(R + 0.03, 0.022, 4, 24), I);
  for (let k = 0; k < 8; k++) box(-0.025, 0, -0.025, 0.025, R, 0.025, Wd, E(0, 0, 0, 0, 0, (k * Math.PI) / 4));
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10).rotateX(Math.PI / 2), I);
};
/** a wagon (local origin = ground centre, tongue toward +z), optional canvas cover */
export const wagon = (b: Batch, L: M4, cover = false) => {
  const { add, box } = pen(b, L), B = lam("wagonBed", () => ({ map: rep(sidingTex("#9a6a40", "clap"), 1, 1) })), D = flatM("#5a3a22");
  box(-0.75, 0.75, -1.4, 0.75, 1.2, 1.4, B, undefined, 2); box(-0.8, 1.15, -1.45, 0.8, 1.22, 1.45, D);
  for (const [x, z, R] of [[-0.85, -0.95, 0.6], [0.85, -0.95, 0.6], [-0.85, 0.95, 0.45], [0.85, 0.95, 0.45]] as const) wheelAt(b, L.clone().multiply(E(x, R, z, Math.PI / 2)), R);
  box(-0.05, 0.4, 1.4, 0.05, 0.48, 2.9, D, E(0, 0, 0, 0, -0.12)); // tongue
  if (cover) { add(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 1.2, 0), lam("canvasCover", () => ({ color: "#f2ead6", side: THREE.DoubleSide }))); for (const z of [-1.3, 0, 1.3]) add(new THREE.TorusGeometry(0.81, 0.025, 4, 16, Math.PI).translate(0, 1.2, z), D); }
};
/** a water trough on legs */
export const trough = (b: Batch, L: M4, len = 1.8) => {
  const { add, box } = pen(b, L), T = lam("troughWood", () => ({ map: rep(sidingTex("#8a6a48", "plank"), 1, 1) })), D = flatM("#5a3a22");
  box(-len / 2, 0.3, -0.3, len / 2, 0.75, 0.3, T, undefined, 2);
  add(new THREE.PlaneGeometry(len - 0.12, 0.48).rotateX(-Math.PI / 2).translate(0, 0.7, 0), lam("troughWater", () => ({ color: "#5f8fb0" })));
  for (const x of [-len / 2 + 0.15, len / 2 - 0.15]) for (const z of [-0.22, 0.22]) box(x - 0.05, 0, z - 0.05, x + 0.05, 0.32, z + 0.05, D);
};
/** a hitching rail: two posts and a bar */
export const hitch = (b: Batch, L: M4, len = 2) => {
  const { box } = pen(b, L), D = flatM("#6a4a30");
  for (const x of [-len / 2, len / 2]) box(x - 0.06, 0, -0.06, x + 0.06, 1.0, 0.06, D);
  box(-len / 2 - 0.1, 0.88, -0.05, len / 2 + 0.1, 0.98, 0.05, D);
};
/** a water tower: four braced legs, a hooped tank, a cone roof */
export const waterTower = (b: Batch, L: M4, H = 4.5) => {
  const { add, box } = pen(b, L), D = flatM("#6a4a30");
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(x * 0.9 - 0.08, 0, z * 0.9 - 0.08, x * 0.9 + 0.08, H, z * 0.9 + 0.08, D);
  for (const y of [H * 0.35, H * 0.7]) for (const [a, x, z] of [[0, 0, 0.9], [0, 0, -0.9], [Math.PI / 2, 0.9, 0], [Math.PI / 2, -0.9, 0]] as const) box(-0.95, -0.04, -0.03, 0.95, 0.04, 0.03, D, E(x, y, z, a));
  add(new THREE.CylinderGeometry(1.25, 1.25, 1.9, 18).translate(0, H + 0.95, 0), lam("tank", () => ({ map: ctex("tankStaves", 512, 64, (g) => { for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? "#a8724a" : "#9a6a40"; g.fillRect(i * 16, 0, 16, 64); g.fillStyle = "#5a3a22"; g.fillRect(i * 16, 0, 2, 64); } }) })));
  for (const y of [0.3, 0.95, 1.6]) add(new THREE.CylinderGeometry(1.28, 1.28, 0.06, 18, 1, true).translate(0, H + y, 0), flatM("#3a3438"));
  add(new THREE.ConeGeometry(1.45, 0.8, 18).translate(0, H + 2.3, 0), lam("shingle_#6a4a34", () => ({ map: rep(roofHD("#6a4a34", false), 1, 1) })));
};
/** a street lamp post with a lantern head */
export const lampPost = (b: Batch, L: M4, lit = false) => {
  const { add, box } = pen(b, L), I = flatM("#2b2a30");
  box(-0.06, 0, -0.06, 0.06, 2.8, 0.06, I); box(-0.12, 0, -0.12, 0.12, 0.3, 0.12, I);
  add(new THREE.BoxGeometry(0.28, 0.38, 0.28).translate(0, 3.0, 0), lam(lit ? "lanternLit" : "lanternDay", () => ({ color: lit ? "#ffd08a" : "#f2e2b0", ...(lit ? { emissive: new THREE.Color("#ffb860"), emissiveIntensity: 0.9 } : {}) })));
  add(new THREE.ConeGeometry(0.24, 0.2, 4).rotateY(Math.PI / 4).translate(0, 3.29, 0), I);
};
/** a stone well with a little roof and a bucket */
export const well = (b: Batch, L: M4) => {
  const { add, box } = pen(b, L), D = flatM("#6a4a30");
  add(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 14, 1, true).translate(0, 0.4, 0), lam("archStone", () => ({ map: rep(stoneHD("archStoneHD", ["#9a8e80", "#8a7e70", "#aa9e90", "#7e7266"], "#5a5048"), 1, 1), side: THREE.DoubleSide })));
  add(new THREE.CircleGeometry(0.7, 14).rotateX(-Math.PI / 2).translate(0, 0.3, 0), flatM("#1c1519"));
  for (const x of [-0.7, 0.7]) box(x - 0.06, 0, -0.06, x + 0.06, 2.0, 0.06, D);
  box(-0.8, 1.6, -0.03, 0.8, 1.68, 0.03, D);
  for (const s of [0, Math.PI]) box(-1.0, 0, 0, 1.0, 0.06, 0.75, lam("shingle_#6a4a34", () => ({ map: rep(roofHD("#6a4a34", false), 1, 1) })), E(0, 2.3, 0, s, Math.atan2(0.35, 0.6)), 1.5);
  add(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10).translate(0.35, 1.2, 0), flatM("#8a6a48"));
};

// ---------------- ruins ----------------
/** a burnt-down house of footprint w x d: broken stone footing, charred stub walls with jagged tops, leaning corner
 *  posts, a fallen ridge beam, scattered blackened boards, an ash heap, a standing stone chimney and an iron stove */
export const ruin = (b: Batch, L: M4, seed: number, w = 4.2, d = 3.6) => {
  const { add, box } = pen(b, L), r = rng(seed);
  const char = flatM("#2e2622"), burnt = lam("burntWood", () => ({ map: rep(sidingTex("#4a3a30", "plank"), 1, 1) })), ash = flatM("#6a625c"), ash2 = flatM("#8a827a");
  const stone = lam("archStone", () => ({ map: rep(stoneHD("archStoneHD", ["#9a8e80", "#8a7e70", "#aa9e90", "#7e7266"], "#5a5048"), 1, 1) }));
  // broken footing round the perimeter, with gaps
  for (const [ax, az, bx, bz] of [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]] as const) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      if (r() < 0.25) continue;
      const u0 = k / n, u1 = (k + 0.85) / n, x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      box(x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, 0.18 + r() * 0.2, z1 + 0.12, stone, undefined, 1.2);
      if (r() < 0.45) { const hh = 0.4 + r() * 1.1; box(Math.min(x0, x1) - 0.05, 0.2, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, 0.2 + hh, Math.max(z0, z1) + 0.05, burnt, undefined, 2); } // stub wall
    }
  }
  // charred corner posts, some leaning, with the tops broken off
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    if (r() < 0.25) continue;
    const hh = 0.8 + r() * 1.7;
    box(-0.09, 0, -0.09, 0.09, hh, 0.09, char, E(x * w / 2, 0.15, z * d / 2, r() * 0.5, (r() - 0.5) * 0.35, (r() - 0.5) * 0.35));
  }
  // the fallen ridge beam, leaning from the ground onto a post
  box(-0.1, -0.1, 0, 0.1, 0.1, Math.hypot(w, 1.4) * 0.85, char, E(-w / 2 + 0.2, 0.1, -0.2, Math.PI / 2 - 0.25, -0.38));
  // scattered boards and an ash heap
  for (let i = 0; i < 9; i++) box(-0.6 - r() * 0.6, 0, -0.08, 0.6 + r() * 0.6, 0.06, 0.08, i % 3 ? burnt : char, E((r() - 0.5) * w, 0.08 + r() * 0.08, (r() - 0.5) * d, r() * 3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.15));
  add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(w * 0.42, 0.32, d * 0.4).translate(0, 0.05, 0), ash);
  for (let i = 0; i < 6; i++) add(new THREE.DodecahedronGeometry(0.15 + r() * 0.2, 0).scale(1, 0.5, 1).translate((r() - 0.5) * w, 0.08, (r() - 0.5) * d), ash2);
  // the stone chimney always survives a fire; a pot-bellied stove sits in the ash
  const cx = w / 2 - 0.4, cz = -d / 2 + 0.4;
  box(cx - 0.45, 0, cz - 0.45, cx + 0.45, 1.2, cz + 0.45, stone, undefined, 1.2);
  box(cx - 0.35, 1.2, cz - 0.35, cx + 0.35, 3.2 + r() * 0.6, cz + 0.35, stone, undefined, 1.2);
  box(cx - 0.36, 2.6, cz - 0.36, cx + 0.36, 3.9, cz + 0.36, flatM("#3a322e"));                    // soot
  add(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 10).translate(-0.6, 0.4, 0.3), flatM("#2b2a30"));
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8).rotateZ(0.5).translate(-0.85, 1.1, 0.3), flatM("#2b2a30"));
};

// ---------------- landforms ----------------
/** a desert butte / mesa: talus apron, a jittered body in 2-3 strata, a lighter cap rock. Faceted, so the ink pass
 *  draws its ledges. mats = [body, alternate stratum, cap, talus] */
export const butte = (b: Batch, x: number, z: number, w: number, h: number, seed: number, mats: THREE.Material[]) => {
  const r = rng(seed), n = 9 + Math.floor(r() * 4), ph = r() * 10;
  /** jitter the radius by angle (geometry still centred on the axis), facet it, then move it to (x, y, z) */
  const jag = (g: THREE.BufferGeometry, amp: number, y = 0) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i), a = Math.atan2(pz, px), k = 1 + amp * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 7 + ph * 2) * 0.4); p.setX(i, px * k); p.setZ(i, pz * k); }
    const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng.translate(x, y, z);
  };
  const tiers = h > 30 ? 3 : 2; let y = 0, rad = w;
  // talus apron: only ~10 % wider than the body, so a butte never grows over a camera placed near its old footprint
  b.add(jag(new THREE.CylinderGeometry(w * 1.02, w * 1.1, h * 0.18, n), 0.1, h * 0.09 - 0.5), mats[3]);
  for (let t = 0; t < tiers; t++) {
    const th = (h * (t === 0 ? 0.55 : 0.45 / (tiers - 1))), r1 = rad * (0.86 + r() * 0.06);
    b.add(jag(new THREE.CylinderGeometry(r1, rad, th, n), 0.08, y + th / 2), mats[t % 2]);
    if (t < tiers - 1) b.add(jag(new THREE.CylinderGeometry(r1 * 1.03, r1 * 1.05, th * 0.06, n), 0.08, y + th), mats[2]); // ledge
    y += th; rad = r1 * 0.94;
  }
  b.add(jag(new THREE.CylinderGeometry(rad * 1.02, rad * 1.06, h * 0.05, n), 0.08, y + h * 0.025), mats[2]); // cap rock
};
