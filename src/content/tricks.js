// Grandma's Countryside Tricks (docs/RURAL-TRICKS.md): real rural things to do, each a short game taught once by
// Grandma (Rin in Classic). Pure data, Node-readable; the framework is src/game/tricks.js, each game src/game/tricks/<id>.js.
//
// place: where the trick sign stands (dry ground; tests/tricks.test.mjs checks it with placeProblems).
// seasons / hours: when it can be played. hours [from, to] wraps past midnight. A frozen story clock never blocks a trick
// (the round puts on its own night look); a running clock (Explore cycle) must be inside the hours.
// stars: score needed for 1, 2 and 3 stars. length: round seconds; firstLength: the guided first try.
import { ARCHERY } from './archery.js';
import { LEVELS, levelSpec, recordLevel, cleanLevels } from './levels.js';
// Texts are English source strings (translated with tx(); collected by scripts/i18n-extract.mjs).

export const TRICKS = [
  {
    id: 'swimming', name: 'Learn to swim', icon: 'trick-river',
    place: { x: -14, z: 75, face: Math.PI }, where: 'the supervised practice pool south of Kawabe',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in daylight',
    teacher: { grandma: 'rin', classic: 'rin' }, intro: 'trick_swimming_intro',
    howReal: 'Learn in a supervised pool with a qualified swimming teacher. Practise gentle bubbles, floating, turning and returning to a safe exit at your own pace.',
    why: 'Calm breathing, balance and finding the exit are swimming foundations. Game practice does not prove that you can swim safely in real water.',
    safety: 'In real water, learn with a qualified swimming teacher and a grown-up watching.',
    stars: [60, 80, 95], length: 240, firstLength: 240, unit: 'points',
  },
  {
    id: 'firefly', name: 'Firefly jar', icon: 'trick-firefly',
    place: { x: -66, z: 10, face: -Math.PI / 2 }, where: 'the paddy edge, west of Kawabe',
    seasons: ['summer'], hours: [19.5, 4], night: true, when: 'Summer, dusk to night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_firefly_intro',
    howReal: 'On a warm, still summer night, go with a grown-up to a clean stream far from street lights. Wait quietly, then scoop gently with a soft net.',
    why: 'Fireflies flash to talk to each other, and each kind has its own blink pattern. They need clean water and real darkness.',
    safety: 'Always let them go before bed, right where you found them.',
    // points: Heike 1, Genji 2, Hime 3, and a bonus for a sweep of several (tricks/rules-firefly.js)
    stars: [8, 20, 36], length: 75, firstLength: 45, unit: 'points',
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
    // 20 a perfect potato, 10 a good one, 3 a raw one: two good ones and a bit are a star, three perfect ones two, and three stars want
    // four perfect ones (turned in time, the ash kept warm, no flare) and the fifth at least good
    stars: [25, 60, 90], length: 50, firstLength: 55, unit: 'points',
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
  // ---- phase 3: the meadow (docs/RURAL-TRICKS.md §3 #5 and the bug catching)
  {
    id: 'hoppers', name: 'Grasshopper and mantis', icon: 'trick-hoppers',
    place: { x: -38, z: -68, face: 2.4 }, where: 'the sunny long-grass meadow north of the mill, by the river and the west forest trail',
    seasons: ['summer', 'autumn'], hours: [8, 17], night: false, when: 'Summer and autumn, on a sunny day',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_hoppers_intro',
    howReal: 'Creep through long grass with a soft net. Sweep it low over a sitting grasshopper, take a good look, then let it go.',
    why: 'A grasshopper hears with ears on its belly. A mantis can turn its head almost right round, so it sees you coming. Move slowly when it watches.',
    safety: 'Look, then let them go where you found them. Mantises are friends of the garden.',
    stars: [40, 80, 120], length: 75, firstLength: 40, unit: 'points',
  },
  {
    id: 'cricket', name: 'Cricket by its song', icon: 'trick-cricket',
    place: { x: 76, z: 10, face: -Math.PI / 2 }, where: 'the hillside meadow west of Takamori, above the bakery lane',
    seasons: ['summer', 'autumn'], hours: [18.5, 4], night: true, when: 'Summer and autumn, from dusk',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_cricket_intro',
    howReal: 'At dusk, stand still in a quiet meadow and listen. Walk toward the song, stop when it stops, and look low in the grass.',
    why: 'Only male crickets chirp, by rubbing their wings. The warmer the night, the faster they chirp: chirps in 14 seconds plus 40 is the temperature in °F.',
    safety: 'Keep your torch low, and put the cricket back in the grass before bed.',
    stars: [30, 60, 90], length: 90, firstLength: 50, unit: 'points',
  },
  {
    id: 'archery', name: 'Bow and arrow', icon: 'trick-archery',
    place: { x: ARCHERY.sign.x, z: ARCHERY.sign.z, face: ARCHERY.sign.face }, where: 'the archery range, west of Kawabe behind the houses',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_archery_intro',
    howReal: 'Stand side-on to the target, feet apart. Nock the arrow, draw to your cheek, breathe out slowly, then let go smoothly.',
    why: 'A bent bow stores energy like a spring and hands it to the arrow. Wind pushes a light arrow sideways, so aim a little upwind.',
    safety: 'Only at the target, with a grown-up and practice arrows.',
    stars: [60, 100, 140], length: 90, firstLength: 60, unit: 'points',
  },
  {
    id: 'cowrace', name: 'Cow race', icon: 'trick-cowrace',
    place: { x: 86.5, z: -45, face: -Math.PI / 2 }, where: 'the Takamori north pasture, past the pasture road',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_cowrace_intro',
    howReal: 'In An Giang, Vietnam, oxen race at harvest festivals, pulling a driver across a flooded paddy. Here we race on grass, with a grown-up.',
    why: 'Cows have a steady walking rhythm, so a rider moves with it. Racing oxen are fed, cheered and rested, never hit: a happy cow runs best.',
    safety: 'Never ride a real cow without a grown-up who knows her.',
    stars: [30, 60, 80], length: 60, firstLength: 60, unit: 'points',
  },
  {
    // the henhouse itself is built by tricks/eggs.js (HOUSE): the sign stands at its right corner, beside the egg basket
    // (the left corner is too near the Stargazing sign). scenery: from how far away (m) the henhouse is drawn, in every
    // season and at every hour
    id: 'eggs', name: 'Eggs down the gutters', icon: 'trick-eggs',
    place: { x: -49.7, z: 147.9, face: 0 }, where: 'the henhouse behind the signal cottage',
    seasons: ['spring', 'summer', 'autumn'], hours: [7, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_eggs_intro', scenery: 130,
    howReal: 'Collect the eggs every morning. Slide a hand gently under the hen, hold each egg in your whole hand, and lay it in a basket lined with straw.',
    why: 'This is Amidakuji, the ladder lottery from Japan. Every rung swaps two neighbours, so four eggs always come out of four different spouts.',
    safety: 'Wash your hands after you touch hens or eggs.',
    // one point an egg, three for a golden one: a perfect round is 20 to 30 (tricks/rules-eggs.js replay), three broken eggs end it
    stars: [5, 12, 18], length: 90, firstLength: 50, unit: 'eggs',
  },
];

export const TRICK =Object.fromEntries(TRICKS.map(t => [t.id, t]));

/** True when `hour` lies in [from, to), wrapping past midnight when from > to. */
export function inHours(hour, range) {
  const h = ((hour % 24) + 24) % 24, from = range[0], to = range[1];   // (asked every frame: no destructuring)
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

/**
 * Fold a finished round into the saved record { learned, best, stars, plays, level, levels }. `level`: the level it was
 * played at (content/levels.js; its star thresholds). Returns { rec, stars, newBest, opened }: newBest is the best on
 * that level, opened the level this round has just made available (or null). best / stars stay the best over all levels.
 */
export function recordRound(prev, t, score, level = 'normal') {
  const s = starsFor(score, levelSpec(t, level).stars);
  const rec = { learned: true, best: 0, stars: 0, plays: 0, ...(prev || {}) };
  const L = recordLevel(prev, level, score, s);
  rec.best = Math.max(rec.best, score);
  rec.stars = Math.max(rec.stars, s);
  rec.plays += 1;
  rec.levels = L.levels;
  rec.level = L.opened || level;                 // the picker offers a level just opened first
  return { rec, stars: s, newBest: L.newBest, opened: L.opened };
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
    const levels = cleanLevels(r.levels);
    if (levels) out[id].levels = levels;
    if (LEVELS.includes(r.level)) out[id].level = r.level;
  }
  return out;
}
