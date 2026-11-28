// © 2026 Bui Cong Nguyen · solluxlabs.com
// Show effects for a performance (Sing & Play, the Night Star; docs/SHOW-EFFECTS.md): fake concert lighting that costs a
// few draws and no lights, no extra render pass and no post effect. Everything is driven from the song's clock
// (game/perform/show-cues.js) and costs a handful of uniforms a frame on the CPU:
//   stage      a festival stage set that unfolds behind the performers (two truss towers with LED pillars, a top truss
//              with paper lanterns and spot cans): ONE opaque mesh, colour in the vertices, the LED and lantern glow
//              from the wash and the beat in its shader, the unfolding in its vertex shader
//   glow       ONE additive instanced draw of soft cards: the ground wash, the beams' floor spots, the lens glows and a
//              faint haze behind the group at night (procedural, no texture)
//   beams      ONE additive instanced draw: soft cones sweeping on the beat (edge-soft by the view angle, faded along
//              their length, at the camera and into the floor: no depth texture) and thin laser fans in the same draw
//              (camera-facing ribbons held at least 1.5 px wide, their brightness scaled down instead)
//   particles  ONE instanced draw whose positions are computed in the vertex shader from song time and a seed per
//              particle (no per-frame CPU work, nothing uploaded): confetti by night, petals, bubbles and balloons by day
//   sticks     ONE instanced draw of the dance game's light stick (public/models/light-stick.glb) in each watcher's hand,
//              their arms waving on the beat (the dance game's StickWave; by day they Clap on the beat)
//   fireworks  the valley's own (fx/fx.js fireworks) over the last chorus at night
// Research, choices and measurements: docs/SHOW-EFFECTS.md.
import * as THREE from 'three';
import { washAt, pulseAt, levelAt, cuePlan, inWindows, slotTimes, SLOTS, showItems, countsFor, isShowNight } from '../game/perform/show-cues.js';
import { prepareMoves, lendClips } from '../game/tricks/exercise-moves.js';

const FOG_ADD = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  col *= 1.0 - fogF;
#endif`;
// the aim of a beam or a laser (stage frame: +z toward the audience, y up): yaw about y, elevation from level
const AIM = /* glsl */`
vec3 aimDir(vec4 aim, float kind) {
  float yaw, el;
  if (kind < 0.5) { yaw = aim.x + aim.z * sin(uSweep + aim.w); el = aim.y + 0.16 * aim.z * cos(uSweep * 0.5 + aim.w); }
  else { yaw = aim.x + aim.z * uFan; el = aim.y + 0.1 * sin(uSweep * 2.0 + aim.w); }
  float c = cos(el);
  return vec3(sin(yaw) * c, sin(el), cos(yaw) * c);
}`;

const smooth01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, k) => a + (b - a) * k;

/** The stage's size for a group: { W (towers apart), back (the stage line behind the centre), topY }. */
export function stageSize(group) {
  const w = group?.w || 0, d = group?.depth || 0;
  return { W: Math.max(4.6, w + 2.6), back: d / 2 + 1.35, topY: 4.3 };
}

// ------------------------------------------------------------------------------------------------ the stage set
/** One merged geometry: boxes and lantern drums with colour (rgb + a material code), normals, uv and an unfold pivot. */
class StageBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.grow = []; }
  quad(p0, p1, p2, p3, n, rgba, uv, grow) {
    const base = this.pos.length / 3, P = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i++) { this.pos.push(...P[i]); this.nor.push(...n); this.col.push(...rgba); this.uv.push(...uv[i]); this.grow.push(...grow); }
    (this.idx ||= []).push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** An axis box centred at c, half sizes h, turned by `rz` about z (a truss brace) in the stage frame. */
  box(c, h, rgba, grow, { rz = 0, uvFront = false } = {}) {
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const T = (x, y, z) => [c[0] + x * cz - y * sz, c[1] + x * sz + y * cz, c[2] + z];
    const N = (x, y, z) => [x * cz - y * sz, x * sz + y * cz, z];
    const [hx, hy, hz] = h, U = [[0, 0], [1, 0], [1, 1], [0, 1]], Z = [[0, 0], [0, 0], [0, 0], [0, 0]];
    this.quad(T(-hx, -hy, hz), T(hx, -hy, hz), T(hx, hy, hz), T(-hx, hy, hz), N(0, 0, 1), rgba, uvFront ? U : Z, grow);
    this.quad(T(hx, -hy, -hz), T(-hx, -hy, -hz), T(-hx, hy, -hz), T(hx, hy, -hz), N(0, 0, -1), rgba, Z, grow);
    this.quad(T(hx, -hy, hz), T(hx, -hy, -hz), T(hx, hy, -hz), T(hx, hy, hz), N(1, 0, 0), rgba, Z, grow);
    this.quad(T(-hx, -hy, -hz), T(-hx, -hy, hz), T(-hx, hy, hz), T(-hx, hy, -hz), N(-1, 0, 0), rgba, Z, grow);
    this.quad(T(-hx, hy, hz), T(hx, hy, hz), T(hx, hy, -hz), T(-hx, hy, -hz), N(0, 1, 0), rgba, Z, grow);
    this.quad(T(-hx, -hy, -hz), T(hx, -hy, -hz), T(hx, -hy, hz), T(-hx, -hy, hz), N(0, -1, 0), rgba, Z, grow);
  }
  /** A paper lantern: an 8-sided drum (no caps: seen from the side and below a dark rim hides it). */
  drum(c, r, h, rgba, grow, sides = 8) {
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (a, y) => [c[0] + Math.sin(a) * r, c[1] + y, c[2] + Math.cos(a) * r];
      this.quad(p(a0, -h / 2), p(a1, -h / 2), p(a1, h / 2), p(a0, h / 2), [Math.sin(am), 0, Math.cos(am)], rgba, [[0, 0], [1, 0], [1, 1], [0, 1]], grow);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aGrow', new THREE.Float32BufferAttribute(this.grow, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
// material codes (colour alpha): metal (lit), lantern paper (warm glow), LED (the wash pattern), lens (beam light)
const METAL = 0, PAPER = 0.5, LENS = 0.75, LED = 1;
const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const C = { truss: lin('#2b2d36'), plate: lin('#1b1c22'), led: lin('#101018'), red: lin('#e2342c'), white: lin('#f5ecd8'), can: lin('#15151a'), rope: lin('#3a2e24') };

/**
 * The set for towers W apart, its stage line `back` m behind the centre; hl / hr: the ground under the left / right
 * tower (the stage frame's y 0 is the centre's ground). -> { geometry, fixtures: [[x, y, z]], towers: [[x, y, z]] (tops) }
 * About 2.3k triangles (budget 3k: a 120-300 px prop).
 */
export function buildStage({ W, back, topY }, hl = 0, hr = 0, { beams = 6, lanterns = 7 } = {}) {
  const B = new StageBuilder(), z0 = -back, s = 0.17, post = 0.024, top = topY + Math.max(hl, hr);
  const G = (px, py, pz, delay, mode) => [px, py, pz, delay + mode * 10];   // mode 0 scale, 1 rise (y), 2 extend (x)
  const towers = [];
  for (const [side, h0, d] of [[-1, hl, 0], [1, hr, 0.08]]) {
    const x = side * W / 2, H = top - h0, grow = G(x, h0, z0, d, 1);
    // four posts, rungs on every side, braces on the front and back faces
    for (const [dx, dz] of [[-s, -s], [s, -s], [s, s], [-s, s]]) B.box([x + dx, h0 + H / 2, z0 + dz], [post, H / 2, post], [...C.truss, METAL], grow);
    const n = Math.max(4, Math.round(H / 0.55));
    for (let k = 0; k <= n; k++) {
      const y = h0 + 0.12 + k * (H - 0.24) / n;
      B.box([x, y, z0 + s], [s, 0.014, 0.014], [...C.truss, METAL], grow); B.box([x, y, z0 - s], [s, 0.014, 0.014], [...C.truss, METAL], grow);
      B.box([x + s, y, z0], [0.014, 0.014, s], [...C.truss, METAL], grow); B.box([x - s, y, z0], [0.014, 0.014, s], [...C.truss, METAL], grow);
      if (k < n) {
        const dy = (H - 0.24) / n, len = Math.hypot(2 * s, dy) / 2, a = Math.atan2(dy, 2 * s) * (k & 1 ? 1 : -1);
        for (const zz of [s, -s]) B.box([x, y + dy / 2, z0 + zz], [len, 0.012, 0.012], [...C.truss, METAL], grow, { rz: a });
      }
    }
    B.box([x, h0 + 0.025, z0], [0.34, 0.025, 0.34], [...C.plate, METAL], grow);
    // the LED pillar on its front (uv over the panel: the shader draws the dots and the bars)
    B.box([x, h0 + 0.55 + (H - 1.1) / 2, z0 + s + 0.05], [0.3, (H - 1.1) / 2, 0.02], [...C.led, LED], G(x, h0, z0, 0.25 + d, 1), { uvFront: true });
    towers.push([x, top + 0.2, z0]);
  }
  // the top truss: four chords, rungs on the front and back, braces on the front
  const grow = G(0, top, z0, 0.35, 2), y0 = top - s;
  for (const [dy, dz] of [[-s, -s], [s, -s], [s, s], [-s, s]]) B.box([0, top + dy, z0 + dz], [W / 2 + s, post, post], [...C.truss, METAL], grow);
  const m = Math.max(6, Math.round(W / 0.55));
  for (let k = 0; k <= m; k++) {
    const x = -W / 2 + k * W / m;
    for (const zz of [s, -s]) B.box([x, top, z0 + zz], [0.014, s, 0.014], [...C.truss, METAL], grow);
    if (k < m) { const len = Math.hypot(W / m, 2 * s) / 2, a = Math.atan2(2 * s, W / m) * (k & 1 ? 1 : -1); B.box([x + W / m / 2, top, z0 + s], [len, 0.012, 0.012], [...C.truss, METAL], grow, { rz: a }); }
  }
  // paper lanterns on short cords under the front chord, red and white in turn
  for (let i = 0; i < lanterns; i++) {
    const x = (i / (lanterns - 1) - 0.5) * (W - 0.9), hang = y0 - 0.32, gl = G(x, y0, z0 + s, 0.5 + i * 0.04, 0);
    B.box([x, y0 - 0.12, z0 + s], [0.006, 0.12, 0.006], [...C.rope, METAL], gl);
    B.drum([x, hang, z0 + s], 0.15, 0.3, [...(i & 1 ? C.white : C.red), PAPER], gl);
    B.box([x, hang + 0.16, z0 + s], [0.1, 0.014, 0.1], [...C.plate, METAL], gl);
    B.box([x, hang - 0.16, z0 + s], [0.1, 0.014, 0.1], [...C.plate, METAL], gl);
  }
  // spot cans under the back chord (the beams start at their lenses)
  const fixtures = [];
  for (let i = 0; i < beams; i++) {
    const x = (beams > 1 ? i / (beams - 1) - 0.5 : 0) * (W - 1.2), y = top - s - 0.16, z = z0 - 0.02, gf = G(x, top, z0, 0.55 + i * 0.03, 0);
    B.box([x, y, z], [0.09, 0.12, 0.1], [...C.can, METAL], gf);
    B.box([x, y - 0.12, z + 0.02], [0.07, 0.008, 0.07], [1, 1, 1, LENS], gf);
    fixtures.push([x, y - 0.13, z + 0.02]);
  }
  return { geometry: B.geometry(), fixtures, towers, top };
}

const STAGE_VS = /* glsl */`
attribute vec4 aGrow;
uniform float uUnfold;
varying vec4 vCol; varying vec3 vN; varying vec2 vUv;
#include <fog_pars_vertex>
float backOut(float x) { float c = 1.7; x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + (c + 1.0) * x * x * x + c * x * x; }
void main() {
  float mode = floor(aGrow.w / 10.0), delay = aGrow.w - mode * 10.0;
  float s = backOut((uUnfold * 1.8 - delay) / 0.7);
  vec3 sc = mode < 0.5 ? vec3(s) : mode < 1.5 ? vec3(min(1.0, s * 1.5), s, min(1.0, s * 1.5)) : vec3(s, min(1.0, s * 1.5), min(1.0, s * 1.5));
  vec3 transformed = aGrow.xyz + (position - aGrow.xyz) * sc;
  vCol = color; vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const STAGE_FS = /* glsl */`
uniform vec3 uWash, uSun; uniform float uNight, uPulse, uLevel, uT, uAmb, uDiff, uBeamK;
varying vec4 vCol; varying vec3 vN; varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN), base = vCol.rgb;
  float code = vCol.a, lit = uAmb + uDiff * max(dot(n, uSun), 0.0);
  // metal: the sun and sky by day, the wash's spill at night
  vec3 col = base * lit + base * uWash * uNight * (0.35 + 0.4 * uPulse) * uLevel;
  if (code > 0.9) {
    // LED pillar: a grid of dots, bars climbing with the beat, the wash colour (dimmer in daylight)
    vec2 g = vUv * vec2(9.0, 34.0), cell = fract(g) - 0.5;
    float dotm = smoothstep(0.48, 0.18, length(cell));
    float row = floor(g.y) / 34.0, bar = step(row, fract(uT * 0.37) * 0.5 + 0.5 * uLevel * (0.55 + 0.45 * uPulse));
    float sweep = 0.5 + 0.5 * sin(row * 18.0 - uT * 6.0 + floor(g.x) * 0.7);
    float e = dotm * (0.2 + 0.8 * max(bar, 0.35 * sweep));
    col = base * lit * 0.3 + uWash * e * (0.75 + 0.75 * uNight) * (0.75 + 0.7 * uPulse);
  } else if (code > 0.6) {
    col = mix(vec3(1.0), uWash, 0.45) * (0.6 + 2.6 * uBeamK * (0.7 + 0.5 * uPulse)) * (0.25 + 0.75 * uNight);   // the lens
  } else if (code > 0.4) {
    // paper lantern: lit from inside at night (warm, a breath of the wash on the beat), paper in the sun by day
    float rim = 0.75 + 0.25 * abs(n.y);
    vec3 warm = vec3(1.0, 0.62, 0.3) * (0.15 + 2.1 * uNight) + uWash * 0.35 * uNight * uPulse;
    col = base * lit * (1.0 - 0.7 * uNight) + base * warm * rim;
  }
  #include <fog_fragment>
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ glow cards
const GLOW_VS = /* glsl */`
attribute vec4 aA;      // x, y, z, kind (0 ground wash, 1 haze, 2 lens glow, 3 beam floor spot)
attribute vec4 aB;      // size x, size y, use the wash (0..1), beam index
attribute vec4 aAim;    // a floor spot: its beam's aim (yaw, elevation, sweep, phase)
attribute vec3 aCol;
uniform float uSweep, uFan, uGlowK, uHazeK, uBeamK, uGroundY, uNight, uLevel, uPulse;
uniform vec2 uTilt;     // the ground's slope in the stage frame (dy/dx, dy/dz)
uniform vec3 uWash;
varying vec2 vQ; varying vec3 vC; varying float vA, vKind;
#include <fog_pars_vertex>
${AIM}
void main() {
  float kind = aA.w;
  vec3 c = aA.xyz; vec2 corner = position.xy * 2.0;   // (a 1 x 1 plane: corners at +-0.5)
  vQ = corner; vKind = kind;
  vC = mix(aCol, uWash, aB.z);
  vec4 mvPosition;
  if (kind > 0.5 && kind < 2.5) {
    // camera-facing cards: the haze behind the group, the lens glows
    mvPosition = modelViewMatrix * vec4(c, 1.0);
    mvPosition.xy += corner * aB.xy * 0.5;
    float near = smoothstep(2.5, 6.0, -mvPosition.z);   // (the camera close: the haze would fill the screen)
    vA = kind < 1.5 ? uHazeK * uLevel * near : uBeamK * (0.55 + 0.6 * uPulse);
  } else {
    if (kind > 2.5) {
      // where its beam meets the ground (the ground plane under the stage)
      vec3 d = aimDir(aAim, 0.0);
      float k = (uGroundY - c.y) / min(d.y, -0.05);
      c = c + d * k;
      vA = uBeamK * uLevel * (0.45 + 0.35 * uPulse);
    } else vA = uGlowK * uLevel * (0.6 + 0.4 * uPulse);
    vec3 p = vec3(c.x + corner.x * aB.x * 0.5, 0.0, c.z + corner.y * aB.y * 0.5);
    p.y = uGroundY + 0.05 + p.x * uTilt.x + p.z * uTilt.y;
    mvPosition = modelViewMatrix * vec4(p, 1.0);
  }
  if (vA < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // (off: no pixels)
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLOW_FS = /* glsl */`
varying vec2 vQ; varying vec3 vC; varying float vA, vKind;
#include <fog_pars_fragment>
void main() {
  float r2 = dot(vQ, vQ);
  float f = max(0.0, 1.0 - r2);
  float a;
  if (vKind > 0.5 && vKind < 1.5) a = f * f * (0.55 + 0.45 * smoothstep(0.8, -0.6, vQ.y));   // haze: denser low
  else if (vKind > 1.5 && vKind < 2.5) a = f * f * f * f + 0.6 * pow(f, 12.0);                 // lens: a hot core
  else a = f * f;                                                                               // ground: soft pools
  vec3 col = vC * a * vA;
  ${FOG_ADD}
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ beams and lasers
const BEAM_VS = /* glsl */`
attribute vec4 aO;      // origin (stage frame), kind (0 beam, 1 laser)
attribute vec4 aAim;    // yaw, elevation, sweep (beam) / fan offset (laser), phase
attribute vec4 aS;      // length, far radius (beam) / true width (laser), brightness, -
attribute vec4 aC;      // colour rgb, share of the wash
uniform float uSweep, uFan, uBeamK, uLaserK, uLevel, uPulse, uPxK, uLens, uGroundY;
uniform vec3 uWash;
varying float vT, vEdge, vI, vKind, vH;
varying vec3 vC;
#include <fog_pars_vertex>
${AIM}
void main() {
  float kind = aO.w, on = kind < 0.5 ? uBeamK : uLaserK;
  vKind = kind;
  if (on < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vT = 0.0; vEdge = 0.0; vI = 0.0; vH = 0.0; vC = vec3(0.0); return; }
  float t = position.y + 0.5;              // 0 at the lens, 1 at the far end (a 1 m open cylinder, radius 1)
  vec3 axis = aimDir(aAim, kind);
  vec3 side = normalize(abs(axis.y) > 0.99 ? cross(axis, vec3(1.0, 0.0, 0.0)) : cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 up2 = cross(side, axis);
  vec3 a = aO.xyz + axis * (t * aS.x);
  vec3 p; float bright = aS.z * on;
  if (kind < 0.5) {
    float r = mix(uLens, aS.y, t);
    vec3 nrm = side * position.x + up2 * position.z;
    p = a + nrm * r;
    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz, wn = normalize(mat3(modelMatrix) * nrm);
    vEdge = abs(dot(wn, normalize(cameraPosition - wp)));   // 1 face-on at the beam's middle, 0 at its silhouette
  } else {
    // a laser: a ribbon turned to the camera, never thinner than 1.5 px (then dimmer, so it adds the same light)
    vec3 wa = (modelMatrix * vec4(a, 1.0)).xyz, wax = normalize(mat3(modelMatrix) * axis);
    vec3 s2 = normalize(cross(wax, normalize(cameraPosition - wa)));
    float depth = max(0.1, -(viewMatrix * vec4(wa, 1.0)).z), wmin = 1.5 * depth / uPxK, w = max(aS.y, wmin);
    bright *= aS.y / w;
    p = a; vEdge = position.x;            // (-1..1 across the ribbon)
    vec4 mvq = viewMatrix * vec4(wa + s2 * position.x * w * 0.5, 1.0);
    vec4 mvPosition = mvq;
    vT = t; vI = bright * uLevel * (0.75 + 0.5 * uPulse); vC = mix(aC.rgb, uWash, aC.a); vH = wa.y - uGroundY;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    return;
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vT = t; vI = bright * uLevel * (0.7 + 0.45 * uPulse) * smoothstep(0.8, 2.6, -mvPosition.z);   // (fades at the camera)
  vC = mix(aC.rgb, uWash, aC.a);
  vH = (modelMatrix * vec4(p, 1.0)).y - uGroundY;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BEAM_FS = /* glsl */`
uniform float uAngle;
varying float vT, vEdge, vI, vKind, vH;
varying vec3 vC;
#include <fog_pars_fragment>
void main() {
  float a;
  if (vKind < 0.5) {
    float along = (1.0 - vT) * (1.0 - vT) * smoothstep(0.0, 0.05, vT);   // bright at the lens, gone at the far end
    a = pow(clamp(vEdge, 0.0, 1.0), uAngle) * along * smoothstep(0.0, 0.7, vH);   // soft edge; fades into the floor (clamped: an interpolated 0 can come out a hair below it, and pow() of that is NaN, which the bloom spreads over the whole picture)
  } else {
    a = exp(-5.0 * vEdge * vEdge) * (1.0 - vT) * smoothstep(0.0, 0.02, vT);
  }
  vec3 col = vC * a * vI;
  ${FOG_ADD}
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ the bursts
const PART_VS = /* glsl */`
attribute vec4 aSeed;   // three randoms, the slot
uniform float uT, uW, uTop, uBurst[${SLOTS}], uMode[${SLOTS}];
varying vec2 vQ; varying vec3 vC; varying float vA, vKind, vFlip;
#include <fog_pars_vertex>
float h(float n) { return fract(sin(n * 127.1 + aSeed.x * 311.7) * 43758.5453); }
// analytic drag: from v0 toward a drift velocity vt at rate k
vec3 drag(vec3 p0, vec3 v0, vec3 vt, float k, float t) { float e = (1.0 - exp(-k * t)) / k; return p0 + vt * t + (v0 - vt) * e; }
void main() {
  int slot = int(aSeed.w + 0.5);
  float age = uT - uBurst[slot], mode = uMode[slot];
  float r1 = aSeed.x, r2 = aSeed.y, r3 = aSeed.z;
  // the kind: night confetti; by day petals, bubbles and a few balloons
  float kind = mode < 0.5 ? 0.0 : r3 < 0.6 ? 1.0 : r3 < 0.9 ? 2.0 : 3.0;
  float life = kind < 0.5 ? 4.5 + 1.0 * r2 : kind < 1.5 ? 8.0 : kind < 2.5 ? 4.0 + 2.0 * r1 : 10.0;
  float delay = kind < 0.5 ? 0.0 : kind < 1.5 ? r1 * 1.2 : kind < 2.5 ? r2 * 1.6 : r1 * 0.8;
  age -= delay;
  vKind = kind;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vQ = vec2(0.0); vC = vec3(0.0); vFlip = 0.0; return; }
  float side = r1 < 0.5 ? -1.0 : 1.0, u = age / life;
  vec3 p; float size; vec2 shape = vec2(1.0); float spin = 0.0;
  if (kind < 0.5) {
    // confetti: half from cannons on the tower tops (out over the group), half showered from the top truss, fluttering down
    vec3 p0, v0;
    if (r3 < 0.5) { p0 = vec3(side * uW * 0.47, uTop + 0.25, 0.1); v0 = vec3(-side * (1.5 + 3.0 * r2), 2.0 + 2.0 * h(1.0), 2.5 + 4.0 * h(2.0)); }
    else { p0 = vec3((r2 - 0.5) * uW, uTop - 0.6, 0.2 + 0.4 * h(1.0)); v0 = vec3((h(2.0) - 0.5) * 2.0, 0.3 + 1.0 * h(10.0), 1.0 + 2.6 * h(11.0)); }
    p = drag(p0, v0, vec3(0.2, -1.45, 0.3), 1.7, age);
    p.x += sin(age * (5.0 + 4.0 * r3) + r1 * 6.3) * 0.18; p.z += cos(age * 4.0 + r2 * 6.3) * 0.12;
    size = 0.055; spin = age * (5.0 + 7.0 * r3) + r2 * 6.3; shape = vec2(1.0, 0.62);
    vFlip = abs(cos(age * (6.0 + 5.0 * r1) + r3 * 6.3));
    vec3 pal[6]; pal[0] = vec3(1.0, 0.25, 0.35); pal[1] = vec3(1.0, 0.8, 0.2); pal[2] = vec3(0.25, 0.7, 1.0); pal[3] = vec3(0.35, 0.95, 0.5); pal[4] = vec3(1.0, 0.45, 0.85); pal[5] = vec3(1.0, 1.0, 1.0);
    vC = pal[int(h(3.0) * 5.99)] * 1.35;
    vA = 1.0 - smoothstep(0.75, 1.0, u);
  } else if (kind < 1.5) {
    // petals drifting down over the group and the watchers
    vec3 p0 = vec3((r1 - 0.5) * (uW + 3.0), 3.6 + 2.4 * r2, -1.0 + 6.0 * h(4.0));
    p = p0 + vec3(0.35, -0.6, 0.1) * age;
    p.x += sin(age * 1.7 + r3 * 6.3) * 0.35; p.z += cos(age * 1.3 + r1 * 6.3) * 0.25;
    size = 0.06; spin = age * 1.6 + r2 * 6.3; shape = vec2(1.0, 0.65);
    vFlip = 0.6 + 0.4 * abs(sin(age * 2.2 + r1 * 6.3));
    vC = mix(vec3(1.0, 0.62, 0.78), vec3(1.0, 0.86, 0.92), h(5.0));
    vA = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.8, 1.0, u)) * step(0.0, p.y);
  } else if (kind < 2.5) {
    // bubbles from the towers' feet, rising and wobbling, popping at the end
    vec3 p0 = vec3(side * uW * 0.42, 1.0 + 0.3 * r3, 0.2);
    vec3 v0 = vec3(-side * (0.5 + 0.9 * r2), 0.7 + 0.8 * h(6.0), 0.6 + 1.1 * h(7.0));
    p = drag(p0, v0, vec3(0.12, 0.32, 0.08), 0.7, age);
    p.x += sin(age * 2.6 + r1 * 6.3) * 0.12;
    size = 0.09 + 0.12 * h(8.0); size *= 1.0 + 0.5 * smoothstep(0.92, 1.0, u);
    vFlip = 1.0;
    vC = vec3(0.85, 0.95, 1.0);
    vA = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.92, 1.0, u));
  } else {
    // balloons rising from behind the group
    vec3 p0 = vec3((r2 - 0.5) * uW, 0.6, -1.4 - r1);
    p = p0 + vec3(0.12, 1.05 + 0.4 * r3, 0.05) * age;
    p.x += sin(age * 0.9 + r1 * 6.3) * 0.3;
    size = 0.34; shape = vec2(0.86, 1.0);
    vFlip = 1.0;
    vec3 pal[5]; pal[0] = vec3(1.0, 0.3, 0.4); pal[1] = vec3(1.0, 0.82, 0.25); pal[2] = vec3(0.3, 0.65, 1.0); pal[3] = vec3(0.5, 0.9, 0.45); pal[4] = vec3(0.85, 0.5, 1.0);
    vC = pal[int(h(9.0) * 4.99)];
    vA = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.85, 1.0, u));
  }
  vec2 q = position.xy * 2.0;
  vQ = q;
  float cs = cos(spin), sn = sin(spin);
  vec2 off = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs) * shape * vec2(1.0, kind < 1.5 ? max(0.2, vFlip) : 1.0) * size * 0.5;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  mvPosition.xy += off;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const PART_FS = /* glsl */`
uniform float uNight;
varying vec2 vQ; varying vec3 vC; varying float vA, vKind, vFlip;
#include <fog_pars_fragment>
void main() {
  float r = length(vQ), a; vec3 col = vC;
  if (vKind < 0.5) { a = 1.0 - smoothstep(0.85, 1.0, max(abs(vQ.x), abs(vQ.y))); col *= 0.45 + 0.55 * vFlip; }
  else if (vKind < 1.5) { a = 1.0 - smoothstep(0.7, 1.0, r); col *= 0.75 + 0.25 * vFlip; }
  else if (vKind < 2.5) {
    // a soap film: a bright rim, a clear middle, a highlight, a hint of rainbow round the rim
    float rim = smoothstep(0.62, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
    float hi = 1.0 - smoothstep(0.0, 0.22, length(vQ - vec2(-0.35, 0.35)));
    col = mix(vec3(0.7, 0.9, 1.0), vec3(1.0, 0.75, 0.95), 0.5 + 0.5 * sin(atan(vQ.y, vQ.x) * 2.0)) * (rim + hi);
    a = clamp(rim * 0.75 + hi * 0.9 + 0.06 * (1.0 - r), 0.0, 1.0);
  } else {
    // a balloon: a round body with a highlight and a darker side, a little knot below
    float body = 1.0 - smoothstep(0.92, 1.0, r);
    float knot = (1.0 - smoothstep(0.08, 0.14, abs(vQ.x))) * step(-1.0, vQ.y) * (1.0 - step(-0.86, vQ.y));
    float hi = 1.0 - smoothstep(0.0, 0.3, length(vQ - vec2(-0.32, 0.38)));
    col = vC * (0.55 + 0.45 * (0.5 - 0.5 * vQ.x)) + hi * 0.6;
    a = max(body, knot);
  }
  col *= 1.0 + 0.25 * uNight;
  a *= vA;
  #include <fog_fragment>
  gl_FragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------------------------------------ glow sticks
const STICK_VS = /* glsl */`
attribute float aGlow;   // 1 the glowing head, 0 the handle
varying vec3 vC; varying float vY;
#include <fog_pars_vertex>
void main() {
  #ifdef USE_INSTANCING_COLOR
    vC = instanceColor;
  #else
    vC = vec3(1.0);
  #endif
  vY = aGlow;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const STICK_FS = /* glsl */`
uniform float uPulse, uNight; uniform vec3 uWash;
varying vec3 vC; varying float vY;
#include <fog_pars_fragment>
void main() {
  vec3 col = vY > 0.5 ? mix(vC, uWash, 0.3) * (1.4 + 2.2 * uPulse) * (0.5 + 0.8 * uNight) : vec3(0.06, 0.06, 0.08);
  #include <fog_fragment>
  gl_FragColor = vec4(col, 1.0);
}`;

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/**
 * The light stick (its handle and its glowing head: two parts of one file) as ONE geometry in grip_R space, plain floats
 * (a packed build stores it quantized under a node scale), the head marked by `aGlow`. k: a size factor (a fan's stick
 * a little larger than the dance game's, so it reads from the camera's distance).
 */
function gripGeometry(root, k = 1.7) {
  const parts = []; root.updateMatrixWorld(true); root.traverse(o => { if (o.isMesh) parts.push(o); });
  if (!parts.length) return null;
  const pos = [], glow = [], index = [], v = new THREE.Vector3();
  for (const m of parts) {
    const P = m.geometry.getAttribute('position'), idx = m.geometry.index, base = pos.length / 3, hot = /glow/i.test(m.material?.name || '') ? 1 : 0;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).multiplyScalar(k); pos.push(v.x, v.y, v.z); glow.push(hot); }
    if (idx) for (let i = 0; i < idx.count; i++) index.push(base + idx.getX(i)); else for (let i = 0; i < P.count; i++) index.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export class ShowFX {
  /** game: the Game (scene, renderer tier, fx, world, assets). */
  constructor(game) {
    this.g = game;
    this.tier = game.renderer?.qualityName === 'low' ? 'low' : 'other';
    this.counts = countsFor(game.renderer?.qualityName);
    this.root = new THREE.Group(); this.root.name = 'show-fx'; this.root.visible = false;
    // the uniforms every effect reads (one object each, shared by reference)
    this.U = {
      uT: { value: 0 }, uPulse: { value: 0 }, uLevel: { value: 1 }, uWash: { value: new THREE.Color(0.2, 0.4, 1) }, uNight: { value: 0 },
      uSweep: { value: 0 }, uFan: { value: 0.5 }, uBeamK: { value: 0 }, uLaserK: { value: 0 }, uGlowK: { value: 0 }, uHazeK: { value: 0 },
      uUnfold: { value: 0 }, uGroundY: { value: 0 }, uTilt: { value: new THREE.Vector2() }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
      uAmb: { value: 0.5 }, uDiff: { value: 0.7 }, uPxK: { value: 800 }, uLens: { value: 0.07 }, uAngle: { value: 2.2 },
      uW: { value: 6 }, uTop: { value: 4.3 }, uBurst: { value: new Array(SLOTS).fill(-1e4) }, uMode: { value: new Array(SLOTS).fill(0) },
    };
    const U = this.U, pick = (...k) => Object.fromEntries(k.map(n => [n, U[n]]));
    const fx = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, forceSinglePass: true };
    this.mats = {
      stage: new THREE.ShaderMaterial({ uniforms: { ...fogUniforms(), ...pick('uUnfold', 'uWash', 'uSun', 'uNight', 'uPulse', 'uLevel', 'uT', 'uAmb', 'uDiff', 'uBeamK') }, vertexShader: STAGE_VS, fragmentShader: STAGE_FS, vertexColors: true, fog: true }),
      glow: new THREE.ShaderMaterial({ uniforms: { ...fogUniforms(), ...pick('uSweep', 'uFan', 'uGlowK', 'uHazeK', 'uBeamK', 'uGroundY', 'uNight', 'uLevel', 'uPulse', 'uTilt', 'uWash') }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...fx }),
      beams: new THREE.ShaderMaterial({ uniforms: { ...fogUniforms(), ...pick('uSweep', 'uFan', 'uBeamK', 'uLaserK', 'uLevel', 'uPulse', 'uPxK', 'uLens', 'uGroundY', 'uWash', 'uAngle') }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...fx, side: THREE.DoubleSide }),
      parts: new THREE.ShaderMaterial({ uniforms: { ...fogUniforms(), ...pick('uT', 'uW', 'uTop', 'uBurst', 'uMode', 'uNight') }, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, forceSinglePass: true }),
      sticks: new THREE.ShaderMaterial({ uniforms: { ...fogUniforms(), ...pick('uPulse', 'uNight', 'uWash') }, vertexShader: STICK_VS, fragmentShader: STICK_FS, fog: true }),
    };
    this.items = showItems({ on: false });
    this.on = false; this.unfold = 0; this.want = 0;
    this.cues = null; this.perf = null; this.crowd = [];
    this.stage = null; this.glow = null; this.beams = null; this.parts = null; this.sticks = null;
    this.buildParticles();
    this.size = null; this.stats = { draws: 0 };
    game.scene.add(this.root);
  }

  // ---------------------------------------------------------------- building (once a performance, a few kB)
  buildParticles() {
    const n = this.counts.particles, g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    const seed = new Float32Array(n * 4);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < n; i++) { seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = i % SLOTS; }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n;
    const m = this.parts = new THREE.Mesh(g, this.mats.parts);
    m.frustumCulled = false; m.renderOrder = 11; m.visible = false; m.name = 'show-particles';
    this.root.add(m);
  }

  /** The set, cards and beams for this stage (towers W apart). hl / hr: the ground under the towers from the centre's. */
  buildStage(size, hl, hr, items) {
    this.disposeStage();
    const nb = this.counts.beams, S = buildStage(size, hl, hr, { beams: nb });
    this.size = size; this.fixtures = S.fixtures; this.towers = S.towers;
    const stage = this.stage = new THREE.Mesh(S.geometry, this.mats.stage);
    stage.name = 'show-stage'; stage.frustumCulled = true;
    this.root.add(stage);
    // beams: one per can, sweeping in mirrored pairs; lasers: two fans from the tower tops
    const nl = items.lasers ? this.counts.lasers : 0, n = nb + nl;
    const cone = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), g = new THREE.InstancedBufferGeometry();
    g.index = cone.index; g.setAttribute('position', cone.getAttribute('position'));
    const O = new Float32Array(n * 4), A = new Float32Array(n * 4), Sz = new Float32Array(n * 4), Cc = new Float32Array(n * 4);
    const white = [1, 0.95, 0.85];
    for (let i = 0; i < nb; i++) {
      const f = S.fixtures[i], k = nb > 1 ? i / (nb - 1) - 0.5 : 0;
      O.set([f[0], f[1], f[2], 0], i * 4);
      A.set([-k * 0.5, -1.05 - 0.12 * (i & 1), 0.42, (i & 1) * Math.PI + k * 0.6], i * 4);
      Sz.set([7.2, 0.85, 0.55, 0], i * 4);
      Cc.set([...white, i & 1 ? 1 : 0.55], i * 4);
    }
    const lc = [[0.2, 1, 0.45], [0.2, 0.9, 1], [1, 0.3, 0.75]];
    for (let j = 0; j < nl; j++) {
      const i = nb + j, side = j < nl / 2 ? -1 : 1, jj = j % (nl / 2), t = S.towers[side < 0 ? 0 : 1], fan = nl > 2 ? jj / (nl / 2 - 1) - 0.5 : 0;
      O.set([t[0], t[1], t[2], 1], i * 4);
      A.set([side * 0.38, 0.2 + 0.05 * (jj & 1), fan * 1.6, jj * 0.7], i * 4);
      Sz.set([30, 0.012, 1.4, 0], i * 4);
      Cc.set([...lc[jj % 3], 0], i * 4);
    }
    for (const [k, v] of [['aO', O], ['aAim', A], ['aS', Sz], ['aC', Cc]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(v, 4));
    g.instanceCount = n;
    const beams = this.beams = new THREE.Mesh(g, this.mats.beams);
    beams.name = 'show-beams'; beams.frustumCulled = false; beams.renderOrder = 10; beams.visible = false;
    this.root.add(beams);
    // glow cards: the ground wash, the haze, a lens glow and a floor spot per beam
    const cards = [];
    cards.push({ a: [0, 0, 0.6, 0], b: [size.W + 3, size.back * 2 + 5, 1, 0] });
    cards.push({ a: [0, 2.5, -size.back + 0.25, 1], b: [size.W + 3, 5.2, 0.55, 0], c: [0.9, 0.75, 1] });
    for (let i = 0; i < nb; i++) {
      cards.push({ a: [...S.fixtures[i], 2], b: [0.55, 0.55, 0.4, i], c: white });
      cards.push({ a: [...S.fixtures[i], 3], b: [1.7, 1.7, Cc[i * 4 + 3], i], c: white, aim: A.slice(i * 4, i * 4 + 4) });
    }
    const gg = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    gg.index = q.index; gg.setAttribute('position', q.getAttribute('position'));
    const GA = new Float32Array(cards.length * 4), GB = new Float32Array(cards.length * 4), GM = new Float32Array(cards.length * 4), GC = new Float32Array(cards.length * 3);
    cards.forEach((c, i) => { GA.set(c.a, i * 4); GB.set(c.b, i * 4); if (c.aim) GM.set(c.aim, i * 4); GC.set(c.c || [1, 1, 1], i * 3); });
    gg.setAttribute('aA', new THREE.InstancedBufferAttribute(GA, 4)); gg.setAttribute('aB', new THREE.InstancedBufferAttribute(GB, 4));
    gg.setAttribute('aAim', new THREE.InstancedBufferAttribute(GM, 4)); gg.setAttribute('aCol', new THREE.InstancedBufferAttribute(GC, 3));
    gg.instanceCount = cards.length;
    const glow = this.glow = new THREE.Mesh(gg, this.mats.glow);
    glow.name = 'show-glow'; glow.frustumCulled = false; glow.renderOrder = 9; glow.visible = false;
    this.root.add(glow);
    this.U.uW.value = size.W; this.U.uTop.value = S.top;
  }

  disposeStage() {
    for (const k of ['stage', 'beams', 'glow']) { const m = this[k]; if (m) { m.removeFromParent(); m.geometry.dispose(); this[k] = null; } }
  }

  /** Compile the effects' shaders now (behind a loading moment), against the scene's fog and the frame's HDR target. */
  async warm(camera) {
    const R = this.g.renderer, r = R?.renderer; if (!r?.compileAsync) return;
    if (!this.stage) this.buildStage(stageSize(null), 0, 0, { lasers: true });
    const was = this.root.visible, vis = [this.stage, this.glow, this.beams, this.parts].map(m => m.visible);
    this.root.visible = true; for (const m of [this.stage, this.glow, this.beams, this.parts]) m.visible = true;
    // (the sticks' program too: an instanced mesh with instance colours, as the real one will be)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.1, 0, 0.1, 0, 0], 3)); sg.setAttribute('aGlow', new THREE.Float32BufferAttribute([1, 1, 1], 1));
    const dummy = new THREE.InstancedMesh(sg, this.mats.sticks, 1); dummy.setColorAt(0, new THREE.Color(1, 1, 1)); this.root.add(dummy);
    const prev = r.getRenderTarget(), rt = R.composer?.renderTarget1;
    let p;
    try { if (rt) r.setRenderTarget(rt); p = r.compileAsync(this.root, camera, this.g.scene); } finally { r.setRenderTarget(prev); }
    this.root.visible = was; [this.stage, this.glow, this.beams, this.parts].forEach((m, i) => { m.visible = vis[i]; });
    dummy.removeFromParent();
    let timer; await Promise.race([p, new Promise(res => { timer = setTimeout(res, 4000); })]); clearTimeout(timer);
    sg.dispose(); dummy.dispose();
  }

  // ---------------------------------------------------------------- a performance
  /**
   * Start for a performance. perf: the Performer (its clock, plan and song time); spot: { x, z, facing } the stage
   * frame's centre on the ground and the performers' facing (+z of the frame = toward the camera); group: { w, depth }
   * or null (solo); n: group size; ground(x, z) -> y or null (level).
   */
  start(perf, { spot, group = null, n = 1, ground = null } = {}) {
    const g = this.g, night = g.night || 0;
    this.perf = perf;
    this.items = showItems({ on: true, tier: g.renderer?.qualityName, night, group: n });
    this.cues = cuePlan(perf.plan, perf.clock, { night: isShowNight(night) });
    const size = stageSize(group), s = Math.sin(spot.facing), c = Math.cos(spot.facing);
    const H = (x, z) => (ground ? ground(spot.x + x * c + z * s, spot.z - x * s + z * c) : spot.y ?? g.world.heightAt(spot.x, spot.z));
    const y0 = spot.y ?? H(0, 0), hl = H(-size.W / 2, -size.back) - y0, hr = H(size.W / 2, -size.back) - y0;
    this.buildStage(size, hl, hr, this.items);
    this.root.position.set(spot.x, y0, spot.z); this.root.rotation.y = spot.facing;
    this.U.uGroundY.value = 0;
    const d = 1.5; this.U.uTilt.value.set((H(d, 0) - H(-d, 0)) / (2 * d), (H(0, d) - H(0, -d)) / (2 * d));
    this.root.visible = true; this.stage.visible = this.items.stage;
    this.on = true; this.want = 1; this.unfold = 0; this.fw = false;
    this.dayNight = isShowNight(night) ? 0 : 1;
    this.stats.draws = 0;
  }

  /** Fold the set away (it keeps drawing until folded) and end the effects. */
  stop() {
    this.want = 0; this.on = false; this.perf = null;
    if (this.fw) { this.g.fx?.fireworks(false); this.fw = false; }
    this.U.uBeamK.value = 0; this.U.uLaserK.value = 0; this.U.uHazeK.value = 0;
    this.setCrowd([]);
  }

  dispose() { this.stop(); this.disposeStage(); this.root.removeFromParent(); this.parts?.geometry.dispose(); this.sticks?.geometry.dispose(); for (const m of Object.values(this.mats)) m.dispose(); }

  // ---------------------------------------------------------------- the watchers' glow sticks and claps
  /**
   * The watchers (Town Life entries or NPCs with { n }): they wave a glow stick on the beat by night, clap on the beat by
   * day (the dance game's crowd clips, villager-*-dance, made ready for each body). Loads what it needs on demand.
   */
  async setCrowd(list) {
    const was = this.crowd; this.crowd = [];
    for (const e of was) { if (e.n.poser === e.poser) e.n.poser = null; e.give?.(); if (e.n.idleClip !== 'Idle') e.n.setIdle('Idle'); }
    if (!list.length || !this.on) { this.updateSticks(); return; }
    const a = this.g.assets, files = ['light-stick', 'villager-woman-dance', 'villager-man-dance'];
    if (!files.every(f => a.has(f))) await a.loadLater(files).catch(() => {});
    if (!this.on) return;
    const stickGl = a.gltf('light-stick');
    if (stickGl && !this.sticks) {
      const geo = gripGeometry(stickGl.scene);
      if (geo) {
        const m = this.sticks = new THREE.InstancedMesh(geo, this.mats.sticks, 12);
        m.name = 'show-sticks'; m.frustumCulled = false; m.count = 0; m.renderOrder = 0;
        const pal = [[1, 0.35, 0.7], [0.35, 0.75, 1], [1, 0.85, 0.3], [0.5, 1, 0.55]].map(v => new THREE.Color(...v));
        for (let i = 0; i < 12; i++) m.setColorAt(i, pal[i % pal.length]);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.g.scene.add(m);
      }
    }
    for (const it of list) {
      const n = it.n || it; if (!n?.anim || !n.model) continue;
      const kind = n.barkKind === 'man' ? 'man' : 'woman';   // (children and women share the women's pack: same moves, hips retargeted)
      const pack = a.gltf(`villager-${kind}-dance`); if (!pack) continue;
      const clips = prepareMoves(pack, n.model, pack.scene, true);
      const e = { n, give: lendClips(n.anim, clips), grip: n.model.getObjectByName('grip_R'), clip: '' };
      // the crowd's clips play at the beat: their time set from the song's beat before each mixer update
      e.poser = { before: () => this.beatPose(e), after: () => {} };
      n.poser = e.poser;
      this.crowd.push(e);
    }
    this.updateSticks();
  }

  /** A watcher's clip time from the beat: Clap (one beat a cycle) or StickWave (two beats: left, then right). */
  beatPose(e) {
    const P = this.perf, anim = e.n.anim; if (!P || !anim) return;
    const night = this.dayNight === 0, want = night ? 'StickWave' : 'Clap';
    // (their walk over ends on 'Idle' in the callers' own code: the beat clip is their idle again once they stand)
    if (e.n.idleClip !== want && anim.has(want) && !e.n.path) { e.clip = want; e.n.setIdle(want); }
    const a = anim.current; if (!a || anim.currentName !== want) return;
    const b = P.clock.beatAt(Math.min(P.t, P.plan.end)), per = want === 'Clap' ? 1 : 2, L = a.getClip().duration;
    a.timeScale = 0;
    a.time = b >= 0 ? ((b / per) % 1) * L : 0;
  }

  updateSticks() {
    const m = this.sticks; if (!m) return;
    let k = 0;
    if (this.on && this.dayNight === 0 && this.items.sticks) for (const e of this.crowd) {
      if (!e.grip || !e.n.visible || e.n.far || e.n.unseen || k >= 12) continue;
      e.grip.updateWorldMatrix(true, false);
      m.setMatrixAt(k++, e.grip.matrixWorld);
    }
    m.count = k; m.visible = k > 0;
    if (k) { m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, k * 16); m.instanceMatrix.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- every frame
  /** dt: seconds; camera: the view camera (laser width in pixels). */
  update(dt, camera) {
    const U = this.U, g = this.g;
    // unfold / fold (the set rises in ~2 s; it folds in ~1 s after the song)
    this.unfold += (this.want - this.unfold) > 0 ? Math.min(this.want - this.unfold, dt / 2.2) : Math.max(this.want - this.unfold, -dt / 1.1);
    U.uUnfold.value = this.unfold;
    if (!this.on && this.unfold <= 0.001) { if (this.root.visible) { this.root.visible = false; this.parts.visible = false; } this.updateSticks(); return; }
    const P = this.perf, night = g.night || 0;
    U.uNight.value = night;
    // the sun for the set's metal (the valley's own), the light by day and night
    const sun = g.world?.sky?.sun;
    if (sun) U.uSun.value.copy(sun.position).sub(sun.target?.position || _o).normalize();
    U.uAmb.value = lerp(0.55, 0.16, night); U.uDiff.value = lerp(0.8, 0.05, night);
    if (camera?.isPerspectiveCamera) { const r = g.renderer?.renderer; const h = r ? r.getDrawingBufferSize(_v2).y : innerHeight; U.uPxK.value = 0.5 * h * camera.projectionMatrix.elements[5]; }
    if (P) {
      const t = Math.min(P.t, P.plan.end), c = P.clock, it = this.items, n = this.dayNight === 0;
      U.uT.value = t;
      const w = washAt(c, t, _w); U.uWash.value.setRGB(w[0], w[1], w[2]);
      U.uPulse.value = pulseAt(c, t);
      U.uLevel.value = lerp(U.uLevel.value, 0.35 + 0.65 * levelAt(c, t), 1 - Math.exp(-dt * 3));
      const b = c.beatAt(t);
      U.uSweep.value = (b > 0 ? b : 0) * Math.PI / 4;
      U.uFan.value = 0.55 + 0.4 * Math.sin(U.uSweep.value * 2);
      const intro = smooth01((this.unfold - 0.6) / 0.4);
      U.uBeamK.value = it.beams ? intro * smooth01((night - 0.35) / 0.3) : 0;
      U.uLaserK.value = it.lasers && inWindows(this.cues.lasers, t) ? intro : lerp(U.uLaserK.value, 0, 1 - Math.exp(-dt * 6));
      U.uGlowK.value = it.glow ? intro * (0.12 + 0.48 * night) : 0;
      U.uHazeK.value = it.glow ? intro * 0.09 * smooth01((night - 0.35) / 0.3) : 0;
      // bursts: the newest four that have started (slot = index % 4); a slot keeps its night or day look for its flight
      slotTimes(this.cues.bursts, t, U.uBurst.value);
      for (let k = 0; k < SLOTS; k++) U.uMode.value[k] = n ? 0 : 1;
      let alive = false; for (let k = 0; k < SLOTS; k++) if (t - U.uBurst.value[k] < 12) alive = true;
      this.parts.visible = it.particles && alive;
      // fireworks over the last chorus at night (the valley's own, fx/fx.js: on the game clock)
      const F = this.cues.fireworks, fwOn = it.fireworks && F && t >= F.t0 && t < F.t1;
      if (fwOn !== this.fw && g.fx) {
        this.fw = fwOn;
        if (fwOn) { const s = Math.sin(this.root.rotation.y), cc = Math.cos(this.root.rotation.y), p = this.root.position; g.fx.fireworks(true, new THREE.Vector3(p.x - s * 45, p.y - 8, p.z - cc * 45), F.t1 - t + 2); }
        else g.fx.fireworks(false);
      }
    } else { U.uBeamK.value = 0; U.uLaserK.value = 0; U.uGlowK.value *= 0.9; U.uHazeK.value *= 0.9; this.parts.visible = false; }
    this.beams.visible = U.uBeamK.value > 0.002 || U.uLaserK.value > 0.002;
    this.glow.visible = U.uGlowK.value > 0.002 || U.uBeamK.value > 0.002;
    this.stage.visible = this.items.stage || !this.on;
    this.updateSticks();
    this.stats.draws = [this.stage, this.glow, this.beams, this.parts, this.sticks].filter(m => m?.visible && m.parent && this.root.visible !== false).length;
  }
}
const _w = [0, 0, 0], _v2 = new THREE.Vector2(), _o = new THREE.Vector3();
