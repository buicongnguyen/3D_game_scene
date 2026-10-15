// Morning exercise: the routines, the timing, the balance of a hold, the mirror, the scoring (game/tricks/rules-exercise.js),
// where the class stands (game/tricks/exercise.js STAGE) and the clips the round asks of the packs (exercise-moves.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ROUTINES, MOVES, TEMPO, WINDOWS, LEVEL_MAX, STARS, BALANCE, KEYS, makeRoutine, itemAt, moveAt, judge, Session, balanceStep, wobbleForce,
  demoSide, demoPhase, demoHoldSide, starsAt, breathingIn,
} from '../src/game/tricks/rules-exercise.js';
import { retargetClip, prepareMoves, closestPack, PACKS } from '../src/game/tricks/exercise-moves.js';
import { STAGE } from '../src/game/tricks/exercise.js';
import { TRICK } from '../src/content/tricks.js';
import { EXERCISE_CLIPS } from './asset-contracts.mjs';
import { placeProblems } from '../src/world/roads.js';

const LEVELS = ['easy', 'normal', 'hard'];
const SECONDS = { easy: [60, 80], normal: [88, 112], hard: [115, 142] };

/** Play a plan with a simple player: hit(cue) -> 'great' | 'good' | 'miss'; steady 0..1 share of each hold kept; breath likewise. */
function playThrough(plan, { hit = () => 'great', steer = true, hold = true, breathe = true, seed = 3 } = {}) {
  const S = new Session(plan, seed), cs = plan.count, dt = 1 / 60;
  const W = WINDOWS[plan.level];
  let qi = 0;
  for (let t = 0; t <= plan.seconds + 0.5; t += dt) {
    const c = t / cs;
    while (qi < plan.cues.length && plan.cues[qi].at * cs <= t) {
      const q = plan.cues[qi], how = hit(q, qi);
      if (how === 'great') S.press(q.key, q.at * cs + W.great * 0.5);
      else if (how === 'good') S.press(q.key, q.at * cs + (W.great + W.good) / 2);
      else if (how === 'wrong') S.press(q.key === 'left' ? 'right' : 'left', q.at * cs);
      qi++;
    }
    const b = plan.breaths.find(x => c >= x.from && c < x.to);
    const holding = b ? (breathe ? breathingIn(b, c) : false) : hold;
    S.tick(t, dt, { hold: holding, steer: steer ? (Math.abs(S.bal.w) > 0.08 ? -Math.sign(S.bal.w) : 0) : 0 });
  }
  return S;
}

test('three routines at three levels: about 70, 100 and 130 seconds, laid out count after count', () => {
  for (const routine of ROUTINES) for (const level of LEVELS) {
    const p = makeRoutine({ routine, level });
    const [lo, hi] = SECONDS[level];
    assert.ok(p.seconds >= lo && p.seconds <= hi, `${routine} ${level}: ${p.seconds.toFixed(0)} s`);
    let t = 0;
    for (const it of p.items) { assert.equal(it.start, t, `${routine} ${level}: items follow each other`); assert.ok(it.n > 0); t += it.n; }
    assert.equal(p.counts, t);
    for (let i = 1; i < p.cues.length; i++) assert.ok(p.cues[i].at > p.cues[i - 1].at, `${routine} ${level}: one cue per count, in order`);
    for (const q of p.cues) assert.ok(KEYS.includes(q.key));
    assert.ok(p.units > 0 && Math.abs(p.unit * p.units - LEVEL_MAX[level]) < 1e-6, 'the cues share the level\'s points');
    assert.equal(p.count, TEMPO[routine][level]);
    // a harder level is longer and faster (yoga breathes: slower counts, but still quicker than on Easy)
    if (level !== 'easy') assert.ok(TEMPO[routine][level] < TEMPO[routine].easy);
  }
  // the radio exercise has the classic moves; the workout a plank on the knees; yoga a tree, the cat and cow, a mouse
  const has = (r, l, m) => makeRoutine({ routine: r, level: l }).items.some(it => it.m === m || it.ms?.includes(m));
  for (const m of ['stretch', 'swing', 'sidebend', 'twist', 'kneebend', 'jump', 'breathe']) assert.ok(has('radio', 'easy', m), `radio: ${m}`);
  for (const m of ['march', 'star', 'squat', 'plank', 'reach']) assert.ok(has('workout', 'easy', m), `workout: ${m}`);
  assert.ok(has('workout', 'normal', 'knees'));
  for (const m of ['mountain', 'tree', 'catcow', 'child', 'balloon']) assert.ok(has('yoga', 'easy', m), `yoga: ${m}`);
  for (const m of ['warrior', 'cobra']) assert.ok(has('yoga', 'normal', m) && !has('yoga', 'easy', m), `yoga: ${m} from Normal on`);
  assert.ok(has('yoga', 'hard', 'bird'));
});

test('levels: Easy shows the move first and holds the card; Normal combines moves; Difficult mirrors and drops the card', () => {
  for (const routine of ['radio', 'workout']) {
    const e = makeRoutine({ routine, level: 'easy' }), n = makeRoutine({ routine, level: 'normal' }), h = makeRoutine({ routine, level: 'hard' });
    const seen = new Set();
    for (const it of e.items.filter(x => x.t === 'move')) { if (!seen.has(it.m)) assert.ok(it.watch >= 4, `${routine}: Easy watches ${it.m} first`); seen.add(it.m); }
    assert.ok(!e.items.some(it => it.t === 'combo') && n.items.some(it => it.t === 'combo'), `${routine}: combined moves from Normal`);
    assert.ok(h.items.some(it => it.mirror && it.card === 'word') && h.items.some(it => it.card === 'none'), `${routine}: mirror and follow-me on Difficult`);
    assert.ok(!n.items.some(it => it.mirror || it.card === 'none'));
    assert.ok(WINDOWS.easy.good > WINDOWS.normal.good && WINDOWS.normal.good > WINDOWS.hard.good, 'timing gets tighter');
  }
  // yoga holds: longer and wobblier on Difficult
  const ye = makeRoutine({ routine: 'yoga', level: 'easy' }), yh = makeRoutine({ routine: 'yoga', level: 'hard' });
  const tree = p => p.holds.find(x => x.m === 'tree');
  assert.ok(tree(yh).to - tree(yh).from > tree(ye).to - tree(ye).from);
  assert.ok(tree(yh).drift > tree(ye).drift);
  // the guided first round shows every move before it asks for it
  assert.ok(makeRoutine({ routine: 'radio', level: 'easy', first: true }).items.filter(it => it.t === 'move').every(it => it.watch >= 4));
  // the stars: one on Easy is about a third of the counts
  assert.ok(STARS.easy[0] <= LEVEL_MAX.easy * 0.32);
  for (const l of LEVELS) assert.deepEqual(TRICK.exercise.levels[l].stars, STARS[l], `the trick row has the rules' stars (${l})`);
});

test('timing windows: Great, then Good, then nothing; the wrong side is an Oops', () => {
  for (const l of LEVELS) {
    const W = WINDOWS[l];
    assert.equal(judge(0, l), 'great');
    assert.equal(judge(-W.great, l), 'great');
    assert.equal(judge(W.great + 0.001, l), 'good');
    assert.equal(judge(-W.good, l), 'good');
    assert.equal(judge(W.good + 0.001, l), null);
  }
  const p = makeRoutine({ routine: 'radio', level: 'normal' }), S = new Session(p), cs = p.count;
  const side = p.cues.find(q => q.key === 'left');
  assert.equal(S.press('right', side.at * cs).result, 'wrong', 'the other side');
  const next = p.cues.find(q => q.at > side.at + 2);
  assert.equal(S.press(next.key, next.at * cs - 1.5).result, null, 'far too early answers nothing');
  assert.equal(S.press(next.key, next.at * cs + 0.05).result, 'great');
  assert.equal(S.press(next.key, next.at * cs + 0.06).result, null, 'a cue is answered once');
  // a cue nobody answered is missed once its window has passed
  const S2 = new Session(p), q0 = p.cues[0];
  const { missed } = S2.tick(q0.at * cs + WINDOWS.normal.good + 0.01, 0.016);
  assert.ok(missed.includes(q0));
  assert.equal(S2.miss, 1);
});

test('the balance of a hold: small taps against the wobble keep it steady; a harder level wobbles more', () => {
  for (const l of LEVELS) {
    const drift = BALANCE.drift[l];
    let steadyHelp = 0, steadyNone = 0;
    const a = { w: 0, v: 0 }, b = { w: 0, v: 0 };
    for (let t = 0; t < 20; t += 1 / 60) {
      const f = wobbleForce(t, 5, drift);
      balanceStep(a, 1 / 60, f, Math.abs(a.w) > 0.1 ? -Math.sign(a.w) : 0);
      balanceStep(b, 1 / 60, f, 0);
      if (Math.abs(a.w) < BALANCE.steady) steadyHelp++;
      if (Math.abs(b.w) < BALANCE.steady) steadyNone++;
      assert.ok(Math.abs(a.w) <= 1 && Math.abs(b.w) <= 1, 'the needle stays on its bar');
    }
    assert.ok(steadyHelp / 1200 > 0.9, `${l}: steering keeps it steady (${(steadyHelp / 12).toFixed(0)} %)`);
    assert.ok(steadyNone < steadyHelp, `${l}: doing nothing is worse`);
  }
  // the same seed wobbles the same way
  assert.equal(wobbleForce(3.3, 9, 1), wobbleForce(3.3, 9, 1));
  assert.notEqual(wobbleForce(3.3, 9, 1), wobbleForce(3.3, 10, 1));
});

test('mirror: facing the class the instructor shows sides as in a mirror; in a mirror section her left is your right', () => {
  assert.equal(demoSide('left', false), 'left');
  assert.equal(demoSide('left', true), 'right');
  assert.equal(demoSide('right', true), 'left');
  assert.equal(demoSide('up', true), 'up');
  for (const [m, mv] of Object.entries(MOVES)) {
    if (mv.sides) {
      assert.equal(demoPhase(m, false), 0.5, `${m}: half a loop on, as in a mirror`);
      assert.equal(demoPhase(m, true), 0, `${m}: her own side in a mirror section`);
      // a sided move's two halves answer opposite sides: half a loop on is the other side
      const hits = mv.hits.map(([c, k]) => [((c + mv.counts / 2) % mv.counts), k]);
      for (const [c, k] of hits) assert.notEqual(mv.hits.find(h => h[0] === c)?.[1], k, `${m}: the mirrored half is the other side`);
    } else assert.equal(demoPhase(m, false), 0);
  }
  assert.equal(demoHoldSide('L', false), 'R');
  assert.equal(demoHoldSide('L', true), 'L');
});

test('scoring: a perfect round is the level\'s whole worth and three stars; Good is 60 %; a beginner gets a star on Easy', () => {
  for (const routine of ROUTINES) for (const level of LEVELS) {
    const p = makeRoutine({ routine, level, seed: 11 });
    const perfect = playThrough(p);
    assert.ok(Math.abs(perfect.total() - LEVEL_MAX[level]) <= 2, `${routine} ${level}: perfect ${perfect.total()}`);
    assert.equal(starsAt(perfect.total(), level), 3);
    const good = playThrough(p, { hit: () => 'good' });
    const goodCues = p.cues.length * p.unit * 0.6, rest = LEVEL_MAX[level] - p.cues.length * p.unit;
    assert.ok(Math.abs(good.total() - (goodCues + rest)) <= 2, `${routine} ${level}: all Good ${good.total()}`);
    const nothing = playThrough(p, { hit: () => 'miss', hold: false, breathe: false, steer: false });
    assert.ok(nothing.total() <= LEVEL_MAX[level] * 0.12, `${routine} ${level}: doing nothing ${nothing.total()}`);
    assert.equal(nothing.great + nothing.good, 0);
  }
  // a beginner on Easy: half the counts a bit late, a few missed, holds kept without steering
  for (const routine of ROUTINES) {
    const p = makeRoutine({ routine, level: 'easy', seed: 4 });
    const S = playThrough(p, { hit: (q, i) => (i % 4 === 3 ? 'miss' : i % 2 ? 'good' : 'great'), steer: false });
    assert.ok(starsAt(S.total(), 'easy') >= 1, `${routine}: a beginner gets a star on Easy (${S.total()})`);
  }
});

test('the plan answers where it is: items and moves at a count', () => {
  const p = makeRoutine({ routine: 'radio', level: 'normal' });
  const combo = p.items.find(it => it.t === 'combo');
  assert.equal(itemAt(p, combo.start + 1).item, combo);
  assert.equal(moveAt(combo, combo.start + 1).m, combo.ms[0]);
  assert.equal(moveAt(combo, combo.start + 5).m, combo.ms[1]);
  assert.equal(moveAt(combo, combo.start - 0.2).m, combo.ms[1], 'a count before its start still names a move');
  assert.equal(itemAt(p, p.counts + 1), null);
});

test('every clip the round plays is in the packs', () => {
  const want = new Set();
  for (const mv of Object.values(MOVES)) {
    if (mv.side) for (const s of ['L', 'R']) { want.add(mv.clip + s); want.add(`${mv.clip}In${s}`); } else want.add(mv.clip);
  }
  for (const routine of ROUTINES) for (const level of LEVELS) for (const it of makeRoutine({ routine, level }).items) if (it.t === 'trans') want.add(it.clip);
  want.add('ExMountain');
  for (const c of want) assert.ok(EXERCISE_CLIPS.includes(c), `${c} is in the clip packs`);
  assert.deepEqual([...PACKS].sort(), ['mika', 'rin', 'villager-kid', 'villager-man']);
});

test('a borrowed pack keeps rotations, drops bone lengths and moves the hips to the borrower\'s height', () => {
  const clip = new THREE.AnimationClip('ExTest', 1, [
    new THREE.QuaternionKeyframeTrack('spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
    new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.65, 0, 0.02, 0.6, 0.01]),
    new THREE.VectorKeyframeTrack('thigh_L.position', [0, 1], [0.08, 0, 0, 0.08, 0, 0]),
    new THREE.VectorKeyframeTrack('thigh_L.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
  ]);
  const own = retargetClip(clip, {});
  assert.deepEqual(own.tracks.map(t => t.name), ['spine.quaternion', 'hips.position']);
  [0, 0.65, 0, 0.02, 0.6, 0.01].forEach((x, i) => assert.ok(Math.abs(own.tracks[1].values[i] - x) < 1e-6, 'its own pack plays as authored'));
  const lent = retargetClip(clip, { srcHips: new THREE.Vector3(0, 0.65, 0), dstHips: new THREE.Vector3(0, 0.82, 0), borrowed: true });
  const v = lent.tracks[1].values, k = 0.82 / 0.65;
  assert.ok(Math.abs(v[1] - 0.82) < 1e-6, 'standing: the borrower\'s own hip height');
  assert.ok(Math.abs(v[4] - (0.82 - 0.05 * k)) < 1e-6 && Math.abs(v[3] - 0.02 * k) < 1e-6, 'the dip and the sway scale with the body');
  assert.equal(closestPack(0.8, { mika: 0.65, rin: 0.68, 'villager-man': 0.82, 'villager-kid': 0.49 }), 'villager-man');
  assert.equal(closestPack(0.55, { mika: 0.65, rin: 0.68, 'villager-man': 0.82, 'villager-kid': 0.49 }), 'villager-kid');
  // a pack from a GLTF result: every clip, keyed by name
  const root = new THREE.Group(), hips = new THREE.Object3D(); hips.name = 'hips'; hips.position.set(0, 0.7, 0); root.add(hips);
  const m = prepareMoves({ animations: [clip], scene: root }, root, root, false);
  assert.ok(m.get('ExTest'));
});

test('where the class stands: dry, flat lawn for everybody, the stage, the radio and the camera', () => {
  const st = TRICK.exercise.stage, f = { x: Math.sin(st.face), z: Math.cos(st.face) }, r = { x: -f.z, z: f.x };
  const spot = o => [st.x + f.x * o.f + r.x * o.r, st.z + f.z * o.f + r.z * o.r];
  const spots = { instructor: STAGE.instructor, radio: STAGE.radio, mika: STAGE.mika, camera: STAGE.camera, floorCamera: STAGE.floorCamera, ...Object.fromEntries([...STAGE.kids, ...STAGE.adults].map((o, i) => [`n${i}`, o])) };
  for (const [k, o] of Object.entries(spots)) assert.deepEqual(placeProblems(...spot(o)), [], `${k} at ${spot(o).map(v => v.toFixed(1))}`);
  // the corners of the stage and of everybody's mat
  for (const dr of [-1, 1]) for (const df of [-1, 1]) assert.deepEqual(placeProblems(...spot({ f: STAGE.platform.f + df * STAGE.platform.d / 2, r: STAGE.platform.r + dr * STAGE.platform.w / 2 })), []);
  for (const o of [STAGE.mika, ...STAGE.kids, ...STAGE.adults]) for (const df of [-1.1, 1.1]) assert.deepEqual(placeProblems(...spot({ f: o.f + df, r: o.r })), []);
  // the sign is a few steps from the class and from no other trick's sign
  assert.ok(Math.hypot(TRICK.exercise.place.x - st.x, TRICK.exercise.place.z - st.z) < 9);
});
