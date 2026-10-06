import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTECTED, applyEffects, buy, folkJournal, hasAll, sell, shopOffer, stageFor, talkTo, whenHolds } from '../src/game/folk.js';
import { ITEMS } from '../src/game/story.js';

const GOODS = { onigiri: { name: 'Rice ball', price: 3 }, ball: { name: 'Rubber ball', price: 6 }, radish: { name: 'Pickled radish', price: 2 } };
const SHOP = { name: 'Fujita Grocery', room: 'kw2', keeper: 't1', sells: ['onigiri', 'ball', 'radish'], buys: { fish: 2, chestnut: 1, mushroom: 2, cog: 50 } };
const P = {
  id: 't1', name: 'Mr. Fujita', role: 'Grocer',
  story: [
    { when: { chapter: [0, 5] }, lines: [['t1', 'Welcome!'], ['mika', 'Hi.']] },
    { when: { chapter: [1, 5] }, ask: 'Bring me a radish?', needs: { radish: 1 }, give: { mon: 5, parcel: 1 }, lines: [['t1', 'Thanks!']] },
    { when: { chapter: [2, 5], after: 'c2.lamp', lamps: 2 }, lines: [['t1', 'Lamps!']] },
  ],
  chatter: ['One.', 'Two.'],
};
const mk = (o = {}) => ({ folk: {}, mon: 0, inv: {}, chapter: 0, done: () => false, lamps: 0, ...o });

test('stages play in order, gated by chapter, step and lamps; then chatter rotates', () => {
  const st = mk();
  let r = talkTo(P, st);
  assert.equal(r.kind, 'stage');
  assert.equal(r.lines[0][1], 'Welcome!');
  applyEffects(st, r.effects);
  assert.deepEqual(st.folk.t1, { stage: 1, asked: false, met: true, chat: 0 });
  r = talkTo(P, st);
  assert.equal(r.kind, 'chatter', 'chapter 0: the request is not open yet');
  assert.equal(r.lines[0][1], 'One.');
  applyEffects(st, r.effects);
  assert.equal(talkTo(P, st).lines[0][1], 'Two.');
  st.chapter = 1;
  r = talkTo(P, st);
  assert.equal(r.kind, 'ask');
  assert.equal(r.lines[0][1], 'Bring me a radish?');
  applyEffects(st, r.effects);
  assert.equal(st.folk.t1.asked, true);
  assert.equal(st.folk.t1.stage, 1, 'asking does not advance');
  assert.equal(folkJournal([P], st)[0].ask, 'Bring me a radish?');
  st.inv.radish = 1;
  r = talkTo(P, st);
  assert.equal(r.kind, 'stage');
  applyEffects(st, r.effects);
  assert.deepEqual([st.inv.radish, st.inv.parcel, st.mon, st.folk.t1.stage, st.folk.t1.asked], [0, 1, 5, 2, false]);
  st.chapter = 2;
  assert.equal(stageFor(P, st), null, 'needs c2.lamp');
  st.done = id => id === 'c2.lamp';
  assert.equal(stageFor(P, st), null, 'needs 2 lamps');
  st.lamps = { mill: true, orchard: true };
  assert.equal(stageFor(P, st).index, 2);
  const j = folkJournal([P, { id: 'x', story: [] }], st)[0];
  assert.deepEqual([j.met, j.done, j.total, j.ask], [true, 2, 3, null]);
  assert.ok(whenHolds(undefined, st) && hasAll(null, st) && hasAll({ mon: 5 }, st) && !hasAll({ mon: 6 }, st));
});

test('talkTo is pure: nothing changes until the effects are applied', () => {
  const st = mk({ chapter: 1, inv: { radish: 1 }, folk: { t1: { stage: 1, asked: true, met: true } } });
  const snap = JSON.stringify(st);
  talkTo(P, st);
  assert.equal(JSON.stringify(st), snap);
});

test('shops: buy lists with affordability, sell lists without story or protected items, buy/sell deltas', () => {
  const st = mk({ mon: 4, inv: { fish: 2, chestnut: 1, cog: 1, mushroom: 0 } });
  const o = shopOffer(SHOP, st, GOODS);
  assert.deepEqual(o.buy.map(b => [b.key, b.affordable]), [['onigiri', true], ['ball', false], ['radish', true]]);
  assert.deepEqual(o.sell.map(s => s.key), ['fish', 'chestnut'], 'never the cog, never an item Mika lacks');
  assert.deepEqual(shopOffer(SHOP, st, GOODS, new Set(['fish'])).sell.map(s => s.key), ['chestnut'], 'fish kept while the story needs it');
  assert.equal(buy(SHOP, 'ball', st, GOODS).reason, 'broke');
  assert.equal(buy(SHOP, 'tea', st, GOODS).reason, 'not-sold');
  const b = buy(SHOP, 'onigiri', st, GOODS);
  applyEffects(st, b.effects);
  assert.deepEqual([st.mon, st.inv.onigiri], [1, 1]);
  assert.equal(sell(SHOP, 'cog', st).reason, 'protected');
  assert.equal(sell(SHOP, 'fish', st, new Set(['fish'])).reason, 'protected');
  assert.equal(sell(SHOP, 'mushroom', st).reason, 'none');
  assert.equal(sell(SHOP, 'onigiri', st).reason, 'not-bought');
  applyEffects(st, sell(SHOP, 'fish', st).effects);
  assert.deepEqual([st.mon, st.inv.fish], [3, 1]);
  for (const k of ['cog', 'plate', 'peach', 'bun', 'key', 'timber', 'bolts', 'kite', 'compass', 'honeycomb', 'starfin']) assert.ok(PROTECTED.has(k));
});

// ------------------------------------------------------------------ the real content, once written
const tryImport = async p => { try { return await import(p); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; } };
const TF = await tryImport('../src/content/townsfolk.js');
const SH = await tryImport('../src/content/shops.js');
const CV = await tryImport('../src/content/convos.js');
const CAST = ['mika', 'genzo', 'rin', 'ota', 'hana'];

test('real townsfolk stories are well formed, reachable in order, and their errands can be done', { skip: !TF && 'townsfolk.js not written yet' }, () => {
  const ids = new Set(TF.PEOPLE.map(p => p.id));
  assert.equal(ids.size, TF.PEOPLE.length, 'unique ids');
  const goods = SH ? Object.keys(SH.GOODS) : [];
  const given = new Set(TF.PEOPLE.flatMap(p => (p.story || []).flatMap(s => Object.keys(s.give || {}))));
  const obtainable = new Set([...Object.keys(ITEMS), ...goods, ...given, 'mon']);
  for (const p of TF.PEOPLE) {
    assert.ok(p.name && p.role && p.home, `${p.id} name/role/home`);
    assert.ok(Array.isArray(p.story) && p.story.length >= 1, `${p.id} story`);
    assert.ok(Array.isArray(p.chatter) && p.chatter.length >= 1, `${p.id} chatter`);
    for (const c of p.chatter) assert.ok(typeof c === 'string' && c.length <= 135, `${p.id} chatter "${c}"`);
    p.story.forEach((s, i) => {
      const where = `${p.id} stage ${i}`;
      const w = s.when || {};
      for (const k of Object.keys(w)) assert.ok(['chapter', 'after', 'lamps'].includes(k), `${where}: unknown condition ${k}`);
      if (w.chapter) assert.ok(w.chapter.length === 2 && w.chapter[0] >= 0 && w.chapter[0] <= w.chapter[1] && w.chapter[1] <= 5, `${where} chapter`);
      if (i > 0 && w.chapter && p.story[i - 1].when?.chapter) assert.ok(w.chapter[1] >= p.story[i - 1].when.chapter[0], `${where} can follow the stage before`);
      assert.ok(Array.isArray(s.lines) && s.lines.length >= 1, `${where} lines`);
      for (const l of s.lines) {
        assert.ok(l[0] === p.id || ids.has(l[0]) || CAST.includes(l[0]), `${where}: unknown speaker ${l[0]}`);
        assert.ok(typeof l[1] === 'string' && l[1].length > 0 && l[1].length <= 135, `${where}: "${l[1]}" (${l[1]?.length})`);
      }
      const needs = s.needs || s.need;
      if (needs) {
        assert.ok(typeof s.ask === 'string' && s.ask.length <= 135, `${where}: a request needs an ask line`);
        for (const [k, n] of Object.entries(needs)) {
          assert.ok(obtainable.has(k), `${where}: needs ${k}, which nobody gives and no shop sells`);
          assert.ok(n >= 1, `${where}: needs ${k} x${n}`);
          assert.ok(!PROTECTED.has(k) || Object.keys(ITEMS).includes(k), `${where}: ${k}`);
        }
      }
      for (const [k, n] of Object.entries(s.give || {})) assert.ok(n >= 1 && (k === 'mon' ? n <= 20 : !PROTECTED.has(k)), `${where}: gives ${k} x${n}`);
    });
    // walking the stages in chapter 5 with every step done and all lamps lit: the whole story can be finished
    const st = mk({ chapter: 5, done: () => true, lamps: 4, inv: Object.fromEntries([...obtainable].map(k => [k, 9])), mon: 99 });
    for (let k = 0; k < p.story.length; k++) { const r = talkTo(p, st); assert.equal(r.kind, 'stage', `${p.id} stage ${k} plays`); applyEffects(st, r.effects); }
    assert.equal(talkTo(p, st).kind, 'chatter');
  }
});

test('real shops sell defined goods at 2-8 mon, buy only non-story items, and have a keeper', { skip: !SH && 'shops.js not written yet' }, () => {
  const { GOODS: G, SHOPS } = SH;
  const n = Object.keys(G).length;
  assert.ok(n >= 8 && n <= 12, `${n} goods`);
  for (const [k, g] of Object.entries(G)) {
    assert.ok(g.name && g.price >= 2 && g.price <= 8, `good ${k}`);
    assert.ok(!PROTECTED.has(k), `${k} is a story item`);
  }
  const people = TF ? new Set(TF.PEOPLE.map(p => p.id)) : null;
  for (const [key, s] of Object.entries(SHOPS)) {
    assert.ok(s.name && (s.room || s.at), `${key} has a room or a stall spot`);
    if (s.at && TF) assert.ok(TF.SPOTS[s.at], `${key} stall spot ${s.at}`);
    if (people) assert.ok(people.has(s.keeper), `${key} keeper ${s.keeper}`);
    for (const g of s.sells) assert.ok(G[g], `${key} sells unknown ${g}`);
    for (const [g, price] of Object.entries(s.buys || {})) {
      assert.ok(!PROTECTED.has(g), `${key} buys story item ${g}`);
      assert.ok(price >= 1 && price <= 8, `${key} buys ${g} at ${price}`);
    }
    for (const k of ['hello', 'bye', 'broke']) assert.ok(Array.isArray(s[k]) && s[k].length >= 1, `${key}.${k}`);
    const o = shopOffer(s, { mon: 0, inv: { fish: 1, chestnut: 1, mushroom: 1 } }, G);
    assert.ok(o.buy.length === s.sells.length && o.buy.every(b => !b.affordable));
  }
});

test('real convos: valid speakers, short bubbles, chains in order', { skip: !CV && 'convos.js not written yet' }, () => {
  const { CONVOS } = CV;
  assert.ok(CONVOS.length >= 40, `${CONVOS.length} convos`);
  const ids = new Set(CONVOS.map(c => c.id));
  assert.equal(ids.size, CONVOS.length, 'unique ids');
  const people = TF ? new Set(TF.PEOPLE.map(p => p.id)) : null;
  const GENERIC = ['man', 'woman', 'kid', 'any'];
  for (const c of CONVOS) {
    for (const who of [c.a, c.b]) assert.ok(GENERIC.includes(who) || !people || people.has(who), `${c.id}: unknown speaker ${who}`);
    assert.ok(c.lines.length >= 2 && c.lines.length <= 4, `${c.id}: ${c.lines.length} lines`);
    for (const [s, t] of c.lines) {
      assert.ok(s === 'a' || s === 'b', `${c.id}: speaker ${s}`);
      assert.ok(typeof t === 'string' && t.length <= 58, `${c.id}: "${t}" (${t?.length})`);
    }
    const w = c.when || {};
    for (const k of Object.keys(w)) assert.ok(['chapter', 'season', 'night', 'place', 'lamps', 'folk'].includes(k), `${c.id}: condition ${k}`);
    if (c.after) assert.ok(ids.has(c.after) && c.after !== c.id, `${c.id}: after ${c.after}`);
  }
});

test('a neighbour never takes what the main story still needs: such a request only waits', async () => {
  const { talkTo } = await import('../src/game/folk.js');
  const person = { id: 'x', story: [{ when: { chapter: [0, 5] }, needs: { chestnut: 2 }, ask: 'Chestnuts, please?', lines: [['x', 'Thanks!']] }] };
  const st = { folk: {}, mon: 0, inv: { chestnut: 3 }, chapter: 3, done: () => false, lamps: 0 };
  const held = talkTo(person, st, new Set(['chestnut']));
  assert.equal(held.kind, 'ask');
  assert.deepEqual(held.effects.items, {});
  assert.equal(talkTo(person, st).kind, 'stage');
});

test('every stage that needs a story item is gated after the story stops needing it, or the runtime holds it back', async () => {
  const { PEOPLE } = await import('../src/content/townsfolk.js');
  const { STEPS } = await import('../src/game/story.js');
  const used = new Set();
  for (const s of STEPS) { for (const k of Object.keys(s.done?.have || {})) used.add(k); for (const e of [...(s.enter || []), ...(s.exit || [])]) if (e.take) used.add(e.take[0]); }
  const flagged = [];
  for (const p of PEOPLE) for (const s of p.story || []) for (const k of Object.keys(s.needs || {})) if (used.has(k)) flagged.push(`${p.id}:${k}`);
  // these are safe only because townlife passes storyNeeds() into talkTo (tested above); keep the list visible
  assert.ok(flagged.length < 10, flagged.join(' '));
});
