import * as THREE from 'three';
import { GlowLines } from './cel-lines.js';
import { U } from './cel-sprites.js';

// Constellations of the valley's friends. Each figure is authored as line art in a 2-D box [-1, 1]^2 (x right,
// y up): strokes (polylines of star vertices), extra key stars (eyes, lamps) and soft glows (cheeks, spots).
// It is built once on the tangent plane z = -R and oriented onto the sky per show. The pen draws the strokes
// in order at a steady pace: a star pops, a glowing line grows to the next star, which pops when it arrives.

const D2R = Math.PI / 180;
/** Points along an elliptical arc (degrees, inclusive ends). */
const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / n) * D2R;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
/** A closed ring (n points, first vertex at angle `rot`). */
const ring = (cx, cy, rx, ry, n, rot = 90) => arc(cx, cy, rx, ry, rot, rot + 360 - 360 / n, n - 1);
/** The part of circle (cx, cy, r) outside circle (hx, hy, R): ears on a head. */
function outsideArc(cx, cy, r, hx, hy, R, n) {
  const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy);
  const toHead = Math.atan2(dy, dx) / D2R;
  const th = Math.acos(Math.max(-1, Math.min(1, (d * d + r * r - R * R) / (2 * d * r)))) / D2R;
  return arc(cx, cy, r, r, toHead + th, toHead + 360 - th, n);
}
const Z = (x, y, s) => [[x - s, y + s], [x + s, y + s], [x - s, y - s], [x + s, y - s]];

// colours (linear HDR)
const C = {
  star: [2.3, 2.15, 1.85], gold: [2.4, 1.65, 0.6], coral: [2.5, 0.72, 0.5], red: [2.5, 0.5, 0.45], honey: [2.4, 1.4, 0.5],
  pink: [2.5, 0.85, 1.15], orange: [2.5, 1.15, 0.35], blue: [0.8, 1.4, 2.5], ice: [1.5, 1.8, 2.5], yellow: [2.5, 2.05, 0.6],
  white: [2.3, 2.25, 2.1], mustard: [2.5, 1.75, 0.4], green: [0.8, 2.3, 0.9], violet: [1.5, 1.05, 2.5], cheek: [2.5, 0.7, 1.1],
};

/**
 * Figure definitions. strokes: { pts, closed, color, w }; stars: { p, size, color }; glows: { p, size, color, alpha }.
 * scale: angular size multiplier; color: halo tint when the figure completes.
 */
export const FIGURES = {
  // Kobo, the little red tank engine, puffing along to the right
  kobo: () => ({
    scale: 1.12, color: C.coral,
    strokes: [
      { pts: [[-0.9, -0.22], [-0.9, 0.5], [-0.42, 0.5], [-0.42, 0.28], [0.6, 0.28], ...arc(0.6, 0.03, 0.25, 0.25, 90, -90, 4).slice(1), [-0.9, -0.22]], color: C.coral },
      { pts: [[-0.98, 0.5], [-0.66, 0.62], [-0.34, 0.5]], color: C.coral },
      { pts: ring(-0.66, 0.24, 0.12, 0.1, 4, 45), closed: true, color: C.gold, w: 0.7 },
      { pts: [[0.3, 0.28], [0.28, 0.5], [0.21, 0.62], [0.53, 0.62], [0.46, 0.5], [0.44, 0.28]], color: C.coral },
      { pts: arc(-0.06, 0.28, 0.12, 0.12, 180, 0, 3), color: C.gold, w: 0.8 },
      { pts: ring(-0.6, -0.42, 0.2, 0.2, 8, 22.5), closed: true, color: C.gold },
      { pts: ring(-0.1, -0.42, 0.2, 0.2, 8, 22.5), closed: true, color: C.gold },
      { pts: ring(0.4, -0.42, 0.2, 0.2, 8, 22.5), closed: true, color: C.gold },
      { pts: [[-0.6, -0.42], [-0.1, -0.42], [0.4, -0.42]], color: C.gold, w: 0.55 },
      { pts: [[0.84, -0.22], [0.98, -0.5], [0.66, -0.5]], color: C.gold, w: 0.8 },
      { pts: [[-1.06, -0.66], [1.06, -0.66]], color: C.blue, w: 0.7 },
      { pts: ring(0.26, 0.83, 0.09, 0.08, 6), closed: true, color: C.ice, w: 0.8 },
      { pts: ring(-0.01, 0.95, 0.12, 0.1, 7), closed: true, color: C.ice, w: 0.8 },
      { pts: ring(-0.37, 1.02, 0.15, 0.11, 8), closed: true, color: C.ice, w: 0.8 },
    ],
    stars: [{ p: [0.85, 0.03], size: 16, color: [2.6, 2.2, 1.3] }],
    glows: [{ p: [0.85, 0.03], size: 70, color: [2.4, 1.6, 0.7], alpha: 0.35 }, { p: [-0.66, 0.24], size: 40, color: [2.4, 1.3, 0.5], alpha: 0.3 }],
  }),

  // Okuma: a round, sleepy bear sitting up, eyes closed, dreaming his Zzz
  bear: () => {
    const bx = -0.14, hy = 0.3, R = 0.34;
    return {
      scale: 1.0, color: C.honey,
      strokes: [
        { pts: ring(bx, hy, R, R, 12, -90), closed: true, color: C.honey },
        { pts: outsideArc(bx - 0.27, hy + 0.27, 0.12, bx, hy, R, 5), color: C.honey },
        { pts: outsideArc(bx + 0.27, hy + 0.27, 0.12, bx, hy, R, 5), color: C.honey },
        { pts: arc(bx - 0.14, hy + 0.1, 0.075, 0.06, 200, 340, 2), color: C.star, w: 0.75 },
        { pts: arc(bx + 0.14, hy + 0.1, 0.075, 0.06, 200, 340, 2), color: C.star, w: 0.75 },
        { pts: ring(bx, hy - 0.13, 0.14, 0.09, 6, 90), closed: true, color: C.honey, w: 0.8 },
        { pts: arc(bx, -0.4, 0.5, 0.44, 118, 422, 12), color: C.honey },
        { pts: ring(bx, -0.44, 0.26, 0.24, 8), closed: true, color: C.gold, w: 0.55 },
        { pts: ring(bx - 0.3, -0.83, 0.14, 0.08, 6, 0), closed: true, color: C.honey, w: 0.8 },
        { pts: ring(bx + 0.3, -0.83, 0.14, 0.08, 6, 0), closed: true, color: C.honey, w: 0.8 },
        { pts: Z(0.44, 0.66, 0.09), color: C.ice, w: 0.8 },
        { pts: Z(0.66, 0.84, 0.07), color: C.ice, w: 0.75 },
        { pts: Z(0.84, 0.98, 0.05), color: C.ice, w: 0.7 },
      ],
      stars: [{ p: [bx, hy - 0.07], size: 11, color: [2.4, 2.0, 1.6] }],
      glows: [{ p: [bx, -0.4], size: 150, color: [2.2, 1.2, 0.4], alpha: 0.12 }],
    };
  },

  // a koi leaping out of the river in a high arch, whiskers and all
  koi: () => {
    // drawn straight, then arched and tipped nose-down as it leaps
    const leap = pts => pts.map(([x, y]) => {
      const yy = y + 0.2 * (1 - (x / 0.95) ** 2), a = -0.36;
      return [x * Math.cos(a) - yy * Math.sin(a), x * Math.sin(a) + yy * Math.cos(a) + 0.12];
    });
    return {
      scale: 1.05, color: C.pink,
      strokes: [
        { pts: leap([[0.74, 0.0], [0.52, 0.19], [0.2, 0.29], [-0.15, 0.25], [-0.45, 0.1], [-0.56, 0.04]]), color: C.pink },
        { pts: leap([[0.74, 0.0], [0.52, -0.15], [0.2, -0.22], [-0.15, -0.2], [-0.45, -0.1], [-0.56, -0.04]]), color: C.pink },
        { pts: leap([[-0.56, 0.04], [-0.92, 0.3], [-0.78, 0.0], [-0.92, -0.3], [-0.56, -0.04]]), color: C.orange },
        { pts: leap([[-0.12, 0.26], [0.04, 0.47], [0.26, 0.28]]), color: C.orange, w: 0.85 },
        { pts: leap([[0.34, -0.19], [0.24, -0.4], [0.46, -0.2]]), color: C.orange, w: 0.85 },
        { pts: leap([[0.72, -0.05], [0.88, -0.2]]), color: C.star, w: 0.6 },
        { pts: leap([[0.66, -0.08], [0.76, -0.27]]), color: C.star, w: 0.6 },
        { pts: [[-0.88, -0.74], [-0.58, -0.62], [-0.28, -0.74], [0.02, -0.62], [0.32, -0.74], [0.62, -0.62], [0.9, -0.72]], color: C.blue, w: 0.85 },
      ],
      stars: [
        { p: leap([[0.54, 0.06]])[0], size: 12, color: C.white },
        { p: [0.3, -0.5], size: 8, color: C.ice }, { p: [0.55, -0.44], size: 7, color: C.ice }, { p: [0.05, -0.52], size: 7, color: C.ice },
      ],
      glows: leap([[0.2, 0.08], [-0.16, 0.02], [0.44, 0.0]]).map((p, i) => ({ p, size: [48, 38, 28][i], color: [2.5, 0.45, 0.25], alpha: 0.45 })),
    };
  },

  // Kon the shrine fox, sitting, big bushy tail curled up behind, red bib
  fox: () => ({
    scale: 1.05, color: C.orange,
    strokes: [
      { pts: [[0.0, 0.42], [0.02, 0.7], [0.1, 0.97], [0.21, 0.76], [0.34, 0.99], [0.42, 0.74], [0.6, 0.63], [0.8, 0.55], [0.58, 0.46], [0.42, 0.36]], color: C.orange },
      { pts: [[0.42, 0.36], [0.36, 0.0], [0.38, -0.56], [0.52, -0.62]], color: C.orange },
      { pts: [[0.0, 0.42], [-0.22, 0.08], [-0.32, -0.28], [-0.2, -0.6], [0.3, -0.62]], color: C.orange },
      { pts: [[-0.28, -0.5], [-0.62, -0.62], [-0.92, -0.38], [-1.0, 0.02], [-0.9, 0.4], [-0.66, 0.58], [-0.58, 0.26], [-0.52, -0.06], [-0.42, -0.28], [-0.28, -0.34]], color: C.orange },
      { pts: [[0.24, 0.35], [0.44, 0.31], [0.35, 0.13]], closed: true, color: C.red, w: 0.8 },
    ],
    stars: [
      { p: [0.52, 0.64], size: 10, color: C.white }, { p: [0.8, 0.55], size: 9, color: C.white },
      { p: [-0.74, 0.5], size: 9, color: C.white }, { p: [-0.63, 0.44], size: 7, color: C.white },
    ],
    glows: [{ p: [-0.7, 0.48], size: 46, color: [2.3, 2.2, 2.0], alpha: 0.3 }],
  }),

  // Tamo: a plump five-point star with a big smile
  tamo: () => ({
    scale: 0.92, color: C.yellow,
    strokes: [
      { pts: Array.from({ length: 10 }, (_, k) => { const a = (90 + k * 36) * D2R, r = k % 2 ? 0.46 : 1; return [Math.cos(a) * r, Math.sin(a) * r - 0.04]; }), closed: true, color: C.yellow },
      { pts: arc(0, -0.02, 0.22, 0.2, 205, 335, 4), color: C.white, w: 0.85 },
    ],
    stars: [{ p: [-0.18, 0.1], size: 16, color: C.white }, { p: [0.18, 0.1], size: 16, color: C.white }],
    glows: [{ p: [-0.36, -0.08], size: 36, color: C.cheek, alpha: 0.5 }, { p: [0.36, -0.08], size: 36, color: C.cheek, alpha: 0.5 }, { p: [0, 0], size: 170, color: [2.4, 1.7, 0.4], alpha: 0.1 }],
  }),

  // Mika in her raincoat and scarf, holding up Sora's lantern
  mika: () => ({
    scale: 1.2, color: C.mustard,
    strokes: [
      { pts: ring(0, 0.5, 0.15, 0.16, 10, -90), closed: true, color: C.star },
      { pts: arc(0, 0.5, 0.2, 0.21, -25, 205, 7), color: C.violet },
      { pts: [[-0.13, 0.31], [-0.32, -0.32], [0.32, -0.32], [0.13, 0.31]], color: C.mustard },
      { pts: [[-0.13, 0.32], [0.13, 0.32]], color: C.red, w: 0.9 },
      { pts: [[-0.1, 0.3], [-0.3, 0.24], [-0.48, 0.33], [-0.66, 0.24]], color: C.red, w: 0.9 },
      { pts: [[-0.16, 0.22], [-0.33, 0.0], [-0.4, -0.14]], color: C.mustard, w: 0.85 },
      { pts: [[0.16, 0.22], [0.34, 0.36], [0.52, 0.58], [0.52, 0.5]], color: C.mustard, w: 0.85 },
      { pts: ring(0.52, 0.36, 0.1, 0.13, 8), closed: true, color: C.gold },
      { pts: [[0.43, 0.5], [0.61, 0.5]], color: C.gold, w: 0.8 },
      { pts: [[-0.12, -0.32], [-0.12, -0.68], [-0.21, -0.7]], color: C.green, w: 0.9 },
      { pts: [[0.12, -0.32], [0.12, -0.68], [0.21, -0.7]], color: C.green, w: 0.9 },
    ],
    stars: [
      { p: [0.52, 0.36], size: 17, color: [2.7, 1.5, 0.55] }, { p: [0.14, 0.66], size: 10, color: [2.6, 2.1, 0.6] },
      { p: [-0.06, 0.52], size: 5, color: C.white }, { p: [0.06, 0.52], size: 5, color: C.white },
    ],
    glows: [{ p: [0.52, 0.36], size: 90, color: [2.5, 1.2, 0.35], alpha: 0.5 }],
  }),
};

// ------------------------------------------------------------------------------------------------ rendering
const STARS_VS = /* glsl */`
  uniform float uT, uO, uPx, uTime;
  attribute vec4 aS;   // size px, reveal time, seed, kind (0 star, 1 key star, 2 glow)
  attribute vec3 aC;
  varying vec4 vC;
  varying float vK;
  void main() {
    float k = uT - aS.y;
    if (k < 0.0 || uO < 0.003) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vK = 0.0; return; }
    float pop = 1.0 + 1.6 * sin(clamp(k / 0.45, 0.0, 1.0) * 3.14159) * step(aS.w, 1.5);
    float tw = 0.82 + 0.18 * sin(uTime * (1.7 + aS.z * 3.0) + aS.z * 50.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = aS.w > 1.5 ? smoothstep(0.0, 0.9, k) : smoothstep(0.0, 0.1, k);
    gl_PointSize = clamp(aS.x * uPx * grow * (1.0 + (pop - 1.0) * 0.55), 0.0, 480.0);
    vC = vec4(aC * tw * pop, uO);
    vK = aS.w;
  }`;
const STARS_FS = /* glsl */`
  varying vec4 vC;
  varying float vK;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    float a;
    if (vK > 1.5) { float s = 1.0 - r2; a = s * s * s * 0.5; }
    else {
      float spikes = exp(-abs(q.x) * 18.0) * (1.0 - abs(q.y)) + exp(-abs(q.y) * 18.0) * (1.0 - abs(q.x));
      a = exp(-r2 * 16.0) * 1.2 + exp(-r2 * 4.5) * 0.3 + spikes * 0.7;
    }
    a *= vC.a * (1.0 - r2);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;

/** Glowing strokes that grow from a to b between aR.x and aR.x + aR.y (figure clock uT). */
class RevealLines extends GlowLines {
  constructor(segs, opts) {
    super(segs, opts);
    const n = segs.length, R = new Float32Array(n * 8);
    segs.forEach((s, i) => { for (let k = 0; k < 4; k++) R.set([s.t0, s.dt], (i * 4 + k) * 2); });
    this.mesh.geometry.setAttribute('aR', new THREE.BufferAttribute(R, 2));
    this.uniforms.uT = { value: 0 };
    this.mat.vertexShader = this.mat.vertexShader
      .replace(/void main\(\) \{\s*vec4 a = modelViewMatrix \* vec4\(aA, 1\.0\), b = modelViewMatrix \* vec4\(aB, 1\.0\);/,
        `uniform float uT;
  attribute vec2 aR;
  void main() {
    float rk = clamp((uT - aR.x) / max(aR.y, 1e-3), 0.0, 1.0);
    vec4 a = modelViewMatrix * vec4(aA, 1.0), b = modelViewMatrix * vec4(mix(aA, aB, max(rk, 0.02)), 1.0);`)
      .replace('gl_Position = projectionMatrix * vec4(p, 1.0);', 'gl_Position = uT < aR.x ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * vec4(p, 1.0);');
    if (!this.mat.vertexShader.includes('aR.x')) throw new Error('RevealLines: GlowLines shader changed');
  }
}

/**
 * One constellation, built on the tangent plane z = -dist (so a group rotation puts it anywhere on the sky).
 * `draw` is the pen time (s) for the whole figure; `half` its angular half-size (rad).
 */
export class Constellation {
  constructor(name, { dist = 700, half = 0.19, draw = 2.4, lineWidth = 4.2 } = {}) {
    const F = FIGURES[name]();
    this.name = name;
    this.color = F.color;
    const S = Math.tan(half * (F.scale || 1)) * dist;
    const P = ([x, y]) => new THREE.Vector3(x * S, y * S, -dist);
    // the pen path: strokes in order, a short lift between strokes, key stars after the strokes
    const LIFT = 0.18, DOT = 0.2;
    let total = 0;
    const plan = [];
    for (const st of F.strokes) {
      const pts = st.closed ? [...st.pts, st.pts[0]] : st.pts;
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push({ a: pts[i], b: pts[i + 1], L }); }
      plan.push({ st, pts, segs, at: total });
      total += segs.reduce((s, x) => s + x.L, 0) + LIFT;
    }
    const keyAt = total;
    total += DOT * (F.stars?.length || 0);
    const k = draw / total;
    this.draw = draw;
    const lines = [], stars = [], seen = new Map();
    const addStar = (p, t, size = 7, color = C.star, kind = 0) => {
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
      if (seen.has(key)) return;
      seen.set(key, true);
      const v = P(p);
      stars.push({ v, t, size, color, kind });
    };
    this.path = [];   // [t0, t1, a, b] for the pen sparkle
    for (const { st, segs, at } of plan) {
      let s = at;
      if (segs.length) addStar(segs[0].a, s * k);
      for (const g of segs) {
        const a = P(g.a), b = P(g.b);
        lines.push({ a, b, color: st.color || C.gold, w: st.w ?? 1, t0: s * k, dt: g.L * k });
        this.path.push([s * k, (s + g.L) * k, a, b]);
        s += g.L;
        addStar(g.b, s * k);
      }
    }
    (F.stars || []).forEach((st, i) => addStar(st.p, (keyAt + DOT * (i + 0.5)) * k, st.size, st.color, 1));
    for (const gl of F.glows || []) stars.push({ v: P(gl.p), t: draw * 0.92, size: gl.size, color: gl.color.map(c => c * (gl.alpha ?? 0.3)), kind: 2 });
    // the figure's own halo, blooming as the last star arrives
    stars.push({ v: P([0, 0]), t: draw, size: 3.2 * S / dist * 720 / (2 * Math.tan(27.5 * D2R)), color: this.color.map((c, i) => (c * 0.4 + [1.0, 0.8, 1.7][i] * 0.6) * 0.05), kind: 2 });
    this.stars = stars;
    this.group = new THREE.Group();
    this.group.name = `cel:constellation:${name}`;
    this.lines = new RevealLines(lines, { width: lineWidth, minPx: 2.2, shimmer: 0.7, renderOrder: 4 });
    this.lines.mesh.frustumCulled = false;
    const pos = new Float32Array(stars.length * 3), aS = new Float32Array(stars.length * 4), aC = new Float32Array(stars.length * 3);
    stars.forEach((s, i) => { pos.set([s.v.x, s.v.y, s.v.z], i * 3); aS.set([s.size, s.t, Math.random(), s.kind], i * 4); aC.set(s.color, i * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
    this.su = { uT: this.lines.uniforms.uT, uO: { value: 0 }, uPx: { value: 1 }, uTime: U.uTime };
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.su, vertexShader: STARS_VS, fragmentShader: STARS_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 5;
    this.group.add(this.lines.mesh, this.pts);
    this.group.visible = false;
    this.dist = dist;
  }

  /** Point the figure at unit direction `dir` (from the viewer), upright. */
  aim(dir) {
    const c = dir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(c, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, c);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, c.clone().negate()));
  }

  /** t: figure clock (s since its pen started), o: opacity. */
  set(t, o, pxScale) {
    this.lines.uniforms.uT.value = t;
    this.lines.opacity = o;
    this.su.uO.value = o;
    this.su.uPx.value = pxScale;
    this.group.visible = o > 0.003 && t > 0;
  }

  /** Where the pen is at time t (local space), or null when it is between strokes / done. */
  pen(t, out) {
    for (const [t0, t1, a, b] of this.path) if (t >= t0 && t < t1) return out.copy(a).lerp(b, (t - t0) / (t1 - t0));
    return null;
  }
}

export const FIGURE_NAMES = Object.keys(FIGURES);
