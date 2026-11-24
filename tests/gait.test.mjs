import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Vector3 } from 'three';
import { NPC } from '../src/actors/npc.js';
import { Player } from '../src/actors/player.js';

const world = { heightAt: () => 2, grid: { slopeAt: () => 0 } };

test('a short final path step advances the legs only as far as the body travels', () => {
  const n = new NPC(new Scene(), { clone: () => new Group() }, world, 'kid', 'villager-kid', { x: 0, z: 0 });
  n.anim = { has: () => true, play(name) { this.currentName = name; this.current = {}; }, update() {} };
  n.walk([[0, 0.3]], null, 5);
  n.update(0.1);
  assert.equal(n.pos.z, 0.3);
  assert.ok(Math.abs(n.anim.current.timeScale * n.runRef - 3) < 1e-10);
});

test('pushing against a wall idles Mika after collision resolution', () => {
  const p = Object.assign(Object.create(Player.prototype), {
    world, colliders: { resolve: () => ({ x: 0, z: 0 }), groundAt: () => null },
    pos: new Vector3(0, 2, 0), vel: new Vector3(), root: new Group(), grounded: true,
    safeTimer: 1, leapMul: 1, coyote: 0, jumpBuffer: 0, swimCooldown: 0, facing: 0,
    anim: { play(name) { this.currentName = name; }, update() {} },
  });
  const input = { move: { x: 0, y: 1 }, held: () => false, pressed: () => false };
  p.update(1 / 30, input, 0);
  assert.ok(p.vel.z > 0);
  assert.equal(p.pos.z, 0);
  assert.equal(p.anim.currentName, 'Idle');
});
