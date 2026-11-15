// "The Perfect Road": shots, camera, lens and story state, all timed to the voice (words.json, from
// claude-animated-shorts/templates/voice/make_voice.py). Every cut and reaction is looked up by phrase, so a new take
// re-times the whole film. Camera grammar from the skill: hard cuts on big jumps, smootherstep glides 18-40 f,
// every hold creeps (push-in), impact kicks flip sign every frame and decay over 7 f, no hand-held float.
import WORDS from "./words.json";

export const FPS = 30;
export const D0 = 0; // ground height (build.ts contract)
export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const smoother = (x: number) => { const u = clamp01(x); return u * u * u * (u * (u * 6 - 15) + 10); };
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ---------------- voice timing ----------------
type W = { w: string; s: number; e: number };
const words = WORDS as W[];
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, "");
const NW = words.map((w) => norm(w.w));
/** start time (s) of the first occurrence of `phrase` starting at or after `after` seconds */
export const at = (phrase: string, after = 0): number => {
  const p = phrase.split(/\s+/).map(norm);
  for (let i = 0; i + p.length <= NW.length; i++) {
    if (words[i].s < after) continue;
    if (p.every((x, k) => NW[i + k] === x)) return words[i].s;
  }
  throw new Error(`story.ts: phrase not in words.json: "${phrase}"`);
};
/** end time (s) of the last word of `phrase` */
export const atEnd = (phrase: string, after = 0) => {
  const s = at(phrase, after), i = words.findIndex((w) => w.s === s), n = phrase.split(/\s+/).length;
  return words[i + n - 1].e;
};
const LEAD = 2; // reactions and cuts land 0-3 frames before their word
export const fr = (t: number) => Math.max(0, Math.round(t * FPS) - LEAD);

export const T = {
  hook: 0,
  setting: at("you see"), perfect: at("the perfect road"), forty: at("forty miles"), noBumps: at("no bumps"),
  opening: at("on opening day"), truckers: at("truckers set"), soup: at("eat soup"),
  week: at("a week later"), sunny: at("sunny afternoon"), another: at("then another"), three: at("then three"),
  signs: at("so bernie puts"), worse: at("the crashes get worse"), counting: at("start counting"), sheep: at("like sheep"),
  ambulance: at("then the town ambulance"), drifts: at("drifts off the road too"), too: at("too", at("drifts off the road")),
  luckily: at("luckily"), unluckily: at("unluckily"), needed: at("needed an ambulance"),
  whatsOn: at("so what's going on"), hypnosis: at("highway hypnosis"), nothing: at("when nothing changes"), clocks: at("clocks out"),
  sim: at("in simulator tests"), wobbling: at("start wobbling"),
  why: at("that's why germany"), engineers: at("engineers add"), awake: at("keep you awake"),
  bends: at("so bernie bends"), stop: at("the crashes stop"), finally: at("and his town finally"), map: at("makes the map"),
  wiggles: at("wiggles"), end: words[words.length - 1].e,
};
export const TOTAL = Math.round((T.end + 1.1) * FPS);

// ---------------- story state ----------------
/** road bend amount 0 (ruler straight) .. 1 (gentle S-curves), in story time */
export const bendAt = (t: number) => (t < T.engineers ? 0 : t < T.bends ? smoother((t - T.engineers) / 2.6) : 1);
/** road centre line x at z for bend k (town end z > -40 stays straight) */
export const roadX = (z: number, k: number) => k * 26 * Math.sin((z + 40) / 105) * smooth((-z - 40) / 90);
export const roadYaw = (z: number, k: number) => -Math.atan2(roadX(z - 1, k) - roadX(z + 1, k), 2); // vehicle yaw driving toward -z

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; sunAz?: number; sunEl?: number };
const cuts = [T.hook, T.setting, T.forty, T.opening, T.truckers, T.week, T.another, T.signs, T.counting, T.ambulance, T.luckily, T.whatsOn, T.sim,
  T.why, T.bends, T.finally];
export const SHOTS: ShotDef[] = cuts.map((t, i) => ({
  id: i + 1, a: i === 0 ? 0 : fr(t), b: i + 1 < cuts.length ? fr(cuts[i + 1]) : TOTAL, light: "day",
}));
export const S = { HOOK: 1, RIBBON: 2, GLIDE: 3, CROWD: 4, TRUCK: 5, DRIFT: 6, PILEUP: 7, SIGNS: 8, SHEEP: 9, AMBULANCE: 10, DEADPAN: 11,
  HYPNOSIS: 12, WOBBLE: 13, CURVES: 14, BENDS: 15, FINALE: 16 };
/** crossfades at place/time changes (frames); a white 4-frame flash right after the hook */
export const XFADE: Record<number, number> = { 16: 10 };
export const FLASH_AT = SHOTS[1].a;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- vehicles ----------------
export type Kind = "car" | "truck" | "ambulance";
export type Vehicle = { key: string; kind: Kind; col: string; x: number; z: number; yaw: number; roll?: number; pitch?: number;
  sink?: number; lights?: boolean; driver?: number; dust?: number; wheel?: number;
  /** bounce (bounce.ts): body heave (m) + extra pitch on the springs, drop height, squash scales */
  heave?: number; bodyPitch?: number; dy?: number; sx?: number; sy?: number };
const LANE = 2.0;  // right-hand lane centre, driving toward -z
/** a car leaving the road: cruising at v m/s along the lane until t0, then a slow drift right into the sand and a stop */
export const drift = (t: number, t0: number, z0: number, v: number, side = 1, dur = 2.6) => {
  const u = clamp01((t - t0) / dur);
  // speed decays once the wheels leave the asphalt (u > .45), stop at u = 1
  const zTravel = Math.min(t, t0) * v + v * dur * (u - 0.5 * u * u); // z0 = position at t = 0; speed reaches 0 at u = 1
  const z = z0 - zTravel, x = LANE * side + side * 11.5 * smooth(u * 1.15) ** 1.4;
  const yaw = -side * (0.5 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - 0.35 * u) + 0.25 * smooth((u - 0.6) / 0.4));
  const inSand = smooth((u - 0.4) / 0.1);
  return { x, z, yaw, roll: side * 0.04 * inSand * Math.sin(u * 9), pitch: 0.035 * inSand, sink: 0.06 * inSand, dust: u > 0.42 && u < 1 ? u : 0, done: u >= 1, wheel: zTravel / 0.36 };
};
/** a car that already crashed earlier: parked in the sand, nose turned off the road */
export const wreck = (key: string, col: string, x: number, z: number, yaw: number, driver = -1): Vehicle =>
  ({ key, kind: "car", col, x, z, yaw, pitch: 0.035, sink: 0.06, roll: 0.03, driver });

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Partial<Cam> & { pos: V3; look: V3 } };
const R = (deg: number) => (deg * Math.PI) / 180;
/** a hold that creeps: push the lens toward the look point by `rate` of the distance per frame */
const creep = (pos: V3, look: V3, rate = 0.0025) => (f: number): { pos: V3; look: V3 } => {
  const k = Math.min(0.6, rate * f);
  return { pos: lerp3(pos, look, k), look };
};
const F = SHOTS.map((s) => s.a);
const sf = (id: number) => F[id - 1];

// story positions (world): town at z 0..70, the road runs straight toward -z; Bernie cuts the ribbon at z = -4
export const RIBBON_Z = -4;
export const HOOK_WRECK: V3 = [12.5, 0, -168];
export const SIGN_Z0 = -80, SIGN_STEP = 34; // "a Stay Awake sign every mile" (one every 34 m on screen)
export const AMB_T0 = () => T.ambulance - 0.4;

export const CAMS: Record<number, Key[]> = {
  // 1 hook: high and wide down the endless straight road, one car alone in the sand beside it
  [S.HOOK]: [{ f: 0, s: (f) => ({ ...creep([-3, 12, -138], [11, 0.6, -173], 0.0018)(f), fov: 42, roll: R(-3) }) }],
  // 2 the mayor cuts the ribbon at the edge of town
  [S.RIBBON]: [
    { f: sf(2), s: (f) => ({ ...creep([1.6, 1.7, RIBBON_Z - 7.5], [-0.4, 1.35, RIBBON_Z + 1], 0.0022)(f - sf(2)), fov: 38, roll: R(2) }) },
    { f: fr(T.perfect), dur: 22, s: (f) => ({ ...creep([2.6, 2.3, RIBBON_Z - 11], [0, 1.3, RIBBON_Z + 2], 0.002)(f - fr(T.perfect)), fov: 40, roll: R(-2) }) },
  ],
  // 3 dead straight, dead flat: a low fast glide down the centre line, the road to the horizon
  [S.GLIDE]: [{ f: sf(3), s: (f) => { const u = f - sf(3), z = -30 - u * 1.25; return { pos: [0.6, 1.1 + 0.004 * u, z], look: [0.2, 0.2, z - 60], fov: 46, roll: R(-4) }; } }],
  // 4 opening day: the townsfolk cheer at the roadside while the first cars roll out
  [S.CROWD]: [{ f: sf(4), s: (f) => ({ ...creep([6.5, 1.8, -12], [-7, 1.4, -21], 0.002)(f - sf(4)), fov: 42, roll: R(3) }) }],
  // 5 the trucker eats soup with both hands: tracking beside the cab window
  [S.TRUCK]: [{ f: sf(5), s: (f) => { const z = truckZ(f / FPS); const u = f - sf(5); return { pos: [-3.4 + 0.004 * u, 2.2, z - 2.4], look: [-0.5, 2.05, z - 2.6], fov: 40, roll: R(-3) }; } }],
  // 6 a week later: a lone car slowly drifts off into the sand (chase from behind-left, then holds as it stops)
  [S.DRIFT]: [{ f: sf(6), s: (f) => {
    const t = f / FPS, d = firstDrift(t), u = f - sf(6);
    const cz = d.z + 11 + 0.012 * u;
    return { pos: [-3.5 + d.x * 0.45, 3.0, cz], look: [d.x + 0.9, 0.9, d.z - 3], fov: 40, roll: R(-3) };
  } }],
  // 7 then another, then three in a day: a high view down the road as wrecks pile up in the sand on both sides
  [S.PILEUP]: [{ f: sf(7), s: (f) => ({ ...creep([0, 14, -62], [0, 0, -160], 0.0016)(f - sf(7)), fov: 44, roll: R(-2) }) }],
  // 8 Bernie's forty identical Stay Awake signs: a glide along the row, a car drifting off behind them on "worse"
  [S.SIGNS]: [
    { f: sf(8), s: (f) => { const u = f - sf(8); return { pos: [12.5, 2.0, SIGN_Z0 + 10 - u * 0.03], look: [7.6, 1.6, SIGN_Z0 - 7], fov: 40, roll: R(3) }; } },
    { f: fr(T.worse), dur: 26, s: (f) => { const u = f - fr(T.worse); return { pos: [12, 3.0, SIGN_Z0 - 2 - u * 0.04], look: [3, 1.2, SIGN_Z0 - 45], fov: 42, roll: R(-3) }; } },
  ],
  // 9 counting signs like sheep: close on a driver whose eyelids get heavier with every sign
  [S.SHEEP]: [{ f: sf(9), s: (f) => { const z = sheepCarZ(f / FPS), u = f - sf(9); return { pos: [4.0 - 0.003 * u, 1.45, z - 3.4 + 0.004 * u], look: [LANE - 0.3, 1.2, z + 0.1], fov: 38, roll: R(3) }; } }],
  // 10 the ambulance: chase with flashing lights, it drifts off and hits the sand on "too" (kick)
  [S.AMBULANCE]: [
    { f: sf(10), s: (f) => { const d = ambDrift(f / FPS); return { pos: [-4.5 + d.x * 0.45, 3.4, d.z + 13], look: [d.x + 1.2, 1.4, d.z - 3], fov: 40, roll: R(3) }; } },
  ],
  // 11 luckily / unluckily: two-shot of the ambulance next to the wreck it came for, then in on the dazed medic
  [S.DEADPAN]: [
    { f: sf(11), s: (f) => ({ ...creep([AMB_STOP[0] - 8, 1.7, AMB_STOP[2] - 4.6], [AMB_STOP[0] + 0.4, 1.1, AMB_STOP[2] - 4.0], 0.0018)(f - sf(11)), fov: 42, roll: R(-3) }) },
    { f: fr(T.unluckily), cut: true, s: (f) => ({ ...creep([MEDIC[0] - 3.4, 1.65, MEDIC[2] - 1.4], [MEDIC[0], 1.5, MEDIC[2]], 0.002)(f - fr(T.unluckily)), fov: 36, roll: R(3) }) },
  ],
  // 12 highway hypnosis: a driver on autopilot, brain clocking out
  [S.HYPNOSIS]: [{ f: sf(12), s: (f) => { const z = hypCarZ(f / FPS), u = f - sf(12); return { pos: [3.8 - 0.003 * u, 1.5, z - 3.3 + 0.004 * u], look: [LANE - 0.3, 1.3, z + 0.1], fov: 40, roll: R(-3) }; } }],
  // 13 simulator: from high above, a car wobbling on the boring straight road
  [S.WOBBLE]: [{ f: sf(13), s: (f) => { const z = wobZ(f / FPS); return { pos: [2.0, 24, z + 5], look: [2.0, 0, z - 3], fov: 40, roll: R(0) }; } }],
  // 14 Germany and France cap the straights: aerial while the road bends into gentle curves
  [S.CURVES]: [{ f: sf(14), s: (f) => ({ ...creep([-60, 95, -60], [10, 0, -330], 0.0012)(f - sf(14)), fov: 44, roll: R(2) }) }],
  // 15 Bernie bends his perfect road: Bernie at the first curve, cars sweeping past safely
  [S.BENDS]: [{ f: sf(15), s: (f) => ({ ...creep([BEND_SPOT[0] - 4, 1.8, BEND_SPOT[2] + 7], [BEND_SPOT[0] + 1.5, 1.3, BEND_SPOT[2] - 4], 0.002)(f - sf(15)), fov: 42, roll: R(3) }) }],
  // 16 finale (golden): the town and its wiggly road from the air; a map pin drops on "map"
  [S.FINALE]: [{ f: sf(16), s: (f) => { const u = f - sf(16); return { pos: [-60 + u * 0.05, 95 - u * 0.05, 120 - u * 0.05], look: [0, 0, -25], fov: 46, roll: R(-2) }; } }],
};

// travel helpers shared with world.ts / cast.ts
export const FIRST_Z0 = -60; // where the first drifting car is when it starts to leave the road
export const firstDrift = (t: number) => drift(t, T.sunny - 0.2, FIRST_Z0 + (T.sunny - 0.2) * 14, 14);
export const truckZ = (t: number) => 20 - (t - T.truckers) * 9;
export const sheepCarZ = (t: number) => SIGN_Z0 - 160 - (t - T.counting) * 10;
export const hypCarZ = (t: number) => -400 - (t - T.whatsOn) * 9;
export const wobZ = (t: number) => -500 - (t - T.sim) * 12;
export const wobX = (t: number) => LANE + 0.9 * Math.sin((t - T.sim) * 2.1) * smooth((t - T.wobbling) / 0.6) + 0.25 * Math.sin((t - T.sim) * 5.3);
export const AMB_Z0 = -300; // where the ambulance is when it starts to drift
export const ambDrift = (t: number) => drift(t, T.drifts - 0.15, AMB_Z0 + (T.drifts - 0.15) * 15, 15, 1, 1.9);
const AMB_FINAL = ambDrift(T.drifts + 5);
export const AMB_STOP: V3 = [AMB_FINAL.x, 0, AMB_FINAL.z];
export const MEDIC: V3 = [AMB_STOP[0] - 1.2, 0, AMB_STOP[2] - 3.4];
export const WRECK_DRIVER: V3 = [AMB_STOP[0] + 1.0, 0, AMB_STOP[2] - 5.0];
export const BEND_SPOT: V3 = [roadX(-150, 1) - 6.5, 0, -150];

const camKey = (id: number, f: number): Cam => {
  const ks = CAMS[id];
  let i = 0; while (i + 1 < ks.length && f >= ks[i + 1].f) i++;
  const k = ks[i], c = k.s(f);
  const out: Cam = { fov: 40, roll: 0, ...c };
  if (i > 0 && !k.cut) {
    const pk = ks[i - 1].s(f), u = smoother((f - k.f) / (k.dur ?? 24));
    const p: Cam = { fov: 40, roll: 0, ...pk };
    return { pos: lerp3(p.pos, out.pos, u), look: lerp3(p.look, out.look, u), fov: lerp(p.fov, out.fov, u), roll: lerp(p.roll, out.roll, u) };
  }
  return out;
};

/** impact flip-shakes: frame, strength (degrees-ish), decaying over 7 f */
export const KICKS: { f: number; a: number }[] = [
  { f: fr(T.too) + 1, a: 1.3 },          // ambulance hits the sand
  { f: fr(T.sunny) + 30, a: 0.6 },       // first car into the sand
];
export const camAt = (id: number, f: number): Cam => {
  const c = camKey(id, f);
  for (const k of KICKS) {
    const d = f - k.f;
    if (d < 0 || d >= 7) continue;
    const a = k.a * (d % 2 ? -1 : 1) * (1 - d / 7);
    const dx = c.look[0] - c.pos[0], dz = c.look[2] - c.pos[2], h = Math.hypot(dx, dz) || 1, L = Math.hypot(dx, c.look[1] - c.pos[1], dz);
    const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
    return { ...c, look: [c.look[0] - (dz / h) * m, c.look[1] + 0.6 * m, c.look[2] + (dx / h) * m], roll: c.roll + a * 0.004 };
  }
  return c;
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 0 },
  { f: sf(S.RIBBON), cInf: 12 },
  { f: sf(S.GLIDE), cInf: 0 },
  { f: sf(S.CROWD), cInf: 9 },
  { f: sf(S.TRUCK), cInf: 14 },
  { f: sf(S.DRIFT), cInf: 0 },
  { f: sf(S.SIGNS), cInf: 7 },
  { f: fr(T.worse), dur: 26, cInf: 0 },
  { f: sf(S.SHEEP), cInf: 15 },
  { f: sf(S.AMBULANCE), cInf: 0 },
  { f: sf(S.DEADPAN), cInf: 8 },
  { f: fr(T.unluckily), cInf: 14 },
  { f: sf(S.HYPNOSIS), cInf: 15 },
  { f: sf(S.WOBBLE), cInf: 0 },
  { f: sf(S.BENDS), cInf: 10 },
  { f: sf(S.FINALE), cInf: 0 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
