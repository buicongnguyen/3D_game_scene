import test from 'node:test';
import assert from 'node:assert/strict';
import { SwimLesson, SWIM, SWIM_STAGES, SWIM_LEVELS, ropeFor } from '../src/game/tricks/rules-swimming.js';

const DT = 0.05;
const ticks = (lesson, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) lesson.step(DT, typeof input === 'function' ? input(lesson) : input);
};
function guidedInput(s) {
  if (s.needsRelease) return { act: false };
  if (s.stage === 'bubbles') return { act: s.held ? s.holdTime < 1.6 - DT / 2 : s.airTime >= s.rules.air };
  if (s.stage === 'float') {
    if (s.floatMode === 'back') return { act: s.floatBack < s.rules.floatSeconds - 1e-6 };
    if (s.floatMode === 'front') return { act: s.held ? s.holdTime < 2 - DT / 2 : s.airTime >= s.rules.air };
    return { act: !s.held };
  }
  if (s.stage === 'turn') {
    const dx = s.exit.x - s.position.x, dz = s.exit.z - s.position.z, d = Math.hypot(dx, dz);
    return { mx: dx / d, mv: dz / d };
  }
  const act = !s.held && (s.lastStroke === null || s.time - s.lastStroke >= s.rules.beat - DT / 2);
  if (s.stage === 'tread') return { act };
  const target = s.stage === 'glide' ? SWIM.glide : s.swimTarget();
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
      assert.ok(Math.abs(s.position.x) <= s.rules.lane + 1e-6 && s.rules.lane <= SWIM.bounds.x);
      assert.ok(s.position.z >= SWIM.bounds.far && s.position.z <= SWIM.bounds.near);
      assert.ok(s.progress >= 0 && s.progress <= 1);
      assert.ok(['Swim', 'Tread', 'Idle'].includes(snap.clip));
    }
    assert.equal(s.complete, true, `${level} completes, last stage ${s.stage}, progress ${s.progress}`);
    assert.deepEqual([...stages], SWIM_STAGES); assert.ok(back && front && upright);
    assert.equal(s.skills, 6); assert.equal(s.result().score, 100); assert.equal(s.result().stars, 3);
    assert.deepEqual(s.position, s.exit); assert.equal(s.clip, 'Idle');
    assert.ok(s.time >= 40 && s.time <= 130, `${level} successful virtual practice ${s.time.toFixed(1)} s`);
    // Recorded held/released inputs reproduce the whole lesson, poses, movement, corrections and final score.
    const replay = new SwimLesson({ level });
    for (const input of inputLog) replay.step(DT, input);
    assert.deepEqual(replay.snapshot(), s.snapshot());
  }
});

test('the idle reminder waits for a child who has stopped: steady, well-timed play never sees it', () => {
  for (const level of Object.keys(SWIM_LEVELS)) {
    const s = new SwimLesson({ level });
    for (let i = 0; i < 8000 && !s.complete; i++) s.step(DT, guidedInput(s));
    assert.equal(s.complete, true);
    assert.deepEqual(s.events.filter(e => e.feedback === 'try_cue' || e.feedback === 'release_to_continue'), [], level);
  }
  const waiting = new SwimLesson(); ticks(waiting, SWIM.idleHelp - 0.5); waiting.step(DT, { act: true }); waiting.step(DT, {}); ticks(waiting, SWIM.idleHelp - 0.5);
  assert.ok(!waiting.events.some(e => e.feedback === 'try_cue'), 'an attempt restarts the wait');
  ticks(waiting, 1); assert.ok(waiting.events.some(e => e.feedback === 'try_cue'));
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
  s.step(DT, { act: false }); ticks(s, SWIM.floatSeconds + 0.1, { act: true });
  assert.equal(s.snapshot().floatSide, 'back'); assert.ok(s.pitch < 0);
  assert.equal(s.stage, 'float', 'holding a completed back float still needs upright release');
  s.step(DT, { act: false }); assert.equal(s.floatMode, 'front');
  ticks(s, 12, { act: true }); assert.equal(s.floatFront, 0);
  assert.equal(s.snapshot().floatSide, 'upright', 'long face-down input comes upright with a breathing correction');
  s.step(DT, { act: false }); ticks(s, 1);
  for (let i = 0; i < SWIM.frontSeconds / 2; i++) {
    ticks(s, 2, { act: true }); assert.equal(s.snapshot().floatSide, 'front'); assert.equal(s.bubbles, true);
    s.step(DT, { act: false }); ticks(s, 1);
  }
  assert.equal(s.floatMode, 'recover'); assert.equal(s.stage, 'float');
  s.step(DT, { act: true }); assert.equal(s.stage, 'tread', 'explicit upright recovery completes float');
});

test('the levels differ in kind: shorter drills and a wide lane on Easy, a narrow lane and two rings to steer through on Difficult', () => {
  const E = SWIM_LEVELS.easy, N = SWIM_LEVELS.normal, H = SWIM_LEVELS.hard;
  assert.ok(E.floatSeconds < N.floatSeconds && N.floatSeconds < H.floatSeconds && E.sculls < N.sculls && N.sculls < H.sculls);
  assert.ok(E.window > N.window && N.window > H.window && E.turn > N.turn && N.turn > H.turn);
  assert.ok(H.lane < N.lane && ropeFor('hard') < ropeFor('normal') && ropeFor('hard') === H.lane + 0.4 && ropeFor('nonsense') === ropeFor('normal'));
  // never a breath-holding contest: the longest allowed hold gets shorter, not longer, and the front float asks for no more
  assert.ok(E.bubbleMax >= N.bubbleMax && N.bubbleMax >= H.bubbleMax && H.frontSeconds <= N.frontSeconds && H.bubbleMax <= 2.5);
  assert.equal(N.via.length, 0); assert.equal(E.via.length, 0); assert.equal(H.via.length, 2);
  for (const v of H.via) assert.ok(Math.abs(v.x) + SWIM.reach < H.lane + 0.2 && v.z > SWIM.glide.z && v.z < SWIM.exit.z, 'the rings float inside the narrow lane, between the far ring and the exit');
  // Difficult: swimming straight back misses the rings and does not finish; steering through both does, and it is a longer swim
  const straight = lessonTo('swim', 'hard');
  for (let i = 0; i < 1600 && !straight.complete; i++) {
    const act = !straight.held && (straight.lastStroke === null || straight.time - straight.lastStroke >= straight.rules.beat - DT / 2);
    const dx = straight.exit.x - straight.position.x, dz = straight.exit.z - straight.position.z, d = Math.hypot(dx, dz) || 1;
    straight.step(DT, { act, mx: dx / d, mv: dz / d });
  }
  assert.equal(straight.complete, false, 'the exit does not count until both rings are passed'); assert.equal(straight.viaIndex, 0);
  const hard = lessonTo('swim', 'hard'), normal = lessonTo('swim', 'normal');
  assert.ok(hard.swimPath(false) > normal.swimPath(false) + 0.25, 'the dog-leg is a longer way back');
  assert.deepEqual(hard.snapshot().target, H.via[0]);
  for (let i = 0; i < 4000 && !hard.complete; i++) hard.step(DT, guidedInput(hard));
  assert.equal(hard.complete, true); assert.equal(hard.viaIndex, 2);
  assert.equal(hard.events.filter(e => e.kind === 'ring').length, 2);
  // the drills are sized by the level
  for (const level of ['easy', 'normal', 'hard']) {
    const t = lessonTo('glide', level);
    assert.equal(t.sculls, SWIM_LEVELS[level].sculls); assert.ok(Math.abs(t.floatBack - SWIM_LEVELS[level].floatSeconds) < 1e-6);
  }
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
  assert.equal(late.retries, 0, 'the tap the screen asks for ("tap once to restart the pulse") is never a penalty');
  for (let i = 0; i < 1000 && late.stage === 'tread'; i++) late.step(DT, guidedInput(late));
  assert.equal(late.stage, 'glide', 'pace corrections allow the player to recover');
});

test('a required drill release clears its resolved instruction without earning a scull', () => {
  const s = new SwimLesson();
  for (let i = 0; i < 8000 && s.stage !== 'tread'; i++) s.step(DT, guidedInput(s));
  assert.equal(s.stage, 'tread'); assert.equal(s.needsRelease, true);
  s.step(DT, { act: true });
  assert.equal(s.feedback, '', 'the tap that finished the last drill is not told off while it is still coming up');
  ticks(s, SWIM.releaseGrace + DT, { act: true });
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

  const front = lessonTo('float'); ticks(front, SWIM.floatSeconds + 0.1, { act: true }); front.step(DT, { act: false });
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
  assert.ok(SWIM.bounds.x < 2.3, 'the swimmer stays between the lane ropes drawn at x = +-2.3');
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

test('exact breathing boundaries work across frame rates without admitting short or overlong holds', () => {
  const exact = (s, seconds, dt, input) => {
    const whole = Math.floor(seconds / dt + 1e-9);
    for (let i = 0; i < whole; i++) s.step(dt, input);
    const rest = seconds - whole * dt;
    if (rest > 1e-9) s.step(rest, input);
  };
  for (const level of Object.keys(SWIM_LEVELS)) for (const dt of [1 / 60, 0.05, 0.1]) {
    const rules = SWIM_LEVELS[level];
    for (const seconds of [rules.bubbleMin, rules.bubbleMax]) {
      const s = new SwimLesson({ level }); exact(s, seconds, dt, { act: true }); s.step(dt, {});
      assert.equal(s.cycles, 1, `${level}, dt=${dt}, exact hold=${seconds}`);
      assert.equal(s.retries, 0);
      exact(s, rules.air, dt, {}); s.step(dt, { act: true });
      assert.equal(s.bubbles, true, `${level}, dt=${dt}, exact air=${rules.air}`);
      assert.equal(s.retries, 0);

      const front = lessonTo('float', level); ticks(front, front.rules.floatSeconds + 0.1, { act: true }); front.step(dt, {});
      exact(front, seconds, dt, { act: true }); front.step(dt, {});
      assert.ok(Math.abs(front.floatFront - seconds) < 1e-6, `${level}, dt=${dt}, front hold=${seconds}`);
      assert.equal(front.retries, 0);
    }
    for (const seconds of [rules.bubbleMin - dt, rules.bubbleMax + dt]) {
      const s = new SwimLesson({ level }); exact(s, seconds, dt, { act: true }); s.step(dt, {});
      assert.equal(s.cycles, 0, `${level}, dt=${dt}, invalid hold=${seconds}`);
      assert.ok(s.retries > 0);
    }
  }
});

test('unknown difficulty names including inherited object keys safely use normal rules', () => {
  for (const level of ['unknown', 'toString', 'constructor', '__proto__', null]) {
    const s = new SwimLesson({ level });
    assert.equal(s.level, 'normal'); assert.equal(s.rules, SWIM_LEVELS.normal);
    ticks(s, 1.6, { act: true }); s.step(DT, {});
    assert.equal(s.cycles, 1); assert.equal(s.retries, 0);
  }
});
