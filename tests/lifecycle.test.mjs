// From egg to wings (src/game/tricks/rules-lifecycle.js): the animals and their stages, the seeded puzzles (every one has
// exactly one right answer, checked here against the life data and not against the puzzle's own answer field), rounds
// that never repeat a puzzle, the kinds each level promises, the scoring against the star thresholds, and the pictures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMALS, ANIMAL, STAGE, HOMES, HOME_NAME, LEVEL, TYPES, PROMPT, cardsOf, adultOf, makeRound, check, solve, explain, pointsFor, POINTS, MAX_MISSES, quickBonus, maxScore, rng } from '../src/game/tricks/rules-lifecycle.js';
import { artOf, cardSvg, creatureOf, ART_IDS, HOME_ART_IDS } from '../src/game/tricks/lifecycle-art.js';
import { fitCards } from '../src/game/tricks/lifecycle.js';
import { TRICK } from '../src/content/tricks.js';
import { levelSpec, LEVELS } from '../src/content/levels.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const ROLE_OF_TYPE = { mixed: 'order', young: 'baby' };

/** Is this row of cards one life in its order? (the same animal throughout, every card later than the one before) */
const isLife = row => row.every(Boolean) && row.every(c => STAGE[c].animal === STAGE[row[0]].animal) && row.every((c, i) => !i || STAGE[c].index > STAGE[row[i - 1]].index);
/** Every way to lay k of the cards in a row. */
function* arrangements(cards, k, head = []) {
  if (head.length === k) { yield head; return; }
  for (const c of cards) if (!head.includes(c)) yield* arrangements(cards, k, [...head, c]);
}
/** The right choices of a choice puzzle, worked out from the life data alone. */
function rightChoices(p) {
  return p.choices.filter(c => {
    if (p.type === 'next') { const row = p.row.map(x => x || c); return STAGE[c] && isLife(row) && row.length === ANIMAL[STAGE[c].animal].stages.length; }
    if (p.type === 'odd') return p.choices.filter(x => STAGE[x].animal === STAGE[c].animal).length === 1;
    if (p.type === 'baby') return STAGE[c].animal === STAGE[p.show[0]].animal;
    if (p.type === 'home') return c === `home.${STAGE[p.show[0]].home}`;
    if (p.type === 'grid') {
      const i = p.grid.findIndex(r => r.includes(null)), j = p.grid[i].indexOf(null);
      const other = p.grid.find((r, k) => k !== i)[j];
      return STAGE[c].animal === STAGE[p.grid[i].find(Boolean)].animal && STAGE[c].role === STAGE[other].role;
    }
    if (p.type === 'logic') {
      const a = ANIMAL[STAGE[c].animal], young = STAGE[cardsOf(a.id).find(x => STAGE[x].role === 'young')];
      if (p.kind === 'pupa') return a.pupa;
      if (p.kind === 'nopupa') return !a.pupa;
      if (p.kind === 'waterfly') return a.wings && young.home === 'water';
      if (p.kind === 'copy') return a.id === 'grasshopper';
    }
    return false;
  });
}

test('the animals: real lives, in order, with a child-sized fact for every stage', () => {
  assert.deepEqual(ANIMALS.map(a => a.id), ['butterfly', 'mosquito', 'grasshopper', 'frog', 'dragonfly']);
  const life = id => ANIMAL[id].stages.map(s => s.id);
  assert.deepEqual(life('butterfly'), ['egg', 'caterpillar', 'chrysalis', 'adult']);
  assert.deepEqual(life('mosquito'), ['raft', 'wriggler', 'tumbler', 'adult']);
  assert.deepEqual(life('grasshopper'), ['eggs', 'nymph', 'bignymph', 'adult']);
  assert.deepEqual(life('frog'), ['spawn', 'tadpole', 'legs', 'froglet', 'adult']);
  assert.deepEqual(life('dragonfly'), ['eggs', 'nymph', 'adult']);
  // complete metamorphosis has a pupa; the grasshopper, the dragonfly and the frog have none
  for (const a of ANIMALS) assert.equal(a.stages.some(s => s.role === 'pupa'), a.pupa, a.id);
  assert.deepEqual(ANIMALS.filter(a => a.pupa).map(a => a.id), ['butterfly', 'mosquito']);
  // a mosquito's first three stages live in water, the grown-up in the air; grasshopper eggs lie in the soil
  assert.deepEqual(ANIMAL.mosquito.stages.map(s => s.home), ['water', 'water', 'water', 'air']);
  assert.equal(STAGE['grasshopper.eggs'].home, 'soil');
  assert.equal(STAGE['butterfly.caterpillar'].home, 'leaf');
  assert.equal(STAGE['dragonfly.nymph'].home, 'water');
  for (const a of ANIMALS) {
    assert.equal(a.stages[0].role, 'egg', a.id);
    assert.equal(a.stages[a.stages.length - 1].role, 'adult', a.id);
    assert.equal(a.stages.filter(s => s.role === 'young').length, 1, a.id);
    assert.equal(STAGE[adultOf(a.id)].name, a.name, `${a.id}: the grown-up card carries the animal's name`);
    assert.ok(a.cycle.length <= 90 && /[.!]$/.test(a.cycle), a.id);
    for (const s of a.stages) {
      assert.ok(s.home === null || HOMES.includes(s.home), `${a.id}.${s.id}`);
      assert.ok(s.fact.length >= 30 && s.fact.length <= 90 && /[.!]$/.test(s.fact), `${a.id}.${s.id}: "${s.fact}" (${s.fact.length})`);
    }
  }
  // names are how a card is told apart when it has a label: no two stages share one (but a grown-up and its animal do)
  const names = Object.values(STAGE).map(s => s.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(Object.keys(HOME_NAME).length, 4);
});

test('every stage and every home has a picture', () => {
  assert.deepEqual(ART_IDS.slice().sort(), Object.keys(STAGE).sort());
  assert.deepEqual(HOME_ART_IDS, HOMES.map(h => `home.${h}`));
  for (const id of [...ART_IDS, ...HOME_ART_IDS]) {
    const svg = cardSvg(id);
    assert.match(svg, /^<svg[^>]* viewBox="0 0 120 120"/, id);
    assert.ok(artOf(id).length > 300, id);
    assert.ok(!/undefined|NaN/.test(svg), id);
    assert.ok(!/ id="/.test(svg), `${id}: no element ids (a card is drawn many times on one page)`);
  }
  for (const a of ANIMALS) assert.ok(creatureOf(adultOf(a.id)).length > 200, a.id);
  assert.equal(artOf('nope.nothing'), '');
});

test('every generated puzzle has exactly one right answer', () => {
  const seenTypes = new Set();
  for (const level of LEVELS) for (const seed of SEEDS) for (const first of level === 'easy' ? [false, true] : [false]) {
    const round = makeRound({ level, seed, first });
    for (const p of round.puzzles) {
      const tag = `${level} seed ${seed} ${p.key}`;
      seenTypes.add(p.mixed ? 'mixed' : p.reverse ? 'young' : p.type);
      assert.ok(PROMPT[Object.keys(PROMPT).find(k => PROMPT[k] === p.prompt)], tag);
      assert.equal(p.labels, LEVEL[level].labels, tag);
      assert.ok(p.why.length >= 1 && p.why.every(s => typeof s === 'string' && s.length > 10), tag);
      if (p.type === 'order') {
        assert.equal(p.cards.length, p.slots + p.extra.length, tag);
        assert.equal(new Set(p.cards).size, p.cards.length, tag);
        assert.notDeepEqual(p.cards.slice(0, p.slots), p.answer, `${tag}: dealt already solved`);
        const ways = [...arrangements(p.cards, p.slots)].filter(isLife);
        assert.equal(ways.length, 1, `${tag}: ${ways.length} lives fit the row`);
        assert.deepEqual(ways[0], p.answer, tag);
        assert.ok(check(p, ways[0]).right, tag);
        assert.ok(isLife(p.answer), tag);
        for (const c of p.extra) assert.notEqual(STAGE[c].animal, p.animal, tag);
      } else {
        assert.equal(new Set(p.choices).size, p.choices.length, `${tag}: a choice twice`);
        assert.ok(p.choices.length >= 3 && p.choices.length <= 4, tag);
        const right = rightChoices(p);
        assert.deepEqual(right, [p.answer], `${tag}: right by the life data = ${right}`);
        assert.equal(p.choices.filter(c => check(p, c).right).length, 1, tag);
      }
      assert.ok(check(p, solve(p)).right, tag);
    }
  }
  assert.deepEqual([...seenTypes].sort(), ['baby', 'grid', 'home', 'logic', 'mixed', 'next', 'odd', 'order', 'young']);
});

test('a round never repeats a puzzle, has the promised number and kinds, and a seed deals the same round again', () => {
  assert.deepEqual([LEVEL.easy.count, LEVEL.normal.count, LEVEL.hard.count], [5, 7, 9]);
  for (const level of LEVELS) {
    assert.equal(LEVEL[level].plan.length, LEVEL[level].count, level);
    for (const seed of SEEDS) {
      const round = makeRound({ level, seed });
      assert.equal(round.puzzles.length, LEVEL[level].count, `${level} ${seed}`);
      assert.equal(new Set(round.puzzles.map(p => p.key)).size, round.puzzles.length, `${level} ${seed}: a puzzle twice`);
      const kinds = new Set(round.puzzles.map(p => p.type));
      for (const k of TYPES[level]) assert.ok(kinds.has(ROLE_OF_TYPE[k] || k), `${level} ${seed}: no ${k} puzzle`);
      assert.deepEqual(makeRound({ level, seed }).puzzles.map(p => p.key), round.puzzles.map(p => p.key));
    }
    assert.ok(new Set(SEEDS.map(seed => makeRound({ level, seed }).puzzles.map(p => p.key).join('|'))).size > SEEDS.length * 0.95, `${level}: rounds differ`);
  }
  // Easy: two animals, put-in-order and what-comes-next only, three or four cards, three choices, labels
  for (const seed of SEEDS) for (const p of makeRound({ level: 'easy', seed }).puzzles) {
    assert.ok(['order', 'next'].includes(p.type));
    assert.ok(['butterfly', 'frog'].includes(p.animal));
    if (p.type === 'order') assert.ok(p.slots >= 3 && p.slots <= 4 && !p.extra.length); else assert.equal(p.choices.length, 3);
  }
  // Normal: every animal turns up, the five kinds, whole lives of four or five cards
  const normal = SEEDS.flatMap(seed => makeRound({ level: 'normal', seed }).puzzles);
  assert.deepEqual([...new Set(normal.map(p => p.animal))].sort(), ANIMALS.map(a => a.id).sort());
  assert.deepEqual([...new Set(normal.map(p => p.type))].sort(), ['baby', 'home', 'next', 'odd', 'order']);
  assert.deepEqual([...new Set(normal.filter(p => p.type === 'order').map(p => p.slots))].sort(), [4, 5]);
  // Difficult: no labels, the grid and the logic questions, two lives mixed in one row
  const hard = SEEDS.flatMap(seed => makeRound({ level: 'hard', seed }).puzzles);
  assert.ok(hard.every(p => !p.labels));
  assert.ok(hard.some(p => p.mixed && p.extra.length === 2) && hard.some(p => p.type === 'grid') && hard.some(p => p.type === 'logic'));
  assert.deepEqual([...new Set(hard.filter(p => p.type === 'logic').map(p => p.kind))].sort(), ['copy', 'nopupa', 'pupa', 'waterfly']);
  for (const p of hard.filter(x => x.type === 'grid')) {
    assert.equal(p.grid.flat().filter(c => c === null).length, 1);
    p.grid.forEach(r => assert.equal(new Set(r.filter(Boolean).map(c => STAGE[c].animal)).size, 1));
  }
});

test('the guided first play: Easy, the butterfly\'s whole life first, then what comes next', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const r = makeRound({ level: 'easy', seed, first: true });
    assert.deepEqual(r.puzzles.map(p => p.type), ['order', 'next', 'order', 'next', 'order']);
    assert.deepEqual(r.puzzles[0].answer, cardsOf('butterfly'));
    assert.equal(new Set(r.puzzles.map(p => p.key)).size, 5);
  }
});

test('answers: a wrong try says something kind and true, three misses show the answer', () => {
  const r = makeRound({ level: 'hard', seed: 5 });
  for (const p of [...r.puzzles, ...makeRound({ level: 'normal', seed: 9 }).puzzles]) {
    assert.deepEqual(explain(p, solve(p)), p.why);
    if (p.type === 'order') {
      const swapped = solve(p); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
      const c = check(p, swapped);
      assert.equal(c.right, false);
      assert.deepEqual(c.good.slice(0, 2), [false, false]);
      assert.ok(c.good.slice(2).every(Boolean));
      assert.equal(explain(p, swapped).length, 1);
      assert.equal(check(p, new Array(p.slots).fill(null)).right, false);
    } else for (const c of p.choices.filter(x => x !== p.answer)) {
      assert.equal(check(p, c).right, false);
      const why = explain(p, c);
      assert.ok(why.length === 1 && why[0].length > 10, p.key);
      assert.notDeepEqual(why, p.why, `${p.key}: the wrong card must not be praised with the right answer's line`);
    }
  }
  assert.deepEqual(POINTS, [10, 6, 3]);
  assert.deepEqual([0, 1, 2, 3, 4].map(pointsFor), [10, 6, 3, 0, 0]);
  assert.equal(MAX_MISSES, 3);
});

test('scores fit the stars: no clock on Easy, the bonus is small and never needed', () => {
  const t = TRICK.lifecycle;
  for (const level of LEVELS) {
    const s = levelSpec(t, level), max = maxScore(level);
    assert.equal(max, LEVEL[level].count * 10);
    assert.ok(s.stars[2] <= max - 4, `${level}: three stars allow one second try without the bonus`);
    assert.ok(s.stars[2] > max - 12, `${level}: three stars are not handed out for two slips`);
    assert.ok(s.stars[0] <= max * 0.5, `${level}: half right is a star`);
    assert.equal(quickBonus(level, s.length + 1, s.length), 0);
    assert.ok(quickBonus(level, 0, s.length) <= (level === 'easy' ? 0 : 5));
  }
  assert.equal(quickBonus('easy', 0, 70), 0);
  assert.equal(quickBonus('normal', 68, 100), 3);
  assert.equal(quickBonus('hard', 0, 140), 5);
  assert.deepEqual(LEVELS.map(l => levelSpec(t, l).length), [70, 100, 140]);
  // the guided first play is scored as Easy: its five puzzles can earn all three stars
  assert.ok(5 * 10 >= levelSpec(t, 'easy').stars[2]);
});

test('the seeded generator is steady, and cards fit the three screens at a size a finger can hit', () => {
  const a = rng(42), b = rng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(rng(1)(), rng(2)());
  // (the board measures its own free space; these are that space at 1280x720, 390x844 and 844x390)
  assert.ok(fitCards(744, 440, [5, 5], { labels: true, gaps: [18, 8] }) >= 110);
  assert.ok(fitCards(354, 560, [5, 7], { gaps: [18, 8] }) >= 76);
  assert.ok(fitCards(538, 310, [4, 4], { labels: true, gaps: [18, 8] }) >= 84);
  // the grid: its choices beside it on a wide screen, under it on a tall one
  assert.ok(fitCards(538, 310, [{ fixed: 3, lines: 3 }, 4], { gaps: [6, 8], side: true }) >= 80);
  assert.ok(fitCards(354, 560, [{ fixed: 3, lines: 3 }, 4], { gaps: [6, 8] }) >= 90);
});
