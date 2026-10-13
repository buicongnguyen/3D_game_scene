// Grandma's countryside tricks: data, places, rules and save records (content/tricks.js, game/tricks/*.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRICKS, TRICK, inHours, starsFor, trickOpen, recordRound, cleanTricks } from '../src/content/tricks.js';
import { levelSpec } from '../src/content/levels.js';
import { placeProblems } from '../src/world/roads.js';
import { DIALOGUE, CAST } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';
import { freshState, migrate } from '../src/game/quest.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

test('every trick is well formed', () => {
  for (const id of ['beetles', 'dew', 'firefly', 'frogs', 'kite', 'river', 'roast', 'stars']) assert.ok(TRICK[id], id);   // the originals stay; new rows are checked below like any other
  assert.equal(new Set(TRICKS.map(t => t.id)).size, TRICKS.length, 'unique ids');
  const MODULELESS = [];            // a trick with no game module must be listed here on purpose
  for (const t of TRICKS) if (!MODULELESS.includes(t.id)) assert.ok(fs.existsSync(new URL(`../src/game/tricks/${t.id}.js`, import.meta.url)), `${t.id} has a module`);
  for (const story of ['classic', 'grandma']) { useStory(story); for (const t of TRICKS) assert.ok(DIALOGUE[t.intro]?.length, `${t.id} has an intro in ${story}`); }
  for (const t of TRICKS) {
    for (const k of ['name', 'where', 'when', 'howReal', 'why', 'safety', 'unit', 'icon', 'intro']) assert.equal(typeof t[k], 'string', `${t.id}.${k}`);
    assert.ok(t.icon.startsWith('trick-'), t.id);
    assert.ok(t.seasons.length && t.seasons.every(s => SEASONS.includes(s)), t.id);
    assert.equal(t.hours.length, 2);
    for (const h of t.hours) assert.ok(h >= 0 && h < 24, `${t.id} hour ${h}`);
    assert.equal(t.stars.length, 3);
    assert.ok(t.stars[0] > 0 && t.stars[0] < t.stars[1] && t.stars[1] < t.stars[2], `${t.id} star thresholds rise`);
    assert.ok(t.length >= 20 && t.length <= (t.id === 'swimming' ? 240 : 120) && t.firstLength >= 20, t.id);
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
  // (the firefly jar counts points; on the Normal level: 10 for one star, 22 for two, 40 for three)
  assert.deepEqual(t.stars, [10, 22, 40]);
  assert.equal(starsFor(10, t.stars), 1);
  assert.equal(starsFor(35, t.stars), 2);
  assert.equal(starsFor(99, t.stars), 3);
  let r = recordRound(undefined, t, 23);
  const core = ({ levels, level, ...x }) => x;       // (the per-level fields: tests/levels.test.mjs)
  assert.deepEqual(core(r.rec), { learned: true, best: 23, stars: 2, plays: 1 });
  assert.ok(r.newBest);
  r = recordRound({ ...r.rec, intro: true }, t, 4);
  assert.deepEqual(core(r.rec), { learned: true, best: 23, stars: 2, plays: 2, intro: true });
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
  const easyStars = levelSpec(TRICK.stars, 'easy').stars;
  assert.ok(stars.starScore({ joined: 7, polaris: true, wish: true, seconds: 30 }) >= easyStars[2]);
  assert.ok(stars.starScore({ joined: 7, mistakes: 2 }) >= easyStars[0]);
  // ---- the levels: Easy the Dipper, Normal Cassiopeia too, Difficult the Little Dipper under clouds, with no guide lines
  const E = stars.gazePlan('easy'), N = stars.gazePlan('normal'), H = stars.gazePlan('hard'), F = stars.gazePlan('hard', true);
  assert.deepEqual(E.steps, ['dipper', 'polaris']); assert.deepEqual(N.steps, ['dipper', 'cass', 'polaris']); assert.deepEqual(H.steps, ['dipper', 'cass', 'polaris', 'little']);
  assert.deepEqual(F.steps, E.steps); assert.ok(F.guide > E.guide && E.guide > N.guide && N.guide > 0 && H.guide === 0, 'less and less of the pointer line is drawn');
  assert.ok(!E.clouds && !N.clouds && H.clouds);
  assert.deepEqual([E.stars, N.stars, H.stars], [7, 12, 18]);
  assert.deepEqual(stars.nextInChain(stars.CASS, []), ['caph', 'segin'], 'either end of the W may start');
  assert.deepEqual(stars.nextInChain(stars.CASS, ['segin', 'ruchbah']), ['navi']);
  assert.deepEqual(stars.nextInChain(stars.CASS, [...stars.CASS]), []);
  assert.deepEqual(stars.nextInChain(stars.LITTLE, ['polaris']), ['yildun'], 'the Little Dipper is joined on from the North Star');
  // the patch is the real sky: the same picture as the Dipper's at 0.75, the W on the far side of the pole, the Little Dipper hanging from it
  const patch = stars.skyPatch(stars.planStars(H), 0.75), P = stars.NAMED;
  for (const k of stars.DIPPER) assert.ok(Math.abs(patch[k][0] + 1.6 - P[k][0]) < 1e-9 && Math.abs(patch[k][1] - P[k][1]) < 1e-9, k);
  assert.equal(stars.planStars(H).length, 19); assert.equal(new Set(stars.planStars(H)).size, 19);
  for (const k of stars.CASS) assert.ok(patch[k][1] > patch.polaris[1] * 1.5, `${k} lies beyond the North Star`);
  for (const k of stars.LITTLE) assert.ok(patch[k][1] > patch.dubhe[1] + 10 && patch[k][1] <= patch.polaris[1] + 1 && patch[k][0] <= 0.1, `${k} hangs between the pole and the Big Dipper's handle`);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], between = mid(patch.dubhe, patch.navi);
  assert.ok(Math.hypot(between[0] - patch.polaris[0], between[1] - patch.polaris[1]) < 8, 'the North Star sits about half-way between the Dipper\'s bowl and the middle of the W');
  // clouds: a star under one cannot be picked; beside it, it can
  assert.ok(stars.cloudCovers([3, 10], 5, 11) && !stars.cloudCovers([3, 10], 5 + stars.CLOUD.x + 2, 11) && !stars.cloudCovers([3, 10], 5, 11 + stars.CLOUD.y + 1));
  // the scores: the speed bonus counts only when everything is found, against the level's own par
  assert.equal(stars.starScore({ joined: 12, polaris: true, wish: true, seconds: 60, par: N.par, done: true }), 120 + 20 + 15 + 10);
  assert.equal(stars.starScore({ joined: 12, polaris: true, wish: false, seconds: 60, par: N.par, done: false }), 140, 'not finished: no speed bonus');
  for (const [level, plan] of [['easy', E], ['normal', N], ['hard', H]]) {
    const s = levelSpec(TRICK.stars, level).stars, all = plan.stars * 10 + 35;
    assert.ok(s[2] < stars.gazeMax(plan) && s[2] <= all + 5, `${level}: three stars are within reach of a tidy, unhurried round (${s[2]} of ${all})`);
    assert.ok(stars.starScore({ joined: plan.stars, polaris: true, wish: false, mistakes: 3, seconds: 999, par: plan.par, done: true }) >= s[1], `${level}: everything found, a few slips, no wish: two stars`);
    assert.ok(stars.starScore({ joined: Math.ceil(plan.stars * 0.6) }) >= s[0], `${level}: six stars in ten joined is a star`);
    assert.ok(stars.starScore({ joined: 7, mistakes: 0 }) < s[1] || level === 'easy', `${level}: the Dipper alone is not two stars`);
  }
});
