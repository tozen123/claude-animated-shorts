// Highlights and glows in the reference look (studied in audio-sample/): glossy paint and chrome with sharp specular
// glints, lamps / windows / headlights / light bars that bloom, warm god rays through windows, a bright sun haze in the
// sky, and much lighter world outlines than the characters' ink. Copy next to world.ts (imports shade.ts, ink.ts).
// The post chain blooms only what is brighter than 1.0 (Bridge.tsx makeBloom threshold), so every glow below is
// written in HDR (colour x 2-6) on purpose; normal surfaces never cross 1.0 and never bloom.
import * as THREE from "three";
import { twoTone } from "./shade";
import { NOINK, InkOptions } from "./ink";

/** glossy two-tone material (car paint, enamel, varnished wood, brass, chrome): Phong specular kept by twoTone,
 *  masked by the sun shadow, so glints appear only where the sun hits. shininess 30 (satin) .. 120 (chrome). */
export const glossy = (color: THREE.ColorRepresentation, shininess = 60, spec = 0.55, specCol: THREE.ColorRepresentation = "#ffffff") =>
  twoTone(new THREE.MeshPhongMaterial({ color, shininess, specular: new THREE.Color(specCol).multiplyScalar(spec) }), 0.6);
export const chrome = () => glossy("#c9ccd2", 120, 1.0);
export const brass = () => glossy("#c9a24e", 80, 0.8, "#ffe3a0");

/** self-lit HDR material: lamp bulbs, lit windows, headlights, light bars, embers. gain 2-6 blooms. */
export const emissive = (color: THREE.ColorRepresentation, gain = 3) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), toneMapped: true });

const radialTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,255,255,0.55)"); gr.addColorStop(0.5, "rgba(255,255,255,0.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    t = new THREE.CanvasTexture(c); return t;
  };
})();
/** additive halo sprite around a light source (lamp, window, headlight, sun glint); size in metres */
export const halo = (color: THREE.ColorRepresentation, size = 1.2, gain = 1.6) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: new THREE.Color(color).multiplyScalar(gain), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size); s.layers.set(NOINK); s.renderOrder = 6;
  return s;
};
/** a lamp: emissive bulb + halo (+ optional real point light for nearby surfaces) */
export const lamp = (color: THREE.ColorRepresentation = "#ffcf8a", r = 0.08, haloSize = 1.0, light = 0) => {
  const g = new THREE.Group();
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), emissive(color, 4)); bulb.layers.set(NOINK);
  g.add(bulb, halo(color, haloSize, 1.4));
  if (light > 0) { const pl = new THREE.PointLight(color, light, 6, 2); g.add(pl); }
  return g;
};

const shaftTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 64; c.height = 256;
    const g = c.getContext("2d")!, gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const sx = g.createLinearGradient(0, 0, 64, 0); // soft side edges
    sx.addColorStop(0, "rgba(0,0,0,1)"); sx.addColorStop(0.2, "rgba(0,0,0,0)"); sx.addColorStop(0.8, "rgba(0,0,0,0)"); sx.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = sx; g.fillRect(0, 0, 64, 256);
    t = new THREE.CanvasTexture(c); return t;
  };
})();
/** god ray: a soft additive beam from a window (from) toward the floor (to); width in metres. Static scenery light. */
export const lightShaft = (from: THREE.Vector3, to: THREE.Vector3, width = 1.2, color: THREE.ColorRepresentation = "#ffe2b0", strength = 0.35) => {
  const len = from.distanceTo(to), g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: shaftTex(), color: new THREE.Color(color).multiplyScalar(strength), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const a of [0, Math.PI / 2]) { // two crossed planes read as a volume from any angle
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len).translate(0, -len / 2, 0), mat);
    m.rotation.y = a; m.layers.set(NOINK); g.add(m);
  }
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  return g;
};

/** sun haze: a big soft additive glow in the sky around the sun direction (the reference's bright top-corner sky).
 *  Call place(cam, sunDir) every frame. */
export class SunGlare {
  sprite = halo("#fff4dc", 1, 0.9);
  constructor(parent: THREE.Object3D) { parent.add(this.sprite); }
  place(cam: THREE.Camera, sunDir: THREE.Vector3, dist = 900, sizeDeg = 38, gain = 0.9, color: THREE.ColorRepresentation = "#fff4dc") {
    this.sprite.position.copy(cam.position).addScaledVector(sunDir, dist);
    this.sprite.scale.setScalar(2 * dist * Math.tan(THREE.MathUtils.degToRad(sizeDeg)));
    (this.sprite.material as THREE.SpriteMaterial).color.set(color).multiplyScalar(gain);
  }
}

/** world outlines in the reference are thin and soft (characters keep their thick plum ink): pass to new InkPass(..) */
export const SAMPLE_INK: InkOptions = { color: "#1c1519", strength: 0.7, widthNear: 2.6, widthFar: 1.4, creaseScale: 0.55, farOpacity: 0.6, fadeNear: 80, fadeFar: 260 };

/** bloom settings matching the reference's soft, generous glows (lamps, sparks, eyes, sun haze) */
export const SAMPLE_BLOOM = { intensity: 0.85, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, levels: 7, radius: 0.72 };
