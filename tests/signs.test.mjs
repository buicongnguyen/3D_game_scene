// Name boards (content/signs.js) and the farmed field grid (world/fields.js): pure data checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SIGNS, BOARD, signPlace, signFor } from '../src/content/signs.js';
import { BUILDINGS, PADDIES, PATHS } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';
import { INTERIORS, DOOR_SPOTS } from '../src/world/interiors.js';
import { placeProblems, doorPoint, inFootprint } from '../src/world/roads.js';
import { SHOPS } from '../src/content/shops.js';
import { PEOPLE, SPOTS } from '../src/content/townsfolk.js';
import { TRICKS } from '../src/content/tricks.js';
import { VEG_BEDS, CUT_IN_AUTUMN, LIGHT_COLOURS, bedRows, fieldLights, lightGlow } from '../src/world/fields.js';

const building = id => BUILDINGS.find(b => b.id === id);
const place = s => { const b = s.building ? building(s.building) : null; return signPlace(s, b, b && FOOTPRINT[b.model], b && DOOR_SPOTS[b.model]); };
/** The board's centre and the feet of its posts. */
function feet(s) {
  const p = place(s), [w] = BOARD[s.kind], ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
  const offs = s.mount === 'hang' ? [w / 2 + 0.36] : [-(w / 2 + 0.1), w / 2 + 0.1];
  return [[p.x, p.z], ...offs.map(o => [p.x + ax * o, p.z + az * o])];
}
function segDist(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

test('signs: ids are unique, every board has a kind, a mount and a name, and they fit the texture', () => {
  assert.equal(new Set(SIGNS.map(s => s.id)).size, SIGNS.length);
  assert.ok(SIGNS.length <= 35, 'the board texture has 35 face cells');
  for (const s of SIGNS) {
    assert.ok(BOARD[s.kind], `${s.id}: kind`);
    assert.ok(['stand', 'hang'].includes(s.mount), `${s.id}: mount`);
    assert.ok(s.building ? building(s.building) : s.at, `${s.id}: a building or a place`);
    for (const story of ['classic', 'grandma']) {
      const v = signFor(s, story);
      assert.ok(typeof v.text === 'string' && v.text.trim(), `${s.id}: a name in ${story}`);
    }
  }
});

test('signs: every building a player can tell apart has a board', () => {
  const named = new Set(SIGNS.map(s => s.near || s.building));
  const scenery = new Set(['platform', 'haltPlatform', 'torii', 'toriiTop']);
  for (const b of BUILDINGS) if (!scenery.has(b.id)) assert.ok(named.has(b.id), `no board for ${b.id}`);
  for (const r of INTERIORS) assert.ok(named.has(r.building), `no board for the enterable ${r.building}`);
});

test('signs: boards use the names the game already uses, in both stories', () => {
  const by = Object.fromEntries(SIGNS.map(s => [s.id, s]));
  assert.equal(signFor(by.cottage, 'classic').text, "Sora's cottage");
  assert.equal(signFor(by.cottage, 'grandma').text, "Grandma's cottage");
  for (const shop of Object.values(SHOPS)) {
    const s = shop.room ? by[shop.room] : by.stall;
    assert.equal(s.text, shop.name, `the board of ${shop.name}`);
    assert.equal(s.kind, 'shop');
  }
  // a home's board names somebody who lives there
  for (const s of SIGNS.filter(q => q.kind === 'home' && q.building)) {
    const folk = PEOPLE.filter(p => p.home === s.building);
    if (!folk.length) continue;
    const names = folk.map(p => p.name.split(' ').pop());
    assert.ok(names.some(n => s.text.includes(n)), `${s.id}: "${s.text}" names none of ${names.join(', ')}`);
    if (s.sub) assert.ok(folk.some(p => p.role === s.sub), `${s.id}: "${s.sub}" is nobody's job there`);
  }
});

test('signs: every board text is translated into Vietnamese, Korean and Japanese', () => {
  for (const lang of ['vi', 'ko', 'ja']) {
    const pack = JSON.parse(fs.readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const s of SIGNS) for (const v of [s, s.grandma || {}]) for (const t of [v.text, v.sub].filter(Boolean)) {
      assert.ok(pack[t], `${lang}: "${t}" (${s.id}) is not translated`);
    }
  }
});

test('signs: boards stand on dry open ground, clear of walls, doors, roads, meeting spots and trick places', () => {
  for (const s of SIGNS) {
    const pts = feet(s);
    for (const [x, z] of pts) {
      if (s.top === undefined) assert.deepEqual(placeProblems(x, z), [], `${s.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      else assert.ok(!inFootprint(x, z, 0.1), `${s.id}: in a wall`);
      for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) {
        const d = segDist(...p.pts[i], ...p.pts[i + 1], x, z);
        assert.ok(d > p.w / 2 + 0.3, `${s.id}: ${d.toFixed(2)} m from a road's middle (road ${p.w} m wide)`);
      }
      for (const b of BUILDINGS) {
        const door = DOOR_SPOTS[b.model] && doorPoint(b.id);
        if (door) assert.ok(Math.hypot(door.x - x, door.z - z) > 1.4, `${s.id}: in front of ${b.id}'s door`);
      }
      for (const [id, q] of Object.entries(SPOTS)) assert.ok(Math.hypot(q.x - x, q.z - z) > 1.4, `${s.id}: on the spot ${id}`);
      for (const t of TRICKS) assert.ok(Math.hypot(t.place.x - x, t.place.z - z) > 3, `${s.id}: at the trick place ${t.id}`);
    }
  }
});

test('fields: beds, autumn stubble and lights', () => {
  const ids = new Set(PADDIES.map(p => p.id));
  for (const id of [...VEG_BEDS, ...CUT_IN_AUTUMN]) assert.ok(ids.has(id), `${id} is a plot`);
  for (const id of CUT_IN_AUTUMN) assert.ok(!VEG_BEDS.has(id), `${id}: only rice is cut`);
  assert.ok(VEG_BEDS.size >= 3 && VEG_BEDS.size <= PADDIES.length / 2, 'the grid mixes rice and vegetables, mostly rice');
  // the frog and firefly tricks play at the flooded bottom paddies
  for (const t of TRICKS.filter(q => ['frogs', 'firefly'].includes(q.id))) {
    const near = PADDIES.filter(p => Math.hypot(p.x - t.place.x, p.z - t.place.z) < 14);
    assert.ok(near.length && near.every(p => !VEG_BEDS.has(p.id)), `${t.id}: its paddies keep their water`);
  }
  for (const p of PADDIES.filter(q => VEG_BEDS.has(q.id))) {
    const rows = bedRows(p);
    assert.ok(rows.some(r => r.kind === 'leafy') && rows.some(r => r.kind === 'radish'));
    for (const r of rows) for (const z of r.plants) assert.ok(Math.abs(r.x - p.x) < p.w / 2 - 0.5 && Math.abs(z - p.z) < p.d / 2 - 0.5, 'plants stay inside the bund');
  }
  const { posts, lanterns, wires } = fieldLights();
  assert.equal(posts.length, PADDIES.length * 6);
  assert.equal(lanterns.filter(l => l.big).length, PADDIES.length * 4);
  assert.ok(lanterns.length <= 320 && wires.length <= 240, 'a small, fixed number of instances');
  assert.ok(lanterns.every(l => l.c >= 0 && l.c < LIGHT_COLOURS.length));
  assert.equal(new Set(lanterns.map(l => l.c)).size, LIGHT_COLOURS.length, 'every festival colour is used');
  // posts stand on the bunds (never in the grass lanes between plots), and strings run only along west and east bunds
  for (const q of posts) assert.ok(PADDIES.some(p => Math.abs(Math.abs(q.x - p.x) - p.w / 2) < 0.01 && Math.abs(q.z - p.z) <= p.d / 2 + 0.01), 'post on a bund');
  for (const [ax, , , bx] of wires) assert.equal(ax, bx, 'strings run north-south');
  for (const t of TRICKS) for (const q of posts) assert.ok(Math.hypot(q.x - t.place.x, q.z - t.place.z) > 1.5, `a light post at the ${t.id} sign`);
  assert.equal(lightGlow(0), 0);
  assert.equal(lightGlow(1), 1);
  assert.ok(lightGlow(0.2) > 0 && lightGlow(0.2) < 0.5, 'the lights come on through dusk');
});

test('signs: long Japanese names wrap after a particle, short ones and single Latin words stay whole', async () => {
  const { twoLines } = await import('../src/world/signs.js');
  assert.deepEqual(twoLines('小森の菓子と紙'), ['小森の', '菓子と紙']);
  assert.deepEqual(twoLines('高森の市の屋台'), ['高森の', '市の屋台']);
  assert.equal(twoLines('藤田商店'), null);
  assert.equal(twoLines('Bakery'), null);
  assert.deepEqual(twoLines('Fujita Grocery'), ['Fujita', 'Grocery']);
});
