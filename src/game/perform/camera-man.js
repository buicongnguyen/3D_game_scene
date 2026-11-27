// An automatic camera for a performance, after Avatar Studio Club mode's camera man (docs/club/PLAN.md "Camera man",
// "Club show", "Club camera 2"): shots planned from the song's sections, bars and sung lines (deterministic, seeded by the
// song id), played with a critically damped follower solved in closed form, so it moves the same at 30, 60 or 144 Hz.
//   intro    an establishing wide (high, slowly craning down to her)
//   verse    medium shots, a low hero shot or a side shot, a new one every 4-8 bars
//   pre      a slow push-in
//   chorus   a close-up on each chorus line (cut on the line's bar), medium between
//   bridge   an orbit
//   outro    medium, then the reveal: a pull back and up over the last bars (after the bow starts)
// No shot twice in a row. No handheld shake at all (owner rule for phones). Shot poses are in her frame (her position and
// facing), so a shot follows her wherever she performs.
//   planShots(plan, clock) -> [{ t0, t1, kind, side, cut }]      (pure)
//   createCameraMan(shots) -> { update(dt, t, subject, cam, clear?) }   cam: a THREE camera; clear(from, to) -> 0..1 (walls)
import * as THREE from 'three';
import { hash } from './plan.js';

export const SHOT_KINDS = Object.freeze(['wide', 'medium', 'close', 'low', 'side', 'push', 'orbit', 'reveal']);
// distance from her (m), camera height, aim height, yaw off her front (rad), and how each moves over the shot (0..1)
const POSE = {
  wide: u => ({ d: 9 - 2.5 * u, h: 4.2 - 1.6 * u, aim: 1.0, yaw: .35 - .2 * u }),
  medium: u => ({ d: 3.6, h: 1.45, aim: 1.05, yaw: .18 + .08 * u }),
  close: u => ({ d: 1.75 - .1 * u, h: 1.5, aim: 1.32, yaw: .12 }),
  low: u => ({ d: 3.0, h: .55, aim: 1.15, yaw: -.22 - .06 * u }),
  side: u => ({ d: 3.9, h: 1.35, aim: 1.0, yaw: .85 - .15 * u }),
  push: u => ({ d: 5.2 - 2.4 * u, h: 1.55, aim: 1.1, yaw: -.1 }),
  orbit: u => ({ d: 4.4, h: 1.7, aim: 1.0, yaw: -.9 + 1.8 * u }),
  reveal: u => ({ d: 3.8 + 9 * u * u * (3 - 2 * u), h: 1.5 + 4.5 * u * u * (3 - 2 * u), aim: 1.0 + .3 * u, yaw: .2 }),
};
/** The performer's height the shot poses are written for (Kotone, art/blender/vroid_mixamo.py HEIGHT). */
export const BODY_H = 1.52;
/** Phones (portrait): a little further back so her whole body fits a tall frame. */
export const PORTRAIT = Object.freeze({ dist: 1.35, close: 1.25 });

export function planShots(plan, clock) {
  const shots = [], seed = plan.seed, bar = b => clock.barTime(b), lines = plan.lines;
  let last = '';
  const push = (t0, t1, kind, cut = true) => {
    if (t1 - t0 < .8) return;
    if (kind === last && kind !== 'close') kind = kind === 'medium' ? 'side' : 'medium';
    const side = (hash(seed, 'side', t0.toFixed(2)) & 1) ? 1 : -1;
    shots.push({ t0, t1, kind, side, cut }); last = kind;
  };
  const end = plan.end, bow = plan.moments.find(m => m.id === 'bow'), revealAt = Math.max(bow ? bow.t0 : end - 3 * clock.barLength, end - 8);
  for (const b of mergeSections(plan)) {
    const t0 = bar(b.b0), t1 = Math.min(bar(b.b1), revealAt);
    if (t1 <= t0) continue;
    if (b.kind === 'intro') { push(t0, t1, 'wide'); continue; }
    if (b.kind === 'bridge' || b.kind === 'break') { push(t0, t1, 'orbit'); continue; }
    if (b.kind === 'prechorus') { push(t0, t1, 'push'); continue; }
    if (b.kind === 'chorus' || b.kind === 'drop') {
      // a close-up on each chorus line, medium / side between lines of 2+ bars
      const starts = lines ? Array.from(lines.t).filter(t => t >= t0 - .01 && t < t1 - 1) : [];
      let at = t0, k = 0;
      for (const ls of starts.length ? starts : [t0]) {
        const s = Math.max(at, ls - .25);
        if (s - at > 2 * clock.barLength) { push(at, s, k++ % 2 ? 'side' : 'medium'); at = s; }
        const next = starts.find(x => x > ls + .5) ?? t1, e = Math.min(t1, next - .25);
        push(at, e, at === t0 && shots.at(-1)?.kind === 'close' ? 'medium' : 'close'); at = e;
      }
      if (t1 - at > .8) push(at, t1, 'medium');
      continue;
    }
    // verse / outro: 4-8 bars a shot
    const opts = ['medium', 'low', 'side'];
    for (let x = b.b0, i = 0; x < b.b1; i++) {
      const n = (hash(seed, 'len', x) & 1) ? 8 : 4, y = Math.min(b.b1, x + n), s0 = bar(x), s1 = Math.min(bar(y), revealAt);
      if (s1 > s0) push(s0, s1, opts[(hash(seed, x, i) + i) % opts.length]);
      x = y;
    }
  }
  push(revealAt, end + 1.5, 'reveal');
  // shots tile the song: each runs to the next one's start
  for (let i = 0; i < shots.length - 1; i++) shots[i].t1 = shots[i + 1].t0;
  return shots;
}
/** Neighbouring blocks of one section joined: [{ b0, b1, kind }]. */
function mergeSections(plan) {
  const out = [];
  for (const b of plan.blocks) { const o = out.at(-1); if (o && o.section === b.section) o.b1 = b.b1; else out.push({ b0: b.b0, b1: b.b1, kind: b.kind, section: b.section }); }
  return out;
}
export const shotAt = (shots, t) => { let lo = 0, hi = shots.length - 1, i = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (shots[m].t0 <= t) { i = m; lo = m + 1; } else hi = m - 1; } return shots[i]; };

/** Closed-form critically damped follow (Club camera-smooth.js): x (speed v) toward a still goal over dt -> [x, v]. */
export function damp(x, v, goal, omega, dt) {
  const y = x - goal, a = v + omega * y, e = Math.exp(-omega * dt);
  return [goal + (y + a * dt) * e, (v - omega * a * dt) * e];
}

/** The pose a shot wants at song time t: { pos, look } around the subject (position, facing). */
export function shotPose(shot, t, subject, { portrait = false } = {}, out = { pos: new THREE.Vector3(), look: new THREE.Vector3() }) {
  const u = Math.min(1, Math.max(0, (t - shot.t0) / Math.max(.5, shot.t1 - shot.t0))), p = POSE[shot.kind](u);
  // (poses are written for a 1.52 m performer, Kotone: another height scales them)
  const s = (subject.h || BODY_H) / BODY_H, k = (portrait ? (shot.kind === 'close' ? PORTRAIT.close : PORTRAIT.dist) : 1) * s, yaw = subject.facing + p.yaw * shot.side, d = p.d * k;
  out.pos.set(subject.x + Math.sin(yaw) * d, subject.y + p.h * s, subject.z + Math.cos(yaw) * d);
  out.look.set(subject.x, subject.y + (p.aim - (portrait && shot.kind !== 'close' ? .1 : 0)) * s, subject.z);
  return out;
}

export function createCameraMan(shots, { portrait = false } = {}) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), vp = new THREE.Vector3(), vl = new THREE.Vector3(), want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let shot = null, ready = false;
  const step = (cur, vel, goal, omega, dt) => { for (const ax of ['x', 'y', 'z']) { const [x, v] = damp(cur[ax], vel[ax], goal[ax], omega, dt); cur[ax] = x; vel[ax] = v; } };
  return {
    get shot() { return shot; },
    set portrait(v) { portrait = v; },
    /** dt s, t the song time, subject { x, y, z, facing, h? (her height) }, cam a THREE camera, clear(from, to) -> 0..1 the free share of the way. */
    update(dt, t, subject, cam, clear = null) {
      const s = shotAt(shots, t);
      shotPose(s, t, subject, { portrait }, want);
      // walls and trees: come in front of what hides her
      if (clear) { const k = clear(want.look, want.pos); if (k < 1) want.pos.lerpVectors(want.look, want.pos, Math.max(.25, k - .05)); }
      if (s !== shot || !ready) { const cut = !ready || s.cut; shot = s; if (cut) { pos.copy(want.pos); look.copy(want.look); vp.set(0, 0, 0); vl.set(0, 0, 0); ready = true; } }
      step(pos, vp, want.pos, s.kind === 'reveal' ? 2.2 : 3.2, Math.min(dt, .1));
      step(look, vl, want.look, 5, Math.min(dt, .1));
      cam.position.copy(pos); cam.lookAt(look);
      return s;
    },
  };
}
