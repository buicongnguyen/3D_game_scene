// Dew webs at dawn: the rules (pure, no three.js; tested in tests/tricks2-kite-dew.test.mjs).
//
// A web is almost invisible. It shows when Mika is close AND stands on its sunward side (the low sun behind her lights
// every drop). A web can be photographed from close by once it shows well. Score: 10 per web, and a speed bonus when
// every web is found.
//
// Three levels (DEW_LEVELS). Easy: five webs close by, seen from further off. Normal: eight webs over a bigger patch, and
// in the second half the sun climbs: the webs dry one after the other, the sunny side first (so the route matters).
// Difficult: ten webs, the drying, two old webs with no dew on them (a photo of one costs points: look for the sparkle
// first) and a perfect photo, taken right in line with the sun and from the right distance, is worth half as much again.

export const DEW = {
  webs: 6,          // webs hidden per round
  near: 4.5,        // fully "close" within this many metres...
  far: 12,          // ...not seen at all beyond this
  farFirst: 17,     // the guided first try shows them from further off
  snap: 3.4,        // a photo needs Mika this close
  need: 0.55,       // ...and the web at least this visible
  faint: 0.07,      // the least a web ever shows (a hair-thin glint), so the screen is never truly empty
  rMin: 5, rMax: 15, gap: 5.5,   // where webs hide around the place: ring radii, and metres between two webs
  perWeb: 10,
  maxWebs: 12,      // the most webs (old ones included) a round ever hangs up
  perfect: 5,       // extra points for a perfect photo (Difficult)
  decoy: 5,         // points a photo of an old web with no dew costs
  line: 0.9,        // a perfect photo: the cosine of the angle between Mika and the sun, seen from the web, is at least this...
  sweet: [1.5, 2.9],   // ...and she stands this far from it (m)
  dryWarn: 9,       // a web's drops fade over this many seconds before it is dry
};

/**
 * The levels. webs: dewy webs to find; decoys: old webs with no dew; rMax: how far from the sign they hang (m);
 * far: from how far a web shows; dry: the share of the round after which the webs begin to dry (0: they never do);
 * grade: photos are graded (a perfect one is worth more).
 */
export const DEW_LEVELS = {
  first: { webs: DEW.webs, decoys: 0, rMax: DEW.rMax, far: DEW.farFirst, dry: 0, grade: false },
  easy: { webs: 5, decoys: 0, rMax: 13, far: DEW.farFirst, dry: 0, grade: false },
  normal: { webs: 8, decoys: 0, rMax: 19, far: DEW.far, dry: 0.5, grade: false },
  hard: { webs: 10, decoys: 2, rMax: 22, far: DEW.far, dry: 0.45, grade: true },
};
export const dewLevel = (level, first = false) => (first ? DEW_LEVELS.first : DEW_LEVELS[level] || DEW_LEVELS.normal);

/** A small seeded random source. */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How much Mika is on the web's sunward side: 0 (sun in her eyes) .. 1 (sun at her back). dx, dz = Mika - web. */
export function sunSide(dx, dz, sunX, sunZ) {
  const d = Math.hypot(dx, dz), s = Math.hypot(sunX, sunZ);
  if (d < 1e-4 || s < 1e-4) return 1;
  return smooth(-0.15, 0.55, (dx * sunX + dz * sunZ) / (d * s));
}

/** How well a web shows, 0..1. dx, dz = Mika - web (metres); sunX, sunZ: the direction toward the sun on the ground. */
export function webVisibility(dx, dz, sunX, sunZ, far = DEW.far) {
  const d = Math.hypot(dx, dz);
  const close = 1 - smooth(DEW.near, far, d);
  return Math.max(DEW.faint * (1 - smooth(far, far * 1.8, d)), close * (0.12 + 0.88 * sunSide(dx, dz, sunX, sunZ)));
}

/** Can Mika photograph the web from here? 'ok', 'far', or 'side' (close enough, but on the wrong side of the sun). */
export function photoCheck(dx, dz, sunX, sunZ) {
  if (Math.hypot(dx, dz) > DEW.snap) return 'far';
  return webVisibility(dx, dz, sunX, sunZ) >= DEW.need ? 'ok' : 'side';
}

/**
 * Where the webs hide: n spots { x, z, rot, h } around (0, 0), seeded, at least `gap` apart, each passing ok(x, z)
 * (dry, not steep, nothing in the way). Tries a fixed number of times, so it always returns (maybe fewer than n).
 */
export function webSpots(seed, n = DEW.webs, ok = () => true, { rMin = DEW.rMin, rMax = DEW.rMax, gap = DEW.gap } = {}) {
  const R = rng(seed), out = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    // spread round the ring: each web starts in its own sector, then loosens up when the sector has no room
    const sector = (out.length + (i > 200 ? R() * n : R() * 0.9)) / n * Math.PI * 2;
    const r = rMin + Math.sqrt(R()) * (rMax - rMin);
    const x = Math.cos(sector) * r, z = Math.sin(sector) * r;
    const rot = (R() - 0.5) * 0.9, h = 0.75 + R() * 0.45;
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < gap) || !ok(x, z)) continue;
    out.push({ x, z, rot, h });
  }
  return out;
}

/**
 * A perfect photo (Difficult)? dx, dz = Mika - web. She stands in line with the sun (it is right behind her) and at
 * the right distance for the web to fill the picture.
 */
export function photoPerfect(dx, dz, sunX, sunZ) {
  const d = Math.hypot(dx, dz), s = Math.hypot(sunX, sunZ);
  if (d < DEW.sweet[0] || d > DEW.sweet[1] || s < 1e-4) return false;
  return (dx * sunX + dz * sunZ) / (d * s) >= DEW.line;
}

/**
 * When each web dries (seconds into the round), or Infinity when the webs of this level never do. The webs on the
 * sunny side go first: they are ranked by how far toward the sun they hang, and dry one after the other from
 * `from * length` on, the last one as the round ends. Old webs (decoy) are dry already and take no part.
 */
export function dryTimes(webs, sunX, sunZ, length, from) {
  const out = webs.map(() => Infinity);
  if (!(from > 0)) return out;
  const order = webs.map((w, i) => i).filter(i => !webs[i].decoy).sort((a, b) => (webs[b].x * sunX + webs[b].z * sunZ) - (webs[a].x * sunX + webs[a].z * sunZ));
  order.forEach((i, k) => { out[i] = length * (from + (1 - from) * (k + 1) / order.length); });
  return out;
}

/** How dry a web is at `t` seconds: 0 (wet) .. 1 (dry and gone), fading over the last DEW.dryWarn seconds. */
export function dryness(t, dryAt) {
  return dryAt === Infinity ? 0 : Math.min(1, Math.max(0, 1 - (dryAt - t) / DEW.dryWarn));
}

/** The nearest web not yet found (nor dried away): its index, or -1. webs: [{ x, z, found, dry }], (px, pz): Mika. */
export function nearestWeb(webs, px, pz) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < webs.length; i++) {
    if (webs[i].found || webs[i].dry) continue;
    const d = Math.hypot(webs[i].x - px, webs[i].z - pz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Round score: 10 per web; when all are found, a point for every 3 seconds left on the clock. Difficult: 5 more for
 * each perfect photo, 5 fewer for each photo of an old web with no dew.
 */
export function dewScore({ found = 0, total = DEW.webs, seconds = 0, length = 90, perfect = 0, decoys = 0 }) {
  const bonus = found >= total && total > 0 ? Math.max(0, Math.round((length - seconds) / 3)) : 0;
  return Math.max(0, found * DEW.perWeb + perfect * DEW.perfect - decoys * DEW.decoy + bonus);
}
