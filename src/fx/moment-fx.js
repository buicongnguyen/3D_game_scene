// © 2026 Bui Cong Nguyen · solluxlabs.com
// The weather moments' look (game/moments.js runs them; docs/WEATHER-MOMENTS.md). Nothing new to compile: a second
// Rainbow and a second Butterflies mesh use the programs the celebrations already compiled at load, and every
// particle goes into celebrate's precompiled GPU sprite systems (written once when emitted, then free). All of it
// hangs under celebrate.root, which the rooms hide indoors. No lights, no shadows.
import * as THREE from 'three';
import { Rainbow } from './cel-sky.js';
import { Butterflies } from './cel-critters.js';
import { KIND, lin, padTexture } from './cel-sprites.js';

// linear colours, made once (values above 1 bloom)
const GUST = {
  spring: { kind: KIND.PETAL, solid: true, cols: ['#ff9ec7', '#ffc4dc', '#f77fb0'].map(h => lin(h)) },
  summer: { kind: KIND.LEAF, solid: true, cols: ['#5fae3e', '#86c64a'].map(h => lin(h)) },
  autumn: { kind: KIND.LEAF, solid: true, cols: ['#e2381f', '#f06a1c', '#f5a623'].map(h => lin(h)) },
  winter: { kind: KIND.GLOW, solid: false, cols: [[1, 1, 1.05]] },
};
const DROP = [1.5, 1.6, 1.9], DROP_GLINT = [2.4, 2.3, 2.0];
const ICE = [2.2, 2.3, 2.6], ICE_GOLD = [2.4, 2.0, 1.2];
const TIP = [[2.2, 1.5, 1.2], [1.2, 2.0, 1.4], [1.2, 1.5, 2.4], [2.2, 1.9, 1.0]];

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _b = new THREE.Object3D(), _q = new THREE.Vector3();
_b.rotation.order = 'YXZ';
const rand = (a, b) => a + Math.random() * (b - a);
// The emit options, one object per kind of particle made once (every field SpriteSystem.emit reads is set): an
// emit only changes the size (and a leaf's colour), so it allocates nothing and sets two or three fields.
const BASE = { life: 2, size: 0.3, color: null, kind: KIND.GLOW, alpha: 1, gravity: 0, drag: 0, spin: 0, grow: 0, swirl: 0, flutter: 0, twinkle: 0, delay: 0, center: undefined };
const O = {
  leaf: { ...BASE, life: 4.5, flutter: 0.5, spin: 4, gravity: 0.6, drag: 0.2 },
  snow: { ...BASE, life: 4.5, flutter: 0.5, spin: 4, gravity: 0.4, drag: 0.2, alpha: 0.6, kind: KIND.GLOW, color: GUST.winter.cols[0] },
  drop: { ...BASE, life: 1.1, kind: KIND.GLOW, twinkle: 0.6, gravity: 2, color: DROP },
  glint: { ...BASE, life: 1.1, kind: KIND.SPARK, twinkle: 1, gravity: 2, color: DROP_GLINT },
  ice: { ...BASE, life: 2.6, kind: KIND.SPARK, twinkle: 1, gravity: 0.03, drag: 0.8, color: ICE },
  gold: { ...BASE, life: 2.6, kind: KIND.SPARK, twinkle: 1, gravity: 0.03, drag: 0.8, color: ICE_GOLD },
  tip: { ...BASE, life: 1.4, kind: KIND.SPARK, twinkle: 1, gravity: 1, drag: 0.6 },
};

/** A bird's wing for the flock (hinge at u = 0, leading edge at v = 0): swept back and pointed, darker primaries. */
function birdWing() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.beginPath();
  g.moveTo(0, 22);
  g.bezierCurveTo(20, 16, 44, 20, 63, 34);       // leading edge, out to the pointed tip
  g.lineTo(56, 38); g.lineTo(58, 41); g.lineTo(50, 43); g.lineTo(51, 46); g.lineTo(43, 47);   // primaries
  g.bezierCurveTo(30, 50, 14, 52, 0, 46);        // trailing edge back to the body
  g.closePath();
  const lg = g.createLinearGradient(0, 0, S, 0);
  lg.addColorStop(0, 'rgb(236,230,220)'); lg.addColorStop(0.55, 'rgb(214,206,194)'); lg.addColorStop(0.72, 'rgb(120,110,100)'); lg.addColorStop(1, 'rgb(70,62,56)');
  g.fillStyle = lg; g.fill();
  return padTexture(cv);
}

export class MomentFx {
  constructor(game) {
    this.g = game;
    const C = game.celebrate, R = game.renderer?.renderer;
    this.C = C;
    this.rainbow = new Rainbow();
    this.rainbow.mesh.name = 'moment:rainbow';
    this.flock = new Butterflies(12);
    const wing = this.flock.mat.uniforms.uWing;
    wing.value.dispose();                            // (the butterfly wing it came with: never uploaded)
    wing.value = birdWing();
    try { R?.initTexture?.(wing.value); } catch { /* uploaded on first sight instead */ }
    this.flock.mesh.name = 'moment:flock';
    for (const m of [this.rainbow.mesh, this.flock.mesh]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.visible = false; }
    C.root.add(this.rainbow.mesh, this.flock.mesh);
    this.aF = this.flock.aF.array;
  }

  dispose() {
    this.hideAll();
    this.C.root.remove(this.rainbow.mesh, this.flock.mesh);
    this.rainbow.mesh.geometry.dispose(); this.rainbow.mat.dispose();
    this.flock.mesh.geometry.dispose(); this.flock.mat.uniforms.uWing.value.dispose(); this.flock.mat.dispose();
  }

  hideAll() { this.hideRainbow(); this.hideFlock(); }
  hideRainbow() { this.rainbow.mesh.visible = false; this.rainbow.uniforms.uA.value = 0; }
  hideFlock() { const m = this.flock.mesh; m.visible = false; m.count = 0; }

  // ------------------------------------------------------------------ particles
  /** One leaf, petal or snow puff of a breeze: `side` (+1 / -1) is where it starts, to the right or left of the view. */
  gust(cam, yaw, side, season) {
    const P = GUST[season] || GUST.spring, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;    // (right = (-cos yaw, sin yaw))
    // (near enough to read on a phone: at 7-16 m a leaf is a few dozen pixels, and the stream crosses the narrow
    // upright view in about a second)
    const d = rand(6, 14), lat = side * rand(2, 11);
    _p.set(cam.x + fx * d + rx * lat, cam.y + rand(-2.2, 0.4), cam.z + fz * d + rz * lat);
    const s = -side * rand(5, 7.5), ahead = rand(-1, 1);
    _v.set(rx * s + fx * ahead, rand(0.5, 1.5), rz * s + fz * ahead);
    if (!P.solid) { O.snow.size = rand(0.25, 0.4); this.C.glow.emit(_p, _v, O.snow); return; }
    const o = O.leaf;
    o.size = rand(0.26, 0.4); o.color = P.cols[(Math.random() * P.cols.length) | 0]; o.kind = P.kind;
    this.C.solid.emit(_p, _v, o);
  }

  /**
   * A sunlit drop of a sun shower, somewhere in a wedge (half-angle `half`, radians) ahead of the camera. It starts
   * just under the frame's top edge (the camera sees only ~10° above its eye) and falls through the picture at a
   * real drop's pace, so it is seen for most of its life; one in four is a bright glint.
   */
  drop(cam, yaw, half) {
    const a = yaw + rand(-half, half), d = rand(3, 16);
    _p.set(cam.x + Math.sin(a) * d, cam.y + d * rand(0.06, 0.17), cam.z + Math.cos(a) * d);
    _v.set(0.3, -6.5, 0.15);
    const o = Math.random() < 0.25 ? O.glint : O.drop;
    o.size = o === O.glint ? rand(0.14, 0.2) : rand(0.08, 0.12);
    this.C.glow.emit(_p, _v, o);
  }

  /** A crystal of diamond dust, 3-14 m ahead within `half` radians, about the camera's height. */
  sparkle(cam, yaw, half) {
    const a = yaw + rand(-half, half), d = rand(3, 14);
    _p.set(cam.x + Math.sin(a) * d, cam.y + rand(-2, 2), cam.z + Math.cos(a) * d);
    _v.set(rand(-0.15, 0.15), rand(-0.05, 0.1), rand(-0.15, 0.15));
    const o = Math.random() < 0.7 ? O.ice : O.gold;
    o.size = rand(0.08, 0.15);
    this.C.glow.emit(_p, _v, o);
  }

  // ------------------------------------------------------------------ the rainbow
  /** Stand the arch at `at` ({x, y, z, sx, sy}: moments-rules rainbowAt), not yet drawn. */
  placeRainbow(at) {
    const m = this.rainbow.mesh;
    m.position.set(at.x, at.y, at.z);
    m.scale.set(at.sx, at.sy, 1);
    this.rainbow.uniforms.uReveal.value = 0;
    this.rainbow.uniforms.uA.value = 0;
    m.visible = true;
  }

  /** This frame's reveal (0..1.2), alpha and place (it keeps its angles as the camera moves); it faces the camera. */
  drawRainbow(reveal, alpha, camPos, at) {
    const U2 = this.rainbow.uniforms, m = this.rainbow.mesh;
    U2.uReveal.value = reveal; U2.uA.value = alpha;
    if (at) { m.position.set(at.x, at.y, at.z); m.scale.set(at.sx, at.sy, 1); }
    this.rainbow.face(camPos);
  }

  /** A spark off the arch's growing tip (as the finale's rainbow does, fewer). */
  rainbowTip(reveal) {
    const m = this.rainbow.mesh, th = Math.PI * (1 - Math.min(1, reveal)), yaw = m.rotation.y;
    const lx = Math.cos(th) * m.scale.x * 0.94, ly = Math.sin(th) * m.scale.y * 0.94;
    _p.set(m.position.x + lx * Math.cos(yaw), m.position.y + ly, m.position.z - lx * Math.sin(yaw));
    _v.set(rand(-0.8, 0.8), rand(-0.8, 0.4), rand(-0.8, 0.8));          // (the arch is drawn 40 m out: sizes to suit)
    const o = O.tip;
    o.size = rand(0.7, 1.2); o.color = TIP[(Math.random() * TIP.length) | 0];
    this.C.glow.emit(_p, _v, o);
  }

  /** Where the arch's apex is (world), into `out`. */
  rainbowApex(out = _q) {
    const m = this.rainbow.mesh;
    return out.set(m.position.x, m.position.y + m.scale.y * 0.97, m.position.z);
  }

  // ------------------------------------------------------------------ the flock
  /** Show `n` birds tinted `tint` [r, g, b] flapping at `flap` rad/s (per-bird phase); call setBird for each. */
  flockOn(n, tint, flap) {
    const m = this.flock.mesh, c = m.instanceColor.array, a = this.aF;
    m.count = n; m.visible = true;
    for (let i = 0; i < n; i++) {
      c[i * 3] = tint[0]; c[i * 3 + 1] = tint[1]; c[i * 3 + 2] = tint[2];
      a[i * 4] = i * 0.73 + (i % 3) * 1.9; a[i * 4 + 1] = flap * (0.94 + 0.12 * ((i * 0.618) % 1)); a[i * 4 + 2] = 0; a[i * 4 + 3] = 0;
    }
    m.instanceColor.needsUpdate = true;
    this.flock.aF.needsUpdate = true;
  }

  /** Bird i at (x, y, z), heading yaw (model +Z forward), pitch, bank; scale (sx, sy, sz); alpha 0..1. */
  setBird(i, x, y, z, yaw, pitch, bank, sx, sy, sz, alpha) {
    _b.position.set(x, y, z);
    _b.rotation.set(pitch, yaw, bank);
    _b.scale.set(sx, sy, sz);
    _b.updateMatrix();
    this.flock.mesh.setMatrixAt(i, _b.matrix);
    this.aF[i * 4 + 2] = alpha;
  }

  /** After the setBird calls of a frame. */
  flockDone() {
    this.flock.mesh.instanceMatrix.needsUpdate = true;
    this.flock.aF.needsUpdate = true;
  }
}
