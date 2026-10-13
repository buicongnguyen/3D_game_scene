// "Float and wait" (src/game/tricks/rules-floatsafe.js): the calm meter, the float and its breathing, the order of the
// steps, the rescuer's choices, the scoring of each level and the bot the stars were tuned with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FloatDrill, FLOAT, FLOAT_LEVELS, floatBot, floatBest, stepsFor } from '../src/game/tricks/rules-floatsafe.js';
import { TRICK, starsFor } from '../src/content/tricks.js';
import { levelSpec } from '../src/content/levels.js';
import { POOL } from '../src/game/tricks/swimming.js';

const DT = 0.05;
const ticks = (d, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds / DT); i++) d.update(DT, typeof input === 'function' ? input(d) : input); };
const play = (level, policy = d => floatBot(d, DT), cap = 8000) => {
  const d = new FloatDrill({ level }), log = [];
  for (let i = 0; i < cap && !d.complete; i++) { const input = policy(d, i); log.push(input); d.update(DT, input); }
  return { d, log };
};
const drillTo = (step, level = 'normal') => {
  const d = new FloatDrill({ level });
  for (let i = 0; i < 8000 && d.step !== step && !d.complete; i++) d.update(DT, floatBot(d, DT));
  assert.equal(d.step, step, `the bot reaches ${step}`);
  d.update(DT, {});
  return d;
};
const REAL = ['easy', 'normal', 'hard'];

test('a calm child finishes every level with the best score, in the right order, and a recording replays exactly', () => {
  for (const level of Object.keys(FLOAT_LEVELS)) {
    const { d, log } = play(level), r = d.result();
    assert.equal(d.complete, true, `${level} completes (stuck in ${d.step})`);
    assert.deepEqual(d.events.filter(e => e.type === 'stage').map(e => e.step), stepsFor(level).slice(1), `${level}: the steps come in order`);
    assert.equal(r.score, floatBest(level), level); assert.equal(r.panics, 0); assert.equal(r.wrongs, 0);
    assert.ok(r.calm > 0.95 && r.steady > 0.95, `${level}: calm ${r.calm}, steady ${r.steady}`);
    const replay = new FloatDrill({ level });
    for (const input of log) replay.update(DT, input);
    assert.deepEqual(replay.snapshot(), d.snapshot());
  }
  assert.deepEqual(REAL.map(floatBest), [70, 110, 120]);
});

test('the levels differ in kind: Easy floats, waits and is pulled in; Normal adds waves, a float, sculling and the rescuer; Difficult cold, a current and a reach', () => {
  const E = FLOAT_LEVELS.easy, N = FLOAT_LEVELS.normal, H = FLOAT_LEVELS.hard;
  assert.deepEqual(stepsFor('easy'), ['calm', 'float', 'call', 'reach']); assert.deepEqual(stepsFor('first'), stepsFor('easy'));
  assert.deepEqual(stepsFor('normal'), ['calm', 'float', 'call', 'hold', 'scull', 'reach', 'rescue']); assert.deepEqual(stepsFor('hard'), stepsFor('normal'));
  assert.ok(E.waves === 0 && N.waves > 0 && H.waves > N.waves && E.current === 0 && N.current === 0 && H.current > 0 && H.current <= 0.3, 'a gentle current, on Difficult only');
  assert.ok(E.gasp === 0 && N.gasp === 0 && H.gasp > 0 && E.grace > N.grace && N.grace > H.grace && E.callWindow > N.callWindow && N.callWindow > H.callWindow);
  assert.ok(E.prompts && N.prompts && !H.prompts && E.rescue.length === 0 && N.rescue.length === 2 && H.rescue.length === 3);
  assert.deepEqual(N.rescue.map(q => q.id), ['first', 'throw']); assert.deepEqual(H.rescue.map(q => q.id), ['first', 'throw', 'reach']);
  for (const q of [...N.rescue, ...H.rescue]) { assert.ok(q.options.some(o => o.ok) && q.options.some(o => !o.ok)); assert.ok(!q.options[0].ok, 'the first answer on the list is never the right one'); }
  // what floats and what does not; and nobody is ever told to jump in
  const things = Object.fromEntries(H.rescue[1].options.map(o => [o.id, o.ok]));
  assert.deepEqual(things, { bag: false, ball: true, stone: false, bottle: true });
  for (const q of [N.rescue[0], H.rescue[0]]) assert.deepEqual(q.options.filter(o => o.ok).map(o => o.id), ['shout']);
  assert.deepEqual(H.rescue[2].options.filter(o => o.ok).map(o => o.id), ['flat']);
  // breathing is a slow in and out, never a hold, on every level
  for (const r of Object.values(FLOAT_LEVELS)) assert.ok(r.breath >= 3 && r.breath <= 5 && r.grace < r.breath / 4);
  // she floats inside the pool, the edge is inside her reach of the wall, and unknown level names play Normal
  for (const r of Object.values(FLOAT_LEVELS)) assert.ok(Math.abs(r.spot.x) < POOL.halfWidth - 1 && Math.abs(r.spot.z) < POOL.halfLength - 1 && r.spot.x < FLOAT.edge);
  assert.ok(FLOAT.edge < FLOAT.bounds.x && FLOAT.bounds.x < POOL.halfWidth);
  for (const level of ['nonsense', 'toString', '__proto__', null]) assert.equal(new FloatDrill({ level }).rules, FLOAT_LEVELS.normal);
  assert.equal(new FloatDrill({ level: 'hard', first: true }).level, 'first');
});

test('the surprise: only keeping still ends it; every press starts the wait again and drains the calm meter', () => {
  const d = new FloatDrill(), calm0 = d.calm;
  ticks(d, 2); assert.equal(d.step, 'calm'); assert.ok(d.progress > 0.6);
  d.update(DT, { act: true }); d.update(DT, {});
  assert.equal(d.still < 0.1, true); assert.ok(d.calm < calm0); assert.equal(d.panics, 1); assert.equal(d.feedback, 'no_thrash');
  ticks(d, 2.5); assert.equal(d.step, 'calm', 'the wait began again');
  ticks(d, 0.6); assert.equal(d.step, 'float');
  // holding the stick over is thrashing too
  const s = new FloatDrill(); ticks(s, 6, { mx: 1 });
  assert.equal(s.step, 'calm'); assert.ok(s.panics >= 3 && s.calm < 0.2);
  // Difficult: the cold. A shout in the gasp seconds is the wrong order, and the step lasts the gasp plus the stillness
  const h = new FloatDrill({ level: 'hard' });
  assert.equal(h.snapshot().gasp, true); ticks(h, 1); h.update(DT, { act: true }); h.update(DT, {});
  assert.equal(h.feedback, 'float_first'); assert.ok(h.events.some(e => e.type === 'panic' && e.feedback === 'float_first'));
  ticks(h, FLOAT_LEVELS.hard.gasp + FLOAT_LEVELS.hard.still - 1.2); assert.equal(h.step, 'calm'); ticks(h, 0.3); assert.equal(h.step, 'float');
});

test('mashing never moves the drill on, and always scores worse than calm play', () => {
  for (const level of REAL) {
    const calm = play(level).d.result();
    for (const every of [2, 4, 6]) {
      const mash = play(level, (d, i) => ({ act: i % every < every / 2 }), 3000).d, r = mash.result();
      assert.equal(mash.complete, false); assert.equal(mash.step, 'calm', `${level}: mashing every ${every} frames is still in the surprise`);
      assert.ok(r.score < calm.score && r.score === 0 && r.panics > 10 && r.calm < 0.1);
    }
    // mashing later in the drill: the same calm player, but hammering the button through the float
    const late = play(level, d => (d.step === 'float' && d.floatMode === 'breathe' && d.floatSpent < 8 ? { act: Math.floor(d.time / DT + 1e-6) % 4 < 2 } : floatBot(d, DT))).d.result();
    assert.ok(late.complete && late.score <= calm.score - 6 && late.panics >= 2 && late.steady < 0.8, `${level}: ${late.score} against ${calm.score}`);
    // an occasional slip costs a little; a wrong answer costs more than a right one earns at the second try
    const slips = play(level, (d, i) => { const a = floatBot(d, DT); if (i % 97 === 50) a.act = !a.act; return a; }).d.result();
    assert.ok(slips.complete && slips.score <= calm.score && slips.score >= calm.score - 25, `${level}: slips ${slips.score}`);
  }
});

test('the float: one press lies her back, then the bar fills only while the finger follows the slow breath', () => {
  const R = FLOAT_LEVELS.easy, d = drillTo('float', 'easy');
  assert.equal(d.snapshot().back, false); ticks(d, 3); assert.equal(d.floatMode, 'upright', 'she waits upright until asked');
  d.update(DT, { act: true }); d.update(DT, {}); assert.equal(d.floatMode, 'roll'); assert.equal(d.snapshot().back, true);
  ticks(d, FLOAT.roll + DT); assert.equal(d.floatMode, 'breathe');
  // the ring: OUT first (finger up), then IN (finger down); it never asks for more than half a breath of holding
  const seen = []; for (let i = 0; i < R.breath / DT; i++) { const s = d.update(DT, floatBot(d, DT)); seen.push(s.inhale); assert.ok(s.breath >= 0 && s.breath <= 1); }
  assert.equal(seen[2], false); assert.equal(seen.at(-3), true); assert.ok(Math.abs(d.floatT - R.breath) < 0.2, 'every calm second counts');
  // a held button, a free button and the wrong way round fill at most the grace slices
  for (const wrong of [() => ({ act: true }), () => ({ act: false }), q => ({ act: !floatBot(q, DT).act })]) {
    const w = drillTo('float', 'easy'); w.update(DT, { act: true }); w.update(DT, {}); ticks(w, FLOAT.roll + DT);
    const t0 = w.floatT; ticks(w, 16, wrong);
    assert.ok(w.step === 'float' && w.floatT - t0 < 16 * 0.75, 'not following the ring is slow');
  }
  const opposite = drillTo('float', 'easy'); opposite.update(DT, { act: true }); opposite.update(DT, {}); ticks(opposite, FLOAT.roll + DT);
  let hinted = false; ticks(opposite, 12, q => { hinted ||= q.feedback === 'breathe_ring'; return { act: !floatBot(q, DT).act }; });
  assert.ok(opposite.floatT < 12 * 0.35 && hinted && opposite.panics === 0, 'breathing against the ring earns only the grace and a kind hint');
  // steadiness is part of the score: the same float done slowly is worth less
  const slow = play('easy', q => (q.step === 'float' && q.floatMode === 'breathe' && q.floatSpent < 10 ? { act: false } : floatBot(q, DT))).d.result();
  assert.ok(slow.complete && slow.steady < 0.9 && slow.score < floatBest('easy') && slow.panics === 0);
});

test('little waves: small corrections keep her level; leaving the stick or leaning on it does not', () => {
  const start = () => { const d = drillTo('float'); d.update(DT, { act: true }); d.update(DT, {}); ticks(d, FLOAT.roll + DT); return d; };
  const run = policy => { const d = start(); let level = 0, n = 0; for (let i = 0; i < 400 && d.step === 'float'; i++) { const a = floatBot(d, DT); a.mx = policy(d); d.update(DT, a); n++; if (Math.abs(d.tilt) < 0.5) level++; } return { d, level: level / n, n }; };
  const bot = run(d => floatBot(d, DT).mx), none = run(() => 0), lean = run(() => 1);
  assert.ok(bot.level > 0.98, `corrected ${bot.level}`); assert.ok(none.level < bot.level - 0.15, `left alone ${none.level}`); assert.ok(lean.level < 0.2, `leaning ${lean.level}`);
  assert.ok(bot.n < none.n && none.d.floatT > lean.d.floatT && lean.d.step === 'float', 'level floating fills the bar soonest');
  assert.equal(lean.d.panics, 0, 'steering on the waves is never thrashing');
  assert.equal(start().snapshot().waves, true); assert.equal(drillTo('float', 'easy').snapshot().waves, false);
});

test('float and wait: a shout counts only when the grown-up looks over; shouting early wastes breath, a missed look comes again', () => {
  const R = FLOAT_LEVELS.normal, d = drillTo('call');
  ticks(d, 1); d.update(DT, { act: true }); d.update(DT, {});
  assert.equal(d.calls, 0); assert.equal(d.feedback, 'wait_call'); assert.equal(d.panics, 0, 'one early shout is a slip, not a panic');
  for (let i = 0; i < 200 && d.callPhase !== 'prompt'; i++) d.update(DT, {});
  assert.equal(d.snapshot().call.prompt, true); ticks(d, R.callWindow + 0.2);
  assert.equal(d.missed, 1); assert.equal(d.calls, 0); assert.equal(d.callPhase, 'wait');
  for (let i = 0; i < 600 && d.step === 'call'; i++) d.update(DT, floatBot(d, DT));
  assert.equal(d.step, 'hold'); assert.equal(d.calls, R.calls); assert.ok(d.events.some(e => e.kind === 'call'));
  assert.equal(FLOAT_LEVELS.hard.calls, 3);
});

test('the float that is thrown: wait for it to drift into reach; a grab too early is corrected and it comes round again', () => {
  const d = drillTo('hold');
  assert.equal(d.snapshot().object.phase, 'fly'); d.update(DT, { act: true }); d.update(DT, {});
  assert.equal(d.caught, false); assert.equal(d.feedback, 'wait_float');
  ticks(d, 30); assert.equal(d.step, 'hold', 'waiting alone never catches it'); assert.ok(d.throws >= 3 && d.events.some(e => e.type === 'rethrow'));
  for (let i = 0; i < 400 && !d.caught; i++) d.update(DT, floatBot(d, DT));
  assert.equal(d.caught, true); assert.equal(d.snapshot().hugging, true); assert.equal(d.snapshot().object.phase, 'caught');
  ticks(d, FLOAT.hug + 0.2); assert.equal(d.step, 'scull'); assert.equal(d.snapshot().hugging, true, 'she keeps hold of it to the edge');
});

test('sculling to the edge: slow taps and a direction; quick taps slow her; the Difficult lane carries her like a slow river', () => {
  const d = drillTo('scull'), x0 = d.position.x;
  ticks(d, 10, { mx: 1 }); assert.equal(d.position.x, x0, 'the stick alone does not move her');
  ticks(d, 10, q => ({ act: !q.held && Math.floor(q.time / DT) % 8 === 0 })); assert.equal(d.position.x, x0, 'taps with no direction do not either'); assert.equal(d.feedback, 'aim_edge');
  const quick = drillTo('scull'), slow = drillTo('scull');
  ticks(quick, 6, q => ({ mx: 1, act: Math.floor(q.time / DT + 1e-6) % 6 < 3 })); ticks(slow, 6, q => floatBot(q, DT));
  assert.ok(slow.position.x > quick.position.x + 0.5 || slow.step !== 'scull', `slow ${slow.position.x}, quick ${quick.position.x}`);
  assert.ok(quick.events.some(e => e.feedback === 'slow_scull'));
  const river = drillTo('scull', 'hard'), z0 = river.position.z; ticks(river, 5);
  assert.ok(Math.abs((z0 - river.position.z) - FLOAT_LEVELS.hard.current * 5) < 0.05, 'the current carries her along the lane');
  for (let i = 0; i < 2000 && river.step === 'scull'; i++) { river.update(DT, floatBot(river, DT)); assert.ok(Math.abs(river.position.x) <= FLOAT.bounds.x && river.position.z >= FLOAT.bounds.far && river.position.z <= FLOAT.bounds.near); }
  assert.equal(river.step, 'reach'); assert.ok(river.position.x >= FLOAT.edge - 1e-6);
  // carried all the way to the end rope she is simply held there: never a failure
  const idle = drillTo('scull', 'hard'); ticks(idle, 80);
  assert.equal(idle.position.z, FLOAT.bounds.far); assert.equal(idle.step, 'scull'); assert.equal(idle.panics, 0);
});

test('the pole: holding on is what gets her out; the rescuer answers until right, and a first right answer is worth the most', () => {
  const d = drillTo('reach');
  ticks(d, 5); assert.equal(d.snapshot().reach.pulled, false);
  ticks(d, 0.5, { act: true }); d.update(DT, {}); assert.equal(d.reachT, 0, 'letting go starts again');
  ticks(d, 1.1, { act: true }); assert.equal(d.pulled, true); ticks(d, FLOAT.pull + 0.1); assert.equal(d.step, 'rescue');
  // the rescuer
  const R = FLOAT_LEVELS.hard, h = drillTo('rescue', 'hard');
  assert.equal(h.snapshot().rescue.phase, 'intro'); h.update(DT, { pick: 2 }); assert.equal(h.rescuePhase, 'intro', 'no answer before the question');
  ticks(h, FLOAT.intro + 0.1); assert.equal(h.rescuePhase, 'ask'); assert.deepEqual(h.snapshot().rescue.options, ['wade', 'jump', 'shout']);
  h.update(DT, { pick: 1 }); assert.equal(h.rescuePhase, 'ask', 'a moment to read first'); ticks(h, FLOAT.think + 0.1);
  h.update(DT, { pick: 1 }); assert.equal(h.rescuePhase, 'wrong'); assert.equal(h.snapshot().rescue.picked, 'jump'); assert.equal(h.choicePoints, 0);
  ticks(h, FLOAT.wrong + 0.1); assert.equal(h.rescuePhase, 'ask'); ticks(h, FLOAT.think + 0.1);
  h.update(DT, { pick: 9 }); h.update(DT, { pick: -1 }); h.update(DT, { pick: 1.5 }); assert.equal(h.rescuePhase, 'ask', 'nonsense answers are ignored');
  h.update(DT, { pick: 2 }); assert.equal(h.rescuePhase, 'right'); assert.equal(h.choicePoints, FLOAT.points.choice[1], 'right at the second try');
  ticks(h, FLOAT.right + 0.1); assert.equal(h.snapshot().rescue.q, 'throw'); ticks(h, FLOAT.think + 0.1);
  h.update(DT, { pick: 3 }); assert.equal(h.thrown, 'bottle'); assert.equal(h.choicePoints, FLOAT.points.choice[1] + FLOAT.points.choice[0]);
  for (let i = 0; i < 400 && !h.complete; i++) h.update(DT, floatBot(h, DT));
  assert.equal(h.complete, true); assert.equal(h.result().wrongs, 1); assert.equal(h.result().score, floatBest('hard') - (FLOAT.points.choice[0] - FLOAT.points.choice[1]));
  assert.equal(R.rescue.length, 3);
});

test('the stars: a calm run earns three on every level, Easy gives its first star for little, and a half-finished drill none of the higher ones', () => {
  const t = TRICK.floatsafe;
  assert.deepEqual(REAL.map(l => levelSpec(t, l).length), [70, 100, 130]);
  for (const level of REAL) {
    const stars = levelSpec(t, level).stars, best = floatBest(level), { d } = play(level);
    assert.equal(starsFor(d.result().score, stars), 3, level); assert.ok(stars[2] <= best - 6, `${level}: three stars leave room for a slip or two`);
    // the drill alone takes a calm bot well inside the nominal length (a child reads and tries: about twice as long)
    assert.ok(d.time > levelSpec(t, level).length * 0.3 && d.time < levelSpec(t, level).length * 0.7, `${level}: ${d.time.toFixed(0)} s of ${levelSpec(t, level).length}`);
  }
  // Easy: the float alone (two steps of the four, unfinished) is a star
  const half = new FloatDrill({ level: 'easy' }); for (let i = 0; i < 8000 && half.step !== 'call'; i++) half.update(DT, floatBot(half, DT));
  assert.equal(half.result().score, 2 * FLOAT.points.partial); assert.ok(starsFor(4 * FLOAT.points.partial, levelSpec(t, 'easy').stars) >= 1);
  assert.equal(starsFor(play('easy', (q, i) => { const a = floatBot(q, DT); if (i % 40 === 7 && q.step !== 'calm') a.act = !a.act; return a; }).d.result().score, levelSpec(t, 'easy').stars) >= 1, true, 'a fidgety but finished Easy round still gets a star');
  // a sloppy Normal: one panic in the float and both answers wrong first
  const sloppy = play('normal', q => { const a = floatBot(q, DT); if (q.step === 'rescue' && q.rescuePhase === 'ask' && q.tries === 0 && q.rescueT > 1) a.pick = 0; return a; }).d.result();
  assert.equal(sloppy.score, floatBest('normal') - 10); assert.equal(starsFor(sloppy.score, levelSpec(t, 'normal').stars), 2);
});

test('bad dt and nonsense input cannot skip a step or corrupt the drill; idle play gets a kind nudge, never a score', () => {
  const d = new FloatDrill(), first = d.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) d.update(dt, { act: true, mx: Infinity, mv: NaN, pick: 0 });
  assert.deepEqual(d.snapshot(), first);
  d.update(999, {}); assert.equal(d.time, FLOAT.maxDt);
  const s = drillTo('scull'); s.update(DT, { act: true, mx: NaN, mv: Infinity }); assert.ok(Number.isFinite(s.position.x) && Number.isFinite(s.position.z));
  for (const step of ['float', 'scull', 'reach']) {
    const idle = drillTo(step), score = idle.result().score; ticks(idle, 40);
    assert.equal(idle.step, step); assert.equal(idle.result().score, score); assert.ok(idle.events.some(e => e.feedback === 'try_cue'), step);
  }
  const still = new FloatDrill(); ticks(still, 2.5); assert.ok(!still.events.some(e => e.feedback === 'try_cue'), 'keeping still in the surprise is the right thing');
});
