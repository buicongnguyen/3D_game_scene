// How to ride and race (rules-cowhelp.js, the practice beat in rules-cowrace.js) and the riders' seat (cow-rig.js, animator.js):
// the pure logic, in Node. The real-browser checks (every rider seated in every phase, the tutorial followed by its own words)
// are .tools/review/cows3/*.mjs; see the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { BEAT, PRACTICE_BEAT, newRace, stepRace, tap, tapKind, beatPhase, beatOffset, gradeTap, simulate, MASH_GAP } from '../src/game/tricks/rules-cowrace.js';
import {
  RIDE_STEPS, rideStepText, newRideCoach, stepRideCoach, skipRideStep, rideCoachDone, COACH_NEED, COACH_DONE_BEAT,
  raceStepText, tapLabel, coachLine, COACH_TAPS, ghostDue, GHOST_AFTER, STARS_NOTE, cowHintText,
} from '../src/game/tricks/rules-cowhelp.js';
import { riderClip, riderPose, isSeatedClip, isRideClip, seatRider, ensureSeated, gaitFor, RIDE_CLIPS } from '../src/actors/cow-rig.js';
import { Animator } from '../src/actors/animator.js';

// ---------------------------------------------------------------------------------------------------- the free-ride coach
test('the free-ride coach has three steps with text for a phone and for a keyboard, no empty strings', () => {
  assert.equal(RIDE_STEPS.length, 3);
  for (const touch of [false, true]) {
    for (let i = 0; i <= RIDE_STEPS.length; i++) {
      const t = rideStepText(i, touch);
      assert.ok(t.title && t.text, `step ${i} touch=${touch}`);
      assert.ok(t.text.length <= 80, `short enough for the card: ${t.text}`);
    }
  }
  // the words name the right controls
  assert.match(rideStepText(0, false).text, /W A S D|arrow/);
  assert.match(rideStepText(0, true).text, /left side/);
  assert.match(rideStepText(1, false).text, /E or Shift/);
  assert.match(rideStepText(1, true).text, /Gallop button/);
  assert.match(rideStepText(2, false).text, /M .*Space/);
  assert.match(rideStepText(2, true).text, /Moo!.*Hop off/);
});

test('the coach moves on by doing: steer, hold to gallop, moo; nothing else advances it', () => {
  const c = newRideCoach();
  for (let i = 0; i < 600; i++) stepRideCoach(c, 1 / 60, { steering: false, holding: true, mooed: true });
  assert.equal(c.step, 0, 'holding and mooing do not do step 1');
  let changed = false;
  for (let i = 0; i < 60 * (COACH_NEED.steer + 0.3); i++) changed = stepRideCoach(c, 1 / 60, { steering: true }) || changed;
  assert.ok(c.doneT > 0 || c.step === 1, 'steering long enough completes step 1');
  for (let i = 0; i < 60 * (COACH_DONE_BEAT + 0.2); i++) changed = stepRideCoach(c, 1 / 60, {}) || changed;
  assert.ok(changed && c.step === 1, 'a short "well done" beat, then step 2');
  for (let i = 0; i < 30; i++) stepRideCoach(c, 1 / 60, { steering: true, holding: false });
  assert.equal(c.step, 1, 'steering does not do step 2');
  for (let i = 0; i < 60 * (COACH_NEED.hold + COACH_DONE_BEAT + 0.4); i++) stepRideCoach(c, 1 / 60, { holding: true });
  assert.equal(c.step, 2);
  stepRideCoach(c, 1 / 60, { mooed: true });
  for (let i = 0; i < 60 * (COACH_DONE_BEAT + 0.2); i++) stepRideCoach(c, 1 / 60, {});
  assert.ok(rideCoachDone(c), 'moo finishes the coach');
  assert.equal(stepRideCoach(c, 1, { steering: true }), false, 'a finished coach stays finished');
});

test('Next skips a step, three skips finish', () => {
  const c = newRideCoach();
  skipRideStep(c); assert.equal(c.step, 1);
  skipRideStep(c); skipRideStep(c); assert.ok(rideCoachDone(c));
  skipRideStep(c); assert.equal(c.step, RIDE_STEPS.length);
});

// ---------------------------------------------------------------------------------------------------- the race card and the beat
test('the race card has three steps for a phone and a keyboard', () => {
  for (const touch of [false, true]) for (let i = 0; i < 3; i++) { const t = raceStepText(i, touch); assert.ok(t.title.startsWith(`${i + 1}.`), t.title); assert.ok(t.text.length > 10); }
  assert.match(raceStepText(1, false).text, /ring closes/);
  assert.match(raceStepText(1, true).text, /Giddy-up!.*ring closes/);
  assert.match(raceStepText(2, false).text, /grass/);
  assert.match(raceStepText(2, false).text, /too fast|mash/i);
});

test('a race day with a bareback heat has a fourth step: keep your balance (the first three stay as they were)', async () => {
  const { RACE_STEPS } = await import('../src/game/tricks/rules-cowhelp.js');
  assert.deepEqual(RACE_STEPS, ['rsteer', 'rbeat', 'rmash', 'rbalance']);
  for (const touch of [false, true]) { const t = raceStepText(3, touch); assert.ok(t.title.startsWith('4.') && /tips/.test(t.text) && t.text.length < 90, t.text); }
  assert.match(raceStepText(3, false).text, /A or D/); assert.match(raceStepText(3, true).text, /Drag/);
  assert.equal(raceStepText(2, true).title, '3. Do not mash'); assert.equal(raceStepText(7, true).title, '3. Do not mash');
  // the card is told about the day by the race, and the gauge is one drawing shared by the card's picture and the race
  const help = fs.readFileSync(new URL('../src/actors/cow-help.js', import.meta.url), 'utf8'), race = fs.readFileSync(new URL('../src/game/tricks/cowrace.js', import.meta.url), 'utf8');
  assert.match(help, /RACE_STEPS\.slice\(0, balance \? 4 : 3\)/); assert.match(help, /case 'rbalance'/); assert.match(help, /export function gaugeSvg/);
  assert.match(race, /balance: dayBalance/); assert.match(race, /gaugeSvg\(/);
  // a fallen rider is the one exception to the seat check, and nothing of the lean outlives the round
  assert.match(race, /if \(p\.mounted && !riders\[0\]\.spill\) fix\(p\.anim, 'mika'\)/);
  assert.match(race.slice(race.indexOf('const cleanup')), /poseRiders\(\);[\s\S]*fallM\.removeFromParent\(\)/);
});

test('the practice beat is slower, grading and mashing follow it, and a default race is unchanged', () => {
  assert.ok(PRACTICE_BEAT > BEAT * 1.15, 'the practice ring is clearly slower');
  const normal = newRace({ seed: 3 }), practice = newRace({ seed: 3, assist: 1, beat: PRACTICE_BEAT });
  assert.equal(normal.beat, BEAT);
  assert.equal(practice.beat, PRACTICE_BEAT);
  assert.equal(gradeTap(normal, BEAT * 4), 'good');
  assert.equal(gradeTap(practice, PRACTICE_BEAT * 4), 'good');
  assert.notEqual(gradeTap(practice, BEAT * 4 + 0.02 + PRACTICE_BEAT / 2), 'good', 'between the slow beats is not a hit');
  // a tap on a practice beat is good, the same time on the normal beat is not
  const t = PRACTICE_BEAT * 5;
  assert.equal(gradeTap(practice, t), 'good');
  assert.notEqual(gradeTap(normal, t), 'good');
  // taps closer than 55 % of the beat are mashing, on either beat
  practice.t = 3; tap(practice); practice.t = 3 + PRACTICE_BEAT * 0.5; assert.equal(tap(practice), 'mash');
  normal.t = 3; tap(normal); normal.t = 3 + BEAT * 0.5; assert.equal(tap(normal), 'mash');
  assert.ok(MASH_GAP === BEAT * 0.55, 'the exported gap is still the normal one');
});

test('a beginner on the practice lap still finishes, and a rhythm bot wins it', () => {
  let wins = 0, slowest = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = simulate(seed, { jitter: 0.04 }, { assist: 1, beat: PRACTICE_BEAT });
    assert.ok(r.time != null, `seed ${seed} finished`);
    slowest = Math.max(slowest, r.time);
    if (r.place === 1) wins++;
  }
  assert.ok(wins >= 15, `a careful bot wins the practice lap (${wins}/30)`);
  assert.ok(slowest < 55, `the practice lap is not endless (${slowest.toFixed(1)} s)`);
  // idle on the practice lap: not a win either
  for (let seed = 1; seed <= 10; seed++) assert.ok(simulate(seed, { idle: true }, { assist: 1, beat: PRACTICE_BEAT }).place >= 2);
});

test('beatPhase: the ring closes exactly at each footfall of the race beat', () => {
  for (const beat of [BEAT, PRACTICE_BEAT]) {
    assert.ok(Math.abs(beatPhase(beat * 3, beat).toBeat - beat) < 1e-9 || beatPhase(beat * 3, beat).toBeat < 1e-9);
    const q = beatPhase(beat * 3.25, beat);
    assert.ok(Math.abs(q.f - 0.25) < 1e-9 && Math.abs(q.toBeat - beat * 0.75) < 1e-9);
  }
});

test('tapKind: perfect, good, early, late, mash; and every kind has a word', () => {
  const race = newRace({ seed: 2, assist: 1, beat: PRACTICE_BEAT });
  const b = PRACTICE_BEAT, w = race.window;
  const kind = (t, grade) => tapKind(race, t, grade);
  assert.equal(kind(b * 5, gradeTap(race, b * 5)), 'perfect');
  const gt = b * 5 + w.good * 0.8;
  assert.equal(gradeTap(race, gt), 'good'); assert.equal(kind(gt, 'good'), 'good');
  const early = b * 5 - (w.ok + 0.02), late = b * 5 + (w.ok + 0.02);
  assert.equal(gradeTap(race, early), 'miss'); assert.equal(kind(early, 'miss'), 'early');
  assert.equal(gradeTap(race, late), 'miss'); assert.equal(kind(late, 'miss'), 'late');
  assert.equal(kind(b * 5 - (w.good + 0.03), 'ok'), 'okEarly');
  assert.equal(kind(b * 5 + (w.good + 0.03), 'ok'), 'okLate');
  assert.equal(kind(0, 'mash'), 'mash');
  assert.ok(beatOffset(early, b) < 0 && beatOffset(late, b) > 0, 'negative offset = before the footfall');
  for (const k of ['perfect', 'good', 'okEarly', 'okLate', 'early', 'late', 'mash']) {
    for (const practice of [true, false]) { const l = tapLabel(k, practice); assert.ok(l && l.text && ['good', 'ok', 'bad'].includes(l.tone), k); }
  }
  assert.equal(tapLabel('early', true).text, 'Too early!');
  assert.equal(tapLabel('late', false).text, 'Too late!');
  assert.equal(tapLabel('perfect', true).text, 'Perfect!');
  assert.equal(tapLabel('okEarly', true).text, 'Too early!', 'the practice lap names a near miss');
  assert.equal(tapLabel('okEarly', false).text, 'Nice', 'a normal lap does not nag');
  assert.equal(tapLabel('nope', true), null);
});

test('the teacher reacts to the first three taps only', () => {
  assert.equal(COACH_TAPS, 3);
  for (const k of ['perfect', 'good', 'okEarly', 'early', 'okLate', 'late', 'mash']) for (let n = 0; n < COACH_TAPS; n++) assert.ok(coachLine(k, n), `${k} #${n}`);
  for (const k of ['perfect', 'early', 'mash']) assert.equal(coachLine(k, COACH_TAPS), null);
  assert.match(coachLine('early', 0), /early/i);
  assert.match(coachLine('late', 0), /late/i);
});

test('the ghost tap demo: after five idle seconds, once per idle stretch, never for a player who has the idea', () => {
  assert.equal(GHOST_AFTER, 5);
  assert.equal(ghostDue(4.9, -9, 0), false);
  assert.equal(ghostDue(5.0, -9, 0), true, 'no tap in the first five seconds');
  assert.equal(ghostDue(7, 6.5, 1), false, 'she tapped a moment ago');
  assert.equal(ghostDue(12, 6.5, 1), true, 'then stopped');
  assert.equal(ghostDue(12, -9, 0, 10), false, 'the demo just ended: wait another five seconds');
  assert.equal(ghostDue(16, -9, 0, 10), true);
  assert.equal(ghostDue(30, -9, 3), false, 'three taps: she has got it');
});

test('the results card explains the stars, and the entry hints name the key through {act}', () => {
  assert.match(STARS_NOTE, /1st place = 3 stars/);
  for (const kind of ['ride', 'feed']) for (const near of [true, false]) assert.match(cowHintText(kind, near), /\{act\}/);
  assert.notEqual(cowHintText('ride', true), cowHintText('ride', false));
});

// ---------------------------------------------------------------------------------------------------- the riders' seat
function fakeAnim(names, current = 'Idle', busy = false) {
  const calls = [];
  return { calls, currentName: current, busy, has: n => names.includes(n), snap(n, o) { calls.push(['snap', n, o?.speed]); this.currentName = n; this.busy = false; return true; } };
}

test('a rider clip falls back RideCow -> Sit -> Idle, and a standing clip is never "seated"', () => {
  const kid = fakeAnim([...RIDE_CLIPS, 'Sit', 'Idle']), noRide = fakeAnim(['Sit', 'Idle']), bare = fakeAnim(['Idle']);
  assert.equal(riderClip(kid, 'RideCowLean'), 'RideCowLean');
  assert.equal(riderClip(noRide, 'RideCowLean'), 'Sit', 'the documented fallback');
  assert.equal(riderClip(bare, 'RideCow'), 'Idle');
  assert.equal(riderPose(kid), 'RideCow');
  assert.equal(riderPose(noRide), 'Sit');
  for (const n of RIDE_CLIPS) assert.ok(isRideClip(n) && isSeatedClip(n));
  assert.ok(isSeatedClip('Sit'));
  for (const n of ['Idle', 'Walk', 'Run', 'Talk', 'Cheer', 'Wave', 'Jump', 'Interact', undefined, '']) assert.ok(!isSeatedClip(n), String(n));
  assert.ok(!isRideClip('Sit'));
});

test('the per-frame self-check corrects any rider that is not on a ride clip, and leaves a seated one alone', () => {
  const names = [...RIDE_CLIPS, 'Sit', 'Idle', 'Talk', 'Cheer'];
  for (const bad of ['Idle', 'Talk', 'Cheer', 'Run', '']) {
    const a = fakeAnim(names, bad);
    assert.equal(ensureSeated(a, 'RideCowTrot', 1.2), true, bad);
    assert.equal(a.currentName, 'RideCowTrot');
    assert.deepEqual(a.calls, [['snap', 'RideCowTrot', 1.2]]);
  }
  for (const ok of RIDE_CLIPS.concat('Sit')) { const a = fakeAnim(names, ok); assert.equal(ensureSeated(a), false, ok); assert.equal(a.calls.length, 0); }
  const gesturing = fakeAnim(names, 'RideCow', true);        // a one-shot (a wave, a talk) still owns the animator
  assert.equal(ensureSeated(gesturing), true);
  assert.equal(gesturing.busy, false);
  assert.equal(ensureSeated(null), false);
  assert.equal(seatRider(null), false);
});

test('the gait bands name a ride clip that exists in the kid and Mika contracts', async () => {
  const { CONTRACTS } = await import('./asset-contracts.mjs');
  for (const model of ['mika', 'villager-kid']) for (const c of RIDE_CLIPS) assert.ok(CONTRACTS[model].clips.includes(c), `${model} has ${c}`);
  for (const v of [0.5, 1.9, 2.1, 6.4, 6.6, 12]) assert.ok(isRideClip(gaitFor(v).rider), `speed ${v}`);
  assert.equal(gaitFor(0.1), null);
});

test('Animator.snap poses the skeleton at once (a ride clip is never one frame late), play() alone does not', () => {
  const mk = () => {
    const root = new THREE.Group(), hips = new THREE.Bone();
    hips.name = 'hips'; hips.position.set(0, 0.5, 0);                    // bind: standing, hips at 0.5
    root.add(hips);
    const seated = new THREE.AnimationClip('RideCow', 1, [new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.07, 0, 0, 0.07, 0])]);
    const idle = new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.5, 0, 0, 0.5, 0])]);
    root.userData.clips = [seated, idle];
    return { root, hips, anim: new Animator(root) };
  };
  // the old behaviour: a clip is chosen but the mixer is never ticked -> the bind pose is drawn
  const a = mk();
  a.anim.play('RideCow');
  assert.equal(a.anim.currentName, 'RideCow');
  assert.equal(a.hips.position.y, 0.5, 'the bug: named RideCow, drawn standing');
  // snap: seated on the same call
  const b = mk();
  b.anim.play('Idle'); b.anim.update(0.2);
  assert.equal(b.anim.snap('RideCow'), true);
  assert.ok(Math.abs(b.hips.position.y - 0.07) < 1e-6, `snap poses now: ${b.hips.position.y}`);
  b.anim.update(0.1);
  assert.ok(Math.abs(b.hips.position.y - 0.07) < 1e-6, 'and it stays there (no blend back through Idle)');
  assert.equal(b.anim.currentName, 'RideCow');
  // a gesture still playing is dropped
  const c = mk();
  c.anim.once('Idle', { then: 'Idle' });
  assert.equal(c.anim.busy, true);
  c.anim.snap('RideCow');
  assert.equal(c.anim.busy, false);
  assert.equal(c.anim.snap('Missing'), false);
});

// ---------------------------------------------------------------------------------------------------- the code that places riders
test('cowrace.js ticks every actor in every phase and checks each rider (the standing-kid bug)', () => {
  const src = fs.readFileSync(new URL('../src/game/tricks/cowrace.js', import.meta.url), 'utf8');
  const play = src.slice(src.indexOf('async play(ctx)'));
  // every per-frame loop of the round ticks the actors; the plain ctx.wait (nothing ticked) is only the 0.1 s camera cut
  const loops = [...play.matchAll(/ctx\.loop\(dt => \{/g)].length;
  assert.ok(loops >= 5, `loops: ${loops}`);
  const waits = [...play.matchAll(/ctx\.wait\(([^)]*)\)/g)].map(m => m[1]);
  assert.deepEqual(waits, ['0.1'], `only the camera cut may wait without ticking the riders: ${waits}`);
  assert.ok((play.match(/tick\(dt\)/g) || []).length >= 6, 'tick(dt) is called in each loop');
  assert.match(play, /seatRider\(k\.anim/, 'each kid is seated the moment it is made');
  assert.match(play, /seatRider\(p\.anim/, 'and so is Mika');
  assert.match(play, /ensureSeated/, 'the self-check');
  assert.match(play, /p\.anim\?\.cancelOneShot\(\)/, 'Mika\'s talk gesture is dropped when the round starts');
  assert.ok(!/anim\?\.play\('Cheer'/.test(play), 'nobody cheers on a cow\'s back');
});

test('seatHeight: the seat follows the rider\'s own hips and size, within 4 cm of the contract', async () => {
  const { seatHeight, KID_SEAT, SEAT } = await import('../src/actors/cow-rig.js');
  const mika = seatHeight(0.64, 0.075), kid = seatHeight(0.49, 0.062);
  assert.ok(Math.abs(mika - SEAT.y) < 0.02, `Mika ${mika.toFixed(3)} vs the contract ${SEAT.y}`);
  assert.ok(Math.abs(kid - KID_SEAT.y) < 0.04, `a kid ${kid.toFixed(3)}`);
  assert.ok(kid < mika + 0.001, 'a smaller rider with a smaller thigh sits a little lower');
  assert.ok(seatHeight(0.49, 0.5) >= 1.32 && seatHeight(0.49, -3) <= 1.40, 'a glitchy measurement is clamped');
  assert.ok(seatHeight(null, null) > 1.32 && seatHeight(0, 0.075) < 1.4, 'no measurement: the contract number');
});
