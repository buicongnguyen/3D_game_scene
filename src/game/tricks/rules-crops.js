// From seed to harvest: the rules of the crop card game (pure: no three.js, no DOM; tests/crops.test.mjs).
// A sibling of "From egg to wings" (rules-lifecycle.js): the same board, the same three tries, other knowledge.
//
// Three crops of the valley, each a row of stages in the order they happen, with the months they spend in the field,
// what they need, the part we eat and what is made from it. Every puzzle is built from that data with a seed, so a round
// is different every time, always has exactly one right answer, and never asks the same thing twice:
//   order    put shuffled stage cards in order (Difficult: two cards of another crop must be left out)
//   next     a crop's life with one gap: which card fills it?
//   odd      four cards, three from one crop's life and one stranger
//   howlong  the year wheel: whose months are these, which crop is quickest, slowest, out in winter?
//   needs    what does this crop need: a flooded paddy, a cool winter, soil heaped up, a dark store?
//   part     which part of the plant do we eat: the grain, or a tuber from under the soil?
//   food     what is made from it (and the other way round: which crop is this food made from?)
//   plan     the planting planner (Difficult): what to sow now so that it is ready by a festival, what follows what in
//            the same field, and the jobs of one field through a whole year (rice in summer, wheat in winter)
// The numbers are a child's version of the real ones, for a temperate valley like this one (rice as in Japan and the
// north of Vietnam, winter wheat, spring potatoes):
//   rice    seed to harvest about 4 to 5 months (May to September); 3 to 4 weeks of that in the nursery bed
//   wheat   about 7 to 8 months (sown in November, cut at the start of summer: late May, early June)
//   potato  about 3 to 4 months (planted in March, dug in June)
// Texts are English source strings (translated with tx() by the game; collected by scripts/i18n-extract.mjs).
import { N_ } from '../../i18n/i18n.js';
import { rng } from './rules-lifecycle.js';

export { rng };

export const MONTHS = [N_('January'), N_('February'), N_('March'), N_('April'), N_('May'), N_('June'), N_('July'), N_('August'), N_('September'), N_('October'), N_('November'), N_('December')];

const st = (id, name, phase, fact) => ({ id, name, phase, fact });
// phase: start | young | grow | head | ripe | harvest (the wrong cards of a Difficult "what comes next" are the same
// moment of the other crops). months: [first, last] month in the field, 1-12 (wheat runs over the new year).
export const CROPS = [
  {
    id: 'rice', name: N_('Rice'), months: [5, 9], portrait: 'rice.golden',
    cycle: N_('Seed, nursery bed, planting out, many stems, flowers, golden grain, harvest.'),
    when: N_('Rice takes about 4 to 5 months: sown in May, cut in September.'),
    needs: N_('Rice needs warmth and a paddy full of water.'),
    foods: N_('From rice we make cooked rice, rice noodles and rice cakes.'),
    part: N_('Of rice we eat the grain: the seeds in its head.'),
    stages: [
      st('seed', N_('Rice seeds'), 'start', N_('Rice seeds are soaked in water until a tiny white shoot peeps out.')),
      st('nursery', N_('Nursery bed'), 'young', N_('The seedlings grow close together in a nursery bed for 3 to 4 weeks.')),
      st('transplant', N_('Planting out'), 'young', N_('The seedlings are planted out in rows in the flooded paddy.')),
      st('tiller', N_('Many new stems'), 'grow', N_('One rice plant grows many new stems from its foot. That is tillering.')),
      st('heading', N_('Rice in flower'), 'head', N_('In late summer the heads come out of the leaves and flower.')),
      st('golden', N_('Golden rice'), 'ripe', N_('The grains fill and turn golden. A heavy rice head bends down.')),
      st('harvest', N_('Rice harvest'), 'harvest', N_('The paddy is drained, the rice is cut and the sheaves hang up to dry.')),
    ],
  },
  {
    id: 'wheat', name: N_('Wheat'), months: [11, 5], portrait: 'wheat.golden',
    cycle: N_('Sown in autumn, small all winter, tall in spring, golden in early summer.'),
    when: N_('Winter wheat takes about 7 to 8 months: sown in November, cut in early summer.'),
    needs: N_('Winter wheat needs a cool winter, and dry weather when it is cut.'),
    foods: N_('From wheat we make flour, bread and noodles.'),
    part: N_('Of wheat we eat the grain, ground into flour.'),
    stages: [
      st('sow', N_('Sowing in autumn'), 'start', N_('Winter wheat is sown in autumn, when the rice has been cut.')),
      st('sprout', N_('Sprouts in winter'), 'young', N_('The sprouts stay small and green all winter. The cold does them good.')),
      st('shoot', N_('Tall in spring'), 'grow', N_('In the spring warmth the wheat shoots up, knee high and higher.')),
      st('heading', N_('Green ears'), 'head', N_('Every stalk grows an ear that stands straight up, with a long beard.')),
      st('golden', N_('Golden wheat'), 'ripe', N_('By early summer the wheat is golden and dry. Its ears still stand up.')),
      st('harvest', N_('Wheat harvest'), 'harvest', N_('Wheat is cut on a dry day in early summer, before the rains come.')),
    ],
  },
  {
    id: 'potato', name: N_('Potato'), months: [3, 6], portrait: 'potato.tubers',
    cycle: N_('Seed potato, sprouts, leaves and flowers, new potatoes, tops die back, digging.'),
    when: N_('Potatoes take about 3 to 4 months: planted in March, dug in June.'),
    needs: N_('Potatoes need loose soil heaped up round their stems, and a dark store.'),
    foods: N_('From potatoes we make chips and potato stew.'),
    part: N_('Of the potato we eat the tuber from under the soil.'),
    stages: [
      st('seed', N_('Seed potato'), 'start', N_('A potato plant grows from a potato, not from a seed. The dents are its eyes.')),
      st('sprout', N_('Sprouting eyes'), 'young', N_('Sprouts grow out of the eyes. Now the seed potato can be planted.')),
      st('flower', N_('Leaves and flowers'), 'grow', N_('Leafy shoots come up and flower. Soil is heaped up round the stems.')),
      st('tubers', N_('New potatoes'), 'head', N_('Under the soil, new potatoes swell on side stems, in the dark.')),
      st('dieback', N_('Tops die back'), 'ripe', N_('The leaves turn yellow and lie down. The potatoes are ready.')),
      st('dig', N_('Digging potatoes'), 'harvest', N_('The potatoes are dug up with a fork, 3 to 4 months after planting.')),
    ],
  },
];
export const CROP = Object.fromEntries(CROPS.map(c => [c.id, c]));

/** What a crop needs (one card each; `crop` is the only crop the card belongs to). */
export const NEEDS = {
  water: { crop: 'rice', name: N_('A flooded paddy'), fact: N_('Standing water is for rice. Wheat and potatoes would rot in it.') },
  cold: { crop: 'wheat', name: N_('A cool winter'), fact: N_('A cool winter is for winter wheat: without it there are no ears.') },
  hill: { crop: 'potato', name: N_('Soil heaped up'), fact: N_('Heaping soil round the stems is for potatoes: it keeps them in the dark.') },
  dark: { crop: 'potato', name: N_('A dark store'), fact: N_('A dark store is for potatoes. In the light they turn green: not for eating!') },
};
/** The part of a plant on the plate. */
export const PARTS = {
  grain: { name: N_('The grain'), fact: N_('Grain is the seed of the plant. We eat the grain of rice and of wheat.') },
  tuber: { name: N_('A tuber'), fact: N_('A tuber is a swollen stem under the soil. A potato is a tuber.') },
  leaf: { name: N_('The leaves'), fact: N_('We eat the leaves of cabbage and spinach, not of these crops.') },
  flower: { name: N_('The flowers'), fact: N_('The flowers are pretty, but they are not the part we eat.') },
};
export const PART_OF = { rice: 'grain', wheat: 'grain', potato: 'tuber' };
/** What is made from a crop. noodle: the two noodle bowls never sit in one puzzle (they look too much alike). */
export const FOODS = {
  bowl: { crop: 'rice', name: N_('Cooked rice'), fact: N_('Cooked rice is rice grain, washed and steamed.') },
  ricenoodle: { crop: 'rice', name: N_('Rice noodles'), fact: N_('Rice noodles are made from rice flour, like the noodles in pho.'), noodle: true },
  ricecake: { crop: 'rice', name: N_('Rice cakes'), fact: N_('Rice cakes are sticky rice, pounded or steamed: mochi and banh.') },
  flour: { crop: 'wheat', name: N_('Flour'), fact: N_('Flour is wheat grain ground fine in a mill.') },
  bread: { crop: 'wheat', name: N_('Bread'), fact: N_('Bread is baked from wheat flour.') },
  wheatnoodle: { crop: 'wheat', name: N_('Wheat noodles'), fact: N_('Thick wheat noodles are made from wheat flour, water and salt.'), noodle: true },
  chips: { crop: 'potato', name: N_('Chips'), fact: N_('Chips are potatoes cut into sticks and fried.') },
  stew: { crop: 'potato', name: N_('Potato stew'), fact: N_('Potato stew is potatoes simmered soft with meat and onions.') },
};

/**
 * Every card by its id: { id, kind, name, fact, crop? }. Kinds: 'stage' (`rice.seed`), 'crop' (`crop.rice`: the crop
 * itself, drawn as its portrait stage), 'need', 'part' and 'food'.
 */
export const CARD = {};
for (const c of CROPS) {
  c.stages.forEach((s, i) => { CARD[`${c.id}.${s.id}`] = { ...s, id: `${c.id}.${s.id}`, kind: 'stage', crop: c.id, index: i }; });
  CARD[`crop.${c.id}`] = { id: `crop.${c.id}`, kind: 'crop', crop: c.id, name: c.name, fact: c.cycle };
}
for (const [k, v] of Object.entries(NEEDS)) CARD[`need.${k}`] = { ...v, id: `need.${k}`, kind: 'need' };
for (const [k, v] of Object.entries(PARTS)) CARD[`part.${k}`] = { ...v, id: `part.${k}`, kind: 'part' };
for (const [k, v] of Object.entries(FOODS)) CARD[`food.${k}`] = { ...v, id: `food.${k}`, kind: 'food' };
export const cardsOf = id => CROP[id].stages.map(s => `${id}.${s.id}`);
export const cropCard = id => `crop.${id}`;
const byPhase = (id, phase) => cardsOf(id).find(c => CARD[c].phase === phase);

// ------------------------------------------------------------------------------------------------ the calendar
/** The months (1-12) a crop is in the field, in order (wheat: 11, 12, 1 … 5). */
export function monthsOf(id) {
  const [a, b] = CROP[id].months, out = [];
  for (let m = a; ; m = m % 12 + 1) { out.push(m); if (m === b) break; }
  return out;
}
export const spanOf = id => monthsOf(id).length;
export const inField = (id, month) => monthsOf(id).includes(month);
/** The valley's festivals the planner aims for: the month, and its name. */
export const FESTIVALS = {
  7: N_('Tanabata in July'),
  10: N_('the harvest festival in October'),
};

export const PROMPT = {
  order: N_('Put the cards in order, from first to last.'),
  mixed: N_('Two crops got mixed up. Fill the row with one crop, in order.'),
  next: N_('Which card fills the gap?'),
  odd: N_('Which card does not belong with the others?'),
  span: N_('Look at the year wheel. Which crop is in the field in these months?'),
  fastest: N_('Look at the year wheel. Which crop is ready the fastest?'),
  slowest: N_('Look at the year wheel. Which crop stays in the field the longest?'),
  winter: N_('Look at the year wheel. Which crop is out in the field all winter?'),
  need: N_('What does this crop need?'),
  whose: N_('Which crop needs this?'),
  part: N_('Which part of this plant do we eat?'),
  tuber: N_('Which crop gives us a tuber from under the soil?'),
  food: N_('Which food is made from this crop?'),
  from: N_('Which crop is this food made from?'),
  ready: N_('It is {now}. What do we plant now, to be ready for {festival}?'),
  afterRice: N_('The rice is cut in September. What is sown in the same field in autumn?'),
  afterWheat: N_('The wheat is cut as summer begins. What is planted in the same field in June?'),
  year: N_('One field, one whole year. Put its jobs in order. Start with planting the rice.'),
};
const WHY = {
  orderSome: N_('The green cards are right. Try the others again.'),
  orderNone: N_('Think again: which one comes first of all?'),
  fastest: N_('Potatoes are the quickest: about 3 to 4 months from planting to digging.'),
  slowest: N_('Winter wheat is the slowest: about 7 to 8 months, right through the winter.'),
  winter: N_('Only winter wheat stays out in the cold. Rice and potatoes would freeze.'),
  afterRice: N_('Wheat follows rice: it is sown in autumn and grows through the winter.'),
  afterWheat: N_('Rice follows wheat: the seedlings wait in the nursery bed until the field is free.'),
  year: N_('Rice in summer, wheat in winter: two harvests a year, and the field is hardly ever empty.'),
  wrongSeason: {
    rice: N_('Rice needs warmth: it is sown in May, never in the cold months.'),
    wheat: N_('Winter wheat is sown in autumn, in November, and needs the winter.'),
    potato: N_('Potatoes are planted in March, as soon as the soil wakes up.'),
  },
};

/** The three levels: how many puzzles, which crops, which kinds (in this order on a guided first play). */
export const LEVEL = {
  easy: { count: 5, crops: ['rice', 'potato'], labels: true, choices: 3, plan: ['order', 'next', 'order', 'next', 'order'] },
  normal: { count: 7, crops: CROPS.map(c => c.id), labels: true, choices: 4, plan: ['order', 'howlong', 'needs', 'part', 'next', 'food', 'odd'] },
  hard: { count: 9, crops: CROPS.map(c => c.id), labels: false, choices: 4, plan: ['mixed', 'plan', 'howlong', 'odd', 'next', 'plan', 'food', 'needs', 'part'] },
};
/** The kinds of puzzle a level promises (what tests and the menu text rely on). */
export const TYPES = Object.fromEntries(Object.entries(LEVEL).map(([l, v]) => [l, [...new Set(v.plan)]]));
/** The guided first play opens with the life of rice in four big steps. */
export const FIRST_ROW = ['rice.seed', 'rice.transplant', 'rice.golden', 'rice.harvest'];
/** How many cards an order row holds at most (seven would not fit a phone at a size a finger can hit). */
export const ROW_MAX = 5;

// ------------------------------------------------------------------------------------------------ random
const pick = (r, list) => list[Math.floor(r() * list.length)];
function shuffle(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sample = (r, list, n) => shuffle(r, list).slice(0, n);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
/** n cards of a crop's life, still in their order. */
function partOfLife(r, id, n) {
  const all = cardsOf(id);
  return sample(r, all.map((_, i) => i), Math.min(n, all.length)).sort((x, y) => x - y).map(i => all[i]);
}
const arc = (id, crop = id) => ({ from: CROP[id].months[0], to: CROP[id].months[1], crop });

// ------------------------------------------------------------------------------------------------ the puzzles
// Every puzzle: { type, key, prompt, labels, why: [lines], topic } plus
//   order            cards (the tray, shuffled), slots (how many), answer: [card…], extra: cards that stay out
//   the choice kinds choices: [card…], answer: one of them, and what is shown: row / show / wheel
//   wheel            { arcs: [{ from, to, crop | null }], legend, now, flag }: the year wheel over the cards
//   vars             what the prompt names: { now, festival } (source strings, translated one by one)
// topic: what a wrong crop card is told about ('when' | 'needs' | 'foods' | 'part' | 'season').
const MAKE = {
  order(r, L, level) {
    const id = pick(r, L.crops);
    const answer = partOfLife(r, id, level === 'easy' ? 3 + Math.floor(r() * 2) : ROW_MAX);
    let cards = shuffle(r, answer);
    while (same(cards, answer)) cards = shuffle(r, answer);
    return { type: 'order', key: `order:${answer.join(',')}`, prompt: PROMPT.order, crop: id, cards, slots: answer.length, answer, extra: [], why: [CROP[id].cycle] };
  },
  mixed(r, L) {
    const id = pick(r, L.crops), other = pick(r, L.crops.filter(c => c !== id));
    const life = partOfLife(r, id, 4 + Math.floor(r() * 2));
    const extra = sample(r, cardsOf(other), 2);
    let cards = shuffle(r, [...life, ...extra]);
    while (same(cards.slice(0, life.length), life)) cards = shuffle(r, [...life, ...extra]);
    return { type: 'order', mixed: true, key: `mixed:${life.join(',')}+${extra.slice().sort().join(',')}`, prompt: PROMPT.mixed, crop: id,
      cards, slots: life.length, answer: life, extra, why: [CROP[id].cycle] };
  },
  next(r, L, level) {
    const id = pick(r, L.crops), all = cardsOf(id);
    // a window of the life (five cards at most) with one gap; Easy never asks for the very first card
    const from = Math.floor(r() * (all.length - ROW_MAX + 1)), row = all.slice(from, from + ROW_MAX);
    const gap = level === 'easy' ? 1 + Math.floor(r() * (row.length - 1)) : Math.floor(r() * row.length);
    const answer = row[gap], phase = CARD[answer].phase;
    const others = L.crops.filter(c => c !== id).flatMap(cardsOf);
    // Difficult: the wrong cards are the same moment of the other crops where there is one
    const alike = others.filter(c => CARD[c].phase === phase);
    const wrong = level === 'hard' ? [...shuffle(r, alike), ...shuffle(r, others.filter(c => !alike.includes(c)))].slice(0, L.choices - 1) : sample(r, others, L.choices - 1);
    return { type: 'next', key: `next:${answer}`, prompt: PROMPT.next, crop: id, row: row.map((c, i) => (i === gap ? null : c)),
      choices: shuffle(r, [answer, ...wrong]), answer, why: [CARD[answer].fact] };
  },
  odd(r, L) {
    const id = pick(r, L.crops), other = pick(r, L.crops.filter(c => c !== id));
    const three = sample(r, cardsOf(id), 3), answer = pick(r, cardsOf(other));
    return { type: 'odd', key: `odd:${three.slice().sort().join(',')}/${answer}`, prompt: PROMPT.odd, crop: id,
      choices: shuffle(r, [...three, answer]), answer, why: [CARD[answer].fact, CROP[id].cycle] };
  },
  howlong(r, L) {
    const kind = pick(r, ['span', 'span', 'span', 'fastest', 'slowest', 'winter']);
    const crops = L.crops, choices = shuffle(r, crops.map(cropCard));
    if (kind === 'span') {
      const id = pick(r, crops);
      return { type: 'howlong', kind, key: `span:${id}`, prompt: PROMPT.span, crop: id, topic: 'when', wheel: { arcs: [arc(id, null)], legend: false }, choices, answer: cropCard(id), why: [CROP[id].when] };
    }
    const by = crops.slice().sort((a, b) => spanOf(a) - spanOf(b));
    const id = kind === 'fastest' ? by[0] : kind === 'slowest' ? by[by.length - 1] : crops.find(c => [12, 1, 2].every(m => inField(c, m)));
    return { type: 'howlong', kind, key: `howlong:${kind}`, prompt: PROMPT[kind], crop: id, topic: 'when', wheel: { arcs: crops.map(c => arc(c)), legend: true }, choices, answer: cropCard(id), why: [WHY[kind]] };
  },
  needs(r, L) {
    const crops = L.crops;
    if (r() < 0.4) {
      // what does this crop need? (potatoes have two cards of their own, so they are asked the other way round)
      const id = pick(r, ['rice', 'wheat']), answer = `need.${id === 'rice' ? 'water' : 'cold'}`;
      return { type: 'needs', kind: 'need', key: `need:${id}`, prompt: PROMPT.need, crop: id, show: [cropCard(id)], choices: shuffle(r, Object.keys(NEEDS).map(k => `need.${k}`)), answer, why: [CROP[id].needs] };
    }
    const k = pick(r, Object.keys(NEEDS)), id = NEEDS[k].crop;
    return { type: 'needs', kind: 'whose', key: `whose:${k}`, prompt: PROMPT.whose, crop: id, topic: 'needs', show: [`need.${k}`], choices: shuffle(r, crops.map(cropCard)), answer: cropCard(id), why: [NEEDS[k].fact] };
  },
  part(r, L) {
    if (r() < 0.25) return { type: 'part', kind: 'tuber', key: 'part:tuber', prompt: PROMPT.tuber, crop: 'potato', topic: 'part', show: ['part.tuber'], choices: shuffle(r, L.crops.map(cropCard)), answer: cropCard('potato'), why: [PARTS.tuber.fact] };
    const id = pick(r, L.crops), answer = `part.${PART_OF[id]}`;
    return { type: 'part', kind: 'part', key: `part:${id}`, prompt: PROMPT.part, crop: id, show: [cropCard(id)], choices: shuffle(r, Object.keys(PARTS).map(k => `part.${k}`)), answer, why: [PARTS[PART_OF[id]].fact] };
  },
  food(r, L) {
    const k = pick(r, Object.keys(FOODS)), f = FOODS[k], id = f.crop;
    if (r() < 0.5) return { type: 'food', kind: 'from', key: `from:${k}`, prompt: PROMPT.from, crop: id, topic: 'foods', show: [`food.${k}`], choices: shuffle(r, L.crops.map(cropCard)), answer: cropCard(id), why: [f.fact] };
    let noodles = f.noodle ? 1 : 0;
    const wrong = shuffle(r, Object.keys(FOODS).filter(o => FOODS[o].crop !== id)).filter(o => !FOODS[o].noodle || ++noodles <= 1).slice(0, L.choices - 1);
    return { type: 'food', kind: 'food', key: `food:${k}`, prompt: PROMPT.food, crop: id, show: [cropCard(id)], choices: shuffle(r, [k, ...wrong].map(o => `food.${o}`)), answer: `food.${k}`, why: [f.fact] };
  },
  plan(r, L) {
    const kind = pick(r, ['ready', 'ready', 'ready', 'follow', 'follow', 'year']);
    const choices = shuffle(r, L.crops.map(cropCard));
    if (kind === 'ready') {
      // the month a crop goes into the ground, and the first festival after its harvest
      const [id, festival] = pick(r, [['potato', 7], ['rice', 10], ['wheat', 7]]), now = CROP[id].months[0];
      return { type: 'plan', kind, key: `ready:${id}`, prompt: PROMPT.ready, vars: { now: MONTHS[now - 1], festival: FESTIVALS[festival] }, crop: id, topic: 'season',
        wheel: { arcs: [], legend: false, now, flag: festival }, choices, answer: cropCard(id), why: [CROP[id].when] };
    }
    if (kind === 'follow') {
      const after = pick(r, ['rice', 'wheat']), id = after === 'rice' ? 'wheat' : 'rice';
      return { type: 'plan', kind, key: `follow:${after}`, prompt: after === 'rice' ? PROMPT.afterRice : PROMPT.afterWheat, crop: id, topic: 'season',
        wheel: { arcs: [arc(after)], legend: true, now: after === 'rice' ? 11 : 6 }, choices, answer: cropCard(id), why: [after === 'rice' ? WHY.afterRice : WHY.afterWheat] };
    }
    // one field through a year: planting the rice, (its golden heads,) the rice harvest, sowing wheat, (its winter sprouts,) the wheat harvest
    const answer = ['rice.transplant', ...(r() < 0.5 ? ['rice.golden'] : []), 'rice.harvest', 'wheat.sow', ...(r() < 0.5 ? ['wheat.sprout'] : []), 'wheat.harvest'].slice(0, ROW_MAX + 1);
    const row = answer.length > ROW_MAX ? answer.filter(c => c !== 'rice.golden') : answer;
    let cards = shuffle(r, row);
    while (same(cards, row)) cards = shuffle(r, row);
    return { type: 'order', year: true, kind, key: `year:${row.join(',')}`, prompt: PROMPT.year, crop: 'rice', cards, slots: row.length, answer: row, extra: [], why: [WHY.year] };
  },
};

/**
 * Deal a round: { level, seed, puzzles }. `first`: the guided first play (Easy, the plan in its written order, the
 * life of rice in four big steps to begin with). A round never holds the same puzzle twice.
 */
export function makeRound({ level = 'normal', seed = 1, first = false } = {}) {
  const L = LEVEL[level] || LEVEL.normal, lv = LEVEL[level] ? level : 'normal';
  const r = rng(seed), seen = new Set(), puzzles = [];
  const plan = first ? L.plan.slice() : shuffle(r, L.plan);
  for (const kind of plan) {
    let p = null;
    if (first && !puzzles.length) {
      let cards = shuffle(r, FIRST_ROW);
      while (same(cards, FIRST_ROW)) cards = shuffle(r, FIRST_ROW);
      p = { type: 'order', key: `order:${FIRST_ROW.join(',')}`, prompt: PROMPT.order, crop: 'rice', cards, slots: FIRST_ROW.length, answer: FIRST_ROW.slice(), extra: [], why: [CROP.rice.cycle] };
    } else for (let tries = 0; tries < 300 && !p; tries++) {
      const q = MAKE[kind](r, L, lv);
      if (!seen.has(q.key)) p = q;
    }
    if (!p) continue;                               // (cannot happen: every kind has more puzzles than a round asks)
    seen.add(p.key);
    p.kindOf = kind;
    p.labels = L.labels;
    puzzles.push(p);
  }
  return { level: lv, seed, puzzles };
}

// ------------------------------------------------------------------------------------------------ answers
/**
 * Check an answer. Order puzzles take the slots as a list of cards (null for an empty slot): { right, good: [bool…] }.
 * The others take the chosen card: { right }.
 */
export function check(p, answer) {
  if (p.type === 'order') {
    const good = p.answer.map((c, i) => answer?.[i] === c);
    return { right: good.every(Boolean), good };
  }
  return { right: answer === p.answer };
}
/** The answer of a puzzle (for the tests, the QA autopilot and the reveal after three misses). */
export const solve = p => (p.type === 'order' ? p.answer.slice() : p.answer);

/**
 * The kind line after an answer: source strings, each translated by itself and joined with a space. A right answer
 * says why it is right; a wrong one says something true about the chosen card, so the next try is a thought, not a guess.
 */
export function explain(p, answer, right = check(p, answer).right) {
  if (right) return p.why;
  if (p.type === 'order') return [check(p, answer).good.some(Boolean) ? WHY.orderSome : WHY.orderNone];
  const c = CARD[answer];
  if (!c) return [WHY.orderNone];
  if (c.kind === 'crop') {
    const crop = CROP[c.crop];
    return [p.topic === 'season' ? WHY.wrongSeason[c.crop] : crop[p.topic] || crop.cycle];
  }
  return [c.fact];
}

// ------------------------------------------------------------------------------------------------ score
export const POINTS = [10, 6, 3];          // right at the first, second, third try; after three misses the answer is shown
export const MAX_MISSES = POINTS.length;
export const pointsFor = misses => POINTS[misses] || 0;
const BONUS_MAX = { easy: 0, normal: 3, hard: 5 };
/**
 * A small thank-you for steady thinking on Normal and Difficult: one point for every ten seconds left of the level's
 * length, capped. Never shown as a clock, never needed for the stars, and nothing on Easy.
 */
export function quickBonus(level, seconds, length) {
  return Math.max(0, Math.min(BONUS_MAX[level] || 0, Math.floor((length - seconds) / 10)));
}
/** The best a round can score without the bonus. */
export const maxScore = level => (LEVEL[level] || LEVEL.normal).count * POINTS[0];
