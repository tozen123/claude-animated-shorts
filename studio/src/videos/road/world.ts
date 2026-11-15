// The whole place as one three.js scene: desert sky, sand, distant mesas, cacti, Bernie's western town, the endless
// straight road (a ribbon that can bend into gentle S-curves), telephone poles, forty identical Stay Awake signs,
// the ribbon, and the traffic (cars, the soup truck, the ambulance) with drivers as lit cards. update(id, f, camera)
// poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam } from "./build";
import { ctex, rep, cloudHD, rng } from "./paint";
import { Pen, fxEyeSign, fxTownSign } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { popIn } from "./bounce";
import { Pool, Actor, Fx, stage, vehiclesAt } from "./cast";
import { FPS, SHOTS, camAt, ShotDef, T, S, bendAt, roadX, RIBBON_Z, SIGN_Z0, SIGN_STEP, smooth, Kind, HOOK_WRECK, AMB_STOP, BEND_SPOT } from "./story";

export type Kit = Record<string, THREE.Object3D>;
export const loadKit = () => Promise.resolve({} as Kit);

// ---------------- desert look (on-screen targets; the tone map is pre-inverted with untone) ----------------
const SKY: Record<"day" | "golden", { c: string[]; e: number[] }> = {
  day: { c: ["#d7e4ee", "#bcd6ef", "#8dbcec", "#5f9ce2", "#3a78cf"], e: [0, 3, 9, 18, 45] },
  golden: LOOK.golden.sky,
};
const FOG: Record<"day" | "golden", [string, number, number]> = { day: ["#d7e4ee", 140, 2600], golden: ["#efb489", 120, 2200] };
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { [S.WOBBLE]: { az: 120, el: 62 }, [S.CURVES]: { az: 110, el: 40 }, [S.PILEUP]: { az: 100 } };

// ---------------- painted textures ----------------
const sandTex = () => ctex("sandHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#e6c48e"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26; i++) { // broad soft patches
    const x = r() * 1024, y = r() * 1024, rad = 80 + r() * 200;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = r() < 0.5 ? "rgba(214,170,112,0.35)" : "rgba(244,214,160,0.35)";
    gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    for (const dx of [-1024, 0, 1024]) for (const dy of [-1024, 0, 1024]) { g.save(); g.translate(dx, dy); g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad); g.restore(); }
  }
  g.lineCap = "round";
  for (let i = 0; i < 140; i++) { // wind ripples: short soft arcs
    const x = r() * 1024, y = r() * 1024, w = 30 + r() * 60;
    g.strokeStyle = "rgba(196,150,96,0.45)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 8, x + w, y); g.stroke();
  }
  for (let i = 0; i < 420; i++) { // pebbles
    const x = r() * 1024, y = r() * 1024, s = 2 + r() * 5;
    g.fillStyle = ["#b98a5a", "#c9a272", "#a77a50", "#f2dcb0"][i % 4];
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
});
const asphaltTex = () => ctex("asphalt", 512, 1152, (g, r) => {
  // 8 m wide (u) x 9 m long (v): edge lines + one 3 m yellow centre dash per tile
  g.fillStyle = "#57535c"; g.fillRect(0, 0, 512, 1152);
  for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? "rgba(40,38,46,0.5)" : "rgba(120,116,124,0.45)"; g.fillRect(r() * 512, r() * 1152, 2 + r() * 3, 2 + r() * 3); }
  for (let i = 0; i < 5; i++) { const y = r() * 1152; g.strokeStyle = "rgba(34,32,40,0.55)"; g.lineWidth = 3; g.beginPath(); g.moveTo(40 + r() * 400, y); g.lineTo(60 + r() * 400, y + 30 + r() * 80); g.stroke(); }
  g.fillStyle = "#f4f1ea"; g.fillRect(22, 0, 14, 1152); g.fillRect(476, 0, 14, 1152);
  g.fillStyle = "#f6c533"; g.fillRect(248, 0, 16, 384);
});
const shoulderTex = () => ctex("shoulder", 256, 256, (g, r) => {
  g.fillStyle = "#d4ae78"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = ["#b8915e", "#e6c99a", "#a8835a"][i % 3]; g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3); }
});
const mesaTex = () => ctex("mesa", 256, 512, (g, r) => {
  const bands = ["#d9774a", "#c9643e", "#e08a58", "#b85a3a", "#d36f46", "#e59a66", "#c05e3c"];
  let y = 0;
  while (y < 512) { const h = 24 + r() * 60; g.fillStyle = bands[Math.floor(r() * bands.length)]; g.fillRect(0, y, 256, h); y += h; }
  for (let i = 0; i < 40; i++) { g.strokeStyle = "rgba(90,40,30,0.35)"; g.lineWidth = 2; const x = r() * 256; g.beginPath(); g.moveTo(x, r() * 512); g.lineTo(x + (r() - 0.5) * 10, r() * 512); g.stroke(); }
});
/** western storefront: horizontal boards, a shop window, a door, a trim board (no lettering) */
const storeTex = (key: string, wall: string, trim: string) => ctex("store" + key, 512, 512, (g, r) => {
  g.fillStyle = wall; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 26) { g.fillStyle = "rgba(40,25,20,0.28)"; g.fillRect(0, y, 512, 3); }
  for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(r() * 512, Math.floor(r() * 20) * 26 + 4, 40 + r() * 80, 18); }
  const frame = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = trim; g.fillRect(x - 10, y - 10, w + 20, h + 20);
    g.fillStyle = fill; g.fillRect(x, y, w, h);
    g.strokeStyle = "#241726"; g.lineWidth = 5; g.strokeRect(x - 10, y - 10, w + 20, h + 20);
  };
  frame(60, 230, 200, 150, "#2f4a6e");
  g.fillStyle = "rgba(190,220,255,0.35)"; g.beginPath(); g.moveTo(80, 370); g.lineTo(150, 240); g.lineTo(185, 240); g.lineTo(115, 370); g.fill();
  g.fillStyle = trim; g.fillRect(155, 230, 10, 150);
  frame(330, 210, 110, 290, "#6a4630");
  g.fillStyle = "#e8c45a"; g.beginPath(); g.arc(420, 360, 7, 0, 7); g.fill();
  g.fillStyle = trim; g.fillRect(0, 60, 512, 70); g.strokeStyle = "#241726"; g.lineWidth = 5; g.strokeRect(-5, 60, 522, 70);
});

// ---------------- vehicles ----------------
const matCache = new Map<string, THREE.Material>();
const paint = (col: string) => { let m = matCache.get(col); if (!m) { m = twoTone(new THREE.MeshLambertMaterial({ color: col })); matCache.set(col, m); } return m; };
const glow = (col: THREE.Color) => new THREE.MeshBasicMaterial({ color: col, toneMapped: true });
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => boxGeo(V(x0, y0, z0), V(x1, y1, z1), 0, true);
type VMesh = { g: THREE.Group; body: THREE.Mesh[]; wheels: THREE.Object3D[]; flash?: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial]; kind: Kind };
const wheel = (r: number, w: number) => {
  const o = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), paint("#2a2830"));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, w + 0.02, 10).rotateZ(Math.PI / 2), paint("#c9ccd2"));
  o.add(tyre, hub);
  return o;
};
const makeVehicle = (kind: Kind): VMesh => {
  const g = new THREE.Group(), body: THREE.Mesh[] = [], wheels: THREE.Object3D[] = [];
  g.rotation.order = "YXZ";
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, isBody = false) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; g.add(me); if (isBody) body.push(me); return me; };
  const dark = paint("#3a3842"), chrome = paint("#c9ccd2"), seat = paint("#4a4048");
  let flash: VMesh["flash"];
  if (kind === "car") {
    add(box(-0.95, 0.32, -2.15, 0.95, 0.95, 2.15), paint("#ffffff"), true);
    add(box(-0.86, 1.42, -0.5, 0.86, 1.54, 1.15), paint("#ffffff"), true);            // roof
    for (const [x, z] of [[-0.82, -0.55], [0.74, -0.55], [-0.82, 1.08], [0.74, 1.08]]) add(box(x, 0.95, z, x + 0.08, 1.43, z + 0.08), paint("#ffffff"), true);
    add(box(-0.8, 0.55, 0.42, 0.8, 1.15, 0.62), seat);                                   // seat backs
    add(box(-0.85, 0.95, -0.75, 0.85, 1.05, -0.55), dark);                               // dashboard
    add(box(-1.0, 0.3, -2.3, 1.0, 0.5, -2.1), chrome); add(box(-1.0, 0.3, 2.1, 1.0, 0.5, 2.3), chrome);
    for (const x of [-0.7, 0.55]) { add(box(x, 0.62, -2.2, x + 0.18, 0.78, -2.13), glow(new THREE.Color(2.2, 2.1, 1.7))); add(box(x, 0.62, 2.13, x + 0.18, 0.78, 2.2), glow(new THREE.Color(1.6, 0.15, 0.12))); }
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 16), dark); sw.position.set(-0.42, 1.12, -0.48); sw.rotation.x = -0.6; g.add(sw);
    for (const [x, z] of [[-0.95, -1.35], [0.95, -1.35], [-0.95, 1.4], [0.95, 1.4]]) { const w = wheel(0.36, 0.28); w.position.set(x, 0.36, z); g.add(w); wheels.push(w); }
  } else if (kind === "truck") {
    add(box(-1.15, 0.6, -3.7, 1.15, 1.75, -1.4), paint("#ffffff"), true);              // cab lower
    add(box(-1.15, 2.65, -3.5, 1.15, 2.95, -1.4), paint("#ffffff"), true);             // cab roof
    for (const [x, z] of [[-1.15, -3.55], [1.05, -3.55], [-1.15, -1.5], [1.05, -1.5]]) add(box(x, 1.75, z, x + 0.1, 2.66, z + 0.1), paint("#ffffff"), true);
    add(box(-1.0, 1.2, -2.0, 1.0, 2.3, -1.6), seat);
    add(box(-1.1, 0.7, -3.85, 1.1, 1.6, -3.7), chrome);                                  // grille
    add(box(-1.25, 0.95, -1.2, 1.25, 3.7, 8.6), paint("#f2efe8"));                       // trailer
    add(box(-1.27, 1.6, -1.1, 1.27, 1.9, 8.5), paint("#2f5f9a"));                        // trailer stripe
    add(box(-0.9, 0.5, -1.4, 0.9, 0.95, 8.4), dark);                                     // chassis
    for (const x of [-0.8, 0.62]) add(box(x, 0.9, -3.9, x + 0.2, 1.1, -3.84), glow(new THREE.Color(2.2, 2.1, 1.7)));
    for (const [x, z] of [[-1.1, -3.0], [1.1, -3.0], [-1.1, 5.6], [1.1, 5.6], [-1.1, 7.0], [1.1, 7.0]]) { const w = wheel(0.5, 0.36); w.position.set(x, 0.5, z); g.add(w); wheels.push(w); }
  } else {
    add(box(-1.05, 0.35, -0.4, 1.05, 2.55, 3.0), paint("#ffffff"), true);             // box body
    add(box(-1.0, 0.35, -2.4, 1.0, 1.2, -0.4), paint("#ffffff"), true);                // hood
    add(box(-1.0, 2.1, -1.55, 1.0, 2.22, -0.4), paint("#ffffff"), true);               // cab roof
    for (const [x, z] of [[-1.0, -1.6], [0.92, -1.6]]) add(box(x, 1.2, z, x + 0.08, 2.12, z + 0.08), paint("#ffffff"), true);
    add(box(-0.95, 0.9, -0.6, 0.95, 1.8, -0.42), seat);
    for (const s of [-1, 1]) {
      add(box(s < 0 ? -1.07 : 1.05, 1.3, -0.35, s < 0 ? -1.05 : 1.07, 1.52, 2.95), paint("#d42f2f"));        // stripe
      add(box(s < 0 ? -1.08 : 1.05, 1.75, 1.1, s < 0 ? -1.05 : 1.08, 2.35, 1.4), paint("#d42f2f"));         // cross
      add(box(s < 0 ? -1.08 : 1.05, 1.9, 0.95, s < 0 ? -1.05 : 1.08, 2.2, 1.55), paint("#d42f2f"));
    }
    add(box(-1.02, 0.3, -2.55, 1.02, 0.5, -2.35), chrome);
    const red = glow(new THREE.Color(0.4, 0.05, 0.05)), blue = glow(new THREE.Color(0.05, 0.1, 0.4));
    add(box(-0.9, 2.55, -0.3, -0.1, 2.8, 0.1), red); add(box(0.1, 2.55, -0.3, 0.9, 2.8, 0.1), blue);
    flash = [red, blue];
    for (const x of [-0.75, 0.57]) add(box(x, 0.75, -2.45, x + 0.18, 0.9, -2.4), glow(new THREE.Color(2.2, 2.1, 1.7)));
    for (const [x, z] of [[-1.0, -1.6], [1.0, -1.6], [-1.0, 2.2], [1.0, 2.2]]) { const w = wheel(0.4, 0.3); w.position.set(x, 0.4, z); g.add(w); wheels.push(w); }
  }
  g.visible = false;
  return { g, body, wheels, flash, kind };
};

// ---------------- the world ----------------
const NSEG = 900, SEG = 3.5, Z_NEAR = 90; // road ribbon from z = 90 to z = -3060
export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#d7e4ee", 140, 2600);
  private sunDisc: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = []; private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private road: THREE.BufferGeometry; private shoulder: THREE.BufferGeometry; private roadK = -1;
  private poles: THREE.InstancedMesh; private bars: THREE.InstancedMesh;
  private signs: THREE.Group[] = [];
  private ribbon: THREE.Mesh[] = [];
  private vpool = new Map<string, VMesh>(); private vfree: Record<Kind, VMesh[]> = { car: [], truck: [], ambulance: [] };
  private frustum = new THREE.Frustum(); private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root;
    // ---- sky ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false,
      map: ctex("sunDisc", 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }) }));
    this.sunDisc.layers.set(NOINK); this.sunDisc.frustumCulled = false; R.add(this.sunDisc);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#b49a78", 0.55);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2, d = 1700 + (i % 3) * 200;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 380 + (i % 4) * 90;
      m.position.set(Math.cos(a) * d, 260 + (i % 4) * 90, Math.sin(a) * d - 600); m.scale.set(w, w / 2, 1); m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    // ---- ground ----
    const b = new Batch();
    const sandM = lam("sand", () => ({ map: rep(sandTex(), 1, 1) }));
    const ground = new THREE.PlaneGeometry(7000, 7000, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -1500);
    const uv = ground.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7000 / 14, uv.getY(i) * 7000 / 14);
    const gm = new THREE.Mesh(ground, sandM); gm.receiveShadow = true; R.add(gm);
    if (sandM.map) { sandM.map.anisotropy = 16; sandM.map.needsUpdate = true; }
    // ---- road + shoulders (dynamic ribbons) ----
    const ribbonGeo = (w: number, y: number, vLen: number) => {
      const g = new THREE.BufferGeometry(), n = NSEG + 1;
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(n * 2).fill([0, 1, 0]).flat(), 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, j) => [0, (j * SEG) / vLen, 1, (j * SEG) / vLen]).flat(), 2));
      const idx: number[] = [];
      for (let j = 0; j < NSEG; j++) { const a = j * 2, c = j * 2 + 1, d = (j + 1) * 2, e = (j + 1) * 2 + 1; idx.push(a, c, e, a, e, d); }
      g.setIndex(idx); g.userData = { w, y };
      return g;
    };
    this.road = ribbonGeo(8, 0.03, 9); this.shoulder = ribbonGeo(11.5, 0.015, 3);
    const roadM = lam("asphalt", () => ({ map: asphaltTex() })), shM = lam("shoulder", () => ({ map: rep(shoulderTex(), 3, 1) }));
    for (const m of [roadM, shM]) { if (m.map) { m.map.anisotropy = 16; m.map.needsUpdate = true; } m.polygonOffset = true; m.polygonOffsetFactor = m === roadM ? -4 : -2; m.polygonOffsetUnits = m === roadM ? -4 : -2; }
    for (const [g, m] of [[this.shoulder, shM], [this.road, roadM]] as const) { const me = new THREE.Mesh(g, m); me.receiveShadow = true; me.frustumCulled = false; R.add(me); }
    // ---- mesas on the horizon, dunes and cacti ----
    const r = rng(7);
    const mesaM = lam("mesa", () => ({ map: rep(mesaTex(), 3, 1) }));
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7, d = 900 + r() * 1100;
      const x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d - 300, h = 50 + r() * 120, rad = 70 + r() * 160;
      const g = new THREE.CylinderGeometry(rad * 0.82, rad, h, 7, 1).scale(1, 1, 0.5 + r() * 0.6).rotateY(r() * 3);
      b.add(g, mesaM, new THREE.Matrix4().makeTranslation(x, h / 2 - 2, z));
      if (r() < 0.5) b.add(new THREE.CylinderGeometry(rad * 0.3, rad * 0.45, h * 0.5, 6, 1), mesaM, new THREE.Matrix4().makeTranslation(x + rad * 0.9, h * 0.25, z + rad * 0.3));
    }
    const duneM = lam("dune", () => ({ color: "#e9c995" }));
    for (let i = 0; i < 60; i++) {
      const x = (r() < 0.5 ? -1 : 1) * (70 + r() * 500), z = 120 - r() * 1600, s = 20 + r() * 45;
      b.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(s * 1.8, s * 0.22, s), duneM, new THREE.Matrix4().makeTranslation(x, -0.5, z));
    }
    const cactM = lam("cactus", () => ({ color: "#5f9a4a" })), shrubM = lam("shrub", () => ({ color: "#98a65a" })), rockM = lam("rock", () => ({ color: "#c98a5c" }));
    const spots = [HOOK_WRECK, AMB_STOP, BEND_SPOT, [-12.5, 0, -112], [13.5, 0, -140], [-13, 0, -168], [12.5, 0, -196]];
    const clear = (x: number, z: number, m: number) => Math.abs(x - roadX(z, 0)) < m || Math.abs(x - roadX(z, 1)) < m || (z > -45 && z < 80 && Math.abs(x) < 40)
      || spots.some((p) => Math.hypot(x - p[0], z - p[2]) < 14);
    for (let i = 0; i < 520; i++) {
      const x = (r() - 0.5) * 520, z = 80 - r() * 1700;
      if (clear(x, z, 17)) continue;
      const h = 2.6 + r() * 3.4, M = new THREE.Matrix4().makeTranslation(x, 0, z);
      b.add(new THREE.CylinderGeometry(0.32, 0.36, h, 10).translate(0, h / 2, 0), cactM, M);
      b.add(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h, 0), cactM, M);
      for (const s of [-1, 1]) if (r() < 0.75) {
        const ay = h * (0.35 + r() * 0.25), ah = 0.8 + r() * 1.2, ax = s * 0.75;
        b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.75, 8).rotateZ(Math.PI / 2).translate(s * 0.4, ay, 0), cactM, M);
        b.add(new THREE.CylinderGeometry(0.21, 0.21, ah, 8).translate(ax, ay + ah / 2 - 0.1, 0), cactM, M);
        b.add(new THREE.SphereGeometry(0.21, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(ax, ay + ah - 0.1, 0), cactM, M);
      }
    }
    for (let i = 0; i < 700; i++) {
      const x = (r() - 0.5) * 400, z = 80 - r() * 1500;
      if (clear(x, z, 8.5)) continue;
      const s = 0.4 + r() * 0.7;
      if (r() < 0.75) b.add(new THREE.IcosahedronGeometry(1, 0).scale(s * 1.3, s * 0.75, s * 1.2), shrubM, new THREE.Matrix4().makeTranslation(x, s * 0.4, z));
      else b.add(new THREE.DodecahedronGeometry(1, 0).scale(s, s * 0.6, s * 0.9), rockM, new THREE.Matrix4().makeTranslation(x, s * 0.25, z));
    }
    this.buildTown(b);
    b.build(R);
    // ---- telephone poles + crossbars (follow the road when it bends) ----
    const woodM = lam("pole", () => ({ color: "#8a5a3c" }));
    this.poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.16, 8, 6).translate(0, 4, 0), woodM, 70);
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.14, 0.14).translate(0, 7.4, 0), woodM, 70);
    for (const im of [this.poles, this.bars]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; R.add(im); }
    // ---- forty identical Stay Awake signs (unlit faces: a side sun turned painted signs grey in the bridge short) ----
    const face = new THREE.MeshBasicMaterial({ map: ctex("eyeSign", 600, 600, (g) => fxEyeSign(new Pen(g))), alphaTest: 0.5, color: 0xe8e8e8 });
    const backM = lam("signBack", () => ({ color: "#9aa0a8" })), postM = lam("signPost", () => ({ color: "#b9bdc4" }));
    for (let i = 0; i < 40; i++) {
      const sg = new THREE.Group();
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), face); f.position.set(0, 2.35, -0.04); f.rotation.y = Math.PI; f.layers.set(NOINK);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.06, 0.05).rotateZ(Math.PI / 4), backM); bk.position.set(0, 2.35, 0);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 1.2, 0.06), postM);
      for (const m of [bk, p]) { m.castShadow = true; m.receiveShadow = true; }
      sg.add(f, bk, p); this.signs.push(sg); R.add(sg);
    }
    // ---- ribbon across the road at the town edge (two halves after the cut) ----
    const ribM = lam("ribbon", () => ({ color: "#d42f2f", side: THREE.DoubleSide }));
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 0.02).translate(s * -2.6, 0, 0), ribM);
      m.position.set(s * 5.2, 1.2, RIBBON_Z); m.castShadow = true; this.ribbon.push(m); R.add(m);
    }
    this.poseRoad(0);
  }

  private buildTown(b: Batch) {
    // false-front western stores facing the road, both sides, a water tower and a gas station; a welcome board
    const stores: [number, number, string, string][] = [[-13, 14, "#d9915e", "#f3e3c0"], [-13, 27, "#7fb0c9", "#f6f1e4"], [-13, 40, "#e7b6a0", "#5a3b2a"], [-13, 53, "#c9b27a", "#7a3b2a"],
      [13, 18, "#a8c48a", "#f6f1e4"], [13, 31, "#e8c45a", "#5a3b2a"], [13, 44, "#d97a6a", "#f3e3c0"], [13, 57, "#9fb6e6", "#f6f1e4"]];
    stores.forEach(([x, z, wall, trim], i) => {
      const s = x < 0 ? 1 : -1, w = 10, d = 9, h = 5 + (i % 3) * 0.8, ff = h + 2.2;
      const front = lam("storeF" + i, () => ({ map: storeTex(String(i), wall, trim) })), side = lam("storeS" + wall, () => ({ color: wall }));
      const roofM = lam("storeRoof", () => ({ color: "#8a6a5a" }));
      const x0 = x < 0 ? x - d : x, x1 = x < 0 ? x : x + d;
      b.add(boxGeo(V(x0, 0, z - w / 2), V(x1, h, z + w / 2), 4), side);
      b.add(boxGeo(V(x0 - 0.2, h, z - w / 2 - 0.2), V(x1 + 0.2, h + 0.3, z + w / 2 + 0.2)), roofM);
      // false front facade: a quad facing the road with the painted storefront
      const fx = x + s * 0.06;
      const g = new THREE.PlaneGeometry(w, ff).translate(0, ff / 2, 0).rotateY(s * Math.PI / 2);
      b.add(g, front, new THREE.Matrix4().makeTranslation(fx, 0, z));
      b.add(boxGeo(V(Math.min(x, fx) - 0.12, ff, z - w / 2 - 0.1), V(Math.max(x, fx) + 0.12, ff + 0.35, z + w / 2 + 0.1)), lam("trim" + trim, () => ({ color: trim })));
      // porch roof on posts
      const px = x + s * 2.4;
      b.add(boxGeo(V(Math.min(x, px), 3.0, z - w / 2), V(Math.max(x, px), 3.18, z + w / 2)), roofM);
      for (const pz of [z - w / 2 + 0.3, z, z + w / 2 - 0.3]) b.add(boxGeo(V(px - 0.1, 0, pz - 0.1), V(px + 0.1, 3.0, pz + 0.1)), lam("porch", () => ({ color: "#8a5a3c" })));
    });
    // water tower
    const tankM = lam("tank", () => ({ color: "#a8744a" })), legM = lam("legs", () => ({ color: "#6a4630" })), capM = lam("cap", () => ({ color: "#c9373a" }));
    const [tx, tz] = [-27, 34];
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.add(boxGeo(V(tx + dx - 0.18, 0, tz + dz - 0.18), V(tx + dx + 0.18, 11, tz + dz + 0.18)), legM);
    b.add(new THREE.CylinderGeometry(3.4, 3.4, 4.6, 20).translate(tx, 13.3, tz), tankM);
    b.add(new THREE.ConeGeometry(3.8, 2.4, 20).translate(tx, 16.8, tz), capM);
    // gas station canopy + pumps
    const canM = lam("canopy", () => ({ color: "#f2efe8" })), pumpM = lam("pump", () => ({ color: "#d42f2f" }));
    b.add(boxGeo(V(8, 4.2, 3), V(15, 4.6, 11)), canM);
    b.add(boxGeo(V(8, 3.95, 3), V(15, 4.2, 11)), capM);
    for (const pz of [4, 10]) b.add(boxGeo(V(11.3, 0, pz - 0.15), V(11.7, 4.2, pz + 0.15)), canM);
    for (const pz of [5.6, 8.4]) b.add(boxGeo(V(11.1, 0, pz - 0.35), V(11.9, 1.6, pz + 0.35)), pumpM);
    // welcome board facing out of town (pictogram only)
    const boardM = new THREE.MeshBasicMaterial({ map: ctex("townSign", 900, 520, (g) => fxTownSign(new Pen(g))), color: 0xe8e8e8 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.6), boardM);
    board.position.set(-7.5, 3.2, -1.6); board.rotation.y = Math.PI + 0.35; board.layers.set(NOINK); this.root.add(board);
    for (const dx of [-1.7, 1.7]) b.add(boxGeo(V(-7.5 + dx * Math.cos(0.35) - 0.12, 0, -1.4 - dx * Math.sin(0.35) - 0.12), V(-7.5 + dx * Math.cos(0.35) + 0.12, 4.5, -1.4 - dx * Math.sin(0.35) + 0.12)), legM);
    // ribbon posts
    for (const x of [-5.4, 5.4]) b.add(boxGeo(V(x - 0.1, 0, RIBBON_Z - 0.1), V(x + 0.1, 1.5, RIBBON_Z + 0.1)), lam("ribPost", () => ({ color: "#f2efe8" })));
  }

  private poseRoad(k: number) {
    if (Math.abs(k - this.roadK) < 1e-4) return;
    this.roadK = k;
    for (const g of [this.road, this.shoulder]) {
      const { w, y } = g.userData as { w: number; y: number }, p = g.attributes.position.array as Float32Array;
      for (let j = 0; j <= NSEG; j++) {
        const z = Z_NEAR - j * SEG, x = roadX(z, k), dx = roadX(z - 0.5, k) - roadX(z + 0.5, k), nl = Math.hypot(dx, 1);
        const nx = 1 / nl, nz = dx / nl; // perpendicular to the heading (dx, -1) in xz
        p.set([x - (w / 2) * nx, y, z - (w / 2) * nz, x + (w / 2) * nx, y, z + (w / 2) * nz], j * 6);
      }
      g.attributes.position.needsUpdate = true; g.computeBoundingSphere();
    }
    const q = new THREE.Quaternion(), one = V(1, 1, 1), pos = V(0, 0, 0);
    for (let i = 0; i < 70; i++) {
      const z = -20 - i * 45, x = roadX(z, k) - 8.8;
      this.poles.setMatrixAt(i, this.m4.compose(pos.set(x, 0, z), q, one));
      this.bars.setMatrixAt(i, this.m4.compose(pos.set(x, 0, z), q, one));
    }
    this.poles.instanceMatrix.needsUpdate = true; this.bars.instanceMatrix.needsUpdate = true;
    this.signs.forEach((s, i) => { const z = SIGN_Z0 - i * SIGN_STEP; s.position.set(roadX(z, k) + 6.3, 0, z); s.rotation.y = 0; });
  }

  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(SUN_SHOT[id]?.az ?? L.az), el = THREE.MathUtils.degToRad(SUN_SHOT[id]?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  private poseVehicles(id: number, t: number) {
    const want = vehiclesAt(id, t), seen = new Set<string>();
    for (const v of want) {
      let m = this.vpool.get(v.key);
      if (!m || m.kind !== v.kind) { m = this.vfree[v.kind].pop() ?? makeVehicle(v.kind); if (!m.g.parent) this.root.add(m.g); this.vpool.set(v.key, m); }
      seen.add(v.key);
      const pm = paint(v.col);
      for (const b of m.body) b.material = pm;
      m.g.visible = true;
      m.g.position.set(v.x, -(v.sink ?? 0) + (v.heave ?? 0) + (v.dy ?? 0), v.z);
      m.g.rotation.set((v.pitch ?? 0) + (v.bodyPitch ?? 0), v.yaw, v.roll ?? 0);
      m.g.scale.set(v.sx ?? 1, v.sy ?? 1, v.sx ?? 1);
      for (const w of m.wheels) w.rotation.x = -(v.wheel ?? 0);
      if (m.flash) {
        const on = Math.floor(t * 6) % 2 === 0;
        m.flash[0].color.setRGB(on ? 3.2 : 0.35, on ? 0.25 : 0.04, on ? 0.2 : 0.04);
        m.flash[1].color.setRGB(on ? 0.05 : 0.15, on ? 0.12 : 0.6, on ? 0.4 : 3.4);
      }
    }
    for (const [key, m] of this.vpool) if (!seen.has(key)) { m.g.visible = false; this.vfree[m.kind].push(m); this.vpool.delete(key); }
  }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = Math.max(0.15, cam.position.y * 0.04); cam.far = 4000; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); // aerials: a deeper near plane keeps the road above the sand
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig: camera-relative sun frozen per shot, two-tone uniforms, shadow fit ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 8, 14, 140);
    this.sun.position.copy(focus).addScaledVector(sunDir, 300); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 700; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky + fog (fog colour = horizon) ----
    const su = this.skyMat.uniforms, sky = SKY[s.light];
    sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = sky.e.map((d) => THREE.MathUtils.degToRad(d));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    const [fc, fn, ff] = FOG[s.light];
    untone(fc, this.fog.color); this.fog.near = fn; this.fog.far = ff;
    scene.fog = this.fog; scene.background = null;
    this.sunDisc.visible = s.light === "golden";
    if (this.sunDisc.visible) { this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 3000); this.sunDisc.scale.setScalar(2 * 3000 * Math.tan(THREE.MathUtils.degToRad(1.7))); }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i];
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    // ---- road, signs, ribbon ----
    this.poseRoad(bendAt(t));
    const showSigns = id >= S.SIGNS && id <= S.SHEEP;
    // Bernie puts his signs up: each pops up with a springy overshoot, near to far (they are the subject of shot 8)
    this.signs.forEach((sg, i) => { sg.visible = showSigns; const k = id === S.SIGNS ? popIn(t - T.signs - 0.15 - 0.07 * i) : 1; sg.scale.set(1, Math.max(0.001, k), 1); });
    const cut = id === S.RIBBON ? smooth((t - T.perfect - 0.1) / 0.5) : id > S.RIBBON ? 1 : 0;
    this.ribbon.forEach((m, i) => { m.visible = id <= S.CROWD; m.rotation.z = (i ? 1 : -1) * cut * 1.35; });
    // ---- traffic ----
    this.poseVehicles(id, t);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y + (p.dy ?? 0), p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set((p.mirror ? -sc2 : sc2) * (p.sx ?? 1), sc2 * (p.sy ?? 1), sc2); // bounce squash about the feet
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    return focus;
  }
}
