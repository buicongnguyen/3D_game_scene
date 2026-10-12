import test from 'node:test';
import assert from 'node:assert/strict';
import sack, { SackSim, sackBot, COURSE, SOLO_TIMES, bestSeconds } from '../src/game/yard/sack.js';

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
    assert.equal(card.verdict, 'Did not finish'); assert.match(card.score, /^You hopped \d+ m of 13 m$/); assert.equal(card.good, false);
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
  for (const [n, place, stars] of [[2, 1, 3], [2, 2, 1], [3, 2, 2], [3, 3, 1], [4, 3, 1], [4, 4, 1]]) {
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

test('a slow child who keeps hopping is never cut off behind the kids: the same pace finishes alone and in company', () => {
  // Review regression: with "must finish", the 3.5 s trailing cutoff turned a 0.75 s beat into "Did not finish" (no star)
  // against kids, although the same beat finishes alone in about 28 s for one star.
  for (const level of ['first', 'easy', 'normal']) for (const kids of [[], ['steady'], ['strong', 'tricky', 'wobbly']]) {
    const sim = race(new SackSim({ seed: 11, level, players: [mika, ...kids.map((style, i) => ({ id: `kid${i}`, style }))] }));
    const out = finish(sim, s => sackBot(s, 0.75));
    assert.equal(out.finished, true, `${level} against ${kids.length} kids`);
    assert.ok(out.time > 20 && out.time <= SOLO_TIMES.limit, `slow finish: ${out.time}`);
    assert.equal(sim.human.d, COURSE);
    if (kids.length < 2) assert.ok(out.stars >= 1, 'finishing alone or behind the only kid always earns a star');
  }
  // getting up from a tumble is still trying; standing still is not
  const fell = race(new SackSim({ players: [mika, { id: 'kid', style: 'never' }] })), kid = fell.players[1];
  Object.assign(kid, { d: COURSE, finish: fell.run, place: 1 }); fell.placed = 1;
  fell.tumble(fell.human);
  for (let i = 0; i < 60; i++) fell.step(DT, {});
  const t0 = fell.run;
  stepUntil(fell, s => s.state !== 'race', () => ({}));
  assert.ok(Math.abs(fell.run - t0 - 3.5 - 0.2) < 0.1, `the cutoff counts from the moment she is up: ${fell.run - t0}`);
});

test('the unfinished card does not print the same line twice and says how far she got', () => {
  const sim = race(new SackSim({ players: [mika] }));
  for (let i = 0; i < 10; i++) { sim.step(DT, { kick: true }); for (let k = 0; k < 40; k++) sim.step(DT, {}); }
  const out = finish(sim, () => ({}));
  assert.equal(out.finished, false); assert.ok(out.dist > 3 && out.dist < COURSE);
  const card = sack.card(out, { best: 0, plays: 1 }, {}, false);
  assert.notEqual(card.verdict, card.score);
  assert.equal(card.score, `You hopped ${Math.floor(out.dist)} m of ${COURSE} m`);
});

test('after Mika finishes, the card comes within a few seconds even if a kid dawdles', () => {
  const sim = race(new SackSim({ seed: 5, level: 'first', players: [mika, { id: 'slow', style: 'dreamy' }, { id: 'kid', style: 'never' }] }));
  sim.players[1].nextHop = 100;                                   // a kid who never sets off
  const out = finish(sim);
  assert.equal(out.finished, true); assert.equal(out.place, 1); assert.equal(out.stars, 3);
  assert.ok(sim.run - out.time > 4.9 && sim.run - out.time < 5.2, `waited ${sim.run - out.time} s after her finish`);
  assert.equal(sim.players[1].finish, null);
});

test('finishing last of four still earns a star, and the card shows the best run as a time', () => {
  const sim = new SackSim({ players: [mika, { id: 'a' }, { id: 'b' }, { id: 'c' }] });
  Object.assign(sim.human, { d: COURSE, finish: 31, place: 4 });
  const out = sim.result(); assert.equal(out.finished, true); assert.equal(out.stars, 1); assert.equal(out.won, false);
  Object.assign(sim.human, { d: 9, finish: null, place: 4 });
  assert.equal(sim.result().stars, 0, 'not finishing earns none');
  assert.equal(bestSeconds(103), 11.7);
  assert.equal(sack.card(out, { best: 103, plays: 3 }, {}, false).best, 'Best: 11.7 s');
  assert.equal(sack.card(out, { best: 0, plays: 1 }, {}, false).best, '', 'no bare number before a real time exists');
});
