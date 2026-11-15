// Particle effects measured from the reference shorts (audio-sample/), as pure functions of time: any frame renders
// alone, so stills and the final render always agree. Each emitter returns FxPlace cards (camera-facing sprites):
//  - glow cards (glow: HDR gain > 1) are drawn with ADDITIVE blending and push past the bloom threshold, so they bloom
//    like the reference's sparks, glowing eyes and lamps;
//  - plain cards are ink-outlined cartoon shapes (dust, debris, sweat, shock lines) like the rest of the cast.
// Reference behaviour: sparks are orange-white streaks thrown in a fan, falling under gravity, shrinking and fading
// in 0.3-0.6 s; impacts add a dust puff and a few chunks; anger crackles as short jagged red bolts that re-draw every
// 2-3 frames around the character; rain is thin slanted streaks; lightning is a white-blue branching bolt with a
// 2-frame sky flash.
import type { Pen } from "./toon"; // copy this file next to toon.ts

export type V3 = [number, number, number];
export type FxCard = {
  key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number;
  rot?: number; soft?: boolean; flat?: boolean;
  /** additive glow: HDR multiplier on the drawing (1.5-6 blooms), tint = linear RGB colour of the light */
  glow?: number; tint?: [number, number, number];
};
export type CamLike = { pos: { x: number; y: number; z: number }; right: { x: number; y: number; z: number } };

// ---------------- deterministic random ----------------
export const hash = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 24) => Math.round(v * n) / n;

// ---------------- sprite drawings ----------------
/** soft round glow (white core -> transparent), 128 x 128 */
export const glowDot = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.75)"); gr.addColorStop(0.6, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};
/** spark streak along +x (hot head on the right, fading tail), 256 x 32 */
export const streak = (p: Pen) => {
  const g = p.g, gr = g.createLinearGradient(0, 16, 256, 16);
  gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = gr; g.beginPath(); g.ellipse(128, 16, 128, 9, 0, 0, Math.PI * 2); g.fill();
};
/** jagged energy bolt (anger / electricity), seed varies the shape, 256 x 256; colour = core tint */
export const bolt = (p: Pen, seed: number, col = "#ff3b2f") => {
  const g = p.g, pts: [number, number][] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) pts.push([20 + (216 * i) / n, 128 + (i % 2 ? -1 : 1) * (30 + 40 * hash(i, seed)) * (i === 0 || i === n ? 0 : 1)]);
  const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  g.lineJoin = "miter"; g.lineCap = "round";
  path(); g.strokeStyle = "#241726"; g.lineWidth = 26; g.stroke();
  path(); g.strokeStyle = col; g.lineWidth = 16; g.stroke();
  path(); g.strokeStyle = "#ffd2c8"; g.lineWidth = 5; g.stroke();
};
/** branching lightning bolt, 512 x 1024 (top to bottom), white-blue */
export const lightning = (p: Pen, seed: number) => {
  const g = p.g;
  const branch = (x: number, y: number, len: number, w: number, depth: number, k: number) => {
    const pts: [number, number][] = [[x, y]];
    let cx = x, cy = y;
    const steps = Math.max(3, Math.round(len / 60));
    for (let i = 0; i < steps; i++) { cx += (hash(i + k * 13, seed) - 0.5) * 90; cy += len / steps; pts.push([cx, cy]); }
    for (const [lw, c] of [[w * 3.2, "rgba(140,170,255,0.35)"], [w * 1.6, "#cfe0ff"], [w * 0.6, "#ffffff"]] as const) {
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.strokeStyle = c; g.lineWidth = lw; g.lineJoin = "miter"; g.stroke();
    }
    if (depth > 0) for (let i = 1; i < pts.length - 1; i++) if (hash(i, seed + k * 7) > 0.62) branch(pts[i][0], pts[i][1], len * 0.45, w * 0.55, depth - 1, k * 3 + i);
  };
  branch(256, 0, 1000, 14, 2, 1);
};
/** thin rain streak, 16 x 256 */
export const rainStreak = (p: Pen) => {
  const g = p.g, gr = g.createLinearGradient(8, 0, 8, 256);
  gr.addColorStop(0, "rgba(220,230,255,0)"); gr.addColorStop(1, "rgba(220,230,255,0.9)");
  g.fillStyle = gr; g.fillRect(5, 0, 6, 256);
};
/** cartoon sweat drop, 120 x 180 */
export const sweat = (p: Pen) => {
  p.poly([[60, 10], [100, 110], [60, 170], [20, 110]], "#9fd4ff", 9);
  p.ell(48, 105, 10, 16, "#ffffff", 0);
};
/** shock lines: three short strokes radiating up from a point, 300 x 220 */
export const shockLines = (p: Pen, t: number) => {
  const k = Math.min(1, t * 4);
  for (const a of [-55, -90, -125]) {
    const r = (a * Math.PI) / 180, r0 = 40 + 30 * k, r1 = r0 + 70 * k;
    p.stroke([[150 + r0 * Math.cos(r), 200 + r0 * Math.sin(r)], [150 + r1 * Math.cos(r), 200 + r1 * Math.sin(r)]], 16);
  }
};
/** four-point sparkle, 200 x 200 */
export const sparkle = (p: Pen) => {
  const g = p.g;
  g.fillStyle = "#ffffff";
  g.beginPath(); g.moveTo(100, 0); g.quadraticCurveTo(110, 90, 200, 100); g.quadraticCurveTo(110, 110, 100, 200); g.quadraticCurveTo(90, 110, 0, 100); g.quadraticCurveTo(90, 90, 100, 0); g.fill();
};
/** chunk of debris (rock / wood), 120 x 120 */
export const chunk = (p: Pen, col = "#9a8a76") => p.poly([[20, 40], [70, 14], [108, 52], [86, 104], [30, 96]], col, 9);
/** soft dust puff, 256 x 256 (alpha by age) */
export const puff = (p: Pen, a: number, col = "238,225,205") => {
  const g = p.g, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${col},${(0.85 * a).toFixed(3)})`); gr.addColorStop(0.6, `rgba(${col},${(0.45 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};

// ---------------- emitters ----------------
const screenRot = (cam: CamLike, vx: number, vy: number, vz: number) => Math.atan2(vy, vx * cam.right.x + vz * cam.right.z);

/** sparks: a fan of hot streaks thrown from `o` along `dir` (unit-ish), with gravity; t = seconds since the hit */
export const sparks = (t: number, o: V3, cam: CamLike, seed = 1, opt: { n?: number; speed?: number; spread?: number; dir?: V3; life?: number; size?: number; tint?: [number, number, number] } = {}): FxCard[] => {
  const { n = 26, speed = 6, spread = 1.0, dir = [0, 1, 0], life = 0.55, size = 0.35, tint = [3.2, 1.6, 0.45] } = opt, out: FxCard[] = [];
  if (t < 0 || t > life * 1.6) return out;
  for (let i = 0; i < n; i++) {
    const L = life * (0.55 + 0.9 * hash(i, seed)), u = t / L;
    if (u >= 1) continue;
    const s = speed * (0.45 + 0.8 * hash(i, seed + 1));
    const vx = dir[0] * s + (hash(i, seed + 2) - 0.5) * 2 * spread * s, vy = dir[1] * s + hash(i, seed + 3) * spread * s * 0.8, vz = dir[2] * s + (hash(i, seed + 4) - 0.5) * 2 * spread * s;
    const g = 9.8 * 1.4, x = o[0] + vx * t, y = o[1] + vy * t - 0.5 * g * t * t, z = o[2] + vz * t;
    const vyt = vy - g * t, len = size * (0.6 + 0.6 * Math.hypot(vx, vyt, vz) / speed) * (1 - 0.6 * u);
    out.push({ key: "spark", cw: 256, ch: 32, draw: streak, x, y, z, w: len, h: len * 0.14, rot: screenRot(cam, vx, vyt, vz), glow: 2.6 * (1 - u * u), tint });
  }
  return out;
};
/** embers / glow motes drifting up (fire, magic, a glowing reward), looping */
export const embers = (t: number, o: V3, seed = 1, opt: { n?: number; radius?: number; rise?: number; size?: number; tint?: [number, number, number] } = {}): FxCard[] => {
  const { n = 14, radius = 0.6, rise = 1.2, size = 0.12, tint = [3.0, 1.9, 0.6] } = opt, out: FxCard[] = [];
  for (let i = 0; i < n; i++) {
    const per = 1.2 + hash(i, seed) * 0.8, u = ((t / per + hash(i, seed + 1)) % 1 + 1) % 1, a = hash(i, seed + 2) * 6.283;
    out.push({ key: "glowdot", cw: 128, ch: 128, draw: glowDot, x: o[0] + Math.cos(a) * radius * (0.3 + u * 0.7) + 0.08 * Math.sin(t * 3 + i), y: o[1] + u * rise, z: o[2] + Math.sin(a) * radius * 0.6,
      w: size * (1 - u * 0.5), h: size * (1 - u * 0.5), glow: 2.2 * Math.sin(Math.PI * u), tint });
  }
  return out;
};
/** impact: a dust ring puffing out low + a few debris chunks hopping away; t = seconds since impact */
export const impactDust = (t: number, o: V3, seed = 1, opt: { n?: number; size?: number; col?: string; chunks?: number; chunkCol?: string } = {}): FxCard[] => {
  const { n = 8, size = 1.2, col = "238,225,205", chunks = 5, chunkCol = "#9a8a76" } = opt, out: FxCard[] = [];
  if (t < 0 || t > 1.4) return out;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + hash(i, seed), u = Math.min(1, t / 1.2), r = size * (0.3 + 0.9 * (1 - (1 - u) ** 3));
    const al = q(1 - u, 12);
    out.push({ key: `puff${al}${col}`, cw: 256, ch: 256, draw: (p) => puff(p, al, col), soft: true, x: o[0] + Math.cos(a) * r, y: o[1] + 0.25 * size * (0.4 + u), z: o[2] + Math.sin(a) * r * 0.7,
      w: size * (0.6 + 0.8 * u), h: size * (0.5 + 0.7 * u) });
  }
  for (let i = 0; i < chunks; i++) {
    const a = hash(i, seed + 5) * 6.283, s = 2 + 2.5 * hash(i, seed + 6), up = 3 + 2 * hash(i, seed + 7), tt = Math.min(t, (2 * up) / 9.8);
    out.push({ key: `chunk${chunkCol}`, cw: 120, ch: 120, draw: (p) => chunk(p, chunkCol), x: o[0] + Math.cos(a) * s * tt, y: o[1] + 0.05 + up * tt - 4.9 * tt * tt, z: o[2] + Math.sin(a) * s * tt,
      w: 0.12 * size, h: 0.12 * size, rot: t * 9 * (hash(i, seed + 8) - 0.5) });
  }
  return out;
};
/** anger: short red jagged bolts crackling around a character (re-drawn every 2-3 frames), plus a red glow */
export const angerBolts = (t: number, o: V3, seed = 1, opt: { n?: number; radius?: number; height?: number; size?: number } = {}): FxCard[] => {
  const { n = 4, radius = 0.55, height = 1.3, size = 0.38 } = opt, out: FxCard[] = [];
  const tick = Math.floor(t * 12);
  for (let i = 0; i < n; i++) {
    if (hash(i, tick + seed) < 0.3) continue; // flicker
    const a = hash(i * 7 + tick, seed) * 6.283, s = (tick * 3 + i) % 6;
    out.push({ key: `bolt${s}`, cw: 256, ch: 256, draw: (p) => bolt(p, s), x: o[0] + Math.cos(a) * radius, y: o[1] + 0.2 + hash(i, tick + 3) * height, z: o[2] + Math.sin(a) * radius * 0.5,
      w: size, h: size, rot: hash(i, tick + 9) * 6.283, glow: 1.8, tint: [3.2, 0.5, 0.35] });
  }
  return out;
};
/** glowing eyes (anger, magic): two HDR glow dots at the eye positions; pulse 0..1 */
export const glowEyes = (eyes: [V3, V3], pulse = 1, tint: [number, number, number] = [4.5, 0.6, 0.35], size = 0.16): FxCard[] =>
  eyes.map(([x, y, z]) => ({ key: "glowdot", cw: 128, ch: 128, draw: glowDot, x, y, z, w: size, h: size, glow: 1.4 + 1.6 * pulse, tint }));
/** rain: slanted streaks filling a box around the camera's view of `o`; looping */
export const rain = (t: number, o: V3, cam: CamLike, seed = 1, opt: { n?: number; box?: number; height?: number; slant?: number } = {}): FxCard[] => {
  const { n = 120, box = 12, height = 8, slant = 0.25 } = opt, out: FxCard[] = [];
  for (let i = 0; i < n; i++) {
    const per = 0.45 + 0.2 * hash(i, seed), u = ((t / per + hash(i, seed + 1)) % 1);
    out.push({ key: "rain", cw: 16, ch: 256, draw: rainStreak, soft: true, x: o[0] + (hash(i, seed + 2) - 0.5) * box + slant * u * height, y: o[1] + height * (1 - u), z: o[2] + (hash(i, seed + 3) - 0.5) * box,
      w: 0.02, h: 0.6, rot: -slant });
  }
  void cam;
  return out;
};
/** lightning strike at time t0 (2 frames bright, 3 frames afterglow); returns the bolt + how strong the sky flash is */
export const lightningStrike = (t: number, t0: number, o: V3, seed = 1, height = 60): { fx: FxCard[]; flash: number } => {
  const d = t - t0;
  if (d < 0 || d > 0.2) return { fx: [], flash: 0 };
  const k = d < 0.07 ? 1 : 1 - (d - 0.07) / 0.13;
  return { fx: [{ key: `lightning${seed}`, cw: 512, ch: 1024, draw: (p) => lightning(p, seed), x: o[0], y: o[1] + height / 2, z: o[2], w: height * 0.5, h: height, glow: 3.5 * k, tint: [1.6, 1.8, 2.4] }], flash: k };
};
/** sparkles twinkling around a point (a laugh, a win, something shiny) */
export const sparkles = (t: number, o: V3, seed = 1, opt: { n?: number; radius?: number; size?: number } = {}): FxCard[] => {
  const { n = 6, radius = 0.5, size = 0.16 } = opt, out: FxCard[] = [];
  for (let i = 0; i < n; i++) {
    const per = 0.7, u = ((t / per + hash(i, seed)) % 1), a = hash(i, seed + 1) * 6.283, k = Math.sin(Math.PI * u);
    out.push({ key: "sparkle", cw: 200, ch: 200, draw: sparkle, x: o[0] + Math.cos(a) * radius, y: o[1] + (hash(i, seed + 2) - 0.3) * radius, z: o[2] + Math.sin(a) * radius * 0.5,
      w: size * k, h: size * k, rot: u, glow: 2.0 * k, tint: [2.6, 2.4, 1.6] });
  }
  return out;
};
