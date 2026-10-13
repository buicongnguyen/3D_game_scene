// Sweet potato roast (docs/RURAL-TRICKS.md, trick 10): autumn, the open meadow south of Kawabe. Mika gathers armfuls of dry
// straw; Grandma lights it (fires are for grown-ups: Mika never does, and stands back while it burns down). Then Mika
// buries the sweet potatoes in the ash and watches each spot: grey ash is still raw, an amber glow with white steam is
// just right, black smoke is too late. Three things make it a little juggling game:
//   * the potatoes come small, medium and big, and a bigger one always cooks longer: the plan can be read off them;
//   * each one wants turning once, about halfway (its mound rocks, the side by the embers glows, a "turn" arrow spins
//     over it): never turned, it is dark on one side, good at best;
//   * the ash bed cools (a gauge under the HUD, and the bed itself goes grey): Mika waves a paper fan to bring the glow
//     back, but one wave too many makes a flare that singes the potato nearest to her.
// At the end the good potatoes are handed round: one to the grown-up at the fire, one to each neighbour's kid nearby.
//
// The levels (roastPlan) make the round longer and different in kind: the potatoes come in batches (the next one arrives while
// the first still cooks, or as soon as the ash is empty). Easy: four potatoes and two more, in gentle slow-cooling ash.
// Normal: five and then three: the second batch has to be fitted in round the first one's turning and digging. Difficult:
// seven potatoes in three batches, a chestnut in the first two (it cooks fast, wants no turning, and pops out of the ash if
// left), and rain spots that cool the ash at a bad moment.
//
// The rules (the cook plan, the state of a potato, what the ash shows, the warmth, the score) are pure and Node-tested;
// the round below only draws them. Cheap: one borrowed light from the shared LightPool, smoke and sparks from the shared
// particle pools (fx.soft / fx.glow), three flame cones, five small mounds, and at most a dozen little models made once.
import * as THREE from 'three';
import { tx, N_ } from '../../i18n/i18n.js';
import { rng } from '../../engine/spline.js';
import { Animator } from '../../actors/animator.js';
import { fit, disposeRigs, keepShallow } from './util.js';
import { WATER_Y } from '../../world/layout.js';

/// ---------------------------------------------------------------------------------------------------- pure rules
export const POINTS = { perfect: 20, okay: 10, raw: 3, burnt: 0 };
export const NUT_POINTS = { perfect: 10, okay: 5, raw: 1, burnt: 0 };   // a chestnut (burnt: it popped)
export const OKAY = 1.6;          // seconds either side of the perfect window that still make an "okay" potato
export const NUT = { okay: 1.0, lo: 5, hi: 8, win: 2.6, k: 0.5 };   // a chestnut: its margin, its cook time (from..to), its window, its size
export const RAIN = { drop: 0.17, first: [9, 13], every: [11, 15] };   // Difficult: a shower takes this much warmth, at these seconds
const okayOf = p => (p?.kind === 'nut' ? NUT.okay : OKAY);

/**
 * What a level's round is made of: { waves: [{ at: seconds after the first potato goes in, potatoes, nuts }], gentle, rain,
 * count; win: a shorter perfect window, decay: ash that cools faster (Difficult) }. A wave also arrives early, the moment nothing is left in the ash to wait for. The guided first try is Easy's.
 */
export function roastPlan(level = 'normal', first = false) {
  const plan = first || level === 'easy' ? { waves: [{ at: 0, potatoes: 4, nuts: 0 }, { at: 24, potatoes: 2, nuts: 0 }], gentle: true, rain: false }
    : level === 'hard' ? { waves: [{ at: 0, potatoes: 3, nuts: 1 }, { at: 11, potatoes: 2, nuts: 1 }, { at: 23, potatoes: 2, nuts: 0 }], gentle: false, rain: true, win: 2.5, decay: 0.05 }
      : { waves: [{ at: 0, potatoes: 5, nuts: 0 }, { at: 17, potatoes: 3, nuts: 0 }], gentle: false, rain: false };
  plan.count = plan.waves.reduce((n, w) => n + w.potatoes + w.nuts, 0);
  return plan;
}
/** The most a plan can score: every potato and every chestnut perfect. */
export const roastMax = plan => plan.waves.reduce((n, w) => n + w.potatoes * POINTS.perfect + w.nuts * NUT_POINTS.perfect, 0);
export const STRAW = 3;           // armfuls of straw the fire needs
export const COUNT = 5;           // potatoes in a round
export const TURN = 0.4;          // a potato wants turning once it is this far through its cook (until it is done)
/** The three sizes: k is how big the potato (and its hollow and mound) is drawn. Bigger always means a longer cook. */
export const SIZES = { small: { k: 0.76 }, medium: { k: 1 }, big: { k: 1.32 }, nut: { k: NUT.k } };
const MIXES = [['small', 'small', 'medium', 'medium', 'big'], ['small', 'medium', 'medium', 'big', 'big'], ['small', 'small', 'medium', 'big', 'big']];
/**
 * The warmth of the ash bed: it starts at `start` and cools by `decay` a second (gentleDecay on the guided first try and
 * in Easy). Under `cool` the potatoes cook slower and slower (down to `slow` of the full pace in cold ash). A wave of the fan adds
 * `fan`; a wave that would lift it over `hot` makes a flare instead. `top` is the end of the gauge.
 */
export const WARM = { start: 0.7, cool: 0.4, hot: 1, top: 1.2, fan: 0.2, decay: 0.04, gentleDecay: 0.03, slow: 0.12 };

/**
 * The cook plan (seeded): `count` potatoes, each { size, cook: seconds of good heat until perfect, win: how long it
 * stays perfect, turn: the heat from which it wants turning }. The cook times are spread over the range (one per band)
 * and shuffled, so no two finish together; the size follows the time, so a child can read the plan off the potatoes.
 * gentle (the guided first try, Easy): shorter waits and a longer window.
 */
export function planRoast({ count = COUNT, gentle = false, rand }) {
  const lo = gentle ? 6 : 7, hi = gentle ? 15 : 20, band = (hi - lo) / count;
  const mix = gentle ? MIXES[0] : MIXES[Math.floor(rand() * MIXES.length) % MIXES.length];
  const out = [];
  for (let i = 0; i < count; i++) {
    const cook = +(lo + (i + rand() * 0.8) * band).toFixed(2);
    out.push({ size: mix[Math.min(mix.length - 1, Math.floor(i * mix.length / count))], cook, win: gentle ? 4.5 : 3.2, turn: +(cook * TURN).toFixed(2) });
  }
  for (let k = out.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [out[k], out[j]] = [out[j], out[k]]; }
  return out;
}

/**
 * What a potato is after `heat` seconds in the ash: 'raw' | 'okay' | 'perfect' | 'burnt'. One that was never turned
 * (p.turned === false) or was singed by a flare (p.singed) is dark on one side: okay at best.
 */
export function cookState(heat, p) {
  const ok = okayOf(p);
  if (heat < p.cook - ok) return 'raw';
  if (heat < p.cook) return 'okay';
  if (heat < p.cook + p.win) return p.turned === false || p.singed ? 'okay' : 'perfect';
  if (heat < p.cook + p.win + ok) return 'okay';
  return 'burnt';
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };

/** How fast the potatoes cook at a warmth (0..1): full speed in good ash, slower and slower as it goes grey. */
export function heatRate(warm) { return Math.max(WARM.slow, clamp01(warm / WARM.cool)); }

/**
 * What the ash over a potato shows (all 0..1): glow (grey ash for the first half, then warming to full amber exactly
 * when it turns perfect), steam (white sweet-smelling puffs while it is ready), char (darkening after the window;
 * 1 = burnt, black smoke). For a potato in a round also: turn (1 while it wants turning: the mound rocks and the side by
 * the embers glows) and dark (1 when one side is spoilt: never turned in time, or singed by a flare).
 */
export function cue(heat, p, out = {}) {
  const end = p.cook + p.win, unturned = p.turned === false;
  const char = clamp01((heat - end) / okayOf(p));
  out.turn = unturned && heat >= p.turn && heat < p.cook ? 1 : 0;
  out.dark = (unturned && heat >= p.cook) || p.singed ? 1 : 0;
  out.glow = unturned && heat < p.cook ? 0 : smooth(0.55, 1, heat / p.cook) * (1 - char);
  out.steam = heat >= p.cook - 0.4 && heat < end ? 1 : 0;
  out.char = char;
  return out;                     // `out`: a record to fill instead of a new one (the round asks every frame)
}

/**
 * One round of roasting (pure). Spots are 'empty' → 'buried' (heat rises with time, as fast as the ash is warm) →
 * 'dug' (with a result). A buried potato wants turning once, between `turn` and `cook`.
 */
export class Roast {
  /** { count, gentle, rand }: one batch of `count` potatoes (as it always was); or { plan, rand }: a level's batches (roastPlan). */
  constructor({ count = COUNT, gentle = false, rand, plan = null }) {
    this.gentle = plan ? plan.gentle : gentle;
    const waves = plan ? plan.waves : [{ at: 0, potatoes: count, nuts: 0 }];
    this.waves = waves.map(w => w.at);
    this.spots = [];
    waves.forEach((w, k) => {
      const batch = planRoast({ count: w.potatoes, gentle: this.gentle, rand }).map(p => ({ ...p, win: plan?.win ?? p.win, kind: 'potato', turned: false }));
      // a chestnut: small, quick, never turned (it is "turned" from the start), a short window before it pops
      for (let n = 0; n < w.nuts; n++) batch.splice(Math.floor(rand() * (batch.length + 1)), 0, { kind: 'nut', size: 'nut', cook: +(NUT.lo + rand() * (NUT.hi - NUT.lo)).toFixed(2), win: NUT.win, turn: Infinity, turned: true });
      for (const p of batch) this.spots.push({ ...p, wave: k, st: k ? 'wait' : 'empty', heat: 0, result: null, singed: false });
    });
    // Difficult: rain spots on a seeded timetable (seconds after the first potato goes in)
    this.rain = [];
    if (plan?.rain) for (let t = RAIN.first[0] + rand() * (RAIN.first[1] - RAIN.first[0]); t < 90; t += RAIN.every[0] + rand() * (RAIN.every[1] - RAIN.every[0])) this.rain.push(+t.toFixed(2));
    this.decay = plan?.decay;   // the level's own cooling (Difficult), else the usual one
    this.rained = 0;            // showers so far (the round draws each new one)
    this.wave = 0;              // the batches that have arrived so far, less one
    this.clock = 0;             // seconds since the first potato went in
    this.popped = [];           // chestnuts that popped since the round last looked (it empties the list)
    this.t = 0;
    this.warm = WARM.start;
    this.fans = 0;
    this.flares = 0;
    this.started = false;       // the ash starts to cool with the first potato in it
  }

  bury(i) {
    const s = this.spots[i];
    if (!s || s.st !== 'empty') return false;
    s.st = 'buried';
    this.started = true;
    return true;
  }

  /** Can the potato at i be turned now (buried, not turned yet, far enough through and not done)? */
  canTurn(i) {
    const s = this.spots[i];
    return !!s && s.st === 'buried' && !s.turned && s.heat >= s.turn && s.heat < s.cook;
  }

  /** Turn a potato over: true when it was the moment for it. */
  turn(i) {
    if (!this.canTurn(i)) return false;
    this.spots[i].turned = true;
    return true;
  }

  /** Dig a potato out: returns what it is ('raw' | 'okay' | 'perfect' | 'burnt'), or null when nothing is buried there. */
  dig(i) {
    const s = this.spots[i];
    if (!s || s.st !== 'buried') return null;
    s.st = 'dug';
    s.result = cookState(s.heat, s);
    s.early = s.heat < s.cook;
    // why a good potato is only "okay": 'early' | 'side' (never turned) | 'singed' | 'late'
    s.why = s.result !== 'okay' ? null : s.early ? 'early' : s.heat >= s.cook + s.win ? 'late' : s.singed ? 'singed' : 'side';
    return s.result;
  }

  /**
   * The one action button at a spot: 'bury' an empty one; a buried one is turned when it wants turning ('turn'), left
   * alone while there is nothing to do yet ('wait': too soon to turn; when gentle also while a turned one is still
   * raw), and otherwise dug. Returns { act: 'bury' | 'turn' | 'wait' | 'dig' | null, result } (result: what was dug).
   */
  press(i, out = {}) {
    const s = this.spots[i];
    out.act = null; out.result = null;
    if (!s || s.st === 'dug' || s.st === 'wait') return out;
    if (s.st === 'empty') { out.act = this.bury(i) ? 'bury' : null; return out; }
    if (!s.turned && s.heat < s.cook) { out.act = this.turn(i) ? 'turn' : 'wait'; return out; }
    if (this.gentle && s.heat < s.cook - okayOf(s)) { out.act = 'wait'; return out; }
    out.act = 'dig';
    out.result = this.dig(i);
    return out;
  }

  /**
   * A wave of the fan: 'warm' (the ash glows again), or too much: 'flare' (a fright only: nothing was near, or the
   * first one of a gentle round) or 'singe' (the buried potato at `near` is dark on one side now).
   */
  fan(near = -1) {
    this.fans++;
    const w = this.warm + WARM.fan;
    if (w <= WARM.hot + 1e-9) { this.warm = Math.min(WARM.hot, w); return 'warm'; }
    this.warm = WARM.hot;
    this.flares++;
    const s = this.spots[near];
    if ((this.gentle && this.flares === 1) || !s || s.st !== 'buried' || s.singed) return 'flare';
    s.singed = true;
    return 'singe';
  }

  /** The potatoes cook as fast as the ash is warm; once one is done it dries out at the full pace whatever the ash does. */
  update(dt) {
    this.t += dt;
    if (this.started) {
      this.clock += dt;
      this.warm = Math.max(0, this.warm - (this.decay ?? (this.gentle ? WARM.gentleDecay : WARM.decay)) * dt);
      // a shower: the ash loses warmth at once
      while (this.rained < this.rain.length && this.clock >= this.rain[this.rained]) { this.rained++; this.warm = Math.max(0, this.warm - RAIN.drop); }
      // the next batch arrives at its time, or sooner when the ash is empty and nothing is left to do
      while (this.wave + 1 < this.waves.length && (this.clock >= this.waves[this.wave + 1] || this.idle)) {
        this.wave++;
        for (const s of this.spots) if (s.wave === this.wave && s.st === 'wait') s.st = 'empty';
      }
    }
    const rate = heatRate(this.warm);
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (s.st !== 'buried') continue;
      s.heat += dt * (s.heat < s.cook ? rate : 1);
      // a chestnut left too long pops out of the ash by itself
      if (s.kind === 'nut' && s.heat >= s.cook + s.win + NUT.okay) { s.st = 'dug'; s.result = 'burnt'; s.pop = true; this.popped.push(i); }
    }
  }

  /** Nothing is in the ash and nothing waits to go in (every arrived one is dug): the next batch may as well come now. */
  get idle() { for (const s of this.spots) if (s.st === 'empty' || s.st === 'buried') return false; return true; }

  /**
   * Time is up: whatever is still in the ash is forgotten there. One that never got warm enough is still raw; the
   * rest are burnt. Potatoes never buried count for nothing.
   */
  finish() {
    for (const s of this.spots) if (s.st === 'buried') { s.st = 'dug'; s.result = s.heat < s.cook - okayOf(s) ? 'raw' : 'burnt'; s.forgot = true; }
  }

  get buried() { let n = 0; for (const s of this.spots) if (s.st === 'buried') n++; return n; }
  get left() { let n = 0; for (const s of this.spots) if (s.st === 'empty') n++; return n; }
  get done() { return this.spots.every(s => s.st === 'dug'); }
  get score() { let n = 0; for (const s of this.spots) n += (s.kind === 'nut' ? NUT_POINTS : POINTS)[s.result] || 0; return n; }   // = roastScore of the potatoes (+ the chestnuts)
  tally() {
    const t = { perfect: 0, okay: 0, raw: 0, burnt: 0 };
    for (const s of this.spots) if (s.result) t[s.result]++;
    return t;
  }
}

/** Score for a list of results (stars in content/tricks.js: 25 / 60 / 90; five perfect potatoes are 100). */
export function roastScore(results) {
  return results.reduce((a, r) => a + (POINTS[r] || 0), 0);
}

/**
 * Play recorded inputs [[time, 'bury' | 'turn' | 'dig' | 'press' | 'fan', spot], …] (sorted by time) on a Roast;
 * returns the result of each input ('press' gives the action it became, or what was dug).
 */
export function replay(game, inputs, { dt = 0.05, until = 0 } = {}) {
  const out = [];
  let k = 0;
  const end = Math.max(until, inputs.length ? inputs[inputs.length - 1][0] : 0);
  for (let n = 0, steps = Math.ceil(end / dt - 1e-9); n <= steps; n++) {
    const t = n * dt;
    while (k < inputs.length && inputs[k][0] <= t + 1e-6) {
      const [, act, i] = inputs[k++];
      if (act === 'bury') out.push(game.bury(i));
      else if (act === 'turn') out.push(game.turn(i));
      else if (act === 'fan') out.push(game.fan(i ?? -1));
      else if (act === 'press') { const r = game.press(i); out.push(r.result || r.act); }
      else out.push(game.dig(i));
    }
    game.update(dt);
  }
  return out;
}

/**
 * Where things go (pure): the hearth is the flattest dry point ~3.4 m from the sign; straw piles stand round it at
 * 5.5-7.5 m on dry, nearly level ground. Returns { x, z, y, piles: [{ x, z, y }] } (fewer piles if the ground is bad).
 */
export function layout(heightAt, place, rand, { piles = STRAW + 1, dry = 0.45 } = {}) {
  let best = null;
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, x = place.x + Math.sin(a) * 3.4, z = place.z + Math.cos(a) * 3.4, y = heightAt(x, z);
    if (y < dry) continue;
    let rough = Math.abs(y - heightAt(place.x, place.z)) * 0.5;
    for (let j = 0; j < 6; j++) rough += Math.abs(heightAt(x + Math.sin(j) * 1.5, z + Math.cos(j) * 1.5) - y);
    if (!best || rough < best.rough) best = { x, z, y, rough };
  }
  if (!best) best = { x: place.x, z: place.z, y: heightAt(place.x, place.z), rough: 0 };
  const out = [], a0 = rand() * Math.PI * 2;
  for (let k = 0; k < 14 && out.length < piles; k++) {
    const a = a0 + k * 2.399963, r = 5.5 + rand() * 2;                 // golden-angle steps: spread round the hearth
    const x = best.x + Math.sin(a) * r, z = best.z + Math.cos(a) * r, y = heightAt(x, z);
    if (y < dry || Math.abs(y - best.y) > 1.3) continue;
    if (Math.hypot(x - place.x, z - place.z) < 1.6 || out.some(q => Math.hypot(q.x - x, q.z - z) < 2.2)) continue;
    out.push({ x, z, y });
  }
  return { x: best.x, z: best.z, y: best.y, piles: out };
}

/// ---------------------------------------------------------------------------------------------------- the round
const V = () => new THREE.Vector3();
const _v = V(), _w = V(), _c = new THREE.Color(), _cue = { glow: 0, steam: 0, char: 0, turn: 0, dark: 0 }, _press = { act: null, result: null };
const _m4 = new THREE.Matrix4();
const RAIN_DROPS = 12;
const EMBER_GLOW = 20;            // the model's coals are dark in the file (emissive 0.03): this is their glow once the straw has burnt
const RING_R = 1.0;               // the potatoes lie in a ring this far from the middle of the ash
const BED_R = 1.5;
const FAN_TIME = 0.8;             // one wave of the fan, seconds (she can wave again a little before it ends)
const ASH = new THREE.Color('#4d4744'), AMBER = new THREE.Color('#ff9a1c'), CHAR = new THREE.Color('#1c1512'), HOT = new THREE.Color('#ff6a10');
const CHEERS = [N_('Roast potatoes! Save me one!'), N_('That smells SO good!'), N_('Me! Me! The big one!'), N_('Hot hot hot! Blow on it!')];
const THANKS = [N_('Thank you, Mika! Mmm, so sweet.'), N_('Ooh, hot! Thank you!'), N_('The best potato ever!')];

// the heat gauge under the round's HUD: grey = the ash is going cold, amber = just right, red = one more wave makes a flare
const HEAT_CSS = `
#roastHeat{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:8px;align-items:center;
 padding:6px 12px 6px 8px;border-radius:999px;background:rgba(255,247,232,.94);box-shadow:0 4px 14px rgba(40,20,0,.22);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);pointer-events:none;white-space:nowrap}
#roastHeat .em{width:20px;height:20px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 50% 68%,#fff0a8 0,#ffb02e 38%,#f0621c 72%,#c2441f 100%);
 box-shadow:0 0 calc(12px*var(--w,1)) rgba(255,140,30,.95);filter:grayscale(calc(1 - var(--w,1)))}
#roastHeat .bar{position:relative;width:132px;height:12px;border-radius:6px;box-shadow:inset 0 0 0 1.5px rgba(90,58,34,.28);
 background:linear-gradient(90deg,#a9b1ba 0,#a9b1ba 33.3%,#ffc35a 33.3%,#ff8a1c 83.3%,#dd3b1e 83.3%,#dd3b1e 100%)}
#roastHeat .k{position:absolute;top:-5px;left:0;width:8px;height:22px;margin-left:-4px;border-radius:4px;background:#5a3a22;box-shadow:0 0 0 2px #fff7e8;transition:left .15s linear}
#roastHeat .fan{display:flex;gap:6px;align-items:center}
#roastHeat kbd{display:inline-block;min-width:18px;padding:1px 6px;border-radius:6px;background:#fff;box-shadow:0 2px 0 #c9b48c,inset 0 0 0 1.5px #c9b48c;font:700 12px Nunito,sans-serif;color:#5a3a22;text-align:center}
#roastHeat.touch .fan{display:none}
@media (max-width:520px){#roastHeat{gap:6px;padding:5px 10px 5px 7px}#roastHeat .bar{width:96px}}
#roastHeat.cool{animation:roastCool .8s ease-in-out infinite}
@keyframes roastCool{50%{box-shadow:0 0 0 5px rgba(110,160,230,.6),0 4px 14px rgba(40,20,0,.22)}}
`;

function bedTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,196,96,1)');
  grd.addColorStop(0.28, 'rgba(240,120,40,1)');
  grd.addColorStop(0.62, 'rgba(120,70,50,0.98)');
  grd.addColorStop(0.86, 'rgba(92,86,80,0.9)');
  grd.addColorStop(1, 'rgba(92,86,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // a few darker flecks of burnt straw
  for (let i = 0; i < 60; i++) {
    const a = i * 2.4, r = 14 + (i * 37 % 44);
    g.fillStyle = `rgba(40,30,26,${0.15 + (i % 5) * 0.06})`;
    g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + i % 3, 1 + i % 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class RoastRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.added = [];
    this.own = [];              // geometries, materials and textures made here (disposed at the end)
    this.seed = seed;
    this.rand = rng(seed);
    // the level comes from the picker (ctx.level): its batches, its ash, its rain (roastPlan)
    this.plan = roastPlan(ctx.level, !!ctx.first);
    this.game = new Roast({ plan: this.plan, rand: this.rand });
    this.n = this.game.spots.length;
    this.ringR = this.n <= 5 ? RING_R : this.n <= 7 ? 1.18 : 1.32;      // more potatoes lie in a wider ring
    this.phase = 'gather';
    this.t = 0;
    this.straw = 0;
    this.carrying = false;
    this.fire = 0;              // flame height 0..1
    this.embers = 0;            // glow of the ash bed 0..1
    this.I = 0;                 // the firelight
    this.sel = -1;
    this.flick = 1;
    this.puff = new Float32Array(this.n);
    this.hold = new Float32Array(this.n);     // a moment after a press at a spot in which the next one does nothing (a double press must not dig it raw)
    this.waveSeen = 0;          // the batches whose potatoes have hopped to the ash
    this.rainSeen = 0;          // the showers drawn so far
    this.rainT = 0;             // a shower falling now (seconds left)
    this.fades = 0;
    this.wn = 1;                // how warm the bed looks 0..1 (eased towards the rules' warmth)
    this.fanT = 0;              // the wave of the fan that is playing (seconds left)
    this.fanAsk = false;        // the fan button was pressed this frame
    this.flare = 0;             // a flare dying down 1..0
    this.kick = 0;              // the bed brightening after a good wave 1..0
    this.coolHint = 0;
    this.waitHint = 0;
    this.told = {};
    this.shared = 0;
    this.gauge = null;
  }

  add(o, parent = this.scene) { parent.add(o); if (parent === this.scene) this.added.push(o); return o; }
  keep(x) { this.own.push(x); return x; }
  mat(m) { return this.keep(m); }

  /** Trample the grass round the hearth for the round (the splat map's grass channel), and put it back after. */
  clearGrass(x, z, r) {
    const sp = this.g.world?.splat;
    if (!sp?.paintDisc || !sp.data) return;
    const pad = 11;                       // the straw piles (up to 7.5 m off) clear a little grass too
    const i0 = Math.max(0, Math.floor(x - pad - sp.x0)), i1 = Math.min(sp.w - 1, Math.ceil(x + pad - sp.x0));
    const j0 = Math.max(0, Math.floor(z - pad - sp.z0)), j1 = Math.min(sp.h - 1, Math.ceil(z + pad - sp.z0));
    const rows = [];
    for (let j = j0; j <= j1; j++) rows.push(sp.data.slice((j * sp.w + i0) * 4, (j * sp.w + i1 + 1) * 4));
    this.grassWas = { sp, i0, j0, rows };
    sp.paintDisc(x, z, r, 3, 0, 1.2);
  }

  restoreGrass() {
    const w = this.grassWas;
    if (!w) return;
    w.rows.forEach((row, k) => w.sp.data.set(row, ((w.j0 + k) * w.sp.w + w.i0) * 4));
    w.sp.texture.needsUpdate = true;
    this.grassWas = null;
  }

  strawModel(size) {
    const a = this.g.assets;
    if (a?.has?.('straw-pile')) {
      // the artist's pile is a real heap: `straw_pile`, and beside it (a sibling, so it stays when the straw is
      // scaled away) its own bed of `embers`, shown once the straw has burnt down
      const root = new THREE.Group(), m = a.clone('straw-pile');
      const em = m.getObjectByName('embers'), st = m.getObjectByName('straw_pile');
      root.userData.embers = em ? [em] : [];
      root.userData.straw = st ? [st] : [];
      if (em) em.visible = false;
      fit(m, size);
      m.traverse(o => { if (o.isMesh) { o.castShadow = size > 0.8; o.receiveShadow = true; } });
      root.add(m);
      return root;
    }
    // no art yet: a little stook of straw (a cone with a tied waist)
    const root = new THREE.Group();
    const cone = new THREE.Mesh(this.geo.cone, this.mats.straw);
    cone.scale.set(size * 0.45, size * 0.75, size * 0.45);
    cone.position.y = size * 0.375;
    const band = new THREE.Mesh(this.geo.band, this.mats.strawDark);
    band.scale.setScalar(size * 0.21);
    band.position.y = size * 0.52;
    cone.castShadow = size > 0.8;
    root.add(cone, band);
    return root;
  }

  /** A potato of a size (k from SIZES): the same model, bigger or smaller, so the long cooks can be told from the short. */
  potatoModel(k = 1) {
    const a = this.g.assets, root = new THREE.Group(), mats = [];
    if (a?.has?.('sweet-potato')) {
      const m = fit(a.clone('sweet-potato'), 0.38);
      m.traverse(o => {
        if (!o.isMesh) return;
        // the model holds the raw potato and the roasted one (broken open): one is shown at a time
        const roasted = /^roasted/.test(o.name) || /^roasted/.test(o.parent?.name || '');
        (roasted ? this._roasted ??= [] : this._raw ??= []).push(o);
        o.visible = !roasted;
        o.castShadow = true;
        o.material = [o.material].flat().map(x => { const c = this.mat(x.clone()); mats.push(c); return c; });
        if (o.material.length === 1) o.material = o.material[0];
      });
      root.add(m);
      root.userData.raw = this._raw || [];
      root.userData.roasted = this._roasted || [];
      this._raw = this._roasted = null;
    } else {
      const c = this.mat(new THREE.MeshStandardMaterial({ color: '#a8436e', roughness: 0.75 }));
      const body = new THREE.Mesh(this.geo.potato, c);
      body.castShadow = true;
      root.add(body);
      mats.push(c);
    }
    for (const c of mats) c.userData.base = c.color.clone();
    root.scale.setScalar(k);
    return { root, mats, k };
  }

  /** A chestnut: a glossy brown nut with its pale patch underneath and a little point on top (procedural: tiny, and the model budget is full). */
  nutModel() {
    const root = new THREE.Group(), mats = [];
    const shell = this.mat(new THREE.MeshStandardMaterial({ color: '#7a3d1c', roughness: 0.32 })), pale = this.mat(new THREE.MeshStandardMaterial({ color: '#d9b98a', roughness: 0.8 }));
    const body = new THREE.Mesh(this.geo.nut, shell), patch = new THREE.Mesh(this.geo.nutPatch, pale), tip = new THREE.Mesh(this.geo.nutTip, shell);
    body.castShadow = true;
    patch.position.y = -0.062;
    tip.position.y = 0.088;
    root.add(body, patch, tip);
    mats.push(shell, pale);
    for (const c of mats) c.userData.base = c.color.clone();
    root.userData.raw = []; root.userData.roasted = [];
    return { root, mats, k: 1, nut: true };
  }

  /** The paper fan (uchiwa) that comes out for a wave: a round paper leaf with a red sun on a bamboo handle. */
  fanModel() {
    const root = new THREE.Group(), leaf = new THREE.Group();
    const paper = new THREE.Mesh(this.geo.fanPaper, this.mats.fanPaper);
    const sunA = new THREE.Mesh(this.geo.fanSun, this.mats.fanSun), sunB = new THREE.Mesh(this.geo.fanSun, this.mats.fanSun);
    sunA.position.set(0, 0.275, 0.004);
    sunB.position.set(0, 0.275, -0.004);
    sunB.rotation.y = Math.PI;
    const handle = new THREE.Mesh(this.geo.fanHandle, this.mats.fanWood);
    paper.castShadow = true;
    leaf.add(paper, sunA, sunB, handle);
    const turn = new THREE.Group();          // the flat of the leaf faces the fire, not her side
    turn.rotation.y = Math.PI / 2;
    turn.add(leaf);
    root.add(turn);
    root.userData.leaf = leaf;
    return root;
  }

  build() {
    const g = this.g, ctx = this.ctx, heightAt = (x, z) => g.world.heightAt(x, z);
    const L = this.lay = layout(heightAt, ctx.place, this.rand);
    ctx.beforeMove?.(keepShallow(this.g.player, heightAt, WATER_Y + 0.1));       // the roast is a dry-land game: the river bank stops her
    // while the potatoes cook the jump button is the fan: Mika keeps her feet on the ground by the fire
    ctx.beforeMove?.(() => {
      if (this.phase !== 'cook') return;
      const inp = this.g.input;
      if (inp.pressed('jump')) this.fanAsk = true;
      inp.edges?.delete('jump');
    });
    this.clearGrass(L.x, L.z, 2.9);
    this.geo = {
      cone: this.keep(new THREE.ConeGeometry(1, 1, 9)),
      band: this.keep(new THREE.TorusGeometry(1, 0.22, 5, 10).rotateX(Math.PI / 2)),
      potato: this.keep(new THREE.SphereGeometry(0.075, 10, 7).scale(1, 0.9, 2)),
      nut: this.keep(new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.82, 0.9)),
      nutPatch: this.keep(new THREE.SphereGeometry(0.072, 10, 5, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38).scale(1, 0.5, 0.9)),
      nutTip: this.keep(new THREE.ConeGeometry(0.02, 0.05, 6)),
      drop: this.keep(new THREE.SphereGeometry(0.035, 5, 4).scale(1, 2.4, 1)),
      mound: this.keep(new THREE.SphereGeometry(0.3, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1)),
      // the half of a mound that faces the embers (a little proud of it): it glows when the potato wants turning
      side: this.keep(new THREE.SphereGeometry(0.31, 8, 6, 0, Math.PI, 0, Math.PI / 2).scale(1, 0.52, 1)),
      hollow: this.keep(new THREE.RingGeometry(0.17, 0.26, 20).rotateX(-Math.PI / 2)),
      ring: this.keep(new THREE.RingGeometry(0.36, 0.43, 28).rotateX(-Math.PI / 2)),
      bed: this.keep(new THREE.CircleGeometry(BED_R, 28).rotateX(-Math.PI / 2)),
      flame: this.keep(new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0)),
      arrow: this.keep(new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI)),
      // the "turn me" sign over a mound: three quarters of a ring with an arrow head
      arc: this.keep(new THREE.TorusGeometry(0.17, 0.032, 6, 16, Math.PI * 1.5).rotateX(Math.PI / 2)),
      tip: this.keep(new THREE.ConeGeometry(0.075, 0.14, 6).rotateX(Math.PI / 2).translate(0.17, 0, 0.03)),
      fanPaper: this.keep(new THREE.CircleGeometry(0.15, 20).scale(1, 1.1, 1).translate(0, 0.27, 0)),
      fanSun: this.keep(new THREE.CircleGeometry(0.055, 14)),
      fanHandle: this.keep(new THREE.CylinderGeometry(0.011, 0.013, 0.24, 6).translate(0, 0.04, 0)),
    };
    this.mats = {
      straw: this.mat(new THREE.MeshStandardMaterial({ color: '#e2bd5a', roughness: 0.9 })),
      strawDark: this.mat(new THREE.MeshStandardMaterial({ color: '#a9812f', roughness: 0.9 })),
      hollow: this.mat(new THREE.MeshBasicMaterial({ color: '#2a211c', transparent: true, opacity: 0, depthWrite: false })),
      ring: this.mat(new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false })),
      arrow: this.mat(new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, fog: false })),
      turn: this.mat(new THREE.MeshBasicMaterial({ color: '#ffe052', fog: false })),
      fanPaper: this.mat(new THREE.MeshStandardMaterial({ color: '#fff1d0', roughness: 0.9, side: THREE.DoubleSide })),
      fanSun: this.mat(new THREE.MeshStandardMaterial({ color: '#e8452c', roughness: 0.8 })),
      fanWood: this.mat(new THREE.MeshStandardMaterial({ color: '#b98a4a', roughness: 0.8 })),
      drop: this.mat(new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.85, depthWrite: false, fog: false })),
    };
    // rain spots (Difficult): a dozen pooled drops, one instanced mesh, shown only while a shower falls
    if (this.plan.rain) {
      this.drops = this.add(new THREE.InstancedMesh(this.geo.drop, this.mats.drop, RAIN_DROPS));
      this.drops.frustumCulled = false; this.drops.visible = false; this.drops.renderOrder = 8;
      this.dropAt = new Float32Array(RAIN_DROPS * 4);          // x, z (hearth-local), height, fall speed
      this.own.push({ dispose: () => this.drops.dispose() });
    }
    // the hearth: a group tilted to the ground, so the ash bed and the potatoes lie on the slope
    const h = this.hearth = this.add(new THREE.Group());
    h.name = 'trick:roast-hearth';
    h.position.set(L.x, L.y + 0.03, L.z);
    const nx = heightAt(L.x - 0.8, L.z) - heightAt(L.x + 0.8, L.z), nz = heightAt(L.x, L.z - 0.8) - heightAt(L.x, L.z + 0.8);
    h.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _w.set(nx, 1.6, nz).normalize());
    this.centre = V().set(L.x, L.y, L.z);
    this.bedTex = this.keep(bedTexture());
    this.bed = this.add(new THREE.Mesh(this.geo.bed, this.mat(new THREE.MeshBasicMaterial({ map: this.bedTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))), h);
    this.bed.renderOrder = 2;
    this.bed.scale.setScalar(this.ringR / RING_R);
    // the fire's own pile of straw (grows with every armful), and the flames
    this.pile = this.add(this.strawModel(1.5), h);
    this.pile.scale.setScalar(0.001);
    this.flames = [];
    for (const [col, s, ox, oz] of [['#ff5a10', 1, 0, 0], ['#ff9a1e', 0.72, 0.2, 0.1], ['#ffe066', 0.5, -0.12, -0.14]]) {
      const f = this.add(new THREE.Mesh(this.geo.flame, this.mat(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, fog: false }))), h);
      f.position.set(ox, 0.05, oz);
      f.userData.s = s;
      f.visible = false;
      f.renderOrder = 6;
      this.flames.push(f);
    }
    // the spots round the ash: a hollow to lay a potato in (as big as the potato), a mound of ash over a buried one
    this.spots = this.game.spots.map((s, i) => {
      const a = i / this.n * Math.PI * 2 + 0.3, lx = Math.sin(a) * this.ringR, lz = Math.cos(a) * this.ringR, k = SIZES[s.size]?.k || 1;
      const hollow = this.add(new THREE.Mesh(this.geo.hollow, this.mats.hollow), h);
      hollow.position.set(lx, 0.025, lz);
      hollow.scale.setScalar(k);
      hollow.renderOrder = 3;
      hollow.visible = s.wave === 0;                                // a later batch's hollow is scooped when it arrives
      const mm = this.mat(new THREE.MeshStandardMaterial({ color: ASH.clone(), roughness: 0.95, emissive: '#000000' }));
      const mound = this.add(new THREE.Mesh(this.geo.mound, mm), h);
      mound.position.set(lx, 0, lz);
      mound.rotation.y = Math.atan2(-lx, -lz);                       // its +z looks at the embers
      mound.visible = false;
      const sm = this.mat(new THREE.MeshStandardMaterial({ color: AMBER.clone(), roughness: 0.9, emissive: '#000000' }));
      const side = new THREE.Mesh(this.geo.side, sm);
      side.visible = false;
      mound.add(side);
      const arrow = this.add(new THREE.Group(), h);
      arrow.add(new THREE.Mesh(this.geo.arc, this.mats.turn), new THREE.Mesh(this.geo.tip, this.mats.turn));
      arrow.position.set(lx, 0.5, lz);
      arrow.visible = false;
      const at = h.localToWorld(V().set(lx, 0, lz));
      return { i, lx, lz, at, hollow, mound, mm, side, sm, arrow, k, yaw: a, pop: 0, jig: 0 };
    });
    this.selRing = this.add(new THREE.Mesh(this.geo.ring, this.mats.ring), h);
    this.selRing.renderOrder = 7;
    // straw piles round the field, each with a bobbing arrow while Mika still needs straw
    this.piles = L.piles.map(q => {
      const m = this.add(this.strawModel(1.6));
      m.position.set(q.x, q.y, q.z);
      this.g.world?.splat?.paintDisc?.(q.x, q.z, 0.9, 3, 0, 0.8);
      m.rotation.y = this.rand() * 6.28;
      const arrow = this.add(new THREE.Mesh(this.geo.arrow, this.mats.arrow));
      arrow.position.set(q.x, q.y + 1.7, q.z);
      return { ...q, m, arrow, taken: false };
    });
    // an armful is carried on the head, the way it is done in the fields
    this.bundle = this.strawModel(0.95);
    this.bundle.visible = false;
    (this.player.root || this.player.model).add(this.bundle);
    this.bundle.position.set(0, 1.32, 0.02);
    // the fan: in her right hand for each wave (on her grip bone, leaf up; a plain place in front of her without one)
    const grip = this.player.grip || this.player.model, onBone = !!this.player.grip && grip !== this.player.model;
    this.fan = this.fanModel();
    this.fan.visible = false;
    (onBone ? grip : this.player.root || this.player.model).add(this.fan);
    if (onBone) this.fan.rotation.set(Math.PI, 0, 0); else this.fan.position.set(-0.2, 0.85, 0.3);
    // the potatoes wait in a little row between the sign and the hearth, the small ones and the big ones side by side
    // (a quarter turn round the hearth from the sign, so the signpost never stands in the picture)
    const toSign = this.back = V().set(this.ctx.place.x - L.x, 0, this.ctx.place.z - L.z).normalize().applyAxisAngle(_w.set(0, 1, 0), 1.25);
    this.heap = V().set(L.x + toSign.x * 2.1, 0, L.z + toSign.z * 2.1);
    this.side = V().set(-toSign.z, 0, toSign.x);
    // (every batch waits here from the start, the later ones a step further back: the whole plan can be read off the row)
    const mid = (this.n - 1) / 2;
    this.potatoes = this.game.spots.map((s, i) => {
      const p = s.kind === 'nut' ? this.nutModel() : this.potatoModel(this.spots[i].k);
      const back = s.wave * 0.34;
      const x = this.heap.x + this.side.x * (i - mid) * 0.3 + toSign.x * back, z = this.heap.z + this.side.z * (i - mid) * 0.3 + toSign.z * back;
      p.home = V().set(x, heightAt(x, z) + 0.07 * p.k, z);
      p.root.position.copy(p.home);
      p.root.rotation.y = Math.atan2(toSign.x, toSign.z) + (this.rand() - 0.5) * 0.5;
      p.move = null;
      p.laid = false;
      this.add(p.root);
      return p;
    });
    // one warm light for the whole fire, borrowed from the shared pool
    this.lightPos = V().set(L.x, L.y + 0.8, L.z);
    this.light = g.lights?.add({ pos: this.lightPos, intensity: () => this.I * this.flick, range: 9, color: '#ff9a3c' });
    this.standIn();
    return true;
  }

  /** The grown-up who lights the fire. When the teacher is not standing nearby, a stand-in of her model watches. */
  standIn() {
    const d = this.ctx.director, g = this.g, n = d?.npcs?.[this.ctx.teacher], L = this.lay;
    if (!n || (n.visible && n.pos.distanceTo(this.centre) < 14)) return;
    const name = n.model?.userData?.model;
    const m = name && g.assets?.has?.(name) ? g.assets.clone(name) : null;
    if (!m) return;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // she waits on the far side of the hearth from Mika
    const x = L.x - this.back.x * 2.2 + this.side.x * 1.2, z = L.z - this.back.z * 2.2 + this.side.z * 1.2;
    m.position.set(x, g.world.heightAt(x, z), z);
    m.rotation.y = Math.atan2(L.x - x, L.z - z);
    m.visible = false;
    this.grown = this.add(m);
    this.grownAnim = m.userData.clips?.length ? new Animator(m) : null;
    this.grownAnim?.play('Idle');
  }

  // ------------------------------------------------------------ helpers
  hint(text, life) { this.ctx.hint?.(text, life); }

  /** What the fan button is called on the device in use: the Space key, the pad's A, or the round "Fan" button on a phone. */
  fanKey() {
    if (this.ctx.ui?.touch) return `“${tx('Fan')}”`;
    return this.g.input?.lastDevice === 'gamepad' ? 'A' : 'Space';
  }

  smoke(at, dark, size = 0.5, up = 1.3) {
    const c = dark ? 0.12 : 0.92, fx = this.ctx.fx;
    fx?.soft?.emit(_v.set(at.x + (Math.random() - 0.5) * 0.12, at.y + 0.18, at.z + (Math.random() - 0.5) * 0.12),
      _w.set((Math.random() - 0.5) * 0.25 + 0.12, up * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.25),
      { life: dark ? 2.2 : 1.6, size, color: [c, c, c], alpha: dark ? 0.75 : 0.65, drag: 0.5, grow: dark ? 0.9 : 0.6, gravity: -0.15 });
  }

  spark(n = 1) {
    const fx = this.ctx.fx, c = this.centre;
    for (let i = 0; i < n; i++) {
      fx?.glow?.emit(_v.set(c.x + (Math.random() - 0.5) * 0.9, c.y + 0.15, c.z + (Math.random() - 0.5) * 0.9),
        _w.set((Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5),
        { life: 0.9 + Math.random() * 0.8, size: 0.07 + Math.random() * 0.06, color: [1, 0.55 + Math.random() * 0.3, 0.15], gravity: -0.3, drag: 0.6 });
    }
  }

  /** Mika never walks through the fire: she is eased back to the edge of the ash. */
  keepOut(r) {
    const p = this.player.pos, dx = p.x - this.centre.x, dz = p.z - this.centre.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-3) { p.x = this.centre.x + dx / d * r; p.z = this.centre.z + dz / d * r; }
  }

  /**
   * The cooking is watched from one steady place, above and behind where Mika stood back: the whole ring of potatoes
   * stays in the picture whichever one she is at, and she never hides the mound she works on (a phone has no hand free
   * for the camera here). The distance follows the shape of the screen, so the ring fits a phone held upright too.
   */
  hearthCamera() {
    const f = this.g.follow, c = this.centre, b = this.back;
    if (!f?.track) { f?.clearCutscene?.(true); return; }
    const pos = this.camPos = V(), look = this.camLook = V();
    f.yaw = Math.atan2(-b.x, -b.z);                    // "up" on the stick walks away from the camera, as everywhere else
    f.track(() => {
      // far enough for the ring and Mika beside it to fit the width; on a low screen (a phone on its side) the ring sits
      // lower and a little smaller, clear of the HUD, the gauge and the hint above it
      const low = clamp01((560 - (typeof innerHeight === 'number' ? innerHeight : 720)) / 170);
      const wide = this.ringR / RING_R;
      const d = Math.max(5 + low * 1.6, 2.25 / (0.52 * (f.camera?.aspect || 1.6))) * (0.4 + 0.6 * wide), off = 0.45 + low * 0.65;
      look.set(c.x - b.x * off, c.y + 0.2, c.z - b.z * off);
      return pos.set(c.x + b.x * (d * 0.6 - off), c.y + d * 0.8, c.z + b.z * (d * 0.6 - off));
    }, () => look, 3.2);
  }

  // ------------------------------------------------------------ the heat gauge (DOM, made for the cooking only)
  showGauge() {
    if (typeof document === 'undefined' || this.gauge) return;
    const css = document.createElement('style');
    css.id = 'roastCss';
    css.textContent = HEAT_CSS;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.id = 'roastHeat';
    el.innerHTML = '<i class="em"></i><div class="bar"><b class="k"></b></div><span class="fan"><kbd></kbd><span></span></span>';
    if (this.ctx.ui?.touch) el.classList.add('touch');
    el.querySelector('.fan span').textContent = tx('Fan');
    document.body.appendChild(el);
    this.gauge = { el, css, knob: el.querySelector('.k'), kbd: el.querySelector('kbd'), pct: -1, cool: false, key: '' };
    // on a phone the round Jump button is the fan while the potatoes cook
    const b = document.getElementById('tJump');
    if (b) { this.jumpWas = { b, text: b.textContent }; b.textContent = tx('Fan'); }
  }

  drawGauge() {
    const G = this.gauge, game = this.game;
    if (!G) return;
    const pct = Math.round(clamp01(game.warm / WARM.top) * 100);
    if (pct !== G.pct) {
      G.pct = pct;
      G.knob.style.left = `${pct}%`;
      G.el.style.setProperty('--w', (0.2 + 0.8 * clamp01(game.warm / WARM.start)).toFixed(2));
    }
    const cool = game.warm < WARM.cool && game.buried > 0;
    if (cool !== G.cool) { G.cool = cool; G.el.classList.toggle('cool', cool); }
    const pad = this.g.input?.lastDevice === 'gamepad';
    if (pad !== G.pad) { G.pad = pad; G.kbd.textContent = pad ? 'A' : 'Space'; }
  }

  hideGauge() {
    const G = this.gauge;
    if (G) { G.el.remove(); G.css.remove(); this.gauge = null; }
    if (this.jumpWas) { this.jumpWas.b.textContent = this.jumpWas.text; this.jumpWas = null; }
  }

  // ------------------------------------------------------------ phases
  gather(dt) {
    const p = this.player, pos = p.pos, ctx = this.ctx;
    this.keepOut(0.9);
    let near = null, nd = 2.0;
    for (const q of this.piles) {
      q.arrow.visible = !q.taken && !this.carrying;
      q.arrow.position.y = q.y + 1.7 + Math.sin(this.t * 4 + q.x) * 0.1;
      q.arrow.rotation.y += dt * 2;
      if (q.taken) continue;
      const d = Math.hypot(q.x - pos.x, q.z - pos.z);
      if (d < nd) { nd = d; near = q; }
    }
    this.nearPile = near;
    if (!this.carrying && near && ctx.pressed()) {
      near.taken = true;
      near.m.scale.multiplyScalar(0.6);                  // an armful gone from the pile
      this.carrying = true;
      if (!ctx.groundPickup?.({ target: { x: near.x, z: near.z }, onGrab: () => { this.bundle.visible = this.carrying; } })) {
        this.bundle.visible = true;
        p.gesture?.('Interact', { lock: false });
      }
      ctx.audio?.pickup?.();
      this.hint(tx('Good. Carry it to the fire spot.'), 3);
    } else if (this.carrying && Math.hypot(this.centre.x - pos.x, this.centre.z - pos.z) < 1.9) {
      this.carrying = false;
      this.bundle.visible = false;
      this.straw++;
      ctx.audio?.land?.(0.3);
      ctx.fx?.burst?.(_v.copy(this.centre).setY(this.centre.y + 0.4), { n: 8, color: [0.95, 0.8, 0.4], speed: 1.2, size: 0.1, gravity: 3 });
      if (this.straw >= STRAW || !this.piles.some(q => !q.taken)) this.startLight();
      else this.hint(STRAW - this.straw === 1 ? tx('One more armful of straw.') : tx('{n} more armfuls of straw.', { n: STRAW - this.straw }), 3);
    }
    const want = Math.min(1, this.straw / STRAW);
    const s = this.pile.scale.x + (Math.max(0.001, want) - this.pile.scale.x) * Math.min(1, dt * 6);
    this.pile.scale.setScalar(s);
  }

  startLight() {
    const ctx = this.ctx, p = this.player, g = this.g, L = this.lay;
    this.phase = 'light';
    this.lt = 0;
    ctx.lock?.(true);
    for (const q of this.piles) q.arrow.visible = false;
    this.fades++;
    ctx.fade?.(true, 300).then(() => {
      if (this.disposed) return;
      // Mika stands well back, beside the row of potatoes, facing the fire
      const sx = this.heap.x + (this.heap.x - L.x) * 0.1 + this.side.x * 1.05, sz = this.heap.z + (this.heap.z - L.z) * 0.1 + this.side.z * 1.05;
      p.teleport(sx, sz, undefined, Math.atan2(L.x - sx, L.z - sz));
      if (g.follow) { g.follow.yaw = p.facing; g.follow.first = true; }
      if (this.grown) this.grown.visible = true;
      // a side view of the fire, with Mika and the grown-up either side of it
      // (from the side the signpost is not on)
      const c = this.centre, s = this.side, b = this.back, pl = ctx.place;
      const k = (pl.x - c.x) * s.x + (pl.z - c.z) * s.z > 0 ? -1 : 1;
      // (further off on a phone held upright, so that both of them are still in the narrow picture; never under the turf)
      const far = Math.min(10, Math.max(4.6, 2.6 / (0.52 * (g.follow?.camera?.aspect || 1.6))));
      const cam = V().set(c.x + s.x * k * far + b.x * 1.2, 0, c.z + s.z * k * far + b.z * 1.2);
      cam.y = Math.max(c.y + 2.1 + (far - 4.6) * 0.12, g.world.heightAt(cam.x, cam.z) + 1.3);
      g.follow?.cutscene?.({ pos: cam, look: V().set(c.x, c.y + 0.7, c.z) }, 0.01);
      this.lit = true;
      ctx.fade?.(false, 450);
      this.fades--;
    });
    const grandma = ctx.teacher === 'sora';
    this.hint(grandma
      ? tx('Stand back, Mi-chan. Lighting the fire is a grown-up\'s job.')
      : tx('Stand back. Grandpa lights it: fires are for grown-ups.'), 5);
  }

  lighting(dt) {
    if (!this.lit) return;
    this.lt += dt;
    const t = this.lt;
    // the straw catches, burns high, and falls into glowing ash
    this.fire = t < 1.2 ? t / 1.2 : t < 3.2 ? 1 : Math.max(0.16, 1 - (t - 3.2) / 2.2);
    this.embers = clamp01((t - 2.4) / 2.4);
    this.burn(clamp01((t - 1) / 3));
    if (t < 0.1 && !this.whoosh) { this.whoosh = true; this.ctx.audio?.whoosh?.(2); }
    if (Math.random() < dt * 14) this.smoke(_v.copy(this.centre).setY(this.centre.y + 0.5 + this.fire * 0.6), false, 0.9, 2);
    // a soft glow and flying sparks round the flames (the shared additive pool)
    if (this.fire > 0.3 && Math.random() < dt * 20) {
      this.ctx.fx?.glow?.emit(_v.set(this.centre.x + (Math.random() - 0.5) * 0.5, this.centre.y + 0.3 + Math.random() * this.fire, this.centre.z + (Math.random() - 0.5) * 0.5),
        _w.set(0, 0.8, 0), { life: 0.5, size: 0.9 + Math.random() * 0.5, color: [1, 0.5, 0.12], alpha: 0.35, drag: 0.5 });
      this.spark(1);
    }
    if (t > 5.4) this.startCook();
  }

  /** The fire's straw burns away (k 0..1); the model's own bed of coals is left in the middle. */
  burn(k) {
    const ud = this.pile.userData, s = Math.max(0.001, 1 - k);
    if (ud.straw?.length) {
      for (const o of ud.straw) { o.userData.s0 ??= o.scale.x; o.scale.setScalar(o.userData.s0 * s); }
      for (const o of ud.embers || []) {
        o.visible = k > 0.35;
        // the coals glow: an own copy of the model's ember material, turned up
        if (o.visible && !o.userData.hot) {
          o.userData.hot = true;
          o.traverse(c => { if (c.isMesh && c.material?.emissive) { c.material = this.mat(c.material.clone()); c.material.emissiveIntensity = EMBER_GLOW; this.coals = c.material; } });
        }
      }
    } else this.pile.scale.setScalar(s);
  }

  startCook() {
    const ctx = this.ctx;
    this.phase = 'cook';
    ctx.lock?.(false);
    this.hearthCamera();
    this.mats.hollow.opacity = 0.75;
    // the potatoes hop into their hollows, one after the other: small ones, middling ones and big ones, plain to see
    this.hopIn(0);
    this.showGauge();
    this.hint(ctx.first
      ? tx('The ash is ready. Big potatoes take the longest! Stand by one and press {act} to cover it with ash.')
      : tx('Cover the potatoes with ash. Big ones take the longest: start with them.'), 7);
  }

  /** A batch hops from the row into its hollows (wave 0 as the cooking starts, the later ones as they arrive). */
  hopIn(wave) {
    let n = 0;
    for (const s of this.spots) {
      if (this.game.spots[s.i].wave !== wave) continue;
      const pt = this.potatoes[s.i];
      s.hollow.visible = true;
      pt.move = { from: pt.root.position.clone(), to: V().copy(s.at).setY(s.at.y + (pt.nut ? 0.085 : 0.075 * s.k)), u: 0, dur: 0.45, arc: 0.7, then: 'lay', delay: 0.1 + n++ * 0.13 };
    }
  }

  /** The spot Mika stands at: the nearest to a point half a step ahead of her. */
  pick() {
    const p = this.player, x = p.pos.x + Math.sin(p.facing) * 0.35, z = p.pos.z + Math.cos(p.facing) * 0.35;
    let best = -1, bd = 1.25;
    for (const s of this.spots) {
      const stt = this.game.spots[s.i].st;
      if (stt === 'dug' || stt === 'wait') continue;
      const d = Math.hypot(s.at.x - x, s.at.z - z);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  /** The buried potato nearest to Mika (the one a flare would catch), or -1. */
  nearBuried() {
    const p = this.player.pos;
    let best = -1, bd = Infinity;
    for (const s of this.spots) {
      if (this.game.spots[s.i].st !== 'buried') continue;
      const d = Math.hypot(s.at.x - p.x, s.at.z - p.z);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  act(i) {
    const game = this.game, gs = game.spots[i], s = this.spots[i], ctx = this.ctx, pt = this.potatoes[i];
    if (this.hold[i] > 0 || (gs.st === 'empty' && !pt.laid)) return;
    const r = game.press(i, _press);
    if (!r.act) return;
    this.hold[i] = 0.45;
    if (r.act === 'bury') {
      pt.root.visible = false;
      s.hollow.visible = false;
      s.mound.visible = true;
      s.pop = 1;
      this.player.gesture?.('Interact', { lock: false });
      ctx.audio?.land?.(0.25);
      ctx.fx?.burst?.(_v.copy(s.at).setY(s.at.y + 0.15), { n: 6, color: [0.5, 0.47, 0.45], speed: 0.9, size: 0.1, gravity: 3 });
      if (gs.kind === 'nut' && !this.told.nut) {
        this.told.nut = true;
        this.hint(tx('A chestnut! It cooks fast and wants no turning. Dig it at the amber glow, or it pops!'), 6);
      } else if (game.left === 0 && game.wave === 0) {
        this.hint(ctx.first
          ? tx('Now watch. When a mound rocks and glows on one side, turn the potato with {act}.')
          : tx('A rocking mound wants turning. Amber glow and white steam: dig!'), 7);
      }
      return;
    }
    if (r.act === 'wait') {
      s.jig = 1;
      if (this.waitHint <= 0) {
        this.waitHint = 2.5;
        this.hint(gs.turned ? tx('Not yet: it is still hard. Wait for the amber glow.') : tx('Not yet. Wait until the mound rocks.'), 2.5);
      }
      return;
    }
    if (r.act === 'turn') {
      this.hold[i] = 0.8;
      // the potato hops out of the ash, rolls over in the air and drops back in
      pt.root.visible = true;
      pt.root.scale.setScalar(pt.k);
      pt.root.position.copy(s.at);
      pt.move = { from: V().copy(s.at).setY(s.at.y + 0.1), to: V().copy(s.at).setY(s.at.y + 0.1), u: 0, dur: 0.5, arc: 0.55, then: 'in', delay: 0 };
      s.side.visible = false;
      s.arrow.visible = false;
      s.jig = 1;
      this.player.gesture?.('Interact', { lock: false });
      ctx.audio?.good?.();
      ctx.fx?.burst?.(_v.copy(s.at).setY(s.at.y + 0.2), { n: 7, color: [0.55, 0.5, 0.46], speed: 1, size: 0.09, gravity: 3 });
      if (ctx.first && !this.told.turn) {
        this.told.turn = true;
        this.hint(tx('Well turned! Now wait: grey ash is still raw. An amber glow and white steam: dig it out with {act}. Black smoke is too late!'), 8);
      }
      return;
    }
    const res = r.result;
    if (!res) return;
    s.mound.visible = false;
    s.arrow.visible = false;
    this.land(i, res);
    this.player.gesture?.('Interact', { lock: false });
    const text = {
      perfect: gs.kind === 'nut' ? tx('A perfect chestnut! Warm and floury.') : tx('Perfect! Golden, soft and sweet.'),
      okay: gs.why === 'early' ? tx('A little firm in the middle, but good.')
        : gs.why === 'side' ? tx('Dark on one side: this one wanted turning. Still tasty.')
          : gs.why === 'singed' ? tx('A bit singed by the flare, still tasty.')
            : tx('A little dry, still tasty.'),
      raw: tx('Too early: this one is still hard.'),
      burnt: tx('Oh no, charcoal! That one stayed too long.'),
    }[res];
    this.hint(text, 3);
    ctx.audio?.[res === 'perfect' ? 'pickup' : res === 'okay' ? 'good' : 'bad']?.();
    if (res === 'perfect') ctx.fx?.burst?.(_v.copy(s.at).setY(s.at.y + 0.4), { n: 14, color: [1, 0.8, 0.35], speed: 1.4, size: 0.14, gravity: 1 });
  }

  /** One wave of the fan: the ash glows again, or (too much) flares up and singes the potato nearest to her. */
  wave() {
    const ctx = this.ctx, p = this.player, c = this.centre, near = this.nearBuried();
    const res = this.game.fan(near);
    this.fanT = FAN_TIME;
    p.facing = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
    p.gesture?.(p.anim?.has?.('Stir') ? 'Stir' : 'Interact', { lock: false });      // her hand goes round in front of her: with the fan in it, that is fanning
    ctx.audio?.whoosh?.(res === 'warm' ? 1 : 3);
    // the puff of air lifts sparks off the bed
    this.spark(res === 'warm' ? 7 : 14);
    if (res === 'warm') {
      this.kick = 1;
      if (ctx.first && !this.told.fan) { this.told.fan = true; this.hint(tx('Good, it glows again. Not too much, or it flares up!'), 4); }
      return;
    }
    this.flare = 1;
    ctx.audio?.bad?.();
    if (res === 'singe') {
      const s = this.spots[near];
      for (let k = 0; k < 4; k++) this.smoke(s.at, true, 0.5, 1.2);
      this.hint(tx('Too much! The flare singed the nearest potato. Fan gently.'), 4);
    } else this.hint(tx('Whoa, a flare! Fan gently: one wave at a time.'), 4);
  }

  /** A dug potato hops out of the ash and lies on its own spot, wearing what it became: the ring tells the whole round. */
  land(i, res) {
    const pt = this.potatoes[i], s = this.spots[i];
    pt.root.visible = true;
    pt.root.position.copy(s.at);
    pt.move = { from: s.at.clone(), to: V().copy(s.at).setY(s.at.y + 0.085 * pt.k), u: 0, dur: 0.55, arc: 0.8, then: 'out', delay: 0 };
    pt.root.rotation.y = s.yaw + Math.PI / 2;
    pt.res = res;
    // a good one is shown broken open, golden inside (the model's roasted half); a burnt one is a lump of charcoal
    const ud = pt.root.userData, open = ud.roasted?.length && (res === 'perfect' || res === 'okay');
    if (open) { ud.raw.forEach(o => { o.visible = false; }); ud.roasted.forEach(o => { o.visible = true; }); }
    const tint = open ? { perfect: null, okay: '#7a5a40' }[res] : { perfect: '#ffb648', okay: '#b98a5a', raw: null, burnt: '#1a1513' }[res];
    for (const c of pt.mats) {
      if (tint) c.color.copy(c.userData.base).lerp(_c.set(tint), res === 'burnt' ? 0.92 : open ? 0.35 : 0.6);
      if (c.emissive && !open) c.emissive.set(res === 'perfect' ? '#5a2a00' : '#000000');
    }
    pt.root.scale.setScalar(pt.k * (open ? 1.25 : 1));
    pt.steam = res === 'perfect' || res === 'okay' ? 4 : 0;
  }

  /** A chestnut left too long: it jumps out of the ash with a bang, burnt. */
  pop(i) {
    const s = this.spots[i], ctx = this.ctx;
    s.mound.visible = false; s.arrow.visible = false; s.side.visible = false;
    this.land(i, 'burnt');
    this.potatoes[i].move.arc = 1.5;
    ctx.audio?.noise?.({ dur: 0.09, vol: 0.3, freq: 1800, q: 0.7 });
    ctx.audio?.bad?.();
    ctx.fx?.burst?.(_v.copy(s.at).setY(s.at.y + 0.2), { n: 16, color: [0.6, 0.55, 0.5], speed: 2.6, size: 0.12, gravity: 4 });
    this.hint(tx('Pop! That chestnut stayed too long. Next time dig it sooner.'), 3.5);
  }

  /** A shower of rain spots: drops fall on the ash, it hisses and goes greyer (the rules have cooled it already). */
  shower() {
    const ctx = this.ctx;
    this.rainT = 1.7;
    if (this.drops) {
      this.drops.visible = true;
      for (let k = 0; k < RAIN_DROPS; k++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (this.ringR + 0.25); this.dropAt.set([Math.sin(a) * r, Math.cos(a) * r, 1.2 + Math.random() * 2.6, 5 + Math.random() * 2], k * 4); }
    }
    ctx.audio?.noise?.({ dur: 0.7, vol: 0.12, freq: 5200, q: 0.5 });
    for (let k = 0; k < 5; k++) this.smoke(_v.set(this.centre.x + (Math.random() - 0.5) * 1.6, this.centre.y, this.centre.z + (Math.random() - 0.5) * 1.6), false, 0.45, 1.6);
    if (!this.told.rain) { this.told.rain = true; this.hint(tx('Rain spots! They cool the ash. Wave the fan with {fan}, gently.', { fan: this.fanKey() }), 5); this.coolHint = 8; }
  }

  cook(dt) {
    const ctx = this.ctx, game = this.game;
    this.keepOut(0.5);
    game.update(dt);
    // what the rules did this frame: the next batch arrived, a chestnut popped, a shower fell
    while (this.waveSeen < game.wave) {
      this.hopIn(++this.waveSeen);
      ctx.audio?.good?.();
      this.hint(game.buried ? tx('More potatoes! Cover them while the others cook, and keep an eye on every mound.') : tx('Here is the next batch. In they go!'), 5);
    }
    while (game.popped.length) this.pop(game.popped.pop());
    while (this.rainSeen < game.rained) { this.rainSeen++; this.shower(); }
    this.sel = this.pick();
    if (this.sel >= 0 && ctx.pressed()) this.act(this.sel);
    if (this.fanAsk) { this.fanAsk = false; if (this.fanT <= 0.35) this.wave(); }
    this.waitHint -= dt;
    // the ash is going grey: say so (now and then), the gauge blinks blue
    this.coolHint -= dt;
    if (game.warm < WARM.cool && game.buried > 0 && this.coolHint <= 0) {
      this.coolHint = 10;
      this.hint(tx('The ash is going grey! Wave the fan with {fan}.', { fan: this.fanKey() }), 4);
    }
    this.drawGauge();
    for (const s of this.spots) {
      const gs = game.spots[s.i];
      if (this.hold[s.i] > 0) this.hold[s.i] -= dt;
      if (gs.st !== 'buried') continue;
      const q = cue(gs.heat, gs, _cue);
      s.mm.color.copy(ASH).lerp(AMBER, q.glow * 0.7).lerp(CHAR, q.char);
      s.mm.emissive.copy(HOT).multiplyScalar(q.glow * q.glow * (0.62 + Math.sin(this.t * 7 + s.i) * 0.14));
      // the side by the embers: glowing while the potato wants turning, black once that side is spoilt
      const moving = !!this.potatoes[s.i].move;
      s.side.visible = !moving && (q.turn > 0 || (q.dark > 0 && q.char < 1));
      if (q.turn) { s.sm.color.copy(HOT); s.sm.emissive.copy(HOT).multiplyScalar(0.5 + Math.sin(this.t * 8 + s.i) * 0.2); }
      else if (q.dark) { s.sm.color.copy(CHAR); s.sm.emissive.setScalar(0); }
      s.arrow.visible = q.turn > 0 && !moving;
      if (s.arrow.visible) { s.arrow.rotation.y -= dt * 3.4; s.arrow.position.y = (0.42 + Math.sin(this.t * 5 + s.i) * 0.04) * (0.8 + s.k * 0.25); }
      s.pop = Math.max(0, s.pop - dt * 4.5);
      s.jig = Math.max(0, s.jig - dt * 3);
      s.mound.rotation.z = (q.turn ? Math.sin(this.t * 9 + s.i * 2) * 0.17 : 0) + Math.sin(s.jig * 18) * s.jig * 0.12;
      s.mound.scale.setScalar(s.k * (1 - s.pop * 0.7) * (q.steam && !q.char ? 1.06 + Math.sin(this.t * 9) * 0.06 : 1));
      // smoke tells the same story: a thin wisp, then white steam, then thick black smoke
      const rate = q.char > 0 ? 5 + q.char * 9 : q.steam ? 6 : 0.7;
      this.puff[s.i] += dt * rate;
      if (this.puff[s.i] >= 1) {
        this.puff[s.i] = 0;
        this.smoke(s.at, q.char > 0.15, q.char > 0 ? 0.6 + q.char * 0.4 : q.steam ? 0.6 : 0.2, q.steam && !q.char ? 1.9 : 1.1);
      }
    }
  }

  /**
   * The good potatoes are handed round while they are hot: one to the grown-up at the fire, one to each of the
   * neighbours' kids standing near. Returns how many were given.
   */
  share(kids) {
    const ctx = this.ctx, d = ctx.director, c = this.centre, to = [];
    const teacher = d?.npcs?.[ctx.teacher], name = d?.tricks?.teacherName?.(ctx.trick) || '';
    if (this.grown?.visible) to.push({ key: 'grown', name, head: out => out.copy(this.grown.position).setY(this.grown.position.y + 1.5), text: N_('Mmm, thank you! Warm and sweet.') });
    else if (teacher?.visible && teacher.pos.distanceTo(c) < 7) to.push({ key: 'grown', name, head: out => teacher.head(out), text: N_('Mmm, thank you! Warm and sweet.') });
    kids.forEach((k, i) => { if (k.n.pos.distanceTo(c) < 9) to.push({ key: k.p.id, name: tx(k.p.name || ''), head: out => k.n.head(out), text: THANKS[(i + this.seed) % THANKS.length] }); });
    const good = this.potatoes.filter(pt => pt.res === 'perfect').concat(this.potatoes.filter(pt => pt.res === 'okay'));
    const n = Math.min(to.length, good.length);
    for (let i = 0; i < n; i++) {
      const pt = good[i], who = to[i], at = who.head(V());
      at.y -= 0.45;
      at.addScaledVector(_v.copy(pt.root.position).sub(at).setY(0).normalize(), 0.3);
      pt.steam = 0;
      pt.move = { from: pt.root.position.clone(), to: at, u: 0, dur: 0.75, arc: 0.9, then: 'gift', delay: 1.1 + i * 0.55, who };
    }
    return n;
  }

  /** A shared potato has reached its friend: a thank-you, and it is theirs. */
  given(pt, who) {
    const d = this.ctx.director;
    pt.root.visible = false;
    this.ctx.fx?.burst?.(_v.copy(pt.root.position), { n: 8, color: [1, 0.8, 0.4], speed: 1, size: 0.11, gravity: 0.6 });
    this.ctx.audio?.good?.();
    d?.barks?.ui?.show?.(`roast:${who.key}`, tx(who.text), out => { who.head(out); out.y += 0.3; return out; }, { name: who.name, life: 2.8 });
  }

  finishRound() {
    if (this.phase === 'done') return;
    const ctx = this.ctx, d = ctx.director, p = this.player.pos;
    this.game.finish();
    for (const s of this.spots) {
      // one left in the ash when the time ran out comes up too, to be seen: still raw, or charcoal
      const gs = this.game.spots[s.i];
      if (gs.forgot && s.mound.visible) this.land(s.i, gs.result);
      s.mound.visible = false;
      s.arrow.visible = false;
    }
    this.phase = 'done';
    this.sel = -1;
    this.fan.visible = false;
    this.hideGauge();
    const t = this.game.tally(), good = t.perfect + t.okay;
    // the neighbours' kids, if any are about, come running in spirit: a cheer each
    const kids = (d?.town?.people || []).filter(it => it.n?.barkKind === 'kid' && it.n.visible && !it.n.far && it.n.pos.distanceTo(p) < 30).slice(0, 3);
    this.cheered = kids.length;
    if (good) kids.forEach((k, i) => d.barks?.ui?.show?.(`roast:${k.p.id}`, tx(CHEERS[(i + this.seed) % CHEERS.length]), out => { k.n.head(out); out.y += 0.3; return out; }, { name: tx(k.p.name || ''), life: 3.2 }));
    this.shared = good ? this.share(kids) : 0;
    this.endT = this.shared ? 3.4 + this.shared * 0.55 : 2.6;
    if (good) ctx.audio?.fanfare?.(); else ctx.audio?.bad?.();
    this.hint(t.perfect >= 4 ? tx('What a roast! Share them round while they\'re hot.')
      : good ? tx('Hot potatoes for everyone. Blow on them first!')
        : tx('Never mind. The ash is still warm: we\'ll try again.'), 4);
    if (good && this.player.anim?.has?.('Cheer')) this.player.gesture('Cheer', { lock: false });
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 'gather') this.gather(dt);
    else if (this.phase === 'light') this.lighting(dt);
    else if (this.phase === 'cook') this.cook(dt);
    else if (this.phase === 'done') this.endT -= dt;
    // fire, ash and light: once the potatoes are in, the bed looks as warm as the rules say
    this.flick += ((0.8 + Math.random() * 0.4) - this.flick) * Math.min(1, dt * 14);
    const cooking = this.phase === 'cook';
    this.wn += ((cooking ? clamp01((this.game.warm - 0.12) / (WARM.start - 0.12)) : 1) - this.wn) * Math.min(1, dt * 5);
    this.flare = Math.max(0, this.flare - dt * 1.5);
    this.kick = Math.max(0, this.kick - dt * 2.2);
    const wn = this.wn;
    if (cooking) this.fire = 0.04 + wn * 0.12 + this.flare * 0.7;
    if (this.flare > 0.3 && Math.random() < dt * 22) this.spark(1);
    const f = this.fire;
    for (const m of this.flames) {
      m.visible = f > 0.02;
      const s = m.userData.s, w = 1 + Math.sin(this.t * (9 + s * 5) + s * 4) * 0.14;
      m.scale.set(s * (0.5 + f * 0.6), s * f * 1.9 * w * this.flick, s * (0.5 + f * 0.6));
      m.rotation.y += dt * 2;
    }
    this.bed.material.opacity = this.embers * (0.72 + wn * 0.28);
    this.bed.material.color.setScalar((0.82 + this.flick * 0.18) * (0.3 + wn * wn * 0.7) + this.kick * 0.25);
    if (this.coals) this.coals.emissiveIntensity = EMBER_GLOW * (0.7 + this.flick * 0.45) * (0.08 + wn * 0.92);
    this.I = Math.max(f * 14, this.embers * 2.2 * (0.3 + wn * 0.7));
    if (this.embers > 0.5 && Math.random() < dt * 5 * wn) this.spark();
    if (this.embers > 0.5 && Math.random() < dt * 1.6) this.smoke(_v.copy(this.centre).setY(this.centre.y + 0.2), false, 0.5, 1.5);
    this.grownAnim?.update(dt);
    // the fan comes out for a wave: a few quick strokes, then it is tucked away again
    if (this.fanT > 0) {
      this.fanT = Math.max(0, this.fanT - dt);
      this.fan.visible = this.fanT > 0 && this.phase === 'cook';
      this.fan.scale.setScalar(Math.min(1, this.fanT * 7, (FAN_TIME - this.fanT) * 9 + 0.25));
      this.fan.userData.leaf.rotation.x = Math.sin((1 - this.fanT / FAN_TIME) * Math.PI * 7) * 0.6;
    }
    // rain drops fall on the bed and are lifted back to the top while the shower lasts
    if (this.drops?.visible) {
      this.rainT -= dt;
      const D = this.dropAt;
      for (let k = 0; k < RAIN_DROPS; k++) {
        const j = k * 4;
        D[j + 2] -= D[j + 3] * dt;
        if (D[j + 2] < 0.05) D[j + 2] = this.rainT > 0.3 ? 2.6 + Math.random() : -5;
        _m4.makeTranslation(this.centre.x + D[j], this.centre.y + D[j + 2], this.centre.z + D[j + 1]);
        this.drops.setMatrixAt(k, _m4);
      }
      this.drops.instanceMatrix.needsUpdate = true;
      if (this.rainT <= -0.6) this.drops.visible = false;
    }
    // the ring under the spot Mika can use
    const s = this.sel >= 0 && this.phase === 'cook' ? this.spots[this.sel] : null;
    this.selRing.scale.setScalar(1);
    if (s) { this.selRing.position.set(s.lx, 0.06, s.lz); this.selRing.scale.setScalar(s.k); this.mats.ring.opacity = 0.6 + Math.sin(this.t * 6) * 0.2; }
    else if (this.phase === 'gather' && this.carrying) {
      // where the armful goes
      this.selRing.position.set(0, 0.06, 0);
      this.selRing.scale.setScalar(2.6 + Math.sin(this.t * 4) * 0.2);
      this.mats.ring.opacity = 0.7;
    } else this.mats.ring.opacity = 0;
    // potatoes in the air, and the steam of the good ones
    for (let i = 0; i < this.potatoes.length; i++) {
      const pt = this.potatoes[i], m = pt.move;
      if (m) {
        if (m.delay > 0) { m.delay -= dt; continue; }
        m.u = Math.min(1, m.u + dt / m.dur);
        pt.root.position.lerpVectors(m.from, m.to, m.u);
        pt.root.position.y += Math.sin(Math.PI * m.u) * m.arc;
        pt.root.rotation.x += dt * 9;
        if (m.then === 'gift' && m.u > 0.75) pt.root.scale.setScalar(Math.max(0.05, pt.k * (1.25 - (m.u - 0.75) * 3.2)));
        if (m.u >= 1) {
          pt.move = null;
          pt.root.rotation.x = 0;
          const sp = this.spots[i];
          if (m.then === 'lay') { pt.laid = true; pt.root.rotation.y = sp.yaw + Math.PI / 2; }
          else if (m.then === 'in') pt.root.visible = false;
          else if (m.then === 'gift') this.given(pt, m.who);
        }
      } else if (pt.steam > 0) {
        pt.steam -= dt;
        if (Math.random() < dt * 5) this.smoke(pt.root.position, false, 0.2, 0.9);
      }
    }
  }

  get score() { return this.game.score; }
  get over() { return this.phase === 'done' && this.endT <= 0; }

  /** What a QA script needs: where things are, and (unlike the player) the cook times and the warmth as numbers. */
  view() {
    const game = this.game;
    return {
      phase: this.phase, seed: this.seed, straw: this.straw, carrying: this.carrying, sel: this.sel, score: this.score,
      wave: game.wave, waves: game.waves.length, rained: game.rained, clock: game.clock,
      fire: { x: this.centre.x, z: this.centre.z }, cheered: this.cheered ?? null, shared: this.shared,
      warm: game.warm, fans: game.fans, flares: game.flares, gentle: game.gentle,
      piles: this.piles.map(q => ({ x: q.x, z: q.z, taken: q.taken })),
      spots: this.spots.map(s => {
        const gs = game.spots[s.i];
        return { i: s.i, x: s.at.x, z: s.at.z, st: gs.st, size: gs.size, kind: gs.kind, wave: gs.wave, laid: this.potatoes[s.i].laid, heat: gs.heat, cook: gs.cook, win: gs.win, turn: gs.turn,
          turned: gs.turned, singed: gs.singed, canTurn: game.canTurn(s.i), now: cookState(gs.heat, gs), result: gs.result, why: gs.why ?? null };
      }),
    };
  }

  dispose() {
    this.disposed = true;
    this.ctx.lock?.(false);
    this.hideGauge();
    if (this.light) this.g.lights?.remove(this.light);
    this.bundle?.removeFromParent();
    this.fan?.removeFromParent();
    this.restoreGrass();
    // rigged clones own a bone texture each (the geometry and materials belong to the model library)
    for (const o of this.added || []) { this.scene.remove(o); disposeRigs(o); }
    for (const x of this.own) x.dispose?.();
    this.own.length = 0;
    const d = this.ctx.director;
    for (const it of d?.town?.people || []) d.barks?.ui?.hide?.(`roast:${it.p.id}`);
    d?.barks?.ui?.hide?.('roast:grown');
    if (this.fades > 0) this.ctx.fade?.(false, 150);
  }
}

export default {
  id: 'roast',
  async play(ctx) {
    const g = ctx.game;
    await ctx.ensureModels?.(['sweet-potato', 'straw-pile']);
    if (ctx.quit) return { score: 0, quit: true };
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new RoastRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    // a late-afternoon look for the round when the hour on screen is not one already (the framework restores it)
    const h = g.shownHour ? g.shownHour() : 17;
    if (!(h >= 15 && h < 19)) ctx.setNight?.(true, 17.2);
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    ctx.debug.view = () => r.view();
    ctx.debug.round = r;
    try {
      r.build();
      // the hints sit at the top all round, under the HUD and the heat gauge and clear of a phone's corner buttons: the
      // middle and the bottom of the picture are where Mika works, most of all on a phone held sideways
      ctx.hintTop?.(true, 108);
      ctx.hint?.(ctx.first
        ? tx('First the fire needs straw. Walk to a straw pile and press {act}, then carry the armful here. Three will do.')
        : tx('Gather three armfuls of straw for the fire.'), 6);
      // gathering and the lighting are untimed; the clock runs while the potatoes are in the ash
      let left = ctx.roundTime || 60;
      ctx.hud?.(0, null);
      const res = await ctx.loop(dt => {
        r.update(dt);
        if (r.phase === 'cook') {
          left -= dt;
          if (left <= 0 || r.game.done) r.finishRound();
        }
        ctx.hud?.(r.score, r.phase === 'cook' ? Math.max(0, left) : null);
        if (r.over) return true;
      });
      const t = r.game.tally();
      return { score: r.score, caught: t.perfect + t.okay, quit: !!res?.quit,
        extra: tx('{p} perfect, {o} good', { p: t.perfect, o: t.okay }),
        detail: { ...t, results: r.game.spots.map(s => s.result), sizes: r.game.spots.map(s => s.size), turned: r.game.spots.filter(s => s.turned && s.kind !== 'nut').length,
          waves: r.game.waves.length, rained: r.game.rained, popped: r.game.spots.filter(s => s.pop).length,
          fans: r.game.fans, flares: r.game.flares, shared: r.shared, cheered: r.cheered || 0, seed: r.seed } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  ambient() {},
  _Round: RoastRound,
};
