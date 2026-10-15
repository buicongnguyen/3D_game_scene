// Festival dance (src/game/tricks/rules-dance.js, dance.js): the pure rules — seeded sequences, timing windows, the
// mirror calls, scoring and the chorus combo, the round lengths, and the stars the scripted dancers earn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, MODES, BASIC, EXTRA, FINISH, DANCE_LEVELS, POINTS, CLEAN, ROUND_LENGTH, mirror, judge, planRound, makeLine, rng, tripled, comboBonus,
  bestScore, DanceRound, playBot, slotsOf, clipSpeed, clipLead } from '../src/game/tricks/rules-dance.js';
import { TRICK, starsFor, cleanTricks, recordRound } from '../src/content/tricks.js';
import { levelSpec } from '../src/content/levels.js';
import { DIALOGUE, CAST } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';

const LEVELS = ['easy', 'normal', 'hard'];

test('two dances of seven moves each: four on the arrows, three more keys; words and clips for every move', () => {
  for (const mode of MODES) {
    const ids = slotsOf(mode);
    assert.equal(ids.length, 7, mode);
    assert.deepEqual(ids.slice(0, 4), BASIC, `${mode}: the arrows come first`);
    assert.deepEqual(ids.map(id => MOVES[mode][id].slot), [0, 1, 2, 3, 4, 5, 6]);
    for (const id of ids) for (const k of ['word', 'short', 'icon', 'clip']) assert.ok(MOVES[mode][id][k], `${mode}.${id}.${k}`);
    for (const id of [...EXTRA[mode], FINISH[mode]]) assert.ok(MOVES[mode][id], `${mode}: ${id}`);
    assert.ok(MOVES[mode][FINISH[mode]].finish);
    // facing the camera, a step to the screen's left is the dancer's own right
    assert.match(MOVES[mode].left.clip, /R$/); assert.match(MOVES[mode].right.clip, /L$/);
  }
});

test('mirror: her left is your right; moves with no side stay what they are', () => {
  assert.equal(mirror('left'), 'right');
  assert.equal(mirror('right'), 'left');
  for (const m of ['up', 'down', 'hands', 'tilt', 'bow', 'point', 'wave', 'heart']) assert.equal(mirror(m), m);
  assert.equal(mirror(mirror('left')), 'left');
});

test('timing windows: perfect, good, miss — wider on Easy, tighter on Difficult', () => {
  assert.equal(judge(10, 10), 'perfect');
  assert.equal(judge(10.17, 10, 'normal'), 'perfect');
  assert.equal(judge(9.82, 10, 'normal'), 'perfect');
  assert.equal(judge(10.3, 10, 'normal'), 'good');
  assert.equal(judge(9.66, 10, 'normal'), 'good');
  assert.equal(judge(10.4, 10, 'normal'), 'miss');
  assert.equal(judge(10.19, 10, 'easy'), 'perfect');
  assert.equal(judge(10.37, 10, 'easy'), 'good');
  assert.equal(judge(10.17, 10, 'hard'), 'good');
  assert.equal(judge(10.32, 10, 'hard'), 'miss');
  for (const l of LEVELS) { const w = DANCE_LEVELS[l].win; assert.ok(w.perfect >= 0.15 && w.good >= 0.3 && w.good < 60 / DANCE_LEVELS[l].bpm, l); }
});

test('sequences are seeded: the same seed dances the same, another seed differs', () => {
  for (const level of LEVELS) for (const mode of MODES) {
    const a = planRound({ level, mode, seed: 42 }), b = planRound({ level, mode, seed: 42 }), c = planRound({ level, mode, seed: 43 });
    assert.deepEqual(a.lines.map(l => l.moves), b.lines.map(l => l.moves), `${level} ${mode}`);
    assert.notDeepEqual(a.lines.map(l => l.moves), c.lines.map(l => l.moves), `${level} ${mode}`);
  }
  // a line: never one move three times running, at least two different moves
  const r = rng(9);
  for (let i = 0; i < 300; i++) {
    const line = makeLine(r, 4 + (i % 4), ['left', 'right', 'up', 'down']);
    assert.ok(new Set(line).size >= 2);
    for (let k = 2; k < line.length; k++) assert.ok(!tripled(line[k], line[k - 1], line[k - 2]), line.join(','));
  }
});

test('the levels: Easy four basic moves a line, slow; Normal longer lines, quicker, the new moves; Difficult along, mirrored, a chorus', () => {
  for (const mode of MODES) for (let seed = 1; seed <= 20; seed++) {
    const e = planRound({ level: 'easy', mode, seed }), n = planRound({ level: 'normal', mode, seed }), h = planRound({ level: 'hard', mode, seed });
    assert.ok(e.bpm < n.bpm && n.bpm <= h.bpm);
    assert.ok(e.lines.every(l => l.moves.length === 4 && l.moves.every(m => BASIC.includes(m))), 'Easy: four basic moves');
    assert.ok(n.lines.every(l => l.moves.length >= 5 && l.moves.length <= 6), 'Normal: five or six moves');
    const used = new Set(n.lines.flatMap(l => l.moves));
    for (const m of [...EXTRA[mode], FINISH[mode]]) assert.ok(used.has(m), `Normal ${mode} seed ${seed} teaches ${m}`);
    for (const l of n.lines) if (l.finish) assert.equal(l.moves.at(-1), FINISH[mode], 'the bow ends its line');
    assert.equal(e.style, 'watch'); assert.equal(n.style, 'watch'); assert.equal(h.style, 'along');
    assert.equal(e.card, 'always'); assert.equal(n.card, 'demo');
    // Difficult: mirror lines call at least two sides in her own words, and the player goes the other way
    const mirrored = h.targets.filter(t => t.mirror);
    assert.ok(mirrored.length >= 8, `seed ${seed}: ${mirrored.length} mirror calls`);
    for (const t of mirrored) { assert.equal(t.call.kind, 'her'); assert.equal(t.move, mirror(t.call.said)); assert.notEqual(t.move, t.call.said); }
    assert.equal(h.targets.filter(t => t.chorus).length, DANCE_LEVELS.hard.chorus);
    // the teacher shows every Easy / Normal line before it is copied, a whole line earlier
    for (const p of [e, n]) for (const l of p.lines) assert.ok(l.demoAt + 2 * l.moves.length <= l.copyAt);
    // every beat of a move sits on the grid, two beats apart, in order
    for (const p of [e, n, h]) for (let i = 1; i < p.targets.length; i++) assert.ok(p.targets[i].beat - p.targets[i - 1].beat >= 2);
  }
  // the guided first go: Easy with the simplest lines first
  const f = planRound({ level: 'hard', mode: 'festival', seed: 3, first: true });
  assert.equal(f.level, 'easy');
  assert.deepEqual(f.lines[0].moves, ['left', 'right', 'left', 'right']);
});

test('round lengths: within 15% of 70, 100 and 130 seconds; the trick row says the same', () => {
  for (const level of LEVELS) for (const mode of MODES) {
    const p = planRound({ level, mode, seed: 7 });
    const want = ROUND_LENGTH[level];
    assert.ok(Math.abs(p.length - want) <= want * 0.15, `${level} ${mode}: ${p.length.toFixed(1)} s`);
    assert.ok(Math.abs(levelSpec(TRICK.dance, level).length - p.length) < 2, `${level}: the row's length ${levelSpec(TRICK.dance, level).length}`);
  }
});

test('scoring: perfect 10, good 6, a wrong move or a miss 0; a clean line +10; presses off the grid do nothing', () => {
  const r = new DanceRound({ level: 'easy', mode: 'festival', seed: 11 });
  const T = r.plan.targets, line0 = T.filter(t => t.line === 0);
  assert.equal(r.press('left', 0.1).type, 'stray');
  // line 0: perfect, good, perfect, perfect -> 10 + 6 + 10 + 10 + a clean line
  const offs = [0, 0.3, -0.05, 0.1];
  let ev;
  line0.forEach((t, k) => { r.update(t.t + offs[k]); ev = r.press(t.move, t.t + offs[k]); });
  assert.equal(r.grades.slice(0, 4).join(','), 'perfect,good,perfect,perfect');
  assert.deepEqual(ev.after, [{ type: 'clean', line: 0, points: CLEAN }]);
  assert.equal(r.score, 10 + 6 + 10 + 10 + CLEAN);
  // line 1: a wrong move, then nothing pressed (missed as the clock passes): no clean bonus
  const line1 = T.filter(t => t.line === 1);
  const wrongMove = BASIC.find(m => m !== line1[0].move);
  assert.equal(r.press(wrongMove, line1[0].t).type, 'wrong');
  const evs = r.update(line1.at(-1).t + 1);
  assert.equal(evs.filter(e => e.type === 'miss').length, line1.length - 1);
  assert.equal(r.score, 46);
  assert.equal(r.count.clean, 1);
  // pressing the same beat twice judges it once
  const t2 = T.find(t => t.line === 2);
  r.update(t2.t); r.press(t2.move, t2.t);
  assert.equal(r.press(t2.move, t2.t + 0.01).type, 'stray');
  assert.deepEqual(POINTS, { perfect: 10, good: 6, wrong: 0, miss: 0 });
});

test('the free-style chorus: any move on the beat; a combo never repeats one move three times; its bonus', () => {
  assert.equal(comboBonus(2), 0);
  assert.equal(comboBonus(3), 12);
  assert.equal(comboBonus(8), 32);
  const r = new DanceRound({ level: 'hard', mode: 'kpop', seed: 5 });
  const C = r.plan.targets.filter(t => t.chorus);
  r.update(C[0].t - 1);
  const seq = ['left', 'left', 'left', 'up', 'heart', 'spin', 'wave', 'point'];      // the third left breaks the combo
  let last = null;
  C.forEach((t, k) => { r.update(t.t); last = r.press(seq[k] === 'spin' ? 'down' : seq[k], t.t); });
  assert.ok(C.every(t => r.grades[t.i] === 'perfect'), 'every chorus move counts, a repeat too');
  assert.equal(r.bestRun, 5);
  assert.ok(last.after.some(e => e.type === 'combo' && e.run === 5 && e.points === 20));
});

test('the scripted dancers: perfect earns three stars on every level, a sloppy one still one star on Easy', () => {
  for (const level of LEVELS) for (const mode of MODES) {
    const stars = levelSpec(TRICK.dance, level).stars;
    for (let seed = 1; seed <= 12; seed++) {
      const best = playBot({ level, mode, seed });
      assert.equal(best.score, bestScore(planRound({ level, mode, seed })), `${level} ${mode} ${seed}`);
      assert.equal(starsFor(best.score, stars), 3, `${level} ${mode}: perfect`);
      const sloppy = playBot({ level, mode, seed }, { jitter: 0.45, wrong: 0.25, skip: 0.25, rand: rng(seed * 31 + 7) });
      if (level === 'easy') assert.ok(starsFor(sloppy.score, stars) >= 1, `easy ${mode} ${seed}: sloppy ${sloppy.score}`);
      assert.ok(starsFor(sloppy.score, stars) <= 1, `${level} ${mode} ${seed}: sloppy is not more than one star (${sloppy.score})`);
      const none = playBot({ level, mode, seed }, { skip: 1 });
      assert.equal(none.score, 0);
    }
  }
});

test('clip timing from the art contract: 90 BPM clips sped to the tempo, accents half a beat in', () => {
  assert.equal(clipSpeed(90), 1);
  assert.ok(Math.abs(clipLead(90) - 1 / 3) < 1e-9);
  for (const l of LEVELS) { const bpm = DANCE_LEVELS[l].bpm; assert.ok(Math.abs(clipLead(bpm) - 30 / bpm) < 1e-9, 'half a beat'); }
});

test('the trick row, the teacher and the intro in both stories', () => {
  const t = TRICK.dance;
  assert.ok(t);
  assert.deepEqual(t.teacher, { grandma: 'hoa', classic: 'hoa' });
  for (const story of ['classic', 'grandma']) {
    useStory(story);
    for (const id of ['hoa', 'nabi', 'byeol', 'haru']) assert.ok(CAST[id]?.name && CAST[id].color && CAST[id].pitch, `${story}: ${id}`);
    assert.ok(DIALOGUE.trick_dance_intro.some(l => l[0] === 'hoa') && DIALOGUE.trick_dance_intro.some(l => l[0] === 'mika'));
  }
  useStory('classic');
});

test('the saved record keeps the dance chosen and each performer\'s look, and drops anything else', () => {
  const s = cleanTricks({ dance: { learned: true, best: 50, stars: 1, plays: 2, mode: 'kpop', looks: { nabi: 'street', haru: 'smart', hoa: 7, zz: 'x', byeol: 'nope' } } });
  assert.equal(s.dance.mode, 'kpop');
  assert.deepEqual(s.dance.looks, { nabi: 'street', haru: 'smart' }, 'only real performers, only looks they have');
  assert.equal(cleanTricks({ dance: { mode: 'disco', looks: [] } }).dance.mode, undefined);
  assert.equal(cleanTricks({ dance: { looks: { nabi: 3 } } }).dance.looks, undefined);
  // and a round played keeps them (the framework folds the round into the record it has)
  const r = recordRound({ learned: true, best: 0, stars: 0, plays: 0, mode: 'festival', looks: { hoa: 'aodai2' } }, TRICK.dance, 120, 'easy');
  assert.deepEqual(cleanTricks({ dance: { ...r.rec } }).dance.looks, { hoa: 'aodai2' });
});
