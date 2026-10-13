// The second wave of yard games: volleyball, rope jumping, tug of war, ô ăn quan (real rules, known positions), sack race
// and marbles, plus the yards' registry, notes and the kids' plans at Takamori Green. All pure and seeded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARD_LIST, YARDS, YARD_NAMES, YARD_RULES, YARD_NOTES, KID_STYLE, pathBetween, fenceRuns, insideFence } from '../src/content/yard.js';
import { YARD_GAMES, YARD_GAME, ambientRoles, levelFor } from '../src/game/yard/index.js';
import { COURT, LEVELS, rng, netHeight } from '../src/game/yard/rules.js';
import { VolleySim, volleyBot, NET_H } from '../src/game/yard/volley.js';
import { RopeSim, ropeBot, turnPeriod, JUMP, CLEAR_H, clearWindow, jumpHeight, ROPE_STARS, HANDS } from '../src/game/yard/rope.js';
import { TugSim, tugBot, LINE, BEAT } from '../src/game/yard/tug.js';
import * as O from '../src/game/yard/oanquan.js';
import { SackSim, sackBot, COURSE } from '../src/game/yard/sack.js';
import { MarblesSim, marblesBot, stepBalls, setup as marbleSetup, RING, R_MARBLE, MARBLES_LEVEL } from '../src/game/yard/marbles.js';
import { PEOPLE, SPOTS } from '../src/content/townsfolk.js';
import { buildRoads, route } from '../src/world/roads.js';

const DT = 1 / 60;
const MIKA = { id: 'mika', team: 0, human: true };

/** Run a sim with a policy sim -> input; returns { sim, log, inputs, t }. */
function run(sim, policy, limit = 900, hook = null) {
  const log = [], inputs = [];
  let t = 0;
  while (!sim.over && t < limit) {
    const inp = policy(sim);
    inputs.push({ ...inp });
    sim.step(DT, inp);
    hook?.(sim);
    for (const e of sim.events) log.push(e);
    sim.events.length = 0;
    t += DT;
  }
  return { sim, log, inputs, t };
}
const count = (log, type, f = () => true) => log.filter(e => e.type === type && f(e)).length;
/** A player who decides per flight when to press (seconds before it lands); pLate of the time she is too late. */
function perFlight(seed, pLate) {
  const r = rng(seed), m = new WeakMap();
  return sim => { const f = sim.flight; if (!f) return 0.12; if (!m.has(f)) m.set(f, r() < pLate ? -1 : 0.02 + r() * 0.5); return m.get(f); };
}

// ------------------------------------------------------------------------------------------------ the registry
test('yard registry: every game has a name, a rule line, a real-world note and the one shape the runner reads', () => {
  assert.equal(YARD_GAMES.length, 8);
  for (const G of YARD_GAMES) {
    assert.equal(G.name, YARD_NAMES[G.id]);
    assert.ok(YARD_RULES[G.id] && YARD_NOTES[G.id], G.id);
    for (const f of ['teams', 'target', 'create', 'bot', 'roles', 'ambientTeam', 'card']) assert.equal(typeof G[f], 'function', `${G.id}.${f}`);
    assert.ok(['shuttle', 'ball', 'rope', 'tug', 'board', 'sack', 'marbles'].includes(G.look), `${G.id}: a view`);
    assert.equal(typeof G.moves, 'boolean');
    assert.ok(G.focus.w > 0 && G.focus.l > 0);
    // every game can be made with Mika and with kids only, and steps without throwing; its events drain
    for (const kids of [[], ['v3'], ['v3', 'v20'], ['v3', 'v20', 'v10']]) {
      const T = G.teams(kids);
      const players = [MIKA, ...T.mine.map((id, i) => ({ id, team: 0, style: KID_STYLE[id] })), ...T.theirs.map(id => ({ id, team: 1, style: KID_STYLE[id] })), ...(T.turn || []).filter(id => !T.theirs.includes(id)).map(id => ({ id, team: 0 }))];
      const sim = G.create({ seed: 3, players, level: 'first', target: G.target('first'), wall: !!T.wall });
      for (const k of ['players', 'events', 'score', 'marker', 'shuttle']) assert.ok(sim[k], `${G.id}: sim.${k}`);
      assert.equal(typeof sim.hud, 'function', `${G.id}: hud`);
      for (let i = 0; i < 300; i++) sim.step(DT, {});
      const h = sim.hud({ mine: 'Mika', theirs: 'Kids' });
      assert.ok(typeof h.big === 'string' && 'l' in h && 'r' in h, `${G.id}: hud shape`);
      assert.ok(sim.hint === undefined || typeof sim.hint === 'function');
    }
    // the kids on their own: roles are a subset of who is there, no kid twice, and the game itself runs without anybody human
    for (const ids of [['v3'], ['v3', 'v20'], ['v3', 'v20', 'v10'], ['v3', 'v20', 'v10', 'v6']]) {
      const R = ambientRoles(G.id, ids, 1, 'v20');
      assert.ok(YARD_GAME[R.game], `${G.id} with ${ids.length}: falls back to a game that exists`);
      assert.equal(new Set([...R.play, ...R.watch]).size, R.play.length + R.watch.length);
      for (const id of [...R.play, ...R.watch]) assert.ok(ids.includes(id));
      const G2 = YARD_GAME[R.game];
      const sim = G2.create({ seed: 5, players: R.play.map((id, i) => ({ id, team: G2.ambientTeam(R.play, i), style: KID_STYLE[id] || 'steady' })), level: 'normal', target: 3 });
      const r = run(sim, () => ({}), 400);
      assert.ok(r.sim.over || r.t >= 399, `${G.id}/${R.game}: kids' game ${r.sim.over ? 'ends' : 'keeps going'}`);
    }
  }
  assert.equal(levelFor(undefined, false), 'first');
  assert.equal(levelFor({ plays: 4 }, true), 'easy');
});

// ------------------------------------------------------------------------------------------------ volleyball
const HIRO = { id: 'v6', team: 1, style: 'captain' }, SUMI = { id: 'v13', team: 1, style: 'dreamy' }, NAO = { id: 'v23', team: 0, style: 'never' };

test('volleyball: bump, set, spike: three touches a side at most, a kid partner sets when Mika bumps, a perfect third touch is a fast steep spike', () => {
  const flights = [];
  const r = run(new VolleySim({ seed: 11, players: [MIKA, NAO, HIRO, SUMI], level: 'normal', target: 5 }), s => volleyBot(s, 0.12), 900, s => { if (s.flight && !flights.includes(s.flight)) flights.push(s.flight); });
  assert.ok(r.sim.over);
  const touches = [];
  let n = 0;
  for (const e of r.log) {
    if (e.type === 'serve') n = 0;
    else if (e.type === 'kick') { n = e.touch; touches.push(e.touch); assert.ok(e.touch >= 1 && e.touch <= 3, 'at most three touches'); assert.equal(e.kind, ['bump', 'set', 'spike'][e.touch - 1]); }
    else if (e.type === 'point') n = 0;
  }
  assert.ok(touches.includes(2) && touches.includes(3), 'sets and spikes happen');
  // Mika's first touch goes to her partner, who sets; she attacks the third
  const mikaKinds = r.log.filter(e => e.type === 'kick' && e.human).map(e => e.kind);
  assert.ok(mikaKinds.includes('bump') && mikaKinds.includes('spike'), mikaKinds.join());
  const passes = r.log.filter(e => e.type === 'pass');
  assert.ok(passes.some(e => e.kind === 'bump') && passes.some(e => e.kind === 'set'));
  assert.ok(passes.filter(e => e.who === 'v23').every(e => e.kind === 'set' || e.kind === 'bump'), 'the partner passes');
  // every flight over the net clears its 2.2 m tape (unless it is meant for the net); spikes are quicker and flatter than lobs
  const over = flights.filter(f => f.over && f.fault !== 'net');
  assert.ok(over.length > 20);
  for (const f of over) assert.ok(netHeight(f) >= NET_H + 0.29, `${f.kind} clears (${netHeight(f)?.toFixed(2)})`);
  const spikes = flights.filter(f => f.kind === 'spike' && !f.fault), lobs = over.filter(f => f.kind !== 'spike');      // (serves, lobs, free balls)
  assert.ok(spikes.length >= 3 && lobs.length >= 3);
  const avg = (a, k) => a.reduce((s, f) => s + f[k], 0) / a.length;
  assert.ok(avg(spikes, 'dur') < avg(lobs, 'dur') - 0.4, 'a spike comes down fast');
  assert.ok(spikes.every(f => f.ay >= 2.3), 'a spike leaves from above the net');
  assert.equal(NET_H, 2.2);
});

test('volleyball: the serve rotates, rally scoring to 5 (3 the first time), the first try is gentle, faults are the other side\'s point', () => {
  const r = run(new VolleySim({ seed: 4, players: [MIKA, NAO, HIRO, SUMI], level: 'normal', target: 5 }), s => volleyBot(s, 0.12));
  const pts = r.log.filter(e => e.type === 'point');
  assert.deepEqual(pts.at(-1).score, r.sim.score);
  assert.ok(Math.max(...r.sim.score) === 5 && Math.min(...r.sim.score) < 5);
  assert.equal(count(r.log, 'serve'), pts.length, 'one serve a point');
  // within a team, the servers take turns
  const serves = r.log.filter(e => e.type === 'serve').map(e => e.who);
  for (const team of [['mika', 'v23'], ['v6', 'v13']]) {
    const mine = serves.filter(w => team.includes(w));
    // after a team has served twice running, it was not the same player each time (they alternate per serve of that team)
    for (let i = 1; i < mine.length; i++) assert.notEqual(mine[i], mine[i - 1], `${team} alternate`);
  }
  const first = run(new VolleySim({ seed: 4, players: [MIKA, NAO, HIRO, SUMI], level: 'first', target: 3 }), s => volleyBot(s, 0.12));
  assert.equal(Math.max(...first.sim.score), 3);
  assert.ok(LEVELS.first.slow > LEVELS.normal.slow);
  // net / out faults give the point to the other team
  let faults = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const q = run(new VolleySim({ seed, players: [{ id: 'a', team: 0, style: 'captain' }, { id: 'b', team: 0, style: 'wobbly' }, { id: 'c', team: 1, style: 'captain' }, { id: 'd', team: 1, style: 'wobbly' }], target: 3 }), () => ({}));
    let lastTeam = null;
    for (const e of q.log) {
      if (e.type === 'kick' || e.type === 'serve') lastTeam = ['a', 'b'].includes(e.who) ? 0 : 1;
      if (e.type === 'point' && (e.why === 'net' || e.why === 'out')) { faults++; assert.equal(e.team, 1 - lastTeam); }
    }
    assert.ok(q.sim.over);
  }
  assert.ok(faults > 5, 'kids fault now and then');
});

test('volleyball: a careful player wins, a decent one loses some rallies, one who is often late loses, and nobody dead-ends', () => {
  const N = 30;
  for (const [level, target] of [['first', 3], ['easy', 5], ['normal', 5]]) {
    let careful = 0, decent = 0, shaky = 0;
    for (let seed = 1; seed <= N; seed++) {
      const mk = () => new VolleySim({ seed, players: [MIKA, NAO, HIRO, SUMI], level, target });
      if (run(mk(), s => volleyBot(s, 0.12)).sim.over.won) careful++;
      if (run(mk(), s => volleyBot(s, perFlight(seed, 0.15)(s))).sim.over.won) decent++;
      if (run(mk(), s => volleyBot(s, perFlight(seed + 99, 0.3)(s))).sim.over.won) shaky++;
    }
    assert.ok(careful >= N * 0.9, `${level}: careful wins ${careful}/${N}`);
    assert.ok(decent < N && decent >= N * 0.35, `${level}: a decent player wins most of the time but not always (${decent}/${N})`);
    assert.ok(shaky <= N * { first: 0.8, easy: 0.7, normal: 0.6 }[level], `${level}: often late loses more (${shaky}/${N})`);
  }
  // the kids push back harder at Normal than on the first try
  let early = 0, normal = 0;      // points the kids score against a careful player
  for (let seed = 1; seed <= N; seed++) {
    early += run(new VolleySim({ seed, players: [MIKA, NAO, HIRO, SUMI], level: 'first', target: 5 }), s => volleyBot(s, 0.12)).sim.score[1];
    normal += run(new VolleySim({ seed, players: [MIKA, NAO, HIRO, SUMI], level: 'normal', target: 5 }), s => volleyBot(s, 0.12)).sim.score[1];
  }
  assert.ok(early < normal, `the kids score less on the first try (${early} vs ${normal} points in ${N} matches)`);
  // idle: she serves, never returns: she loses; one who never serves is waited for
  const idle = run(new VolleySim({ seed: 3, players: [MIKA, NAO, HIRO, SUMI], level: 'normal' }), s => volleyBot(s, () => -1));
  assert.equal(idle.sim.result().won, false);
  const waiting = run(new VolleySim({ seed: 3, players: [MIKA, NAO, HIRO, SUMI] }), () => ({}), 30);
  assert.equal(waiting.sim.state, 'serve');
  // alone against the pair, and with nobody: the practice board
  const solo = run(new VolleySim({ seed: 2, players: [MIKA, HIRO, SUMI], level: 'first', target: 3 }), s => volleyBot(s, 0.12));
  assert.ok(solo.sim.over.won);
  const wall = run(new VolleySim({ seed: 2, players: [MIKA], level: 'first', target: 3, wall: true }), s => volleyBot(s, 0.12));
  assert.deepEqual(wall.sim.score, [3, 0]);
});

test('volleyball: a recorded match replays exactly; the kids have their own habits', () => {
  const mk = () => new VolleySim({ seed: 21, players: [MIKA, NAO, HIRO, SUMI], level: 'normal', target: 5 });
  const a = run(mk(), s => volleyBot(s, perFlight(5, 0.1)(s)));
  const again = mk(), log = [];
  for (const inp of a.inputs) { again.step(DT, inp); for (const e of again.events) log.push(e); again.events.length = 0; }
  assert.deepEqual(log, a.log);
  // Hiro (captain) spikes more than Nao (never); Sumi (dreamy) drops more than Nao
  const tally = style => {
    let spikes = 0, attacks = 0, drops = 0, rally = 0, points = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const seen = new Set();
      const r = run(new VolleySim({ seed, players: [{ id: 'x', team: 0, style }, { id: 'y', team: 0, style }, { id: 'p', team: 1, style }, { id: 'q', team: 1, style }], target: 3 }), () => ({}), 900, sim => {
        const f = sim.flight;
        if (f && !seen.has(f) && f.over && f.kind !== 'serve') { seen.add(f); attacks++; if (f.kind === 'spike') spikes++; }
      });
      drops += count(r.log, 'point', e => e.why !== 'ground');
      for (const e of r.log) if (e.type === 'point') { rally += e.rally; points++; }
    }
    return { spike: spikes / attacks, faults: drops, rally: rally / points };
  };
  const cap = tally('captain'), nev = tally('never'), dr = tally('dreamy');
  assert.ok(cap.spike > nev.spike * 1.5, `captain spikes (${cap.spike.toFixed(2)} vs ${nev.spike.toFixed(2)})`);
  assert.ok(cap.faults > nev.faults, 'the captain\'s spikes find the net');
  assert.ok(dr.rally < nev.rally, `the dreamer's rallies are shorter than the steady one's (${dr.rally.toFixed(1)} vs ${nev.rally.toFixed(1)})`);
});

// ------------------------------------------------------------------------------------------------ rope jumping
test('rope jumping: the rope reaches the ground on the beat, a press just before clears it, a trip ends the streak, three trips end the round', () => {
  assert.ok(turnPeriod(0, 'first') > turnPeriod(0, 'easy') && turnPeriod(0, 'easy') > turnPeriod(0, 'normal'), 'gentler first');
  assert.ok(turnPeriod(30, 'normal') < turnPeriod(0, 'normal') && turnPeriod(200, 'normal') >= 0.6, 'quicker, never frantic');
  for (const level of ['first', 'easy', 'normal']) {
    const [a, b] = clearWindow(JUMP[level]);
    assert.ok(a > 0 && b > a && jumpHeight(a, JUMP[level]) >= CLEAR_H - 1e-9 && jumpHeight(a - 0.02, JUMP[level]) < CLEAR_H);
    assert.ok(b - a > 0.3, `${level}: a window to hit`);
  }
  assert.ok(clearWindow(JUMP.first)[1] - clearWindow(JUMP.first)[0] > clearWindow(JUMP.normal)[1] - clearWindow(JUMP.normal)[0]);
  const sim = new RopeSim({ seed: 1, players: [{ id: 'mika', role: 'jump', human: true }, { id: 'a', role: 'turn' }, { id: 'b', role: 'turn' }], level: 'normal' });
  const out = {};
  sim.ropeAt(0.5, out);
  const hands = sim.ropeAt(0, {}), hands2 = sim.ropeAt(1, {});
  assert.ok(Math.abs(hands.y - HANDS) < 1e-9 && Math.abs(hands2.y - HANDS) < 1e-9, 'the rope ends in the turners\' hands');
  // at phase 0 the middle of the rope touches the ground; half a turn later it is overhead
  sim.ph = 0; sim.ropeAt(0.5, out); assert.ok(out.y < 0.12, `touches the ground (${out.y.toFixed(2)})`);
  sim.ph = 0.5; sim.ropeAt(0.5, out); assert.ok(out.y > 1.6, `overhead (${out.y.toFixed(2)})`);
  // a careful player: long streak, three stars; never pressing: three trips and the round ends
  const mk = level => new RopeSim({ seed: 2, players: [{ id: 'mika', role: 'jump', human: true }, { id: 'a', role: 'turn' }, { id: 'b', role: 'turn' }], level });
  const good = run(mk('normal'), s => ropeBot(s, 0.27), 200);
  assert.ok(good.sim.over && good.sim.over.stars === 3 && good.sim.over.score >= ROPE_STARS[2], `a streak of ${good.sim.over.score}`);
  assert.equal(good.sim.trips, 0);
  const bad = run(mk('normal'), s => ropeBot(s, null), 200);
  assert.equal(bad.sim.trips, 3);
  assert.equal(bad.sim.over.score, 0);
  assert.equal(count(bad.log, 'trip'), 3);
  // the streak counts clean jumps, the kids count aloud, a trip puts it back to zero
  const counts = good.log.filter(e => e.type === 'count').map(e => e.n);
  assert.deepEqual(counts.slice(0, 5), [1, 2, 3, 4, 5]);
  const shaky = run(mk('normal'), (() => { const r = rng(4); const m = new Map(); return s => ropeBot(s, () => { const k = s.human.jumpT > 5 ? s.streak + ':' + s.trips : ''; return m.get(k) ?? (m.set(k, r() < 0.15 ? 0.001 : 0.15 + r() * 0.2), m.get(k)); }); })(), 200);
  assert.ok(shaky.sim.over);
  let streak = 0;
  for (const e of shaky.log) { if (e.type === 'count') { assert.equal(e.n, ++streak); } else if (e.type === 'trip') { assert.equal(e.streak, streak); streak = 0; } }
  assert.ok(shaky.sim.best <= good.sim.best);
  // stars are 8 / 16 / 30
  assert.deepEqual(ROPE_STARS, [8, 16, 30]);
  // a recorded round replays
  const rep = mk('normal'), log = [];
  for (const inp of good.inputs) { rep.step(DT, inp); for (const e of rep.events) log.push(e); rep.events.length = 0; }
  assert.deepEqual(log, good.log);
});

test('rope jumping: the kids on their own take turns, and tied to posts a lone jumper can still play', () => {
  const r = run(new RopeSim({ seed: 3, players: [{ id: 'a', role: 'jump' }, { id: 'b', role: 'turn' }, { id: 'c', role: 'turn' }], rotate: true }), () => ({}), 150);
  assert.ok(count(r.log, 'count') > 20 && count(r.log, 'trip') >= 1);
  assert.ok(r.sim.players.some(p => p.role === 'jump' && p.id !== 'a') || count(r.log, 'trip') === 0, 'the jumper changes after a trip');
  assert.equal(r.sim.turners.length, 2);
  const solo = new RopeSim({ seed: 1, players: [{ id: 'mika', role: 'jump', human: true }], level: 'first' });
  assert.ok(solo.posts);
  const s = run(solo, x => ropeBot(x, 0.27), 200);
  assert.ok(s.sim.over.score >= 8);
});

// ------------------------------------------------------------------------------------------------ tug of war
test('tug of war: the beat, the big pull, strain, the flag over the line, best of three', () => {
  const T = (a, b, c) => [MIKA, { id: 'k', team: 0, style: c }, { id: 'a', team: 1, style: a }, { id: 'b', team: 1, style: b }];
  const N = 30, wins = {};
  for (const level of ['first', 'easy', 'normal']) {
    const w = { beat: 0, late: 0, never: 0, mash: 0 };
    for (let seed = 1; seed <= N; seed++) {
      const mk = () => new TugSim({ seed, players: T('captain', 'never', 'dreamy'), level });
      if (run(mk(), s => tugBot(s, 0), 300).sim.over.won) w.beat++;
      if (run(mk(), s => tugBot(s, 0.55), 300).sim.over.won) w.late++;
      if (run(mk(), s => tugBot(s, null), 300).sim.over.won) w.never++;
      // mashing: a press every quarter second, whatever the beat
      let t = 0;
      if (run(mk(), s => ({ kick: s.state === 'pull' && Math.floor((t += DT) * 4) !== Math.floor((t - DT) * 4) }), 300).sim.over.won) w.mash++;
    }
    wins[level] = w;
    assert.ok(w.beat >= N * 0.9, `${level}: on the beat wins (${w.beat}/${N})`);
    assert.ok(level === 'first' ? w.beat >= w.mash : w.beat > w.mash, `${level}: the beat matters (${JSON.stringify(w)})`);
    if (level === 'normal') assert.ok(w.beat > w.late, `${level}: on the beat beats a little late (${JSON.stringify(w)})`);
    assert.ok(w.never <= N * 0.2 && (level === 'first' || w.mash <= N * (level === 'easy' ? 0.85 : 0.5)), `${level}: pulling off the beat or not at all loses (${JSON.stringify(w)})`);
  }
  assert.ok(wins.first.never >= wins.normal.never, 'gentler at first');
  // the flag crossing a line is a point; first to two takes it; stars follow
  const r = run(new TugSim({ seed: 3, players: T('strong', 'tricky', 'steady'), level: 'normal' }), s => tugBot(s, 0), 300);
  const pts = r.log.filter(e => e.type === 'point');
  assert.ok(pts.length >= 2 && pts.length <= 3);
  assert.deepEqual(pts.at(-1).score, r.sim.score);
  assert.equal(Math.max(...r.sim.score), 2);
  assert.ok(pts.every(e => e.why === 'line' || e.why === 'time'));
  assert.ok(r.sim.over.stars >= 2 === r.sim.over.won);
  assert.ok(LINE > 1 && BEAT > 1);
  // strain: pressing off the beat tires her (the big pull is then weak), one press a beat does not
  const tired = new TugSim({ seed: 1, players: T('strong', 'tricky', 'steady'), level: 'normal' });
  for (let i = 0; i < 400 && tired.state !== 'pull'; i++) tired.step(DT, {});      // (Normal reads its "Hold!" rule out first: four seconds)
  for (let i = 0; i < 6; i++) { tired.beatT = 0.7; tired.pressed = true; tired.step(DT, { kick: true }); }
  assert.ok(tired.fatigue > 0.65, `strain builds (${tired.fatigue.toFixed(2)})`);
  const rested = run(new TugSim({ seed: 1, players: T('strong', 'tricky', 'steady') }), s => tugBot(s, 0), 20);
  assert.ok(rested.sim.fatigue < 0.2);
  // a recorded match replays; the kids' own pull ends (two against one and a post)
  const rep = new TugSim({ seed: 3, players: T('strong', 'tricky', 'steady'), level: 'normal' }), log = [];
  for (const inp of r.inputs) { rep.step(DT, inp); for (const e of rep.events) log.push(e); rep.events.length = 0; }
  assert.deepEqual(log, r.log);
  const kids = run(new TugSim({ seed: 2, players: [{ id: 'a', team: 0, style: 'captain' }, { id: 'b', team: 0, style: 'never' }, { id: 'c', team: 1, style: 'dreamy' }] }), () => ({}), 300);
  assert.ok(kids.sim.over);
  assert.equal(kids.sim.anchors(1), 1, 'a lone side is helped by a post');
});

// ------------------------------------------------------------------------------------------------ ô ăn quan
const blank = () => { const b = O.newBoard(); b.dan.fill(0); return b; };
const sum = b => b.dan.reduce((s, v) => s + v, 0) + b.quan.reduce((s, v) => s + v * 10, 0) + b.pile.reduce((s, p) => s + p.dan + p.quan * 10, 0);

test('ô ăn quan: the start, sowing both ways, stopping at a quan square, continuing from a full square', () => {
  const b = O.newBoard();
  assert.deepEqual(b.dan, [0, 5, 5, 5, 5, 5, 0, 5, 5, 5, 5, 5]);
  assert.deepEqual(b.quan, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  assert.equal(O.totalValue(b), 70);
  assert.deepEqual(O.SIDE, [[1, 2, 3, 4, 5], [7, 8, 9, 10, 11]]);
  assert.equal(O.legalMoves(b, 0).length, 10);
  assert.equal(O.legalMoves(b, 1).length, 10);
  // sow counter-clockwise: two pebbles from square 3 go to 4 and 5; the next square is a quan: the turn ends
  let p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[3] = 2;
  let r = O.play(p, 0, 3, 1);
  assert.deepEqual(r.board.dan, [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(r.got, { dan: 0, quan: 0 });
  assert.deepEqual(r.steps.map(s => s.t), ['pick', 'drop', 'drop']);
  // clockwise from square 2: 1, the quan square 0 and 11; then two empty squares: nothing
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[2] = 3;
  r = O.play(p, 0, 2, -1);
  assert.deepEqual(r.board.dan, [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(r.got.dan + r.got.quan, 0);
  // the last pebble lands in front of a full small square: pick that up and carry on
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[5] = 1; p.dan[7] = 5;
  r = O.play(p, 0, 5, 1);
  assert.deepEqual(r.board.dan, [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1], 'square 7 was picked up and sown 8, 9, 10, 11, 0');
  assert.deepEqual(r.steps.map(s => s.t), ['pick', 'drop', 'pick', 'drop', 'drop', 'drop', 'drop', 'drop']);
  // a quan square ends the turn even with pebbles in it
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[4] = 1; p.dan[6] = 3;
  r = O.play(p, 0, 4, 1);
  assert.equal(r.board.dan[6], 3, 'the quan square is not picked up');
  assert.equal(r.board.dan[5], 1);
  // you can only move your own non-empty squares
  assert.ok(O.play(b, 0, 8, 1).illegal && O.play(b, 0, 0, 1).illegal && O.play(blank(), 0, 3, 1).illegal);
  assert.ok(O.play(b, 1, 9, -1).board && !O.play(b, 1, 9, -1).illegal);
});

test('ô ăn quan: capturing after an empty square, the chain, a captured quan, scoring', () => {
  // 1 -> drop on 4; next 5 is empty and after it 6 holds the quan: capture it (10 points)
  let p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[3] = 1;
  let r = O.play(p, 0, 3, 1);
  assert.deepEqual(r.got, { dan: 0, quan: 1 });
  assert.equal(r.board.quan[6], 0);
  assert.equal(O.pileScore(r.board, 0), 10);
  assert.deepEqual(r.steps.at(-1), { t: 'take', sq: 6, dan: 0, quan: 1 });
  // the chain: sow, hop over an empty square and take 4, the next is empty and 3 beyond it: take that too, then a full square stops it
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[3] = 1; p.dan[5] = 2; p.dan[9] = 4; p.dan[11] = 3;
  r = O.play(p, 0, 3, 1);
  assert.deepEqual(r.got, { dan: 7, quan: 0 });
  assert.deepEqual(r.board.dan, [0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0]);
  assert.equal(O.pileScore(r.board, 0), 7);
  assert.deepEqual(r.steps.map(s => s.t), ['pick', 'drop', 'pick', 'drop', 'drop', 'take', 'take']);
  assert.equal(O.totalValue(r.board), O.totalValue(p), 'nothing is lost');
  // the chain stops when the next square is not empty: the capture of 9 is followed by a full square 10
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[3] = 1; p.dan[5] = 2; p.dan[9] = 4; p.dan[10] = 2; p.dan[11] = 3;
  r = O.play(p, 0, 3, 1);
  assert.deepEqual(r.got, { dan: 4, quan: 0 });
  assert.equal(r.board.dan[11], 3);
  // two empty squares in a row end the turn, no capture
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[2] = 1; p.dan[8] = 2;
  r = O.play(p, 0, 2, 1);
  assert.deepEqual(r.got, { dan: 0, quan: 0 });
  // the other side captures the other way round, clockwise from square 9: 8, then 7 is empty... capture beyond it
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[9] = 1; p.dan[7] = 0; p.dan[5] = 6;
  r = O.play(p, 1, 9, -1);
  assert.deepEqual(r.got, { dan: 0, quan: 1 }, 'square 8 gets the pebble, 7 is empty, and 6 holds the quan');
  assert.equal(O.pileScore(r.board, 1), 10);
  // scoring: dân 1, quan 10
  const b = O.newBoard(); b.pile[0] = { dan: 7, quan: 1 }; b.pile[1] = { dan: 3, quan: 0 };
  assert.deepEqual([O.pileScore(b, 0), O.pileScore(b, 1)], [17, 3]);
});

test('ô ăn quan: refilling an empty side, borrowing, the end of the game and the final count', () => {
  let p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.pile[0].dan = 7; p.dan[8] = 2;
  let r = O.refill(p, 0);
  assert.ok(r.refilled && !r.stuck && r.borrowed === 0);
  assert.deepEqual(r.board.dan.slice(1, 6), [1, 1, 1, 1, 1]);
  assert.equal(r.board.pile[0].dan, 2);
  assert.equal(O.totalValue(r.board), O.totalValue(p));
  // fewer than five captured: borrow the rest from the opponent and give it back in the count
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.pile[0].dan = 3; p.pile[1].dan = 6; p.dan[8] = 2;
  r = O.refill(p, 0);
  assert.equal(r.borrowed, 2);
  assert.equal(r.board.debt[0], 2);
  assert.equal(r.board.pile[1].dan, 4);
  assert.equal(O.totalValue(r.board), O.totalValue(p));
  assert.equal(O.pileScore(r.board, 0), -2 + 0, 'the debt is taken off');
  const fs = O.finalScore(r.board);
  assert.deepEqual(fs, [5 - 2, 2 + 4 + 2 + 0], 'her five pebbles on the board less the two she owes; the lender is paid back');
  // nobody can pay: stuck, and nothing changes
  p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[8] = 2;
  assert.ok(O.refill(p, 0).stuck);
  // a side with pebbles is left alone
  assert.ok(!O.refill(O.newBoard(), 0).refilled);
  // the end: both quan gone; the quick game ends at the first quan or after 24 turns
  const b = O.newBoard();
  assert.ok(!O.finished(b) && !O.finished(b, true));
  b.quan[0] = 0;
  assert.ok(!O.finished(b) && O.finished(b, true));
  b.quan[6] = 0;
  assert.ok(O.finished(b));
  const c = O.newBoard(); c.turns = O.QUICK_TURNS;
  assert.ok(O.finished(c, true) && !O.finished(c));
  // the final count: pebbles left on a side are its owner's
  const e = O.newBoard(); e.quan.fill(0); e.pile[0] = { dan: 4, quan: 1 }; e.pile[1] = { dan: 9, quan: 1 }; e.dan.fill(0); e.dan[2] = 3; e.dan[8] = 5;
  assert.deepEqual(O.finalScore(e), [4 + 10 + 3, 9 + 10 + 5]);
});

test('ô ăn quan: whole games never lose a pebble, always end, and the opponent plays sensibly at each depth', () => {
  const start = O.newBoard();
  for (let g = 0; g < 60; g++) {
    const rand = rng(g + 1);
    let b = O.newBoard(), who = 0, turns = 0;
    while (!O.finished(b) && turns < 500) {
      const pr = O.refill(b, who);
      if (pr.stuck) break;
      b = pr.board;
      const ms = O.legalMoves(b, who);
      if (!ms.length) break;
      const m = ms[Math.floor(rand() * ms.length)], res = O.play(b, who, m.sq, m.dir);
      assert.ok(!res.illegal);
      b = res.board;
      assert.equal(O.totalValue(b), O.totalValue(start), `game ${g} turn ${turns}`);
      assert.ok(b.dan.every(v => v >= 0) && b.quan.every(v => v === 0 || v === 1) && b.quan.every((v, i) => v === 0 || i === 0 || i === 6));
      who = 1 - who; turns++;
    }
    assert.ok(O.finished(b) || turns > 0);
  }
  // depth 1 takes the capture that is there; deeper search sees the reply
  let p = blank(); p.quan[0] = 1; p.quan[6] = 1; p.dan[3] = 1; p.dan[4] = 2; p.dan[9] = 5;
  const m1 = O.bestMove(p, 0, 1);
  assert.equal(m1.sq, 3);
  const hint = O.hints(p, 0);
  assert.ok(hint[0].gain >= hint.at(-1).gain && hint.length === O.legalMoves(p, 0).length);
  for (const depth of [1, 2, 3]) assert.ok(O.legalMoves(p, 0).some(m => m.sq === O.bestMove(p, 0, depth).sq && m.dir === O.bestMove(p, 0, depth).dir));
  // deeper play beats shallower play
  let deep = 0, N = 12;
  for (let g = 0; g < N; g++) {
    let b = O.newBoard(), who = g % 2, turns = 0;
    while (!O.finished(b, true) && turns < 80) {
      const pr = O.refill(b, who); if (pr.stuck) break; b = pr.board;
      const m = O.bestMove(b, who, who === 0 ? 3 : 1, rng(g * 7 + turns), who === 0 ? 0 : 0.1);
      if (!m) break;
      b = O.play(b, who, m.sq, m.dir).board; who = 1 - who; turns++;
    }
    const s = O.finalScore(b);
    if (s[0] > s[1]) deep++;
  }
  assert.ok(deep >= N * 0.6, `depth 3 beats depth 1 (${deep}/${N})`);
});

test('ô ăn quan: the sim animates a move step by step, plays by tapping a square then a direction, and ends with a count', () => {
  const sim = new O.OanSim({ seed: 1, players: [{ id: 'mika', human: true }, { id: 'k', style: 'steady' }], level: 'normal', quick: true });
  for (let i = 0; i < 120 && sim.state !== 'think'; i++) sim.step(DT, {});
  assert.equal(sim.state, 'think');
  assert.ok(sim.cur.human);
  sim.step(DT, { pick: 8 }); assert.equal(sim.sel, null, 'not her square');
  sim.step(DT, { pick: 3 }); assert.equal(sim.sel, 3);
  sim.step(DT, { dir: 1 });
  assert.equal(sim.state, 'sow');
  const shown = [];
  for (let i = 0; i < 600 && sim.state === 'sow'; i++) { sim.step(DT, {}); shown.push(sim.shown.dan.reduce((s, v) => s + v, 0)); }
  assert.ok(shown.some(v => v < 60) , 'pebbles are in the hand while it sows');
  assert.deepEqual(sim.shown.dan, sim.board.dan, 'the picture catches up with the position');
  assert.equal(sim.board.turns, 1);
  const kinds = sim.events.map(e => e.type);
  assert.ok(kinds.includes('pick') && kinds.includes('drop') && kinds.includes('sow'));
  // a whole game with a stand-in for Mika: it ends, the score is the final count, the card reads it
  const g = new O.OanSim({ seed: 2, players: [{ id: 'mika', human: true }, { id: 'k', style: 'wobbly' }], level: 'first', quick: true });
  const r = run(g, s => O.oanBot(s, 2), 1500);
  assert.ok(r.sim.over);
  assert.deepEqual([r.sim.over.mine, r.sim.over.theirs], O.finalScore(r.sim.board));
  assert.ok(r.log.some(e => e.type === 'take'));
  // the kids' own game: animation only, no human
  const kids = run(new O.OanSim({ seed: 3, players: [{ id: 'a', style: 'strong' }, { id: 'b', style: 'wobbly' }] }), () => ({}), 1500);
  assert.ok(kids.sim.over);
  // hints light only squares with a legal move
  const h = new O.OanSim({ seed: 1, players: [{ id: 'mika', human: true }, { id: 'k' }] });
  for (let i = 0; i < 120 && h.state !== 'think'; i++) h.step(DT, {});
  assert.ok(h.hintSquares().every(sq => sq >= 1 && sq <= 5 && h.board.dan[sq] > 0));
});

// ------------------------------------------------------------------------------------------------ sack race
test('sack race: a steady rhythm builds longer hops, mashing wobbles and tumbles, the kids are beatable, the stars are the place', () => {
  const P = [{ id: 'mika', human: true }, { id: 'a', style: 'strong' }, { id: 'b', style: 'wobbly' }];
  const N = 30;
  for (const level of ['first', 'easy', 'normal']) {
    let steady = 0, mash = 0, never = 0, jitter = 0, steadyTime = 0;
    for (let seed = 1; seed <= N; seed++) {
      const mk = () => new SackSim({ seed, players: P, level });
      const a = run(mk(), s => sackBot(s, 0.5), 120); if (a.sim.over.place === 1) steady++; steadyTime += a.sim.over.time;
      const m = run(mk(), s => sackBot(s, 0.2), 120); if (m.sim.over.place === 1) mash++; assert.ok(m.sim.over.falls >= 3, 'mashing makes her tumble');
      if (run(mk(), s => sackBot(s, null), 120).sim.over.place === 1) never++;
      const r = rng(seed), cache = {};
      if (run(mk(), s => sackBot(s, q => cache[q.human.hops + ':' + q.human.falls] ??= 0.3 + r() * 0.5), 120).sim.over.place === 1) jitter++;
    }
    assert.ok(steady >= N * 0.9, `${level}: steady hopping wins (${steady}/${N})`);
    assert.equal(mash, 0, `${level}: mashing never wins`);
    assert.equal(never, 0);
    assert.ok(jitter < steady, `${level}: an uneven rhythm is slower (${jitter} vs ${steady})`);
    // one length is about twelve seconds: the first race is one, Easy there and back, Normal three lengths
    const lengths = { first: 1, easy: 2, normal: 3 }[level], per = steadyTime / N / lengths;
    assert.ok(per > 9 && per < 16, `${level}: about twelve seconds a length (${per.toFixed(1)})`);
  }
  // the hops: a press is one hop, quicker presses are wobbles
  const s = new SackSim({ seed: 1, players: P, level: 'normal' });
  for (let i = 0; i < 300 && s.state !== 'race'; i++) s.step(DT, {});
  const h = s.human;
  s.step(DT, { kick: true }); const d1 = h.d;
  for (let i = 0; i < 40; i++) s.step(DT, {});
  s.step(DT, { kick: true }); const d2 = h.d - d1;
  assert.ok(d1 > 0 && d1 <= 0.6 && d2 > 0);
  assert.ok(COURSE === 13);
  // stars by place: the finishers are placed, a last place has none; the sim ends on its own for the kids
  const r = run(new SackSim({ seed: 3, players: [{ id: 'a', style: 'strong' }, { id: 'b', style: 'wobbly' }, { id: 'c', style: 'never' }] }), () => ({}), 120);
  assert.ok(r.sim.over && r.sim.players.every(p => p.place >= 1 && p.place <= 3));
  assert.equal(new Set(r.sim.players.map(p => p.place)).size, 3);
  const slow = run(new SackSim({ seed: 3, players: P, level: 'normal' }), s2 => sackBot(s2, 0.3 + 0.0 * s2.t), 120);
  assert.ok(slow.sim.over.stars <= 3);
  // replay
  const a = run(new SackSim({ seed: 8, players: P, level: 'normal' }), q => sackBot(q, 0.5), 120);
  const rep = new SackSim({ seed: 8, players: P, level: 'normal' }), log = [];
  for (const inp of a.inputs) { rep.step(DT, inp); for (const e of rep.events) log.push(e); rep.events.length = 0; }
  assert.deepEqual(log, a.log);
});

// ------------------------------------------------------------------------------------------------ marbles
test('marbles: deterministic physics (collisions keep momentum, friction stops them), knocked out of the ring is yours', () => {
  const a = { u: 0, v: 0, vu: 1, vv: 0, r: 0.05, m: 1, roll: 0 }, b = { u: 0.09, v: 0, vu: 0, vv: 0, r: 0.05, m: 1, roll: 0 };
  const mom = () => a.vu * a.m + b.vu * b.m;
  const before = mom();
  for (let i = 0; i < 40; i++) stepBalls([a, b], 1 / 240);
  assert.ok(Math.abs(mom() - before) < 0.6, 'friction takes a little, the bump none');
  assert.ok(b.vu > a.vu, 'the struck one runs off ahead');
  for (let i = 0; i < 2400; i++) stepBalls([a, b], 1 / 240);
  assert.equal(Math.hypot(a.vu, a.vv) + Math.hypot(b.vu, b.vv), 0, 'everything comes to rest');
  assert.ok(a.u > -0.05 && b.u > a.u + 0.2);
  // the start: eight marbles bunched in the middle of the ring, none overlapping
  const m = marbleSetup(1);
  assert.equal(m.length, 8);
  for (let i = 0; i < m.length; i++) { assert.ok(Math.hypot(m[i].u, m[i].v) < RING * 0.6); for (let j = i + 1; j < m.length; j++) assert.ok(Math.hypot(m[i].u - m[j].u, m[i].v - m[j].v) >= R_MARBLE * 2 - 1e-9); }
  assert.deepEqual(marbleSetup(5).map(x => [x.u, x.v]), marbleSetup(5).map(x => [x.u, x.v]));
});

test('marbles: aim and flick, four shots each, first to four marbles or the most; levels, replay, the kids', () => {
  const P = [{ id: 'mika', human: true }, { id: 'k', style: 'strong' }];
  const N = 25;
  for (const level of ['first', 'easy', 'normal']) {
    let strong = 0, weak = 0;
    for (let seed = 1; seed <= N; seed++) {
      const mk = () => new MarblesSim({ seed, players: P, level });
      const s = run(mk(), q => marblesBot(q, 0.9), 400); if (s.sim.over.won) strong++;
      // eight marbles (Normal: and the tor, worth two); four, five and six shots each
      const K = MARBLES_LEVEL[level], all = 8 + (K.tor ? 2 : 0);
      assert.ok(s.sim.over.mine <= all && s.sim.over.theirs <= all && s.sim.over.mine + s.sim.over.theirs <= all);
      assert.ok(s.sim.players.every(p => p.shots <= K.shots));
      if (run(mk(), q => marblesBot(q, 0.12), 400).sim.over.won) weak++;
    }
    assert.ok(strong >= N * 0.8, `${level}: a good flick wins (${strong}/${N})`);
    assert.ok(weak <= N * 0.3, `${level}: a feeble one does not (${weak}/${N})`);
  }
  // the marbles she knocks out are hers, and they are counted for the save
  const r = run(new MarblesSim({ seed: 4, players: P, level: 'normal' }), q => marblesBot(q, 0.9), 400);
  assert.equal(r.log.filter(e => e.type === 'out' && e.human).reduce((s, e) => s + (e.tor ? 2 : 1), 0), r.sim.over.mine);
  assert.equal(r.sim.over.gain, r.sim.over.mine);
  for (const b of r.sim.balls) if (b.out) assert.ok(Math.hypot(b.u, b.v) > RING);
  // a replay of the recorded round gives the same marbles
  const rep = new MarblesSim({ seed: 4, players: P, level: 'normal' }), log = [];
  for (const inp of r.inputs) { rep.step(DT, inp); for (const e of rep.events) log.push(e); rep.events.length = 0; }
  assert.deepEqual(log, r.log);
  assert.deepEqual(rep.balls.map(b => [b.u, b.v]), r.sim.balls.map(b => [b.u, b.v]));
  // nobody about: she waits for her flick; the kids' own game finishes
  const wait = run(new MarblesSim({ seed: 1, players: P }), () => ({}), 20);
  assert.equal(wait.sim.over, null);
  const kids = run(new MarblesSim({ seed: 2, players: [{ id: 'a', style: 'strong' }, { id: 'b', style: 'wobbly' }] }), () => ({}), 400);
  assert.ok(kids.sim.over);
});

// ------------------------------------------------------------------------------------------------ Takamori Green and the paths
test('Takamori Green: the kids play volleyball, tug of war, the sack race and rope jumping there, together, and can walk to it', () => {
  const Y = YARDS.takamori;
  const kids = Y.kids.map(id => PEOPLE.find(p => p.id === id));
  const roads = buildRoads({ spots: SPOTS });
  for (const k of kids) {
    assert.equal(k.village, 'takamori');
    const tasks = k.plan.flatMap(b => b.tasks), yard = tasks.filter(t => t.at === Y.spot);
    for (const g of Y.games) assert.ok(yard.some(t => t.play === g), `${k.name} plays ${g}`);
    assert.ok(tasks.some(t => t.play === 'tag') && tasks.some(t => t.play === 'ball'), 'their old games are still there');
    for (const t of yard) for (const o of t.with) assert.ok(Y.kids.includes(o) && o !== k.id);
    for (const b of k.plan) for (const t of b.tasks.filter(q => q.at === Y.spot)) {
      for (const o of t.with) {
        const friend = PEOPLE.find(p => p.id === o);
        const same = friend.plan.filter(fb => fb.from === b.from && JSON.stringify(fb.when || null) === JSON.stringify(b.when || null));
        assert.ok(same.some(fb => fb.tasks.some(q => q.play === t.play && q.at === t.at)), `${k.name} at ${b.from}: ${friend.name} plays ${t.play} too`);
      }
    }
  }
  for (const from of ['takamori.playground', 'takamori.green', 'takamori.bellSteps', 'takamori.towerYard', 'takamori.bench']) {
    const path = route(roads, SPOTS[from], Y.spot);
    assert.ok(path && path.length >= 2, `a way from ${from}`);
  }
  // Kawabe's kids also rope-jump, play marbles and ô ăn quan, and keep foot-tennis and keep it up
  const kk = YARDS.kawabe.kids.map(id => PEOPLE.find(p => p.id === id));
  for (const g of YARDS.kawabe.games) assert.ok(kk.some(k => k.plan.some(b => b.tasks.some(t => t.play === g && t.at === 'kawabe.yard'))), `Kawabe plays ${g}`);
  // each yard's kids have a Town Life style for every game they play
  for (const id of [...YARDS.kawabe.kids, ...Y.kids]) assert.ok(KID_STYLE[id]);
});

test('yards: walks between two points never cut through the rails; they go by the gates or round the corners', () => {
  const segCross = (Y, a, b) => {
    for (const [x0, z0, x1, z1] of fenceRuns(Y)) for (let t = 0; t <= 1; t += 0.02) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const vx = x1 - x0, vz = z1 - z0, k = Math.max(0, Math.min(1, ((x - x0) * vx + (z - z0) * vz) / (vx * vx + vz * vz || 1e-9)));
      if (Math.hypot(x0 + vx * k - x, z0 + vz * k - z) < 0.1) return true;
    }
    return false;
  };
  const r = rng(9);
  for (const Y of YARD_LIST) {
    const F = Y.fence;
    for (let i = 0; i < 400; i++) {
      const pt = () => [F.x0 - 8 + r() * (F.x1 - F.x0 + 16), F.z0 - 8 + r() * (F.z1 - F.z0 + 16)];
      const a = pt(), b = pt();
      // not inside the rails themselves
      const band = p => insideFence(Y, p[0], p[1], 0.35) && !insideFence(Y, p[0], p[1], -0.35);
      if (band(a) || band(b)) continue;       // (standing in the rails themselves)
      const path = pathBetween(Y, a[0], a[1], b[0], b[1]);
      let at = a;
      for (const p of path) { assert.ok(!segCross(Y, at, p), `${Y.id}: ${a.map(v => v.toFixed(1))} -> ${b.map(v => v.toFixed(1))} cuts the rails`); at = p; }
      assert.deepEqual(path.at(-1), b);
      // gates are used when one end is inside
      if (insideFence(Y, a[0], a[1]) !== insideFence(Y, b[0], b[1])) assert.ok(path.length >= 4);
    }
  }
});

// ------------------------------------------------------------------------------------------------ the save
test('yard save: each yard\'s scoreboard, every game\'s record, the marbles she has won; odd saves are cleaned', async () => {
  const { cleanYard, recordYard, gameOn, setGameOn } = await import('../src/content/yard.js');
  const { freshState, migrate } = await import('../src/game/quest.js');
  assert.deepEqual(freshState().yard, { game: 'footnet' });
  const raw = { game: 'oanquan', pick: { takamori: 'tug', kawabe: 'volley', nowhere: 'rope' }, marbles: { plays: 3, wins: 2, best: 5, rally: 5, stars: 3, total: 11.8 }, volley: { plays: 1 }, chess: { plays: 9 } };
  const clean = cleanYard(raw);
  assert.equal(clean.game, 'oanquan');
  assert.deepEqual(clean.pick, { takamori: 'tug' }, 'only a yard\'s own games are kept');
  assert.deepEqual(clean.marbles, { plays: 3, wins: 2, best: 5, rally: 5, stars: 3, total: 11 });
  assert.deepEqual(clean.volley, { plays: 1, wins: 0, best: 0, rally: 0, stars: 0 });
  assert.ok(!('chess' in clean));
  assert.equal(cleanYard({ game: 'volley' }).game, 'footnet', 'Kawabe cannot show a Takamori game');
  assert.deepEqual(cleanYard({ pick: { takamori: 'chess' } }), { game: 'footnet' });
  // older saves (one scoreboard) still load; the new fields are filled in
  assert.deepEqual(migrate({ ...freshState(), yard: { game: 'keepup', keepup: { plays: 2, wins: 1, best: 20, rally: 20, stars: 2 } } }).yard, { game: 'keepup', keepup: { plays: 2, wins: 1, best: 20, rally: 20, stars: 2 } });
  assert.deepEqual(migrate({ ...freshState(), yard: 'no' }).yard, { game: 'footnet' });
  const kept = migrate({ ...freshState(), yard: clean }).yard;
  assert.deepEqual(kept, clean);
  // the scoreboard of each yard
  const save = { game: 'rope' };
  assert.equal(gameOn(save, YARDS.kawabe), 'rope');
  assert.equal(gameOn(save, YARDS.takamori), 'volley');
  setGameOn(save, YARDS.takamori, 'sack');
  assert.equal(gameOn(save, YARDS.takamori), 'sack');
  assert.equal(gameOn(save, YARDS.kawabe), 'rope');
  // recording a round: the marbles she wins add up
  let r = recordYard(undefined, { score: 4, won: true, stars: 2, rally: 4, gain: 4 });
  r = recordYard(r.rec, { score: 2, won: false, stars: 1, rally: 2, gain: 2 });
  const { levels, level, ...core } = r.rec;       // (the per-level fields: tests/levels.test.mjs)
  assert.deepEqual(core, { plays: 2, wins: 1, best: 4, rally: 4, stars: 2, total: 6 });
  assert.equal(r.newBest, false);
});
