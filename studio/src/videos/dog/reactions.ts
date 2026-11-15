// Expression-change reactions, as in the reference shorts (audio-sample/): the moment a face changes, the character's
// body answers (a squash "punch", a hop for big surprises) and an effect card appears. Measured on the sheriff's
// "furious": within 1 frame the eyes turn glowing red (they bloom), the top of the face darkens, the body jolts, then
// short red jagged bolts crackle around him every 2-3 frames for as long as the anger lasts.
// Give each character an expression timeline [{t, expr}] (times from words.json, 0-3 frames before the word) and
// call reaction() every frame: use .expr for the drawing, .squash for the card, push .fx into the stage's fx list.
// Copy next to bounce.ts / particles.ts / toon.ts.
import { punch, hop, mix, Squash } from "./bounce";
import { FxCard, V3, CamLike, glowEyes, angerBolts, sparkles, sweat, shockLines, glowDot } from "./particles";

export type ExprKey = { t: number; expr: string };
export type Who = { x: number; y?: number; z: number; scale?: number; kid?: boolean; seed?: number };
const REST: Squash = { y: 0, sx: 1, sy: 1 };

/** head centre and eye positions of a standing front card (600 x 1000 design, SU = 0.00216 m/unit) */
export const headOf = (w: Who, cam: CamLike) => {
  const s = w.scale ?? 1, hy = (w.y ?? 0) + (w.kid ? 1.12 : 1.44) * s;
  const ex = 0.066 * s, rx = cam.right.x, rz = cam.right.z;
  // eyes sit a hair toward the lens so their glow draws over the card
  const dx = cam.pos.x - w.x, dz = cam.pos.z - w.z, d = Math.hypot(dx, dz) || 1, fx = (dx / d) * 0.04, fz = (dz / d) * 0.04;
  const eyes: [V3, V3] = [[w.x - rx * ex + fx, hy, w.z - rz * ex + fz], [w.x + rx * ex + fx, hy, w.z + rz * ex + fz]];
  return { head: [w.x, hy, w.z] as V3, eyes, top: [w.x, hy + 0.32 * s, w.z] as V3, side: [w.x + rx * 0.3 * s, hy + 0.1 * s, w.z + rz * 0.3 * s] as V3 };
};

/** expression at time t from a timeline (sorted by t) */
export const exprAt = (keys: ExprKey[], t: number, fallback = "neutral") => {
  let e = fallback, tc = -1e9;
  for (const k of keys) if (t >= k.t) { e = k.expr; tc = k.t; }
  return { expr: e, since: t - tc };
};

/** the body squash each expression change triggers (same values the switch in reaction() uses) */
const squashFor = (expr: string, since: number, s: number): Squash => {
  switch (expr) {
    case "furious": case "angry": return mix(punch(since, 0.18), hop(since - 0.02, 0.06 * s, 0.18));
    case "shock": return mix(hop(since, 0.16 * s, 0.3), punch(since - 0.42, 0.1));
    case "nervous": case "pained": return punch(since, 0.08);
    case "laugh": case "grin": case "relief": case "relief_open": return mix(punch(since, 0.1), hop(since - 0.05, 0.1 * s, 0.26));
    case "dazed": return punch(since, 0.14);
    default: return punch(since, 0.07);
  }
};

/** body squash + effect cards for the character's current expression */
export const reaction = (t: number, keys: ExprKey[], w: Who, cam: CamLike, fallback = "neutral") => {
  const { expr, since } = exprAt(keys, t, fallback), seed = w.seed ?? 1, s = w.scale ?? 1;
  // the head moves with the body's squash / hop, so the eyes, sweat and shock lines follow it
  const sq0 = squashFor(expr, since, s), H = headOf({ ...w, y: (w.y ?? 0) + sq0.y, scale: s * sq0.sy }, cam);
  const fx: FxCard[] = [];
  let squash: Squash = REST;
  const changed = since < 1e8;
  switch (expr) {
    case "furious":
    case "angry": {
      squash = changed ? mix(punch(since, 0.18), hop(since - 0.02, 0.06 * s, 0.18)) : REST;
      const pulse = 0.6 + 0.4 * Math.sin(t * 9);
      fx.push(...glowEyes(H.eyes, Math.min(1, since * 8) * pulse, [4.5, 0.6, 0.35], 0.17 * s));
      if (since > 0.12) fx.push(...angerBolts(t, [w.x, w.y ?? 0, w.z], seed, { radius: 0.5 * s, height: 1.3 * s, size: 0.34 * s }));
      if (since < 0.35) fx.push({ key: "glowdot", cw: 128, ch: 128, draw: glowDot, x: H.head[0], y: H.head[1], z: H.head[2], w: 0.8 * s, h: 0.8 * s, glow: 0.6 * (1 - since / 0.35), tint: [2.4, 0.4, 0.25] });
      break;
    }
    case "shock": {
      squash = changed ? mix(hop(since, 0.16 * s, 0.3), punch(since - 0.42, 0.1)) : REST;
      if (since < 0.6) { const k = Math.min(1, since * 6); fx.push({ key: `shock${Math.round(since * 20)}`, cw: 300, ch: 220, draw: (p) => shockLines(p, since), x: H.top[0], y: H.top[1] + 0.05, z: H.top[2], w: 0.55 * s * k, h: 0.4 * s * k }); }
      break;
    }
    case "nervous":
    case "pained": {
      squash = changed ? punch(since, 0.08) : REST;
      const u = (since % 1.1) / 1.1;
      fx.push({ key: "sweat", cw: 120, ch: 180, draw: sweat, x: H.side[0], y: H.side[1] + 0.12 * s - 0.25 * s * u, z: H.side[2], w: 0.09 * s, h: 0.135 * s });
      break;
    }
    case "laugh":
    case "grin":
    case "relief":
    case "relief_open": {
      squash = changed ? mix(punch(since, 0.1), hop(since - 0.05, 0.1 * s, 0.26)) : REST;
      if (since < 0.9) fx.push(...sparkles(t, H.head, seed, { radius: 0.42 * s, size: 0.14 * s }));
      break;
    }
    case "dazed":
      squash = changed ? punch(since, 0.14) : REST;
      break;
    default:
      squash = changed ? punch(since, 0.07) : REST;
  }
  return { expr, squash, fx };
};
