import * as THREE from 'three';

// Sprite atlas cells (4 x 2, 128 px each). Shapes are white; particles tint them.
export const KIND = { GLOW: 0, STAR: 1, PETAL: 2, CONFETTI: 3, LEAF: 4, SPARK: 5, HEART: 6, RING: 7 };

/** Linear-space [r, g, b] from an sRGB hex colour (particle colours are linear; values > 1 bloom). */
export const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

let ATLAS = null;
/** The shared celebration sprite atlas (drawn once on a canvas; edges padded white so tints never fringe). */
export function spriteAtlas() {
  if (ATLAS) return ATLAS;
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2); fn(); g.restore(); };
  const star = (n, R, r, rot = -Math.PI / 2) => {
    g.beginPath();
    for (let k = 0; k < n * 2; k++) {
      const a = rot + k * Math.PI / n, rr = k % 2 ? r : R;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
  // 0 soft glow and the halos of 1 / 5 / 7 are added per pixel below (smooth to exactly zero at the rim:
  // canvas gradients end in a kink that shows as a hard disc once tone mapping lifts the faint tail)
  // 1 five-point star
  cell(1, () => {
    g.shadowColor = 'white'; g.shadowBlur = 10;
    star(5, C * 0.36, C * 0.16);
    g.fillStyle = 'white'; g.fill();
  });
  // 2 sakura petal: rounded, notched tip, a slightly deeper base
  cell(2, () => {
    g.rotate(Math.PI);
    g.beginPath();
    g.moveTo(0, C * 0.40);
    g.bezierCurveTo(C * 0.34, C * 0.30, C * 0.36, -C * 0.22, C * 0.10, -C * 0.40);
    g.lineTo(0, -C * 0.30);
    g.lineTo(-C * 0.10, -C * 0.40);
    g.bezierCurveTo(-C * 0.36, -C * 0.22, -C * 0.34, C * 0.30, 0, C * 0.40);
    g.closePath();
    const lg = g.createLinearGradient(0, C * 0.4, 0, -C * 0.4);
    lg.addColorStop(0, 'rgb(205,205,205)'); lg.addColorStop(0.45, 'rgb(255,255,255)'); lg.addColorStop(1, 'rgb(255,255,255)');
    g.fillStyle = lg; g.fill();
  });
  // 3 confetti strip
  cell(3, () => {
    const lg = g.createLinearGradient(-C * 0.16, 0, C * 0.16, 0);
    lg.addColorStop(0, 'rgb(215,215,215)'); lg.addColorStop(0.5, 'rgb(255,255,255)'); lg.addColorStop(1, 'rgb(225,225,225)');
    g.fillStyle = lg;
    g.beginPath(); g.roundRect(-C * 0.17, -C * 0.36, C * 0.34, C * 0.72, 5); g.fill();
  });
  // 4 maple leaf with veins
  cell(4, () => {
    g.beginPath();
    const lobes = [[0, -0.44], [0.13, -0.2], [0.42, -0.26], [0.27, -0.02], [0.4, 0.18], [0.12, 0.13], [0.03, 0.3], [-0.03, 0.3], [-0.12, 0.13], [-0.4, 0.18], [-0.27, -0.02], [-0.42, -0.26], [-0.13, -0.2]];
    lobes.forEach(([x, y], k) => { const px = x * C, py = y * C; if (k) g.lineTo(px, py); else g.moveTo(px, py); });
    g.closePath(); g.fillStyle = 'white'; g.fill();
    g.strokeStyle = 'rgb(190,190,190)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, C * 0.44); g.lineTo(0, -C * 0.36); g.moveTo(0, 0.05 * C); g.lineTo(C * 0.3, -C * 0.2); g.moveTo(0, 0.05 * C); g.lineTo(-C * 0.3, -C * 0.2);
    g.moveTo(0, 0.1 * C); g.lineTo(C * 0.3, C * 0.14); g.moveTo(0, 0.1 * C); g.lineTo(-C * 0.3, C * 0.14); g.stroke();
  });
  // 5 four-point sparkle
  cell(5, () => {
    g.shadowColor = 'white'; g.shadowBlur = 6;
    star(4, C * 0.46, C * 0.05, 0);
    g.fillStyle = 'white'; g.fill();
    star(4, C * 0.22, C * 0.04, Math.PI / 4);
    g.fill();
  });
  // 6 heart
  cell(6, () => {
    g.beginPath();
    g.moveTo(0, C * 0.34);
    g.bezierCurveTo(-C * 0.46, C * 0.02, -C * 0.3, -C * 0.4, 0, -C * 0.16);
    g.bezierCurveTo(C * 0.3, -C * 0.4, C * 0.46, C * 0.02, 0, C * 0.34);
    g.fillStyle = 'white'; g.shadowColor = 'white'; g.shadowBlur = 8; g.fill();
  });
  // procedural soft profiles
  const img = g.getImageData(0, 0, cv.width, cv.height), px = img.data;
  const soft = r => (r >= 1 ? 0 : (1 - r * r) ** 2.5 * (0.45 * Math.exp(-r * r * 14) + 0.55 * Math.exp(-r * r * 3.2)));
  const prof = {
    0: r => soft(r),
    1: r => 0.5 * soft(r * 1.05),
    5: r => 0.85 * (r >= 1 ? 0 : (1 - r * r) ** 3 * Math.exp(-r * r * 9)),
    7: r => (r >= 1 ? 0 : Math.exp(-(((r - 0.66) / 0.13) ** 2)) * (1 - r * r) ** 0.6),
  };
  for (const [cellI, fn] of Object.entries(prof)) {
    const ox = (cellI % 4) * C, oy = Math.floor(cellI / 4) * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const r = Math.hypot(x + 0.5 - C / 2, y + 0.5 - C / 2) / (C / 2 - 1);
      const i = ((oy + y) * cv.width + ox + x) * 4;
      const a = Math.round(fn(r) * 255);
      if (a > px[i + 3]) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = a; }
    }
  }
  g.putImageData(img, 0, 0);
  ATLAS = padTexture(cv);
  return ATLAS;
}

/** Canvas -> DataTexture with RGB forced white wherever alpha is 0 (no dark fringes when filtered). */
export function padTexture(cv, { mips = true } = {}) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 0) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; }
  const t = new THREE.DataTexture(new Uint8Array(px.buffer.slice(0)), cv.width, cv.height, THREE.RGBAFormat);
  t.flipY = false;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Shared per-frame uniforms: time (s) and the pixel scale (drawing-buffer px per metre at 1 m).
export const U = { uTime: { value: 0 }, uScale: { value: 800 } };

const SPRITE_VS = /* glsl */`
  uniform float uTime, uScale;
  attribute vec3 aV, aE;
  attribute vec4 aA, aB, aC, aD;
  varying vec4 vC;
  varying vec3 vR;
  varying float vKind;
  void main() {
    float age = uTime - aA.x;
    if (age < 0.0 || age > aA.y) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vR = vec3(1.0); vKind = 0.0; return; }
    float k = age / aA.y;
    float drag = aB.x;
    float f = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
    vec3 p = position + aV * f;
    float gr = aA.w;
    p.y += drag > 0.001 ? gr / drag * (f - age) : -0.5 * gr * age * age;
    float seed = aD.w;
    if (aD.x != 0.0) {
      float a = aD.x * age, c = cos(a), s = sin(a);
      vec2 d = p.xz - aE.xz;
      p.xz = aE.xz + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
    }
    p.x += sin(age * 2.7 + seed * 40.0) * aD.y;
    p.z += cos(age * 2.1 + seed * 27.0) * aD.y;
    p.y += sin(age * 3.3 + seed * 13.0) * aD.y * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = aA.z * (1.0 + aB.w * k) * smoothstep(0.0, 0.08, age);
    gl_PointSize = clamp(size * uScale / max(-mv.z, 0.2), 0.0, 480.0);
    float fade = smoothstep(0.0, min(0.18, aA.y * 0.2), age) * (1.0 - smoothstep(0.62, 1.0, k));
    float tw = 1.0 + aD.z * (pow(0.5 + 0.5 * sin(age * 8.0 + seed * 91.0), 8.0) * 2.4 - 0.25);
    vC = vec4(aC.rgb * tw, aC.a * fade);
    float ang = aB.y * age + seed * 6.2832;
    vR = vec3(cos(ang), sin(ang), cos(aB.y * 1.37 * age + seed * 17.0));
    vKind = aB.z;
  }`;

const SPRITE_FS = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vC;
  varying vec3 vR;
  varying float vKind;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    q = vec2(vR.x * q.x - vR.y * q.y, vR.y * q.x + vR.x * q.y);
    float flip = 1.0;
    if (vKind > 1.5 && vKind < 4.5) { flip = vR.z; q.x /= max(abs(flip), 0.14); }
    if (abs(q.x) > 0.5 || abs(q.y) > 0.5) discard;
    float cx = mod(vKind, 4.0), cy = floor(vKind / 4.0 + 0.01);
    vec4 t = texture2D(uMap, (vec2(q.x + 0.5, q.y + 0.5) + vec2(cx, cy)) * vec2(0.25, 0.5));
    float shade = 0.6 + 0.4 * abs(flip);
    vec4 c = vec4(vC.rgb * t.rgb * shade, vC.a * t.a);
    if (c.a < 0.008) discard;
    gl_FragColor = c;
  }`;

const _o = {};
/**
 * GPU particles with analytic motion: each particle is written once when emitted (a ring buffer with
 * sub-range uploads) and the vertex shader integrates drag, gravity, swirl, flutter, spin and fades.
 */
export class SpriteSystem {
  constructor(n, { additive = true, renderOrder = 6 } = {}) {
    this.n = n;
    this.next = 0;
    this.pending = 0;
    this.start = 0;
    const g = new THREE.BufferGeometry();
    const mk = (name, size) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.aP = mk('position', 3); this.aV = mk('aV', 3); this.aE = mk('aE', 3);
    this.aA = mk('aA', 4); this.aB = mk('aB', 4); this.aC = mk('aC', 4); this.aD = mk('aD', 4);
    for (let i = 0; i < n; i++) this.aA.array[i * 4] = -1e6;
    this.attrs = [this.aP, this.aV, this.aE, this.aA, this.aB, this.aC, this.aD];
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uScale: U.uScale, uMap: { value: spriteAtlas() } },
      vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.name = additive ? 'cel:glow' : 'cel:solid';
    this.lastBirth = -1e6;
  }

  /** p, v: {x, y, z}. o: life, size, color [r,g,b] (linear), alpha, gravity (+ falls), drag, kind, spin,
   *  grow, swirl (rad/s about the vertical axis through `center`), flutter (m), twinkle, delay (s). */
  emit(p, v, o = _o) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    if (this.pending === 0) this.start = i;
    if (this.pending < this.n) this.pending++;
    const life = o.life ?? 2;
    const birth = U.uTime.value + (o.delay ?? 0);
    this.lastBirth = Math.max(this.lastBirth, birth + life);
    let a = this.aP.array; a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z;
    a = this.aV.array; a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z;
    const c = o.center || p;
    a = this.aE.array; a[i * 3] = c.x; a[i * 3 + 1] = c.y; a[i * 3 + 2] = c.z;
    a = this.aA.array; a[i * 4] = birth; a[i * 4 + 1] = life; a[i * 4 + 2] = o.size ?? 0.3; a[i * 4 + 3] = o.gravity ?? 0;
    a = this.aB.array; a[i * 4] = o.drag ?? 0; a[i * 4 + 1] = o.spin ?? 0; a[i * 4 + 2] = o.kind ?? 0; a[i * 4 + 3] = o.grow ?? 0;
    const col = o.color || [1, 1, 1];
    a = this.aC.array; a[i * 4] = col[0]; a[i * 4 + 1] = col[1]; a[i * 4 + 2] = col[2]; a[i * 4 + 3] = o.alpha ?? 1;
    a = this.aD.array; a[i * 4] = o.swirl ?? 0; a[i * 4 + 1] = o.flutter ?? 0; a[i * 4 + 2] = o.twinkle ?? 0; a[i * 4 + 3] = Math.random();
  }

  /** Upload only what was written since the last frame. */
  flush() {
    this.points.visible = U.uTime.value < this.lastBirth + 0.1;
    if (!this.pending) return;
    const n = this.n, s = this.start, c = this.pending;
    const ranges = s + c <= n ? [[s, c]] : [[s, n - s], [0, c - (n - s)]];
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      for (const [a, b] of ranges) at.addUpdateRange(a * at.itemSize, b * at.itemSize);
      at.needsUpdate = true;
    }
    this.pending = 0;
  }
}

const GLOWPTS_VS = /* glsl */`
  uniform float uTime, uScale, uBob, uFlicker, uSizeK;
  attribute vec4 aC;
  attribute vec2 aS;
  varying vec4 vC;
  void main() {
    float seed = aS.y;
    vec3 p = position;
    p.y += sin(uTime * (0.7 + seed * 0.6) + seed * 40.0) * uBob;
    p.x += sin(uTime * (0.43 + seed * 0.3) + seed * 17.0) * uBob * 0.7;
    p.z += cos(uTime * (0.51 + seed * 0.2) + seed * 29.0) * uBob * 0.7;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fl = 1.0 + uFlicker * (sin(uTime * (5.0 + seed * 5.0) + seed * 70.0) * 0.5 + sin(uTime * 13.0 + seed * 31.0) * 0.25);
    gl_PointSize = clamp(aS.x * uSizeK * uScale / max(-mv.z, 0.2), 0.0, 400.0);
    vC = vec4(aC.rgb * fl, aC.a);
  }`;
const GLOWPTS_FS = /* glsl */`
  uniform sampler2D uMap;
  uniform float uI, uKind;
  varying vec4 vC;
  void main() {
    vec2 q = gl_PointCoord;
    float cx = mod(uKind, 4.0), cy = floor(uKind / 4.0 + 0.01);
    vec4 t = texture2D(uMap, (q + vec2(cx, cy)) * vec2(0.25, 0.5));
    float a = vC.a * t.a * uI;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC.rgb * t.rgb, a);
  }`;

/**
 * Static glowing points (halos, fairy bulbs, spirit lights, star nodes): positions, colours and sizes are
 * set once; a uniform intensity, bob and flicker animate them.
 */
export class GlowPoints {
  constructor(pts, { kind = KIND.GLOW, bob = 0, flicker = 0, intensity = 1, additive = true, renderOrder = 5, sizeK = 1 } = {}) {
    const n = pts.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), sz = new Float32Array(n * 2);
    pts.forEach((q, i) => {
      pos.set([q.x, q.y, q.z], i * 3);
      const c = q.color || [1, 1, 1];
      col.set([c[0], c[1], c[2], q.alpha ?? 1], i * 4);
      sz.set([q.size ?? 1, q.seed ?? Math.random()], i * 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(col, 4));
    g.setAttribute('aS', new THREE.BufferAttribute(sz, 2));
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += bob + 4;
    this.uniforms = {
      uTime: U.uTime, uScale: U.uScale, uMap: { value: spriteAtlas() },
      uI: { value: intensity }, uKind: { value: kind }, uBob: { value: bob }, uFlicker: { value: flicker }, uSizeK: { value: sizeK },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GLOWPTS_VS, fragmentShader: GLOWPTS_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = renderOrder;
  }
  set intensity(v) { this.uniforms.uI.value = v; this.points.visible = v > 0.003; }
  get intensity() { return this.uniforms.uI.value; }
}
