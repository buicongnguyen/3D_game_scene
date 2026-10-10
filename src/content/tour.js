// The scene tour (Settings → Scene tour, and the title menu): pure data and pure math, read by the runtime
// (game/tour.js) and by Node tests (tests/tour.test.mjs). No three.js objects are made here.
//
// A tour is a list of stops. Each stop is a place (camera position + the point it looks at) with an hour of the day and
// one warm line. The camera glides from stop to stop along a centripetal Catmull-Rom curve through the camera points,
// rests a few seconds at each, and the hour eases along with it. Everything is a function of the tour clock `t`
// (seconds), so the flight can be paused, stepped and replayed exactly.
// Coordinates: metres, x east, z south, y up (world/layout.js).

import { BUILDINGS, LAMPS, VIADUCT, DECK_Y } from '../world/layout.js';
import { FOOTPRINT } from '../world/structures.js';
import { N_ } from '../i18n/i18n.js';

export const DWELL = 5.5;            // seconds resting at a stop
export const TRAVEL = [3.2, 8.5];    // shortest and longest glide between two stops
export const SPEED = 20;             // metres per second a long glide aims for
export const FOV = { wide: 55, tall: 70 };   // landscape and portrait lenses (vertical degrees)

// ------------------------------------------------------------------ places
// cam / look: the framing on a landscape screen. tall: optional framing for portrait phones (else the camera simply
// steps back along its own line of sight). does: what the runtime adds there ('fish', 'train', 'stars').
export const TOUR_PLACES = {
  kawabe: { name: N_('Kawabe'), cam: [-45.2, 7.4, 66], look: [-45, 4.4, 26] },
  fields: { name: N_('The rice terraces'), cam: [-63, 12.5, 44], look: [-86, 4.2, 12] },
  dock: { name: N_('Kawabe Dock'), cam: [3.4, 7.6, 35.4], look: [8.6, -0.2, 29.2], does: 'fish', fish: [10.2, 30.2], drift: 0.05 },
  mill: { name: N_('Ōta Mill'), cam: [15, 8.5, -27], look: [-8, 4.6, -46] },
  orchard: { name: N_('Peach orchard'), cam: [101, 29.5, -24], look: [72, 20.5, -52] },
  takamori: { name: N_('Takamori'), cam: [104, 28.5, 31], look: [115, 28, -4] },
  shrine: { name: N_('Forest Shrine'), cam: [59, 27.5, -124], look: [66, 32, -157] },
  viaduct: { name: N_('The viaduct'), cam: [-11, 5, 170], look: [2, 13.5, 120], does: 'train', dwell: 7.5 },
  hill: { name: N_('Stargazing hill'), cam: [-56, 19.4, 164], look: [-55, 46, 112], does: 'stars', dwell: 8, drift: 0.04 },
};

// ------------------------------------------------------------------ the five tours
// season: the look of the valley; weather: falling petals / leaves / snow / fireflies (null = clear air);
// festival: the valley's festive lanterns and garlands are hung. stops: [place, hour, line].
const stop = (place, hour, line, more) => ({ place, hour, line, ...more });

export const TOURS = [
  {
    id: 'spring', season: 'spring', name: N_('Spring'), blurb: N_('Blossom morning'), weather: 'petals',
    stops: [
      stop('kawabe', 7.9, N_('Petals drift down the main street as the shutters open.')),
      stop('fields', 8.5, N_('Young rice stands in mirror-bright water.')),
      stop('dock', 9.2, N_('Look down: trout and koi idle in the clear shallows.')),
      stop('mill', 9.8, N_('The wheel turns, and the Mill Lamp keeps watch from its island.')),
      stop('shrine', 10.3, N_('Up the long stair wait the great hall and its tall lamp.')),
      stop('orchard', 10.8, N_('Pink blossom opens among the orchard trees.')),
      stop('takamori', 11.3, N_('The bell tower counts the morning over the square.')),
      stop('viaduct', 11.8, N_('The little train crosses high above the river.')),
    ],
  },
  {
    id: 'summer', season: 'summer', name: N_('Summer'), blurb: N_('Long green afternoon'), weather: null, festival: true,
    stops: [
      stop('takamori', 14.0, N_('Festival lanterns hang over the hilltop square.')),
      stop('orchard', 14.6, N_('The peaches are ripe, and the scarecrows are busy.')),
      stop('shrine', 15.4, N_('Deep shade, cool stone and the sound of cicadas.')),
      stop('mill', 16.2, N_('The river runs low and bright past the mill.')),
      stop('dock', 16.9, N_('Fish flicker under the dock in the afternoon sun.')),
      stop('kawabe', 17.6, N_('The street slows down for the warm evening.')),
      stop('fields', 19.0, N_('Dusk over the paddies: the lanterns come on and the fireflies rise.'), { weather: 'fireflies' }),
      stop('hill', 20.0, N_("Evening settles over the hill, and the first stars come out."), { weather: 'fireflies' }),
    ],
  },
  {
    id: 'autumn', season: 'autumn', name: N_('Autumn'), blurb: N_('Golden harvest'), weather: 'leaves',
    stops: [
      stop('fields', 15.0, N_('The rice has turned to gold, ready for the harvest.')),
      stop('kawabe', 15.5, N_('Red leaves gather along the main street.')),
      stop('dock', 16.0, N_('Leaves sail down the river over the fish.')),
      stop('mill', 16.4, N_('Flour dust and woodsmoke by the old mill.')),
      stop('shrine', 16.8, N_('The maples burn red around the Forest Shrine.')),
      stop('orchard', 17.1, N_('The orchard rests after the picking.')),
      stop('takamori', 17.4, N_('Warm light on the bell tower at the end of the day.')),
      stop('viaduct', 17.9, N_('The evening train rolls home through the sunset.')),
    ],
  },
  {
    id: 'winter', season: 'winter', name: N_('Winter'), blurb: N_('Snow and lit windows'), weather: 'snow',
    stops: [
      stop('viaduct', 15.2, N_('Snow settles on the arches as the train steams across.')),
      stop('kawabe', 15.9, N_('Snow on every roof, and a warm stove behind every door.')),
      stop('fields', 16.5, N_('The terraces sleep under a white blanket.')),
      stop('dock', 17.0, N_('The river has frozen hard enough to walk on.')),
      stop('mill', 17.5, N_("Icicles on the wheel, a light in the miller's window.")),
      stop('shrine', 18.1, N_('The shrine stands quiet in the falling snow.')),
      stop('takamori', 18.9, N_('Evening: the windows of Takamori glow across the snow.')),
    ],
  },
  {
    id: 'night', season: 'summer', name: N_('Night'), blurb: N_('Lanterns and stars'), weather: 'fireflies', festival: true, night: true,
    stops: [
      stop('kawabe', 20.7, N_('Festival lanterns light the quiet main street.')),
      stop('fields', 21.1, N_('Field lanterns glow between the paddies, and the fireflies dance.')),
      stop('dock', 21.5, N_('Koi glide through the lantern light under the dock.')),
      stop('mill', 21.9, N_('The Mill Lamp shines on the dark water.')),
      stop('shrine', 22.3, N_('The Forest Lamp burns high above the trees.')),
      stop('takamori', 22.7, N_('The Orchard Lamp watches over the sleeping square.')),
      stop('viaduct', 23.1, N_('The night train crosses with its lamps lit.')),
      stop('hill', 23.6, N_('Look up: a sky full of stars, and now and then one falls.')),
    ],
  },
];
export const TOUR = Object.fromEntries(TOURS.map(t => [t.id, t]));
export const YEAR = { id: 'year', name: N_('Whole year'), blurb: N_('All five, one after another') };

// Every line the tour shows that is not in the tables above (the i18n catalogue reads them from here).
export const TEXT = {
  title: N_('Scene tour'),
  intro: N_('Sit back and watch Hoshi Valley through the four seasons and under the stars.'),
  safe: N_('Your game is not changed.'),
  busy: N_('The tour can start once this scene is over. Finish what you are doing, then come back.'),
  length: N_('{n} min'),
  pause: N_('Pause'), resume: N_('Resume'), replay: N_('Replay'), back: N_('Back'),
  prev: N_('Previous stop'), next: N_('Next stop'),
  keys: N_('Space · Pause   ← → · Stops   Esc · Back'),
  of: N_('{season} · stop {i} of {n}'),
  done: N_('That was the tour. Replay it, pick another season, or go back.'),
};

// ------------------------------------------------------------------ pure math
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** The framing of one stop: the place's, with the stop's own overrides (cam, look, dwell, drift). */
export function shotOf(st) {
  const p = TOUR_PLACES[st.place];
  return { ...p, ...st, name: p.name };
}

/** Point on a centripetal Catmull-Rom segment p1 -> p2 (neighbours p0, p3) at s in 0..1. */
export function catmull(p0, p1, p2, p3, s) {
  // a missing or coincident neighbour is mirrored, so the ends leave and arrive straight
  if (!p0 || dist3(p0, p1) < 1e-4) p0 = mix3(p2, p1, 2);
  if (!p3 || dist3(p3, p2) < 1e-4) p3 = mix3(p1, p2, 2);
  const t0 = 0, t1 = t0 + Math.sqrt(dist3(p0, p1)), t2 = t1 + Math.sqrt(dist3(p1, p2)), t3 = t2 + Math.sqrt(dist3(p2, p3));
  if (t2 - t1 < 1e-6) return p1.slice();
  const t = lerp(t1, t2, s);
  const w = (a, b, ta, tb) => mix3(a, b, (t - ta) / (tb - ta));
  const A1 = w(p0, p1, t0, t1), A2 = w(p1, p2, t1, t2), A3 = w(p2, p3, t2, t3);
  const B1 = w(A1, A2, t0, t2), B2 = w(A2, A3, t1, t3);
  return w(B1, B2, t1, t2);
}

/**
 * The tour's clock: [{ kind: 'travel'|'dwell', i, t0, t1 }] and the total length in seconds. Stop 0 has no travel;
 * a glide lasts as long as its distance asks for, within TRAVEL.
 */
export function timeline(tour) {
  const segs = [];
  let t = 0;
  tour.stops.forEach((st, i) => {
    const s = shotOf(st);
    if (i > 0) {
      const d = dist3(shotOf(tour.stops[i - 1]).cam, s.cam), dur = clamp(d / SPEED, TRAVEL[0], TRAVEL[1]);
      segs.push({ kind: 'travel', i, t0: t, t1: t + dur, dist: d });
      t += dur;
    }
    const dwell = s.dwell ?? DWELL;
    segs.push({ kind: 'dwell', i, t0: t, t1: t + dwell });
    t += dwell;
  });
  return { segs, length: t };
}

/** The moment (seconds) a stop's rest begins. */
export function stopTime(tl, i) { return tl.segs.find(s => s.kind === 'dwell' && s.i === i)?.t0 ?? 0; }

// ------------------------------------------------------------------ what the camera must stay clear of
/** Solid boxes the camera may not enter: buildings, lamp towers and the viaduct. [{ x, z, hw, hd, c, s, top(base) }] */
export function obstacles() {
  const rad = d => d * Math.PI / 180, out = [];
  const add = (id, model, x, z, rot, y) => {
    const fp = FOOTPRINT[model];
    if (!fp || model === 'platform') return;
    const r = rad(rot || 0);
    out.push({ id, x, z, hw: fp[0] / 2, hd: fp[1] / 2, c: Math.cos(r), s: Math.sin(r), h: fp[2], y });
  };
  for (const b of BUILDINGS) add(b.id, b.model, b.x, b.z, b.rot, b.y);
  for (const l of LAMPS) if (l.model) add(`lamp:${l.id}`, l.model, l.x, l.z, l.rot, l.y);
  // the viaduct: deck and a passing train, bank to bank
  out.push({ id: 'viaduct', x: (VIADUCT.x0 + VIADUCT.x1) / 2, z: VIADUCT.z, hw: (VIADUCT.x1 - VIADUCT.x0) / 2 + 2, hd: 3.2, c: 1, s: 0, h: 5.5, y: DECK_Y });
  return out;
}

let OBST = null;
/**
 * Height the camera must be above at (x, z) to clear what stands there (grown by `pad` metres), or -Infinity.
 * soft > 0 adds a ramp of that many metres round each obstacle, so a glide rises over a roof instead of popping up.
 */
export function roofAt(x, z, heightAt, pad = 1.5, soft = 0) {
  let top = -Infinity;
  for (const o of (OBST ??= obstacles())) {
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
    const out = Math.max(Math.abs(lx) - o.hw, Math.abs(lz) - o.hd) - pad;      // metres outside the padded box
    if (out > soft) continue;
    const roof = (o.y ?? heightAt(o.x, o.z)) + o.h;
    if (out <= 0) { top = Math.max(top, roof); continue; }
    const base = Math.max(heightAt(x, z), 0);
    top = Math.max(top, base + (roof - base) * (1 - smooth(out / soft)));
  }
  return top;
}

/** Lift a camera so the ground never hides its subject (after KITEFALL's clearCameraTerrain). Mutates and returns `cam`. */
export function clearSight(cam, look, heightAt, margin = 1) {
  for (let i = 1; i < 24; i++) {
    const f = i / 24;
    const x = lerp(cam[0], look[0], f), z = lerp(cam[2], look[2], f), y = lerp(cam[1], look[1], f);
    const rise = Math.max(heightAt(x, z), 0) + margin * (1 - f) - y;
    if (rise > 0 && f < 0.92) cam[1] += rise / (1 - f);
  }
  return cam;
}

/**
 * Where the camera is at tour time `t`: { pos, look, hour, i (the stop it is at or gliding to), kind, f (0..1 through
 * the segment), weather }. `env.heightAt(x, z)` is the ground; `env.aspect` the screen's width / height (portrait
 * screens step back for the same view). Pure: the same t gives the same pose.
 */
export function poseAt(tour, tl, t, env) {
  const { heightAt, aspect = 16 / 9 } = env;
  t = clamp(t, 0, tl.length);
  const seg = tl.segs.find(s => t < s.t1) || tl.segs[tl.segs.length - 1];
  const f = clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1), i = seg.i;
  const tall = aspect < 0.9;
  const frame = k => {
    const s = shotOf(tour.stops[k]), v = tall && s.tall ? s.tall : s;
    return { ...s, cam: v.cam, look: v.look, own: tall && !!s.tall };
  };
  const B = frame(i);
  let pos, look, hour, lift = 0;
  if (seg.kind === 'dwell') {
    // a slow drift round the subject keeps the rest alive: a few degrees of orbit and a gentle push in
    pos = dwellPose(B, f);
    look = B.look.slice();
    hour = B.hour;
  } else {
    const A = frame(i - 1), k = smooth(f);
    const start = dwellPose(A, 1), end = dwellPose(B, 0);
    const before = i > 1 ? frame(i - 2).cam : null, after = i + 1 < tour.stops.length ? frame(i + 1).cam : null;
    pos = catmull(before, start, end, after, k);
    // the curve may swing wide of a straight hop; keep its height between honest bounds, then arc up over the trees
    lift = Math.sin(Math.PI * k);
    pos[1] = lerp(start[1], end[1], k) + lift * clamp(seg.dist * 0.1, 0, 13);
    look = mix3(A.look, B.look, smooth(f));
    hour = lerp(A.hour, B.hour, smooth(f));
  }
  // portrait: the same subject needs more room, so the camera steps back along its own line of sight
  if (tall && !B.own) {
    const k = 1.28;
    pos = [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k];
  }
  // never under the ground or the water, never inside a building; glides fly well above the tree tops
  const clear = lerp(1.2, 9, lift);
  pos[1] = Math.max(pos[1], Math.max(heightAt(pos[0], pos[2]), 0) + clear, roofAt(pos[0], pos[2], heightAt, 1.5, 16 * lift) + 1.2);
  if (seg.kind === 'travel') clearSight(pos, look, heightAt, 1);
  const st = tour.stops[i];
  return { pos, look, hour, i, kind: seg.kind, f, weather: st.weather !== undefined ? st.weather : tour.weather };
}

// the camera during a stop's rest, f = 0..1 through it (the glides join on at 0 and 1)
function dwellPose(B, f) {
  const a = (f - 0.5) * (B.drift ?? 0.09), k = 1.025 - 0.05 * f;
  const dx = B.cam[0] - B.look[0], dz = B.cam[2] - B.look[2], c = Math.cos(a), s = Math.sin(a);
  return [B.look[0] + (dx * c - dz * s) * k, B.look[1] + (B.cam[1] - B.look[1]) * k, B.look[2] + (dx * s + dz * c) * k];
}
