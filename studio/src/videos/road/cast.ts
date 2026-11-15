// The road short's cast as lit flat sprites in the 3D world (sprite system from the bridge template: canvas pool,
// cardShade() character cards, unlit effect cards, contact blobs, blinks, light-matched painted crescents).
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxStars, fxShadow, fxContact, fxPuff, fxBurst, fxSheepBubble, fxBrain, fxPin,
  Outfit, FrontOpts, SideOpts, SKINS,
} from "./toon";
import {
  FPS, D0, V3, smooth, clamp01, T, S, SHOTS, RIBBON_Z, HOOK_WRECK, SIGN_Z0, truckZ, sheepCarZ, hypCarZ, wobZ, AMB_STOP, MEDIC, WRECK_DRIVER, BEND_SPOT,
  firstDrift, drift, ambDrift, roadX, bendAt, Vehicle,
} from "./story";
import { NOINK } from "./ink";
import { popIn, dropIn, hop, punch, breathe, carBody, mix, stepBob, Squash } from "./bounce";
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
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
  /** bounce (bounce.ts): squash scales about the feet + hop height */
  sx?: number; sy?: number; dy?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
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
// road short staging
// =====================================================================================================
export type Stage = { places: Place[]; fx: FxPlace[] };
const SK = SKINS;
export const BERNIE: Outfit = { jacket: "#2f4a7a", pants: "#2b2f3d", boots: "#3a2a20", hat: "tophat", sash: "#d23b3b", moustache: "#5a3b2a", build: "stout", buttons: "#e8c45a", skin: SK[1] };
export const TRUCKER: Outfit = { jacket: "#c0533a", pants: "#3b5b9a", boots: "#4a3426", hat: "cap", cap: "#2f5f9a", build: "stout", moustache: "#3a2a20", skin: SK[3] };
export const MEDIC_O: Outfit = { jacket: "#f4f4f2", pants: "#3b5b9a", boots: "#2b2f3d", hat: "cap", cap: "#e2453c", buttons: "#e2453c", skin: SK[2] };
const DRIVERS: Outfit[] = [
  { jacket: "#5d7a3a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#5a3b2a", skin: SK[0] },
  { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#2a201a", skin: SK[3] },
  { jacket: "#e0a35a", pants: "#3b3f52", boots: "#4a3426", hat: "cap", cap: "#3f6fb5", skin: SK[1] },
  { jacket: "#2f5f6a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#8a5a34", moustache: "#5a3b2a", skin: SK[2] },
];
const FOLK: Outfit[] = [
  { jacket: "#3f6fb5", pants: "#3b3f52", boots: "#4a3426", hat: "cap", cap: "#e2453c", skin: SK[0] },
  { jacket: "#c25a7a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#5a3b2a", dress: "#d9a441", skin: SK[2] },
  { jacket: "#5d7a3a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#2a201a", skin: SK[3] },
  { jacket: "#b5653f", pants: "#2b2f3d", boots: "#4a3426", hat: "cap", cap: "#f3d35a", skin: SK[1] },
  { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#8a5a34", dress: "#5a8fc2", skin: SK[0] },
  { jacket: "#2f5f6a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#5a3b2a", moustache: "#4a3020", skin: SK[2] },
];
const who = (i: number, o: Outfit, okey: string): Who => ({ i, o, okey });
const FRONT = { side: false, mirror: false };
const SEAT = 0.62; // seated drivers are drawn at 62 % so cartoon heads fit the cartoon cars

/** a wreck that appears drops in from 3 m and bounces to rest (bounce.ts dropIn) */
const wreckV = (key: string, col: string, x: number, z: number, yaw: number, driver: number, since = 9): Vehicle => {
  const d = dropIn(since, 3.2);
  return { key, kind: "car", col, x, z, yaw, pitch: 0.035, sink: 0.06, roll: 0.03, driver, dust: since < 0.9 ? 0.45 + (0.5 * since) / 0.9 : 0, dy: d.y, sx: d.sx, sy: d.sy };
};
const sqOf = (s: Squash) => ({ sx: s.sx, sy: s.sy, dy: s.y });
const roadYawAt = (z: number, k: number) => -Math.atan2(roadX(z - 1, k) - roadX(z + 1, k), 2);
const wobXAt = (t: number) => 2.0 + 0.9 * Math.sin((t - T.sim) * 2.1) * smooth((t - T.wobbling) / 0.6) + 0.25 * Math.sin((t - T.sim) * 5.3);
const driftAt = (t: number, t0: number, zAt0: number, v: number) => drift(t, t0, zAt0 + t0 * v, v);
const ambDriftV = (t: number): Vehicle => {
  const d = ambDrift(t);
  return { key: "amb", kind: "ambulance", col: "#ffffff", x: d.x, z: d.z, yaw: d.yaw, roll: d.roll, pitch: d.pitch, sink: d.sink, dust: d.dust, lights: true, driver: 50, wheel: d.wheel };
};

/** the vehicles on screen in shot `id` at time t (world.ts builds meshes for them; drivers are placed in stage()) */
export const vehiclesAt = (id: number, t: number): Vehicle[] => {
  const out: Vehicle[] = [];
  const lane = (z: number, k = bendAt(t)) => 2.0 + roadX(z, k);
  switch (id) {
    case S.HOOK: out.push(wreckV("w0", "#e2453c", HOOK_WRECK[0], HOOK_WRECK[2], -0.75, 0)); break;
    case S.CROWD:
      for (let k = 0; k < 3; k++) {
        const z = -14 - (t - T.opening) * 7 - k * 13;
        out.push({ key: "c" + k, kind: "car", col: ["#3f6fb5", "#f3d35a", "#2f8a4f"][k], x: lane(z), z, yaw: 0, driver: k, wheel: z / -0.36 });
      }
      break;
    case S.TRUCK: { const z = truckZ(t); out.push({ key: "truck", kind: "truck", col: "#c9373a", x: 2.1, z, yaw: 0, driver: 100, wheel: z / -0.5 }); break; }
    case S.DRIFT: {
      const d = firstDrift(t);
      out.push({ key: "d1", kind: "car", col: "#3f6fb5", x: d.x, z: d.z, yaw: d.yaw, roll: d.roll, pitch: d.pitch, sink: d.sink, dust: d.dust, driver: 0, wheel: d.wheel });
      break;
    }
    case S.PILEUP: {
      const d = firstDrift(T.another + 30);
      out.push(wreckV("w1", "#3f6fb5", d.x, d.z, d.yaw, -1));
      if (t >= T.another) out.push(wreckV("w2", "#f3d35a", -12.5, -112, 0.7, -1, t - T.another));
      if (t >= T.three) out.push(wreckV("w3", "#2f8a4f", 13.5, -140, -0.5, -1, t - T.three));
      if (t >= T.three + 0.25) out.push(wreckV("w4", "#e98c3a", -13, -168, 0.9, -1, t - T.three - 0.25));
      if (t >= T.three + 0.5) out.push(wreckV("w5", "#7b5ac9", 12.5, -196, -0.8, -1, t - T.three - 0.5));
      break;
    }
    case S.SIGNS: {
      const d = driftAt(t, T.worse + 0.1, SIGN_Z0 - 46, 13);
      out.push({ key: "d8", kind: "car", col: "#e98c3a", x: d.x, z: d.z, yaw: d.yaw, roll: d.roll, pitch: d.pitch, sink: d.sink, dust: d.dust, driver: 1, wheel: d.wheel });
      break;
    }
    case S.SHEEP: { const z = sheepCarZ(t); out.push({ key: "s9", kind: "car", col: "#2f8a4f", x: 2.0, z, yaw: 0, driver: 3, wheel: z / -0.36 }); break; }
    case S.AMBULANCE: out.push(ambDriftV(t), wreckV("wa", "#f3d35a", AMB_STOP[0] + 2.2, AMB_STOP[2] - 6.5, -0.4, -1)); break;
    case S.DEADPAN:
      out.push({ ...ambDriftV(T.drifts + 5), driver: -1, dust: 0 });
      out.push(wreckV("wa", "#f3d35a", AMB_STOP[0] + 2.2, AMB_STOP[2] - 6.5, -0.4, -1));
      break;
    case S.HYPNOSIS: { const z = hypCarZ(t); out.push({ key: "h12", kind: "car", col: "#e2453c", x: 2.0, z, yaw: 0, driver: 2, wheel: z / -0.36 }); break; }
    case S.WOBBLE: {
      const z = wobZ(t), x = wobXAt(t), x2 = wobXAt(t + 0.05);
      out.push({ key: "w13", kind: "car", col: "#3f6fb5", x, z, yaw: -Math.atan2(x2 - x, 0.6), driver: 0, wheel: z / -0.36 });
      break;
    }
    case S.CURVES: case S.BENDS: case S.FINALE: {
      const k = bendAt(t), near = id === S.BENDS, n = near ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const z = (near ? -110 : -40) - ((t * (near ? 11 : 13) + i * (near ? 22 : 70)) % (near ? 70 : 420));
        out.push({ key: "f" + i, kind: i % 4 === 3 ? "truck" : "car", col: ["#3f6fb5", "#f3d35a", "#2f8a4f", "#c9373a", "#e98c3a", "#7b5ac9"][i % 6],
          x: lane(z, k), z, yaw: roadYawAt(z, k), driver: i % 4 === 3 ? -1 : i % 4, wheel: z / -0.36 });
      }
      break;
    }
  }
  // springs: every moving vehicle rumbles and rocks on its suspension; impacts where it leaves the road / crashes
  const entry = (t0: number, dur = 2.6) => t0 + 0.45 * dur;
  for (const v of out) {
    if (v.key.startsWith("w")) continue; // parked wrecks: only their drop-in bounce
    const hits = v.key === "d1" ? [{ t: entry(T.sunny - 0.2), a: 1 }] : v.key === "d8" ? [{ t: entry(T.worse + 0.1), a: 1 }]
      : v.key === "amb" ? [{ t: entry(T.drifts - 0.15, 1.9), a: 0.6 }, { t: T.too, a: 1.6 }] : [];
    const ph = v.z * 0.013;
    const b = carBody(t + ph, hits.map((h) => ({ t: h.t + ph, a: h.a })), v.kind === "truck" ? 0.012 : 0.007);
    v.heave = b.heave + (v.dust ? stepBob(t, 3.1, 0.03) : 0);
    v.bodyPitch = b.pitch;
    if (v.key === "amb" && t > T.too) { const s = punch(t - T.too, 0.1); v.sx = s.sx; v.sy = s.sy; }
  }
  return out;
};

/** seat position of a vehicle's driver in world space (cars and the ambulance: left seat; truck: high cab) */
export const seatOf = (v: Vehicle): V3 => {
  const lx = v.kind === "truck" ? -0.5 : -0.42, ly = v.kind === "truck" ? 1.72 : v.kind === "ambulance" ? 0.85 : 0.6, lz = v.kind === "truck" ? -2.6 : v.kind === "ambulance" ? -1.0 : 0.15;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  return [v.x + lx * c + lz * s, ly - (v.sink ?? 0), v.z - lx * s + lz * c];
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = SHOTS[id - 1].light;
  findSun(cam, SUN);
  // standing characters: idle breathing always, plus the beat's own squash (hop / punch)
  const stand = (i: number, o: Outfit, okey: string, x: number, z: number, fo: FrontOpts, sq?: Squash, sc = 1) => {
    const s = sq ? mix(breathe(t, i), sq) : breathe(t, i);
    out.places.push({ ...person(cam, who(i, o, okey), x, D0, z, FRONT, { blink: lidAt(t, i), ...fo }, {}, sc), ...sqOf(s) });
    blob(out, x, D0, z, sc * (1 - 0.6 * Math.min(1, s.y / 0.5)));
  };
  const vs = vehiclesAt(id, t);
  // ---- drivers in their seats ----
  for (const v of vs) {
    if (v.driver === undefined || v.driver < 0) continue;
    const [x, y, z] = seatOf(v);
    let o = DRIVERS[v.driver % 4];
    let fo: FrontOpts = { mode: "sit", expr: "neutral", blink: lidAt(t, 20 + v.driver) };
    if (v.driver === 100) { o = TRUCKER; fo = { mode: "sit", expr: "smile_closed", prop: "bowl" }; }
    if (v.driver === 50) { o = MEDIC_O; fo = { mode: "sit", expr: t > T.too - 0.1 ? "shock" : "neutral", blink: t < T.drifts ? 0.6 : 0 }; }
    // the sleepy ones: lids sink over the beat (0 open .. 1 shut)
    if (id === S.DRIFT) fo.blink = Math.max(lidAt(t, 21), 0.5 + 0.5 * smooth((t - T.week) / 1.5));
    if (id === S.SHEEP) fo.blink = Math.max(lidAt(t, 23), 0.35 + 0.65 * smooth((t - T.counting) / 2.2));
    if (id === S.HYPNOSIS) fo.blink = t < T.nothing ? Math.max(lidAt(t, 22), 0.5) : 0.6 + 0.4 * smooth((t - T.clocks) / 0.8);
    if (id === S.CROWD || id >= S.CURVES) fo = { mode: "sit", expr: "smile", blink: lidAt(t, 30 + v.driver), wave: id === S.CROWD ? 0.5 + 0.5 * Math.sin(t * 9 + v.driver) : undefined };
    // drivers ride the springs with their car
    out.places.push({ ...person(cam, who(20 + v.driver, o, "drv" + v.driver + o.jacket), x, y + (v.heave ?? 0) * 1.3 + (v.dy ?? 0), z, FRONT, fo, {}, SEAT), ...sqOf(breathe(t, v.driver, 0.02)) });
  }
  switch (id) {
    case S.RIBBON: {
      const cut = smooth((t - T.perfect) / 0.25);
      stand(1, BERNIE, "bernie", -0.7, RIBBON_Z + 0.9, { mode: "stand", expr: t < T.perfect ? "smile" : "grin", prop: ["scissors", cut], facing: 1 }, punch(t - T.perfect, 0.1));
      const row: [number, number][] = [[-3.4, 3.4], [-2.2, 4.4], [-4.6, 4.6], [2.2, 3.5], [3.4, 4.5], [1.0, 5.2], [4.6, 3.0], [-1.0, 5.6], [-5.8, 3.4], [5.8, 4.2]];
      row.forEach(([x, dz], i) => stand(40 + i, FOLK[i % 6], "folk" + i, x, RIBBON_Z + dz,
        { mode: "stand", expr: t > T.perfect ? (i % 3 ? "laugh" : "grin") : i % 2 ? "smile" : "smile_closed", wave: t > T.perfect && i % 2 ? 0.5 + 0.5 * Math.sin(t * 10 + i) : undefined },
        i % 2 ? undefined : hop(t - T.perfect - 0.15 - 0.07 * i, 0.3, 0.4)));
      break;
    }
    case S.CROWD: {
      const spots: [number, number][] = [[-6.6, -16], [-7.4, -18.5], [-6.4, -21], [-7.8, -23.5], [-6.6, -26], [-8.2, -14.5], [-8.6, -20]];
      spots.forEach(([x, z], i) => stand(40 + i, FOLK[i % 6], "folk" + i, x, z, { mode: "stand", expr: i % 3 ? "laugh" : "grin", wave: i % 2 ? 0.5 + 0.5 * Math.sin(t * 11 + i) : undefined },
        i % 2 ? undefined : hop((t - T.opening - 0.11 * i + 9) % 0.95, 0.28, 0.38)));
      stand(1, BERNIE, "bernie", -7.0, -12.4, { mode: "stand", expr: "grin", wave: 0.5 + 0.5 * Math.sin(t * 8) }, hop((t - T.opening + 9.3) % 1.1, 0.22, 0.36));
      break;
    }
    case S.SIGNS:
      stand(1, BERNIE, "bernie", 9.8, SIGN_Z0 + 0.5, { mode: "stand", expr: t < T.worse ? "smile" : "shock", facing: -1 },
        t < T.worse ? hop(t - T.signs - 0.2, 0.18, 0.32) : hop(t - T.worse - 0.9, 0.12, 0.26));
      break;
    case S.SHEEP: {
      const [x, , z] = seatOf(vs[0]);
      if (t > T.counting + 0.2) {
        const s = popIn(t - T.counting - 0.2), ph = q(t % 1.4, 20);
        out.fx.push({ key: `sheep${ph}`, cw: 700, ch: 560, draw: (p) => fxSheepBubble(p, ph), x: x + 0.35, y: 1.95 + 0.25 * s, z: z - 0.15, w: 1.05 * s, h: 0.84 * s });
      }
      break;
    }
    case S.AMBULANCE: {
      const v = vs[0];
      if (t > T.too - 0.05 && t < T.too + 0.5) {
        const u = q((t - T.too + 0.05) / 0.55, 30);
        out.fx.push({ key: `burst${u}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, u), x: v.x + 1.2, y: 1.0, z: v.z - 2.4, w: 3.2, h: 3.2 });
      }
      break;
    }
    case S.DEADPAN: {
      stand(50, MEDIC_O, "medic", MEDIC[0], MEDIC[2], { mode: "stand", expr: t < T.unluckily ? "nervous" : "dazed", facing: 1 }, punch(t - T.unluckily, 0.14));
      stand(21, DRIVERS[1], "drvw", WRECK_DRIVER[0], WRECK_DRIVER[2], { mode: "stand", expr: "nervous", facing: -1 }, punch(t - T.luckily, 0.1));
      if (t > T.unluckily) { const u = q((t * 0.9) % 1, 30); out.fx.push({ key: `stars${u}`, cw: 420, ch: 210, draw: (p) => fxStars(p, u), x: MEDIC[0], y: 2.25, z: MEDIC[2], w: 0.95 * popIn(t - T.unluckily - 0.1), h: 0.48 * popIn(t - T.unluckily - 0.1) }); }
      break;
    }
    case S.HYPNOSIS: {
      const [x, , z] = seatOf(vs[0]);
      if (t > T.nothing + 0.3) {
        const u = popIn(t - T.nothing - 0.3), walk = Math.max(0, t - T.clocks), ph = q(t % 2, 15);
        out.fx.push({ key: `brain${ph}`, cw: 400, ch: 360, draw: (p) => fxBrain(p, ph), x: x + 0.25 + walk * 0.35, y: 1.72 + 0.12 * u, z: z - 0.1 + walk * 0.25, w: 0.95 * u, h: 0.86 * u });
      }
      break;
    }
    case S.BENDS:
      stand(1, BERNIE, "bernie", BEND_SPOT[0], BEND_SPOT[2], { mode: "stand", expr: t < T.stop ? "smile" : "laugh", wave: t > T.stop ? 0.5 + 0.5 * Math.sin(t * 9) : undefined },
        t > T.stop ? hop((t - T.stop - 0.1) % 0.9, 0.32, 0.42) : undefined);
      break;
    case S.FINALE:
      if (t > T.map - 0.15) {
        const d = dropIn(t - T.map + 0.15, 90, 0.3, 9.8 * 40); // falls, lands with a squash, bounces twice
        out.fx.push({ key: "pin", cw: 300, ch: 420, draw: (p) => fxPin(p), x: 0, y: 14 + d.y + 14 * (d.sy - 1), z: 26, w: 20 * d.sx, h: 28 * d.sy });
      }
      break;
  }
  // ---- dust where tyres plough the sand ----
  for (const v of vs) {
    if (!v.dust) continue;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    for (const k of [0, 0.5]) {
      const uu = q(((t * 2.2) % 1 + k) % 1, 20);
      for (const side of [-1, 1]) out.fx.push({ key: `puff${uu}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, uu), soft: true,
        x: v.x + side * 1.0 * c + 1.4 * s, y: 0.55 + 0.6 * uu, z: v.z - side * 1.0 * s + 1.4 * c + uu * 1.2, w: 2.2 + 1.8 * uu, h: 2.2 + 1.8 * uu });
    }
  }
  return out;
};
