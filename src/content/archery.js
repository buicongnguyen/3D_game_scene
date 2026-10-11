// The village archery range: where it stands and what is on it. Pure data (no three.js, no DOM), read by
// src/world/archery.js (which builds it), src/game/tricks/archery.js (the round) and tests/archery.test.mjs.
//
// The range lies on the flat Kawabe terrace west of Kawabe's main street, behind Hirano's house, and fires WEST into the
// foot of the hill: the ground rises toward the backstop, nothing lies beyond it (paddies are to the north, the main street
// and the houses are behind the shooter). Everything is written in LANE coordinates and turned to the world by toWorld:
//   u  metres down the range from the shooting line (west),   v  metres to the shooter's right (north),
// so toWorld(u, v) = (x - u, z - v). Targets stand staggered across the lane (-1.6, 0, +2.4 m) so none hides another.

export const ARCHERY = {
  x: -70, z: 47.5,              // the middle of the shooting line
  heading: -Math.PI / 2,        // the way the shooter faces (yaw as the game uses it: forward = (sin h, cos h))
  back: 24,                     // u of the backstop (the tall net behind the hay bales): nothing flies past it
  half: 4.6,                    // the rope cordon stands this far to each side of the middle
  side: 5.6,                    // an arrow that strays this far sideways stops (it cannot: the aim limits keep it inside)
  // the three straw targets: dist (m, what the player is told), r (m, the painted face's radius, bigger the farther it is)
  targets: [
    { id: 't10', u: 10, v: -1.6, r: 0.55, dist: 10 },
    { id: 't15', u: 15, v: 0, r: 0.65, dist: 15 },
    { id: 't20', u: 20, v: 2.4, r: 0.8, dist: 20 },
  ],
  centreH: 1.25,                // the target's middle above the ground
  // the sliding target of the fourth end ("yabusame" practice): it rides a rail across the lane
  moving: { u: 17.5, vMax: 2.4, period: 10, r: 0.85, dist: 17 },
  eye: 1.12,                    // release height above the ground at the line
  stand: { u: 0.06, v: 0.3 },    // where Mika stands for the round (on the board, her bow arm reaching the muzzle)
  quiver: { u: -1.3, v: 2.3 },
  bench: { u: -3.6, v: 3.1, face: 1 },   // a bench behind the line, on the right (face: which way, in lane units of quarter turns)
  sock: { u: 7.5, v: -3.6, h: 3.3 },      // the wind sock pole, beside the left rope (far enough down the lane to be in view over the shoulder)
  sign: { x: -68.6, z: 51, face: -Math.PI / 2 },   // the trick sign (content/tricks.js): at the left end of the line
  board: { x: -67.2, z: 55.8, rot: 90 },             // the name board (content/signs.js)
  // what the range needs to stay clear: the rectangle the arrows can ever visit, in lane units
  lane: { u0: -4, u1: 26, v0: -6.2, v1: 6.2 },
  // Town Life: the spot a practising kid walks to (townsfolk.js SPOTS can point at it)
  spot: { u: -5.6, v: -1.2, face: -Math.PI / 2 },   // (just behind the lane box, 5.6 m behind the line; x -64.4, z 48.7)
};

/** Lane (u, v) -> world { x, z }. */
export function toWorld(u, v, out = {}) {
  out.x = ARCHERY.x - u;
  out.z = ARCHERY.z - v;
  return out;
}

/** World (x, z) -> lane { u, v }. */
export function toLane(x, z, out = {}) {
  out.u = ARCHERY.x - x;
  out.v = ARCHERY.z - z;
  return out;
}

/** The lane's corners and a grid of samples over the arrows' whole reach (for placement tests): [[x, z], ...]. */
export function laneSamples(step = 2) {
  const L = ARCHERY.lane, pts = [];
  for (let u = L.u0; u <= L.u1 + 1e-6; u += step) for (let v = L.v0; v <= L.v1 + 1e-6; v += step) pts.push([ARCHERY.x - u, ARCHERY.z - v]);
  return pts;
}

/** Everything solid on the range, as colliders { x, z, hw, hd (world axes), h } and cylinders { x, z, r, h }. */
export function archerySolids() {
  const A = ARCHERY, q = toWorld(A.quiver.u, A.quiver.v), b = toWorld(A.bench.u, A.bench.v);
  const boxes = [
    { x: b.x, z: b.z, hw: 0.4, hd: 0.9, h: 0.9 },                                  // the bench (long side across the lane)
    { x: A.x - A.back - 0.55, z: A.z, hw: 0.6, hd: 5.2, h: 1.6 },                  // the hay-bale wall
  ];
  const posts = [{ x: q.x, z: q.z, r: 0.34, h: 1.0 }];
  for (const t of A.targets) { const p = toWorld(t.u, t.v); posts.push({ x: p.x, z: p.z, r: 0.5, h: 1.3 }); }
  const s = toWorld(A.sock.u, A.sock.v);
  posts.push({ x: s.x, z: s.z, r: 0.12, h: 3 });
  return { boxes, posts };
}
