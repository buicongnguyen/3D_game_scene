// Cow race (trick `cowrace`): the pure rules, no three.js and no DOM, so a recorded run can be replayed in Node.
// Four cows run a straight track, one lane each. Mika's cow keeps the beat of its own stride: a "Giddy-up!" tap on the
// beat pushes it on, taps off the beat do nothing, and mashing tires the cow (it puffs and slows). Fresh grass bundles
// on the track give a short burst. The mud patch slows everyone. The three village kids' cows run on their own, with a
// little seeded wobble and a gentle rubber band so a beginner wins some races and an expert wins most.
//
// Units: metres along the track (s), lane units across it (0..3, one per lane), seconds, metres per second.
import { rng } from '../../engine/spline.js';

export const TRACK = {
  len: 56,                    // start line to ribbon
  lanes: 4,
  laneW: 3,                   // metres
  mud: [21, 29],              // the sticky patch (s from, to)
  grass: [12, 37],            // a bundle of fresh grass in every lane at these s
  grassBoost: 1.7,            // seconds of speed it gives
  timeout: 70,                // the race ends for everybody after this long
};

export const BEAT = 0.62;           // seconds between the cow's footfalls (the ring in the corner pulses at this pace)
export const PRACTICE_BEAT = 0.8;   // the first try (the practice lap): a slower beat, so the ring is slower and easy to hit
export const WINDOW = { good: 0.13, ok: 0.24 };   // seconds either side of a beat (widened while learning)
export const SPEED = {
  cruise: 1.3,               // the cow ambles at least this fast on its own
  perCombo: 0.17,             // each good tap in a row adds this to the top speed
  maxCombo: 9,
  boost: 0.85,                // the grass bonus
  push: 0.14,                 // a good tap kicks the speed up by this much at once
  ai: 2.62,                   // the village kids' cruising speed (m/s) at skill 1
  mud: 0.58,                  // everyone's speed in the mud, times
  tired: 0.45,                // a puffing cow's top speed, times
};
export const LAT_RATE = 2.4;        // lane units per second the cow can slide sideways
export const MASH_GAP = BEAT * 0.55;   // taps closer than this are mashing
export const KIDS = ['Kenta', 'Yui', 'Daichi'];

// ---------------------------------------------------------------------------------------------------- the levels: a race day
// A round is a small race day of several heats (the first try: one practice lap). Each heat runs on a course of its own:
//   mud      the sticky patch is there (the gentle first heat of Easy has none)
//   pick     fresh grass lies in only this many lanes at each of the two spots (0: in every lane): steer for it
//   puddles  rows of puddles (two lanes each): a puddle slows a cow for a moment; Mika can steer round, the kids hold their lane
//   surge    the kids sprint for the ribbon over the last SURGE_FROM metres (this much faster)
//   bias     the kids' skill, a little up for a final
export const COURSE = {
  plain: { mud: false, pick: 0, puddles: 0, surge: 0, bias: 0 },
  classic: { mud: true, pick: 0, puddles: 0, surge: 0, bias: 0 },
  final: { mud: true, pick: 2, puddles: 0, surge: 0, bias: 0.02 },
  champions: { mud: true, pick: 2, puddles: 0, surge: 0, bias: 0.035 },
  surge: { mud: true, pick: 2, puddles: 0, surge: 0.07, bias: 0.015 },
  puddles: { mud: true, pick: 2, puddles: 3, surge: 0.07, bias: 0.03 },
  grand: { mud: true, pick: 2, puddles: 4, surge: 0.1, bias: 0.04 },
};
export const PUDDLE_S = [7, 17, 33, 46];      // where the rows of puddles lie (a course uses the last `puddles` of them)
export const PUDDLE = { half: 0.8, time: 1.1, slow: 0.6 };   // metres either side of its middle, seconds of splashing, speed times
export const SURGE_FROM = 14;                 // metres before the ribbon

/**
 * The race day of a level: { heats: [{ course, assist, practice }], window (the beat window, times) }.
 * Easy: a warm-up without mud, then the classic race, with a wide beat window and slower rivals. Normal: the classic race, a
 * final where the grass lies in two lanes only, and a champions' final. Difficult: rivals that sprint for the ribbon, rows of
 * puddles to steer round, a tighter beat window. The guided first try is Easy's day with its warm-up as a slow practice lap
 * (practice: the slower beat and the widest window).
 */
export function meetPlan(level = 'normal', first = false) {
  const day = (courses, assist, window) => ({ heats: courses.map(course => ({ course, assist, practice: false })), window });
  if (first) { const p = day(['plain', 'classic'], 0.6, 1); p.heats[0].assist = 1; p.heats[0].practice = true; return p; }
  if (level === 'easy') return day(['plain', 'classic'], 0.6, 1);
  if (level === 'hard') return day(['surge', 'puddles', 'grand'], 0, 0.82);
  return day(['classic', 'final', 'champions'], 0, 1);
}
/** The most a race day can score (every heat won at the best time bonus). */
export const meetMax = plan => plan.heats.length * (80 + 25);
/** Points a racer takes from a heat for the day's standings (the podium): by place. */
export const PLACE_POINTS = [80, 50, 30, 10];

/** Stars of ONE race: 1st place is always three, by score (see raceScore). A level's race day has its own (content/tricks.js). */
export const STARS = [30, 60, 80];

/** The score of a finished race: place points plus a bonus for a quick time. place 1..4, time in seconds (null: did not finish). */
export function raceScore(place, time) {
  const pts = [80, 50, 30, 10][Math.max(0, Math.min(3, place - 1))];
  const bonus = time == null ? 0 : Math.max(0, Math.min(25, Math.round((TRACK.timeout * 0.6 - time) * 1.1)));
  return pts + bonus;
}

export const inMud = s => s >= TRACK.mud[0] && s <= TRACK.mud[1];

function newRacer(id, lane, extra = {}) {
  return {
    id, lane, s: 0, lat: lane, latV: 0, v: 0, puff: 0, tiredT: 0, boostT: 0, combo: 0, lastTap: -9, lastPush: -9,
    grass: [false, false], finished: null, place: 0, stride: 0, mud: false, splashT: 0, puddle: -1, ...extra,
  };
}

/**
 * A new race. opts: { seed, playerLane, assist (0..1: a first try, Easy), skillBias (test knob) }.
 * racers[0] is Mika's cow; racers[1..3] are Kenta, Yui and Daichi's.
 */
export function newRace(opts = {}) {
  const { seed = 1, assist = 0 } = opts, R = rng((seed * 2654435761) >>> 0 || 1);
  const lanes = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
  const playerLane = opts.playerLane ?? lanes[0];
  const others = lanes.filter(l => l !== playerLane);
  const C = COURSE[opts.course] || COURSE.classic, wm = opts.window || 1;
  const race = {
    t: 0, seed, assist, over: false, finishedCount: 0, order: [], course: layCourse(C, seed),
    beat: opts.beat || BEAT,          // seconds between footfalls in this race (BEAT, or PRACTICE_BEAT on the first try)
    window: { good: WINDOW.good * (1 + assist * 0.55) * wm, ok: WINDOW.ok * (1 + assist * 0.5) * wm },
    racers: [newRacer('mika', playerLane, { player: true })],
    last: null,           // the last tap { t, grade }
    events: [],           // things the view may react to this frame: { type: 'good'|'ok'|'mash'|'miss'|'grass'|'mud'|'tired'|'finish', who }
  };
  KIDS.forEach((name, i) => {
    // each kid has a little skill and a wobble of their own; the seeded draw keeps a race replayable
    const skill = 0.95 + R() * 0.11 + (opts.skillBias || 0) + C.bias;
    race.racers.push(newRacer(name, others[i], { ai: true, name, skill, wob: R() * 6.28, wobRate: 0.5 + R() * 0.5 }));
  });
  return race;
}

/**
 * Lay a course out (seeded, with a random source of its own, so the cows' own draw stays what it was): which lanes have
 * grass at each of the two spots, and where the puddles lie. Every row of puddles leaves two lanes dry.
 */
function layCourse(C, seed) {
  const R = rng((seed * 40503 + 977) >>> 0 || 1);
  const pickLanes = n => {
    const on = [false, false, false, false];
    if (!n || n >= TRACK.lanes) return on.fill(true);
    const ls = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ls[i], ls[j]] = [ls[j], ls[i]]; }
    for (let i = 0; i < n; i++) on[ls[i]] = true;
    return on;
  };
  const grass = [pickLanes(C.pick), pickLanes(C.pick)];
  const puddles = [];
  for (const s of PUDDLE_S.slice(PUDDLE_S.length - C.puddles)) { const on = pickLanes(2); for (let l = 0; l < TRACK.lanes; l++) if (on[l]) puddles.push({ s, lane: l }); }
  return { mud: C.mud, grass, puddles, surge: C.surge };
}

/** Where the cow's next footfall is, in seconds: the nearest beat and how far off `t` is from it. */
export function beatOffset(t, beat = BEAT) {
  const k = Math.round(t / beat);
  return t - k * beat;
}

/**
 * What a graded tap should be called on screen: 'perfect' (right on the footfall), 'good', 'okEarly' / 'okLate' (a little
 * off, it still pushes), 'early' / 'late' (a miss: before or after the nearest footfall), or 'mash'. t is the race time of the tap.
 */
export function tapKind(race, t, grade) {
  if (grade === 'mash') return 'mash';
  const off = beatOffset(t, race.beat || BEAT);
  if (grade === 'good') return Math.abs(off) <= race.window.good * 0.5 ? 'perfect' : 'good';
  if (grade === 'ok') return off < 0 ? 'okEarly' : 'okLate';
  return off < 0 ? 'early' : 'late';
}

/** Seconds until the next footfall at race time t (the ring closes then), and how far through the beat we are (0..1). */
export function beatPhase(t, beat = BEAT) {
  const into = ((t % beat) + beat) % beat;
  return { toBeat: beat - into, f: into / beat };
}

/** Grade a tap at race time t: 'good' | 'ok' | 'miss'. */
export function gradeTap(race, t) {
  const d = Math.abs(beatOffset(t, race.beat || BEAT));
  return d <= race.window.good ? 'good' : d <= race.window.ok ? 'ok' : 'miss';
}

function topSpeed(r, race) {
  let v = SPEED.cruise + Math.min(r.combo, SPEED.maxCombo) * SPEED.perCombo;
  if (r.boostT > 0) v += SPEED.boost;
  if (r.tiredT > 0) v *= SPEED.tired;
  if (r.mud) v *= SPEED.mud;
  if (r.splashT > 0) v *= PUDDLE.slow;
  return v;
}

/** One tap of "Giddy-up!" from Mika at the current race time. */
export function tap(race) {
  const r = race.racers[0];
  if (race.over || r.finished != null) return null;
  const t = race.t;
  if (t - r.lastTap < (race.beat || BEAT) * 0.55) {
    // mashing: no push, and the cow starts to puff
    r.lastTap = t;
    r.puff = Math.min(1.5, r.puff + 0.34);
    r.combo = Math.max(0, r.combo - 1);
    race.events.push({ type: 'mash', who: 0 });
    if (r.puff >= 1 && r.tiredT <= 0) { r.tiredT = 2.2; race.events.push({ type: 'tired', who: 0 }); }
    race.last = { t, grade: 'mash' };
    return 'mash';
  }
  r.lastTap = t;
  const grade = gradeTap(race, t);
  race.last = { t, grade };
  if (grade === 'good') { r.combo = Math.min(SPEED.maxCombo, r.combo + 1); r.v += SPEED.push; r.lastPush = t; }
  else if (grade === 'ok') { r.combo = Math.max(r.combo, 1); r.v += SPEED.push * 0.4; r.lastPush = t; }
  else if (!r.mud) r.combo = Math.max(0, r.combo - 2);     // a miss costs a little; in the mud nothing: ease off, keep the beat later
  race.events.push({ type: grade, who: 0 });
  return grade;
}

function advance(r, race, dt, steer) {
  // sideways: Mika steers; the kids hold their lane
  if (steer !== undefined) {
    const want = Math.max(-1, Math.min(1, steer)) * LAT_RATE;
    r.latV += (want - r.latV) * Math.min(1, dt * 9);
    r.lat = Math.max(0, Math.min(TRACK.lanes - 1, r.lat + r.latV * dt));
  } else r.lat += (r.lane - r.lat) * Math.min(1, dt * 4);
  const wasMud = r.mud;
  r.mud = race.course.mud && inMud(r.s);
  if (r.mud && !wasMud) race.events.push({ type: 'mud', who: race.racers.indexOf(r) });
  // grass bundles: eaten in passing when the cow is in (or next to) that lane
  for (let i = 0; i < 2; i++) {
    if (!r.grass[i] && r.s >= TRACK.grass[i] - 0.6 && r.s <= TRACK.grass[i] + 0.6 && Math.abs(r.lat - Math.round(r.lat)) < 0.4 && race.course.grass[i][Math.round(r.lat)]) {
      r.grass[i] = true; r.boostT = TRACK.grassBoost;
      race.events.push({ type: 'grass', who: race.racers.indexOf(r), i });
    }
  }
  // puddles: a splash slows the cow that runs through one (and breaks Mika's streak a little)
  const P = race.course.puddles;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (Math.abs(r.s - p.s) > PUDDLE.half || Math.abs(r.lat - p.lane) >= 0.42 || r.puddle === i) continue;
    r.puddle = i; r.splashT = PUDDLE.time;
    if (r.player) r.combo = Math.max(0, r.combo - 2);
    race.events.push({ type: 'puddle', who: race.racers.indexOf(r), i });
  }
  r.splashT = Math.max(0, r.splashT - dt);
  r.boostT = Math.max(0, r.boostT - dt);
  r.tiredT = Math.max(0, r.tiredT - dt);
  r.puff = Math.max(0, r.puff - dt * 0.3);
  r.s += r.v * dt;
  r.stride += r.v * dt;
}

/** Which lane the player's cow is closest to (grass is picked in the lane it grows in). */
export function laneOf(r) { return Math.round(r.lat); }

/**
 * Advance the whole race by dt. input: { steer: -1..1 (left/right across the lanes) }. Taps go through tap().
 * Everything is a plain number: nothing is allocated per frame except the occasional event.
 */
export function stepRace(race, dt, input = {}) {
  if (race.over) return;
  race.t += dt;
  const me = race.racers[0];
  for (let i = 0; i < race.racers.length; i++) {
    const r = race.racers[i];
    if (r.finished != null) { r.v *= Math.exp(-dt * 1.6); r.s += r.v * dt; continue; }
    if (r.player) {
      // the cow's own pace: slows to a walk when Mika stops asking, speeds toward the top speed she has earned
      let top = topSpeed(r, race);
      const bt = race.beat || BEAT;
      if (race.t - r.lastPush > bt * 2.6 && r.combo > 0) r.combo = Math.max(0, r.combo - 1), r.lastPush = race.t - bt * 1.4;
      const k = 1 - Math.exp(-dt * (top > r.v ? 1.6 : 2.4));
      r.v += (top - r.v) * k;
      r.lane = Math.round(r.lat);
      advance(r, race, dt, input.steer || 0);
    } else {
      // a kid: cruising speed with a wobble, the rubber band toward Mika, the mud, a grass burst
      r.wob += dt * r.wobRate;
      const band = Math.max(-0.07, Math.min(0.16, (me.s - r.s) * 0.016));
      let top = SPEED.ai * r.skill * (1 + Math.sin(r.wob) * 0.05 + band) * (1 - race.assist * 0.07);
      if (race.course.surge && r.s > TRACK.len - SURGE_FROM) top *= 1 + race.course.surge;      // the sprint for the ribbon
      if (r.boostT > 0) top += SPEED.boost * 0.8;
      if (r.mud) top *= SPEED.mud;
      if (r.splashT > 0) top *= PUDDLE.slow;
      r.v += (top - r.v) * (1 - Math.exp(-dt * 1.8));
      advance(r, race, dt, undefined);
    }
    if (r.s >= TRACK.len && r.finished == null) {
      r.finished = race.t;
      race.finishedCount++;
      r.place = race.finishedCount;
      race.order.push(i);
      race.events.push({ type: 'finish', who: i });
    }
  }
  // the race is over when Mika is across, or the clock runs out
  if (me.finished != null && race.t - me.finished > 1.2 || race.t > TRACK.timeout) finish(race);
}

/** Close the race: anyone not across is placed by how far they got. */
export function finish(race) {
  if (race.over) return;
  race.over = true;
  const rest = race.racers.map((r, i) => i).filter(i => race.racers[i].finished == null).sort((a, b) => race.racers[b].s - race.racers[a].s);
  for (const i of rest) { race.racers[i].place = ++race.finishedCount; race.order.push(i); }
}

/** Mika's place (1..4) once she has crossed, or her position right now. */
export function placeNow(race) {
  const me = race.racers[0];
  if (me.place) return me.place;
  let p = 1;
  for (const r of race.racers) if (r !== me && (r.finished != null || r.s > me.s)) p++;
  return p;
}

/** The result of a finished race: { place, time, score, stars, order }. */
export function result(race) {
  finish(race);
  const me = race.racers[0], score = raceScore(me.place, me.finished);
  return { place: me.place, time: me.finished, score, stars: STARS.filter(t => score >= t).length, order: race.order.map(i => race.racers[i].id) };
}

/**
 * Where a careful rider steers (tests, the QA autopilot): -1..1. Away from a puddle just ahead in her lane, else toward the
 * nearest lane with grass at the next spot (never one with a puddle on the way), else straight on.
 */
export function botSteer(race, look = 7) {
  const me = race.racers[0], C = race.course;
  let want = Math.round(me.lat), best = 1e9, g = -1;
  for (let i = 0; i < 2; i++) if (!me.grass[i] && TRACK.grass[i] > me.s && TRACK.grass[i] - me.s < look + 3) { g = i; break; }
  for (let l = 0; l < TRACK.lanes; l++) {
    let wet = false;
    for (const p of C.puddles) if (p.lane === l && p.s > me.s - PUDDLE.half && p.s - me.s < look) wet = true;
    if (wet) continue;
    const cost = Math.abs(l - me.lat) + (g >= 0 && !C.grass[g][l] ? 2.5 : 0);
    if (cost < best) { best = cost; want = l; }
  }
  const d = want - me.lat;
  return Math.abs(d) < 0.06 ? 0 : Math.max(-1, Math.min(1, d * 3));
}

/** A tiny scripted player for tests and the QA autopilot: taps on the beat (a little off by `jitter` s), steers for grass. */
export function botTaps(race, rand, { jitter = 0.03, mash = false, idle = false, lazy = 0 } = {}) {
  if (idle) return;
  const me = race.racers[0], t = race.t;
  if (mash) { if (t - me.lastTap >= 0.1) tap(race); return; }
  const bt = race.beat || BEAT;
  if (race.bot === undefined) race.bot = { next: bt + (rand() - 0.5) * 2 * jitter };
  while (race.bot.next <= t) {
    race.bot.next += bt;
    if (rand() < lazy) continue;
    // the tap lands `jitter` off the beat: replay it at its own moment by shifting the race clock for the grade only
    const real = race.t;
    race.t = Math.round(real / bt) * bt + (rand() - 0.5) * 2 * jitter;
    if (race.t - me.lastTap < bt * 0.55) race.t = real;
    tap(race);
    race.t = real;
  }
}

/** Run a whole race with a bot (Node tests). Returns the result and the run time. */
export function simulate(seed, botOpts = {}, raceOpts = {}) {
  const race = newRace({ seed, ...raceOpts }), R = rng(seed + 77);
  const dt = 1 / 60;
  let guard = 0;
  while (!race.over && guard++ < 60 * 90) {
    botTaps(race, R, botOpts);
    stepRace(race, dt, { steer: botOpts.steer ? botSteer(race) : 0 });
    race.events.length = 0;
  }
  return { race, ...result(race) };
}

/** A whole race day with a bot (Node tests, tuning): { score, places, times, plan }. */
export function simulateMeet(seed, level, botOpts = {}, first = false) {
  const plan = meetPlan(level, first), places = [], times = [];
  let score = 0;
  plan.heats.forEach((ht, h) => {
    const r = simulate(seed * 13 + h * 101, botOpts, { course: ht.course, assist: ht.assist, window: plan.window, beat: ht.practice ? PRACTICE_BEAT : undefined });
    score += r.score; places.push(r.place); times.push(r.time);
  });
  return { score, places, times, plan };
}
