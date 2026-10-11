// How high the valley's rim stands in the sky seen from a place, and how high Mika must fly (with the Star Kite) for
// the low star groups to clear it. Pure maths, Node-readable: tests/skyflight.test.mjs checks it on a toy terrain, and
// tools/measure-horizon.mjs measures the real valley (content/skyspots.js `lift` is the answer for every spot).
//
// Azimuths follow content/constellations.js: degrees from north through east (x east, z south).
const RAD = Math.PI / 180;

/**
 * The elevation angle (degrees above the level horizon through the eye) of the highest thing along every azimuth.
 * heightAt(x, z): the ground; obstacles: [{ x, z, top, r }] (tree crowns, towers) seen as discs; eyeY: the eye's height.
 * Returns { step, n, el: Float32Array } with el[i] the angle at azimuth i * step.
 */
export function horizonProfile({ heightAt, x, z, eyeY, step = 5, maxDist = 420, obstacles = [], near = 4, inside = null }) {
  const n = Math.round(360 / step), el = new Float32Array(n).fill(-90);
  for (let i = 0; i < n; i++) {
    const az = i * step * RAD, sx = Math.sin(az), sz = -Math.cos(az);
    let best = -90;
    // fine steps near, coarser far (the rim is smooth; a 2 m terrain grid is the finest detail there is)
    for (let d = near; d <= maxDist; d += d < 60 ? 2 : d < 160 ? 4 : 8) {
      const px = x + sx * d, pz = z + sz * d;
      if (inside && !inside(px, pz)) break;                       // past the edge of the drawn terrain there is only sky
      const a = Math.atan2(heightAt(px, pz) - eyeY, d) / RAD;
      if (a > best) best = a;
    }
    el[i] = best;
  }
  for (const o of obstacles) {
    const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
    if (d < near || d > maxDist) continue;
    const a = Math.atan2(o.top - eyeY, d) / RAD;
    const az = (Math.atan2(dx, -dz) / RAD + 360) % 360, half = Math.min(60, Math.atan2(o.r, d) / RAD);
    for (let k = Math.floor((az - half) / step); k <= Math.ceil((az + half) / step); k++) {
      const j = ((k % n) + n) % n;
      if (a > el[j]) el[j] = a;
    }
  }
  return { step, n, el };
}

/** The highest angle of a profile inside the arcs (degrees, [from, to] through north allowed: [300, 60]); no arcs = all round. */
export function worstIn(profile, arcs = null) {
  const { step, n, el } = profile;
  let worst = -90;
  for (let i = 0; i < n; i++) {
    const az = i * step;
    if (arcs && !arcs.some(([a, b]) => (a <= b ? az >= a && az <= b : az >= a || az <= b))) continue;
    if (el[i] > worst) worst = el[i];
  }
  return worst;
}

/** The angle at an azimuth (interpolated). */
export function elevationAt(profile, azDeg) {
  const { step, n, el } = profile, f = (((azDeg % 360) + 360) % 360) / step, i = Math.floor(f), u = f - i;
  return el[i % n] * (1 - u) + el[(i + 1) % n] * u;
}

/**
 * The lowest altitude (metres above the take-off spot) at which the rim stays under `maxEl` degrees inside the arcs.
 * profileAt(altitude) -> profile. Tries `levels` in order; when none is clear, the one with the lowest rim (never
 * above the highest level). Returns { alt, worst, clear }.
 */
export function clearAltitude(profileAt, maxEl, levels = [0, 20, 40, 60, 80, 100, 120], arcs = null) {
  let best = null;
  for (const alt of levels) {
    const worst = worstIn(profileAt(alt), arcs);
    if (worst <= maxEl) return { alt, worst, clear: true };
    if (!best || worst < best.worst - 0.25) best = { alt, worst, clear: false };
  }
  return best;
}

/**
 * Dip of the true horizon below the level one, for an eye `h` metres up over a flat plain (degrees). The valley is
 * ringed by mountains, so this is only the open-sea case; kept for the sky dome's own horizon line.
 */
export const horizonDip = h => Math.acos(6371000 / (6371000 + Math.max(0, h))) / RAD;
