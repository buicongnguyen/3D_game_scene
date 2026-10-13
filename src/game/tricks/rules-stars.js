// The rules of Stargazing (game/tricks/stars.js), pure: no three.js, no DOM. Tested in tests/stars.test.mjs.
//
// The sky is the real one (content/constellations.js: catalogue positions, the season's sidereal time) seen from the
// valley at 35 degrees north, on a night hour picked per season so that the figures of every level are up (GAZE_HOUR).
// Directions are worldDir()'s: x east, y up, z south; an azimuth runs from north through east.
//
// The levels (gazePlan):
//   Easy       find north: the Big Dipper (a faint outline shows it), then its two pointer stars to the North Star.
//   Normal     the Big Dipper, Cassiopeia on the other side of the pole, the North Star between them; then turn to the
//              season's own figure (the Summer Triangle, Orion's belt, the Spring Triangle) and say which star is brightest.
//   Difficult  no outlines and no letters on the horizon (the compass rose only); the Little Dipper's faint stars while a
//              satellite glides through them; then telling a satellite from a plane and a shooting star, and counting a
//              train of satellites.
import { N_ } from '../../i18n/i18n.js';
import { STARS, lstFor, horizontal, worldDir } from '../../content/constellations.js';
import { projectSky, wrap360 } from '../../ui/sky-compass.js';

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// ------------------------------------------------------------------------------------ the figures
export const DIPPER = ['alkaid', 'mizar', 'alioth', 'megrez', 'phecda', 'merak', 'dubhe'];
export const CASS = ['caph', 'schedar', 'navi', 'ruchbah', 'segin'];
/** The Little Dipper is joined on from the North Star (the tip of its handle), down to the little bowl. */
export const LITTLE = ['polaris', 'yildun', 'epsumi', 'zetumi', 'etaumi', 'pherkad', 'kochab'];
const REVERSED = [...DIPPER].reverse(), ENDS = [DIPPER[0], DIPPER[DIPPER.length - 1]], NONE = [];
const NEXT = { fwd: DIPPER.map(k => [k]), back: REVERSED.map(k => [k]) };   // the answers of nextStars, made once

/** The next star to pick in the Dipper, given those picked so far (either end may start). Returns the allowed ids. */
export function nextStars(picked) {
  if (!picked.length) return ENDS;
  const order = picked[0] === DIPPER[0] ? NEXT.fwd : NEXT.back;
  return picked.length < order.length ? order[picked.length] : NONE;      // (shared lists: read, never changed)
}

/**
 * The next star of any figure joined as a chain: either end may start (both are offered), then it runs on from that end.
 * `out`: a list to fill instead of a new one (the round asks every frame).
 */
export function nextInChain(chain, picked, out = []) {
  out.length = 0;
  if (!picked.length) { out.push(chain[0], chain[chain.length - 1]); return out; }
  if (picked.length >= chain.length) return out;
  out.push(picked[0] === chain[0] ? chain[picked.length] : chain[chain.length - 1 - picked.length]);
  return out;
}

/** The stars of a figure joined in any order that are still to pick. */
export function nextInSet(set, picked, out = []) {
  out.length = 0;
  for (const k of set) if (!picked.includes(k)) out.push(k);
  return out;
}

/**
 * The season's figure of the Normal level: { id, group (content/constellations.js), join: the stars to join, order:
 * 'chain' | 'any', show: more stars of the figure drawn once it is joined, lines: drawn then, bright: its brightest star,
 * zoom: under 1 the view looks closer (the belt's three stars stand very close together) }.
 */
export const SEASON_FIGURES = {
  'summer-triangle': { id: 'summer-triangle', group: 'summer-triangle', join: ['vega', 'deneb', 'altair'], order: 'any', show: [], lines: [['vega', 'deneb'], ['deneb', 'altair'], ['altair', 'vega']], bright: 'vega' },
  'spring-triangle': { id: 'spring-triangle', group: 'spring-triangle', join: ['arcturus', 'spica', 'denebola'], order: 'any', show: [], lines: [['arcturus', 'spica'], ['spica', 'denebola'], ['denebola', 'arcturus']], bright: 'arcturus' },
  orion: { id: 'orion', group: 'orion', join: ['alnitak', 'alnilam', 'mintaka'], order: 'any', zoom: 0.7, show: ['betelgeuse', 'bellatrix', 'saiph', 'rigel'],
    lines: [['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel'], ['betelgeuse', 'bellatrix'], ['saiph', 'rigel']], bright: 'rigel' },
};
/** Which figure a season would like, best first (before dawn in autumn the winter hunter is already up). */
const SEASON_WISH = { spring: ['spring-triangle', 'summer-triangle'], summer: ['summer-triangle'], autumn: ['orion'], winter: ['orion'] };
const figStars = f => [...f.join, ...f.show];

// ------------------------------------------------------------------------------------ the sky of a round
export const GAZE_LAT = 35;
/** The hour of the round's night, per season: the Big Dipper and Cassiopeia both clear the hills, and a figure of the season is up. */
export const GAZE_HOUR = { spring: 3, summer: 21, autumn: 4, winter: 23 };

/** The sky of a round: { season, hour, lst (sidereal hours), lat }. */
export function gazeSky(season = 'summer') {
  const s = GAZE_HOUR[season] === undefined ? 'summer' : season;
  return { season: s, hour: GAZE_HOUR[s], lst: lstFor(s, GAZE_HOUR[s]), lat: GAZE_LAT };
}
/** Where a star stands in that sky: { alt, az } in degrees. */
export const starAt = (id, sky) => horizontal(STARS[id].ra, STARS[id].dec, sky.lst, sky.lat);
/** The same as a unit vector [x east, y up, z south]. */
export function starDir(id, sky, out = [0, 0, 0]) { const h = starAt(id, sky); return worldDir(h.alt, h.az, out); }
/** The middle of some stars: { alt, az, lo, hi } (the mean direction, and the lowest and highest of them). */
export function middleOf(ids, sky) {
  const s = [0, 0, 0], d = [0, 0, 0];
  let lo = 90, hi = -90;
  for (const id of ids) { const h = starAt(id, sky); worldDir(h.alt, h.az, d); s[0] += d[0]; s[1] += d[1]; s[2] += d[2]; lo = Math.min(lo, h.alt); hi = Math.max(hi, h.alt); }
  const l = Math.hypot(s[0], s[1], s[2]) || 1;
  return { alt: Math.asin(s[1] / l) / RAD, az: wrap360(Math.atan2(s[0], -s[2]) / RAD), lo, hi };
}
/** The figure of the season in a sky: the first wished-for one whose stars all stand 12 degrees up, else the highest. */
export function seasonFigure(sky) {
  const low = f => Math.min(...figStars(f).map(id => starAt(id, sky).alt));
  for (const id of SEASON_WISH[sky.season] || []) if (low(SEASON_FIGURES[id]) >= 12) return SEASON_FIGURES[id];
  return Object.values(SEASON_FIGURES).sort((a, b) => low(b) - low(a))[0];
}

// ------------------------------------------------------------------------------------ the levels
/** The figures joined star by star: { chain, from: picked already (the Little Dipper starts at the North Star, found before) }. */
export const FIGURES = { dipper: { chain: DIPPER, from: 0 }, cass: { chain: CASS, from: 0 }, little: { chain: LITTLE, from: 1 } };
/** The steps that are one answer each (20 points): the brightest star, the satellite among three lights, the train's count. */
export const TASKS = ['bright', 'satellite', 'train'];

/**
 * What a level asks for: {
 *   steps      'dipper' | 'cass' | 'polaris' | 'little' | 'season' | 'bright' | 'satellite' | 'train', in order
 *   outline    the figures whose faint outline is drawn before they are joined
 *   guide      how far the pointer line is drawn toward the North Star (0..1)
 *   horizon    the letters on the horizon: 'on' | 'off' (the rose chip is always there)
 *   decoy      a satellite glides through the Little Dipper while it is joined
 *   nudge      wrong picks before the next star starts to pulse (0: never)
 *   par        seconds of play (reading pauses not counted) for the speed bonus
 *   figure     the season's figure (Normal)
 *   stars, tasks   how many stars are joined and how many answers are asked for in all }
 * The guided first try is Easy with the pointer line drawn nearly all the way.
 */
export function gazePlan(level = 'normal', first = false, sky = gazeSky()) {
  const plan = first || level === 'easy' ? { steps: ['dipper', 'polaris'], outline: ['dipper'], guide: first ? 0.9 : 0.6, horizon: 'on', decoy: false, nudge: 2, par: 45 }
    : level === 'hard' ? { steps: ['dipper', 'polaris', 'little', 'satellite', 'train'], outline: [], guide: 0, horizon: 'off', decoy: true, nudge: 0, par: 100 }
      : { steps: ['dipper', 'cass', 'polaris', 'season', 'bright'], outline: ['dipper'], guide: 0.35, horizon: 'on', decoy: false, nudge: 3, par: 80 };
  plan.figure = plan.steps.includes('season') ? seasonFigure(sky) : null;
  plan.stars = plan.steps.reduce((n, s) => n + (FIGURES[s] ? FIGURES[s].chain.length - FIGURES[s].from : s === 'season' ? plan.figure.join.length : 0), 0);
  plan.tasks = plan.steps.filter(s => TASKS.includes(s)).length;
  return plan;
}

/** Every named star of a plan, once each, in the order they are met. */
export function planStars(plan) {
  const ids = [];
  const add = id => { if (!ids.includes(id)) ids.push(id); };
  for (const s of plan.steps) {
    if (FIGURES[s]) FIGURES[s].chain.forEach(add);
    else if (s === 'polaris') add('polaris');
    else if (s === 'season') figStars(plan.figure).forEach(add);
  }
  return ids;
}

/**
 * Round score: 10 per star joined, 20 for the North Star, 20 per answer (the brightest star, the satellite, the train),
 * 15 for the wish, a speed bonus once everything is found (half a point for every second under the level's par), 4 off
 * per wrong pick. `polaris` alone means "all found" (the Easy round).
 */
export function starScore({ joined = 0, polaris = false, tasks = 0, wish = false, mistakes = 0, seconds = 99, par = 45, done = polaris }) {
  const speed = done ? Math.max(0, Math.round((par - seconds) / 2)) : 0;
  return Math.max(0, joined * 10 + (polaris ? 20 : 0) + tasks * 20 + (wish ? 15 : 0) + speed - mistakes * 4);
}

/** The most a level can score: every star and answer, the North Star, the wish and the fastest plausible finish (3 s a pick). */
export function gazeMax(plan) {
  const n = plan.stars + 1 + plan.tasks * 2;
  return starScore({ joined: plan.stars, polaris: true, tasks: plan.tasks, wish: true, seconds: n * 3, par: plan.par, done: true });
}

/** How big a star is drawn for its magnitude (the bright ones stand out; the Little Dipper's faint ones stay small). */
export const starSize = mag => clamp(0.0225 + (2 - mag) * 0.0048, 0.0165, 0.034);

// ------------------------------------------------------------------------------------ the view
/**
 * Where to look so that some points of the sky ({ alt, az } each) are in the picture, under the HUD and the hint.
 * view: { fov (vertical), aspect }. o: { yTop: the share of the screen height the HUD takes at the top, yBot: where the
 * horizon should stand (a share from the top), horizon: 'prefer' | 'force' (keep it in the picture whatever it costs) }.
 * Returns { az, alt (the view's centre), horizon: is the horizon in the picture }. The view never rolls.
 */
export function frameView(points, view, { yTop = 0.27, yBot = 0.86, horizon = 'prefer' } = {}) {
  const s = [0, 0, 0], d = [0, 0, 0];
  for (const p of points) { worldDir(p.alt, p.az, d); s[0] += d[0]; s[1] += d[1]; s[2] += d[2]; }
  const az = Math.hypot(s[0], s[2]) > 1e-6 ? wrap360(Math.atan2(s[0], -s[2]) / RAD) : points[0]?.az || 0;
  const tv = Math.tan(view.fov * RAD / 2), top = 1 - 2 * yTop;
  const withHorizon = Math.atan((2 * yBot - 1) * tv) / RAD;                   // the horizon stands at yBot with this tilt
  const v = { az, alt: 0, fov: view.fov, aspect: view.aspect }, q = { x: 0, y: 0, front: false };
  const fits = alt => { v.alt = alt; for (const p of points) { projectSky(p.az, p.alt, v, q); if (!q.front || q.y > top) return false; } return true; };
  if (horizon === 'force' || (horizon === 'prefer' && fits(withHorizon))) return { az, alt: withHorizon, horizon: true };
  // tilt up just far enough for the highest point to come under the hint
  let lo = withHorizon, hi = 84;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  return { az, alt: hi, horizon: false };
}

// ------------------------------------------------------------------------------------ satellites
export const EARTH_R = 6371, SAT_HEIGHT = 550;       // kilometres
/**
 * The Sun of the game's satellites: under the horizon, north-west before midnight and north-east after it. It is drawn 18
 * degrees down, as in the first or last hour of the night: later than that the low satellites are all in the Earth's
 * shadow and there would be nothing to watch.
 */
export const gameSun = sky => ({ az: sky.hour >= 12 ? 315 : 45, depth: 18 });

/**
 * How brightly a satellite seen at (alt, az) shines, 0..1: it reflects sunlight, so it is lit only while it is outside
 * the Earth's shadow (a cylinder behind the Earth, away from the Sun). sun: { az, depth: degrees under the horizon }.
 * The edge of the shadow is soft (`edge` kilometres), so a satellite fades over a second or two.
 */
const _d = [0, 0, 0], _s = [0, 0, 0];
export function satLight(alt, az, sun, height = SAT_HEIGHT, edge = 90) {
  const d = worldDir(alt, az, _d), sinA = Math.sin(alt * RAD);
  const range = -EARTH_R * sinA + Math.sqrt(EARTH_R * EARTH_R * sinA * sinA + 2 * EARTH_R * height + height * height);
  const px = d[0] * range, py = EARTH_R + d[1] * range, pz = d[2] * range;      // from the Earth's centre (the watcher stands at 0, R, 0)
  const sdir = worldDir(-sun.depth, sun.az, _s), along = px * sdir[0] + py * sdir[1] + pz * sdir[2];
  if (along >= 0) return 1;                                                   // on the Sun's side of the Earth
  const off = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - along * along));
  return smooth(EARTH_R - edge / 2, EARTH_R + edge / 2, off);
}

/** A pass across the sky along a great circle: { a, b (unit vectors), angle (degrees), dur (seconds), t0 }. */
export function satPass(from, to, dur, t0 = 0) {
  const a = worldDir(from.alt, from.az), b = worldDir(to.alt, to.az);
  const angle = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) / RAD;
  return { a, b, angle, dur, t0 };
}

/**
 * A light on its pass at time t (`lag` seconds behind the leader, for a train): out = { on, x, y, z (unit vector), alt,
 * az, light }. It moves at a steady speed; near the horizon it is lost in the haze; in the Earth's shadow it is dark.
 */
export function satAt(pass, t, sun, out = {}, lag = 0, height = SAT_HEIGHT) {
  const s = (t - pass.t0 - lag) / pass.dur;
  out.on = s >= 0 && s <= 1;
  if (!out.on) { out.light = 0; return out; }
  const w = pass.angle * RAD, sw = Math.sin(w) || 1, ka = Math.sin((1 - s) * w) / sw, kb = Math.sin(s * w) / sw;
  out.x = pass.a[0] * ka + pass.b[0] * kb; out.y = pass.a[1] * ka + pass.b[1] * kb; out.z = pass.a[2] * ka + pass.b[2] * kb;
  out.alt = Math.asin(clamp(out.y, -1, 1)) / RAD;
  out.az = wrap360(Math.atan2(out.x, -out.z) / RAD);
  out.light = smooth(2, 9, out.alt) * (sun ? satLight(out.alt, out.az, sun, height) : 1);
  return out;
}

/** How far along a pass (0..1) its light first goes dark in the Earth's shadow, or 1 when it stays lit to the end. */
export function shadowEntry(pass, sun, height = SAT_HEIGHT) {
  const o = {};
  for (let s = 0.02; s <= 1; s += 0.01) { satAt(pass, pass.t0 + s * pass.dur, null, o); if (satLight(o.alt, o.az, sun, height) < 0.05) return +s.toFixed(2); }
  return 1;
}

/** A train of satellites: `count` lights on one pass, `gap` degrees apart. The i-th follows the leader by trainLag(pass, gap) * i seconds. */
export const trainLag = (pass, gap) => gap / (pass.angle / pass.dur);
/** How many of a train's lights can be seen now (their light above `min`). */
export function trainSeen(pass, count, gap, t, sun, min = 0.25, height = SAT_HEIGHT) {
  const o = {}, lag = trainLag(pass, gap);
  let n = 0;
  for (let i = 0; i < count; i++) if (satAt(pass, t, sun, o, i * lag, height).light > min) n++;
  return n;
}

/**
 * The three answers offered for a train of `n`, in rising order; `r` (0..1, a random number) says where the right one
 * stands, so it is not always the middle one.
 */
export function trainChoices(n, r = 0.5) {
  const k = Math.min(2, Math.floor(r * 3));
  return k === 0 ? [n, n + 1, n + 2] : k === 1 ? [n - 1, n, n + 1] : [n - 2, n - 1, n];
}

/** A plane's lights at time t: out = [r, g, b]. Red and green take turns, with a short white flash every 1.2 seconds. */
export function planeBlink(t, out = [0, 0, 0]) {
  const k = ((t % 1.2) + 1.2) % 1.2;
  if (k < 0.09) { out[0] = out[1] = out[2] = 1.6; return out; }
  if (k < 0.6) { out[0] = 1.25; out[1] = 0.2; out[2] = 0.15; } else { out[0] = 0.2; out[1] = 1.15; out[2] = 0.3; }
  return out;
}

/**
 * The passes of the Difficult level for a sky, laid out round the views the round uses. `north`: the view of the Little
 * Dipper { az, alt }; `half`: half the width of the picture in degrees (a phone held upright sees a narrow sky, so its
 * passes are shorter). The watching side is away from the Sun (south-east in the evening, south-west before dawn),
 * where a satellite climbs into the Earth's shadow and fades.
 *   decoy   through the Little Dipper, left to right
 *   look    where the view turns for the satellite and the train: { az, alt }
 *   sat     the lone satellite: it fades in the shadow near the end of its pass
 *   plane   crosses the other way, twice as fast, blinking
 *   train   the line of satellites, higher up and slower
 */
export function hardPasses(sky, north = { az: 0, alt: 45 }, half = 45) {
  const sun = gameSun(sky), side = sun.az > 180 ? 1 : -1;                    // 1: watch the south-east, -1: the south-west
  const at = (az, alt) => ({ az: wrap360(az), alt }), w = clamp(half, 16, 50);
  const pass = (from, to, speed) => { const p = satPass(from, to, 1); p.dur = p.angle / speed; return p; };   // speed: degrees a second
  const look = at(side > 0 ? 120 : 240, 40);
  // two points `d` degrees either side of a middle at altitude m lie on a great circle through it at this altitude
  const edge = (m, d) => Math.atan(Math.tan(m * RAD) * Math.cos(d * RAD)) / RAD;
  const dn = edge(north.alt, w + 10);
  // the lone satellite comes down the sky into the shadow: its far end is lowered until it goes dark 60 to 80 per cent of the way
  let sat = null;
  for (let low = 40; low >= 8; low -= 2) {
    sat = pass(at(look.az - side * (w + 12), 44), at(look.az + side * (w + 4), low), 3.2);
    const e = shadowEntry(sat, sun);
    if (e >= 0.6 && e <= 0.8) break;
    if (e < 0.6) break;
  }
  return {
    sun, look, sat,
    decoy: pass(at(north.az - (w + 10), dn - 2), at(north.az + (w + 10), dn + 2), 3),
    plane: pass(at(look.az + side * (w + 8), 22), at(look.az - side * (w + 10), 44), 6.5),
    train: pass(at(look.az - side * (w + 10), 40), at(look.az + side * (w + 8), 50), 2.6),
  };
}

// ------------------------------------------------------------------------------------ words
/** A short true note about satellites for the results card of the Difficult level. */
export const SAT_FACT = {
  title: N_('Satellites'),
  text: N_('Thousands of satellites circle the Earth now. They help with maps, weather forecasts and phone calls. Astronomers ask for them to be made darker, so the stars stay easy to see.'),
};
