import * as THREE from 'three';
import { U, padTexture } from './cel-sprites.js';

// ------------------------------------------------------------------------------------------------ butterflies
function wingTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  // hinge on the left edge (u = 0), fore wing on top (v = 0), hind wing below
  const wing = () => {
    g.beginPath();
    g.moveTo(2, 58);
    g.bezierCurveTo(10, 10, 70, -6, 120, 14);
    g.bezierCurveTo(128, 36, 104, 58, 78, 62);
    g.bezierCurveTo(104, 70, 112, 104, 84, 120);
    g.bezierCurveTo(56, 128, 16, 100, 2, 70);
    g.closePath();
  };
  wing();
  const rg = g.createRadialGradient(10, 62, 4, 30, 62, 118);
  rg.addColorStop(0, 'rgb(255,255,255)'); rg.addColorStop(0.62, 'rgb(250,250,250)'); rg.addColorStop(0.8, 'rgb(150,150,150)'); rg.addColorStop(0.86, 'rgb(46,40,40)'); rg.addColorStop(1, 'rgb(36,30,30)');
  g.fillStyle = rg; g.fill();
  g.save(); wing(); g.clip();
  // veins
  g.strokeStyle = 'rgba(60,50,50,0.55)'; g.lineWidth = 2;
  for (const [x, y] of [[118, 16], [110, 40], [80, 60], [100, 96], [70, 118], [40, 112]]) { g.beginPath(); g.moveTo(4, 62); g.quadraticCurveTo((x + 4) / 2, (y + 62) / 2 + 6, x, y); g.stroke(); }
  // white dots in the dark rim
  g.fillStyle = 'rgb(255,255,255)';
  for (const [x, y, r] of [[112, 22, 3.2], [118, 34, 2.6], [102, 12, 2.4], [96, 112, 2.6], [84, 118, 2.2], [104, 100, 2.4]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // a golden eye-spot on the hind wing
  g.fillStyle = 'rgb(255,255,255)'; g.beginPath(); g.arc(66, 94, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgb(70,60,60)'; g.beginPath(); g.arc(66, 94, 5, 0, Math.PI * 2); g.fill();
  g.restore();
  return padTexture(cv);
}

const BF_VS = /* glsl */`
  uniform float uTime;
  attribute vec3 aW;     // side (-1 left, +1 right, 0 body), u, v
  attribute vec4 aF;     // phase, flap speed, alpha, glow
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAlpha, vGlow, vBody, vShade;
  void main() {
    float fl = sin(uTime * aF.y + aF.x);
    float ang = (fl * 0.5 + 0.5) * 1.45 - 0.3;
    vec3 p = position;
    float r = abs(p.x);
    if (aW.x != 0.0) { p.x = aW.x * r * cos(ang); p.y = r * sin(ang); }
    vUv = aW.yz;
    vBody = aW.x == 0.0 ? 1.0 : 0.0;
    vTint = instanceColor;
    vAlpha = aF.z;
    vGlow = aF.w;
    vShade = 0.72 + 0.28 * cos(ang);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const BF_FS = /* glsl */`
  uniform sampler2D uWing;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAlpha, vGlow, vBody, vShade;
  void main() {
    vec4 t = vBody > 0.5 ? vec4(0.16, 0.1, 0.08, 1.0) : texture2D(uWing, vUv);
    if (t.a < 0.5 || vAlpha < 0.02) discard;
    vec3 base = vBody > 0.5 ? t.rgb : vTint * t.rgb;
    float lum = dot(t.rgb, vec3(0.33));
    vec3 col = base * vShade + vTint * lum * vGlow;
    gl_FragColor = vec4(col, vAlpha);
  }`;

/** Instanced flapping butterflies (two hinged wing quads + a body sliver each), placed by the CPU. */
export class Butterflies {
  constructor(n) {
    this.n = n;
    const pos = [], w = [], idx = [];
    const quad = (pts, ws) => { const b = pos.length / 3; pts.forEach(p => pos.push(...p)); ws.forEach(x => w.push(...x)); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    // left wing: x -1..0, right wing 0..1; z forward (fore wing at +z)
    quad([[0, 0, 0.62], [-1, 0, 0.62], [-1, 0, -0.62], [0, 0, -0.62]], [[-1, 0, 0], [-1, 1, 0], [-1, 1, 1], [-1, 0, 1]]);
    quad([[0, 0, 0.62], [1, 0, 0.62], [1, 0, -0.62], [0, 0, -0.62]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]);
    quad([[0, -0.05, 0.42], [0, 0.05, 0.42], [0, 0.05, -0.5], [0, -0.05, -0.5]], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    quad([[-0.04, 0, 0.42], [0.04, 0, 0.42], [0.04, 0, -0.5], [-0.04, 0, -0.5]], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 3));
    g.setIndex(idx);
    this.aF = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aF.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aF', this.aF);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uWing: { value: wingTexture() } },
      vertexShader: BF_VS, fragmentShader: BF_FS, side: THREE.DoubleSide, transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'cel:butterflies';
  }
}

// ------------------------------------------------------------------------------------------------ bubbles
const BUB_VS = /* glsl */`
  varying vec3 vN, vV;
  varying vec3 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vP = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const BUB_FS = /* glsl */`
  uniform float uTime, uA;
  varying vec3 vN, vV, vP;
  vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), vV));
    float rim = pow(f, 2.2);
    // thin-film shimmer: hue from view angle and swirling bands
    float h = fract(f * 1.3 + vP.y * 0.35 + sin(vP.x * 3.0 + uTime * 0.8) * 0.12 + uTime * 0.05);
    vec3 film = hsv(h, 0.55, 1.0);
    vec3 gold = vec3(1.0, 0.8, 0.35);
    // two soft window highlights
    vec3 L = normalize(vec3(-0.4, 0.8, 0.45));
    float spec = pow(max(dot(reflect(-vV, normalize(vN)), L), 0.0), 60.0) * 2.5;
    vec3 col = mix(gold * 0.35, film, rim) * (0.25 + rim * 1.4) + vec3(spec);
    float a = (0.06 + rim * 0.75 + spec * 0.5) * uA;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

export function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uA: { value: 1 } }, vertexShader: BUB_VS, fragmentShader: BUB_FS,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
}

// ------------------------------------------------------------------------------------------------ ripples
const RIP_VS = /* glsl */`
  uniform float uTime;
  attribute vec4 aR;     // birth, life, radius, strength
  varying vec2 vQ;
  varying float vK, vS;
  void main() {
    float k = clamp((uTime - aR.x) / aR.y, 0.0, 1.0);
    vK = (uTime < aR.x || uTime > aR.x + aR.y) ? -1.0 : k;
    vS = aR.w;
    vQ = position.xz * 2.0;
    vec3 p = position * aR.z * (0.15 + 0.85 * (1.0 - pow(1.0 - k, 2.0)));
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const RIP_FS = /* glsl */`
  varying vec2 vQ;
  varying float vK, vS;
  void main() {
    if (vK < 0.0) discard;
    float r = length(vQ);
    float ring = exp(-pow((r - 0.8) / 0.07, 2.0)) + 0.5 * exp(-pow((r - 0.55) / 0.06, 2.0)) * (1.0 - vK);
    float a = ring * (1.0 - vK) * (1.0 - vK) * vS * smoothstep(1.0, 0.9, r);
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(0.85, 0.97, 1.0) * 1.3, a);
  }`;

/** Expanding rings on the water (splash-downs), a small instanced pool. */
export class Ripples {
  constructor(n = 32) {
    this.n = n;
    this.next = 0;
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.aR = new THREE.InstancedBufferAttribute(new Float32Array(n * 4).fill(-1e6), 4);
    this.aR.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aR', this.aR);
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime }, vertexShader: RIP_VS, fragmentShader: RIP_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'cel:ripples';
    this.m = new THREE.Matrix4();
  }

  emit(x, y, z, radius = 3, life = 1.4, strength = 0.8) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    this.mesh.setMatrixAt(i, this.m.makeTranslation(x, y, z));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aR.array.set([U.uTime.value, life, radius * 2, strength], i * 4);
    this.aR.needsUpdate = true;
  }
}
