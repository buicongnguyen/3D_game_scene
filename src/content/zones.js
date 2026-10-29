// Which mini games play in a zone when opened from the title (docs/PLAY-ZONES-PLAN.md, world/zone.js), and how big
// each zone is. A game listed here builds only the circle around its place; the others still build the whole valley.
// Grows phase by phase (docs/play-zones/): the pilot first.
import { buildCatalogue } from './minigames.js';

/**
 * The converted games.
 *   r        zone radius (metres): what the camera sees and where Mika can walk.
 *   models   what the game clones at once (not through a person or an animal, whose models a zone fetches on demand).
 *   margin   metres of real trees, rocks and buildings kept past the edge, with the baked far view starting after them
 *            (default 0). A game where Mika walks about near the edge needs it: the baked view is only right from the
 *            middle, and it is flat and smeared close up (docs/PLAY-ZONES-PLAN.md, review gap 1).
 *   wallIn   metres inside the edge where the soft wall starts (default 5).
 *   sky      'baked' (default): the far view's sky replaces the sky dome. 'live': the dome stays, for games that draw
 *            their own stars and flights over it (the sky games).
 *   bake     the key of the baked far view (default: the game's id). Games in the same place with the same season and
 *            hour may share one (tests/zone.test.mjs checks that they match).
 */
export const ZONES = {
  'trick:eggs': { r: 50, models: ['chicken'] },                 // phase 2 pilot: a fixed view of the henhouse yard
  'trick:firefly': { r: 75, models: [], margin: 24, wallIn: 8 }, // phase 2 pilot: walking the meadow at night (its kit loads itself)
  'yard:tug': { r: 50, models: [] },                            // phase 2 pilot: the Takamori green with the kids
};

let catalogue = null;
/** The zone a game plays in from the title: { x, z, r, id, models, margin, wallIn, sky, bake }, or null (the whole valley). */
export function zoneFor(id) {
  const Z = ZONES[id];
  if (!Z) return null;
  catalogue ??= buildCatalogue();
  const e = catalogue.find(c => c.id === id);
  return e ? { x: e.place.x, z: e.place.z, r: Z.r, id, models: Z.models, margin: Z.margin ?? 0, wallIn: Z.wallIn ?? 5, sky: Z.sky ?? 'baked', bake: Z.bake ?? id } : null;
}

/** Can game `id` be played inside `zone` (the one already built)? Its own place must sit well inside it. */
export function playableIn(zone, id) {
  const z = zoneFor(id);
  return !!zone && !!z && Math.hypot(z.x - zone.x, z.z - zone.z) + z.r <= zone.r + 1;
}
