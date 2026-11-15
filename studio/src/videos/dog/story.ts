// "The War of the Stray Dog" (Petrich, October 1925): shots, camera, lens and story state, all timed by phrase to
// the voice (words.json from templates/voice/make_voice.py). Camera grammar from the skill: hard cuts on big jumps,
// smootherstep glides 18-40 f, every hold creeps, impact kicks flip sign every frame and decay over 7 f.
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
export const at = (phrase: string, after = 0): number => {
  const p = phrase.split(/\s+/).map(norm);
  for (let i = 0; i + p.length <= NW.length; i++) {
    if (words[i].s < after) continue;
    if (p.every((x, k) => NW[i + k] === x)) return words[i].s;
  }
  throw new Error(`story.ts: phrase not in words.json: "${phrase}"`);
};
const LEAD = 2;
export const fr = (t: number) => Math.max(0, Math.round(t * FPS) - LEAD);

export const T = {
  telegram1: at("telegram"), setting: at("you see"), october: at("one october day"), wanders: at("wanders across"),
  runs: at("so he runs"), shoots: at("shoots him"), furious: at("greece is furious"), pangalos: at("general pangalos"),
  hours: at("fortyeight hours"), francs: at("two million francs"), sorry: at("bulgaria says sorry"), misunderstanding: at("misunderstanding"),
  sends: at("greece sends in"), marches: at("marches on the town"), calls: at("so bulgaria calls"), referee: at("the referee"),
  league: at("league of nations"), council: at("its council president"), telegram: at("urgent telegram"), stop: at("stop shooting"),
  goHome: at("go home"), lands: at("it lands just"), attack: at("attack on petrich"), luckily: at("luckily"), unluckily: at("unluckily for greece"),
  bill: at("the bill"), works: at("it works like"), fight: at("playground fight"), nobody: at("nobody wants"), swinging: at("still swinging"),
  watching: at("whole class"), pulls: at("greece pulls out"), pounds: at("fortyfive thousand pounds"), few: at("one of the few"),
  unfair: at("greece called it"), italy: at("italy bombed"), greecePay: at("greece had to pay"), andDog: at("and the dog"), nobodyWrote: at("nobody wrote"),
  end: words[words.length - 1].e,
};
export const TOTAL = Math.round((T.end + 1.2) * FPS);

// ---------------- places (world metres) ----------------
// Border pass at the origin: the border runs along x at z = 0, Greece to the south (+z), Bulgaria to the north (-z).
export const GR_HUT: V3 = [-5, 0, 7], BG_HUT: V3 = [5, 0, -7];
export const GR_FLAG: V3 = [-7.5, 0, 5], BG_FLAG: V3 = [7.5, 0, -5];
export const GR_SENTRY: V3 = [-1.6, 0, 4.8], BG_GUARD: V3 = [3.0, 0, -4.0];
/** the mountain road from the pass down to Petrich (x of the centre line at z) */
export const roadX = (z: number) => (z > -8 ? 0 : 7 * Math.sin((-z - 8) / 48));
export const PETRICH_Z = -232;
export const FRONT_LINE_Z = -185; // where the Greek column stops, just short of Petrich
export const ATHENS: V3 = [320, 0, 0], SOFIA: V3 = [320, 0, 70], PARIS: V3 = [-320, 0, 0], SCHOOL: V3 = [0, 0, 330];

// ---------------- story state ----------------
/** the dog's path: trots up to the border (hook), across it (shot 3), runs on into Bulgaria (shot 4) */
export const dogAt = (t: number): { x: number; z: number; dx: number; dz: number; mode: "trot" | "stand" | "sit" } => {
  if (t < T.setting) { const u = Math.max(0, t - 0.1) * 0.75; return { x: -2.8 + Math.min(u, 2.6), z: 1.6, dx: 1, dz: 0, mode: u < 2.6 ? "trot" : "stand" }; }
  const u = t - T.october;
  return { x: 0.6, z: 3.2 - Math.max(0, u) * 1.6, dx: 0, dz: -1, mode: "trot" };
};
/** the soldier chasing his dog (shot 4): runs from the Greek side across the line */
export const chaserZ = (t: number) => 3.5 - (t - T.runs) * 3.2;
/** the Greek column marching north to Petrich: distance of the front row along the road from the border */
export const columnFront = (t: number) => Math.min(-FRONT_LINE_Z, 152 + (t - T.sends) * 6);
/** the column marching home (shot 14): front row z, heading south (+z) across the border */
export const homeFront = (t: number) => -4 + (t - T.pulls) * 2.4;
export const COLUMN = { files: 4, rows: 9, gap: 1.35, fileGap: 1.1 };
export const marchPhase = (t: number) => ((t % 1) + 1) % 1;

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light };
const cuts = [0, T.setting, T.october, T.runs, T.furious, T.sorry, T.sends, T.calls, T.council, T.lands, T.luckily, T.unluckily, T.works, T.pulls, T.unfair, T.andDog];
export const S = { HOOK: 1, PASS: 2, CROSS: 3, SHOT: 4, ATHENS: 5, SORRY: 6, MARCH: 7, SOFIA: 8, PARIS: 9, FRONT: 10, FROZEN: 11, BILL: 12, SCHOOL: 13, BACK: 14, UNFAIR: 15, DOG: 16 };
export const SHOTS: ShotDef[] = cuts.map((t, i) => ({ id: i + 1, a: i === 0 ? 0 : fr(t), b: i + 1 < cuts.length ? fr(cuts[i + 1]) : TOTAL, light: i === 15 ? "golden" : "day" }));
export const XFADE: Record<number, number> = { [S.DOG]: 10 };
export const FLASH_AT = SHOTS[1].a;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Partial<Cam> & { pos: V3; look: V3 } };
const R = (deg: number) => (deg * Math.PI) / 180;
const creep = (pos: V3, look: V3, rate = 0.0025) => (f: number): { pos: V3; look: V3 } => ({ pos: lerp3(pos, look, Math.min(0.6, rate * f)), look });
const sf = (id: number) => SHOTS[id - 1].a;
const off = (o: V3, d: V3): V3 => [o[0] + d[0], o[1] + d[1], o[2] + d[2]];
const roadPt = (dist: number): V3 => [roadX(-dist), 0, -dist];

export const CAMS: Record<number, Key[]> = {
  // 1 hook: low beside the border post, the dog trots in; a telegram flutters down in front of it
  [S.HOOK]: [{ f: 0, s: (f) => ({ ...creep([2.6, 1.35, 7.6], [-0.4, 0.7, 1.0], 0.002)(f), fov: 40, roll: R(-3) }) }],
  // 2 the pass from above: two huts, two flags, two sentries glaring across the line
  [S.PASS]: [{ f: sf(S.PASS), s: (f) => ({ ...creep([-12, 11, 18], [1.5, 0.5, -2.5], 0.0018)(f - sf(S.PASS)), fov: 42, roll: R(2) }) }],
  // 3 the dog wanders across the line: low side view, the white stones in the foreground
  [S.CROSS]: [{ f: sf(S.CROSS), s: (f) => { const d = dogAt(f / FPS), u = f - sf(S.CROSS); return { pos: [5.8, 0.95, d.z + 0.4 - 0.006 * u], look: [0.6, 0.42, d.z - 0.25], fov: 38, roll: R(3) }; } }],
  // 4 he runs after it, the Bulgarian guard pops up and fires (over the guard's shoulder)
  [S.SHOT]: [{ f: sf(S.SHOT), s: (f) => ({ ...creep([14, 2.0, -0.5], [0.9, 1.0, -0.6], 0.0016)(f - sf(S.SHOT)), fov: 42, roll: R(-3) }) }],
  // 5 Athens: Pangalos slams his desk; in on the 48-hour clock
  [S.ATHENS]: [
    { f: sf(S.ATHENS), s: (f) => ({ ...creep(off(ATHENS, [0.4, 1.65, 4.6]), off(ATHENS, [0, 1.55, -1.4]), 0.0022)(f - sf(S.ATHENS)), fov: 40, roll: R(2) }) },
    { f: fr(T.hours), dur: 22, s: (f) => ({ ...creep(off(ATHENS, [1.0, 1.9, 2.6]), off(ATHENS, [0.4, 2.0, -1.0]), 0.002)(f - fr(T.hours)), fov: 40, roll: R(-3) }) },
  ],
  // 6 Bulgaria says sorry: its official bows at the border to the stern Greek sentries
  [S.SORRY]: [{ f: sf(S.SORRY), s: (f) => ({ ...creep([9, 2.0, 7], [-0.3, 1.1, 0.4], 0.0022)(f - sf(S.SORRY)), fov: 42, roll: R(3) }) }],
  // 7 the Greek column marches on Petrich: side tracking, then up to reveal the town ahead
  [S.MARCH]: [
    { f: sf(S.MARCH), s: (f) => { const d = columnFront(f / FPS) - 6, p = roadPt(d); return { pos: [p[0] - 7.5, 1.5, p[2] + 2], look: [p[0], 1.2, p[2] - 1], fov: 40, roll: R(-3) }; } },
    { f: fr(T.marches), dur: 32, s: (f) => { const d = columnFront(f / FPS), p = roadPt(d); return { pos: [p[0] - 9, 14, p[2] + 16], look: [roadX(PETRICH_Z), 2, PETRICH_Z + 10], fov: 42, roll: R(2) }; } },
  ],
  // 8 Sofia: the official taps the telegraph; a referee's whistle pops up
  [S.SOFIA]: [{ f: sf(S.SOFIA), s: (f) => ({ ...creep(off(SOFIA, [-0.6, 1.55, 4.0]), off(SOFIA, [0.2, 1.5, -1.0]), 0.0022)(f - sf(S.SOFIA)), fov: 40, roll: R(-2) }) }],
  // 9 Paris: Briand at the head of the council table fires off the telegram
  [S.PARIS]: [
    { f: sf(S.PARIS), s: (f) => ({ ...creep(off(PARIS, [0.2, 3.1, 3.8]), off(PARIS, [0, 1.35, -2.8]), 0.0018)(f - sf(S.PARIS)), fov: 42, roll: R(2) }) },
    { f: fr(T.telegram), dur: 24, s: (f) => ({ ...creep(off(PARIS, [0.9, 1.9, 0.6]), off(PARIS, [0, 1.75, -3.4]), 0.002)(f - fr(T.telegram)), fov: 40, roll: R(-3) }) },
  ],
  // 10 the front line: the telegram lands in the Greek officer's hands, hours before the attack
  [S.FRONT]: [{ f: sf(S.FRONT), s: (f) => { const p = roadPt(-FRONT_LINE_Z); return { ...creep([p[0] + 3.0, 1.6, p[2] - 3.4], [p[0], 1.55, p[2] + 0.4], 0.0025)(f - sf(S.FRONT)), fov: 38, roll: R(3) }; } }],
  // 11 luckily: both armies frozen face to face at the edge of Petrich
  [S.FROZEN]: [{ f: sf(S.FROZEN), s: (f) => { const x = roadX(FRONT_LINE_Z); return { ...creep([x - 13, 5.5, FRONT_LINE_Z + 14], [x + 1, 1.0, FRONT_LINE_Z - 9], 0.0018)(f - sf(S.FROZEN)), fov: 42, roll: R(-2) }; } }],
  // 12 unluckily: back in Athens, the bill unrolls in front of Pangalos
  [S.BILL]: [{ f: sf(S.BILL), s: (f) => ({ ...creep(off(ATHENS, [-0.3, 1.6, 3.6]), off(ATHENS, [0.1, 1.5, -1.0]), 0.0025)(f - sf(S.BILL)), fov: 40, roll: R(-3) }) }],
  // 13 the playground: two kids mid-fight, the teacher steps in, the whole class watching
  [S.SCHOOL]: [
    { f: sf(S.SCHOOL), s: (f) => ({ ...creep(off(SCHOOL, [0.4, 1.4, 5.2]), off(SCHOOL, [0, 1.05, 0]), 0.002)(f - sf(S.SCHOOL)), fov: 40, roll: R(2) }) },
    { f: fr(T.watching), dur: 28, s: (f) => ({ ...creep(off(SCHOOL, [-3.5, 2.6, 7.5]), off(SCHOOL, [0.5, 0.9, -1.0]), 0.0018)(f - fr(T.watching)), fov: 42, roll: R(-2) }) },
  ],
  // 14 Greece pulls out: the column marches home across the line; a sack of money drops for Bulgaria
  [S.BACK]: [{ f: sf(S.BACK), s: (f) => ({ ...creep([10, 2.2, -2], [-0.5, 1.0, 0.5], 0.0018)(f - sf(S.BACK)), fov: 42, roll: R(-3) }) }],
  // 15 unfair: Pangalos points at the map of Corfu
  [S.UNFAIR]: [{ f: sf(S.UNFAIR), s: (f) => ({ ...creep(off(ATHENS, [0.8, 1.7, 3.8]), off(ATHENS, [-0.1, 1.65, -1.2]), 0.0022)(f - sf(S.UNFAIR)), fov: 40, roll: R(3) }) }],
  // 16 and the dog? alone on the pass at sunset, wagging, slow pull back
  [S.DOG]: [{ f: sf(S.DOG), s: (f) => { const u = f - sf(S.DOG); return { pos: [2.6 + 0.012 * u, 1.0 + 0.004 * u, -3.0 - 0.02 * u], look: [-0.4, 0.55, 1.6], fov: 40, roll: R(-2) }; } }],
};
export const DOG_END: V3 = [-0.4, 0, 1.2];

const camKey = (id: number, f: number): Cam => {
  const ks = CAMS[id];
  let i = 0; while (i + 1 < ks.length && f >= ks[i + 1].f) i++;
  const k = ks[i], out: Cam = { fov: 40, roll: 0, ...k.s(f) };
  if (i > 0 && !k.cut) {
    const p: Cam = { fov: 40, roll: 0, ...ks[i - 1].s(f) }, u = smoother((f - k.f) / (k.dur ?? 24));
    return { pos: lerp3(p.pos, out.pos, u), look: lerp3(p.look, out.look, u), fov: lerp(p.fov, out.fov, u), roll: lerp(p.roll, out.roll, u) };
  }
  return out;
};
export const KICKS: { f: number; a: number }[] = [
  { f: fr(T.shoots) + 2, a: 1.2 },       // the shot
  { f: fr(T.furious) + 3, a: 0.9 },      // Pangalos slams the desk
  { f: fr(T.pounds) + 8, a: 0.5 },       // the money sack lands
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
  { f: 0, cInf: 13 }, { f: sf(S.PASS), cInf: 0 }, { f: sf(S.CROSS), cInf: 14 }, { f: sf(S.SHOT), cInf: 9 }, { f: sf(S.ATHENS), cInf: 12 },
  { f: sf(S.SORRY), cInf: 10 }, { f: sf(S.MARCH), cInf: 8 }, { f: fr(T.marches), dur: 32, cInf: 0 }, { f: sf(S.SOFIA), cInf: 12 },
  { f: sf(S.PARIS), cInf: 10 }, { f: sf(S.FRONT), cInf: 14 }, { f: sf(S.FROZEN), cInf: 0 }, { f: sf(S.BILL), cInf: 12 },
  { f: sf(S.SCHOOL), cInf: 12 }, { f: fr(T.watching), dur: 28, cInf: 6 }, { f: sf(S.BACK), cInf: 6 }, { f: sf(S.UNFAIR), cInf: 12 }, { f: sf(S.DOG), cInf: 13 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)], k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
