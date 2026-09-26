import * as THREE from 'three';
import { SpriteSystem, padTexture, U, spriteAtlas } from './cel-sprites.js';

// Small magic for the star-tree and Sora's music box: a music-note sprite system (its own atlas, notes stay
// upright and only sway) and a looping cloud of drifting golden motes, animated entirely on the GPU.

/** Note atlas, same 4 x 2 layout as the celebration atlas. Cells: 0 eighth, 1 beamed pair, 5 quarter, 6 beamed sixteenths, 7 heart-note. */
export const NOTE = { EIGHTH: 0, PAIR: 1, QUARTER: 5, SIXTEENTH: 6, CLEF: 7 };
let NOTES = null;
export function noteAtlas() {
  if (NOTES) return NOTES;
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2); fn(); g.restore(); };
  const head = (x, y, s = 1) => { g.save(); g.translate(x, y); g.rotate(-0.42); g.beginPath(); g.ellipse(0, 0, 15 * s, 10.5 * s, 0, 0, Math.PI * 2); g.fill(); g.restore(); };
  const stem = (x, y0, y1) => { g.fillRect(x - 3, y1, 6, y0 - y1); };
  const draw = fn => { g.fillStyle = 'white'; g.shadowColor = 'white'; g.shadowBlur = 9; fn(); g.shadowBlur = 0; fn(); };
  // eighth note with a curling flag
  cell(0, () => draw(() => {
    head(-8, 30); stem(4, 28, -44);
    g.beginPath(); g.moveTo(1, -44); g.bezierCurveTo(10, -30, 34, -24, 26, 2); g.bezierCurveTo(26, -14, 14, -20, 1, -24); g.closePath(); g.fill();
  }));
  // two beamed eighths
  cell(1, () => draw(() => {
    head(-26, 34); head(22, 24);
    stem(-14, 32, -36); stem(34, 22, -46);
    g.beginPath(); g.moveTo(-17, -36); g.lineTo(37, -48); g.lineTo(37, -34); g.lineTo(-17, -22); g.closePath(); g.fill();
  }));
  // quarter note
  cell(5, () => draw(() => { head(-6, 30, 1.1); stem(7, 27, -44); }));
  // two beamed sixteenths
  cell(6, () => draw(() => {
    head(-26, 34); head(22, 24);
    stem(-14, 32, -36); stem(34, 22, -46);
    g.beginPath(); g.moveTo(-17, -36); g.lineTo(37, -48); g.lineTo(37, -37); g.lineTo(-17, -25); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-17, -20); g.lineTo(37, -32); g.lineTo(37, -21); g.lineTo(-17, -9); g.closePath(); g.fill();
  }));
  // a heart-shaped note head on a stem with a flag (a love song)
  cell(7, () => draw(() => {
    g.save(); g.translate(-8, 30); g.rotate(-0.3); g.scale(0.62, 0.62);
    g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-34, 0, -22, -30, 0, -12); g.bezierCurveTo(22, -30, 34, 0, 0, 22); g.fill(); g.restore();
    stem(6, 24, -44);
    g.beginPath(); g.moveTo(3, -44); g.bezierCurveTo(12, -30, 36, -24, 28, 2); g.bezierCurveTo(28, -14, 16, -20, 3, -24); g.closePath(); g.fill();
  }));
  NOTES = padTexture(cv);
  return NOTES;
}

/** Music notes: a SpriteSystem on the note atlas whose `spin` is a sway amplitude (rad) instead of a spin rate. */
export class NoteSystem extends SpriteSystem {
  constructor(n) {
    super(n, { additive: true, renderOrder: 8 });
    this.mat.uniforms.uMap.value = noteAtlas();
    const vs = this.mat.vertexShader.replace('float ang = aB.y * age + seed * 6.2832;', 'float ang = aB.y * sin(age * 2.2 + seed * 30.0);');
    if (vs === this.mat.vertexShader) throw new Error('NoteSystem: sprite shader changed');
    this.mat.vertexShader = vs;
    this.points.name = 'cel:notes';
  }
}

// ------------------------------------------------------------------------------------------------ mote cloud
const MOTE_VS = /* glsl */`
  uniform float uTime, uScale, uH, uI;
  attribute vec4 aM;   // angle, radius, rise speed (m/s), phase
  attribute vec4 aK;   // size, orbit speed, colour pick, seed
  varying vec4 vC;
  varying float vSpark;
  void main() {
    float seed = aK.w;
    float y = fract(aM.w + uTime * aM.z / uH);
    float ang = aM.x + uTime * aK.y + sin(uTime * 0.4 + seed * 20.0) * 0.3;
    float r = aM.y * (1.0 + 0.25 * sin(uTime * 0.7 + seed * 30.0)) * (0.75 + 0.35 * y);
    vec3 p = position + vec3(cos(ang) * r, y * uH, sin(ang) * r);
    p.x += sin(uTime * 1.3 + seed * 50.0) * 0.03 * uH;
    p.z += cos(uTime * 1.1 + seed * 40.0) * 0.03 * uH;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.62, 1.0, y));
    float tw = 0.7 + 0.3 * sin(uTime * (2.0 + seed * 4.0) + seed * 70.0);
    float glint = pow(0.5 + 0.5 * sin(uTime * (0.9 + seed * 1.3) + seed * 91.0), 14.0);
    vec3 col = aK.z < 0.62 ? vec3(2.2, 1.55, 0.55) : aK.z < 0.82 ? vec3(2.3, 2.0, 1.4) : aK.z < 0.92 ? vec3(2.2, 0.9, 1.4) : vec3(1.0, 1.4, 2.4);
    vC = vec4(col * (tw + glint * 1.6), fade * uI);
    vSpark = glint;
    gl_PointSize = uI < 0.003 ? 0.0 : clamp(aK.x * (1.0 + glint * 1.4) * uScale / max(-mv.z, 0.2), 0.0, 160.0);
  }`;
const MOTE_FS = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vC;
  varying float vSpark;
  void main() {
    vec2 q = gl_PointCoord;
    vec4 dot = texture2D(uMap, q * vec2(0.25, 0.5));
    vec4 spk = texture2D(uMap, (q + vec2(1.0, 1.0)) * vec2(0.25, 0.5));
    float a = mix(dot.a, spk.a, clamp(vSpark * 1.5 + 0.2, 0.0, 1.0)) * vC.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;

/** A loop of golden motes drifting up and around a trunk (cylinder radius x height), no CPU work per frame. */
export class MoteCloud {
  constructor(n, radius = 3.5, height = 7, sizeK = 1) {
    const P = new Float32Array(n * 3), M = new Float32Array(n * 4), K = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      M.set([Math.random() * Math.PI * 2, radius * (0.25 + 0.75 * Math.sqrt(Math.random())), 0.25 + Math.random() * 0.45, Math.random()], i * 4);
      K.set([(0.13 + Math.random() * 0.17) * sizeK, (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.22), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aM', new THREE.BufferAttribute(M, 4));
    g.setAttribute('aK', new THREE.BufferAttribute(K, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), Math.hypot(radius * 1.5, height / 2) + 1);
    this.uniforms = { uTime: U.uTime, uScale: U.uScale, uH: { value: height }, uI: { value: 0 }, uMap: { value: spriteAtlas() } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: MOTE_VS, fragmentShader: MOTE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = 6;
    this.points.name = 'cel:motes';
  }
  set intensity(v) { this.uniforms.uI.value = v; this.points.visible = v > 0.003; }
  get intensity() { return this.uniforms.uI.value; }
  dispose() { this.points.geometry.dispose(); this.mat.dispose(); }
}
