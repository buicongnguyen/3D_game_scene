// Dew webs at dawn: the rules (pure, no three.js; tested in tests/tricks2-kite-dew.test.mjs).
//
// A web is almost invisible. It shows when Mika is close AND stands on its sunward side (the low sun behind her lights
// every drop). A web can be photographed from close by once it shows well. Score: 10 per web, and a speed bonus when
// every web is found.

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
};

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

/** The nearest web not yet found: its index, or -1. webs: [{ x, z, found }], (px, pz): Mika. */
export function nearestWeb(webs, px, pz) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < webs.length; i++) {
    if (webs[i].found) continue;
    const d = Math.hypot(webs[i].x - px, webs[i].z - pz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Round score: 10 per web; when all are found, a point for every 3 seconds left on the clock. */
export function dewScore({ found = 0, total = DEW.webs, seconds = 0, length = 90 }) {
  const bonus = found >= total && total > 0 ? Math.max(0, Math.round((length - seconds) / 3)) : 0;
  return found * DEW.perWeb + bonus;
}
