// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's Time choice and night watchers (docs/SING-AND-PLAY.md "Time of day", "Watchers at night").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_CHOICES, bandOf, hourSpan, easeHour, SingTime, TIME_EASE, CLOCK_RATE, nightHint, timeIcon, currentTime, pickTime } from '../src/game/singplay/time-row.js';
import { NIGHT_WATCH, nightWatchers, ringSpots, walkInFrom, walkable, freeSpots } from '../src/game/singplay/night-watchers.js';
import { isShowNight } from '../src/game/perform/show-cues.js';
import { lightingAt } from '../src/world/seasons.js';
import { NIGHT_STAR, KOTONE } from '../src/content/troupe.js';

test('each time of day eases to an hour inside its own band; Night is the show\'s night and Sunset is not', () => {
  assert.deepEqual(TIME_CHOICES.map(c => c.id), ['morning', 'noon', 'sunset', 'night']);
  for (const c of TIME_CHOICES) { assert.equal(bandOf(c.hour), c.id); assert.ok(timeIcon(c.id).startsWith('<svg')); }
  const night = h => lightingAt('spring', h).night;
  assert.ok(isShowNight(night(21)) && !isShowNight(night(18)) && !isShowNight(night(12.5)) && !isShowNight(night(8)));
  assert.equal(bandOf(17.5), 'sunset');   // (Sing & Play starts at 17:30)
  assert.equal(bandOf(2), 'night'); assert.equal(bandOf(23.9), 'night'); assert.equal(bandOf(5.6), 'morning');
});

test('the ease takes the short way round the clock, smoothly, and ends on the hour', () => {
  assert.equal(hourSpan(17.5, 21), 3.5);
  assert.equal(hourSpan(21, 8), 11);       // forward through midnight
  assert.equal(hourSpan(12.5, 8), -4.5);   // back to the morning
  assert.equal(easeHour(21, 11, 0), 21);
  assert.equal(easeHour(21, 11, 1), 8);
  assert.ok(Math.abs(easeHour(10, 2, 0.5) - 11) < 1e-9);
  // no step bigger than the linear one's 1.5x (smoothstep): no pop
  let prev = 17.5, max = 0;
  for (let k = 1; k <= 120; k++) { const h = easeHour(17.5, 3.5, k / 120); max = Math.max(max, Math.abs(h - prev)); prev = h; }
  assert.ok(max <= 3.5 / 120 * 1.5 + 1e-9);
});

function fakeMode(hour = 17.5) {
  const g = { timeOverride: hour, time: { hour: 10 }, shownHour() { return typeof this.timeOverride === 'number' ? this.timeOverride : this.time.hour; } };
  const sp = { g, perf: null, singer: KOTONE, labels: 0, label() { this.labels++; } };
  sp.time = new SingTime(sp);
  return sp;
}

test('a tap eases over TIME_EASE s, shows the new band at once, then the clock runs slowly and holds during a song', () => {
  const sp = fakeMode(), t = sp.time, g = sp.g;
  assert.equal(currentTime(sp), 'sunset');
  assert.ok(pickTime(sp, 'night'));
  assert.equal(currentTime(sp), 'night');               // pressed at once
  t.update(TIME_EASE / 2); assert.ok(g.timeOverride > 17.5 && g.timeOverride < 21);
  t.update(TIME_EASE / 2 + 0.01); assert.equal(g.timeOverride, 21);
  assert.equal(g.time.hour, 10);                        // the story / Explore clock is never touched
  t.update(60); assert.ok(Math.abs(g.timeOverride - (21 + 60 * CLOCK_RATE)) < 1e-9);   // free: it runs on slowly
  sp.perf = {}; const held = g.timeOverride;
  t.update(60); assert.equal(g.timeOverride, held);     // a song: held
  assert.equal(pickTime(sp, 'noon'), false);            // and no change mid-song
  sp.perf = null; t.update(1); assert.ok(g.timeOverride > held);   // after Stop it runs on
});

test('a song started mid-ease jumps to the hour it was easing to (the show decides its look then)', () => {
  const sp = fakeMode(12.5), t = sp.time;
  pickTime(sp, 'night'); t.update(0.3);
  t.settle(); assert.equal(sp.g.timeOverride, 21); assert.equal(currentTime(sp), 'night');
});

test('the Night Star hint: only for her, only when the time is not Night', () => {
  assert.equal(nightHint(NIGHT_STAR, 'sunset'), true);
  assert.equal(nightHint(NIGHT_STAR, 'night'), false);
  assert.equal(nightHint(KOTONE, 'noon'), false);
  const sp = fakeMode(12.5); sp.singer = NIGHT_STAR;
  assert.match(sp.time.hint(), /Stella/);
  sp.perf = {}; assert.equal(sp.time.hint(), '');
});

test('night watchers: 6 on PC, fewer on phones, fewest with the group of 8 on Low; the half ring stays in front', () => {
  assert.equal(nightWatchers({ tier: 'high', group: 8 }), NIGHT_WATCH.other);
  assert.ok(nightWatchers({ tier: 'low', group: 4 }) < NIGHT_WATCH.other);
  assert.ok(nightWatchers({ tier: 'low', group: 8 }) <= nightWatchers({ tier: 'low', group: 1 }));
  const s = ringSpots(6, { cx: 0, cz: 0, ring: 4.2, spread: .55, facing: 0 });
  assert.equal(s.length, 6);
  for (const p of s) { assert.ok(Math.abs(Math.hypot(p.x, p.z) - 4.2) < 1e-9); assert.ok(Math.abs(p.a) <= NIGHT_WATCH.arc / 2 + 1e-9); }
});

test('villagers find room behind or in front of something standing on the ring, never on top of one another', () => {
  const frame = { cx: 0, cz: 0, ring: 7.5, spread: .38, facing: 0 };
  const open = { heightAt: () => 1, waterY: 0, solid: () => false };
  assert.equal(freeSpots(6, frame, open).length, 6);
  // a platform edge along the ring (6.8..8.2 m out): they stand on the row 1.5 m farther out or 1.2 m nearer
  const edge = { ...open, solid: (x, z, r) => Math.abs(Math.hypot(x, z) - 7.5) < 0.7 + r };
  const s = freeSpots(4, frame, edge);
  assert.equal(s.length, 4);
  for (const p of s) assert.ok(Math.abs(Math.hypot(p.x, p.z) - 7.5) > 1);
  for (const a of s) for (const b of s) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.2);
  // the town's own people keep their places: nobody is put within 1.2 m of them
  const taken = ringSpots(2, frame);
  for (const p of freeSpots(3, frame, open, taken)) for (const t of taken) assert.ok(Math.hypot(p.x - t.x, p.z - t.z) >= 1.2);
});

test('a watcher walks in over dry, clear ground, or stands there from the start', () => {
  const env = { heightAt: () => 1, waterY: 0, solid: () => false };
  const frame = { cx: 0, cz: 0, ring: 7.5, facing: 0 }, spot = ringSpots(5, { ...frame, spread: .38 })[4];
  const from = walkInFrom(spot, frame, env);
  assert.ok(from && Math.hypot(from.x - spot.x, from.z - spot.z) > 3);
  assert.ok(walkable(from, spot, env));
  const wet = { ...env, heightAt: (x) => (x > 2 ? -1 : 1) };   // a river on the right
  const right = walkInFrom(spot, frame, wet);
  assert.equal(right, null);
  const wall = { ...env, solid: (x, z) => Math.hypot(x - spot.x, z - spot.z) > 1 };   // walls all round the spot
  assert.equal(walkInFrom(spot, frame, wall), null);
});
