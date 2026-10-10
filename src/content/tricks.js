// Grandma's Countryside Tricks (docs/RURAL-TRICKS.md): real rural things to do, each a short game taught once by
// Grandma (Rin in Classic). Pure data, Node-readable; the framework is src/game/tricks.js, each game src/game/tricks/<id>.js.
//
// place: where the trick sign stands (dry ground; tests/tricks.test.mjs checks it with placeProblems).
// seasons / hours: when it can be played. hours [from, to] wraps past midnight. A frozen story clock never blocks a trick
// (the round puts on its own night look); a running clock (Explore cycle) must be inside the hours.
// stars: score needed for 1, 2 and 3 stars. length: round seconds; firstLength: the guided first try.
// Texts are English source strings (translated with tx(); collected by scripts/i18n-extract.mjs).

export const TRICKS = [
  {
    id: 'firefly', name: 'Firefly jar', icon: 'trick-firefly',
    place: { x: -66, z: 10, face: -Math.PI / 2 }, where: 'the paddy edge, west of Kawabe',
    seasons: ['summer'], hours: [19.5, 4], night: true, when: 'Summer, dusk to night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_firefly_intro',
    howReal: 'On a warm, still summer night, go with a grown-up to a clean stream far from street lights. Wait quietly, then scoop gently with a soft net.',
    why: 'Fireflies flash to talk to each other, and each kind has its own blink pattern. They need clean water and real darkness.',
    safety: 'Always let them go before bed, right where you found them.',
    stars: [6, 10, 14], length: 60, firstLength: 35, unit: 'fireflies',
  },
  {
    id: 'river', name: 'Night river lantern', icon: 'trick-river',
    place: { x: -6, z: 22, face: Math.PI / 2 }, where: 'the Kawabe shallows, by the dock',
    seasons: ['spring', 'summer', 'autumn'], hours: [20, 4], night: true, when: 'Spring to autumn, at night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_river_intro',
    howReal: 'With a grown-up, wade only ankle-deep shallows with a torch. Move slowly and look straight down into the circle of light.',
    why: 'Many fish rest near the bottom at night. Shrimp eyes shine back in a torch beam like a cat\'s: that is called eyeshine.',
    safety: 'Only go to the river at night with a grown-up, and stay in the shallows.',
    stars: [5, 10, 15], length: 80, firstLength: 30, unit: 'fish spotted',
  },
  {
    id: 'stars', name: 'Stargazing', icon: 'trick-stars',
    place: { x: -62, z: 158, face: Math.PI }, where: 'the hill behind the signal cottage',
    seasons: ['spring', 'summer', 'autumn', 'winter'], hours: [20, 4.5], night: true, clear: true, when: 'Any clear night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_stars_intro',
    howReal: 'Find a dark place away from town lights and give your eyes 15 minutes to get used to the dark. Find the Big Dipper, then follow its two end stars.',
    why: 'Without city lights you can see about ten times more stars. The North Star barely moves all night, so travellers used it to find north.',
    safety: 'Wrap up warm, and go with a grown-up.',
    stars: [50, 75, 95], length: 90, firstLength: 120, unit: 'points',
  },
  {
    id: 'frogs', name: 'Frog chorus', icon: 'trick-frogs',
    place: { x: -73, z: -9, face: 0 }, where: 'the bottom paddies, west of Kawabe',
    seasons: ['spring', 'summer'], hours: [17.5, 22.5], night: false, when: 'Spring and summer, at dusk',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_frogs_intro',
    howReal: 'After a warm rain, visit a paddy or pond at dusk. Walk only while the frogs sing, and freeze when they stop.',
    why: 'Frogs sing loudest after rain. The puffed-up throat pouch works like a speaker, and only the males call.',
    safety: 'Wet your hands before you hold a frog, and put it back where you found it.',
    stars: [30, 60, 90], length: 70, firstLength: 30, unit: 'points',
  },
  // ---- phase 2 (docs/RURAL-TRICKS.md §6)
  {
    id: 'kite', name: 'Make and fly a kite', icon: 'trick-kite',
    place: { x: -28, z: 76, face: Math.PI }, where: 'the cow meadow, south of Kawabe',
    seasons: ['autumn', 'winter'], hours: [9, 17], night: false, when: 'Autumn and winter, on a windy day',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_kite_intro',
    howReal: 'Tie two thin bamboo sticks into a cross, glue on light paper and add a long tail. Stand with your back to the wind in a wide open field.',
    why: 'Wind is steadier higher up, away from trees and roofs. The tail keeps a kite from spinning.',
    safety: 'Fly far from power lines and roads, and never in a storm.',
    stars: [40, 70, 100], length: 60, firstLength: 60, unit: 'points',
  },
  {
    id: 'dew', name: 'Dew webs at dawn', icon: 'trick-dew',
    place: { x: -52, z: -97, face: 0 }, where: 'the forest edge on the west trail, north of the mill',
    seasons: ['spring', 'summer', 'autumn'], hours: [5, 7.5], night: false, when: 'Spring to autumn, at dawn',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_dew_intro',
    howReal: 'Get up at sunrise after a cool, still night. Walk slowly along a hedge with the sun behind you and look low between the stems.',
    why: 'Webs are almost invisible until dew or mist hangs tiny drops on every thread. Each drop shines like a little lens.',
    safety: 'Look, don\'t touch: a web is a spider\'s home and its dinner table.',
    stars: [30, 60, 75], length: 90, firstLength: 70, unit: 'points',
  },
  {
    id: 'roast', name: 'Sweet potato roast', icon: 'trick-roast',
    place: { x: -19, z: 51, face: -Math.PI / 2 }, where: 'the open meadow south of Kawabe, past the dock lane',
    seasons: ['autumn'], hours: [15, 19], night: false, when: 'Autumn, late afternoon',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_roast_intro',
    howReal: 'A grown-up burns a pile of dry straw down to glowing ash. Bury the sweet potatoes in the ash and wait about forty minutes.',
    why: 'Ash keeps an even, gentle heat, like an oven. Slow heat turns the potato\'s starch into sugar.',
    safety: 'Fires are for grown-ups: a grown-up lights the straw.',
    stars: [30, 60, 90], length: 70, firstLength: 40, unit: 'points',
  },
  {
    id: 'beetles', name: 'Beetle sap trap', icon: 'trick-beetles',
    place: { x: 92, z: -103, face: Math.PI }, where: 'the chestnut grove on the shrine trail, past the orchard gate',
    seasons: ['summer'], hours: [17, 21], night: false, when: 'Summer: set at dusk, check at dawn',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_beetles_intro',
    howReal: 'At dusk, rub mashed banana and a little sugar on the bark of an oak or chestnut. Come back at dawn and look, gently.',
    why: 'Beetles drink sweet tree sap at night. Oak and chestnut are their favourite trees.',
    safety: 'Put every beetle back on the tree where you found it.',
    stars: [30, 60, 90], length: 70, firstLength: 40, unit: 'points',
  },
];

export const TRICK = Object.fromEntries(TRICKS.map(t => [t.id, t]));

/** True when `hour` lies in [from, to), wrapping past midnight when from > to. */
export function inHours(hour, [from, to]) {
  const h = ((hour % 24) + 24) % 24;
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** Stars earned for a score: how many of the thresholds it reaches (0..3). */
export function starsFor(score, thresholds) {
  return thresholds.filter(t => score >= t).length;
}

/**
 * Can the trick be played now? season: the season on screen; hour: the hour on screen; frozen: the story clock
 * stands still (the round brings its own night); raining: the weather (stargazing needs a clear sky).
 */
export function trickOpen(t, { season, hour, frozen = true, raining = false }) {
  if (!t.seasons.includes(season)) return false;
  if (t.clear && raining) return false;
  return frozen || inHours(hour, t.hours);
}

/** Fold a finished round into the saved record { learned, best, stars, plays }. Returns { rec, stars, newBest }. */
export function recordRound(prev, t, score) {
  const s = starsFor(score, t.stars);
  const rec = { learned: true, best: 0, stars: 0, plays: 0, ...(prev || {}) };
  const newBest = score > rec.best;
  rec.best = Math.max(rec.best, score);
  rec.stars = Math.max(rec.stars, s);
  rec.plays += 1;
  return { rec, stars: s, newBest };
}

/** A clean tricks record for a save (migrate): known ids only, numbers whole and in range. */
export function cleanTricks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const int = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  for (const [id, r] of Object.entries(raw)) {
    if (!TRICK[id] || !r || typeof r !== 'object') continue;
    out[id] = { learned: !!r.learned, best: int(r.best), stars: Math.min(3, int(r.stars)), plays: int(r.plays) };
    if (r.intro) out[id].intro = true;
    if (r.note) out[id].note = true;
  }
  return out;
}
