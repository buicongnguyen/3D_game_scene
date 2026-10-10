// Grandma's countryside tricks: data, places, rules and save records (content/tricks.js, game/tricks/*.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRICKS, TRICK, inHours, starsFor, trickOpen, recordRound, cleanTricks } from '../src/content/tricks.js';
import { placeProblems } from '../src/world/roads.js';
import { DIALOGUE, CAST } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';
import { freshState, migrate } from '../src/game/quest.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

test('every trick is well formed', () => {
  assert.deepEqual(TRICKS.map(t => t.id).sort(), ['beetles', 'dew', 'firefly', 'frogs', 'kite', 'river', 'roast', 'stars']);
  for (const t of TRICKS) {
    for (const k of ['name', 'where', 'when', 'howReal', 'why', 'safety', 'unit', 'icon', 'intro']) assert.equal(typeof t[k], 'string', `${t.id}.${k}`);
    assert.ok(t.icon.startsWith('trick-'), t.id);
    assert.ok(t.seasons.length && t.seasons.every(s => SEASONS.includes(s)), t.id);
    assert.equal(t.hours.length, 2);
    for (const h of t.hours) assert.ok(h >= 0 && h < 24, `${t.id} hour ${h}`);
    assert.equal(t.stars.length, 3);
    assert.ok(t.stars[0] > 0 && t.stars[0] < t.stars[1] && t.stars[1] < t.stars[2], `${t.id} star thresholds rise`);
    assert.ok(t.length >= 20 && t.length <= 120 && t.firstLength >= 20, t.id);
    assert.ok(CAST[t.teacher.classic] && t.teacher.grandma, t.id);
    // kid-friendly and short: two lines of how-to, one fun fact
    assert.ok(t.howReal.length <= 170 && t.why.length <= 160 && t.safety.length <= 90, `${t.id} texts are short`);
    assert.equal(TRICK[t.id], t);
  }
});

test('trick places are dry, flat ground (not in a paddy, the river or a building)', () => {
  for (const t of TRICKS) assert.deepEqual(placeProblems(t.place.x, t.place.z), [], `${t.id} at ${t.place.x}, ${t.place.z}`);
  // the firefly note lies on dry ground too (firefly.js: 7.5 m from the sign toward the village)
  const f = TRICK.firefly.place, a = Math.atan2(1, 2.2);
  assert.deepEqual(placeProblems(f.x + Math.cos(a) * 7.5, f.z + Math.sin(a) * 7.5), []);
});

test('each story has the teaching scenes, lines fit the dialogue box, speakers are cast', () => {
  for (const story of ['classic', 'grandma']) {
    useStory(story);
    for (const t of TRICKS) {
      const lines = DIALOGUE[t.intro];
      assert.ok(lines?.length, `${story}: ${t.intro}`);
      const teacher = t.teacher[story];
      assert.ok(lines.some(l => l[0] === teacher), `${story}: ${t.intro} is taught by ${teacher}`);
      for (const l of lines) { assert.ok(CAST[l[0]], `${t.intro}: ${l[0]}`); assert.ok(l[1].length <= 135, `${t.intro}: ${l[1]}`); }
    }
    for (const l of DIALOGUE.trick_firefly_note) assert.ok(l[1].length <= 135);
  }
  useStory('classic');
});

test('hours wrap past midnight', () => {
  assert.ok(inHours(21, [19.5, 4]));
  assert.ok(inHours(2, [19.5, 4]));
  assert.ok(inHours(19.5, [19.5, 4]));
  assert.ok(!inHours(4, [19.5, 4]));
  assert.ok(!inHours(12, [19.5, 4]));
  assert.ok(inHours(18, [17.5, 22.5]) && !inHours(23, [17.5, 22.5]) && !inHours(17, [17.5, 22.5]));
  assert.ok(inHours(24.5, [0, 1]) && inHours(-1, [22, 24]));
});

test('a trick opens in its season; a running clock must reach its hours; rain hides the stars', () => {
  const f = TRICK.firefly, s = TRICK.stars;
  assert.ok(trickOpen(f, { season: 'summer', hour: 10, frozen: true }));
  assert.ok(!trickOpen(f, { season: 'summer', hour: 10, frozen: false }));
  assert.ok(trickOpen(f, { season: 'summer', hour: 22, frozen: false }));
  assert.ok(!trickOpen(f, { season: 'autumn', hour: 22, frozen: true }));
  for (const season of SEASONS) assert.ok(trickOpen(s, { season, hour: 23, frozen: false }));
  assert.ok(!trickOpen(s, { season: 'winter', hour: 23, raining: true }));
});

test('stars and records: thresholds, best kept, plays counted', () => {
  const t = TRICK.firefly;
  assert.equal(starsFor(0, t.stars), 0);
  assert.equal(starsFor(6, t.stars), 1);
  assert.equal(starsFor(13, t.stars), 2);
  assert.equal(starsFor(99, t.stars), 3);
  let r = recordRound(undefined, t, 11);
  assert.deepEqual(r.rec, { learned: true, best: 11, stars: 2, plays: 1 });
  assert.ok(r.newBest);
  r = recordRound({ ...r.rec, intro: true }, t, 4);
  assert.deepEqual(r.rec, { learned: true, best: 11, stars: 2, plays: 2, intro: true });
  assert.equal(r.stars, 0);
  assert.ok(!r.newBest);
});

test('saves keep a clean tricks record', () => {
  assert.deepEqual(freshState().tricks, {});
  assert.deepEqual(cleanTricks(null), {});
  assert.deepEqual(cleanTricks([1]), {});
  const s = migrate({ ...freshState('grandma'), tricks: { firefly: { learned: 1, best: 12.7, stars: 9, plays: -2, intro: true }, nope: { best: 3 }, stars: 'x' } });
  assert.deepEqual(s.tricks, { firefly: { learned: true, best: 12, stars: 3, plays: 0, intro: true } });
  const old = { ...freshState('grandma') };
  delete old.tricks;
  assert.deepEqual(migrate(old).tricks, {});
});

test('the trick modules export play (and the firefly an ambient look); rules are pure', async () => {
  for (const t of TRICKS) {
    const f = new URL(`../src/game/tricks/${t.id}.js`, import.meta.url);
    if (!fs.existsSync(f)) continue;          // a trick still being built is simply not offered yet
    const m = (await import(f.href)).default;
    assert.equal(m.id, t.id);
    assert.equal(typeof m.play, 'function', t.id);
    if (m.ambient) assert.equal(typeof m.ambient, 'function');
  }
  const fire = await import('../src/game/tricks/firefly.js');
  assert.equal(typeof fire.default.ambient, 'function');
  // a firefly flashes for part of its period, then is dark
  const lit = [];
  for (let t = 0; t < 2; t += 0.05) lit.push(fire.blink(t, 2, 0, 0.32) >= fire.CATCHABLE);
  const share = lit.filter(Boolean).length / lit.length;
  assert.ok(share > 0.1 && share < 0.35, `lit ${share}`);
  assert.equal(fire.blink(1.5, 2, 0), 0);

  const stars = await import('../src/game/tricks/stars.js');
  assert.deepEqual(stars.nextStars([]), ['alkaid', 'dubhe']);
  assert.deepEqual(stars.nextStars(['alkaid']), ['mizar']);
  assert.deepEqual(stars.nextStars(['dubhe', 'merak']), ['phecda']);
  assert.deepEqual(stars.nextStars(stars.DIPPER), []);
  // the pointer stars lead to Polaris: Merak -> Dubhe, about five times over
  const { merak, dubhe, polaris } = stars.NAMED;
  const gap = Math.hypot(dubhe[0] - merak[0], dubhe[1] - merak[1]), far = Math.hypot(polaris[0] - dubhe[0], polaris[1] - dubhe[1]);
  assert.ok(Math.abs(far / gap - 5) < 0.5);
  assert.equal(stars.starScore({ joined: 7, polaris: true, wish: true, mistakes: 0, seconds: 25 }), 115);
  assert.equal(stars.starScore({ joined: 2, mistakes: 9 }), 0);
  assert.ok(stars.starScore({ joined: 7, polaris: true, wish: true, seconds: 30 }) >= TRICK.stars.stars[2]);
  assert.ok(stars.starScore({ joined: 7, mistakes: 2 }) >= TRICK.stars.stars[0]);
});
