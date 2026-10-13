// The rules of Stargazing (src/game/tricks/rules-stars.js): the real sky of a round, the three levels, the scores, the
// view that frames a figure, and the satellites of the Difficult level.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../src/game/tricks/rules-stars.js';
import { STARS, SEASONS, GROUP, sep } from '../src/content/constellations.js';
import { TRICK } from '../src/content/tricks.js';
import { levelSpec } from '../src/content/levels.js';
import { projectSky, compassIndex, azDiff } from '../src/ui/sky-compass.js';

const VIEWS = { desktop: { fov: 60, aspect: 1280 / 720 }, portrait: { fov: 76, aspect: 390 / 844 }, landscape: { fov: 66, aspect: 844 / 390 } };
const halfWidth = v => Math.atan(Math.tan(v.fov * Math.PI / 360) * v.aspect) * 180 / Math.PI;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;

test('joining a figure: either end may start, then it runs on; a triangle is joined in any order', () => {
  assert.deepEqual(R.nextStars([]), ['alkaid', 'dubhe']);
  assert.deepEqual(R.nextStars(['alkaid']), ['mizar']);
  assert.deepEqual(R.nextStars(['dubhe', 'merak']), ['phecda']);
  assert.deepEqual(R.nextStars(R.DIPPER), []);
  assert.deepEqual(R.nextInChain(R.CASS, []), ['caph', 'segin'], 'either end of the W may start');
  assert.deepEqual(R.nextInChain(R.CASS, ['segin', 'ruchbah']), ['navi']);
  assert.deepEqual(R.nextInChain(R.CASS, [...R.CASS]), []);
  assert.deepEqual(R.nextInChain(R.LITTLE, ['polaris']), ['yildun'], 'the Little Dipper is joined on from the North Star');
  assert.deepEqual(R.nextInSet(['vega', 'deneb', 'altair'], ['deneb']), ['vega', 'altair']);
  assert.deepEqual(R.nextInSet(['vega', 'deneb', 'altair'], ['deneb', 'altair', 'vega']), []);
});

test('the sky of a round is the real one: the North Star over north, the pointers leading to it, every figure up', () => {
  for (const season of SEASONS) {
    const sky = R.gazeSky(season);
    assert.equal(sky.lat, 35);
    assert.ok(sky.hour >= 20 || sky.hour <= 4.5, `${season}: the hour ${sky.hour} is inside the trick's night`);
    const pole = R.starAt('polaris', sky);
    assert.ok(Math.abs(pole.alt - 35) < 1.2 && Math.abs(azDiff(pole.az, 0)) < 1.6, `${season}: the North Star stands over north, as high as the latitude (${pole.alt.toFixed(1)} at ${pole.az.toFixed(1)})`);
    assert.equal(compassIndex(pole.az), 0);
    for (const [name, ids, min] of [['Big Dipper', R.DIPPER, 10], ['Cassiopeia', R.CASS, 10], ['Little Dipper', R.LITTLE, 15]]) {
      const m = R.middleOf(ids, sky);
      assert.ok(m.lo >= min, `${season}: the ${name} clears the hills (its lowest star is ${m.lo.toFixed(1)} up)`);
    }
    // Cassiopeia is on the other side of the pole from the Big Dipper
    const d = R.middleOf(R.DIPPER, sky), c = R.middleOf(R.CASS, sky);
    assert.ok(azDiff(d.az, 0) * azDiff(c.az, 0) < 0, `${season}: one is east of north, the other west`);
    // the season's figure is well up, and its brightest star really is the brightest of those shown
    const f = R.seasonFigure(sky), all = [...f.join, ...f.show];
    for (const id of all) assert.ok(R.starAt(id, sky).alt >= 12, `${season}: ${id} of ${f.id} is up`);
    assert.equal(all.slice().sort((a, b) => STARS[a].mag - STARS[b].mag)[0], f.bright, `${f.id}: ${f.bright} is its brightest star`);
    assert.ok(GROUP[f.group], 'it is a group of the star data (its name comes from there)');
    for (const [a, b] of f.lines) assert.ok(all.includes(a) && all.includes(b));
  }
  assert.deepEqual(SEASONS.map(s => R.seasonFigure(R.gazeSky(s)).id), ['spring-triangle', 'summer-triangle', 'orion', 'orion']);
  assert.equal(R.gazeSky('nonsense').season, 'summer');
  // the pointer rule on the real sky: Merak -> Dubhe, about five times over, lands by the North Star
  const sky = R.gazeSky('summer');
  const v = id => { const d = R.starDir(id, sky); return { x: d[0], y: d[1], z: d[2] }; };
  const merak = v('merak'), dubhe = v('dubhe'), pole = v('polaris');
  const gap = angle(merak, dubhe), far = angle(dubhe, pole);
  assert.ok(Math.abs(far / gap - 5.3) < 0.4, `${(far / gap).toFixed(2)} gaps`);
  assert.ok(Math.abs(gap - sep('merak', 'dubhe')) < 1e-6, 'the horizon picture keeps the true distances');
  assert.ok(Math.abs(angle(merak, pole) - (gap + far)) < 1.5, 'the three are nearly in a line');
});

test('the levels: Easy finds north, Normal adds Cassiopeia and the season, Difficult the Little Dipper and satellites', () => {
  const sky = R.gazeSky('summer');
  const E = R.gazePlan('easy', false, sky), N = R.gazePlan('normal', false, sky), H = R.gazePlan('hard', false, sky), F = R.gazePlan('hard', true, sky);
  assert.deepEqual(E.steps, ['dipper', 'polaris']);
  assert.deepEqual(N.steps, ['dipper', 'cass', 'polaris', 'season', 'bright']);
  assert.deepEqual(H.steps, ['dipper', 'polaris', 'little', 'satellite', 'train']);
  assert.deepEqual(F.steps, E.steps, 'the guided first try is the Easy round');
  assert.ok(F.guide > E.guide && E.guide > N.guide && N.guide > 0 && H.guide === 0, 'less and less of the pointer line is drawn');
  assert.deepEqual([E.stars, N.stars, H.stars], [7, 15, 13]);
  assert.deepEqual([E.tasks, N.tasks, H.tasks], [0, 1, 2]);
  // the helps: an outline for the first figure only, none on Difficult, where the horizon letters are off too (the rose stays)
  assert.deepEqual([E.outline, N.outline, H.outline], [['dipper'], ['dipper'], []]);
  assert.deepEqual([E.horizon, N.horizon, H.horizon], ['on', 'on', 'off']);
  assert.ok(E.nudge > 0 && E.nudge < N.nudge && H.nudge === 0, 'Easy points the way soonest, Difficult never');
  assert.ok(H.decoy && !N.decoy && !E.decoy);
  assert.equal(N.figure.id, 'summer-triangle'); assert.equal(E.figure, null);
  for (const season of SEASONS) assert.equal(R.gazePlan('normal', false, R.gazeSky(season)).stars, 15, `${season}: the same number of stars to join`);
  assert.equal(R.planStars(E).length, 8);
  assert.equal(R.planStars(H).length, 14); assert.equal(new Set(R.planStars(H)).size, 14);
  assert.deepEqual(R.planStars(R.gazePlan('normal', false, R.gazeSky('winter'))).slice(-7), ['alnitak', 'alnilam', 'mintaka', 'betelgeuse', 'bellatrix', 'saiph', 'rigel']);
  // the bright stars are drawn bigger than the Little Dipper's faint ones
  assert.ok(R.starSize(STARS.vega.mag) > R.starSize(STARS.altair.mag) && R.starSize(STARS.altair.mag) > R.starSize(STARS.deneb.mag));
  assert.ok(R.starSize(STARS.rigel.mag) > R.starSize(STARS.betelgeuse.mag));
  assert.ok(R.starSize(STARS.etaumi.mag) < R.starSize(STARS.dubhe.mag) * 0.8);
});

test('no clouds: the round is about stars only', () => {
  for (const level of ['easy', 'normal', 'hard']) assert.ok(!('clouds' in R.gazePlan(level)), level);
  assert.equal(R.cloudCovers, undefined); assert.equal(R.CLOUD, undefined);
  assert.ok(!/cloud/i.test(fs.readFileSync(new URL('../src/game/tricks/rules-stars.js', import.meta.url), 'utf8')), 'the rules know no clouds');
  const game = fs.readFileSync(new URL('../src/game/tricks/stars.js', import.meta.url), 'utf8');
  assert.ok(!/cloudTexture|cloudCovers|clouded|plan\.clouds|THREE\.Sprite/.test(game), 'the round draws no clouds and hides no star');
  // and it clears the valley's own painted clouds out of the sky while it runs, then gives the sky back
  assert.match(game, /cover\.value = CLEAR_SKY/);
  assert.match(game, /painted\.value = 0/, 'and its painted Milky Way, which looks like cloud');
  assert.match(game, /if \(g\.afterUpdate === clearSky\) g\.afterUpdate = afterWas;/);
  assert.ok(!/cloud/i.test(JSON.stringify(TRICK.stars)), 'nor the game\'s row');
});

test('scores: 10 a star, 20 the North Star and each answer, 15 the wish, speed once all is found', () => {
  assert.equal(R.starScore({ joined: 7, polaris: true, wish: true, mistakes: 0, seconds: 25 }), 70 + 20 + 15 + 10);
  assert.equal(R.starScore({ joined: 2, mistakes: 9 }), 0);
  assert.equal(R.starScore({ joined: 15, polaris: true, tasks: 1, wish: true, seconds: 75, par: 95, done: true }), 150 + 20 + 20 + 15 + 10);
  assert.equal(R.starScore({ joined: 15, polaris: true, tasks: 0, wish: false, seconds: 60, par: 95, done: false }), 170, 'not finished: no speed bonus');
  assert.equal(R.starScore({ joined: 13, polaris: true, tasks: 2, mistakes: 2, seconds: 999, par: 125, done: true }), 130 + 20 + 40 - 8);
  const row = TRICK.stars;
  const E = R.gazePlan('easy'), N = R.gazePlan('normal'), H = R.gazePlan('hard');
  for (const [level, plan] of [['easy', E], ['normal', N], ['hard', H]]) {
    const s = levelSpec(row, level).stars, all = plan.stars * 10 + 20 + plan.tasks * 20;
    assert.ok(s[2] < R.gazeMax(plan), `${level}: three stars can be had (${s[2]} of ${R.gazeMax(plan)})`);
    assert.ok(s[2] <= all + 15, `${level}: everything found and the wish made is three stars, with no hurry`);
    assert.ok(R.starScore({ joined: plan.stars, polaris: true, tasks: plan.tasks, wish: false, mistakes: 3, seconds: 999, par: plan.par, done: true }) >= s[1], `${level}: everything found, a few slips, no wish: two stars`);
  }
  // one star on Easy is easy: four stars of the Dipper
  assert.ok(R.starScore({ joined: 4 }) >= levelSpec(row, 'easy').stars[0]);
  assert.ok(R.starScore({ joined: 9 }) >= levelSpec(row, 'normal').stars[0], 'Normal: nine stars of fifteen');
  assert.ok(R.starScore({ joined: 7, polaris: true, mistakes: 0 }) < levelSpec(row, 'normal').stars[1], 'the Dipper and the North Star alone are not two stars on Normal');
  // three stars on Difficult need real care: everything without the wish is not enough unless it is quick, and slips cost it
  const h3 = levelSpec(row, 'hard').stars[2], par = H.par, slow = { joined: 13, polaris: true, tasks: 2, seconds: par, par, done: true };
  assert.ok(R.starScore({ ...slow, wish: false }) < h3);
  assert.ok(R.starScore({ ...slow, wish: true, mistakes: 1 }) < h3);
  assert.ok(R.starScore({ ...slow, wish: true, mistakes: 0 }) >= h3);
  assert.ok(R.starScore({ ...slow, tasks: 1, wish: true, seconds: par - 30 }) < h3, 'an answer missed is not made up by speed');
  assert.ok(R.starScore({ ...slow, wish: true, mistakes: 3, seconds: par - 30 }) >= h3, 'a quick round can afford a few slips');
  assert.ok(E.par < N.par && N.par < H.par, 'each level has its own par');
  // the round lengths asked for
  const len = l => levelSpec(row, l).length;
  assert.ok(len('easy') >= 80 && len('easy') <= 90 && len('normal') >= 110 && len('normal') <= 130 && len('hard') >= 140 && len('hard') <= 160);
});

test('the view frames a figure under the hint, with the horizon in the picture when the figure is low enough', () => {
  const lay = { yTop: 0.27, yBot: 0.9 };
  for (const season of SEASONS) for (const [name, view] of Object.entries(VIEWS)) {
    const sky = R.gazeSky(season);
    for (const ids of [R.DIPPER, R.CASS, R.LITTLE, ['dubhe', 'merak', 'polaris']]) {
      const pts = ids.map(id => R.starAt(id, sky)), v = R.frameView(pts, view, lay), vv = { ...view, az: v.az, alt: v.alt };
      for (const p of pts) { const q = projectSky(p.az, p.alt, vv); assert.ok(q.front && q.y <= 1 - 2 * lay.yTop + 1e-6 && q.y > -1, `${season} ${name}: a star is under the hint and above the bottom`); }
      // when it says the horizon is in, it stands where it was asked to
      const h = projectSky(v.az, 0, vv);
      if (v.horizon) assert.ok(Math.abs((1 - h.y) / 2 - lay.yBot) < 1e-6, `${season} ${name}: the horizon at ${lay.yBot}`);
      else assert.ok((1 - h.y) / 2 > lay.yBot, 'else the view is tilted higher and the horizon has gone down');
    }
    // the North Star alone, horizon kept by force: the N stands under it in every screen shape
    const pole = R.starAt('polaris', sky), v = R.frameView([pole], view, { ...lay, horizon: 'force' });
    assert.ok(v.horizon && Math.abs(azDiff(v.az, pole.az)) < 1e-6);
    assert.ok(projectSky(pole.az, pole.alt, { ...view, az: v.az, alt: v.alt }).y < 1, `${season} ${name}: the star is in the picture over the N`);
  }
  // a low figure keeps the horizon; a high one (the Summer Triangle, near the zenith) cannot
  const autumn = R.gazeSky('autumn'), summer = R.gazeSky('summer');
  assert.equal(R.frameView(R.DIPPER.map(id => R.starAt(id, autumn)), VIEWS.portrait, { yTop: 0.27, yBot: 0.8 }).horizon, true);
  assert.equal(R.frameView(['vega', 'deneb', 'altair'].map(id => R.starAt(id, summer)), VIEWS.desktop, lay).horizon, false);
});

test('a satellite shines by sunlight: lit on the Sun\'s side, dark in the Earth\'s shadow', () => {
  const sun = { az: 315, depth: 18 };
  assert.equal(R.satLight(30, 315, sun), 1, 'toward the Sun (under the horizon there) it is lit');
  assert.equal(R.satLight(88, 0, sun), 1, 'overhead in the first hour of the night it is still in sunlight');
  assert.equal(R.satLight(20, 135, sun), 0, 'low on the far side it is inside the shadow');
  // the shadow's edge is soft, and it climbs as the Sun sinks
  const vals = [50, 45, 40, 35, 30].map(alt => R.satLight(alt, 135, sun));
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] <= vals[i - 1], 'lower on the far side is never brighter');
  assert.ok(vals.some(v => v > 0 && v < 1), 'there is a fading zone');
  assert.equal(R.satLight(88, 0, { az: 0, depth: 50 }), 0, 'in the middle of the night the low satellites are all in the shadow');
  // the game's Sun is on the evening side before midnight and on the morning side after it
  assert.equal(R.gameSun(R.gazeSky('summer')).az, 315); assert.equal(R.gameSun(R.gazeSky('autumn')).az, 45);
});

test('a pass: a steady glide along a great circle, on only between its ends', () => {
  const pass = R.satPass({ alt: 20, az: 300 }, { alt: 25, az: 80 }, 30, 5);
  const o = {}, pts = [];
  assert.equal(R.satAt(pass, 4.9, null, o).on, false);
  assert.equal(R.satAt(pass, 35.1, null, o).on, false);
  for (let t = 5; t <= 35; t += 3) { R.satAt(pass, t, null, o); assert.ok(o.on); pts.push({ x: o.x, y: o.y, z: o.z, alt: o.alt }); assert.ok(Math.abs(Math.hypot(o.x, o.y, o.z) - 1) < 1e-9); }
  const steps = pts.slice(1).map((p, i) => angle(pts[i], p));
  for (const s of steps) assert.ok(Math.abs(s - steps[0]) < 1e-6, 'the same angle every three seconds: no speeding up, no slowing');
  assert.ok(Math.abs(steps[0] * 10 - pass.angle) < 1e-6);
  assert.ok(Math.abs(pts[0].alt - 20) < 1e-6 && Math.abs(pts.at(-1).alt - 25) < 1e-6);
  assert.ok(Math.max(...pts.map(p => p.alt)) > 40, 'it climbs over the sky between its ends');
  // near the horizon it is lost in the haze
  assert.ok(R.satAt(R.satPass({ alt: 1, az: 0 }, { alt: 40, az: 90 }, 10), 0.01, null, o).light < 0.05);
});

test('the lights of Difficult: a satellite that fades in the shadow, a faster blinking plane, a train to count', () => {
  for (const season of SEASONS) for (const [name, view] of Object.entries(VIEWS)) {
    const sky = R.gazeSky(season), north = R.middleOf(R.LITTLE, sky), half = halfWidth(view);
    const P = R.hardPasses(sky, north, half), o = {};
    const tag = `${season} ${name}`;
    // the watching side is away from the Sun
    assert.ok(Math.abs(azDiff(P.look.az, P.sun.az + 180)) < 30, `${tag}: looking away from the Sun`);
    // the decoy glides through the middle of the Little Dipper, lit all the way
    let closest = 99;
    for (let s = 0; s <= 1.0001; s += 0.02) {
      R.satAt(P.decoy, s * P.decoy.dur, P.sun, o);
      // (a view of 60 degrees aimed at the figure's middle: half its height is 30 degrees)
      const q = projectSky(o.az, o.alt, { az: north.az, alt: north.alt, fov: 60, aspect: 1 });
      closest = Math.min(closest, Math.hypot(q.x, q.y) * 30);
      assert.equal(R.satLight(o.alt, o.az, P.sun), 1, `${tag}: the decoy is in sunlight`);
    }
    assert.ok(closest < 4, `${tag}: the decoy passes through the figure (${closest.toFixed(1)} degrees from its middle)`);
    assert.equal(R.shadowEntry(P.decoy, P.sun), 1);
    // the lone satellite starts lit and goes dark 60 to 80 per cent of the way, inside the picture
    const e = R.shadowEntry(P.sat, P.sun);
    assert.ok(e >= 0.6 && e <= 0.8, `${tag}: the satellite fades ${e} of the way`);
    assert.ok(R.satAt(P.sat, P.sat.dur * 0.3, P.sun, o).light > 0.95);
    R.satAt(P.sat, P.sat.dur * (e - 0.1), P.sun, o);
    assert.ok(o.light > 0.05 && o.light < 1, `${tag}: it fades gently, not at once`);
    assert.ok(Math.abs(azDiff(o.az, P.look.az)) < half, `${tag}: and it fades where she is looking`);
    assert.equal(R.satAt(P.sat, P.sat.dur * 0.95, P.sun, o).light, 0);
    // the plane is about twice as fast; the train is the slowest and stays lit
    const speed = p => p.angle / p.dur;
    assert.ok(speed(P.plane) > speed(P.sat) * 1.8 && speed(P.train) < speed(P.sat), `${tag}: speeds`);
    assert.ok(P.sat.dur >= 12 && P.sat.dur <= 32 && P.train.dur >= 12, `${tag}: slow enough to watch`);
    assert.equal(R.shadowEntry(P.train, P.sun), 1);
    // the train: its lights follow one another the same distance apart, and all of them can be seen at once
    const lag = R.trainLag(P.train, 3), a = {}, b = {};
    R.satAt(P.train, P.train.dur * 0.5, P.sun, a); R.satAt(P.train, P.train.dur * 0.5, P.sun, b, lag);
    assert.ok(Math.abs(angle(a, b) - 3) < 1e-6, 'three degrees apart');
    let seen = 0;
    for (let t = 0; t < P.train.dur + 8 * lag; t += 0.5) seen = Math.max(seen, R.trainSeen(P.train, 8, 3, t, P.sun));
    assert.equal(seen, 8, `${tag}: the whole train of eight is in the sky together`);
    assert.equal(R.trainSeen(P.train, 6, 3, -1, P.sun), 0);
  }
});

test('the count offered for a train, and a plane\'s lights', () => {
  for (const n of [5, 6, 7, 8]) for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.9, 0.9999]) {
    const c = R.trainChoices(n, r);
    assert.equal(c.length, 3); assert.ok(c.includes(n)); assert.ok(c[0] > 0 && c[1] === c[0] + 1 && c[2] === c[1] + 1);
  }
  assert.deepEqual([0.1, 0.5, 0.9].map(r => R.trainChoices(6, r).indexOf(6)), [0, 1, 2], 'the right answer is not always in the same place');
  // a plane: a white flash, then red, then green, again and again; a satellite's light never changes like that
  const seen = new Set();
  for (let t = 0; t < 2.4; t += 0.03) { const [r, g, b] = R.planeBlink(t); seen.add(r > 1.5 && b > 1.5 ? 'white' : r > g ? 'red' : 'green'); }
  assert.deepEqual([...seen].sort(), ['green', 'red', 'white']);
  assert.deepEqual(R.planeBlink(0.3), R.planeBlink(0.3 + 1.2));
  // the note for the results card is short, calm and names no company
  assert.ok(R.SAT_FACT.text.length < 220 && /Thousands of satellites/.test(R.SAT_FACT.text) && /darker/.test(R.SAT_FACT.text));
});
