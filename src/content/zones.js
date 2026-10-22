// Which mini games play in a zone when opened from the title (docs/PLAY-ZONES-PLAN.md, world/zone.js), and how big
// each zone is. A game listed here builds only the circle around its place; the others still build the whole valley.
// Grows phase by phase (docs/play-zones/): the pilot first.
import { buildCatalogue } from './minigames.js';

/**
 * The converted games. r: zone radius (metres): what the camera sees and where Mika can walk, plus a margin.
 * models: what the game clones at once (not through a person or an animal, whose models a zone fetches on demand).
 */
export const ZONES = {
  'trick:eggs': { r: 50, models: ['chicken'] },     // phase 2 pilot: a fixed view of the henhouse yard
  'trick:firefly': { r: 75, models: [] },           // phase 2 pilot: walking the meadow at night (its kit loads itself)
  'yard:tug': { r: 50, models: [] },                // phase 2 pilot: the Takamori green with the kids
};

let catalogue = null;
/** The zone a game plays in from the title: { x, z, r, id, models } around its place, or null (the whole valley). */
export function zoneFor(id) {
  const Z = ZONES[id];
  if (!Z) return null;
  catalogue ??= buildCatalogue();
  const e = catalogue.find(c => c.id === id);
  return e ? { x: e.place.x, z: e.place.z, r: Z.r, id, models: Z.models } : null;
}

/** Can game `id` be played inside `zone` (the one already built)? Its own place must sit well inside it. */
export function playableIn(zone, id) {
  const z = zoneFor(id);
  return !!zone && !!z && Math.hypot(z.x - zone.x, z.z - zone.z) + z.r <= zone.r + 1;
}
