// The Fire drill's rules (src/game/tricks/rules-firedrill.js): shout first, then PASS (pull, aim at the base, squeeze,
// sweep); the stance (2-3 m, wind at her back, back to the way out); the gauge; the re-flare; the spread; the choice of
// extinguisher (never water on oil); the score per level, and the rules' own bot against the registry's stars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Drill, drillPlan, drillMax, baseEffect, distEffect, windEffect, stanceFaults, stanceScore, botRound, AIM, CELL, STAND, POINTS, FUEL, SIZES, PASS } from '../src/game/tricks/rules-firedrill.js';
import { TRICK } from '../src/content/tricks.js';
import { levelSpec, LEVELS } from '../src/content/levels.js';

const GOOD = { dist: 2.5, up: 0.9, exit: 0.9 };
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const run = (d, sec, input, dt = 0.05) => { for (let k = 0; k < Math.round(sec / dt); k++) d.update(dt, typeof input === 'function' ? input(k * dt) : input); };
/** Sweep the base of the planted tray until it is out (or `max` seconds have gone). */
function sweep(d, i, { max = 12, ay = 0.1, stopAtDown = false } = {}) {
  const f = d.fires[i];
  let ax = -(f.n - 1) / 2 * CELL, dir = 1, t = 0;
  while (d.target === i && t < max) {
    if (stopAtDown && f.st === 'down') break;
    ax += dir * AIM.speed * 0.8 * 0.05;
    if (Math.abs(ax) > (f.n - 1) / 2 * CELL) dir = -Math.sign(ax);
    d.update(0.05, { squeeze: true, ax, ay });
    t += 0.05;
  }
  return t;
}
const types = d => d.events.map(e => (e.why ? `${e.type}:${e.why}` : e.type));

test('the plans: one small tray, then three, then three fuels to choose for', () => {
  const e = drillPlan('easy'), n = drillPlan('normal'), h = drillPlan('hard');
  assert.equal(e.fires.length, 1); assert.equal(e.wind, 0); assert.equal(e.prompts, true);
  assert.deepEqual(n.fires.map(f => f.size), ['small', 'medium', 'big']); assert.equal(n.wind, 1); assert.equal(n.seconds, 12);
  assert.deepEqual(h.fires.map(f => f.fuel).sort(), ['oil', 'paper', 'straw']); assert.equal(h.choose, true); assert.equal(h.prompts, false);
  assert.ok(h.seconds < n.seconds && h.spreadAfter > 0);
  assert.deepEqual(drillPlan('hard', true), drillPlan('easy'));                 // the guided first play is Easy's
  assert.deepEqual([e, n, h].map(drillMax), [80, 190, 220]);
  assert.deepEqual(PASS, ['pull', 'aim', 'squeeze', 'sweep']);
});

test('the steps come in order: shout, take, pull, aim, squeeze, sweep', () => {
  const d = new Drill({ level: 'easy', rand: seeded() });
  assert.equal(d.step, 'shout');
  assert.equal(d.shout(), true); assert.equal(d.shout(), false);
  assert.equal(d.step, 'take');
  d.take('powder');
  assert.equal(d.step, 'pull');
  assert.equal(d.ext.powder.pin, false);
  assert.deepEqual(d.plant(0, GOOD), { ok: true, why: '' });
  assert.equal(d.ext.powder.pin, true);
  assert.equal(d.step, 'aim');
  run(d, 0.4, { ax: 0, ay: 0.1 });
  assert.equal(d.step, 'squeeze');
  run(d, 0.4, { squeeze: true, ax: 0, ay: 0.1 });
  assert.equal(d.step, 'sweep');
  sweep(d, 0);
  assert.equal(d.fires[0].st, 'out');
  assert.equal(d.done, true);
  assert.deepEqual(d.fires[0].steps, { pull: true, aim: true, squeeze: true, sweep: true });
  assert.equal(d.mistakes, 0);
  assert.ok(types(d).includes('pin') && types(d).includes('out'));
});

test('taking the extinguisher before the shout is put right, and costs the shout', () => {
  const d = new Drill({ level: 'easy', rand: seeded() });
  d.take('powder');
  assert.equal(d.shouted, true);
  assert.equal(d.shoutScore, 0);
  assert.ok(types(d).includes('wrong:noshout'));
  const ok = new Drill({ level: 'easy', rand: seeded() });
  ok.shout(); ok.take('powder');
  assert.equal(ok.shoutScore, POINTS.shout);
});

test('squeezing with the pin in does nothing and says so once', () => {
  const d = new Drill({ level: 'normal', rand: seeded() });
  d.shout(); d.take('powder');
  run(d, 1, { squeeze: true, ax: 0, ay: 0.1 });
  assert.equal(d.ext.powder.left, 12);
  assert.equal(d.level(0), 1);
  assert.equal(types(d).filter(t => t === 'wrong:nopin').length, 1);
  // with the pin out but not standing at a tray: a kind word, not a mistake
  d.plant(0, GOOD); d.unplant(); d.events.length = 0;
  run(d, 1, { squeeze: true, ax: 0, ay: 0.1 });
  assert.deepEqual(types(d), ['coach:stand']);
  assert.equal(d.ext.powder.left, 12);
});

test('aim: the base puts the fire out, the flame tops do next to nothing', () => {
  assert.equal(baseEffect(0), 1); assert.equal(baseEffect(AIM.base), 1);
  assert.ok(baseEffect(AIM.high) < 0.1 && baseEffect(1) < 0.1);
  const hi = new Drill({ level: 'normal', rand: seeded() });
  hi.shout(); hi.take('powder'); hi.plant(0, GOOD);
  run(hi, 2, { squeeze: true, ax: 0, ay: 0.9 });
  assert.ok(hi.level(0) > 0.85, `sprayed at the flames, the fire is still at ${hi.level(0)}`);
  assert.ok(types(hi).includes('wrong:high'));
  assert.equal(hi.fires[0].steps.aim, false);
  const lo = new Drill({ level: 'normal', rand: seeded() });
  lo.shout(); lo.take('powder'); lo.plant(0, GOOD);
  run(lo, 0.6, { squeeze: true, ax: 0, ay: 0.1 });
  assert.equal(lo.fires[0].cells[1], 0, 'the middle cell is out');
  assert.ok(lo.fires[0].cells[0] > 0.9 && lo.fires[0].cells[2] > 0.9, 'the cells beside it burn on: sweep');
});

test('sweep: a spray held on one spot never finishes the fire, and the put-out cell catches again', () => {
  const d = new Drill({ level: 'normal', rand: seeded() });
  d.shout(); d.take('powder'); d.plant(0, GOOD);
  run(d, 6, { squeeze: true, ax: 0, ay: 0.1 });
  assert.equal(d.fires[0].st, 'burn');
  assert.ok(types(d).includes('wrong:still'));
  run(d, 4, {});
  assert.ok(types(d).includes('relit'), 'the neighbours light the middle again');
  assert.ok(d.fires[0].cells[1] > 0);
});

test('stance: the ring, the wind and the way out', () => {
  assert.equal(distEffect(2), 1); assert.equal(distEffect(3), 1);
  assert.ok(distEffect(1.3) < 0.7 && distEffect(4.3) < 0.4);
  assert.equal(windEffect(1), 1); assert.ok(windEffect(-1) < 0.5); assert.equal(windEffect(-1, 0), 1);
  assert.deepEqual(stanceFaults(GOOD), []);
  assert.deepEqual(stanceFaults({ dist: 1.5, up: -0.5, exit: -1 }), ['close', 'downwind', 'exit']);
  assert.deepEqual(stanceFaults({ dist: 3.6, up: -0.5, exit: 1 }, 0), ['far']);
  assert.equal(stanceScore(GOOD), POINTS.stance);
  assert.equal(stanceScore({ dist: 4.4, up: -1, exit: -1 }), 0);
  assert.equal(stanceScore(null), 0);
  // Normal: a bad place is taken as it is, works badly and is explained
  const d = new Drill({ level: 'normal', rand: seeded() });
  d.shout(); d.take('powder');
  assert.equal(d.plant(0, { dist: 0.9, up: 1, exit: 1 }).why, 'tooclose');
  assert.equal(d.plant(0, { dist: 6, up: 1, exit: 1 }).why, 'toofar');
  assert.equal(d.plant(0, { dist: 3.8, up: -0.8, exit: -0.5 }).ok, true);
  assert.ok(d.fires[0].eff < 0.4);
  assert.deepEqual(d.fires[0].wrong, ['close', 'far', 'downwind', 'exit']);
  // Easy: she is shown where to stand first; nothing is lost
  const e = new Drill({ level: 'easy', rand: seeded() });
  e.shout(); e.take('powder');
  assert.deepEqual(e.plant(0, { dist: 3.9, up: 0, exit: 1 }), { ok: false, why: 'far' });
  assert.deepEqual(e.plant(0, { dist: 2.5, up: 0, exit: -1 }), { ok: false, why: 'exit' });
  assert.equal(e.mistakes, 0);
  assert.equal(e.ext.powder.pin, false);
  assert.equal(e.plant(0, { dist: 3.2, up: 0, exit: 0.5 }).ok, true);          // generous: a little outside the ring is fine
  assert.equal(e.fires[0].eff, 1);
});

test('the gauge empties, and an empty extinguisher is swapped for a full one at the stand', () => {
  const d = new Drill({ level: 'normal', rand: seeded() });
  d.shout(); d.take('powder'); d.plant(0, GOOD);
  run(d, 13, { squeeze: true, ax: 1.3, ay: 0.9 });
  assert.equal(d.ext.powder.left, 0);
  assert.equal(types(d).filter(t => t === 'empty').length, 1);
  assert.ok(Math.abs(d.used - 12) < 0.11);
  d.take('powder');
  assert.equal(d.ext.powder.left, 12); assert.equal(d.ext.powder.pin, false); assert.equal(d.refills, 1);
  assert.equal(d.target, -1, 'she has left the tray to fetch it');
  d.plant(0, GOOD); sweep(d, 0);
  run(d, 3, {}); d.plant(1, GOOD); sweep(d, 1);
  run(d, 3, {}); d.plant(2, GOOD); sweep(d, 2);
  assert.equal(d.done, true);
  assert.equal(d.saved, 0, 'nothing for powder saved after a refill');
});

test('Normal: the trays are lit one after the other, and the big one flares up again if the sweeping stops too soon', () => {
  const d = new Drill({ level: 'normal', rand: seeded() });
  assert.deepEqual(d.fires.map(f => f.st), ['burn', 'wait', 'wait']);
  d.shout(); d.take('powder');
  d.plant(0, GOOD); sweep(d, 0);
  assert.deepEqual(d.fires.map(f => f.st), ['out', 'wait', 'wait']);
  assert.equal(d.target, -1);
  run(d, 3, {});
  assert.equal(d.fires[1].st, 'burn');
  d.plant(1, GOOD); sweep(d, 1); run(d, 3, {});
  assert.equal(d.cur, 2);
  d.plant(2, GOOD);
  sweep(d, 2, { stopAtDown: true });
  assert.equal(d.fires[2].st, 'down');
  run(d, 4, {});
  assert.equal(d.fires[2].st, 'burn');
  assert.equal(d.fires[2].reflares, 1);
  assert.ok(d.fires[2].wrong.includes('early'));
  d.ext.powder.left = 12;
  d.plant(2, GOOD); sweep(d, 2);
  assert.equal(d.done, true);
  assert.equal(d.fireScore(d.fires[2]).steps, POINTS.steps - 2);
});

test('Difficult: the right extinguisher; water never reaches the oil', () => {
  const d = new Drill({ level: 'hard', rand: seeded(3) });
  d.shout();
  const oil = d.fires.find(f => f.fuel === 'oil'), soft = d.fires.find(f => f.fuel !== 'oil');
  assert.equal(FUEL.oil.best, 'powder'); assert.equal(FUEL.paper.best, 'water'); assert.equal(FUEL.straw.best, 'water');
  // put everything else out of the way so the oil burns
  for (const f of d.fires) if (f !== oil) { f.st = 'out'; }
  oil.st = 'burn'; oil.cells.fill(1);
  d.take('water');
  assert.deepEqual(d.plant(oil.i, GOOD), { ok: false, why: 'water-oil' });
  assert.equal(d.target, -1);
  assert.equal(d.ext.water.pin, false, 'not a drop: the pin is not even pulled');
  assert.equal(d.level(oil.i), 1);
  d.take('powder');
  assert.equal(d.plant(oil.i, GOOD).ok, true);
  sweep(d, oil.i);
  assert.equal(oil.st, 'out');
  assert.equal(d.fireScore(oil).choice, 0);
  // powder on paper or straw works, but it smoulders longer and is only half right
  const e = new Drill({ level: 'hard', rand: seeded(3) });
  e.shout(); e.take('powder');
  const f = e.fires[e.cur];
  if (f.fuel !== 'oil') {
    const was = f.embers;
    e.plant(f.i, GOOD);
    assert.ok(f.embers > was);
    assert.ok(f.wrong.includes('powder-soft'));
    sweep(e, f.i);
    assert.equal(e.fireScore(f).choice, 5);
  }
  assert.ok(soft);
});

test('Difficult: a fire left burning catches the next tray', () => {
  const d = new Drill({ level: 'hard', rand: seeded(5) });
  d.shout();
  run(d, d.plan.spreadAfter + 1, {});
  assert.deepEqual(d.fires.map(f => f.st), ['burn', 'burn', 'wait']);
  assert.equal(d.fires[1].spread, true);
  assert.ok(types(d).includes('spread'));
  const n = new Drill({ level: 'normal', rand: seeded(5) });
  n.shout(); run(n, 60, {});
  assert.deepEqual(n.fires.map(f => f.st), ['burn', 'wait', 'wait'], 'no spreading on Normal');
});

test('score: every part counts, and time up keeps what was done', () => {
  const d = new Drill({ level: 'easy', rand: seeded() });
  run(d, 1, {});
  d.shout(); d.take('powder'); run(d, 4, {});
  d.plant(0, GOOD); run(d, 0.8, { ax: 0, ay: 0.1 });
  sweep(d, 0);
  const s = d.fireScore(d.fires[0]);
  assert.deepEqual(s, { out: 20, stance: 10, aim: 10, speed: 10, steps: 5, choice: 0, total: 55 });
  assert.ok(d.saved >= 12, `powder saved ${d.saved}`);
  assert.equal(d.score, 10 + 55 + d.saved);
  assert.ok(d.score <= drillMax(d.plan));
  // time up with the fire half out: the stance and the aim still count
  const t = new Drill({ level: 'easy', rand: seeded() });
  t.shout(); t.take('powder'); t.plant(0, GOOD);
  run(t, 0.7, { squeeze: true, ax: 0, ay: 0.1 });
  t.finish();
  assert.equal(t.fireScore(t.fires[0]).out, 0);
  assert.equal(t.score, 10 + 10 + 10 + 5);
  const before = t.used; t.update(1, { squeeze: true, ax: 0, ay: 0.1 });
  assert.equal(t.used, before, 'nothing happens after the end');
});

test('the bot: a clean round earns three stars on every level, a careless one fewer, and any tray out is a star on Easy', () => {
  const t = TRICK.firedrill;
  assert.ok(t, 'the registry has the fire drill');
  for (const level of LEVELS) {
    const spec = levelSpec(t, level), plan = drillPlan(level);
    assert.ok(spec.stars[2] <= drillMax(plan), `${level}: three stars can be reached`);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const clean = botRound(level, { seed, skill: 1, time: spec.length });
      assert.equal(clean.drill.done, true, `${level} ${seed}: the clean bot puts every fire out`);
      assert.ok(clean.score >= spec.stars[2], `${level} ${seed}: clean ${clean.score} < 3 stars ${spec.stars[2]}`);
      assert.ok(clean.time < spec.length * 0.6, `${level} ${seed}: a clean round fits the clock easily (${clean.time.toFixed(0)} s)`);
      const ok = botRound(level, { seed, skill: 0.5, time: spec.length });
      assert.ok(ok.score >= spec.stars[0] && (level === 'easy' || ok.score < spec.stars[2]), `${level} ${seed}: a middling round ${ok.score} is 1 or 2 stars (Easy is generous)`);
      const poor = botRound(level, { seed, skill: 0.1, time: spec.length });
      assert.ok(poor.score < spec.stars[1], `${level} ${seed}: a careless round ${poor.score} is under 2 stars`);
      if (level === 'easy') assert.ok(poor.score >= spec.stars[0], `easy ${seed}: the fire out any old way (${poor.score}) is a star`);
    }
  }
  assert.equal(SIZES.big.embers > 0, true);
  assert.ok(STAND.near === 2 && STAND.far === 3);
});
