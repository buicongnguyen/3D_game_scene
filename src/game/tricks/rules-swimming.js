// Virtual swimming practice: pure, deterministic lesson rules. These game-sized times and distances
// are input cues, never a real-world swimming test or a prescription for holding one's breath.
// Runtime owns supervision/entry teaching, the pool, camera, translated hints and standard trick saving.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
// Frame sums can round just below/above an exact cue boundary; tolerate only floating-point noise.
const TIME_EPS = 1e-6;
export const SWIM_STAGES = Object.freeze(['bubbles', 'float', 'tread', 'glide', 'turn', 'swim']);
export const SWIM_LEVELS = Object.freeze({
  first: { bubbleMin: 0.6, bubbleMax: 2.8, air: 0.5, beat: 1.25, window: 0.5, turn: 0.6 },
  easy: { bubbleMin: 0.7, bubbleMax: 2.6, air: 0.55, beat: 1.2, window: 0.4, turn: 0.5 },
  normal: { bubbleMin: 0.8, bubbleMax: 2.5, air: 0.65, beat: 1.2, window: 0.3, turn: 0.4 },
  hard: { bubbleMin: 0.9, bubbleMax: 2.3, air: 0.7, beat: 1.1, window: 0.22, turn: 0.3 },
});
// floatSeconds: the back float (one calm hold, may be resumed); frontSeconds: the total of the short front floats.
// bounds.x keeps the swimmer between the two lane ropes (drawn at +-2.3); bounds.far keeps her head off the end wall.
export const SWIM = Object.freeze({ stages: SWIM_STAGES, bubbles: 3, floatSeconds: 6, frontSeconds: 4, sculls: 8,
  start: Object.freeze({ x: 0, z: 4 }), exit: Object.freeze({ x: 0, z: 6 }),
  glide: Object.freeze({ x: 0, z: -5.5 }), bounds: Object.freeze({ x: 1.9, near: 6.5, far: -6.1 }),
  maxDt: 0.1, maxSpeed: 1.1, push: 0.9, turnSpeed: 2.2, reach: 0.55, idleHelp: 6, releaseGrace: 0.35,
});
const GLIDE_LENGTH = Math.hypot(SWIM.glide.x - SWIM.start.x, SWIM.glide.z - SWIM.start.z);
const RETURN_LENGTH = Math.hypot(SWIM.exit.x - SWIM.glide.x, SWIM.exit.z - SWIM.glide.z);

export class SwimLesson {
  constructor({ level = 'normal', first = false } = {}) {
    this.level = first ? 'first' : Object.hasOwn(SWIM_LEVELS, level) ? level : 'normal';
    this.rules = SWIM_LEVELS[this.level];
    this.stageIndex = 0; this.stage = SWIM_STAGES[0]; this.phaseTime = 0; this.time = 0;
    this.progress = 0; this.complete = false; this.skills = 0; this.retries = 0;
    this.position = { ...SWIM.start }; this.exit = { ...SWIM.exit }; this.heading = Math.PI;
    this.speed = 0; this.pitch = 0.1; this.clip = 'Tread'; this.bubbles = false;
    this.feedback = ''; this.feedbackLeft = 0; this.idle = 0; this.releaseWait = 0;
    this.feedbackCode = ''; this.feedbackCooldown = 0;
    this.events = []; this.held = false; this.needsRelease = false;
    this.holdTime = 0; this.airTime = this.rules.air; this.validHold = false; this.cycles = 0;
    this.floatMode = 'back'; this.floatBack = 0; this.floatFront = 0; this.floatSide = 'upright';
    this.sculls = 0; this.lastStroke = null; this.lastGood = null; this.strokePulse = 0;
    this.turned = 0; this.swimStrokes = 0; this.glideStrokes = 0;
  }

  emit(type, extra = {}) { this.events.push({ type, stage: this.stage, ...extra }); }
  hint(code, retry = false) {
    // Holding a wrong input gives one useful correction, not a penalty on every rendered frame.
    this.feedback = code;
    if (this.feedbackCode === code && this.feedbackCooldown > 0) {
      this.feedbackLeft = this.feedbackCooldown; return;
    }
    this.feedbackCode = code; this.feedbackLeft = this.feedbackCooldown = 2.8;
    if (retry) { this.retries++; this.emit('retry', { feedback: code }); }
    else this.emit('hint', { feedback: code });
  }

  clearFeedback(...codes) {
    if (codes.includes(this.feedback)) { this.feedback = ''; this.feedbackLeft = 0; }
    // Keep the original penalty cooldown even when its resolved instruction is no longer visible.
  }

  advance() {
    this.skills++; this.emit('skill', { skills: this.skills });
    if (this.stageIndex === SWIM_STAGES.length - 1) {
      this.complete = true; this.progress = 1; this.speed = 0; this.pitch = 0; this.clip = 'Idle';
      this.bubbles = false; this.emit('complete', { result: this.result() }); return;
    }
    this.stage = SWIM_STAGES[++this.stageIndex]; this.phaseTime = 0; this.progress = 0;
    this.idle = 0; this.releaseWait = 0; this.feedback = ''; this.feedbackLeft = 0;
    this.feedbackCode = ''; this.feedbackCooldown = 0;
    this.needsRelease = this.held; this.holdTime = 0; this.validHold = false;
    this.airTime = this.rules.air; this.lastStroke = this.lastGood = null;
    this.speed = 0; this.emit('stage', { index: this.stageIndex });
  }

  /** act is HELD, not a press pulse. mx/mv are absolute practice-pool x/z axes, each -1..1. */
  step(dt, input = {}) {
    dt = clamp(finite(dt), 0, SWIM.maxDt);
    if (!dt || this.complete) return this.snapshot();
    const act = !!input.act, pressed = act && !this.held, released = !act && this.held;
    this.held = act; this.time += dt; this.phaseTime += dt;
    const mx = clamp(finite(input.mx), -1, 1), mv = clamp(finite(input.mv), -1, 1);
    const moving = Math.hypot(mx, mv) > 0.15, quiet = Math.hypot(mx, mv) <= 0.45;
    this.feedbackLeft = Math.max(0, this.feedbackLeft - dt);
    this.feedbackCooldown = Math.max(0, this.feedbackCooldown - dt);
    if (!this.feedbackLeft) this.feedback = '';
    this.strokePulse = Math.max(0, this.strokePulse - dt);
    this.bubbles = false; this.clip = 'Tread'; this.pitch = 0.1; this.floatSide = 'upright';
    if (this.needsRelease) {
      // The press that finished a drill is still down for a moment: say "release" only to a finger that stays there.
      if (!act) { this.needsRelease = false; this.releaseWait = 0; this.clearFeedback('release_to_continue'); }
      else { if ((this.releaseWait += dt) >= SWIM.releaseGrace) this.hint('release_to_continue'); return this.snapshot(); }
    }

    if (this.stage === 'bubbles') {
      if (!act) this.airTime += dt;
      if (pressed) {
        this.holdTime = 0; this.validHold = this.airTime >= this.rules.air - TIME_EPS;
        if (!this.validHold) this.hint('normal_breath', true);
      }
      if (act) {
        this.holdTime += dt;
        this.bubbles = this.validHold && this.holdTime <= this.rules.bubbleMax + TIME_EPS;
        if (this.bubbles) this.clearFeedback('normal_breath', 'gentle_bubbles');
        if (this.holdTime > this.rules.bubbleMax + TIME_EPS && this.validHold) {
          this.validHold = false; this.hint('normal_breath', true);
        }
        this.pitch = this.bubbles ? 0.35 : 0.1;
      }
      if (released) {
        if (this.validHold && this.holdTime >= this.rules.bubbleMin - TIME_EPS) {
          this.cycles++; this.emit('good', { kind: 'bubbles' });
        } else if (this.validHold) this.hint('gentle_bubbles', true);
        this.airTime = 0; this.holdTime = 0; this.validHold = false;
      }
      this.progress = this.cycles / SWIM.bubbles;
      if (this.cycles >= SWIM.bubbles) this.advance();
    } else if (this.stage === 'float') {
      if (!act) this.airTime += dt;
      if (this.floatMode === 'back') {
        if (act && quiet) {
          this.floatSide = 'back'; this.clip = 'Swim'; this.pitch = -1.25;
          this.floatBack = Math.min(SWIM.floatSeconds, this.floatBack + dt);
        } else if (act) this.hint('small_adjustments', true);
        if (released && this.floatBack >= SWIM.floatSeconds - 1e-6) {
          this.floatMode = 'front'; this.airTime = this.rules.air; this.emit('good', { kind: 'back_float' });
        }
      } else if (this.floatMode === 'front') {
        if (pressed) {
          this.holdTime = 0; this.validHold = this.airTime >= this.rules.air - TIME_EPS;
          if (!this.validHold) this.hint('normal_breath', true);
        }
        if (act) {
          this.holdTime += dt;
          if (this.validHold && this.holdTime <= this.rules.bubbleMax + TIME_EPS && quiet) {
            this.clearFeedback('normal_breath', 'gentle_bubbles');
            this.floatSide = 'front'; this.clip = 'Swim'; this.pitch = 1.15; this.bubbles = true;
          } else if (this.holdTime > this.rules.bubbleMax + TIME_EPS && this.validHold) {
            this.validHold = false; this.hint('normal_breath', true);
          } else if (!quiet) { this.validHold = false; this.hint('small_adjustments', true); }
        }
        if (released) {
          if (this.validHold && this.holdTime >= this.rules.bubbleMin - TIME_EPS) {
            this.floatFront = Math.min(SWIM.frontSeconds, this.floatFront + this.holdTime);
            this.emit('good', { kind: 'front_float' });
          } else if (this.validHold) this.hint('gentle_bubbles', true);
          this.holdTime = 0; this.validHold = false; this.airTime = 0;
          if (this.floatFront >= SWIM.frontSeconds - 1e-6) this.floatMode = 'recover';
        }
      } else if (pressed && quiet) {
        this.emit('good', { kind: 'upright' }); this.advance();
      }
      if (this.stage === 'float') this.progress = Math.min(0.98, (this.floatBack + this.floatFront) / (SWIM.floatSeconds + SWIM.frontSeconds));
    } else if (this.stage === 'tread') {
      if (pressed && this.stroke()) this.sculls++;
      this.progress = this.sculls / SWIM.sculls;
      if (this.sculls >= SWIM.sculls) this.advance();
    } else if (this.stage === 'glide' || this.stage === 'swim') {
      const target = this.stage === 'glide' ? SWIM.glide : this.exit;
      if (moving) this.face(Math.atan2(mx, mv), dt);
      if (pressed) {
        if (!moving) this.hint('aim_marker', true);
        else if (this.stroke()) {
          this.speed = Math.min(SWIM.maxSpeed, this.speed + SWIM.push);
          if (this.stage === 'glide') this.glideStrokes++; else this.swimStrokes++;
        }
      }
      // A push creates a short glide. Holding the button or moving the stick alone gives no propulsion.
      const heldTooLong = act && this.lastStroke !== null && this.time - this.lastStroke > this.rules.beat;
      if (heldTooLong) this.hint('release_and_rhythm');
      this.speed *= Math.exp(-dt * (moving && !heldTooLong ? 0.55 : 3));
      if (this.speed > 0.03) {
        this.clip = 'Swim'; this.pitch = 1.15;
        this.position.x += Math.sin(this.heading) * this.speed * dt;
        this.position.z += Math.cos(this.heading) * this.speed * dt;
        const x = clamp(this.position.x, -SWIM.bounds.x, SWIM.bounds.x);
        const z = clamp(this.position.z, SWIM.bounds.far, SWIM.bounds.near);
        // The end walls stop her; a lane rope only slows her, so brushing it while steering is not a dead stop.
        if (z !== this.position.z) { this.speed = 0; this.hint('inside_pool'); }
        else if (x !== this.position.x) { this.speed *= Math.exp(-dt * 4); this.hint('inside_pool'); }
        this.position.x = x; this.position.z = z;
      }
      const distance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
      this.progress = clamp(1 - distance / (this.stage === 'glide' ? GLIDE_LENGTH : RETURN_LENGTH), 0, 0.99);
      const strokes = this.stage === 'glide' ? this.glideStrokes : this.swimStrokes;
      if (distance <= SWIM.reach && strokes >= 3) {
        this.position = { ...target }; this.advance();
      }
    } else if (this.stage === 'turn') {
      if (moving) {
        this.face(Math.atan2(mx, mv), dt);
        const want = Math.atan2(this.exit.x - this.position.x, this.exit.z - this.position.z);
        const off = Math.abs(angle(want - this.heading));
        this.progress = clamp(1 - off / Math.PI, 0, 0.99);
        if (off <= this.rules.turn) this.turned += dt;
        else this.turned = 0;
        if (this.turned >= 0.7) this.advance();
      } else this.turned = 0;
    }
    // "Try the instruction above" is for a child who has stopped: any press or steer starts the wait again
    // (it used to fire every six seconds of a drill, also between two well-timed taps).
    this.idle = act || moving ? 0 : this.idle + dt;
    if (this.idle >= SWIM.idleHelp && !this.complete) { this.idle = 0; this.hint('try_cue'); }
    return this.snapshot();
  }

  stroke() {
    const gap = this.lastStroke === null ? null : this.time - this.lastStroke;
    this.lastStroke = this.time;
    if (gap !== null && gap < this.rules.beat - this.rules.window - 1e-6) {
      this.speed *= 0.35; this.hint('slow_scull', true); return false;
    }
    if (gap !== null && gap > this.rules.beat + this.rules.window + 1e-6) {
      // The screen says "tap once to restart the pulse": that tap restarts the rhythm. It earns nothing, and it is not
      // a mistake either (a child who stopped to read must not lose a star for doing what the cue asked).
      this.hint('follow_rhythm'); return false;
    }
    this.clearFeedback('slow_scull', 'follow_rhythm', 'aim_marker', 'release_and_rhythm', 'try_cue');
    this.lastGood = this.time; this.strokePulse = 0.35; this.emit('good', { kind: 'stroke' }); return true;
  }

  face(want, dt) {
    this.heading = angle(this.heading + clamp(angle(want - this.heading), -SWIM.turnSpeed * dt, SWIM.turnSpeed * dt));
  }

  result() {
    const score = this.complete ? Math.max(60, 100 - this.retries * 4) : this.skills * 8;
    return { score, skills: this.skills, complete: this.complete, retries: this.retries,
      stars: this.complete ? score >= 95 ? 3 : score >= 80 ? 2 : 1 : 0, seconds: this.time };
  }

  /** A fresh object each call; `events` is the lesson's own growing list (read it, never change it). */
  snapshot() {
    const result = this.result();
    const cue = this.stage === 'bubbles' ? this.bubbles ? 'bubbles' : 'breathe'
      : this.stage === 'float' ? this.floatMode === 'recover' ? 'stand' : this.floatSide === 'upright' ? this.floatMode === 'front' ? 'breathe' : 'float' : this.floatSide
        : this.stage === 'turn' || this.complete ? 'exit' : 'gentle';
    const target = this.stage === 'glide' ? { ...SWIM.glide } : this.stage === 'turn' || this.stage === 'swim' ? { ...this.exit } : null;
    const age = this.lastStroke === null ? this.rules.beat : this.time - this.lastStroke;
    return { stage: this.stage, stageIndex: this.stageIndex, id: this.stage, progress: this.progress,
      cue, phaseTime: this.phaseTime, feedback: this.feedback, complete: this.complete,
      score: result.score, stars: result.stars, result,
      position: { ...this.position }, heading: this.heading, pitch: this.pitch, clip: this.clip,
      bubbles: this.bubbles, floatSide: this.floatSide, target, exit: { ...this.exit },
      beatPhase: clamp(age / this.rules.beat, 0, 1), beat: this.rules.beat,
      strokePulse: this.strokePulse, events: this.events };
  }
}
