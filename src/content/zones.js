// Which mini games play in a zone when opened from the title (docs/PLAY-ZONES-PLAN.md, world/zone.js), and how big
// each zone is. A game listed here builds only the circle around its place; the others still build the whole valley.
// Grows phase by phase (docs/play-zones/): the pilot first.
import { buildCatalogue } from './minigames.js';

/** Zone radius (metres) for each converted game: what its camera sees and where Mika can walk, plus a margin. */
export const ZONE_RADIUS = {
  'trick:eggs': 50,        // phase 2 pilot: a fixed view of the henhouse yard
  'trick:firefly': 75,     // phase 2 pilot: walking the meadow at night
  'yard:tug': 50,          // phase 2 pilot: the Takamori green with the kids
};

let catalogue = null;
/** The zone a game plays in from the title: { x, z, r, id } around its place, or null (it builds the whole valley). */
export function zoneFor(id) {
  const r = ZONE_RADIUS[id];
  if (!r) return null;
  catalogue ??= buildCatalogue();
  const e = catalogue.find(c => c.id === id);
  return e ? { x: e.place.x, z: e.place.z, r, id } : null;
}

/** Can game `id` be played inside `zone` (the one already built)? Its own place must sit well inside it. */
export function playableIn(zone, id) {
  const z = zoneFor(id);
  return !!zone && !!z && Math.hypot(z.x - zone.x, z.z - zone.z) + z.r <= zone.r + 1;
}
