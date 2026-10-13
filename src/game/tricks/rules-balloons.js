// Bow and arrow, the balloon end (docs/RURAL-TRICKS.md): the rules (pure, no three.js; tested in tests/archery.test.mjs).
//
// The last end of a round. Balloons are let go down the range and RISE slowly, drifting with the same crosswind that pushes
// the arrows (a big balloon catches more wind than a small one). Each carries a little sandbag on its string. When a balloon
// pops, its sandbag FALLS STRAIGHT DOWN, and a balloon it lands on pops too and drops its own sandbag: a chain. So the clever
// shot is the TOP balloon of a stack. A balloon popped by an arrow scores its points; the next ones of the chain score x2, x3...
// On Normal and Difficult a balloon that climbs to the top of the range (BAL.ceil) pops by itself, and its sandbag falls the same
// way: the balloons it breaks are LOST (they score nothing). On Easy a balloon just floats off over the trees.
//
// Lane units as in rules-archery.js: u metres down the range, v to the shooter's right, y up from the line's ground. Seeded:
// the same seed, wind and arrows give the same stage.

export const BAL = {
  ceil: 6.8,              // the top of the range: a balloon that gets here pops by itself (or floats off, on Easy)
  over: 1.2,              // on Easy it is gone this far above the top
  side: 4.6,              // a balloon that drifts this far sideways is gone (over the rope cordon)
  gW: 7,                  // a falling sandbag's gravity (a little slower than life, so the chain can be watched)
  string: 0.26,           // from the balloon's knot down to the sandbag
  weightR: 0.11,          // the sandbag's size
  land: 0.7,              // a sandbag breaks a balloon it comes down on within this much of its radius (plus its own size)
  knot: 1.1,              // the knot is this many radii under the balloon's middle
  swayA: 0.05, swayPer: 3.1,   // a slow bob from side to side (metres, seconds)
  gap: 0.8,               // seconds between a cleared wave and the next
  // the aim cone of this end: wider and much higher than the targets' (rules-archery.js clampAim takes it)
  aim: { yawMax: 0.34, pitchMin: -0.04, pitchMax: 0.68 },
  // r: radius (m), pts: points, sail: how much of the wind's speed it takes up, rise: its own factor on the level's climb
  kinds: {
    big: { r: 0.52, pts: 2, sail: 0.2 },
    mid: { r: 0.42, pts: 3, sail: 0.13 },
    small: { r: 0.34, pts: 4, sail: 0.08 },
    gold: { r: 0.38, pts: 8, sail: 0.08, rise: 1.3 },
  },
  colours: 6,             // how many colours the drawing has for the plain balloons (the golden one has its own)
  // The levels. arrows; rise (m/s); hit: the arrow's hit circle as a factor of the balloon's radius; selfPop: pops at the top;
  // wind: this end's share of the round's wind; waveTime: the next wave comes after this long even if balloons are still up;
  // waves: groups of balloons, each { k: kinds from the BOTTOM up, u, v, y: the bottom one's height, lineUp?: a diagonal the
  // wind lines up after about this many seconds (the higher, bigger balloons start upwind and catch up) }.
  levels: {
    easy: {
      arrows: 6, rise: 0.17, hit: 1.35, selfPop: false, wind: 1, waveTime: 18,
      waves: [
        [{ k: ['big', 'big'], u: 9.5, v: -1.5, y: 1.3 }, { k: ['mid', 'mid'], u: 10.5, v: 1.3, y: 1.4 }, { k: ['big'], u: 9.5, v: 0, y: 3.4 }],
        [{ k: ['mid', 'mid'], u: 10, v: -1.3, y: 1.3 }, { k: ['mid', 'mid'], u: 11, v: 1.5, y: 1.6 }, { k: ['small'], u: 11.5, v: 0.1, y: 3.6 }],
      ],
    },
    normal: {
      arrows: 8, rise: 0.22, hit: 1.15, selfPop: true, wind: 0.7, waveTime: 15,
      waves: [
        [{ k: ['mid', 'mid', 'mid'], u: 10.5, v: -1.4, y: 1.2 }, { k: ['big', 'big'], u: 9.5, v: 1.4, y: 1.3 }, { k: ['small'], u: 12, v: 0.1, y: 3.4 }],
        [{ k: ['small', 'mid', 'big'], u: 10.5, v: -0.4, y: 1.2, lineUp: 7 }, { k: ['mid', 'mid'], u: 10, v: 1.7, y: 1.5 }, { k: ['gold'], u: 12, v: -1.9, y: 2.4 }],
        [{ k: ['small', 'small', 'small'], u: 11.5, v: 1.3, y: 1.2 }, { k: ['mid', 'mid', 'mid'], u: 10, v: -1.5, y: 1.2 }, { k: ['big'], u: 9.5, v: 0, y: 2.6 }],
      ],
    },
    hard: {
      arrows: 8, rise: 0.3, hit: 1, selfPop: true, wind: 0.8, waveTime: 12,
      waves: [
        [{ k: ['small', 'small', 'small'], u: 11.5, v: -1.4, y: 1.2 }, { k: ['mid', 'mid', 'mid'], u: 10.5, v: 1.3, y: 1.2 }, { k: ['small'], u: 12.5, v: 0, y: 3.6 }],
        [{ k: ['small', 'mid', 'big'], u: 10.5, v: 0.9, y: 1.2, lineUp: 5 }, { k: ['small', 'small', 'mid'], u: 11.5, v: -1.2, y: 1.3, lineUp: 4 }, { k: ['gold'], u: 12.5, v: 2.2, y: 2.6 }],
        [{ k: ['small', 'small', 'small'], u: 12, v: 1.2, y: 1.2 }, { k: ['mid', 'mid', 'mid'], u: 10.5, v: -1.3, y: 1.2 }, { k: ['gold'], u: 12.5, v: 0, y: 3 }],
      ],
    },
  },
};

/** The balloon end of a level ('easy' | 'normal' | 'hard'). */
export function stagePlan(level) { return BAL.levels[level] || BAL.levels.normal; }

/** How far apart (m) the middles of two balloons of a stack hang: the upper one's knot, string and sandbag clear the lower one. */
export function stackGap(low, up) {
  const K = BAL.kinds;
  return K[up].r * BAL.knot + BAL.string + BAL.weightR * 2 + 0.08 + K[low].r;
}

/** What a group is worth shot from the top (every balloon under it broken by the chain). */
export function groupMax(g) {
  let s = 0;
  for (let i = g.k.length - 1, n = 1; i >= 0; i--, n++) s += BAL.kinds[g.k[i]].pts * n;
  return s;
}

/** The most points a balloon end can give: its best groups, one arrow each, every chain complete. */
export function stageMax(spec) {
  const all = [];
  for (const w of spec.waves) for (const g of w) all.push(groupMax(g));
  return all.sort((a, b) => b - a).slice(0, spec.arrows).reduce((s, v) => s + v, 0);
}

function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * A new balloon end. spec: stagePlan(level); windEst: about how hard the wind of this end blows (m/s, signed: the waves are
 * let go a little upwind and a diagonal is laid out for it). The first wave is up at once.
 * S: { t, wave, balloons: [{ id, kind, r, pts, sail, rise, u, v, y (their place without the bob), sv, sy (with it: what is
 * drawn and hit), state: 'up' | 'popped' | 'away', by, col, gold, wave, group, born }], weights: [{ on, u, v, y, vy, root }],
 * score, popped, lost, away, done }.
 */
export function newStage(spec, seed = 1, windEst = 0) {
  const S = {
    spec, R: rng(seed), windEst: Math.abs(windEst) < 0.15 ? 0 : windEst, t: 0, wave: -1, waveT: 0, gap: 0,
    balloons: [], weights: [], chain: {}, score: 0, popped: 0, lost: 0, away: 0, done: false, ground: null, lastCol: -1, groups: 0,
  };
  spawnWave(S, null);
  return S;
}

function spawnWave(S, ev) {
  const W = S.spec.waves[++S.wave], R = S.R, K = BAL.kinds;
  const w = S.windEst, sign = Math.sign(w), mag = Math.abs(w);
  const mirror = R() < 0.5 ? -1 : 1, shift = -sign * Math.min(1.1, mag * 0.9);
  S.waveT = 0; S.gap = 0;
  for (const g of W) {
    const jv = (R() - 0.5) * 0.5, ph = R() * 6.283, group = S.groups++;
    let y = g.y;
    for (let i = 0; i < g.k.length; i++) {
      const kind = g.k[i], k = K[kind];
      if (i > 0) y += stackGap(g.k[i - 1], kind);
      // a diagonal: this balloon starts as far upwind of the bottom one as it will have caught up after lineUp seconds
      const lead = g.lineUp ? -sign * (k.sail - K[g.k[0]].sail) * mag * g.lineUp : 0;
      let v = g.v * mirror + shift + jv + lead;
      v = v > 3.3 ? 3.3 : v < -3.3 ? -3.3 : v;
      let col = -1;
      if (kind !== 'gold') { col = Math.floor(R() * BAL.colours); if (col === S.lastCol) col = (col + 1) % BAL.colours; S.lastCol = col; }
      S.balloons.push({
        id: S.balloons.length, kind, r: k.r, pts: k.pts, sail: k.sail, rise: S.spec.rise * (k.rise || 1), u: g.u, v, y, sv: v, sy: y, ph,
        state: 'up', by: null, col, gold: kind === 'gold', wave: S.wave, group, born: S.t,
      });
    }
  }
  ev?.push({ type: 'wave', n: S.wave });
}

function dropWeight(S, b, root) {
  let wt = null;
  for (const x of S.weights) if (!x.on) { wt = x; break; }
  if (!wt) S.weights.push(wt = {});
  wt.on = true; wt.u = b.u; wt.v = b.sv; wt.y = b.sy - b.r * BAL.knot - BAL.string; wt.vy = 0; wt.root = root; wt.from = b.id;
}

/** Pop a balloon. by: 'arrow' | 'weight' | 'self'; root: the arrow's number (0, 1, ...) or a negative number for a balloon that popped by itself. */
function pop(S, b, by, root, ev) {
  const lost = root < 0, n = S.chain[root] = (S.chain[root] || 0) + 1;
  const mult = by === 'weight' ? n : 1, pts = lost ? 0 : b.pts * mult;
  b.state = 'popped'; b.by = by; b.lost = lost; b.popT = S.t;
  S.score += pts;
  if (lost) S.lost++; else S.popped++;
  dropWeight(S, b, root);
  ev?.push({ type: 'pop', b, by, root, chain: n, mult, pts, lost });
  return pts;
}

/** Does an 'up' balloon still hang in the stage (any wave)? */
export function liveCount(S) { let n = 0; for (const b of S.balloons) if (b.state === 'up') n++; return n; }
/** Is a sandbag still falling? */
export function falling(S) { for (const w of S.weights) if (w.on) return true; return false; }

/**
 * Advance the stage by dt seconds in a crosswind of w m/s (signed, as rules-archery.js windAt gives it). What happened is
 * pushed to `events` (optional): { type: 'pop', b, by, root, chain, mult, pts, lost } | { type: 'away', b } |
 * { type: 'thud', u, v, y } (a sandbag reached the ground) | { type: 'wave', n }.
 */
export function stepStage(S, dt, w, events = null) {
  const spec = S.spec, B = S.balloons;
  let left = dt;
  while (left > 1e-9) {
    const h = left > 1 / 60 ? 1 / 60 : left;
    left -= h;
    S.t += h; S.waveT += h;
    let up = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.state !== 'up') continue;
      b.y += b.rise * h;
      b.v += w * b.sail * h;
      const a = S.t * 6.283 / BAL.swayPer + b.ph;
      b.sv = b.v + BAL.swayA * Math.sin(a);
      b.sy = b.y + BAL.swayA * 0.5 * Math.sin(a * 1.7);
      if (spec.selfPop && b.y >= BAL.ceil) pop(S, b, 'self', -1 - b.id, events);
      else if (b.y > BAL.ceil + BAL.over || b.v > BAL.side || b.v < -BAL.side) { b.state = 'away'; S.away++; events?.push({ type: 'away', b }); }
      else up++;
    }
    // the sandbags fall straight down; one that comes down on a balloon pops it (and falls on)
    let fall = 0;
    for (let k = 0; k < S.weights.length; k++) {
      const wt = S.weights[k];
      if (!wt.on) continue;
      const py = wt.y;
      wt.vy -= BAL.gW * h;
      wt.y += wt.vy * h;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (b.state !== 'up' || b.id === wt.from) continue;
        if (Math.abs(b.u - wt.u) > 0.6 || Math.abs(b.sv - wt.v) > b.r * BAL.land + BAL.weightR) continue;
        if (py >= b.sy - b.r * 0.5 && wt.y <= b.sy + b.r) { pop(S, b, 'weight', wt.root, events); up--; }
      }
      const gr = S.ground ? S.ground(wt.u, wt.v) : 0;
      if (wt.y <= gr) { wt.on = false; events?.push({ type: 'thud', u: wt.u, v: wt.v, y: gr }); } else fall++;
    }
    // the waves: the next one when this one is cleared (after a breath), or when its time is up
    if (!S.done) {
      if (S.wave + 1 < spec.waves.length) {
        if (up <= 0 ? (S.gap += h) >= BAL.gap : S.waveT >= spec.waveTime) spawnWave(S, events);
      } else if (up <= 0 && fall === 0) S.done = true;
    }
  }
  return S;
}

/**
 * An arrow flew from (pu, pv, py) to (au, av, ay) this step: every balloon whose plane it crossed inside its hit circle pops
 * (the arrow flies on). root: the arrow's number in this end. Returns how many it popped.
 */
export function arrowPops(S, pu, pv, py, au, av, ay, root, events = null) {
  let n = 0;
  const B = S.balloons, hit = S.spec.hit;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (b.state !== 'up' || !(pu < b.u && au >= b.u)) continue;
    const f = (b.u - pu) / ((au - pu) || 1e-9), cv = pv + (av - pv) * f, cy = py + (ay - py) * f;
    if (Math.hypot(cv - b.sv, cy - b.sy) <= b.r * hit) { pop(S, b, 'arrow', root, events); n++; }
  }
  return n;
}

/** The balloon an aim points nearest to (by angle from the muzzle at (mu, mv, eye)), or null: for the crosshair. */
export function nearestBalloon(S, yaw, pitch, mu, mv, eye) {
  let best = null, bd = 1e9;
  for (const b of S.balloons) {
    if (b.state !== 'up') continue;
    const du = b.u - mu, d = Math.hypot(Math.atan2(b.sv - mv, du) - yaw, Math.atan2(b.sy - eye, du) - pitch);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** The top balloon of a group that is still up (the clever shot), or null. */
export function topOf(S, group) {
  let top = null;
  for (const b of S.balloons) if (b.state === 'up' && b.group === group && (!top || b.y > top.y)) top = b;
  return top;
}
