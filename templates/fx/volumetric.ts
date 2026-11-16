// Volumetric light, as in the reference shorts (audio-sample/): bright streaks of sunlight fanning out from the sun
// past roofs, domes and trees ("crepuscular rays"), warm god-ray beams slanting through windows and gaps with
// drifting dust in them, and soft cones under lamps. Three tools:
//  1. GodRaysEffect: a screen-space post pass. It marches from each pixel toward the sun's screen position and
//     gathers only SKY pixels (depth test), so every roof, tree, character and dome edge casts a dark gap in the rays
//     and the light fans out between them. Works with the sun slightly off screen (rays stream in from the side).
//  2. volumeShaft / SunShafts: world-space beams. Fanned planes with a soft streaked texture, faded at the plane
//     edges and when seen edge-on, so they read as a volume from any angle (no hard plane lines). Slow dust drift.
//  3. lampCone: a soft additive cone under a lamp / street light / headlight.
// All of them are pure functions of time (update(t)), so stills and renders agree.
// Copy next to glow.ts / lensblur.ts. Wiring: see SKILL.md "Volumetric light".
import * as THREE from "three";
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Uniform, Vector2, Vector3 } from "three";

// ================================================================ 1. screen-space god rays
const raysFrag = /* glsl */ `
uniform vec2 lightPos;     // sun in uv (may be outside 0..1)
uniform float strength;    // 0 = off
uniform float density;     // how far toward the sun each pixel marches (fraction of the uv distance)
uniform float decay;       // falloff per sample
uniform float threshold;   // only sky brighter than this feeds the rays
uniform float skyDist;     // anything farther than this (m) counts as sky
uniform vec3 tint;
float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength <= 0.0) { outputColor = inputColor; return; }
  vec2 delta = (uv - lightPos) * density / float(SAMPLES);
  vec2 p = uv - delta * hash12(uv * 1024.0);        // jitter hides the sample steps
  float illum = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    p -= delta;
    vec2 pc = clamp(p, 0.0, 1.0);
    float inside = step(abs(p.x - 0.5), 0.5) * step(abs(p.y - 0.5), 0.5); // no early break: keeps texture gradients defined
    float d = -getViewZ(readDepth(pc));
    float sky = step(skyDist, d);
    vec3 c = texture2D(inputBuffer, pc).rgb;
    float l = max(dot(c, vec3(0.299, 0.587, 0.114)) - threshold, 0.0);
    acc += inside * sky * l * illum;
    illum *= decay;
  }
  acc /= float(SAMPLES) * 0.25;
  outputColor = vec4(inputColor.rgb + acc * tint * strength, inputColor.a);
}`;

export class GodRaysEffect extends Effect {
  constructor({ samples = 72 }: { samples?: number } = {}) {
    super("GodRaysEffect", raysFrag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      defines: new Map([["SAMPLES", String(samples)]]),
      uniforms: new Map<string, Uniform>([
        ["lightPos", new Uniform(new Vector2(0.5, 1.2))], ["strength", new Uniform(0)], ["density", new Uniform(0.9)], ["decay", new Uniform(0.965)],
        ["threshold", new Uniform(0.55)], ["skyDist", new Uniform(1500)], ["tint", new Uniform(new Vector3(1, 0.92, 0.78))],
      ]),
    });
  }
  /** aim the rays at the sun (world direction TOWARD the sun) for this camera; fades out as the sun leaves the frame
   *  or goes behind the camera. preset = RAYS.day / RAYS.golden / RAYS.off */
  aim(cam: THREE.PerspectiveCamera, sunDir: THREE.Vector3, preset: RaysPreset) {
    const u = this.uniforms;
    const fwd = cam.getWorldDirection(_v), facing = fwd.dot(sunDir);
    const p = _w.copy(cam.position).addScaledVector(sunDir, 1000).project(cam);
    const lp = (u.get("lightPos")!.value as Vector2).set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    // off-screen distance in uv: full strength on screen, fading out by `reach` beyond the edge
    const out = Math.max(0, Math.abs(lp.x - 0.5) - 0.5, Math.abs(lp.y - 0.5) - 0.5);
    const k = facing <= 0.05 ? 0 : Math.max(0, 1 - out / preset.reach) * Math.min(1, (facing - 0.05) / 0.25);
    u.get("strength")!.value = preset.strength * k;
    u.get("density")!.value = preset.density; u.get("decay")!.value = preset.decay; u.get("threshold")!.value = preset.threshold;
    (u.get("tint")!.value as Vector3).set(...preset.tint);
  }
  set skyDist(v: number) { this.uniforms.get("skyDist")!.value = v; }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export type RaysPreset = { strength: number; density: number; decay: number; threshold: number; reach: number; tint: [number, number, number] };
/** measured on the samples: golden-hour rays are long, warm and strong; daytime rays are faint and short */
export const RAYS: Record<"day" | "golden" | "off", RaysPreset> = {
  day: { strength: 0.35, density: 0.75, decay: 0.955, threshold: 0.7, reach: 0.6, tint: [1, 0.96, 0.88] },
  golden: { strength: 0.9, density: 0.95, decay: 0.968, threshold: 0.5, reach: 0.9, tint: [1, 0.78, 0.5] },
  off: { strength: 0, density: 0.9, decay: 0.96, threshold: 1, reach: 1, tint: [1, 1, 1] },
};

// ================================================================ 2. world-space beams
let streakTexCache: THREE.CanvasTexture | null = null;
/** soft vertical streaks of uneven brightness (the light breaking through gaps), tileable along the beam */
const streakTex = () => {
  if (streakTexCache) return streakTexCache;
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, w = 6 + r() * 30, a = 0.25 + r() * 0.75, gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; for (const o of [-256, 0, 256]) g.fillRect(x - w + o, 0, 2 * w, 256);
  }
  streakTexCache = new THREE.CanvasTexture(c); streakTexCache.wrapS = streakTexCache.wrapT = THREE.RepeatWrapping;
  return streakTexCache;
};
const shaftVert = /* glsl */ `
varying vec2 vUv; varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const shaftFrag = /* glsl */ `
uniform sampler2D map; uniform vec3 color; uniform float time; uniform float seed; uniform float cone;
varying vec2 vUv; varying float vFacing;
void main() {
  float across = mix(smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x), 1.0, cone); // soft sides (cones: none)
  float along = mix(0.35, 1.0, vUv.y) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.94, vUv.y); // bright at the source, soft ends
  float s1 = texture2D(map, vec2(vUv.x * 0.9 + seed, vUv.y * 0.15 + time * 0.012)).r;
  float s2 = texture2D(map, vec2(vUv.x * 1.7 - seed * 0.5, vUv.y * 0.07 - time * 0.008)).r;
  float k = across * along * (0.35 + 0.9 * s1 * (0.5 + 0.5 * s2)) * pow(vFacing, 0.7);  // edge-on planes fade away
  gl_FragColor = vec4(color * k, 1.0);
}`;
const shaftMaterial = (color: THREE.ColorRepresentation, strength: number, seed: number, cone = 0) => new THREE.ShaderMaterial({
  uniforms: { map: { value: streakTex() }, color: { value: new THREE.Color(color).multiplyScalar(strength) }, time: { value: 0 }, seed: { value: seed }, cone: { value: cone } },
  vertexShader: shaftVert, fragmentShader: shaftFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
});

/** a volumetric beam from `from` (the opening: window, gap in the roof, between trees) to `to` (where it lands).
 *  width in metres at the source, spread = width growth to the far end. Returns a group with update(t).
 *  layer: put it on the no-ink layer of your project (ink.ts NOINK) so the outline pass ignores it. */
export const volumeShaft = (from: THREE.Vector3, to: THREE.Vector3, o: { width?: number; spread?: number; color?: THREE.ColorRepresentation; strength?: number; planes?: number; seed?: number; layer?: number } = {}) => {
  const { width = 1.2, spread = 1.35, color = "#ffe2b0", strength = 0.18, planes = 5, seed = 0.37, layer } = o;
  const len = from.distanceTo(to), g = new THREE.Group() as THREE.Group & { update: (t: number) => void; setStrength: (k: number) => void };
  const mat = shaftMaterial(color, strength, seed), base = mat.uniforms.color.value.clone();
  const geo = new THREE.PlaneGeometry(1, len, 1, 1).translate(0, -len / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute; // widen toward the far end (light spreading)
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = -y / len; pos.setX(i, pos.getX(i) * width * (1 + (spread - 1) * k)); }
  for (let i = 0; i < planes; i++) { const m = new THREE.Mesh(geo, mat); m.rotation.y = (i / planes) * Math.PI; if (layer !== undefined) m.layers.set(layer); g.add(m); }
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  g.update = (t: number) => { mat.uniforms.time.value = t; };
  g.setStrength = (k: number) => { mat.uniforms.color.value.copy(base).multiplyScalar(k); };
  return g;
};

/** outdoor sunbeams: beams landing on the given ground points, tilted along the sun every frame (the sun is per shot).
 *  Use for gaps between trees, roof eaves, a courtyard. place(sunDir, t, strength) once per frame. */
export class SunShafts {
  shafts: ReturnType<typeof volumeShaft>[] = [];
  constructor(private parent: THREE.Object3D, private pts: THREE.Vector3[], private o: { len?: number; width?: number; color?: THREE.ColorRepresentation; strength?: number; layer?: number } = {}) {
    pts.forEach((p, i) => {
      const s = volumeShaft(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0), { width: o.width ?? 2.0, spread: 1.15, color: o.color ?? "#ffd9a0", strength: o.strength ?? 0.12, planes: 4, seed: i * 0.173, layer: o.layer });
      s.scale.set(1, (o.len ?? 30) / 1, 1); // geometry length 1 -> len (y scale)
      parent.add(s); this.shafts.push(s);
    });
  }
  place(sunDir: THREE.Vector3, t: number, k = 1) {
    this.shafts.forEach((s, i) => {
      s.visible = k > 0.01 && sunDir.y > 0.03;
      const p = this.pts[i], len = this.o.len ?? 30;
      s.position.copy(p).addScaledVector(sunDir, len);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir.clone().negate());
      s.update(t); s.setStrength(k);
    });
  }
}

// ================================================================ 3. lamp cones
/** a soft cone of light under a lamp: apex at `pos`, pointing along `dir`, half-angle in degrees */
export const lampCone = (pos: THREE.Vector3, dir: THREE.Vector3, o: { angle?: number; len?: number; color?: THREE.ColorRepresentation; strength?: number; layer?: number } = {}) => {
  const { angle = 28, len = 3, color = "#ffcf8a", strength = 0.22, layer } = o;
  const r = Math.tan(THREE.MathUtils.degToRad(angle)) * len;
  const geo = new THREE.ConeGeometry(r, len, 32, 1, true).translate(0, -len / 2, 0);
  // uv: x around, y along (1 at the apex); reuse the shaft shader's soft ends, sides faded by facing
  const mat = shaftMaterial(color, strength, 0.21, 1);
  const m = new THREE.Mesh(geo, mat) as unknown as THREE.Mesh & { update: (t: number) => void };
  m.position.copy(pos); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  if (layer !== undefined) m.layers.set(layer);
  m.update = (t: number) => { mat.uniforms.time.value = t; };
  return m;
};
