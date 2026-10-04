import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BARKS } from '../src/content/barks.js';
import { VILLAGERS, RETURNING, ROUTES } from '../src/content/villagers.js';
import { BARK_RANGE, BarkClock, fits, isNight, pickBark, zoneAt } from '../src/game/barks.js';
import { HeightGrid } from '../src/world/heightfield.js';
import { BUILDINGS, PADDIES, WORLD, river, riverHalfWidth } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';

const KINDS = ['man', 'woman', 'kid', 'genzo', 'rin', 'ota', 'hana'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const PLACES = [null, 'hoshi', 'kawabe', 'takamori', 'orchard', 'shrine', 'river', 'pasture', 'mill'];
const WHO = new Set(['any', ...KINDS]);

test('every bark is well formed, short, and unique', () => {
  const seen = new Set();
  for (const b of BARKS) {
    assert.ok(WHO.has(b.who), `unknown speaker ${b.who}`);
    assert.ok(typeof b.text === 'string' && b.text.length > 1 && b.text.length <= 58, `length of "${b.text}"`);
    assert.ok(!seen.has(b.text), `duplicate "${b.text}"`);
    seen.add(b.text);
    const w = b.when || {};
    for (const k of Object.keys(w)) assert.ok(['season', 'night', 'weather', 'place', 'chapter'].includes(k), `unknown condition ${k}`);
    if (w.season) assert.ok(SEASONS.includes(w.season));
    if (w.weather) assert.ok(w.weather === 'snow', `"${b.text}": the valley has snow but no rain, so only snow lines can ever be said`);
    if (w.place) assert.ok(PLACES.includes(w.place));
    if (w.chapter) assert.ok(Array.isArray(w.chapter) && w.chapter.length === 2 && w.chapter[0] <= w.chapter[1] && w.chapter[0] >= 0 && w.chapter[1] <= 5);
  }
  assert.ok(BARKS.length >= 250, `only ${BARKS.length} barks`);
});

test('nobody is ever lost for words: every speaker has a remark in every season, hour, chapter and place', () => {
  for (const kind of KINDS) for (const season of SEASONS) for (const hour of [3, 12, 21]) for (const chapter of [0, 1, 2, 3, 4, 5]) for (const place of PLACES) for (const weather of [null, 'snow']) {
    const text = pickBark(kind, { season, hour, weather, chapter, place }, new Set(), () => 0.5);
    assert.ok(text, `${kind} has nothing to say in ${season}, hour ${hour}, chapter ${chapter}, at ${place}, weather ${weather}`);
  }
});

test('children keep to their own lines; generic lines never go to a child; conditions are honoured', () => {
  const ctx = { season: 'winter', hour: 22, weather: 'snow', chapter: 3, place: 'kawabe' };
  for (const e of BARKS) {
    const w = e.when || {};
    if (e.who === 'kid') assert.ok(fits(e, 'kid', ctx) || w.season || w.night !== undefined || w.place || w.chapter || w.weather);
    assert.ok(!fits(e, 'kid', ctx) || e.who === 'kid', 'only kid lines fit a kid');
    if (e.who === 'any') assert.ok(!fits(e, 'kid', { ...ctx, season: 'spring' }));
  }
  assert.ok(fits({ who: 'any', text: 'x', when: { season: 'winter', night: true } }, 'man', ctx));
  assert.ok(!fits({ who: 'any', text: 'x', when: { season: 'summer' } }, 'man', ctx));
  assert.ok(!fits({ who: 'any', text: 'x', when: { night: false } }, 'man', ctx));
  assert.ok(!fits({ who: 'any', text: 'x', when: { chapter: [4, 5] } }, 'man', ctx));
  assert.ok(!fits({ who: 'rin', text: 'x', when: {} }, 'ota', ctx));
});

test('the night is 20:00 to 05:00, and the zones name where a point is', () => {
  assert.ok(isNight(20) && isNight(23.9) && isNight(0) && isNight(4.9) && !isNight(5) && !isNight(12) && !isNight(19.9));
  assert.equal(zoneAt(-45, 20), 'kawabe');
  assert.equal(zoneAt(-45, 20, true), 'river');
  assert.equal(zoneAt(115, 6), 'takamori');
  assert.equal(zoneAt(-95, 118), 'hoshi');
  assert.equal(zoneAt(72, -48), 'orchard');
  assert.equal(zoneAt(62, -156), 'shrine');
  assert.equal(zoneAt(0, 200), null);
});

test('the picker does not repeat what was just said, prefers lines that fit the moment, and remembers a bounded history', () => {
  const ctx = { season: 'autumn', hour: 15, weather: null, chapter: 2, place: 'orchard' };
  const recent = new Set(), said = [];
  for (let i = 0; i < 40; i++) said.push(pickBark('woman', ctx, recent, Math.random, 12));
  assert.ok(recent.size <= 12, 'history is bounded');
  for (let i = 12; i < said.length; i++) assert.ok(!said.slice(i - 12, i).includes(said[i]), `"${said[i]}" came round again within 12 remarks`);
  // specific lines win over generic ones: with a place, a season, a chapter and the hour on offer, about half the picks name one of them
  const picks = Array.from({ length: 200 }, () => { const t = pickBark('woman', ctx, new Set()); return BARKS.find(b => b.text === t); });
  const specific = picks.filter(b => b.when && Object.keys(b.when).length).length;
  assert.ok(specific > 80, `only ${specific}/200 picks were specific to the moment`);
});

test('the bark clock limits bubbles, spaces them out, and rests each speaker', () => {
  const c = new BarkClock({ max: 2, gap: 2, rest: [20, 30], life: 4 });
  assert.ok(c.canSpeak('a'));
  c.spoke('a', () => 0);
  assert.ok(!c.canSpeak('b'), 'a pause before the next remark');
  c.update(2.1);
  assert.ok(c.canSpeak('b'));
  c.spoke('b', () => 0);
  c.update(2.1);                                   // t = 4.2: a's bubble (4 s) has ended, b's is still up
  assert.ok(c.canSpeak('c') && c.live.size === 1);
  assert.ok(!c.canSpeak('a'), 'a rests for 20 s or more');
  c.update(25);
  assert.ok(c.canSpeak('a'));
  const busy = new BarkClock({ max: 2, gap: 0, life: 4 });
  busy.spoke('a'); busy.spoke('b');
  assert.ok(!busy.canSpeak('c'), 'at most two bubbles at once');
  assert.deepEqual(busy.update(4.1).sort(), ['a', 'b']);
  c.prime('z', 5);
  assert.ok(!c.canSpeak('z'));
  c.update(5.1);
  assert.ok(c.canSpeak('z'));
  assert.ok(BARK_RANGE >= 16 && BARK_RANGE <= 30);
});

// ------------------------------------------------------------------ the people themselves
const grid = new HeightGrid(2);
const rad = d => d * Math.PI / 180;
const inBuilding = (x, z, m = 0.3) => BUILDINGS.some(b => {
  const fp = FOOTPRINT[b.model];
  if (!fp || b.model === 'platform') return false;
  const r = rad(b.rot), dx = x - b.x, dz = z - b.z;
  const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(lx) < fp[0] / 2 + m && Math.abs(lz) < fp[1] / 2 + m;
});
const inPaddy = (x, z, m = 1.2) => PADDIES.some(p => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
function problems(x, z) {
  const out = [], h = grid.heightAt(x, z), rv = river.nearest(x, z, 60);
  if (inPaddy(x, z)) out.push('in a rice paddy');
  if (x < WORLD.minX + 3 || x > WORLD.maxX - 3 || z < WORLD.minZ + 3 || z > WORLD.maxZ - 3) out.push('outside the world');
  if (h < 0.8) out.push(`wet (${h.toFixed(1)} m)`);
  if (grid.slopeAt(x, z) > 22) out.push('steep');
  if (inBuilding(x, z)) out.push('inside a building');
  if (rv && rv.d - riverHalfWidth(rv.z) < 2.5) out.push('on the river');
  return out;
}

test('every villager starts, and every route point lies, on dry gentle ground clear of buildings', () => {
  const all = [...VILLAGERS, ...RETURNING];
  const ids = all.map(v => v[0]);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const [id, model, x, z] of all) {
    assert.ok(['villager-man', 'villager-woman', 'villager-kid'].includes(model), `${id} model`);
    // the original cast stands where the story placed them (v7 waits at the station platform, v16/v17 on the platform deck)
    if (['v7', 'v16', 'v17'].includes(id)) continue;
    const p = problems(x, z);
    assert.deepEqual(p, [], `${id} at (${x}, ${z}): ${p.join(', ')}`);
  }
  for (const [id, route] of Object.entries(ROUTES)) {
    assert.ok(ids.includes(id), `route for unknown ${id}`);
    for (const [x, z] of route) { const p = problems(x, z); assert.deepEqual(p, [], `${id} route point (${x}, ${z}): ${p.join(', ')}`); }
  }
  for (const [id, , , , , need] of RETURNING) assert.ok(need >= 1 && need <= 4, `${id} need`);
});

test('the valley has many more people than before, in every part of it', () => {
  const total = VILLAGERS.length + RETURNING.length;
  assert.ok(total >= 35, `${total} villagers`);
  const near = (cx, cz, r) => [...VILLAGERS, ...RETURNING].filter(v => Math.hypot(v[2] - cx, v[3] - cz) < r).length;
  assert.ok(near(-45, 20, 55) >= 8, 'Kawabe');
  assert.ok(near(115, 6, 50) >= 8, 'Takamori');
  assert.ok(near(72, -48, 40) >= 2, 'the orchard');
  assert.ok(near(150, -38, 30) >= 1, 'the pasture');
});
