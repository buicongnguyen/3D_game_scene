// The cow-race track on the Takamori north pasture (trick `cowrace`, game/tricks/cowrace.js): where it lies and how the
// ground under it is prepared. Pure data and one painter, readable in Node (the site test checks it against everything else).
//
// The track runs east from (x0, z); its four lanes are laneW wide, centred on z. The stands stand north of it, the
// podium and the run-out east of the finish line. The pasture is a plateau (~22 m) that is level to within half a metre.
export const SITE = {
  x0: 90, z: -54, len: 56, lanes: 4, laneW: 3, margin: 4,
};
export const SITE_RECT = {
  // everything the track owns on the ground: the lanes with their run-in and run-out, and the stands and spectators beside them
  x0: SITE.x0 - 3, x1: SITE.x0 + SITE.len + 5, z0: SITE.z - 13.5, z1: SITE.z + 8.5,
};

/**
 * Keep trees, rocks, bushes and tall grass off the track (called while the world is built, before the forest is
 * planted): the lanes, stands and run-out are mown short. The race's own surface
 * draws green turf and narrow hoof paths; its mud obstacle remains distinct.
 */
export function paintCowTrack(world) {
  const sp = world?.splat;
  if (!sp) return;
  const half = SITE.lanes * SITE.laneW / 2;
  const cx = SITE.x0 + SITE.len / 2, R = SITE_RECT;
  sp.paintRect((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, (R.x1 - R.x0) / 2, (R.z1 - R.z0) / 2, 0, 3, 0.07, 1.6);       // mown: no trees, little grass
  sp.paintRect(cx, SITE.z, SITE.len / 2 + SITE.margin, half + 0.3, 0, 0, 0.1, 1.0);                                    // lightly worn turf
  sp.paintRect(cx, SITE.z, SITE.len / 2 + SITE.margin, half + 0.3, 0, 3, 0, 1.0);
}
