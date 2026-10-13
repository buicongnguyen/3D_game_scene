// Eggs down the gutters (src/game/tricks/rules-eggs.js): the board is always a permutation (until a one-way slide hangs
// on it), the path an egg is drawn along is the path the rule gives, the stages and their waves are what each level
// promises (slides, the hiding board, chicks, feeding time), the round is fair for a player who reads the board, and the
// registry row, the place and the stars of every level fit the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EGGS, EggRound, laneX, rungY, rng, rungFits, makeBoard, shiftBoard, route, outputs, pieces, eggPath, pathAt, rungTo, setWays, pickCover,
  stagePlan, waveAt, eggPoints, kindSpeed, replay } from '../src/game/tricks/rules-eggs.js';
import { TRICK, starsFor } from '../src/content/tricks.js';
import { LEVELS, levelSpec } from '../src/content/levels.js';
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

test('one-way slides: an egg takes one downhill only, an egg at its low end rolls past, and the drawn path slopes with it', () => {
  // gutter 1 down to gutter 2
  const b = { rungs: [{ row: 2, col: 1, way: 1 }] };
  assert.equal(rungTo(b.rungs[0], 1), 2);
  assert.equal(rungTo(b.rungs[0], 2), -1, 'the egg at the low end rolls past');
  assert.equal(rungTo({ row: 0, col: 1, way: -1 }, 2), 1);
  assert.equal(rungTo({ row: 0, col: 1, way: -1 }, 1), -1);
  assert.equal(rungTo({ row: 0, col: 1 }, 1), 2);
  assert.equal(rungTo({ row: 0, col: 1 }, 2), 1);
  assert.deepEqual(outputs(b), [0, 2, 2, 3], 'two eggs may leave by one spout: not a permutation any more');
  const p = eggPath(b, 1), q = eggPath(b, 2), piece = pieces(b).find(x => x.kind === 'rung');
  assert.equal(p.out, 2);
  assert.equal(p.legs.length, 3);
  assert.equal(q.legs.length, 1, 'straight down');
  assert.ok(near(p.pts[3], rungY(2) + EGGS.slope) && near(p.pts[5], rungY(2) - EGGS.slope), 'it rolls downhill across the slide');
  assert.ok(piece.way === 1 && near(piece.y0, p.pts[3]) && near(piece.y1, p.pts[5]), 'and the slide is drawn where the egg rolls');
  assert.ok(EGGS.slope < EGGS.rowH / 3);
  // every board with slides: the path follows the rule, and each slide is taken from its high end only
  let n = 0, shared = 0;
  for (const base of boards(120)) {
    if (!base.rungs.length) continue;
    const rand = rng(1000 + n++), board = setWays({ rungs: base.rungs.map(r => ({ ...r })) }, rand, 1 + (n % 2));
    const slides = board.rungs.filter(r => r.way);
    assert.equal(slides.length, Math.min(board.rungs.length, 1 + (n % 2)));
    const out = outputs(board);
    if (new Set(out).size < EGGS.lanes) shared++;
    for (let lane = 0; lane < EGGS.lanes; lane++) {
      const path = eggPath(board, lane);
      assert.equal(path.out, out[lane]);
      for (const leg of path.legs) {
        if (leg.kind !== 'cross') continue;
        const r = board.rungs.find(x => x.row === leg.row);
        assert.equal(rungTo(r, leg.from), leg.to);
        if (r.way) assert.equal(leg.to - leg.from, r.way, 'downhill');
      }
    }
    // taking the slides away again leaves a plain ladder: a permutation
    setWays(board, rand, 0);
    assert.ok(board.rungs.every(r => !r.way));
    assert.deepEqual(outputs(board).slice().sort(), [0, 1, 2, 3]);
  }
  assert.ok(n > 300 && shared > n / 4);
});

test('the hiding board covers one cell that was in full view first: a seesaw or a bare stretch, never a slide', () => {
  let rung = 0, bare = 0;
  for (const base of boards(120)) {
    const rand = rng(77 + rung + bare), board = setWays({ rungs: base.rungs.map(r => ({ ...r })) }, rand, 1), c = pickCover(board, rand);
    if (!c) { assert.ok(board.rungs.length === EGGS.rows && board.rungs.every(r => r.way) || !board.rungs.some(r => !r.way) && board.rungs.length === EGGS.rows); continue; }
    assert.ok(c.row >= 0 && c.row < EGGS.rows && c.col >= 0 && c.col < EGGS.lanes - 1);
    const under = board.rungs.find(r => r.row === c.row && r.col === c.col);
    if (c.rung) { rung++; assert.ok(under && !under.way, 'a seesaw is behind it'); }
    else { bare++; assert.ok(!board.rungs.some(r => r.row === c.row), 'nothing at all in that row'); }
  }
  assert.ok(rung > 100 && bare > 100, `both kinds come up (${rung}, ${bare})`);
  // in a round it is shut only while eggs roll, and the board is in view for a good second before every wave
  const sim = new EggRound({ level: 'hard', length: 140, rand: rng(9) });
  let waveAtT = 0, covers = 0, checked = false;
  for (let i = 0; i < 9000 && !sim.over; i++) {
    for (const ev of sim.step(1 / 30, { mx: 0, lane: 1 })) {
      if (ev.type === 'wave') { waveAtT = sim.time; checked = false; if (sim.board.cover) covers++; }
      if (ev.type === 'warn' && !checked) { checked = true; if (sim.board.cover) assert.ok(sim.time - waveAtT >= EGGS.look - 0.05, `in view for ${sim.time - waveAtT} s`); }
    }
    if (sim.phase !== 'run' && sim.coverK > 0) assert.ok(sim.rolling === 0, 'it lifts only when nothing rolls');
    if (!sim.board.cover) assert.ok(sim.coverK < 1);
    for (const e of sim.eggs) if (e.on && e.state === 'roll' && sim.board.cover && e.s > 0.4) assert.ok(sim.coverK > 0.9, 'shut by the time an egg is on its way');
  }
  assert.ok(covers >= 1);
});

test('the stage plan: the levels differ in kind, and no wave is easier than the one before it in its stage', () => {
  const N = stagePlan({}).stages, E = stagePlan({ level: 'easy' }).stages, H = stagePlan({ level: 'hard' }).stages, F = stagePlan({ first: true }).stages;
  const all = S => S.flatMap(s => s.waves);
  assert.deepEqual(E.map(s => s.id), ['morning', 'busy']);
  assert.deepEqual(N.map(s => s.id), ['morning', 'busy', 'feeding']);
  assert.deepEqual(H.map(s => s.id), ['morning', 'busy', 'feeding']);
  assert.deepEqual(F.map(s => s.id), ['morning']);
  for (const S of [N, E, H, F]) {
    assert.ok(near(S.reduce((a, s) => a + s.share, 0), 1, 1e-9), 'the stages share out the whole clock');
    for (const s of S) {
      assert.ok(s.waves.length >= 3 && s.loop >= 1 && s.loop <= s.waves.length);
      for (let i = 1; i < s.waves.length; i++) {
        const a = s.waves[i - 1], b = s.waves[i];
        assert.ok(b.rungs >= a.rungs && b.speed >= a.speed, `${s.id}: never fewer rungs or slower than the wave before`);
      }
      for (const w of s.waves) {
        assert.ok(w.rungs <= EGGS.rows && w.oneway <= w.rungs && w.at >= 1 && w.at <= 4 && w.eggs >= 2);
        if (w.all) assert.ok(w.eggs === EGGS.lanes && w.at === EGGS.lanes && !w.chick && !w.quick, 'feeding time: one plain egg a hen');
      }
      // past the end the last waves come round again, quicker up to the cap
      const far = waveAt(s, s.waves.length + 40), again = s.waves.slice(-s.loop);
      assert.ok(again.some(w => w.rungs === far.rungs && w.all === far.all));
      assert.ok(far.speed >= Math.min(...again.map(w => w.speed)) && far.speed <= Math.max(s.cap, ...again.map(w => w.speed)) + 1e-9);
    }
  }
  // the guided first try and Easy: one egg at a time, no golden egg at first, nothing to dodge or to remember
  assert.ok(F[0].waves[0].rungs === 0 && E[0].waves[0].rungs === 0 && F[0].order === 0);
  for (const w of [...all(E), ...all(F)]) assert.ok(w.at === 1 && w.rungs <= 3 && !w.chick && !w.quick && !w.oneway && !w.cover && !w.all);
  assert.ok(all(F).every(w => !w.gold) && all(E).some(w => w.gold > 0));
  // Normal: two at once, chicks, one feeding time; no slides, no hiding board, no quick eggs
  assert.ok(all(N).some(w => w.at === 2) && all(N).some(w => w.chick > 0) && all(N).filter(w => w.all).length === 1 && N[2].waves.some(w => w.all));
  assert.ok(all(N).every(w => !w.oneway && !w.cover && !w.quick && (w.all || w.at <= 2)));
  assert.equal(N[0].waves.every(w => w.at === 1 && !w.chick), true, 'the morning is for learning to trace');
  // Difficult: all of it
  for (const k of ['oneway', 'cover', 'chick', 'quick', 'all']) assert.ok(all(H).some(w => w[k]), `Difficult has ${k}`);
  assert.ok(all(H).some(w => w.at === 3) && all(H).filter(w => w.all).length >= 2);
  assert.ok(Math.min(...all(H).map(w => w.speed)) >= Math.min(...all(N).map(w => w.speed)));
  for (const S of [E, N, H]) assert.ok(S.every(s => s.order > 0), 'every stage has an order');
  assert.equal(eggPoints('egg'), 1);
  assert.equal(eggPoints('quick'), EGGS.quick);
  assert.equal(eggPoints('gold'), 3);
  assert.equal(eggPoints(true), 3);
  assert.ok(kindSpeed('quick') > 1 && kindSpeed('chick') < 1 && kindSpeed('egg') === 1 && kindSpeed('gold') === 1);
});

/** Step a round with a perfect reader until it is over; `see(ev, sim)` gets every event. */
function playThrough(sim, see = () => {}, dt = 1 / 30) {
  const input = { mx: 0, lane: null };
  for (let i = 0; i < 20000 && !sim.over; i++) {
    let next = null;
    const eta = e => (e.state === 'fall' ? -1 : sim.eta(e));
    for (const e of sim.eggs) if (e.on && e.kind !== 'chick' && (!next || eta(e) < eta(next))) next = e;
    let lane = next ? next.out : sim.full ? EGGS.lanes : null;
    // a chick about to come past the hat: step aside (unless an egg is in the air right here: that one first)
    const here = Math.round((sim.mika.x - laneX(0)) / EGGS.dx);
    for (const c of sim.eggs) {
      if (!c.on || c.kind !== 'chick' || (next && next.state === 'fall') || (lane ?? here) !== c.out) continue;
      if (c.state === 'fall' ? c.y > EGGS.hatY - EGGS.scoop : sim.eta(c) < 0.5) lane = c.out < EGGS.lanes - 1 ? c.out + 1 : c.out - 1;
    }
    input.lane = lane;
    for (const ev of sim.step(dt, input)) see(ev, sim);
  }
  return sim;
}

test('a round: the hen warns before she lays, eggs roll only while the board stands still, a catch scores, a miss breaks', () => {
  const sim = new EggRound({ level: 'easy', rand: rng(5), length: 60 }), input = { mx: 0, lane: null };
  let warnAt = null, layAt = null, points = 0;
  for (let i = 0; i < 6000 && !sim.over; i++) {
    let next = null;
    const eta = e => (e.state === 'fall' ? -1 : sim.eta(e));           // (the one already in the air first)
    for (const e of sim.eggs) if (e.on && (!next || eta(e) < eta(next))) next = e;
    input.lane = next ? next.out : null;
    const before = sim.board;
    for (const ev of sim.step(1 / 30, input)) {
      if (ev.type === 'warn' && warnAt === null) warnAt = sim.time;
      if (ev.type === 'lay' && layAt === null) layAt = sim.time;
      if (ev.points) points += ev.points;
      if (ev.type === 'wave') assert.equal(sim.rolling, 0, 'the board only changes while no egg is in the gutters');
    }
    if (sim.board !== before) assert.ok(sim.eggs.every(e => !e.on));
    if (sim.phase === 'shift' || sim.phase === 'beat') assert.equal(sim.busy, 0);
    for (const e of sim.eggs) if (e.on && e.state === 'roll') assert.equal(e.out, route(sim.board, e.lane));
  }
  assert.ok(near(layAt - warnAt, EGGS.warn, 0.05), `the hen puffs for ${EGGS.warn} s (${layAt - warnAt})`);
  assert.ok(sim.over && sim.reason === 'time');
  assert.equal(sim.score, points, 'the score is the sum of what the events said');
  assert.equal(sim.broken, 0);
  assert.ok(!sim.full && sim.hat === sim.caught, 'an Easy hat never fills');
  // nobody under the right spouts: the broken eggs of ONE stage end the round (5 on Easy, 4 on Normal, 3 on Difficult)
  for (const [level, lives] of [['easy', EGGS.gentleLives], ['normal', EGGS.normalLives], ['hard', EGGS.lives]]) {
    const idle = new EggRound({ level, rand: rng(5), length: 200 });
    assert.equal(idle.lives, lives);
    while (!idle.over) idle.step(1 / 30, { mx: 0, lane: 0 });
    assert.equal(idle.reason, 'broken', level);
    assert.equal(idle.stageBroken, lives);
  }
});

test('stages: a name card before each one while the clock waits, an order to fill, the broken eggs swept up in between', () => {
  for (const [level, length] of [['easy', 78], ['normal', 105], ['hard', 140]]) {
    const sim = new EggRound({ level, length, rand: rng(11) });
    const seen = [], ends = [];
    let beats = 0, lastLeft = sim.left, orders = 0;
    playThrough(sim, (ev, s) => {
      if (ev.type === 'stage') { seen.push(ev.id); assert.equal(s.phase, 'beat'); assert.equal(s.stageBroken, 0); assert.equal(s.busy, 0, 'nothing rolls when a stage begins'); assert.equal(ev.lives, s.lives); }
      if (ev.type === 'stageEnd') ends.push(ev);
      if (ev.type === 'order') orders++;
    });
    assert.deepEqual(seen, sim.stages.map(s => s.id), `${level}: every stage is played, in order`);
    assert.equal(ends.length, sim.stages.length);
    assert.ok(ends.at(-1).last && ends.every(e => e.perfect), 'a clean stage is said to be clean');
    assert.equal(orders, sim.stages.length, `${level}: a careful player fills every order`);
    const r = sim.result();
    assert.equal(r.stages, sim.stages.length);
    assert.equal(r.orders, orders);
    assert.equal(r.perfect, sim.stages.length);
    assert.deepEqual(r.perStage.length, sim.stages.length);
    assert.equal(r.perStage.reduce((a, b) => a + b, 0), r.caught);
    // the clock: it waits through every name card, so the round lasts its length plus the cards (and the last eggs)
    assert.ok(r.seconds >= length + sim.stages.length * EGGS.beat - 1 && r.seconds <= length + sim.stages.length * EGGS.beat + 9, `${level}: ${r.seconds} s`);
    // and step by step: no time passes during a card, and a held card does not run out
    const again = new EggRound({ level, length, rand: rng(11) });
    again.hold = true;
    for (let i = 0; i < 300; i++) again.step(1 / 30, null);
    assert.ok(again.phase === 'beat' && again.left === length && again.laid === 0, 'held: the first hen waits, and the clock with her');
    again.hold = false;
    lastLeft = again.left;
    for (let i = 0; i < 3000 && !again.over; i++) {
      const beat = again.phase === 'beat';
      again.step(1 / 30, null);
      if (beat && again.phase === 'beat') { beats++; assert.equal(again.left, lastLeft); }
      lastLeft = again.left;
      if (again.stage > 0) break;
    }
    assert.ok(beats >= EGGS.beat * 30 - 3);
  }
  // a stage that went badly leaves the next one a full set of lives
  const sim = new EggRound({ level: 'normal', length: 105, rand: rng(4) });
  let broke = 0;
  for (let i = 0; i < 20000 && !sim.over && sim.stage < 1; i++) {
    let next = null;
    for (const e of sim.eggs) if (e.on && e.kind !== 'chick' && (!next || sim.eta(e) < sim.eta(next))) next = e;
    // (miss the first two eggs, catch the rest)
    const lane = next ? (broke < 2 ? (next.out + 2) % EGGS.lanes : next.out) : null;
    for (const ev of sim.step(1 / 30, { mx: 0, lane })) if (ev.type === 'break') broke++;
  }
  assert.ok(sim.stage === 1 && broke === 2 && sim.broken === 2 && sim.stageBroken === 0);
});

test('what comes down is worth: an egg 1, a little brown one 2, a golden one 3; five in a row and a filled order pay extra', () => {
  const drop = (sim, kind, lane) => {
    const e = sim.eggs.find(x => !x.on);
    Object.assign(e, { on: true, state: 'fall', kind, gold: kind === 'gold', v: kindSpeed(kind), lane, out: lane, x: laneX(lane), y: EGGS.spout, vy: -0.5 });
    return e;
  };
  const settle = (sim, lane, see) => { for (let i = 0; i < 80; i++) for (const ev of sim.step(1 / 60, { mx: 0, lane })) see?.(ev); };
  const sim = new EggRound({ level: 'normal', length: 105, rand: rng(3) });
  sim.hold = true;                                  // (the hens wait: only what the test drops comes down)
  sim.step(0, null);
  assert.equal(sim.stageSpec.order, 4);
  const got = [];
  for (const kind of ['egg', 'quick', 'gold']) { drop(sim, kind, 2); settle(sim, 2, ev => got.push(ev)); }
  assert.deepEqual(got.filter(e => e.type === 'catch').map(e => e.points), [1, 2, 3]);
  assert.equal(sim.score, 6);
  assert.ok(sim.golden === 1 && sim.streak === 3 && sim.stageCaught === 3);
  // the fourth fills the order (+3), the fifth is five in a row (+2)
  drop(sim, 'egg', 0); settle(sim, 0, ev => got.push(ev));
  assert.ok(got.some(e => e.type === 'order' && e.points === EGGS.orderBonus));
  assert.equal(sim.score, 6 + 1 + EGGS.orderBonus);
  drop(sim, 'egg', 3); settle(sim, 3, ev => got.push(ev));
  assert.ok(got.some(e => e.type === 'cheer' && e.streak === 5 && e.points === EGGS.streakBonus));
  assert.equal(sim.score, 6 + 1 + EGGS.orderBonus + 1 + EGGS.streakBonus);
  assert.equal(got.filter(e => e.type === 'order').length, 1, 'an order is filled once');
  // a broken egg ends the row
  drop(sim, 'egg', 0); settle(sim, 3, ev => got.push(ev));
  assert.ok(sim.broken === 1 && sim.streak === 0 && sim.bestStreak === 5 && !sim.stageClean);
  assert.equal(sim.result().cheers, 1);
});

test('a chick must not land in the hat: on the straw it is a point, in a hat held under it nothing (and the row is over)', () => {
  const drop = (sim, lane) => Object.assign(sim.eggs.find(x => !x.on), { on: true, state: 'fall', kind: 'chick', gold: false, v: 1, lane, out: lane, x: laneX(lane), y: EGGS.spout, vy: -0.3 });
  const run = (sim, input, n = 150) => { const all = []; for (let i = 0; i < n; i++) for (const ev of sim.step(1 / 60, typeof input === 'function' ? input(i) : input)) all.push(ev); return all; };
  const fresh = () => { const s = new EggRound({ level: 'normal', length: 105, rand: rng(3) }); s.hold = true; s.step(0, null); s.streak = 3; return s; };
  // she steps aside: safe
  let sim = fresh();
  drop(sim, 1);
  let ev = run(sim, { mx: 0, lane: 2 });
  assert.ok(ev.some(e => e.type === 'chick' && e.points === 1) && !ev.some(e => e.type === 'peep' || e.type === 'break'));
  assert.ok(sim.score === 1 && sim.chicks === 1 && sim.broken === 0 && sim.streak === 3 && sim.stageClean && sim.caught === 0);
  // she stands under it: peep
  sim = fresh();
  drop(sim, 1);
  ev = run(sim, { mx: 0, lane: 1 });
  assert.ok(ev.some(e => e.type === 'peep') && !ev.some(e => e.type === 'chick' || e.type === 'catch'));
  assert.ok(sim.score === 0 && sim.peeps === 1 && sim.streak === 0 && !sim.stageClean && sim.hat === 0 && sim.broken === 0, 'no egg is lost, no life either');
  // she only runs past below it: it flutters on down
  sim = fresh();
  sim.mika.x = laneX(0); sim.mika.target = 0;
  drop(sim, 1);
  let t = 0;
  ev = run(sim, () => ({ mx: (t += 1 / 60) > 0.5 ? 1 : 0, lane: null }));
  assert.ok(sim.mika.x >= laneX(2), 'she crossed under it');
  assert.ok(ev.some(e => e.type === 'chick') && !ev.some(e => e.type === 'peep'));
  // a chick takes its time: it slides slower and falls slower than an egg
  assert.ok(EGGS.chickGravity < EGGS.gravity && EGGS.chickSpeed < 1);
  // chicks come in Normal and Difficult rounds only, never first in a wave, at most one a wave
  for (const level of ['easy', 'normal', 'hard']) {
    let chicks = 0, perWave = 0, firstInWave = true;
    for (let seed = 1; seed <= 12; seed++) {
      playThrough(new EggRound({ level, length: 100, rand: rng(seed) }), e => {
        if (e.type === 'wave') { perWave = 0; firstInWave = true; }
        if (e.type === 'warn') { if (e.kind === 'chick') { chicks++; perWave++; assert.ok(!firstInWave && perWave === 1); } firstInWave = false; }
      });
    }
    assert.ok(level === 'easy' ? chicks === 0 : chicks >= 6, `${level}: ${chicks} chicks`);
  }
});

test('feeding time: every hen puffs at once, they lay one after another, and no two eggs reach the spouts together', () => {
  for (const level of ['normal', 'hard']) {
    let feeds = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = new EggRound({ level, length: level === 'hard' ? 140 : 105, rand: rng(seed) });
      let warns = null, lays = null, outs = null;
      playThrough(sim, (ev, s) => {
        if (ev.type === 'feed') { feeds++; warns = []; lays = []; outs = []; assert.ok(s.eggs.every(e => !e.on || e.state === 'fall'), 'the gutters are empty'); assert.equal(s.stageSpec.id, 'feeding'); }
        if (!warns) return;
        if (ev.type === 'warn') { assert.ok(ev.feed); warns.push(ev.lane); if (warns.length === 4) assert.ok(s.hens.every(h => h.warn > 0), 'all four puff together'); }
        if (ev.type === 'lay') lays.push(s.time);
        if (ev.type === 'out') outs.push(s.time);
        if (ev.type === 'wave') {
          assert.deepEqual(warns.slice().sort(), [0, 1, 2, 3], 'one egg a hen');
          assert.equal(lays.length, 4);
          for (let i = 1; i < 4; i++) assert.ok(lays[i] - lays[i - 1] >= EGGS.feedGap - 0.05, 'they lay one after another');
          warns = null;
        }
      });
    }
    assert.ok(feeds >= (level === 'hard' ? 20 : 8), `${level}: ${feeds} feeding times in 10 rounds`);
  }
});

test('fair for a player who reads the board: no egg is ever out of reach, two things never leave their spouts together', () => {
  const t = TRICK.eggs;
  for (const o of [{ level: 'easy' }, { level: 'normal' }, { level: 'hard' }, { level: 'easy', first: true, length: t.firstLength }]) {
    const length = o.length || levelSpec(t, o.level).length;
    for (let seed = 1; seed <= 30; seed++) {
      const r = replay({ seed, ...o, length });
      assert.equal(r.broken, 0, `${JSON.stringify(o)} seed ${seed}: a perfect player breaks nothing`);
      assert.equal(r.peeps, 0, `${JSON.stringify(o)} seed ${seed}: and keeps every chick out of the hat`);
      assert.equal(r.caught + r.chicks, r.laid);
      assert.ok(r.seconds <= length + 3 * EGGS.beat + 9, 'the last eggs come down soon after the clock');
    }
    // the spouts: at least EGGS.apart between any two things leaving them (the slow chick and the quick egg included)
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new EggRound({ ...o, length, rand: rng(seed) });
      let last = -9, n = 0;
      playThrough(sim, (ev, s) => { if (ev.type === 'out') { assert.ok(s.time - last >= EGGS.apart - 0.07, `${o.level} seed ${seed}: ${(s.time - last).toFixed(2)} s apart`); last = s.time; n++; } });
      assert.ok(n >= 8);
    }
  }
});

test('levels: Easy about 85 s, Normal about 115 s, Difficult about 150 s; one star on Easy is easy, three on Difficult need a clean, quick-reading run', () => {
  const t = TRICK.eggs;
  assert.ok(t && t.firstLength === 50);
  const S = Object.fromEntries(LEVELS.map(l => [l, levelSpec(t, l)]));
  assert.ok(S.easy.length >= 70 && S.easy.length <= 90 && S.normal.length >= 100 && S.normal.length <= 120 && S.hard.length >= 130 && S.hard.length <= 160);
  assert.deepEqual(t.stars, S.normal.stars);
  assert.equal(t.length, S.normal.length);
  const runs = (level, skill, more = null) => Array.from({ length: 40 }, (_, i) => replay({ seed: i + 1, level, length: S[level].length, skill, ...more }));
  const stars = (level, skill, more) => runs(level, skill, more).map(r => starsFor(r.score, S[level].stars));
  const count = (a, n) => a.filter(s => s >= n).length;
  for (const l of LEVELS) {
    const perfect = runs(l, 1);
    assert.ok(perfect.every(r => starsFor(r.score, S[l].stars) === 3), `${l}: a perfect round is three stars (${Math.min(...perfect.map(r => r.score))})`);
    assert.ok(Math.min(...perfect.map(r => r.score)) < S[l].stars[2] * 1.35, `${l}: and three stars are not far below it`);
    assert.ok(perfect.every(r => r.seconds >= S[l].length && r.seconds <= S[l].length + 20));
  }
  // Easy: a guessing player still gets a star, a fair one two
  assert.ok(count(stars('easy', 0.5), 1) >= 30, 'one star on Easy is easy');
  assert.ok(count(stars('easy', 0.8), 2) >= 32);
  assert.ok(count(stars('easy', 0.5), 3) <= 4);
  const first = Array.from({ length: 40 }, (_, i) => replay({ seed: i + 1, first: true, level: 'easy', length: t.firstLength }).score);
  assert.ok(first.every(s => starsFor(s, S.easy.stars) >= 1), `the guided first try earns a star, which opens Normal (${Math.min(...first)})`);
  // Normal: two stars (they open Difficult) for a fair player, three for a good one
  assert.ok(count(stars('normal', 0.8), 2) >= 28 && count(stars('normal', 0.9), 3) >= 24);
  assert.ok(count(stars('normal', 0.5), 3) <= 2 && count(stars('normal', 0.65), 3) <= 8, 'guessing does not earn three stars');
  // Difficult: three stars need real skill
  assert.ok(count(stars('hard', 0.8), 3) <= 6 && count(stars('hard', 0.65), 2) <= 6, 'three stars on Difficult are rare');
  assert.ok(count(stars('hard', 0.9), 3) >= 12 && count(stars('hard', 0.9), 1) >= 32);
  // more comes down, and more is asked, level by level
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const laid = l => mean(runs(l, 1).map(r => r.laid));
  assert.ok(laid('easy') < laid('normal') && laid('normal') < laid('hard'));
  assert.ok(S.easy.stars[2] < S.normal.stars[2] && S.normal.stars[2] < S.hard.stars[2]);
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
