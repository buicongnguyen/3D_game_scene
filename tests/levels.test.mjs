// Levels of the mini games (src/content/levels.js): Easy is always open, Normal opens with one star on Easy, Difficult
// with two on Normal; records from before the levels keep what they earned; a round is folded into its own level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, unlocked, defaultLevel, levelSpec, recordLevel, cleanLevels, levelStars, levelBest, nextLevel } from '../src/content/levels.js';
import { TRICKS, recordRound, cleanTricks } from '../src/content/tricks.js';
import { recordYard, cleanYard } from '../src/content/yard.js';

test('a new player has Easy only, and the levels open in order', () => {
  assert.deepEqual(LEVELS.map(l => unlocked(null, l)), [true, false, false]);
  let rec = { plays: 1, levels: { easy: { best: 3, stars: 0, plays: 1 } } };
  assert.equal(unlocked(rec, 'normal'), false);
  rec = { plays: 2, levels: { easy: { best: 9, stars: 1, plays: 2 } } };
  assert.equal(unlocked(rec, 'normal'), true);
  assert.equal(unlocked(rec, 'hard'), false);
  rec.levels.normal = { best: 12, stars: 1, plays: 1 };
  assert.equal(unlocked(rec, 'hard'), false);
  rec.levels.normal.stars = 2;
  assert.equal(unlocked(rec, 'hard'), true);
  assert.equal(nextLevel('easy'), 'normal');
  assert.equal(nextLevel('hard'), null);
});

test('a record from before the levels keeps what it earned, as Normal play', () => {
  const old = { learned: true, best: 14, stars: 2, plays: 5 };
  assert.equal(unlocked(old, 'normal'), true);
  assert.equal(unlocked(old, 'hard'), true);
  assert.equal(levelStars(old, 'normal'), 2);
  assert.equal(levelBest(old, 'normal'), 14);
  assert.equal(levelStars(old, 'easy'), 0);
  const L = recordLevel(old, 'easy', 6, 1);
  assert.deepEqual(L.levels.normal, { best: 14, stars: 2, plays: 5 });
  assert.deepEqual(L.levels.easy, { best: 6, stars: 1, plays: 1 });
  assert.equal(unlocked({ ...old, levels: L.levels }, 'hard'), true);
  assert.equal(unlocked({ learned: true, best: 2, stars: 0, plays: 1 }, 'normal'), false);
});

test('the picker offers the level played last, never a locked one', () => {
  assert.equal(defaultLevel(null, false), 'easy');
  assert.equal(defaultLevel(null, true), 'easy');
  const rec = { plays: 3, level: 'hard', levels: { easy: { best: 9, stars: 1, plays: 3 } } };
  assert.equal(defaultLevel(rec, false), 'normal');
  assert.equal(defaultLevel({ ...rec, level: 'easy' }, false), 'easy');
});

test('a round is folded into its own level, and says which level it opened', () => {
  const t = TRICKS.find(x => x.id === 'firefly');
  const s = levelSpec(t, 'easy').stars;
  let r = recordRound(null, t, s[0], 'easy');
  assert.equal(r.stars, 1);
  assert.equal(r.opened, 'normal');
  assert.equal(r.rec.level, 'normal');
  assert.equal(r.newBest, true);
  r = recordRound(r.rec, t, s[0] - 1, 'easy');
  assert.equal(r.opened, null);
  assert.equal(r.newBest, false);
  assert.equal(r.rec.levels.easy.plays, 2);
  const n = levelSpec(t, 'normal').stars;
  r = recordRound(r.rec, t, n[1], 'normal');
  assert.equal(r.opened, 'hard');
  assert.equal(r.rec.stars, 2);
  assert.equal(r.rec.plays, 3);
  const kept = cleanTricks({ firefly: r.rec }).firefly;
  assert.deepEqual(kept.levels, r.rec.levels);
  assert.equal(kept.level, 'hard');
});

test('every trick has numbers for every level: rising stars, a round at least as long as the one before', () => {
  for (const t of TRICKS) {
    let last = 0;
    for (const l of LEVELS) {
      const s = levelSpec(t, l);
      assert.equal(s.stars.length, 3, `${t.id} ${l}`);
      assert.ok(s.stars[0] > 0 && s.stars[0] < s.stars[1] && s.stars[1] < s.stars[2], `${t.id} ${l}: stars ${s.stars}`);
      assert.ok(s.length >= last, `${t.id} ${l}: ${s.length} s is shorter than the level before`);
      last = s.length;
    }
  }
});

test('playground games: the gentle first round counts as Easy; levels survive the save', () => {
  let r = recordYard(null, { score: 3, stars: 1, won: true }, 'first');
  assert.equal(r.opened, 'normal');
  assert.deepEqual(r.rec.levels.easy, { best: 3, stars: 1, plays: 1 });
  r = recordYard(r.rec, { score: 5, stars: 2 }, 'normal');
  assert.equal(r.opened, 'hard');
  assert.equal(r.rec.plays, 2);
  const kept = cleanYard({ footnet: r.rec }).footnet;
  assert.deepEqual(kept.levels, r.rec.levels);
  assert.equal(cleanLevels({ easy: { best: -4, stars: 9, plays: 1.7 }, odd: {} }).easy.stars, 3);
});
