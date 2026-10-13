// From seed to harvest (src/game/tricks/rules-crops.js): the crops and their stages, the farming numbers, the seeded
// puzzles (every one has exactly one right answer, checked here against the crop data and not against the puzzle's own
// answer field), rounds that never repeat a puzzle, the kinds each level promises, the scoring against the star
// thresholds, the pictures, and the field grid the game is played beside (world/fields.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CROPS, CROP, CARD, NEEDS, PARTS, PART_OF, FOODS, MONTHS, FESTIVALS, LEVEL, TYPES, PROMPT, FIRST_ROW, ROW_MAX, cardsOf, cropCard, monthsOf, spanOf, inField,
  makeRound, check, solve, explain, pointsFor, POINTS, MAX_MISSES, quickBonus, maxScore, rng } from '../src/game/tricks/rules-crops.js';
import { artOf, cardSvg, wheelSvg, ART_IDS, CROP_COLOUR } from '../src/game/tricks/crops-art.js';
import { fitCards } from '../src/game/tricks/lifecycle.js';
import { CROPS_KIT } from '../src/game/tricks/crops.js';
import { TRICK } from '../src/content/tricks.js';
import { HOWTO } from '../src/ui/howto.js';
import { levelSpec, LEVELS } from '../src/content/levels.js';
import { PADDIES, PLAY_GROUNDS } from '../src/world/layout.js';
import { VEG_BEDS, WHEAT_FIELDS, CUT_IN_AUTUMN, FIELD_YEAR, cropOf, isFlooded, wheatRows, dryingRacks, fieldOptions } from '../src/world/fields.js';
import { bundSpots, paddyWater } from '../src/game/tricks/frogs.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const stage = c => CARD[c];
/** Is this row of cards one crop's life in its order? */
const isLife = row => row.every(Boolean) && row.every(c => stage(c).kind === 'stage' && stage(c).crop === stage(row[0]).crop) && row.every((c, i) => !i || stage(c).index > stage(row[i - 1]).index);
/** One field through a year: the rice jobs in their order, then the wheat jobs in theirs. */
const isYear = row => { const k = row.findIndex(c => stage(c).crop === 'wheat'); return k > 0 && isLife(row.slice(0, k)) && stage(row[0]).crop === 'rice' && isLife(row.slice(k)) && row[0] === 'rice.transplant'; };
function* arrangements(cards, k, head = []) {
  if (head.length === k) { yield head; return; }
  for (const c of cards) if (!head.includes(c)) yield* arrangements(cards, k, [...head, c]);
}
const cropOfCard = c => CARD[c].crop;
/** The right choices of a choice puzzle, worked out from the crop data alone. */
function rightChoices(p) {
  return p.choices.filter(c => {
    if (p.type === 'next') { const row = p.row.map(x => x || c); return isLife(row) && row.every((x, i) => !i || stage(x).index === stage(row[i - 1]).index + 1); }
    if (p.type === 'odd') return p.choices.filter(x => cropOfCard(x) === cropOfCard(c)).length === 1;
    const id = cropOfCard(c);
    if (p.type === 'howlong') {
      const shown = p.wheel.arcs.map(a => [a.from, a.to]);
      if (p.kind === 'span') return CROP[id].months[0] === shown[0][0] && CROP[id].months[1] === shown[0][1];
      if (p.kind === 'fastest') return CROPS.every(o => spanOf(o.id) >= spanOf(id));
      if (p.kind === 'slowest') return CROPS.every(o => spanOf(o.id) <= spanOf(id));
      if (p.kind === 'winter') return [12, 1, 2].every(m => inField(id, m));
    }
    if (p.type === 'needs') return p.kind === 'need' ? NEEDS[c.slice(5)].crop === cropOfCard(p.show[0]) : NEEDS[p.show[0].slice(5)].crop === id;
    if (p.type === 'part') return p.kind === 'part' ? c === `part.${PART_OF[cropOfCard(p.show[0])]}` : PART_OF[id] === 'tuber';
    if (p.type === 'food') return p.kind === 'food' ? FOODS[c.slice(5)].crop === cropOfCard(p.show[0]) : FOODS[p.show[0].slice(5)].crop === id;
    if (p.type === 'plan' && p.kind === 'ready') {
      // planted in the month marked "now", and out of the field before the festival
      const months = monthsOf(id), after = (p.wheel.flag - p.wheel.now + 12) % 12;
      return months[0] === p.wheel.now && months.length <= after;
    }
    if (p.type === 'plan' && p.kind === 'follow') {
      // the next crop goes in after the one on the wheel has come out, within a few weeks, and the two never overlap for long
      const [a] = p.wheel.arcs, other = monthsOf(id), gap = (CROP[id].months[0] - a.to + 12) % 12;
      return id !== a.crop && gap <= 2 && other.filter(m => inField(a.crop, m)).length <= 1;
    }
    return false;
  });
}

test('the crops: real lives in order, with child-sized facts and the real numbers', () => {
  assert.deepEqual(CROPS.map(c => c.id), ['rice', 'wheat', 'potato']);
  const life = id => CROP[id].stages.map(s => s.id);
  assert.deepEqual(life('rice'), ['seed', 'nursery', 'transplant', 'tiller', 'heading', 'golden', 'harvest']);
  assert.deepEqual(life('wheat'), ['sow', 'sprout', 'shoot', 'heading', 'golden', 'harvest']);
  assert.deepEqual(life('potato'), ['seed', 'sprout', 'flower', 'tubers', 'dieback', 'dig']);
  // months in the field: rice May to September (4 to 5 months), winter wheat November to May (7 to 8), potatoes March to June (3 to 4)
  assert.deepEqual(monthsOf('rice'), [5, 6, 7, 8, 9]);
  assert.deepEqual(monthsOf('wheat'), [11, 12, 1, 2, 3, 4, 5]);
  assert.deepEqual(monthsOf('potato'), [3, 4, 5, 6]);
  assert.match(CROP.rice.when, /4 to 5 months/); assert.match(CROP.wheat.when, /7 to 8 months/); assert.match(CROP.potato.when, /3 to 4 months/);
  assert.match(CARD['rice.nursery'].fact, /3 to 4 weeks/);
  assert.match(CARD['potato.seed'].fact, /not from a seed/);
  assert.match(NEEDS.dark.fact, /green/);
  for (const c of CROPS) {
    assert.ok(spanOf(c.id) >= Number(c.when.match(/(\d) to (\d) months/)[1]) && spanOf(c.id) <= Number(c.when.match(/(\d) to (\d) months/)[2]), `${c.id}: the wheel shows what the words say`);
    assert.ok(CARD[c.portrait], c.id);
    for (const k of ['cycle', 'when', 'needs', 'foods', 'part']) assert.ok(c[k].length > 20 && c[k].length <= 96 && /[.!]$/.test(c[k]), `${c.id}.${k}`);
    for (const s of c.stages) { assert.ok(s.name.length <= 20, `${c.id}.${s.id}: "${s.name}" fits under a card`); assert.ok(s.fact.length <= 90 && /[.!]$/.test(s.fact), `${c.id}.${s.id}: one line`); }
    assert.deepEqual([c.stages[0].phase, c.stages[c.stages.length - 1].phase], ['start', 'harvest']);
  }
  // rice needs water, wheat a winter, potatoes soil and the dark; we eat grain and a tuber; every crop has foods
  assert.deepEqual(Object.fromEntries(Object.entries(NEEDS).map(([k, v]) => [k, v.crop])), { water: 'rice', cold: 'wheat', hill: 'potato', dark: 'potato' });
  assert.deepEqual(PART_OF, { rice: 'grain', wheat: 'grain', potato: 'tuber' });
  for (const c of CROPS) assert.ok(Object.values(FOODS).filter(f => f.crop === c.id).length >= 2, c.id);
  for (const v of [...Object.values(NEEDS), ...Object.values(PARTS), ...Object.values(FOODS)]) { assert.ok(v.name.length <= 20, v.name); assert.ok(v.fact.length <= 90 && /[.!]$/.test(v.fact), v.fact); }
  assert.equal(MONTHS.length, 12);
  // the real double cropping: wheat is out of the field before the rice is planted out, and sown after the rice is cut
  assert.ok(CROP.wheat.months[1] <= CROP.rice.months[0] && CROP.rice.months[1] < CROP.wheat.months[0]);
  for (const m of Object.keys(FESTIVALS)) assert.ok(m >= 1 && m <= 12);
});

test('every card has a picture; a rice head hangs, a wheat ear stands, potatoes lie under the soil line', () => {
  for (const id of Object.keys(CARD)) {
    const svg = cardSvg(id);
    assert.ok(artOf(id).length > 200, `${id} is drawn`);
    assert.ok(svg.startsWith('<svg') && svg.includes('viewBox="0 0 120 120"'), id);
    assert.ok(!/NaN|undefined|null/.test(svg), `${id}: a clean picture`);
    assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, `${id}: groups are closed`);
  }
  assert.ok(ART_IDS.every(id => CARD[id]), 'no picture without a card');
  assert.equal(artOf('crop.rice'), artOf('rice.golden'));
  assert.equal(artOf('crop.potato'), artOf('potato.tubers'));
  assert.notEqual(artOf('rice.golden'), artOf('wheat.golden'));
  assert.equal(new Set(ART_IDS.map(artOf)).size, ART_IDS.length, 'no two cards share a picture');
  assert.equal(artOf('nothing.here'), '');
  // the year wheel: twelve months, a band a crop, the month marked and the festival
  const w = wheelSvg({ arcs: CROPS.map(c => ({ from: c.months[0], to: c.months[1], crop: c.id })), now: 3, flag: 7 });
  for (let m = 1; m <= 12; m++) assert.ok(w.includes(`>${m}</text>`), `month ${m}`);
  for (const c of CROPS) assert.ok(w.includes(CROP_COLOUR[c.id]), c.id);
  assert.ok(!/NaN|undefined/.test(w));
  assert.equal(new Set(Object.values(CROP_COLOUR)).size, 3);
});

test('every puzzle has exactly one right answer (worked out from the crop data)', () => {
  const seen = new Set();
  for (const level of LEVELS) for (const seed of SEEDS) {
    for (const p of makeRound({ level, seed }).puzzles) {
      seen.add(`${p.kindOf}:${p.kind || p.type}`);
      if (p.type === 'order') {
        assert.ok(p.slots <= ROW_MAX && p.slots >= 3, p.key);
        assert.equal(p.cards.length, p.slots + p.extra.length);
        assert.notDeepEqual(p.cards.slice(0, p.slots), p.answer, `${p.key}: the tray is never dealt solved`);
        const ok = p.year ? isYear : isLife;
        const right = [...arrangements(p.cards, p.slots)].filter(ok);
        assert.equal(right.length, 1, `${p.key}: ${right.length} rows are right`);
        assert.deepEqual(right[0], p.answer);
        assert.ok(check(p, solve(p)).right);
        continue;
      }
      assert.equal(new Set(p.choices).size, p.choices.length, `${p.key}: no card twice`);
      assert.ok(p.choices.length >= 3 && p.choices.length <= 4, p.key);
      const right = rightChoices(p);
      assert.deepEqual(right, [p.answer], `${p.key} (${p.kind || p.type}): right = ${right.join(', ')}`);
      assert.ok(check(p, p.answer).right);
      // the two noodle bowls never meet
      assert.ok(p.choices.filter(c => FOODS[c.slice(5)]?.noodle).length <= 1, p.key);
      for (const c of [...p.choices, ...(p.show || []), ...(p.row || []).filter(Boolean)]) assert.ok(CARD[c], `${p.key}: ${c}`);
    }
  }
  // every kind of question turns up
  for (const k of ['order:order', 'next:next', 'odd:odd', 'mixed:order', 'howlong:span', 'howlong:fastest', 'howlong:slowest', 'howlong:winter', 'needs:need', 'needs:whose', 'part:part', 'part:tuber', 'food:food', 'food:from', 'plan:ready', 'plan:follow', 'plan:year']) assert.ok(seen.has(k), k);
});

test('rounds: the right number of puzzles, never the same one twice, the kinds each level promises', () => {
  assert.deepEqual(LEVELS.map(l => LEVEL[l].count), [5, 7, 9]);
  assert.deepEqual(TYPES.easy, ['order', 'next']);
  assert.deepEqual(TYPES.normal.slice().sort(), ['food', 'howlong', 'needs', 'next', 'odd', 'order', 'part']);
  assert.ok(['mixed', 'plan', 'howlong', 'needs', 'food', 'part'].every(k => TYPES.hard.includes(k)));
  assert.equal(LEVEL.hard.plan.filter(k => k === 'plan').length, 2, 'the planner comes twice on Difficult');
  for (const level of LEVELS) for (const seed of SEEDS) {
    const r = makeRound({ level, seed });
    assert.equal(r.puzzles.length, LEVEL[level].count, `${level} ${seed}`);
    assert.equal(new Set(r.puzzles.map(p => p.key)).size, r.puzzles.length, `${level} ${seed}: a puzzle twice`);
    assert.deepEqual(r.puzzles.map(p => p.kindOf).sort(), LEVEL[level].plan.slice().sort());
    assert.deepEqual(makeRound({ level, seed }), r, 'the same seed deals the same round');
    assert.ok(r.puzzles.every(p => p.labels === LEVEL[level].labels));
    assert.ok(r.puzzles.every(p => typeof p.prompt === 'string' && p.why.length >= 1 && p.why.every(s => typeof s === 'string' && s.length > 10)));
  }
  // Easy: rice and potato only, three choices, labelled; the first card is never the gap
  for (const p of SEEDS.flatMap(seed => makeRound({ level: 'easy', seed }).puzzles)) {
    assert.ok(['rice', 'potato'].includes(p.crop) && p.labels);
    if (p.type === 'next') { assert.equal(p.choices.length, 3); assert.ok(p.row[0] !== null); assert.ok(p.choices.every(c => ['rice', 'potato'].includes(CARD[c].crop))); }
    if (p.type === 'order') assert.ok(p.slots === 3 || p.slots === 4);
  }
  // Difficult: no names under the stage cards, two crops mixed in one row
  const hard = SEEDS.flatMap(seed => makeRound({ level: 'hard', seed }).puzzles);
  assert.ok(hard.every(p => !p.labels) && hard.some(p => p.mixed && p.extra.length === 2));
  // the planner's prompt names its month and its festival
  for (const p of hard.filter(x => x.kind === 'ready')) { assert.ok(MONTHS.includes(p.vars.now) && Object.values(FESTIVALS).includes(p.vars.festival)); assert.ok(p.prompt.includes('{now}') && p.prompt.includes('{festival}')); }
  assert.equal(makeRound({ level: 'nonsense', seed: 3 }).level, 'normal');
});

test('the guided first play: Easy, the life of rice in four big steps, then what comes next', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const r = makeRound({ level: 'easy', seed, first: true });
    assert.deepEqual(r.puzzles.map(p => p.type), ['order', 'next', 'order', 'next', 'order']);
    assert.deepEqual(r.puzzles[0].answer, FIRST_ROW);
    assert.notDeepEqual(r.puzzles[0].cards, FIRST_ROW);
    assert.equal(new Set(r.puzzles.map(p => p.key)).size, 5);
  }
  assert.ok(isLife(FIRST_ROW));
  assert.ok(CROPS_KIT.guide.length >= 2 && /seeds come first/.test(CROPS_KIT.guide[0]));
});

test('answers: a wrong try says something kind and true, three misses show the answer', () => {
  for (const seed of SEEDS.slice(0, 80)) for (const p of [...makeRound({ level: 'hard', seed }).puzzles, ...makeRound({ level: 'normal', seed }).puzzles]) {
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
      assert.ok(why.length === 1 && why[0].length > 10 && why[0].length <= 96, p.key);
      assert.notDeepEqual(why, p.why, `${p.key}: the wrong card must not be praised with the right answer's line`);
      // what is said about a wrong crop is about THAT crop
      if (CARD[c].kind === 'crop') assert.ok(Object.values(CROP[CARD[c].crop]).includes(why[0]) || /Rice|wheat|Potatoes/i.test(why[0]), `${p.key}: ${why[0]}`);
    }
  }
  assert.deepEqual(POINTS, [10, 6, 3]);
  assert.deepEqual([0, 1, 2, 3, 4].map(pointsFor), [10, 6, 3, 0, 0]);
  assert.equal(MAX_MISSES, 3);
});

test('scores fit the stars: no clock on Easy, the bonus is small and never needed', () => {
  const t = TRICK.crops;
  assert.equal(t.name, 'From seed to harvest');
  for (const level of LEVELS) {
    const s = levelSpec(t, level), max = maxScore(level);
    assert.equal(max, LEVEL[level].count * 10);
    assert.ok(s.stars[2] <= max - 4, `${level}: three stars allow one second try without the bonus`);
    assert.ok(s.stars[2] > max - 12, `${level}: three stars are not handed out for two slips`);
    assert.ok(s.stars[0] <= max * 0.5, `${level}: half right is a star`);
    assert.equal(quickBonus(level, s.length + 1, s.length), 0);
    assert.ok(quickBonus(level, 0, s.length) <= (level === 'easy' ? 0 : 5));
  }
  assert.deepEqual(LEVELS.map(l => levelSpec(t, l).length), [70, 100, 140]);
  assert.ok(5 * 10 >= levelSpec(t, 'easy').stars[2]);
  assert.deepEqual(rng(42)(), rng(42)());
});

test('the board: cards fit the three screens, with the year wheel too; the kit names what must be named', () => {
  // (the board measures its own free space; these are that space at 1280x720, 390x844 and 844x390)
  assert.ok(fitCards(744, 440, [5, 5], { labels: true, gaps: [18, 8] }) >= 110);
  assert.ok(fitCards(354, 560, [5, 7], { gaps: [18, 8] }) >= 76, 'Difficult: five slots over a tray of seven on a phone');
  assert.ok(fitCards(538, 310, [5, 5], { labels: true, gaps: [18, 8] }) >= 70);
  // under a 220 px wheel on a phone, beside one on a wide screen: three crop cards a finger can hit
  assert.ok(fitCards(354, 560 - 260, [3], { labels: true }) >= 96);
  assert.ok(fitCards(744 - 264, 440, [3], { labels: true }) >= 110);
  assert.ok(fitCards(538 - 144, 310, [3], { labels: true }) >= 96);
  assert.equal(CROPS_KIT.alwaysLabel('rice.seed'), false);
  for (const id of ['crop.rice', 'need.water', 'part.tuber', 'food.bread']) assert.equal(CROPS_KIT.alwaysLabel(id), true, id);
  for (const id of Object.keys(CARD)) assert.ok(CROPS_KIT.nameOf(id).length > 2, id);
  const hard = makeRound({ level: 'hard', seed: 5 }).puzzles;
  for (const p of hard) assert.equal(CROPS_KIT.labelled(p), p.type !== 'order' && p.choices.some(c => CARD[c].kind !== 'stage'), p.key);
  assert.equal(CROPS_KIT.banner({}), '');
  // How to play: short lines
  for (const row of HOWTO['trick:crops']) assert.ok(row.text.length <= 46 && /[.!?]$/.test(row.text), row.text);
  for (const text of Object.values(PROMPT)) assert.ok(text.length <= 84, text);
});

test('the fields beside the game: rice paddies, a wheat field and vegetable beds, each with its year', () => {
  const ids = PADDIES.map(p => p.id);
  for (const id of [...WHEAT_FIELDS, ...VEG_BEDS, ...CUT_IN_AUTUMN]) assert.ok(ids.includes(id), id);
  for (const id of WHEAT_FIELDS) assert.ok(!VEG_BEDS.has(id) && !CUT_IN_AUTUMN.has(id), `${id}: wheat is neither a bed nor a cut paddy`);
  for (const id of CUT_IN_AUTUMN) assert.equal(cropOf(id), 'rice');
  const count = k => ids.filter(id => cropOf(id) === k).length;
  assert.deepEqual([count('rice'), count('wheat'), count('veg')], [7, 2, 3], 'mostly rice, a wheat field of two plots, three beds');
  assert.ok(ids.every(id => isFlooded(id) === (cropOf(id) === 'rice')));
  // the wheat field is one block on the top terrace (the highest, driest plots)
  const wheat = PADDIES.filter(p => WHEAT_FIELDS.has(p.id)), top = Math.min(...PADDIES.map(p => p.x));
  assert.ok(wheat.every(p => p.x === top) && Math.abs(wheat[0].z - wheat[1].z) < 12);
  // rice and wheat take turns: when one is golden the other is green or only just sown
  assert.deepEqual(FIELD_YEAR.rice, { spring: 'seedling', summer: 'green', autumn: 'golden', winter: 'stubble' });
  assert.deepEqual(FIELD_YEAR.wheat, { spring: 'green', summer: 'golden', autumn: 'sprout', winter: 'sprout' });
  for (const s of ['spring', 'summer', 'autumn', 'winter']) assert.ok(!(FIELD_YEAR.rice[s] === 'golden' && FIELD_YEAR.wheat[s] === 'golden'), s);
  // the valley's fields and the cards agree: rice golden in autumn (cut in September), wheat golden in summer (cut as it begins)
  assert.ok(inField('rice', 9) && !inField('rice', 11) && inField('wheat', 12) && !inField('wheat', 7));
  // the frog chorus and the fireflies keep their water: no bund spot of the frog game lies on the wheat field
  const frogs = TRICK.frogs.place;
  for (const s of bundSpots(frogs.x, frogs.z, 22)) assert.ok(!wheat.some(p => Math.abs(s.x - p.x) <= p.w / 2 + 0.6 && Math.abs(s.z - p.z) <= p.d / 2 + 0.6), 'a frog spot on the wheat field');
  for (const t of [TRICK.frogs, TRICK.firefly]) for (const p of wheat) assert.ok(Math.hypot(p.x - t.place.x, p.z - t.place.z) > 24, `${t.id}: the wheat is far from its sign`);
  assert.ok(paddyWater(PADDIES[0].x, PADDIES[0].z) !== null);
  // drill rows and drying racks stay inside the bund; a tier that plants wider sows wider
  for (const p of wheat) {
    const rows = wheatRows(p);
    assert.ok(rows.length >= 18 && rows.every(r => Math.abs(r.x - p.x) < p.w / 2 - 0.5 && r.plants.every(z => Math.abs(z - p.z) < p.d / 2 - 0.5)));
    assert.ok(rows.reduce((n, r) => n + r.plants.length, 0) <= 560, 'one small instanced mesh a plot');
    const low = fieldOptions({ name: 'Low' }), thin = wheatRows(p, low.wheatStepX, low.wheatStepZ);
    assert.ok(thin.reduce((n, r) => n + r.plants.length, 0) < rows.reduce((n, r) => n + r.plants.length, 0) * 0.75);
    assert.ok(low.broad > 1 && fieldOptions().broad === 1);
  }
  for (const p of PADDIES.filter(q => CUT_IN_AUTUMN.has(q.id))) {
    const { racks, stooks } = dryingRacks(p);
    assert.equal(racks.length, 2);
    for (const r of racks) assert.ok(Math.abs(r.x - p.x) + r.len / 2 < p.w / 2 - 0.8 && Math.abs(r.z - p.z) < p.d / 2 - 1 && r.sheaves >= 8 && r.sheaves <= 16);
    for (const [x, z] of stooks) assert.ok(Math.abs(x - p.x) < p.w / 2 - 0.8 && Math.abs(z - p.z) < p.d / 2 - 0.8);
    for (const [x, z] of stooks) for (const r of racks) assert.ok(Math.abs(z - r.z) > 0.6 || Math.abs(x - r.x) > r.len / 2 + 0.4, 'a bundle under a rack');
  }
  // the game's sign: at the north edge of the grid, the ground the camera looks across kept clear of trees
  const s = TRICK.crops.place;
  assert.ok(PADDIES.some(p => Math.abs(s.x - p.x) < p.w / 2 && Math.abs(s.z - (p.z - p.d / 2)) < 4), 'the sign stands at a paddy edge');
  assert.ok(PLAY_GROUNDS.some(([x, z, hw, hd]) => Math.abs(s.x - x) < hw && Math.abs(s.z - 2 - 7.4 - z) < hd), 'the camera spot is a play ground');
});
