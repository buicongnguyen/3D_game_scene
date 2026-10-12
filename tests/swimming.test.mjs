import test from 'node:test';
import assert from 'node:assert/strict';
import { SwimLesson, SWIM, SWIM_STAGES, SWIM_LEVELS } from '../src/game/tricks/rules-swimming.js';

const DT = 0.05;
const ticks = (lesson, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) lesson.step(DT, typeof input === 'function' ? input(lesson) : input);
};
function guidedInput(s) {
  if (s.needsRelease) return { act: false };
  if (s.stage === 'bubbles') return { act: s.held ? s.holdTime < 1.6 - DT / 2 : s.airTime >= s.rules.air };
  if (s.stage === 'float') {
    if (s.floatMode === 'back') return { act: s.floatBack < SWIM.floatSeconds - 1e-6 };
    if (s.floatMode === 'front') return { act: s.held ? s.holdTime < 2 - DT / 2 : s.airTime >= s.rules.air };
    return { act: !s.held };
  }
  if (s.stage === 'turn') {
    const dx = s.exit.x - s.position.x, dz = s.exit.z - s.position.z, d = Math.hypot(dx, dz);
    return { mx: dx / d, mv: dz / d };
  }
  const act = !s.held && (s.lastStroke === null || s.time - s.lastStroke >= s.rules.beat - DT / 2);
  if (s.stage === 'tread') return { act };
  const target = s.stage === 'glide' ? SWIM.glide : s.exit;
  const dx = target.x - s.position.x, dz = target.z - s.position.z, d = Math.hypot(dx, dz);
  return { act, mx: dx / d, mv: dz / d };
}
function lessonTo(stage, level = 'normal') {
  const s = new SwimLesson({ level });
  for (let i = 0; i < 8000 && s.stage !== stage && !s.complete; i++) s.step(DT, guidedInput(s));
  assert.equal(s.stage, stage, `guided policy reaches ${stage}`);
  if (s.needsRelease) s.step(DT, { act: false });
  return s;
}

test('all difficulty levels teach every skill through actual input in a bounded practice course', () => {
  for (const level of Object.keys(SWIM_LEVELS)) {
    const s = new SwimLesson({ level }), stages = new Set([s.stage]), inputLog = [];
    let back = false, front = false, upright = false;
    for (let i = 0; i < 8000 && !s.complete; i++) {
      const input = guidedInput(s); inputLog.push(input); const snap = s.step(DT, input); stages.add(s.stage);
      back ||= snap.floatSide === 'back'; front ||= snap.floatSide === 'front';
      upright ||= s.floatMode === 'recover' && snap.floatSide === 'upright';
      assert.ok(Math.abs(s.position.x) <= SWIM.bounds.x + 1e-6);
      assert.ok(s.position.z >= SWIM.bounds.far && s.position.z <= SWIM.bounds.near);
      assert.ok(s.progress >= 0 && s.progress <= 1);
      assert.ok(['Swim', 'Tread', 'Idle'].includes(snap.clip));
    }
    assert.equal(s.complete, true, `${level} completes, last stage ${s.stage}, progress ${s.progress}`);
    assert.deepEqual([...stages], SWIM_STAGES); assert.ok(back && front && upright);
    assert.equal(s.skills, 6); assert.equal(s.result().score, 100); assert.equal(s.result().stars, 3);
    assert.deepEqual(s.position, s.exit); assert.equal(s.clip, 'Idle');
    assert.ok(s.time >= 70 && s.time <= 120, `${level} successful virtual practice ${s.time.toFixed(1)} s`);
    // Recorded held/released inputs reproduce the whole lesson, poses, movement, corrections and final score.
    const replay = new SwimLesson({ level });
    for (const input of inputLog) replay.step(DT, input);
    assert.deepEqual(replay.snapshot(), s.snapshot());
  }
});

test('idle never awards any stage, and helpful cues repeat without danger or a timeout loss', () => {
  for (const stage of SWIM_STAGES) {
    const s = lessonTo(stage), skills = s.skills, score = s.result().score;
    ticks(s, 90);
    assert.equal(s.stage, stage); assert.equal(s.complete, false);
    assert.equal(s.skills, skills); assert.equal(s.result().score, score); assert.equal(s.result().stars, 0);
    assert.ok(s.events.some(e => e.type === 'hint' && e.feedback === 'try_cue'), stage);
    assert.ok(s.result().score < 60, 'partial practice stays below the standard trick star thresholds');
  }
});

test('bubbles need gentle exhale/release cycles with a normal breath between; holding and mashing earn nothing', () => {
  const held = new SwimLesson(); ticks(held, 30, { act: true });
  assert.equal(held.cycles, 0); assert.equal(held.stage, 'bubbles'); assert.equal(held.bubbles, false);
  assert.ok(held.events.some(e => e.feedback === 'normal_breath'));
  const mash = new SwimLesson();
  ticks(mash, 15, s => ({ act: Math.floor(s.time / DT + 1e-6) % 2 === 0 }));
  assert.equal(mash.cycles, 0); assert.equal(mash.skills, 0);
  const s = new SwimLesson();
  ticks(s, 1.6, { act: true }); s.step(DT, { act: false });
  assert.equal(s.cycles, 1);
  s.step(DT, { act: true }); ticks(s, 1.6, { act: true }); s.step(DT, { act: false });
  assert.equal(s.cycles, 1, 'a second exhale without an air interval is not another skill');
  ticks(s, 1); ticks(s, 1.6, { act: true }); s.step(DT, { act: false });
  assert.equal(s.cycles, 2, 'normal breath allows a useful retry');
});

test('float shows back and front balance and requires upright recovery; face-down hold cannot farm progress', () => {
  const s = lessonTo('float');
  ticks(s, 10, { act: true, mx: 1 }); assert.equal(s.floatBack, 0, 'large restless inputs do not teach relaxation');
  s.step(DT, { act: false }); ticks(s, 8.1, { act: true });
  assert.equal(s.snapshot().floatSide, 'back'); assert.ok(s.pitch < 0);
  assert.equal(s.stage, 'float', 'holding a completed back float still needs upright release');
  s.step(DT, { act: false }); assert.equal(s.floatMode, 'front');
  ticks(s, 12, { act: true }); assert.equal(s.floatFront, 0);
  assert.equal(s.snapshot().floatSide, 'upright', 'long face-down input comes upright with a breathing correction');
  s.step(DT, { act: false }); ticks(s, 1);
  for (let i = 0; i < 4; i++) {
    ticks(s, 2, { act: true }); assert.equal(s.snapshot().floatSide, 'front'); assert.equal(s.bubbles, true);
    s.step(DT, { act: false }); ticks(s, 1);
  }
  assert.equal(s.floatMode, 'recover'); assert.equal(s.stage, 'float');
  s.step(DT, { act: true }); assert.equal(s.stage, 'tread', 'explicit upright recovery completes float');
});

test('eight paced sculls teach treading; held button, frantic taps and very late taps do not', () => {
  const held = lessonTo('tread'); ticks(held, 30, { act: true });
  assert.equal(held.sculls, 1); assert.equal(held.stage, 'tread');
  const mash = lessonTo('tread');
  ticks(mash, 15, s => ({ act: Math.floor(s.time / DT + 1e-6) % 2 === 0 }));
  assert.ok(mash.sculls <= 1); assert.equal(mash.stage, 'tread');
  assert.ok(mash.events.some(e => e.feedback === 'slow_scull'));
  const late = lessonTo('tread');
  for (let i = 0; i < 9; i++) { late.step(DT, { act: true }); ticks(late, 3, { act: false }); }
  assert.equal(late.sculls, 1); assert.ok(late.events.some(e => e.feedback === 'follow_rhythm'));
  for (let i = 0; i < 1000 && late.stage === 'tread'; i++) late.step(DT, guidedInput(late));
  assert.equal(late.stage, 'glide', 'pace corrections allow the player to recover');
});

test('a required drill release clears its resolved instruction without earning a scull', () => {
  const s = new SwimLesson();
  for (let i = 0; i < 8000 && s.stage !== 'tread'; i++) s.step(DT, guidedInput(s));
  assert.equal(s.stage, 'tread'); assert.equal(s.needsRelease, true);
  s.step(DT, { act: true });
  assert.equal(s.feedback, 'release_to_continue'); assert.equal(s.sculls, 0);
  const retries = s.retries;
  s.step(DT, { act: false });
  assert.equal(s.feedback, ''); assert.equal(s.feedbackLeft, 0);
  assert.equal(s.needsRelease, false); assert.equal(s.sculls, 0); assert.equal(s.retries, retries);
});

test('new valid bubble and front-float holds clear resolved air guidance but keep active corrections', () => {
  const bubbles = new SwimLesson();
  ticks(bubbles, 2.6, { act: true });
  assert.equal(bubbles.feedback, 'normal_breath'); assert.equal(bubbles.bubbles, false);
  bubbles.step(DT, { act: false }); bubbles.step(DT, { act: true });
  assert.equal(bubbles.feedback, 'normal_breath', 'insufficient air still needs its correction');
  bubbles.step(DT, { act: false }); ticks(bubbles, 0.7);
  const retries = bubbles.retries;
  bubbles.step(DT, { act: true });
  assert.equal(bubbles.bubbles, true); assert.equal(bubbles.feedback, ''); assert.equal(bubbles.retries, retries);
  ticks(bubbles, 2.6, { act: true });
  assert.equal(bubbles.feedback, 'normal_breath', 'a newly overlong hold remains an active warning');

  const short = new SwimLesson(); short.step(DT, { act: true }); short.step(DT, { act: false });
  assert.equal(short.feedback, 'gentle_bubbles'); assert.equal(short.cycles, 0);
  ticks(short, 0.7); const shortRetries = short.retries; short.step(DT, { act: true });
  assert.equal(short.feedback, ''); assert.equal(short.cycles, 0); assert.equal(short.retries, shortRetries);
  short.step(DT, { act: false });
  assert.equal(short.feedback, 'gentle_bubbles', 'a fresh active correction can reappear after resolved guidance clears');
  assert.equal(short.retries, shortRetries, 'the original duplicate-penalty cooldown is preserved');

  const front = lessonTo('float'); ticks(front, 8.1, { act: true }); front.step(DT, { act: false });
  ticks(front, 2.6, { act: true }); assert.equal(front.feedback, 'normal_breath');
  front.step(DT, { act: false }); ticks(front, 0.7); const frontRetries = front.retries;
  front.step(DT, { act: true });
  assert.equal(front.snapshot().floatSide, 'front'); assert.equal(front.feedback, '');
  assert.equal(front.retries, frontRetries); assert.equal(front.floatFront, 0);
});

test('earned sculls and aimed strokes clear old retry advice while preserving penalties and cadence', () => {
  const s = lessonTo('tread'); s.step(DT, { act: true }); s.step(DT, { act: false }); s.step(DT, { act: true });
  assert.equal(s.feedback, 'slow_scull'); assert.equal(s.sculls, 1);
  const retries = s.retries;
  ticks(s, s.rules.beat - DT); s.step(DT, { act: true });
  assert.equal(s.sculls, 2); assert.equal(s.feedback, ''); assert.equal(s.retries, retries);
  ticks(s, 3); s.step(DT, { act: true });
  assert.equal(s.feedback, 'follow_rhythm'); assert.equal(s.sculls, 2);
  const lateRetries = s.retries;
  ticks(s, s.rules.beat - DT); s.step(DT, { act: true });
  assert.equal(s.sculls, 3); assert.equal(s.feedback, ''); assert.equal(s.retries, lateRetries);

  const glide = lessonTo('glide'); glide.step(DT, { act: true });
  assert.equal(glide.feedback, 'aim_marker'); assert.equal(glide.glideStrokes, 0);
  const aimRetries = glide.retries; glide.step(DT, { act: false }); glide.step(DT, { act: true, mv: -1 });
  assert.equal(glide.glideStrokes, 1); assert.equal(glide.feedback, ''); assert.equal(glide.retries, aimRetries);
  assert.ok(glide.speed > 0);
});

test('glide and swimming need propulsion plus direction, and the exit must be found and faced', () => {
  const glide = lessonTo('glide'); ticks(glide, 30, { mv: -1 });
  assert.deepEqual(glide.position, SWIM.start, 'stick movement alone is not swimming propulsion');
  ticks(glide, 30, { act: true, mv: -1 });
  assert.equal(glide.stage, 'glide'); assert.ok(glide.progress < 0.2, 'one held push is only a short glide');
  const turn = lessonTo('turn');
  ticks(turn, 10, { mv: -1 }); assert.equal(turn.stage, 'turn', 'facing away from the marked exit does not pass');
  ticks(turn, 3, { mv: 1 }); assert.equal(turn.stage, 'swim');
  const swim = lessonTo('swim'); ticks(swim, 20, { mv: 1 });
  assert.equal(swim.complete, false, 'direction alone cannot reach the return exit');
});

test('pool limits remain solid when inputs aim away from the lesson marker', () => {
  const s = lessonTo('glide');
  ticks(s, 80, q => ({ mx: 1, act: !q.held && (q.lastStroke === null || q.time - q.lastStroke >= q.rules.beat - DT / 2) }));
  assert.equal(s.position.x, SWIM.bounds.x); assert.equal(s.stage, 'glide');
  assert.ok(s.events.some(e => e.feedback === 'inside_pool'));
});

test('bad dt and nonfinite input cannot skip teaching, corrupt movement or award completion', () => {
  const s = new SwimLesson({ level: 'unknown' }); assert.equal(s.level, 'normal');
  const initial = s.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) s.step(dt, { act: true, mx: Infinity, mv: NaN });
  assert.deepEqual(s.snapshot(), initial);
  s.step(999, { act: true }); assert.equal(s.time, SWIM.maxDt); assert.equal(s.cycles, 0);
  const swim = lessonTo('swim'); swim.step(0.05, { act: true, mx: Infinity, mv: NaN });
  assert.ok(Number.isFinite(swim.position.x) && Number.isFinite(swim.position.z));
  assert.equal(new SwimLesson({ first: true, level: 'hard' }).level, 'first');
});
