// From egg to wings: the rules of the life-cycle card game (pure: no three.js, no DOM; tests/lifecycle.test.mjs).
//
// Five animals, each a row of stages in the order they happen. Every puzzle is built from those rows with a seed, so a
// round is different every time, always solvable, and never asks the same thing twice:
//   order  put shuffled stage cards in order (Difficult: two extra cards of another animal must be left out)
//   next   a life with one gap: which card fills it?
//   odd    four cards, three from one animal's life and one stranger
//   baby   whose young one is this? (Difficult: the other way round, which young one grows into this animal?)
//   home   where does this stage live: water, plant, soil or air?
//   grid   rows = animals, columns = egg / young / grown-up, one cell missing (Difficult)
//   logic  a question about the whole life: who rests as a pupa, who grows up under water… (Difficult)
// Texts are English source strings (translated with tx() by the game; collected by scripts/i18n-extract.mjs).
import { N_ } from '../../i18n/i18n.js';

/** Where a stage lives. */
export const HOMES = ['water', 'leaf', 'soil', 'air'];
export const HOME_NAME = { water: N_('In the water'), leaf: N_('On a plant'), soil: N_('In the soil'), air: N_('In the air') };

// role: egg | young | mid | pupa | adult (the grid's columns are egg, young and adult; only two animals have a pupa).
// home: null where a child could fairly say two places (a frog, a grasshopper in flight): never asked.
const st = (id, name, role, home, fact) => ({ id, name, role, home, fact });
export const ANIMALS = [
  {
    id: 'butterfly', name: N_('Butterfly'), pupa: true, wings: true,
    cycle: N_('Egg, caterpillar, chrysalis, butterfly: four very different shapes.'),
    stages: [
      st('egg', N_('Butterfly eggs'), 'egg', 'leaf', N_('A butterfly lays her tiny eggs on a leaf that her babies can eat.')),
      st('caterpillar', N_('Caterpillar'), 'young', 'leaf', N_('A caterpillar hatches from a butterfly egg and munches leaves all day.')),
      st('chrysalis', N_('Chrysalis'), 'pupa', 'leaf', N_('Inside the chrysalis the caterpillar rests and slowly becomes a butterfly.')),
      st('adult', N_('Butterfly'), 'adult', 'air', N_('The butterfly comes out, dries its new wings and flies from flower to flower.')),
    ],
  },
  {
    id: 'mosquito', name: N_('Mosquito'), pupa: true, wings: true,
    cycle: N_('Egg raft, wriggler, tumbler, mosquito: the first three live in water.'),
    stages: [
      st('raft', N_('Egg raft'), 'egg', 'water', N_('A mosquito lays her eggs in a tiny raft that floats on still water.')),
      st('wriggler', N_('Wriggler'), 'young', 'water', N_('A wriggler is a baby mosquito. It hangs under the water and breathes through a tube.')),
      st('tumbler', N_('Tumbler'), 'pupa', 'water', N_('A tumbler is a mosquito pupa. It tumbles down in the water when a shadow passes.')),
      st('adult', N_('Mosquito'), 'adult', 'air', N_('The grown mosquito climbs out of the water, dries its wings and flies away.')),
    ],
  },
  {
    id: 'grasshopper', name: N_('Grasshopper'), pupa: false, wings: true,
    cycle: N_('Eggs, small nymph, big nymph, grasshopper: it only grows bigger. No pupa!'),
    stages: [
      st('eggs', N_('Grasshopper eggs'), 'egg', 'soil', N_('A grasshopper pushes her eggs into the soil, where they wait for spring.')),
      st('nymph', N_('Small nymph'), 'young', 'leaf', N_('A young grasshopper is called a nymph. It looks like its parents, with no wings yet.')),
      st('bignymph', N_('Big nymph'), 'mid', 'leaf', N_('The nymph sheds its skin again and again. Little wing buds show on its back.')),
      st('adult', N_('Grasshopper'), 'adult', null, N_('After its last moult the grasshopper has long wings. It never was a pupa!')),
    ],
  },
  {
    id: 'frog', name: N_('Frog'), pupa: false, wings: false,
    cycle: N_('Frogspawn, tadpole, legs, froglet, frog: from the water to the land.'),
    stages: [
      st('spawn', N_('Frogspawn'), 'egg', 'water', N_('Frogspawn is a cloud of jelly eggs that floats in a pond.')),
      st('tadpole', N_('Tadpole'), 'young', 'water', N_('A tadpole is a baby frog. It swims with its tail and breathes under water.')),
      st('legs', N_('Tadpole with legs'), 'mid', 'water', N_('The back legs grow first, then the front legs. The tadpole still lives in water.')),
      st('froglet', N_('Froglet'), 'mid', null, N_('A froglet has four legs, and its tail gets shorter every day.')),
      st('adult', N_('Frog'), 'adult', null, N_('The grown frog has no tail. It breathes air and hops on land.')),
    ],
  },
  {
    id: 'dragonfly', name: N_('Dragonfly'), pupa: false, wings: true,
    cycle: N_('Eggs, nymph, dragonfly: the young live under water, and there is no pupa.'),
    stages: [
      st('eggs', N_('Dragonfly eggs'), 'egg', 'water', N_('A dragonfly dips her tail into the pond and lays her eggs on a water plant.')),
      st('nymph', N_('Dragonfly nymph'), 'young', 'water', N_('A dragonfly nymph lives under water for a long time and hunts there.')),
      st('adult', N_('Dragonfly'), 'adult', 'air', N_('The nymph climbs up a stem, its skin splits, and a dragonfly flies away. No pupa!')),
    ],
  },
];
export const ANIMAL = Object.fromEntries(ANIMALS.map(a => [a.id, a]));
/** Every stage by its card id (`animal.stage`): { id, animal, index, name, role, home, fact }. */
export const STAGE = {};
for (const a of ANIMALS) a.stages.forEach((s, i) => { STAGE[`${a.id}.${s.id}`] = { ...s, id: `${a.id}.${s.id}`, animal: a.id, index: i }; });
export const cardsOf = id => ANIMAL[id].stages.map(s => `${id}.${s.id}`);
const byRole = (id, role) => cardsOf(id).find(c => STAGE[c].role === role);
export const adultOf = id => byRole(id, 'adult');

export const PROMPT = {
  order: N_('Put the cards in order, from first to last.'),
  mixed: N_('Two lives got mixed up. Fill the row with one life, in order.'),
  next: N_('Which card fills the gap?'),
  odd: N_('Which card does not belong with the others?'),
  baby: N_('Who will this little one grow up to be?'),
  young: N_('Which little one grows into this animal?'),
  home: N_('Where does it live?'),
  grid: N_('Each row is one animal growing up. Which card is missing?'),
  pupa: N_('Which one rests as a pupa before it gets its wings?'),
  nopupa: N_('Which one never has a pupa stage?'),
  waterfly: N_('Which one grows up under water and then flies away?'),
  copy: N_('Whose young look like a small copy of the grown-up?'),
};
const WHY = {
  pupa: N_('Butterflies and mosquitoes rest as a pupa. Grasshoppers, dragonflies and frogs never do.'),
  waterfly: N_('Young mosquitoes and dragonflies live in water. Then they climb out and fly.'),
  copy: N_('A grasshopper nymph already looks like its parents. It only has to grow its wings.'),
  home: N_('Not there. Look at the picture once more.'),
  orderSome: N_('The green cards are right. Try the others again.'),
  orderNone: N_('Think again: which one comes first of all?'),
};

/** The three levels: how many puzzles, which animals, which kinds (in this order on a guided first play). */
export const LEVEL = {
  easy: { count: 5, animals: ['butterfly', 'frog'], labels: true, choices: 3, plan: ['order', 'next', 'order', 'next', 'order'] },
  normal: { count: 7, animals: ANIMALS.map(a => a.id), labels: true, choices: 4, plan: ['order', 'odd', 'baby', 'home', 'next', 'order', 'odd'] },
  hard: { count: 9, animals: ANIMALS.map(a => a.id), labels: false, choices: 4, plan: ['mixed', 'grid', 'logic', 'odd', 'next', 'young', 'grid', 'logic', 'order'] },
};
/** The kinds of puzzle a level promises (what tests and the menu text rely on). */
export const TYPES = Object.fromEntries(Object.entries(LEVEL).map(([l, v]) => [l, [...new Set(v.plan)]]));

// ------------------------------------------------------------------------------------------------ random
/** A small seeded generator (mulberry32): the same seed always deals the same round. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
function shuffle(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sample = (r, list, n) => shuffle(r, list).slice(0, n);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ------------------------------------------------------------------------------------------------ the puzzles
// Every puzzle: { type, key, prompt, labels, why: [lines] } plus
//   order            cards (the tray, shuffled), slots (how many), answer: [card…], extra: cards that stay out
//   the choice kinds choices: [card | 'home.<h>'], answer: one of them, and what is shown: row / show / grid
const MAKE = {
  order(r, L, level) {
    const a = ANIMAL[pick(r, L.animals.filter(id => ANIMAL[id].stages.length >= (level === 'easy' ? 3 : 4)))];
    const all = cardsOf(a.id);
    // Easy: three or four cards (a part of the life, still in its order); otherwise the whole life (four or five cards)
    const n = level === 'easy' ? 3 + Math.floor(r() * 2) : all.length;
    const keep = sample(r, all.map((_, i) => i), Math.min(n, all.length)).sort((x, y) => x - y);
    const answer = keep.map(i => all[i]);
    let cards = shuffle(r, answer);
    while (same(cards, answer)) cards = shuffle(r, answer);
    return { type: 'order', key: `order:${answer.join(',')}`, prompt: PROMPT.order, animal: a.id, cards, slots: answer.length, answer, extra: [], why: [a.cycle] };
  },
  mixed(r, L) {
    const a = ANIMAL[pick(r, L.animals.filter(id => ANIMAL[id].stages.length >= 4))];
    const b = ANIMAL[pick(r, L.animals.filter(id => id !== a.id))];
    const full = cardsOf(a.id);
    // a five-stage life is sometimes shown as four cards: its first three and the grown-up
    const life = full.length > 4 && r() < 0.5 ? [...full.slice(0, 3), full[full.length - 1]] : full;
    const extra = sample(r, cardsOf(b.id), 2);
    let cards = shuffle(r, [...life, ...extra]);
    while (same(cards.slice(0, life.length), life)) cards = shuffle(r, [...life, ...extra]);
    return { type: 'order', mixed: true, key: `mixed:${life.join(',')}+${extra.slice().sort().join(',')}`, prompt: PROMPT.mixed, animal: a.id,
      cards, slots: life.length, answer: life, extra, why: [a.cycle] };
  },
  next(r, L, level) {
    const a = ANIMAL[pick(r, L.animals)], row = cardsOf(a.id);
    const gap = level === 'easy' ? 1 + Math.floor(r() * (row.length - 1)) : Math.floor(r() * row.length);
    const answer = row[gap], role = STAGE[answer].role;
    const others = L.animals.filter(id => id !== a.id).flatMap(cardsOf);
    // Difficult: the wrong cards are the same moment of other lives (another pupa, another young one) where there is one
    const alike = others.filter(c => STAGE[c].role === role || (role === 'mid' && STAGE[c].role === 'pupa') || (role === 'pupa' && STAGE[c].role === 'mid'));
    const wrong = level === 'hard' ? [...sample(r, alike, L.choices - 1), ...shuffle(r, others.filter(c => !alike.includes(c)))].slice(0, L.choices - 1) : sample(r, others, L.choices - 1);
    return { type: 'next', key: `next:${answer}`, prompt: PROMPT.next, animal: a.id, row: row.map((c, i) => (i === gap ? null : c)),
      choices: shuffle(r, [answer, ...wrong]), answer, why: [STAGE[answer].fact] };
  },
  odd(r, L) {
    const a = ANIMAL[pick(r, L.animals)], b = ANIMAL[pick(r, L.animals.filter(id => id !== a.id))];
    const three = sample(r, cardsOf(a.id), 3), answer = pick(r, cardsOf(b.id));
    return { type: 'odd', key: `odd:${three.slice().sort().join(',')}/${answer}`, prompt: PROMPT.odd, animal: a.id,
      choices: shuffle(r, [...three, answer]), answer, why: [STAGE[answer].fact, a.cycle] };
  },
  baby(r, L) {
    const young = pick(r, L.animals.flatMap(cardsOf).filter(c => !['egg', 'adult'].includes(STAGE[c].role)));
    const a = STAGE[young].animal;
    const wrong = sample(r, L.animals.filter(id => id !== a), L.choices - 1).map(adultOf);
    return { type: 'baby', key: `baby:${young}`, prompt: PROMPT.baby, animal: a, show: [young], choices: shuffle(r, [adultOf(a), ...wrong]), answer: adultOf(a), why: [STAGE[young].fact] };
  },
  young(r, L) {
    const a = pick(r, L.animals), answer = byRole(a, 'young');
    const wrong = sample(r, L.animals.filter(id => id !== a), L.choices - 1).map(id => byRole(id, 'young'));
    return { type: 'baby', reverse: true, key: `young:${a}`, prompt: PROMPT.young, animal: a, show: [adultOf(a)], choices: shuffle(r, [answer, ...wrong]), answer, why: [STAGE[answer].fact] };
  },
  home(r, L) {
    const card = pick(r, L.animals.flatMap(cardsOf).filter(c => STAGE[c].home));
    return { type: 'home', key: `home:${card}`, prompt: PROMPT.home, animal: STAGE[card].animal, show: [card], choices: HOMES.map(h => `home.${h}`), answer: `home.${STAGE[card].home}`, why: [STAGE[card].fact] };
  },
  grid(r, L) {
    const rows = sample(r, L.animals, 3), cols = ['egg', 'young', 'adult'];
    const grid = rows.map(id => cols.map(role => byRole(id, role)));
    const i = Math.floor(r() * 3), j = Math.floor(r() * 3), answer = grid[i][j];
    grid[i][j] = null;
    const rest = L.animals.filter(id => !rows.includes(id));
    // the wrong cards: the same moment of the two lives that are not on the board, and a moment of this life the board skips
    const wrong = rest.map(id => byRole(id, cols[j]));
    const skipped = cardsOf(rows[i]).filter(c => !cols.includes(STAGE[c].role));
    wrong.push(skipped.length ? pick(r, skipped) : byRole(rest[0], cols[(j + 1) % 3]));
    return { type: 'grid', key: `grid:${answer}:${rows.slice().sort().join(',')}`, prompt: PROMPT.grid, animal: rows[i], grid, choices: shuffle(r, [answer, ...wrong]), answer, why: [STAGE[answer].fact] };
  },
  logic(r) {
    const kind = pick(r, ['pupa', 'pupa', 'nopupa', 'nopupa', 'waterfly', 'waterfly', 'copy']);
    let yes, no, why = WHY[kind] || WHY.pupa;
    if (kind === 'pupa') { yes = pick(r, ['butterfly', 'mosquito']); no = ['grasshopper', 'dragonfly', 'frog']; }
    else if (kind === 'nopupa') { yes = pick(r, ['grasshopper', 'dragonfly']); no = ['butterfly', 'mosquito']; }
    else if (kind === 'waterfly') { yes = pick(r, ['mosquito', 'dragonfly']); no = ['butterfly', 'grasshopper', 'frog']; }
    else { yes = 'grasshopper'; no = ['butterfly', 'mosquito', 'frog']; }
    return { type: 'logic', kind, key: `logic:${kind}:${yes}`, prompt: PROMPT[kind], animal: yes, choices: shuffle(r, [yes, ...no].map(adultOf)), answer: adultOf(yes), why: [why] };
  },
};

/**
 * Deal a round: { level, seed, puzzles }. `first`: the guided first play (Easy, the plan in its written order: one
 * puzzle of each kind first, the butterfly's whole life to begin with). A round never holds the same puzzle twice.
 */
export function makeRound({ level = 'normal', seed = 1, first = false } = {}) {
  const L = LEVEL[level] || LEVEL.normal, lv = LEVEL[level] ? level : 'normal';
  const r = rng(seed), seen = new Set(), puzzles = [];
  const plan = first ? L.plan.slice() : shuffle(r, L.plan);
  for (const kind of plan) {
    let p = null;
    for (let tries = 0; tries < 200; tries++) {
      const opening = first && !puzzles.length;
      const q = MAKE[kind](r, opening ? { ...L, animals: ['butterfly'] } : L, opening ? 'normal' : lv);
      if (!seen.has(q.key)) { p = q; break; }
    }
    if (!p) continue;                               // (cannot happen: every kind has far more puzzles than a round asks)
    seen.add(p.key);
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
 * says why it is right; a wrong one says what the chosen card really is, so the next try is a thought, not a guess.
 */
export function explain(p, answer, right = check(p, answer).right) {
  if (right) return p.why;
  if (p.type === 'order') return [check(p, answer).good.some(Boolean) ? WHY.orderSome : WHY.orderNone];
  if (p.type === 'home') return [WHY.home];
  const s = STAGE[answer];
  if (!s) return [WHY.home];
  return [p.type === 'logic' || (p.type === 'baby' && !p.reverse) ? ANIMAL[s.animal].cycle : s.fact];
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
