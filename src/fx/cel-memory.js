import * as THREE from 'three';
import { U } from './cel-sprites.js';

// The golden memory: rigged characters redrawn as translucent glowing gold ghosts. The ghost shader keeps
// three's skinning chunks (the clips play as usual), lights the silhouette with a fresnel rim, adds a slow
// shimmer climbing the body and a dissolve band (uLow..uHigh, 0 = feet, 1 = head) with a bright edge, so
// the friends can materialise from the ground up and later rise away into sparkles.
// Blending is premultiplied (One, OneMinusSrcAlpha): gold light is added while dark parts (eyes, brows)
// still read darker, by day as well as by night.

const GHOST_VS = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uBase, uHeight;
  varying vec3 vN, vV;
  varying float vH;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vN = normalize(transformedNormal);
    vV = normalize(-mvPosition.xyz);
    vH = ((modelMatrix * vec4(transformed, 1.0)).y - uBase) / uHeight;
  }`;
const GHOST_FS = /* glsl */`
  uniform vec3 uColor, uEdge;
  uniform float uOpacity, uTime, uBody, uDark, uLow, uHigh;
  varying vec3 vN, vV;
  varying float vH;
  void main() {
    if (vH > uHigh || vH < uLow) discard;
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 2.4);
    float sh = 0.82 + 0.18 * sin(vH * 46.0 - uTime * 3.2) + 0.25 * pow(0.5 + 0.5 * sin(vH * 7.0 - uTime * 1.3), 8.0);
    vec3 col = uColor * (uBody + rim * 1.9) * sh;
    float a = uBody * 0.55 + rim * 0.35;
    // dark parts (eyes, brows) read as darker shapes inside the glow
    col *= 1.0 - uDark;
    a = mix(a, 0.55, uDark);
    // the dissolve edges glow hot
    float e = smoothstep(0.07, 0.0, uHigh - vH) * step(uHigh, 1.08) + smoothstep(0.07, 0.0, vH - uLow) * step(0.001, uLow);
    col += uEdge * e * 2.5;
    a = max(a, e * 0.4);
    gl_FragColor = vec4(col * uOpacity, a * uOpacity);
  }`;

// per-part looks, keyed by the source material name
const PARTS = {
  skin: { color: [1.6, 1.02, 0.5], body: 0.22, dark: 0 },
  dark: { color: [1.2, 0.62, 0.22], body: 0.26, dark: 0.85 },
  eye: { color: [2.0, 1.75, 1.3], body: 0.55, dark: 0 },
  hair: { color: [1.5, 0.66, 0.22], body: 0.22, dark: 0.2 },
  cloth: { color: [1.6, 0.92, 0.26], body: 0.16, dark: 0 },
  accent: { color: [1.9, 0.72, 0.5], body: 0.2, dark: 0 },
};
const partOf = name => {
  const n = (name || '').toLowerCase();
  if (n === 'dark' || n === 'iris') return 'dark';
  if (n.includes('eye white')) return 'eye';
  if (n === 'skin') return 'skin';
  if (n.includes('hair')) return 'hair';
  if (/kerchief|headscarf|scarf|brass|leather|wood|shoes/.test(n)) return 'accent';
  return 'cloth';
};

/** A set of ghost materials sharing fade/dissolve uniforms (one set per show; the program is shared). */
export class GhostMaterials {
  constructor(tint = [1, 1, 1]) {
    this.shared = { uOpacity: { value: 0 }, uLow: { value: 0 }, uHigh: { value: 0 }, uBase: { value: 0 }, uHeight: { value: 1.45 }, uTime: U.uTime, uEdge: { value: new THREE.Vector3(2.4, 1.8, 0.9) } };
    this.mats = {};
    for (const [k, p] of Object.entries(PARTS)) {
      this.mats[k] = new THREE.ShaderMaterial({
        uniforms: { ...this.shared, uColor: { value: new THREE.Vector3(p.color[0] * tint[0], p.color[1] * tint[1], p.color[2] * tint[2]) }, uBody: { value: p.body }, uDark: { value: p.dark } },
        vertexShader: GHOST_VS, fragmentShader: GHOST_FS,
        transparent: true, depthWrite: false, fog: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      });
    }
  }
  /** Swap every mesh's material in `obj` for its ghost part (skinning is kept: the program adds it itself). */
  apply(obj) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      o.material = this.mats[partOf(m?.name)];
      o.castShadow = false; o.receiveShadow = false;
      o.frustumCulled = false;
      o.renderOrder = 6;
    });
    return obj;
  }
  dispose() { for (const m of Object.values(this.mats)) m.dispose(); }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();

/**
 * Aim a two-bone arm (upper -> fore -> hand) toward `target` (world), blended by w: a cheap one-pass aim for
 * each bone so the dancers reach for their neighbours' hands whatever the rig's bone axes are.
 */
export function aimArm(upper, fore, hand, target, w) {
  if (!upper || !fore || !hand || w <= 0.001) return;
  for (const [bone, tip] of [[upper, fore], [fore, hand]]) {
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(_a);
    tip.getWorldPosition(_b);
    const cur = _b.sub(_a).normalize();
    const want = target.clone().sub(_a).normalize();
    _q.setFromUnitVectors(cur, want);
    _q2.identity().slerp(_q, w);
    // world delta -> local: parentWorld^-1 * delta * boneWorld
    bone.parent.getWorldQuaternion(_pq);
    const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const nw = _q2.multiply(boneWorld);
    bone.quaternion.copy(_pq.invert().multiply(nw));
  }
  upper.updateWorldMatrix(false, true);
}

const DISC_VS = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DISC_FS = /* glsl */`
  uniform float uO, uTime;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float pool = exp(-r * r * 1.5) * 0.22;
    float ring = exp(-pow((r - 1.55 - 0.05 * sin(uTime * 2.0)) / 0.07, 2.0)) * 0.45;
    float ang = atan(vP.y, vP.x);
    float dots = pow(0.5 + 0.5 * sin(ang * 16.0 + uTime * 0.8), 18.0) * exp(-pow((r - 1.85) / 0.06, 2.0)) * 0.9;
    float a = (pool + ring + dots) * uO * smoothstep(2.2, 1.9, r);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vec3(2.2, 1.45, 0.55) * a, a * 0.25);
  }`;

/** A flat golden pool of light with a ring of dots, laid on the ground under the memory dancers (radius ~2.2 m). */
export function memoryDisc() {
  const g = new THREE.CircleGeometry(2.2, 48);
  g.rotateX(-Math.PI / 2);
  // local xy for the shader after the rotation: keep the unrotated coordinates in position.xy via a copy
  const pos = g.attributes.position;
  const flat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) flat.set([pos.getX(i), -pos.getZ(i), 0], i * 3);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 }, uTime: U.uTime },
    vertexShader: DISC_VS.replace('vP = position.xy;', 'vP = aFlat.xy;').replace('varying vec2 vP;', 'varying vec2 vP;\n  attribute vec3 aFlat;'),
    fragmentShader: DISC_FS,
    transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  g.setAttribute('aFlat', new THREE.BufferAttribute(flat, 3));
  const m = new THREE.Mesh(g, mat);
  m.name = 'cel:memoryDisc';
  m.renderOrder = 5;
  m.visible = false;
  return m;
}
