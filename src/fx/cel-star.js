import * as THREE from 'three';
import { U, spriteAtlas } from './cel-sprites.js';
import { GlowLines } from './cel-lines.js';

// Petal star: petals swirl up into a giant glowing five-point star, hold, then stream away. Every particle
// follows keyframes evaluated in the vertex shader (start -> star point -> destination), so the CPU only
// writes the layout once per show.

const STAR_VS = /* glsl */`
  uniform float uT, uT1, uT2, uT3, uScale, uGlowK;
  uniform vec3 uCenter;
  attribute vec3 aStar, aEnd;
  attribute vec4 aT;   // rise delay, depart delay, seed, size
  attribute vec3 aCol;
  varying vec4 vC;
  varying vec2 vRot;
  void main() {
    float seed = aT.z;
    float tr = clamp((uT - aT.x) / uT1, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - tr, 3.0);
    vec3 base = mix(position, aStar, e);
    float ang = (1.0 - e) * (5.0 + seed * 4.0);
    vec2 d = base.xz - uCenter.xz;
    float c = cos(ang), s = sin(ang);
    base.xz = uCenter.xz + vec2(c * d.x - s * d.y, s * d.x + c * d.y) * (1.0 + (1.0 - e) * 0.5);
    base.y += sin(e * 3.14159) * 4.0;
    base += vec3(sin(uT * 2.1 + seed * 50.0), cos(uT * 1.7 + seed * 30.0), sin(uT * 1.3 + seed * 20.0)) * 0.12 * e;
    base = uCenter + (base - uCenter) * (1.0 + 0.035 * sin(uT * 2.6) * e);
    float td = clamp((uT - uT2 - aT.y) / uT3, 0.0, 1.0);
    float f = td * td * (3.0 - 2.0 * td);
    vec3 ctrl = mix(aStar, aEnd, 0.5) + vec3(0.0, 10.0 + seed * 12.0, 0.0);
    vec3 q = mix(mix(aStar, ctrl, f), mix(ctrl, aEnd, f), f);
    vec3 p = td > 0.0 ? q + (base - aStar) * (1.0 - f) : base;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float alive = smoothstep(0.0, 0.15, tr) * (1.0 - smoothstep(0.82, 1.0, td)) * step(0.0, uT - aT.x);
    float glow = 1.0 + uGlowK * e * (1.0 - f * 0.4);
    vC = vec4(aCol * glow, alive);
    gl_PointSize = clamp(aT.w * (1.0 - 0.4 * f) * uScale / max(-mv.z, 0.2), 0.0, 200.0);
    float r = uT * (2.0 + seed * 5.0) * (1.0 - e * 0.7) + seed * 6.28;
    vRot = vec2(cos(r), sin(r));
  }`;
const STAR_FS = /* glsl */`
  uniform sampler2D uMap;
  uniform float uKind;
  varying vec4 vC;
  varying vec2 vRot;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    q = vec2(vRot.x * q.x - vRot.y * q.y, vRot.y * q.x + vRot.x * q.y);
    if (abs(q.x) > 0.5 || abs(q.y) > 0.5) discard;
    float cx = mod(uKind, 4.0), cy = floor(uKind / 4.0 + 0.01);
    vec4 t = texture2D(uMap, (q + 0.5 + vec2(cx, cy)) * vec2(0.25, 0.5));
    float a = t.a * vC.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC.rgb * t.rgb, a);
  }`;

function starOutline(R, r) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R;
    pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
  }
  return pts;
}

function inStar(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export class PetalStar {
  constructor(nPetals, nSparks) {
    this.uniforms = {
      uT: { value: 0 }, uT1: { value: 3.2 }, uT2: { value: 6.4 }, uT3: { value: 2.8 }, uScale: U.uScale,
      uCenter: { value: new THREE.Vector3() }, uMap: { value: spriteAtlas() }, uGlowK: { value: 1.6 },
    };
    const mk = (n, kind, additive, glowK) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aStar', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uKind: { value: kind }, uGlowK: { value: glowK } }, vertexShader: STAR_VS, fragmentShader: STAR_FS,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = additive ? 7 : 6;
      p.visible = false;
      return p;
    };
    this.petals = mk(nPetals, 2, false, 0.22);
    this.sparks = mk(nSparks, 1, true, 0.8);
    // the star outline (unit star in the XY plane; positioned per show)
    const pts = starOutline(1, 0.42);
    this.unit = pts;
    const segs = [];
    for (let i = 0; i < 10; i++) segs.push({ a: pts[i], b: pts[(i + 1) % 10], color: [2.5, 1.45, 0.45], w: 1 });
    // inner rays from the centre to each tip
    for (let i = 0; i < 10; i += 2) segs.push({ a: new THREE.Vector3(0, 0, 0), b: pts[i].clone().multiplyScalar(0.8), color: [1.8, 0.6, 1.0], w: 0.5 });
    this.outline = new GlowLines(segs, { width: 0.05, minPx: 2.5, shimmer: 1.2 });
    this.outline.opacity = 0;
    this.group = new THREE.Group();
    this.group.name = 'cel:petalstar';
    this.group.add(this.petals, this.sparks, this.outline.mesh);
  }

  /** Lay out a show: petals rise from around `ground` (heightAt), form a star (centre, radius, facing `normal`), fly to `end`. */
  setup({ center, radius, normal, end, heightAt, from, spread }) {
    const u = this.uniforms;
    u.uCenter.value.copy(center);
    for (const pts of [this.petals, this.sparks]) pts.material.uniforms.uCenter.value.copy(center);
    const n = normal.clone().setY(0).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const outline = this.unit.map(p => p.clone().multiplyScalar(radius));
    const toWorld = (x, y) => center.clone().addScaledVector(right, x).addScaledVector(up, y);
    const endDir = end.clone().sub(center);
    const fill = (points, pinks) => {
      const g = points.geometry, n0 = g.attributes.position.count;
      const P = g.attributes.position.array, A = g.attributes.aStar.array, E = g.attributes.aEnd.array, T = g.attributes.aT.array, C = g.attributes.aCol.array;
      for (let i = 0; i < n0; i++) {
        let x, y;
        if (Math.random() < 0.7) {
          const k = Math.floor(Math.random() * 10), t = Math.random();
          const a = outline[k], b = outline[(k + 1) % 10];
          x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t;
          x += (Math.random() - 0.5) * radius * 0.05; y += (Math.random() - 0.5) * radius * 0.05;
        } else {
          do { x = (Math.random() * 2 - 1) * radius; y = (Math.random() * 2 - 1) * radius; } while (!inStar(x, y, outline));
        }
        const s = toWorld(x, y);
        A.set([s.x, s.y, s.z], i * 3);
        const ang = Math.random() * Math.PI * 2, rr = spread * (0.35 + 0.65 * Math.sqrt(Math.random()));
        const gx = from.x + Math.cos(ang) * rr, gz = from.z + Math.sin(ang) * rr;
        P.set([gx, heightAt(gx, gz) + 0.3 + Math.random() * 2.5, gz], i * 3);
        E.set([end.x + (Math.random() - 0.5) * 3, end.y + (Math.random() - 0.5) * 3, end.z + (Math.random() - 0.5) * 3], i * 3);
        // departure order: points nearest the destination leave first
        const along = s.clone().sub(center).dot(endDir) / (endDir.length() * radius || 1);
        T.set([Math.random() * 1.2 + (1 - Math.min(1, Math.hypot(x, y) / radius)) * 0.4, (1 - along) * 0.6 + Math.random() * 0.5, Math.random(), pinks ? 0.5 + Math.random() * 0.35 : 0.5 + Math.random() * 0.6], i * 4);
        const c = pinks ? pinks[Math.floor(Math.random() * pinks.length)] : [[2.3, 1.35, 0.35], [2.4, 1.9, 1.0], [2.3, 0.75, 1.3]][i % 3];
        C.set(c, i * 3);
      }
      for (const k of ['position', 'aStar', 'aEnd', 'aT', 'aCol']) g.attributes[k].needsUpdate = true;
      points.visible = true;
    };
    fill(this.petals, [[1.1, 0.16, 0.42], [1.1, 0.3, 0.58], [1.05, 0.45, 0.7], [1.1, 0.1, 0.32], [1.05, 0.62, 0.8], [1.0, 0.22, 0.5]]);
    fill(this.sparks, null);
    this.outline.mesh.position.copy(center);
    this.outline.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    this.outline.mesh.scale.setScalar(radius);
    this.outline.uniforms.uWidth.value = 0.75;
  }

  set t(v) {
    this.uniforms.uT.value = v;
    for (const pts of [this.petals, this.sparks]) pts.material.uniforms.uT.value = v;
  }
}
