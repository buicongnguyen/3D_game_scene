// The playground yards: where they are and what stands in them. Pure data (no three.js, no DOM), read by
// src/world/yard.js (which builds them), src/game/yard/ (the games played there) and tests/yard.test.mjs.
//
// A yard is DATA: a site, a court, a fence, props and the list of `games` its scoreboard cycles through. Two stand
// in the valley: the Kawabe Playground (east of Miss Endo's house) and Takamori Green (north of the bell tower).
// Each game thinks in its own "stage" space, placed on the ground by a stage { x, z, rot }:
//   u = across (metres; +u is screen-right for the end-on camera, which stands on the near side),
//   v = along (metres from the stage's middle; v > 0 is the NEAR side, where Mika plays, v < 0 the far side).
// World (rot = 0): x = stage.x - u, z = stage.z - v; rot turns (u, v) first (see toWorld).
import { N_ } from '../i18n/i18n.js';
import { LEVELS, recordLevel, cleanLevels } from './levels.js';

const PI = Math.PI;

export const YARDS = {
  kawabe: {
    id: 'kawabe', name: N_('Kawabe Playground'), sign: 'yard',
    x: -20.5, z: 15.5,                  // the middle of the net
    w: 6, l: 11, netH: 1.3,             // court: across (x) and along (z); a kids' net at shuttle-kick height
    look: 'earth', fenceStyle: 'rail',
    // the fence round the yard (world rectangle) and the ways in
    fence: { x0: -26.6, x1: -15.6, z0: 8.4, z1: 24.8, h: 0.72 },
    gaps: [
      { side: 'n', a: -21.5, b: -19.5 },  // toward the boathouse lane
      { side: 's', a: -18.4, b: -16.4 },  // toward the dock lane
      { side: 'w', a: 21.6, b: 23.6 },    // toward the houses and the field (the kids' way in)
    ],
    benches: [{ x: -26.0, z: 12.6, face: PI / 2 }, { x: -26.0, z: 18.4, face: PI / 2 }],   // seat 0.45 m: the Sit clip
    board: { x: -25.0, z: 15.5, h: 2.35 },             // the scoreboard post, in line with the net
    rack: { x: -26.0, z: 20.4 },                       // the box of balls and shuttlecocks
    hop: { x: -19.4, z: 23.0, cell: 0.6 },             // hopscotch chalk grid: starts here and runs west
    seesaw: { x: -16.5, z: 12.7, len: 3 },             // along z, in the east strip
    wall: { x: -20.5, z: 24.62, w: 3.2, h: 2.0 },      // the practice kick-board on the south fence
    spot: 'kawabe.yard',                               // the Town Life spot the kids walk to (just outside the west gap)
    games: ['footnet', 'keepup', 'rope', 'marbles', 'oanquan'],
    kids: ['v3', 'v20', 'v10'],
    // where each game that is not played on the court stands: the oan quan board and the marble ring are scratched
    // in the dirt just outside the south rails, between the sign and the dock lane
    stages: {
      rope: { x: -20.5, z: 12.3, rot: 0 },
      oanquan: { x: -27.4, z: 27.0, rot: 180 },
      marbles: { x: -20.2, z: 26.9, rot: 180 },
    },
  },
  takamori: {
    id: 'takamori', name: N_('Takamori Green'), sign: 'green',
    x: 114.5, z: -21,
    w: 6, l: 11, netH: 2.2,              // a kid-sized volleyball net
    look: 'sand', fenceStyle: 'log',
    fence: { x0: 109, x1: 120, z0: -28.5, z1: -13.5, h: 0.6 },
    gaps: [
      { side: 's', a: 113.5, b: 115.5 },  // toward the bell tower and the square
      { side: 'w', a: -22.3, b: -20.3 },  // toward the tug-of-war strip
      { side: 'e', a: -22.3, b: -20.3 },  // toward the sack-race lanes
    ],
    benches: [{ x: 109.6, z: -24.4, face: PI / 2 }, { x: 109.6, z: -18.6, face: PI / 2 }],
    board: { x: 110.7, z: -21, h: 2.35 },
    rack: { x: 109.7, z: -15.8 },
    spot: 'takamori.court',
    games: ['volley', 'tug', 'sack', 'rope'],
    kids: ['v6', 'v23', 'v13'],
    // tug of war: a 14 m strip west of the fence; the sack race: three lanes north of the court
    stages: {
      rope: { x: 114.5, z: -24.2, rot: 0 },
      tug: { x: 106.4, z: -22.6, rot: 270 },
      sack: { x: 114, z: -36.2, rot: 270 },
    },
  },
};
export const YARD_LIST = Object.values(YARDS);
/** The Kawabe Playground (the first yard; most older code and tests mean this one). */
export const YARD = YARDS.kawabe;

/** The yard a point belongs to (nearest centre within r), or null. */
export function yardAt(x, z, r = 30) {
  let best = null, bd = r;
  for (const Y of YARD_LIST) { const d = Math.hypot(x - Y.x, z - Y.z); if (d < bd) { bd = d; best = Y; } }
  return best;
}

/** A game's stage in this yard: the court unless it has a stage of its own. */
export function stageOf(Y, game) {
  const s = Y.stages?.[game];
  return s ? { x: s.x, z: s.z, rot: s.rot || 0 } : { x: Y.x, z: Y.z, rot: 0 };
}

/** Stage space -> world. `out`: an object to write into (per-frame callers pass one). S: a stage (default: the Kawabe court). */
export function toWorld(u, v, out = {}, S = YARD) {
  const t = (S.rot || 0) * PI / 180, c = Math.cos(t), s = Math.sin(t);
  out.x = S.x - (u * c - v * s);
  out.z = S.z - (u * s + v * c);
  return out;
}
/** World -> stage space. */
export function toCourt(x, z, out = {}, S = YARD) {
  const t = (S.rot || 0) * PI / 180, c = Math.cos(t), s = Math.sin(t), ru = S.x - x, rv = S.z - z;
  out.u = ru * c + rv * s;
  out.v = -ru * s + rv * c;
  return out;
}

/** The fence as straight runs [x0, z0, x1, z1] with the gaps cut out. */
export function fenceRuns(Y = YARD) {
  const f = Y.fence, out = [];
  const side = (name, fixed, from, to, alongX) => {
    const cuts = Y.gaps.filter(g => g.side === name).map(g => [Math.min(g.a, g.b), Math.max(g.a, g.b)]).sort((p, q) => p[0] - q[0]);
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

/** The gates: { side, x, z (in the fence line), inX, inZ (0.9 m inside), outX, outZ (0.9 m outside) }. */
export function gates(Y = YARD) {
  const f = Y.fence;
  return Y.gaps.map(g => {
    const m = (g.a + g.b) / 2;
    const [x, z, dx, dz] = g.side === 'n' ? [m, f.z0, 0, 1] : g.side === 's' ? [m, f.z1, 0, -1] : g.side === 'w' ? [f.x0, m, 1, 0] : [f.x1, m, -1, 0];
    return { side: g.side, x, z, inX: x + dx * 0.9, inZ: z + dz * 0.9, outX: x - dx * 0.9, outZ: z - dz * 0.9 };
  });
}

/** Is (x, z) inside the fence (grown by m)? */
export function insideFence(Y, x, z, m = 0) {
  const f = Y.fence;
  return x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m;
}

/**
 * Leaving the yard on foot: from inside the fence a kid walks to the nearest gate, through it and a step out, never
 * through the rails. Returns waypoints [[x, z], ...] to put before the real walk (empty when already outside).
 */
export function leavePath(Y, x, z) {
  if (!insideFence(Y, x, z, -0.05)) return [];
  let best = null, bd = 1e9;
  for (const g of gates(Y)) { const d = Math.hypot(g.inX - x, g.inZ - z); if (d < bd) { bd = d; best = g; } }
  return best ? [[best.inX, best.inZ], [best.x, best.z], [best.outX, best.outZ]] : [];
}

/** Coming in to play from outside: a kid first steps in through the gate nearest to them. Returns [x, z] or null. */
export function enterPoint(Y, x, z) {
  if (insideFence(Y, x, z, -0.05)) return null;
  let best = null, bd = 1e9;
  for (const g of gates(Y)) { const d = Math.hypot(g.outX - x, g.outZ - z); if (d < bd) { bd = d; best = g; } }
  return best ? [best.inX, best.inZ] : null;
}

/**
 * Everything solid in the yard, for colliders and for the placement tests: boxes { x, z, hw, hd, h, walk? } (axis
 * aligned, h = height above the ground, walk = can be stood on) and posts { x, z, r, h }.
 */
export function yardSolids(Y = YARD) {
  const boxes = [], posts = [];
  for (const [x0, z0, x1, z1] of fenceRuns(Y)) boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2 + 0.07, hd: Math.abs(z1 - z0) / 2 + 0.07, h: Y.fence.h, what: 'fence' });
  boxes.push({ x: Y.x, z: Y.z, hw: Y.w / 2 + 0.45, hd: 0.07, h: Y.netH, what: 'net' });
  for (const b of Y.benches) boxes.push({ x: b.x, z: b.z, hw: 0.24, hd: 0.8, h: 0.45, walk: true, what: 'bench' });
  boxes.push({ x: Y.rack.x, z: Y.rack.z, hw: 0.36, hd: 0.52, h: 0.5, what: 'rack' });
  if (Y.seesaw) boxes.push({ x: Y.seesaw.x, z: Y.seesaw.z, hw: 0.2, hd: 0.3, h: 0.42, what: 'seesaw' });
  if (Y.wall) boxes.push({ x: Y.wall.x, z: Y.wall.z, hw: Y.wall.w / 2, hd: 0.08, h: Y.wall.h, what: 'wall' });
  for (const s of [-1, 1]) posts.push({ x: Y.board.x + s * 0.63, z: Y.board.z, r: 0.1, h: Y.board.h, what: 'scoreboard' });
  return { boxes, posts };
}

/** The hopscotch cells in world space: [{ x, z, n }] (1, 2, 3, the pair 4-5, 6, the pair 7-8, 9). */
export function hopCells(Y = YARD) {
  const h = Y.hop, c = h.cell, out = [];
  const rows = [[1], [2], [3], [4, 5], [6], [7, 8]];
  rows.forEach((row, i) => row.forEach((n, k) => out.push({ x: h.x - c * (i + 0.5), z: h.z + (row.length === 2 ? (k - 0.5) * c : 0), n })));
  return out;
}

/** What is scratched or marked on open ground outside the court: [{ id, x, z, hw, hd }] axis-aligned boxes for the tests. */
export function groundMarks(Y = YARD) {
  const out = [];
  const add = (id, S, hu, hv) => {
    const a = toWorld(-hu, -hv, {}, S), b = toWorld(hu, hv, {}, S);
    out.push({ id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: Math.abs(b.x - a.x) / 2, hd: Math.abs(b.z - a.z) / 2 });
  };
  const st = g => (Y.stages?.[g] ? stageOf(Y, g) : null);
  if (st('oanquan')) add('oanquan', st('oanquan'), 1.95, 0.7);
  if (st('marbles')) add('marbles', st('marbles'), 0.95, 0.95);
  if (st('tug')) add('tug', st('tug'), 7.2, 1.0);
  if (st('sack')) add('sack', st('sack'), 2.4, 7.5);
  return out;
}

// ---------------------------------------------------------------------------------------------- who plays how
/** How each kid plays (src/game/yard/rules.js STYLES). */
export const KID_STYLE = { v3: 'strong', v20: 'tricky', v10: 'wobbly', v6: 'captain', v23: 'never', v13: 'dreamy' };

/** The games' names for the board, the prompts and the card. */
export const YARD_NAMES = {
  footnet: N_('Foot-tennis'), keepup: N_('Keep it up'), volley: N_('Volleyball'), rope: N_('Rope jumping'),
  tug: N_('Tug of war'), oanquan: N_('Ô ăn quan'), sack: N_('Sack race'), marbles: N_('Marbles'),
};
/** One line of rules for each, shown at the scoreboard. */
export const YARD_RULES = {
  footnet: N_('Kick the shuttle back over the net. Win the most points.'),
  keepup: N_('Keep the shuttle up together and count the touches.'),
  volley: N_('Bump, set, spike. Press {act} as the ball comes down.'),
  rope: N_('Jump in when the rope reaches the ground. Beat your streak.'),
  tug: N_('Pull on the beat. Drag the flag over your line.'),
  oanquan: N_('Sow your pebbles round the board and capture.'),
  sack: N_('Hop in a steady rhythm. Do not rush.'),
  marbles: N_('Flick the shooter. Knock marbles out of the ring.'),
};
/** A short warm real-world note on the results card. */
export const YARD_NOTES = {
  footnet: N_('Đá cầu, shuttlecock kicking, is played in Vietnamese streets and parks: feet only, over a net or in a ring.'),
  keepup: N_('Keeping a shuttle in the air with your feet is the heart of đá cầu, and every Vietnamese street has a ring of friends doing it.'),
  volley: N_('Volleyball was invented in 1895 by William Morgan in Massachusetts, as a gentler game than basketball. Bump, set, spike is still how every rally goes.'),
  rope: N_('Nhảy dây, rope jumping, is in every Vietnamese schoolyard, and in Japan it is nawatobi. Two friends turn the long rope and everyone chants.'),
  tug: N_('Kéo co, tug of war, is played at village festivals in Vietnam. It joined the UNESCO heritage list in 2015, and winning is said to bring a good harvest.'),
  oanquan: N_('Ô ăn quan is a traditional Vietnamese game, drawn on the ground with chalk or a stick and played with pebbles. The big squares are the mandarins, the quan.'),
  sack: N_('Đua bao bố, the sack race, is a favourite at Vietnamese village fairs and school sports days. It is harder than it looks.'),
  marbles: N_('Bắn bi, shooting marbles, is a street game across Vietnam. In Japan the glass marbles are bīdama, from biidoro, an old word for glass.'),
};

/** A clean `yard` block for the save: the game on each scoreboard, and the record of each game. */
export function cleanYard(raw) {
  const int = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { game: YARDS.kawabe.games.includes(src.game) ? src.game : 'footnet' };
  if (src.pick && typeof src.pick === 'object') {
    const pick = {};
    for (const Y of YARD_LIST) if (Y.id !== 'kawabe' && Y.games.includes(src.pick[Y.id])) pick[Y.id] = src.pick[Y.id];
    if (Object.keys(pick).length) out.pick = pick;
  }
  for (const id of Object.keys(YARD_NAMES)) {
    const r = src[id];
    if (!r || typeof r !== 'object') continue;
    out[id] = { plays: int(r.plays), wins: int(r.wins), best: int(r.best), rally: int(r.rally), stars: Math.min(3, int(r.stars)) };
    if (r.total) out[id].total = int(r.total);          // marbles won, over all rounds
    const levels = cleanLevels(r.levels);
    if (levels) out[id].levels = levels;
    if (LEVELS.includes(r.level)) out[id].level = r.level;
  }
  return out;
}

/** The game on a yard's scoreboard: Kawabe's lives in `game` (the first version of the save), the others in `pick`. */
export function gameOn(save, Y) {
  const g = Y.id === 'kawabe' ? save?.game : save?.pick?.[Y.id];
  return Y.games.includes(g) ? g : Y.games[0];
}
export function setGameOn(save, Y, id) {
  if (Y.id === 'kawabe') save.game = id; else (save.pick ||= {})[Y.id] = id;
}

/** Fold a finished round into the record. result: { score, stars, won?, rally?, gain? }. Returns { rec, newBest }. */
export function recordYard(rec, result, level = 'normal') {
  const r = { plays: 0, wins: 0, best: 0, rally: 0, stars: 0, ...(rec || {}) };
  // levels (content/levels.js): the gentle first round counts as Easy; newBest is the best on that level
  const lv = level === 'first' ? 'easy' : level;
  const L = recordLevel(rec, lv, Math.floor(result.score || 0), result.stars || 0);
  const newBest = L.newBest;
  r.levels = L.levels;
  r.level = L.opened || lv;
  r.plays += 1;
  if (result.won) r.wins += 1;
  r.best = Math.max(r.best, Math.floor(result.score || 0));
  r.rally = Math.max(r.rally, Math.floor(result.rally || 0));
  r.stars = Math.max(r.stars, Math.min(3, Math.floor(result.stars || 0)));
  if (result.gain) r.total = (r.total || 0) + Math.floor(result.gain);
  return { rec: r, newBest, opened: L.opened };
}

/** Does the straight walk a -> b cross the fence rectangle grown by m? (A walk that starts or ends inside is judged on its own.) */
function crossesFence(Y, ax, az, bx, bz, m = 0.25) {
  const f = Y.fence, x0 = f.x0 - m, x1 = f.x1 + m, z0 = f.z0 - m, z1 = f.z1 + m;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (x > x0 && x < x1 && z > z0 && z < z1) return true;
  }
  return false;
}

/** The way between two points that are both outside the rails: straight, or round the nearest corner(s). Waypoints end at b. */
function outsideRoute(Y, ax, az, bx, bz) {
  if (!crossesFence(Y, ax, az, bx, bz)) return [[bx, bz]];
  const f = Y.fence, o = 1.0, C = [[f.x0 - o, f.z0 - o], [f.x1 + o, f.z0 - o], [f.x1 + o, f.z1 + o], [f.x0 - o, f.z1 + o]];
  let best = null, bl = 1e9;
  const len = pts => pts.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  const ok = pts => pts.every((p, i) => i === 0 || !crossesFence(Y, pts[i - 1][0], pts[i - 1][1], p[0], p[1]));
  for (let i = 0; i < 4; i++) {
    for (const route of [[C[i]], [C[i], C[(i + 1) % 4]], [C[i], C[(i + 3) % 4]]]) {
      const pts = [[ax, az], ...route, [bx, bz]];
      if (ok(pts) && len(pts) < bl) { bl = len(pts); best = route; }
    }
  }
  return [...(best || []), [bx, bz]];
}

/**
 * How to walk from a to b without going through the rails: straight when both are inside (or the line clears the fence),
 * through the best gate when one is inside and the other not (round the corners to reach the gate when it has to be),
 * and round a corner or two when both are outside and the straight line would cut the yard. Waypoints end at b.
 */
export function pathBetween(Y, ax, az, bx, bz) {
  const ina = insideFence(Y, ax, az, -0.05), inb = insideFence(Y, bx, bz, -0.05);
  if (ina && inb) return [[bx, bz]];
  if (ina !== inb) {
    const o = ina ? [bx, bz] : [ax, az], i = ina ? [ax, az] : [bx, bz];
    let best = null, bd = 1e9;
    for (const g of gates(Y)) {
      const d = outsideRoute(Y, o[0], o[1], g.outX, g.outZ).reduce((s, p, k, a) => s + Math.hypot(p[0] - (k ? a[k - 1][0] : o[0]), p[1] - (k ? a[k - 1][1] : o[1])), 0) + Math.hypot(g.inX - i[0], g.inZ - i[1]);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return [[bx, bz]];
    if (ina) return [[best.inX, best.inZ], [best.x, best.z], [best.outX, best.outZ], ...outsideRoute(Y, best.outX, best.outZ, bx, bz)];
    return [...outsideRoute(Y, ax, az, best.outX, best.outZ), [best.x, best.z], [best.inX, best.inZ], [bx, bz]];
  }
  return outsideRoute(Y, ax, az, bx, bz);
}
