// Living backgrounds, measured on the reference shorts (audio-sample/, frames 0.2 s apart): nothing in the frame is
// ever fully still, but nothing in the background bounces either. Everything moves SMOOTHLY:
//  - the camera always floats a little (hand-held drift, never a cut-dead tripod);
//  - grass, bushes, tree crowns and bamboo lean and recover in slow wind gusts that roll across the field;
//  - hanging things (signs, lanterns, curtains, chimes) sway on their hooks;
//  - lamps and lit windows breathe a few percent; smoke and steam rise; clouds drift; birds glide;
//  - background people keep walking their loops behind the action.
// All pure functions of time (deterministic: any frame renders alone). Copy next to build.ts / ink.ts.
// Wiring (see SKILL.md "Living backgrounds"): name your materials (build.ts lam sets material.name = key),
// call windify(root, WIND_RULES) once after building, set WIND.t.value = t every frame, and patch ink.ts so the
// outline pass bends with the wind (WIND_GLSL + per-object uWind; already done in this repo's ink.ts).
import * as THREE from "three";

// ================================================================ wind (vertex sway, shared with the ink pass)
/** global wind clock: set WIND.t.value = seconds every frame */
export const WIND = { t: { value: 0 } };
/** wind offset in world space: w = (amplitude at the top in m, reference height in m). Gusts roll across the ground. */
export const WIND_GLSL = /* glsl */ `
vec3 windOffset(vec3 wp, vec2 w, float t) {
  if (w.x <= 0.0) return vec3(0.0);
  float k = clamp(wp.y / w.y, 0.0, 1.0); k *= k;
  float ph = dot(wp.xz, vec2(0.21, 0.13));
  float gust = 0.5 + 0.5 * sin(t * 0.45 - wp.x * 0.035 - wp.z * 0.02);          // a slow wave rolling across the field
  float s = 0.55 * sin(t * 1.7 + ph) + 0.25 * sin(t * 2.9 + ph * 1.7 + 1.3) + 0.6 * gust;
  return vec3(0.8, 0.0, 0.6) * s * w.x * k;
}`;
/** make a material sway in the wind (keeps any existing onBeforeCompile, e.g. the toon two-tone patch) */
export const addWind = (m: THREE.Material, amp: number, ref: number) => {
  if (m.userData.wind) return;
  m.userData.wind = new THREE.Vector2(amp, ref);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uWind = { value: m.userData.wind }; sh.uniforms.uWindT = WIND.t;
    sh.vertexShader = "uniform vec2 uWind;\nuniform float uWindT;\n" + WIND_GLSL + "\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n  transformed += windOffset((modelMatrix * vec4(transformed, 1.0)).xyz, uWind, uWindT);");
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + "|wind";
  m.needsUpdate = true;
};
export type WindRule = { prefix: string; amp: number; ref: number };
/** typical values: blades of grass lean ~7 cm, bushes 4 cm, pine crowns 6 cm at 6 m, bamboo 5 cm */
export const WIND_RULES: WindRule[] = [
  { prefix: "tuft", amp: 0.07, ref: 0.4 }, { prefix: "flower", amp: 0.06, ref: 0.35 }, { prefix: "stem", amp: 0.06, ref: 0.35 },
  { prefix: "bush", amp: 0.035, ref: 1.4 }, { prefix: "pineF", amp: 0.07, ref: 6 }, { prefix: "pine", amp: 0.06, ref: 7 },
  { prefix: "bamboo", amp: 0.05, ref: 1.3 }, { prefix: "leaf", amp: 0.04, ref: 1.4 }, { prefix: "autumn", amp: 0.06, ref: 8 },
];
/** apply wind to every mesh whose material name starts with a rule's prefix (call once after Batch.build) */
export const windify = (root: THREE.Object3D, rules: WindRule[] = WIND_RULES) => {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || Array.isArray(m) || !m.name || m.name === "pineTrunk") return;
    const r = rules.find((x) => m.name.startsWith(x.prefix));
    if (r) addWind(m, r.amp, r.ref);
  });
};

// ================================================================ camera float
const sn = (t: number, s: number) => Math.sin(t * 0.61 + s) * 0.5 + Math.sin(t * 1.13 + s * 2.1) * 0.3 + Math.sin(t * 0.27 + s * 3.7) * 0.2;
/** hand-held float: smooth offsets for the camera position and look target (m). amp 1 = the reference's gentle drift */
export const floatCam = (t: number, amp = 1, seed = 0) => ({
  pos: [0.035 * amp * sn(t, seed + 1), 0.025 * amp * sn(t, seed + 2), 0.035 * amp * sn(t, seed + 3)] as [number, number, number],
  look: [0.05 * amp * sn(t, seed + 4), 0.035 * amp * sn(t, seed + 5), 0.05 * amp * sn(t, seed + 6)] as [number, number, number],
});

// ================================================================ swaying hung objects
/** hanging things (lanterns, signs, curtains, chimes): a pendulum sway about the hook, wind-driven and smooth */
export class Swayer {
  private items: { o: THREE.Object3D; amp: number; f: number; ph: number; base: THREE.Euler }[] = [];
  /** o's origin must be the hook (the pivot); amp in radians */
  add(o: THREE.Object3D, amp = 0.08, freq = 0.9, seed = 0) { this.items.push({ o, amp, f: freq, ph: seed * 2.399, base: o.rotation.clone() }); return o; }
  update(t: number) {
    for (const it of this.items) {
      const g = 0.6 + 0.4 * Math.sin(t * 0.45 + it.ph * 0.3); // gusts
      it.o.rotation.set(it.base.x + it.amp * g * Math.sin(t * it.f * 2 * Math.PI + it.ph), it.base.y, it.base.z + 0.6 * it.amp * g * Math.sin(t * it.f * 1.7 * Math.PI + it.ph * 1.3));
    }
  }
}

// ================================================================ light breathing, clouds, extras
/** a lamp's brightness multiplier: breathes +-depth smoothly (candle / paper lantern: 0.08; electric: 0.02) */
export const flicker = (t: number, seed = 0, depth = 0.08) => 1 + depth * (0.6 * Math.sin(t * 5.3 + seed * 3.1) + 0.4 * Math.sin(t * 8.9 + seed * 1.7));
/** cloud drift: extra yaw angle (rad) of a cloud ring around the scene at time t */
export const cloudDrift = (t: number, speed = 0.0025) => t * speed;
/** a background extra walking a closed loop of points at `speed` m/s: position, heading and walk phase */
export const loopWalk = (t: number, path: [number, number][], speed = 1.0, offset = 0) => {
  const seg = path.map((p, i) => { const q = path[(i + 1) % path.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const L = seg.reduce((a, b) => a + b, 0);
  let d = ((t * speed + offset * L) % L + L) % L, i = 0;
  while (d > seg[i]) { d -= seg[i]; i++; }
  const p = path[i], q = path[(i + 1) % path.length], u = d / seg[i];
  return { x: p[0] + (q[0] - p[0]) * u, z: p[1] + (q[1] - p[1]) * u, dx: (q[0] - p[0]) / seg[i], dz: (q[1] - p[1]) / seg[i], phase: (t * speed) / 1.3 };
};
