import * as THREE from 'three';
import { U, spriteAtlas, KIND } from './cel-sprites.js';

// Shared GLSL helpers.
const NOISE = /* glsl */`
  float h11(float n) { return fract(sin(n) * 43758.5453); }
  float n11(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float n21(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
`;

// ------------------------------------------------------------------------------------------------ rainbow
const RAINBOW_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RAINBOW_FS = /* glsl */`
  uniform float uA, uReveal, uTime;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float ang = vUv.x;            // 0 .. 1 across the arch (left foot -> right foot)
    float t = vUv.y;              // -0.6 inside glow .. 0 inner (violet) .. 1 outer (red)
    float rev = smoothstep(uReveal, uReveal - 0.06, ang);
    float feet = smoothstep(0.0, 0.16, sin(ang * 3.14159));
    vec3 col; float a;
    if (t >= 0.0) {
      // outer red -> orange -> yellow -> green -> blue -> violet (inner), with a soft pastel-free spectrum
      col = hsv(mix(0.80, 0.0, t), 0.88, 1.0);
      col = mix(col, col * vec3(1.05, 1.0, 1.1), 0.5);
      a = smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.78, t);
      a *= 0.85 + 0.15 * sin(ang * 60.0 - uTime * 0.8);
    } else {
      col = vec3(1.0, 0.97, 0.9);
      a = 0.16 * smoothstep(-0.6, 0.0, t);
    }
    // a sparkle at the growing tip while the arch draws itself
    float tip = exp(-pow((ang - uReveal) * 40.0, 2.0)) * step(uReveal, 0.999);
    col += vec3(1.0, 0.9, 0.7) * tip * 2.0;
    a = max(a, tip * 0.6 * step(0.0, t) * step(t, 1.0));
    a *= uA * rev * feet;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a * 1.1, a * 0.42);
  }`;

/** A big soft rainbow arch that always faces the camera (yaw only), drawing itself from one foot to the other. */
export class Rainbow {
  constructor() {
    const seg = 128, rows = [-0.6, 0, 1];
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, th = Math.PI * (1 - u);
      for (const r of rows) {
        const rr = 1 + (r - 1) * 0.13;   // outer edge at radius 1, band 13 % wide
        pos.push(Math.cos(th) * rr, Math.sin(th) * rr, 0);
        uv.push(u, r);
      }
    }
    for (let i = 0; i < seg; i++) for (let k = 0; k < rows.length - 1; k++) {
      const a = i * rows.length + k, b = a + 1, c = a + rows.length, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.uniforms = { uA: { value: 0 }, uReveal: { value: 0 }, uTime: U.uTime };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: RAINBOW_VS, fragmentShader: RAINBOW_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'cel:rainbow';
  }

  face(camPos) {
    const m = this.mesh;
    m.rotation.set(0, Math.atan2(camPos.x - m.position.x, camPos.z - m.position.z), 0);
  }
}

// ------------------------------------------------------------------------------------------------ aurora
// Curtains live in camera-relative space at the far plane (like the sky): terrain occludes them, they never
// parallax, and they sit 8-40 degrees above the horizon in every direction a cutscene might look.
const AURORA_VS = /* glsl */`
  uniform float uTime;
  uniform vec3 uCam;
  attribute vec2 aN;
  varying vec2 vUv;
  varying float vFar;
  void main() {
    vUv = uv;
    vec3 p = position;
    float s = uv.x * 40.0;
    // curtains fold and drift sideways, their hems ripple
    p.xz += aN * (sin(s * 0.9 + uTime * 0.21) * 40.0 + sin(s * 2.3 - uTime * 0.37) * 16.0);
    p.y += sin(s * 1.7 + uTime * 0.3) * 18.0 * (1.0 - uv.y * 0.5);
    vec4 cp = projectionMatrix * viewMatrix * vec4(p + uCam, 1.0);
    #ifdef USE_REVERSED_DEPTH_BUFFER
      gl_Position = vec4(cp.xy, 0.0, cp.w);
    #else
      gl_Position = cp.xyww;
    #endif
  }`;
const AURORA_FS = /* glsl */`
  uniform float uTime, uI;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float x = vUv.x * 40.0, y = vUv.y;
    // vertical rays: sharp bright folds sliding along the curtain
    float rays = n11(x * 6.0 + uTime * 0.35) * 0.65 + n11(x * 23.0 - uTime * 0.9) * 0.5;
    rays = pow(rays, 1.6);
    float band = smoothstep(0.15, 0.75, n11(x * 0.7 + uTime * 0.05 + 3.0));
    float hem = smoothstep(0.0, 0.07, y);
    float body = hem * (0.3 + 0.7 * exp(-y * 2.6)) * smoothstep(1.0, 0.72, y);
    vec3 green = vec3(0.1, 1.0, 0.45), teal = vec3(0.05, 0.75, 0.85), violet = vec3(0.55, 0.2, 1.0), pink = vec3(1.0, 0.25, 0.7);
    vec3 col = mix(green * 1.25, teal, smoothstep(0.12, 0.4, y));
    col = mix(col, violet, smoothstep(0.35, 0.7, y));
    col = mix(col, pink, smoothstep(0.55, 0.95, y) * (0.55 + 0.45 * sin(x * 0.35 + uTime * 0.25)));
    // the hem glows a little pink where it is brightest
    col += pink * 0.4 * smoothstep(0.05, 0.0, abs(y - 0.035)) * rays;
    float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float a = body * (0.25 + rays) * (0.35 + 0.65 * band) * ends * uI;
    if (a < 0.002) discard;
    gl_FragColor = vec4(col * a, a);
  }`;

export class Aurora {
  constructor() {
    const curtains = [
      // [yaw centre (rad, 0 = -z/north), arc span, radius, base height, top height, phase]
      [0.15, 1.5, 1000, 150, 620, 0],
      [0.95, 1.1, 1150, 190, 700, 1.3],
      [-0.75, 1.2, 1050, 140, 560, 2.1],
      [2.4, 1.3, 1100, 160, 600, 3.7],
      [-2.2, 1.0, 1000, 150, 520, 5.2],
      [3.4, 0.8, 1250, 210, 640, 4.4],
    ];
    const pos = [], uv = [], nrm = [], idx = [];
    let base = 0;
    curtains.forEach(([yc, span, R, y0, y1, ph]) => {
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const a = yc + (u - 0.5) * span;
        // wavy radius: the curtain snakes toward and away from the viewer
        const r = R * (1 + 0.16 * Math.sin(u * 7.0 + ph) + 0.07 * Math.sin(u * 17 + ph * 2));
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        const dr = 1e-3, a2 = a + dr, r2 = R * (1 + 0.16 * Math.sin((u + dr / span) * 7.0 + ph) + 0.07 * Math.sin((u + dr / span) * 17 + ph * 2));
        const tx = Math.sin(a2) * r2 - x, tz = -Math.cos(a2) * r2 - z, tl = Math.hypot(tx, tz) || 1;
        for (const [yy, v] of [[y0, 0], [y1, 1]]) {
          pos.push(x, yy + Math.sin(u * 5 + ph) * 40, z);
          uv.push(u, v);
          nrm.push(-tz / tl, tx / tl);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      base += (n + 1) * 2;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 2));
    g.setIndex(idx);
    this.uniforms = { uTime: U.uTime, uI: { value: 0 }, uCam: { value: new THREE.Vector3() } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: AURORA_VS, fragmentShader: AURORA_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.mesh.name = 'cel:aurora';
  }
}

// ------------------------------------------------------------------------------------------------ star snow
const SNOW_VS = /* glsl */`
  uniform float uTime, uScale;
  uniform vec3 uCam, uBox;
  attribute vec4 aS;
  attribute vec4 aK;
  varying vec4 vC;
  varying float vGlint;
  void main() {
    vec3 p = aS.xyz * 2.0 * uBox;
    p.y -= uTime * aS.w;
    p.x += sin(uTime * 0.5 + aK.y * 20.0) * 1.4 + uTime * 0.35;
    p.z += cos(uTime * 0.37 + aK.y * 13.0) * 1.2;
    vec3 lo = uCam - uBox;
    vec3 w = mod(p - lo, 2.0 * uBox) + lo;
    vec3 rel = (w - uCam) / uBox;
    float edge = 1.0 - smoothstep(0.72, 1.0, max(max(abs(rel.x), abs(rel.y)), abs(rel.z)));
    vec4 mv = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    float gl = pow(0.5 + 0.5 * sin(uTime * (1.3 + aK.y * 3.0) + aK.y * 60.0), 14.0);
    vGlint = gl;
    float near = smoothstep(0.6, 2.5, -mv.z);
    gl_PointSize = clamp(aK.x * (1.0 + gl * 2.6) * uScale / max(-mv.z, 0.2), 0.0, 90.0);
    vec3 c = aK.z < 0.55 ? vec3(1.0, 1.0, 1.0) : aK.z < 0.85 ? vec3(1.0, 0.82, 0.45) : aK.z < 0.93 ? vec3(1.0, 0.6, 0.85) : vec3(0.55, 0.85, 1.0);
    vC = vec4(c * (1.0 + gl * 2.2), edge * near);
  }`;
const SNOW_FS = /* glsl */`
  uniform sampler2D uMap;
  uniform float uI;
  varying vec4 vC;
  varying float vGlint;
  void main() {
    vec2 q = gl_PointCoord;
    vec4 dot = texture2D(uMap, q * vec2(0.25, 0.5));                    // glow
    vec4 spk = texture2D(uMap, (q + vec2(1.0, 1.0)) * vec2(0.25, 0.5)); // four-point sparkle
    float a = mix(dot.a * 0.8, spk.a, clamp(vGlint * 1.6 + 0.25, 0.0, 1.0)) * vC.a * uI;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;

export class StarSnow {
  constructor(n) {
    const S = new Float32Array(n * 4), K = new Float32Array(n * 4), P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      S.set([Math.random(), Math.random(), Math.random(), 0.45 + Math.random() * 0.9], i * 4);
      K.set([0.07 + Math.random() * 0.1, Math.random(), Math.random(), 0], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(S, 4));
    g.setAttribute('aK', new THREE.BufferAttribute(K, 4));
    this.uniforms = { uTime: U.uTime, uScale: U.uScale, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(34, 16, 34) }, uMap: { value: spriteAtlas() }, uI: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SNOW_VS, fragmentShader: SNOW_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    this.points.name = 'cel:starsnow';
  }
}

// ------------------------------------------------------------------------------------------------ firefly river
const FF_VS = /* glsl */`
  uniform float uT, uScale, uFlow, uWidth, uFade;
  uniform vec3 uP0, uP1, uP2, uP3;
  attribute vec4 aS;   // entry u, lateral, vertical, seed
  attribute vec4 aR;   // rise delay, rise time, size, colour pick
  varying vec4 vC;
  vec3 bez(float u) { float v = 1.0 - u; return v*v*v*uP0 + 3.0*v*v*u*uP1 + 3.0*v*u*u*uP2 + u*u*u*uP3; }
  void main() {
    float seed = aS.w;
    float t = uT - aR.x;
    float k = clamp(t / aR.y, 0.0, 1.0);
    float e = k * k * (3.0 - 2.0 * k);
    float u = fract(aS.x + max(t - aR.y * 0.6, 0.0) * uFlow * (0.8 + seed * 0.4));
    vec3 c = bez(u);
    vec3 tg = normalize(bez(min(u + 0.01, 1.0)) - bez(max(u - 0.01, 0.0)));
    // the band faces the viewer, so the river shows its full width from anywhere
    vec3 side = normalize(cross(tg, normalize(cameraPosition - c)));
    vec3 up2 = normalize(cross(side, tg));
    float lat = aS.y + 0.18 * sin(uT * 0.6 + seed * 30.0 + u * 20.0);
    vec3 river = c + side * lat * uWidth + up2 * aS.z * uWidth * 0.35
      + vec3(sin(uT * 1.3 + seed * 50.0), sin(uT * 1.7 + seed * 20.0), cos(uT * 1.1 + seed * 40.0)) * 0.9;
    // rising: a lazy corkscrew up from the fields
    vec3 ground = position + vec3(sin(t * 1.5 + seed * 9.0) * (1.0 + e * 5.0), 0.0, cos(t * 1.5 + seed * 9.0) * (1.0 + e * 5.0));
    vec3 p = mix(ground, river, e);
    p.y += sin(e * 3.14159) * 4.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float blink = 0.55 + 0.45 * sin(uT * (2.0 + seed * 3.0) + seed * 70.0);
    float alive = smoothstep(0.0, 0.4, t) * smoothstep(0.0, 0.04, u) * smoothstep(1.0, 0.94, u) * uFade;
    vec3 col = aR.w < 0.62 ? vec3(0.72, 1.0, 0.28) : aR.w < 0.88 ? vec3(1.0, 0.78, 0.25) : vec3(0.4, 1.0, 0.85);
    vC = vec4(col * (0.8 + blink * 1.2) * (1.0 + e * 0.6), alive * (0.35 + 0.65 * blink));
    gl_PointSize = clamp(aR.z * (1.0 + e * 0.6) * uScale / max(-mv.z, 0.2), 0.0, 64.0);
  }`;
const FF_FS = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vC;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord * vec2(0.25, 0.5));
    float a = t.a * vC.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;
const FFR_VS = /* glsl */`
  uniform vec3 uP0, uP1, uP2, uP3;
  uniform float uWidth;
  varying vec2 vUv;
  vec3 bez(float u) { float v = 1.0 - u; return v*v*v*uP0 + 3.0*v*v*u*uP1 + 3.0*v*u*u*uP2 + u*u*u*uP3; }
  void main() {
    float u = uv.x;
    vec3 c = bez(u);
    vec3 tg = normalize(bez(min(u + 0.01, 1.0)) - bez(max(u - 0.01, 0.0)));
    vec3 side = normalize(cross(tg, normalize(cameraPosition - c)));
    vec3 p = c + side * (uv.y * 2.0 - 1.0) * uWidth * 1.25;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FFR_FS = /* glsl */`
  uniform float uT, uFade, uRib;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float x = vUv.y * 2.0 - 1.0;
    float prof = exp(-x * x * 3.0) * (1.0 - x * x) * (1.0 - x * x);
    float flow = n21(vec2(vUv.x * 60.0 - uT * 1.2, x * 3.0)) * 0.6 + n21(vec2(vUv.x * 150.0 - uT * 2.1, x * 6.0)) * 0.4;
    float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    vec3 col = mix(vec3(0.55, 1.0, 0.35), vec3(1.0, 0.85, 0.35), flow);
    float a = prof * (0.2 + flow * 0.55) * ends * uRib * 0.24;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`;

/** Thousands of fireflies rising from the fields into a flowing river of light across the sky (all on the GPU). */
export class FireflyRiver {
  constructor(n) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    this.uniforms = {
      uT: { value: 0 }, uScale: U.uScale, uFlow: { value: 0.035 }, uWidth: { value: 9 }, uFade: { value: 0 }, uRib: { value: 0 },
      uP0: { value: new THREE.Vector3() }, uP1: { value: new THREE.Vector3() }, uP2: { value: new THREE.Vector3() }, uP3: { value: new THREE.Vector3() },
      uMap: { value: spriteAtlas() },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: FF_VS, fragmentShader: FF_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    this.points.name = 'cel:fireflies';
    // a faint luminous stream under the swarm so the river reads as one flowing band
    const rg = new THREE.PlaneGeometry(1, 1, 160, 1);
    const uv = rg.attributes.uv;
    this.ribbon = new THREE.Mesh(rg, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: FFR_VS, fragmentShader: FFR_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    void uv;
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 5;
    this.ribbon.visible = false;
  }

  /** Lay out the swarm for a new flight: ground starts around `center` (heightAt for y) and a sky path. */
  setup(center, heightAt, radius, path) {
    const u = this.uniforms;
    [u.uP0, u.uP1, u.uP2, u.uP3].forEach((p, i) => p.value.copy(path[i]));
    const bez = t => { const v = 1 - t; return new THREE.Vector3().addScaledVector(path[0], v * v * v).addScaledVector(path[1], 3 * v * v * t).addScaledVector(path[2], 3 * v * t * t).addScaledVector(path[3], t * t * t); };
    const samples = Array.from({ length: 65 }, (_, i) => bez(i / 64));
    const g = this.points.geometry, P = g.attributes.position.array, S = g.attributes.aS.array, R = g.attributes.aR.array;
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random());
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const y = heightAt(x, z) + 0.3 + Math.random() * 1.6;
      P.set([x, y, z], i * 3);
      let best = 0, bd = 1e9;
      for (let k = 0; k < samples.length; k++) { const d = (samples[k].x - x) ** 2 + (samples[k].z - z) ** 2; if (d < bd) { bd = d; best = k; } }
      const lat = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      S.set([Math.min(0.97, best / 64 + (Math.random() - 0.5) * 0.08), lat, (Math.random() - 0.5) * 2, Math.random()], i * 4);
      R.set([Math.random() * 5.5, 4 + Math.random() * 4, 0.22 + Math.random() * 0.26, Math.random()], i * 4);
    }
    g.attributes.position.needsUpdate = true; g.attributes.aS.needsUpdate = true; g.attributes.aR.needsUpdate = true;
  }
}

export { KIND };
