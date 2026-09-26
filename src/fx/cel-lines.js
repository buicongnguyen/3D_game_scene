import * as THREE from 'three';
import { U } from './cel-sprites.js';

const LINES_VS = /* glsl */`
  uniform float uScale, uWidth, uMinPx, uTime;
  attribute vec3 aA, aB;
  attribute vec2 aT;
  attribute vec4 aCol;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vSeed;
  void main() {
    vec4 a = modelViewMatrix * vec4(aA, 1.0), b = modelViewMatrix * vec4(aB, 1.0);
    vec3 d = b.xyz - a.xyz;
    float L = length(d);
    d /= max(L, 1e-5);
    vec3 p = mix(a.xyz, b.xyz, aT.x);
    // half width in metres: the authored width, but never thinner than uMinPx pixels on screen
    float w = max(uWidth * aCol.a, uMinPx * max(-p.z, 0.2) / uScale) * 0.5;
    vec3 side = normalize(cross(d, normalize(p)));
    p += d * (aT.x * 2.0 - 1.0) * w + side * aT.y * w * 2.0;
    gl_Position = projectionMatrix * vec4(p, 1.0);
    vUv = aT;
    vCol = aCol.rgb;
    vSeed = fract(dot(aA, vec3(0.13, 0.71, 0.37)));
  }`;
const LINES_FS = /* glsl */`
  uniform float uOpacity, uTime, uShimmer, uSolid;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vSeed;
  void main() {
    float x = vUv.y * 2.0;
    if (uSolid > 0.5) {
      // an ink stroke (normal blending): solid core, soft edge
      float ink = uOpacity * (1.0 - smoothstep(0.45, 1.1, abs(x)));
      if (ink < 0.01) discard;
      gl_FragColor = vec4(vCol, ink);
      return;
    }
    float g = exp(-x * x * 2.2);
    float core = exp(-x * x * 14.0);
    // a travelling sparkle along each stroke
    float sh = 1.0 + uShimmer * pow(0.5 + 0.5 * sin((vUv.x * 3.0 - uTime * 2.2) * 6.283 + vSeed * 40.0), 12.0) * 2.0;
    vec3 c = vCol * (g * 0.55 + core * 1.1) * sh;
    float a = uOpacity * g;
    if (a < 0.003) discard;
    gl_FragColor = vec4(c, a);
  }`;

/**
 * Glowing strokes: each segment is a camera-facing quad with a soft cross profile (additive, bloom-friendly),
 * at least `minPx` wide on screen so line art reads from far away.
 * segs: [{a: Vector3, b: Vector3, color: [r,g,b], w: width multiplier}] in local space.
 */
export class GlowLines {
  constructor(segs, { width = 0.2, minPx = 2, opacity = 1, shimmer = 0.5, renderOrder = 7, solid = false } = {}) {
    const n = segs.length;
    const A = new Float32Array(n * 12), B = new Float32Array(n * 12), T = new Float32Array(n * 8), C = new Float32Array(n * 16);
    const idx = new Uint32Array(n * 6);
    const corners = [[0, -1], [0, 1], [1, -1], [1, 1]];
    segs.forEach((s, i) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        A.set([s.a.x, s.a.y, s.a.z], v * 3);
        B.set([s.b.x, s.b.y, s.b.z], v * 3);
        T.set(corners[k], v * 2);
        const c = s.color || [1, 1, 1];
        C.set([c[0], c[1], c[2], s.w ?? 1], v * 4);
      }
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A.slice(), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 3));
    g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(T, 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(C, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += width * 4 + 2;
    this.uniforms = {
      uScale: U.uScale, uTime: U.uTime, uWidth: { value: width }, uMinPx: { value: minPx },
      uOpacity: { value: opacity }, uShimmer: { value: shimmer }, uSolid: { value: solid ? 1 : 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: LINES_VS, fragmentShader: LINES_FS,
      transparent: true, depthWrite: false, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = renderOrder;
    this.segCount = n;
  }
  set opacity(v) { this.uniforms.uOpacity.value = v; this.mesh.visible = v > 0.002; }
  get opacity() { return this.uniforms.uOpacity.value; }

  /** Move segment i (for small animated parts, e.g. a waving arm). */
  setSegment(i, a, b) {
    const g = this.mesh.geometry, A = g.attributes.aA, B = g.attributes.aB;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      A.array[v * 3] = a.x; A.array[v * 3 + 1] = a.y; A.array[v * 3 + 2] = a.z;
      B.array[v * 3] = b.x; B.array[v * 3 + 1] = b.y; B.array[v * 3 + 2] = b.z;
    }
    A.needsUpdate = true; B.needsUpdate = true;
  }
}

/** Line-art helpers: push segments for common shapes into `out`. */
export const Draw = {
  line(out, a, b, color, w) { out.push({ a: a.clone(), b: b.clone(), color, w }); },
  poly(out, pts, color, w, closed = false) {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) out.push({ a: pts[i].clone(), b: pts[(i + 1) % pts.length].clone(), color, w });
  },
  /** Circle of radius r around c in the plane spanned by unit vectors u, v. */
  circle(out, c, r, u, v, n, color, w, a0 = 0, a1 = Math.PI * 2) {
    const pts = [];
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    const m = full ? n : n + 1;
    for (let i = 0; i < m; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r));
    }
    Draw.poly(out, pts, color, w, full);
    return pts;
  },
  box(out, min, max, color, w) {
    const P = (x, y, z) => new THREE.Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
    const e = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    for (const [a, b, c, d, f, g] of e) out.push({ a: P(a, b, c), b: P(d, f, g), color, w });
  },
};
