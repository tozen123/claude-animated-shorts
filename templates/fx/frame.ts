// Subject-aware camera: auto-framing (no main subject cut by the frame edge) and subject autofocus with a blur cap
// (the lens blur may soften the background, never a main subject). Pure functions of the camera and the subjects,
// so any frame renders alone; world.ts averages the corrections over a few neighbouring frames of the same shot so
// the camera never twitches when someone walks in.
// Reference: in the samples every face and body that the shot is about sits fully inside the frame with air around
// it (only deliberate over-the-shoulder foregrounds are cut), and the subject is always tack sharp; only the world
// behind it melts.
// Copy next to cast.ts / world.ts. Wiring: see SKILL.md "Framing and focus".
import * as THREE from "three";

/** an upright, camera-facing card in world metres: feet at (x, y, z), w wide, h tall */
export type Subj = { x: number; y: number; z: number; w: number; h: number };
export type FrameOpts = {
  /** safe area in NDC: |x| <= safeX, y in [-safeBot, safeTop]. 9:16 frame: keep heads off the top edge, feet may go
   *  a little low (captions sit at 70 % height, i.e. NDC y = -0.4, and are drawn over the picture) */
  safeX?: number; safeTop?: number; safeBot?: number;
  /** subjects nearer than minDist (deliberate foreground) or farther than maxDist (background extras) are ignored */
  minDist?: number; maxDist?: number;
  /** most the camera may dolly back, as a factor of the subject distance (1.5 = 50 % farther) */
  maxPull?: number;
  /** the biggest blur (px at 1080x1920) any main subject may get */
  subjectCoC?: number; nearScale?: number;
};
export const FRAME_DEFAULTS: Required<FrameOpts> = { safeX: 0.86, safeTop: 0.88, safeBot: 0.94, minDist: 1.2, maxDist: 16, maxPull: 1.8, subjectCoC: 1.2, nearScale: 1.2 };

/** subjects from cast.ts placements: body cards are 600 x 1000 design units (2.16 m) with the figure ~0.55 m wide.
 *  The bounce (hop dy, squash sx / sy) is IGNORED on purpose: the camera frames where a character stands, it never
 *  chases hops and squashes (that was the frame-to-frame jitter). */
export const subjectsOf = (places: { x: number; y: number; z: number; scale?: number; sx?: number; sy?: number; dy?: number; size?: unknown; key: string }[]): Subj[] =>
  places.map((p) => { const s = p.scale ?? 1; return { x: p.x, y: p.y, z: p.z, w: 0.6 * s, h: 2.05 * s }; });

const v = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
type Box = { x0: number; x1: number; y0: number; y1: number; d: number };
/** NDC box of a subject card, plus its depth along the view axis (null if behind the camera) */
export const ndcBox = (cam: THREE.PerspectiveCamera, s: Subj): Box | null => {
  cam.getWorldDirection(fwd); right.setFromMatrixColumn(cam.matrixWorld, 0); right.y = 0; right.normalize();
  const d = v.set(s.x, s.y + s.h / 2, s.z).sub(cam.position).dot(fwd);
  if (d < 0.05) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const sx of [-0.5, 0.5]) for (const sy of [0, 1]) {
    v.set(s.x + right.x * s.w * sx, s.y + s.h * sy, s.z + right.z * s.w * sx).project(cam);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, x1, y0, y1, d };
};
/** the main subjects of this frame: in the depth band, at least partly on screen, not a giant deliberate close-up */
export const mainSubjects = (cam: THREE.PerspectiveCamera, subs: Subj[], o: FrameOpts = {}) => {
  const O = { ...FRAME_DEFAULTS, ...o }, out: Box[] = [];
  for (const s of subs) {
    const b = ndcBox(cam, s);
    if (!b || b.d < O.minDist || b.d > O.maxDist) continue;
    if (b.x1 < -1 || b.x0 > 1 || b.y1 < -1 || b.y0 > 1) continue;     // wholly off screen: not in this shot
    if (b.y1 - b.y0 > 2.3) continue;                                  // taller than the frame: a deliberate close-up
    // mostly off screen (< 12 % visible) at the edge: a passer-by, not a subject
    const vis = (Math.min(1, b.x1) - Math.max(-1, b.x0)) / Math.max(1e-3, b.x1 - b.x0);
    if (vis < 0.12) continue;
    out.push(b);
  }
  return out;
};

export type Correction = { pull: number; yaw: number; pitch: number };
/** how far to dolly back and turn so every main subject sits inside the safe area */
export const frameCorrection = (cam: THREE.PerspectiveCamera, subs: Subj[], o: FrameOpts = {}): Correction => {
  const O = { ...FRAME_DEFAULTS, ...o }, list = mainSubjects(cam, subs, O);
  if (!list.length) return { pull: 0, yaw: 0, pitch: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, dm = 0;
  for (const b of list) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); dm += b.d / list.length; }
  const k = Math.min(O.maxPull, Math.max(1, (x1 - x0) / (2 * O.safeX), (y1 - y0) / (O.safeTop + O.safeBot)));
  const pull = (k - 1) * dm;
  // after the dolly the group shrinks toward the centre by ~1/k
  x0 /= k; x1 /= k; y0 /= k; y1 /= k;
  const fit = (a: number, b: number, lo: number, hi: number) => (b - a > hi - lo ? (a + b) / 2 - (lo + hi) / 2 : a < lo ? a - lo : b > hi ? b - hi : 0);
  const dx = fit(x0, x1, -O.safeX, O.safeX), dy = fit(y0, y1, -O.safeBot, O.safeTop);
  const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tx = ty * cam.aspect;
  return { pull, yaw: Math.atan(dx * tx), pitch: Math.atan(dy * ty) };
};
/** dolly back along the view axis, then turn (yaw right = +, pitch up = +) about the camera's own axes */
export const applyCorrection = (cam: THREE.PerspectiveCamera, c: Correction) => {
  cam.getWorldDirection(fwd);
  cam.position.addScaledVector(fwd, -c.pull);
  cam.rotateY(-c.yaw); cam.rotateX(c.pitch);
  cam.updateMatrixWorld();
};
/** weighted average (pass weights, e.g. a triangle over the window, so the correction eases in and out) */
export const weightedCorrection = (cs: Correction[], ws: number[]): Correction => {
  const n = ws.reduce((a, b) => a + b, 0) || 1;
  return cs.reduce((a, c, i) => ({ pull: a.pull + (c.pull * ws[i]) / n, yaw: a.yaw + (c.yaw * ws[i]) / n, pitch: a.pitch + (c.pitch * ws[i]) / n }), { pull: 0, yaw: 0, pitch: 0 });
};
export const averageCorrection = (cs: Correction[]): Correction => {
  const n = cs.length || 1;
  return cs.reduce((a, c) => ({ pull: a.pull + c.pull / n, yaw: a.yaw + c.yaw / n, pitch: a.pitch + c.pitch / n }), { pull: 0, yaw: 0, pitch: 0 });
};

/** autofocus: the focus depth (view axis) on the main subject (biggest on screen, near the centre), and the largest
 *  cInf that keeps EVERY main subject's blur under subjectCoC px. Returns null when no subject is in the shot. */
export const subjectFocus = (cam: THREE.PerspectiveCamera, subs: Subj[], o: FrameOpts = {}) => {
  const O = { ...FRAME_DEFAULTS, ...o }, list = mainSubjects(cam, subs, O);
  if (!list.length) return null;
  let best = list[0], score = -Infinity;
  for (const b of list) { const cx = (b.x0 + b.x1) / 2, sc = (b.y1 - b.y0) * (1 - 0.45 * Math.min(1, Math.abs(cx))); if (sc > score) { score = sc; best = b; } }
  // focus between the nearest and farthest subject, weighted to the main one (so a group shares one sharp plane)
  let dn = Infinity, df = 0;
  for (const b of list) { dn = Math.min(dn, b.d); df = Math.max(df, b.d); }
  const focus = list.length > 1 ? 0.6 * best.d + 0.4 * (2 * dn * df) / (dn + df) : best.d;
  let worst = 0;
  for (const b of list) { const r = Math.abs(1 - focus / b.d) * (b.d < focus ? O.nearScale : 1); worst = Math.max(worst, r); }
  return { focus, cap: worst > 1e-4 ? O.subjectCoC / worst : Infinity };
};

/** a jitter-free value track over a shot: raw(ff) is sampled on a fixed grid (every `step` frames, cached), the grid
 *  is blurred with a gaussian over +-radius points, then Catmull-Rom interpolated. Anything driven by it (framing
 *  correction, focus distance) is C1-smooth: no steps when a subject enters, no pumping when one hops. */
export class Track {
  private raw = new Map<string, number[]>(); private sm = new Map<string, number[]>();
  constructor(private step = 6, private radius = 3) {}
  at(key: string, f: number, a: number, b: number, raw: (ff: number) => number[]): number[] {
    const R = (i: number) => {
      const k = `${key}:${i}`; let v = this.raw.get(k);
      if (!v) { v = raw(Math.min(b - 1, Math.max(a, a + i * this.step))); this.raw.set(k, v); }
      return v;
    };
    const S = (i: number) => {
      const k = `${key}:${i}`; let v = this.sm.get(k);
      if (!v) {
        let wsum = 0; v = [];
        for (let j = -this.radius; j <= this.radius; j++) {
          const w = Math.exp(-((j / (this.radius * 0.6)) ** 2)), x = R(i + j);
          x.forEach((xv, n) => { v![n] = (v![n] ?? 0) + xv * w; }); wsum += w;
        }
        v = v.map((x) => x / wsum); this.sm.set(k, v);
      }
      return v;
    };
    const x = (f - a) / this.step, i = Math.floor(x), u = x - i;
    const p0 = S(i - 1), p1 = S(i), p2 = S(i + 1), p3 = S(i + 2);
    return p1.map((_, n) => 0.5 * (2 * p1[n] + (-p0[n] + p2[n]) * u + (2 * p0[n] - 5 * p1[n] + 4 * p2[n] - p3[n]) * u * u + (-p0[n] + 3 * p1[n] - 3 * p2[n] + p3[n]) * u * u * u));
  }
}
