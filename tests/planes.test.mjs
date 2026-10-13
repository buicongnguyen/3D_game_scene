// Paper planes on the breeze (src/game/tricks/rules-planes.js, planes.js): the folding is real flat folding (the paper's
// area never changes, exact folds give a symmetric plane), careless folds give a trim, and the flight is a small honest
// glider model: too steep stalls, too flat dives, a gentle firm throw goes far; wind, a thermal, the paper clip, the
// elevator and a bent wingtip each do what they do to a real paper plane. The stars are tuned on the real hill.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRICK, TRICKS, starsFor } from '../src/content/tricks.js';
import { LEVELS, levelSpec } from '../src/content/levels.js';
import { placeProblems, sharedGrid } from '../src/world/roads.js';
import * as R from '../src/game/tricks/rules-planes.js';

const med = (xs, q = 0.5) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * q)];
const grid = sharedGrid();
const hill = R.fieldGround((x, z) => grid.heightAt(x, z), TRICK.planes.place);
const CALM = R.makeDay(1, 'easy');
const fly = (id, aim, { tweaks = {}, trim = null, day = CALM, ground = undefined } = {}) => R.flyThrow(R.makePlane(id, tweaks, trim), aim, day, ground);

// ------------------------------------------------------------------------------------------------ the row and the hill
test('paper planes: the row, its levels and the hill it is thrown from', async () => {
  const t = TRICK.planes;
  assert.ok(t && TRICKS.indexOf(t) === TRICKS.indexOf(TRICK.kite) + 1, 'the row stands right after the kite');
  assert.deepEqual(t.seasons, ['spring', 'summer', 'autumn']);
  assert.equal(t.unit, 'points');
  assert.deepEqual(LEVELS.map(l => levelSpec(t, l).length), [70, 100, 130]);
  // Mika stands on dry ground, and the first 80 m of the field are open: dry, and no tree within 6 m of the throw line
  const O = hill.origin;
  assert.deepEqual(placeProblems(O.x, O.z).filter(p => p !== 'steep'), []);
  assert.ok(Math.abs(Math.hypot(O.x - t.place.x, O.z - t.place.z) - R.FIELD.stand) < 1e-9);
  for (let x = 0; x <= 80; x += 4) assert.ok(hill(x, 0) > -90 && hill(x, 0) <= 0.3, `the throw line at ${x} m is dry and runs downhill (${hill(x, 0).toFixed(1)})`);
  assert.ok(hill(80, 0) < -4, 'the hill falls away under the flight');
  const { scatter } = await import('../src/world/scatter.js');
  for (const density of [0.6, 0.85, 1]) {
    const placed = scatter((x, z) => grid.heightAt(x, z), () => true, density);
    for (const o of placed.trees) {
      const dx = o.x - O.x, dz = o.z - O.z, along = dx * O.dx + dz * O.dz, side = dx * O.rx + dz * O.rz;
      assert.ok(!(along > -10 && along < 80 && Math.abs(side) < 6), `${o.model} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)}) stands in the flight (density ${density})`);
    }
  }
  // the river is the water on the left: the flight says so
  let wet = 0;
  for (let y = -60; y < -20; y += 2) if (hill(40, y) < -90) wet++;
  assert.ok(wet > 3, 'the river lies to the left of the field');
});

// ------------------------------------------------------------------------------------------------ folding
test('folding: a fold mirrors the paper over its crease and never changes its area', () => {
  assert.deepEqual(R.mirror([1, 0], [0, 0], [0, 1]), [-1, 0]);
  const m = R.mirror([-1, 1.4], [0, 1.4], [-Math.SQRT1_2, -Math.SQRT1_2]);
  assert.ok(Math.abs(m[0]) < 1e-9 && Math.abs(m[1] - 0.4) < 1e-9, 'the top left corner lands on the middle line, one unit down');
  const sheet = R.newSheet();
  assert.ok(Math.abs(R.paperArea(sheet) - R.SHEET.w * R.SHEET.h) < 1e-9);
  // in half: two layers of half the sheet, the top one turned over
  const halfFold = R.foldPaper(sheet, { a: [0, 0], d: [0, 1] }, [-1, 0]);
  assert.equal(halfFold.length, 2);
  assert.deepEqual(halfFold.map(p => p.up), [true, false]);
  assert.ok(halfFold.every(p => p.pts.every(q => q[0] >= -1e-9)), 'everything lies on the right now');
  assert.ok(halfFold[1].z > halfFold[0].z);
  assert.equal(sheet.length, 1, 'the paper handed in is left alone');
  for (const d of R.DESIGNS) {
    for (const es of [[], [0.9, -0.8, 0.7, -0.9, 0.8, -0.7, 0.9, 0.9], [-1, -1, -1, -1, -1, -1, -1, -1]]) {
      const f = R.foldDesign(d.id, es, 'hard');
      assert.ok(Math.abs(R.paperArea(f.polys) - 5.6) < 1e-6, `${d.id}: the paper keeps its area`);
      assert.equal(f.steps.length, d.fold(0).length);
    }
    const n = d.fold(0).length;
    assert.ok(n >= 6 && n <= 8, `${d.id}: ${n} folds`);
    assert.equal(d.fold(0)[0].side, 'C'); assert.ok(d.fold(0)[0].back, `${d.id} starts with the crease down the middle, opened again`);
    assert.equal(d.fold(0)[n - 2].side, 'H'); assert.equal(d.fold(0)[n - 1].side, 'W');
    for (const s of d.fold(0)) assert.ok(s.text.length > 20 && s.text.length <= 90 && /[.!]$/.test(s.text), `${d.id}: "${s.text}"`);
  }
});

test('folding: exact folds make a symmetric plane; a careless one really lands crooked', () => {
  // the Dart after its four corner folds (before it is folded in half): the left half is the mirror of the right
  const D = R.DESIGN.dart;
  let polys = R.newSheet();
  for (const s of D.fold(0).slice(1, 5)) polys = R.foldPaper(polys, R.creaseOf(s, 0), s.key);
  const xs = polys.flatMap(p => p.pts.map(q => q[0])), ys = polys.flatMap(p => p.pts.map(q => q[1]));
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9, 'as wide to the left as to the right');
  const upper = polys.flatMap(p => p.pts.filter(q => q[1] > 0.4 + 1e-9).map(q => Math.abs(q[0])));
  assert.ok(Math.abs(Math.max(...ys) - 1.4) < 1e-9 && Math.max(...upper) < 0.42, 'a long point: the nose at the top, the folded edges close to the middle');
  const left = polys.reduce((s, p) => s + p.pts.reduce((a, q) => a + Math.min(0, q[0]), 0), 0), right = polys.reduce((s, p) => s + p.pts.reduce((a, q) => a + Math.max(0, q[0]), 0), 0);
  assert.ok(Math.abs(left + right) < 1e-6);
  // the finished Dart is a slim wedge
  const done = R.foldDesign('dart').polys, w = done.flatMap(p => p.pts.map(q => q[0]));
  assert.ok(Math.max(...w) - Math.min(...w) < 0.95 && done.length > 8, 'folded in half with its wings down: less than half the sheet wide, many layers');
  // a press off the middle turns the crease: the corner misses the middle line by that much
  const step = D.fold(0)[1], exact = R.creaseOf(step, 0), off = R.creaseOf(step, 1);
  const hit = R.mirror(step.key, exact.a, exact.d), miss = R.mirror(step.key, off.a, off.d);
  assert.ok(Math.abs(hit[0]) < 1e-9 && Math.hypot(miss[0] - hit[0], miss[1] - hit[1]) > 0.2);
  // twin folds are mirror images: the same error left and right lands the two corners at mirrored places
  const L = D.fold(0)[1], Rr = D.fold(0)[2], cl = R.creaseOf(L, 0.6), cr = R.creaseOf(Rr, 0.6);
  const pl = R.mirror(L.key, cl.a, cl.d), pr = R.mirror(Rr.key, cr.a, cr.d);
  assert.ok(Math.abs(pl[0] + pr[0]) < 1e-9 && Math.abs(pl[1] - pr[1]) < 1e-9);
  // the crease down the middle, folded off-centre, moves the line every later fold is made to
  const f = R.foldDesign('dart', [1], 'hard');
  assert.ok(Math.abs(f.c) > 0.1 && f.steps[1].step.a[0] === f.c);
});

test('folding: the marker, the level\'s tolerance and the trim the folds give', () => {
  for (let t = 0; t < 9; t += 0.07) assert.ok(Math.abs(R.sweepAt(t, 0.9)) <= 1 + 1e-9);
  assert.ok(R.FOLD.easy.tol > R.FOLD.normal.tol && R.FOLD.normal.tol > R.FOLD.hard.tol && R.FOLD.easy.speed < R.FOLD.hard.speed, 'Easy: a wide mark and a slow marker');
  assert.deepEqual(R.foldError(0.3, 'easy'), { err: 0, grade: 2 });
  assert.equal(R.foldError(0.3, 'hard').grade, 1);
  assert.equal(R.foldError(-0.9, 'normal').grade, 0);
  assert.ok(R.foldError(-0.9, 'normal').err < -0.8 && R.foldError(1, 'hard').err === 1);
  const n = R.DESIGN.dart.fold(0).length, none = Array(n).fill(0);
  assert.deepEqual(R.trimOf('dart', none), { veer: 0, neat: 1, perfect: n, folds: n });
  const one = (i, e) => R.trimOf('dart', none.map((v, k) => (k === i ? e : v)));
  // the left corner folded too far: it veers; the right one the same: it veers the other way; both alike: straight, but less neat
  assert.ok(one(1, 0.8).veer > 0.3 && one(2, 0.8).veer < -0.3);
  const both = R.trimOf('dart', none.map((v, k) => (k === 1 || k === 2 ? 0.8 : v)));
  assert.ok(Math.abs(both.veer) < 1e-9 && both.neat < 0.8 && both.perfect === n - 2);
  assert.ok(one(0, -1).veer < -0.5, 'a crease off the middle pulls the plane to that side');
  assert.ok(one(n - 1, 1).veer > 0.5, 'so do wings that are not folded alike');
  assert.equal(R.trimOf('dart', Array(n).fill(1)).neat, 0);
});

// ------------------------------------------------------------------------------------------------ the flight
test('flight: the same throw is the same flight; too steep stalls, too flat dives, a gentle firm throw goes far', () => {
  const a = fly('dart', { angle: 12, power: 0.9 }), b = fly('dart', { angle: 12, power: 0.9 });
  assert.deepEqual(a, b);
  assert.ok(a.landed && a.dist > 9 && a.dist < 20 && Math.abs(a.y) < 1e-9, `a good throw over level ground: ${a.dist.toFixed(1)} m`);
  assert.ok(!a.stalled && a.loops === 0);
  // steep: it climbs, runs out of speed, stalls and comes down close by
  const steep = fly('dart', { angle: 52, power: 0.9 });
  assert.ok(steep.stalled && steep.top > a.top + 1 && steep.dist < a.dist * 0.65, `steep: ${steep.dist.toFixed(1)} m`);
  assert.equal(R.verdict(steep, R.makePlane('dart'), a.dist), 'stall');
  // flat and soft: nose first into the grass
  const flat = fly('dart', { angle: -5, power: 0.3 });
  assert.ok(flat.dist < 5 && flat.t < 1.2 && flat.top <= R.THROW.hand + 1e-9);
  assert.equal(R.verdict(flat, R.makePlane('dart'), a.dist), 'dive');
  // the Dart: the harder the further, and its best angle is a gentle one
  let best = { dist: 0 };
  for (let angle = -5; angle <= 55; angle += 5) for (const power of [0.4, 0.6, 0.8, 1]) { const s = fly('dart', { angle, power }); if (s.dist > best.dist) best = { dist: s.dist, angle, power }; }
  assert.ok(best.power === 1 && best.angle >= 0 && best.angle <= 25, `the Dart's best throw: ${JSON.stringify(best)}`);
  assert.ok(fly('dart', { angle: 10, power: 1 }).dist > fly('dart', { angle: 10, power: 0.6 }).dist + 4);
  // the speeds of a throw
  assert.equal(R.throwSpeed(0), R.THROW.minSpeed); assert.equal(R.throwSpeed(1), R.THROW.maxSpeed); assert.equal(R.throwSpeed(7), R.THROW.maxSpeed);
  for (let t = 0; t < 12; t += 0.1) { const an = R.aimAt(t), pw = R.powerAt(t); assert.ok(an >= R.THROW.minAngle - 1e-9 && an <= R.THROW.maxAngle + 1e-9 && pw >= 0 && pw <= 1); }
  assert.ok(R.powerAt(R.THROW.fill) > 0.99 && R.powerAt(R.THROW.fill * 1.5) < 0.6, 'held too long, the wind-up runs down again');
});

test('flight: each design has its own character', () => {
  const air = id => { const P = R.makePlane(id); return P.v0 / P.ld; };       // metres it sinks a second on its glide
  assert.ok(air('glider') < 1 && air('dart') > air('glider') * 1.5 && air('bulldog') > air('glider') * 1.5, 'the Glider sinks slowest by far');
  assert.ok(R.DESIGN.dart.v0 > R.DESIGN.bulldog.v0 && R.DESIGN.bulldog.v0 > R.DESIGN.stunt.v0 && R.DESIGN.stunt.v0 > R.DESIGN.glider.v0);
  // the Glider wants a gentle throw: thrown as hard as a Dart it rears up and stalls
  const soft = fly('glider', { angle: 5, power: 0.5 }), hard = fly('glider', { angle: 15, power: 1 });
  assert.ok(!soft.stalled && hard.stalled && soft.dist > hard.dist * 1.5, `Glider soft ${soft.dist.toFixed(1)} m, hard ${hard.dist.toFixed(1)} m`);
  assert.ok(soft.t > fly('dart', { angle: 5, power: 1 }).t, 'and it stays in the air longer than a Dart thrown flat out');
  // thrown soft, the Dart drops at once where the Glider floats
  assert.ok(fly('dart', { angle: 5, power: 0.45 }).dist < soft.dist * 0.7);
  // the Looper loops when it is thrown hard and upward, and only it does so easily
  const loop = fly('stunt', { angle: 45, power: 1 });
  assert.ok(loop.loops >= 1, 'a loop');
  assert.equal(R.verdict(loop, R.makePlane('stunt'), 0), 'loop');
  assert.equal(fly('bulldog', { angle: 45, power: 1 }).loops, 0);
  assert.equal(fly('dart', { angle: 45, power: 1 }).loops, 0);
  // the Bulldog forgives a throw that is too steep for the Dart
  assert.ok(fly('bulldog', { angle: 35, power: 0.9 }).dist > fly('dart', { angle: 35, power: 0.9 }).dist * 1.4);
  for (const d of R.DESIGNS) { assert.equal(d.bars.length, 3); assert.ok(d.bars.every(b => b >= 1 && b <= 5)); assert.ok(d.desc.length <= 100, d.id); }
});

test('flight: the trim. Crooked folds veer, sloppy folds drag, a bent wingtip turns', () => {
  const aim = { angle: 8, power: 0.9 };
  const straight = fly('bulldog', aim), right = fly('bulldog', aim, { trim: { veer: 0.8, neat: 1 } }), left = fly('bulldog', aim, { trim: { veer: -0.8, neat: 1 } });
  assert.ok(Math.abs(straight.y) < 1e-9 && right.y > 1 && left.y < -1 && Math.abs(right.y + left.y) < 1e-6);
  assert.ok(right.dist < straight.dist, 'measured down the field, a curve is shorter');
  const sloppy = fly('bulldog', aim, { trim: { veer: 0, neat: 0.3 } });
  assert.ok(sloppy.dist < straight.dist * 0.92, 'a sloppy plane is a draggy plane');
  assert.ok(fly('bulldog', aim, { tweaks: { tip: 1 } }).y > 1 && fly('bulldog', aim, { tweaks: { tip: -1 } }).y < -1);
  // a wingtip bent the other way straightens a plane that veers
  const fixed = fly('bulldog', aim, { trim: { veer: 0.7, neat: 1 }, tweaks: { tip: -1 } });
  assert.ok(Math.abs(fixed.y) < Math.abs(fly('bulldog', aim, { trim: { veer: 0.7, neat: 1 } }).y) * 0.4);
  assert.equal(R.verdict(fly('glider', { angle: 5, power: 0.5 }, { trim: { veer: 1, neat: 1 }, tweaks: { tip: 1 } }), R.makePlane('glider'), 0), 'veer');
});

test('flight: the elevator and the paper clip', () => {
  const P0 = R.makePlane('dart'), P1 = R.makePlane('dart', { elev: 1 }), P3 = R.makePlane('dart', { elev: 3 }), C = R.makePlane('dart', { clip: 1 });
  assert.ok(P1.v0 < P0.v0 && P3.v0 < P1.v0, 'back edges up: it flies slower, nose higher');
  assert.ok(P3.ld < P1.ld && P3.steady < P0.steady && P3.stallQ > P0.stallQ, 'bent up a lot: draggy, twitchy, and it stalls sooner');
  assert.ok(C.v0 > P0.v0 && C.steady > P0.steady, 'a clip on the nose: faster and steadier');
  // a little elevator saves a Dart that is not thrown flat out; a lot of it stalls a Glider
  const aim = { angle: 8, power: 0.8 };
  assert.ok(fly('dart', aim, { tweaks: { elev: 1 } }).dist > fly('dart', aim).dist + 0.8);
  const d3 = fly('dart', aim, { tweaks: { elev: 3 } });
  assert.ok(d3.stalled && d3.dist < fly('dart', aim).dist * 0.8, 'bent up a lot, the Dart stalls too');
  const g0 = fly('glider', { angle: 5, power: 0.5 }), g3 = fly('glider', { angle: 5, power: 0.5 }, { tweaks: { elev: 3 } });
  assert.ok(!g0.stalled && g3.stalled && g3.dist < g0.dist * 0.8, `elevator 3 on the Glider: ${g3.dist.toFixed(1)} m against ${g0.dist.toFixed(1)}`);
  // into a headwind the clip carries a light, floating plane further
  const head = { ...R.makeDay(3, 'normal'), wind: { x: -2.4, y: 0 } };
  const gl = fly('glider', { angle: 5, power: 0.9 }, { day: head }), glc = fly('glider', { angle: 5, power: 0.9 }, { day: head, tweaks: { clip: 1 } });
  assert.ok(glc.dist > gl.dist + 1, `the Glider into the wind: ${gl.dist.toFixed(1)} m, with a clip ${glc.dist.toFixed(1)} m`);
  // ...and it rides a gust more calmly: its heading is turned less
  const gusty = { ...head, wind: { x: 0, y: 0 }, gusts: [{ t: 0.5, dur: 1.2, x: 0, y: 1.6 }] };
  const turn = tweaks => { const P = R.makePlane('glider', tweaks), s = R.newThrow(P, { angle: 5, power: 0.5 }, gusty); let m = 0; for (let i = 0; i < 80; i++) { R.stepPlane(s, P, gusty, 1 / 60); m = Math.max(m, Math.abs(s.psi)); } return m; };
  assert.ok(turn({ clip: 1 }) < turn({}) * 0.85);
});

test('flight: wind and the thermal', () => {
  const day = (x, y = 0) => ({ ...R.makeDay(3, 'normal'), wind: { x, y }, ring: null });
  const bestOf = (id, d, ground) => R.bestThrow(d, ground, { designs: [id] }).dist;
  // over the real hill: a tailwind carries the Glider furthest, a headwind stops it and the Dart pushes through
  const tail = day(1.5), head = day(-2.4);
  assert.ok(bestOf('glider', tail, hill) > bestOf('dart', tail, hill) + 5, `tailwind: Glider ${bestOf('glider', tail, hill).toFixed(0)} m, Dart ${bestOf('dart', tail, hill).toFixed(0)} m`);
  assert.ok(bestOf('dart', head, hill) > bestOf('glider', head, hill) + 8, `headwind: Dart ${bestOf('dart', head, hill).toFixed(0)} m, Glider ${bestOf('glider', head, hill).toFixed(0)} m`);
  assert.ok(bestOf('glider', tail, hill) > bestOf('glider', day(0), hill) + 5 && bestOf('glider', head, hill) < bestOf('glider', day(0), hill) - 5);
  // a side wind carries a plane sideways: more the slower it flies
  const side = day(0, 1.5), gs = fly('glider', { angle: 5, power: 0.5 }, { day: side }), ds = fly('dart', { angle: 5, power: 1 }, { day: side });
  assert.ok(gs.y > 1 && ds.y > 0.2 && gs.y > ds.y * 2);
  // the wind of a throw: steady, plus the gusts of that throw
  const H = R.makeDay(5, 'hard');
  assert.ok(H.gusts.length > 8 && H.thermal && H.thermal.w > 0.5);
  const g = H.gusts[0], mid = R.windAt(H, g.t + g.dur / 2);
  assert.ok(Math.abs(mid.x - (H.wind.x + g.x)) < 1e-9 && Math.abs(mid.y - (H.wind.y + g.y)) < 1e-9);
  assert.deepEqual(R.windAt(H, g.t - 0.01), H.wind);
  assert.notDeepEqual(R.windAt(H, g.t + g.dur / 2, 1), mid, 'the second throw of a round meets other gusts');
  // the thermal: air rising over the sunny field. Strongest in the middle, nothing outside; the slow Glider gains the most
  const th = { ...day(0), thermal: { x: 9, y: 0, r: 5.5, w: 0.9 } };
  assert.equal(R.liftAt(th, 9, 0), 0.9); assert.equal(R.liftAt(th, 9, 5.6), 0); assert.ok(R.liftAt(th, 11, 1) > 0.5);
  const gain = (id, aim) => fly(id, aim, { day: th }).dist - fly(id, aim, { day: day(0) }).dist;
  assert.ok(gain('glider', { angle: 5, power: 0.5 }) > 0.8 && gain('glider', { angle: 5, power: 0.5 }) > gain('dart', { angle: 8, power: 1 }) + 0.5);
});

// ------------------------------------------------------------------------------------------------ the levels
test('levels: Easy the Dart in still air with the flight drawn; Normal four planes, a light wind, the elevator, a ring; Difficult every trim, gusts, a thermal and a goal', () => {
  const E = R.makeDay(4, 'easy'), N = R.makeDay(4, 'normal'), H = R.makeDay(4, 'hard');
  assert.deepEqual(R.makeDay(4, 'hard', true), E, 'the guided first try is Easy\'s day');
  assert.deepEqual(R.makeDay(4, 'hard'), H); assert.notDeepEqual(R.makeDay(5, 'hard'), H);
  assert.deepEqual([E.designs, E.tweaks, E.path, E.kind, E.wind], [['dart'], [], true, 'calm', { x: 0, y: 0 }]);
  assert.ok(!E.ring && !E.thermal && !E.gusts.length);
  assert.deepEqual([N.designs.length, N.tweaks, N.path], [4, ['elev'], false]);
  assert.ok(N.ring && N.ring.r > 2 && !N.thermal && !N.gusts.length);
  assert.deepEqual([H.designs.length, H.tweaks, H.path], [4, ['elev', 'clip', 'tip'], false]);
  assert.ok(!H.ring && H.thermal && H.gusts.length);
  const kinds = { tail: 0, head: 0, cross: 0 };
  for (let seed = 1; seed <= 120; seed++) {
    const n = R.makeDay(seed, 'normal'), h = R.makeDay(seed, 'hard');
    kinds[h.kind]++;
    assert.ok(Math.abs(n.wind.x) >= 0.8 && Math.abs(n.wind.x) <= 1.4 && Math.abs(n.wind.y) <= 0.3 && ['tail', 'head'].includes(n.kind));
    assert.ok(Math.hypot(h.wind.x, h.wind.y) > Math.abs(n.wind.x) - 0.2 && Math.hypot(h.wind.x, h.wind.y) <= 3.1);
    assert.ok(n.ring.x >= 17 && n.ring.x <= 26 && Math.abs(n.ring.y) <= 2.5, 'the ring lies on the field, where a fair throw lands');
    assert.ok(h.thermal.x > 12 && h.thermal.x < 25 && Math.abs(h.thermal.y) <= 3);
    assert.ok(hill(n.ring.x, n.ring.y) > -90 && hill(h.thermal.x, h.thermal.y) > -90, 'on dry ground');
  }
  assert.ok(kinds.tail > 30 && kinds.head > 30 && kinds.cross > 8, JSON.stringify(kinds));
});

test('levels: the Difficult goal wants the right plane for the day\'s wind', () => {
  const wrong = { tail: 'dart', head: 'glider', cross: 'glider' }, right = { tail: 'glider', head: 'dart', cross: 'dart' };
  let asked = 0, n = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const day = R.makeDay(seed, 'hard');
    day.goal = R.dayGoal(day, hill);
    const all = R.bestThrow(day, hill);
    assert.ok(day.goal >= 12 && day.goal <= 60 && day.goal < all.dist, `seed ${seed}: goal ${day.goal} of ${all.dist.toFixed(0)} m`);
    assert.ok(all.dist < 95, 'even the best throw lands before the wood');
    n++;
    if (R.bestThrow(day, hill, { designs: [wrong[day.kind]] }).dist < day.goal) asked++;
    if (right[day.kind]) assert.ok(R.bestThrow(day, hill, { designs: [right[day.kind]] }).dist >= day.goal, `seed ${seed} (${day.kind}): the ${right[day.kind]} reaches ${day.goal} m`);
  }
  assert.ok(asked >= n * 0.8, `on ${asked} of ${n} days the wrong plane cannot reach the goal`);
});

test('scoring: the best of three throws in metres, the ring, the goal, a loop, the exact folds', () => {
  const N = R.makeDay(4, 'normal'), H = { ...R.makeDay(4, 'hard'), goal: 30 };
  const s = R.planeScore(N, [{ dist: 12.9 }, { dist: 21.4, ring: true }, { dist: 40, wet: true }], 5);
  assert.deepEqual(s, { best: 21.4, ring: true, loop: false, goal: false, score: 21 + R.POINTS.ring + 5 });
  assert.equal(R.planeScore(N, [], 0).score, 0);
  assert.equal(R.planeScore(H, [{ dist: 29.9 }], 0).score, 29);
  assert.equal(R.planeScore(H, [{ dist: 30.2 }, { dist: 4, loops: 1 }], 7).score, 30 + R.POINTS.goal + R.POINTS.loop + 7);
  // the ring: only a plane that lands inside it, on dry ground
  const ring = { ...N, ring: { x: 20, y: 0, r: 3 } };
  assert.ok(R.inRing(ring, { x: 21, y: 2, wet: false }) && !R.inRing(ring, { x: 24, y: 0, wet: false }) && !R.inRing(ring, { x: 20, y: 0, wet: true }) && !R.inRing(H, { x: 20, y: 0 }));
  // a plane that comes down in the river is wet and does not count
  const river = (x, y) => (x > 6 ? -103 : 0);
  const w = R.flyThrow(R.makePlane('dart'), { angle: 10, power: 1 }, R.makeDay(1, 'easy'), river);
  assert.ok(w.landed && w.wet && w.x > 6);
  assert.equal(R.verdict(w, R.makePlane('dart'), 0), 'wet');
  assert.equal(R.planeScore(N, [{ dist: w.dist, wet: w.wet }], 2).score, 2);
});

// three kinds of player on the real hill (seeded): a novice throws the Dart anyhow, a steady hand throws it well whatever
// the wind, a reader picks the plane and the trim for the day's wind
function round(level, seed, who) {
  const day = R.makeDay(seed, level), Q = R.rng(seed * 31 + who.length * 7 + 3), u = (a, b) => a + (b - a) * Q();
  if (level === 'hard') day.goal = R.dayGoal(day, hill);
  const smart = who === 'reader';
  const design = !smart || day.designs.length === 1 ? 'dart' : day.kind === 'tail' ? 'glider' : 'dart';
  const slop = who === 'novice' ? 0.85 : who === 'steady' ? 0.5 : 0.32;
  const f = R.foldDesign(design, R.DESIGN[design].fold(0).map(() => u(-slop, slop)), day.level), trim = R.trimOf(design, f.errs);
  const tweaks = { elev: smart && day.tweaks.includes('elev') && design === 'dart' ? 1 : 0, clip: smart && day.tweaks.includes('clip') && day.kind === 'head' && design !== 'dart' ? 1 : 0, tip: 0 };
  const P = R.makePlane(design, tweaks, trim), throws = [];
  let aim0 = { dist: 0 };
  if (who !== 'novice') { const P0 = R.makePlane(design, tweaks); for (let a = 0; a <= 40; a += 5) for (let p = 0.3; p <= 1.001; p += 0.1) { const s = R.flyThrow(P0, { angle: a, power: p }, day, hill, { dt: 1 / 40 }); if (!s.wet && s.dist > aim0.dist) aim0 = { dist: s.dist, angle: a, power: p }; } }
  for (let i = 0; i < R.THROW.throws; i++) {
    const aim = who === 'novice' ? { angle: u(-4, 50), power: u(0.25, 1) } : who === 'steady' ? { angle: 14 + u(-9, 9), power: Math.min(1, 0.85 + u(-0.2, 0.15)) } : { angle: aim0.angle + u(-5, 5), power: Math.min(1, aim0.power + u(-0.12, 0.08)) };
    const s = R.flyThrow(P, aim, day, hill, { nth: i });
    throws.push({ dist: s.dist, ring: R.inRing(day, s), loops: s.loops, wet: s.wet });
  }
  return R.planeScore(day, throws, trim.perfect).score;
}

test('levels: the stars. One on Easy for any plane that flies; three on Difficult for reading the wind', () => {
  const N = 40;
  const stars = (level, who, q = 0.5) => starsFor(med(Array.from({ length: N }, (_, i) => round(level, i + 1, who)), q), levelSpec(TRICK.planes, level).stars);
  // Easy: nearly every novice round earns a star; a steady hand two; the best flight with tidy folds three
  assert.ok(stars('easy', 'novice', 0.2) >= 1);
  assert.ok(stars('easy', 'steady') >= 2);
  assert.equal(stars('easy', 'reader'), 3);
  // Normal: a novice about one star, a steady Dart whatever the wind not three, the right plane three
  assert.ok(stars('normal', 'novice') <= 1 && stars('normal', 'novice', 0.8) >= 1);
  assert.ok(stars('normal', 'steady') >= 1 && stars('normal', 'steady') <= 2);
  assert.equal(stars('normal', 'reader'), 3);
  // Difficult: the Dart thrown well, whatever the wind, is one star most days; reading the wind is three on a typical day
  assert.ok(stars('hard', 'novice') === 0 && stars('hard', 'steady') === 1);
  assert.equal(stars('hard', 'reader'), 3);
  assert.ok(stars('hard', 'reader', 0.25) >= 1);
  for (const l of LEVELS) { const s = levelSpec(TRICK.planes, l).stars; assert.ok(s[0] < s[1] && s[1] < s[2]); }
});

test('the planes module: play(), and no three.js or DOM in the rules', async () => {
  const m = (await import('../src/game/tricks/planes.js')).default;
  assert.equal(m.id, 'planes');
  assert.equal(typeof m.play, 'function');
  const rules = fs.readFileSync(new URL('../src/game/tricks/rules-planes.js', import.meta.url), 'utf8');
  assert.ok(!/from 'three'|document\.|window\./.test(rules));
  const round = fs.readFileSync(new URL('../src/game/tricks/planes.js', import.meta.url), 'utf8');
  assert.match(round, /finally \{/, 'the round puts everything back in a finally');
  assert.ok(!/\.glb|ensureModels/.test(round), 'no model files: everything is drawn');
});
