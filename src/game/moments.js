// Weather moments (lazy chunk; game.wakeMoments fetches it): now and then, while Mika roams outdoors by day,
// something small happens in the sky. The rules are game/moments-rules.js, the look fx/moment-fx.js, the whole
// story docs/WEATHER-MOMENTS.md. Never touched from here: fx.setWeather, FX.uWind, fog, the sun, the grade, the
// finale's rainbow and star-snow, the barks tables, the director, the light count.
import * as THREE from 'three';
import {
  MOMENTS, NAMES, Scheduler, mulberry32, readFlags, judge, startBlocked, mustStop, eligible, variantOf, durOf, linesFor, envelope,
  showerLevels, gustLevel, sparkleLevels, rainbowPlan, rainbowAt, sunElevation, RAINBOW_MAX_SUN, skeinPlan, vSlot, vStep, skyCap, swallowPoint,
  SWALLOW_LOOPS, SWALLOW_CLEAR, crowPlan, crowPoint, CROWS, TOWER, bellReaction,
} from './moments-rules.js';
import { MomentFx } from '../fx/moment-fx.js';
import { tx } from '../i18n/i18n.js';
import { river, riverHalfWidth, WATER_Y } from '../world/layout.js';
import { CAST } from './story.js';

const _fwd = new THREE.Vector3(), _a = new THREE.Vector3(), _slot = {}, _pt = {}, _cam = { x: 0, y: 0, z: 0 };
const rand = (a, b) => a + Math.random() * (b - a);
const RING = 120;
// the birds are the butterflies' flapping mesh (fx/cel-critters.js): a flat Y scale tames the flap into a wingbeat
// (geese read as dark shapes against the hills, seen from behind and a little below: the wings tilt toward the eye)
const GEESE = { tint: [0.2, 0.17, 0.15], flap: 9, sx: 2.2, sy: 0.7, tilt: -0.35 };
const SWALLOWS = { tint: [0.12, 0.18, 0.42], flap: 20, sx: 0.45, sy: 0.16 };
// the evening bell's crows going home: near-black, a slower beat than the swallows'
const CROWS_LOOK = { tint: [0.08, 0.08, 0.1], flap: 11, sx: 1.4, sy: 0.5, tilt: -0.25 };
const LAND_LEAN = 20 * Math.PI / 180;     // a phone on its side: sky things lean right, clear of the objective card
const BARK_WAIT = 3;                      // a moment line waits this long at most for the villagers' bubbles to clear
const SKY_DRAW = 30;      // far geese are drawn this far out (see stepGeese; the rainbow does the same, RAINBOW_DRAW)

export class Moments {
  constructor(game) {
    this.g = game;
    const P = game.params, s = P?.has?.('momentseed') ? Number(P.get('momentseed')) : NaN;
    const seed = Number.isFinite(s) ? s : Date.now() >>> 0;
    this.sched = new Scheduler(seed);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);       // (choices inside a moment: lines, sides, paths)
    this.f = {};
    this.fx = new MomentFx(game);
    this.run = null;
    this.clock = 0;
    this.flagT = 0;
    this.lineAt = -1e9;          // when the last moment line was said
    this.said = new Set();       // ids that have spoken once this session
    this.liftAt = -1e9;
    this.seenSwing = game.director?.bellSwing || null;
    this.ownSwing = null;
    this.costs = new Float32Array(RING); this.costI = 0; this.costN = 0;
    this.L = {}; this.SL = {}; this.arc = {}; this.at = {};
    this.refresh();
    if (typeof window !== 'undefined' && window.__STARLINE_QA__) this.attachQA(window.__STARLINE_QA__);
  }

  /** Reserved: a moment never changes the weather kind (fx.setWeather stays the season's). */
  get weather() { return null; }

  /**
   * Can a moment happen at all this visit, as the switches stand now? (Settings > Weather moments, and "Falling
   * petals, leaves and snow"; the stamp card shows its lucky row only while this holds.) The Low governor's step
   * down is passing, so it is not counted.
   */
  get enabled() { return !this.g.momentsOff && !this.g.weatherOff; }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g;
    if (!g.director?.quest) return;
    const t0 = performance.now();
    this.clock += dt;
    if ((this.flagT -= dt) <= 0) { this.flagT = this.run ? 0.1 : 0.25; this.refresh(); }
    this.watchBell();
    const r = this.sched.tick(dt, this.f);
    if (r === 'stop-fast') this.stop(true);
    else if (r === 'stop') { if (!this.run?.forced) this.stop(false); }   // (a forced one plays out past its window)
    else if (r) this.begin(r);
    if (this.run) this.step(dt);
    this.costs[this.costI] = performance.now() - t0;
    this.costI = (this.costI + 1) % RING;
    if (this.costN < RING) this.costN++;
  }

  /** Read the game's flags and judge them (a few times a second; the frames between only compare). */
  refresh() {
    const f = readFlags(this.g, this.f), c = this.g.camera;
    judge(f, this.sched.active, this.sched.variant);
    _cam.tanH = Math.tan((c.fov * Math.PI / 180) / 2) * (c.aspect || 1);      // (the field changes slowly: with speed)
    return f;
  }

  /** Start a moment now. force: past the scheduler (window, cooldown, a running one), never past the gates. -> true | why not */
  start(id, { variant = '', force = false } = {}) {
    this.refresh();
    const b = this.f.why;
    if (b) return b;
    const def = MOMENTS[id];
    if (!def) return 'unknown';
    if (!force) {
      if (this.run) return 'running';
      if (!this.sched.ready(id)) return 'cooldown';
      if (!eligible(def, this.f)) return 'window';
    }
    return this.begin(id, { variant, force }) ? true : 'refused';
  }

  /** End the running moment: fast (0.4 s, the cloud cover back at once) or gently (2.5 s). */
  stop(fast = false) {
    const R = this.run;
    if (!R || (R.stopping && (R.fast || !fast))) return;
    if (!R.stopping) this.sched.ended(R.id);
    R.stopping = true; R.fast = fast;
    R.fadeRate = fast ? 1 / 0.4 : 1 / 2.5;
    R.tolls.length = 0;
    if (fast) this.g.world.cover = undefined;
  }

  state() {
    const R = this.run, s = this.sched.state();
    return { active: !!R && !R.stopping, id: R?.id || '', variant: R?.variant || '', t: R ? +R.t.toFixed(3) : 0, stopping: !!R?.stopping,
      arc: !!R?.arcShown, gapLeft: +s.wait.toFixed(2), cooldowns: s.cooldowns, perSession: s.perSession, lastBlock: s.lastBlock, clock: +s.clock.toFixed(2) };
  }

  // ------------------------------------------------------------------ the moments
  begin(id, { variant = '', hourly = false, force = false } = {}) {
    if (this.run) this.finish();
    const g = this.g, f = this.f, season = f.season;
    variant = variant || variantOf(id, season);
    const R = this.run = {
      id, variant, season, t: 0, dur: durOf(id, variant), stopping: false, fast: false, fade: 1, fadeRate: 0,
      acc: 0, next: 0, tolls: [], said: {}, wait: {}, high: false, arcShown: false, forced: !!force,
    };
    this.sched.started(id, variant);
    this.f.winFor = id; this.f.win = true;      // (it starts in its window; the next refresh judges again)
    // who speaks, and whether this one talks at all (always the first of its kind in a session, else one in two;
    // never within a minute of the last moment's line)
    const d = g.director, T = d?.tamo, tamo = !!(d?.tamoAround?.() && T && !T.hidden), p = g.player;
    R.who = tamo ? tx('Tamo') : tx('Mika');
    // (Tamo floats at Mika's shoulder, near the screen's edge: the bubble leans a little toward her so it stays whole)
    R.anchor = tamo ? (out => out.set(T.pos.x * 0.65 + p.pos.x * 0.35, T.pos.y + 0.5, T.pos.z * 0.65 + p.pos.z * 0.35)) : (out => out.set(p.pos.x, p.pos.y + 1.9, p.pos.z));
    const key = variant || id;
    R.talk = (!this.said.has(key) || this.rng() < 0.5) && this.clock - this.lineAt >= 60;
    const cam = this.camera();
    if (id === 'gust') {
      R.side = this.rng() < 0.5 ? -1 : 1;
      R.total = (f.low ? 75 : 120);       // (all alive at once at most: under the Low budget of 90)
      g.audio?.whoosh?.(3);
      R.next = 1.2;
    } else if (id === 'birds' && variant === 'geese') {
      // (a phone on its side: the objective card covers the top left, so they come in from the left of a view turned
      // right and glide off to the right)
      const land = cam.tanH > 0.8;
      R.plan = skeinPlan(cam, cam.yaw - (land ? LAND_LEAN : 0), this.rng, {}, (x, z) => g.world.heightAt(x, z), land ? -1 : 0);
      this.fx.flockOn(9, GEESE.tint, GEESE.flap);
      R.next = 1 + this.rng() * 1.2;
    } else if (id === 'birds') {
      const cx = p.pos.x + Math.sin(cam.yaw) * 9, cz = p.pos.z + Math.cos(cam.yaw) * 9;
      R.centre = { x: cx, y: Math.max(p.pos.y, g.world.heightAt(cx, cz)), z: cz };
      R.prev = new Float32Array(18);
      R.yaw = cam.yaw;
      const sq = Math.min(1, Math.max(0.45, cam.tanH * 1.9));
      for (let i = 0; i < 6; i++) {
        swallowPoint(i, -0.02, R.centre, _pt, sq, R.yaw);
        _pt.y = Math.max(_pt.y, g.world.heightAt(_pt.x, _pt.z) + SWALLOW_CLEAR);
        R.prev[i * 3] = _pt.x; R.prev[i * 3 + 1] = _pt.y; R.prev[i * 3 + 2] = _pt.z;
      }
      this.fx.flockOn(6, SWALLOWS.tint, SWALLOWS.flap);
      R.next = 0.4;
    } else if (id === 'shower') {
      const sun = g.world?.sky?.state?.sunDir;
      R.arcPlanned = !!sun && sunElevation(sun) > 0 && sunElevation(sun) <= RAINBOW_MAX_SUN;
      R.riverT = 0; R.riverS = null;
      R.ringAcc = 0; R.tipAcc = 0;
    } else if (id === 'sparkle') {
      R.next = 1;
    } else if (id === 'bell') {
      R.tolls = hourly ? [2.2, 4.4] : [0, 2.2, 4.4];
      R.crowCalls = [0.6, 1.0, 1.7];
      this.lift('all');
      // the crows going home, where the phone sees them (the valley's flocks lift far above the frame); none in winter,
      // when the valley has no flocks and the line says "Time to head home" instead
      R.crows = g.time?.season !== 'winter';
      if (R.crows) {
        const towerYaw = Math.atan2(TOWER.x - cam.x, TOWER.z - cam.z);
        const from = Math.atan2(Math.sin(cam.yaw - towerYaw), Math.cos(cam.yaw - towerYaw)) >= 0 ? 1 : -1;   // (minus = right)
        R.plan = crowPlan(cam, cam.yaw, cam.tanH, from, {}, cam.tanH > 0.8 ? LAND_LEAN : 0, R.dur);
        this.fx.flockOn(CROWS, CROWS_LOOK.tint, CROWS_LOOK.flap);
      }
    }
    return true;
  }

  /**
   * The camera: position and the heading it looks along (game yaw: the follow camera's, which moments only ever run
   * under), plus its horizontal half-field (tangent, kept by refresh).
   */
  camera() {
    const c = this.g.camera, F = this.g.follow;
    _cam.x = c.position.x; _cam.y = c.position.y; _cam.z = c.position.z;
    if (F && Number.isFinite(F.yaw)) _cam.yaw = F.yaw;
    else { c.getWorldDirection(_fwd); _cam.yaw = Math.atan2(_fwd.x, _fwd.z); }
    if (!(_cam.tanH > 0)) _cam.tanH = Math.tan((c.fov * Math.PI / 180) / 2) * (c.aspect || 1);
    return _cam;
  }

  /** A wedge across the view for drops and crystals: the visible half-field plus a margin, at least `min`, at most 50°. */
  wedge(cam, margin, min = 25) {
    if (this.wk !== cam.tanH + margin * 1e3 + min) { this.wk = cam.tanH + margin * 1e3 + min; this.wv = Math.min(50, Math.max(min, Math.atan(cam.tanH) * 180 / Math.PI + margin)) * Math.PI / 180; }
    return this.wv;
  }

  step(dt) {
    const R = this.run, g = this.g;
    R.t += dt;
    if (R.stopping) {
      R.fade = Math.max(0, R.fade - dt * R.fadeRate);
      if (R.fade <= 0) { this.finish(); return; }
    }
    const cam = this.camera(), live = !R.stopping, half = this.f.low && this.f.level >= 2 ? 0.5 : 1, t = R.t;
    if (R.id === 'gust') {
      if (live) {
        R.acc += dt * gustLevel(t) * R.total * half / 2.125;      // (the level's integral over its 2.5 s)
        for (; R.acc >= 1; R.acc--) this.fx.gust(cam, cam.yaw, R.side, R.season);
        if (R.next && t >= R.next) { R.next = 0; g.audio?.whoosh?.(2); }
      }
      if (t >= 0.6) this.say(R, 'line', R.id);
      if (t >= 2) this.highlight(R);
    } else if (R.id === 'birds' && R.variant === 'geese') this.stepGeese(R, dt, cam);
    else if (R.id === 'birds') this.stepSwallows(R, dt, cam);
    else if (R.id === 'shower') this.stepShower(R, dt, cam, half);
    else if (R.id === 'sparkle') {
      const S = sparkleLevels(t, this.SL);
      if (live) {
        R.acc += dt * S.rate * (this.f.low ? 30 : 60) * half;
        const w = this.wedge(cam, 14);
        for (; R.acc >= 1; R.acc--) this.fx.sparkle(cam, cam.yaw, w);
        if (t >= R.next && S.sound > 0.2) { R.next = t + rand(0.7, 1.5); g.audio?.twinkle?.(0.7); }
      }
      if (t >= 3) this.say(R, 'line', R.id);
      if (t >= 8) this.highlight(R);
    } else if (R.id === 'bell') this.stepBell(R, cam);
    if (R.t >= R.dur) this.finish();
  }

  stepGeese(R, dt, cam) {
    const P = R.plan, s = R.t * P.speed, a = envelope(R.t, R.dur, 2, 3) * R.fade, yaw = Math.atan2(P.hx, P.hz);
    const lx = P.x0 + P.hx * s, lz = P.z0 + P.hz * s, px = P.hz, pz = -P.hx;      // (across the heading)
    // far off they rise over the hills they meet instead of flying into them
    R.alt ??= P.y;
    R.alt += (Math.max(P.y, this.g.world.heightAt(lx, lz) + 6) - R.alt) * (1 - Math.exp(-dt * 0.6));
    // (each pair back flies a little higher: seen from behind at the eye's height a flat V is a line; stepped, it is a
    // V. Less so as the leader nears the top of the band, and no bird ever above it: it would slip behind the HUD)
    const step = vStep(R.alt, cam.y, Math.hypot(lx - cam.x, lz - cam.z));
    for (let i = 0; i < 9; i++) {
      vSlot(i, _slot);
      const wob = Math.sin(this.clock * 0.7 + i * 1.3);
      const bx = lx - P.hx * _slot.back + px * (_slot.lat + wob * 0.25), bz = lz - P.hz * _slot.back + pz * (_slot.lat + wob * 0.25);
      const by = Math.min(R.alt + _slot.back * step + Math.sin(this.clock * 0.9 + i) * 0.3, skyCap(cam, bx, bz));
      // drawn no farther than SKY_DRAW m, the same size to the eye: the village and the hills beyond stay behind
      // them (a goose 100 m off would hide behind the first roof), anything nearer still in front
      const dx = bx - cam.x, dy = by - cam.y, dz = bz - cam.z, k = Math.min(1, SKY_DRAW / (Math.hypot(dx, dy, dz) || 1));
      this.fx.setBird(i, cam.x + dx * k, cam.y + dy * k, cam.z + dz * k, yaw, GEESE.tilt, wob * 0.06, GEESE.sx * k, GEESE.sy * k, GEESE.sx * k, a);
    }
    this.fx.flockDone();
    if (!R.stopping && R.t >= R.next) {
      const dist = Math.hypot(lx - cam.x, lz - cam.z);
      R.next = R.t + rand(1.2, 2.6);
      if (dist < 260) this.g.audio?.honk?.((1 - dist / 260) * Math.min(1, a * 2));
    }
    if (R.t >= 2.5) this.say(R, 'line', 'geese');
    if (R.t >= P.passT) this.highlight(R);
  }

  stepSwallows(R, dt, cam) {
    const g = this.g, p = g.player.pos, t = R.t;
    // the loops follow Mika a little (a child walking on keeps them ahead), across the view the way it looks now
    const k = 1 - Math.exp(-dt * 1.2);
    R.centre.x += (p.x + Math.sin(cam.yaw) * 9 - R.centre.x) * k;
    R.centre.z += (p.z + Math.cos(cam.yaw) * 9 - R.centre.z) * k;
    // (over the ground under the loops' middle when it rises ahead: facing uphill they would dip into the hill)
    R.centre.y += (Math.max(p.y, g.world.heightAt(R.centre.x, R.centre.z)) - R.centre.y) * k;
    R.yaw += Math.atan2(Math.sin(cam.yaw - R.yaw), Math.cos(cam.yaw - R.yaw)) * k;
    const squeeze = Math.min(1, Math.max(0.45, cam.tanH * 1.9));
    const a = Math.min(1, t / 0.8) * (1 - Math.min(1, Math.max(0, (t - 10.5) / 3.5))) * R.fade;
    const away = Math.max(0, t - 10), pv = R.prev;
    for (let i = 0; i < 6; i++) {
      swallowPoint(i, t, R.centre, _pt, squeeze, R.yaw);
      if (away > 0) {
        // they wheel away: the loop opens outward and climbs
        let ox = _pt.x - R.centre.x, oz = _pt.z - R.centre.z;
        const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
        _pt.x += ox * 6 * away; _pt.z += oz * 6 * away; _pt.y += 4 * away;
      }
      // never into the ground under it (they skim over a slope instead; pitch follows from the raised path)
      _pt.y = Math.max(_pt.y, g.world.heightAt(_pt.x, _pt.z) + SWALLOW_CLEAR);
      const dx = _pt.x - pv[i * 3], dy = _pt.y - pv[i * 3 + 1], dz = _pt.z - pv[i * 3 + 2];
      const h = Math.hypot(dx, dz);
      const yaw = h > 1e-5 ? Math.atan2(dx, dz) : 0, pitch = -Math.atan2(dy, h || 1e-5);
      const bank = -Math.sign(SWALLOW_LOOPS[i].w) * 0.55;
      this.fx.setBird(i, _pt.x, _pt.y, _pt.z, yaw, pitch, bank, SWALLOWS.sx, SWALLOWS.sy, SWALLOWS.sx, a);
      pv[i * 3] = _pt.x; pv[i * 3 + 1] = _pt.y; pv[i * 3 + 2] = _pt.z;
    }
    this.fx.flockDone();
    if (!R.stopping && t >= R.next && t < 11) {
      R.next = t + rand(0.6, 1.2);
      // where they are, left or right of the view (right = (-cos yaw, sin yaw))
      const pan = ((R.centre.x - cam.x) * -Math.cos(cam.yaw) + (R.centre.z - cam.z) * Math.sin(cam.yaw)) / 8;
      g.audio?.chirpAt?.(0.6, 1.6, pan);
    }
    if (t >= 2) this.say(R, 'line', 'swallows');
    if (t >= 6) this.highlight(R);
  }

  stepShower(R, dt, cam, half) {
    const g = this.g, L = showerLevels(R.t, this.L), live = !R.stopping, low = this.f.low, t = R.t;
    if (!R.fast) g.world.cover = 0.45 + 0.25 * L.cover * R.fade;
    if (live && L.drops > 0) {
      R.acc += dt * L.drops * (low ? 55 : 90) * half;        // (about 60 alive on Low, most of them in view)
      const w = this.wedge(cam, 6, 18);
      for (; R.acc >= 1; R.acc--) this.fx.drop(cam, cam.yaw, w);
      // plinks at random moments (a Poisson patter, 5 or 8 a second at the peak), never a steady tick
      if (Math.random() < dt * L.drops * (low ? 5 : 8)) g.audio?.drip?.(L.drops * rand(0.6, 1));
      // rings on the river near Mika (that mesh is drawn anyway: no extra draw)
      const p = g.player.pos;
      if ((R.riverT -= dt) <= 0) {
        R.riverT = 1;
        const n = river.nearest(p.x, p.z, 30);
        R.riverS = n && n.d < 30 ? n.s : null;
      }
      if (R.riverS !== null) {
        R.ringAcc += dt * 4 * L.drops;
        for (; R.ringAcc >= 1; R.ringAcc--) {
          const q = river.at(R.riverS + rand(-12, 12)), w2 = riverHalfWidth(q.z) * 0.7 * rand(-1, 1);
          g.celebrate?.ripples?.emit(q.x - q.tz * w2, WATER_Y + 0.02, q.z + q.tx * w2, 0.5, 0.9, 0.5);
        }
      }
    }
    // the rainbow: placed where the child looks when it starts drawing (14 s), on the side away from the sun
    if (R.arcPlanned && !R.arcShown && live && t >= 14) {
      // (a phone on its side sees ±48°, and its objective card covers the top left: the arch leans right of the middle)
      const lean = cam.tanH > 0.8 ? 14 * Math.PI / 180 : 0;
      const sun = g.world?.sky?.state?.sunDir, plan = sun ? rainbowPlan(sun, cam, cam.yaw - lean, (x, z) => g.world.heightAt(x, z), this.arc) : null;
      if (plan?.ok) { R.arcShown = true; this.fx.placeRainbow(rainbowAt(cam, plan, this.at)); g.audio?.chime?.(3); }
      else R.arcPlanned = false;
    }
    if (R.arcShown) {
      this.fx.drawRainbow(L.reveal, L.arc * R.fade, g.camera.position, rainbowAt(cam, this.arc, this.at));
      if (live && L.reveal < 1.05 && L.reveal > 0.01) {
        R.tipAcc += dt * (low ? 15 : 40);                     // (with the drops, at most ~85 alive on Low)
        for (; R.tipAcc >= 1; R.tipAcc--) this.fx.rainbowTip(L.reveal);
      }
    }
    if (t >= 3) this.say(R, 'line', 'shower');
    // (a neighbour waits for Tamo's bubble to end, up to 10 s in)
    if (t >= 6 && !R.said.villager && (this.clock - this.lineAt >= 3.6 || t >= 10)) { R.said.villager = true; if (this.rng() < 0.5) this.villagerLine(R); }
    if (R.arcShown && t >= 15.5) this.say(R, 'arc', 'rainbow');
    // the best part: the arch fully drawn, or (no arc today) the heaviest drops
    if (R.arcPlanned ? R.arcShown && t >= 17.2 : t >= 10) this.highlight(R);
  }

  stepBell(R, cam) {
    const g = this.g, d = g.director, t = R.t;
    if (R.crows) {
      // the crows going home, across the view and away (drawn no farther than SKY_DRAW, like the geese)
      const a = envelope(t, R.dur, 0.8, 1.5) * R.fade, yaw = Math.atan2(R.plan.hx, R.plan.hz);
      for (let i = 0; i < CROWS; i++) {
        crowPoint(i, t, R.plan, cam, _pt);
        const wob = Math.sin(this.clock * 1.3 + i * 2.1);
        const y = Math.min(_pt.y + wob * 0.3, skyCap(cam, _pt.x, _pt.z));
        const dx = _pt.x - cam.x, dy = y - cam.y, dz = _pt.z - cam.z, k = Math.min(1, SKY_DRAW / (Math.hypot(dx, dy, dz) || 1));
        this.fx.setBird(i, cam.x + dx * k, cam.y + dy * k, cam.z + dz * k, yaw + wob * 0.15, CROWS_LOOK.tilt, wob * 0.12,
          CROWS_LOOK.sx * k, CROWS_LOOK.sy * k, CROWS_LOOK.sx * k, a);
      }
      this.fx.flockDone();
    }
    while (R.tolls.length && t >= R.tolls[0]) {
      R.tolls.shift();
      g.audio?.bell?.();
      const node = g.structures?.nodes?.bell;
      if (node && d) d.bellSwing = this.seenSwing = this.ownSwing = { node, t: 0 };      // (director.animateWorld swings it)
      if (!R.tolls.length) this.highlight(R);                                             // the third toll
    }
    while (!R.stopping && R.crowCalls.length && t >= R.crowCalls[0]) { R.crowCalls.shift(); g.audio?.animal?.('crow', 0.5); }
    if (t >= 1.2) this.say(R, 'line', 'bell');
  }

  finish() {
    const R = this.run;
    if (!R) return;
    if (!R.stopping) this.sched.ended(R.id);
    this.run = null;
    this.g.world.cover = undefined;
    this.fx.hideAll();
  }

  // ------------------------------------------------------------------ lines, highlights, the bell
  say(R, slot, key) {
    if (R.said[slot]) return;
    const B = this.g.director?.barks, C = B?.clock;
    // it goes through the villagers' bark clock: while someone's bubble is up (or one only just ended) it waits, up
    // to BARK_WAIT s, then lets the line go; once said, the villagers wait for it in turn
    if (R.talk && !R.stopping && C && (C.live.size > 0 || C.sinceLast < C.gap)) {
      R.wait[slot] ??= R.t;
      if (R.t - R.wait[slot] < BARK_WAIT) return;
      R.said[slot] = true;
      this.said.add(R.variant || R.id);
      return;
    }
    R.said[slot] = true;
    this.said.add(R.variant || R.id);
    if (!R.talk || R.stopping) return;
    const list = linesFor(key, R.season, { crows: this.g.time?.season !== 'winter' });
    if (!list.length) return;
    const line = list[Math.floor(this.rng() * list.length) % list.length];
    if (B?.ui?.show('moment', line, R.anchor, { name: R.who, life: 3.4 })) {
      this.lineAt = this.clock;
      if (C) { C.spoke('moment'); C.live.set('moment', C.t + 3.4); }      // (live as long as the bubble)
    }
  }

  /** A neighbour near Mika adds their bit to a sun shower (a child only when there will be a rainbow). */
  villagerLine(R) {
    const d = this.g.director, B = d?.barks, p = this.g.player.pos;
    if (!B || R.stopping || this.clock - this.lineAt < 3.6) return;        // (never over Tamo's bubble)
    let best = null, bd = 20;
    for (const [id, n] of d.barkSpeakers?.() || []) {
      const dist = n.pos.distanceTo(p);
      if (dist < bd && B.clock.canSpeak(id) && (n.barkKind !== 'kid' || R.arcPlanned)) { bd = dist; best = [id, n]; }
    }
    if (!best) return;
    const [id, n] = best, kid = n.barkKind === 'kid';
    const list = linesFor(kid ? 'kid' : 'villager', R.season);
    if (!list.length) return;
    const named = !n.villager || !!n.folk;
    if (B.ui.show(id, list[Math.floor(this.rng() * list.length) % list.length], out => { n.head(out); out.y += 0.3; return out; },
      { name: named ? tx(n.folk?.name || CAST[id]?.name || id) : '', life: 3.4 })) B.clock.spoke(id);
  }

  /** The best part of a moment: the stamp card's lucky stamp hears of it (game/stamps.js, when that is in). */
  highlight(R) {
    if (R.high || R.stopping) return;          // (a moment cut off before its best part earns nothing)
    R.high = true;
    try { this.g.director?.stamps?.saw?.(R.id, NAMES[R.variant || R.id]); } catch (e) { console.warn('[moments] stamp', e); }
  }

  lift(which) { this.liftAt = this.clock; this.g.director?.wildlife?.liftFlocks?.(which); }

  /** The director's hourly bell (or the c2 bell) just swung the tower bell: the crows lift; at 17:00 it is the evening bell. */
  watchBell() {
    const g = this.g, s = g.director?.bellSwing;
    if (!s || s === this.seenSwing) return;
    this.seenSwing = s;
    if (s === this.ownSwing || !s.node || s.node !== g.structures?.nodes?.bell) return;
    this.refresh();
    if (this.f.off || this.f.weatherOff) return;          // (switched off: the crows stay put, as on a visit without moments)
    // the evening bell only where one may start (the Orchard Lamp lit, near the tower, nothing on screen; the c2
    // story bell rings in its own beat): otherwise only the Takamori crows lift
    const ready = !this.run && this.sched.ready('bell') && !this.f.halt && !this.f.why && eligible(MOMENTS.bell, this.f);
    const r = bellReaction(Math.floor(g.shownHour()), this.clock - this.liftAt, ready);
    if (r.moment) this.begin('bell', { hourly: true });
    else if (r.lift) this.lift(r.lift);
  }

  // ------------------------------------------------------------------ QA
  cost() {
    let s = 0;
    for (let i = 0; i < this.costN; i++) s += this.costs[i];
    return this.costN ? s / this.costN : 0;
  }

  attachQA(qa) {
    qa.moments = {
      state: () => this.state(),
      start: (id, o) => this.start(id, o || {}),
      stop: (fast = true) => { this.stop(fast); return this.state(); },
      seed: n => { this.sched.seed(n); this.rng = mulberry32((n ^ 0x9e3779b9) >>> 0); },
      advance: s => this.sched.advance(s),
      flags: () => { this.refresh(); const o = {}; for (const [k, v] of Object.entries(this.f)) if (typeof v !== 'object') o[k] = v; o.start = startBlocked(this.f); o.stop = mustStop(this.f); return o; },
      cost: () => this.cost(),
      resetCost: () => { this.costN = 0; this.costI = 0; },
      fx: this.fx,
      apex: () => (this.run?.arcShown ? this.fx.rainbowApex(_a).toArray() : null),
      plan: () => (this.run?.plan ? { ...this.run.plan } : this.run?.arcShown ? { ...this.arc } : null),
    };
  }
}
