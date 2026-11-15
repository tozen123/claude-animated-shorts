// The dog short's cast as lit flat sprites in the 3D world (sprite system from the bridge template: canvas pool,
// cardShade() character cards, unlit effect cards, contact blobs, blinks, light-matched painted crescents).
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxShadow, fxContact, fxPuff, fxBurst, dogSide, DogOpts, fxTelegram, fxClock, fxBill, fxCoinBag, fxWhistle, fxCorfu,
  Outfit, FrontOpts, SideOpts, SKINS,
} from "./toon";
import {
  FPS, D0, V3, smooth, clamp01, T, S, SHOTS, GR_SENTRY, BG_GUARD, ATHENS, SOFIA, PARIS, SCHOOL, roadX, FRONT_LINE_Z, COLUMN, marchPhase,
  columnFront, homeFront, dogAt, chaserZ, DOG_END,
} from "./story";
import { NOINK } from "./ink";
import { popIn, dropIn, hop, punch, breathe, mix, Squash } from "./bounce";
import { sparks, impactDust, sparkles, shockLines, embers } from "./particles";
import { reaction, ExprKey } from "./reactions";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; glowM: THREE.MeshBasicMaterial; r: Req | null = null;
  private glowing = false;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    // additive HDR glow: sparks, glowing eyes, embers, lightning (blooms past the 1.0 threshold)
    this.glowM = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean, glow?: number, tint?: [number, number, number]) {
    this.glowing = !!glow;
    if (glow) { this.glowM.color.setRGB(...(tint ?? [1, 1, 1])).multiplyScalar(glow); this.mesh.material = this.glowM; this.mesh.renderOrder = 7; }
    else this.mesh.material = soft ? this.soft : this.mat;
  }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.glowM.map = t; if (!this.glowing) this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
  /** bounce (bounce.ts): squash scales about the feet + hop height */
  sx?: number; sy?: number; dy?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean;
  /** additive HDR glow (particles.ts): gain > 1 blooms; tint = linear RGB of the light */
  glow?: number; tint?: [number, number, number] };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const SWAPS: Record<number, number[]> = {};
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};


// =====================================================================================================
// dog short staging (main subjects bounce with bounce.ts; scenery never does)
// =====================================================================================================
export type Stage = { places: Place[]; fx: FxPlace[] };
const SK = SKINS;
const GREEK = (v: number): Outfit => ({ jacket: "#9b8f5e", pants: "#7f7548", boots: "#4a3426", hat: "kepi", cap: "#8a7f52", belt: "#5a3b22", buttons: "#c9a24e", rifle: true, skin: SK[v % 4], moustache: v % 3 === 1 ? "#3a2a20" : undefined });
const BULG = (v: number): Outfit => ({ jacket: "#6f7a5c", pants: "#565f46", boots: "#2b2a30", hat: "kepi", cap: "#5d6648", belt: "#3a3028", buttons: "#c9ccd2", rifle: true, skin: SK[(v + 2) % 4], moustache: v % 2 ? "#2a201a" : undefined });
const OFFICER_GR: Outfit = { ...GREEK(0), rifle: false, belt: null, sash: "#2f5f9a", sword: true, moustache: "#2a201a", buttons: "#e8c45a" };
export const PANGALOS: Outfit = { jacket: "#7a6f45", pants: "#5a5236", boots: "#2b2a30", hat: "kepi", cap: "#6a603c", buttons: "#e8c45a", sash: "#2f5f9a", moustache: "#2a201a", build: "stout", skin: SK[1] };
const BG_OFFICIAL: Outfit = { jacket: "#3b3f52", pants: "#2b2f3d", boots: "#2b2a30", hat: "hair", hair: "#2a201a", moustache: "#2a201a", skin: SK[2] };
const BRIAND: Outfit = { jacket: "#2e2a36", pants: "#2b2f3d", boots: "#2b2a30", hat: "hair", hair: "#8f8f96", moustache: "#6a6a70", build: "stout", skin: SK[0] };
const COUNCIL: Outfit[] = ["#3b3f52", "#4a3a3a", "#2f4a5a", "#5a4a3a", "#3a4a3a", "#4a4a5a", "#2e2a36", "#5a3a4a"].map((j, i) => ({
  jacket: j, pants: "#2b2f3d", boots: "#2b2a30", hat: i % 3 === 0 ? "tophat" : "hair", hair: ["#5a3b2a", "#8f8f96", "#2a201a"][i % 3], moustache: i % 2 ? "#4a3a30" : undefined, skin: SK[i % 4] }));
const TEACHER: Outfit = { jacket: "#4a6fa5", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#5a3b2a", dress: "#5a8fc2", skin: SK[0] };
const KIDS: Outfit[] = ["#f08a2c", "#3f6fb5", "#d23b3b", "#2f8a4f", "#7b5ac9", "#e0a35a", "#2f5f6a", "#c25a7a"].map((j, i) => ({
  jacket: j, pants: ["#3b5b9a", "#3b3f52", "#5a3b2a"][i % 3], boots: "#4a3426", hat: i % 3 === 0 ? "cap" : "hair", cap: "#e2453c", hair: ["#5a3b2a", "#2a201a", "#8a5a34", "#d9a441"][i % 4], build: "kid", skin: SK[i % 4] }));

const who = (i: number, o: Outfit, okey: string): Who => ({ i, o, okey });
const FRONT = { side: false, mirror: false };
const sqOf = (s: Squash) => ({ sx: s.sx, sy: s.sy, dy: s.y });
const lerpV = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = SHOTS[id - 1].light;
  findSun(cam, SUN);
  const stand = (i: number, o: Outfit, okey: string, x: number, z: number, fo: FrontOpts, sq?: Squash, sc = 1, y = D0) => {
    const s = sq ? mix(breathe(t, i), sq) : breathe(t, i);
    out.places.push({ ...person(cam, who(i, o, okey), x, y, z, FRONT, { blink: lidAt(t, i), ...fo }, {}, sc), ...sqOf(s) });
    if (y === D0) blob(out, x, D0, z, sc * (1 - 0.6 * Math.min(1, s.y / 0.5)));
  };
  /** a standing character whose face follows an expression timeline: the drawing, the reaction squash and the
   *  reaction effects (glowing eyes, bolts, sweat, sparkles, shock lines) all come from reactions.ts */
  const actor = (i: number, o: Outfit, okey: string, x: number, z: number, fo: FrontOpts, keys: ExprKey[], fallback: string, extra?: Squash, kid = false) => {
    const r = reaction(t, keys, { x, z, kid, seed: i }, cam, fallback);
    stand(i, o, okey, x, z, { ...fo, expr: r.expr as FrontOpts["expr"] }, extra ? mix(r.squash, extra) : r.squash);
    out.fx.push(...(r.fx as FxPlace[]));
  };
  /** a walking / marching / running figure: picks the front or side drawing from the camera, mirrors to its heading */
  const walker = (i: number, o: Outfit, okey: string, x: number, z: number, dx: number, dz: number, phase: number, fo: FrontOpts = {}, so: SideOpts = {}, sq?: Squash) => {
    const v = viewOf(cam, x, z, dx, dz), ph = q(phase, 24);
    const s = sq ?? { y: 0, sx: 1, sy: 1 };
    out.places.push({ ...person(cam, who(i, o, okey), x, D0, z, v, { mode: "march", phase: ph, blink: lidAt(t, i), ...fo }, { mode: "march", phase: ph, stride: v.fs, blink: lidAt(t, i), ...so }), ...sqOf(s) });
    blob(out, x, D0, z);
  };
  const dog = (x: number, z: number, dx: number, dz: number, o: DogOpts, sq?: Squash) => {
    const v = viewOf(cam, x, z, dx || 1e-3, dz), light = light2D(cam, v.mirror);
    const d = cam.pos.distanceTo(tmp.set(x, 0.4, z)), [w, h, k] = tier(d * 0.8);
    const o2: DogOpts = { ...o, light, phase: o.phase === undefined ? undefined : q(o.phase, 16), wag: o.wag === undefined ? undefined : q(o.wag, 8), blink: lidAt(t, 99) };
    const s = sq ?? { y: 0, sx: 1, sy: 1 };
    out.places.push({ key: `DOG|${fkey(o2)}`, x, y: D0, z, mirror: v.mirror, draw: (p) => dogSide(p, o2), size: [w, h, k], ...sqOf(s) });
    blob(out, x, D0, z, 0.9);
  };
  const card = (key: string, cw: number, ch: number, draw: (p: Pen) => void, at: V3, w: number, h: number, extra: Partial<FxPlace> = {}) =>
    out.fx.push({ key, cw, ch, draw, x: at[0], y: at[1], z: at[2], w, h, ...extra });
  const wagOf = (rate = 2.6) => Math.sin(t * Math.PI * 2 * rate);
  const column = (front: number, dir: 1 | -1, frozen = false, along = true) => {
    // Greek column: rows behind the front row along the road (dir -1: marching north to Petrich; +1: home, south)
    const { files, rows, gap, fileGap } = COLUMN;
    for (let r = 0; r < rows; r++) for (let fi = 0; fi < files; fi++) {
      const i = 200 + r * files + fi;
      const dist = front - r * gap * dir * -1 * (along ? 1 : 1);
      const z = dir < 0 ? -(front - r * gap) : front - r * gap;
      const cx = dir < 0 ? roadX(z) : 0, x = cx + (fi - (files - 1) / 2) * fileGap;
      const dx = dir < 0 ? roadX(z - 1) - roadX(z) : 0;
      const ph = frozen ? 0.25 + 0.03 * (i % 3) : marchPhase(t + (r % 2) * 0.02);
      void dist;
      walker(i, r === 0 && fi === 1 && dir < 0 ? OFFICER_GR : GREEK(i), r === 0 && fi === 1 && dir < 0 ? "officer" : "gr" + (i % 4), x, z, dx, dir, ph,
        { expr: frozen ? "shock" : "stern" }, { expr: frozen ? "shock" : "stern" });
    }
  };
  const defenders = (frozen: boolean) => {
    for (let k = 0; k < 9; k++) {
      const z = FRONT_LINE_Z - 9 - (k % 2) * 1.3, x = roadX(z) + (k - 4) * 1.25;
      const i = 300 + k;
      out.places.push({ ...person(cam, who(i, BULG(k), "bg" + (k % 4)), x, D0, z, FRONT, { mode: frozen ? "march" : "stand", phase: frozen ? 0.25 : 0, expr: frozen ? "nervous" : "stern", blink: lidAt(t, i) }, {}), ...sqOf(breathe(t, i)) });
      blob(out, x, D0, z);
    }
  };

  switch (id) {
    case S.HOOK: {
      const d = dogAt(t);
      dog(d.x, d.z, d.dx, d.dz, { mode: d.mode, phase: t * 2.2, wag: wagOf(d.mode === "stand" ? 3 : 2), tongue: true },
        d.mode === "stand" ? hop(t - (T.telegram1 + 0.55), 0.18, 0.3) : undefined);
      if (t > T.telegram1 - 0.6) {
        const k = dropIn(t - (T.telegram1 - 0.6), 2.6, 0.25), falling = k.y > 0.02;
        card("telegram", 500, 620, (p) => fxTelegram(p), [0.55, 0.32 + k.y, 2.5], 0.42 * k.sx, 0.52 * k.sy, { rot: falling ? 0.35 * Math.sin(t * 9) : 0 });
      }
      break;
    }
    case S.PASS:
      stand(10, GREEK(0), "grS", GR_SENTRY[0], GR_SENTRY[2], { mode: "stand", expr: "stern" });
      stand(11, BULG(0), "bgG", BG_GUARD[0], BG_GUARD[2], { mode: "stand", expr: "stern" });
      dog(-0.6, 1.4, 1, 0, { mode: "sit", wag: wagOf(2.2) });
      break;
    case S.CROSS: {
      const d = dogAt(t);
      dog(d.x, d.z, d.dx, d.dz, { mode: "trot", phase: t * 2.2, wag: wagOf(2.4) }, mix(breathe(t, 99, 0.01), { y: stepBobDog(t), sx: 1, sy: 1 }));
      break;
    }
    case S.SHOT: {
      const d = dogAt(t);
      dog(d.x, d.z, d.dx, d.dz, { mode: "trot", phase: t * 2.6, wag: wagOf(3) });
      const z = Math.max(chaserZ(t), -1.8);
      if (t < T.shoots + 0.05) walker(12, GREEK(1), "grChase", 0.2, z, 0, -1, (t * 1.6) % 1, { expr: "nervous" }, { expr: "nervous" });
      else {
        const k = smooth((t - T.shoots) / 0.35);
        out.places.push({ ...person(cam, who(12, GREEK(1), "grChase"), 0.2, D0, z, FRONT, { mode: "stand", expr: "dazed" }, {}), roll: -1.45 * k, dy: 0.05 * k });
        blob(out, 0.2, D0, z);
      }
      const g = hop(t - T.runs - 0.35, 0.3, 0.38);
      actor(11, BULG(0), "bgG", BG_GUARD[0], BG_GUARD[2], { mode: "stand" }, [{ t: T.shoots + 0.2, expr: "shock" }], "stern", t < T.shoots + 0.1 ? g : undefined);
      if (t > T.shoots - 0.04 && t < T.shoots + 0.8) {
        const u = q((t - T.shoots + 0.04) / 0.84, 30), muzzle: V3 = [BG_GUARD[0] - 0.55, 1.55, BG_GUARD[2] + 0.35];
        if (u < 0.3) card(`burst${u}`, 500, 500, (p) => fxBurst(p, u / 0.3, "#fff3b0", 8, 30, 160), muzzle, 0.7, 0.7);
        card(`puff${u}`, 300, 300, (p) => fxPuff(p, u), [muzzle[0] - 0.2 * u, muzzle[1] + 0.25 * u, muzzle[2]], 0.9 + 0.6 * u, 0.9 + 0.6 * u, { soft: true });
      }
      out.fx.push(...(sparks(t - T.shoots, [BG_GUARD[0] - 0.55, 1.55, BG_GUARD[2] + 0.35], cam, 3, { n: 18, speed: 4.5, dir: [-0.8, 0.3, 0.5], spread: 0.5, size: 0.25 }) as FxPlace[]));
      out.fx.push(...(impactDust(t - T.shoots - 0.3, [0.2, 0, z], 4, { n: 7, size: 0.9, chunks: 3, chunkCol: "#8a7a5a" }) as FxPlace[]));
      break;
    }
    case S.ATHENS: case S.BILL: case S.UNFAIR: {
      const pz = ATHENS[2] - 1.55;
      const keys: ExprKey[] = id === S.ATHENS ? [{ t: T.furious - 0.07, expr: "furious" }]
        : id === S.BILL ? [{ t: T.bill - 0.07, expr: "shock" }] : [{ t: T.unfair, expr: "stern" }, { t: T.greecePay - 0.07, expr: "furious" }];
      const sq = id === S.ATHENS ? mix(punch(t - T.hours, 0.08), punch(t - T.francs, 0.08)) : id === S.UNFAIR ? punch(t - T.italy, 0.08) : undefined;
      const px = ATHENS[0] + (id === S.UNFAIR ? 0.3 : 0);
      actor(1, PANGALOS, "pangalos", px, pz, { mode: "stand", wave: id === S.UNFAIR && t > T.italy ? 0.6 : id === S.ATHENS && t > T.hours ? 0.3 + 0.2 * Math.sin(t * 6) : undefined, facing: id === S.UNFAIR ? -1 : 0 }, keys, id === S.BILL ? "neutral" : "stern", sq);
      if (id === S.ATHENS) out.fx.push(...(impactDust(t - T.furious - 0.08, [px, 0.95, pz + 0.75], 3, { n: 6, size: 0.45, chunks: 4, chunkCol: "#f6efd9" }) as FxPlace[])); // papers jump off the slammed desk
      if (id === S.ATHENS && t > T.hours - 0.1) {
        const k = popIn(t - T.hours + 0.1);
        card(`clock${q(t % 1, 12)}`, 500, 500, (p) => fxClock(p, t * 3), [ATHENS[0] + 0.85, 2.05, ATHENS[2] - 0.95], 0.75 * k, 0.75 * k);
      }
      if (id === S.ATHENS && t > T.francs) { const k = dropIn(t - T.francs, 1.2); card("coinbag", 420, 440, (p) => fxCoinBag(p), [ATHENS[0] - 0.75, 1.17 + k.y, ATHENS[2] - 0.6], 0.42 * k.sx, 0.44 * k.sy); out.fx.push(...(sparkles(t, [ATHENS[0] - 0.75, 1.3, ATHENS[2] - 0.5], 5, { n: 4, radius: 0.25, size: 0.1 }) as FxPlace[])); }
      if (id === S.BILL && t > T.bill - 0.2) {
        const u = q(smooth((t - T.bill + 0.2) / 1.0), 30), k = popIn(t - T.bill + 0.2);
        card(`bill${u}`, 400, 1000, (p) => fxBill(p, u), [ATHENS[0] + 0.62, 1.42, ATHENS[2] - 0.75], 0.5 * k, 1.25 * k);
      }
      if (id === S.UNFAIR && t > T.italy - 0.25) {
        const k = popIn(t - T.italy + 0.25);
        card(`corfu${q(t % 1, 12)}`, 700, 500, (p) => fxCorfu(p, t), [ATHENS[0] - 0.75, 1.95, ATHENS[2] - 1.1], 1.05 * k, 0.75 * k);
      }
      break;
    }
    case S.SORRY: {
      const bow = smooth((t - T.sorry - 0.2) / 0.35) * (1 - 0.5 * smooth((t - T.misunderstanding - 0.3) / 0.4));
      actor(20, BG_OFFICIAL, "bgOff", 0.6, -0.9, { mode: "stand", tilt: -16 * bow, facing: -1 }, [{ t: T.sorry - 0.07, expr: "nervous" }], "neutral", punch(t - T.misunderstanding, 0.1));
      stand(10, GREEK(0), "grS", -1.1, 1.6, { mode: "stand", expr: "stern", facing: 1 });
      stand(13, GREEK(2), "grS2", -2.0, 2.4, { mode: "stand", expr: "stern", facing: 1 });
      break;
    }
    case S.MARCH: {
      column(columnFront(t), -1); defenders(false);
      const f0 = columnFront(t);
      for (let k = 0; k < 6; k++) { const dz = -(f0 - 1.2 - k * 2.2); out.fx.push(...(impactDust(((t + k * 0.37) % 1.1), [roadX(dz) + (k % 2 ? 0.6 : -0.6), 0, dz], 20 + k, { n: 3, size: 0.7, chunks: 0, col: "214,190,150" }) as FxPlace[])); }
      break;
    }
    case S.FRONT: {
      column(-FRONT_LINE_Z - 0.0, -1, true);
      const p: V3 = [roadX(FRONT_LINE_Z) + 0.0, 0, FRONT_LINE_Z];
      if (t > T.lands - 0.2) {
        const k = dropIn(t - T.lands + 0.2, 2.6, 0.2);
        card("telegram", 500, 620, (pp) => fxTelegram(pp), [p[0] + 0.32, 1.32 + k.y, p[2] - 0.35], 0.34 * k.sx, 0.42 * k.sy, { rot: k.y > 0.02 ? 0.3 * Math.sin(t * 9) : 0.08 });
        if (k.y < 0.02) out.fx.push(...(sparkles(t, [p[0] + 0.32, 1.4, p[2] - 0.4], 9, { n: 5, radius: 0.3, size: 0.12 }) as FxPlace[]));
      }
      if (t > T.attack - 0.07 && t < T.attack + 0.6) { const d = t - T.attack + 0.07; card(`shock${q(d, 20)}`, 300, 220, (pp) => shockLines(pp, d), [p[0], 1.95, p[2] - 0.1], 0.6 * Math.min(1, d * 6), 0.44 * Math.min(1, d * 6)); }
      break;
    }
    case S.FROZEN: column(-FRONT_LINE_Z, -1, true); defenders(true); break;
    case S.SOFIA: {
      const tap = Math.max(0, Math.sin(t * Math.PI * 2 * 3.2)) > 0.7 && t < T.league + 0.6;
      actor(20, BG_OFFICIAL, "bgOff", SOFIA[0], SOFIA[2] - 1.25, { mode: "stand", tilt: tap ? 2.5 : 0 }, [{ t: T.calls, expr: "nervous" }, { t: T.referee - 0.07, expr: "relief" }], "nervous");
      if (t > T.referee - 0.1) {
        const k = popIn(t - T.referee + 0.1);
        card(`whistle${q(t % 1, 12)}`, 520, 400, (p) => fxWhistle(p, t), [SOFIA[0] + 0.55, 2.12, SOFIA[2] - 0.9], 0.8 * k, 0.62 * k);
      }
      break;
    }
    case S.PARIS: {
      for (let k = 0; k < 8; k++) {
        const s = k % 2 ? 1 : -1, cz = PARIS[2] - 1.8 + Math.floor(k / 2) * 1.1, cx = PARIS[0] + s * 1.15;
        const pl = person(cam, who(400 + k, COUNCIL[k], "cn" + k), cx, D0 + 0.38, cz, FRONT, { mode: "sit", expr: t > T.telegram ? "smile" : "neutral", blink: lidAt(t, 400 + k) }, {});
        out.places.push({ ...pl, ...sqOf(breathe(t, 400 + k, 0.01)) });
      }
      const bp: V3 = [PARIS[0], 0, PARIS[2] - 2.95];
      actor(30, BRIAND, "briand", bp[0], bp[2], { mode: "stand", wave: t > T.telegram - 0.1 && t < T.lands ? 0.6 : undefined }, [{ t: T.council, expr: "stern" }, { t: T.stop - 0.07, expr: "grin" }], "stern", mix(punch(t - T.telegram, 0.1), punch(t - T.goHome, 0.08)));
      if (t > T.telegram) {
        const u = clamp01((t - T.telegram) / 0.7), k = popIn(t - T.telegram);
        const pos = lerpV([bp[0] + 0.45, 1.7, bp[2] + 0.3], [PARIS[0] + 0.15, 1.6, PARIS[2] - 1.3], smooth(u));
        card("telegram", 500, 620, (p) => fxTelegram(p), pos, 0.36 * k, 0.45 * k, { rot: (1 - u) * 6.28 * 1.5 });
        if (u < 1) out.fx.push(...(sparkles(t, pos, 7, { n: 4, radius: 0.25, size: 0.1 }) as FxPlace[]));
      }
      break;
    }
    case S.SCHOOL: {
      const C = SCHOOL;
      const ring = 9;
      for (let k = 0; k < ring; k++) {
        const a = Math.PI * (0.15 + 0.7 * (k / (ring - 1))) + Math.PI, r = 3.2;
        const x = C[0] + Math.cos(a) * r * 1.3, z = C[2] + Math.sin(a) * r - 0.6;
        stand(500 + k, KIDS[k % 8], "kid" + k, x, z, { mode: "stand", expr: t > T.watching ? "shock" : k % 2 ? "nervous" : "shock" }, t > T.watching ? hop(t - T.watching - 0.05 * k, 0.12, 0.25) : undefined);
      }
      const swing = t < T.watching + 0.6;
      actor(520, KIDS[2], "fighterA", C[0] - 0.55, C[2] + 0.1, { mode: "stand", wave: swing ? 0.9 : undefined, facing: 1 }, [{ t: T.works, expr: "furious" }, { t: T.watching + 0.5, expr: "nervous" }], "stern", swing ? punch(t - T.swinging, 0.12) : undefined, true);
      stand(521, KIDS[5], "fighterB", C[0] + 0.6, C[2] + 0.2, { mode: "stand", expr: "nervous", facing: -1, tilt: swing ? 8 : 0 });
      const tx = C[0] - 3.2 + 3.15 * smooth((t - T.fight + 0.2) / 0.5);
      stand(530, TEACHER, "teacher", tx, C[2] - 0.7, { mode: "stand", expr: "stern" }, hop(t - T.fight + 0.2, 0.22, 0.34));
      break;
    }
    case S.BACK: {
      column(homeFront(t), 1);
      stand(11, BULG(0), "bgG", 4.2, -0.6, { mode: "stand", expr: t < T.pounds + 0.4 ? "smile" : "grin", wave: 0.5 + 0.5 * Math.sin(t * 8) }, t > T.pounds + 0.4 ? hop((t - T.pounds - 0.4) % 0.9, 0.26, 0.36) : undefined);
      if (t > T.pounds - 0.1) { const k = dropIn(t - T.pounds + 0.1, 3.0, 0.3); card("coinbag", 420, 440, (p) => fxCoinBag(p), [5.1, 0.42 + k.y, -1.2], 0.8 * k.sx, 0.84 * k.sy);
        out.fx.push(...(impactDust(t - T.pounds - 0.43, [5.1, 0, -1.2], 6, { n: 8, size: 1.0, chunks: 0 }) as FxPlace[]));
        if (k.y < 0.02) out.fx.push(...(sparkles(t, [5.1, 0.6, -1.2], 11, { n: 5, radius: 0.45, size: 0.15 }) as FxPlace[])); }
      break;
    }
    case S.DOG:
      dog(DOG_END[0], DOG_END[2], 1, 0, { mode: "sit", wag: wagOf(2.0), tongue: true }, t > T.nobodyWrote + 0.3 ? hop(t - T.nobodyWrote - 0.3, 0.15, 0.28) : undefined);
      out.fx.push(...(embers(t, [DOG_END[0] - 0.6, 0.3, DOG_END[2] + 1.0], 13, { n: 10, radius: 1.6, rise: 1.6, size: 0.07, tint: [2.6, 1.7, 0.7] }) as FxPlace[]));
      break;
  }
  return out;
};
const stepBobDog = (t: number) => 0.02 * Math.abs(Math.sin(Math.PI * 4.4 * t));
