import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Director } from '../src/game/director.js';
import { Quest } from '../src/game/quest.js';
import { stateAt } from '../src/game/fastforward.js';
import { PLACES } from '../src/world/layout.js';

function director(story, step) {
  const d = Object.create(Director.prototype);
  d.quest = new Quest(stateAt(step, 'alone', story));
  d.zones = new Map();
  d.world = { heightAt: () => 22 };
  d.game = { player: { pos: new THREE.Vector3(85, 22, -78) } };
  return d;
}

for (const story of ['grandma', 'classic']) test(`${story}: the gate objective leads inside its arrival zone, where the next story step can begin`, () => {
  const d = director(story, 'c3.fox');
  // The gate is at z=-80; the existing arrival trigger is six metres beyond it.
  // Its strict radius excludes the gate itself, so guiding to PLACES leaves the player stuck.
  const center = new THREE.Vector3(85, 22, -86);
  d.zone('orchardGate', center, 6, () => d.step('c3.fox'));
  assert.equal(Math.hypot(PLACES.orchardGate.x - center.x, PLACES.orchardGate.z - center.z), 6);
  const target = d.markerTarget(), zone = d.zones.get('orchardGate');
  assert.ok(Math.hypot(target.x - center.x, target.z - center.z) < zone.r, 'standing at the guidance pin must satisfy the horizontal arrival check');
  assert.ok(Math.abs(target.y - zone.pos.y) < 12, 'the pin is on the correct level');
  if (zone.when() && Math.hypot(target.x - center.x, target.z - center.z) < zone.r) d.quest.dispatch({ type: 'arrive', zone: zone.id });
  assert.equal(d.quest.state.step, 'c3.follow');
  assert.deepEqual(center.toArray(), [85, 22, -86], 'guidance must not mutate the registered trigger');
});

test('arrival guidance follows the registered zone if its entrance moves, while keeping the pin above terrain', () => {
  const d = director('grandma', 'p.cottage');
  const center = new THREE.Vector3(-57, 16, 142);
  d.zone('cottage', center, 7, () => d.step('p.cottage'));
  const target = d.markerTarget();
  assert.deepEqual(target.toArray(), [-57, 24, 142]);
  assert.deepEqual(center.toArray(), [-57, 16, 142]);
});

test('a missing or inactive arrival zone retains ordinary place guidance', () => {
  const d = director('classic', 'p.cottage'), p = PLACES.cottage;
  assert.deepEqual(d.markerTarget().toArray(), [p.x, 24, p.z]);
  d.zone('cottage', new THREE.Vector3(200, 16, 200), 7, () => false);
  assert.deepEqual(d.markerTarget().toArray(), [p.x, 24, p.z]);
});
