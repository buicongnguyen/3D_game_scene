// Weather moments (src/game/moments-rules.js): the table, the gates, the scheduler, the sky placement, the paths,
// the bell, the lines and the switch. Pure: seeded random numbers, injected time steps. docs/WEATHER-MOMENTS.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOMENTS, IDS, SEASONS, NAMES, LINES, linesFor, variantOf, durOf, inWindow, eligible, readFlags, startBlocked, mustStop, START_FLAGS, STOP_FLAGS,
  envelope, showerLevels, gustLevel, sparkleLevels, rainbowAzimuth, rainbowDistance, rainbowPlan, sunElevation, viewBand, skeinPlan, vSlot,
  swallowPoint, bellReaction, momentsWanted, Scheduler, mulberry32, FIRST, GAP, WORLD_BOX, TOWER, SKY_BAND, RAINBOW_APEX, RAINBOW_HALF,
  rainbowAt, RAINBOW_DRAW, vStep, skyCap, crowPlan, crowPoint, CROWS, SWALLOW_LOOPS, swallowLoop,
} from '../src/game/moments-rules.js';
import { momentsOptionOn } from '../src/ui/moments-option.js';
import { sunDirection } from '../src/world/seasons.js';
import { WORLD } from '../src/world/layout.js';

const DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** A free afternoon in the valley: every flag clear, every lamp lit, Mika by the bell tower. */
const free = (o = {}) => {
  const c = { season: 'spring', hour: 10, night: 0, chapter: 2, frozen: false, lamps: { mill: true, orchard: true }, towerDist: 100, low: false, level: 0 };
  for (const k of new Set([...START_FLAGS, ...STOP_FLAGS])) c[k] = false;
  return Object.assign(c, o);
};

test('the table: each moment only in its own seasons, hours and light, and only once the story allows', () => {
  const at = (id, o) => eligible(MOMENTS[id], free(o));
  for (const id of IDS) {
    const def = MOMENTS[id];
    for (const season of SEASONS) {
      const v = variantOf(id, season), w = def.variants?.[v] || def, from = w.from ?? def.from, to = w.to ?? def.to;
      const mid = (from + to) / 2;
      assert.equal(at(id, { season, hour: mid }), def.seasons.includes(season), `${id} in ${season} at ${mid}`);
      if (!def.seasons.includes(season)) continue;
      assert.equal(at(id, { season, hour: from - 0.05 }), false, `${id} not before ${from}`);
      assert.equal(at(id, { season, hour: to + 0.05 }), false, `${id} not after ${to}`);
      assert.equal(at(id, { season, hour: from }), true, `${id} from ${from}`);
      if (def.night != null) {
        assert.equal(at(id, { season, hour: mid, night: def.night - 0.01 }), true);
        assert.equal(at(id, { season, hour: mid, night: def.night }), false, `${id} not at night ${def.night}`);
      }
      assert.equal(at(id, { season, hour: mid, chapter: 0 }), false, `${id}: never in the prologue`);
      assert.equal(at(id, { season, hour: mid, frozen: true }), false, `${id}: never while the town is frozen`);
    }
  }
  assert.equal(at('shower', { lamps: { mill: false, orchard: true } }), false, 'the shower waits for the Mill Lamp (the ch1 rainbow comes first)');
  assert.equal(at('bell', { hour: 17, lamps: { mill: true, orchard: false } }), false, 'the bell waits for the Orchard Lamp');
  assert.equal(at('bell', { hour: 17, towerDist: 261 }), false, 'the bell is heard only near the tower');
  assert.equal(at('bell', { hour: 17, towerDist: 259 }), true);
  assert.equal(variantOf('birds', 'autumn'), 'geese'); assert.equal(variantOf('birds', 'winter'), 'geese');
  assert.equal(variantOf('birds', 'spring'), 'swallows'); assert.equal(variantOf('birds', 'summer'), 'swallows');
  assert.equal(at('birds', { season: 'spring', hour: 18.2 }), false, 'swallows settle by 18:00');
  assert.equal(at('birds', { season: 'autumn', hour: 18.2 }), true, 'geese fly on till 18:30');
  assert.equal(durOf('birds', 'geese'), 40); assert.equal(durOf('birds', 'swallows'), 14); assert.equal(durOf('shower'), 36);
  assert.ok(inWindow('sparkle', '', free({ season: 'winter', hour: 9 })) && !inWindow('sparkle', '', free({ season: 'winter', hour: 13 })));
  // a running flock leaves its window when the shown season changes under it (Settings > Season)
  assert.equal(inWindow('birds', 'geese', free({ season: 'spring' })), false, 'geese stop gently in spring');
  assert.equal(inWindow('birds', 'swallows', free({ season: 'autumn' })), false, 'swallows stop gently in autumn');
  assert.equal(inWindow('birds', 'geese', free({ season: 'winter' })), true);
  assert.equal(inWindow('birds', 'swallows', free({ season: 'summer' })), true);
});

test('the gates: a free state passes; each blocker alone stops a start with its own reason; some only block starts', () => {
  assert.equal(startBlocked(free()), '');
  assert.equal(mustStop(free()), '');
  for (const k of START_FLAGS) assert.equal(startBlocked(free({ [k]: true })), k, `${k} blocks a start`);
  for (const k of STOP_FLAGS) assert.equal(mustStop(free({ [k]: true })), k, `${k} stops a running moment`);
  for (const k of ['dialogue', 'busy', 'overlay', 'swimming', 'riding', 'mounted', 'fade', 'prologue', 'frozen']) {
    assert.ok(startBlocked(free({ [k]: true })), `${k} blocks a start`);
    assert.equal(mustStop(free({ [k]: true })), '', `${k} does not cut a running moment`);
  }
  assert.equal(startBlocked(free({ low: true, level: 1 })), '');
  assert.equal(startBlocked(free({ low: true, level: 2 })), 'slow', 'Low, two steps down: nothing starts');
  assert.equal(mustStop(free({ low: true, level: 2 })), '', '...but a running one goes on');
  assert.equal(mustStop(free({ low: true, level: 3 })), 'slow', 'three steps down: it stops');
  assert.equal(startBlocked(free({ low: false, level: 0 })), '');
});

test('readFlags reads a game into the reused object, guarded everywhere', () => {
  const g = {
    director: { quest: { state: { chapter: 3, lamps: { mill: true } } }, townFrozen: () => false, scenes: {}, minigameMenu: {} },
    player: { pos: { x: TOWER.x + 30, y: TOWER.y, z: TOWER.z + 40 } }, renderer: { qualityName: 'low', appliedLevel: 1 },
    ui: {}, follow: {}, interiors: { active: null }, shownSeason: 'autumn', shownHour: () => 16.7, night: 0.05, time: { season: 'spring' },
  };
  const f = {}, out = readFlags(g, f);
  assert.equal(out, f, 'fills the object it is given');
  assert.equal(startBlocked(f), '');
  assert.equal(f.season, 'autumn'); assert.equal(f.hour, 16.7); assert.equal(f.chapter, 3); assert.equal(f.level, 1);
  assert.ok(Math.abs(f.towerDist - 50) < 1e-9);
  g.interiors.active = 'cottage'; readFlags(g, f);
  assert.equal(startBlocked(f), 'indoors'); assert.equal(mustStop(f), 'indoors');
  g.interiors.active = null; g.ui.dialogueOpen = true; readFlags(g, f);
  assert.equal(startBlocked(f), 'dialogue'); assert.equal(mustStop(f), '');
  assert.equal(startBlocked(readFlags({}, {})), 'noQuest', 'no game at all: nothing');
  const doc = { body: { classList: { contains: c => c === 'cinema' } }, getElementById: () => null };
  g.ui.dialogueOpen = false; readFlags(g, f, doc);
  assert.equal(startBlocked(f), 'cinema');
});

/** Thirty simulated minutes at dt 0.1: starts the scheduler asks for, each running its full length. */
function simulate(seed, { seconds = 1800, ctx = {}, blockedAt = () => false } = {}) {
  const S = new Scheduler(seed), log = [];
  let running = '', until = 0;
  for (let i = 0; i < seconds * 10; i++) {
    const t = i / 10, c = free({ ...ctx, busy: !running && blockedAt(t) });
    const r = S.tick(0.1, c);
    if (running) {
      assert.ok(r !== 'stop-fast', 'nothing stops a moment in a free valley');
      if (t >= until || r === 'stop') { S.ended(running); running = ''; }
    } else if (r) {
      const v = variantOf(r, c.season);
      S.started(r, v); running = r; until = t + durOf(r, v);
      log.push({ id: r, v, t });
    }
  }
  return log;
}

test('the scheduler: first at 45-75 s, gaps after each, cooldowns and per-session counts hold, seeded, blocked time adds nothing', () => {
  for (const seed of [1, 2, 3, 7, 42, 1234]) {
    const log = simulate(seed);
    assert.ok(log.length >= 5, `seed ${seed}: ${log.length} moments in 30 min`);
    assert.ok(log[0].t >= FIRST.base - 0.15 && log[0].t <= FIRST.base + FIRST.spread + 0.15, `seed ${seed}: first at ${log[0].t}`);
    for (let k = 1; k < log.length; k++) {
      const a = log[k - 1], b = log[k];
      assert.ok(b.t - a.t >= durOf(a.id, a.v) + GAP.base - 0.25, `seed ${seed}: ${a.id} at ${a.t} then ${b.id} at ${b.t}`);
    }
    for (const id of IDS) {
      const mine = log.filter(e => e.id === id);
      for (let k = 1; k < mine.length; k++) assert.ok(mine[k].t - mine[k - 1].t >= durOf(id, mine[k - 1].v) + MOMENTS[id].cooldown - 0.25, `seed ${seed}: ${id} cooldown`);
      if (Number.isFinite(MOMENTS[id].perSession)) assert.ok(mine.length <= MOMENTS[id].perSession, `seed ${seed}: ${mine.length} x ${id}`);
    }
    assert.ok(log.every(e => ['gust', 'birds', 'shower'].includes(e.id)), 'spring at 10:00: breezes, swallows and showers only');
    assert.ok(log.filter(e => e.id === 'shower').length <= 2);
    assert.deepEqual(simulate(seed), log, 'the same seed, the same moments');
  }
  const a = JSON.stringify(simulate(1)), b = JSON.stringify(simulate(2));
  assert.notEqual(a, b, 'another seed, other moments');
  // 100 s of blocked time at the start moves everything by exactly 100 s
  const base = simulate(5, { seconds: 600 }), held = simulate(5, { seconds: 700, blockedAt: t => t < 100 });
  assert.ok(Math.abs(held[0].t - base[0].t - 100) < 0.25, `blocked: ${held[0].t} vs ${base[0].t}`);
  assert.equal(held[0].id, base[0].id);
});

test('the scheduler: never the same twice in a row while another is ready; stops fast on a blocker and gently out of its window', () => {
  const S = new Scheduler(9), c = free();
  S.last = 'gust';
  for (let i = 0; i < 200; i++) assert.notEqual(S.pick(c, mulberry32(i)), 'gust');
  const T = new Scheduler(3);
  T.started('shower', '');
  assert.equal(T.tick(0.1, free({ hour: 12 })), '');
  assert.equal(T.tick(0.1, free({ hour: 12, dialogue: true })), '', 'a dialogue lets it run');
  assert.equal(T.tick(0.1, free({ hour: 12, scene: true })), 'stop-fast', 'a scene cuts it');
  assert.equal(T.tick(0.1, free({ hour: 18.35 })), 'stop', 'drifting past 18.3 ends it gently');
  assert.equal(T.tick(0.1, free({ hour: 12, season: 'winter' })), 'stop', 'a season change too');
  T.ended('shower');
  assert.ok(T.state().cooldowns.shower >= MOMENTS.shower.cooldown - 1e-9 && T.state().wait >= GAP.base);
  const U = new Scheduler(4);
  U.advance(200);
  assert.ok(U.state().wait < 0 && U.state().clock === 200, 'advance skips eligible time (QA)');
});

test('rainbowPlan: opposite the sun within a 60° cone, a low wide arch inside the frame, pulled in before hills', () => {
  const flat = () => 0, cam = { x: 0, y: 4, z: 0 };
  const sun = sunDirection(8, 'spring'), anti = Math.atan2(-sun.x, -sun.z);
  for (let i = 0; i < 72; i++) {
    const yaw = -Math.PI + i * 5 * DEG, az = rainbowAzimuth(sun, yaw);
    assert.ok(Math.abs(wrap(az - anti)) <= 60 * DEG + 1e-9, `yaw ${i * 5 - 180}: ${az}`);
    if (Math.abs(wrap(yaw - anti)) < 59 * DEG) assert.ok(Math.abs(wrap(az - yaw)) < 1e-9, 'inside the cone: straight ahead');
    // away from the sun: the arch's heading never points at it
    assert.ok(Math.sin(az) * sun.x + Math.cos(az) * sun.z < 0, 'on the side away from the sun');
  }
  // across ±π
  const s2 = { x: 0, y: 0.5, z: 1 };   // the sun due south (+z): opposite is yaw ±π
  assert.ok(Math.abs(wrap(rainbowAzimuth(s2, -Math.PI + 0.1) - (-Math.PI + 0.1))) < 1e-9);
  assert.ok(Math.abs(wrap(rainbowAzimuth(s2, Math.PI - 0.1) - (Math.PI - 0.1))) < 1e-9);
  const p = rainbowPlan(sun, cam, anti, flat, {});
  assert.ok(p.ok, `spring 8:00, sun ${sunElevation(sun).toFixed(1)}°: an arc`);
  assert.equal(p.D, 200);
  const apex = Math.atan2(p.y + p.sy - cam.y, p.D) / DEG, half = Math.atan2(p.sx, p.D) / DEG;
  assert.ok(Math.abs(apex - RAINBOW_APEX) <= 0.5 && apex <= SKY_BAND.hi + 0.5, `apex ${apex.toFixed(2)}° above the eye (under the HUD)`);
  assert.ok(Math.abs(half - RAINBOW_HALF) < 1e-6, `half-width ${half}`);
  // drawn 40 m out at the same angles, wherever the camera has walked to since
  for (const c2 of [cam, { x: 30, y: 9, z: -12 }]) {
    const at = rainbowAt(c2, p, {});
    assert.ok(Math.abs(Math.hypot(at.x - c2.x, at.z - c2.z) - RAINBOW_DRAW) < 1e-9);
    assert.ok(Math.abs(Math.atan2(at.x - c2.x, at.z - c2.z) - p.az) < 1e-9, 'its heading kept');
    assert.ok(Math.abs(Math.atan2(at.y + at.sy - c2.y, RAINBOW_DRAW) / DEG - RAINBOW_APEX) < 1e-6, 'apex angle kept');
    assert.ok(Math.abs(Math.atan2(c2.y - at.y, RAINBOW_DRAW) / DEG - p.foot) < 1e-6, 'feet angle kept');
    assert.ok(Math.abs(Math.atan2(at.sx, RAINBOW_DRAW) / DEG - RAINBOW_HALF) < 1e-6, 'width kept');
  }
  // a hill rising at 120 m pulls it in; a hill at 60 m never pulls it under 90
  const hill = at => (x, z) => (Math.hypot(x - cam.x, z - cam.z) >= at - 1 ? 30 : 0);
  const near = rainbowPlan(sun, cam, anti, hill(120), {});
  assert.ok(near.D < 200 && near.D === 110, `hill at 120 m: D ${near.D}`);
  assert.equal(rainbowDistance(cam, anti, hill(60)), 90);
  // no arc with the sun high (summer noon, 64°), nor below the horizon
  assert.equal(rainbowPlan(sunDirection(12.3, 'summer'), cam, 0, flat, {}).ok, false);
  assert.equal(rainbowPlan({ x: 0, y: Math.sin(49 * DEG), z: Math.cos(49 * DEG) }, cam, 0, flat, {}).ok, false);
  assert.equal(rainbowPlan({ x: 0, y: Math.sin(47 * DEG), z: Math.cos(47 * DEG) }, cam, 0, flat, {}).ok, true);
  // near the valley's edge the centre stays inside WORLD (with a margin)
  assert.deepEqual(WORLD_BOX, WORLD);
  for (const [x, z] of [[190, 0], [-195, 10], [0, 180], [10, -210]]) {
    for (let k = 0; k < 8; k++) {
      const q = rainbowPlan(sun, { x, y: 4, z }, k * Math.PI / 4, flat, {});
      assert.ok(q.x >= WORLD.minX + 20 - 1e-6 && q.x <= WORLD.maxX - 20 + 1e-6 && q.z >= WORLD.minZ + 20 - 1e-6 && q.z <= WORLD.maxZ - 20 + 1e-6, `centre ${q.x},${q.z}`);
    }
  }
});

test('levels: 0 at both ends, 1 in the middle, continuous, written into the object passed', () => {
  const near = (a, b) => Math.abs(a - b) < 0.02;
  for (const [f, dur, mid] of [[t => envelope(t, 40, 2, 3), 40, 20], [gustLevel, 2.5, 1.25], [t => showerLevels(t).cover, 28, 12],
    [t => showerLevels(t).drops, 22, 12], [t => showerLevels(t).arc, 36, 25], [t => sparkleLevels(t).rate, 20, 10]]) {
    assert.equal(f(0), 0); assert.equal(f(dur), 0); assert.equal(f(dur + 5), 0);
    assert.ok(near(f(mid), 1), `middle ${f(mid)}`);
    for (let t = 0; t < dur; t += 0.01) assert.ok(Math.abs(f(t + 0.01) - f(t)) < 0.05, `continuous at ${t}`);
  }
  const o = {};
  assert.equal(showerLevels(16, o), o); assert.equal(sparkleLevels(5, o), o);
  assert.ok(showerLevels(13.9).reveal === 0 && showerLevels(17.3).reveal === 1.2, 'the arch draws itself over 14-17.2 s');
});

test('paths: the skein stays in a portrait view, the V is symmetric, swallows loop close by', () => {
  const cam = { x: 10, y: 6, z: -20 };
  for (let s = 1; s <= 40; s++) {
    const rng = mulberry32(s), yaw = (s * 0.7) % (2 * Math.PI) - Math.PI, P = skeinPlan(cam, yaw, rng, {});
    assert.ok(P.passD >= 55 && P.passD <= 85, `pass at ${P.passD}`);
    assert.ok(P.elev >= SKY_BAND.lo && P.elev <= SKY_BAND.hi, `${P.elev}° above the eye at the pass`);
    const off = Math.abs(wrap(Math.atan2(P.hx, P.hz) - yaw)) / DEG;
    assert.ok(off >= 8 && off <= 21, `a shallow crossing: ${off.toFixed(1)}° off the view`);
    // a portrait phone (390 x 844, fov 55, pitch 0.3): the leader is on screen for most of the 40 s, and under the
    // HUD (3.9° above the eye) for a good part of it
    const tanH = Math.tan(27.5 * DEG) * 390 / 844;
    let on = 0, clear = 0, n = 0;
    for (let t = 0; t <= 40; t += 0.5, n++) {
      const x = P.x0 + P.hx * P.speed * t, z = P.z0 + P.hz * P.speed * t, dx = x - cam.x, dz = z - cam.z;
      const ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw), across = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
      const up = Math.atan2(P.y - cam.y, Math.hypot(dx, dz)) / DEG, inside = ahead > 0 && Math.abs(across / ahead) < tanH;
      if (inside && up < 27.5 - 17.2) on++;
      if (inside && up < 3.9) clear++;
    }
    assert.ok(on / n >= 0.6, `seed ${s}: on screen ${Math.round(on / n * 100)} % of the time`);
    assert.ok(clear / n >= 0.45, `seed ${s}: under the HUD ${Math.round(clear / n * 100)} % of the time`);
    const passX = P.x0 + P.hx * P.speed * P.passT, passZ = P.z0 + P.hz * P.speed * P.passT;
    assert.ok(Math.abs(Math.hypot(passX - cam.x, passZ - cam.z) - P.passD) < 0.5, 'at passT it passes the view');
  }
  // a ridge across the way: the path turns or rises, never behind the HUD
  const ridge = (x, z) => (z < -60 ? 25 : 0), P = skeinPlan(cam, Math.PI, mulberry32(3), {}, ridge);
  assert.ok(P.elev <= SKY_BAND.hi + 0.5 + 1e-6);
  const slots = Array.from({ length: 9 }, (_, i) => vSlot(i, {}));
  assert.deepEqual(slots[0], { back: 0, lat: 0 });
  for (let k = 1; k <= 4; k++) {
    assert.equal(slots[2 * k - 1].back, slots[2 * k].back); assert.equal(slots[2 * k - 1].lat, -slots[2 * k].lat);
    assert.ok(Math.abs(slots[2 * k].back - k * 2.4) < 1e-9 && Math.abs(Math.abs(slots[2 * k].lat) - k * 2) < 1e-9);
  }
  const c = { x: -40, y: 3, z: 20 }, o = {};
  for (let i = 0; i < 6; i++) for (let t = 0; t <= 10; t += 0.05) {
    swallowPoint(i, t, c, o, 1, 0.8);
    const r = Math.hypot(o.x - c.x, o.z - c.z), up = o.y - c.y;
    assert.ok(r >= 3 - 1e-9 && r <= 7 + 1e-9, `swallow ${i} at ${r.toFixed(2)} m`);
    assert.ok(up >= 2.5 - 0.8 - 1e-9 && up <= 5.3 + 1e-9, `swallow ${i} ${up.toFixed(2)} m up`);
  }
  const v = viewBand({ x: 0, y: 2, z: 0 }, Math.PI / 2, 100, 5, {});
  assert.ok(Math.abs(v.x - 100) < 1e-9 && Math.abs(v.z) < 1e-9 && Math.abs(v.y - 2 - 100 * Math.tan(5 * DEG)) < 1e-9);
});

test('under the HUD: every goose of the V, and the bell crows going home, stay in the sky band; a landscape skein comes from the left', () => {
  const cam = { x: 10, y: 6, z: -20 }, flat = () => 0;
  let worst = -Infinity;
  for (let s = 1; s <= 60; s++) {
    const yaw = (s * 0.7) % (2 * Math.PI) - Math.PI, P = skeinPlan(cam, yaw, mulberry32(s), {}, flat), slot = {};
    for (let t = 0; t <= 40; t += 0.5) {
      const lx = P.x0 + P.hx * P.speed * t, lz = P.z0 + P.hz * P.speed * t, step = vStep(P.y, cam.y, Math.hypot(lx - cam.x, lz - cam.z));
      assert.ok(step >= 0 && step <= 0.4);
      for (let i = 0; i < 9; i++) {
        vSlot(i, slot);
        const bx = lx - P.hx * slot.back + P.hz * slot.lat, bz = lz - P.hz * slot.back - P.hx * slot.lat;
        const by = Math.min(P.y + slot.back * step + 0.3, skyCap(cam, bx, bz));
        worst = Math.max(worst, Math.atan2(by - cam.y, Math.hypot(bx - cam.x, bz - cam.z)) / DEG);
      }
    }
  }
  assert.ok(worst <= SKY_BAND.hi + 1e-6, `the highest goose ${worst.toFixed(2)}° above the eye (the HUD starts at 3.9°)`);
  for (let s = 1; s <= 20; s++) assert.equal(skeinPlan(cam, 0.3, mulberry32(s), {}, flat, -1).side, -1, 'forced to come from the left');
  // the crows: on a portrait phone most of them are in the view all along, none above the band
  const port = Math.tan(27.5 * DEG) * 390 / 844, o = {};
  for (const from of [1, -1]) for (const yaw of [0, 2, -2.5]) {
    const P = crowPlan(cam, yaw, port, from, {});
    let on = 0, n = 0;
    for (let t = 0; t <= 8; t += 0.25) for (let i = 0; i < CROWS; i++, n++) {
      crowPoint(i, t, P, cam, o);
      const dx = o.x - cam.x, dz = o.z - cam.z, ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw), across = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
      if (ahead > 0 && Math.abs(across / ahead) < port) on++;
      const up = Math.atan2(o.y - cam.y, Math.hypot(dx, dz)) / DEG;
      assert.ok(up >= SKY_BAND.lo - 1e-6 && up <= SKY_BAND.hi + 1e-6, `crow ${i} ${up.toFixed(2)}° up`);
    }
    assert.ok(on / n >= 0.85, `crows from ${from}, yaw ${yaw}: in view ${Math.round(on / n * 100)} %`);
    // from the tower's side of the view (+1 = right), off to the other
    const a0 = (P.x0 - cam.x) * -Math.cos(yaw) + (P.z0 - cam.z) * Math.sin(yaw), a1 = (P.x1 - cam.x) * -Math.cos(yaw) + (P.z1 - cam.z) * Math.sin(yaw);
    assert.ok(Math.sign(a0) === from && Math.sign(a1) === -from);
  }
  // swallows: their loops are made once and read every frame
  for (let i = 0; i < 6; i++) assert.deepEqual(SWALLOW_LOOPS[i], swallowLoop(i));
});

test('the bell: at 17:00 with the bell ready, three tolls and every crow; otherwise a lift only every 45 s', () => {
  assert.deepEqual(bellReaction(17, 0, true), { tolls: 3, lift: 'all', moment: true });
  assert.deepEqual(bellReaction(17, 100, false), { tolls: 1, lift: 'takamori', moment: false });
  assert.deepEqual(bellReaction(9, 100, true), { tolls: 1, lift: 'takamori', moment: false });
  assert.deepEqual(bellReaction(14, 30, true), { tolls: 1, lift: '', moment: false });
});

test('lines: short, cosy, and only in the seasons they are true in', () => {
  const all = Object.values(LINES).flat();
  assert.equal(all.length, 16);
  for (const l of [...all, ...Object.values(NAMES)]) {
    assert.ok(l.length <= 58, `${l.length}: ${l}`);
    assert.ok(!/flood|storm|thunder|lightning|danger|drown|sad|cry|sunday|monday|sora/i.test(l), l);
  }
  for (const n of Object.values(NAMES)) assert.ok(n.length <= 40);
  for (const s of SEASONS) {
    assert.equal(linesFor('geese', s).length > 0, s === 'autumn' || s === 'winter', `geese in ${s}`);
    assert.equal(linesFor('swallows', s).length > 0, s === 'spring' || s === 'summer', `swallows in ${s}`);
    assert.equal(linesFor('sparkle', s).length > 0, s === 'winter');
    assert.equal(linesFor('shower', s).length > 0, s !== 'winter');
    assert.deepEqual(linesFor('gust', s), s === 'winter' ? LINES.gustWinter : LINES.gust, `gust lines in ${s}`);
  }
  assert.deepEqual(linesFor('bell', 'summer', { crows: true }), LINES.bellCrows);
  assert.deepEqual(linesFor('bell', 'winter', { crows: false }), LINES.bellHome, 'no crows to send home in winter');
});

test('the switch: ?moments=off never, =on always, a QA page only when asked, and a saved "off" is kept', () => {
  assert.equal(momentsWanted({}), true);
  assert.equal(momentsWanted({ param: 'off' }), false);
  assert.equal(momentsWanted({ param: 'on', qa: true, stored: false }), true);
  assert.equal(momentsWanted({ qa: true }), false, 'QA runs stay as they were');
  assert.equal(momentsWanted({ stored: false }), false);
  assert.equal(momentsWanted({ stored: true }), true);
  // the Settings box (and game.momentsOff) follow the URL over a saved choice
  assert.equal(momentsOptionOn({ param: 'on', stored: false }), true, '?moments=on wins over a saved "off"');
  assert.equal(momentsOptionOn({ param: 'off', stored: true }), false);
  assert.equal(momentsOptionOn({ stored: false }), false);
  assert.equal(momentsOptionOn({}), true);
});
