import * as THREE from 'three';
import { U } from './cel-sprites.js';

// Starfall Night: a dense, twinkling star field (several colours and sizes), a faint milky-way band and slow
// drifting meteors, all in ONE Points draw. The stars live in camera-relative space on the far plane (like the
// sky dome), so terrain hides them and they never parallax; the sky's own cloud deck is re-evaluated per star in
// the vertex shader so clouds still cover them. Meteors: a few slots, each started on the CPU (in front of the
// viewer) and flown on the GPU along a great circle.

// the milky way lies along the great circle whose pole is this direction (same band as the sky shader's)
const BAND_N = new THREE.Vector3(0.5, 0.35, -0.8).normalize();

const VS = /* glsl */`
  uniform float uTime, uI, uPx, uR, uSkyTime, uCover, uClouds;
  uniform int uOct;
  uniform vec3 uCam, uMoon;
  uniform vec4 uMA[METEORS], uMB[METEORS];   // az, el, heading, t0 | speed (rad/s), duration, palette, -
  attribute vec4 aS;   // size (px @720p), type (0 star, 1 bright star, 2 band glow, 3 meteor), seed, twinkle
  attribute vec4 aC;   // linear rgb, alpha (meteor points: slot, trail index 0..1, count, -)
  varying vec4 vC;
  varying float vType;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0., a = .5;
    for (int i = 0; i < 6; i++) { if (i >= uOct) break; s += a * vnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; }
    return s;
  }
  void main() {
    vec3 d = position;
    float type = aS.y, seed = aS.z;
    float size = aS.x;
    vec3 col = aC.rgb;
    float a = aC.a;
    if (type > 2.5) {
      // a meteor: its slot's path (start direction, heading, speed) and start time come from uniforms
      int slot = int(aC.x + 0.5);
      vec4 A = uMA[slot], B = uMB[slot];
      float j = aC.y, tau = uTime - A.w, dur = B.y;
      if (tau < 0.0 || tau > dur) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vType = 0.0; return; }
      vec3 st = vec3(cos(A.y) * sin(A.x), sin(A.y), -cos(A.y) * cos(A.x));
      vec3 down = normalize(vec3(0.0, -1.0, 0.0) + st * st.y);
      vec3 side = normalize(cross(st, down));
      vec3 trav = normalize(down * cos(A.z) + side * sin(A.z));
      float head = B.x * tau;
      float len = min(0.24, head);
      float th = max(head - j * len, 0.0);
      d = st * cos(th) + trav * sin(th);
      float k = tau / dur;
      float env = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.6, 1.0, k));
      float fall = 1.0 - j;
      vec3 tail = B.z < 0.4 ? vec3(2.3, 0.75, 1.4) : B.z < 0.75 ? vec3(0.75, 1.35, 2.5) : vec3(2.4, 1.35, 0.4);
      col = mix(tail, vec3(2.6, 2.4, 2.0), pow(fall, 3.0));
      size = mix(4.2, 10.0, pow(fall, 5.0));
      a = env * pow(fall, 1.2);
      type = j < 0.001 ? 1.0 : 3.0;
    } else if (type < 2.5) {
      // twinkle: a slow shimmer plus, for some, a sharp glint
      float tw = 1.0 + aS.w * (sin(uTime * (1.3 + seed * 3.7) + seed * 80.0) * 0.45 + pow(0.5 + 0.5 * sin(uTime * (0.6 + seed * 1.9) + seed * 41.0), 16.0) * 1.6 - 0.2);
      col *= tw;
      size *= 1.0 + (tw - 1.0) * 0.25 * step(0.5, type);
    }
    // haze near the horizon, a little room round the moon, and the sky's own clouds in front
    float y = d.y;
    a *= smoothstep(-0.01, 0.11, y);
    a *= 1.0 - 0.85 * smoothstep(0.975, 0.997, dot(d, uMoon));
    if (uClouds > 0.5 && y > 0.0) {
      vec2 uv = d.xz / (y + 0.12) * 1.25 + vec2(uSkyTime * 0.006, uSkyTime * 0.002);
      float c = smoothstep(0.62 - uCover * 0.35, 0.86 - uCover * 0.2, fbm(uv * 1.1));
      a *= 1.0 - c * smoothstep(0.0, 0.14, y) * 0.95;
    }
    a *= uI;
    vec4 cp = projectionMatrix * viewMatrix * vec4(d * uR + uCam, 1.0);
    #ifdef USE_REVERSED_DEPTH_BUFFER
      gl_Position = vec4(cp.xy, 0.0, cp.w);
    #else
      gl_Position = cp.xyww;
    #endif
    gl_PointSize = a < 0.004 ? 0.0 : clamp(size * uPx, 0.0, 400.0);
    vC = vec4(col, a);
    vType = type;
  }`;

const FS = /* glsl */`
  varying vec4 vC;
  varying float vType;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    float a;
    if (vType < 0.5) a = exp(-r2 * 3.6);
    else if (vType < 1.5) {
      // bright star: hot core, soft halo and four thin diffraction spikes
      float spikes = exp(-abs(q.x) * 26.0) * (1.0 - abs(q.y)) + exp(-abs(q.y) * 26.0) * (1.0 - abs(q.x));
      a = exp(-r2 * 14.0) * 1.3 + exp(-r2 * 4.0) * 0.28 + spikes * 0.75;
    } else if (vType < 2.5) a = exp(-r2 * 4.0) - 0.0183;
    else a = exp(-r2 * 3.0);
    a *= vC.a * (1.0 - r2);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;

const rnd = (a, b) => a + Math.random() * (b - a);
const _f = new THREE.Vector3();
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 1.15;

/** The Starfall star field. n: stars (plus 40 % band dust, 5 % band glow, five small clusters and the meteors). */
export class StarField {
  constructor(n, meteors = 6, trail = 36) {
    const bandGlow = Math.round(n * 0.05), dust = Math.round(n * 0.4), total = n + 55 + bandGlow + dust + meteors * trail;
    const P = new Float32Array(total * 3), S = new Float32Array(total * 4), C = new Float32Array(total * 4);
    const X = new THREE.Vector3(), Yb = new THREE.Vector3(), d = new THREE.Vector3();
    X.crossVectors(BAND_N, new THREE.Vector3(0, 1, 0)).normalize();
    Yb.crossVectors(BAND_N, X).normalize();
    // several star colours (linear, pre-brightness)
    const PAL = [[1, 1, 1], [1, 1, 1], [0.78, 0.88, 1.2], [0.78, 0.88, 1.2], [1.25, 1.0, 0.62], [1.25, 1.0, 0.62], [1.25, 0.72, 1.0], [0.62, 1.08, 1.2], [1.05, 0.85, 1.3]];
    let i = 0;
    const put = (dir, size, type, tw, col, alpha) => {
      P.set([dir.x, dir.y, dir.z], i * 3);
      S.set([size, type, Math.random(), tw], i * 4);
      C.set([col[0], col[1], col[2], alpha], i * 4);
      i++;
    };
    const bandDir = spread => {
      const th = Math.random() * Math.PI * 2;
      return d.copy(X).multiplyScalar(Math.cos(th)).addScaledVector(Yb, Math.sin(th)).addScaledVector(BAND_N, gauss() * spread).normalize();
    };
    const clusters = Array.from({ length: 5 }, () => {
      const az = rnd(0, Math.PI * 2), el = rnd(0.45, 1.25);
      return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    });
    for (let k = 0; k < n; k++) {
      const r = Math.random();
      if (r < 0.4) { bandDir(0.085); if (d.y < -0.05) d.y = -d.y; }
      else {
        // uniform over the sky, a little denser toward the zenith than the horizon haze
        const u = Math.random() * 1.05 - 0.05, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        d.set(Math.cos(th) * s, u, Math.sin(th) * s);
      }
      const m = Math.random();
      const big = m > 0.972;
      const size = big ? rnd(5.5, 10) : 2.4 + 3.2 * Math.pow(Math.random(), 4);
      const col = PAL[Math.floor(Math.random() * PAL.length)];
      const bright = big ? rnd(1.8, 2.6) : 0.62 + Math.pow(Math.random(), 2.2) * 1.5;
      put(d, size, big ? 1 : 0, big ? rnd(0.6, 1) : rnd(0.15, 0.9), col.map(v => v * bright), 1);
    }
    // a few tight star clusters of blue-white stars (the valley's own Pleiades)
    for (const c of clusters) for (let k = 0; k < 11; k++) {
      d.copy(c).add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.012)).normalize();
      const b = k < 6 ? rnd(1.6, 2.2) : rnd(0.7, 1.1);
      put(d, k < 6 ? rnd(3.4, 4.6) : 2.6, 0, rnd(0.3, 0.8), [0.8 * b, 0.92 * b, 1.3 * b], 1);
    }
    // the milky way itself: big faint puffs of violet, blue and rose light along the band
    const GLOWC = [[0.42, 0.42, 1.0], [0.35, 0.52, 1.0], [0.75, 0.42, 0.95], [0.5, 0.58, 1.0], [0.95, 0.55, 0.75], [0.4, 0.75, 0.9]];
    for (let k = 0; k < bandGlow; k++) {
      bandDir(0.055);
      if (d.y < -0.02) d.y = -d.y;
      put(d, rnd(60, 170), 2, 0, GLOWC[k % GLOWC.length], rnd(0.022, 0.05));
    }
    // star dust: a fine grain of faint stars packed into the band
    for (let k = 0; k < dust; k++) {
      bandDir(0.05);
      if (d.y < -0.02) d.y = -d.y;
      const c = PAL[k % PAL.length];
      put(d, rnd(2.2, 2.8), 0, rnd(0, 0.5), [c[0] * 0.55, c[1] * 0.55, c[2] * 0.7], rnd(0.5, 1));
    }
    // meteors: `trail` points each (the vertex shader places them)
    for (let m = 0; m < meteors; m++) for (let j = 0; j < trail; j++) {
      P.set([0, 1, 0], i * 3);
      S.set([0, 3, Math.random(), 0], i * 4);
      C.set([m, j / (trail - 1), trail, 0], i * 4);
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(S, 4));
    g.setAttribute('aC', new THREE.BufferAttribute(C, 4));
    this.uniforms = {
      uTime: U.uTime, uI: { value: 0 }, uPx: { value: 1 }, uR: { value: 1500 }, uCam: { value: new THREE.Vector3() },
      uMoon: { value: new THREE.Vector3(-0.45, 0.62, 0.52).normalize() },
      uSkyTime: { value: 0 }, uCover: { value: 0.45 }, uClouds: { value: 0 }, uOct: { value: 4 },
      uMA: { value: Array.from({ length: Math.max(1, meteors) }, () => new THREE.Vector4(0, 1, 0, -1e6)) },
      uMB: { value: Array.from({ length: Math.max(1, meteors) }, () => new THREE.Vector4(0.2, 1, 0, 0)) },
    };
    this.slots = Array.from({ length: meteors }, (_, i) => ({ next: 1.5 + i * 1.7 + Math.random() * 2 }));
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, defines: { METEORS: Math.max(1, meteors) },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.points.visible = false;
    this.points.name = 'cel:starfall';
    this.count = total;
  }

  /** Per frame: intensity, the camera, and the sky (moon + clouds) so stars sit behind the cloud deck. */
  update(I, camera, sky, pxScale) {
    const u = this.uniforms;
    u.uI.value = I;
    this.points.visible = I > 0.003;
    if (!this.points.visible) return;
    u.uCam.value.copy(camera.position);
    u.uPx.value = pxScale;
    // meteors: a free slot starts a new one above and around where the camera looks; it stays put in the sky
    const now = U.uTime.value;
    camera.getWorldDirection(_f);
    const yaw = Math.atan2(_f.x, -_f.z), pitch = Math.asin(Math.max(-1, Math.min(1, _f.y)));
    this.slots.forEach((sl, i) => {
      if (now < sl.next) return;
      if (now - sl.next > 3) { sl.next = now + 0.6 + i * 1.4 + Math.random() * 1.5; return; }   // just switched on: stagger
      const dur = rnd(2.0, 3.2);
      u.uMA.value[i].set(yaw + rnd(-0.75, 0.75), Math.max(0.3, Math.min(1.35, pitch + rnd(0.05, 0.4))), rnd(-1.0, 1.0), now);
      u.uMB.value[i].set(rnd(0.15, 0.24), dur, Math.random(), 0);
      sl.next = now + dur + rnd(3, 11);
    });
    u.uR.value = Math.min(1500, camera.far * 0.5);
    const su = sky?.uniforms;
    if (su) {
      u.uMoon.value.copy(su.uMoonDir.value).normalize();
      u.uSkyTime.value = su.uTime.value;
      u.uCover.value = su.uCover.value;
      u.uOct.value = su.uOct.value;
      u.uClouds.value = 1;
    } else u.uClouds.value = 0;
  }
}
