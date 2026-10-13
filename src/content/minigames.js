// The Mini games menu: every game Mika can play, listed from the sources of truth so a game that lands later (a new
// trick row, a new yard game, a new fishing place) shows up with no edit here.
//   tricks      content/tricks.js  TRICKS               (countryside tricks, stargazing, bug catching, archery, cow races…)
//   yard games  game/yard/index.js YARD_GAMES + content/yard.js YARDS (which yard hosts which game)
//   fishing     game/fishing/places.js SPOTS
//   sky         content/skyspots.js SKY_SPOTS           ("Look up at the sky" on open ground)
//   workshop    the Kite workshop in the cottage
// A small hand-written META table adds category, one line, icon and the best season/hour per game. A game with no META
// row still appears with its own name and icon (defaults below). Pure data (no three.js, no DOM): Node-readable, tested by
// tests/minigame-menu.test.mjs. The runtime that starts a game is src/game/minigame-menu.js; the picker is src/ui/minigames-ui.js.
import { N_ } from '../i18n/i18n.js';
import { TRICKS } from './tricks.js';
import { YARD_GAMES } from '../game/yard/index.js';
import { YARD_LIST, YARD_NAMES, stageOf } from './yard.js';
import { SPOTS } from '../game/fishing/places.js';
import { SKY_SPOTS } from './skyspots.js';
import { placeProblems } from '../world/roads.js';

export const CATEGORIES = [
  { id: 'country', name: N_('Countryside tricks'), icon: 'cat-tricks' },
  { id: 'yard', name: N_('Playground games'), icon: 'cat-yard' },
  { id: 'fishing', name: N_('Fishing'), icon: 'cat-fish' },
  { id: 'sky', name: N_('Sky & stars'), icon: 'cat-sky' },
  { id: 'animals', name: N_('Animals & riding'), icon: 'cat-animals' },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

/**
 * Hand-written facts per game id (`trick:<id>`, `yard:<id>`, `fish:<spot>`, `sky:<spot>`, `workshop`).
 *   cat   category id        icon  public/icons/<icon>.webp      desc  one line (a string; tx() on show)
 *   season / hour  the best moment for it (the launch from the menu sets these, like Explore does)
 *   isNew  shown with a "New" badge until it is played once
 */
export const META = {
  'trick:swimming': { cat: 'country', desc: N_('Practise bubbles, floating and a gentle swim back to the exit.'), season: 'summer', hour: 11, isNew: true },
  'trick:firefly': { cat: 'country', desc: N_('Scoop glowing fireflies into a jar.'), season: 'summer', hour: 21 },
  'trick:river': { cat: 'country', desc: N_('Wade the shallows with a torch and spot the sleepy fish.'), season: 'summer', hour: 22 },
  'trick:stars': { cat: 'sky', desc: N_('Join the dots of the Big Dipper and find the North Star.'), season: 'autumn', hour: 22 },
  'trick:frogs': { cat: 'country', desc: N_('Walk while the frogs sing and freeze when they stop.'), season: 'summer', hour: 19 },
  'trick:kite': { cat: 'country', desc: N_('Tie a bamboo kite and fly it high in the wind.'), season: 'autumn', hour: 13 },
  'trick:dew': { cat: 'country', desc: N_('Find the dew-covered spider webs before the sun dries them.'), season: 'summer', hour: 6 },
  'trick:roast': { cat: 'country', desc: N_('Bury sweet potatoes in the ash and take them out just right.'), season: 'autumn', hour: 17 },
  'trick:firedrill': { cat: 'country', desc: N_('Practise with a fire extinguisher: pull, aim, squeeze, sweep.'), season: 'spring', hour: 10, isNew: true },
  'trick:beetles': { cat: 'country', desc: N_('Paint sap on the bark and welcome the night visitors.'), season: 'summer', hour: 18.5 },
  'trick:hoppers': { cat: 'country', desc: N_('Catch grasshoppers in the tall summer grass.'), season: 'summer', hour: 10, isNew: true },
  'trick:cricket': { cat: 'country', desc: N_('Follow the chirp and find the singing cricket.'), season: 'autumn', hour: 19, isNew: true },
  'trick:lifecycle': { cat: 'country', desc: N_('Put the lives of small animals in order: a card game for thinkers.'), season: 'summer', hour: 10, isNew: true },
  'trick:archery': { cat: 'yard', desc: N_('Draw a bamboo bow and hit the straw target.'), season: 'spring', hour: 11, isNew: true },
  'trick:cowrace': { cat: 'animals', desc: N_('Race four cows down the track: steer, and tap on the beat.'), season: 'spring', hour: 11, isNew: true },
  'trick:eggs': { cat: 'animals', desc: N_('Read the bamboo gutters and catch the hens\' eggs in your hat.'), season: 'spring', hour: 10, isNew: true },
  'yard:footnet': { cat: 'yard', desc: N_('Kick the shuttle over the net with the kids. First to 5.'), season: 'spring', hour: 15 },
  'yard:keepup': { cat: 'yard', desc: N_('Keep the shuttle up together and count the touches.'), season: 'spring', hour: 15 },
  'yard:volley': { cat: 'yard', desc: N_('Bump, set and spike on the sand court.'), season: 'summer', hour: 15, isNew: true },
  'yard:rope': { cat: 'yard', desc: N_('Jump in when the long rope reaches the ground.'), season: 'spring', hour: 15, isNew: true },
  'yard:tug': { cat: 'yard', desc: N_('Pull on the beat and drag the flag over your line.'), season: 'autumn', hour: 15, isNew: true },
  'yard:oanquan': { cat: 'yard', desc: N_('Sow your pebbles round the board and capture.'), season: 'spring', hour: 15, isNew: true },
  'yard:sack': { cat: 'yard', desc: N_('Hop in a steady rhythm to the finish line.'), season: 'autumn', hour: 15, isNew: true },
  'yard:marbles': { cat: 'yard', desc: N_('Flick the shooter and knock the marbles out of the ring.'), season: 'spring', hour: 15, isNew: true },
  'fish:dock': { cat: 'fishing', desc: N_('Cast from Rin\'s dock for trout, char and koi.'), season: 'spring', hour: 9 },
  'fish:mill': { cat: 'fishing', desc: N_('Fish the still pool by the mill, where the koi hide.'), season: 'autumn', hour: 10, isNew: true },
  'sky:star-hill': { cat: 'sky', desc: N_('Lie back on the hill and name the star groups.'), season: 'summer', hour: 22, isNew: true, label: N_('the stargazing hill') },
  'sky:shrine-steps': { cat: 'sky', desc: N_('Watch the sky over the forest from the top of the shrine steps.'), season: 'winter', hour: 21.5, isNew: true, label: N_('the shrine steps') },
  'sky:pasture': { cat: 'sky', desc: N_('Watch the sky over the open sheep pasture.'), season: 'autumn', hour: 21, isNew: true, label: N_('the sheep pasture') },
  'workshop': { cat: 'country', desc: N_('Build a motor kite in the cottage workshop.'), season: 'spring', hour: 11 },
};

/** Where the games live and when they open when META says nothing (the first allowed season; the middle of the hours). */
function defaultMoment(t) {
  const season = t.seasons?.[0] || 'spring';
  const h = t.hours;
  let hour = 11;
  if (h) hour = h[0] <= h[1] ? (h[0] + h[1]) / 2 : (h[0] + h[1] + 24) / 2 % 24;
  return { season, hour: (Math.round(hour * 2) / 2) % 24 };
}

const SEASON_NAME = { spring: N_('Spring'), summer: N_('Summer'), autumn: N_('Autumn'), winter: N_('Winter') };
export { SEASON_NAME };

/** The category of a trick row with no META: bug and animal games by name, the rest are countryside tricks. */
function defaultCat(t) { return t.clear || /star/i.test(t.id) ? 'sky' : /cow|ride|horse|goat|sheep/i.test(t.id) ? 'animals' : 'country'; }

/**
 * Every game, in menu order. Each entry:
 *   { id, kind: 'trick'|'yard'|'fish'|'sky'|'workshop', ref, name, icon, cat, desc, where, when, seasons?, hours?,
 *     isNew, season, hour, place: { x, z, face }, host? }
 * season/hour: the best moment (what the menu launch shows); place: where Mika stands to start (a launch plan fixes the
 * exact spot, see launchPlan). Names, descriptions and places are English source strings (translated with tx() on show).
 */
export function buildCatalogue({ tricks = TRICKS, yardGames = YARD_GAMES, yards = YARD_LIST, spots = SPOTS, skySpots = SKY_SPOTS, meta = META, workshop = true } = {}) {
  const out = [];
  const add = (e, m) => {
    const cat = m?.cat || e.defaultCat;
    out.push({ ...e, icon: m?.icon || e.icon, isNew: !!m?.isNew, cat: CATEGORY[cat] ? cat : e.defaultCat, desc: m?.desc || e.desc, season: m?.season || e.season, hour: m?.hour ?? e.hour });
  };
  for (const t of tricks) {
    const m = meta[`trick:${t.id}`], dm = defaultMoment(t);
    add({ id: `trick:${t.id}`, kind: 'trick', ref: t.id, name: t.name, icon: t.icon || t.id, defaultCat: defaultCat(t), desc: t.when, where: t.where, when: t.when,
      seasons: t.seasons, hours: t.hours, season: dm.season, hour: dm.hour, place: { ...t.place } }, m);
  }
  for (const g of yardGames) {
    const hosts = yards.filter(Y => Y.games?.includes(g.id));
    if (!hosts.length) continue;                                  // a game no yard offers cannot be played
    const Y = hosts[0], S = stageOf(Y, g.id), m = meta[`yard:${g.id}`];
    add({ id: `yard:${g.id}`, kind: 'yard', ref: g.id, yard: Y.id, yards: hosts.map(h => h.id), name: YARD_NAMES[g.id] || g.name || g.id, icon: `yard-${g.id}`, defaultCat: 'yard',
      desc: N_('Play with the kids at the playground.'), where: hosts.map(h => h.name).join(' / '), when: N_('Any day, when the kids are about'),
      season: 'spring', hour: 15, place: { x: Y.rack.x, z: Y.rack.z, face: Math.atan2(Y.x - Y.rack.x, Y.z - Y.rack.z) } }, m);
  }
  for (const s of Object.values(spots)) {
    const m = meta[`fish:${s.id}`];
    add({ id: `fish:${s.id}`, kind: 'fish', ref: s.id, name: s.id === 'dock' ? N_('Fishing at the dock') : s.id === 'mill' ? N_('Fishing at the mill') : N_('Fishing'), icon: `fish-${s.id}`, defaultCat: 'fishing',
      desc: N_('Cast a line and see what bites.'), where: s.id === 'dock' ? N_('Rin\'s dock, Kawabe') : s.id === 'mill' ? N_('the mill pool') : N_('the water'),
      when: N_('Any season: in winter you fish through the ice'), season: 'spring', hour: 9, place: { x: s.stand.x, z: s.stand.z, face: 0 } }, m);
  }
  for (const s of skySpots) {
    if (s.on !== 'ground' || s.lamp) continue;                    // lamp towers wait for the story; only open ground is a free pick
    const m = meta[`sky:${s.id}`];
    add({ id: `sky:${s.id}`, kind: 'sky', ref: s.id, name: N_('Look up at the sky'), icon: 'sky-stars', defaultCat: 'sky', desc: N_('Look up and name the star groups.'),
      where: m?.label || s.id, when: N_('Best on a clear night'), season: 'summer', hour: 22, place: { x: s.x, z: s.z, face: Math.atan2(s.face.x - s.x, s.face.z - s.z) } }, m);
  }
  if (workshop) {
    add({ id: 'workshop', kind: 'workshop', ref: 'workshop', name: N_('Kite workshop'), icon: 'kite-workshop', defaultCat: 'country', desc: N_('Build a motor kite.'),
      where: N_('the cottage workshop'), when: N_('Any day'), season: 'spring', hour: 11, place: { x: -45, z: 27, face: Math.PI } }, meta.workshop);
  }
  const order = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i]));
  return out.map((e, i) => [e, i]).sort((a, b) => order[a[0].cat] - order[b[0].cat] || a[1] - b[1]).map(x => x[0]);
}

/** The entries of a category. */
export const inCategory = (list, cat) => list.filter(e => e.cat === cat);

/** The saved record of a game as { plays, best, stars } from a quest state (all zeros when it was never played). */
export function recordOf(e, st) {
  const z = { plays: 0, best: 0, stars: 0 };
  if (!st) return z;
  const pick = r => (r ? { plays: r.plays || 0, best: r.best || 0, stars: Math.min(3, r.stars || 0) } : z);
  if (e.kind === 'trick') return pick(st.tricks?.[e.ref]);
  if (e.kind === 'yard') return pick(st.yard?.[e.ref]);
  if (e.kind === 'workshop') return pick(st.workshop);
  if (e.kind === 'sky') { const n = st.starGroups?.learned?.length || 0; return { plays: n ? 1 : 0, best: n, stars: n >= 12 ? 3 : n >= 6 ? 2 : n >= 1 ? 1 : 0 }; }
  if (e.kind === 'fish') { const n = Object.values(st.fishLog || {}).reduce((a, v) => a + (v || 0), 0); return { plays: n ? 1 : 0, best: n, stars: n >= 15 ? 3 : n >= 6 ? 2 : n >= 1 ? 1 : 0 }; }
  return z;
}

/** 'new' (a game that arrived lately), 'try' (never played) or '' (played). */
export function badgeOf(e, rec) { return rec.plays > 0 ? '' : e.isNew ? 'new' : 'try'; }

/**
 * What a launch from the menu will do for this game: the look (season, hour) and where Mika is put. The hour is a fixed
 * number (the clock stands still, as a trick expects); a hint line for the reader; `gates` lists what the menu session
 * bypasses (never in a story save outside a menu session). Pure: the runtime applies it.
 */
export function launchPlan(e) {
  const { x, z } = e.place;
  let face = e.place.face || 0, sx = x, sz = z;
  if (e.kind === 'trick') {
    // stand a few steps in front of the sign, looking at it: the first dry spot of a ring round it (in front first)
    const tries = [[0, 1.9], [0.6, 1.9], [-0.6, 1.9], [0, 2.8], [Math.PI / 2, 1.9], [-Math.PI / 2, 1.9], [Math.PI, 1.9], [0, 1.1]];
    let found = false;
    for (const [da, r] of tries) {
      const px = x + Math.sin(face + da) * r, pz = z + Math.cos(face + da) * r;
      if (!placeProblems(px, pz).length) { sx = px; sz = pz; found = true; break; }
    }
    if (!found) { sx = x; sz = z; }
    face = Math.atan2(x - sx, z - sz) || face + Math.PI;
    if (Math.hypot(x - sx, z - sz) < 0.2) face = e.place.face || 0;
  }
  return {
    id: e.id, kind: e.kind, ref: e.ref, season: e.season, hour: e.hour,
    stand: { x: sx, z: sz, face }, sign: { x, z },
    gates: e.kind === 'trick' ? ['chapter', 'season', 'teacher'] : e.kind === 'fish' ? ['unlock'] : e.kind === 'yard' ? ['chapter', 'kids'] : e.kind === 'workshop' ? ['kite', 'interior'] : ['chapter'],
  };
}
