// "Look up at the sky": the places (content/skyspots.js), what the sky shows at each hour, and the saved wish counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SKY_SPOTS, SKY_SPOT, LAMP_STEP, skyLook, cleanWishes, wishLineIndex } from '../src/content/skyspots.js';
import { placeProblems, sharedGrid } from '../src/world/roads.js';
import { LAMPS, BUILDINGS, PLACES, DECK_Y, VIADUCT } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';
import { DOOR_SPOTS } from '../src/world/interiors.js';
import { SIGNS, signPlace } from '../src/content/signs.js';
import { TRICKS } from '../src/content/tricks.js';
import { STEP_INDEX } from '../src/game/story.js';
import { freshState, migrate, Quest } from '../src/game/quest.js';

const lamp = id => LAMPS.find(l => l.id === id);
const building = id => BUILDINGS.find(b => b.id === id);

test('sky spots: six to nine places, unique ids, every lamp tower among them', () => {
  assert.ok(SKY_SPOTS.length >= 6 && SKY_SPOTS.length <= 9, `${SKY_SPOTS.length} spots`);
  assert.equal(new Set(SKY_SPOTS.map(s => s.id)).size, SKY_SPOTS.length);
  for (const s of SKY_SPOTS) {
    assert.equal(SKY_SPOT[s.id], s);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && s.r >= 2.5 && s.r <= 6, s.id);
    assert.ok(['ground', 'island', 'deck', 'gallery'].includes(s.on), s.id);
    assert.ok(Number.isFinite(s.face.x) && Number.isFinite(s.face.z) && typeof s.why === 'string', s.id);
    if (s.lamp) assert.ok(lamp(s.lamp) && LAMP_STEP[s.lamp] in STEP_INDEX, `${s.id}: lamp ${s.lamp}`);
  }
  for (const l of LAMPS) assert.ok(SKY_SPOTS.some(s => s.lamp === l.id), `no sky spot at the ${l.name}`);
});

test('sky spots stand on dry, level, reachable ground (or on the island, the deck, the gallery they name)', () => {
  const grid = sharedGrid();
  for (const s of SKY_SPOTS) {
    if (s.on === 'ground') assert.deepEqual(placeProblems(s.x, s.z), [], `${s.id} at ${s.x}, ${s.z}`);
    else if (s.on === 'island') {
      // the mill island is in the river by design: everything else must hold, and the spot must be on the island's top
      assert.deepEqual(placeProblems(s.x, s.z).filter(p => p !== 'on the river'), [], s.id);
      const I = PLACES.millIsland;
      assert.ok(Math.hypot(s.x - I.x, s.z - I.z) < I.r - 1 && grid.heightAt(s.x, s.z) > 1, `${s.id} is on the mill island`);
    } else if (s.on === 'deck') {
      assert.equal(s.y, DECK_Y);
      assert.ok(s.x > VIADUCT.x0 && s.x < VIADUCT.x1 && Math.abs(s.z - VIADUCT.z) < 3.5, `${s.id} is on the viaduct`);
      // west of the span that is missing until chapter four, so it can be walked to before the repair
      assert.ok(s.x < VIADUCT.brokenSpan[0] || s.x > VIADUCT.brokenSpan[1], `${s.id} is not over the gap`);
    } else {
      const t = building('belltower');
      assert.ok(Math.hypot(s.x - t.x, s.z - t.z) < 1, `${s.id} is the bell tower's gallery`);
    }
  }
});

test('sky spots keep clear of lamp posts, trick signs, name boards, doors and each other', () => {
  for (const s of SKY_SPOTS) {
    if (s.on === 'gallery') continue;      // ten metres above everything below
    for (const l of LAMPS) if (l.x !== undefined) assert.ok(Math.hypot(l.x - s.x, l.z - s.z) > 2.2, `${s.id}: inside the ${l.name}'s base`);
    for (const t of TRICKS) assert.ok(Math.hypot(t.place.x - s.x, t.place.z - s.z) > 4, `${s.id}: on the trick sign ${t.id}`);
    for (const g of SIGNS) {
      const b = g.building ? building(g.building) : null;
      const p = signPlace(g, b, b && FOOTPRINT[b.model], b && DOOR_SPOTS[b.model]);
      assert.ok(Math.hypot(p.x - s.x, p.z - s.z) > 2.5, `${s.id}: on the name board ${g.id}`);
    }
    for (const o of SKY_SPOTS) if (o !== s && o.on !== 'gallery') assert.ok(Math.hypot(o.x - s.x, o.z - s.z) > 6, `${s.id} and ${o.id} overlap`);
  }
});

test('the forest spots follow the lamp and the gate in the layout, with room for a larger shrine and lamp', () => {
  const f = SKY_SPOT['forest-lamp'], L = lamp('forest'), shrine = building('shrine'), gate = building('toriiTop');
  const d = Math.hypot(f.x - L.x, f.z - L.z);
  assert.ok(d > 4.5 && d < 5.5, `forest-lamp is ${d.toFixed(1)} m from the lamp`);
  assert.ok(f.r >= d, 'its radius reaches the lamp itself');
  // on the gate side of the lamp, and outside the shrine (FOOTPRINT.shrine is now the hall of double size: its terrace)
  assert.ok(Math.hypot(f.x - gate.x, f.z - gate.z) < Math.hypot(L.x - gate.x, L.z - gate.z));
  const fp = FOOTPRINT.shrine;
  assert.ok(Math.abs(f.x - shrine.x) > fp[0] / 2 + 1 || Math.abs(f.z - shrine.z) > fp[1] / 2 + 1, 'clear of a shrine of double size');
  const st = SKY_SPOT['shrine-steps'];
  assert.ok(Math.hypot(st.x - gate.x, st.z - gate.z) < 3 && Math.abs(st.z - shrine.z) > fp[1]);
});

test('what the sky shows: night, the first stars at dusk (earlier by a lit lamp), day, rain', () => {
  for (const h of [19.6, 21, 23.9, 0, 3, 5]) assert.equal(skyLook(h), 'night', `hour ${h}`);
  for (const h of [7, 9, 10.5, 12, 17.2]) assert.equal(skyLook(h), 'day', `hour ${h}`);
  assert.equal(skyLook(18.6), 'dusk');                         // the hour the story stops at after a lamp is lit
  assert.equal(skyLook(17.6), 'day');
  assert.equal(skyLook(17.6, { lampLit: true }), 'dusk');
  assert.equal(skyLook(5.5), 'dusk');
  assert.equal(skyLook(22, { raining: true }), 'rain');
  assert.equal(skyLook(21 + 24), 'night');
  assert.equal(skyLook(-2), 'night');
});

test('wishes: counted in the save, repaired on load, and a thought now and then', () => {
  assert.equal(freshState().wishes, 0);
  assert.equal(cleanWishes(3.9), 3);
  assert.equal(cleanWishes(-4), 0);
  assert.equal(cleanWishes(NaN), 0);
  assert.equal(cleanWishes('7'), 0);
  assert.equal(migrate({ ...freshState('grandma'), wishes: 12 }).wishes, 12);
  assert.equal(migrate({ ...freshState('grandma'), wishes: -3.5 }).wishes, 0);
  assert.equal(migrate({ ...freshState('grandma'), wishes: 'many' }).wishes, 0);
  const old = { ...freshState('classic') };
  delete old.wishes;
  assert.equal(migrate(old).wishes, 0);
  // a save round trip keeps the count
  const q = new Quest();
  q.start();
  q.state.wishes = 5;
  assert.equal(new Quest(JSON.parse(JSON.stringify(q.save()))).state.wishes, 5);
  // the first wish and every third one bring a line; all the lines get their turn
  assert.equal(wishLineIndex(1, 8), 0);
  assert.equal(wishLineIndex(2, 8), -1);
  assert.equal(wishLineIndex(3, 8), 1);
  assert.equal(wishLineIndex(4, 8), -1);
  const seen = new Set();
  for (let n = 1; n <= 30; n++) { const i = wishLineIndex(n, 8); if (i >= 0) { assert.ok(i < 8); seen.add(i); } }
  assert.equal(seen.size, 8);
});

test('skygaze.js: every line is a translatable source string, and it leaves the tricks alone', () => {
  const src = fs.readFileSync(new URL('../src/game/skygaze.js', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/tricks/.test(src), 'no import from the tricks');
  const lines = [...src.matchAll(/N_\((['"])((?:\\.|(?!\1).)*)\1\)/g)].map(m => m[2]);
  assert.ok(lines.length >= 18, `${lines.length} lines`);
  for (const l of lines) assert.ok(l.length <= 110, `too long for the bubble: ${l}`);
  assert.equal(new Set(lines).size, lines.length - 3, 'only the three shared day/dusk lines repeat');
});
