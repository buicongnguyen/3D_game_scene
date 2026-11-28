// © 2026 Bui Cong Nguyen · solluxlabs.com
// Weather moments: the rules, as pure data and functions (no three.js, no DOM). The runtime is game/moments.js, the
// look is fx/moment-fx.js and the story of the feature is docs/WEATHER-MOMENTS.md. Tests: tests/moments.test.mjs.
//
// About once every 3-4 minutes of free roaming outdoors by day, something small happens in the sky: a breeze of
// petals, leaves or powder snow, a skein of geese or a loop of swallows, a sun shower with a rainbow, diamond dust,
// or the evening bell with the crows going home. Seasons and hours are always the SHOWN ones (Settings and Explore
// can differ from the story's calendar); the story gates (chapter, lamps) read quest state only.
import { N_ } from '../i18n/i18n.js';
export { momentsWantedBy as momentsWanted } from '../ui/moments-option.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
/** The bell tower (the director's hourly bell rings when Mika is within TOWER_RANGE of it). */
export const TOWER = { x: 115, y: 30, z: -4 };
export const TOWER_RANGE = 260;

/**
 * The table. from/to: shown hours; night: start (and keep going) only while g.night is below it; dur: seconds;
 * cooldown: eligible seconds after it ends; perSession: starts per page load; weight: how often it is picked;
 * lamp: the story lamp that must be lit; tower: Mika must be near the bell tower.
 */
export const MOMENTS = {
  gust: { id: 'gust', seasons: SEASONS, from: 7, to: 18.5, night: 0.2, dur: 7, cooldown: 240, perSession: Infinity, weight: 3 },
  birds: {
    id: 'birds', seasons: SEASONS, from: 7, to: 18.5, night: 0.2, dur: 40, cooldown: 420, perSession: Infinity, weight: 2.5,
    // geese winter in Japan (autumn and winter); swallows nest there in spring and summer, and settle before dusk
    variants: { geese: { dur: 40 }, swallows: { dur: 14, to: 18 } },
  },
  shower: { id: 'shower', seasons: ['spring', 'summer', 'autumn'], from: 7.5, to: 18.3, night: 0.2, dur: 36, cooldown: 600, perSession: 2, weight: 2, lamp: 'mill' },
  sparkle: { id: 'sparkle', seasons: ['winter'], from: 7, to: 12.5, night: 0.1, dur: 22, cooldown: 480, perSession: Infinity, weight: 2 },
  bell: { id: 'bell', seasons: SEASONS, from: 16.5, to: 18.5, night: null, dur: 8, cooldown: 900, perSession: 2, weight: 4, lamp: 'orchard', tower: true },
};
export const IDS = Object.keys(MOMENTS);

/** Timing, all in eligible seconds (time with no start blocker): the first moment, the gap after each one, the re-check. */
export const FIRST = { base: 45, spread: 30 };
export const GAP = { base: 120, spread: 90 };
export const CHECK = 4;

/** What a moment is called (the stamp card's lucky stamp names it): English source, translated where shown. */
export const NAMES = {
  gust: N_('Breeze'), geese: N_('Geese'), swallows: N_('Swallows'), shower: N_('Sun shower'), sparkle: N_('Diamond dust'), bell: N_('Evening bell'),
};

/** What Tamo (or Mika) says. Each list is true in every season it can be said in (linesFor). */
export const LINES = {
  shower: [N_('Sun and rain at once!')],
  rainbow: [N_('Look, a rainbow! Over there!')],
  gust: [N_('Whoosh! Hold on to your hat!'), N_('The wind wants to play!')],
  gustWinter: [N_('Brr! The wind is blowing the snow about.')],
  geese: [N_('Look! Geese, flying in a V!'), N_('The geese have come for the winter.')],
  swallows: [N_('Swallows! Zip, zip. Show-offs.'), N_('Look how fast the swallows turn!')],
  sparkle: [N_('The air is sparkling!'), N_('Diamond dust! Ice in the air, glittering.')],
  bellCrows: [N_('The evening bell! Off home go the crows.')],
  bellHome: [N_('The evening bell! Time to head home.')],
  // a neighbour within 20 m during a shower (kids only when a rainbow is planned)
  villager: [N_('A sun shower! The foxes must be having a wedding.'), N_('Rain and sunshine. The washing can stay out!')],
  kid: [N_('Rain AND sunshine? Look for the rainbow!')],
};

/** The lines a moment may use in a season ([] when it cannot happen then). key: an id, a variant, or 'rainbow'. */
export function linesFor(key, season, { crows = true } = {}) {
  if (key === 'gust') return season === 'winter' ? LINES.gustWinter : LINES.gust;
  if (key === 'geese') return season === 'autumn' || season === 'winter' ? LINES.geese : [];
  if (key === 'swallows') return season === 'spring' || season === 'summer' ? LINES.swallows : [];
  if (key === 'shower' || key === 'rainbow' || key === 'villager' || key === 'kid') return season === 'winter' ? [] : LINES[key];
  if (key === 'sparkle') return season === 'winter' ? LINES.sparkle : [];
  if (key === 'bell') return crows ? LINES.bellCrows : LINES.bellHome;
  return [];
}

/** Which birds fly in this season. */
export const variantOf = (id, season) => (id === 'birds' ? (season === 'autumn' || season === 'winter' ? 'geese' : 'swallows') : '');
export const durOf = (id, variant) => MOMENTS[id]?.variants?.[variant]?.dur ?? MOMENTS[id]?.dur ?? 0;
const windowOf = (def, variant) => def.variants?.[variant] || def;

/** Is the shown season, hour and night inside the moment's window? (A moment running out of it stops gently.) */
export function inWindow(id, variant, c) {
  const def = MOMENTS[id];
  if (!def || !def.seasons.includes(c.season)) return false;
  // (a variant has its own seasons: geese leave the window when the shown season turns to spring, swallows in autumn)
  if (def.variants && variantOf(id, c.season) !== variant) return false;
  const w = windowOf(def, variant), from = w.from ?? def.from, to = w.to ?? def.to;
  if (!(c.hour >= from && c.hour <= to)) return false;
  return def.night == null || (c.night || 0) < def.night;
}

/** May this moment start now, as far as the story and the place go? (Cooldowns and blockers are the scheduler's.) */
export function eligible(def, c) {
  if (!def || !(c.chapter >= 1) || c.frozen) return false;
  if (!inWindow(def.id, variantOf(def.id, c.season), c)) return false;
  if (def.lamp && !c.lamps?.[def.lamp]) return false;
  if (def.tower && !(c.towerDist <= TOWER_RANGE)) return false;
  return true;
}

// ------------------------------------------------------------------ gates
const _dom = { r: null, gl: null, doc: null, body: null, fade: null };
/**
 * The game's state as plain flags, filled into one reused object (4 times a second while idle, 10 while a moment
 * runs). Every read is guarded: a missing system reads as "not in the way". doc: the page (left out in Node tests).
 */
export function readFlags(g, f, doc = globalThis.document) {
  const d = g?.director, q = d?.quest, st = q?.state, p = g?.player, R = g?.renderer, ui = g?.ui, fo = g?.follow, I = g?.interiors;
  f.noQuest = !q;
  f.chapter = st?.chapter ?? 0;
  f.prologue = !!q && !(f.chapter >= 1);
  f.frozen = !!q && !!d?.townFrozen?.();
  f.zone = !!g?.zone;
  f.focus = !!g?.focus;
  f.tourLock = !!d?.tourLock;
  f.hold = !!R?.hold;
  f.rfocus = !!R?.focus;
  // (the context and the two class lists are looked up once per renderer / page, then only asked)
  let lost = false;
  try {
    if (_dom.r !== R) { _dom.r = R; _dom.gl = R?.renderer?.getContext?.() || null; }
    lost = !!_dom.gl?.isContextLost?.();
  } catch { lost = true; }
  f.lost = lost;
  f.busy = !!d?.busy;
  f.scene = !!d?.scenes?.active;
  f.dialogue = !!ui?.dialogueOpen;
  f.overlay = !!ui?.overlay;
  if (_dom.doc !== doc || !_dom.fade) { _dom.doc = doc; _dom.body = doc?.body?.classList || null; _dom.fade = doc?.getElementById?.('fade')?.classList || null; }
  f.cinema = !!_dom.body?.contains('cinema');
  f.fade = !!_dom.fade?.contains('on');
  f.shot = !!fo?.shot;
  f.tracking = !!fo?.tracking;
  f.minigame = !!d?.minigame;
  f.trick = !!d?.tricks?.round;
  f.yard = !!d?.yard?.round;
  f.workshop = !!d?.workshop?.active;
  f.menu = !!d?.minigameMenu?.running;
  f.roundLight = !!g?.roundLight?.on;
  f.weatherHold = !!g?.fx?.weatherHold;
  f.riding = !!d?.cows?.riding;
  f.sky = !!d?.sky?.active || !!g?.sky?.active;
  f.kite = !!g?.kite?.active;
  f.mounted = !!p?.mounted;
  f.climb = !!p?.climb;
  f.swimming = !!p?.swimming;
  f.submerged = !!p?.submerged;
  f.under = !!g?.underwater?.under;
  f.indoors = !!I?.active;
  f.rooms = !!I?.busy;
  f.off = !!g?.momentsOff;
  f.weatherOff = !!g?.weatherOff;
  f.low = R?.qualityName === 'low';
  f.level = f.low ? (R?.appliedLevel || 0) : 0;
  // what the windows read: the shown season and hour, last frame's night, the story's lamps, the bell tower
  f.season = g?.shownSeason || g?.time?.season || 'spring';
  f.hour = typeof g?.shownHour === 'function' ? g.shownHour() : (g?.time?.hour ?? 10);
  f.night = g?.night || 0;
  f.lamps = st?.lamps || null;
  f.towerDist = p?.pos ? Math.hypot(p.pos.x - TOWER.x, p.pos.y - TOWER.y, p.pos.z - TOWER.z) : Infinity;
  f.why = undefined; f.halt = undefined; f.winFor = '';     // (verdicts: see Scheduler.tick and judge)
  return f;
}

/** Store the gates' verdicts with freshly read flags, so the frames until the next read only compare. */
export function judge(f, active = '', variant = '') {
  f.why = startBlocked(f);
  f.halt = mustStop(f);
  f.winFor = active;
  f.win = active ? inWindow(active, variant, f) : true;
  return f;
}

// (the flag that blocks, and the reason it gives: the flag's own name)
const START = ['noQuest', 'prologue', 'frozen', 'zone', 'focus', 'tourLock', 'hold', 'rfocus', 'lost', 'busy', 'scene', 'dialogue', 'overlay',
  'cinema', 'fade', 'shot', 'tracking', 'minigame', 'trick', 'yard', 'workshop', 'menu', 'roundLight', 'weatherHold', 'riding', 'sky', 'kite',
  'mounted', 'climb', 'swimming', 'submerged', 'under', 'indoors', 'rooms', 'off', 'weatherOff'];
// a running moment carries on through dialogue, busy, overlays, swimming and riding (its bubbles are hushed meanwhile)
const STOP = ['noQuest', 'zone', 'focus', 'tourLock', 'hold', 'rfocus', 'lost', 'scene', 'cinema', 'shot', 'tracking', 'minigame', 'trick', 'yard',
  'workshop', 'menu', 'roundLight', 'weatherHold', 'sky', 'kite', 'submerged', 'under', 'indoors', 'rooms', 'off', 'weatherOff'];
export const START_FLAGS = START;
export const STOP_FLAGS = STOP;

/** Why no moment may start now ('' = it may). Low tier: nothing starts two steps down the governor's ladder. */
export function startBlocked(f) {
  for (let i = 0; i < START.length; i++) if (f[START[i]]) return START[i];
  if (f.low && f.level >= 2) return 'slow';
  return '';
}

/** Why a running moment must collapse now ('' = it may go on). Low tier: three steps down. */
export function mustStop(f) {
  for (let i = 0; i < STOP.length; i++) if (f[STOP[i]]) return STOP[i];
  if (f.low && f.level >= 3) return 'slow';
  return '';
}

// ------------------------------------------------------------------ levels (every visible quantity follows one)
const sm = (a, b, x) => { if (b === a) return x < a ? 0 : 1; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const smooth = sm;

/** 0 at t = 0, up over `a` seconds, 1, down over the last `b` seconds, 0 at dur. */
export const envelope = (t, dur, a, b) => (t <= 0 || t >= dur ? 0 : sm(0, a, t) * (1 - sm(dur - b, dur, t)));

/** A sun shower's levels at t (36 s): cloud cover, falling drops, the arc's reveal (0..1.2) and alpha. Into `out`. */
export function showerLevels(t, out = {}) {
  out.cover = t <= 0 || t >= 28 ? 0 : sm(0, 3, t) * (1 - sm(20, 28, t));
  out.drops = t <= 2 || t >= 22 ? 0 : sm(2, 4, t) * (1 - sm(19, 22, t));
  const rev = sm(14, 17.2, t);
  out.reveal = rev < 0.999 ? rev * 1.06 : 1.2;       // (like celebrate.rainbow: past 1 the whole arch is drawn)
  out.arc = t <= 14 || t >= 36 ? 0 : sm(14, 15.2, t) * (1 - sm(33, 36, t));
  return out;
}

/** A breeze's emission level at t: a 2.5 s puff (the leaves then fly on by themselves for up to 4.5 s). */
export const gustLevel = t => (t <= 0 || t >= 2.5 ? 0 : sm(0, 0.35, t) * (1 - sm(2.1, 2.5, t)));

/** Diamond dust's levels at t (22 s): new crystals per second (0..1) and the twinkle sounds. Into `out`. */
export function sparkleLevels(t, out = {}) {
  out.rate = t <= 0 || t >= 20 ? 0 : sm(0, 3, t) * (1 - sm(16, 20, t));
  out.sound = out.rate;
  return out;
}

// ------------------------------------------------------------------ the sky, inside the frame
const DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const WORLD_BOX = { minX: -200, maxX: 200, minZ: -215, maxZ: 185 };   // (world/layout.js WORLD: the playable rectangle)

/**
 * A point D m ahead of the camera (horizontally, along yaw) and D·tan(degAbove) above its eye. The follow camera
 * (fov 55, pitch 0.3) shows only about 10° above its eye line, and on a portrait phone the top ~12 % of the screen is
 * the objective card and the clock: what is meant to be seen in the sky sits in SKY_BAND, under the HUD.
 */
export function viewBand(cam, yaw, D, degAbove, out = {}) {
  out.x = cam.x + Math.sin(yaw) * D;
  out.z = cam.z + Math.cos(yaw) * D;
  out.y = cam.y + D * Math.tan(degAbove * DEG);
  return out;
}

/** The sun's elevation in degrees (sunDir need not be unit length: seasons.js sunDirection is not). */
export const sunElevation = s => Math.asin(clamp(s.y / (Math.hypot(s.x, s.y, s.z) || 1), -1, 1)) / DEG;
export const RAINBOW_MAX_SUN = 48;     // a sun higher than this: a shower, but no arc
export const RAINBOW_CONE = 60;        // the arch stands at most this far round from the point opposite the sun
// Measured on the phone (390x844, Low, pitch 0.3): the eye line sits at NDC y 0.59 and the HUD's bottom edge at
// about 0.74, i.e. 3.9° above the eye. Sky things go 1.5-3.5° up, in front of the hills (the look check, the doc).
export const SKY_BAND = { lo: 1.5, hi: 3.5 };
export const RAINBOW_HALF = 14;        // half-width of the arch, degrees at its distance (a phone upright: about the screen's width)
export const RAINBOW_APEX = 3;         // the apex, degrees above the eye (just under the HUD)

/** The arch's heading: opposite the sun, turned toward the view as far as the cone allows. Game yaw: atan2(dx, dz). */
export function rainbowAzimuth(sunDir, camYaw) {
  const anti = Math.atan2(-sunDir.x, -sunDir.z);
  return wrap(anti + clamp(wrap(camYaw - anti), -RAINBOW_CONE * DEG, RAINBOW_CONE * DEG));
}

/** How far out the arch stands along az: 200 m, or in front of the first ground that rises to the eye; never under 90. */
export function rainbowDistance(cam, az, heightAt) {
  const sx = Math.sin(az), sz = Math.cos(az);
  for (let d = 60; d <= 200; d += 20) {
    if (heightAt(cam.x + sx * d, cam.z + sz * d) > cam.y - 1) return Math.max(90, d - 10);
  }
  return 200;
}

/**
 * Where and how big the shower's rainbow is: a low, wide, flattened arch on the side away from the sun, its feet on
 * the ground at D and its apex RAINBOW_APEX degrees above the eye, so it shows in the phone's normal view.
 * -> out { ok, az, D, x, y, z, sx, sy, sz, elev } (ok false: the sun is too high for an arc).
 */
export function rainbowPlan(sunDir, cam, camYaw, heightAt, out = {}, box = WORLD_BOX) {
  out.elev = sunElevation(sunDir);
  out.ok = out.elev > 0 && out.elev <= RAINBOW_MAX_SUN;
  let az = rainbowAzimuth(sunDir, camYaw), D = rainbowDistance(cam, az, heightAt);
  let x = cam.x + Math.sin(az) * D, z = cam.z + Math.cos(az) * D;
  const m = 20, cx = clamp(x, box.minX + m, box.maxX - m), cz = clamp(z, box.minZ + m, box.maxZ - m);
  if (cx !== x || cz !== z) {
    // pulled in at the valley's edge: measured again from the camera, so it still faces it squarely
    x = cx; z = cz; D = Math.max(1, Math.hypot(x - cam.x, z - cam.z)); az = Math.atan2(x - cam.x, z - cam.z);
  }
  out.az = az; out.D = D; out.x = x; out.z = z;
  out.y = heightAt(x, z) - 2;
  out.sx = D * Math.tan(RAINBOW_HALF * DEG);
  out.sy = Math.max(4, (cam.y - out.y) + D * Math.tan(RAINBOW_APEX * DEG));
  out.sz = 1;
  out.foot = Math.atan2(cam.y - out.y, D) / DEG;      // how far below the eye its feet stand (degrees)
  return out;
}

/** Where the arch is drawn: in front of anything farther than this, behind anything nearer (Mika, the next house). */
export const RAINBOW_DRAW = 40;

/**
 * The arch of plan p as drawn this frame: the same angles (heading az, feet p.foot below the eye, apex RAINBOW_APEX
 * above it, RAINBOW_HALF either side), RAINBOW_DRAW m from the camera wherever it is now. A real rainbow keeps its
 * place in the sky as you walk; drawn 40 m out, the village and the hills behind it stay behind it. Into `out`.
 */
export function rainbowAt(cam, p, out = {}, Dd = RAINBOW_DRAW) {
  const foot = Math.tan(clamp(p.foot, 0.5, 20) * DEG);
  out.x = cam.x + Math.sin(p.az) * Dd;
  out.z = cam.z + Math.cos(p.az) * Dd;
  out.y = cam.y - Dd * foot;
  out.sx = Dd * Math.tan(RAINBOW_HALF * DEG);
  out.sy = Dd * (foot + Math.tan(RAINBOW_APEX * DEG));
  return out;
}

/**
 * A skein of geese for the phone's portrait view, whose sides are only about 13° either side of the view: it slips
 * in at one side about 30 m out and glides away into the distance at a shallow angle (12-17° off the view), so it
 * stays on screen for most of its 40 s instead of the 5 s a crossing at right angles would; low (SKY_BAND), under
 * the HUD. (A deviation from the first design; docs/WEATHER-MOMENTS.md.) heightAt (optional): the path is turned to
 * the other side, or raised a little (never past SKY_BAND.hi + 0.5°), where ground would hide it.
 * -> out { x0, z0, hx, hz, y, speed, passD, passT, side, elev }
 */
export function skeinPlan(cam, camYaw, rng, out = {}, heightAt = null, force = 0) {
  const passD = 55 + rng() * 30, lean = rng() * 4 * DEG, beta = (12 + rng() * 5) * DEG;
  const elev = SKY_BAND.lo + 0.4 + rng() * (SKY_BAND.hi - SKY_BAND.lo - 0.4);
  let side = rng() < 0.5 ? -1 : 1, y = cam.y + passD * Math.tan(elev * DEG), off = 0;
  // force (+1 / -1): the side they must come from (a phone on its side: from the left, so they glide off to the right,
  // clear of the objective card that covers the top left)
  if (force) side = force;
  const speed = 9, back = 45;
  const plan = sd => {
    // (the pass point leans a little to the side they come from: they cross the middle later and stay longer)
    off = -sd * lean;
    const head = camYaw + off + sd * beta, hx = Math.sin(head), hz = Math.cos(head);
    const ax = cam.x + Math.sin(camYaw + off) * passD, az = cam.z + Math.cos(camYaw + off) * passD;
    return { hx, hz, x0: ax - hx * back, z0: az - hz * back };
  };
  // the highest ground under the line of sight to the path while it is in view (its first 20 s, every 30 m; five
  // points along each sight line). Later, far off, the runtime lifts them over the hills they meet.
  const blocked = (p, alt) => {
    if (!heightAt) return -Infinity;
    let worst = -Infinity;
    for (let s = 0; s <= back + speed * 20; s += 30) {
      const bx = p.x0 + p.hx * s, bz = p.z0 + p.hz * s;
      for (let k = 1; k <= 5; k++) {
        const t = k / 6, gx = cam.x + (bx - cam.x) * t, gz = cam.z + (bz - cam.z) * t;
        worst = Math.max(worst, heightAt(gx, gz) - (cam.y + (alt - cam.y) * t));
      }
    }
    return worst;
  };
  let p = plan(side), w = blocked(p, y);
  if (w > -2) {
    const q = force ? null : plan(-side), wq = q ? blocked(q, y) : Infinity;
    if (wq < w) { side = -side; p = q; w = wq; }
    // still in the way: a little higher, never behind the HUD
    if (w > -2) y = Math.min(cam.y + passD * Math.tan((SKY_BAND.hi + 0.5) * DEG), y + w + 2);
  }
  Object.assign(out, p);
  out.y = y; out.speed = speed; out.passD = passD; out.passT = back / speed; out.side = side; out.elev = Math.atan2(y - cam.y, passD) / DEG;
  return out;
}

/** A goose's place in the V: slot 0 leads; then pairs, k back 2.4 m and k·2 m out to either side. */
export function vSlot(i, out = {}) {
  const k = Math.ceil(i / 2);
  out.back = k * 2.4;
  out.lat = i === 0 ? 0 : (i % 2 ? 1 : -1) * k * 2.0;
  return out;
}

/**
 * The height a bird at (x, z) may fly at most so it stays `deg` above the eye line or lower, i.e. under the phone's
 * HUD: every bird, not just the leader (a V's rear pairs fly higher; seen from far off they would slip behind it).
 */
export const skyCap = (cam, x, z, deg = SKY_BAND.hi) => cam.y + Math.hypot(x - cam.x, z - cam.z) * Math.tan(deg * DEG);

/**
 * How much higher each pair back flies (m per metre back): 0.4 to read as a V from behind, less as the leader nears
 * the top of SKY_BAND at distance `dist` (the last pair is 9.6 m back), none once it is there.
 */
export function vStep(leadY, camY, dist) {
  const room = camY + dist * Math.tan(SKY_BAND.hi * DEG) - leadY;
  return clamp(room / 9.6, 0, 0.4);
}

const frac = x => x - Math.floor(x);
/** Swallow i's own loop: angular speed (rad/s, signed), radius (m), height (m) and phase. Fixed per index. */
export function swallowLoop(i) {
  const w = (1.6 + 0.8 * frac(i * 0.618 + 0.13)) * (i % 3 === 2 ? -1 : 1);
  return { w, r: 3 + 4 * frac(i * 0.382 + 0.27), h: 2.5 + 2 * frac(i * 0.271 + 0.41), a0: i * 2.39996, ph: i * 1.7 };
}
/** The six swallows' loops, made once (read every frame: no allocation). */
export const SWALLOW_LOOPS = Object.freeze([0, 1, 2, 3, 4, 5].map(swallowLoop));
/** How high above the ground under it a swallow flies at least (the loops are ahead of Mika: uphill they would dip in). */
export const SWALLOW_CLEAR = 1.5;

/**
 * Swallow i at time t, looping round `centre` ({x, y, z}: y = Mika's feet). squeeze < 1 narrows the loops across
 * the view (yaw: the view's heading) so a portrait phone keeps them in frame. Until 10 s; then the runtime lets them
 * climb away. Into `out`.
 */
export function swallowPoint(i, t, centre, out = {}, squeeze = 1, yaw = 0) {
  const L = SWALLOW_LOOPS[i] || swallowLoop(i), a = L.a0 + L.w * t;
  const lat = Math.cos(a) * L.r * squeeze, fwd = Math.sin(a) * L.r;
  // right of the view = (-cos yaw, sin yaw) in the game's convention (actors/camera.js); forward = (sin yaw, cos yaw)
  out.x = centre.x - Math.cos(yaw) * lat + Math.sin(yaw) * fwd;
  out.z = centre.z + Math.sin(yaw) * lat + Math.cos(yaw) * fwd;
  out.y = centre.y + L.h + 0.8 * Math.sin(2 * a + L.ph);
  return out;
}

/** The evening bell's crows (game/moments.js draws them with the moment flock). */
export const CROWS = 6;

/**
 * The evening bell's crows going home, drawn where the phone sees them (the valley's own flocks circle 25-35 m above
 * the follow camera, out of its frame): a loose group starting on the tower's side of the view (`from`: +1 right,
 * -1 left), gliding away and across to the other side over the moment's `dur` seconds, SKY_BAND above the eye.
 * lean: radians the whole path is turned right of the view (a phone on its side: clear of the objective card).
 * -> out { x0, z0, x1, z1, hx, hz, dur }
 */
export function crowPlan(cam, camYaw, tanH, from, out = {}, lean = 0, dur = 8) {
  const half = Math.min(Math.atan(tanH), 18 * DEG), c = camYaw - lean;
  const b0 = c - from * half * 0.6, b1 = c + from * half * 0.7;          // (game yaw: minus turns right)
  out.x0 = cam.x + Math.sin(b0) * 25; out.z0 = cam.z + Math.cos(b0) * 25;
  out.x1 = cam.x + Math.sin(b1) * 110; out.z1 = cam.z + Math.cos(b1) * 110;
  const l = Math.hypot(out.x1 - out.x0, out.z1 - out.z0) || 1;
  out.hx = (out.x1 - out.x0) / l; out.hz = (out.z1 - out.z0) / l; out.dur = dur;
  return out;
}

/** Crow i of the group at time t: along the plan, at its own place in the group, its own height in SKY_BAND. Into `out`. */
export function crowPoint(i, t, P, cam, out = {}) {
  const u = clamp(t / P.dur, 0, 1), back = 6 * frac(i * 0.71 + 0.3), lat = 7 * (frac(i * 0.382 + 0.1) - 0.5);
  out.x = P.x0 + (P.x1 - P.x0) * u - P.hx * back + P.hz * lat;
  out.z = P.z0 + (P.z1 - P.z0) * u - P.hz * back - P.hx * lat;
  const elev = SKY_BAND.lo + 0.3 + (SKY_BAND.hi - SKY_BAND.lo - 0.5) * frac(i * 0.618 + 0.2);
  out.y = cam.y + Math.hypot(out.x - cam.x, out.z - cam.z) * Math.tan(elev * DEG);
  return out;
}

/**
 * The director's hourly bell just rang. At 17:00, with the bell moment ready: two more tolls (three in all), the
 * line and every crow lifts (it counts as the bell moment). Otherwise only the Takamori crows, at most every 45 s.
 */
export function bellReaction(hourFloor, sinceLift, bellReady) {
  if (hourFloor === 17 && bellReady) return { tolls: 3, lift: 'all', moment: true };
  return { tolls: 1, lift: sinceLift >= 45 ? 'takamori' : '', moment: false };
}

// ------------------------------------------------------------------ the scheduler
/** A small seeded random generator (moments repeat exactly under ?momentseed=N). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * When the next moment comes and which one. Time counts only while nothing blocks a start ("eligible seconds"): the
 * first after FIRST, then a GAP after each one ends, re-checked every CHECK seconds; picked by weight among the ones
 * in their window, off cooldown and under their per-session count, never the same one twice in a row while another
 * is eligible, never two at once. tick -> '' | an id to start | 'stop' (gently: its window passed) | 'stop-fast'.
 */
export class Scheduler {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.clock = 0;
    this.wait = FIRST.base + this.rng() * FIRST.spread;
    this.active = '';
    this.variant = '';
    this.readyAt = {};
    this.counts = {};
    this.last = '';
    this.lastBlock = '';
    this.pool = [];
  }

  seed(n) { this.rng = mulberry32(n); }

  /**
   * One frame. c: the flags (readFlags). The runtime refreshes them a few times a second and stores the verdicts
   * with them (c.why: startBlocked, c.halt: mustStop, c.win for c.winFor: inWindow) so a frame costs a few
   * comparisons; without them (tests) they are worked out here.
   */
  tick(dt, c, rng = this.rng) {
    if (this.active) {
      const r = c.halt ?? mustStop(c);
      if (r) { this.lastBlock = r; return 'stop-fast'; }
      return (c.winFor === this.active ? c.win : inWindow(this.active, this.variant, c)) ? '' : 'stop';
    }
    const b = c.why ?? startBlocked(c);
    this.lastBlock = b;
    if (b) return '';
    this.clock += dt;
    this.wait -= dt;
    if (this.wait > 0) return '';
    this.wait = CHECK;           // (nothing fits, or the start is refused: look again in a moment)
    return this.pick(c, rng);
  }

  /** Off cooldown and under its per-session count. */
  ready(id) { const def = MOMENTS[id]; return !!def && this.clock >= (this.readyAt[id] ?? 0) && (this.counts[id] || 0) < def.perSession; }

  pick(c, rng = this.rng) {
    const pool = this.pool;
    pool.length = 0;
    for (const id of IDS) if (this.ready(id) && eligible(MOMENTS[id], c)) pool.push(id);
    if (pool.length > 1 && pool.includes(this.last)) pool.splice(pool.indexOf(this.last), 1);
    if (!pool.length) return '';
    let total = 0;
    for (const id of pool) total += MOMENTS[id].weight;
    let r = rng() * total;
    for (const id of pool) { r -= MOMENTS[id].weight; if (r < 0) return id; }
    return pool[pool.length - 1];
  }

  started(id, variant = '') { this.active = id; this.variant = variant; this.counts[id] = (this.counts[id] || 0) + 1; }

  ended(id) {
    if (this.active === id) { this.active = ''; this.variant = ''; }
    this.readyAt[id] = this.clock + (MOMENTS[id]?.cooldown ?? 0);
    this.wait = GAP.base + this.rng() * GAP.spread;
    this.last = id;
  }

  /** Skip `s` eligible seconds (QA). */
  advance(s) { this.clock += s; this.wait -= s; }

  state() {
    const cooldowns = {}, perSession = {};
    for (const id of IDS) { cooldowns[id] = Math.max(0, (this.readyAt[id] ?? 0) - this.clock); perSession[id] = this.counts[id] || 0; }
    return { active: this.active, variant: this.variant, clock: this.clock, wait: this.wait, cooldowns, perSession, lastBlock: this.lastBlock };
  }
}
