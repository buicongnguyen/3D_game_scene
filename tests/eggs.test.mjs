// Eggs down the gutters (src/game/tricks/rules-eggs.js): the board is always a permutation, the path an egg is drawn
// along is the path the rule gives, the waves grow as planned, the round is fair for a player who reads the board, and
// the registry row, the place and the stars fit the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EGGS, EggRound, laneX, rungY, rng, rungFits, makeBoard, shiftBoard, route, outputs, pieces, eggPath, pathAt, wavePlan, waveAt, eggPoints, replay } from '../src/game/tricks/rules-eggs.js';
import { TRICK, starsFor } from '../src/content/tricks.js';
import { placeProblems } from '../src/world/roads.js';
import { PLAY_GROUNDS, CLEARINGS } from '../src/world/layout.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
/** Every board a round can show: fresh ones of each size, and long chains of changes from them. */
function* boards(count = 400) {
  for (let seed = 1; seed <= count; seed++) {
    const rand = rng(seed);
    let b = makeBoard(rand, seed % (EGGS.rows + 1));
    yield b;
    for (let k = 0; k < 6; k++) { b = shiftBoard(b, rand, (seed + k) % (EGGS.rows + 1), 1 + (k % 2)).board; yield b; }
  }
}

test('the board fits the henhouse: four gutters, rows between the top and the spouts, a hat below the spouts', () => {
  assert.equal(EGGS.lanes, 4);
  assert.ok(near(laneX(0), -laneX(3)) && near(laneX(1) - laneX(0), EGGS.dx));
  for (let r = 0; r < EGGS.rows; r++) assert.ok(rungY(r) < EGGS.top - 0.2 && rungY(r) > EGGS.spout + 0.2, `row ${r} at ${rungY(r)}`);
  assert.ok(EGGS.hatY < EGGS.spout - 0.3 && EGGS.hatY - EGGS.scoop > 0.2);
  assert.ok(EGGS.catchR <= EGGS.dx / 2 && EGGS.easyCatchR >= EGGS.catchR, 'the hat never reaches the next spout in a normal round');
  assert.ok(EGGS.basket - laneX(3) > EGGS.easyCatchR, 'standing at the basket is not standing under the last spout');
});

test('every board is a valid permutation: four eggs in, four different spouts out', () => {
  let n = 0, mixed = 0;
  for (const b of boards()) {
    n++;
    const out = outputs(b);
    assert.deepEqual(out.slice().sort(), [0, 1, 2, 3], JSON.stringify(b.rungs));
    if (out.some((o, i) => o !== i)) mixed++;
    // well formed: sorted by row, one rung a row, inside the board, and no rung repeated right under itself
    for (let i = 0; i < b.rungs.length; i++) {
      const r = b.rungs[i];
      assert.ok(r.row >= 0 && r.row < EGGS.rows && r.col >= 0 && r.col < EGGS.lanes - 1);
      if (i) { assert.ok(b.rungs[i - 1].row < r.row); assert.notEqual(b.rungs[i - 1].col, r.col, 'two rungs of one pair in a row undo each other'); }
    }
    // (two pairs crossed twice over, 0-1 2-3 0-1 2-3, bring every egg home again: allowed, each egg still has to be followed)
    if (b.rungs.length) assert.ok([0, 1, 2, 3].filter(i => eggPath(b, i).legs.length > 1).length >= 2, 'a rung is taken by the eggs of both its gutters');
  }
  assert.ok(n > 2000 && mixed > n / 2);
});

test('the drawn path is the rule\'s path: each leg lies on a drawn gutter piece and ends at the spout the rule names', () => {
  for (const b of boards(150)) {
    const P = pieces(b);
    assert.equal(P.filter(p => p.kind === 'down').length, EGGS.lanes);
    assert.equal(P.filter(p => p.kind === 'rung').length, b.rungs.length);
    for (let lane = 0; lane < EGGS.lanes; lane++) {
      const path = eggPath(b, lane);
      assert.equal(path.out, route(b, lane));
      assert.ok(near(path.pts[0], laneX(lane)) && near(path.pts[1], EGGS.top), 'starts at the top of its own gutter');
      assert.ok(near(path.pts.at(-2), laneX(path.out)) && near(path.pts.at(-1), EGGS.spout), 'ends at the spout');
      let s = 0, crossings = 0;
      path.legs.forEach((leg, i) => {
        const x0 = path.pts[i * 2], y0 = path.pts[i * 2 + 1], x1 = path.pts[i * 2 + 2], y1 = path.pts[i * 2 + 3];
        assert.ok(near(leg.s0, s), 'legs join end to end');
        s = leg.s1;
        if (leg.kind === 'down') {
          assert.ok(near(x0, x1) && y1 < y0, 'a gutter leads straight down');
          const g = P.find(p => p.kind === 'down' && near(p.x, x0));
          assert.ok(g && y0 <= g.y0 + 1e-9 && y1 >= g.y1 - 1e-9, 'inside the drawn gutter');
        } else {
          crossings++;
          assert.ok(near(y0, y1) && near(Math.abs(x1 - x0), EGGS.dx), 'a rung leads across to the neighbour');
          const g = P.find(p => p.kind === 'rung' && near(p.y, y0) && near(Math.min(p.x0, p.x1), Math.min(x0, x1)));
          assert.ok(g, 'on a drawn rung');
          assert.equal(g.row, leg.row);
        }
      });
      assert.ok(near(path.length, s) && near(path.length, EGGS.top - EGGS.spout + crossings * EGGS.dx));
      // it takes EVERY rung it meets: walking the path never passes the end of a rung it did not take
      for (const g of P.filter(p => p.kind === 'rung')) {
        const passes = path.legs.some((leg, i) => leg.kind === 'down' && (near(path.pts[i * 2], g.x0) || near(path.pts[i * 2], g.x1)) && path.pts[i * 2 + 1] > g.y + 1e-9 && path.pts[i * 2 + 3] < g.y - 1e-9);
        assert.ok(!passes, 'an egg never rolls past a rung on its gutter');
      }
      // pathAt walks it: the ends and a point in every leg
      const a = pathAt(path, 0), z = pathAt(path, path.length);
      assert.ok(near(a.x, laneX(lane)) && near(a.y, EGGS.top) && near(z.x, laneX(path.out)) && near(z.y, EGGS.spout));
      path.legs.forEach((leg, i) => assert.equal(pathAt(path, (leg.s0 + leg.s1) / 2).leg, i));
    }
  }
});

test('boards change between waves: rungs move, arrive and leave, and the old places are free again', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed), a = makeBoard(rand, 1 + seed % 4), n = 1 + (seed * 3) % 5;
    const { board: b, changes } = shiftBoard(a, rand, n, 1 + seed % 2);
    assert.equal(b.rungs.length, Math.min(n, EGGS.rows));
    const key = r => `${r.row}:${r.col}`, was = new Set(a.rungs.map(key)), now = new Set(b.rungs.map(key));
    for (const c of changes) {
      if (c.from) assert.ok(was.has(key(c.from)));
      if (c.to) assert.ok(now.has(key(c.to)));
      if (c.from && c.to) assert.notEqual(key(c.from), key(c.to), 'a rung that moves really moves');
    }
    // every difference between the two boards is one of the changes (so the round can show each one)
    const gone = [...was].filter(k => !now.has(k)), come = [...now].filter(k => !was.has(k));
    for (const k of gone) assert.ok(changes.some(c => c.from && key(c.from) === k), `left ${k}`);
    for (const k of come) assert.ok(changes.some(c => c.to && key(c.to) === k), `arrived ${k}`);
    if (a.rungs.length && n >= a.rungs.length) assert.ok(changes.length >= 1, 'something visibly changes');
  }
  assert.ok(!rungFits([{ row: 1, col: 1 }], 1, 0) && !rungFits([{ row: 1, col: 1 }], 2, 1) && rungFits([{ row: 1, col: 1 }], 2, 0));
});

test('the wave plan: few rungs and one egg first, then more rungs, then two eggs, then quicker; gentler for a first try and in Easy', () => {
  const N = wavePlan({}), E = wavePlan({ level: 'easy' }), F = wavePlan({ first: true });
  assert.ok(N.waves[0].rungs <= 1 && E.waves[0].rungs === 0 && F.waves[0].rungs === 0);
  for (const plan of [N, E, F]) {
    assert.equal(plan.waves[0].at, 1);
    for (let i = 1; i < plan.waves.length; i++) {
      const a = plan.waves[i - 1], b = plan.waves[i];
      assert.ok(b.rungs >= a.rungs && b.at >= a.at && b.speed >= a.speed, 'never easier than the wave before');
      assert.ok(b.rungs <= EGGS.rows && b.at <= 2);
    }
    // past the end the last wave repeats, quicker up to the cap
    const last = plan.waves.at(-1), far = waveAt(plan, plan.waves.length + 30);
    assert.equal(far.rungs, last.rungs);
    assert.ok(far.speed >= last.speed && far.speed <= plan.cap + 1e-9);
  }
  assert.ok(F.waves.every(w => w.at === 1), 'the guided first try never has two eggs at once');
  assert.ok(N.waves.some(w => w.at === 2) && N.waves.at(-1).rungs >= 4);
  assert.ok(E.cap < N.cap && F.cap < E.cap);
  assert.equal(eggPoints(false), 1);
  assert.equal(eggPoints(true), 3);
});

test('a round: the hen warns before she lays, eggs roll only while the board stands still, a catch scores, a miss breaks', () => {
  const sim = new EggRound({ rand: rng(5), length: 60 }), input = { mx: 0, lane: null };
  let warnAt = null, layAt = null, caught = 0;
  for (let i = 0; i < 4000 && !sim.over; i++) {
    let next = null;
    const eta = e => (e.state === 'fall' ? -1 : sim.eta(e));           // (the one already in the air first)
    for (const e of sim.eggs) if (e.on && (!next || eta(e) < eta(next))) next = e;
    input.lane = next ? next.out : sim.full ? EGGS.lanes : null;
    const before = sim.board;
    for (const ev of sim.step(1 / 30, input)) {
      if (ev.type === 'warn' && warnAt === null) warnAt = sim.time;
      if (ev.type === 'lay' && layAt === null) layAt = sim.time;
      if (ev.type === 'catch') caught += ev.points;
      if (ev.type === 'wave') assert.equal(sim.rolling, 0, 'the board only changes while no egg is in the gutters');
    }
    if (sim.board !== before) assert.ok(sim.eggs.every(e => !e.on));
    if (sim.phase === 'shift') assert.equal(sim.busy, 0);
    for (const e of sim.eggs) if (e.on && e.state === 'roll') assert.equal(e.out, route(sim.board, e.lane));
  }
  assert.ok(near(layAt - warnAt, EGGS.warn, 0.05), `the hen puffs for ${EGGS.warn} s (${layAt - warnAt})`);
  assert.ok(sim.over && sim.reason === 'time');
  assert.equal(sim.score, caught);
  assert.equal(sim.broken, 0);
  // nobody under the spouts: three broken eggs end it early
  const idle = new EggRound({ rand: rng(5), length: 60 });
  while (!idle.over) idle.step(1 / 30, { mx: 0, lane: 0 });
  assert.equal(idle.reason, idle.broken >= EGGS.lives ? 'broken' : 'time');
  assert.ok(idle.broken >= 1 && idle.broken <= EGGS.lives);
});

test('Mika: quick, settles under a spout when the stick is let go, and reaches the basket only with a full hat', () => {
  const sim = new EggRound({ rand: rng(2), length: 60 });
  for (let i = 0; i < 12; i++) sim.step(1 / 60, { mx: 1, lane: null });
  assert.ok(sim.mika.x > laneX(1) + 0.5, 'she ran right');
  for (let i = 0; i < 60; i++) sim.step(1 / 60, { mx: 0, lane: null });
  assert.ok([0, 1, 2, 3].some(i => near(sim.mika.x, laneX(i), 1e-6)), `at rest under a spout (${sim.mika.x})`);
  for (let i = 0; i < 120; i++) sim.step(1 / 60, { mx: 1, lane: null });
  assert.ok(near(sim.mika.x, laneX(3), 1e-6), 'an empty hat does not go to the basket');
  sim.step(1 / 60, { mx: 0, lane: 0 });
  let t = 0;
  while (!near(sim.mika.x, laneX(0), 1e-6) && t < 2) { sim.step(1 / 60, { mx: 0, lane: 0 }); t += 1 / 60; }
  assert.ok(t < 0.6, `across the whole board in ${t.toFixed(2)} s`);
  // a full hat: the hens wait, she tips it out at the basket, and they lay again
  sim.hat = EGGS.full;
  assert.ok(sim.full);
  const laid = sim.laid;
  let tipped = false, banked = 0;
  for (let i = 0; i < 400; i++) for (const ev of sim.step(1 / 60, { mx: 0, lane: EGGS.lanes })) { if (ev.type === 'tip') tipped = true; if (ev.type === 'banked') banked = ev.n; }
  assert.ok(tipped && banked === EGGS.full && sim.hat === 0 && sim.basket === EGGS.full);
  assert.ok(sim.laid > laid, 'the hens lay again after the hat is emptied');
  // the guided first try has no full hat
  const first = new EggRound({ first: true, rand: rng(2) });
  first.hat = 20;
  assert.ok(!first.full);
});

test('fair for a player who reads the board: no egg is ever out of reach, two eggs never leave their spouts together', () => {
  for (const o of [{}, { level: 'easy' }, { level: 'hard' }, { first: true, length: 50 }]) {
    for (let seed = 1; seed <= 30; seed++) {
      const r = replay({ seed, ...o });
      assert.equal(r.broken, 0, `${JSON.stringify(o)} seed ${seed}: a perfect player breaks nothing`);
      assert.equal(r.caught, r.laid);
      assert.ok(r.seconds <= (o.length || 90) + 8, 'the last eggs come down soon after the clock');
    }
  }
});

test('stars: one is easy, three need a clean, quick-reading run', () => {
  const t = TRICK.eggs;
  assert.ok(t && t.length === 90 && t.firstLength === 50);
  const perfect = [], sloppy = [], fair = [], first = [];
  for (let seed = 1; seed <= 40; seed++) {
    perfect.push(replay({ seed }).score);
    sloppy.push(replay({ seed, skill: 0.5 }).score);
    fair.push(replay({ seed, skill: 0.7 }).score);
    first.push(replay({ seed, first: true, length: t.firstLength }).score);
  }
  assert.ok(perfect.every(s => starsFor(s, t.stars) === 3), `a perfect round is three stars (${Math.min(...perfect)}..${Math.max(...perfect)})`);
  assert.ok(Math.min(...perfect) < t.stars[2] * 1.35, 'and three stars are not far below it');
  assert.ok(sloppy.filter(s => starsFor(s, t.stars) === 3).length <= 4, 'guessing does not earn three stars');
  assert.ok(fair.filter(s => starsFor(s, t.stars) >= 1).length >= 28 && sloppy.filter(s => starsFor(s, t.stars) >= 1).length >= 18, 'one star is within easy reach');
  assert.ok(first.every(s => starsFor(s, t.stars) >= 1), `the guided first try earns a star (${Math.min(...first)})`);
  assert.ok(replay({ seed: 3, level: 'easy' }).score >= t.stars[1]);
});

test('the henhouse stands on dry, flat, open ground, and the camera looks at it over a cleared lawn', async () => {
  const { HOUSE } = await import('../src/game/tricks/eggs.js');
  const t = TRICK.eggs;
  // the footprint, where Mika runs, the basket and the sign
  for (const [dx, dz] of [[0, 0.35], [-1.9, 0.35], [2.1, 0.35], [2.64, 0.72], [0, -HOUSE.depth], [-HOUSE.halfWidth, -HOUSE.depth], [HOUSE.halfWidth, -HOUSE.depth]]) {
    assert.deepEqual(placeProblems(HOUSE.x + dx, HOUSE.z + dz), [], `at ${dx}, ${dz}`);
  }
  assert.ok(Math.abs(t.place.x - (HOUSE.x + HOUSE.halfWidth)) < 1.6 && Math.abs(t.place.z - HOUSE.z) < 1.5, 'the sign stands at the corner of the henhouse');
  assert.deepEqual(placeProblems(t.place.x, t.place.z + 1.9), [], 'and Mika can stand in front of it');
  // nothing is planted on the house or between it and the camera (the far phone camera stands about 16 m south)
  const open = (x, z) => CLEARINGS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r) || PLAY_GROUNDS.some(([cx, cz, hw, hd]) => Math.abs(x - cx) < hw && Math.abs(z - cz) < hd);
  for (let z = HOUSE.z - HOUSE.depth; z <= HOUSE.z + 17; z += 1) for (const dx of [-2.2, 0, 3]) assert.ok(open(HOUSE.x + dx, z), `open at ${HOUSE.x + dx}, ${z}`);
  // the module is a round and a building
  const mod = (await import('../src/game/tricks/eggs.js')).default;
  assert.equal(typeof mod.scenery, 'function');
  assert.ok(fs.existsSync(new URL('../public/icons/trick-eggs.webp', import.meta.url)));
});
