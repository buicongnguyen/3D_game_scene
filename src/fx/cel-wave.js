import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y } from '../world/layout.js';
import { U } from './cel-sprites.js';

const WAVE_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAVE_FS = /* glsl */`
  uniform float uHead, uDir, uTrail, uA, uTime, uS0, uS1;
  varying vec2 vUv;   // x: river arc length (m), y: -1 .. 1 across
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float n21(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  void main() {
    float y = vUv.y;
    // distance behind the crest (in the direction of travel); the crest bows into a chevron
    float behind = (uHead - vUv.x) * uDir - abs(y) * 6.0;
    float crest = exp(-behind * behind / 7.0);
    float trail = behind > 0.0 ? exp(-behind / uTrail) : 0.0;
    float lead = behind < 0.0 ? exp(behind / 3.0) : 0.0;
    float edge = smoothstep(1.0, 0.7, abs(y));
    float ends = smoothstep(uS0, uS0 + 6.0, vUv.x) * smoothstep(uS1, uS1 - 6.0, vUv.x);
    // flecks of light drifting with the wave, and ripple streaks
    float gl = pow(n21(vec2(vUv.x * 1.3 - uTime * 2.6 * uDir, y * 6.0 + uTime * 0.7)), 5.0) * 5.0;
    float streak = 0.55 + 0.45 * sin(vUv.x * 0.8 - uTime * 6.0 * uDir + abs(y) * 4.0);
    vec3 gold = vec3(1.0, 0.55, 0.06), pink = vec3(1.0, 0.22, 0.5), white = vec3(1.0, 0.85, 0.55);
    vec3 col = mix(gold, pink, smoothstep(0.3, 0.95, abs(y)) * 0.75 + smoothstep(6.0, 50.0, behind) * 0.35);
    float I = crest * 1.4 + trail * (0.32 + gl * 0.7) * streak + lead * 0.3;
    col = mix(col, white, clamp(crest * 0.4, 0.0, 0.4)) * I;
    float a = uA * edge * ends;
    if (a * I < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`;

/** A golden light wave racing along the river: a ribbon on the water between two arc lengths. */
export class RiverWave {
  constructor() {
    this.uniforms = {
      uHead: { value: 0 }, uDir: { value: 1 }, uTrail: { value: 28 }, uA: { value: 0 }, uTime: U.uTime, uS0: { value: 0 }, uS1: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: WAVE_VS, fragmentShader: WAVE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'cel:riverwave';
  }

  /** Rebuild the ribbon for arc lengths [s0, s1] (either order); y is the water (or ice) top. */
  build(s0, s1, y = WATER_Y + 0.12) {
    const a = Math.max(0, Math.min(s0, s1) - 6), b = Math.min(river.length, Math.max(s0, s1) + 6);
    const pos = [], uv = [], idx = [];
    let rows = 0;
    for (let s = a; s <= b + 0.01; s += 1.5) {
      const p = river.at(s), hw = riverHalfWidth(p.z) * 0.92;
      const nx = -p.tz, nz = p.tx;
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        pos.push(p.x + nx * hw * k, y, p.z + nz * hw * k);
        uv.push(s, k);
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < 4; k++) {
      const i = r * 5 + k;
      idx.push(i, i + 1, i + 5, i + 1, i + 6, i + 5);
    }
    this.uniforms.uS0.value = a; this.uniforms.uS1.value = b;
    const g = this.mesh.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
  }
}

/**
 * Sakura glow: the 'Blossom' materials of the sakura instances get an emissive term driven by two uniforms,
 * a travelling hot spot (the wave head) and a global afterglow. Patched once at construction so nothing
 * recompiles when a celebration starts.
 */
export class BlossomGlow {
  constructor(foliage) {
    this.u = {
      uCelWave: { value: new THREE.Vector4(0, 0, 30, 0) },   // head x, z, flash radius, flash strength
      uCelDir: { value: new THREE.Vector4(0, 1, 0, -1e5) },  // travel direction x, z, start x, z
      uCelGlow: { value: new THREE.Vector2(0, 90) },         // afterglow behind the crest, lateral reach (m)
      uCelColor: { value: new THREE.Color(1.0, 0.3, 0.6) },
    };
    this.mats = [];
    for (const s of foliage?.sets ?? []) {
      if (!/^tree-sakura/.test(s.model)) continue;
      for (const mesh of s.meshes()) {
        const m = mesh.material;
        if (m?.name !== 'Blossom' || this.mats.includes(m)) continue;
        this.patch(m);
        this.mats.push(m);
      }
    }
  }

  patch(m) {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m), u = this.u;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vCelBase;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          {
            mat4 cim = mat4(1.0);
            #ifdef USE_INSTANCING
              cim = instanceMatrix;
            #endif
            vCelBase = (modelMatrix * cim * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vCelBase.y = (modelMatrix * cim * vec4(transformed, 1.0)).y - vCelBase.y;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec4 uCelWave, uCelDir;
          uniform vec2 uCelGlow;
          uniform vec3 uCelColor;
          varying vec3 vCelBase;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec2 dd = vCelBase.xz - uCelWave.xy;
            float flash = uCelWave.w * exp(-dot(dd, dd) / (uCelWave.z * uCelWave.z));
            vec2 dir = uCelDir.xy, rel = vCelBase.xz - uCelDir.zw;
            float passed = smoothstep(10.0, -10.0, dot(dd, dir)) * smoothstep(-12.0, 4.0, dot(rel, dir));
            float near = smoothstep(uCelGlow.y, uCelGlow.y * 0.6, abs(rel.x * dir.y - rel.y * dir.x));
            float lift = 0.65 + 0.35 * smoothstep(1.5, 5.5, vCelBase.y);
            totalEmissiveRadiance += uCelColor * (uCelGlow.x * passed * near + flash) * lift * (0.55 + 0.45 * diffuseColor.g);
          }`);
    };
    m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}-celbloom`;
    m.needsUpdate = true;
  }

  /** head (x, z), flash radius and strength, afterglow for trees the crest has passed. */
  set(x, z, radius, strength, glow) {
    this.u.uCelWave.value.set(x, z, radius, strength);
    this.u.uCelGlow.value.x = glow;
  }

  /** The wave's start point and overall travel direction (xz). */
  track(x0, z0, x1, z1, reach = 90) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    this.u.uCelDir.value.set(dx / l, dz / l, x0, z0);
    this.u.uCelGlow.value.y = reach;
  }
}
