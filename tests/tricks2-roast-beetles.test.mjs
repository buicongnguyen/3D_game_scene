import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoast, cookState, cue, Roast, roastScore, replay, layout, POINTS, OKAY, COUNT, STRAW } from '../src/game/tricks/roast.js';
import { TREES, isGood, pickTrees, Rub, ZONE, STROKE_GAP, trapOutcome, Lift, V_MAX, replayLift, beetlesScore, SEEN, GENTLE, NAMES } from '../src/game/tricks/beetles.js';
import { scatter } from '../src/world/scatter.js';
import { sharedGrid } from '../src/world/roads.js';
import { rng } from '../src/engine/spline.js';
import { TRICK, starsFor } from '../src/content/tricks.js';

const grid = sharedGrid();
const heightAt = (x, z) => grid.heightAt(x, z);

// ------------------------------------------------------------------ roast
test('roast: the cook plan is seeded, spread out and different for every potato', () => {
  const a = planRoast({ rand: rng(7) }), b = planRoast({ rand: rng(7) }), c = planRoast({ rand: rng(8) });
  assert.deepEqual(a, b, 'same seed, same plan');
  assert.notDeepEqual(a, c);
  assert.equal(a.length, COUNT);
  let shuffled = 0;
  for (let seed = 1; seed < 40; seed++) for (const gentle of [false, true]) {
    const p = planRoast({ gentle, rand: rng(seed) }), t = p.map(q => q.cook).sort((x, y) => x - y);
    assert.ok(t[0] >= (gentle ? 6 : 7) && t[t.length - 1] <= (gentle ? 15 : 20), t.join());
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] > 0.3, `two potatoes finish together: ${t.join()}`);
    if (p.some((q, i) => q.cook !== t[i])) shuffled++;
  }
  assert.ok(shuffled > 60, 'the order round the fire is not the order they finish in');
  const g = planRoast({ gentle: true, rand: rng(3) }), n = planRoast({ rand: rng(3) });
  assert.ok(g[0].win > n[0].win, 'the first try has a longer window');
});

test('roast: too early is raw, too late is burnt, in the window is perfect, a little off is okay', () => {
  const p = { cook: 10, win: 3 };
  assert.equal(cookState(0, p), 'raw');
  assert.equal(cookState(10 - OKAY - 0.01, p), 'raw');
  assert.equal(cookState(10 - OKAY + 0.01, p), 'okay');
  assert.equal(cookState(10, p), 'perfect');
  assert.equal(cookState(12.99, p), 'perfect');
  assert.equal(cookState(13.01, p), 'okay');
  assert.equal(cookState(13 + OKAY + 0.01, p), 'burnt');
  assert.equal(cookState(60, p), 'burnt');
});

test('roast: the ash tells the truth: it glows fully and steams exactly while the potato is perfect, and chars after', () => {
  const p = { cook: 12, win: 3.2 };
  let last = -1;
  for (let h = 0; h <= 12; h += 0.25) { const q = cue(h, p); assert.ok(q.glow >= last - 1e-9, 'the glow only grows until it is ready'); last = q.glow; assert.equal(q.char, 0); }
  assert.ok(cue(3, p).glow < 0.05, 'grey at first');
  assert.ok(cue(12, p).glow > 0.99);
  for (let h = 0; h < 30; h += 0.1) {
    const q = cue(h, p), st = cookState(h, p);
    if (st === 'perfect') assert.ok(q.steam === 1 && q.glow > 0.99 && q.char === 0, `perfect at ${h}`);
    if (st === 'raw') assert.ok(q.steam === 0 && q.glow < 0.95, `raw at ${h}`);
    if (st === 'burnt') assert.ok(q.char === 1 && q.glow === 0 && q.steam === 0, `burnt at ${h}`);
  }
});

test('roast: a recorded round: juggling five potatoes by their own times', () => {
  const game = new Roast({ rand: rng(11) });
  const plan = game.spots.map(s => s.cook);
  // bury one every 1.5 s, then dig each a second into its window
  const inputs = plan.map((c, i) => [i * 1.5, 'bury', i]).concat(plan.map((c, i) => [i * 1.5 + c + 1, 'dig', i])).sort((a, b) => a[0] - b[0]);
  const out = replay(game, inputs);
  assert.deepEqual(out.filter(r => typeof r === 'string'), ['perfect', 'perfect', 'perfect', 'perfect', 'perfect']);
  assert.ok(game.done);
  assert.equal(game.score, 5 * POINTS.perfect);
  assert.deepEqual(game.tally(), { perfect: 5, okay: 0, raw: 0, burnt: 0 });

  // a careless round: everything dug at the same moment
  const lazy = new Roast({ rand: rng(11) });
  const res = replay(lazy, [0, 1, 2, 3, 4].map(i => [0, 'bury', i]).concat([0, 1, 2, 3, 4].map(i => [13, 'dig', i])));
  const got = res.filter(r => typeof r === 'string');
  assert.ok(got.includes('raw') && got.includes('burnt'), `one moment cannot suit them all: ${got.join()}`);
  assert.ok(lazy.score < 5 * POINTS.perfect);
});

test('roast: recorded edge cases: double presses, forgotten potatoes, digging nothing', () => {
  const game = new Roast({ rand: rng(2) });
  assert.equal(game.dig(0), null, 'nothing buried yet');
  assert.equal(game.bury(0), true);
  assert.equal(game.bury(0), false, 'one potato per spot');
  assert.equal(game.left, COUNT - 1);
  game.update(0.5);
  assert.equal(game.dig(0), 'raw');
  assert.equal(game.dig(0), null, 'dug once');
  assert.equal(game.spots[0].early, true);
  game.bury(1);
  game.update(3);
  assert.equal(game.spots[2].heat, 0, 'only buried potatoes cook');
  game.finish();
  assert.equal(game.spots[1].result, 'burnt', 'left in the ash when time ran out');
  assert.equal(game.spots[1].forgot, true);
  assert.equal(game.spots[2].result, null);
  assert.equal(game.score, POINTS.raw);
  assert.ok(!game.done);
});

test('roast: scoring fits the stars', () => {
  const [one, two, three] = TRICK.roast.stars;
  const s = (...r) => roastScore(r);
  assert.equal(s(), 0);
  assert.equal(starsFor(s('raw', 'raw', 'raw', 'raw', 'raw'), TRICK.roast.stars), 0, 'digging everything at once earns nothing');
  assert.ok(s('perfect', 'okay', 'burnt', 'raw', 'raw') >= one);
  assert.ok(s('perfect', 'perfect', 'okay', 'okay', 'burnt') >= two);
  assert.ok(s('perfect', 'perfect', 'perfect', 'okay', 'okay') < three);
  assert.ok(s('perfect', 'perfect', 'perfect', 'perfect', 'okay') >= three);
  // the whole cook fits the round, even buried at a walking pace
  for (let seed = 1; seed < 30; seed++) {
    const slow = planRoast({ rand: rng(seed) }).map((p, i) => i * 2.5 + p.cook + p.win);
    assert.ok(Math.max(...slow) < TRICK.roast.length, `round too short: ${Math.max(...slow)}`);
    const first = planRoast({ gentle: true, rand: rng(seed) }).map((p, i) => i * 2.5 + p.cook + p.win);
    assert.ok(Math.max(...first) < (TRICK.roast.firstLength ?? TRICK.roast.length), `first try too short: ${Math.max(...first)}`);
  }
});

test('roast: the hearth and the straw piles stand on dry, level ground by the sign', () => {
  const p = TRICK.roast.place;
  for (const seed of [1, 2, 3, 4, 5]) {
    const L = layout(heightAt, p, rng(seed));
    assert.ok(Math.abs(Math.hypot(L.x - p.x, L.z - p.z) - 3.4) < 0.01);
    assert.ok(L.y > 0.45, `hearth height ${L.y}`);
    assert.ok(L.piles.length >= STRAW, `${L.piles.length} straw piles`);
    for (const q of L.piles) {
      assert.ok(q.y > 0.45 && Math.abs(q.y - L.y) <= 1.3, 'a pile on dry ground near the level of the hearth');
      const d = Math.hypot(q.x - L.x, q.z - L.z);
      assert.ok(d >= 5.5 && d <= 7.5, `pile ${d} m from the hearth`);
    }
  }
});

// ------------------------------------------------------------------ beetles
test('beetles: only oak and chestnut are right; every tree of the valley has a name and a clue', () => {
  assert.ok(isGood('tree-broadleaf-a') && isGood('tree-chestnut'));
  for (const [m, d] of Object.entries(TREES)) {
    assert.ok(d.name && d.clue, m);
    if (!['tree-broadleaf-a', 'tree-chestnut'].includes(m)) assert.ok(!isGood(m) && d.sap <= 0.3, m);
  }
  assert.ok(!isGood('tree-nothing'));
});

test('beetles: the grove by the sign offers a right tree and wrong ones, at every graphics setting', () => {
  const p = TRICK.beetles.place;
  for (const density of [0.6, 0.85, 1]) {
    const placed = scatter(heightAt, () => true, density);
    const t = pickTrees(placed.trees, p.x, p.z);
    assert.ok(t.length >= 3 && t.length <= 4, `${t.length} trees at density ${density}`);
    assert.ok(isGood(t[0].model), 'the nearest right tree is always offered');
    assert.ok(t.some(q => !isGood(q.model)), 'and at least one wrong tree to learn from');
    assert.ok(new Set(t.map(q => q.model)).size >= 2);
    for (const q of t) { const d = Math.hypot(q.x - p.x, q.z - p.z); assert.ok(d >= 1.6 && d <= 28, `tree ${d} m off`); }
    for (let i = 0; i < t.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z) >= 2.5, 'trees apart');
  }
  assert.deepEqual(pickTrees([], 0, 0), []);
  const only = pickTrees([{ model: 'tree-pine', x: 3, z: 0 }, { model: 'tree-pine', x: 9, z: 0 }, { model: 'rock', x: 4, z: 0 }], 0, 0);
  assert.equal(only.length, 2, 'a grove of one kind still offers its trees');
});

test('beetles: a recorded rub: strokes in the green make thick bait, mashing and bad timing do not', () => {
  // press when the marker is in the middle
  const good = new Rub();
  let t = 0;
  while (!good.done && t < 60) { good.update(1 / 60); t += 1 / 60; if (Math.abs(good.pos - 0.5) < ZONE * 0.5) good.press(); }
  assert.ok(good.done && good.bait > 0.99, `bait ${good.bait}`);
  // mashing every frame: the gap rule lets only some strokes through, wherever the marker is
  const mash = new Rub();
  let counted = 0;
  for (let i = 0; i < 600 && !mash.done; i++) { mash.update(1 / 60); if (mash.press() !== null) counted++; }
  assert.equal(counted, 6);
  assert.ok(mash.bait < 0.8, `mashing ${mash.bait}`);
  // pressing at the ends
  const bad = new Rub();
  t = 0;
  while (!bad.done && t < 60) { bad.update(1 / 60); t += 1 / 60; if (bad.pos < 0.03) bad.press(); }
  assert.ok(bad.bait < 0.1, `edge strokes ${bad.bait}`);
  // strokes not made count as nothing; the swing quickens; the first try is slower
  const half = new Rub();
  for (let i = 0; i < 3; i++) { half.pos = 0.5; half.cool = 0; half.press(); }
  assert.equal(half.bait, 0.5);
  assert.ok(new Rub().speed < half.speed && new Rub({ gentle: true }).speed < new Rub().speed);
  const r = new Rub();
  r.pos = 0.5; assert.equal(r.press(), 1);
  assert.equal(r.press(), null, `a second stroke within ${STROKE_GAP} s does not count`);
});

test('beetles: who comes at dawn follows the tree and the bait (seeded)', () => {
  const count = (sap, bait, seed) => trapOutcome({ sap, bait, rand: rng(seed) }).filter(k => k !== 'moth').length;
  assert.deepEqual(trapOutcome({ sap: 1, bait: 1, rand: rng(4) }), trapOutcome({ sap: 1, bait: 1, rand: rng(4) }));
  let poorBeetles = 0;
  const kinds = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const best = trapOutcome({ sap: 1, bait: 1, rand: rng(seed) });
    assert.equal(best.filter(k => k !== 'moth').length, 3, 'a well-baited oak brings three beetles');
    assert.ok(best.includes('rhino') && best.includes('stag'), 'both kinds');
    best.forEach(k => kinds.add(k));
    assert.equal(count(1, 0.5, seed), 2);
    assert.equal(count(1, 0, seed), 1);
    assert.equal(count(0.03, 1, seed), 0, 'a cedar brings no beetles at all');
    assert.equal(count(TREES['tree-broadleaf-b'].sap, 1, seed), 0, 'nor does a beech');
    poorBeetles += count(TREES['tree-maple'].sap, 1, seed);
    assert.ok(count(TREES['tree-maple'].sap, 1, seed) <= 1);
    const none = trapOutcome({ sap: 0.03, bait: 1, rand: rng(seed) });
    assert.ok(none.length >= 2 && none.every(k => k === 'moth'), 'moths come to anything sweet');
    for (const k of best) assert.ok(NAMES[k] && SEEN[k] > 0);
  }
  assert.deepEqual([...kinds].sort(), ['moth', 'rhino', 'stag']);
  assert.ok(poorBeetles < 60 * 0.6, `a maple attracts little: ${poorBeetles}/60`);
});

test('beetles: a recorded lift: slow, pulsed hands lift it; a long grab makes it fly', () => {
  const grab = replayLift(new Lift(), [[0, 10]]);
  assert.equal(grab.out, 'flew');
  assert.ok(grab.t < 0.7 && grab.h < 0.5, `flew after ${grab.t} s`);
  // hold 0.4 s, rest 0.25 s, again and again
  const pulses = Array.from({ length: 40 }, (_, i) => [i * 0.65, i * 0.65 + 0.4]);
  const slow = replayLift(new Lift(), pulses);
  assert.equal(slow.out, 'lifted');
  assert.ok(slow.t > 2 && slow.t < 12, `lifted in ${slow.t} s`);
  // the first try forgives a longer hold
  const lazy = Array.from({ length: 40 }, (_, i) => [i * 0.95, i * 0.95 + 0.7]);
  assert.equal(replayLift(new Lift({ gentle: true }), lazy).out, 'lifted');
  assert.equal(replayLift(new Lift(), lazy).out, 'flew');
  // doing nothing does nothing
  const idle = replayLift(new Lift(), [], { until: 5 });
  assert.equal(idle.out, null);
  assert.equal(idle.h, 0);
  const l = new Lift();
  for (let i = 0; i < 20; i++) l.update(1 / 60, true);
  assert.ok(l.rush > 0 && l.rush <= 1 && l.v <= V_MAX);
  // once it has flown, nothing more happens
  const f = new Lift();
  while (!f.out) f.update(1 / 60, true);
  assert.equal(f.update(1, true), null);
});

test('beetles: scoring fits the stars: the right tree and gentle hands', () => {
  const [one, two, three] = TRICK.beetles.stars;
  assert.equal(beetlesScore({}), 0);
  assert.equal(beetlesScore({ visitors: ['rhino', 'moth'], gentle: 1 }), SEEN.rhino + SEEN.moth + GENTLE);
  // a cedar: moths only
  assert.ok(beetlesScore({ visitors: ['moth', 'moth'], gentle: 0 }) < one);
  // a maple on a lucky night: one beetle, lifted gently
  const maple = beetlesScore({ visitors: ['stag', 'moth', 'moth'], gentle: 1 });
  assert.ok(maple >= one && maple < two);
  // an oak, bait so-so: two beetles, both gently
  const ok = beetlesScore({ visitors: ['rhino', 'stag', 'moth'], gentle: 2 });
  assert.ok(ok >= two && ok < three, `${ok}`);
  // an oak, thick bait, all three gently
  assert.ok(beetlesScore({ visitors: ['rhino', 'stag', 'rhino', 'moth'], gentle: 3 }) >= three);
  // one of the three grabbed: not three stars
  assert.ok(beetlesScore({ visitors: ['rhino', 'stag', 'rhino', 'moth', 'moth'], gentle: 2 }) < three);
  // the same visitors, but grabbed: they all fly
  assert.ok(beetlesScore({ visitors: ['rhino', 'stag', 'rhino', 'moth'], gentle: 0 }) < two);
});
