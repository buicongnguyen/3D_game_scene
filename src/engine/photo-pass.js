import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Photo mode's filters (game/photo.js FILTERS): one pass after OutputPass, so it works on the finished display-sRGB
// picture, where sepia, grain and black-and-white look the way people know them. It is off unless a filter is chosen:
// EffectComposer skips a disabled pass and sends the frame to the screen through the last enabled one, so with photo
// mode closed nothing at all is drawn for it. No colour-space or tone-mapping includes: the input is already final.

/** Uniforms a filter sets (FILTER_BASE's keys), then the two the mode keeps for itself: uSeed and uAspect. */
export const PhotoShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uShadow: { value: new THREE.Vector3() },
    uHigh: { value: new THREE.Vector3() },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uLift: { value: 0 },
    uSepia: { value: 0 },
    uGrain: { value: 0 },
    uVignette: { value: 0 },
    uSeed: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 uTint, uShadow, uHigh;
    uniform float uSat, uContrast, uLift, uSepia, uGrain, uVignette, uSeed, uAspect;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * uTint;
      // split tone: one colour into the shadows, another into the highlights
      float l = dot(c, LUMA);
      c += mix(uShadow, uHigh, smoothstep(0.15, 0.85, l));
      l = dot(c, LUMA);
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c = c * (1.0 - uLift) + uLift;
      vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
      c = mix(c, sep, uSepia);
      // grain on a lattice of 720 rows whatever the resolution, with a seed fixed for the session: the saved file
      // (drawn larger) has the same grain as the screen, and a still picture's grain does not crawl
      vec2 cell = floor(vec2(vUv.x * 720.0 * uAspect, vUv.y * 720.0));
      float n = fract(sin(dot(cell + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += n * uGrain;
      vec2 q = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.3, 0.95, dot(q, q) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};

/** The pass, switched off; Renderer.buildComposer adds it back after OutputPass whenever the composer is rebuilt. */
export function makePhotoPass() {
  const pass = new ShaderPass(PhotoShader);
  pass.enabled = false;
  pass.uniforms.uSeed.value = Math.round(Math.random() * 997);
  return pass;
}

/** Put a filter's values (game/photo.js FILTERS[i].u) on the pass; null switches it off. */
export function applyFilter(pass, u) {
  if (!pass) return;
  pass.enabled = !!u;
  if (!u) return;
  for (const [k, v] of Object.entries(u)) {
    const un = pass.uniforms[k];
    if (!un) continue;
    if (Array.isArray(v)) un.value.set(v[0], v[1], v[2]); else un.value = v;
  }
}
