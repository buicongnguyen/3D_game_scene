// Firefly jar (docs/RURAL-TRICKS.md trick 1): summer night at the paddy edge. Three kinds of firefly blink there, each
// on its own rhythm (rules-firefly.js): little green Heike (quick), big yellow Genji over the water (slow, neighbours in
// unison) and now and then a tiny golden Hime (rare, very shy). They are shy: Mika walks softly, or the ones round her
// dim and drift off for a while. A firefly inside the net's reach wears a thin ring; when the ring shines (it glows),
// one sweep takes every glowing one in reach, and several at once are worth more. Caught ones fly into the jar, which
// glows in their colours. Ten make a lantern: Mika carries the jar along Grandma's dark path, its light reveals a note,
// and then every firefly goes home, drifting up out of the jar. ambient(): a blinking swarm over the paddies.
//
// Drawing: one THREE.Points draw call per swarm (additive soft dots; glow, size and ring written each frame for ≤ 48
// points), one arc on the ground for the net's reach, one pooled light for the jar, a ground glow disc for the finale.
// Nothing allocates per frame.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { inHours } from '../../content/tricks.js';
import { PADDIES } from '../../world/layout.js';
import { VEG_BEDS } from '../../world/fields.js';
import { creepFilter } from './bugkit.js';
import { addCss, trampleGrass } from './util.js';
import {
  FIREFLY as F, KINDS, HEIKE, GENJI, HIME, Jar, blink, rng, noiseOf, scareRadius, inNet, catchable, litFor, jarGlow, jarColour,
  nextKind, groupSize, himeWait, levelPlan, stageAt, breezeAt, Wish, WISH,
} from './rules-firefly.js';

export { blink };

const MAX = 56;                // fireflies in a round's swarm (live + flying + in the jar)
const START = 16;              // about how many fly when the round begins
const KEEP = 10;               // fresh ones drift in while fewer than this are free
const LANTERN = F.lantern;     // caught fireflies that make the jar a lantern (the finale)
const RADIUS = 8;              // the swarm's spread around the place
const FLY_TIME = 0.55;         // seconds from the net into the jar

/** The jar's light never gets brighter than this, however many are in it (at 9 it burnt Mika's coat and face to white). */
export const JAR_LIGHT = 2.6;
/** A firefly can be caught while it glows at least this much. */
export const CATCHABLE = F.catchable;

// One sprite per firefly: a soft dot in the kind's colour (a little four-point sparkle for the rare one) and, while it
// is inside the net's reach, a thin ring round it: faint while it is dark, bright when it can be caught.
const VERT = `
attribute float aGlow;
attribute float aSize;
attribute float aMark;
attribute vec4 aLook;
uniform float uScale;
varying float vGlow;
varying float vMark;
varying float vDot;
varying vec4 vLook;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dotSize = aSize * (0.3 + aGlow);
  float s = aMark > 0.0 ? max(dotSize * 1.12, 1.05) : dotSize;
  gl_PointSize = s * uScale / max(0.6, -mv.z);
  vDot = dotSize / max(s, 0.0001);
  vGlow = aGlow;
  vMark = aMark;
  vLook = aLook;
}`;
const FRAG = `
varying float vGlow;
varying float vMark;
varying float vDot;
varying vec4 vLook;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float d = length(p);
  float dd = d / max(vDot, 0.0001);
  float a = smoothstep(1.0, 0.0, dd);
  a = a * a * (0.12 + vGlow * 1.25);
  vec3 c = mix(vLook.rgb * vec3(0.5, 0.62, 0.5), mix(vLook.rgb, vec3(1.0, 1.0, 0.8), 0.3), vGlow);
  vec2 q = abs(p) / max(vDot, 0.0001);
  float spark = max(0.0, 1.0 - min(q.x, q.y) * 10.0) * max(0.0, 1.0 - max(q.x, q.y));
  a += vLook.a * vGlow * spark * 0.8;
  float ring = smoothstep(0.065, 0.0, abs(d - 0.88)) * vMark;
  gl_FragColor = vec4(c * a + vec3(1.0, 0.97, 0.66) * ring * 0.8, 1.0);
}`;

/** A swarm of n fireflies drawn as one Points object. Each has a kind, a home, a wander, a blink rhythm and a state. */
class Swarm {
  constructor(scene, n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.glow = new Float32Array(n);
    this.size = new Float32Array(n);
    this.mark = new Float32Array(n);         // the ring: 0 none, faint (in reach, dark), 1 (in reach and glowing)
    this.look = new Float32Array(n * 4);     // colour r, g, b and the rare one's sparkle
    this.home = new Float32Array(n * 3);
    this.ph = new Float32Array(n * 4);       // wander phases (3) + blink phase
    this.period = new Float32Array(n);
    this.lit = new Float32Array(n);          // the lit share of its period
    this.kind = new Uint8Array(n);
    this.state = new Uint8Array(n);          // 0 hidden, 1 free, 2 flying to the jar, 3 in the jar, 4 released
    this.st = new Float32Array(n);           // seconds in the current state
    this.from = new Float32Array(n * 3);     // where a flight began
    this.shy = new Float32Array(n);          // 0 at home .. 1 scared off (dim, risen, drifted away)
    this.shyT = new Float32Array(n);         // seconds it stays away
    this.flee = new Float32Array(n * 2);     // the way it drifts off (x, z)
    this.jarDim = 1;
    this.wx = 0; this.wz = 0;                // the breeze: how far (m) it has pushed the free ones just now (the Difficult level)
    const geo = new THREE.BufferGeometry();
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('aGlow', dyn(this.glow, 1));
    geo.setAttribute('aSize', dyn(this.size, 1));
    geo.setAttribute('aMark', dyn(this.mark, 1));
    geo.setAttribute('aLook', dyn(this.look, 4));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
  }

  /** Put firefly i at its home. wander: three phases shared by its group (it keeps close to its neighbours). */
  spawn(i, kind, x, y, z, period, phase, lit, w0, w1, w2) {
    const j = i * 3, q = i * 4, c = KINDS[kind].colour;
    this.home[j] = x; this.home[j + 1] = y; this.home[j + 2] = z;
    this.ph[q] = w0; this.ph[q + 1] = w1; this.ph[q + 2] = w2; this.ph[q + 3] = phase;
    this.period[i] = period; this.lit[i] = lit; this.kind[i] = kind;
    this.look[q] = c[0]; this.look[q + 1] = c[1]; this.look[q + 2] = c[2]; this.look[q + 3] = kind === HIME ? 1 : 0;
    this.geo.attributes.aLook.needsUpdate = true;
    this.state[i] = 1; this.st[i] = 0; this.shy[i] = 0; this.shyT[i] = 0; this.mark[i] = 0;
  }

  free() { let c = 0; for (let i = 0; i < this.n; i++) if (this.state[i] === 1) c++; return c; }
  slot() { for (let i = 0; i < this.n; i++) if (this.state[i] === 0 || this.state[i] === 4 && this.st[i] > 6) return i; return -1; }

  /** Send firefly i off, away from (x, z), for `secs`. */
  startle(i, x, z, secs) {
    const j = i * 3;
    let dx = this.pos[j] - x, dz = this.pos[j + 2] - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { dx = Math.sin(this.ph[i * 4]); dz = Math.cos(this.ph[i * 4]); } else { dx /= d; dz /= d; }
    // (one already drifting keeps its way: it must not snap sideways)
    if (this.shy[i] < 0.05) { this.flee[i * 2] = dx; this.flee[i * 2 + 1] = dz; }
    this.shyT[i] = Math.max(this.shyT[i], secs);
  }

  /** Mika at (x, z) making `noise` (0..1): the free ones inside their fright radius take off. Returns how many newly did. */
  scare(x, z, noise, mode) {
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== 1) continue;
      const r = scareRadius(noise, this.kind[i], mode), j = i * 3;
      if (r <= 0) continue;
      const dx = this.pos[j] - x, dz = this.pos[j + 2] - z;
      if (dx * dx + dz * dz > r * r) continue;
      if (this.shyT[i] <= 0 && this.shy[i] < 0.3) n++;
      this.startle(i, x, z, F.shyFor);
    }
    return n;
  }

  /** Move and blink everyone. jar: world point of the jar (or null). */
  update(dt, t, jar, scale) {
    const P = this.pos, H = this.home, ph = this.ph;
    this.mat.uniforms.uScale.value = scale;
    let jarred = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i], j = i * 3, q = i * 4, size = KINDS[this.kind[i]].size;
      this.st[i] += dt;
      if (s === 0) { this.size[i] = 0; this.glow[i] = 0; this.mark[i] = 0; continue; }
      if (s === 1) {
        // a lazy figure-of-eight around home, and a slow rise and fall; a scared one dims, rises and drifts off
        const fade = Math.min(1, this.st[i] / 1.2);
        let sh = this.shy[i];
        if (this.shyT[i] > 0) { this.shyT[i] -= dt; sh += (1 - sh) * Math.min(1, dt * 3.2); } else if (sh > 0) sh = Math.max(0, sh - dt * 0.5);
        this.shy[i] = sh;
        const e = sh * sh * (3 - 2 * sh);
        const wind = 0.75 + 0.25 * Math.sin(ph[q + 1]);        // (light ones are carried a little further)
        P[j] = H[j] + Math.sin(t * 0.55 + ph[q]) * 0.65 + Math.sin(t * 0.23 + ph[q + 2]) * 0.4 + this.flee[i * 2] * e * F.flee + this.wx * wind;
        P[j + 1] = H[j + 1] + Math.sin(t * 0.8 + ph[q + 1]) * 0.22 + e * F.rise;
        P[j + 2] = H[j + 2] + Math.cos(t * 0.47 + ph[q + 2]) * 0.65 + Math.sin(t * 0.31 + ph[q]) * 0.35 + this.flee[i * 2 + 1] * e * F.flee + this.wz * wind;
        this.glow[i] = blink(t, this.period[i], ph[q + 3], this.lit[i]) * fade * (1 - 0.9 * e);
        this.size[i] = size;
      } else if (s === 2) {
        const k = Math.min(1, this.st[i] / FLY_TIME), e = k * k * (3 - 2 * k);
        P[j] = this.from[j] + (jar.x - this.from[j]) * e;
        P[j + 1] = this.from[j + 1] + (jar.y + 0.12 - this.from[j + 1]) * e + Math.sin(Math.PI * k) * 0.5;
        P[j + 2] = this.from[j + 2] + (jar.z - this.from[j + 2]) * e;
        this.glow[i] = 1; this.size[i] = Math.min(0.6, size); this.mark[i] = 0;
        if (k >= 1) { this.state[i] = 3; this.st[i] = 0; }
      } else if (s === 3) {
        // inside the jar: a tiny buzz, always softly lit
        P[j] = jar.x + Math.sin(t * 3.1 + ph[q]) * 0.05;
        P[j + 1] = jar.y + 0.1 + Math.sin(t * 2.3 + ph[q + 1]) * 0.06;
        P[j + 2] = jar.z + Math.cos(t * 2.7 + ph[q + 2]) * 0.05;
        // (additive dots on one spot add up: the more there are in the jar, the dimmer each one, so the jar glows and
        // Mika beside it is never washed out to a yellow blob)
        this.glow[i] = (0.55 + 0.45 * Math.sin(t * 4 + ph[q + 3] * 6.28)) * this.jarDim;
        this.size[i] = 0.17; this.mark[i] = 0; jarred++;
      } else if (s === 4) {
        // released: up out of the jar, spiralling apart, fading over a few seconds
        const a = Math.max(0, this.st[i]);    // a little wait in the jar first (negative time)
        P[j] = this.from[j] + Math.sin(a * 1.3 + ph[q]) * a * 0.6;
        P[j + 1] = this.from[j + 1] + a * (0.7 + (ph[q + 1] / 6.28) * 0.5);
        P[j + 2] = this.from[j + 2] + Math.cos(a * 1.3 + ph[q]) * a * 0.6;
        this.glow[i] = Math.max(0, 1 - a / 6) * (0.4 + 0.6 * blink(t, this.period[i], ph[q + 3], 0.5));
        this.size[i] = a > 6 ? 0 : Math.min(0.6, size); this.mark[i] = 0;
      }
    }
    this.jarDim = jarred > 2 ? 2 / jarred : 1;
    const at = this.geo.attributes;
    at.position.needsUpdate = true;
    at.aGlow.needsUpdate = true;
    at.aSize.needsUpdate = true;
    at.aMark.needsUpdate = true;
  }

  setVisible(on) { this.points.visible = on; }
  dispose() { this.points.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

/** Point size scale for the drawing buffer height (so the dots look the same on a phone and a monitor). */
const sizeScale = game => (game.renderer?.renderer?.domElement?.height || innerHeight) * 0.5;

/** Is (x, z) over the water of a flooded paddy? (The big Genji fireflies keep to the water.) */
function overWater(x, z) {
  for (const p of PADDIES) {
    if (VEG_BEDS.has(p.id)) continue;
    if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) return true;
  }
  return false;
}

/**
 * A little group of one kind flies in round a spot inside the place: Genji over the water when there is some, nobody
 * right on top of Mika (avoid: her position, or null). Neighbours wander together; Genji neighbours also blink together.
 * Returns how many came.
 */
function spawnGroup(sw, kind, c, world, rand, mode, avoid) {
  const K = KINDS[kind];
  let x = c.x, z = c.z;
  for (let tries = 0; tries < 10; tries++) {
    const a = rand() * 6.283, r = Math.sqrt(rand()) * RADIUS;
    x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
    const clear = !avoid || Math.hypot(x - avoid.x, z - avoid.z) > (kind === HIME ? 4.5 : 3);
    if (clear && (kind !== GENJI || overWater(x, z))) break;
  }
  const n = groupSize(rand, kind), lit = litFor(kind, mode);
  const period = K.period[0] + rand() * (K.period[1] - K.period[0]), phase = rand();
  const w0 = rand() * 6.283, w1 = rand() * 6.283, w2 = rand() * 6.283;
  let came = 0;
  for (let k = 0; k < n; k++) {
    const i = sw.slot();
    if (i < 0) break;
    const a = rand() * 6.283, r = n > 1 ? 0.3 + rand() * 0.5 : 0;
    const hx = x + Math.cos(a) * r, hz = z + Math.sin(a) * r;
    const y = world.heightAt(hx, hz) + K.height[0] + rand() * (K.height[1] - K.height[0]);
    const own = K.unison ? period : K.period[0] + rand() * (K.period[1] - K.period[0]);
    sw.spawn(i, kind, hx, y, hz, own, K.unison ? phase + (rand() - 0.5) * 0.03 : rand(), lit, w0 + (rand() - 0.5) * 0.7, w1 + (rand() - 0.5) * 0.7, w2 + (rand() - 0.5) * 0.7);
    came++;
  }
  return came;
}

// --------------------------------------------------------------------- props
function makeNet(assets) {
  const m = assets.clone('bug-net');
  if (m) return m;
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#a8743c', roughness: 0.8 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.95, 6), wood);
  stick.position.y = 0.42;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 5, 14), wood);
  hoop.position.y = 1.04;
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.32, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#f4f1e6', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
  bag.position.set(0, 1.04, -0.14); bag.rotation.x = -Math.PI / 2;
  g.add(stick, hoop, bag);
  g.userData.own = [wood, stick.geometry, hoop.geometry, bag.geometry, bag.material];   // made here: freed with the round
  return g;
}

function makeJar(assets) {
  const m = assets.clone('glass-jar');
  if (m) return m;
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.24, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#d9f3ff', transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.12;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12), new THREE.MeshStandardMaterial({ color: '#c79a52', roughness: 0.7 }));
  lid.position.y = 0.255;
  g.add(glass, lid);
  g.userData.own = [glass.geometry, glass.material, lid.geometry, lid.material];
  return g;
}

/** The jar's glow point: its 'Inside' node when the model has one (minus the swarm's 0.1 m lift), else its origin. */
function jarPoint(jar, out) {
  const inside = jar.userData.inside ??= jar.getObjectByName('Inside') || false;
  if (inside) { inside.getWorldPosition(out); out.y -= 0.1; } else jar.getWorldPosition(out);
  return out;
}

/**
 * The net's reach on the ground: a thin arc round the spot a metre ahead of her, open toward Mika (so it never crosses her).
 * Soft while nothing can be caught, bright when a sweep would catch something.
 */
function makeArc() {
  const gap = 1.9;
  const geo = new THREE.RingGeometry(0.965, 1, 44, 1, Math.PI / 2 + gap / 2, Math.PI * 2 - gap).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4;
  m.name = 'trick:net-reach';
  return m;
}

let glowTex = null;
function groundGlow() {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,170,0.9)'); gr.addColorStop(0.55, 'rgba(210,255,120,0.35)'); gr.addColorStop(1, 'rgba(200,255,120,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

// --------------------------------------------------------------------- the jar tally (HUD)
const CSS = `
.ffBox{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;padding:7px 10px 8px;border-radius:16px;
 background:rgba(255,247,232,.93);box-shadow:0 5px 16px rgba(40,20,0,.22);font:700 13px Nunito,system-ui,sans-serif;color:#5a3a22;text-align:center;zoom:var(--ui-scale,1);
 pointer-events:none;user-select:none;-webkit-user-select:none;white-space:nowrap}
.ffBox .row{display:flex;gap:6px;justify-content:center;align-items:center}
.ffBox .cnt{display:flex;align-items:center;gap:5px;padding:3px 9px 3px 4px;border-radius:999px;background:#27304f;color:#fff3d6}
.ffBox .cnt u{display:flex;align-items:center;justify-content:center;width:20px;height:20px;text-decoration:none}
.ffBox .cnt i{display:block;border-radius:50%;background:radial-gradient(circle,#fffde0 0 22%,var(--c) 55%,transparent 100%);box-shadow:0 0 6px 1px var(--c)}
.ffBox .cnt b{font:600 17px Fredoka,Nunito,sans-serif;min-width:12px}
.ffBox .cnt.pop{animation:ffPop .4s}
.ffBox .pips{display:flex;gap:4px;justify-content:center;margin-top:7px}
.ffBox .pips i{width:9px;height:9px;border-radius:50%;background:#e3d2b0;box-shadow:inset 0 0 0 1px #bfa57a66}
.ffBox .pips i.on{background:var(--c);box-shadow:0 0 5px var(--c),inset 0 0 0 1px #5a3a2233}
.ffBox .pips i:last-child{width:13px;height:13px;margin:-2px 0}
.ffBox .soft{display:flex;gap:8px;align-items:center;margin-top:6px}
.ffBox .bar{position:relative;flex:1;min-width:70px;height:10px;border-radius:5px;background:#ead9b8;overflow:hidden}
.ffBox .bar i{display:block;height:100%;width:0;border-radius:5px;background:#6cc24a}
.ffBox .bar i.mid{background:#f2b53a}.ffBox .bar i.hot{background:#e2572b}
.ffBox .bar b{position:absolute;top:0;bottom:0;width:2px;background:#5a3a22;opacity:.55}
.ffBox.end .soft,.ffBox.end .wish{display:none}
.ffBox .wish{display:none;gap:6px;align-items:center;justify-content:center;margin-top:6px;padding:3px 10px;border-radius:999px;background:#fff1cf}
.ffBox.wishing .wish{display:flex}
.ffBox .wish u{display:flex;align-items:center;justify-content:center;width:18px;height:18px;text-decoration:none;border-radius:50%;background:#27304f}
.ffBox .wish i{display:block;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,#fffde0 0 22%,var(--c) 55%,transparent 100%);box-shadow:0 0 5px 1px var(--c)}
.ffBox .wish b{font:600 16px Fredoka,Nunito,sans-serif;color:#c2541c}
.ffBox .wish.pop{animation:ffPop .4s}
.ffBox .plus{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:4px;padding:2px 12px;border-radius:999px;background:#27304f;color:#ffe45c;
 font:600 19px Fredoka,Nunito,sans-serif;opacity:0}
.ffBox .plus.go{animation:ffPlus 1.3s both}
@keyframes ffPop{40%{transform:scale(1.22)}}
@keyframes ffPlus{0%{opacity:0;transform:translate(-50%,6px) scale(.7)}15%{opacity:1;transform:translate(-50%,0) scale(1.1)}25%{transform:translate(-50%,0)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-4px)}}
/* a phone held upright: under the row of buttons at the top right. A phone on its side: tight under the round's pill, and the
   teacher's bubble goes down between the thumbs (in the middle of so low a screen it would lie on Mika and her fireflies) */
@media (max-width:520px){.ffBox{top:calc(114px + env(safe-area-inset-top,0px))}}
@media (max-height:460px){.ffBox{top:calc(66px + env(safe-area-inset-top,0px));padding:5px 8px 6px}.ffBox .pips{margin-top:5px}.ffBox .soft{margin-top:4px}
 body.ff-round #trickHint{bottom:calc(8px + env(safe-area-inset-bottom,0px));max-width:min(400px,46vw);padding:7px 12px;font-size:14px}}
`;
const DOT = [11, 18, 9];        // the chip dots, sized like the kinds (px)
/** What the kinds are called (their Japanese names, as a child there learns them). */
const NAMES = [N_('Heike'), N_('Genji'), N_('Hime')];
/** What the teacher says when a stage of the round begins (rules-firefly.js FF_LEVELS), by level. */
const STAGE_SAY = {
  normal: [null, N_('Part 2: the Genji hour! The big ones come out over the water.')],
  hard: [null, N_('Part 2: a breeze! The fireflies drift. Wait where they are going.'), N_('Part 3: the Genji hour! The breeze is dropping.')],
};

/** What is in the jar, by kind; ten pips to the lantern; how softly she walks. Text is only touched when a value changes. */
class JarBox {
  constructor() {
    addCss('ffCss', CSS);
    const el = this.el = document.createElement('div');
    el.className = 'ffBox';
    el.innerHTML = `<div class="row">${KINDS.map((k, i) => `<span class="cnt" style="--c:${k.css}"><u><i style="width:${DOT[i]}px;height:${DOT[i]}px"></i></u><span></span><b>0</b></span>`).join('')}</div>
      <div class="pips">${'<i></i>'.repeat(LANTERN)}</div>
      <div class="wish"><span class="wl"></span><u><i></i></u><span class="wn"></span><b></b></div>
      <div class="soft"><span class="lab"></span><div class="bar"><i></i><b></b></div></div><div class="plus"></div>`;
    document.body.appendChild(el);
    document.body.classList.add('ff-round');
    this.cnt = [...el.querySelectorAll('.cnt')];
    this.num = this.cnt.map(c => c.querySelector('b'));
    this.cnt.forEach((c, i) => { c.children[1].textContent = tx(NAMES[i]); });
    this.pips = [...el.querySelectorAll('.pips i')];
    el.querySelector('.lab').textContent = tx('Walk softly');
    this.fill = el.querySelector('.bar i');
    el.querySelector('.bar b').style.left = `${F.creep / F.run * 100}%`;
    this.plus = el.querySelector('.plus');
    this.shown = [0, 0, 0];
    this.lit = 0; this.pct = -1; this.cls = '';
    this.wEl = el.querySelector('.wish');
    this.wDot = this.wEl.querySelector('i'); this.wName = this.wEl.querySelector('.wn'); this.wNum = this.wEl.querySelector('b');
    this.wEl.querySelector('.wl').textContent = tx('Catch now:');
    this.wKind = -1; this.wText = '';
  }

  /** The kind asked for now (the Difficult level): its dot, its name and how many of them are in. */
  wish(w) {
    if (w.kind !== this.wKind) {
      this.wKind = w.kind;
      this.el.classList.add('wishing');
      this.wDot.style.setProperty('--c', KINDS[w.kind].css);
      this.wName.textContent = tx(NAMES[w.kind]);
      this.wEl.classList.remove('pop'); void this.wEl.offsetWidth; this.wEl.classList.add('pop');
    }
    const text = `${w.have}/${w.need}`;
    if (text !== this.wText) { this.wText = text; this.wNum.textContent = text; }
  }

  /** After a sweep: the counts, the next pips in the caught kinds' colours, and "+points". */
  caught(jar, got, points) {
    for (let k = 0; k < 3; k++) {
      if (jar.counts[k] === this.shown[k]) continue;
      this.shown[k] = jar.counts[k];
      this.num[k].textContent = jar.counts[k];
      const c = this.cnt[k];
      c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
      for (let n = 0; n < got[k] && this.lit < this.pips.length; n++) { const p = this.pips[this.lit++]; p.style.setProperty('--c', KINDS[k].css); p.classList.add('on'); }
    }
    const p = this.plus;
    p.textContent = `+${points}`;
    p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
  }

  /** How loud she is (her speed). */
  noise(speed) {
    const pct = Math.round(Math.min(1, speed / F.run) * 25) * 4, cls = speed <= F.creep ? '' : speed < 3 ? 'mid' : 'hot';
    if (pct !== this.pct) { this.pct = pct; this.fill.style.width = `${pct}%`; }
    if (cls !== this.cls) { this.cls = cls; this.fill.className = cls; }
  }

  end() { this.el.classList.add('end'); }
  dispose() { this.el.remove(); document.body.classList.remove('ff-round'); }
}

// --------------------------------------------------------------------- ambient
let amb = null;

export default {
  id: 'firefly',

  async play(ctx) {
    const { game: g, player: p, audio, fx, trick } = ctx;
    const world = g.world, scene = g.scene;
    await ctx.ensureModels(['bug-net', 'glass-jar', 'firefly', 'journal-page']);
    // night for the round (a fade hides the change), unless it already is
    const dark = inHours(g.shownHour(), trick.hours) && (g.night || 0) > 0.6;
    if (!dark) { await ctx.fade(true, 350); ctx.setNight(true, 22.5); await ctx.wait(0.1); await ctx.fade(false, 500); }

    // the net in Mika's right hand (her lantern hangs on her belt: the round asked for free hands), the jar on the ground beside the sign
    const grip = p.grip || p.model;
    const net = makeNet(g.assets);
    // grip_R carry poses from the artist: upright, and a raised catch for fireflies in the air (blended for the swing)
    if (grip !== p.model) net.rotation.set(Math.PI, 0, 0); else net.position.set(-0.28, 0.75, 0.1);
    net.traverse(o => { if (o.isMesh) o.castShadow = true; });
    grip.add(net);
    const jar = makeJar(g.assets);
    const fwd0 = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    const jx = p.pos.x + fwd0.z * 1.1, jz = p.pos.z - fwd0.x * 1.1;
    jar.position.set(jx, world.heightAt(jx, jz), jz);
    scene.add(jar);
    const grassBack = trampleGrass(world, jx, jz, 0.9);     // (or the jar and its glow are lost among the blades)
    const jarAt = new THREE.Vector3(), jarCol = new THREE.Color('#d8ff6a'), rgb = [0, 0, 0];
    const jarLight = g.lights.add({ pos: jarAt, color: jarCol, intensity: 0, range: 7 });
    const tamo = ctx.director?.tamo || null;
    if (tamo) tamo.calm = 0.3;                         // the fireflies are the lights of this round
    // (the summer night's drifting sparks look just like a Heike and cannot be caught: they rest while the round is on)
    const wild = fx?.fireflies?.points || null, wildOn = wild ? wild.visible : false;
    if (wild) wild.visible = false;

    const sw = new Swarm(scene, MAX);
    const arc = makeArc();
    scene.add(arc);
    const box = typeof document !== 'undefined' ? new JarBox() : null;
    // everything the round put in the valley goes back, however it ends (a quit, or an error half-way)
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      g.lights.remove(jarLight);
      if (tamo) tamo.calm = 1;
      if (wild) wild.visible = wildOn;
      sw.dispose();
      arc.removeFromParent(); arc.geometry.dispose(); arc.material.dispose();
      box?.dispose();
      grassBack?.();
      jar.removeFromParent();
      net.removeFromParent();
      for (const x of [...(net.userData.own || []), ...(jar.userData.own || [])]) x.dispose();
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };
    try {
    const centre = ctx.place;
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const rand = qa?.trickSeed !== undefined ? rng(qa.trickSeed) : Math.random;
    // the level decides (content/levels.js): Easy is gentle, Normal has the Genji hour, Difficult a breeze and a card of kinds to catch
    const mode = { easy: !!ctx.easy, first: !!ctx.first, genji: F.genjiShare, most: F.genjiMost };
    const plan = levelPlan(ctx.level, !!ctx.first), says = (!ctx.first && STAGE_SAY[ctx.level]) || [];
    const wish = plan.wish ? new Wish(rand) : null;
    let stage = 0, breeze = 0, wrongHint = 0, letGo = 0;
    mode.genji = plan.stages[0].genji; mode.most = plan.stages[0].most;
    const reach = mode.easy ? F.easyReach : F.reach, ahead = reach - F.behind;
    const touch = !!ctx.ui?.touch;
    const jarIn = new Jar(plan.jar);
    const free = [0, 0, 0], got = [0, 0, 0];
    if (wish) box?.wish(wish);
    let himeIn = 0, spawnIn = 0, arcOn = false;
    // who is there when she arrives: the common kinds, in little groups
    for (let n = 0, k = 0; n < START; k++) n += spawnGroup(sw, k % 4 === 1 ? GENJI : HEIKE, centre, world, rand, mode, p.pos);
    ctx.debug.swarm = sw;
    ctx.debug.phase = 'play';
    arc.scale.setScalar(reach);

    // she walks softly here: the stick's lower half (or Shift) is a tiptoe, as in the grasshopper meadow
    // (only while she catches: on the lantern walk afterwards she runs as she always does)
    const cs = { creeping: false }, softly = creepFilter(g.input, cs);
    let catching = true;
    ctx.beforeMove(() => { if (catching) softly(); });

    let left = ctx.roundTime, swing = 0, cool = 0, lastCatch = 0, missHint = 0, ready = 0, inReach = 0, scared = 0, misses = 0;
    const said = { shy: false, genji: false, hime: false, unison: false, half: false, lantern: false };
    const net0 = net.rotation.clone();
    const tip = new THREE.Vector3(), burstAt = new THREE.Vector3();
    const pose = { waiting: false };
    const BURST = { n: 10, color: [0.9, 1, 0.45], speed: 0.8, size: 0.1, gravity: -0.6 };
    ctx.debug.ready = () => ready > 0;
    ctx.debug.view = () => ({ level: ctx.level, stage, wish: wish ? { kind: wish.kind, have: wish.have, need: wish.need, filled: wish.filled } : null, letGo, score: jarIn.score, caught: jarIn.caught, counts: [...jarIn.counts], best: jarIn.best, bonus: jarIn.bonus, sweeps: jarIn.sweeps, misses, scared, free: [...free], ready, inReach, creeping: cs.creeping, speed: +p.speed.toFixed(2), left: +left.toFixed(1) });
    ctx.hint(ctx.first
      ? (touch ? N_('Push the stick gently to walk softly up to a firefly. When its ring shines, tap {act}.') : N_('Walk softly up to a firefly. When its ring shines, press {act}.'))
      : wish ? N_('Catch the kind the card asks for. The others fly off again!')
        : N_('Walk softly, and sweep when the rings shine!'), ctx.first ? 7 : 5);
    let hinted = 0;

    /** Where the net sweeps, and who is in it: rings on those in reach (bright on the ones that can be caught now). */
    const look = () => {
      tip.set(p.pos.x + Math.sin(p.facing) * ahead, p.pos.y + F.hoop, p.pos.z + Math.cos(p.facing) * ahead);
      ready = 0; inReach = 0; free[0] = free[1] = free[2] = 0;
      for (let i = 0; i < sw.n; i++) {
        if (sw.state[i] !== 1) continue;
        free[sw.kind[i]]++;
        const j = i * 3;
        if (sw.shy[i] > 0.3 || !inNet(sw.pos[j] - tip.x, sw.pos[j + 1] - tip.y, sw.pos[j + 2] - tip.z, reach)) { sw.mark[i] = 0; continue; }
        inReach++;
        if (catchable(sw.glow[i], mode.easy)) { ready++; sw.mark[i] = 1; } else sw.mark[i] = 0.3;
      }
    };

    /** One sweep: every glowing firefly in reach goes to the jar. A sweep through dark ones sends those off. */
    const sweep = t => {
      got[0] = got[1] = got[2] = 0;
      let off = 0;
      for (let i = 0; i < sw.n; i++) {
        if (sw.state[i] !== 1 || sw.mark[i] < 1) continue;
        // a card of kinds to catch: any other kind (but the rare Hime) is let go again, and flies off
        if (wish && sw.kind[i] !== HIME && sw.kind[i] !== wish.kind) { off++; sw.mark[i] = 0; sw.startle(i, p.pos.x, p.pos.z, F.shyFor); continue; }
        sw.state[i] = 2; sw.st[i] = 0; sw.mark[i] = 0;
        sw.from[i * 3] = sw.pos[i * 3]; sw.from[i * 3 + 1] = sw.pos[i * 3 + 1]; sw.from[i * 3 + 2] = sw.pos[i * 3 + 2];
        if (!got[0] && !got[1] && !got[2]) burstAt.set(sw.pos[i * 3], sw.pos[i * 3 + 1], sw.pos[i * 3 + 2]);
        got[sw.kind[i]]++;
      }
      const was = jarIn.caught, r = jarIn.sweep(got[0], got[1], got[2]);
      letGo += off;
      let plus = r.points;
      if (wish && r.n) {
        wish.take(got);
        if (wish.done) { jarIn.extra(WISH.bonus); plus += WISH.bonus; audio.star?.(); }
        box?.wish(wish);
      }
      if (r.n) {
        lastCatch = t;
        if (got[HIME]) himeIn = himeWait(rand);
        audio.twinkle(1.4); audio.good();
        if (r.n > 1) audio.chime?.(Math.min(4, r.n));
        fx.burst(burstAt, BURST);
        box?.caught(jarIn, got, plus);
        jarColour(jarIn.counts, rgb);
        jarCol.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
        // one thing is said at a time: the most special first
        const now = jarIn.caught;
        if (now >= LANTERN && !said.lantern) { said.lantern = true; ctx.hint(N_('Ten! The jar is a real lantern now.'), 3.5); }
        else if (wish?.done && !said.wish) { said.wish = true; ctx.hint(N_('That is the set! Now the next kind on the card.'), 4); }
        else if (got[HIME] && !said.hime) { said.hime = true; ctx.hint(N_('A Hime firefly, tiny and golden! A rare one: 3 points.'), 4.5); }
        else if (got[GENJI] && !said.genji) { said.genji = true; ctx.hint(N_('A Genji firefly! Big, with a slow blink. Worth 2 points.'), 4.5); }
        else if (r.n > 1 && !said.unison) { said.unison = true; ctx.hint(N_('More than one in a sweep! Fireflies caught together are worth more.'), 4.5); }
        else if (was === 0 && ctx.first) ctx.hint(got[HEIKE] ? N_('Got one! A little Heike firefly, with a quick blink.') : N_('Got one! Into the jar it goes.'), 3.5);
        else if (now >= 5 && !said.half && now < LANTERN) { said.half = true; ctx.hint(N_('Halfway to a lantern. Keep going!'), 3); }
        if (now >= 5) said.half = true;
        return;
      }
      if (off) {
        // only the wrong kind glowed: nothing for the jar
        if (wrongHint <= 0) { wrongHint = 6; audio.miss(); ctx.hint(N_('Not the kind on the card. Off it goes again!'), 3); }
        return;
      }
      if (!inReach) return;
      // nothing glowed: the swish sends the dark ones off (not in the guided try, nor in Easy mode)
      misses++;
      if (!mode.easy && !mode.first) for (let i = 0; i < sw.n; i++) if (sw.state[i] === 1 && sw.mark[i] > 0) sw.startle(i, p.pos.x, p.pos.z, F.missShy);
      if (missHint <= 0) {
        missHint = 4;
        audio.miss();
        ctx.hint(N_('Too early: it went dark. Wait for the glow, then sweep!'), 3);
      }
    };

    const res = await ctx.loop(dt => {
      left -= dt;
      const press = ctx.pressed() || g.input.pressed('tap');
      pose.waiting = swing <= 0 && !press;
      ctx.groundPose?.(pose);
      const t = ctx.t;
      // the round's stages: who flies in, and the breeze (it comes up and drops slowly)
      const k = stageAt(plan, ctx.roundTime - left, ctx.roundTime);
      if (k !== stage) {
        stage = k;
        mode.genji = plan.stages[k].genji; mode.most = plan.stages[k].most;
        spawnIn = 0;
        if (says[k]) { ctx.hint(says[k], 5.5); audio.chime?.(2); }
      }
      breeze += (plan.stages[stage].breeze - breeze) * Math.min(1, dt * 0.6);
      const push = breezeAt(t, breeze);
      sw.wx = push * 0.8; sw.wz = push * 0.6;
      wrongHint -= dt;
      jarPoint(jar, jarAt);
      jarLight.intensity = jarGlow(jarIn.caught, JAR_LIGHT);
      // her noise: the ones too close take off
      const noise = noiseOf(p.speed);
      if (noise > 0) {
        const n = sw.scare(p.pos.x, p.pos.z, noise, mode);
        scared += n;
        if (n && !said.shy && t > 2.5) {
          said.shy = true;
          // (a stick, on the screen or on a pad, has its own way to tiptoe)
          ctx.hint(touch || g.input.lastDevice === 'gamepad' ? N_('Too fast! They flew off. Push the stick gently and they come back.') : N_('Too fast! They flew off. Hold Shift to tiptoe and they come back.'), 4.5);
        }
      }
      sw.update(dt, t, jarAt, sizeScale(g));
      look();
      // the net's reach on the ground, a little ahead of her: it brightens when a sweep would catch something
      arc.position.set(tip.x, world.heightAt(tip.x, tip.z) + 0.07, tip.z);
      arc.rotation.y = p.facing;
      arc.material.opacity += ((ready ? 0.62 + Math.sin(t * 9) * 0.12 : cool > 0 ? 0.08 : 0.2) - arc.material.opacity) * Math.min(1, dt * 12);
      if (!ready !== !arcOn) { arcOn = !!ready; arc.material.color.set(arcOn ? '#c8ff7a' : '#fff3c4'); }
      box?.noise(p.speed);
      // swing the net: a quick sweep of the hand
      cool -= dt;
      if (swing > 0) {
        swing -= dt; const k = Math.sin(Math.max(0, 1 - swing / 0.3) * Math.PI);
        if (grip !== p.model) net.rotation.set(Math.PI + (-2.478 - Math.PI) * k, 1.281 * k, -0.626 * k);
        else net.rotation.set(net0.x + k * 0.9, net0.y, net0.z);
      }
      else net.rotation.copy(net0);
      if (press && cool <= 0) {
        swing = 0.3; cool = F.swingCool;
        p.gesture('Interact', { lock: false });
        audio.stroke();
        sweep(t);
      }
      missHint -= dt;
      // guided try: nudges when nothing is happening
      if (ctx.first && hinted === 0 && t > 12 && jarIn.caught === 0) { hinted = 1; ctx.hint(N_('Walk right up close. They glow, then go dark, then glow again.'), 4.5); }
      if (hinted < 2 && t - lastCatch > 18 && jarIn.caught > 0) { hinted = 2; ctx.hint(N_('Look for a few blinking together. The big Genji ones fly over the water.'), 4.5); }
      // fresh ones drift in from the edge so there is always someone to catch; now and then, the rare one
      himeIn -= dt; spawnIn -= dt;
      if (spawnIn <= 0) {
        const all = free[0] + free[1] + free[2];
        const hime = !mode.first && t >= F.himeAfter && himeIn <= 0 && free[HIME] === 0;
        if (all < KEEP || hime) { spawnGroup(sw, nextKind(rand, free, t, himeIn, mode), centre, world, rand, mode, p.pos); spawnIn = F.flyIn; }
      }
      ctx.hud(jarIn.score, left);
      if (left <= 0 || jarIn.full) return { done: true };
      return undefined;
    });
    net.rotation.copy(net0);
    catching = false;
    sw.mark.fill(0);
    arc.visible = false;
    box?.end();
    const caught = jarIn.caught;
    if (!res.quit && jarIn.full) {
      // a moment for the last ones to reach the jar, and for the good news
      ctx.hint(N_('The jar is full!'), 2.5);
      audio.chime?.(3);
      let w = 0;
      await ctx.loop(dt => { w += dt; jarPoint(jar, jarAt); sw.update(dt, ctx.t, jarAt, sizeScale(g)); return w > 1.6 ? true : undefined; });
    }

    let note = false;
    if (!res.quit && caught >= LANTERN) { ctx.debug.phase = 'finale'; note = await this.finale(ctx, { sw, jar, jarAt, jarLight, net, grip, caught }); }
    if (!ctx.quit) { ctx.debug.phase = 'release'; await this.release(ctx, { sw, jar, jarAt, jarLight }); }

    cleanup();
    if (!dark) { await ctx.fade(true, 300); ctx.setNight(false); await ctx.fade(false, 450); }
    const c = jarIn.counts;
    return {
      score: jarIn.score, caught, extra: note ? N_('the jar lit the path') : undefined, quit: res.quit && !caught,
      // the jar's tally under the score, already translated
      note: caught ? NAMES.map((name, i) => (c[i] ? `${tx(name)} ${c[i]}` : '')).filter(Boolean).join(' · ') : undefined,
      detail: { counts: [...c], best: jarIn.best, bonus: jarIn.bonus, level: ctx.level, wishes: wish ? wish.filled : 0, letGo },
    };
    } finally {
      cleanup();
    }
  },

  /** Ten fireflies: Mika carries the jar along the dark path; its light circle reveals a note from Grandma. */
  async finale(ctx, { sw, jar, jarAt, jarLight, net, grip }) {
    const { game: g, player: p, fx, audio, director: d } = ctx;
    const world = g.world;
    net.removeFromParent();
    jar.removeFromParent();
    jar.position.set(0, 0.115, -0.02);           // held by the neck (art contract)
    jar.rotation.set(grip !== p.model ? Math.PI : 0, 0, 0);
    if (grip === p.model) jar.position.set(-0.28, 0.75, 0.1);
    grip.add(jar);
    const disc = groundGlow();
    g.scene.add(disc);
    ctx.setNight(true, 23.6);
    // the note lies a few metres on toward the village (east), on dry ground
    const a = Math.atan2(1, 2.2), nx = ctx.place.x + Math.cos(a) * 7.5, nz = ctx.place.z + Math.sin(a) * 7.5;
    const note = g.assets.clone('journal-page') || new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshStandardMaterial({ color: '#fff6dc', side: THREE.DoubleSide }));
    note.position.set(nx, world.heightAt(nx, nz) + 0.12, nz);
    note.rotation.y = 0.6;
    note.visible = false;
    g.scene.add(note);
    ctx.debug.note = note.position;
    ctx.hint(N_('Now walk the dark path by its light. Look on the ground, toward the village.'), 5);
    let found = false, t0 = 0, nudged = false, r = null;
    try {
    r = await ctx.loop(dt => {
      t0 += dt;
      jarPoint(jar, jarAt);
      jarLight.intensity = JAR_LIGHT + 1 + Math.sin(ctx.t * 5) * 0.4;
      sw.update(dt, ctx.t, jarAt, sizeScale(g));
      disc.position.set(p.pos.x, world.heightAt(p.pos.x, p.pos.z) + 0.06, p.pos.z);
      const dn = Math.hypot(note.position.x - p.pos.x, note.position.z - p.pos.z);
      note.visible = dn < 3.6;
      if (note.visible && Math.floor(ctx.t * 4) % 2 === 0) fx.glint?.(note.position, false);
      if (!nudged && t0 > 14) {
        // still wandering: the note turns up a little way ahead of her
        nudged = true;
        const f = p.facing, x = p.pos.x + Math.sin(f) * 3, z = p.pos.z + Math.cos(f) * 3;
        note.position.set(x, world.heightAt(x, z) + 0.12, z);
        ctx.hint(N_('There! Something pale in the jar-light, just ahead.'), 3.5);
      }
      if (dn < 1.4) { found = true; return true; }
      return t0 > 32 ? true : undefined;
    });
    if (!r?.quit && found) {
      audio.pickup();
      p.gesture('Interact', { lock: false });
      ctx.lock(true);
      await ctx.say('trick_firefly_note');
      ctx.lock(false);
      const st = d.q.state;
      if (st.tricks.firefly) st.tricks.firefly.note = true;
    }
    } finally {
      note.removeFromParent();
      disc.removeFromParent();
      disc.geometry.dispose(); disc.material.dispose();
      if (!note.userData.model) { note.geometry?.dispose(); note.material?.dispose?.(); }   // the stand-in page
    }
    return found;
  },

  /** Every firefly goes home: up out of the jar, spiralling apart. */
  async release(ctx, { sw, jar, jarAt, jarLight }) {
    const { game: g, player: p, audio } = ctx;
    ctx.lock(true);
    jarPoint(jar, jarAt);
    const side = new THREE.Vector3(Math.cos(p.facing), 0, -Math.sin(p.facing));
    g.follow.cutscene({ pos: p.pos.clone().addScaledVector(side, 3.2).add(new THREE.Vector3(Math.sin(p.facing) * 2.2, 1.6, Math.cos(p.facing) * 2.2)), look: jarAt.clone().add(new THREE.Vector3(0, 1.2, 0)) }, 1.2);
    for (let i = 0; i < sw.n; i++) {
      if (sw.state[i] === 1) { sw.state[i] = 4; sw.st[i] = Math.random() * 2; sw.from.set(sw.pos.subarray(i * 3, i * 3 + 3), i * 3); }
      if (sw.state[i] === 2 || sw.state[i] === 3) { sw.state[i] = 4; sw.st[i] = -Math.random() * 1.2; sw.from[i * 3] = jarAt.x; sw.from[i * 3 + 1] = jarAt.y + 0.2; sw.from[i * 3 + 2] = jarAt.z; }
    }
    ctx.hint(N_('Lid off. Goodnight, fireflies, and thank you for the light.'), 4.5);
    p.gesture('Wave', { lock: false });
    audio.chime(4);
    let t0 = 0;
    const pose = { waiting: true };
    await ctx.loop(dt => {
      t0 += dt;
      ctx.groundPose?.(pose);
      jarLight.intensity = Math.max(0, JAR_LIGHT + 1 - t0 * 1.4);
      sw.update(dt, ctx.t, jarAt, sizeScale(g));
      return t0 > 5 ? true : undefined;
    });
    ctx.lock(false);
  },

  /** Summer nights: a blinking swarm over the paddy edge while Mika is near (one draw call, 40 points). */
  ambient(dt, ctx) {
    const g = ctx.game;
    if (ctx.off) { amb?.sw.setVisible(false); return; }
    if (!amb) {
      amb = { sw: new Swarm(g.scene, 40), t: 0 };
      const rand = rng(7), mode = { easy: false, first: false };
      for (let k = 0; amb.sw.free() < 38 && k < 60; k++) spawnGroup(amb.sw, k % 4 === 1 ? GENJI : HEIKE, ctx.place, g.world, rand, mode, null);
    }
    amb.sw.setVisible(true);
    amb.t += dt;
    amb.sw.update(dt, amb.t, null, sizeScale(g));
  },
};
