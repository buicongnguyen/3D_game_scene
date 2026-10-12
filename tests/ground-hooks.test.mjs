import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GroundPoseSystem } from '../src/actors/ground-pose-system.js';
import { clipKind } from '../src/actors/lantern-carry.js';
import { creepFilter, NetRig } from '../src/game/tricks/bugkit.js';
import { Director } from '../src/game/director.js';
import { CowRide } from '../src/actors/cow-ride.js';
import { Reasons } from '../src/actors/lantern-carry.js';

function actor(has = () => true) {
  const anim = {
    has, currentName: 'Idle', busy: false, oneShotLocks: false,
    play(name, { speed = 1 } = {}) { if (!this.busy) { this.currentName = name; this.speed = speed; } },
    once(name) { this.currentName = name; this.busy = true; },
    cancelOneShot() { this.busy = false; this.oneShotLocks = false; }, update() {},
  };
  const model = new THREE.Group(), grip = new THREE.Group(); model.add(grip);
  return { anim, model, grip, pos: new THREE.Vector3(), speed: 0, grounded: true };
}

test('pickup attaches at the grab frame and releases movement before the clip ends', () => {
  const p = actor(), system = new GroundPoseSystem(p), item = new THREE.Group(), ground = new THREE.Group();
  let grabbed = 0, done = 0; ground.add(item);
  assert.equal(system.pickup({ object: item, onGrab: () => grabbed++, onDone: () => done++ }), true);
  assert.equal(p.anim.currentName, 'Pickup'); assert.equal(p.anim.oneShotLocks, true);
  system.update(0.39);
  assert.equal(item.parent, ground); assert.equal(grabbed, 0);
  system.update(0.02);
  assert.equal(item.parent, p.grip); assert.equal(grabbed, 1);
  system.update(0.15);
  assert.equal(p.anim.oneShotLocks, false); assert.equal(p.anim.currentName, 'Pickup');
  system.update(0.45);
  assert.equal(item.parent, null); assert.equal(done, 1); assert.equal(p.pose, null);
});

test('collecting a story cog completes its game event before the cosmetic grab frame', () => {
  const p = actor(), scene = new THREE.Group(), object = new THREE.Group(), d = Object.create(Director.prototype);
  const pickup = { id: 'test-cog', item: 'cog', obj: object, pos: new THREE.Vector3() }, events = [];
  scene.add(object); d.game = { player: p, scene }; d.fx = { burst() {} }; d.quest = { state: { flags: {} } };
  d.pickups = new Map([[pickup.id, pickup]]); d.interactables = new Map(); d.ground = new GroundPoseSystem(p);
  d.event = event => events.push(event);
  d.collect(pickup);
  assert.equal(d.quest.state.flags[pickup.id], true); assert.equal(d.pickups.has(pickup.id), false);
  assert.deepEqual(events, [{ type: 'pickup', item: 'cog', id: pickup.id }]);
  assert.equal(object.parent, scene); assert.equal(p.anim.currentName, 'Pickup');
  d.ground.update(0.4); assert.equal(object.parent, p.grip);
  d.collect(pickup); assert.equal(events.length, 1);
});

test('a scene interrupts only this system\'s pose and removes its temporary pickup', () => {
  const p = actor(), system = new GroundPoseSystem(p), item = new THREE.Group();
  system.pickup({ object: item });
  p.pose = 'Sit'; p.anim.once('Talk');
  system.update(0.1, { blocked: true });
  assert.equal(p.pose, 'Sit'); assert.equal(p.anim.currentName, 'Talk'); assert.equal(p.anim.busy, true);
  assert.equal(system.items.length, 0);
});

test('leaving a ground trick immediately releases its reach action, camera and carry props', () => {
  const p = actor(), system = new GroundPoseSystem(p);
  system.want('trick', { kneel: true }); system.reach(); system.update(0.016);
  assert.equal(p.anim.currentName, 'CrouchReach'); assert.equal(p.anim.busy, true);
  system.release('trick', true);
  assert.equal(p.pose, null); assert.equal(p.anim.busy, false); assert.equal(system.reachLeft, 0);
  assert.equal(p.groundCameraLower, 0);
  system.update(0.016); assert.equal(p.pose, null);
});

test('old models keep their existing gestures and held poses', () => {
  const p = actor(() => false), system = new GroundPoseSystem(p);
  p.pose = 'Sit';
  assert.equal(system.pickup(), false); assert.equal(system.reach(), false);
  system.want('trick', { creeping: true, waiting: true }); system.update(3);
  assert.equal(p.pose, 'Sit'); assert.equal(p.anim.currentName, 'Idle');
});

test('crouch walk scales with speed, idle sitting rises immediately on movement intent', () => {
  const p = actor(), system = new GroundPoseSystem(p);
  p.speed = 0.9; system.want('trick', { creeping: true }); system.update(0.1);
  assert.equal(p.pose, 'CrouchWalk'); assert.equal(p.poseSpeed, 1.5);
  p.speed = 0; system.want('trick', { waiting: true }); system.update(2.6);
  assert.equal(p.pose, 'SitGrass'); assert.ok(p.groundCameraLower > 0.5);
  system.update(0.016, { moving: true });
  assert.equal(p.pose, null);
});

test('holding Shift retains crouch when the creeping character stops', () => {
  const input = { move: { x: 0, y: 0 }, keys: new Set(['sprint']), lastDevice: 'keyboard' }, state = {};
  creepFilter(input, state)(); assert.equal(state.creeping, true);
  input.keys.clear(); creepFilter(input, state)(); assert.equal(state.creeping, false);
});

test('every ground pose frees the lantern hand', () => {
  for (const clip of ['Crouch', 'CrouchWalk', 'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'SitGrass']) assert.equal(clipKind(clip), 'hands', clip);
});

test('a crouched net swing bends only the right arm and does not accumulate rotation', () => {
  const p = actor(); p.pose = 'Crouch';
  for (const name of ['upperarm_R', 'forearm_R', 'thigh_R']) { const bone = new THREE.Bone(); bone.name = name; p.model.add(bone); }
  const net = new NetRig({ clone: () => new THREE.Group() }, p), arm = p.model.getObjectByName('upperarm_R'), leg = p.model.getObjectByName('thigh_R');
  net.pose(0.5); const first = arm.quaternion.clone();
  for (let i = 0; i < 20; i++) net.pose(0.5);
  assert.ok(arm.quaternion.equals(first)); assert.ok(leg.quaternion.equals(new THREE.Quaternion()));
  net.pose(0); assert.ok(arm.quaternion.equals(new THREE.Quaternion())); net.dispose();
});

test('disposing a net mid-swing restores its arm overlay without replacing another system\'s pose', () => {
  const p = actor(); p.pose = 'Crouch';
  for (const name of ['upperarm_R', 'forearm_R']) { const bone = new THREE.Bone(); bone.name = name; p.model.add(bone); }
  const net = new NetRig({ clone: () => new THREE.Group() }, p), arm = p.model.getObjectByName('upperarm_R'), fore = p.model.getObjectByName('forearm_R');
  const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.1, 0.2)); arm.quaternion.copy(base);
  net.pose(0.5); assert.ok(!arm.quaternion.equals(base));
  // A scene has already sampled the forearm since the last swing; cleanup must leave it alone.
  const scenePose = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, 0.1)); fore.quaternion.copy(scenePose);
  net.dispose();
  assert.ok(arm.quaternion.equals(base), 'the net leaves no procedural bend behind on quit');
  assert.ok(fore.quaternion.equals(scenePose), 'a newer scene pose still owns the forearm');
  assert.equal(net.net.parent, null);
});

test('interrupting a hay pickup before the grab keeps the instant armful visible, but never recreates consumed hay', () => {
  for (const consumed of [false, true]) {
    const p = actor(), reasons = new Reasons();
    p.carry = { want: (state, key) => reasons.want(state, key), release: key => reasons.release(key) };
    const ground = new GroundPoseSystem(p), cows = Object.create(CowRide.prototype);
    cows.g = { player: p }; cows.d = { ground, audio: { click() {} }, ui: { toast() {} } }; cows.hay = 0;
    cows.takeHay(); assert.equal(cows.hay, 1); assert.equal(cows.hayBundle, undefined);
    ground.update(0.2);
    if (consumed) cows.hay = 0;
    // A dialogue/scene owns the actor before the cosmetic grab frame.
    ground.update(0.016, { blocked: true });
    assert.equal(ground.items.length, 0);
    if (consumed) { assert.equal(cows.hayBundle, undefined); assert.equal(reasons.has('cow-hay'), false); }
    else {
      assert.equal(cows.hayBundle?.parent, p.grip, 'held game hay is still shown after the interrupted action');
      assert.equal(reasons.has('cow-hay'), true, 'the armful still frees the lantern hand');
    }
  }
});
