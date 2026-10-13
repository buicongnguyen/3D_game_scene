// "Float and wait" (uite mate): what to do when you fall into water in your clothes. Pure, deterministic drill rules.
// The round (floatsafe.js) owns the pool, Rin and the grown-up at the edge, the pictures, the words and the saving.
// It is a calm drill in a supervised pool: nothing here is a real-world test, and no step asks anyone to hold a breath.
//
// The drill, in order (FLOAT_STEPS):
//   calm    the surprise. Do NOT thrash: hands off everything until the bar fills. (Difficult: a cold "gasp" first; the
//           button offers a shout, and the right thing is still to wait and float first.)
//   float   one press: lie back, a star on the water. Then breathe with the ring: hold while it grows, let go while it
//           shrinks. (Normal and Difficult: little waves rock her; small stick corrections keep her level.)
//   call    wave one arm and shout, once each time the grown-up looks over (a prompt). Still floating in between.
//   hold    the grown-up throws something that floats; press when it has drifted into reach, and hug it to the chest.
//   scull   slow taps on a pulse, steering to the edge. (Difficult: the far lane flows like a slow river.)
//   reach   hold on to the reaching pole and be pulled in.
//   rescue  the other side: a friend is in the water. Never jump in: shout, throw something that floats, reach lying flat.
// Calm is the heart of it: mashing the button or shoving the stick about ("thrashing") drains the calm meter, costs
// points and never moves the drill forward.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const EPS = 1e-6;

const EASY_STEPS = Object.freeze(['calm', 'float', 'call', 'reach']);
const FULL_STEPS = Object.freeze(['calm', 'float', 'call', 'hold', 'scull', 'reach', 'rescue']);

// The rescuer's questions. ok: a right answer. Every wrong one has a kind reason the round can show (WHY in floatsafe.js).
const Q = Object.freeze({
  first2: { id: 'first', options: [{ id: 'jump', ok: false }, { id: 'shout', ok: true }] },
  first3: { id: 'first', options: [{ id: 'wade', ok: false }, { id: 'jump', ok: false }, { id: 'shout', ok: true }] },
  throw3: { id: 'throw', options: [{ id: 'stone', ok: false }, { id: 'bottle', ok: true }, { id: 'ball', ok: true }] },
  throw4: { id: 'throw', options: [{ id: 'bag', ok: false }, { id: 'ball', ok: true }, { id: 'stone', ok: false }, { id: 'bottle', ok: true }] },
  reach3: { id: 'reach', options: [{ id: 'edge', ok: false }, { id: 'flat', ok: true }, { id: 'hand', ok: false }] },
});

// still: seconds of hands-off that end the first step; gasp: seconds of cold shock before them (Difficult);
// floatSeconds: seconds of calm breathing that fill the float bar; breath: one whole breath (in + out), never a hold;
// grace: seconds after the ring turns in which the finger may still be catching up; waves: how hard the water rocks her;
// calls / callGap / callWindow: shouts asked for, seconds between two prompts, seconds a prompt stays;
// drift / catchWindow: seconds the thrown float takes to come near, and stays in reach; beat / window: the sculling pulse;
// current: metres a second the far lane carries her (Difficult); spot: where she floats; rescue: the questions.
export const FLOAT_LEVELS = Object.freeze({
  first: { steps: EASY_STEPS, still: 3, gasp: 0, floatSeconds: 8, breath: 4, grace: 0.6, waves: 0, calls: 2, callGap: 2.2, callWindow: 3.2,
    drift: 3, catchWindow: 3, beat: 1.3, window: 0.5, current: 0, reachHold: 1, spot: Object.freeze({ x: 1.7, z: 1.5 }), rescue: [], prompts: true },
  easy: { steps: EASY_STEPS, still: 3, gasp: 0, floatSeconds: 12, breath: 4, grace: 0.5, waves: 0, calls: 2, callGap: 2.2, callWindow: 3,
    drift: 3, catchWindow: 3, beat: 1.3, window: 0.5, current: 0, reachHold: 1, spot: Object.freeze({ x: 1.7, z: 1.5 }), rescue: [], prompts: true },
  normal: { steps: FULL_STEPS, still: 3, gasp: 0, floatSeconds: 14, breath: 4, grace: 0.4, waves: 0.3, calls: 2, callGap: 2.4, callWindow: 2.4,
    drift: 3, catchWindow: 2.6, beat: 1.3, window: 0.45, current: 0, reachHold: 1, spot: Object.freeze({ x: -0.4, z: 1.5 }), rescue: [Q.first2, Q.throw3], prompts: true },
  hard: { steps: FULL_STEPS, still: 3, gasp: 4, floatSeconds: 16, breath: 4, grace: 0.3, waves: 0.38, calls: 3, callGap: 2.6, callWindow: 1.8,
    drift: 3.4, catchWindow: 1.9, beat: 1.2, window: 0.35, current: 0.2, reachHold: 1, spot: Object.freeze({ x: 0.7, z: 3.6 }), rescue: [Q.first3, Q.throw4, Q.reach3], prompts: false },
});
// edge: the x at which she can take the pole (the east wall is at 4); bounds: where the water ends for her.
export const FLOAT = Object.freeze({ edge: 2.75, bounds: Object.freeze({ x: 3.1, near: 5.6, far: -6 }), maxDt: 0.1,
  maxSpeed: 0.9, push: 0.75, roll: 1.4, hug: 1.6, pull: 2, think: 0.7, intro: 4, right: 3, wrong: 2.2, idleHelp: 7,
  points: Object.freeze({ step: 10, float: 20, calm: 10, choice: [10, 5, 2], panic: 3, partial: 6 }) });

export const stepsFor = level => (Object.hasOwn(FLOAT_LEVELS, level) ? FLOAT_LEVELS[level] : FLOAT_LEVELS.normal).steps;
/** The most a level can score (every step, a steady float, full calm, every choice right at once, no panic). */
export function floatBest(level) {
  const r = Object.hasOwn(FLOAT_LEVELS, level) ? FLOAT_LEVELS[level] : FLOAT_LEVELS.normal, P = FLOAT.points;
  return r.steps.filter(s => s !== 'rescue').length * P.step + P.float + P.calm + r.rescue.length * P.choice[0];
}

export class FloatDrill {
  constructor({ level = 'normal', first = false } = {}) {
    this.level = first ? 'first' : Object.hasOwn(FLOAT_LEVELS, level) ? level : 'normal';
    this.rules = FLOAT_LEVELS[this.level];
    this.steps = this.rules.steps;
    this.stepIndex = 0; this.step_ = this.steps[0]; this.time = 0; this.stepTime = 0; this.progress = 0;
    this.complete = false; this.done = 0;                // done: steps finished (the rescue counts by its questions)
    this.calm = 0.65; this.panics = 0; this.panicWait = 0; this.thrashT = 0; this.quietT = 0;
    this.presses = [];                                    // times of the last presses (mashing = three inside a second)
    this.held = false; this.needsRelease = false; this.stickT = 0;
    this.feedback = ''; this.feedbackLeft = 0; this.idle = 0; this.events = [];
    // calm
    this.still = 0;
    // float
    this.floatMode = 'upright';                           // 'upright' | 'roll' | 'breathe'
    this.rollT = 0; this.breathT = 0; this.floatT = 0; this.floatSpent = 0; this.floatQuality = 0; this.offT = 0;
    this.tilt = 0; this.rockT = 0;
    // call
    this.callPhase = 'wait'; this.callT = 0; this.calls = 0; this.missed = 0; this.waving = 0;
    // hold
    this.objPhase = 'fly'; this.objT = 0; this.caught = false; this.throws = 1;
    // scull
    this.position = { ...this.rules.spot }; this.heading = Math.PI / 2; this.speed = 0;
    this.lastStroke = null; this.strokes = 0; this.strokePulse = 0;
    // reach
    this.reachT = 0; this.pulled = false; this.pullT = 0;
    // rescue
    this.question = 0; this.rescuePhase = 'intro'; this.rescueT = 0; this.tries = 0; this.choicePoints = 0;
    this.picked = null; this.wrongs = 0; this.thrown = null;
  }

  get step() { return this.step_; }
  emit(type, extra = {}) { this.events.push({ type, step: this.step_, ...extra }); }
  hint(code) {
    this.feedback = code; this.feedbackLeft = 3;
  }
  clearFeedback(...codes) { if (codes.includes(this.feedback)) { this.feedback = ''; this.feedbackLeft = 0; } }

  /** She thrashed: the calm meter drops; a new "panic" (points off, Rin calms her) at most every second and a half. */
  thrash(amount, code = 'no_thrash') {
    this.calm = clamp(this.calm - amount, 0, 1); this.thrashT = 0.7; this.quietT = 0; this.hint(code);
    if (this.panicWait <= 0) { this.panics++; this.panicWait = 1.5; this.emit('panic', { feedback: code }); }
  }
  /** A small slip (a press at the wrong moment): a kind correction and a little calm, never a panic by itself. */
  slip(code) { this.calm = clamp(this.calm - 0.05, 0, 1); this.quietT = 0; this.hint(code); this.emit('slip', { feedback: code }); }

  advance() {
    this.done++; this.emit('step', { done: this.done });
    if (this.stepIndex === this.steps.length - 1) { this.finish(); return; }
    this.step_ = this.steps[++this.stepIndex]; this.stepTime = 0; this.progress = 0; this.idle = 0;
    this.feedback = ''; this.feedbackLeft = 0; this.needsRelease = this.held; this.stickT = 0;
    this.emit('stage', { index: this.stepIndex });
  }
  finish() { this.complete = true; this.progress = 1; this.emit('complete', { result: this.result() }); }

  /** act is HELD (not a press pulse); mx/mv: the stick in pool x/z, each -1..1; pick: the option chosen this frame, or null. */
  update(dt, input = {}) {
    dt = clamp(finite(dt), 0, FLOAT.maxDt);
    if (!dt || this.complete) return this.snapshot();
    const R = this.rules, act = !!input.act;
    let pressed = act && !this.held;
    const released = !act && this.held;
    this.held = act; this.time += dt; this.stepTime += dt;
    const mx = clamp(finite(input.mx), -1, 1), mv = clamp(finite(input.mv), -1, 1), stick = Math.hypot(mx, mv);
    const moving = stick > 0.15, shoving = stick > 0.5;
    this.feedbackLeft = Math.max(0, this.feedbackLeft - dt); if (!this.feedbackLeft) this.feedback = '';
    this.panicWait = Math.max(0, this.panicWait - dt); this.thrashT = Math.max(0, this.thrashT - dt);
    this.strokePulse = Math.max(0, this.strokePulse - dt); this.waving = Math.max(0, this.waving - dt);
    this.quietT += dt;
    // calm comes back slowly while nothing is thrashing
    if (this.quietT > 1.5) this.calm = clamp(this.calm + 0.05 * dt, 0, 1);
    const step = this.step_;
    if (this.needsRelease) {
      // the press that finished a step is still down: it is not a press of the next one
      if (!act) this.needsRelease = false;
      pressed = false;
    }
    // mashing: three presses inside a second, in any step
    let mashed = false;
    if (pressed) {
      this.presses.push(this.time);
      while (this.presses.length && this.time - this.presses[0] > 1) this.presses.shift();
      if (this.presses.length >= 3) { mashed = true; this.presses.length = 0; this.thrash(0.2); }
    }
    // shoving the stick about where there is nothing to steer
    const steering = step === 'scull' || (step === 'float' && R.waves > 0 && this.floatMode === 'breathe') || step === 'rescue';
    if (shoving && !steering) { if ((this.stickT += dt) >= 0.5) { this.stickT = 0; this.thrash(0.15); } } else this.stickT = 0;

    if (step === 'calm') {
      // the surprise (and, on Difficult, the cold): every press or shove starts the wait again
      if (act || moving) {
        this.still = 0;
        if (pressed && !mashed) this.thrash(0.12, this.stepTime < R.gasp ? 'float_first' : 'no_thrash');
      } else this.still += dt;
      const need = R.gasp + R.still;
      this.progress = clamp(Math.min(this.still / R.still, this.stepTime / need), 0, 1);
      if (this.still >= R.still - EPS && this.stepTime >= need - EPS) { this.emit('good', { kind: 'calm' }); this.advance(); }
    } else if (step === 'float') {
      if (this.floatMode === 'upright') {
        if (pressed && !mashed) { this.floatMode = 'roll'; this.rollT = 0; this.emit('good', { kind: 'lean' }); }
      } else if (this.floatMode === 'roll') {
        if ((this.rollT += dt) >= FLOAT.roll) { this.floatMode = 'breathe'; this.breathT = 0; }
      } else {
        // breathe with the ring: the first half of a breath is OUT (finger up), the second IN (finger down)
        const half = R.breath / 2, before = this.breathT;
        this.breathT += dt; this.floatSpent += dt;
        const inhale = Math.floor(this.breathT / half) % 2 === 1, sinceFlip = this.breathT % half;
        const matched = act === inhale || sinceFlip < R.grace;
        if (Math.floor(before / half) !== Math.floor(this.breathT / half)) this.emit('breath', { inhale });
        let steady = true;
        if (R.waves > 0) {
          // little waves push her over; the stick pushes back. Small corrections: the bar only fills while she is level.
          this.rockT += dt;
          const wave = R.waves * (Math.sin(this.rockT * 1.1) + 0.6 * Math.sin(this.rockT * 2.3 + 1));
          this.tilt = clamp(this.tilt + (wave + mx * 1.0) * dt, -1, 1);
          steady = Math.abs(this.tilt) < 0.5;
          if (!steady) this.hint('small_corrections'); else this.clearFeedback('small_corrections');
        } else if (moving) { steady = false; this.hint('keep_still'); }
        if (matched && steady && !mashed && this.thrashT <= 0) {
          this.floatT = Math.min(R.floatSeconds, this.floatT + dt); this.offT = 0;
          this.clearFeedback('breathe_ring', 'keep_still');
        } else if (!matched && (this.offT += dt) > 1) { this.offT = 0; this.hint('breathe_ring'); }
        this.progress = clamp(this.floatT / R.floatSeconds, 0, 1);
        if (this.floatT >= R.floatSeconds - EPS) {
          // how steadily she floated: the calm seconds against the seconds it took (a little slack for the start)
          this.floatQuality = clamp(R.floatSeconds / Math.max(R.floatSeconds, this.floatSpent - 1.5), 0, 1);
          this.emit('good', { kind: 'float' }); this.advance();
        }
      }
    } else if (step === 'call') {
      // float and wait; shout and wave once each time the grown-up looks over
      this.callT += dt;
      if (this.callPhase === 'wait') {
        if (pressed && !mashed && this.stepTime > 0.5) this.slip('wait_call');
        if (this.callT >= R.callGap) { this.callPhase = 'prompt'; this.callT = 0; this.emit('prompt'); }
      } else if (pressed && !mashed) {
        this.calls++; this.waving = 1.6; this.callPhase = 'wait'; this.callT = 0; this.clearFeedback('wait_call');
        this.emit('good', { kind: 'call', calls: this.calls });
        if (this.calls >= R.calls) this.advance();
      } else if (this.callT >= R.callWindow) { this.callPhase = 'wait'; this.callT = 0; this.missed++; this.emit('missed'); }
      this.progress = clamp(this.calls / R.calls, 0, 1);
    } else if (step === 'hold') {
      // the float flies in, drifts near, stays in reach for a while, then drifts past and is thrown again
      this.objT += dt;
      const len = { fly: 1.2, drift: R.drift, near: R.catchWindow, past: 1.6 };
      if (this.caught) {
        this.progress = clamp(0.5 + 0.5 * this.objT / FLOAT.hug, 0, 1);
        if (this.objT >= FLOAT.hug) this.advance();
      } else {
        if (pressed && !mashed) {
          if (this.objPhase === 'near') { this.caught = true; this.objT = 0; this.clearFeedback('wait_float'); this.emit('good', { kind: 'catch' }); }
          else this.slip('wait_float');
        }
        if (!this.caught && this.objT >= len[this.objPhase]) {
          this.objT = 0;
          this.objPhase = this.objPhase === 'fly' ? 'drift' : this.objPhase === 'drift' ? 'near' : this.objPhase === 'near' ? 'past' : 'fly';
          if (this.objPhase === 'fly') { this.throws++; this.emit('rethrow'); }
        }
        this.progress = this.objPhase === 'near' ? 0.4 : this.objPhase === 'drift' ? 0.4 * this.objT / R.drift : 0;
      }
    } else if (step === 'scull') {
      // on her back, hugging the float: slow taps on the pulse, the stick says where to. No splashing race.
      if (moving) this.heading = Math.atan2(mx, mv);
      if (pressed && !mashed) {
        const gap = this.lastStroke === null ? null : this.time - this.lastStroke;
        this.lastStroke = this.time;
        if (!moving) this.hint('aim_edge');
        else if (gap !== null && gap < R.beat - R.window - EPS) { this.speed *= 0.4; this.slip('slow_scull'); }
        else {
          this.clearFeedback('slow_scull', 'aim_edge');
          this.speed = Math.min(FLOAT.maxSpeed, this.speed + FLOAT.push); this.strokes++; this.strokePulse = 0.35;
          this.emit('good', { kind: 'stroke' });
        }
      }
      this.speed *= Math.exp(-dt * 0.6);
      const B = FLOAT.bounds;
      this.position.x = clamp(this.position.x + Math.sin(this.heading) * this.speed * dt, -B.x, B.x);
      this.position.z = clamp(this.position.z + Math.cos(this.heading) * this.speed * dt - R.current * dt, B.far, B.near);
      this.progress = clamp((this.position.x - R.spot.x) / (FLOAT.edge - R.spot.x), 0, 1);
      if (this.position.x >= FLOAT.edge - EPS) { this.speed = 0; this.advance(); }
    } else if (step === 'reach') {
      // hold on to the pole with both hands; the grown-up does the pulling
      if (this.pulled) {
        this.pullT += dt; this.progress = 1;
        if (this.pullT >= FLOAT.pull) { this.emit('good', { kind: 'out' }); this.advance(); }
      } else {
        this.reachT = act && !this.needsRelease ? this.reachT + dt : 0;
        this.progress = clamp(this.reachT / R.reachHold, 0, 0.99);
        if (this.reachT >= R.reachHold - EPS) { this.pulled = true; this.pullT = 0; this.emit('good', { kind: 'grab' }); }
      }
    } else if (step === 'rescue') {
      // the other side of the pool: questions with one or two right answers; a wrong one is explained and asked again
      this.rescueT += dt;
      const q = R.rescue[this.question];
      if (this.rescuePhase === 'intro') { if (this.rescueT >= FLOAT.intro) { this.rescuePhase = 'ask'; this.rescueT = 0; this.emit('ask', { q: q.id }); } }
      else if (this.rescuePhase === 'ask') {
        const pick = Number.isInteger(input.pick) ? input.pick : null;
        if (pick !== null && q.options[pick] && this.rescueT >= FLOAT.think) {
          const o = q.options[pick];
          this.picked = o.id; this.rescueT = 0;
          if (o.ok) {
            const P = FLOAT.points.choice;
            this.choicePoints += P[Math.min(this.tries, P.length - 1)];
            if (q.id === 'throw') this.thrown = o.id;
            this.rescuePhase = 'right'; this.emit('right', { q: q.id, option: o.id, tries: this.tries });
          } else { this.tries++; this.wrongs++; this.rescuePhase = 'wrong'; this.emit('wrong', { q: q.id, option: o.id }); }
        }
      } else if (this.rescuePhase === 'wrong') { if (this.rescueT >= FLOAT.wrong) { this.rescuePhase = 'ask'; this.rescueT = 0; } }
      else if (this.rescueT >= FLOAT.right) {
        this.done++; this.tries = 0; this.question++;
        if (this.question >= R.rescue.length) { this.rescuePhase = 'done'; this.finish(); }
        else { this.rescuePhase = 'ask'; this.rescueT = 0; this.picked = null; this.emit('ask', { q: R.rescue[this.question].id }); }
      }
      this.progress = clamp((this.question + (this.rescuePhase === 'right' ? 0.5 : 0)) / R.rescue.length, 0, 1);
    }
    // a child who has stopped (and is not meant to be still) gets a gentle nudge
    const waiting = step === 'calm' || step === 'call' || (step === 'hold' && this.objPhase !== 'near') || (step === 'rescue' && this.rescuePhase !== 'ask')
      || (step === 'float' && this.floatMode === 'roll') || (step === 'reach' && this.pulled);
    this.idle = act || moving || waiting || Number.isInteger(input.pick) ? 0 : this.idle + dt;
    if (this.idle >= FLOAT.idleHelp && !this.complete) { this.idle = 0; this.hint('try_cue'); this.emit('hint', { feedback: 'try_cue' }); }
    return this.snapshot();
  }

  result() {
    const P = FLOAT.points, drill = Math.min(this.done, this.steps.filter(s => s !== 'rescue').length);
    const score = this.complete
      ? Math.max(0, drill * P.step + Math.round(P.float * this.floatQuality) + Math.round(P.calm * this.calm) + this.choicePoints - this.panics * P.panic)
      : Math.max(0, drill * P.partial + this.choicePoints - this.panics * P.panic);
    return { score, complete: this.complete, steps: this.done, panics: this.panics, wrongs: this.wrongs, calm: this.calm,
      steady: this.floatQuality, seconds: this.time };
  }

  /** A fresh object each call; `events` is the drill's own growing list (read it, never change it). */
  snapshot() {
    const R = this.rules, half = R.breath / 2, result = this.result();
    const breathing = this.step_ === 'float' && this.floatMode === 'breathe';
    const q = this.step_ === 'rescue' ? R.rescue[this.question] || null : null;
    const lens = { fly: 1.2, drift: R.drift, near: R.catchWindow, past: 1.6 };
    return { step: this.step_, stepIndex: this.stepIndex, stepTime: this.stepTime, progress: this.progress, complete: this.complete,
      calm: this.calm, thrashing: this.thrashT > 0, panics: this.panics, feedback: this.feedback, score: result.score, result,
      // back: she lies on her back (from the roll on, until she is out of the water)
      back: this.step_ !== 'calm' && !(this.step_ === 'float' && this.floatMode === 'upright') && this.step_ !== 'rescue',
      gasp: this.step_ === 'calm' && this.stepTime < R.gasp, floatMode: this.floatMode,
      // breath: 0..1 how full the ring is (it shrinks through OUT and grows through IN); inhale: the finger should be down
      breath: breathing ? (Math.floor(this.breathT / half) % 2 === 1 ? (this.breathT % half) / half : 1 - (this.breathT % half) / half) : 0,
      inhale: breathing && Math.floor(this.breathT / half) % 2 === 1, tilt: this.tilt, waves: R.waves > 0 && breathing,
      call: this.step_ === 'call' ? { prompt: this.callPhase === 'prompt', left: this.callPhase === 'prompt' ? 1 - this.callT / R.callWindow : 0, calls: this.calls, need: R.calls } : null,
      waving: this.waving > 0,
      object: this.step_ === 'hold' ? { phase: this.caught ? 'caught' : this.objPhase, u: this.caught ? clamp(this.objT / FLOAT.hug, 0, 1) : clamp(this.objT / lens[this.objPhase], 0, 1) } : null,
      hugging: this.caught && this.step_ !== 'rescue',
      position: { ...this.position }, heading: this.heading, speed: this.speed, strokePulse: this.strokePulse,
      beat: R.beat, window: R.window, strokeAge: this.lastStroke === null ? null : this.time - this.lastStroke, current: this.step_ === 'scull' ? R.current : 0,
      reach: this.step_ === 'reach' ? { held: clamp(this.reachT / R.reachHold, 0, 1), pulled: this.pulled, u: clamp(this.pullT / FLOAT.pull, 0, 1) } : null,
      rescue: q || this.rescuePhase === 'done' ? { phase: this.rescuePhase, t: this.rescueT, q: q?.id || null, index: this.question, count: R.rescue.length,
        options: q ? q.options.map(o => o.id) : [], picked: this.picked, thrown: this.thrown } : null,
      events: this.events };
  }
}

/**
 * A calm child: the input a patient player would give this frame (for the tests, the QA scripts and tuning the stars).
 * Returns { act, mx, mv, pick }.
 */
export function floatBot(d, dt = 0.05) {
  const R = d.rules, out = { act: false, mx: 0, mv: 0, pick: null };
  if (d.complete || d.needsRelease) return out;
  const s = d.step;
  if (s === 'float') {
    if (d.floatMode === 'upright') out.act = !d.held;
    else if (d.floatMode === 'breathe') {
      out.act = Math.floor((d.breathT + dt) / (R.breath / 2)) % 2 === 1;
      if (R.waves > 0) out.mx = d.tilt > 0.12 ? -1 : d.tilt < -0.12 ? 1 : 0;
    }
  } else if (s === 'call') out.act = d.callPhase === 'prompt' && d.callT > 0.3 && !d.held;
  else if (s === 'hold') out.act = !d.caught && d.objPhase === 'near' && d.objT > 0.3 && !d.held;
  else if (s === 'scull') {
    out.act = !d.held && (d.lastStroke === null || d.time - d.lastStroke >= R.beat - dt / 2);
    // across to the bank; where the lane flows, angle a little upstream so she lands level with where she started
    const up = R.current > 0 ? 0.45 : 0, n = Math.hypot(1, up);
    out.mx = 1 / n; out.mv = up / n;
  } else if (s === 'reach') out.act = true;
  else if (s === 'rescue' && d.rescuePhase === 'ask' && d.rescueT >= FLOAT.think + 0.3) {
    out.pick = R.rescue[d.question].options.findIndex(o => o.ok);
  }
  return out;
}
