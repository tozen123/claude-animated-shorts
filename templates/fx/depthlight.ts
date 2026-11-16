// Depth lighting: the post pass that makes the world read in layers, as in the reference shorts (audio-sample/):
//  - aerial perspective: things lighten, cool and lose saturation with distance, and the haze glows warm toward the
//    sun (forward scattering), so the backlit side of a golden-hour frame fills with light;
//  - low ground mist: denser haze near the ground that thins with height (valleys, lake shores, rainy streets);
//  - depth contact shading (depth unsharp mask): creases, corners and the ground right behind objects darken a
//    little, and distant edges standing well in front of a far surface brighten a few percent (no halo on close
//    characters: the rim fades in past ~5 m and is a multiply, never added white), so subjects
//    separate from their background without ink.
// One screen-space Effect using the depth buffer. Put it right after the ink pass, before god rays and lens blur.
// Pure (no history). Copy next to lensblur.ts. Wiring: see SKILL.md "Depth lighting".
import * as THREE from "three";
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Uniform, Vector2, Vector3, Matrix4 } from "three";

const frag = /* glsl */ `
uniform vec3 hazeCol;     // linear RGB of the far haze (match the sky at the horizon)
uniform vec3 sunCol;      // linear RGB of the forward-scatter glow
uniform vec3 sunView;     // direction TOWARD the sun in view space
uniform float density;    // aerial perspective per metre
uniform float mist;       // ground mist strength
uniform float mistH;      // mist height scale (m)
uniform float desat;      // how much far things lose saturation
uniform float scatter;    // forward-scatter strength
uniform float ao;         // contact shading strength
uniform float rim;        // light-rim strength
uniform float skyDist;    // farther than this is sky: untouched
uniform vec2 tanFov;      // tan(fov/2) * (aspect, 1)
uniform mat4 camWorld;    // camera matrixWorld
vec3 viewPos(vec2 uv, float d) { return vec3((uv * 2.0 - 1.0) * tanFov * d, -d); }
float dist(vec2 uv) { return -getViewZ(readDepth(uv)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float d = dist(uv);
  vec3 c = inputColor.rgb;
  if (d > skyDist) { outputColor = inputColor; return; }
  // ---- depth contact shading / light rim (8 taps at a world-constant radius of ~0.12 m). RANGE-CHECKED: a neighbour
  // only occludes when it is 2-50 cm nearer (a real crease or contact). Anything farther in front, e.g. a character
  // standing 1-3 m before the ground, is ignored, so no dark ghost outline appears behind characters.
  float r = clamp(0.12 / (d * tanFov.y) * 0.5, 0.0015, 0.012);
  float occ = 0.0, far = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 o = vec2(cos(a), sin(a)) * r * vec2(tanFov.y / tanFov.x, 1.0);
    float dd = d - dist(uv + o);                     // > 0: neighbour nearer than us
    occ += smoothstep(0.02, 0.12, dd) * (1.0 - smoothstep(0.25, 0.5, dd));
    far += clamp(-dd / max(d, 1.0) * 2.0, 0.0, 1.0);
  }
  float diff = far / 8.0;                            // > 0: we stand in front of a farther surface
  c *= 1.0 - ao * 0.35 * (occ / 8.0);
  // light rim: a hint of sky light on edges standing well in front of a far surface. Scaled by the pixel's own
  // brightness (no added white), fades in only past ~5 m so close characters never get a halo
  float rk = rim * clamp((diff - 0.1) * 0.6, 0.0, 0.1) * smoothstep(5.0, 14.0, d);
  c *= 1.0 + rk * (0.6 + 0.4 * dot(hazeCol, vec3(0.33)));
  // ---- aerial perspective + ground mist + forward scatter
  vec3 vp = viewPos(uv, d), dir = normalize(vp);
  float wy = (camWorld * vec4(vp, 1.0)).y;
  float h = 1.0 - exp(-d * density);
  float m = mist * (1.0 - exp(-d * 0.02)) * exp(-max(wy, 0.0) / mistH);
  float k = clamp(h + m, 0.0, 0.92);
  float sc = pow(max(dot(dir, sunView), 0.0), 6.0) * scatter;
  vec3 haze = hazeCol + sunCol * sc;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), desat * k);
  c = mix(c, haze, k) + sunCol * sc * k * 0.35;
  outputColor = vec4(c, inputColor.a);
}`;

export type DepthLightPreset = { haze: string; sun: string; density: number; mist: number; mistH: number; desat: number; scatter: number; ao: number; rim: number };
/** measured looks: day = clear blue haze, golden = warm glowing haze toward the sun, storm = thick grey mist,
 *  interior = no haze, contact shading only */
export const DEPTH_LIGHT: Record<"day" | "golden" | "storm" | "interior", DepthLightPreset> = {
  day: { haze: "#b8d0ec", sun: "#fff2d8", density: 0.0035, mist: 0.12, mistH: 6, desat: 0.35, scatter: 0.25, ao: 0.55, rim: 0.5 },
  golden: { haze: "#f2b88c", sun: "#ffb067", density: 0.0038, mist: 0.1, mistH: 8, desat: 0.3, scatter: 0.9, ao: 0.6, rim: 0.6 },
  storm: { haze: "#8f98a6", sun: "#000000", density: 0.012, mist: 0.35, mistH: 5, desat: 0.55, scatter: 0, ao: 0.5, rim: 0.3 },
  interior: { haze: "#000000", sun: "#000000", density: 0, mist: 0, mistH: 1, desat: 0, scatter: 0, ao: 0.6, rim: 0.3 },
};

export class DepthLightEffect extends Effect {
  constructor() {
    super("DepthLightEffect", frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ["hazeCol", new Uniform(new Vector3())], ["sunCol", new Uniform(new Vector3())], ["sunView", new Uniform(new Vector3(0, 0, -1))],
        ["density", new Uniform(0)], ["mist", new Uniform(0)], ["mistH", new Uniform(6)], ["desat", new Uniform(0)], ["scatter", new Uniform(0)],
        ["ao", new Uniform(0)], ["rim", new Uniform(0)], ["skyDist", new Uniform(1500)], ["tanFov", new Uniform(new Vector2(1, 1))], ["camWorld", new Uniform(new Matrix4())],
      ]),
    });
  }
  /** call every frame with the camera, the direction TOWARD the sun (world) and a preset (blend two for fades) */
  set(cam: THREE.PerspectiveCamera, sunDir: THREE.Vector3, p: DepthLightPreset) {
    const u = this.uniforms, lin = (hex: string, out: Vector3) => { const c = new THREE.Color(hex); out.set(c.r, c.g, c.b); };
    lin(p.haze, u.get("hazeCol")!.value); lin(p.sun, u.get("sunCol")!.value);
    (u.get("sunView")!.value as Vector3).copy(sunDir).transformDirection(cam.matrixWorldInverse);
    for (const k of ["density", "mist", "mistH", "desat", "scatter", "ao", "rim"] as const) u.get(k)!.value = p[k];
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    (u.get("tanFov")!.value as Vector2).set(ty * cam.aspect, ty);
    (u.get("camWorld")!.value as Matrix4).copy(cam.matrixWorld);
  }
}
