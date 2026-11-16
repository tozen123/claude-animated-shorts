// Camera motion with a soft, springy feel, and shakes on their own layer.
// Measured on the reference shorts (audio-sample/): every camera move eases in, travels, and lands with a tiny
// overshoot-and-settle (2-4 % of the move), like a camera on a spring arm; holds keep creeping. Shakes (impacts,
// quakes, engines) ride ON TOP of that path in the camera's own axes and never disturb it: when the shake stops, the
// camera is exactly where the path says.
// Order every frame (never change it):
//   1. path      camPath(keys, f)       springy key-to-key glides + creeps            (story.ts)
//   2. framing   frame.ts correction    averaged over neighbouring frames, computed on the UNSHAKEN pose
//   3. cut motion transitions.ts        whip / push continuity around a cut
//   4. float     ambient.ts floatCam    hand-held drift
//   5. shake     applyShake(cam, s)     impacts, quakes: camera-local, last
// Pure functions of the frame (deterministic). Copy next to story.ts.
import * as THREE from "three";

export type V3 = [number, number, number];
export type Cam = { pos: V3; look: V3; fov: number; roll: number };

// ================================================================ springy easing
/** springy ease 0 -> 1 over u in [0, 1]. Starts with ZERO velocity AND zero acceleration (a smootherstep body: a
 *  raw spring step response jumps to full acceleration on the first frame, which reads as a jolt at the start of
 *  every glide), then lands with a small overshoot and one soft settle (a smooth bump over the last 45 %), and
 *  ends exactly on 1 with zero velocity. amp 0.03 = ~1.5 % overshoot (camera); 0.08 = bouncy props. */
export const springEase = (u: number, amp = 0.03) => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const s = u * u * u * (u * (u * 6 - 15) + 10);
  const v = Math.max(0, (u - 0.55) / 0.45);
  return s + amp * Math.sin(2 * Math.PI * v) * v * (1 - v) * 4;
};
/** smootherstep (no overshoot): for moves that must not bounce (slow reveals, aerials) */
export const smoother = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * x * (x * (x * 6 - 15) + 10); };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export type CamKey = {
  f: number; dur?: number; cut?: boolean;
  /** "spring" (default, soft landing with a tiny overshoot) or "smooth" (no overshoot) */
  ease?: "spring" | "smooth";
  s: (f: number) => Partial<Cam> & { pos: V3; look: V3 };
};
/** camera at frame f from a shot's keys: holds evaluate their own function (creeps), glides blend from the previous
 *  key's live pose into the next with the springy ease (position and look blend separately, so the framing turns
 *  first and settles with the move) */
export const camPath = (keys: CamKey[], f: number): Cam => {
  let i = 0; while (i + 1 < keys.length && f >= keys[i + 1].f) i++;
  const k = keys[i], out: Cam = { fov: 40, roll: 0, ...k.s(f) };
  if (i === 0 || k.cut) return out;
  const p: Cam = { fov: 40, roll: 0, ...keys[i - 1].s(f) }, dur = k.dur ?? 24, u = (f - k.f) / dur;
  const e = (k.ease ?? "spring") === "spring" ? springEase(u) : smoother(u);
  const eLook = (k.ease ?? "spring") === "spring" ? springEase(Math.min(1, u * 1.06), 0.025) : e; // the eye leads the body a touch
  return { pos: lerp3(p.pos, out.pos, e), look: lerp3(p.look, out.look, eLook), fov: lerp(p.fov, out.fov, e), roll: lerp(p.roll, out.roll, e) };
};
/** slow creep toward the look point during a hold (every hold must move a little) */
export const creep = (pos: V3, look: V3, rate = 0.0025, cap = 0.6) => (f: number): { pos: V3; look: V3 } => ({ pos: lerp3(pos, look, Math.min(cap, rate * f)), look });

// ================================================================ shakes (separate layer)
/** smooth band-limited noise in [-1, 1] (sum of incommensurate sines): no frame-to-frame jitter */
const sn = (t: number, s: number, f: number) =>
  (Math.sin(t * f * 6.283 + s) * 0.5 + Math.sin(t * f * 1.618 * 6.283 + s * 2.3) * 0.3 + Math.sin(t * f * 2.71 * 6.283 + s * 4.1) * 0.2);
export type ShakeEvent =
  /** impact kick: one sharp hit that rings out (a damped spring), e.g. a slam, a landing, a crack */
  | { kind: "kick"; t: number; amp: number; dir?: [number, number] }
  /** rumble: sustained shaking with smooth noise, e.g. a quake, an engine, a stampede; ramps in and out */
  | { kind: "rumble"; t0: number; t1: number; amp: number; freq?: number };
export type Shake = { yaw: number; pitch: number; roll: number; x: number; y: number };
/** camera-local shake at time t (radians / metres). amp 1 = a solid hit (~0.9 deg). */
export const shakeAt = (t: number, events: ShakeEvent[]): Shake => {
  const s: Shake = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0 };
  for (const e of events) {
    if (e.kind === "kick") {
      const d = t - e.t;
      if (d < 0 || d > 0.8) continue;
      // ~3.5 Hz ring (>= 8 frames per swing at 30 fps, so it reads as a smooth jolt, not a stutter), gone in ~0.7 s;
      // a 2-frame attack instead of an instant step
      // one firm jolt and a single soft rebound (strong damping): a ringing camera reads as jitter, not impact
      const ring = Math.min(1, d / 0.066) * Math.exp(-d * 8.5) * Math.sin(d * 2 * Math.PI * 2.6) * e.amp;
      const [dx, dy] = e.dir ?? [0.35, 1];
      s.pitch += 0.008 * ring * dy; s.yaw += 0.006 * ring * dx; s.roll += 0.003 * ring; s.y += 0.008 * ring * dy;
    } else {
      if (t < e.t0 || t > e.t1) continue;
      const sm = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
      const env = sm((t - e.t0) / 0.35) * sm((e.t1 - t) / 0.6), f = Math.min(e.freq ?? 3.2, 4), a = e.amp * env; // <= 4 Hz: smooth at 30 fps
      s.yaw += 0.007 * a * sn(t, 1.1, f); s.pitch += 0.007 * a * sn(t, 2.7, f * 1.13); s.roll += 0.005 * a * sn(t, 4.2, f * 0.87);
      s.x += 0.018 * a * sn(t, 5.3, f * 0.7); s.y += 0.018 * a * sn(t, 6.1, f * 0.9);
    }
  }
  return s;
};
/** how much of the shake to keep while the camera itself is travelling: a fast glide / whip already carries the
 *  energy, so the shake yields (full shake on holds, ~45 % at 1 m/s or 0.5 rad/s, ~25 % in a whip). speed in m/s,
 *  turn in rad/s, from the PATH (camPath at f-1 and f+1), never from the shaken pose. */
export const shakeYield = (speed: number, turn = 0) => 1 / (1 + 1.2 * speed + 2.4 * turn);
/** path speed (m/s) and turn rate (rad/s) at frame f, from any camera function of the frame */
export const pathMotion = (at: (f: number) => Cam, f: number, fps = 30) => {
  const a = at(f - 1), b = at(f + 1);
  const dp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * fps / 2;
  const va = [a.look[0] - a.pos[0], a.look[1] - a.pos[1], a.look[2] - a.pos[2]], vb = [b.look[0] - b.pos[0], b.look[1] - b.pos[1], b.look[2] - b.pos[2]];
  const la = Math.hypot(...va) || 1, lb = Math.hypot(...vb) || 1;
  const c = Math.max(-1, Math.min(1, (va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]) / (la * lb)));
  return { speed: dp, turn: (Math.acos(c) * fps) / 2 };
};
/** apply a shake LAST, in the camera's own axes; k = shakeYield(...) */
export const applyShake = (cam: THREE.PerspectiveCamera, s: Shake, k = 1) => {
  cam.translateX(s.x * k); cam.translateY(s.y * k);
  cam.rotateY(s.yaw * k); cam.rotateX(s.pitch * k); cam.rotateZ(s.roll * k);
  cam.updateMatrixWorld();
};
/** is the ground / camera shaking at t (for cast reactions, dust, rattles) */
export const rumbleAt = (t: number, events: ShakeEvent[]) => events.some((e) => e.kind === "rumble" && t >= e.t0 && t <= e.t1);
