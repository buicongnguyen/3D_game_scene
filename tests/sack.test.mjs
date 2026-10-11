import test from 'node:test';
import assert from 'node:assert/strict';
import sack, { SackSim, sackBot, COURSE, SOLO_TIMES } from '../src/game/yard/sack.js';

const DT = 1 / 60, mika = { id: 'mika', human: true };
const stepUntil = (sim, predicate, input = () => ({}), max = 3000) => {
  for (let i = 0; i < max && !predicate(sim); i++) sim.step(DT, input(sim));
  assert.ok(predicate(sim), `did not reach expected state: ${sim.state}, run ${sim.run}`);
  return sim;
};
const race = sim => stepUntil(sim, s => s.state === 'race');
const finish = (sim, policy = s => sackBot(s, 0.5)) => stepUntil(sim, s => !!s.over, policy).over;

test('solo race waits for a genuine finish, and a steady player completes the full course for three stars', () => {
  for (const level of ['first', 'easy', 'normal']) {
    const sim = race(new SackSim({ players: [mika], level }));
    for (let i = 0; i < 240; i++) sim.step(DT, {});
    assert.equal(sim.state, 'race'); assert.equal(sim.human.finish, null);
    assert.equal(sim.human.d, 0, 'standing still has not crossed the line');
    const out = finish(sim);
    assert.equal(sim.human.d, COURSE); assert.equal(out.finished, true); assert.equal(out.won, true);
    assert.ok(out.time > 13 && out.time <= 18, `four-second delayed steady finish: ${out.time}`);
    assert.equal(out.stars, 2, 'waiting is included in solo finish time');
  }
  const sim = race(new SackSim({ players: [mika] })), out = finish(sim);
  assert.ok(out.time > 9 && out.time <= SOLO_TIMES.three, `careful bot finish time: ${out.time}`);
  assert.equal(out.stars, 3); assert.equal(out.finished, true);
});

test('solo idle or unfinished race times out at 40 seconds without win, stars, score or completion text', () => {
  for (const gap of [null, 2]) {
    const sim = race(new SackSim({ players: [mika] }));
    const out = finish(sim, s => sackBot(s, gap));
    assert.equal(sim.run, SOLO_TIMES.limit); assert.equal(sim.human.finish, null);
    assert.ok(sim.human.d < COURSE); assert.equal(out.finished, false); assert.equal(out.won, false);
    assert.equal(out.stars, 0); assert.equal(out.score, 0); assert.equal(out.rally, 0); assert.equal(out.time, null);
    const card = sack.card(out, { best: 0, plays: 1 }, {}, false);
    assert.equal(card.verdict, 'Did not finish'); assert.equal(card.score, 'Did not finish'); assert.equal(card.good, false);
  }
});

test('solo time stars include the exact 13, 18 and 40 second boundaries', () => {
  for (const [time, expected] of [[13, 3], [13.001, 2], [18, 2], [18.001, 1], [40, 1]]) {
    const sim = new SackSim({ players: [mika] });
    Object.assign(sim.human, { d: COURSE, finish: time, place: 1 });
    const out = sim.result(); assert.equal(out.stars, expected, `time ${time}`);
    assert.equal(out.finished, true); assert.equal(out.time, time);
  }
});

test('trailing cutoff needs an actual finisher, and an unfinished Mika earns no place reward', () => {
  const sim = race(new SackSim({ players: [mika, { id: 'kid', style: 'never' }] }));
  const kid = sim.players[1]; kid.nextHop = 100;
  for (let i = 0; i < 600; i++) sim.step(DT, {});
  assert.equal(sim.state, 'race', 'ten seconds with zero finishers stays racing');
  Object.assign(kid, { d: COURSE, finish: sim.run, place: 1 }); sim.placed = 1;
  for (let i = 0; i < 180; i++) sim.step(DT, {});
  assert.equal(sim.state, 'race', 'last racer still has the grace period');
  const out = finish(sim, () => ({}));
  assert.equal(out.place, 2); assert.equal(out.finished, false); assert.equal(out.stars, 0); assert.equal(out.won, false);
});

test('completed loss against one kid gives one star; larger races retain place rewards', () => {
  for (const [n, place, stars] of [[2, 1, 3], [2, 2, 1], [3, 2, 2], [3, 3, 1], [4, 3, 1], [4, 4, 0]]) {
    const sim = new SackSim({ players: [mika, ...Array.from({ length: n - 1 }, (_, i) => ({ id: `kid${i}` }))] });
    Object.assign(sim.human, { d: COURSE, finish: 16, place });
    const out = sim.result(); assert.equal(out.stars, stars, `${n} players, place ${place}`);
    assert.equal(out.won, place === 1); assert.equal(out.finished, true);
  }
  const sim = race(new SackSim({ players: [mika, { id: 'kid', style: 'strong' }] }));
  const out = finish(sim, s => sackBot(s, 0.56));
  assert.equal(out.place, 2); assert.equal(out.finished, true); assert.equal(out.stars, 1);
});

test('empty and ambient races remain bounded and never fabricate an empty winner', () => {
  const empty = new SackSim({ players: [] }); const out = finish(empty, () => ({}));
  assert.equal(out.n, 0); assert.equal(out.finished, false); assert.equal(out.won, false); assert.equal(out.stars, 0);
  const ambient = new SackSim({ seed: 3, players: [{ id: 'a', style: 'strong' }, { id: 'b', style: 'steady' }] });
  const result = finish(ambient, () => ({}));
  assert.equal(result.finished, true); assert.ok(ambient.players.some(p => p.finish !== null));
});
