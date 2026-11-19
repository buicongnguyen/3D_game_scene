// Photo mode's pure part (src/game/photo.js) and its filter pass (src/engine/photo-pass.js): shot sizes, the free
// camera's limits and collisions, when it may open, the album in storage, the tables and the frame geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { POSES, FILTERS, FILTER_BASE, FRAMES, LENSES, ROLLS, RIG, MAX_SHOTS, SEASON_NAMES, CAPTION_PLACES, canEnter, poseOk, solveRig, fitShot,
  frameLayout, nearestPlace, readShots, addShot, deleteShot, shotName, padEdges, captionPlace } from '../src/game/photo.js';
import { shotsKey, clearShots } from '../src/game/saves.js';
import { PhotoShader, makePhotoPass, applyFilter } from '../src/engine/photo-pass.js';
import { PLACES, WATER_Y } from '../src/world/layout.js';
import { MIKA_CLIPS } from './asset-contracts.mjs';

// ------------------------------------------------------------------ fitShot
test('fitShot: a phone gets at most 2x and 1.5 MP, and stays in its memory budget with MSAA', () => {
  const pr = fitShot({ w: 390, h: 844, dpr: 3, cur: 1, touch: true, samples: 0, maxTex: 8192 });
  assert.ok(pr <= 2, `ratio ${pr}`);
  assert.ok(390 * 844 * pr * pr <= 1.5e6 + 1, 'pixel cap');
  const msaa = fitShot({ w: 390, h: 844, dpr: 3, cur: 1, touch: true, samples: 4, maxTex: 8192 });
  assert.ok(390 * 844 * msaa * msaa * (16 * 5 + 12) <= 80e6 + 1, 'memory cap with 4 samples');
  assert.ok(msaa < pr, 'MSAA costs resolution');
});

test('fitShot: a 1x desktop stays 1x, never below the current ratio, and the texture limit holds', () => {
  assert.equal(fitShot({ w: 1920, h: 1080, dpr: 1, cur: 1, touch: false, samples: 4, maxTex: 16384 }), 1);
  assert.equal(fitShot({ w: 390, h: 844, dpr: 3, cur: 1.9, touch: true, samples: 4, maxTex: 8192 }), 1.9);
  const big = fitShot({ w: 2560, h: 1440, dpr: 2, cur: 0.5, touch: false, samples: 0, maxTex: 2048 });
  assert.ok(2560 * big <= 2048 + 1e-6, `long side ${2560 * big}`);
  const huge = fitShot({ w: 3000, h: 1000, dpr: 2, cur: 0.5, touch: false, samples: 0, maxTex: 16384 });
  assert.ok(3000 * huge <= 4096 + 1e-6, 'never past 4096 px');
});

// ------------------------------------------------------------------ solveRig
const flat = (over = {}) => ({ pos: new THREE.Vector3(0, 5, 0), pivotH: 1.45, heightAt: () => 5, raycast: () => 1, submerged: false, room: null, zone: null, ...over });
const out = () => ({ pos: new THREE.Vector3(), pivot: new THREE.Vector3(), look: new THREE.Vector3(), dist: 0 });
const rig = (o = {}) => ({ yaw: 0, pitch: 0.3, dist: 5, pan: new THREE.Vector3(), roll: 0, fov: 55, ...o });

test('solveRig: every limit of the rig', () => {
  const r = rig({ pitch: 3, dist: 50, roll: 2, fov: 10, pan: new THREE.Vector3(9, 9, 0) });
  solveRig(r, flat(), out());
  assert.equal(r.pitch, RIG.pitchMax); assert.equal(r.dist, RIG.distMax); assert.equal(r.roll, RIG.roll); assert.equal(r.fov, RIG.fovMin);
  assert.ok(Math.hypot(r.pan.x, r.pan.z) <= RIG.panMax + 1e-9); assert.equal(r.pan.y, RIG.panUp);
  const r2 = rig({ pitch: -3, dist: 0.1, roll: -2, fov: 120, pan: new THREE.Vector3(0, -9, 0) });
  solveRig(r2, flat(), out());
  assert.equal(r2.pitch, RIG.pitchMin); assert.equal(r2.dist, RIG.distMin); assert.equal(r2.roll, -RIG.roll); assert.equal(r2.fov, RIG.fovMax); assert.equal(r2.pan.y, RIG.panDown);
});

test('solveRig: open ground puts the camera dist behind the pivot, looking along the rig', () => {
  const o = solveRig(rig({ pitch: 0.2 }), flat(), out());
  assert.ok(Math.abs(o.dist - 5) < 1e-9);
  assert.ok(Math.abs(o.pos.distanceTo(o.pivot) - 5) < 1e-9);
  assert.ok(Math.abs(o.pivot.y - 6.45) < 1e-9);
  assert.ok(o.pos.z < 0, 'yaw 0 looks along +z, so the camera is behind on -z');
});

test('solveRig: terrain, colliders and the ground pull it in or lift it', () => {
  // a hill 2 m behind the pivot
  const hill = flat({ heightAt: (x, z) => (z < -2 ? 20 : 5) });
  const o = solveRig(rig({ pitch: 0 }), hill, out());
  assert.ok(o.dist < 2 && o.dist >= RIG.distMin, `pulled in to ${o.dist}`);
  const wall = flat({ raycast: (ax, ay, az, bx, by, bz) => (Math.abs(bz - az) > 2 ? 0.4 : 1) });
  const w = solveRig(rig({ pitch: 0 }), wall, out());
  assert.ok(w.dist <= 5 * 0.4 - 0.3 + 1e-9, `wall pulls in to ${w.dist}`);
  const low = solveRig(rig({ pitch: -0.6, dist: 12 }), flat(), out());
  assert.ok(low.pos.y >= 5.45 - 1e-9, 'never under the ground');
});

test('solveRig: the camera stays on her side of the water surface', () => {
  const river = flat({ pos: new THREE.Vector3(0, -0.5, 0), heightAt: () => -3 });
  const above = solveRig(rig({ pitch: -0.6, dist: 8 }), river, out());
  assert.ok(above.pos.y >= WATER_Y + 0.45 - 1e-9, `above: ${above.pos.y}`);
  const under = solveRig(rig({ pitch: 1.2, dist: 8 }), { ...river, submerged: true, pos: new THREE.Vector3(0, -2.5, 0) }, out());
  assert.ok(under.pos.y <= WATER_Y - 0.35 + 1e-9, `under: ${under.pos.y}`);
});

test('solveRig: indoors both ends stay in the room; in a zone inside its real radius', () => {
  const box = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 8, 2));
  const room = p => p.clone().clamp(box.min, box.max);
  const o = solveRig(rig({ dist: 10, pan: new THREE.Vector3(2.4, 0, 0) }), flat({ room }), out());
  assert.ok(box.containsPoint(o.pos) && box.containsPoint(o.pivot));
  const zone = { x: 0, z: 0, r: 3 };
  const z = solveRig(rig({ dist: 12, pitch: 0 }), flat({ zone }), out());
  assert.ok(Math.hypot(z.pos.x, z.pos.z) <= 3 + 1e-9 && Math.hypot(z.pivot.x, z.pivot.z) <= 3 + 1e-9);
});

test('solveRig: a wall between her chest and the panned pivot stops the pan', () => {
  const env = flat({ raycast: (ax, ay, az, bx) => (bx - ax > 1 ? 0.5 : 1) });
  const o = solveRig(rig({ pan: new THREE.Vector3(2.4, 0, 0) }), env, out());
  assert.ok(o.pivot.x < 1.25, `pivot stopped at ${o.pivot.x}`);
});

// ------------------------------------------------------------------ canEnter / poseOk
const open = { world: true, quest: true, menu: true, dialogue: false, shot: false, tracking: false, hold: false, focus: false, rooms: false, lost: false };
test('canEnter: open by default, and each blocking flag alone closes it', () => {
  assert.equal(canEnter(open), true);
  for (const k of ['world', 'quest', 'menu']) assert.equal(canEnter({ ...open, [k]: false }), false, k);
  for (const k of ['dialogue', 'shot', 'tracking', 'hold', 'focus', 'rooms', 'lost']) assert.equal(canEnter({ ...open, [k]: true }), false, k);
});

test('poseOk: standing free only', () => {
  const p = { anim: { busy: false }, grounded: true, pose: null, swimming: false, climb: null, mounted: null };
  assert.equal(poseOk(p), true);
  assert.equal(poseOk({ ...p, swimming: true }), false);
  assert.equal(poseOk({ ...p, mounted: {} }), false);
  assert.equal(poseOk({ ...p, anim: { busy: true } }), false);
  assert.equal(poseOk({ ...p, grounded: false }), false);
  assert.equal(poseOk({ ...p, pose: 'Sit' }), false);
  assert.equal(poseOk({ ...p, anim: null }), false);
});

// ------------------------------------------------------------------ storage
class Store {
  constructor(full = false) { this.m = new Map(); this.full = full; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.full) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const shot = i => ({ id: `s${i}`, t: i, url: `data:image/jpeg;base64,${i}`, w: 390, h: 844, filter: 'none', frame: 'none', place: 'Kawabe', season: 'spring' });

test('addShot: newest first, full leaves the list as it was, a refusing storage gives quota', () => {
  const st = new Store();
  for (let i = 0; i < MAX_SHOTS; i++) assert.equal(addShot(st, 'explore', shot(i)), 'ok');
  const before = st.getItem(shotsKey('explore'));
  assert.equal(readShots(st, 'explore')[0].id, `s${MAX_SHOTS - 1}`);
  assert.equal(addShot(st, 'explore', shot(99)), 'full');
  assert.equal(st.getItem(shotsKey('explore')), before);
  const two = new Store(); addShot(two, 2, shot(1)); const kept = two.getItem(shotsKey(2)); two.full = true;
  assert.equal(addShot(two, 2, shot(2)), 'quota');
  assert.equal(two.getItem(shotsKey(2)), kept);
});

test('deleteShot, broken JSON and clearShots', () => {
  const st = new Store();
  addShot(st, 1, shot(1)); addShot(st, 1, shot(2));
  assert.equal(deleteShot(st, 1, 's1'), true);
  assert.deepEqual(readShots(st, 1).map(s => s.id), ['s2']);
  assert.equal(deleteShot(st, 1, 'nope'), false);
  st.setItem(shotsKey(3), '{not json');
  assert.deepEqual(readShots(st, 3), []);
  st.setItem(shotsKey(3), JSON.stringify({ v: 2, list: [shot(1)] }));
  assert.deepEqual(readShots(st, 3), [], 'another version is not read as this one');
  const had = globalThis.localStorage;
  globalThis.localStorage = st;
  try { clearShots(1); assert.equal(st.getItem(shotsKey(1)), null); } finally { globalThis.localStorage = had; }
  assert.equal(shotsKey('explore'), 'starline-shots-explore');
});

test('shotName and padEdges', () => {
  assert.equal(shotName(new Date(2026, 10, 9, 7, 5)), 'starline-20261109-0705.jpg');
  assert.match(shotName(), /^starline-\d{8}-\d{4}\.jpg$/);
  assert.deepEqual(padEdges([true, false, false], [true, true, false]), [1]);
  assert.deepEqual(padEdges(undefined, [true]), [0]);
  assert.deepEqual(padEdges([true], [false]), []);
  // the whole readPad() object as `prev` (the entry seed once was): a button held across the entry is no new press
  assert.deepEqual(padEdges({ buttons: [false, false, false, false, false, false, false, false, false, false, false, true] },
    [false, false, false, false, false, false, false, false, false, false, false, true]), []);
});

test('captionPlace: no trailing gloss, a capital first letter', () => {
  assert.equal(captionPlace('Hoshi Valley'), 'Hoshi Valley');
  assert.equal(captionPlace('Thung lũng Hoshi (Ngôi Sao)'), 'Thung lũng Hoshi');
  assert.equal(captionPlace('호시 계곡 (별의 골짜기)'), '호시 계곡');
  assert.equal(captionPlace('ホシ谷（星の谷）'), 'ホシ谷');
  assert.equal(captionPlace("cối xay của ông Ōta"), "Cối xay của ông Ōta");
  assert.equal(captionPlace(''), '');
});

// ------------------------------------------------------------------ tables
test('every pose is a clip Mika has', () => {
  for (const p of POSES) if (p.clip) assert.ok(MIKA_CLIPS.includes(p.clip), p.clip);
  assert.equal(POSES[0].clip, null, '"as is" first');
});

test('every label is marked for translation, and every filter sets only the pass\'s uniforms', () => {
  const src = fs.readFileSync(new URL('../src/game/photo.js', import.meta.url), 'utf8');
  const labels = [...POSES, ...FILTERS, ...FRAMES, ...LENSES, ...ROLLS].map(x => x.label).concat(Object.values(SEASON_NAMES), CAPTION_PLACES.map(c => c.name));
  for (const l of labels) assert.ok(src.includes(`N_('${l.replace(/'/g, "\\'")}')`) || src.includes(`N_("${l}")`), `N_ for ${l}`);
  assert.equal(FILTERS[0].u, null, 'None switches the pass off');
  for (const f of FILTERS.slice(1)) {
    assert.deepEqual(Object.keys(f.u).sort(), Object.keys(FILTER_BASE).sort(), f.id);
    for (const k of Object.keys(f.u)) assert.ok(k in PhotoShader.uniforms, `${f.id}.${k}`);
  }
});

test('the pass starts off; a filter turns it on and None off', () => {
  const pass = makePhotoPass();
  assert.equal(pass.enabled, false);
  applyFilter(pass, FILTERS.find(f => f.id === 'old').u);
  assert.equal(pass.enabled, true);
  assert.equal(pass.uniforms.uSepia.value, 0.85);
  applyFilter(pass, null);
  assert.equal(pass.enabled, false);
});

test('frameLayout scales exactly with the picture', () => {
  for (const f of FRAMES.map(x => x.id)) {
    const a = frameLayout(390, 844, f), b = frameLayout(780, 1688, f);
    const walk = (x, y, path) => {
      if (typeof x === 'number') { assert.ok(Math.abs(x * 2 - y) < 1e-9, `${f} ${path}`); return; }
      if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], y[k], `${path}.${k}`);
      else assert.equal(x, y, `${f} ${path}`);
    };
    walk({ ...a, frame: undefined, wide: undefined }, { ...b, frame: undefined, wide: undefined }, '');
  }
});

test('nearestPlace: a name within 60 m, else the valley', () => {
  assert.equal(nearestPlace(PLACES.kawabe.x, PLACES.kawabe.z), 'Kawabe');
  assert.equal(nearestPlace(PLACES.shrine.x + 3, PLACES.shrine.z), 'Forest Shrine');
  assert.equal(nearestPlace(400, 400), 'Hoshi Valley');
});
