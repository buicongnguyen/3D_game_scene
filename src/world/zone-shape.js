// The shape of a play zone (docs/PLAY-ZONES-PLAN.md, world/zone.js): a circle { x, z, r } around a mini game's place.
// No imports: the title and the boot code ask these without pulling the valley's layout into the first chunk.

/** Distance from the zone's edge: < 0 inside. */
export const outside = (zone, x, z) => Math.hypot(x - zone.x, z - zone.z) - zone.r;
/** Is (x, z) within `margin` metres of the zone? */
export const inZone = (zone, x, z, margin = 0) => outside(zone, x, z) <= margin;
/** Does a circle (x, z, radius) touch the zone (plus margin)? For things with a footprint: houses, fields. */
export const touchesZone = (zone, x, z, radius = 0, margin = 0) => outside(zone, x, z) <= radius + margin;

/** `?zone=x,z,r` (testing): a zone by hand. -> zone | null */
export function zoneFromParam(v) {
  if (!v) return null;
  const [x, z, r] = v.split(',').map(Number);
  return [x, z, r].every(Number.isFinite) && r > 0 ? { x, z, r } : null;
}
