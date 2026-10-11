import test from 'node:test';
import assert from 'node:assert/strict';
import { GroundPose, GROUND } from '../src/actors/pose-ground.js';

test('creeping uses speed-matched shuffle with hysteresis and stands on ordinary movement', () => {
  const p = new GroundPose();
  assert.equal(p.update({ creeping: true }).clip, 'Crouch');
  assert.equal(p.update({ creeping: true, speed: 0.12 }).clip, 'Crouch');
  assert.equal(p.update({ creeping: true, speed: 0.6 }).speed, 1);
  assert.equal(p.update({ creeping: true, speed: 0.12 }).clip, 'CrouchWalk');
  assert.equal(p.update({ creeping: true, speed: 0.08 }).clip, 'Crouch');
  assert.equal(p.update({ creeping: true, speed: 1.1 }).clip, 'CrouchWalk');
  assert.equal(p.update({ creeping: true, speed: 1.2 }).active, false);
  assert.equal(p.update({ speed: 0.6 }).active, false);
});

test('pickup triggers once, preserves instant event timing and releases movement by 0.55 seconds', () => {
  const p = new GroundPose();
  const first = p.update({ pickup: true });
  assert.equal(first.clip, 'Pickup'); assert.equal(first.once, true);
  assert.equal(first.lockFor, 0.55); assert.equal(first.grabAt, 0.4);
  assert.equal(p.update({ pickup: true, speed: 2, dt: 0.4 }).clip, 'Pickup');
  const after = p.update({ pickup: true, speed: 2, dt: 0.16 });
  assert.equal(after.active, false); assert.equal(after.lockFor, 0);
  assert.equal(p.update({ pickup: true }).once, false);
  p.update({ pickup: false });
  assert.equal(p.update({ pickup: true }).once, true);
});

test('reach returns to hold, repeated taps can replay it, and movement interrupts it', () => {
  const p = new GroundPose();
  assert.equal(p.update({ reach: true }).once, true);
  assert.equal(p.update({ reach: true, dt: 0.4 }).once, false);
  assert.equal(p.update({ reach: true, dt: 0.41 }).clip, 'CrouchReachHold');
  p.update({ reach: false });
  assert.equal(p.update({ reach: true }).once, true);
  assert.equal(p.update({ reach: true, speed: 0.4 }).active, false);
});

test('waiting sits only after 2.5 seconds and stands immediately on movement', () => {
  const p = new GroundPose();
  assert.equal(p.update({ waiting: true, dt: GROUND.sitDelay }).active, false);
  assert.equal(p.update({ waiting: true, dt: 0.01 }).clip, 'SitGrass');
  assert.equal(p.update({ waiting: true, speed: 0.11 }).active, false);
  assert.equal(p.update({ waiting: true, dt: 2.4 }).active, false);
  assert.equal(p.update({ kneel: true }).clip, 'Kneel');
});

test('older assets and conflicting mount/air states fall back without movement locks', () => {
  const old = new GroundPose({ has: () => false });
  assert.equal(old.update({ pickup: true }).active, false);
  assert.equal(old.update({ creeping: true }).lockFor, 0);
  const p = new GroundPose(); p.update({ pickup: true });
  assert.equal(p.update({ blocked: true }).active, false);
  assert.equal(p.update({ creeping: true, grounded: false }).active, false);
  p.clear(); assert.equal(p.update({ pickup: true }).once, true);
});
