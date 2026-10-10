// The Kite workshop at runtime (rules: ./rules.js, shapes: ./parts.js, words: ./text.js).
//
// Where: the Star Kite's cradle by the workbench in Grandma's cottage. Once Mika owns the kite (and, in the Grandma
// story, once the mill makes electricity: the Mill Lamp is on) the cradle offers "Kite workshop". A trestle bench is
// set up over the cradle, the camera looks straight down at it, and Mika fits electric motors to the wind-up kite:
//   pick the parts -> mount four motors -> fit the propellers (spin test) -> wire it -> balance -> switch on.
// Everything works by mouse or finger (drag, or tap a part and then tap where it goes) and by keys or a pad (move
// the highlight, E to take and to place, Space for the big button). Backspace or Leave stops at any step and the
// step reached is kept in quest.state.workshop.prog.
//
// The round borrows the Tricks round runner (game/tricks.js: the HUD pill, Tamo's hint bubble, the per-frame loops
// with Backspace, the results card with stars and the two fact boxes) through a trick-shaped description: there is no
// third HUD or card. The workshop only adds the task line, Leave and one big button.
//
// After the build the same module looks after flying with motors: it hangs the motor kit on the kite (and on the one
// resting in the cradle), gives actors/kite.js its assist (the flight numbers at the battery's charge), drains and
// recharges the battery, and draws the gauge (and a Boost button on phones).
import * as THREE from 'three';
import { tx, N_ } from '../../i18n/i18n.js';
import { storyId } from '../stories/index.js';
import { PLACES } from '../../world/layout.js';
import {
  STEPS, SOCKETS, CORNERS, WRONG_PLACES, TRAY, TRAY_ORDER, NEEDED, MOTOR_COLORS, WIRES, BALANCE,
  spinTest, wireFor, wiringDone, balanceIdeal, bubbleAt, balanced, balanceScore, quality, recordBuild,
  cleanWorkshop, workshopOpen, assistSpec, flightNumbers, stepCharge, groundCharge,
} from './rules.js';
import {
  COLORS, FRAME, MOTOR_TOP, BATTERY_HALF, LEVEL, benchMaterial, makeMotor, makeProp, makeBattery, makeSwitch, makeWireCoil,
  makeSpoon, makePeg, makeFrame, makeTray, makeLevel, makePlug, makeWire, makeShadow, makeRing, makeBlurDisc, plankTexture,
  makeKiteKit, batteryIcon,
} from './parts.js';
import { TASK, HINTS, SAY, LINES, CARD, LABEL } from './text.js';

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), NDC = new THREE.Vector2(), RAY = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const ease = t => t * t * (3 - 2 * t);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const TAN = Math.tan(THREE.MathUtils.degToRad(27.5));     // the follow camera's 55 degree lens

const CAM_H = 1.75;             // the camera above the bench top (m): under the cottage's ceiling
const TOP = { wide: 0.25, tall: 0.15 }, BOTTOM = 0.105;   // screen kept for the HUD, the task line and Tamo's bubble, and for the big button
const TABLE_UP = 0.06;          // the bench top above the kite cradle's node
const HOVER = 0.13;             // "a hand's breadth" (m)
const SW_OUT = { yellow: [-0.13, 0.53], green: [0.13, 0.53], blue: [-0.13, 0.41], pink: [0.13, 0.41] };
const SW_IN = [0, 0.375];
const DISC_HOT = new THREE.Color('#ffd23f');

const CSS = `
body.ws-on #inventory, body.ws-on #touch, body.ws-on #prompt, body.ws-on #marker, body.ws-on #compass, body.ws-on #clock, body.ws-on #barks, body.ws-on #btnJournal, body.ws-on #trickHud .t { display: none !important; }
body.ws-on.touch #btnMenu { top: calc(14px + var(--safe-t, 0px)); }
#wsKeys { position: absolute; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); max-width: 30vw; color: #fff; font-weight: 700; font-size: 12.5px;
  padding: 4px 12px; border-radius: 12px; background: rgba(24, 32, 58, .5); }
body.touch #wsKeys { display: none; }
#wsPad { position: fixed; inset: 0; z-index: 9; touch-action: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
#wsUi { position: fixed; inset: 0; z-index: 13; pointer-events: none; font-family: Nunito, system-ui, sans-serif; zoom: var(--ui-scale, 1); }
#wsUi.hidden, #wsPad.hidden, #wsAct.hidden, #wsUi.fin #wsTask, #wsUi.fin #wsLeave, #wsUi.fin #wsKeys { display: none; }
#wsTask { position: absolute; left: 50%; top: calc(64px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); max-width: min(560px, 92vw); padding: 7px 16px;
  border-radius: 16px; background: rgba(28, 35, 64, .86); color: #fff; font-weight: 800; font-size: 16px; text-align: center; box-shadow: 0 6px 18px rgba(20, 30, 60, .28); }
#wsTask.good { background: rgba(31, 122, 62, .92); }
#wsTask.bad { background: rgba(176, 72, 28, .94); }
#wsLeave { position: absolute; left: calc(14px + env(safe-area-inset-left, 0px)); top: calc(14px + env(safe-area-inset-top, 0px)); pointer-events: auto; border: 0; border-radius: 999px;
  padding: 10px 16px; min-height: 44px; background: rgba(255, 247, 232, .92); color: #4a3320; font: 800 15px Nunito, sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(20, 30, 60, .3); }
#wsLeave kbd, #wsAct kbd { font: 700 11px Nunito, sans-serif; padding: 1px 6px; border-radius: 5px; background: #0002; margin-left: 8px; }
body.touch #wsLeave kbd, body.touch #wsAct kbd { display: none; }
#wsAct { position: absolute; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); pointer-events: auto; border: 0; border-radius: 999px;
  padding: 12px 28px; min-height: 52px; min-width: 150px; background: linear-gradient(180deg, #ffd66b, #f2a33a); color: #4a2c0a; font: 800 19px Nunito, sans-serif; cursor: pointer;
  box-shadow: 0 6px 18px rgba(20, 30, 60, .35); animation: wsPulse 1.1s ease-in-out infinite; white-space: nowrap; }
@keyframes wsPulse { 50% { transform: translateX(-50%) scale(1.05); } }
@media (max-width: 560px) { #wsTask { font-size: 13.5px; padding: 6px 12px; top: calc(66px + env(safe-area-inset-top, 0px)); width: max-content; max-width: 94vw; } #wsLeave { padding: 9px 12px; font-size: 14px; }
  body.ws-on #trickHud { padding: 5px 12px 5px 6px; gap: 8px; } body.ws-on #trickHud .s { font-size: 16px; } body.ws-on #trickHint { font-size: 14.5px; padding: 8px 14px; max-width: 94vw; width: max-content; } }
#kiteBat { position: absolute; left: 50%; top: calc(16px + var(--safe-t, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: 7px; padding: 4px 12px 4px 6px;
  border-radius: 999px; background: rgba(255, 247, 232, .92); box-shadow: 0 4px 14px rgba(20, 30, 60, .28); font: 800 13px Nunito, sans-serif; color: #4a3320; white-space: nowrap; }
#kiteBat.hidden { display: none; }
#kiteBat img { width: 28px; height: 28px; display: block; }
#kiteBat .bar { position: relative; width: 84px; height: 12px; border-radius: 6px; background: #d9ccb4; overflow: hidden; }
#kiteBat .bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; border-radius: 6px; background: linear-gradient(90deg, #58c46c, #9be36a); transform-origin: 0 50%; }
#kiteBat.low .bar i { background: linear-gradient(90deg, #f08a3c, #ffc45a); }
#kiteBat.empty .bar i { background: #c9bda6; }
#kiteBat .zap { min-width: 1em; color: #c2541c; }
#kiteBat.boost { box-shadow: 0 0 0 2px #ffd23f, 0 4px 14px rgba(20, 30, 60, .28); }
@media (max-width: 700px) { #kiteBat { top: auto; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(150px + var(--safe-b, 0px)); transform: none; } #kiteBat .bar { width: 64px; } }
#tBoost { right: calc(110px + env(safe-area-inset-right, 0px)); bottom: calc(124px + var(--safe-b, 0px)); width: 64px; height: 64px; font-size: 14px;
  background: linear-gradient(180deg, #fff3a6, #ffc93a); color: #3b1c05; }
#tBoost.hidden { display: none; }
`;

/** The trick-shaped description the Tricks round runner works with (never listed among Grandma's tricks). */
const DESC = {
  id: 'workshop', name: N_('Kite workshop'), icon: 'star-kite', unit: '', length: null,
  place: { x: -55, z: 140 }, teacher: { grandma: 'tamo', classic: 'tamo' }, stars: [0, 60, 85],
  why: CARD.why, howReal: CARD.real, safety: CARD.safe,
};

export class Workshop {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.active = false;          // a round is running (from the first word to the card)
    this.onBench = false;         // the bench is set up: the cradle's own kite is put away meanwhile (director.kiteStand.when)
    this.s = null;                // the build in progress
    this.stage = null;
    this.kitStars = -1;           // the kit the kite carries now (-1: not looked at yet)
    this.kit = null;
    this.spec = null;
    this.charge = 1;
    this.N = flightNumbers(null, 0, {});
    this.powerT = 0;
    this.nearPower = false;
    this.debug = { hintAfter: 14 };
    // what actors/kite.js asks while it flies with the motors
    this.assist = {
      numbers: () => this.N,
      use: (dt, boost, climb, hover) => {
        this.charge = stepCharge(this.charge, { boost, climb, hover }, dt, this.spec);
        this.boosting = boost > 0 && this.charge > 0;
      },
    };
    this.buildUi();
    this.register();
  }

  // ------------------------------------------------------------------ state
  get st() { return this.d.q?.state; }
  get rec() { const st = this.st; if (!st) return null; if (!st.workshop || typeof st.workshop !== 'object') st.workshop = cleanWorkshop(null); return st.workshop; }
  open() { return workshopOpen(this.st); }
  tamoHere() { return !!this.d.tamoAround?.(); }

  register() {
    const d = this.d, ks = d.kiteStand;
    if (!ks) return;
    const label = () => { const r = this.rec; return tx(r?.prog ? LABEL.resume : r?.built ? LABEL.rebuild : LABEL.open); };
    d.interact('kiteWorkshop', ks.pos.clone().add(V.set(0, -0.8, 0)), label,
      () => ks.when() && this.open() && !this.active && !d.tricks?.round && !d.busy, () => this.play(), 2.4, null, 1.5);
  }

  // ------------------------------------------------------------------ the round
  async play() {
    const d = this.d, g = this.g, T = d.tricks, st = this.st;
    if (this.active || !T || T.round || d.busy || d.minigame || !st || !this.open()) return null;
    this.active = true;
    T.round = { id: DESC.id, starting: true };
    let result = null;
    try {
      let again = true;
      while (again) {
        const rec = this.rec, first = !rec.built && !rec.prog;
        const ctx = T.makeCtx(DESC, first);
        T.round = { id: DESC.id, ctx };
        T.locks = true;
        d.ui.prompt(null);
        g.input.releaseAll?.();
        g.player.carry?.want('worn', 'workshop');
        if (first) await ctx.say(this.lines('intro'));
        DESC.unit = '';
        T.hud(DESC, ctx);
        this.begin(ctx);
        const res = await ctx.loop(dt => this.frame(dt));
        if (res !== 'done') {
          // left before the switch: keep the step reached
          this.keepProgress();
          this.end();
          T.endRound(ctx);
          result = { quit: true };
          break;
        }
        const out = this.finish();
        T.saveNow();
        await this.hover(ctx);
        this.end();
        T.endRound(ctx);
        d.ui.toast(`${'★'.repeat(out.stars)}${'☆'.repeat(3 - out.stars)} ${tx(DESC.name)}${out.newBest && this.rec.plays > 1 ? ` · ${tx('New best!')}` : ''}`, DESC.icon);
        d.audio.star();
        result = out;
        again = await this.card(out);
      }
    } catch (e) {
      console.error('[workshop] failed', e);
    } finally {
      this.end();
      T.loops.clear();
      T.el?.card.classList.add('hidden');
      T.el?.hud.classList.add('hidden');
      document.body.classList.remove('trick-round');
      T.hideHint?.();
      T.round = null;
      T.locks = false;
      this.active = false;
      g.player.carry?.release('workshop');
      if (!d.busy) g.player.locked = false;
      d.actCooldown = 0.5;
    }
    d.save();
    return result;
  }

  /** The results card of the Tricks runner (it reads a trick record: lend it one while the card is up). */
  async card(out) {
    const T = this.d.tricks, st = this.st, rec = this.rec;
    DESC.unit = N_('% build quality');
    st.tricks[DESC.id] = { learned: true, best: rec.best, stars: rec.stars, plays: rec.plays };
    try { return await T.results(DESC, out.quality, out.stars, out.newBest, out.first, { extra: out.note }); }
    finally { delete st.tricks[DESC.id]; DESC.unit = ''; }
  }

  lines(key) {
    const story = storyId() === 'grandma' ? 'grandma' : 'classic';
    let L = LINES[key][story] || LINES[key].classic;
    if (!this.tamoHere()) L = L.filter(l => l[0] !== 'tamo');
    if (key === 'done') L = [...L, ['narrator', this.d.ui.touch ? LINES.tipTouch : LINES.tip]];
    return L;
  }

  /** Tamo's bubble (or a plain tip when he is not with Mika). */
  hint(text, life = 4.5) {
    const T = this.d.tricks;
    T.showHint(text, this.tamoHere() ? tx('Tamo') : '', life);
  }

  // ------------------------------------------------------------------ the bench
  begin(ctx) {
    const d = this.d, g = this.g, ks = d.kiteStand, room = g.interiors?.rooms.get(ks.interior);
    this.ctx = ctx;
    this.onBench = true;
    const rec = this.rec, prog = rec.prog;
    // which way is "up the screen": toward the wall the cradle stands at
    const fwd = new THREE.Vector3(0, 0, -1);
    if (room?.model && room.bounds) {
      const l = room.model.worldToLocal(ks.pos.clone()), b = room.bounds;
      const walls = [[l.x - b.min.x, -1, 0], [b.max.x - l.x, 1, 0], [l.z - b.min.z, 0, -1], [b.max.z - l.z, 0, 1]].sort((a, c) => a[0] - c[0]);
      fwd.set(walls[0][1], 0, walls[0][2]).transformDirection(room.model.matrixWorld).setY(0).normalize();
    }
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const O = ks.pos.clone().addScaledVector(fwd, -0.7);
    O.y = ks.pos.y + TABLE_UP;
    const stage = this.stage = new THREE.Group();
    stage.name = 'workshop:stage';
    stage.position.copy(O);
    stage.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    g.scene.add(stage);
    this.geo = { O, fwd, right, floor: room?.floorY ?? O.y - 1.05 };

    // the bench: planks, an apron and four legs (seen when the camera tips up for the hover)
    const tex = this.tex = plankTexture();
    const board = this.board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ name: 'Workshop bench', map: tex }));
    board.name = 'workshop:bench';
    stage.add(board);
    const dark = new THREE.MeshBasicMaterial({ name: 'Workshop bench wood', color: '#7a5330' });
    this.apron = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
    this.apron.name = 'workshop:apron';
    stage.add(this.apron);
    this.legs = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(this.apron.geometry, dark); m.name = 'workshop:leg'; stage.add(m); return m; });

    const C = this.content = new THREE.Group();
    C.name = 'workshop:content';
    stage.add(C);
    const frame = this.frame0 = new THREE.Group();     // moves and twists; `frameMesh` and everything mounted ride on it
    frame.name = 'workshop:frame';
    frame.rotation.order = 'YXZ';
    C.add(frame);
    frame.add(makeFrame());
    this.frameShadow = makeShadow(0.6);
    this.frameShadow.visible = false;
    C.add(this.frameShadow);
    this.tray = null;
    this.marks = {};
    const mark = (id, x, y, h = FRAME.socketY) => { const o = new THREE.Object3D(); o.position.set(x, h, -y); frame.add(o); this.marks[id] = o; return o; };
    for (const c of CORNERS) mark(c, SOCKETS[c].x, SOCKETS[c].y);
    for (const [id, p] of Object.entries(WRONG_PLACES)) mark(id, p.x, p.y);
    // the level (from the balance step on)
    const level = this.level = makeLevel();
    level.position.set(0.33, 0.03, 0.04);
    level.scale.setScalar(1.3);
    level.visible = false;
    frame.add(level);

    // the parts
    const s = this.s = {
      step: 0, mistakes: prog?.mistakes || 0, parts: new Map(), slots: {}, propAt: {}, wires: new Set(), wireMesh: new Map(), plugs: new Map(),
      bal: BALANCE.start, ideal: balanceIdeal(rec.plays), bubble: 0, bubbleV: 0, sel: null, focus: null, press: null, drag: null,
      idle: 0, hintN: 0, lock: 0, test: null, timers: [], tweens: [], picked: 0, t: 0, kb: false, nav: { dir: null, hold: 0 }, flipped: false, done: false,
      first: !rec.built && !prog, balSeen: null,
    };
    const make = def => (def.kind === 'motor' ? makeMotor(MOTOR_COLORS[def.n]) : def.kind === 'prop' ? makeProp(def.dir) : def.kind === 'battery' ? makeBattery()
      : def.kind === 'switch' ? makeSwitch() : def.kind === 'wire' ? makeWireCoil() : def.kind === 'spoon' ? makeSpoon() : makePeg());
    const RADIUS = { motor: 0.1, prop: 0.19, battery: 0.14, switch: 0.1, wire: 0.11, spoon: 0.12, peg: 0.11 };
    for (const def of TRAY) {
      const obj = new THREE.Group();
      obj.name = `workshop:${def.id}`;
      const m = make(def);
      const sh = makeShadow(RADIUS[def.kind] * (def.kind === 'prop' ? 0.5 : 0.95));
      sh.position.y = 0.003;
      obj.add(sh, m);
      if (def.kind === 'spoon') m.rotation.y = 0.5;
      if (def.kind === 'peg') m.rotation.y = -0.6;
      let disc = null;
      if (def.kind === 'prop') { disc = makeBlurDisc(def.dir === 'cw' ? COLORS.cw : COLORS.ccw); disc.position.y = 0.03; obj.add(disc); }
      // chosen in the first step: a green ring round it
      const tr = Math.min(RADIUS[def.kind], 0.125);
      const tick = makeRing('#35b858', tr + 0.008, tr + 0.03);
      tick.position.y = 0.004; tick.visible = false; tick.material.depthTest = true; tick.renderOrder = 1;
      obj.add(tick);
      C.add(obj);
      s.parts.set(def.id, { id: def.id, def, obj, mesh: m, shadow: sh, disc, tick, r: RADIUS[def.kind], where: 'tray', picked: false, home: new THREE.Vector3(), wob: 0, spin: 0 });
    }
    // rings: keyboard focus, the thing in hand, and the places it may go
    this.focusRing = makeRing('#ffffff', 0.13, 0.165);
    this.selRing = makeRing('#ffd23f', 0.12, 0.15);
    this.spots = Array.from({ length: 8 }, () => makeRing('#7dff8a', 0.1, 0.125));
    for (const r of [this.focusRing, this.selRing, ...this.spots]) { r.visible = false; stage.add(r); }
    this.rubber = null;

    // the page
    document.body.classList.add('ws-on');
    this.el.ui.classList.remove('hidden');
    this.el.pad.classList.remove('hidden');
    this.el.leave.innerHTML = `✕ ${tx(LABEL.leave)}<kbd>Backspace</kbd>`;
    this.el.keys.textContent = tx(LABEL.keys);
    this.bind();

    // Mika steps aside, the cradle's kite is on the bench now
    const p = g.player;
    this.saved = { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: p.facing };
    this.aspect = 0;
    this.relayout(true);
    p.teleport(O.x + right.x * (this.view.w / 2 + 0.7), O.z + right.z * (this.view.w / 2 + 0.7), this.geo.floor, Math.atan2(-right.x, -right.z));
    if (prog) this.restore(prog);
    this.setStep(prog?.step || 0, true);
    this.camera(0.9);
    d.audio.click();
  }

  /** Fit the bench to the screen: beside each other on a wide screen, the tray under the kite on a tall one. */
  relayout(snap = false) {
    const g = this.g, r = g.renderer.renderer.domElement.getBoundingClientRect();
    const aspect = r.width / Math.max(1, r.height);
    if (Math.abs(aspect - this.aspect) < 0.01) return;
    this.aspect = aspect;
    const visH = 2 * CAM_H * TAN, visW = visH * aspect, wide = aspect >= 1.05;
    const cell = wide ? 0.3 : 0.28, cols = wide ? 3 : 5, rows = wide ? 5 : 3;
    const trayW = cols * cell + 0.04, trayH = rows * cell + 0.04, rim = 0.06;
    const frameW = FRAME.half * 2 + 0.04, frameH = FRAME.top - FRAME.bottom;
    const Wc = wide ? frameW + 0.12 + trayW + rim : Math.max(frameW, trayW + rim), Hc = wide ? Math.max(frameH, trayH + rim) : frameH + 0.1 + trayH + rim;
    const top = wide ? TOP.wide : TOP.tall;
    const S = Math.min(visW * 0.97 / Wc, visH * (1 - top - BOTTOM) / Hc);
    const cy = (BOTTOM - top) / 2 * visH;                  // the free band's middle, up the screen from the centre (m)
    const C = this.content;
    C.scale.setScalar(S);
    C.position.set(0, 0, -cy);
    this.view = { w: visW, h: visH, S, wide, cell, cols, rows };
    // Tamo's bubble: under the task line on a wide screen, at the very bottom on a tall one (see frame())
    this.ctx.hintTop(wide, 106);
    // the frame and the tray (content units; y of the content is up the screen)
    const fx = wide ? -Wc / 2 + frameW / 2 : 0, fy = wide ? -(FRAME.top + FRAME.bottom) / 2 : Hc / 2 - FRAME.top;
    const tx0 = wide ? Wc / 2 - rim / 2 - trayW / 2 : 0, ty0 = wide ? 0 : -Hc / 2 + rim / 2 + trayH / 2;
    this.frame0.position.set(fx, 0, -fy);
    this.frameHome = { x: fx, y: fy };
    this.frameShadow.position.set(fx, 0.002, -fy + 0.06);
    if (this.tray) { this.tray.geometry.dispose(); this.tray.removeFromParent(); }
    this.tray = makeTray(trayW, trayH);
    this.tray.position.set(tx0, 0, -ty0);
    C.add(this.tray);
    TRAY_ORDER.forEach((id, i) => {
      const part = this.s.parts.get(id), cx = i % cols, cyy = Math.floor(i / cols);
      part.home.set(tx0 + (cx - (cols - 1) / 2) * cell, 0.012, -(ty0 - (cyy - (rows - 1) / 2) * cell));
      if (part.where === 'tray' && (snap || !this.tweening(part))) part.obj.position.copy(part.home);
    });
    // the bench itself, a little bigger than the view
    const bw = visW + 0.5, bh = visH + 0.5, drop = this.geo.O.y - this.geo.floor;
    this.board.scale.set(bw, 1, bh);
    this.tex.repeat.set(bw / 1.1, bh / 1.1);
    this.apron.scale.set(bw, 0.07, bh);
    this.apron.position.y = -0.036;
    this.legs.forEach((m, i) => { m.scale.set(0.09, drop, 0.09); m.position.set((i % 2 ? 1 : -1) * (bw / 2 - 0.12), -drop / 2, (i < 2 ? 1 : -1) * (bh / 2 - 0.12)); });
    if (!this.s.done) this.camera(snap ? 0.9 : 0.01);
  }

  camera(dur = 0.9) {
    const { O, fwd } = this.geo;
    // a hair off straight down, so "up the screen" is the wall and never flips
    this.g.follow.cutscene({ pos: O.clone().addScaledVector(UP, CAM_H).addScaledVector(fwd, -0.03), look: O.clone() }, dur);
  }

  /** Put the bench as a saved step left it. */
  restore(prog) {
    const s = this.s, step = prog.step;
    if (step >= 1) for (const p of s.parts.values()) { if (p.def.need) { p.picked = true; s.picked++; } else this.gone(p, true); }
    if (step >= 2) prog.slots.forEach((n, i) => this.mount(s.parts.get(`motor${n}`), CORNERS[i], true));
    if (step >= 3) {
      const free = { cw: ['prop0', 'prop1'], ccw: ['prop2', 'prop3'] };
      for (const c of CORNERS) this.fitProp(s.parts.get(free[prog.layout[c]].shift()), c, true);
    }
    if (step >= 4) { this.seatPower(true); for (const w of WIRES) this.connect(w, true); }
    if (step >= 5) { s.bal = prog.bal; this.placeBattery(); }
  }

  end() {
    this.onBench = false;
    this.sendSoraHome();
    if (!this.stage) return;
    const g = this.g;
    this.unbind();
    this.d.audio?.kiteHum?.(false, 0);
    const mats = new Set();
    this.stage.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      if (o.material && o.material !== benchMaterial()) mats.add(o.material);
    });
    for (const m of mats) m.dispose?.();
    this.tex?.dispose();
    g.scene.remove(this.stage);
    this.stage = this.content = this.frame0 = this.tray = this.board = this.level = this.rubber = null;
    this.tex = null;
    document.body.classList.remove('ws-on');
    this.el.ui.classList.add('hidden');
    this.el.ui.classList.remove('fin');
    this.el.pad.classList.add('hidden');
    this.el.act.classList.add('hidden');
    this.el.act._t = '';
    const hint = this.d.tricks?.el?.hint;
    if (hint) { hint.style.bottom = ''; hint._wsB = null; }
    this.el.task._t = null;
    const p = g.player, sv = this.saved;
    if (sv) p.teleport(sv.x, sv.z, sv.y, sv.facing);
    p.anim?.cancelOneShot?.();
    this.saved = null;
    this.s = null;
    this.ctx = null;
  }

  // ------------------------------------------------------------------ the page
  buildUi() {
    if (typeof document === 'undefined') { this.el = null; return; }
    if (!document.getElementById('wsCss')) {
      const st = document.createElement('style');
      st.id = 'wsCss';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const pad = document.createElement('div');
    pad.id = 'wsPad'; pad.className = 'hidden';
    const ui = document.createElement('div');
    ui.id = 'wsUi'; ui.className = 'hidden';
    ui.innerHTML = '<div id="wsTask" role="status"></div><button id="wsLeave" type="button"></button><button id="wsAct" type="button" class="hidden"></button><div id="wsKeys"></div>';
    document.body.append(pad, ui);
    this.el = { pad, ui, task: ui.querySelector('#wsTask'), leave: ui.querySelector('#wsLeave'), act: ui.querySelector('#wsAct'), keys: ui.querySelector('#wsKeys') };
    this.el.leave.addEventListener('click', () => this.quit());
    this.el.act.addEventListener('click', () => this.action());
    // flying: the battery gauge (in the HUD, so it hides with it) and a Boost button for thumbs
    const hud = document.getElementById('hud'), touch = document.getElementById('touch');
    const bat = document.createElement('div');
    bat.id = 'kiteBat'; bat.className = 'hidden';
    bat.innerHTML = `<img alt="" src="${batteryIcon()}"><span class="bar"><i></i></span><span class="zap"></span>`;
    (hud || document.body).appendChild(bat);
    const boost = document.createElement('button');
    boost.id = 'tBoost'; boost.className = 'tbtn hidden'; boost.type = 'button';
    (touch || document.body).appendChild(boost);
    const inp = this.g.input;
    const down = e => { e.preventDefault(); boost.classList.add('down'); inp.press('sprint'); };
    const up = e => { e.preventDefault(); boost.classList.remove('down'); inp.release('sprint'); };
    boost.addEventListener('touchstart', down, { passive: false });
    boost.addEventListener('touchend', up, { passive: false });
    boost.addEventListener('touchcancel', up, { passive: false });
    boost.addEventListener('mousedown', e => { down(e); addEventListener('mouseup', up, { once: true }); });
    this.bat = { el: bat, fill: bat.querySelector('i'), zap: bat.querySelector('.zap'), boost, shown: false, w: -1, cls: '', zapT: '', boostOn: false };
  }

  bind() {
    const off = this.off = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); off.push(() => t.removeEventListener(ev, fn, opt)); };
    const pad = this.el.pad;
    on(pad, 'pointerdown', e => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ } this.onDown(e.clientX, e.clientY); });
    on(pad, 'pointermove', e => this.onMove(e.clientX, e.clientY));
    on(pad, 'pointerup', e => this.onUp(e.clientX, e.clientY));
    on(pad, 'pointercancel', () => this.onUp(null, null));
    on(pad, 'contextmenu', e => e.preventDefault());
  }
  unbind() { for (const f of this.off || []) f(); this.off = null; }

  quit() {
    const T = this.d.tricks, ctx = this.ctx;
    if (!ctx || this.s?.done) return;
    ctx.quit = true;
    for (const l of [...T.loops]) { T.loops.delete(l); l.res({ quit: true }); }
  }

  task(text, mood = '') {
    const el = this.el.task;
    if (el._t !== text) { el._t = text; el.textContent = text; }
    if (el._m !== mood) { el._m = mood; el.className = mood; }
  }

  button(text) {
    const b = this.el.act;
    if (!text) { if (b._t) { b._t = ''; b.classList.add('hidden'); } return; }
    if (b._t !== text) { b._t = text; b.innerHTML = `${tx(text)}<kbd>Space</kbd>`; b.classList.remove('hidden'); }
  }

  // ------------------------------------------------------------------ geometry helpers
  screenOf(world) {
    const r = this.g.renderer.renderer.domElement.getBoundingClientRect();
    V2.copy(world).project(this.g.camera);
    return [r.left + (V2.x + 1) / 2 * r.width, r.top + (1 - V2.y) / 2 * r.height];
  }
  /** The point of the bench top under a screen point, in `parent`'s space. */
  benchPoint(x, y, parent, out) {
    const r = this.g.renderer.renderer.domElement.getBoundingClientRect();
    NDC.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    RAY.setFromCamera(NDC, this.g.camera);
    const o = RAY.ray.origin, dir = RAY.ray.direction;
    if (dir.y > -0.05) return null;
    const k = (this.geo.O.y - o.y) / dir.y;
    out.set(o.x + dir.x * k, this.geo.O.y, o.z + dir.z * k);
    parent.updateWorldMatrix(true, false);
    return parent.worldToLocal(out);
  }
  /** Pixels per content unit at the bench. */
  pxPerUnit() {
    const r = this.g.renderer.renderer.domElement.getBoundingClientRect();
    return this.view.S * r.height / this.view.h;
  }

  // ------------------------------------------------------------------ what can be touched now
  /** Things to take or press, as { id, obj, r }. */
  items() {
    const s = this.s, out = [], step = STEPS[s.step];
    if (s.lock > 0 || s.test) return out;
    if (step === 'pick') { for (const p of s.parts.values()) if (p.where === 'tray' && !p.picked) out.push(p); }
    else if (step === 'motors') { for (const p of s.parts.values()) if (p.def.kind === 'motor' && p.where === 'tray') out.push(p); }
    else if (step === 'props') { for (const p of s.parts.values()) if (p.def.kind === 'prop') out.push(p); }
    else if (step === 'wire') { for (const w of WIRES) if (!s.wires.has(w.id)) out.push(s.plugs.get(w.from)); }
    else if (step === 'balance') out.push(s.parts.get('battery'));
    else if (step === 'switch' && !s.flipped) out.push(s.parts.get('switch'));
    return out;
  }
  /** Where the thing in hand may go (right places and tempting wrong ones). */
  targets() {
    const s = this.s, out = [], step = STEPS[s.step];
    if (!s.sel || s.lock > 0 || s.test) return out;
    if (step === 'motors') {
      for (const c of CORNERS) if (!s.slots[c]) out.push({ id: c, obj: this.marks[c], r: 0.13 });
      for (const id of Object.keys(WRONG_PLACES)) out.push({ id, obj: this.marks[id], r: 0.09, wrong: true });
    } else if (step === 'props') {
      for (const c of CORNERS) if (s.propAt[c] !== s.sel) out.push({ id: c, obj: this.marks[c], r: 0.15 });
    } else if (step === 'wire') {
      for (const w of WIRES) if (!s.wires.has(w.id)) out.push(s.plugs.get(w.to));
    }
    return out;
  }
  /** The nearest of `list` to a screen point, within reach (at least a 26 px radius, i.e. a 52 px target). */
  nearest(list, x, y, grow = 1) {
    let best = null, bd = 1e9;
    const k = this.pxPerUnit();
    for (const n of list) {
      const [sx, sy] = this.screenOf(n.obj.getWorldPosition(V));
      const d = Math.hypot(sx - x, sy - y), reach = Math.max(26, n.r * k * 1.15) * grow;
      if (d <= reach && d < bd) { bd = d; best = n; }
    }
    return best ? { n: best, d: bd } : null;
  }
  thing(id) { const s = this.s; return s.parts.get(id) || s.plugs.get(id) || (this.marks[id] ? { id, obj: this.marks[id], r: 0.13 } : null); }

  // ------------------------------------------------------------------ pointer
  onDown(x, y) {
    const s = this.s;
    if (!s || s.done) return;
    s.kb = false;
    s.focus = null;
    const step = STEPS[s.step];
    if (step === 'balance') {
      const b = s.parts.get('battery');
      if (this.nearest([b], x, y, 1.5)) { const t = this.railT(x, y); if (t !== null) s.drag = { off: s.bal - t }; }
      return;
    }
    const hitT = s.sel ? this.nearest(this.targets(), x, y) : null;
    const hitI = this.nearest(this.items(), x, y);
    if (hitT) { this.place(hitT.n.id); return; }
    if (!hitI) { this.select(null); return; }
    const id = hitI.n.id;
    s.press = { id, x, y, moved: false, was: s.sel === id };
    if (step !== 'pick' && step !== 'switch') this.select(id);
  }

  onMove(x, y) {
    const s = this.s;
    if (!s || s.done) return;
    if (s.drag) { const t = this.railT(x, y); if (t !== null) this.slide(clamp(t + s.drag.off, 0, 1)); return; }
    const pr = s.press;
    if (!pr) return;
    if (!pr.moved && Math.hypot(x - pr.x, y - pr.y) > 9) pr.moved = true;
    if (!pr.moved) return;
    const step = STEPS[s.step];
    if (step === 'wire') { this.stretch(pr.id, x, y); return; }
    if (step === 'pick' || step === 'switch') return;
    const part = s.parts.get(pr.id);
    if (!part) return;
    this.stopTween(part);
    const p = this.benchPoint(x, y, part.obj.parent, V);
    if (p) part.obj.position.set(p.x, this.restY(part) + 0.09, p.z);
    part.dragging = true;
  }

  onUp(x, y) {
    const s = this.s;
    if (!s) return;
    if (s.drag) { s.drag = null; return; }
    const pr = s.press;
    s.press = null;
    if (!pr || s.done) return;
    const step = STEPS[s.step];
    this.stretch(null);
    if (x === null) { this.settle(pr.id); return; }
    if (!pr.moved) {
      // a tap
      if (step === 'pick' || step === 'switch') this.take(pr.id);
      else if (pr.was) this.select(null);
      return;
    }
    const part = s.parts.get(pr.id);
    if (part) part.dragging = false;
    if (step === 'pick' || step === 'switch') { this.take(pr.id); return; }
    const hit = this.nearest(this.targets(), x, y, 1.25);
    if (hit) this.place(hit.n.id);
    else if (step === 'props' && part && part.where !== 'tray') { this.unfit(part); this.select(null); }
    else { this.settle(pr.id); this.select(null); }
  }

  /** A battery position (0..1 along the rail) from a screen point. */
  railT(x, y) {
    const p = this.benchPoint(x, y, this.frame0, V);
    if (!p) return null;
    const [r0, r1] = FRAME.rail;
    return (-p.z - r0) / (r1 - r0);
  }

  // ------------------------------------------------------------------ doing things
  select(id) {
    const s = this.s;
    if (s.sel === id) return;
    s.sel = id;
    if (id) { this.d.audio.blip(1.5); const t = this.thing(id); if (t) t.wob = 0.0001; }
  }

  /** Tap (or E) on a thing: take it from the tray, take it in hand, or flip the switch. */
  take(id) {
    const s = this.s, step = STEPS[s.step], part = s.parts.get(id);
    if (step === 'pick' && part) {
      if (part.picked || part.where !== 'tray') return;
      s.idle = 0;
      if (part.def.need) {
        part.picked = true;
        s.picked++;
        part.hop = 0.0001;
        this.d.audio.blip(1.2 + s.picked * 0.06);
        this.sparkle(part.obj, 6);
        if (s.picked >= NEEDED) this.after(0.5, () => this.setStep(1));
        else if (s.kb) this.focusNearest(this.items());
      } else {
        this.mistake(SAY[part.def.kind] || SAY.decoy);
        part.wob = 0.0001;
        this.after(0.55, () => this.gone(part));
      }
      return;
    }
    if (step === 'switch' && id === 'switch') { this.action(); return; }
    this.select(s.sel === id ? null : id);
    if (s.kb && s.sel) this.focusNearest(this.targets());
  }

  /** Put the thing in hand at a place. */
  place(tid) {
    const s = this.s, step = STEPS[s.step], sel = s.sel;
    if (!sel) return;
    if (step === 'motors') {
      const part = s.parts.get(sel);
      if (WRONG_PLACES[tid]) {
        // wobbles there and pops back
        this.mistake(SAY.wrongPlace);
        this.frame0.attach(part.obj);
        const m = this.marks[tid].position;
        this.tween(part, V.set(m.x, FRAME.socketY, m.z).clone(), 0.22, 0.12, () => {
          part.wob = 0.0001;
          this.after(0.45, () => this.settle(part.id));
        });
        s.lock = 0.9;
        this.select(null);
        return;
      }
      if (s.slots[tid]) return;
      this.mount(part, tid);
      this.select(null);
      s.idle = 0;
      this.d.audio.hammer?.();
      if (CORNERS.every(c => s.slots[c])) this.after(0.6, () => this.setStep(2));
      else if (s.kb) this.focusNearest(this.items());
      return;
    }
    if (step === 'props') {
      const part = s.parts.get(sel), from = part.where, prev = s.propAt[tid] ? s.parts.get(s.propAt[tid]) : null;
      if (prev === part) { this.settle(sel); this.select(null); return; }
      if (from !== 'tray') delete s.propAt[from];
      if (prev) { delete s.propAt[tid]; if (from !== 'tray') this.fitProp(prev, from); else this.unfit(prev); }
      this.fitProp(part, tid);
      this.select(null);
      s.idle = 0;
      this.d.audio.click();
      if (s.kb) this.focusNearest(this.items().filter(p => p.where === 'tray'));
      return;
    }
    if (step === 'wire') {
      const w = wireFor(sel, tid);
      if (!w) {
        this.mistake(SAY.wrongWire);
        const plug = s.plugs.get(tid);
        if (plug) plug.wob = 0.0001;
        this.sparkle(plug?.obj, 5, [1, 0.5, 0.2]);
        this.select(null);
        return;
      }
      this.connect(w);
      this.select(null);
      s.idle = 0;
      this.d.audio.blip(1.8);
      this.d.audio.click();
      if (wiringDone(s.wires)) this.after(0.6, () => this.setStep(4));
      else if (s.kb) this.focusNearest(this.items());
    }
  }

  /** The big button (Space): spin test, lock the battery, switch on. */
  action() {
    const s = this.s;
    if (!s || s.lock > 0 || s.test || s.done) return;
    const step = STEPS[s.step];
    if (step === 'props' && CORNERS.every(c => s.propAt[c])) {
      this.select(null);
      s.test = { t: 0, res: spinTest(this.layout()), twist: 0, said: -1 };
      this.button(null);
      this.d.audio.click();
    } else if (step === 'balance') {
      const ok = balanced(s.bal, s.ideal);
      this.d.audio.click();
      this.hint(ok ? SAY.level : s.bal > s.ideal ? SAY.noseHeavy : SAY.tailHeavy, 3.5);
      if (ok) this.sparkle(this.level, 10);
      s.idle = 0;
      this.setStep(5);
    } else if (step === 'switch' && !s.flipped) {
      s.flipped = true;
      const sw = s.parts.get('switch').mesh.userData.rocker;
      sw.rotation.x = -0.32;
      sw.material.color.set(COLORS.green);
      this.d.audio.click();
      this.d.audio.lamp?.();
      this.button(null);
      s.done = true;
    }
  }

  layout() { const s = this.s; return Object.fromEntries(CORNERS.map(c => [c, s.propAt[c] ? s.parts.get(s.propAt[c]).def.dir : null])); }

  mistake(text) {
    const s = this.s;
    s.mistakes++;
    s.idle = 0;
    this.d.audio.bad();
    if (text) this.hint(text, 3.6);
  }

  // ------------------------------------------------------------------ moving parts
  restY(part) { return part.where === 'tray' ? 0.012 : part.def.kind === 'prop' ? FRAME.socketY + MOTOR_TOP : part.def.kind === 'battery' ? FRAME.railY : FRAME.socketY; }
  tweening(part) { return this.s.tweens.some(t => t.part === part); }
  stopTween(part) { const s = this.s; s.tweens = s.tweens.filter(t => t.part !== part); }
  tween(part, to, dur = 0.3, arc = 0.1, then = null) {
    this.stopTween(part);
    this.s.tweens.push({ part, from: part.obj.position.clone(), to, t: 0, dur, arc, then });
  }
  /** Back to where it rests (its tray place or its socket). */
  settle(id) {
    const part = this.s.parts.get(id);
    if (!part) return;
    part.dragging = false;
    if (part.where === 'tray') {
      this.content.attach(part.obj);
      part.obj.rotation.set(0, 0, 0);
      part.obj.scale.setScalar(1);
      this.tween(part, part.home.clone(), 0.28, 0.1);
    } else if (part.def.kind === 'battery') this.placeBattery();
    else {
      const m = this.marks[part.where]?.position;
      if (m) this.tween(part, new THREE.Vector3(m.x, this.restY(part), m.z), 0.2, 0.05);
    }
  }
  gone(part, now = false) {
    part.where = 'gone';
    if (now) { part.obj.visible = false; return; }
    const out = part.obj.position.clone();
    out.x += this.view.wide ? 1.4 : (part.obj.position.x < 0 ? -1.6 : 1.6);
    this.tween(part, out, 0.5, 0.35, () => { part.obj.visible = false; });
    this.d.audio.whoosh?.(2);
  }
  mount(part, corner, now = false) {
    const s = this.s, m = this.marks[corner].position;
    s.slots[corner] = part.id;
    part.where = corner;
    this.frame0.attach(part.obj);
    const to = new THREE.Vector3(m.x, FRAME.socketY, m.z);
    part.obj.rotation.y = Math.atan2(-m.x, -m.z);        // its two leads point along the spar to the hub
    if (now) { this.stopTween(part); part.obj.position.copy(to); } else this.tween(part, to, 0.26, 0.14, () => { part.hop = 0.0001; this.sparkle(part.obj, 5); });
  }
  fitProp(part, corner, now = false) {
    const s = this.s, m = this.marks[corner].position;
    s.propAt[corner] = part.id;
    part.where = corner;
    this.frame0.attach(part.obj);
    const to = new THREE.Vector3(m.x, FRAME.socketY + MOTOR_TOP, m.z);
    if (now) { this.stopTween(part); part.obj.position.copy(to); } else this.tween(part, to, 0.26, 0.14, () => { part.hop = 0.0001; });
  }
  unfit(part) {
    const s = this.s;
    if (part.where !== 'tray' && s.propAt[part.where] === part.id) delete s.propAt[part.where];
    part.where = 'tray';
    part.obj.rotation.y = 0;
    this.settle(part.id);
  }

  /** The battery in its rail and the switch on its seat; the coil is used up; the plugs appear. */
  seatPower(now = false) {
    const s = this.s, bat = s.parts.get('battery'), sw = s.parts.get('switch'), coil = s.parts.get('wire');
    bat.where = 'rail'; sw.where = 'seat';
    this.frame0.attach(bat.obj); this.frame0.attach(sw.obj);
    const by = lerp(FRAME.rail[0], FRAME.rail[1], s.bal);
    const bt = new THREE.Vector3(0, FRAME.railY, -by), st = new THREE.Vector3(FRAME.seat.x, 0.038, -FRAME.seat.y);
    if (now) { bat.obj.position.copy(bt); sw.obj.position.copy(st); this.gone(coil, true); } else {
      this.tween(bat, bt, 0.45, 0.25, () => { bat.hop = 0.0001; });
      this.tween(sw, st, 0.45, 0.25, () => { sw.hop = 0.0001; });
      coil.where = 'gone';
      this.tween(coil, new THREE.Vector3(this.frame0.position.x, 0.2, this.frame0.position.z), 0.5, 0.2, () => { coil.obj.visible = false; });
    }
    // plugs (sources) and sockets (sinks)
    const add = (id, color, socket, x, y, h = 0.05) => {
      const m = makePlug(color, socket);
      m.position.set(x, h, -y);
      this.frame0.add(m);
      s.plugs.set(id, { id, obj: m, r: 0.07, wob: 0, color, socket, base: m.position.clone() });
    };
    add('bat+', 'red', false, 0, by + BATTERY_HALF + 0.03, 0.06);
    add('bat-', 'black', false, 0, by - BATTERY_HALF - 0.03, 0.06);
    add('sw-in', 'red', true, SW_IN[0], SW_IN[1]);
    add('lug', 'black', true, FRAME.lug.x, FRAME.lug.y);
    MOTOR_COLORS.forEach((c, i) => {
      add(`sw-${c}`, c, false, SW_OUT[c][0], SW_OUT[c][1]);
      const corner = CORNERS.find(k => s.slots[k] === `motor${i}`), sk = SOCKETS[corner];
      add(`motor${i}`, c, true, sk.x * 0.62, sk.y * 0.62);
    });
  }

  /** The way a wire runs over the frame (frame space). */
  route(w) {
    const s = this.s, h = 0.062, by = lerp(FRAME.rail[0], FRAME.rail[1], s.bal), P3 = (x, y, hh = h) => new THREE.Vector3(x, hh, -y);
    if (w.id === 'red') { const a = by + BATTERY_HALF + 0.03; return [P3(0, a), P3(0.035, (a + SW_IN[1]) / 2, h + 0.03), P3(SW_IN[0], SW_IN[1])]; }
    if (w.id === 'black') { const a = by - BATTERY_HALF - 0.03; return [P3(0, a), P3(-0.035, (a + FRAME.lug.y) / 2, h + 0.03), P3(FRAME.lug.x, FRAME.lug.y)]; }
    const [px, py] = SW_OUT[w.color], corner = CORNERS.find(k => s.slots[k] === `motor${w.motor}`), sk = SOCKETS[corner];
    const side = Math.sign(sk.x) || 1;
    return [P3(px, py), P3(px * 0.9 + side * 0.02, 0.3, h + 0.03), P3(sk.x * 0.24 + side * 0.02, sk.y * 0.2, h + 0.02), P3(sk.x * 0.62, sk.y * 0.62)];
  }
  connect(w, now = false) {
    const s = this.s;
    s.wires.add(w.id);
    this.drawWire(w);
    for (const id of [w.from, w.to]) { const p = s.plugs.get(id); if (p) { p.done = true; p.obj.scale.setScalar(0.72); } }
    if (!now) this.sparkle(s.plugs.get(w.to)?.obj, 6);
  }
  drawWire(w) {
    const s = this.s, old = s.wireMesh.get(w.id);
    if (old) { old.geometry.dispose(); old.removeFromParent(); }
    const m = makeWire(this.route(w), w.color);
    this.frame0.add(m);
    s.wireMesh.set(w.id, m);
  }
  /** While a wire is dragged: a rubber wire from its plug to the finger (null: gone). */
  stretch(id, x, y) {
    if (this.rubber) { this.rubber.geometry.dispose(); this.rubber.removeFromParent(); this.rubber = null; }
    const plug = id ? this.s.plugs.get(id) : null;
    if (!plug) return;
    const p = this.benchPoint(x, y, this.frame0, V);
    if (!p) return;
    const a = plug.base.clone(), b = new THREE.Vector3(p.x, 0.09, p.z);
    if (a.distanceTo(b) < 0.03) return;
    const mid = a.clone().lerp(b, 0.5); mid.y += 0.06;
    this.rubber = makeWire([a, mid, b], plug.color, 0.015, 10);
    this.frame0.add(this.rubber);
  }

  placeBattery() {
    const s = this.s, bat = s.parts.get('battery'), by = lerp(FRAME.rail[0], FRAME.rail[1], s.bal);
    this.stopTween(bat);
    bat.obj.position.set(0, FRAME.railY, -by);
    if (s.balSeen === null || Math.abs(s.balSeen - s.bal) > 0.004) {
      s.balSeen = s.bal;
      for (const w of WIRES) if ((w.id === 'red' || w.id === 'black') && s.wires.has(w.id)) this.drawWire(w);
    }
  }
  slide(t) {
    const s = this.s;
    if (t === s.bal) return;
    if (Math.abs(t - s.bal) > 0.002) s.idle = 0;
    s.bal = t;
    this.placeBattery();
  }

  sparkle(obj, n = 6, color = [1, 0.9, 0.5]) {
    if (!obj) return;
    this.d.fx?.burst?.(obj.getWorldPosition(new THREE.Vector3()).add(V.set(0, 0.06, 0)), { n, color, speed: 0.7, life: 0.5, size: 0.07, gravity: -0.2 });
  }

  after(sec, fn) { this.s.timers.push({ t: sec, fn }); }

  // ------------------------------------------------------------------ steps
  setStep(i, quiet = false) {
    const s = this.s, name = STEPS[i];
    s.step = i;
    s.sel = null; s.focus = null; s.idle = 0; s.hintN = 0;
    DESC.unit = `/ ${STEPS.length} · ${tx(TASK[name].name)}`;
    this.ctx.hud(i + 1, null);
    this.button(null);
    if (name === 'motors') {
      for (const p of s.parts.values()) if (!p.def.need && p.where === 'tray') this.gone(p);
    }
    if (name === 'wire' && !s.plugs.size) this.seatPower();
    const plugsOn = name === 'wire';
    for (const p of s.plugs.values()) p.obj.visible = plugsOn;
    this.level.visible = i >= 4;
    if (name === 'balance') { s.bubble = bubbleAt(s.bal, s.ideal); this.button(LABEL.lock); }
    if (name === 'switch') this.button(LABEL.switchOn);
    if (!quiet) {
      this.d.audio.good();
      // the step reached is kept at once: closing the tab is a way of leaving, too
      this.keepProgress();
    }
    if (s.first || !quiet) this.after(0.8, () => { if (this.s?.step === i && HINTS[name]?.[0] && s.first) this.hint(HINTS[name][0], 5.5); });
  }

  keepProgress() {
    const s = this.s, rec = this.rec;
    if (!s || !rec || s.done) return;
    const step = s.step;
    rec.prog = cleanWorkshop({ prog: {
      step, mistakes: s.mistakes,
      slots: step > 1 ? CORNERS.map(c => +s.slots[c].slice(5)) : null,
      layout: step > 2 ? this.layout() : null,
      bal: step > 4 ? s.bal : null,
    } }).prog;
  }

  /** The switch is on: fold the build into the record. Returns what the card shows. */
  finish() {
    const s = this.s, st = this.st;
    const bs = balanceScore(s.bal, s.ideal), q = quality(s.mistakes, bs), first = !this.rec.built;
    const { rec, stars, newBest } = recordBuild(this.rec, q);
    st.workshop = rec;
    const note = s.mistakes === 0 && bs >= 1 ? CARD.perfect : s.mistakes === 0 ? CARD.clean : bs >= 1 ? CARD.level : '';
    return { quality: q, stars, newBest, first, mistakes: s.mistakes, balance: bs, note, score: q };
  }

  // ------------------------------------------------------------------ every frame of a build
  frame(dt) {
    const s = this.s, g = this.g, inp = g.input;
    if (!s) return 'done';
    s.t += dt;
    this.relayout();
    if (s.lock > 0) s.lock -= dt;
    for (const tm of [...s.timers]) { tm.t -= dt; if (tm.t <= 0) { s.timers.splice(s.timers.indexOf(tm), 1); tm.fn(); if (!this.s) return 'done'; } }
    // tweens
    for (const tw of [...s.tweens]) {
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.dur));
      tw.part.obj.position.lerpVectors(tw.from, tw.to, k);
      tw.part.obj.position.y += tw.arc * Math.sin(Math.PI * k);
      if (tw.t >= tw.dur) { s.tweens.splice(s.tweens.indexOf(tw), 1); tw.then?.(); }
    }
    // little motions: a wobble (no), a hop (yes), the thing in hand floats
    const move = t => {
      if (t.wob > 0) { t.wob += dt; const k = Math.max(0, 1 - t.wob / 0.5); t.obj.rotation.z = Math.sin(t.wob * 38) * 0.28 * k; if (k <= 0) { t.wob = 0; t.obj.rotation.z = 0; } }
      if (t.hop > 0) { t.hop += dt; const k = Math.min(1, t.hop / 0.3); const sc = 1 + 0.22 * Math.sin(Math.PI * k); t.obj.scale.setScalar(sc * (t.done ? 0.72 : 1)); if (k >= 1) t.hop = 0; }
    };
    for (const p of s.parts.values()) move(p);
    for (const p of s.plugs.values()) move(p);
    const step = STEPS[s.step];
    // parts chosen in the pick step sit a little proud of the felt, the rest lie flat
    for (const p of s.parts.values()) { const on = step === 'pick' && p.picked; if (p.tick.visible !== on) p.tick.visible = on; }

    this.keys(dt);
    if (s.test) this.runTest(dt);
    if (step === 'balance') this.runBalance(dt);
    this.rings();
    this.words();
    if (!this.view.wide) {
      const hb = this.el.act._t ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : 'calc(14px + env(safe-area-inset-bottom, 0px))', h = this.d.tricks.el.hint;
      if (h._wsB !== hb) { h._wsB = hb; h.style.bottom = hb; }
    }

    // Tamo nudges when nothing has happened for a while
    s.idle += dt;
    const every = this.debug.hintAfter;
    if (s.idle > every && !s.test && !s.done) {
      s.idle = every * 0.35;
      const H = HINTS[step] || [];
      if (H.length) this.hint(H[Math.min(H.length - 1, s.hintN++ % Math.max(1, H.length))], 5.5);
    }
    if (s.done) return 'done';
    return undefined;
  }

  /** Keys and pad: the highlight moves with the stick, E takes and places, Space is the big button. */
  keys(dt) {
    const s = this.s, inp = this.g.input, step = STEPS[s.step];
    const m = inp.move || { x: 0, y: 0 };
    if (step === 'balance') {
      if (Math.abs(m.y) > 0.3 || Math.abs(m.x) > 0.3) { s.kb = true; this.slide(clamp(s.bal + (Math.abs(m.y) > 0.3 ? m.y : m.x) * 0.3 * dt, 0, 1)); }
      if (inp.pressed('act') || inp.pressed('jump')) this.action();
      return;
    }
    let dir = null;
    if (Math.abs(m.x) > 0.6 || Math.abs(m.y) > 0.6) dir = Math.abs(m.x) > Math.abs(m.y) ? (m.x > 0 ? 'r' : 'l') : (m.y > 0 ? 'u' : 'd');
    const nav = s.nav;
    if (dir !== nav.dir) { nav.dir = dir; nav.hold = 0; if (dir) this.moveFocus(dir); }
    else if (dir) { nav.hold += dt; if (nav.hold > 0.34) { nav.hold = 0.2; this.moveFocus(dir); } }
    if (inp.pressed('jump')) { s.kb = true; this.action(); }
    if (inp.pressed('act')) {
      s.kb = true;
      if (step === 'switch') { this.action(); return; }
      const list = this.focusList();
      if (!s.focus || !list.some(n => n.id === s.focus)) { this.focusNearest(list); return; }
      const isTarget = s.sel && this.targets().some(n => n.id === s.focus);
      if (isTarget) this.place(s.focus); else this.take(s.focus);
    }
  }
  focusList() { const s = this.s; return s.sel ? [...this.targets(), ...this.items().filter(n => n.id === s.sel)] : this.items(); }
  focusNearest(list) {
    const s = this.s;
    if (!list.length) { s.focus = null; return; }
    const from = s.focus && this.thing(s.focus) ? this.screenOf(this.thing(s.focus).obj.getWorldPosition(V)) : s.sel && this.thing(s.sel) ? this.screenOf(this.thing(s.sel).obj.getWorldPosition(V)) : [innerWidth / 2, innerHeight / 2];
    let best = null, bd = 1e9;
    for (const n of list) { const [x, y] = this.screenOf(n.obj.getWorldPosition(V)); const d = Math.hypot(x - from[0], y - from[1]); if (d < bd) { bd = d; best = n; } }
    s.focus = best.id;
  }
  moveFocus(dir) {
    const s = this.s, list = this.focusList();
    s.kb = true;
    if (!list.length) return;
    const cur = list.find(n => n.id === s.focus);
    if (!cur) { this.focusNearest(list); return; }
    const [cx, cy] = this.screenOf(cur.obj.getWorldPosition(V));
    const dx = dir === 'r' ? 1 : dir === 'l' ? -1 : 0, dy = dir === 'd' ? 1 : dir === 'u' ? -1 : 0;
    let best = null, bs = 1e9;
    for (const n of list) {
      if (n === cur) continue;
      const [x, y] = this.screenOf(n.obj.getWorldPosition(V));
      const along = (x - cx) * dx + (y - cy) * dy, across = Math.abs((x - cx) * dy) + Math.abs((y - cy) * dx);
      if (along < 6) continue;
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = n; }
    }
    if (best) { s.focus = best.id; this.d.audio.blip(2); }
  }

  /** The spin test: the motors run, then the kite leans forward and sideways as it would to steer. */
  runTest(dt) {
    const s = this.s, T = s.test, f = this.frame0;
    T.t += dt;
    const res = T.res, up = Math.min(1, T.t / 0.7), down = T.t > 3.0 ? Math.max(0, 1 - (T.t - 3.0) / 0.5) : 1;
    const power = up * down;
    this.spin(dt, power);
    this.d.audio.kiteHum?.(power > 0.02, 0.2 + power * 0.6);
    // hover (0.7-1.4), lean forward (1.4-2.2), lean sideways (2.2-3.0)
    const phase = T.t < 0.7 ? -1 : T.t < 1.4 ? 0 : T.t < 2.2 ? 1 : T.t < 3.0 ? 2 : 3;
    const push = phase === 0 ? res.hover : phase === 1 ? res.pitch : phase === 2 ? res.roll : 0;
    if (phase !== T.said && phase >= 0 && phase < 3) { T.said = phase; this.task(tx([TASK.test.hover, TASK.test.fwd, TASK.test.side][phase]), push ? 'bad' : ''); if (push) this.d.audio.bad(); }
    T.twist += (push * 0.9 - T.twist * (push ? 0.6 : 5)) * dt;
    T.twist = clamp(T.twist, -0.85, 0.85);
    f.rotation.y = T.twist + (push ? Math.sin(T.t * 31) * 0.02 : 0);
    f.rotation.x = phase === 1 ? -0.1 * Math.sin((T.t - 1.4) / 0.8 * Math.PI) : 0;
    f.rotation.z = phase === 2 ? 0.1 * Math.sin((T.t - 2.2) / 0.8 * Math.PI) : 0;
    f.position.y = 0.05 * power * (1 / Math.max(0.3, this.view.S));
    this.frameShadow.visible = power > 0.05;
    if (T.t < 3.5) return;
    // over
    f.rotation.set(0, 0, 0);
    f.position.y = 0;
    this.frameShadow.visible = false;
    this.d.audio.kiteHum?.(false, 0);
    for (const p of s.parts.values()) if (p.def.kind === 'prop') { p.obj.rotation.y = 0; if (p.disc) p.disc.material.opacity = 0; p.mesh.visible = true; }
    s.test = null;
    s.idle = 0;
    s.wordsKey = null;            // the task line goes back from the test's commentary to the step's own words
    if (res.ok) {
      this.hint(SAY.testGood, 3.5);
      this.d.audio.star?.();
      this.setStep(3);
    } else {
      this.mistake(res.pitch ? SAY.testPitch : SAY.testRoll);
      s.hintN = 1;
      this.button(LABEL.test);
    }
  }

  /** Turn the fitted propellers (power 0..1): the blades up to a blur, then a tinted disc. */
  spin(dt, power) {
    const s = this.s;
    for (const p of s.parts.values()) {
      if (p.def.kind !== 'prop' || p.where === 'tray') continue;
      const rate = 46 * power;
      p.obj.rotation.y += (p.def.dir === 'cw' ? -1 : 1) * Math.min(rate * dt, 0.9);
      if (p.disc) p.disc.material.opacity = 0.42 * clamp((power - 0.45) / 0.4, 0, 1);
    }
  }

  runBalance(dt) {
    const s = this.s, L = this.level;
    const target = bubbleAt(s.bal, s.ideal);
    // the bubble swims after the tilt
    s.bubbleV += ((target - s.bubble) * 60 - s.bubbleV * 7) * dt;
    s.bubble = clamp(s.bubble + s.bubbleV * dt, -1.05, 1.05);
    L.userData.bubble.position.z = -s.bubble * LEVEL.travel;
    const ok = balanced(s.bal, s.ideal);
    L.userData.marks.material.color.set(ok ? '#1f9a3e' : '#3a2a1a');
    if (ok !== s.wasLevel) { s.wasLevel = ok; if (ok) this.d.audio.blip(2.2); }
  }

  /** The highlight rings: keyboard focus, the thing in hand, and where it may go. */
  rings() {
    const s = this.s, st = this.stage, S = this.view.S;
    const put = (ring, obj, r, pulse = 0) => {
      st.worldToLocal(obj.getWorldPosition(V));
      ring.position.set(V.x, 0.02, V.z);
      ring.scale.setScalar(S * r / 0.12 * (1 + pulse * 0.08 * Math.sin(s.t * 6)));
      ring.visible = true;
    };
    const sel = s.sel ? this.thing(s.sel) : null;
    if (sel) put(this.selRing, sel.obj, sel.r); else this.selRing.visible = false;
    const foc = s.kb && s.focus ? this.focusList().find(n => n.id === s.focus) : null;
    if (foc) put(this.focusRing, foc.obj, foc.r * 1.08, 1); else this.focusRing.visible = false;
    const tg = sel ? this.targets().filter(n => !n.wrong) : [];
    this.spots.forEach((r, i) => { if (tg[i]) put(r, tg[i].obj, tg[i].r, 1); else r.visible = false; });
  }

  /** The task line, with its counters. */
  words() {
    const s = this.s, step = STEPS[s.step];
    if (s.test) return;
    const n = step === 'pick' ? s.picked : step === 'motors' ? CORNERS.filter(c => s.slots[c]).length : step === 'props' ? CORNERS.filter(c => s.propAt[c]).length : s.wires.size;
    const key = `${step}|${n}|${s.sel ? 1 : 0}`;
    if (key === s.wordsKey) return;
    s.wordsKey = key;
    const total = step === 'pick' ? NEEDED : step === 'wire' ? WIRES.length : 4;
    this.task(tx(TASK[step].task, { n, total }));
    if (step === 'props') this.button(n === 4 ? LABEL.test : null);
  }

  // ------------------------------------------------------------------ switched on: the hover
  async hover(ctx) {
    const s = this.s, d = this.d, g = this.g, { O, fwd, right } = this.geo, f = this.frame0;
    this.el.ui.classList.add('fin');
    this.select(null);
    for (const r of [this.focusRing, this.selRing, ...this.spots]) r.visible = false;
    const tilt = (1 - balanceScore(s.bal, s.ideal)) * (s.bal > s.ideal ? -1 : 1) * 0.1;
    const H = { t: 0, land: 0, over: false };
    const lift = HOVER / this.view.S;
    this.frameShadow.visible = true;
    // Mika comes round the bench to watch; the camera tips up to see the kite off the wood
    const p = g.player, back = this.view.h / 2 + 0.25 + 0.32;
    const fw = f.getWorldPosition(new THREE.Vector3());
    const side = (fw.x - O.x) * right.x + (fw.z - O.z) * right.z + 0.55 * this.view.S;
    p.teleport(O.x + fwd.x * back + right.x * side, O.z + fwd.z * back + right.z * side, this.geo.floor, Math.atan2(-fwd.x, -fwd.z));
    // where Grandma will stand when she looks in (her story only): beside Mika, behind the bench
    const gs = side - 1.3 * this.view.S;
    this.soraSpot = { x: O.x + fwd.x * back + right.x * gs, z: O.z + fwd.z * back + right.z * gs, y: this.geo.floor, facing: Math.atan2(-fwd.x, -fwd.z) };
    g.follow.cutscene({ pos: fw.clone().addScaledVector(fwd, -1.75).addScaledVector(UP, 1.2), look: fw.clone().addScaledVector(UP, 0.1) }, 2.2);
    const loop = ctx.loop(dt => {
      if (!this.s) return true;
      H.t += dt;
      const up = Math.min(1, H.t / 2.6), down = H.land ? Math.max(0, 1 - (H.t - H.land) / 1.1) : 1, power = ease(up) * down;
      this.spin(dt, 0.25 + 0.75 * power);
      d.audio.kiteHum?.(power > 0.01, 0.1 + 0.75 * power);
      const air = clamp((power - 0.55) / 0.45, 0, 1);
      f.position.y = lift * ease(air) + (air > 0.9 ? Math.sin(H.t * 2.4) * 0.012 / this.view.S : 0);
      f.rotation.x = tilt * air + Math.sin(H.t * 1.7) * 0.012 * air;
      f.rotation.z = Math.sin(H.t * 1.3 + 1) * 0.014 * air;
      this.frameShadow.scale.setScalar(0.6 * (1 - 0.18 * air));
      this.frameShadow.material.opacity = 0.22;
      if (air > 0.5 && Math.random() < dt * 5) this.sparkle(f, 2);
      if (H.land && down <= 0) { H.over = true; return true; }
      return undefined;
    });
    await ctx.wait(3.3);
    if (this.s) { p.anim?.once?.('Cheer', { then: 'Idle' }); d.audio.fanfare?.(); }
    await ctx.wait(0.9);
    if (this.s) await this.talk(this.lines('done'));
    H.land = H.t;
    await Promise.race([loop, ctx.wait(1.4)]);
    d.audio.kiteHum?.(false, 0);
  }

  /**
   * The scene at the bench, played without the director's talk camera (the hover shot stays). In the Grandma story
   * Grandma comes in at her first line and stands beside Mika; she goes back to her garden when the bench is cleared.
   */
  async talk(lines) {
    const d = this.d, so = d.npcs?.sora;
    d.busy++;
    try {
      await d.ui.dialogue(lines, {
        onLine: (who, anim) => {
          if (who === 'sora' && so) { this.bringSora(); so.gesture(anim || 'Talk'); }
          else if (who === 'mika') this.g.player.anim?.once(anim || 'Talk', { then: 'Idle' });
          else if (who === 'tamo') d.tamo?.react(anim || 'Talk');
          d.audio.blip(1);
        },
      });
    } finally {
      d.busy--;
      d.actCooldown = 0.5;
      if (this.soraWas && so) so.setIdle(so.idleClip);
    }
  }

  bringSora() {
    const so = this.d.npcs?.sora, at = this.soraSpot;
    if (!so || !at || this.soraWas || so.riding || so.storyVisible === false || so.hiddenBy) return;
    // indoors the interiors keep everything from outside undrawn through an intercepted `visible` (world/interiors.js):
    // lift it for her while she is in the room, and put the very same interception back when she leaves
    const veil = Object.getOwnPropertyDescriptor(so.root, 'visible');
    this.soraWas = { x: so.pos.x, y: so.pos.y, z: so.pos.z, facing: so.facing, veil: veil?.get ? veil : null };
    if (veil?.get) delete so.root.visible;
    so.place(at.x, at.z, at.facing, at.y);
    so.root.visible = true;
    this.d.fx?.burst?.(so.head(), { n: 14, color: [1, 0.9, 0.6], speed: 1.2, life: 0.6, size: 0.12, gravity: -0.2 });
  }

  sendSoraHome() {
    const so = this.d.npcs?.sora, was = this.soraWas;
    this.soraWas = null;
    this.soraSpot = null;
    if (so && was) {
      so.place(was.x, was.z, was.facing, was.y);
      if (was.veil && !Object.getOwnPropertyDescriptor(so.root, 'visible')?.get) { const want = so.visible && !so.far; Object.defineProperty(so.root, 'visible', was.veil); so.root.visible = want; }
    }
  }

  // ------------------------------------------------------------------ flying with the motors
  /** Called every frame by the director (also with no build on the bench). */
  update(dt) {
    const st = this.st, g = this.g, kite = g.kite;
    if (!st || !kite) return;
    const w = st.workshop, stars = w?.built ? Math.max(1, w.stars || 1) : 0;
    if (stars !== this.kitStars) this.fit(stars);
    if (!this.spec) { if (this.bat?.shown) this.gauge(false); return; }
    const flying = kite.carrying;
    if (!flying) {
      // on the ground: it charges by itself, and quickly beside a lit Star Lamp or the mill wheel
      this.boosting = false;
      this.powerT -= dt;
      if (this.powerT <= 0) { this.powerT = 0.4; this.nearPower = this.charge < 1 && this.powerNear(); }
      const before = this.charge;
      this.charge = groundCharge(this.charge, this.nearPower, dt, this.spec);
      if (before < 1 && this.charge >= 1) this.d.audio?.blip?.(2.4);
    }
    flightNumbers(this.spec, this.charge, this.N);
    // the rotor discs glow a little while the motors push
    if (kite.active && kite.discs) {
      const k = this.N.k * (this.boosting ? 1 : 0.35);
      if (k !== this.discK) { this.discK = k; for (const dsc of kite.discs) if (dsc) dsc.material.color.set('#fff2d2').lerp(DISC_HOT, k * 0.8); }
    }
    const show = !this.active && !g.interiors?.active && !this.d.scenes?.active && (kite.active || this.charge < 0.995);
    this.gauge(show, flying);
  }

  /** Hang the kit on the kite (and on the one in the cradle), or take it off: stars 0 = no build. */
  fit(stars) {
    const g = this.g, kite = g.kite, ks = this.d.kiteStand;
    this.kitStars = stars;
    this.spec = assistSpec(stars);
    kite.assist = this.spec ? this.assist : null;
    this.charge = 1;
    this.discK = -1;
    flightNumbers(this.spec, this.charge, this.N);
    if (this.spec && !this.kit) {
      const low = g.renderer?.q?.name === 'low';
      const a = makeKiteKit(low);
      a.castShadow = g.world?.quality?.propShadows !== false;
      const b = new THREE.Mesh(a.geometry, a.material);
      b.name = a.name;
      this.kit = [a, b];
    }
    if (!this.kit) return;
    if (this.spec) { kite.model?.add(this.kit[0]); ks?.obj.add(this.kit[1]); }
    else { for (const m of this.kit) m.removeFromParent(); for (const dsc of kite.discs || []) dsc?.material.color.set('#fff2d2'); }
  }

  /** Is Mika beside a lit Star Lamp or the mill wheel? */
  powerNear() {
    const g = this.g, p = g.player.pos, R = this.spec.powerRange;
    if (g.interiors?.active) return false;
    const mill = PLACES.mill;
    if (mill && this.st?.lamps?.mill && Math.hypot(p.x - mill.x, p.z - mill.z) < R) return true;
    for (const L of g.structures?.lamps?.values?.() || []) if (L.lit > 0.5 && L.flame && Math.hypot(p.x - L.flame.x, p.z - L.flame.z) < R) return true;
    return false;
  }

  gauge(show, flying = false) {
    const B = this.bat;
    if (!B) return;
    if (show !== B.shown) { B.shown = show; B.el.classList.toggle('hidden', !show); }
    const boostBtn = show && flying && !!this.d.ui.touch;
    if (boostBtn !== B.boostOn) { B.boostOn = boostBtn; B.boost.classList.toggle('hidden', !boostBtn); if (boostBtn) B.boost.textContent = tx(LABEL.boost); else this.g.input.release('sprint'); }
    if (!show) return;
    const w = Math.round(this.charge * 50) / 50;
    if (w !== B.w) { B.w = w; B.fill.style.transform = `scaleX(${Math.max(0.02, w)})`; }
    const cls = `${this.charge <= 0.001 ? 'empty' : this.charge < 0.25 ? 'low' : ''}${this.boosting ? ' boost' : ''}`;
    if (cls !== B.cls) { B.cls = cls; B.el.className = cls.trim(); }
    const zap = !flying && this.charge < 0.995 ? (this.nearPower ? '⚡⚡' : '⚡') : '';
    if (zap !== B.zapT) { B.zapT = zap; B.zap.textContent = zap; }
  }

  /** For the QA autopilot: where everything is on the screen right now. */
  qa() {
    const s = this.s;
    if (!s) return { active: this.active, charge: this.charge, spec: this.spec, near: this.nearPower, N: { ...this.N } };
    const at = n => { const [x, y] = this.screenOf(n.obj.getWorldPosition(new THREE.Vector3())); return { id: n.id, x: Math.round(x), y: Math.round(y), r: Math.round(Math.max(26, n.r * this.pxPerUnit() * 1.15)), wrong: !!n.wrong, kind: n.def?.kind, dir: n.def?.dir, need: n.def?.need, where: n.where }; };
    return {
      active: true, step: STEPS[s.step], stepN: s.step, mistakes: s.mistakes, sel: s.sel, focus: s.focus, lock: s.lock > 0, test: !!s.test, done: s.done, picked: s.picked,
      items: this.items().map(at), targets: this.targets().map(at), layout: this.layout(), slots: { ...s.slots }, wires: [...s.wires], bal: s.bal, ideal: s.ideal, bubble: s.bubble,
      view: this.view, button: this.el.act._t || '', task: this.el.task._t || '',
      battery: at(s.parts.get('battery')), rail: [0, 1].map(t => { const o = new THREE.Vector3(0, FRAME.railY, -lerp(FRAME.rail[0], FRAME.rail[1], t)); const [x, y] = this.screenOf(this.frame0.localToWorld(o)); return [Math.round(x), Math.round(y)]; }),
    };
  }
}
