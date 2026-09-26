import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U } from './cel-sprites.js';

// Kodama: little white forest spirits. Procedural (no model budget): a lumpy gourd head with three dark
// holes for a face, a tiny body with stubby arms, a soft inner glow and the famous head rattle.

function headGeometry() {
  const g = new THREE.SphereGeometry(0.5, 28, 20);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    // gourd: wider low cheeks, a slightly pinched, lopsided crown
    const lump = 1 + 0.07 * Math.sin(n.x * 5.1 + 1.3) * Math.cos(n.z * 4.3) + 0.05 * Math.sin(n.y * 7 + n.x * 3);
    const cheeks = 1 + 0.1 * Math.max(0, -n.y + 0.2) * (1 - Math.abs(n.y));
    v.x *= 1.0 * cheeks * lump; v.z *= 0.9 * cheeks * lump; v.y *= 0.86 * lump;
    v.y += 0.04 * n.x;  // a little lopsided
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(1), 1));
  return g;
}

function bodyGeometry() {
  const prof = [[0.0, 0.0], [0.13, 0.0], [0.17, 0.05], [0.18, 0.14], [0.15, 0.24], [0.11, 0.31], [0.08, 0.35], [0.0, 0.36]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(prof, 16);
  const parts = [body];
  for (const s of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.035, 0.12, 3, 6);
    arm.rotateZ(s * 0.9);
    arm.translate(s * 0.17, 0.22, 0.02);
    parts.push(arm);
    const leg = new THREE.CapsuleGeometry(0.045, 0.05, 3, 6);
    leg.translate(s * 0.07, 0.02, 0);
    parts.push(leg);
  }
  const g = mergeGeometries(parts.map(q => { const x = q.index ? q.toNonIndexed() : q; x.deleteAttribute('uv'); return x; }));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(0), 1));
  g.computeVertexNormals();
  return g;
}

const K_VS = /* glsl */`
  attribute float aFace;
  attribute vec4 aK;     // alpha, glow, eye size, seed
  varying vec3 vN, vObj, vV;
  varying vec4 vK;
  varying float vFace;
  void main() {
    vObj = position;
    vFace = aFace;
    vK = aK;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const K_FS = /* glsl */`
  uniform vec3 uL, uLc, uSky;
  uniform float uNight;
  varying vec3 vN, vObj, vV;
  varying vec4 vK;
  varying float vFace;
  float hole(vec3 d, vec3 c, float r, float sq) {
    vec3 a = normalize(c);
    vec3 q = d - a * dot(d, a);
    q.y *= sq;
    return smoothstep(r, r * 0.72, length(q)) * step(0.0, dot(d, a));
  }
  void main() {
    vec3 n = normalize(vN);
    float ndl = max(dot(n, uL), 0.0);
    float rim = pow(1.0 - max(dot(n, vV), 0.0), 2.5);
    vec3 base = vec3(0.95, 0.99, 0.93);
    vec3 col = base * (uSky * 0.75 + uLc * ndl * 0.55 + 0.18);
    // inner glow: brighter at dusk and night, pulsing gently
    vec3 glowC = vec3(0.72, 1.0, 0.86);
    col += glowC * vK.y * (0.35 + 0.9 * uNight) * (0.45 + rim * 1.6);
    if (vFace > 0.5) {
      vec3 d = normalize(vObj);
      float es = vK.z;
      float face = max(hole(d, vec3(-0.34, 0.14, 0.93), 0.16 * es, 0.82), hole(d, vec3(0.33, 0.17, 0.93), 0.15 * es * (0.85 + vK.w * 0.3), 0.88));
      face = max(face, hole(d, vec3(0.02, -0.3, 0.95), 0.15 * (0.8 + vK.w * 0.45), 1.3));
      col = mix(col, vec3(0.05, 0.06, 0.07), face);
    }
    gl_FragColor = vec4(col, vK.x);
  }`;

/** A pool of kodama drawn as two instanced meshes (heads, bodies) animated on the CPU. */
export class KodamaPool {
  constructor(n) {
    this.n = n;
    const mk = geo => {
      const aK = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      aK.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aK', aK);
      const m = new THREE.InstancedMesh(geo, this.mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 2;
      return m;
    };
    this.uniforms = {
      uL: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() }, uLc: { value: new THREE.Color(1, 0.95, 0.85) },
      uSky: { value: new THREE.Color(0.7, 0.75, 0.85) }, uNight: { value: 0 }, uTime: U.uTime,
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: K_VS, fragmentShader: K_FS, transparent: true });
    this.heads = mk(headGeometry());
    this.bodies = mk(bodyGeometry());
    this.group = new THREE.Group();
    this.group.name = 'cel:kodama';
    this.group.add(this.heads, this.bodies);
    this.group.visible = false;
    this.list = [];
  }
}
