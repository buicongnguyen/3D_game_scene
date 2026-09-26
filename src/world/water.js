import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y } from './layout.js';

/** Terrain height as a half-float texture (shared by water depth and grass placement). */
export function makeHeightTexture(grid) {
  const data = new Uint16Array(grid.nx * grid.nz);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(grid.h[i]);
  const tex = new THREE.DataTexture(data, grid.nx, grid.nz, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // world (x, z) -> uv: (x - x0 + step/2) / (nx * step) samples texel centres at grid points
  tex.userData.xform = new THREE.Vector4(grid.x0 - grid.step / 2, grid.z0 - grid.step / 2, 1 / (grid.nx * grid.step), 1 / (grid.nz * grid.step));
  return tex;
}

const WATER_VS = /* glsl */`
  attribute vec2 flow;
  varying vec3 vWPos;
  varying vec2 vFlow;
  #include <fog_pars_vertex>
  void main() {
    vFlow = flow;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const WATER_FS = /* glsl */`
  uniform float uTime, uNight, uSunVis;
  uniform vec3 uShallow, uDeep, uZenith, uHorizon, uSunDir, uSunColor, uFoam;
  uniform sampler2D uHeight, uNoise;
  uniform vec4 uHX;
  uniform vec4 uLamps[4];
  uniform vec3 uLampColor;
  varying vec3 vWPos;
  varying vec2 vFlow;
  #include <fog_pars_fragment>
  float ground(vec2 xz) { return texture2D(uHeight, (xz - uHX.xy) * uHX.zw).r; }
  void main() {
    float depth = vWPos.y - ground(vWPos.xz);
    if (depth < -0.05) discard;
    vec2 flow = vFlow;
    float speed = 0.55;
    float ph0 = fract(uTime * 0.18), ph1 = fract(uTime * 0.18 + 0.5);
    float wb = abs(ph0 - 0.5) * 2.0;
    vec2 base = vWPos.xz * 0.09;
    vec2 sA = texture2D(uNoise, base - flow * ph0 * speed * 3.0).rg - 0.5;
    vec2 sB = texture2D(uNoise, base - flow * ph1 * speed * 3.0 + 0.37).rg - 0.5;
    vec2 slope = mix(sA, sB, wb);
    slope += (texture2D(uNoise, vWPos.xz * 0.37 - flow * uTime * 0.35).ba - 0.5) * 0.55;
    slope += (texture2D(uNoise, vWPos.xz * 1.1 + vec2(uTime * 0.05, -uTime * 0.04)).rg - 0.5) * 0.25;
    vec3 N = normalize(vec3(-slope.x * 0.55, 1.0, -slope.y * 0.55));
    vec3 V = normalize(cameraPosition - vWPos);
    float ndv = max(dot(N, V), 0.0);
    float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
    float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 9.0 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.25;
    float dk = smoothstep(0.0, 2.3, depth);
    vec3 body = mix(uShallow, uDeep, dk);
    vec3 col = mix(body, sky, fres * 0.8) + uSunColor * spec * uSunVis;
    // warm lamp reflections: vertical streaks under each lit lamp
    for (int i = 0; i < 4; i++) {
      vec4 L = uLamps[i];
      if (L.w <= 0.0) continue;
      vec2 d = vWPos.xz - L.xz;
      vec3 toCam = normalize(cameraPosition - vec3(L.x, 0.0, L.z));
      vec2 side = normalize(vec2(-toCam.z, toCam.x));
      float across = abs(dot(d, side));
      float along = dot(d, normalize(toCam.xz));
      float streak = exp(-across * across * 0.9) * smoothstep(-2.0, 1.5, along) * exp(-max(along, 0.0) * 0.05);
      float rip = 0.6 + 0.8 * texture2D(uNoise, vWPos.xz * 0.6 + vec2(0.0, uTime * 0.3)).r;
      col += uLampColor * streak * rip * L.w * 1.4;
    }
    float fn = texture2D(uNoise, vWPos.xz * 0.42 - flow * uTime * 0.5).r;
    float fn2 = texture2D(uNoise, vWPos.xz * 1.3 - flow * uTime * 0.8).g;
    float foam = smoothstep(0.42, 0.05, depth - fn * 0.28) * smoothstep(0.25, 0.6, fn2 + 0.25);
    col = mix(col, uFoam, foam * 0.85);
    float alpha = mix(0.5, 0.94, smoothstep(0.0, 1.4, depth));
    alpha = max(alpha, foam * 0.9);
    alpha = max(alpha, fres * 0.9) * smoothstep(-0.05, 0.08, depth);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Water {
  constructor(scene, grid, heightTex, noiseTex) {
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uNight: { value: 0 }, uSunVis: { value: 1 },
      uShallow: { value: new THREE.Color('#37c4c0') }, uDeep: { value: new THREE.Color('#145f8f') },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color('#f2fbff') },
      uHeight: { value: heightTex }, uNoise: { value: noiseTex }, uHX: { value: heightTex.userData.xform },
      uLamps: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uLampColor: { value: new THREE.Color('#ffb44a') },
    }]);
    this.uniforms.uHeight.value = heightTex;
    this.uniforms.uNoise.value = noiseTex;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false, fog: true,
    });
    this.mesh = new THREE.Mesh(this.buildStrip(), this.material);
    this.mesh.renderOrder = 2;
    this.mesh.name = 'river';
    scene.add(this.mesh);
  }

  buildStrip() {
    const across = 14;
    const step = 2;
    const rows = Math.ceil(river.length / step) + 1;
    const pos = new Float32Array(rows * (across + 1) * 3);
    const flow = new Float32Array(rows * (across + 1) * 2);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const p = river.at(r * step);
      const W = riverHalfWidth(p.z) + 7;
      const nx = -p.tz, nz = p.tx;
      for (let c = 0; c <= across; c++) {
        const t = (c / across) * 2 - 1;
        pos[k * 3] = p.x + nx * W * t;
        pos[k * 3 + 1] = WATER_Y;
        pos[k * 3 + 2] = p.z + nz * W * t;
        const sp = 1 - t * t * 0.7; // faster mid-channel
        flow[k * 2] = p.tx * sp;
        flow[k * 2 + 1] = p.tz * sp;
        k++;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < across; c++) {
      const a = r * (across + 1) + c, b = a + 1, cc = a + across + 1, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('flow', new THREE.BufferAttribute(flow, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  update(dt, sky, lamps = []) {
    const u = this.uniforms;
    u.uTime.value += dt;
    const L = sky.state;
    u.uZenith.value.copy(sky.uniforms.uZenith.value);
    u.uHorizon.value.copy(sky.uniforms.uHorizon.value);
    u.uSunDir.value.copy(sky.uniforms.uSunDir.value);
    u.uSunColor.value.copy(sky.uniforms.uSunColor.value);
    u.uSunVis.value = sky.uniforms.uSunVis.value;
    u.uNight.value = L.night;
    // day turquoise -> night black-blue
    u.uShallow.value.set('#37c4c0').lerp(new THREE.Color('#0b2a3a'), L.night);
    u.uDeep.value.set('#12608f').lerp(new THREE.Color('#030d1c'), L.night);
    u.uFoam.value.set('#f2fbff').multiplyScalar(1 - L.night * 0.75);
    for (let i = 0; i < 4; i++) {
      const l = lamps[i];
      if (l) u.uLamps.value[i].set(l.x, l.y, l.z, l.intensity * L.night);
      else u.uLamps.value[i].w = 0;
    }
  }
}
