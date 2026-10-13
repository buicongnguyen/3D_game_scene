// Virtual swimming practice: pure, deterministic lesson rules. These game-sized times and distances
// are input cues, never a real-world swimming test or a prescription for holding one's breath.
// Runtime owns supervision/entry teaching, the pool, camera, translated hints and standard trick saving.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
// Frame sums can round just below/above an exact cue boundary; tolerate only floating-point noise.
const TIME_EPS = 1e-6;
export const SWIM_STAGES = Object.freeze(['bubbles', 'float', 'tread', 'glide', 'turn', 'swim']);
// Normal and Difficult add the frog stroke (breaststroke: "bơi ếch", "kaeru-oyogi") as a skill of its own, before the glide.
export const FROG_STAGES = Object.freeze(['bubbles', 'float', 'tread', 'frog', 'glide', 'turn', 'swim']);
// The frog stroke, one button. A cycle is PULL (press: the hands sweep out and round), BREATHE (keep holding: the head comes
// up), KICK (let go: heels up, feet out, whip together) and GLIDE (hands off: stretch long and wait). The glide is the
// secret: a press before `wait` of the glide bar has run cuts the glide, makes the next kick weak and does not count.
// pullMin..pullMax: how long the press may last (seconds); kick: the whip; glide: the full glide bar; push: metres a second
// a good kick gives; cycles: good cycles the skill asks for; back: true = the swim back to the exit is frog stroke too.
const FROG_NORMAL = Object.freeze({ cycles: 4, pullMin: 0.35, pullMax: 1.6, kick: 0.45, glide: 1.2, wait: 0.6, push: 1.15, back: false });
const FROG_HARD = Object.freeze({ cycles: 5, pullMin: 0.35, pullMax: 1.4, kick: 0.45, glide: 1.3, wait: 0.7, push: 1.15, back: true });
// What a level asks for, beside the timing: floatSeconds (one calm back float), frontSeconds (the total of the short front
// floats), sculls (paced taps that tread water), lane (how far from the middle the lane ropes let her drift: Difficult swims a
// narrower lane) and via (rings to swim through on the way back: Difficult steers a dog-leg, a longer swim with two turns).
// Never longer holds: bubbleMax only gets SHORTER with the level. This is not a breath-holding game.
const VIA_HARD = Object.freeze([Object.freeze({ x: 1.05, z: -2.4 }), Object.freeze({ x: -1.05, z: 1.1 })]);
const NO_VIA = Object.freeze([]);
export const SWIM_LEVELS = Object.freeze({
  first: { bubbleMin: 0.6, bubbleMax: 2.8, air: 0.5, beat: 1.25, window: 0.5, turn: 0.6, floatSeconds: 4, frontSeconds: 3, sculls: 6, lane: 1.9, via: NO_VIA, frog: null },
  easy: { bubbleMin: 0.7, bubbleMax: 2.6, air: 0.55, beat: 1.2, window: 0.4, turn: 0.5, floatSeconds: 4, frontSeconds: 3, sculls: 6, lane: 1.9, via: NO_VIA, frog: null },
  normal: { bubbleMin: 0.8, bubbleMax: 2.5, air: 0.65, beat: 1.2, window: 0.3, turn: 0.4, floatSeconds: 6, frontSeconds: 4, sculls: 8, lane: 1.9, via: NO_VIA, frog: FROG_NORMAL },
  hard: { bubbleMin: 0.9, bubbleMax: 2.3, air: 0.7, beat: 1.1, window: 0.22, turn: 0.3, floatSeconds: 7, frontSeconds: 4, sculls: 10, lane: 1.45, via: VIA_HARD, frog: FROG_HARD },
});
/** The skills of a level's course, in order (Easy and the guided first try keep the six gentle ones). */
export const stagesFor = level => ((Object.hasOwn(SWIM_LEVELS, level) ? SWIM_LEVELS[level] : SWIM_LEVELS.normal).frog ? FROG_STAGES : SWIM_STAGES);
/** Where the lane ropes are drawn for a level (m from the middle): 0.4 m outside the swimmer's limit. */
export const ropeFor = level => (Object.hasOwn(SWIM_LEVELS, level) ? SWIM_LEVELS[level] : SWIM_LEVELS.normal).lane + 0.4;
// floatSeconds / frontSeconds / sculls: the Normal level's numbers (each level has its own: SWIM_LEVELS).
// bounds.x keeps the swimmer between the two lane ropes (drawn at +-2.3; a level's own `lane` may be narrower); bounds.far
// keeps her head off the end wall.
export const SWIM = Object.freeze({ stages: SWIM_STAGES, bubbles: 3, floatSeconds: 6, frontSeconds: 4, sculls: 8,
  start: Object.freeze({ x: 0, z: 4 }), exit: Object.freeze({ x: 0, z: 6 }),
  glide: Object.freeze({ x: 0, z: -5.5 }), bounds: Object.freeze({ x: 1.9, near: 6.5, far: -6.1 }),
  maxDt: 0.1, maxSpeed: 1.1, push: 0.9, turnSpeed: 2.2, reach: 0.55, idleHelp: 6, releaseGrace: 0.35,
});
const GLIDE_LENGTH = Math.hypot(SWIM.glide.x - SWIM.start.x, SWIM.glide.z - SWIM.start.z);

export class SwimLesson {
  constructor({ level = 'normal', first = false } = {}) {
    this.level = first ? 'first' : Object.hasOwn(SWIM_LEVELS, level) ? level : 'normal';
    this.rules = SWIM_LEVELS[this.level];
    this.stages = stagesFor(this.level);
    this.stageIndex = 0; this.stage = this.stages[0]; this.phaseTime = 0; this.time = 0;
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
    this.viaIndex = 0;          // the next ring of the way back (Difficult); rules.via.length = all passed
    // the frog stroke: 'ready' (nothing yet, or a pull that failed) | 'pull' | 'kick' | 'glide'; frogT: seconds in it
    this.frogPhase = 'ready'; this.frogT = 0; this.frogWaited = true; this.frogQuality = 0.7;
    this.frogCycles = 0; this.frogRushed = 0; this.frogLong = 0;
    this.glideFrom = GLIDE_LENGTH;   // metres to the far ring when that leg began (the frog stroke has brought her part of the way)
  }

  /** Where the swim back is heading now: the next ring of the level's dog-leg, then the exit. */
  swimTarget() { return this.rules.via[this.viaIndex] || this.exit; }
  /** Metres of the way back, along the rings: from her (rest = true) or the whole of it. */
  swimPath(rest = true) {
    let x = rest ? this.position.x : SWIM.glide.x, z = rest ? this.position.z : SWIM.glide.z, d = 0;
    for (let i = rest ? this.viaIndex : 0; i <= this.rules.via.length; i++) {
      const t = this.rules.via[i] || this.exit;
      d += Math.hypot(t.x - x, t.z - z); x = t.x; z = t.z;
    }
    return d;
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
    if (this.stageIndex === this.stages.length - 1) {
      this.complete = true; this.progress = 1; this.speed = 0; this.pitch = 0; this.clip = 'Idle';
      this.bubbles = false; this.emit('complete', { result: this.result() }); return;
    }
    this.stage = this.stages[++this.stageIndex]; this.phaseTime = 0; this.progress = 0;
    this.frogPhase = 'ready'; this.frogT = 0; this.frogWaited = true; this.frogQuality = 0.7;
    this.idle = 0; this.releaseWait = 0; this.feedback = ''; this.feedbackLeft = 0;
    this.feedbackCode = ''; this.feedbackCooldown = 0;
    this.needsRelease = this.held; this.holdTime = 0; this.validHold = false;
    this.airTime = this.rules.air; this.lastStroke = this.lastGood = null;
    if (this.stage === 'glide') this.glideFrom = Math.max(1, Math.hypot(SWIM.glide.x - this.position.x, SWIM.glide.z - this.position.z));
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
          this.floatBack = Math.min(this.rules.floatSeconds, this.floatBack + dt);
        } else if (act) this.hint('small_adjustments', true);
        if (released && this.floatBack >= this.rules.floatSeconds - 1e-6) {
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
            this.floatFront = Math.min(this.rules.frontSeconds, this.floatFront + this.holdTime);
            this.emit('good', { kind: 'front_float' });
          } else if (this.validHold) this.hint('gentle_bubbles', true);
          this.holdTime = 0; this.validHold = false; this.airTime = 0;
          if (this.floatFront >= this.rules.frontSeconds - 1e-6) this.floatMode = 'recover';
        }
      } else if (pressed && quiet) {
        this.emit('good', { kind: 'upright' }); this.advance();
      }
      if (this.stage === 'float') this.progress = Math.min(0.98, (this.floatBack + this.floatFront) / (this.rules.floatSeconds + this.rules.frontSeconds));
    } else if (this.stage === 'tread') {
      if (pressed && this.stroke()) this.sculls++;
      this.progress = this.sculls / this.rules.sculls;
      if (this.sculls >= this.rules.sculls) this.advance();
    } else if (this.stage === 'frog') {
      // straight up the lane on one button: no steering, so all the thinking goes into pull, breathe, kick, glide
      const F = this.rules.frog;
      this.frogStroke(dt, act, pressed, released);
      this.travel(dt);
      this.progress = Math.min(1, this.frogCycles / F.cycles);
      // the last kick is followed by its glide: the skill ends stretched long, not in the middle of a whip
      if (this.frogCycles >= F.cycles && this.frogPhase === 'glide' && this.frogT >= F.glide * F.wait) this.advance();
    } else if (this.stage === 'swim' && this.rules.frog?.back) {
      // Difficult: the way back through the rings is frog stroke. The stick steers; every good kick carries her on.
      if (moving) this.face(Math.atan2(mx, mv), dt);
      if (this.frogStroke(dt, act, pressed, released)) this.swimStrokes++;
      this.travel(dt);
      this.arrive(this.swimTarget());
    } else if (this.stage === 'glide' || this.stage === 'swim') {
      const target = this.stage === 'glide' ? SWIM.glide : this.swimTarget();
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
      if (this.speed > 0.03) { this.clip = 'Swim'; this.pitch = 1.15; }
      this.travel(dt);
      this.arrive(target);
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

  /** Carry her along her heading at this.speed, inside the lane and the pool. */
  travel(dt) {
    if (this.speed <= 0.03) return;
    this.position.x += Math.sin(this.heading) * this.speed * dt;
    this.position.z += Math.cos(this.heading) * this.speed * dt;
    const x = clamp(this.position.x, -this.rules.lane, this.rules.lane);
    const z = clamp(this.position.z, SWIM.bounds.far, SWIM.bounds.near);
    // The end walls stop her; a lane rope only slows her, so brushing it while steering is not a dead stop.
    if (z !== this.position.z) { this.speed = 0; this.hint('inside_pool'); }
    else if (x !== this.position.x) { this.speed *= Math.exp(-dt * 4); this.hint('inside_pool'); }
    this.position.x = x; this.position.z = z;
  }

  /** The end of a swim leg: pass a ring of the dog-leg, fill the bar, and finish at the far ring or the exit. */
  arrive(target) {
    let distance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    if (this.stage === 'swim' && target !== this.exit && distance <= SWIM.reach) {
      // through a ring of the dog-leg: on to the next one (she keeps her speed; nothing snaps)
      this.viaIndex++; this.emit('good', { kind: 'ring' });
      target = this.swimTarget(); distance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    }
    this.progress = this.stage === 'glide' ? clamp(1 - distance / this.glideFrom, 0, 0.99) : clamp(1 - this.swimPath() / this.swimPath(false), 0, 0.99);
    const strokes = this.stage === 'glide' ? this.glideStrokes : this.swimStrokes;
    if (target === (this.stage === 'glide' ? SWIM.glide : this.exit) && distance <= SWIM.reach && strokes >= 3) {
      this.position = { ...target }; this.advance();
    }
  }

  /**
   * One frame of the frog stroke (see FROG_NORMAL). Returns true on the frame a good kick starts (a pull of the right
   * length after a glide that was waited for). A rushed press still pulls and kicks, weakly: she is never stuck.
   */
  frogStroke(dt, act, pressed, released) {
    const F = this.rules.frog;
    let good = false;
    if (this.frogPhase === 'kick') { if ((this.frogT += dt) >= F.kick - TIME_EPS) { this.frogPhase = 'glide'; this.frogT = 0; } }
    else if (this.frogPhase === 'glide') this.frogT += dt;
    if (pressed) {
      const rushed = this.frogPhase === 'kick' || (this.frogPhase === 'glide' && this.frogT < F.glide * F.wait - TIME_EPS);
      if (rushed) { this.frogRushed++; this.frogWaited = false; this.speed *= 0.4; this.hint('frog_rush', true); }
      else {
        this.frogWaited = true; this.clearFeedback('frog_rush', 'frog_short', 'frog_kick_now', 'try_cue');
        this.frogQuality = this.frogPhase === 'glide' ? clamp(this.frogT / F.glide, 0, 1) : 0.7;
        if (this.frogQuality >= 1 - TIME_EPS) this.frogLong++;
      }
      this.frogPhase = 'pull'; this.frogT = 0;
    }
    if (this.frogPhase === 'pull') {
      if (act) { this.frogT += dt; if (this.frogT > F.pullMax + TIME_EPS) this.hint('frog_kick_now'); }
      if (released) {
        if (this.frogT < F.pullMin - TIME_EPS) { this.frogPhase = 'ready'; this.frogT = 0; this.hint('frog_short', true); }
        else if (this.frogT > F.pullMax + TIME_EPS) { this.frogPhase = 'ready'; this.frogT = 0; this.hint('frog_kick_now', true); }
        else {
          // a long glide before this pull makes the kick a little stronger; a rushed one makes it weak
          this.frogPhase = 'kick'; this.frogT = 0; this.strokePulse = 0.35;
          this.speed = Math.max(this.speed, F.push * (this.frogWaited ? 0.8 + 0.2 * this.frogQuality : 0.4));
          if (this.frogWaited) { good = true; this.frogCycles++; this.emit('good', { kind: 'frog' }); }
          else this.emit('weak', { kind: 'frog' });
        }
      }
    }
    // water drag: the pull brakes her a little, the glide lets her run, a failed stroke lets her settle
    this.speed *= Math.exp(-dt * (this.frogPhase === 'pull' ? 1.5 : this.frogPhase === 'ready' ? 2.5 : 0.75));
    this.clip = 'Idle'; this.pitch = 1.15;
    return good;
  }

  /** Which of the four parts of the frog cycle she is in now: 'pull' | 'breathe' | 'kick' | 'glide'. */
  frogPart() {
    return this.frogPhase === 'pull' ? this.frogT < this.rules.frog.pullMin ? 'pull' : 'breathe' : this.frogPhase === 'kick' ? 'kick' : 'glide';
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
    const target = this.stage === 'glide' ? { ...SWIM.glide } : this.stage === 'swim' ? { ...this.swimTarget() } : this.stage === 'turn' ? { ...this.exit } : null;
    const age = this.lastStroke === null ? this.rules.beat : this.time - this.lastStroke;
    return { stage: this.stage, stageIndex: this.stageIndex, id: this.stage, progress: this.progress,
      cue, phaseTime: this.phaseTime, feedback: this.feedback, complete: this.complete,
      score: result.score, stars: result.stars, result,
      position: { ...this.position }, heading: this.heading, pitch: this.pitch, clip: this.clip,
      bubbles: this.bubbles, floatSide: this.floatSide, target, exit: { ...this.exit }, viaIndex: this.viaIndex,
      beatPhase: clamp(age / this.rules.beat, 0, 1), beat: this.rules.beat,
      // frog: null unless she is swimming frog stroke now. part: the lit picture; t: seconds in the phase; glide: 0..1 of
      // the glide bar (while gliding); ok: from where on the bar the next pull is not a rush
      frog: !this.complete && (this.stage === 'frog' || (this.stage === 'swim' && !!this.rules.frog?.back))
        ? { phase: this.frogPhase, part: this.frogPart(), t: this.frogT, glide: this.frogPhase === 'glide' ? clamp(this.frogT / this.rules.frog.glide, 0, 1) : 0,
          ok: this.rules.frog.wait, cycles: this.frogCycles, need: this.rules.frog.cycles, rushed: this.frogRushed } : null,
      strokePulse: this.strokePulse, events: this.events };
  }
}

/**
 * A calm pupil: the held/released input a patient child would give this frame (for the tests, the QA scripts and tuning).
 * dt: the frame length it is asked at (so it lets go a frame early rather than a frame late).
 */
export function swimBot(s, dt = 0.05) {
  if (s.needsRelease || s.complete) return { act: false };
  const half = dt / 2;
  const frog = () => {
    const F = s.rules.frog;
    if (s.frogPhase === 'pull') return s.frogT < 0.55 - half;            // sweep, head up, a breath
    if (s.frogPhase === 'kick') return false;
    if (s.frogPhase === 'glide') return s.frogT >= F.glide - half;       // wait for the whole glide
    return !s.held;
  };
  if (s.stage === 'bubbles') return { act: s.held ? s.holdTime < 1.6 - half : s.airTime >= s.rules.air };
  if (s.stage === 'float') {
    if (s.floatMode === 'back') return { act: s.floatBack < s.rules.floatSeconds - 1e-6 };
    if (s.floatMode === 'front') return { act: s.held ? s.holdTime < 2 - half : s.airTime >= s.rules.air };
    return { act: !s.held };
  }
  if (s.stage === 'frog') return { act: frog() };
  if (s.stage === 'turn') {
    const dx = s.exit.x - s.position.x, dz = s.exit.z - s.position.z, d = Math.hypot(dx, dz) || 1;
    return { act: false, mx: dx / d, mv: dz / d };
  }
  const act = !s.held && (s.lastStroke === null || s.time - s.lastStroke >= s.rules.beat - half);
  if (s.stage === 'tread') return { act };
  const target = s.stage === 'glide' ? SWIM.glide : s.swimTarget();
  const dx = target.x - s.position.x, dz = target.z - s.position.z, d = Math.hypot(dx, dz) || 1;
  return { act: s.stage === 'swim' && s.rules.frog?.back ? frog() : act, mx: dx / d, mv: dz / d };
}
