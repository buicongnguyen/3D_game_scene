// The Kawabe playground yard: where it is and what stands in it. Pure data (no three.js, no DOM), read by
// src/world/yard.js (which builds it), src/game/yard/ (the games played there) and tests/yard.test.mjs.
//
// The yard lies on the flat Kawabe terrace east of Miss Endo's house, between the dock lane (z = 30) and the boathouse
// lane (z = -4). Its court runs north-south with the net across the middle. The games think in court space:
//   u = across the court (metres, +u is screen-right for the match camera, which stands north of the court),
//   v = along the court (metres from the net; v > 0 is the NEAR half, where Mika plays, v < 0 the far half).
// World: x = YARD.x - u, z = YARD.z - v.
import { N_ } from '../i18n/i18n.js';

export const YARD = {
  x: -20.5, z: 15.5,                    // the middle of the net
  w: 6, l: 11,                          // court: across (x) and along (z)
  netH: 1.3,                            // a kids' net: shuttle-kick height
  // the low rail fence round the yard (world rectangle) and the ways in
  fence: { x0: -26.6, x1: -15.6, z0: 8.4, z1: 24.8, h: 0.72 },
  gaps: [
    { side: 'n', a: -21.5, b: -19.5 },  // toward the boathouse lane
    { side: 's', a: -18.4, b: -16.4 },  // toward the dock lane
    { side: 'w', a: 21.6, b: 23.6 },    // toward the houses and the field (the kids' way in)
  ],
  // benches along the west fence, facing the court (the Sit clip wants a 0.45 m seat; root under the seat's middle)
  benches: [{ x: -26.0, z: 12.6, face: Math.PI / 2 }, { x: -26.0, z: 18.4, face: Math.PI / 2 }],
  board: { x: -25.0, z: 15.5, h: 2.35 },             // the scoreboard post, in line with the net
  rack: { x: -26.0, z: 20.4 },                       // the box of balls and shuttlecocks
  hop: { x: -19.4, z: 23.0, cell: 0.6 },             // hopscotch chalk grid: starts here and runs west
  seesaw: { x: -16.5, z: 12.7, len: 3 },             // along z, in the east strip
  wall: { x: -20.5, z: 24.62, w: 3.2, h: 2.0 },      // the practice kick-board on the south fence
  spot: 'kawabe.yard',                               // the Town Life spot the kids walk to (just outside the west gap)
};

/** Court space -> world. `out`: an object to write into (per-frame callers pass one; otherwise a new one). */
export const toWorld = (u, v, out = {}) => { out.x = YARD.x - u; out.z = YARD.z - v; return out; };
/** World -> court space. */
export const toCourt = (x, z, out = {}) => { out.u = YARD.x - x; out.v = YARD.z - z; return out; };

/** The fence as straight runs [x0, z0, x1, z1] with the gaps cut out. */
export function fenceRuns() {
  const f = YARD.fence, out = [];
  const side = (name, fixed, from, to, alongX) => {
    const cuts = YARD.gaps.filter(g => g.side === name).map(g => [Math.min(g.a, g.b), Math.max(g.a, g.b)]).sort((p, q) => p[0] - q[0]);
    let at = from;
    for (const [a, b] of [...cuts, [to, to]]) {
      if (a - at > 0.2) out.push(alongX ? [at, fixed, a, fixed] : [fixed, at, fixed, a]);
      at = Math.max(at, b);
    }
  };
  side('n', f.z0, f.x0, f.x1, true);
  side('s', f.z1, f.x0, f.x1, true);
  side('w', f.x0, f.z0, f.z1, false);
  side('e', f.x1, f.z0, f.z1, false);
  return out;
}

/**
 * Everything solid in the yard, for colliders and for the placement tests: boxes { x, z, hw, hd, h, walk? } (axis
 * aligned, h = height above the ground, walk = can be stood on) and posts { x, z, r, h }.
 */
export function yardSolids() {
  const Y = YARD, boxes = [], posts = [];
  for (const [x0, z0, x1, z1] of fenceRuns()) boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2 + 0.07, hd: Math.abs(z1 - z0) / 2 + 0.07, h: Y.fence.h, what: 'fence' });
  boxes.push({ x: Y.x, z: Y.z, hw: Y.w / 2 + 0.45, hd: 0.07, h: Y.netH, what: 'net' });
  for (const b of Y.benches) boxes.push({ x: b.x, z: b.z, hw: 0.24, hd: 0.8, h: 0.45, walk: true, what: 'bench' });
  boxes.push({ x: Y.rack.x, z: Y.rack.z, hw: 0.36, hd: 0.52, h: 0.5, what: 'rack' });
  boxes.push({ x: Y.seesaw.x, z: Y.seesaw.z, hw: 0.2, hd: 0.3, h: 0.42, what: 'seesaw' });
  boxes.push({ x: Y.wall.x, z: Y.wall.z, hw: Y.wall.w / 2, hd: 0.08, h: Y.wall.h, what: 'wall' });
  for (const s of [-1, 1]) posts.push({ x: Y.board.x + s * 0.63, z: Y.board.z, r: 0.1, h: Y.board.h, what: 'scoreboard' });
  return { boxes, posts };
}

/** The hopscotch cells in world space: [{ x, z, n }] (1, 2, 3, the pair 4-5, 6, the pair 7-8, 9). */
export function hopCells() {
  const h = YARD.hop, c = h.cell, out = [];
  const rows = [[1], [2], [3], [4, 5], [6], [7, 8]];
  rows.forEach((row, i) => row.forEach((n, k) => out.push({ x: h.x - c * (i + 0.5), z: h.z + (row.length === 2 ? (k - 0.5) * c : 0), n })));
  return out;
}

// ---------------------------------------------------------------------------------------------- who plays how
/** How each Kawabe kid plays (src/game/yard/rules.js STYLES). */
export const KID_STYLE = { v3: 'strong', v20: 'tricky', v10: 'wobbly' };

/** The games' names for the board, the prompts and the card. */
export const YARD_NAMES = { footnet: N_('Foot-tennis'), keepup: N_('Keep it up') };

/** A clean `yard` block for the save: which game is chosen, and the record of each. */
export function cleanYard(raw) {
  const int = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { game: YARD_NAMES[src.game] ? src.game : 'footnet' };
  for (const id of Object.keys(YARD_NAMES)) {
    const r = src[id];
    if (!r || typeof r !== 'object') continue;
    out[id] = { plays: int(r.plays), wins: int(r.wins), best: int(r.best), rally: int(r.rally), stars: Math.min(3, int(r.stars)) };
  }
  return out;
}

/** Fold a finished round into the record. result: { score, stars, won?, rally? }. Returns { rec, newBest }. */
export function recordYard(rec, result) {
  const r = { plays: 0, wins: 0, best: 0, rally: 0, stars: 0, ...(rec || {}) };
  const newBest = result.score > r.best;
  r.plays += 1;
  if (result.won) r.wins += 1;
  r.best = Math.max(r.best, Math.floor(result.score || 0));
  r.rally = Math.max(r.rally, Math.floor(result.rally || 0));
  r.stars = Math.max(r.stars, Math.min(3, Math.floor(result.stars || 0)));
  return { rec: r, newBest };
}
