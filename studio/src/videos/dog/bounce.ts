// Bouncy, smooth motion for MAIN SUBJECTS only (characters, vehicles, story props, effect cards), the springy feel of
// the reference shorts (studied in audio-sample/): props drop or pop in and settle with a small overshoot, characters
// hop with an anticipation dip, stretch in the air, squash on landing and wobble back to rest, vehicles rock on their
// springs. Background scenery (trees, houses, mesas, poles, ground props nobody looks at) NEVER bounces.
// All functions are pure functions of time (seconds since the event), so any frame renders the same on its own.
// Scales are volume-preserving (sx * sy ~ 1); apply them about the subject's ground point (card feet / car wheels).

export type Squash = { y: number; sx: number; sy: number }; // height offset (m) + horizontal / vertical scale
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const REST: Squash = { y: 0, sx: 1, sy: 1 };

/** damped spring from `from` to 0: freq Hz, zeta damping ratio (0.3-0.45 = lively, 2-3 visible overshoots) */
export const spring = (t: number, from = 1, freq = 3.2, zeta = 0.38) => {
  if (t <= 0) return from;
  const w = 2 * Math.PI * freq, wd = w * Math.sqrt(1 - zeta * zeta);
  return from * Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
};

/** pop-in scale 0 -> 1 with overshoot (~1.14 peak at 0.12 s, settled by ~0.4 s); reference: cards, signs, bubbles */
export const popIn = (t: number, freq = 3.0, zeta = 0.42) => (t <= 0 ? 0 : 1 - spring(t, 1, freq, zeta));

/** squash/stretch to pair with popIn: stretch while growing fast, a little squash at the overshoot */
export const popSquash = (t: number): Squash => {
  const v = (popIn(t + 0.01) - popIn(t)) / 0.01; // growth speed
  const s = Math.max(-0.12, Math.min(0.12, 0.018 * v));
  return { y: 0, sx: 1 - s * 0.5, sy: 1 + s };
};

/** drop from `h` metres: gravity fall, landing squash, then 1-2 small bounces (restitution e) and a settle */
export const dropIn = (t: number, h = 2.0, e = 0.32, g = 9.8 * 2.2): Squash => {
  if (t <= 0) return { y: h, sx: 0.94, sy: 1.08 };
  const tf = Math.sqrt((2 * h) / g);
  if (t < tf) return { y: h - 0.5 * g * t * t, sx: 0.94, sy: 1.08 };       // falling, stretched
  let v = g * tf * e, tt = t - tf, k = 0;
  while (k < 3) {                                                          // small hops, each lower
    const th = (2 * v) / g;
    if (tt < th) return { y: v * tt - 0.5 * g * tt * tt, ...squashAt(tt, 0.06 / (k + 1)) };
    tt -= th; v *= e; k++;
  }
  return { y: 0, ...squashAt(tt, 0.05 / (k + 1)) };
};
const squashAt = (t: number, a: number) => { const s = spring(t, a, 4.0, 0.4); return { sx: 1 + s, sy: 1 - s }; };

/** character hop: 0.12 s anticipation dip (squash), jump on an arc (stretch), landing squash (0.85) + wobble.
 *  t = seconds since the hop starts; h = peak height (m), air = time in the air (s) */
export const hop = (t: number, h = 0.35, air = 0.42): Squash => {
  const ant = 0.12;
  if (t <= 0) return REST;
  if (t < ant) { const u = Math.sin((Math.PI * t) / ant / 2); return { y: 0, sx: 1 + 0.08 * u, sy: 1 - 0.1 * u }; }
  const ta = t - ant;
  if (ta < air) {
    const u = ta / air, y = 4 * h * u * (1 - u), st = 0.1 * Math.abs(1 - 2 * u); // stretched when fast (take-off, landing), round at the apex
    return { y, sx: 1 - 0.5 * st, sy: 1 + st };
  }
  const s = spring(ta - air, 0.15, 3.6, 0.36);
  return { y: 0, sx: 1 + s * 0.8, sy: 1 - s };
};

/** a quick "punch" on a word or reaction (stomp, shock, laugh): squash then spring back, no height change */
export const punch = (t: number, a = 0.12): Squash => (t < 0 ? REST : { y: 0, sx: 1 + spring(t, a * 0.7, 4.5, 0.35), sy: 1 - spring(t, a, 4.5, 0.35) });

/** gentle idle life for standing characters: 1.5 % breathing bob, ~0.45 Hz, phase per character */
export const breathe = (t: number, seed = 0, a = 0.015): Squash => {
  const s = a * Math.sin(2 * Math.PI * 0.45 * t + seed * 2.1);
  return { y: 0, sx: 1 - 0.4 * s, sy: 1 + s };
};

/** walk / drive bob: a bounce per step (character) or per road bump (vehicle body) */
export const stepBob = (t: number, rate = 2.0, a = 0.04) => a * Math.abs(Math.sin(Math.PI * rate * t));

/** vehicle on springs: body heave (m) and pitch (rad) after impacts at times `hits` (s, with strength 0..1),
 *  plus a small idle rumble; the wheels stay on the ground, only the body moves */
export const carBody = (t: number, hits: { t: number; a: number }[] = [], rumble = 0.006) => {
  let heave = rumble * Math.sin(2 * Math.PI * 7.3 * t) * Math.sin(2 * Math.PI * 1.1 * t), pitch = 0;
  for (const h of hits) {
    const d = t - h.t;
    if (d < 0) continue;
    heave += -spring(d, 0.09 * h.a, 2.4, 0.3);   // body dips then rebounds
    pitch += spring(d, 0.06 * h.a, 2.1, 0.32);   // nose dives forward then rocks back
  }
  return { heave, pitch };
};

/** impact squash for a vehicle or prop hitting something (body squashes along the hit, springs back) */
export const impactSquash = (t: number, a = 0.1): Squash => punch(t, a);

/** combine squash states (multiply scales, add heights) */
export const mix = (...s: Squash[]): Squash => s.reduce((a, b) => ({ y: a.y + b.y, sx: a.sx * b.sx, sy: a.sy * b.sy }), REST);
export { clamp01 };
