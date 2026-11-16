// Seamless scene transitions. The reference shorts almost never hard-cut between places: the camera is already
// moving when it leaves a scene and still moving when it arrives, in the SAME direction, so the eye carries over.
// Kinds:
//  - "cut":   a hard cut (use inside one place, between close angles; the camera keeps creeping across it)
//  - "whip":  the outgoing camera accelerates into a fast pan, the frame smears with motion blur along the pan,
//             the incoming camera arrives from the same pan and settles (springy). 8-10 frames. Best between places.
//  - "push":  the camera pushes forward through the outgoing scene (zoom + soft blur) and the incoming scene opens
//             from slightly behind, overlapping. 10-14 frames. Best into a new place or time.
//  - "match": a crossfade where both cameras drift the same way (same screen motion). 8-12 frames.
//  - "flash": a 4-frame white flash on the cut (shocks, time jumps).
// Two parts: cutMotion() adds the camera half (world.ts, after framing, before float/shake), layersAt() gives the
// picture half (the composition stacks the two shot canvases with CSS transforms + an SVG directional blur).
// Pure functions of the frame. Copy next to story.ts.

export type TransKind = "cut" | "whip" | "push" | "match" | "flash";
export type Trans = { kind: TransKind; dur?: number; /** screen direction of travel for whip / match, e.g. [1, 0] = pan right */ dir?: [number, number] };
export type ShotSpan = { id: number; a: number; b: number };
const DUR: Record<TransKind, number> = { cut: 0, whip: 10, push: 12, match: 10, flash: 4 };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

/** the transition INTO shot `id` (keyed by the incoming shot) */
export type TransMap = Record<number, Trans>;

/** the camera half: extra yaw / pitch (rad) and dolly (m, + = forward) for shot `id` at frame f, from the transitions
 *  at its start (incoming) and at its end (outgoing). Outgoing accelerates into the move; incoming lands from it. */
export const cutMotion = (id: number, f: number, shots: ShotSpan[], T: TransMap) => {
  const s = shots[id - 1], out = { yaw: 0, pitch: 0, dolly: 0 };
  const add = (tr: Trans | undefined, side: "in" | "out", cutF: number) => {
    if (!tr || tr.kind === "cut" || tr.kind === "flash") return;
    // the camera swing spans EXACTLY the picture blur window (dur / 2 each side): a swing outside the blur reads as a jerk
    const n = (tr.dur ?? DUR[tr.kind]) / 2, [dx, dy] = tr.dir ?? [1, 0];
    const u = side === "out" ? clamp01((f - (cutF - n)) / n) : clamp01(1 - (f - cutF) / n); // 0 far from the cut .. 1 at it
    if (u <= 0) return;
    if (tr.kind === "whip") { const k = smooth(u) * smooth(u); out.yaw += (side === "out" ? 1 : -1) * dx * 0.55 * k; out.pitch += (side === "out" ? 1 : -1) * dy * 0.3 * k; }
    if (tr.kind === "push") { const k = u * u; out.dolly += side === "out" ? 2.2 * k : -1.6 * k; }
    if (tr.kind === "match") { const k = u * u; out.yaw += (side === "out" ? 1 : -1) * dx * 0.08 * k; out.pitch += (side === "out" ? 1 : -1) * dy * 0.05 * k; }
  };
  add(T[id], "in", s.a);
  if (id < shots.length) add(T[id + 1], "out", s.b);
  // pan right = turn right: the world slides left on screen
  return { yaw: -out.yaw, pitch: out.pitch, dolly: out.dolly };
};

export type Layer = { id: number; alpha: number; scale: number; tx: number; ty: number; blur: [number, number] };
/** the picture half: which shot canvases to draw at frame f (bottom first) and how. tx/ty in % of the frame,
 *  blur in px (x, y) for an SVG feGaussianBlur. Also returns the white flash level. */
export const layersAt = (f: number, shots: ShotSpan[], T: TransMap): { layers: Layer[]; flash: number } => {
  const plain = (id: number): Layer => ({ id, alpha: 1, scale: 1, tx: 0, ty: 0, blur: [0, 0] });
  for (const s of shots) {
    const tr = T[s.id];
    if (!tr || tr.kind === "cut" || s.id === 1) continue;
    const d = tr.dur ?? DUR[tr.kind], h = d / 2;
    if (f < s.a - h || f >= s.a + h) continue;
    const u = (f - (s.a - h)) / d, prev = s.id - 1; // 0 .. 1 across the transition
    if (tr.kind === "flash") return { layers: [plain(f < s.a ? prev : s.id)], flash: f >= s.a ? [1, 0.75, 0.45, 0.2][Math.min(3, f - s.a)] : 0 };
    if (tr.kind === "whip") {
      const [dx, dy] = tr.dir ?? [1, 0], before = f < s.a, k = before ? smooth(u * 2) : smooth((1 - u) * 2); // 1 at the cut
      const amt = k * k, sm = 70 * amt;
      // slide 8 % and scale up enough (>= 1 + 2 x slide + blur margin) that the frame edge never shows the empty backdrop
      return { layers: [{ id: before ? prev : s.id, alpha: 1, scale: 1 + 0.24 * amt, tx: (before ? -1 : 1) * dx * 8 * amt, ty: (before ? -1 : 1) * -dy * 8 * amt, blur: [Math.abs(dx) * sm + 2 * amt, Math.abs(dy) * sm + 2 * amt] }], flash: 0 };
    }
    if (tr.kind === "push") {
      const e = smooth(u);
      return { layers: [
        { id: prev, alpha: 1, scale: 1 + 0.22 * e, tx: 0, ty: 0, blur: [6 * e, 6 * e] },
        { id: s.id, alpha: e, scale: 0.94 + 0.06 * e, tx: 0, ty: 0, blur: [5 * (1 - e), 5 * (1 - e)] },
      ], flash: 0 };
    }
    // match: a soft dissolve, both frames sliding a touch in the travel direction
    const [dx, dy] = tr.dir ?? [1, 0], e = smooth(u);
    return { layers: [
      { id: prev, alpha: 1, scale: 1.01, tx: -dx * 2 * e, ty: dy * 2 * e, blur: [0, 0] },
      { id: s.id, alpha: e, scale: 1.01, tx: dx * 2 * (1 - e), ty: -dy * 2 * (1 - e), blur: [0, 0] },
    ], flash: 0 };
  }
  const cur = shots.find((s) => f >= s.a && f < s.b) ?? shots[shots.length - 1];
  return { layers: [plain(cur.id)], flash: 0 };
};
