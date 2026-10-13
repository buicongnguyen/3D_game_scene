// A small stylised fire for the countryside tricks (the sweet potato roast's straw fire, the fire drill's practice trays).
// One mesh, one draw call: a handful of flame "tongues", each a quad that turns to the camera in the vertex shader and is
// cut into a licking flame in the fragment shader (a scrolling noise bends it and breaks its tip into licks; the heat
// falls from a pale core through yellow and orange to red tips, in clean bands like the rest of the valley's art).
// Plain alpha blending, so it reads in daylight too; the glow, the sparks and the smoke round it come from the shared
// particle pools (fx.glow / fx.soft) and are the caller's business. No file is loaded: the noise is a 64 x 64 texture
// made here once and shared by every fire that is alive (freed with the last one). update() allocates nothing.
import * as THREE from 'three';

const N = 64;
let noiseTex = null, noiseUsers = 0;

/** A tileable smooth noise (two octaves in R, a finer one in G), made once for all fires. */
function noiseTexture() {
  if (noiseTex) return noiseTex;
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const sample = (g, n, x, y) => {
    const x0 = Math.floor(x) % n, y0 = Math.floor(y) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    let fx = x - Math.floor(x), fy = y - Math.floor(y);
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (g[y0 * n + x0] * (1 - fx) + g[y0 * n + x1] * fx) * (1 - fy) + (g[y1 * n + x0] * (1 - fx) + g[y1 * n + x1] * fx) * fy;
  };
  const a = grid(4), b = grid(8), c = grid(16);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    data[i] = Math.round(255 * (sample(a, 4, u * 4, v * 4) * 0.65 + sample(b, 8, u * 8, v * 8) * 0.35));
    data[i + 1] = Math.round(255 * (sample(b, 8, u * 8 + 3, v * 8 + 5) * 0.6 + sample(c, 16, u * 16, v * 16) * 0.4));
    data[i + 2] = 0; data[i + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.generateMipmaps = false;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

const VERT = /* glsl */`
attribute vec4 aTongue;   // width, height (metres at full blaze), seed, flicker rate
attribute vec2 aFade;     // the blaze (0..1) under which this tongue has shrunk away; the cell of the fire it belongs to
uniform float uTime, uLevel, uSize;
uniform float uCells[5];  // how hard each cell of the fire burns (a plain fire has one cell, at 1)
uniform vec2 uWind;       // lean, metres per metre of height, world x and z
varying vec2 vUv;
varying vec4 vK;          // seed, rate, how much of this tongue is there (0..1), its blaze
void main() {
  float seed = aTongue.z, rate = aTongue.w;
  float blaze = uLevel * uCells[int(aFade.y + 0.5)];
  float there = smoothstep(aFade.x, aFade.x + 0.16, blaze);
  float lvl = pow(clamp(blaze, 0.0, 1.6), 0.75);
  // each tongue stretches and sinks at its own pace: two beats that never line up
  float lick = 0.84 + 0.13 * sin(uTime * (5.3 + rate * 4.1) + seed * 37.0) + 0.09 * sin(uTime * (11.7 + rate * 6.3) + seed * 91.0);
  float h = aTongue.y * uSize * (0.07 + 0.93 * lvl) * lick * there;
  float w = aTongue.x * uSize * (0.5 + 0.5 * min(1.0, lvl)) * (0.6 + 0.4 * there);
  vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // upright from the side; seen from above it leans back to the camera so it still shows its face
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.5));
  float y = uv.y;
  vec3 p = base + right * (uv.x * w) + up * (y * h) + vec3(uWind.x, 0.0, uWind.y) * (y * y * h);
  vUv = uv;
  vK = vec4(seed, rate, there, blaze);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uCore, uHot, uMid, uTip;
varying vec2 vUv;
varying vec4 vK;
void main() {
  float seed = vK.x, rate = vK.y, y = vUv.y;
  float t = uTime * (0.55 + rate * 0.35);
  vec2 n = texture2D(uNoise, vec2(vUv.x * 0.22 + seed, y * 0.45 - t)).rg;
  vec2 m = texture2D(uNoise, vec2(vUv.x * 0.5 + seed * 3.1, y * 0.95 - t * 1.7)).rg;
  // the flame bends more the higher it gets
  float x = vUv.x + (n.r - 0.5) * 1.1 * y + (m.g - 0.5) * 0.35 * y;
  // a flame's outline: round at the foot, widest a little above it, drawn out to a point
  float prof = pow(max(0.0, 1.0 - y), 0.72) * (0.5 + 0.5 * smoothstep(0.0, 0.2, y));
  float d = 1.0 - abs(x) / max(prof, 1e-3);
  // licks: the noise eats into the upper half, so the tip splits and jumps
  float heat = d * (1.0 - y * 0.42) - (m.r - 0.36) * 0.95 * y * y - (1.0 - smoothstep(0.0, 0.05, y)) * 0.4;
  heat *= 0.72 + 0.28 * min(1.0, vK.w * 2.2);
  float a = smoothstep(0.03, 0.09, heat) * vK.z;
  if (a < 0.01) discard;
  vec3 col = mix(uTip, uMid, smoothstep(0.13, 0.2, heat));
  col = mix(col, uHot, smoothstep(0.33, 0.41, heat));
  col = mix(col, uCore, smoothstep(0.6, 0.7, heat));
  gl_FragColor = vec4(col, a * 0.96);
  #include <colorspace_fragment>
}`;

/**
 * Make a fire. Options:
 *   size       a scale for the flames (1: about 1.5 m high and 0.9 m wide at full blaze)
 *   tongues    how many flames (3..12; six or seven look like a fire). A fire of cells has two a cell.
 *   spread     how far from the middle the outer tongues stand (metres)
 *   cells      1..5: a fire that burns in a row of cells along its local x, each with its own blaze (fire.cells[k], 0..1):
 *              the fire drill's trays, put out cell by cell. cellWidth: metres from one cell to the next.
 *   seed       a number that makes this fire differ from the next one
 * Returns { object, level, cells, update(dt, level, windX, windZ), dispose() }. `object` is a Mesh named 'fire-fx' with
 * its foot at its origin: add it where the fire burns. level: 0 out, about 0.15 low flames dancing on embers, 1 full
 * blaze (up to 1.5 for a flare). windX / windZ: the lean of the flames (metres sideways per metre of height).
 */
export function makeFire({ size = 1, tongues = 0, spread = 0.26, cells = 1, cellWidth = 0.4, seed = 1 } = {}) {
  const nc = Math.max(1, Math.min(5, cells | 0));
  const n = Math.max(3, Math.min(12, (tongues | 0) || (nc > 1 ? nc * 2 : 6)));
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), tongue = new Float32Array(n * 4 * 4), fade = new Float32Array(n * 4 * 2), index = new Uint16Array(n * 6);
  // the tall flames first, then the shorter ones round them: each keeps its own outline in front of a big one, which
  // is what makes it a fire of several tongues and not one candle flame
  for (let k = 0; k < n; k++) {
    let x, z, w, h, f, cell = 0;
    const sd = rnd() * 7, rate = rnd();
    if (nc > 1) {
      // a row of cells: a tall flame on each (the middle ones tallest), then a short one in front of each
      cell = k % nc;
      const tall = k < nc, mid = 1 - Math.abs(cell - (nc - 1) / 2) / nc;
      x = (cell - (nc - 1) / 2) * cellWidth + (rnd() - 0.5) * cellWidth * (tall ? 0.25 : 0.7);
      z = tall ? (rnd() - 0.5) * 0.1 : 0.1 + rnd() * 0.12;
      w = tall ? 0.36 + rnd() * 0.08 : 0.24 + rnd() * 0.1;
      h = tall ? 1.05 + mid * 0.45 + rnd() * 0.15 : 0.5 + rnd() * 0.35;
      f = tall ? 0 : 0.12 + rnd() * 0.2;
    } else {
      const mid = k === 0, a = k * 2.399963 + rnd() * 0.6, r = mid ? 0 : spread * (0.6 + 0.4 * rnd());
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      w = mid ? 0.46 : 0.25 + rnd() * 0.13; h = mid ? 1.5 : k === 1 ? 1.15 : 0.55 + rnd() * 0.5;
      f = k < 3 ? 0 : 0.05 + (k - 3) / Math.max(1, n - 3) * 0.3;
    }
    for (let c = 0; c < 4; c++) {
      const i = k * 4 + c;
      pos[i * 3] = x; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = z;
      uv[i * 2] = c === 0 || c === 3 ? -1 : 1; uv[i * 2 + 1] = c < 2 ? 0 : 1;
      tongue[i * 4] = w; tongue[i * 4 + 1] = h; tongue[i * 4 + 2] = sd; tongue[i * 4 + 3] = rate;
      fade[i * 2] = f; fade[i * 2 + 1] = cell;
    }
    index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aTongue', new THREE.BufferAttribute(tongue, 4));
  geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  noiseUsers++;
  const wind = new THREE.Vector2(), cellLv = new Float32Array(5).fill(1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noiseTexture() }, uTime: { value: seed * 3.7 }, uLevel: { value: 0 }, uSize: { value: size }, uWind: { value: wind }, uCells: { value: cellLv },
      uCore: { value: new THREE.Color('#fff6cf') }, uHot: { value: new THREE.Color('#ffd23a') }, uMid: { value: new THREE.Color('#ff8a16') }, uTip: { value: new THREE.Color('#e8381a') },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fire-fx';
  mesh.frustumCulled = false;            // the vertices are placed in the shader: a handful of quads is cheaper drawn than tested
  mesh.renderOrder = 6;
  mesh.visible = false;
  let gone = false;
  const fire = {
    object: mesh, level: 0, cells: cellLv,
    /** A step of the fire: its blaze now (0..1.5) and, if any, the lean of the wind. */
    update(dt, level = fire.level, windX = 0, windZ = 0) {
      fire.level = level;
      const u = mat.uniforms;
      u.uTime.value += dt;
      u.uLevel.value = level;
      wind.set(windX, windZ);
      mesh.visible = level > 0.012;
    },
    set size(v) { mat.uniforms.uSize.value = v; },
    get size() { return mat.uniforms.uSize.value; },
    dispose() {
      if (gone) return;
      gone = true;
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      if (--noiseUsers <= 0 && noiseTex) { noiseTex.dispose(); noiseTex = null; noiseUsers = 0; }
    },
  };
  return fire;
}
