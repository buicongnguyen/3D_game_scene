// What the yard games draw while they are played: the shuttle and the volleyball with their shadow blob, the jump rope,
// the tug-of-war rope and flag, the oan quan pebbles, the sacks and the marbles. Every view is a handful of meshes made
// once (instanced where there are many), shared by every yard, and moved each frame: nothing is allocated while a game
// runs. The still things (lines, banners, nets) are built into the yard itself by world/yard.js.
//
// A view: attach(S, y0) puts it on a stage (content/yard.js stageOf) at ground height y0; update(sim, dt) shows the
// sim's state; hide() takes it off the screen; dispose() frees it. All of them read the sim only.
import * as THREE from 'three';
import { toWorld, toCourt } from '../../content/yard.js';
import { shuttleGeometry } from '../../world/yard.js';
import { RING as MARBLE_RING } from './marbles.js';
import { HANDS } from './rope.js';

const W = { x: 0, z: 0 }, W2 = { x: 0, z: 0 }, R3 = { u: 0, v: 0, y: 0 }, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), SC = new THREE.Vector3(), E = new THREE.Euler();
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

/** Where the tug-of-war rope runs: hand height of a child leaning back, just in front of the pullers (stage v, metres up). */
export const TUG_ROPE = { v: 0.2, y: 0.72 };

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const flatMesh = (g, color, opacity) => {
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false;
  return m;
};

class View {
  constructor(scene, quality) { this.scene = scene; this.q = quality || {}; this.S = { x: 0, z: 0, rot: 0 }; this.y0 = 0; this.items = []; this.shadows = this.q.propShadows !== false; }
  add(...objs) { for (const o of objs) { this.scene.add(o); this.items.push(o); } }
  attach(S, y0) { this.S = S; this.y0 = y0; }
  /** Stage space -> world position of a point at height y over the ground. */
  at(u, y, v, out = V) { toWorld(u, v, W, this.S); return out.set(W.x, this.y0 + y, W.z); }
  hide() { for (const o of this.items) o.visible = false; }
  dispose() { for (const o of this.items) { o.removeFromParent(); o.geometry?.dispose?.(); o.material?.dispose?.(); o.dispose?.(); } this.items.length = 0; }
}

// ------------------------------------------------------------------------------------------------ the flier
/** A striped volleyball texture: blue, yellow and white panels. */
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6e6'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f2b53a' : '#3f8fd0'; g.fillRect(i * 32 + 6, 0, 10, 64); }
  g.fillStyle = '#3a6fa8'; g.fillRect(0, 30, 128, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FlierView extends View {
  /** kind: 'shuttle' (foot-tennis, keep it up) or 'ball' (volleyball). */
  constructor(scene, quality, kind) {
    super(scene, quality);
    this.kind = kind;
    if (kind === 'ball') {
      this.tex = typeof document !== 'undefined' ? ballTexture() : null;
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), mat('#ffffff', { map: this.tex, roughness: 0.55, emissive: '#fff4dc', emissiveIntensity: 0 }));
      this.mesh.scale.setScalar(2.0);
    } else {
      this.mesh = new THREE.Mesh(shuttleGeometry(), mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, emissive: '#fff4dc', emissiveIntensity: 0 }));
      this.mesh.scale.setScalar(2.0);
    }
    this.mesh.name = `yard:${kind}`;
    this.mesh.castShadow = this.shadows;
    this.blob = flatMesh(new THREE.CircleGeometry(0.2, 14), '#1a2a14', 0.35);
    this.blob.name = 'yard:blob';
    this.prev = new THREE.Vector3(); this.on = false; this.spin = 0;
    this.add(this.mesh, this.blob);
    this.hide();
  }
  setNight(night) { this.mesh.material.emissiveIntensity = 0.45 * night; }
  hide() { super.hide(); this.on = false; }
  update(sim, dt) {
    const s = sim.shuttle, m = this.mesh;
    m.visible = !!s.on;
    this.blob.visible = !!s.on && s.y > 0.25;
    if (!s.on) { this.on = false; return; }
    this.at(s.u, Math.max(0.1, s.y), s.v, V);
    if (this.kind === 'shuttle') {
      // the cork leads: turn it along the way it is flying
      if (this.on && sim.flight) {
        V2.subVectors(V, this.prev);
        if (V2.lengthSq() > 1e-6) { Q.setFromUnitVectors(DOWN, V2.normalize()); m.quaternion.slerp(Q, Math.min(1, dt * 14)); }
      } else m.quaternion.identity();
    } else { this.spin += dt * 6; m.rotation.set(this.spin * 0.7, this.spin, 0); }
    m.position.copy(V);
    this.prev.copy(V); this.on = true;
    toWorld(s.u, s.v, W, this.S);
    this.blob.position.set(W.x, this.y0 + 0.035, W.z);
    this.blob.scale.setScalar(1 + Math.min(2, s.y * 0.25));
  }
}

// ------------------------------------------------------------------------------------------------ ropes
/** A twisted-hemp look for the rope: light and dark strands across the tube, a few turns along it. */
function ropeTexture(color) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 32, 32);
  g.lineWidth = 5;
  for (let i = -4; i < 8; i++) { g.strokeStyle = i % 2 ? 'rgba(70,40,10,.42)' : 'rgba(255,245,215,.3)'; g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 32, 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * A rope drawn as one thin tube (one mesh, one draw call): n rings of SIDES vertices whose positions are rewritten in place
 * every frame from the curve the caller hands over. Nothing is allocated while a game runs. (It used to be a row of beads:
 * it read as a dotted line.)
 */
const SIDES = 6, RC = Array.from({ length: SIDES + 1 }, (_, k) => Math.cos(k / SIDES * Math.PI * 2)), RS = Array.from({ length: SIDES + 1 }, (_, k) => Math.sin(k / SIDES * Math.PI * 2));
export class TubeRope {
  constructor(view, n, color, radius, turns = 14) {
    this.n = n; this.r = radius;
    const ring = SIDES + 1, pos = new Float32Array(n * ring * 3), nor = new Float32Array(n * ring * 3), uv = new Float32Array(n * ring * 2), idx = [];
    for (let i = 0; i < n; i++) for (let k = 0; k < ring; k++) { uv[(i * ring + k) * 2] = i / (n - 1) * turns; uv[(i * ring + k) * 2 + 1] = k / SIDES; }
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k < SIDES; k++) { const a = i * ring + k, b = a + ring; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = this.geometry = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.pts = new Float32Array(n * 3);
    this.tex = typeof document !== 'undefined' ? ropeTexture(color) : null;
    this.mesh = new THREE.Mesh(g, mat(this.tex ? '#ffffff' : color, { roughness: 0.9, map: this.tex }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = view.shadows;
    this.mesh.name = 'yard:rope';
    this.mesh.dispose = () => this.tex?.dispose();
    view.add(this.mesh);
  }
  /** The curve through fn(s, out) (stage space u, y, v) where s = 0 .. 1. */
  fill(view, fn) {
    const n = this.n, pts = this.pts, r = this.r, ring = SIDES + 1, pos = this.geometry.attributes.position.array, nor = this.geometry.attributes.normal.array;
    for (let i = 0; i < n; i++) { fn(i / (n - 1), R3); view.at(R3.u, R3.y, R3.v, P); pts[i * 3] = P.x; pts[i * 3 + 1] = P.y; pts[i * 3 + 2] = P.z; }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
      // the tangent, then two directions across it (the first as level as it can be: a rope never stands on end here)
      let tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1], tz = pts[b + 2] - pts[a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let ax = -tz, az = tx; const al = Math.hypot(ax, az);
      if (al < 1e-4) { ax = 1; az = 0; } else { ax /= al; az /= al; }
      const bx = ty * az, by = tz * ax - tx * az, bz = -ty * ax;
      const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
      for (let k = 0; k < ring; k++) {
        const o = (i * ring + k) * 3, c = RC[k], s = RS[k], nx = ax * c + bx * s, ny = by * s, nz = az * c + bz * s;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        pos[o] = px + nx * r; pos[o + 1] = py + ny * r; pos[o + 2] = pz + nz * r;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}

export class RopeView extends View {
  constructor(scene, quality) {
    super(scene, quality);
    this.rope = new TubeRope(this, 34, '#f0cf8c', 0.03, 22);
    this.poles = [0, 1].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 7), mat('#6b4a2c')));
    for (const p of this.poles) { p.castShadow = this.shadows; this.add(p); }
    this.hide();
  }
  update(sim) {
    this.rope.mesh.visible = true;
    sim.ropeAt(0, R3);
    this.rope.fill(this, s => sim.ropeAt(s, R3));
    for (let i = 0; i < 2; i++) {
      const p = this.poles[i];
      p.visible = !!sim.posts;
      if (sim.posts) this.at(i ? 2.3 : -2.3, 0.55, 0, p.position);
    }
  }
}

export class TugView extends View {
  constructor(scene, quality) {
    super(scene, quality);
    this.rope = new TubeRope(this, 24, '#c9a46a', 0.045, 30);
    this.flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.24), mat('#e2543a'));
    this.flag.castShadow = this.shadows;
    this.knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#ffd34a'));
    this.add(this.flag, this.knot);
    this.hide();
  }
  update(sim) {
    let a = 1e9, b = -1e9;
    for (const p of sim.players) { a = Math.min(a, p.u); b = Math.max(b, p.u); }
    if (a > b) { a = -4; b = 4; }
    a -= 0.45; b += 0.45;
    const mid2 = (a + b) / 2;                    // the flag hangs on the middle of the rope, which slides with the pull
    this.rope.mesh.visible = true;
    this.rope.fill(this, s => { const u = a + (b - a) * s; R3.u = u; R3.v = TUG_ROPE.v; R3.y = TUG_ROPE.y - 0.04 * Math.sin(Math.PI * s); });
    this.at(mid2, TUG_ROPE.y - 0.24, TUG_ROPE.v, this.flag.position);
    this.at(mid2, TUG_ROPE.y, TUG_ROPE.v, this.knot.position);
    this.flag.visible = this.knot.visible = true;
  }
}

// ------------------------------------------------------------------------------------------------ the oan quan board
/** The centre of each of the twelve squares, in stage space (the near row v > 0 is Mika's). */
export function squareCentre(i, out) {
  if (i === 0) { out.u = -1.52; out.v = 0; } else if (i === 6) { out.u = 1.52; out.v = 0; }
  else if (i <= 5) { out.u = (i - 3) * 0.5; out.v = 0.25; } else { out.u = (9 - i) * 0.5; out.v = -0.25; }
  return out;
}
/** Which of Mika's squares (1 .. 5) a stage point is over, or null. */
export function squareAt(u, v) {
  if (v < 0 || v > 0.5 || u < -1.25 || u > 1.25) return null;
  return 1 + Math.min(4, Math.floor((u + 1.25) / 0.5));
}

export class BoardView extends View {
  constructor(scene, quality) {
    super(scene, quality);
    const stone = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.55 });
    this.dan = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 8, 6), stone, 80);
    this.quan = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 12, 9), new THREE.MeshStandardMaterial({ color: '#7a3b2a', roughness: 0.5 }), 2);
    for (const m of [this.dan, this.quan]) { m.frustumCulled = false; m.castShadow = this.shadows; }
    this.sel = flatMesh(new THREE.PlaneGeometry(0.46, 0.46), '#ffd34a', 0.5);
    this.hints = Array.from({ length: 6 }, () => flatMesh(new THREE.PlaneGeometry(0.42, 0.42), '#59e06a', 0.4));
    this.hand = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), new THREE.MeshBasicMaterial({ color: '#ffd34a' }));
    this.hand.rotation.x = Math.PI / 2;
    this.key = '';
    this.add(this.dan, this.quan, this.sel, this.hand, ...this.hints);
    this.hide();
  }
  update(sim) {
    const S = sim.shown, key = `${S.dan.join(',')}|${S.quan.join(',')}`;
    this.dan.visible = this.quan.visible = true;
    if (key !== this.key) {
      this.key = key;
      let n = 0, qn = 0;
      const c = { u: 0, v: 0 };
      for (let i = 0; i < 12; i++) {
        squareCentre(i, c);
        const count = S.dan[i], big = i === 0 || i === 6;
        const cap = big ? 0.19 : 0.19;
        for (let k = 0; k < count && n < 80; k++) {
          // a loose heap: a golden-angle spiral, stacked when the square gets crowded
          const layer = Math.floor(k / 12), kk = k % 12, a = kk * 2.39996 + i, r = Math.min(cap, 0.045 + 0.045 * Math.sqrt(kk));
          this.at(c.u + Math.cos(a) * r, 0.045 + layer * 0.06, c.v + Math.sin(a) * r, P);
          M.compose(P, Q.identity(), S1); this.dan.setMatrixAt(n++, M);
        }
        if (S.quan[i] > 0 && qn < 2) { this.at(c.u + (big ? 0 : 0), 0.12, c.v, P); M.compose(P, Q.identity(), S1); this.quan.setMatrixAt(qn++, M); }
      }
      this.dan.count = n; this.quan.count = qn;
      this.dan.instanceMatrix.needsUpdate = this.quan.instanceMatrix.needsUpdate = true;
    }
    const c = { u: 0, v: 0 };
    this.sel.visible = sim.sel !== null;
    if (sim.sel !== null) { squareCentre(sim.sel, c); this.at(c.u, 0.035, c.v, this.sel.position); }
    const legal = sim.hintOn && sim.state === 'think' ? sim.hintSquares() : [];
    this.hints.forEach((h, i) => { h.visible = i < legal.length; if (i < legal.length) { squareCentre(legal[i], c); this.at(c.u, 0.032, c.v, h.position); } });
    // a ring over the square the hand is sowing into
    const last = sim.anim?.last;
    this.hand.visible = sim.state === 'sow' && last !== undefined;
    if (this.hand.visible) { squareCentre(last, c); this.at(c.u, 0.24, c.v, this.hand.position); }
  }
}

// ------------------------------------------------------------------------------------------------ sacks and marbles
export class SackView extends View {
  constructor(scene, quality) {
    super(scene, quality);
    const g = new THREE.CylinderGeometry(0.2, 0.26, 0.72, 10, 1, true), m = mat('#b89860', { side: THREE.DoubleSide, roughness: 0.95 });
    this.sacks = [0, 1, 2, 3].map(i => { const s = new THREE.Mesh(g, m); s.castShadow = this.shadows; s.name = 'yard:sack'; return s; });
    // the levels' course: two logs lying across the lanes (Normal, Difficult) and a strip of mud between them (Difficult)
    const lg = new THREE.CylinderGeometry(0.11, 0.12, 1, 9);
    lg.rotateZ(Math.PI / 2);                      // lying down, along x; stretched to the width of the lanes
    const bark = mat('#7d5631', { roughness: 0.95 });
    this.logs = [0, 1].map(() => { const l = new THREE.Mesh(lg, bark); l.castShadow = this.shadows; l.name = 'yard:log'; return l; });
    // (a unit patch with soft corners; stretched to the strip, the corners come out about a third of a metre round)
    const patch = new THREE.Shape(), rx = 0.07, ry = 0.14;
    patch.moveTo(-0.5 + rx, -0.5); patch.lineTo(0.5 - rx, -0.5); patch.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + ry);
    patch.lineTo(0.5, 0.5 - ry); patch.quadraticCurveTo(0.5, 0.5, 0.5 - rx, 0.5); patch.lineTo(-0.5 + rx, 0.5);
    patch.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - ry); patch.lineTo(-0.5, -0.5 + ry); patch.quadraticCurveTo(-0.5, -0.5, -0.5 + rx, -0.5);
    this.mud = flatMesh(new THREE.ShapeGeometry(patch, 5), '#6a4526', 0.7);
    this.mud.name = 'yard:mud';
    this.add(...this.sacks, ...this.logs, this.mud);
    this.hide();
  }
  update(sim) {
    this.sacks.forEach((s, i) => {
      const p = sim.players[i];
      s.visible = !!p;
      if (!p) return;
      this.at(p.u, 0.36 + p.y, p.v, s.position);
      s.rotation.set((p.back ? 1 : -1) * p.lean * 0.35, 0, 0);       // (leans with the racer, whichever way they are going)
      s.position.y -= p.fallT > 0 ? 0.16 : 0;
    });
    const th = -(this.S.rot || 0) * Math.PI / 180, w = sim.players.length * 1.5 + 0.4;
    this.logs.forEach((l, i) => {
      const v = sim.logs ? sim.logs[i] : undefined;
      l.visible = v !== undefined;
      if (!l.visible) return;
      this.at(0, 0.11, v, l.position);
      l.rotation.y = th; l.scale.set(w, 1, 1);
    });
    this.mud.visible = !!sim.mud;
    if (sim.mud) {
      this.at(0, 0.03, (sim.mud[0] + sim.mud[1]) / 2, this.mud.position);
      this.mud.rotation.z = th; this.mud.scale.set(w + 0.3, sim.mud[1] - sim.mud[0], 1);
    }
  }
}

const MARBLE_COLOURS = ['#e2543a', '#3f8fd0', '#f2b53a', '#5fae3e', '#e0567a', '#1fa5a0'];
function swirlTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#7d7d7d'; g.lineWidth = 6;
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 14, 0); g.bezierCurveTo(i * 14 + 20, 8, i * 14 - 10, 24, i * 14 + 14, 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MarblesView extends View {
  constructor(scene, quality) {
    super(scene, quality);
    this.tex = typeof document !== 'undefined' ? swirlTexture() : null;
    const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.tex, roughness: 0.12, metalness: 0.15 });
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), glass, 10);      // eight marbles, and the tor of the harder levels
    this.cols = [...MARBLE_COLOURS, '#f6c12e'].map(c => new THREE.Color(c));                   // (the last one: the golden tor)
    this.painted = null;
    this.balls.frustumCulled = false; this.balls.castShadow = this.shadows;
    this.balls.name = 'yard:marbles';
    this.shooter = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: '#f4f0e0', map: this.tex, roughness: 0.1, metalness: 0.2 }));
    this.shooter.castShadow = this.shadows;
    this.arrow = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.035), new THREE.MeshBasicMaterial({ color: '#59e06a', transparent: true, opacity: 0.9 }));
    this.cross = flatMesh(new THREE.RingGeometry(0.05, 0.07, 20), '#ffffff', 0.9);
    this.add(this.balls, this.shooter, this.arrow, this.cross);
    for (let i = 0; i < 10; i++) this.balls.setColorAt(i, this.cols[i % 6]);
    this.balls.instanceColor.needsUpdate = true;
    this.hide();
  }
  update(sim) {
    let n = 0;
    // each game brings its own colours (Difficult: red for Mika, blue for the kid; the tor is gold): painted once per game
    if (this.painted !== sim.balls) {
      this.painted = sim.balls;
      for (let i = 0; i < sim.balls.length && i < 10; i++) this.balls.setColorAt(i, this.cols[sim.balls[i].c] || this.cols[0]);
      this.balls.instanceColor.needsUpdate = true;
    }
    for (const b of sim.balls) {
      this.at(b.u, b.r, b.v, P);       // (a marble knocked out lies where it stopped)
      SC.set(b.r, b.r, b.r); E.set(b.roll, b.rot, 0); Q.setFromEuler(E);
      M.compose(P, Q, SC); this.balls.setMatrixAt(n++, M);
    }
    this.balls.count = n; this.balls.instanceMatrix.needsUpdate = true;
    this.balls.visible = true;
    const S = sim.shooter;
    this.shooter.visible = true;
    this.at(S.u, S.r, S.v, this.shooter.position);
    this.shooter.scale.setScalar(S.r);
    this.shooter.rotation.set(S.roll, 0, 0);
    // the aim arrow while a human is lining up the shot
    const aiming = sim.state === 'aim' && sim.cur.human;
    this.arrow.visible = this.cross.visible = aiming;
    if (aiming) {
      const du = sim.aim.u - S.u, dv = sim.aim.v - S.v, d = Math.hypot(du, dv) || 1, len = 0.25 + 0.65 * Math.max(sim.power, 0.18);
      this.at(S.u + du / d * len / 2, 0.03, S.v + dv / d * len / 2, this.arrow.position);
      this.arrow.scale.set(len, 1, 1);
      toWorld(S.u + du, S.v + dv, W, this.S); toWorld(S.u, S.v, W2, this.S);
      this.arrow.rotation.set(0, Math.atan2(-(W.z - W2.z), W.x - W2.x), 0);
      this.arrow.material.color.setHSL(0.33 * (1 - sim.power), 0.85, 0.5);
      this.at(sim.aim.u, 0.04, sim.aim.v, this.cross.position);
    }
  }
}

/** All the views, made on first use and kept. */
export class Views {
  constructor(scene, quality) { this.scene = scene; this.q = quality; this.by = {}; }
  /** `owner`: a yard's id. Each yard gets its own pieces, so two yards playing the same game at once (rope jumping) never share a mesh. */
  get(look, owner = '') {
    const key = owner ? `${owner}:${look}` : look;
    if (this.by[key]) return this.by[key];
    const s = this.scene, q = this.q;
    const make = { shuttle: () => new FlierView(s, q, 'shuttle'), ball: () => new FlierView(s, q, 'ball'), rope: () => new RopeView(s, q), tug: () => new TugView(s, q),
      board: () => new BoardView(s, q), sack: () => new SackView(s, q), marbles: () => new MarblesView(s, q) }[look];
    return (this.by[key] = make ? make() : null);
  }
  /** Hide the pieces of one yard (or of every yard). */
  hideAll(owner = '') { for (const [k, v] of Object.entries(this.by)) if (v && (!owner || k.startsWith(`${owner}:`))) v.hide(); }
  setNight(n) { for (const v of Object.values(this.by)) v?.setNight?.(n); }
}
void toCourt; void HANDS; void MARBLE_RING;
