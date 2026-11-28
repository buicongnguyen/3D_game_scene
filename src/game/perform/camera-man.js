// © 2026 Bui Cong Nguyen · solluxlabs.com
// An automatic camera for a performance, after Avatar Studio Club mode's camera man (club-director.js, docs/club/PLAN.md
// "Camera man", "Club show", "Club camera 2"): shots planned from the song's sections, bars and sung lines
// (deterministic, seeded by the song id), played with a critically damped follower solved in closed form, so it moves the
// same at 30, 60 or 144 Hz. The shot grammar (2026-11-28, owner: "learn the camera from Avatar Studio"):
//   open       the song's first shot starts where the player's camera stood (subject.from), so the view they framed
//              before Perform stays the backdrop, then eases in a little
//   wide       an establishing wide (high, slowly craning down)
//   crane      a jib rising from knee height to high over her, easing back (after a loud part, out of an intro)
//   landscape  far and high, aimed past the group out to the valley: the place she chose fills the frame, the group small
//              in its lower part (bridges and breaks, the outro; once a song at least)
//   medium / side / low (a low hero angle up at her) / push (a slow dolly in) / orbit (slow, round her) / close (on her
//              sung lines) / reveal (the closing pull back and up)
// Rules (tests/singplay.test.mjs, tests/troupe.test.mjs): every cut on a bar line, each section opens with a new shot,
// no shot shorter than CUT.minBars bars (2) nor the same shot twice in a row; calm long moves in intros, verses and
// bridges (4-8 bars), quicker cuts on chorus lines; a chorus opens on the low hero shot; close-ups on Kotone's sung lines
// (a verse line at most every CUT.verseGap bars, a chorus line at most every CUT.chorusGap bars, never two lines in a
// row), held CUT.closeMax bars at most. No handheld shake at all (owner rule for phones). Shot poses are in her frame
// (her position and facing), so a shot follows her wherever she performs; the camera stays in front of what hides her
// (clear: walls and trees) and over the ground between her and it (ground: hillsides), and portrait frames stand back.
// A group (game/perform/troupe.js): every shot but a close-up frames the whole formation (its centre, far enough back for
// its width); choruses are group shots (low, wide and medium in turn on the chorus lines, everyone sings), close-ups go to
// Kotone's own lines in the verses.
//   planShots(plan, clock, { group }) -> [{ t0, t1, b, kind, side, cut }]      (pure)
//   createCameraMan(shots) -> { update(dt, t, subject, cam, clear?, ground?) }   cam: a THREE camera; clear(from, to) -> 0..1
//     subject { x, y, z, facing, h?, group?: { x, z, w, depth }, from?: { d, h, yaw, aim } (the player's camera in her frame) }
import * as THREE from 'three';
import { hash } from './plan.js';

export const SHOT_KINDS = Object.freeze(['open', 'wide', 'crane', 'landscape', 'medium', 'close', 'low', 'side', 'push', 'orbit', 'reveal']);
export const CUT = Object.freeze({ minBars: 2, maxBars: 8, closeMax: 4, verseGap: 6, chorusGap: 4 });
const ease = u => u * u * (3 - 2 * u);
const OPEN = Object.freeze({ d: 6, h: 2.4, yaw: 0, aim: 1.25 });   // (no player camera given: about the follow camera's place)
// distance from her (m), camera height, aim height, yaw off her front (rad), and how each moves over the shot (0..1);
// far: the aim goes that far past her (landscape: out to the valley)
const POSE = {
  open: (u, f) => { const F = f || OPEN, e = ease(u); return { d: F.d * (1 - .2 * e), h: F.h + (1.7 - F.h) * .35 * e, aim: F.aim + (1.1 - F.aim) * e, yaw: F.yaw * (1 - .5 * e) }; },
  wide: u => ({ d: 9 - 2.5 * u, h: 4.2 - 1.6 * u, aim: 1.0, yaw: .35 - .2 * u }),
  crane: u => { const e = ease(u); return { d: 5.4 + 1.8 * e, h: .65 + 3.9 * e, aim: 1.0 + .15 * e, yaw: .3 - .12 * u }; },
  landscape: u => ({ d: 10.5 + 1.5 * u, h: 3.1 + .5 * u, aim: 2.2, yaw: .32 - .2 * u, far: 30 }),
  medium: u => ({ d: 3.6, h: 1.45, aim: 1.05, yaw: .18 + .08 * u }),
  close: u => ({ d: 1.75 - .1 * u, h: 1.5, aim: 1.32, yaw: .12 }),
  low: u => ({ d: 3.0, h: .55, aim: 1.15, yaw: -.22 - .06 * u }),
  side: u => ({ d: 3.9, h: 1.35, aim: 1.0, yaw: .85 - .15 * u }),
  push: u => ({ d: 5.2 - 2.4 * ease(u), h: 1.55, aim: 1.1, yaw: -.1 }),
  orbit: u => ({ d: 4.4, h: 1.7, aim: 1.0, yaw: -.8 + 1.6 * ease(u) }),
  reveal: u => ({ d: 3.8 + 9 * ease(u), h: 1.5 + 4.5 * ease(u), aim: 1.0 + .3 * u, yaw: .2 }),
};
/** The performer's height the shot poses are written for (Kotone: the source's 1.62 m, art/blender/vroid_mixamo.py). */
export const BODY_H = 1.62;
/** Phones (portrait): a little further back so her whole body fits a tall frame. */
export const PORTRAIT = Object.freeze({ dist: 1.35, close: 1.25 });
/** Over the ground: the camera and its line of sight to her stay this high over the terrain (m). */
export const GROUND_GAP = .4;

export function planShots(plan, clock, { group = false } = {}) {
  const seed = plan.seed, bar = b => clock.barTime(b), BL = clock.barLength, end = plan.end, lines = plan.lines, MIN = CUT.minBars;
  const bow = plan.moments.find(m => m.id === 'bow'), revealT = Math.max(bow ? bow.t0 : end - 3 * BL, end - 8);
  const revealBar = Math.round(clock.barAt(revealT));
  // a sung line counts on its bar (a line sung a quarter bar early, a pickup, cuts on the bar after it)
  const lineBars = new Set(); if (lines) for (let i = 0; i < lines.count; i++) lineBars.add(Math.floor(clock.barAt(lines.t[i]) + .25));
  const segs = [];
  let lastClose = -1e9, prevLoud = false;
  const lastKind = () => segs.at(-1)?.kind || '';
  const pick = (pool, b) => { const o = pool.filter(k => k !== lastKind()); return o[hash(seed, 'shot', b) % o.length]; };
  const add = (b, kind) => { if (kind === lastKind()) kind = kind === 'medium' ? 'side' : 'medium'; segs.push({ b, kind }); if (kind === 'close') lastClose = b; };
  for (const sec of mergeSections(plan)) {
    const b0 = sec.b0, b1 = Math.min(sec.b1, revealBar), kind = sec.kind, loud = kind === 'chorus' || kind === 'drop';
    const long = (hash(seed, 'len', b0) & 1) ? 8 : 4;
    for (let b = b0; b < b1; b++) {
      if (b1 - b < MIN) break;                                  // (a new shot needs two bars before the section ends)
      const ran = segs.length ? b - segs.at(-1).b : Infinity;
      if (ran < MIN) continue;
      const start = b === b0, line = lineBars.has(b), cur = lastKind();
      const force = ran >= (cur === 'close' || cur === 'low' ? CUT.closeMax : CUT.maxBars);
      let k = null;
      if (!segs.length) k = 'open';
      else if (kind === 'intro') k = start ? 'wide' : ran >= 4 ? (cur === 'open' || cur === 'wide' ? 'crane' : pick(['medium', 'side'], b)) : null;
      else if (kind === 'prechorus') k = start ? 'push' : ran >= 4 ? 'low' : null;
      else if (kind === 'bridge' || kind === 'break') k = start ? (b1 - b0 >= 6 ? 'landscape' : 'orbit') : cur === 'landscape' && ran >= 4 ? 'orbit' : force ? 'crane' : null;
      else if (loud) {
        if (start) k = 'low';
        else if (line || ran >= 4) k = !group && line && cur !== 'close' && b - lastClose >= CUT.chorusGap ? 'close' : pick(group ? ['wide', 'medium', 'low'] : ['medium', 'side', 'low', 'wide'], b);
      } else {   // verse, outro
        const closeOk = line && cur !== 'close' && b - lastClose >= CUT.verseGap;
        if (start) k = kind === 'outro' && !segs.some(x => x.kind === 'landscape') ? 'landscape' : closeOk ? 'close' : prevLoud ? 'crane' : pick(['medium', 'side', 'low', 'orbit'], b);
        else if (closeOk) k = 'close';
        else if (cur === 'close' || ran >= long || force) k = pick(['medium', 'side', 'low', 'push'], b);
      }
      if (k) add(b, k);
    }
    prevLoud = loud;
  }
  // once a song at least, the landscape: a verse shot of 4 bars or more after the first chorus (else any)
  if (!segs.some(x => x.kind === 'landscape')) {
    const len = i => (segs[i + 1]?.b ?? revealBar) - segs[i].b;
    const ok = i => i > 0 && segs[i].kind !== 'close' && segs[i].kind !== 'low' && len(i) >= 4 && segs[i - 1].kind !== 'landscape' && segs[i + 1]?.kind !== 'landscape';
    const i = segs.findIndex((x, j) => ok(j) && segs.slice(0, j).some(y => y.kind === 'low')), j = i >= 0 ? i : segs.findIndex((x, n) => ok(n));
    if (j >= 0) segs[j].kind = 'landscape';
  }
  // the closing reveal: on its bar line, two bars at least after the shot before it
  while (segs.length > 1 && revealBar - segs.at(-1).b < MIN) segs.pop();
  const side = b => ((hash(seed, 'side', b) & 1) ? 1 : -1);
  const shots = segs.map(x => ({ t0: bar(x.b), t1: 0, b: x.b, kind: x.kind, side: x.kind === 'open' ? 1 : side(x.b), cut: true }));
  const rt = bar(revealBar);
  if (rt < end && (!shots.length || rt > shots.at(-1).t0)) shots.push({ t0: rt, t1: 0, b: revealBar, kind: 'reveal', side: side(revealBar), cut: true });
  // shots tile the song: each runs to the next one's start
  for (let i = 0; i < shots.length; i++) shots[i].t1 = i < shots.length - 1 ? shots[i + 1].t0 : end + 1.5;
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

/**
 * The pose a shot wants at song time t: { pos, look, focus } around the subject (position, facing). focus: the point the
 * camera films (her, or the group's centre) - what walls and the ground must not hide; look: where it aims (a landscape
 * aims past her).
 */
export function shotPose(shot, t, subject, { portrait = false, tanHalf = 0 } = {}, out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), focus: new THREE.Vector3() }) {
  const u = Math.min(1, Math.max(0, (t - shot.t0) / Math.max(.5, shot.t1 - shot.t0))), kind = shot.kind, pose = POSE[kind], p = pose(u, subject.from);
  // (poses are written for a 1.62 m performer, Kotone: another height scales them)
  const s = (subject.h || BODY_H) / BODY_H, k = (portrait ? (kind === 'close' ? PORTRAIT.close : PORTRAIT.dist) : 1) * s, yaw = subject.facing + p.yaw * shot.side;
  // a group: every shot but a close-up aims at the formation's centre, back far enough for its width and depth (the
  // camera a little higher in proportion, so the back row shows over the front; a low shot stays low)
  const G = kind !== 'close' ? subject.group : null, c = G || subject, wide = kind === 'wide' || kind === 'reveal' || kind === 'landscape' || kind === 'open';
  const d0 = p.d * k, d = G ? Math.max(d0, groupDist(G, portrait, tanHalf) * (wide ? 1.1 : 1) + d0 - pose(0, subject.from).d * k) : d0;
  // (a group: half the shot's angle off the front and half a metre higher, so the back row shows between the front)
  const low = kind === 'low', hk = G && !low ? Math.max(1, d / d0) ** .5 : 1, gy = G ? subject.facing + p.yaw * shot.side * .5 : yaw, up = G && !low ? .5 : 0;
  out.pos.set(c.x + Math.sin(gy) * d, subject.y + p.h * s * hk + up, c.z + Math.cos(gy) * d);
  const aimY = subject.y + (p.aim - (portrait && kind !== 'close' ? .1 : 0)) * s;
  out.focus.set(c.x, subject.y + 1.0 * s, c.z);
  if (p.far) out.look.set(c.x - Math.sin(subject.facing) * p.far, aimY, c.z - Math.cos(subject.facing) * p.far);   // past her, out to the view
  else out.look.set(c.x, aimY, c.z);
  return out;
}

/** The player's camera in her frame (for the open shot): { d, h, yaw, aim } from its position and the point it looks at
 *  (her chest height when it looks past her). */
export function fromCamera(pos, subject, aim = 1.25) {
  const dx = pos.x - subject.x, dz = pos.z - subject.z, a = Math.atan2(dx, dz) - subject.facing;
  return { d: Math.max(2.5, Math.hypot(dx, dz)), h: Math.max(.6, pos.y - subject.y), yaw: Math.atan2(Math.sin(a), Math.cos(a)), aim };
}

/** How far back a camera must stand to hold a group of width w and depth (m), a shoulder's margin each side. tanHalf:
 *  tan of half the camera's view across (from its fov and aspect; without it about 50 deg landscape, 33 portrait). A
 *  portrait frame may lose the outer shoulders (x1.1), or the group would be small. */
export function groupDist(G, portrait = false, tanHalf = 0) {
  const half = (G.w || 0) / 2 + .7, th = (tanHalf || (portrait ? .3 : .48)) * (portrait ? 1.1 : 1);
  return half / th + (G.depth || 0) / 2;
}

/** Lift `pos` so it, and its line of sight to `focus`, stay GROUND_GAP over the ground (four samples along the line). */
export function overGround(pos, focus, ground) {
  let lift = ground(pos.x, pos.z) + GROUND_GAP - pos.y;
  for (const f of [.25, .5, .75]) {
    const x = focus.x + (pos.x - focus.x) * f, z = focus.z + (pos.z - focus.z) * f, y = focus.y + (pos.y - focus.y) * f;
    lift = Math.max(lift, (ground(x, z) + GROUND_GAP - y) / f);   // (raising the end by L raises this point by f L)
  }
  if (lift > 0) pos.y += lift;
  return pos;
}

export function createCameraMan(shots, { portrait = false } = {}) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), vp = new THREE.Vector3(), vl = new THREE.Vector3(), want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), focus: new THREE.Vector3() };
  let shot = null, ready = false;
  const step = (cur, vel, goal, omega, dt) => { for (const ax of ['x', 'y', 'z']) { const [x, v] = damp(cur[ax], vel[ax], goal[ax], omega, dt); cur[ax] = x; vel[ax] = v; } };
  return {
    get shot() { return shot; },
    set portrait(v) { portrait = v; },
    /** dt s, t the song time, subject (see the header), cam a THREE camera, clear(from, to) -> 0..1 the free share of the
     *  way (walls, trees), ground(x, z) -> y the terrain. */
    update(dt, t, subject, cam, clear = null, ground = null) {
      const s = shotAt(shots, t);
      const th = cam.isPerspectiveCamera ? Math.tan(cam.fov * Math.PI / 360) * (cam.aspect || 1) : 0;
      shotPose(s, t, subject, { portrait, tanHalf: th }, want);
      // walls and trees: come in front of what hides her; hillsides: up over the ground between
      if (clear) { const k = clear(want.focus, want.pos); if (k < 1) want.pos.lerpVectors(want.focus, want.pos, Math.max(.25, k - .05)); }
      if (ground) overGround(want.pos, want.focus, ground);
      if (s !== shot || !ready) { const cut = !ready || s.cut; shot = s; if (cut) { pos.copy(want.pos); look.copy(want.look); vp.set(0, 0, 0); vl.set(0, 0, 0); ready = true; } }
      step(pos, vp, want.pos, s.kind === 'reveal' || s.kind === 'crane' ? 2.2 : 3.2, Math.min(dt, .1));
      step(look, vl, want.look, 5, Math.min(dt, .1));
      cam.position.copy(pos); cam.lookAt(look);
      return s;
    },
  };
}
