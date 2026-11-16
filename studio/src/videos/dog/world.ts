// The whole place as one three.js scene: autumn mountain pass on the Greek-Bulgarian border (white border stones,
// a striped post, two sentry huts, two waving flags), the mountain road down to Petrich and the town, three interiors
// (Pangalos's office in Athens, the telegraph office in Sofia, the League council room in Paris) and a schoolyard.
// Scenery is static (background never bounces); only flags wave in the wind. update(id, f, camera) poses everything
// for shot `id` at frame f.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, quad } from "./build";
import { ctex, rep, cloudHD, rng, grassHD, planksHD } from "./paint";
import { Pen, greekFlag, bulgarianFlag } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { SunGlare, lightShaft, lamp, brass, glossy } from "./glow";
import { Pool, Actor, Fx, stage, FxPlace } from "./cast";
import * as DR from "./dressing";
import { FPS, SHOTS, camAt, ShotDef, S, roadX, PETRICH_Z, GR_HUT, BG_HUT, GR_FLAG, BG_FLAG, ATHENS, SOFIA, PARIS, SCHOOL, V3 } from "./story";

const SKY: Record<"day" | "golden", { c: string[]; e: number[] }> = {
  day: { c: ["#cfdcea", "#b4cdec", "#86b2e8", "#5f97de", "#3a77cc"], e: [0, 3, 9, 18, 45] },
  golden: LOOK.golden.sky,
};
const FOG: Record<"day" | "golden", [string, number, number]> = { day: ["#cfdcea", 60, 1400], golden: ["#efb489", 50, 1200] };
/** interiors: a high sun from behind the lens so the open-roofed rooms are lit; the pass: side light */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = {
  [S.ATHENS]: { az: 160, el: 62 }, [S.BILL]: { az: 160, el: 62 }, [S.UNFAIR]: { az: 160, el: 62 }, [S.SOFIA]: { az: 150, el: 62 },
  [S.PARIS]: { az: 170, el: 64 }, [S.SCHOOL]: { az: 120, el: 50 }, [S.DOG]: { az: 20, el: 8 },
};

// ---------------- painted textures ----------------
const meadowTex = () => ctex("meadow", 1024, 1024, (g, r) => {
  g.drawImage(grassHD().image as CanvasImageSource, 0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) { // autumn: dry ochre patches
    const x = r() * 1024, y = r() * 1024, rad = 40 + r() * 120, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(196,160,80,0.38)"); gr.addColorStop(1, "rgba(196,160,80,0)");
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
});
const dirtTex = () => ctex("dirtRoad", 256, 512, (g, r) => {
  g.fillStyle = "#b8956a"; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 1400; i++) { g.fillStyle = ["#9c7a52", "#cfae82", "#a8865c", "#8a6a48"][i % 4]; g.fillRect(r() * 256, r() * 512, 2 + r() * 4, 2 + r() * 4); }
  g.strokeStyle = "rgba(110,84,56,0.5)"; g.lineWidth = 10; for (const x of [70, 186]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); } // cart ruts
});
const wallpaper = (key: string, base: string, motif: string) => ctex("wp" + key, 512, 512, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  g.fillStyle = motif; for (let y = 0; y < 512; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < 512; x += 64) { g.beginPath(); g.ellipse(x + 16, y + 16, 6, 9, 0, 0, 7); g.fill(); }
  g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 440, 512, 72);
});
const flagTexture = (kind: "gr" | "bg") => ctex("flag" + kind, 900, 600, (g) => (kind === "gr" ? greekFlag(g) : bulgarianFlag(g)));

type Flag = { m: THREE.Mesh; base: V3; ph: number };

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#cfdcea", 60, 1400);
  private sunDisc: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = []; private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private flags: Flag[] = [];
  private glare!: SunGlare;
  private birds!: DR.Birds; private birdAt = new Map<number, THREE.Vector3 | null>();
  private frustum = new THREE.Frustum(); private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root;
    // ---- sky + light (same rig as the bridge / road shorts) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false,
      map: ctex("sunDisc", 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }) }));
    this.sunDisc.layers.set(NOINK); this.sunDisc.frustumCulled = false; R.add(this.sunDisc);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#8a7a5a", 0.55);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.glare = new SunGlare(R); // the reference's bright sun haze in the sky
    this.birds = new DR.Birds(R, 5);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2, d = 1300 + (i % 3) * 150;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 300 + (i % 4) * 80;
      m.position.set(Math.cos(a) * d, 230 + (i % 4) * 70, Math.sin(a) * d); m.scale.set(w, w / 2, 1); m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    const b = new Batch();
    // ---- ground: an autumn mountain meadow ----
    const meadow = lam("meadow", () => ({ map: rep(meadowTex(), 1, 1) }));
    const ground = new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2);
    const uv = ground.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5000 / 9, uv.getY(i) * 5000 / 9);
    const gm = new THREE.Mesh(ground, meadow); gm.receiveShadow = true; R.add(gm);
    // ---- the mountain road from the pass down to Petrich, and the path into Greece ----
    const dirt = lam("dirt", () => ({ map: dirtTex() }));
    dirt.polygonOffset = true; dirt.polygonOffsetFactor = -2; dirt.polygonOffsetUnits = -2;
    const road = (z0: number, z1: number, w: number) => {
      const n = Math.ceil((z0 - z1) / 2), g = new THREE.BufferGeometry(), pos: number[] = [], uvs: number[] = [], idx: number[] = [];
      for (let j = 0; j <= n; j++) {
        const z = z0 - j * 2, x = roadX(z);
        pos.push(x - w / 2, 0.02, z, x + w / 2, 0.02, z); uvs.push(0, j * 2 / 6, 1, j * 2 / 6);
        if (j < n) idx.push(j * 2, j * 2 + 1, j * 2 + 3, j * 2, j * 2 + 3, j * 2 + 2);
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Array((n + 1) * 2).fill([0, 1, 0]).flat(), 3)); g.setIndex(idx);
      const me = new THREE.Mesh(g, dirt); me.receiveShadow = true; R.add(me);
    };
    road(60, PETRICH_Z - 70, 4.6);
    // ---- the border: a line of whitewashed stones, a striped post in the middle of the road ----
    const white = lam("stoneWhite", () => ({ color: "#f2efe6" }));
    for (let x = -60; x <= 60; x += 1.6) if (Math.abs(x) > 2.6) b.add(boxGeo(V(x - 0.22, 0, -0.18), V(x + 0.22, 0.32, 0.18)), white);
    for (let k = 0; k < 8; k++) b.add(boxGeo(V(-0.09, k * 0.22, -0.09), V(0.09, k * 0.22 + 0.22, 0.09)), lam(k % 2 ? "postB" : "postW", () => ({ color: k % 2 ? "#2b2a30" : "#f2efe6" })), new THREE.Matrix4().makeTranslation(2.2, 0, 0));
    // sentry huts: wooden boxes with a pitched roof and a dark doorway, each painted in its own colours
    const hut = (p: V3, col: string, yaw: number) => {
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(p[0], 0, p[2]);
      b.add(boxGeo(V(-0.8, 0, -0.8), V(0.8, 2.3, 0.8)), lam("hut" + col, () => ({ color: col })), m);
      b.add(boxGeo(V(-0.45, 0.05, 0.79), V(0.45, 1.9, 0.83)), lam("doorDark", () => ({ color: "#3a3040" })), m);
      const roofM = lam("hutRoof", () => ({ color: "#8a4a3a", side: THREE.DoubleSide }));
      b.add(quad(V(-1.0, 2.3, 1.0), V(1.0, 2.3, 1.0), V(1.0, 3.0, 0), V(-1.0, 3.0, 0)), roofM, m);
      b.add(quad(V(1.0, 2.3, -1.0), V(-1.0, 2.3, -1.0), V(-1.0, 3.0, 0), V(1.0, 3.0, 0)), roofM, m);
    };
    hut(GR_HUT, "#9fc4e8", Math.PI * 0.85);
    hut(BG_HUT, "#8fb08a", -Math.PI * 0.15);
    // flag poles + cloth flags (waving)
    const poleM = lam("flagPole", () => ({ color: "#e8e2d4" }));
    const flagMesh = (base: V3, kind: "gr" | "bg", ph: number, h = 6.2, size = 1.0) => {
      b.add(new THREE.CylinderGeometry(0.06, 0.08, h, 8).translate(base[0], h / 2, base[2]), poleM);
      b.add(new THREE.SphereGeometry(0.13, 12, 8).translate(base[0], h + 0.08, base[2]), brass());
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8 * size, 1.2 * size, 14, 2), lam("flagCloth" + kind, () => ({ map: flagTexture(kind), side: THREE.DoubleSide })));
      m.castShadow = true; m.frustumCulled = false; m.userData.size = size;
      R.add(m); this.flags.push({ m, base: [base[0], h - 0.65 * size, base[2]], ph });
    };
    flagMesh(GR_FLAG, "gr", 0); flagMesh(BG_FLAG, "bg", 1.7);
    // ---- hills, far mountains, pines (background: static) ----
    const r = rng(19);
    const hillM = lam("hill", () => ({ color: "#7d9a55" })), hillM2 = lam("hill2", () => ({ color: "#94a35e" })), rockM = lam("rock", () => ({ color: "#a39a8a" }));
    const farM = lam("farMtn", () => ({ color: "#6f86a0" }));
    const nearRoad = (x: number, z: number, m: number) => (z < 30 && z > PETRICH_Z - 60 && Math.abs(x - roadX(z)) < m) || Math.hypot(x, z) < 26;
    const sets: V3[] = [ATHENS, SOFIA, PARIS, SCHOOL, [0, 0, 0]];
    const hillClear = (x: number, z: number, ex: number, ez: number) => {
      for (let zz = 60; zz > PETRICH_Z - 80; zz -= 8) if (Math.abs(zz - z) < ez + 18 && Math.abs(roadX(zz) - x) < ex + 22) return false;
      return !sets.some((p) => Math.abs(p[0] - x) < ex + 40 && Math.abs(p[2] - z) < ez + 40);
    };
    for (let i = 0; i < 80; i++) { // big rolling hills flanking the pass and the valley (footprint kept off the road and the sets)
      const side = i % 2 ? 1 : -1, z = 140 - r() * 560, x = side * (40 + r() * 220), s = 30 + r() * 60;
      if (!hillClear(x, z, s * 1.4, s)) continue;
      b.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(s * 1.4, s * (0.35 + r() * 0.35), s), i % 3 ? hillM : hillM2, new THREE.Matrix4().makeTranslation(x, -1, z));
    }
    for (let i = 0; i < 30; i++) { // far ranges (fog turns them blue)
      const a = (i / 30) * Math.PI * 2, d = 700 + r() * 500, h = 120 + r() * 220;
      b.add(new THREE.ConeGeometry(h * (1.1 + r() * 0.6), h, 7).rotateY(r() * 3), farM, new THREE.Matrix4().makeTranslation(Math.cos(a) * d, h / 2 - 5, Math.sin(a) * d - 100));
    }
    const pineM = lam("pine", () => ({ color: "#3f6e48" })), pineM2 = lam("pine2", () => ({ color: "#4f7f4a" })), trunkM = lam("trunk", () => ({ color: "#6a4630" }));
    const autumnM = lam("autumn", () => ({ color: "#d08a3a" }));
    for (let i = 0; i < 900; i++) {
      const x = (r() - 0.5) * 420, z = 140 - r() * 520;
      if (nearRoad(x, z, 9) || (z < PETRICH_Z + 45 && z > PETRICH_Z - 60 && Math.abs(x) < 45)) continue;
      const h = 4 + r() * 6, M = new THREE.Matrix4().makeTranslation(x, 0, z), au = r() < 0.18;
      b.add(new THREE.CylinderGeometry(0.16, 0.22, h * 0.3, 6).translate(0, h * 0.15, 0), trunkM, M);
      if (au) b.add(new THREE.IcosahedronGeometry(h * 0.32, 0).scale(1, 1.1, 1).translate(0, h * 0.62, 0), autumnM, M);
      else for (let k = 0; k < 3; k++) b.add(new THREE.ConeGeometry(h * (0.3 - k * 0.07), h * 0.45, 7).translate(0, h * (0.35 + k * 0.2), 0), i % 2 ? pineM : pineM2, M);
    }
    for (let i = 0; i < 160; i++) {
      const x = (r() - 0.5) * 160, z = 40 - r() * 260, s = 0.3 + r() * 0.9;
      if (nearRoad(x, z, 4) || Math.hypot(x, z) < 9) continue;
      b.add(new THREE.DodecahedronGeometry(1, 0).scale(s * 1.2, s * 0.6, s), rockM, new THREE.Matrix4().makeTranslation(x, s * 0.2, z));
    }
    // ---- dressing (reference: no bare ground) — tufts, flowers, gravel, rocks, bushes, fence + telegraph line ----
    const roadPath: DR.XZ[] = []; for (let z = 60; z >= PETRICH_Z - 60; z -= 6) roadPath.push([roadX(z), z]);
    const offRoad = (m: number) => (x: number, z: number) => !(z < 62 && z > PETRICH_Z - 62 && Math.abs(x - roadX(z)) < m) && Math.hypot(x - GR_HUT[0], z - GR_HUT[2]) > 1.6 && Math.hypot(x - BG_HUT[0], z - BG_HUT[2]) > 1.6;
    DR.tufts(b, DR.scatter(31, 5200, -45, 45, -110, 55, offRoad(2.6)), { seed: 31, dry: 0.22 });
    DR.tufts(b, [...DR.along(32, roadPath, 0.55, 2.55, 0.25), ...DR.along(33, roadPath, 0.55, -2.55, 0.25)], { seed: 32, scale: 1.2, dry: 0.15 });
    DR.flowers(b, DR.scatter(34, 900, -35, 35, -90, 50, offRoad(3)), 34);
    DR.pebbles(b, DR.scatter(35, 2600, -6, 6, -120, 58, (x, z) => Math.abs(x - roadX(z)) < 2.4), { seed: 35, size: 0.06, y: 0.02, cols: ["#9c7a52", "#8a7c6a", "#b3a58c", "#7c6a56", "#c4b496"] });
    DR.pebbles(b, [...DR.along(36, roadPath, 0.35, 2.35, 0.2), ...DR.along(37, roadPath, 0.35, -2.35, 0.2)], { seed: 36, size: 0.1 });
    DR.rocks(b, DR.scatter(38, 70, -40, 40, -100, 50, offRoad(4)), 38, 0.5);
    DR.bushes(b, DR.scatter(39, 90, -45, 45, -110, 50, offRoad(4.5)), 39, 0.75, ["#4f8f45", "#5fa04c", "#3f7a3e", "#b9822f"]);
    DR.fence(b, roadPath.filter(([, z]) => z < -9).map(([x, z]) => [x + 4.2, z] as DR.XZ));
    DR.fence(b, roadPath.filter(([, z]) => z > 9).map(([x, z]) => [x + 4.2, z] as DR.XZ));
    DR.poles(b, R, roadPath.map(([x, z]) => [x - 5.5, z] as DR.XZ), { gap: 24 });
    // the posts: sandbags, crates, a barrel, a woodpile, a bench; a blank signpost at the line
    DR.sandbags(b, GR_HUT[0] + 1.6, GR_HUT[2] - 1.2, 2.2, 3, 0.4); DR.sandbags(b, BG_HUT[0] - 1.6, BG_HUT[2] + 1.2, 2.2, 3, 0.4);
    DR.crate(b, GR_HUT[0] - 1.3, GR_HUT[2] + 0.6, 0.6, 0.3); DR.crate(b, GR_HUT[0] - 1.25, GR_HUT[2] + 0.6, 0.45, 0.9, 0.6); DR.barrel(b, GR_HUT[0] - 1.2, GR_HUT[2] - 0.6);
    DR.woodpile(b, BG_HUT[0] + 1.5, BG_HUT[2] - 0.3, 1.4); DR.barrel(b, BG_HUT[0] + 1.3, BG_HUT[2] + 1.0, 0.85); DR.crate(b, BG_HUT[0] - 0.3, BG_HUT[2] - 1.5, 0.55, 0.2);
    DR.bench(b, GR_HUT[0] + 0.2, GR_HUT[2] + 1.6, Math.PI * 0.85); DR.signpost(b, -3.4, 1.2, 0.3);
    // Petrich street life: barrels, crates, benches by the doors
    for (let i = 0; i < 10; i++) { const z = PETRICH_Z + 26 - i * 9, sd = i % 2 ? 1 : -1, x = roadX(z) + sd * 5.6; if (i % 3 === 0) DR.barrel(b, x, z); else if (i % 3 === 1) DR.crate(b, x, z, 0.6, i); else DR.bench(b, x, z, sd > 0 ? -Math.PI / 2 : Math.PI / 2); }
    DR.tufts(b, DR.scatter(40, 1200, -40, 40, PETRICH_Z - 60, PETRICH_Z + 60, (x, z) => Math.abs(x - roadX(z)) > 3.2), { seed: 40, dry: 0.3 });
    // schoolyard edge: bushes, tufts, flowers, two benches
    DR.tufts(b, DR.scatter(41, 1400, SCHOOL[0] - 30, SCHOOL[0] + 30, SCHOOL[2] - 30, SCHOOL[2] + 30, (x, z) => Math.hypot(x - SCHOOL[0], z - SCHOOL[2]) > 15.8), { seed: 41 });
    DR.tufts(b, DR.scatter(44, 160, SCHOOL[0] - 15, SCHOOL[0] + 15, SCHOOL[2] - 15, SCHOOL[2] + 15, (x, z) => Math.hypot(x - SCHOOL[0], z - SCHOOL[2]) > 11), { seed: 44, dry: 0.6, y: 0.02 });
    DR.bushes(b, DR.scatter(42, 26, SCHOOL[0] - 24, SCHOOL[0] + 24, SCHOOL[2] - 24, SCHOOL[2] + 24, (x, z) => Math.hypot(x - SCHOOL[0], z - SCHOOL[2]) > 17), 42, 0.9);
    DR.flowers(b, DR.scatter(43, 200, SCHOOL[0] - 25, SCHOOL[0] + 25, SCHOOL[2] - 25, SCHOOL[2] + 25, (x, z) => Math.hypot(x - SCHOOL[0], z - SCHOOL[2]) > 16.5), 43);
    DR.pebbles(b, DR.scatter(45, 260, SCHOOL[0] - 15, SCHOOL[0] + 15, SCHOOL[2] - 15, SCHOOL[2] + 15, (x, z) => Math.hypot(x - SCHOOL[0], z - SCHOOL[2]) < 15), { seed: 45, size: 0.05, y: 0.02 });
    DR.bench(b, SCHOOL[0] - 9, SCHOOL[2] - 7, 0.6); DR.bench(b, SCHOOL[0] + 9, SCHOOL[2] - 7, -0.6);
    // ---- Petrich: tiled-roof houses along the road, a church tower ----
    for (let i = 0; i < 18; i++) {
      const z = PETRICH_Z + 30 - i * 8.5, side = i % 2 ? 1 : -1, x = roadX(z) + side * (9 + (i % 3) * 3);
      house(b, x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, 7 + (i % 3), 6, 4.5 + (i % 2) * 2.8, i);
    }
    for (let i = 0; i < 14; i++) { const z = PETRICH_Z + 10 - i * 7, side = i % 2 ? 1 : -1; house(b, roadX(z) + side * (24 + (i % 2) * 5), z, side > 0 ? -Math.PI / 2 : Math.PI / 2, 6.5, 6, 4.5, i + 5); }
    const tower = lam("churchW", () => ({ color: "#efe6d2" })), dome = lam("churchRoof", () => ({ color: "#b8644f" }));
    const cx = roadX(PETRICH_Z - 30) - 18, cz = PETRICH_Z - 30;
    b.add(boxGeo(V(cx - 3, 0, cz - 3), V(cx + 3, 14, cz + 3)), tower);
    b.add(new THREE.ConeGeometry(4.2, 5, 4).rotateY(Math.PI / 4).translate(cx, 16.5, cz), dome);
    // ---- interiors (open roof so the sun lights them; the lens side is open) ----
    this.room(b, ATHENS, "athens", "#e9d9b4", "#c9a86a", "gr");
    this.room(b, SOFIA, "sofia", "#d8e2c8", "#a8b890", "bg");
    this.room(b, PARIS, "paris", "#e6dcc8", "#b9a77f", null);
    this.furnish(b);
    // ---- schoolyard: the school, a fence, packed earth ----
    const yard = lam("yard", () => ({ color: "#c9a878" }));
    yard.polygonOffset = true; yard.polygonOffsetFactor = -2; yard.polygonOffsetUnits = -2;
    const ym = new THREE.Mesh(new THREE.CircleGeometry(16, 40).rotateX(-Math.PI / 2).translate(SCHOOL[0], 0.02, SCHOOL[2]), yard); ym.receiveShadow = true; R.add(ym);
    house(b, SCHOOL[0], SCHOOL[2] - 13, 0, 14, 8, 6.5, 2);
    const fenceM = lam("fence", () => ({ color: "#f2efe6" }));
    for (let a = 0; a < Math.PI * 2; a += 0.09) { const x = SCHOOL[0] + Math.cos(a) * 16, z = SCHOOL[2] + Math.sin(a) * 16; if (z > SCHOOL[2] - 6 && Math.abs(x - SCHOOL[0]) < 6 && z > SCHOOL[2] + 8) continue; b.add(boxGeo(V(x - 0.06, 0, z - 0.06), V(x + 0.06, 1.1, z + 0.06)), fenceM); }
    b.build(R);
  }

  /** a room open to the sky and on its +z side: wooden floor, wallpapered walls, a window and (optionally) a flag */
  private room(b: Batch, o: V3, key: string, wall: string, motif: string, flag: "gr" | "bg" | null) {
    const [x, , z] = o, W = 4.8, D = 3.4, H = 3.4;
    const floor = lam("floor" + key, () => ({ map: rep(planksHD(), 2, 2) }));
    b.add(boxGeo(V(x - W, 0, z - D), V(x + W, 0.06, z + 4.5)), floor);
    const wp = lam("wall" + key, () => ({ map: rep(wallpaper(key, wall, motif), 3, 1) }));
    b.add(boxGeo(V(x - W, 0, z - D - 0.2), V(x + W, H, z - D)), wp);
    for (const s of [-1, 1]) b.add(boxGeo(V(x + s * W - (s > 0 ? 0 : 0.2), 0, z - D), V(x + s * W + (s > 0 ? 0.2 : 0), H, z + 1.5)), wp);
    const frame = lam("frame", () => ({ color: "#f6f1e4" })), glass = lam("glass", () => ({ color: "#a9cdea" }));
    const wx = x + (flag ? 2.2 : 0);
    this.root.add(lightShaft(new THREE.Vector3(wx, 2.6, z - D + 0.1), new THREE.Vector3(wx - 0.9, 0.05, z - D + 2.6), 1.5, "#ffe2b0", 0.09));
    b.add(boxGeo(V(wx - 0.9, 1.0, z - D + 0.0), V(wx + 0.9, 2.7, z - D + 0.06)), glass);
    for (const [x0, x1, y0, y1] of [[wx - 1.0, wx + 1.0, 0.92, 1.02], [wx - 1.0, wx + 1.0, 2.68, 2.78], [wx - 1.0, wx - 0.9, 1.0, 2.7], [wx + 0.9, wx + 1.0, 1.0, 2.7], [wx - 0.04, wx + 0.04, 1.0, 2.7]])
      b.add(boxGeo(V(x0, y0, z - D), V(x1, y1, z - D + 0.1)), frame);
    this.dress(b, o, key, wx, W, D, H);
    if (flag) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.07), new THREE.MeshBasicMaterial({ map: flagTexture(flag), color: 0xe0e0e0 }));
      m.position.set(x - 1.9, 2.0, z - D + 0.03); m.layers.set(NOINK); this.root.add(m);
      b.add(boxGeo(V(x - 2.8, 2.5, z - D + 0.02), V(x - 1.0, 2.58, z - D + 0.1)), lam("rod", () => ({ color: "#c9a24e" })));
    }
  }

  /** reference rooms are full: wainscot, pictures, shelves, a rug, plants, a cabinet / clock, curtains */
  private dress(b: Batch, o: V3, key: string, wx: number, W: number, D: number, H: number) {
    const [x, , z] = o, bz = z - D, front = z + 1.5;
    const back: DR.XZ[] = [[x - W, bz], [x + W, bz]], left: DR.XZ[] = [[x - W, front], [x - W, bz]], right: DR.XZ[] = [[x + W, bz], [x + W, front]];
    const wc = key === "athens" ? "#7a4b2a" : key === "sofia" ? "#5f6f4a" : "#8a5a3a";
    const win: [number, number] = [wx - x + W - 1.05, wx - x + W + 1.05];
    DR.wainscot(b, back[0], back[1], wc, [win]); DR.wainscot(b, left[0], left[1], wc); DR.wainscot(b, right[0], right[1], wc);
    const u = (wxx: number) => wxx - (x - W); // back wall: metres from the left corner
    const sideL = (d: number, y: number) => DR.onWall(left[0], left[1], d, y), sideR = (d: number, y: number) => DR.onWall(right[0], right[1], d, y);
    DR.bookcase(b, sideL(1.4, 0.06), 1.3, 2.3, 1); DR.bookcase(b, sideR(1.6, 0.06), 1.3, 2.3, 2);
    DR.picture(b, sideL(3.4, 2.0), 0.7, 0.55, "landscape", 3); DR.picture(b, sideR(3.6, 2.0), 0.7, 0.55, "sea", 4);
    if (key === "athens") {
      DR.picture(b, DR.onWall(back[0], back[1], u(x + 0.1), 2.15, 0), 0.8, 0.6, "landscape", 1);
      DR.cabinet(b, DR.onWall(back[0], back[1], u(x - 1.55), 0.06), 0.55, 1.3);
      DR.plant(b, x + W - 0.45, bz + 0.45, 1.3, 0.06); DR.plant(b, x - W + 0.4, bz + 0.4, 1.3, 0.06);
      DR.rug(b, x, z - 0.4, 3.6, 2.6, 0.06, ["#8a2f2f", "#d8b878", "#2f4a6a"]);
      DR.deskClutter(b, x - 0.1, 0.94, z - 0.55, 1, false);
    } else if (key === "sofia") {
      DR.wallClock(b, DR.onWall(back[0], back[1], u(x + 0.2), 2.4, 0), 0.24);
      DR.picture(b, DR.onWall(back[0], back[1], u(x + 0.15), 1.65, 0), 0.6, 0.42, "map", 2, false);
      DR.cabinet(b, DR.onWall(back[0], back[1], u(x - 1.5), 0.06), 0.55, 1.3); DR.cabinet(b, DR.onWall(back[0], back[1], u(x - 0.9), 0.06), 0.55, 1.3);
      DR.plant(b, x + W - 0.45, bz + 0.45, 1.2, 0.06);
      DR.rug(b, x, z - 0.3, 3.0, 2.4, 0.06, ["#2f4a6a", "#d8b878", "#8a2f2f"]);
      DR.deskClutter(b, x - 0.1, 0.94, z - 0.3, 2, false);
    } else {
      DR.curtains(b, DR.onWall(back[0], back[1], u(wx), 0.9, 0), 1.8, 1.95);
      for (const s of [-1, 1]) { DR.picture(b, DR.onWall(back[0], back[1], u(x + s * 2.0), 2.0, 0), 0.7, 0.9, "portrait", 5 + s); DR.bookcase(b, DR.onWall(back[0], back[1], u(x + s * 3.6), 0.06), 1.2, 2.6, 3 + s); DR.plant(b, x + s * 2.6, bz + 0.4, 1.3, 0.06); }
      DR.rug(b, x, z - 0.2, 3.4, 5.6, 0.06, ["#6a2a34", "#d8b878", "#2f5a4a"]);
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) DR.deskClutter(b, x + s * 0.4, 0.88, z - 1.8 + k * 1.1, 10 + k * 2 + s, false, false);
    }
  }

  private furnish(b: Batch) {
    const wood = lam("deskWood", () => ({ color: "#7a4b2a" })), top = glossy("#8a5a34", 40, 0.35), leather = glossy("#5a2e2a", 30, 0.25);
    const desk = (o: V3, w = 2.2) => {
      const [x, , z] = o;
      b.add(boxGeo(V(x - w / 2, 0.86, z - 0.5), V(x + w / 2, 0.94, z + 0.5)), top);
      b.add(boxGeo(V(x - w / 2 + 0.05, 0, z - 0.45), V(x - w / 2 + 0.55, 0.86, z + 0.45)), wood);
      b.add(boxGeo(V(x + w / 2 - 0.55, 0, z - 0.45), V(x + w / 2 - 0.05, 0.86, z + 0.45)), wood);
      b.add(boxGeo(V(x - w / 2 + 0.55, 0.45, z + 0.4), V(x + w / 2 - 0.55, 0.86, z + 0.45)), wood);
    };
    // Athens: Pangalos's big desk, an inkwell and papers
    desk([ATHENS[0], 0, ATHENS[2] - 0.6], 2.6);
    b.add(boxGeo(V(ATHENS[0] + 0.6, 0.94, ATHENS[2] - 0.7), V(ATHENS[0] + 1.0, 0.96, ATHENS[2] - 0.4)), lam("paper", () => ({ color: "#f6efd9" })));
    b.add(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10).translate(ATHENS[0] - 0.8, 0.99, ATHENS[2] - 0.6), lam("ink", () => ({ color: "#2b2a30" })));
    // Sofia: the telegraph table with a brass key and a sounder
    desk([SOFIA[0], 0, SOFIA[2] - 0.5], 1.8);
    const brassM = brass();
    b.add(boxGeo(V(SOFIA[0] - 0.3, 0.94, SOFIA[2] - 0.2), V(SOFIA[0] + 0.3, 0.98, SOFIA[2] + 0.1)), wood);
    b.add(boxGeo(V(SOFIA[0] - 0.22, 0.98, SOFIA[2] - 0.08), V(SOFIA[0] + 0.18, 1.01, SOFIA[2] - 0.02)), brassM);
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10).translate(SOFIA[0] + 0.2, 1.03, SOFIA[2] - 0.05), lam("knob", () => ({ color: "#2b2a30" })));
    b.add(boxGeo(V(SOFIA[0] + 0.45, 0.94, SOFIA[2] - 0.5), V(SOFIA[0] + 0.85, 1.25, SOFIA[2] - 0.2)), brassM);
    // warm lamps that bloom: desk lamps in Athens and Sofia, three hanging lamps over the council table
    for (const [x, y, z, s] of [[ATHENS[0] - 1.05, 1.32, ATHENS[2] - 0.85, 0.9], [SOFIA[0] - 0.75, 1.32, SOFIA[2] - 0.75, 0.9],
      [PARIS[0], 3.0, PARIS[2] - 1.6, 0.6], [PARIS[0], 3.0, PARIS[2] - 0.2, 0.6], [PARIS[0], 3.0, PARIS[2] + 1.2, 0.6]] as const) {
      const l = lamp("#ffcf8a", 0.07, s); l.position.set(x, y, z); this.root.add(l);
      if (y < 2) b.add(new THREE.ConeGeometry(0.16, 0.18, 14, 1, true).translate(x, y + 0.06, z), glossy("#2f5a3a", 60, 0.5));
    }
    // Paris: the long council table under green baize, chairs on both sides
    const baize = lam("baize", () => ({ color: "#3f7a4a" }));
    b.add(boxGeo(V(PARIS[0] - 0.7, 0.8, PARIS[2] - 2.4), V(PARIS[0] + 0.7, 0.88, PARIS[2] + 2.0)), baize);
    b.add(boxGeo(V(PARIS[0] - 0.6, 0, PARIS[2] - 2.3), V(PARIS[0] + 0.6, 0.8, PARIS[2] + 1.9)), wood);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const cz = PARIS[2] - 1.8 + k * 1.1, cxx = PARIS[0] + s * 1.15;
      b.add(boxGeo(V(cxx - 0.25, 0, cz - 0.25), V(cxx + 0.25, 0.48, cz + 0.25)), leather);
      b.add(boxGeo(V(cxx + s * 0.2 - 0.05, 0.48, cz - 0.25), V(cxx + s * 0.2 + 0.05, 1.15, cz + 0.25)), leather);
    }
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

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = Math.max(0.12, cam.position.y * 0.03); cam.far = 3000; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 8, 12, 120);
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 600; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = this.skyMat.uniforms, sky = SKY[s.light];
    sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = sky.e.map((d) => THREE.MathUtils.degToRad(d));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    const [fc, fn, ff] = FOG[s.light];
    untone(fc, this.fog.color); this.fog.near = fn; this.fog.far = ff;
    scene.fog = this.fog; scene.background = null;
    this.glare.place(cam, sunDir, 900, s.light === "golden" ? 26 : 34, s.light === "golden" ? 1.3 : 0.75, s.light === "golden" ? "#ffc58a" : "#fff4dc");
    this.sunDisc.visible = s.light === "golden";
    if (this.sunDisc.visible) { this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 2200); this.sunDisc.scale.setScalar(2 * 2200 * Math.tan(THREE.MathUtils.degToRad(1.7))); }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i];
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    // flags wave (cloth ripple travelling out from the pole)
    for (const fl of this.flags) {
      const g = fl.m.geometry as THREE.PlaneGeometry, p = g.attributes.position as THREE.BufferAttribute, k = fl.m.userData.size as number;
      const nx = 15;
      for (let i = 0; i < p.count; i++) {
        const u = (i % nx) / (nx - 1), row = Math.floor(i / nx), y = (0.6 - row * 0.6) * k;
        p.setXYZ(i, fl.base[0] + u * 1.8 * k, fl.base[1] + y + 0.04 * u * Math.sin(t * 4 - u * 3), fl.base[2] + 0.22 * u * k * Math.sin(t * 5.2 - u * 5 + fl.ph));
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    // ambient life (reference: birds in most outdoor skies, leaves in autumn, motes in sunbeams); never bounces
    const indoor = id === S.ATHENS || id === S.BILL || id === S.UNFAIR || id === S.SOFIA || id === S.PARIS;
    if (!this.birdAt.has(id)) {
      const c0 = camAt(id, s.a), fw = V(c0.look[0] - c0.pos[0], 0, c0.look[2] - c0.pos[2]).normalize();
      this.birdAt.set(id, indoor ? null : V(...c0.pos).addScaledVector(fw, 70).add(V(0, 26 + c0.pos[1] * 0.5, 0)));
    }
    this.birds.place(t, this.birdAt.get(id) ?? null, 1.1);
    if (!indoor && id !== S.SCHOOL && id !== S.DOG) st.fx.push(...(DR.leaves(t, [c.look[0], 0, c.look[2]], id, { n: 12, radius: 6, height: 5, size: 0.14 }) as FxPlace[]));
    if (indoor) { const o = id === S.SOFIA ? SOFIA : id === S.PARIS ? PARIS : ATHENS; st.fx.push(...(DR.motes(t, [o[0] + (id === S.PARIS ? 0 : 1.6), 1.6, o[2] - 1.8], id, { n: 16, size: [1.6, 1.6, 1.6] }) as FxPlace[])); }
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
      a.mesh.scale.set((p.mirror ? -sc2 : sc2) * (p.sx ?? 1), sc2 * (p.sy ?? 1), sc2);
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
      e2.use(!!p.soft, p.glow, p.tint);
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
