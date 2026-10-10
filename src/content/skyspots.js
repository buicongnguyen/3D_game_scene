// "Look up at the sky": the places where Mika can stop and watch the sky (game/skygaze.js). Pure data, Node-readable;
// tests/skygaze.test.mjs checks every spot.
//
// x, z: where Mika stands. r: how close she must be. face: the point she turns toward before looking up (the lamp
//   tower, or the open view), so the tower top or the valley stays in the frame.
// lamp: the Star Lamp this spot belongs to. While that lamp's story step is on, the spot is off (lighting the lamp
//   comes first); once the lamp is lit, a few early stars already show here at dusk.
// on: what Mika stands on. 'ground' spots pass placeProblems (dry, level, clear of walls and the river). The others are
//   built things over the water or up a tower: 'island' = the mill island, 'deck' = the viaduct deck (y = DECK_Y),
//   'gallery' = the bell-tower gallery (its height comes from the model at runtime).
// The forest spots are placed from the lamp's and the gate's own positions in layout.js, never from fixed metres off
//   the shrine model, and have generous radii: the shrine and its lamp may be rebuilt larger.
import { LAMPS, BUILDINGS, PLACES, DECK_Y } from '../world/layout.js';

const lamp = id => LAMPS.find(l => l.id === id);
const building = id => BUILDINGS.find(b => b.id === id);
const round = v => Math.round(v * 10) / 10;
/** The point `d` metres from a toward b. */
const toward = (a, b, d) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: round(a.x + (b.x - a.x) / l * d), z: round(a.z + (b.z - a.z) / l * d) }; };

const mill = lamp('mill'), forest = lamp('forest'), viaduct = lamp('viaduct');
const tower = building('belltower'), gateTop = building('toriiTop');

export const SKY_SPOTS = [
  // ---- the four lamp towers
  { id: 'mill-lamp', ...toward(mill, { x: PLACES.mill.x, z: mill.z }, 2.6), r: 3, on: 'island', lamp: 'mill', face: { x: mill.x, z: mill.z },
    why: 'on the mill island, at the foot of the Mill Lamp' },
  { id: 'orchard-lamp', x: tower.x, z: tower.z + 9, r: 3, on: 'ground', lamp: 'orchard', face: { x: tower.x, z: tower.z },
    why: 'in the Takamori square, under the bell tower that carries the Orchard Lamp' },
  { id: 'forest-lamp', ...toward(forest, gateTop, 5), r: 5, on: 'ground', lamp: 'forest', face: { x: forest.x, z: forest.z },
    why: 'on the shrine hilltop, beside the Forest Lamp (toward the upper gate, clear of the shrine)' },
  { id: 'viaduct-lamp', x: viaduct.x - 3.5, z: viaduct.z - 1.5, y: DECK_Y, r: 3, on: 'deck', lamp: 'viaduct', face: { x: viaduct.x, z: viaduct.z },
    why: 'on the viaduct deck by the Viaduct Lamp, high over the river' },
  // ---- other high, open places
  { id: 'belltower-top', x: tower.x, z: tower.z, r: 3.2, on: 'gallery', lamp: 'orchard', face: { x: tower.x, z: tower.z + 40 },
    why: 'up on the bell-tower gallery, the highest floor in the valley' },
  { id: 'shrine-steps', x: gateTop.x, z: gateTop.z + 2, r: 3.5, on: 'ground', face: { x: PLACES.shrineStairsBase.x, z: PLACES.shrineStairsBase.z },
    why: 'at the top of the shrine steps, looking back out over the forest' },
  { id: 'star-hill', x: -56, z: 161, r: 3.2, on: 'ground', face: { x: -56, z: 120 },
    why: 'the stargazing hill behind the cottage (a few steps from the Stargazing sign)' },
  { id: 'pasture', x: 142, z: -30, r: 3.5, on: 'ground', face: { x: 142, z: -70 },
    why: 'the open sheep pasture above Takamori' },
];

export const SKY_SPOT = Object.fromEntries(SKY_SPOTS.map(s => [s.id, s]));

/** The story step in which each lamp is being lit: its sky spot waits until that is done. */
export const LAMP_STEP = { mill: 'c1.lamp', orchard: 'c2.lamp', forest: 'c3.lamp', viaduct: 'c4.lamp' };

/**
 * What the sky shows at an hour (the hour on screen): 'night' = the deep star sky with shooting stars; 'dusk' = the
 * first few stars (earlier beside a lit lamp tower) and a rare shooting star; 'day' = clouds and birds; 'rain' = grey.
 */
export function skyLook(hour, { lampLit = false, raining = false } = {}) {
  const h = ((hour % 24) + 24) % 24;
  if (raining) return 'rain';
  if (h >= 19.3 || h < 5.2) return 'night';
  if (h >= (lampLit ? 17.5 : 18.4) || h < 6) return 'dusk';
  return 'day';
}

/** The saved wish counter: a whole number, never negative, never absurd. */
export const cleanWishes = n => (Number.isFinite(n) ? Math.min(99999, Math.max(0, Math.floor(n))) : 0);

/** Mika's thought after a wish: the first one, then every third (null in between). `LINES` is the list in skygaze.js. */
export function wishLineIndex(wishes, count) {
  if (wishes !== 1 && wishes % 3 !== 0) return -1;
  return (wishes === 1 ? 0 : wishes / 3) % count;
}
