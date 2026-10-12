// Ground poses on the real Animator/AnimationMixer: what the player would see, not what the source text says.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animator } from '../src/actors/animator.js';
import { GroundPoseSystem } from '../src/actors/ground-pose-system.js';
import { GroundPose } from '../src/actors/pose-ground.js';
import { creepFilter } from '../src/game/tricks/bugkit.js';
import { Director } from '../src/game/director.js';
import { CowRide } from '../src/actors/cow-ride.js';

/** A one-bone "Mika" on the real Animator: the bone's height is the pose (Idle 0.65, crouched 0.34, sitting 0.2). */
function rigged() {
  const root = new THREE.Group(), hips = new THREE.Bone(); hips.name = 'hips'; root.add(hips);
  for (const name of ['upperarm_R', 'forearm_R']) { const b = new THREE.Bone(); b.name = name; root.add(b); }
  const clip = (name, seconds, ys) => new THREE.AnimationClip(name, seconds, [
    new THREE.VectorKeyframeTrack('hips.position', ys.map((_, i) => seconds * i / (ys.length - 1)), ys.flatMap(y => [0, y, 0])),
    new THREE.QuaternionKeyframeTrack('upperarm_R.quaternion', [0, seconds], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  root.userData.clips = [clip('Idle', 2, [0.65, 0.65]), clip('Walk', 1, [0.65, 0.65]), clip('Crouch', 3, [0.34, 0.34]), clip('CrouchWalk', 0.9, [0.34, 0.34]),
    clip('CrouchReach', 0.8, [0.34, 0.32, 0.34]), clip('CrouchReachHold', 1.5, [0.32, 0.32]), clip('Kneel', 3, [0.35, 0.35]),
    clip('Pickup', 1, [0.65, 0.31, 0.65]), clip('SitGrass', 4, [0.2, 0.2])];
  const p = { anim: new Animator(root), model: root, grip: hips, pos: new THREE.Vector3(), speed: 0, grounded: true, pose: null, poseSpeed: 1 };
  // the part of Player.animate() that matters here
  p.frame = dt => {
    const a = p.anim;
    if (p.pose && !a.busy) a.play(p.pose, { fade: 0.3, speed: p.poseSpeed });
    else if (!a.busy) a.play(p.speed < 0.25 ? 'Idle' : 'Walk', { fade: 0.25 });
    a.update(dt);
  };
  return { p, hips, arm: root.getObjectByName('upperarm_R') };
}

test('a reach in a crouch ends back in the crouch: no frame of Idle, no CrouchReachHold flash', () => {
  for (const dt of [1 / 60, 1 / 30, 1 / 20, 0.0161]) {
    const { p, hips } = rigged(), system = new GroundPoseSystem(p), seen = new Set();
    const step = () => { p.frame(dt); system.update(dt); seen.add(p.anim.currentName); };
    system.want('trick', { creeping: true });
    for (let t = 0; t < 1; t += dt) step();
    assert.ok(Math.abs(hips.position.y - 0.34) < 1e-3, 'crouched');
    seen.clear();
    system.reach(); step();
    assert.equal(p.anim.currentName, 'CrouchReach');
    system.reach();                                           // the cage drop asks again a moment later
    let top = 0;
    for (let t = 0; t < 2; t += dt) { step(); top = Math.max(top, hips.position.y); }
    assert.ok(top < 0.345, `she never bobs up toward standing (dt ${dt.toFixed(4)}): ${top}`);
    assert.deepEqual([...seen].sort(), ['Crouch', 'CrouchReach']);
    assert.equal(p.pose, 'Crouch');
  }
});

test('a standing pat is one reach and she stands again; a held reach request keeps the hold pose', () => {
  const { p } = rigged(), system = new GroundPoseSystem(p), dt = 1 / 60;
  const step = () => { p.frame(dt); system.update(dt); };
  system.reach(); step();
  assert.equal(p.anim.currentName, 'CrouchReach'); assert.equal(p.pose, null, 'a one-shot is never looped as a held pose');
  for (let t = 0; t < 1.2; t += dt) step();
  assert.equal(p.anim.currentName, 'Idle'); assert.equal(system.debug().active, false);
  system.want('feed', { reach: true });
  for (let t = 0; t < 1.2; t += dt) step();
  assert.equal(p.anim.currentName, 'CrouchReachHold');
  system.release('feed');
  for (let t = 0; t < 0.5; t += dt) step();
  assert.equal(p.anim.currentName, 'Idle');
});

test('a tickle while kneeling keeps the kneel: only her right arm reaches, and it is given back', () => {
  const { p, arm } = rigged(), system = new GroundPoseSystem(p), dt = 1 / 60;
  const step = () => { p.frame(dt); system.update(dt); };
  system.want('trick', { kneel: true });
  for (let t = 0; t < 0.5; t += dt) step();
  assert.equal(p.anim.currentName, 'Kneel');
  const rest = arm.quaternion.clone();
  let bent = 0;
  for (let tap = 0; tap < 3; tap++) {
    system.reach();
    for (let t = 0; t < 0.2; t += dt) { step(); assert.equal(p.anim.currentName, 'Kneel'); bent = Math.max(bent, arm.quaternion.angleTo(rest)); }
  }
  assert.ok(bent > 0.5, `the arm reaches: ${bent}`);
  for (let t = 0; t < 0.8; t += dt) step();
  assert.ok(arm.quaternion.angleTo(rest) < 1e-6, 'no bend left on the arm');
  system.reach(); step(); step(); system.release('trick', true);
  assert.ok(arm.quaternion.angleTo(rest) < 1e-6, 'quitting mid-tickle gives the arm back at once');
});

test('another gesture that replaces the pickup ends its lock and its ownership, and is left alone', () => {
  const { p } = rigged(), system = new GroundPoseSystem(p), dt = 1 / 60;
  system.pickup({}); p.frame(dt); system.update(dt);
  assert.equal(p.anim.oneShotLocks, true);
  p.anim.cancelOneShot(); p.anim.once('Walk', { then: 'Idle' });      // e.g. Player's Land, or a scene's gesture
  p.frame(dt); system.update(dt);
  assert.equal(system.debug().action, null); assert.equal(system.debug().lockLeft, 0);
  assert.equal(p.anim.currentName, 'Walk'); assert.equal(p.anim.busy, true);
});

test('the pickup never locks movement longer than 0.6 s and ends standing in Idle', () => {
  const { p, hips } = rigged(), system = new GroundPoseSystem(p), dt = 1 / 60;
  system.pickup({});
  let locked = 0;
  for (let t = 0; t < 1.6; t += dt) { p.frame(dt); system.update(dt); if (p.anim.busy && p.anim.oneShotLocks) locked += dt; }
  assert.ok(locked > 0.4 && locked <= 0.6, `locked ${locked}`);
  assert.equal(p.anim.currentName, 'Idle'); assert.ok(Math.abs(hips.position.y - 0.65) < 1e-3); assert.equal(p.pose, null);
});

test('a hovering pickup sinks into her hand before the grab frame instead of jumping there', () => {
  const { p, hips } = rigged(), system = new GroundPoseSystem(p), scene = new THREE.Group(), item = new THREE.Group(), dt = 1 / 60;
  scene.add(p.model, item); item.position.set(0.3, 0.7, 0.2);
  system.pickup({ object: item });
  let last = item.position.clone(), worst = 0, grabbedAt = -1;
  for (let t = 0; t < 0.5; t += dt) {
    p.frame(dt); system.update(dt); scene.updateMatrixWorld(true);
    const now = item.getWorldPosition(new THREE.Vector3());
    worst = Math.max(worst, now.distanceTo(last)); last = now;
    if (grabbedAt < 0 && item.parent === hips) grabbedAt = t;
  }
  assert.ok(grabbedAt > 0.36 && grabbedAt < 0.44, `grab frame: ${grabbedAt}`);
  assert.ok(worst < 0.12, `no teleport into the hand: ${worst}`);
});

test('an armful interrupted before the grab frame (a jump, a hint, the round ending) is still shown as carried', () => {
  for (const how of ['air', 'blocked', 'release']) {
    const { p } = rigged(), system = new GroundPoseSystem(p), dt = 1 / 60;
    let shown = 0;
    system.want('trick', {});
    system.pickup({ onGrab: () => shown++ });          // the roast's straw: only an onGrab, no onDone
    p.frame(dt); system.update(dt);
    if (how === 'air') { p.grounded = false; p.frame(dt); system.update(dt); }
    else if (how === 'blocked') { p.frame(dt); system.update(dt, { blocked: true }); }
    else system.release('trick', true);
    assert.equal(shown, 1, how); assert.equal(system.items.length, 0);
    p.grounded = true;
    for (let t = 0; t < 1.2; t += dt) { p.frame(dt); system.update(dt); }
    assert.equal(shown, 1, `${how}: never twice`);
  }
});

test('feeding a cow is a standing gesture, and a cog on a crate top is not picked from the grass', () => {
  const { p } = rigged(), gestures = [];
  p.gesture = name => gestures.push(name); p.turnTo = () => {}; p.carry = { want() {}, release() {} };
  const ground = new GroundPoseSystem(p), cows = Object.create(CowRide.prototype);
  cows.g = { player: p }; cows.d = { ground }; cows.hay = 1;
  // The gesture is chosen before the rest of the feed, which needs the whole game.
  try { cows.feed({ id: 'c', pos: new THREE.Vector3(2, 0, 0), hold() {}, lookAt() {}, farm: {} }); } catch { /* audio, save */ }
  assert.deepEqual(gestures, ['Interact']); assert.equal(ground.reachAsk, false);
  const scene = new THREE.Group(), d = Object.create(Director.prototype);
  d.game = { player: p, scene }; d.fx = { burst() {} }; d.quest = { state: { flags: {} } }; d.interactables = new Map(); d.ground = ground; d.event = () => {};
  const high = { id: 'crate-cog', item: 'cog', obj: new THREE.Group(), pos: new THREE.Vector3(0, 1.6, 0) };
  const low = { id: 'reed-cog', item: 'cog', obj: new THREE.Group(), pos: new THREE.Vector3(0, 0.6, 0) };
  d.pickups = new Map([[high.id, high], [low.id, low]]);
  d.collect(high);
  assert.deepEqual(gestures, ['Interact', 'Interact']); assert.notEqual(p.anim.currentName, 'Pickup');
  d.collect(low);
  assert.equal(p.anim.currentName, 'Pickup'); assert.equal(gestures.length, 2);
});

test('a stick keeps her crouched when it is let go after a creep; Shift still decides on a keyboard', () => {
  const input = { move: { x: 0, y: 0.3 }, keys: new Set(), lastDevice: 'touch' }, state = { creeping: false }, f = creepFilter(input, state);
  f(); assert.equal(state.creeping, true);
  input.move.y = 0; f(); assert.equal(state.creeping, true, 'stopped by the bug: still low');
  input.move.y = 0.7; f(); assert.equal(state.creeping, false);
  input.move.y = 0; f(); assert.equal(state.creeping, false, 'stopping after a walk stays upright');
  const keys = { move: { x: 0, y: 1 }, keys: new Set(['sprint']), lastDevice: 'keyboard' }, st = { creeping: false }, k = creepFilter(keys, st);
  k(); assert.equal(st.creeping, true);
  keys.move.y = 0; keys.keys.clear(); k(); assert.equal(st.creeping, false);
});

test('a tap is one reach without the hold; kneeling it reports a tap; a tap on the way in is the same reach', () => {
  const p = new GroundPose();
  assert.equal(p.update({ creeping: true, reachNow: true }).clip, 'CrouchReach');
  assert.equal(p.update({ creeping: true, reachNow: true, dt: 0.2 }).once, false, 'same reach');
  assert.equal(p.update({ creeping: true, reachNow: true, dt: 0.3 }).once, true, 'replayed on the way out');
  assert.equal(p.update({ creeping: true, dt: 0.81 }).clip, 'Crouch');
  assert.equal(p.update({ creeping: true, speed: 0.6, reachNow: true }).clip, 'CrouchWalk', 'never a one-frame reach while she moves');
  const k = new GroundPose();
  assert.equal(k.update({ kneel: true }).clip, 'Kneel');
  const tap = k.update({ kneel: true, reachNow: true });
  assert.equal(tap.clip, 'Kneel'); assert.equal(tap.tap, true); assert.equal(tap.once, false);
  assert.equal(k.update({ kneel: true }).tap, false);
  const old = new GroundPose({ has: n => n !== 'Kneel' });
  assert.equal(old.update({ kneel: true, reachNow: true }).clip, 'CrouchReach');
});
