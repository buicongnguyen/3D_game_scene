// Small cheap effects (src/fx/vfx.js): what each ground kicks up, how much, and that nothing runs when it should not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vfx, stepKind, lightAt } from '../src/fx/vfx.js';

/** A stand-in for the FX pools: counts what is emitted. */
const fakeFx = () => { const f = { glow: { n: 0, last: null }, soft: { n: 0, last: null } }; for (const k of ['glow', 'soft']) f[k].emit = (p, v, o) => { f[k].n++; f[k].last = o; }; return f; };
const ENV = { night: 0, season: 'summer', hour: 12, raining: false, hold: false, level: 0 };

test('each ground and season kicks up its own thing, and hard ground only when running', () => {
  assert.equal(stepKind('sand', 'summer', 3).kind, 'dust');
  assert.equal(stepKind('grass', 'spring', 3).kind, 'blades');
  assert.equal(stepKind('grass', 'autumn', 3).kind, 'leafy');
  assert.equal(stepKind('grass', 'winter', 3).kind, 'snow');
  assert.equal(stepKind('ice', 'winter', 3).kind, 'glint');
  assert.equal(stepKind('wood', 'summer', 3), null, 'walking on boards: nothing');
  assert.equal(stepKind('stone', 'summer', 6).kind, 'dust', 'running on stone: a little dust');
  assert.ok(stepKind('sand', 'summer', 6).n > stepKind('sand', 'summer', 3).n, 'running kicks up more');
});

test('puffs are dim at night and cost at most a handful of particles', () => {
  assert.ok(lightAt(1) < 0.3 && lightAt(0) === 1);
  const fx = fakeFx(), v = new Vfx(fx, false), p = new THREE.Vector3();
  v.step(p, 'sand', 'summer', 0, 6);
  assert.ok(fx.soft.n >= 1 && fx.soft.n <= 3, `a step: ${fx.soft.n} particles`);
  const day = fx.soft.last.color[0];
  fx.soft.n = 0; v.step(p, 'sand', 'summer', 1, 6);
  assert.ok(fx.soft.last.color[0] < day * 0.4, 'night dust is dark, not glowing');
  fx.soft.n = 0; v.land(p, 'grass', 'summer', 0, 1);
  assert.ok(fx.soft.n <= 14, `a hard landing: ${fx.soft.n} particles`);
  fx.soft.n = 0; v.land(p, 'grass', 'summer', 0, 0.1);
  assert.equal(fx.soft.n, 0, 'a tiny hop kicks up nothing');
  const low = new Vfx(fx, true); fx.soft.n = 0; low.land(p, 'grass', 'summer', 0, 1);
  assert.ok(fx.soft.n <= 8, 'the Low tier gets about half');
});

test('pollen only in daylight, none in rain, at a round or far down the governor ladder; ice glints in winter', () => {
  const rate = env => { const fx = fakeFx(), v = new Vfx(fx, false); for (let i = 0; i < 600; i++) v.update(1 / 60, new THREE.Vector3(), { ...ENV, ...env }); return fx.glow.n; };
  const noon = rate({});
  assert.ok(noon >= 15 && noon <= 40, `10 s of daylight: ${noon} motes`);
  assert.equal(rate({ night: 1, hour: 23 }), 0, 'night');
  assert.equal(rate({ raining: true }), 0, 'rain');
  assert.equal(rate({ hold: true }), 0, 'a round is on');
  assert.equal(rate({ level: 2 }), 0, 'the governor is two steps down');
  const fx = fakeFx(), v = new Vfx(fx, false);
  for (let i = 0; i < 300; i++) v.update(1 / 60, new THREE.Vector3(), { ...ENV, season: 'winter' });
  assert.ok(fx.glow.last.color[2] > 0.95 && fx.glow.last.life < 2, 'winter: short blue-white glints');
});

test('chimneys smoke only when she is near, and never when disabled', () => {
  const run = (dist, extra = {}) => { const fx = fakeFx(), v = new Vfx(fx, false); v.disabled = !!extra.disabled; v.setChimneys([new THREE.Vector3(dist, 8, 0)]); for (let i = 0; i < 600; i++) v.update(1 / 60, new THREE.Vector3(), ENV); return fx.soft.n; };
  assert.ok(run(30) >= 15 && run(30) <= 30, `near: ${run(30)} puffs in 10 s`);
  assert.equal(run(120), 0, 'far away: none');
  assert.equal(run(30, { disabled: true }), 0, '?vfx=off');
});
