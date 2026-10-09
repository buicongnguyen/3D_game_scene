import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTSPOTS, MEMORIES } from '../src/content/hotspots.js';
import { HOMES, INTERIORS } from '../src/world/interiors.js';
import { exploreState } from '../src/game/fastforward.js';
import { migrate } from '../src/game/quest.js';

const KINDS = ['sit', 'look', 'open', 'pet', 'play', 'ring', 'read', 'warm', 'use'];
// every room and its decor variant, as the game builds them (game/indoor.js reads HOTSPOTS[kind] or HOTSPOTS[id])
const ROOMS = [
  ...['cottage', 'bakery', 'mill', 'station'].map(id => ({ id, key: id, variant: 1 })),
  ...INTERIORS.filter(d => d.kind).map(d => ({ id: d.id, key: d.kind, variant: d.variant ?? 1 })),
];

test('every room has things to do, well formed, in its own decor variant', () => {
  const ids = new Set();
  assert.equal(ROOMS.length, 21, 'all 21 rooms');
  for (const r of ROOMS) {
    const list = (HOTSPOTS[r.key] || []).filter(h => (h.variants || [1]).includes(r.variant));
    assert.ok(list.length >= 2 && list.length <= 5, `${r.id} has ${list.length} things to do`);
    for (const h of list) {
      assert.ok(KINDS.includes(h.kind), `${h.id} kind ${h.kind}`);
      assert.ok(h.label && h.label.length <= 28, `${h.id} label "${h.label}"`);
      assert.ok(Array.isArray(h.stand) && h.stand.length === 2 && Array.isArray(h.look) && h.look.length === 3, `${h.id} positions`);
      const lines = h.lines?.[r.variant] || h.lines?.any;
      assert.ok(lines?.length, `${h.id} says something in variant ${r.variant}`);
      for (const l of lines) assert.ok(l.length <= 120 && !/^Mika:/.test(l) && !/Tamo/.test(l), `${h.id}: "${l}"`);
      if (h.kind === 'sit') assert.ok(h.seatH > 0, `${h.id} seat height`);
    }
  }
  for (const list of Object.values(HOTSPOTS)) for (const h of list) { assert.ok(!ids.has(h.id), `duplicate ${h.id}`); ids.add(h.id); }
  assert.ok(HOMES.length >= 7);
});

test('one house memory in every home, at a spot that exists there', () => {
  assert.equal(Object.keys(MEMORIES).length, 21);
  for (const r of ROOMS) {
    const m = MEMORIES[r.id];
    assert.ok(m, `memory in ${r.id}`);
    const h = (HOTSPOTS[r.key] || []).find(x => x.id === m.hotspot);
    assert.ok(h && (h.variants || [1]).includes(r.variant), `${r.id}: memory spot ${m.hotspot} exists in variant ${r.variant}`);
    assert.ok(m.name && m.text && m.mon >= 0 && m.mon <= 3, `${r.id} memory fields`);
  }
});

test('Explore mode starts after the story with every lamp lit and nothing asked, and loads cleanly', () => {
  const st = exploreState();
  assert.equal(st.step, 'e.done');
  assert.deepEqual(Object.values(st.lamps).filter(Boolean).length, 4);
  assert.ok(st.flags.huntAsked && st.flags.explore);
  const m = migrate(JSON.parse(JSON.stringify(st)));
  assert.equal(m.step, 'e.done');
  assert.deepEqual(m.memories, []);
});
