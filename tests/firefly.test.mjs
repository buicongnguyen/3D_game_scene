// Firefly jar: the rules (game/tricks/rules-firefly.js) and the trick's data (content/tricks.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRICK, starsFor } from '../src/content/tricks.js';
import {
  FIREFLY as F, KINDS, HEIKE, GENJI, HIME, Jar, blink, rng, noiseOf, scareRadius, inNet, catchable, litFor, unisonBonus,
  jarGlow, jarColour, nextKind, groupSize, himeWait,
} from '../src/game/tricks/rules-firefly.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
/** The share of a period in which a firefly of this kind can be caught. */
const window = (kind, mode) => {
  const K = KINDS[kind], period = (K.period[0] + K.period[1]) / 2, lit = litFor(kind, mode);
  let n = 0;
  for (let i = 0; i < 2000; i++) if (catchable(blink(i / 2000 * period, period, 0, lit), mode?.easy)) n++;
  return { share: n / 2000, seconds: n / 2000 * period, period };
};

test('three kinds a child can tell apart: size, colour, rhythm and worth', () => {
  assert.deepEqual(KINDS.map(k => k.id), ['heike', 'genji', 'hime']);
  assert.deepEqual(KINDS.map(k => k.points), [1, 2, 3]);
  const [h, g, m] = KINDS;
  assert.ok(g.size > h.size * 1.4 && m.size < h.size, 'Genji is clearly the big one, Hime the tiny one');
  assert.ok(g.period[0] > h.period[1] * 1.6, 'Genji blinks slowly, Heike quickly');
  assert.ok(m.period[1] < h.period[0], 'Hime twinkles fastest');
  assert.ok(g.height[0] >= h.height[0] + 0.4 && g.height[1] <= F.hoop + F.tall, 'Genji fly higher, still inside the net');
  assert.ok(g.unison && !h.unison && g.group[0] >= 2, 'Genji neighbours blink together');
  assert.ok(m.shy > 1.4 && m.group[1] === 1, 'Hime is shy and alone');
  // colours: green, yellow, gold: each differs from the others by a clear step in red or green
  for (const [a, b] of [[h, g], [g, m], [h, m]]) assert.ok(Math.abs(a.colour[0] - b.colour[0]) + Math.abs(a.colour[1] - b.colour[1]) > 0.3, `${a.id}/${b.id}`);
  for (const k of KINDS) assert.match(k.css, /^#[0-9a-f]{6}$/);
});

test('the blink: a flash, then darkness; every kind leaves a child time to sweep', () => {
  assert.equal(blink(1.5, 2, 0), 0);
  assert.ok(near(blink(0.32, 2, 0, 0.32), 1, 1e-3));
  assert.ok(near(blink(0.32 + 2 * 7, 2, 0, 0.32), 1, 1e-3), 'it repeats');
  assert.ok(near(blink(-1.68, 2, 0, 0.32), blink(0.32, 2, 0, 0.32)), 'time before zero too');
  for (const kind of [HEIKE, GENJI, HIME]) {
    const w = window(kind), first = window(kind, { first: true }), easy = window(kind, { easy: true });
    assert.ok(w.seconds >= 0.4, `${KINDS[kind].id}: ${w.seconds.toFixed(2)} s to sweep`);
    assert.ok(w.share < 0.5, `${KINDS[kind].id}: dark more often than lit (${w.share.toFixed(2)})`);
    assert.ok(first.seconds > w.seconds * 1.2 && easy.seconds > w.seconds, 'the guided try and Easy mode give longer');
  }
  assert.ok(window(GENJI).seconds > window(HEIKE).seconds * 1.5, 'a slow blink is a long glow');
  assert.ok(litFor(HIME, { first: true }) <= 0.7);
});

test('walking softly: tiptoe and standing are silent, a walk clears the ones beside her, running clears the air', () => {
  assert.equal(noiseOf(0), 0);
  assert.equal(noiseOf(1.0), 0, 'the stick held gently (1 m/s)');
  assert.equal(noiseOf(F.creep), 0);
  assert.ok(noiseOf(1.86) > 0.15 && noiseOf(1.86) < 0.35, 'a plain walk');
  assert.equal(noiseOf(4.4), 1, 'running');
  assert.equal(scareRadius(0, HEIKE), 0);
  const walk = scareRadius(noiseOf(1.86), HEIKE), run = scareRadius(1, HEIKE);
  // the sweep reaches (2 * reach - behind) ahead of her: a walker still has a band in front of her where she can catch
  assert.ok(walk > 1 && walk < 2 * F.reach - F.behind - 0.4, `walk ${walk}`);
  assert.ok(run > 2 * F.reach - F.behind + 1.5, `running empties the whole sweep and more (${run})`);
  assert.ok(scareRadius(noiseOf(1.86), HIME) > 2 * F.reach - F.behind, 'the rare one only lets a tiptoe near');
  assert.ok(near(scareRadius(1, HIME), run * KINDS[HIME].shy));
  // leniency
  assert.ok(near(scareRadius(1, HEIKE, { easy: true }), run * 0.6));
  assert.equal(scareRadius(noiseOf(1.86), HEIKE, { first: true }), 0, 'the guided try: a walk bothers nobody');
  assert.equal(scareRadius(noiseOf(1.86), HIME, { first: true }), 0);
  assert.ok(scareRadius(1, HEIKE, { first: true }) > 2, '...but running still does');
  for (let n = 0.05; n < 1; n += 0.05) assert.ok(scareRadius(n + 0.05, GENJI) > scareRadius(n, GENJI), 'louder is always wider');
});

test('the net: a circle on the ground plan, whatever the height a firefly flies at', () => {
  assert.ok(inNet(0, 0, 0));
  assert.ok(inNet(F.reach, 0, 0) && !inNet(F.reach + 0.01, 0, 0));
  assert.ok(inNet(0.9, 0.3, 0.9) && !inNet(1, 0, 1));
  assert.ok(inNet(0, -0.6, 0) && inNet(0, 0.5, 0), 'low over the rice and as high as a Genji flies');
  assert.ok(!inNet(0, F.tall + 0.1, 0));
  assert.ok(inNet(1.5, 0, 0, F.easyReach) && F.easyReach > F.reach);
  for (const k of KINDS) for (const y of k.height) assert.ok(Math.abs(y + 0.3 - F.hoop) <= F.tall, `${k.id} at ${y} m (and bobbing) is in reach`);
  assert.ok(catchable(F.catchable) && !catchable(F.catchable - 0.01));
  assert.ok(catchable(0.06, true) && !catchable(0.04, true) && !catchable(0, true));
  assert.ok(F.behind > 0 && F.behind < F.reach / 2 && F.swingCool >= 0.3);
});

test('the jar: counts by kind, points, and more for a sweep of several', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(unisonBonus), [0, 0, 1, 2, 3, 3]);
  const jar = new Jar();
  assert.deepEqual({ ...jar.sweep(0, 0, 0) }, { n: 0, points: 0, bonus: 0 });
  assert.equal(jar.sweeps, 0);
  assert.deepEqual({ ...jar.sweep(1) }, { n: 1, points: 1, bonus: 0 });
  assert.deepEqual({ ...jar.sweep(0, 1) }, { n: 1, points: 2, bonus: 0 });
  assert.deepEqual({ ...jar.sweep(0, 0, 1) }, { n: 1, points: 3, bonus: 0 });
  assert.deepEqual({ ...jar.sweep(0, 3) }, { n: 3, points: 8, bonus: 2 }, 'three Genji blinking together');
  assert.deepEqual({ ...jar.sweep(2, 0) }, { n: 2, points: 3, bonus: 1 });
  assert.deepEqual(jar.counts, [3, 4, 1]);
  assert.equal(jar.caught, 8);
  assert.equal(jar.score, 1 + 2 + 3 + 8 + 3);
  assert.equal(jar.bonus, 3);
  assert.equal(jar.best, 3);
  assert.equal(jar.sweeps, 5);
  assert.ok(!jar.lantern && !jar.full);
  jar.sweep(2);
  assert.ok(jar.lantern, 'ten fireflies make the lantern, whatever they are worth');
  for (let i = 0; i < 14; i++) jar.sweep(1);
  assert.ok(jar.full && jar.caught === F.jar);
  assert.equal(jar.sweep(1), jar.last, 'no object is made per sweep');
});

test('the jar light: brighter with every firefly, never over its cap, coloured by what is in it', () => {
  const CAP = 2.6;
  assert.equal(jarGlow(0, CAP), 0);
  let last = 0;
  for (let n = 1; n <= F.jar; n++) { const g = jarGlow(n, CAP); assert.ok(g >= last && g <= CAP); last = g; }
  assert.equal(jarGlow(F.jar, CAP), CAP);
  assert.ok(jarGlow(F.lantern, CAP) >= CAP, 'the lantern is as bright as the jar gets');
  const heike = jarColour([5, 0, 0], []), genji = jarColour([0, 5, 0], []), hime = jarColour([0, 0, 5], []), mix = jarColour([3, 3, 0], []);
  assert.ok(heike[1] > heike[0] && genji[0] > heike[0] && hime[1] < genji[1], 'green, yellow, gold');
  assert.ok(mix[0] > heike[0] && mix[0] < genji[0]);
  for (const c of [heike, genji, hime, mix, jarColour([0, 0, 0], [])]) {
    assert.equal(c.length, 3);
    assert.ok(Math.max(...c) > 0.85 && c[1] > 0.7, `still a light: ${c}`);
  }
  const out = [0, 0, 0];
  assert.equal(jarColour([1, 2, 3], out), out, 'written in place');
});

test('who flies in: Heike always about, Genji now and then, one rare Hime at a time and never in the guided try', () => {
  const rand = rng(5);
  assert.equal(nextKind(rand, [0, 0, 0], 0, 0), HEIKE);
  assert.notEqual(nextKind(rand, [9, 2, 0], F.himeAfter - 1, 0), HIME, 'not in the first seconds');
  assert.equal(nextKind(rand, [9, 2, 0], F.himeAfter, 0), HIME);
  assert.notEqual(nextKind(rand, [9, 2, 1], F.himeAfter + 5, 0), HIME, 'one at a time');
  assert.notEqual(nextKind(rand, [9, 2, 0], F.himeAfter + 5, 3), HIME, 'not before its wait is over');
  assert.notEqual(nextKind(rand, [9, 2, 0], 60, 0, { first: true }), HIME);
  let genji = 0, n = 4000;
  for (let i = 0; i < n; i++) if (nextKind(rand, [9, 2, 1], 30, 5) === GENJI) genji++;
  assert.ok(Math.abs(genji / n - F.genjiShare) < 0.03, `Genji share ${genji / n}`);
  for (let i = 0; i < 200; i++) assert.equal(nextKind(rand, [9, F.genjiMost, 1], 30, 5), HEIKE, 'enough Genji are flying');
  for (let i = 0; i < 200; i++) assert.equal(nextKind(rand, [2, 0, 1], 30, 5), HEIKE);
  const sizes = [new Set(), new Set(), new Set()];
  for (let i = 0; i < 300; i++) for (const k of [HEIKE, GENJI, HIME]) sizes[k].add(groupSize(rand, k));
  assert.deepEqual([...sizes[HEIKE]].sort(), [1, 2, 3]);
  assert.deepEqual([...sizes[GENJI]].sort(), [2, 3]);
  assert.deepEqual([...sizes[HIME]], [1]);
  for (let i = 0; i < 100; i++) { const w = himeWait(rand); assert.ok(w >= F.himeEvery[0] && w <= F.himeEvery[1]); }
  assert.equal(rng(3)(), rng(3)(), 'seeded');
});

test('the firefly entry: points, one star is easy, three take a nearly full jar caught well', () => {
  const t = TRICK.firefly;
  assert.equal(t.unit, 'points');
  assert.ok(t.length >= 60 && t.length <= 90 && t.firstLength >= 40 && t.firstLength < t.length);
  const [one, two, three] = t.stars;
  // one star: six or seven of the common kind, one at a time, well short of the lantern
  assert.ok(one <= 8 && one < F.lantern);
  // two stars: about a lantern's worth with some Genji or sweeps of two, never by ten single Heike alone
  const lanternPlain = F.lantern * KINDS[HEIKE].points;
  assert.ok(two > lanternPlain && two <= lanternPlain * 2);
  // three stars: out of reach of a full jar of single Heike, in reach of a full jar caught well
  const plainJar = F.jar * KINDS[HEIKE].points;
  const good = new Jar();
  for (let i = 0; i < 4; i++) good.sweep(0, 2);            // four pairs of Genji
  for (let i = 0; i < 3; i++) good.sweep(2);               // three pairs of Heike
  good.sweep(0, 0, 1);                                     // one Hime
  while (!good.full) good.sweep(1);
  assert.ok(three > plainJar, `${three} > ${plainJar}`);
  assert.ok(good.score >= three + 4, `a good jar scores ${good.score}`);
  assert.equal(starsFor(good.score, t.stars), 3);
  assert.equal(starsFor(plainJar, t.stars), 2);
});

test('the round draws what the rules say, and puts everything back', () => {
  const src = fs.readFileSync(new URL('../src/game/tricks/firefly.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /from '\.\/rules-firefly\.js'/);
  assert.match(src, /softly = creepFilter\(g\.input, cs\)/, 'soft walking is the stick held gently, or Shift');
  assert.match(src, /ctx\.beforeMove\(\(\) => \{ if \(catching\) softly\(\); \}\)/, '...and only while she catches');
  // one draw call for the swarm, one arc: no meshes per firefly
  assert.equal((src.match(/new THREE\.Points\(/g) || []).length, 1);
  // cleanup frees the arc, the tally box and the swarm, and gives the summer sparks back
  const cleanup = src.slice(src.indexOf('const cleanup = () => {'), src.indexOf('try {', src.indexOf('const cleanup = () => {')));
  for (const s of ['sw.dispose()', 'arc.geometry.dispose()', 'arc.material.dispose()', 'box?.dispose()', 'wild.visible = wildOn', 'g.lights.remove(jarLight)', 'tamo.calm = 1']) assert.ok(cleanup.includes(s), s);
  assert.match(src, /finally \{\n\s+cleanup\(\);/);
  // the guided try, Easy mode and the lantern are still there
  assert.match(src, /first: !!ctx\.first/); assert.match(src, /easy: !!g\.easy/);
  assert.match(src, /caught >= LANTERN/); assert.match(src, /this\.release\(ctx/);
});
