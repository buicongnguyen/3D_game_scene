// The Kite workshop's rules (src/game/workshop/rules.js): the tray, propeller layouts, wiring, balance, build quality,
// the save record and what the build does for flying. Pure: no three.js, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STEPS, SOCKETS, CORNERS, WRONG_PLACES, TRAY, TRAY_ORDER, NEEDED, MOTOR_COLORS, WIRES, BALANCE, QUALITY, PLAIN,
  spinTest, propsValid, allLayouts, wireFor, isSource, isSink, wiringDone, balanceIdeal, bubbleAt, balanced, balanceScore,
  quality, starsFor, freshWorkshop, cleanWorkshop, recordBuild, workshopOpen, assistSpec, assistLevel, flightNumbers, stepCharge, groundCharge,
} from '../src/game/workshop/rules.js';
import { freshState, migrate, Quest } from '../src/game/quest.js';
import { stateAt, exploreState } from '../src/game/fastforward.js';
import { TASK, HINTS, SAY, LINES, CARD, LABEL } from '../src/game/workshop/text.js';
import { TRICK } from '../src/content/tricks.js';

test('workshop: the tray holds exactly what a quadcopter needs, and two things from the kitchen drawer', () => {
  const kinds = k => TRAY.filter(p => p.kind === k);
  assert.equal(kinds('motor').length, 4);
  assert.equal(kinds('prop').filter(p => p.dir === 'cw').length, 2);
  assert.equal(kinds('prop').filter(p => p.dir === 'ccw').length, 2);
  for (const k of ['battery', 'switch', 'wire', 'spoon', 'peg']) assert.equal(kinds(k).length, 1, k);
  assert.equal(NEEDED, 11);
  assert.deepEqual(TRAY.filter(p => !p.need).map(p => p.kind).sort(), ['peg', 'spoon']);
  assert.deepEqual([...TRAY_ORDER].sort(), TRAY.map(p => p.id).sort(), 'the tray order lists every part once');
  assert.equal(new Set(TRAY.map(p => p.id)).size, TRAY.length);
  assert.deepEqual(STEPS, ['pick', 'motors', 'props', 'wire', 'balance', 'switch']);
  assert.equal(MOTOR_COLORS.length, 4);
  assert.equal(new Set(MOTOR_COLORS).size, 4);
});

test('workshop: four sockets on the spar ends, symmetric about the spine; the wrong places are on the spine', () => {
  assert.deepEqual(CORNERS, ['FL', 'FR', 'BL', 'BR']);
  assert.equal(SOCKETS.FL.x, -SOCKETS.FR.x); assert.equal(SOCKETS.FL.y, SOCKETS.FR.y);
  assert.equal(SOCKETS.BL.x, -SOCKETS.BR.x); assert.equal(SOCKETS.FL.y, -SOCKETS.BL.y);
  for (const p of Object.values(WRONG_PLACES)) assert.equal(p.x, 0);
  // far enough apart that two propellers (radius 0.19) never touch, and no wrong place sits on a socket
  const all = [...Object.values(SOCKETS), ...Object.values(WRONG_PLACES)];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) > 0.4);
});

test('workshop: only the two diagonal layouts fly straight (the real quadcopter rule)', () => {
  const layouts = allLayouts();
  assert.equal(layouts.length, 6, 'two of four clockwise: six ways');
  const good = layouts.filter(propsValid);
  assert.equal(good.length, 2);
  for (const L of good) {
    assert.equal(L.FL, L.BR, 'diagonal pairs spin the same way');
    assert.equal(L.FR, L.BL);
    assert.notEqual(L.FL, L.FR, 'neighbours spin opposite ways');
    assert.notEqual(L.FL, L.BL);
  }
  // every layout with two of each hovers without twisting; the bad ones twist as soon as the kite leans
  for (const L of layouts) {
    const r = spinTest(L);
    assert.equal(r.hover, 0);
    assert.equal(r.ok, r.pitch === 0 && r.roll === 0);
    if (!r.ok) assert.ok((r.pitch === 0) !== (r.roll === 0), 'a bad layout twists in exactly one lean');
  }
  // front pair alike -> twists leaning forward; left pair alike -> twists leaning sideways
  assert.notEqual(spinTest({ FL: 'cw', FR: 'cw', BL: 'ccw', BR: 'ccw' }).pitch, 0);
  assert.equal(spinTest({ FL: 'cw', FR: 'cw', BL: 'ccw', BR: 'ccw' }).roll, 0);
  assert.notEqual(spinTest({ FL: 'cw', BL: 'cw', FR: 'ccw', BR: 'ccw' }).roll, 0);
  assert.equal(spinTest({ FL: 'cw', BL: 'cw', FR: 'ccw', BR: 'ccw' }).pitch, 0);
  // four alike spins the kite even hovering; an unfinished kite is never valid
  assert.equal(spinTest({ FL: 'cw', FR: 'cw', BL: 'cw', BR: 'cw' }).hover, 4);
  assert.equal(propsValid({ FL: 'cw', FR: 'ccw', BL: 'ccw' }), false);
  assert.equal(propsValid(null), false);
  assert.equal(propsValid({ FL: 'cw', FR: 'ccw', BL: 'ccw', BR: 'up' }), false);
});

test('workshop: six wires, each from a plug to the socket of its colour', () => {
  assert.equal(WIRES.length, 6);
  assert.equal(new Set(WIRES.map(w => w.from)).size, 6);
  assert.equal(new Set(WIRES.map(w => w.to)).size, 6);
  // battery -> switch -> the four motors, and the way back
  assert.deepEqual(wireFor('bat+', 'sw-in')?.id, 'red');
  assert.deepEqual(wireFor('bat-', 'lug')?.id, 'black');
  MOTOR_COLORS.forEach((c, i) => assert.equal(wireFor(`sw-${c}`, `motor${i}`)?.color, c));
  // wrong sockets, backwards and unknown ends
  assert.equal(wireFor('bat+', 'lug'), null);
  assert.equal(wireFor('sw-yellow', 'motor1'), null);
  assert.equal(wireFor('sw-in', 'bat+'), null);
  assert.equal(wireFor('nothing', 'lug'), null);
  for (const w of WIRES) { assert.ok(isSource(w.from) && !isSink(w.from)); assert.ok(isSink(w.to) && !isSource(w.to)); }
  assert.equal(wiringDone([]), false);
  assert.equal(wiringDone(WIRES.slice(1).map(w => w.id)), false);
  assert.equal(wiringDone(new Set(WIRES.map(w => w.id))), true);
});

test('workshop: the battery balances at one place, the bubble runs to the light end, the score falls off smoothly', () => {
  for (let plays = 0; plays < 40; plays++) {
    const ideal = balanceIdeal(plays);
    assert.ok(ideal > 0.35 && ideal < 0.75, `ideal ${ideal}`);
    assert.ok(Math.abs(ideal - BALANCE.start) > BALANCE.tol * 3, 'never level where the battery starts');
    assert.equal(balanceScore(ideal, ideal), 1);
    assert.equal(bubbleAt(ideal, ideal), 0);
    assert.ok(balanced(ideal + BALANCE.tol * 0.9, ideal) && !balanced(ideal + BALANCE.tol * 1.2, ideal));
    assert.ok(bubbleAt(ideal + 0.1, ideal) < 0, 'nose-heavy: the bubble runs to the tail');
    assert.ok(bubbleAt(ideal - 0.1, ideal) > 0);
    assert.ok(Math.abs(bubbleAt(0, ideal)) <= 1 && Math.abs(bubbleAt(1, ideal)) <= 1);
    let prev = 1;
    for (let e = 0; e <= 0.5; e += 0.01) { const s = balanceScore(ideal + e, ideal); assert.ok(s <= prev + 1e-9 && s >= 0); prev = s; }
    assert.ok(balanceScore(ideal + BALANCE.wide, ideal) < 1e-9);
    assert.equal(balanceScore(ideal + BALANCE.wide + 0.01, ideal), 0);
  }
  assert.notEqual(balanceIdeal(0), balanceIdeal(1), 'a rebuild is not the same puzzle');
  assert.equal(balanceIdeal(NaN), balanceIdeal(0));
  assert.equal(balanceScore(NaN, 0.5), 0);
});

test('workshop: build quality and its stars; a finished build always has one', () => {
  assert.equal(quality(0, 1), 100);
  assert.equal(starsFor(quality(0, 1)), 3);
  assert.equal(starsFor(quality(1, 1)), 3, 'one slip still earns three stars with a level battery');
  assert.equal(starsFor(quality(0, 0.6)), 3);
  assert.equal(starsFor(quality(3, 1)), 2);
  assert.equal(starsFor(quality(0, 0)), 2);
  assert.equal(starsFor(quality(20, 0)), 1, 'the worst build still flies');
  assert.equal(quality(99, 0), 10);
  assert.equal(quality(NaN, NaN), 10);
  let prev = 101;
  for (let m = 0; m < 20; m++) { const q = quality(m, 1); assert.ok(q <= prev && q >= 10 && q <= 100); prev = q; }
  assert.deepEqual(QUALITY.stars, [0, 60, 85]);
});

test('workshop: the save record survives anything and keeps only what a step can be resumed with', () => {
  assert.deepEqual(freshState().workshop, freshWorkshop());
  assert.deepEqual(cleanWorkshop(null), freshWorkshop());
  assert.deepEqual(cleanWorkshop('x'), freshWorkshop());
  assert.deepEqual(cleanWorkshop([1, 2]), freshWorkshop());
  assert.deepEqual(cleanWorkshop({ built: true, stars: 9, best: 250, plays: -3 }), { built: true, stars: 3, best: 100, plays: 1, prog: null });
  assert.deepEqual(cleanWorkshop({ built: false, stars: 3, best: 80, plays: 2 }), { built: false, stars: 0, best: 0, plays: 2, prog: null });
  assert.equal(cleanWorkshop({ built: true, stars: 0 }).stars, 1);
  const good = { FL: 'cw', BR: 'cw', FR: 'ccw', BL: 'ccw' };
  // a step is only as far as what the steps before it left behind
  assert.deepEqual(cleanWorkshop({ prog: { step: 2, mistakes: 3, slots: [2, 0, 3, 1] } }).prog, { step: 2, mistakes: 3, slots: [2, 0, 3, 1], layout: null, bal: null });
  assert.equal(cleanWorkshop({ prog: { step: 3, mistakes: 0, slots: [0, 1, 2] } }).prog.step, 1, 'no motors saved: back to mounting them');
  assert.equal(cleanWorkshop({ prog: { step: 4, slots: [0, 1, 2, 3], layout: { FL: 'cw', FR: 'cw', BL: 'ccw', BR: 'ccw' } } }).prog.step, 2, 'a layout that twists: back to the propellers');
  assert.deepEqual(cleanWorkshop({ prog: { step: 4, slots: [0, 1, 2, 3], layout: good, mistakes: 1 } }).prog, { step: 4, mistakes: 1, slots: [0, 1, 2, 3], layout: good, bal: null });
  assert.equal(cleanWorkshop({ prog: { step: 5, slots: [0, 1, 2, 3], layout: good } }).prog.step, 4);
  assert.deepEqual(cleanWorkshop({ prog: { step: 99, slots: [3, 2, 1, 0], layout: good, bal: 7, mistakes: 1e9 } }).prog, { step: 5, mistakes: 99, slots: [3, 2, 1, 0], layout: good, bal: 1 });
  assert.equal(cleanWorkshop({ prog: { step: 0, mistakes: 0 } }).prog, null, 'nothing done: nothing to resume');
  assert.deepEqual(cleanWorkshop({ prog: { step: 0, mistakes: 2 } }).prog, { step: 0, mistakes: 2, slots: null, layout: null, bal: null });
  assert.equal(cleanWorkshop({ prog: 'half' }).prog, null);
  // idempotent
  const once = cleanWorkshop({ built: true, stars: 2, best: 76, plays: 4, prog: { step: 4, slots: [0, 1, 2, 3], layout: good, mistakes: 2 } });
  assert.deepEqual(cleanWorkshop(once), once);
});

test('workshop: older saves gain the field, and a broken one is repaired by migrate', () => {
  const old = stateAt('c2.hana', 'alone', 'grandma');
  delete old.workshop;
  assert.deepEqual(migrate(old).workshop, freshWorkshop());
  for (const bad of [null, 5, 'x', [], { built: 'yes', prog: [] }]) {
    const s = migrate({ ...stateAt('c1.cogs', 'alone', 'classic'), workshop: bad });
    assert.deepEqual(Object.keys(s.workshop).sort(), ['best', 'built', 'plays', 'prog', 'stars']);
  }
  const kept = migrate({ ...stateAt('c1.cogs', 'alone', 'grandma'), workshop: { built: true, stars: 3, best: 94, plays: 2, prog: null } });
  assert.deepEqual(kept.workshop, { built: true, stars: 3, best: 94, plays: 2, prog: null });
  // the record round-trips through a save
  const q = new Quest(kept);
  assert.deepEqual(q.save().workshop, kept.workshop);
});

test('workshop: recording a build keeps the best and never loses a star', () => {
  let r = recordBuild(null, 64);
  assert.deepEqual(r, { rec: { built: true, stars: 2, best: 64, plays: 1, prog: null }, stars: 2, newBest: true });
  r = recordBuild({ ...r.rec, prog: { step: 3, slots: [0, 1, 2, 3], layout: { FL: 'cw', BR: 'cw', FR: 'ccw', BL: 'ccw' }, mistakes: 0 } }, 40);
  assert.deepEqual(r, { rec: { built: true, stars: 2, best: 64, plays: 2, prog: null }, stars: 1, newBest: false });
  r = recordBuild(r.rec, 100);
  assert.deepEqual(r, { rec: { built: true, stars: 3, best: 100, plays: 3, prog: null }, stars: 3, newBest: true });
});

test('workshop: open once Mika owns the kite; in the Grandma story once the mill makes electricity', () => {
  assert.equal(workshopOpen(null), false);
  assert.equal(workshopOpen(freshState('grandma')), false);
  assert.equal(workshopOpen(freshState('classic')), false);
  const classic = freshState('classic'); classic.inv.kite = 1;
  assert.equal(workshopOpen(classic), true, 'Classic: the kite is enough');
  const g = freshState('grandma'); g.inv.kite = 1;
  assert.equal(workshopOpen(g), false, 'Grandma story: nothing to charge it from yet');
  g.lamps.mill = true;
  assert.equal(workshopOpen(g), true);
  // the story itself: the Mill Lamp is on from the end of c1.lamp
  const before = stateAt('c1.lamp', 'alone', 'grandma'); before.inv.kite = 1;
  const after = stateAt('c1.page', 'alone', 'grandma'); after.inv.kite = 1;
  assert.equal(workshopOpen(before), false);
  assert.equal(workshopOpen(after), true);
  const ex = exploreState(); ex.inv.kite = 1;
  assert.equal(workshopOpen(ex), true);
});

test('workshop: the plain kite numbers are the kite actor\'s own (an empty battery flies exactly as before)', () => {
  const src = fs.readFileSync(new URL('../src/actors/kite.js', import.meta.url), 'utf8');
  const num = k => +src.match(new RegExp(`\\b${k}: ([\\d.]+)`))[1];
  for (const k of ['boost', 'climb', 'accel', 'brake']) assert.equal(PLAIN[k], num(k), k);
  assert.match(src, /this\.stateT \/ \(this\.assist \? this\.assist\.numbers\(\)\.lift : 1\.3\)/);
  assert.equal(PLAIN.lift, 1.3);
  // without a build the actor reads its own table
  assert.match(src, /N = A \? A\.numbers\(\) : KITE/);
  assert.equal(assistSpec(0), null);
  assert.equal(assistSpec(undefined), null);
  assert.deepEqual(flightNumbers(null, 1), { ...PLAIN, k: 0 });
  for (const stars of [1, 2, 3]) {
    const flat = flightNumbers(assistSpec(stars), 0);
    for (const k of ['boost', 'climb', 'accel', 'brake', 'lift']) assert.equal(flat[k], PLAIN[k], `${k} with a flat battery`);
  }
});

test('workshop: motors help while the charge lasts, a little more for a better build, and fade out smoothly', () => {
  const s1 = assistSpec(1), s2 = assistSpec(2), s3 = assistSpec(3);
  assert.ok(s1.capacity < s2.capacity && s2.capacity < s3.capacity);
  assert.ok(s3.capacity / s1.capacity < 1.5, 'stars scale the battery only slightly');
  assert.ok(s1.capacity >= 30, 'one star is still a good half minute of boost');
  assert.equal(assistSpec(7).stars, 3);
  for (const s of [s1, s2, s3]) {
    assert.ok(s.boost > PLAIN.boost && s.climb > PLAIN.climb && s.accel > PLAIN.accel && s.brake > PLAIN.brake && s.lift < PLAIN.lift);
    assert.ok(s.boost <= PLAIN.boost * 1.5 && s.climb <= PLAIN.climb * 1.7, 'gentle: nothing doubles');
    const full = flightNumbers(s, 1);
    assert.equal(full.boost, s.boost); assert.equal(full.climb, s.climb); assert.equal(full.k, 1);
    // monotonic fade from 10 % down to the plain kite
    let prev = Infinity;
    for (let c = 0.2; c >= 0; c -= 0.005) { const n = flightNumbers(s, c); assert.ok(n.boost <= prev + 1e-9 && n.boost >= PLAIN.boost - 1e-9); prev = n.boost; }
  }
  assert.equal(assistLevel(0), 0); assert.equal(assistLevel(0.5), 1); assert.equal(assistLevel(NaN), 0);
});

test('workshop: the battery drains with boost, climb and hover, never below zero, and refills on the ground', () => {
  const s = assistSpec(1);
  // a full battery is `capacity` seconds of boost
  let c = 1, t = 0;
  while (c > 0 && t < 200) { c = stepCharge(c, { boost: 1 }, 1 / 60, s); t += 1 / 60; }
  assert.ok(Math.abs(t - s.capacity) < 0.1, `boost lasts ${t.toFixed(1)} s`);
  assert.equal(stepCharge(0, { boost: 1, climb: true, hover: true }, 5, s), 0, 'never below zero');
  // gliding along costs nothing; a hover is cheap; climbing costs less than boosting
  assert.equal(stepCharge(0.5, {}, 10, s), 0.5);
  const hover = 0.5 - stepCharge(0.5, { hover: true }, 1, s), climb = 0.5 - stepCharge(0.5, { climb: true }, 1, s), boost = 0.5 - stepCharge(0.5, { boost: 1 }, 1, s);
  assert.ok(hover > 0 && hover < climb && climb < boost);
  assert.ok(1 / hover > 240, 'a full battery hovers for minutes');
  // the ground refills it; a lit lamp or the mill wheel much faster; never over full
  let g = 0, tg = 0;
  while (g < 1 && tg < 200) { g = groundCharge(g, false, 0.1, s); tg += 0.1; }
  assert.ok(Math.abs(tg - s.charge.ground) < 0.3);
  let p = 0, tp = 0;
  while (p < 1 && tp < 200) { p = groundCharge(p, true, 0.1, s); tp += 0.1; }
  assert.ok(Math.abs(tp - s.charge.power) < 0.3 && tp < tg / 4);
  assert.equal(groundCharge(1, true, 100, s), 1);
  // no build, bad numbers: nothing changes and nothing breaks
  assert.equal(stepCharge(0.4, { boost: 1 }, 1, null), 0.4);
  assert.equal(groundCharge(0.4, true, 1, null), 0.4);
  assert.equal(stepCharge(NaN, { boost: 1 }, 1, s), 0);
  assert.equal(stepCharge(0.4, { boost: 1 }, 0, s), 0.4);
  assert.equal(stepCharge(0.4, { boost: 1 }, -1, s), 0.4);
});

test('workshop: every step has its words; lines keep to the voice sheet', () => {
  for (const s of STEPS) {
    assert.ok(TASK[s]?.name && TASK[s]?.task, `task for ${s}`);
    assert.ok(HINTS[s]?.length, `hints for ${s}`);
    for (const h of HINTS[s]) assert.ok(h.length <= 135, `hint too long: ${h}`);
  }
  for (const t of Object.values(SAY)) assert.ok(typeof t === 'string' && t.length <= 135, t);
  for (const k of ['open', 'resume', 'rebuild', 'leave', 'test', 'lock', 'switchOn', 'boost', 'keys']) assert.ok(LABEL[k], k);
  const speakers = new Set(['mika', 'tamo', 'sora', 'narrator']);
  for (const key of ['intro', 'done']) for (const story of ['grandma', 'classic']) {
    const L = LINES[key][story];
    assert.ok(L.length >= 2);
    for (const l of L) { assert.ok(speakers.has(l[0]), l[0]); assert.ok(l[1].length <= 135, `line too long (${l[1].length}): ${l[1]}`); }
    // each scene still reads without Tamo (before the chest, after the finale)
    assert.ok(L.some(l => l[0] !== 'tamo'));
  }
  // Grandma is alive and on screen only in her own story; she says "the what-tricity"
  assert.ok(LINES.done.grandma.some(l => l[0] === 'sora' && /what-tricity/.test(l[1])));
  assert.ok(!LINES.done.classic.some(l => l[0] === 'sora') && !LINES.intro.classic.some(l => l[0] === 'sora'));
  for (const l of [...LINES.intro.grandma, ...LINES.done.grandma, ...LINES.intro.classic, ...LINES.done.classic]) assert.doesNotMatch(l[1], /\b(died|dead|drown|destroy|tragedy)/i);
  // the card: why it works, for real, and the safety line about propellers and grown-ups
  assert.match(CARD.why, /clockwise/); assert.match(CARD.real, /drone/i); assert.match(CARD.safe, /grown-up/);
  // the workshop borrows the Tricks runner but is not one of Grandma's tricks
  assert.equal(TRICK.workshop, undefined);
});
