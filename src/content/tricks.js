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
