// The levels of the eight playground games: Easy, Normal and Difficult differ in KIND (a bounce, the wind, called passes,
// a blocker, pace calls and double turns, hold beats and mud, the young quan, logs and a strip of mud, the tor and
// colours), not only in numbers. Each game's own rule of each level, its star rule, and that the guided first round and
// the kids' own play are what they were. All pure and seeded: hundreds of rounds are played here by the games' own bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARD_GAMES, YARD_GAME } from '../src/game/yard/index.js';
import { KID_STYLE, recordYard } from '../src/content/yard.js';
import { LEVELS as PICKED, unlocked } from '../src/content/levels.js';
import { LEVELS, ROUND_LEVELS, COURT } from '../src/game/yard/rules.js';
import { FOOTNET_TARGET, FOOTNET_STARS, WIND_DRIFT } from '../src/game/yard/footnet.js';
import { KEEPUP_LEVEL } from '../src/game/yard/keepup.js';
import { VOLLEY_TARGET, VOLLEY_STARS } from '../src/game/yard/volley.js';
import { ROPE_LEVEL, PACE, QUICK, JUMP, clearWindow } from '../src/game/yard/rope.js';
import { TUG_LEVEL, TEMPOS, BEAT } from '../src/game/yard/tug.js';
import * as O from '../src/game/yard/oanquan.js';
import { SACK_LEVEL, COURSE, LOGS_V, MUD_V, LEAP, bestSeconds } from '../src/game/yard/sack.js';
import { MARBLES_LEVEL, RING, R_TOR, setup as marbleSetup } from '../src/game/yard/marbles.js';

const DT = 1 / 60, MIKA = { id: 'mika', team: 0, human: true };
const KIDS = { footnet: ['v3', 'v20', 'v10'], keepup: ['v3', 'v20', 'v10'], rope: ['v3', 'v20', 'v10'], marbles: ['v3'], oanquan: ['v20'], volley: ['v6', 'v23', 'v13'], tug: ['v6', 'v23', 'v13'], sack: ['v6', 'v23', 'v13'] };
/** What a careful player's stand-in is told for each game (see each game's bot). */
const CAREFUL = { footnet: 0.12, keepup: 0.12, volley: 0.12, rope: 0.27, tug: 0, sack: 0.5, marbles: 0.9, oanquan: 2 };

function make(id, level, seed, kids = KIDS[id]) {
  const G = YARD_GAME[id], T = G.teams(kids);
  const players = [MIKA, ...T.mine.map(k => ({ id: k, team: 0, style: KID_STYLE[k] })), ...T.theirs.map(k => ({ id: k, team: 1, style: KID_STYLE[k] })), ...(T.turn || []).filter(k => !T.theirs.includes(k)).map(k => ({ id: k, team: 0, style: KID_STYLE[k] }))];
  return G.create({ seed, players, level, target: G.target(level), wall: !!T.wall });
}
/** Run a sim on a policy (default: the game's careful bot). flags: set on the sim first (a careless player, see the bots). */
function run(id, level, seed, { policy = null, flags = null, limit = 600, kids, hook = null } = {}) {
  const sim = make(id, level, seed, kids), G = YARD_GAME[id], log = [], inputs = [];
  if (flags) Object.assign(sim, flags);
  let t = 0;
  while (!sim.over && t < limit) {
    const inp = policy ? policy(sim, G) : G.bot(sim, CAREFUL[id]);
    inputs.push({ ...inp });
    sim.step(DT, inp);
    hook?.(sim);
    for (const e of sim.events) log.push(e);
    sim.events.length = 0;
    t += DT;
  }
  return { sim, log, inputs, t, res: sim.over };
}
const count = (log, type, f = () => true) => log.filter(e => e.type === type && f(e)).length;
const tally = (id, level, n, opt) => { const s = { stars: [0, 0, 0, 0], won: 0, t: 0, score: 0 }; for (let seed = 1; seed <= n; seed++) { const r = run(id, level, seed * 7 + 1, opt); assert.ok(r.res, `${id} ${level} seed ${seed}: the round ends`); s.stars[r.res.stars]++; s.won += r.res.won ? 1 : 0; s.t += r.t / n; s.score += r.res.score / n; } return s; };

// ------------------------------------------------------------------------------------------------ all eight
test('levels: every game plays first, easy, normal and hard to an end, replays exactly, and records per level', () => {
  assert.deepEqual(ROUND_LEVELS, ['first', 'easy', 'normal', 'hard']);
  assert.deepEqual(PICKED, ['easy', 'normal', 'hard']);
  // Difficult keeps Normal's timing windows: what it adds is a rule, not a narrower press
  for (const k of ['p0', 'p1', 'ok', 'reach', 'slow']) assert.equal(LEVELS.hard[k], LEVELS.normal[k], k);
  for (const G of YARD_GAMES) {
    let rec = null;
    for (const level of ROUND_LEVELS) {
      const a = run(G.id, level, 11);
      assert.ok(a.res, `${G.id} ${level}: ends`);
      assert.ok(a.res.stars >= 0 && a.res.stars <= 3 && Number.isFinite(a.res.score), `${G.id} ${level}: a result`);
      assert.equal(typeof a.sim.hud({ mine: 'Mika', theirs: 'Kids' }).big, 'string');
      // seeded and pure: the recorded input gives the same round again
      const again = make(G.id, level, 11), log = [];
      for (const inp of a.inputs) { again.step(DT, inp); for (const e of again.events) log.push(e); again.events.length = 0; }
      assert.deepEqual(log, a.log, `${G.id} ${level}: replays`);
      ({ rec } = recordYard(rec, { ...a.res, stars: 2 }, level));
    }
    // the guided first round is kept with the Easy ones; two stars on each level open the next
    assert.deepEqual(Object.keys(rec.levels).sort(), ['easy', 'hard', 'normal']);
    assert.equal(rec.levels.easy.plays, 2);
    assert.ok(unlocked(rec, 'hard'));
  }
});

test('levels: a careful player can win every level, and each level asks for more than the one before', () => {
  const N = 16;
  for (const id of ['footnet', 'keepup', 'volley', 'rope', 'tug', 'sack', 'marbles']) {
    const easy = tally(id, 'easy', N), normal = tally(id, 'normal', N), hard = tally(id, 'hard', N);
    // one star on Easy is easy; two on Normal and on Difficult are within a careful player's reach
    assert.equal(easy.stars[0], 0, `${id}: a careful round on Easy always earns a star (${easy.stars})`);
    assert.ok(normal.stars[2] + normal.stars[3] >= N * 0.6, `${id}: two stars on Normal (${normal.stars})`);
    assert.ok(hard.stars[2] + hard.stars[3] >= N * 0.4, `${id}: Difficult can be won (${hard.stars})`);
    // and a round is a little longer level by level
    assert.ok(easy.t < normal.t + 6 && normal.t < hard.t + 6, `${id}: lengths ${easy.t.toFixed(0)} / ${normal.t.toFixed(0)} / ${hard.t.toFixed(0)} s`);
  }
});

test('levels: the kids\' own play is the plain game at every level (no wind, calls, holds, logs, tor or young quan)', () => {
  for (const level of ['normal', 'hard']) {
    const mk = (id, ids) => { const G = YARD_GAME[id]; return G.create({ seed: 5, players: ids.map((k, i) => ({ id: k, team: G.ambientTeam(ids, i), style: KID_STYLE[k] })), level, target: 3 }); };
    const f = mk('footnet', ['v3', 'v20']); assert.ok(!f.windy && !f.bounce && !f.smart && f.wind === 0);
    const k = mk('keepup', ['v3', 'v20', 'v10']); assert.ok(!k.calls && k.timeLeft === Infinity);
    const v = mk('volley', ['v6', 'v23', 'v13', 'v3']); assert.ok(!v.blocker && !v.loose && !v.sure);
    const r = mk('rope', ['v3', 'v20', 'v10']); assert.ok(!r.tempo && !r.doubles && r.timeLeft === Infinity);
    const t = mk('tug', ['v6', 'v23', 'v13']); assert.ok(!t.holds && !t.tempo && !t.mud);
    const s = mk('sack', ['v6', 'v23', 'v13']); assert.ok(s.lengths === 1 && !s.logs && !s.mud && s.total === COURSE);
    const m = mk('marbles', ['v3', 'v20']); assert.ok(m.balls.length === 8 && !m.sides && m.shots === 4);
    const o = mk('oanquan', ['v3', 'v20']); assert.ok(o.quick && !o.board.young && o.maxTurns === O.QUICK_TURNS);
    for (const sim of [f, v, r, t, s, m, o]) { for (let i = 0; i < 60 * 240 && !sim.over; i++) { sim.step(DT, {}); sim.events.length = 0; } }
    for (const sim of [f, v, t, s, m, o]) assert.ok(sim.over, 'the kids finish their game');
  }
});

// ------------------------------------------------------------------------------------------------ foot-tennis
test('foot-tennis levels: Easy lets it bounce once, Difficult plays in the wind; to 5 / 6 / 7', () => {
  assert.deepEqual(FOOTNET_TARGET, { first: 3, easy: 5, normal: 6, hard: 7 });
  // Easy: a player who only ever kicks the second chance still keeps rallies going; on Normal the same player never touches it
  const late = sim => { const f = sim.flight; return YARD_GAME.footnet.bot(sim, f && f.bounced ? 0.12 : () => -1); };
  const e = run('footnet', 'easy', 3, { policy: late }), n = run('footnet', 'normal', 3, { policy: late });
  assert.ok(count(e.log, 'bounce') >= 5 && e.sim.touches >= 5, `bounces ${count(e.log, 'bounce')}, her kicks ${e.sim.touches}`);
  assert.ok(e.log.filter(x => x.type === 'bounce').every(x => x.v > 0), 'only on her side');
  assert.equal(count(n.log, 'bounce'), 0); assert.equal(n.sim.touches, 0);
  // a bounced shuttle bounces no second time: left alone it is the kids' point
  const idle = run('footnet', 'easy', 3, { policy: sim => YARD_GAME.footnet.bot(sim, () => -1) });
  assert.equal(idle.res.won, false); assert.ok(count(idle.log, 'bounce') >= 4);
  // Difficult: a wind with a direction and a strength, shown as arrows; it changes after every second point
  let gales = 0, gusts = 0, outs = { into: 0, straight: 0 }, wins = { into: 0, straight: 0 };
  for (let seed = 1; seed <= 24; seed++) {
    let pts = 0;
    const seen = new Set();
    // (her own kicks that went out: the flights that left her foot with the fault on them; her partner's slips are his)
    const hers = (set, tally2) => sim => { const f = sim.flight; if (f && !set.has(f)) { set.add(f); if (f.fault === 'out' && f.team === 0 && sim.human.kickT < 0.02) outs[tally2]++; } };
    const mark = hers(seen, 'into');
    const r = run('footnet', 'hard', seed, { hook: sim => { mark(sim); assert.ok(Math.abs(sim.wind) === 1 && (sim.gale === 1 || sim.gale === 2)); } });
    for (const x of r.log) {
      if (x.type === 'point') pts++;
      if (x.type === 'wind') { assert.equal(pts % 2, 0, 'the wind turns after every second point'); if (x.gale === 2) gales++; }
      if (x.type === 'gust') gusts++;
    }
    for (const f of seen) if (!f.fault) assert.ok(Math.abs(f.bu) <= COURT.W / 2 + 1e-9, 'a gust never blows a good shuttle out');
    assert.match(r.sim.windText(), /^Wind (◀|▶){1,2}$/);
    if (r.res.won) wins.into++;
    // the same match by a player who kicks straight, whatever the wind
    const s = run('footnet', 'hard', seed, { flags: { botWind: false }, hook: hers(new Set(), 'straight') });
    if (s.res.won) wins.straight++;
  }
  assert.ok(gales >= 5 && gusts >= 40, `strong winds ${gales}, gusts ${gusts}`);
  assert.equal(outs.into, 0, 'aimed into the wind, her kicks stay in');
  assert.ok(outs.straight >= 15 && wins.straight < wins.into, `kicking straight in a strong wind sails out (${outs.straight} outs, wins ${wins.straight} vs ${wins.into})`);
  assert.ok(WIND_DRIFT[2] > WIND_DRIFT[1] && WIND_DRIFT[1] > 0);
  // stars: [points for one star in a lost match, points the kids may have for the third]
  const stars = (level, a, b) => { const sim = make('footnet', level, 1); sim.score = [a, b]; return sim.result().stars; };
  assert.deepEqual([stars('easy', 5, 2), stars('easy', 5, 3), stars('easy', 2, 5), stars('easy', 1, 5)], [3, 2, 1, 0]);
  assert.deepEqual([stars('normal', 6, 2), stars('normal', 6, 3), stars('normal', 3, 6), stars('normal', 2, 6)], [3, 2, 1, 0]);
  assert.deepEqual([stars('hard', 7, 3), stars('hard', 7, 4), stars('hard', 5, 7), stars('hard', 4, 7)], [3, 2, 1, 0]);
  assert.deepEqual([stars('first', 3, 1), stars('first', 3, 2), stars('first', 1, 3), stars('first', 0, 3)], [3, 2, 1, 0], 'the first round as it was');
  assert.ok(FOOTNET_STARS.hard[0] > FOOTNET_STARS.normal[0]);
});

// ------------------------------------------------------------------------------------------------ keep it up
test('keep it up levels: on Normal a called pass counts double, on Difficult a call must be answered; 75 / 90 / 110 s', () => {
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => KEEPUP_LEVEL[l].time), [60, 75, 90, 110]);
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => KEEPUP_LEVEL[l].lives), [3, 3, 3, 2]);
  for (const level of ['first', 'easy']) assert.equal(count(run('keepup', level, 4).log, 'call'), 0, `${level}: nobody calls`);
  // Normal: kids call; she sends it to the caller and the count jumps by two
  const n = run('keepup', 'normal', 4);
  assert.ok(count(n.log, 'call') >= 6 && count(n.log, 'called', x => x.ok) >= 6, `calls ${count(n.log, 'call')}`);
  let c = 0;
  for (const x of n.log) {
    if (x.type === 'serve') c = 1; else if (x.type === 'kick') c++;
    else if (x.type === 'called') { assert.ok(x.ok); c++; assert.equal(x.n, c, 'a called pass counts double'); }
    else if (x.type === 'point') { assert.equal(x.rally, c); c = 0; }
  }
  assert.equal(n.sim.lives, 3);
  // a player who never answers loses nothing on Normal but the bonus
  const deaf = run('keepup', 'normal', 4, { flags: { botCalls: false } });
  assert.ok(count(deaf.log, 'called', x => !x.ok) >= 3 && count(deaf.log, 'called', x => x.reset) === 0);
  // Difficult: the wrong friend starts the count again, two kids change places after every second call, two lives
  const h = run('keepup', 'hard', 4), hd = run('keepup', 'hard', 4, { flags: { botCalls: false } });
  assert.ok(count(h.log, 'swap') >= 2 && count(h.log, 'swap') === Math.floor(h.sim.called / 2), `swaps ${count(h.log, 'swap')}, called ${h.sim.called}`);
  assert.ok(count(hd.log, 'called', x => x.reset) >= 3);
  assert.ok(hd.res.score < h.res.score, `not answering costs the streak (${hd.res.score} vs ${h.res.score})`);
  const never = run('keepup', 'hard', 4, { policy: sim => YARD_GAME.keepup.bot(sim, () => -1) });
  assert.equal(count(never.log, 'point', x => x.human), 2, 'two lives');
  assert.match(h.sim.hud().sub, /^[♥♡]{2} /);
  const A = tally('keepup', 'hard', 20), B = tally('keepup', 'hard', 20, { flags: { botCalls: false } });
  assert.ok(A.stars[3] >= 10 && B.stars[3] <= 3, `three stars on Difficult need the calls answered (${A.stars} vs ${B.stars})`);
  // with one kid or alone there is nobody to choose between: no calls, the level's clock and lives still hold
  for (const kids of [[], ['v3']]) { const s = run('keepup', 'hard', 4, { kids }); assert.equal(count(s.log, 'call'), 0); assert.equal(s.sim.maxLives, 2); }
  // stars per level
  for (const level of ROUND_LEVELS) {
    const S = KEEPUP_LEVEL[level].stars, sim = make('keepup', level, 1);
    for (const [best, want] of [[S[0] - 1, 0], [S[0], 1], [S[1], 2], [S[2], 3]]) { sim.best = best; assert.equal(sim.result().stars, want, `${level} ${best}`); }
  }
  assert.ok(KEEPUP_LEVEL.hard.stars[2] > KEEPUP_LEVEL.normal.stars[2]);
});

// ------------------------------------------------------------------------------------------------ volleyball
test('volleyball levels: Easy always spikes the third touch, Difficult has loose sets and a blocker; to 4 / 5 / 6', () => {
  assert.deepEqual(VOLLEY_TARGET, { first: 3, easy: 4, normal: 5, hard: 6 });
  // a player whose timing is only okay (never perfect): on Easy her third touch is a spike all the same, on Normal a lob
  const okay = (sim, G) => G.bot(sim, 0.36);
  const mine = level => { let n = 0; for (let seed = 1; seed <= 8; seed++) { const seen = new Set(); run('volley', level, seed, { policy: okay, hook: sim => { const f = sim.flight; if (f && !seen.has(f)) { seen.add(f); if (f.kind === 'spike' && f.team === 0 && sim.human.kickT < 0.05) n++; } } }); } return n; };
  assert.ok(mine('easy') >= 8, `Easy: okay timing spikes (${mine('easy')})`);
  assert.equal(mine('normal'), 0, 'Normal: only a well-timed third touch is a spike');
  // Difficult: a spike hit straight is blocked and comes down on her own side; aimed away it goes through
  let straight = 0, aimed = 0, back = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = run('volley', 'hard', seed, { flags: { botAim: false }, limit: 900 });
    straight += s.sim.blocks;
    const blocks = s.log.filter(x => x.type === 'block');
    for (const b of blocks) { assert.equal(b.who, s.sim.blocker.id); assert.ok(Math.abs(b.v) < 0.2, 'at the net'); }
    back += blocks.length;
    aimed += run('volley', 'hard', seed, { limit: 900 }).sim.blocks;
  }
  assert.ok(straight >= 20 && aimed <= straight / 4, `blocked: straight ${straight}, aimed away ${aimed}`);
  assert.ok(back === straight);
  const sim = make('volley', 'hard', 1);
  assert.ok(sim.blocker && Math.abs(sim.blocker.home.v) < 2.5 && sim.loose, 'the kid at the net blocks');
  assert.ok(!make('volley', 'normal', 1).blocker && !make('volley', 'hard', 1, ['v6']).blocker, 'no blocker on Normal, or with one kid');
  // loose sets: on Difficult the partner's set comes down further from where she stands
  const spread = level => {
    let s = 0, n = 0;
    for (let seed = 1; seed <= 10; seed++) { const seen = new Set(); run('volley', level, seed, { limit: 900, hook: q => { const f = q.flight; if (f && !seen.has(f)) { seen.add(f); if (f.kind === 'set' && q.receiver === q.human) { s += Math.abs(f.bu - q.human.u); n++; } } } }); }
    return s / n;
  };
  assert.ok(spread('hard') > spread('normal') * 1.5, `set spread ${spread('normal').toFixed(2)} -> ${spread('hard').toFixed(2)} m`);
  const stars = (level, a, b) => { const q = make('volley', level, 1); q.score = [a, b]; return q.result().stars; };
  assert.deepEqual([stars('easy', 4, 1), stars('easy', 4, 2), stars('easy', 2, 4), stars('easy', 1, 4)], [3, 2, 1, 0]);
  assert.deepEqual([stars('normal', 5, 1), stars('normal', 5, 2), stars('normal', 3, 5), stars('normal', 2, 5)], [3, 2, 1, 0]);
  assert.deepEqual([stars('hard', 6, 2), stars('hard', 6, 3), stars('hard', 4, 6), stars('hard', 3, 6)], [3, 2, 1, 0]);
  assert.ok(VOLLEY_STARS.first[0] === 1);
});

// ------------------------------------------------------------------------------------------------ rope jumping
test('rope levels: Normal calls a new pace a turn ahead, Difficult adds the double turn; 75 / 90 / 110 s', () => {
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => ROPE_LEVEL[l].time), [60, 75, 90, 110]);
  for (const level of ['first', 'easy']) { const r = run('rope', level, 2); assert.equal(count(r.log, 'tempo') + count(r.log, 'double'), 0, `${level}: no calls`); }
  // Normal: "Faster!" / "Slower!", then one more turn as before, then the new pace
  const periods = [];
  let last = null, t = 0, called = null;
  const n = run('rope', 'normal', 2, { hook: sim => { t += DT; for (const e of sim.events) { if (e.type === 'ground') { if (last !== null) periods.push({ T: t - last, called }); last = t; called = null; } if (e.type === 'tempo') called = e.kind; if (e.type === 'trip') last = null; } } });
  assert.ok(count(n.log, 'tempo') >= 5 && count(n.log, 'double') === 0);
  assert.equal(n.sim.trips, 0, 'a careful jumper keeps up with every change');
  let checked = 0;
  for (let i = 1; i + 1 < periods.length; i++) {
    // periods[i].called: the call came as this turn began. This turn is as the one before; the next one has the new pace
    if (!periods[i].called || periods[i - 1].called) continue;
    const kind = periods[i].called, was = periods[i - 1].T, before = periods[i].T, after = periods[i + 1].T;
    assert.ok(Math.abs(before - was) < 0.04, `one more turn as before (${was.toFixed(2)} -> ${before.toFixed(2)})`);
    assert.ok(kind === 'fast' ? after < before * 0.9 : after > before * 1.1, `${kind}: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
    checked++;
  }
  assert.ok(checked >= 4);
  assert.ok(PACE.fast < 1 && PACE.slow > 1);
  // Difficult: "Double!", a turn later two touches QUICK apart; one late jump clears both, an early one comes down on the second
  const h = run('rope', 'hard', 2), early = run('rope', 'hard', 2, { flags: { botDouble: false } });
  assert.ok(count(h.log, 'double') >= 3 && h.sim.doubled >= 3 && h.sim.trips === 0, `doubles ${h.sim.doubled}`);
  assert.ok(count(early.log, 'trip', x => x.double) >= 2, 'an early jump trips on the double');
  const [a, b] = clearWindow(JUMP.hard);
  assert.ok(b - a > QUICK + 0.1 && b - a < QUICK + 0.25, `one jump can clear both, with ${(b - a - QUICK).toFixed(2)} s to spare`);
  const A = tally('rope', 'hard', 12), B = tally('rope', 'hard', 12, { flags: { botDouble: false } });
  assert.ok(A.stars[3] === 12 && B.stars[3] === 0, `three stars on Difficult need the double (${A.stars} vs ${B.stars})`);
  for (const level of ROUND_LEVELS) {
    const S = ROPE_LEVEL[level].stars, sim = make('rope', level, 1);
    for (const [best, want] of [[S[0] - 1, 0], [S[0], 1], [S[1], 2], [S[2], 3]]) { sim.best = best; assert.equal(sim.result().stars, want, `${level} ${best}`); }
  }
});

// ------------------------------------------------------------------------------------------------ tug of war
test('tug levels: best of five; Normal has "Hold!" beats, Difficult changes tempo and is muddy', () => {
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => YARD_GAME.tug.target(l)), [2, 3, 3, 3]);
  for (const level of ['first', 'easy']) { const r = run('tug', level, 3); assert.equal(count(r.log, 'holdcall') + count(r.log, 'tempo'), 0); assert.equal(Math.max(...r.sim.score), TUG_LEVEL[level].target); }
  // Normal: a hold is called a beat ahead (the ring is red and does not close), nobody heaves on it, keeping still rests her
  const reds = [];
  const n = run('tug', 'normal', 3, { hook: sim => { if (sim.state === 'pull') reds.push(sim.holdNow === sim.marker.out); } });
  assert.ok(reds.length > 100 && reds.every(Boolean), 'the ring is red exactly while a hold is coming');
  assert.ok(count(n.log, 'holdcall') >= 3 && count(n.log, 'dug') >= 3 && n.sim.slips === 0);
  assert.equal(count(n.log, 'beat', x => x.hold), count(n.log, 'dug') + count(n.log, 'point', () => false) + (count(n.log, 'beat', x => x.hold) - count(n.log, 'dug')), 'every hold is a beat');
  let holding = false;
  for (const x of n.log) { if (x.type === 'beat') holding = !!x.hold; if (x.type === 'pull') assert.equal(holding, false, 'the kids do not heave on a hold'); }
  // pulling on a hold is a slip: the flag gives, and it tires her
  const s = make('tug', 'normal', 3);
  for (let i = 0; i < 4000 && !(s.state === 'pull' && s.holdNow && s.beatT < 0.05); i++) { s.step(DT, YARD_GAME.tug.bot(s, 0)); s.events.length = 0; }
  assert.ok(s.holdNow, 'a hold comes up');
  const pos = s.pos, tired = s.fatigue;
  s.step(DT, { kick: true });
  assert.ok(s.events.some(x => x.type === 'heave' && x.quality === 'slip') && s.pos < pos - 0.1 && s.fatigue > tired + 0.3 && s.slips === 1);
  const careless = tally('tug', 'normal', 16, { flags: { botHold: false } }), careful = tally('tug', 'normal', 16);
  assert.ok(careful.stars[3] > careless.stars[3], `holding matters (${careful.stars} vs ${careless.stars})`);
  // Difficult: the beat changes tempo in the middle of a pull, and an off-beat pull in the mud gives ground
  const h = run('tug', 'hard', 3);
  const tempos = h.log.filter(x => x.type === 'tempo');
  assert.ok(tempos.length >= 3 && tempos.every(x => TEMPOS.includes(x.beat)) && new Set(tempos.map(x => x.beat)).size >= 2, `tempo changes ${tempos.length}`);
  assert.ok(TEMPOS.includes(BEAT) && TEMPOS[0] < BEAT && TEMPOS[2] > BEAT);
  const off = level => { const q = make('tug', level, 3); for (let i = 0; i < 400 && q.state !== 'pull'; i++) q.step(DT, {}); q.beatT = q.beatLen / 2; q.holdNow = q.holdLast = false; const p0 = q.pos; q.press(q.human); return p0 - q.pos; };
  assert.ok(off('hard') > 0.05 && off('normal') === 0, 'mud: off the beat slips');
  // a player who counts 1.5 s instead of watching the ring is thrown by every change of tempo
  const counting = sim => { const out = { kick: false }; if (sim.state !== 'pull') { sim._c = null; return out; } sim._c ??= { n: -1, at: 0 }; const c = sim._c; if (sim.beatN !== c.n) { c.n = sim.beatN; c.at = sim.pullT + (sim.beatN === 0 ? sim.beatT : BEAT); c.done = false; } if (!c.done && sim.pullT >= c.at - DT) { c.done = true; out.kick = !sim.holdNow; } return out; };
  const C = tally('tug', 'hard', 16, { policy: counting }), W = tally('tug', 'hard', 16);
  assert.ok(W.stars[3] >= 12 && C.stars[3] <= W.stars[3] - 6, `Difficult: watch the ring, do not count (${W.stars} vs ${C.stars})`);
  // stars on the best of five
  const stars = (level, a, b, slips = 0, heaves = 0) => { const q = make('tug', level, 1); q.slips = slips; q.heaves = heaves; return q.stars(a > b, a, b); };
  assert.deepEqual([stars('easy', 3, 1), stars('easy', 3, 2), stars('easy', 1, 3), stars('easy', 0, 3), stars('easy', 0, 3, 0, 8)], [3, 2, 1, 0, 1]);
  assert.deepEqual([stars('normal', 3, 1), stars('normal', 3, 2), stars('normal', 1, 3), stars('normal', 0, 3, 0, 20)], [3, 2, 1, 0]);
  assert.deepEqual([stars('hard', 3, 1, 2), stars('hard', 3, 1, 3), stars('hard', 3, 2), stars('hard', 2, 3), stars('hard', 1, 3)], [3, 2, 2, 1, 0]);
});

// ------------------------------------------------------------------------------------------------ ô ăn quan
test('ô ăn quan levels: Easy is twelve turns whatever is captured, Normal has the young quan, Difficult no hints and a deeper kid', () => {
  // the young-quan rule: a quan with fewer than five dân beside it cannot be captured (the turn just ends)
  const pos = young => { const b = O.newBoard(); b.dan.fill(0); b.dan[3] = 1; b.dan[9] = 3; b.young = young; return b; };
  const plain = O.play(pos(false), 0, 3, -1);
  assert.deepEqual(plain.got, { dan: 0, quan: 1 }, 'the plain rule: the quan is taken');
  const young = O.play(pos(true), 0, 3, -1);
  assert.deepEqual(young.got, { dan: 0, quan: 0 }); assert.equal(young.board.quan[0], 1);
  assert.ok(young.steps.some(s => s.t === 'young' && s.sq === 0));
  const fed = pos(true); fed.dan[0] = O.YOUNG_DAN;
  assert.deepEqual(O.play(fed, 0, 3, -1).got, { dan: 5, quan: 1 }, 'fed with five dân it can be won');
  assert.ok(O.cloneBoard(fed).young && !O.cloneBoard(O.newBoard()).young, 'the rule travels with the board (the kid\'s search sees it)');
  const L = O.OAN_LEVEL;
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => [L[l].turns, !!L[l].young, L[l].depth, !!L[l].noHint]), [[24, false, 1, false], [12, false, 1, false], [18, true, 2, false], [24, true, 3, true]]);
  // Easy: exactly twelve turns, even after both quan are gone; the first round is still the quick game
  for (let seed = 1; seed <= 6; seed++) {
    const e = run('oanquan', 'easy', seed, { limit: 900 });
    assert.equal(e.sim.board.turns, 12, 'twelve turns');
    const f = run('oanquan', 'first', seed, { limit: 900 });
    assert.ok(O.quanLeft(f.sim.board) < 2 || f.sim.board.turns === O.QUICK_TURNS, 'the quick game ends at the first quan');
    // Normal and Difficult: both quan, or the turns
    for (const level of ['normal', 'hard']) {
      const r = run('oanquan', level, seed, { limit: 1500 });
      assert.ok(r.res, `${level}: ends`);
      assert.ok(O.quanLeft(r.sim.board) === 0 || r.sim.board.turns === L[level].turns || !O.legalMoves(O.refill(r.sim.board, r.sim.mover).board, r.sim.mover).length);
      assert.equal(O.totalValue(r.sim.board), 70, 'no pebble is lost');
      assert.ok(r.sim.board.young);
    }
  }
  // with the young quan a game is no longer over in two or three turns
  let turns = 0;
  for (let seed = 1; seed <= 10; seed++) turns += run('oanquan', 'normal', seed, { limit: 1500 }).sim.board.turns;
  assert.ok(turns / 10 >= 9, `Normal lasts (${turns / 10} turns)`);
  // Difficult: the hint is refused, the kid never looks further than three moves (and the level's cap holds below)
  const h = make('oanquan', 'hard', 1), n = make('oanquan', 'normal', 1);
  for (const sim of [h, n]) { for (let i = 0; i < 200 && sim.state !== 'think'; i++) sim.step(DT, {}); sim.step(DT, { hint: true }); }
  assert.equal(h.hintOn, false); assert.equal(n.hintOn, true); assert.ok(h.noHint && !n.noHint);
  assert.deepEqual([L.easy.cap, L.normal.cap, L.hard.cap], [1, 2, 3]);
  // stars: win by enough for three, a win is two, a near loss one (Easy: also twenty points)
  const stars = (level, a, b) => { const sim = make('oanquan', level, 1); sim.final = [a, b]; return sim.result().stars; };
  assert.deepEqual([stars('easy', 40, 30), stars('easy', 36, 34), stars('easy', 30, 40), stars('easy', 20, 50), stars('easy', 19, 51)], [3, 2, 1, 1, 0]);
  assert.deepEqual([stars('normal', 41, 29), stars('normal', 36, 34), stars('normal', 31, 39), stars('normal', 30, 40)], [3, 2, 1, 0]);
  assert.deepEqual([stars('hard', 39, 31), stars('hard', 36, 34), stars('hard', 33, 37), stars('hard', 32, 38)], [3, 2, 1, 0]);
});

// ------------------------------------------------------------------------------------------------ the sack race
test('sack race levels: there and back, three lengths with logs, four with logs and mud against sure-footed rivals', () => {
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => SACK_LEVEL[l].lengths), [1, 2, 3, 4]);
  for (const level of ROUND_LEVELS) {
    const K = SACK_LEVEL[level], r = run('sack', level, 6);
    assert.equal(r.sim.total, K.lengths * COURSE);
    assert.equal(r.sim.human.d, r.sim.total); assert.ok(r.res.finished);
    // she turns at each banner but the last, and faces home on the even lengths
    assert.equal(count(r.log, 'turn', x => x.human), K.lengths - 1);
    assert.equal(r.sim.human.back, K.lengths % 2 === 0);
    assert.ok(Math.abs(Math.abs(r.sim.human.v) - COURSE / 2) < 1e-9, 'the finish is at a banner');
    assert.equal(!!r.sim.logs, !!K.logs); assert.equal(!!r.sim.mud, !!K.mud);
    // a careful racer leaps every log (two a length) and never stumbles
    assert.equal(r.res.leaps, K.logs ? 2 * K.lengths : 0, `${level}: leaps`);
    assert.equal(r.res.stumbles, 0);
    // the score is a time: (par - seconds) x 10, read back per level
    assert.ok(Math.abs(bestSeconds(r.res.score, r.res.par) - r.res.time) < 0.051);
    assert.ok(r.res.time < K.limit / 2, `${level}: ${r.res.time.toFixed(1)} s`);
  }
  // the logs lie apart from the banners and from each other; a leap carries over one
  assert.ok(LOGS_V.every(v => Math.abs(v) < COURSE / 2 - 2) && Math.abs(LOGS_V[0] - LOGS_V[1]) > 4 && LEAP > 0.7);
  assert.ok(MUD_V[0] > LOGS_V[1] + 1 && MUD_V[1] < LOGS_V[0] - 1, 'the mud lies between the logs');
  // a hop into a log is a stumble (a short tumble: she is over it, but it costs her); nobody who ignores the logs wins
  const noLeap = run('sack', 'normal', 6, { flags: { botLeap: false } });
  assert.equal(noLeap.res.stumbles, 6); assert.equal(count(noLeap.log, 'fall', x => x.human && x.why === 'log'), 6);
  assert.ok(noLeap.res.finished && noLeap.res.time > run('sack', 'normal', 6).res.time + 5);
  const A = tally('sack', 'normal', 16), B = tally('sack', 'normal', 16, { flags: { botLeap: false } });
  assert.ok(A.stars[3] >= 14 && B.stars[3] === 0, `Normal: three stars need the logs leapt (${A.stars} vs ${B.stars})`);
  // a leap over nothing is a short clumsy one that costs rhythm; on Easy the Jump button is just a hop
  const leap = level => { const q = make('sack', level, 1); for (let i = 0; i < 300 && q.state !== 'race'; i++) q.step(DT, {}); const h = q.human; for (let k = 0; k < 4; k++) { q.step(DT, { kick: true }); for (let i = 0; i < 29; i++) q.step(DT, {}); } const r0 = h.rhythm, d0 = h.d; q.step(DT, { jump: true }); return { dr: h.rhythm - r0, dd: h.d - d0 }; };
  assert.ok(leap('normal').dr < -0.1 && leap('normal').dd < 0.5, 'a wasted leap');
  assert.ok(leap('easy').dr > 0 && leap('easy').dd > 0.5, 'no logs: Jump hops');
  // Difficult: in the mud the steady beat is slower; the rivals never fall over (but may still meet a log)
  const hard = run('sack', 'hard', 6), quick = run('sack', 'hard', 6, { flags: { botMud: false } });
  assert.ok(quick.res.time > hard.res.time + 1, `hopping at the old pace in the mud is slower (${quick.res.time.toFixed(1)} vs ${hard.res.time.toFixed(1)})`);
  let falls = 0, normalFalls = 0;
  for (let seed = 1; seed <= 10; seed++) {
    falls += count(run('sack', 'hard', seed).log, 'fall', x => !x.human && x.why !== 'log');
    normalFalls += count(run('sack', 'normal', seed).log, 'fall', x => !x.human && x.why !== 'log');
  }
  assert.equal(falls, 0); assert.ok(normalFalls > 3, 'on Normal the kids still tumble');
  const H = tally('sack', 'hard', 16), M = tally('sack', 'hard', 16, { flags: { botMud: false } });
  assert.ok(H.stars[3] >= 14 && M.stars[3] <= 4, `Difficult: three stars need the mud's own beat (${H.stars} vs ${M.stars})`);
  // alone, the stars are times per level
  for (const level of ROUND_LEVELS) {
    const K = SACK_LEVEL[level], solo = run('sack', level, 6, { kids: [] });
    assert.equal(solo.res.stars, 3, `${level}: a steady solo run (${solo.res.time.toFixed(1)} s, three stars to ${K.solo[0]})`);
    for (const [time, want] of [[K.solo[0], 3], [K.solo[0] + 0.01, 2], [K.solo[1], 2], [K.solo[1] + 0.01, 1], [K.limit, 1]]) {
      const q = make('sack', level, 1, []); Object.assign(q.human, { d: q.total, finish: time, place: 1 });
      assert.equal(q.result().stars, want, `${level} solo ${time}`);
    }
  }
  // the card: lengths, and the level's own best time
  const res = { ...run('sack', 'normal', 6).res, level: 'normal' };
  const card = YARD_GAME.sack.card(res, { plays: 3, best: 400, levels: { normal: { best: 290, stars: 2, plays: 2 } } }, {}, false);
  assert.match(card.score, /^\d+\.\d s for 3 lengths of the green$/); assert.equal(card.best, 'Best: 41.0 s');
});

// ------------------------------------------------------------------------------------------------ marbles
test('marbles levels: more shots, the tor worth two on Normal, colours on Difficult', () => {
  assert.deepEqual(['first', 'easy', 'normal', 'hard'].map(l => [MARBLES_LEVEL[l].shots, MARBLES_LEVEL[l].win]), [[4, 4], [5, 5], [6, 6], [6, 5]]);
  assert.equal(marbleSetup(3).length, 8);
  // the tor sits in the middle of the flower, bigger and heavier; nothing overlaps
  const m = marbleSetup(3, { tor: true }), tor = m.find(b => b.tor);
  assert.equal(m.length, 9); assert.ok(tor && tor.u === 0 && tor.v === 0 && tor.r === R_TOR && tor.m > 2);
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) assert.ok(Math.hypot(m[i].u - m[j].u, m[i].v - m[j].v) >= m[i].r + m[j].r - 1e-9, `${i}/${j} apart`);
  for (const b of m) assert.ok(Math.hypot(b.u, b.v) < RING * 0.6);
  // colours: four red (hers), four blue (the kid's), the tor nobody's
  const c = marbleSetup(3, { tor: true, sides: true });
  assert.deepEqual([c.filter(b => b.side === 0).length, c.filter(b => b.side === 1).length, c.filter(b => b.tor && b.side === undefined).length], [4, 4, 1]);
  assert.ok(c.every(b => b.tor || b.c === b.side));
  // Normal: the tor out is two points for whoever shot
  const n = make('marbles', 'normal', 2);
  const t = n.balls.find(b => b.tor); t.u = RING + 0.3;
  n.settle();
  assert.deepEqual(n.score, [2, 0]); assert.ok(n.events.some(e => e.type === 'out' && e.tor && e.human));
  // Difficult: a marble out goes to its colour, whoever shot; knocking out a blue one is a gift to the kid
  const h = make('marbles', 'hard', 2);
  assert.equal(h.turn, 0, 'Mika shoots first');
  const red = h.balls.find(b => b.side === 0), blue = h.balls.find(b => b.side === 1);
  red.u = RING + 0.3; blue.u = -(RING + 0.3);
  h.settle();
  assert.deepEqual(h.score, [1, 1]); assert.equal(h.gifts, 1);
  assert.ok(h.events.some(e => e.type === 'out' && e.gift && !e.human) && h.events.some(e => e.type === 'out' && !e.gift && e.human));
  assert.equal(h.events.find(e => e.type === 'shotdone').got, 1, 'only her own count as her shot\'s catch');
  // the kid aims at their own colour (or the tor)
  for (let seed = 1; seed <= 12; seed++) {
    const q = make('marbles', 'hard', seed); q.turn = 1; q.start();
    const aim = q.plan.aim, at = q.balls.reduce((a, b) => (Math.hypot(b.u - aim.u, b.v - aim.v) < Math.hypot(a.u - aim.u, a.v - aim.v) ? b : a));
    assert.ok(at.tor || at.side === 1, 'the kid goes for blue');
  }
  // a careful player who minds the colours earns three stars more often than one who shoots at whatever is nearest the rim
  const A = tally('marbles', 'hard', 30), B = tally('marbles', 'hard', 30, { flags: { botSides: false } });
  assert.ok(A.stars[3] > B.stars[3] + 5 && A.won > B.won, `colours matter (${A.stars} vs ${B.stars})`);
  // stars
  const stars = (level, a, b, gifts = 0) => { const q = make('marbles', level, 1); q.players[0].won = a; q.players[1].won = b; q.gifts = gifts; return q.result().stars; };
  assert.deepEqual([stars('easy', 5, 3), stars('easy', 4, 3), stars('easy', 2, 5), stars('easy', 1, 5)], [3, 2, 1, 0]);
  assert.deepEqual([stars('normal', 6, 3), stars('normal', 5, 4), stars('normal', 3, 6), stars('normal', 2, 6)], [3, 2, 1, 0]);
  assert.deepEqual([stars('hard', 5, 2), stars('hard', 5, 3, 2), stars('hard', 4, 3), stars('hard', 3, 5), stars('hard', 2, 5)], [3, 2, 2, 1, 0]);
  // the shots are counted per level on the HUD
  assert.match(make('marbles', 'normal', 1).hud({ mine: 'Mika', theirs: 'Kenta' }).sub, /of 6$/);
});
