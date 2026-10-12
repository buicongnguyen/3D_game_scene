import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkyGaze } from '../src/game/skygaze.js';
import { Tricks } from '../src/game/tricks.js';
import { TRICKS } from '../src/content/tricks.js';
import { profileFor } from '../src/content/constellations.js';

const game = kind => ({ fx: { weather: { isParticlePool: true }, weatherKind: kind }, time: { season: 'summer', speed: 0 }, shownSeason: 'summer', shownHour: () => 22 });

test('sky mode reads the weather identifier, leaving the particle pool intact', () => {
  const g = game('rain'), self = { g, st: { lamps: { mill: true } } }, pool = g.fx.weather;
  assert.equal(SkyGaze.prototype.mode.call(self, { lamp: 'mill' }).look, 'rain');
  g.fx.weatherKind = null;
  assert.equal(SkyGaze.prototype.mode.call(self, { lamp: 'mill' }).look, 'night');
  assert.equal(g.fx.weather, pool);
});

test('clear-sky tricks close during actual rain, while other tricks keep their rules', () => {
  const g = game('rain'), self = { g, openArg: {}, season: () => 'summer' };
  const clear = TRICKS.find(t => t.clear && t.seasons.includes('summer'));
  const other = TRICKS.find(t => !t.clear && t.seasons.includes('summer'));
  assert.ok(clear && other);
  assert.equal(Tricks.prototype.open.call(self, clear), false);
  assert.equal(Tricks.prototype.open.call(self, other), true);
  g.fx.weatherKind = null;
  assert.equal(Tricks.prototype.open.call(self, clear), true);
});

test('sky disposal releases only its own resources, including stars rebuilt for a new hour', () => {
  const s = Object.create(SkyGaze.prototype), scene = new THREE.Scene();
  const ambient = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(ambient);
  let ambientDisposals = 0;
  for (const r of [ambient.geometry, ambient.material]) r.addEventListener('dispose', () => ambientDisposals++);
  const owned = new Map(), roots = [];
  const watch = () => {
    roots.push(s.skySt.group);
    s.group.traverse(o => {
      for (const r of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) if (r && !owned.has(r)) {
        owned.set(r, 0); r.addEventListener('dispose', () => owned.set(r, owned.get(r) + 1));
      }
    });
  };
  Object.assign(s, { g: { scene, shownSeason: 'summer', time: { season: 'summer' }, renderer: { q: { name: 'Low' } } },
    m: { look: 'night' }, profile: profileFor('en'), streaks: [], birds: [], flight: { liftK: 1 }, curHour: () => 22 });
  s.build(); watch();
  assert.equal(s.group.parent, scene); assert.equal(owned.size, 8);
  s.skySt.dispose(); s.buildSky(); watch();
  assert.equal(owned.size, 12, 'a new star field owns four new resources');
  const group = s.group;
  s.dispose();
  assert.equal(group.parent, null); assert.ok(roots.every(r => r.parent === null));
  assert.ok([...owned.values()].every(n => n === 1), 'every sky-owned geometry/material is disposed exactly once');
  assert.equal(ambient.parent, scene); assert.equal(ambientDisposals, 0);
  s.dispose(); assert.ok([...owned.values()].every(n => n === 1), 'repeat cleanup is harmless');
  ambient.geometry.dispose(); ambient.material.dispose();
});
