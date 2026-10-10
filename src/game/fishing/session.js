// Fishing at the Kawabe dock, in the world: the camera lifts to look down into clear water where the fish swim, a
// click or tap on the water casts the float there, and the catch is played out on the line (rules: ./sim.js).
//
// One FishingSession lives from "Fish" at the dock until Mika leaves (Backspace / Esc / the Leave button, or the story
// taking the screen). It owns everything it adds: the pond (clear water + school), rod, line, float, aim ring, its
// DOM (a hint pill, the round reel button with its tension ring, Leave) and its pointer listeners, and gives it all
// back in dispose(). The story contract is unchanged: every catch is director.event({ type: 'catch', species }).
import * as THREE from 'three';
import { WATER_Y } from '../../world/layout.js';
import { FISH } from '../story.js';
import { tx, N_ } from '../../i18n/i18n.js';
import { FishingSim, CAST, BIG, PILE, makeFish, planCast, sizeFraction, pileSlot, pileAdd } from './sim.js';
import { FishPond, SPOT, STAND, WATERS, fishingShot } from './pond.js';

const HINTS = {
  aimMouse: N_('Click the water to cast'),
  aimTouch: N_('Tap the water to cast'),
  wait: N_('Wait for a fish…'),
  approach: N_('A fish is coming… wait!'),
  nibble: N_('A nibble… not yet!'),
  bite: N_('Bite! Hook it now!'),
  reel: N_('Hold to reel it in'),
  surge: N_('It surges! Let go!'),
  strain: N_('The line is straining! Let go!'),
  early: N_('Too early! Wait for the float to sink.'),
  missed: N_('It got away. Strike when the float sinks.'),
  lost: N_('The fish lost interest.'),
  snap: N_('The line snapped! It got away.'),
  slack: N_('Too slack. It slipped the hook.'),
  keys: N_('E or Space: hook and reel · arrows: aim · Backspace: leave'),
};
const BTN = { cast: N_('Cast'), hook: N_('Hook!'), reel: N_('Reel'), leave: N_('Leave') };
const CATCH = { line: N_('{fish} · {cm} cm'), big: N_('A big one!'), record: N_('New record!') };

const CSS = `
body.fishing #touch, body.fishing #prompt, body.fishing #marker, body.fishing #compass { display: none !important; }
#fishPad { position: fixed; inset: 0; z-index: 9; touch-action: none; cursor: crosshair; -webkit-tap-highlight-color: transparent; }
#fishUi { position: fixed; inset: 0; z-index: 13; pointer-events: none; font-family: Nunito, sans-serif; zoom: var(--ui-scale, 1); }
#fishHint { position: absolute; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); max-width: min(520px, 88vw);
  padding: 9px 18px 11px; border-radius: 999px; background: rgba(255, 247, 232, .94); color: #4a3320; font-weight: 800; font-size: 17px; text-align: center;
  box-shadow: 0 6px 18px rgba(20, 30, 60, .28); transition: opacity .25s; overflow: hidden; white-space: nowrap; }
#fishHint.off { opacity: 0; }
#fishHint.hot { background: #ffdf7a; animation: fishPop .3s ease; }
#fishHint.bad { background: #ffd2c8; }
#fishHint i { position: absolute; left: 0; bottom: 0; height: 4px; width: 0; background: linear-gradient(90deg, #6fcf7f, #37b3a6); border-radius: 2px; }
#fishKeys { position: absolute; left: 50%; bottom: calc(104px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); color: #fff; font-weight: 700; font-size: 13px;
  padding: 3px 12px; border-radius: 999px; background: rgba(24, 32, 58, .5); white-space: nowrap; }
body.touch #fishKeys { display: none; }
body.touch #fishReel { bottom: calc(28px + env(safe-area-inset-bottom, 0px)); }
body.touch #fishLeave { bottom: calc(40px + env(safe-area-inset-bottom, 0px)); }
#fishReel { position: absolute; right: calc(26px + env(safe-area-inset-right, 0px)); bottom: calc(74px + env(safe-area-inset-bottom, 0px)); width: 104px; height: 104px; border-radius: 50%;
  pointer-events: auto; touch-action: none; border: 0; padding: 0; cursor: pointer; --t: 0; --c: #58c46c;
  background: conic-gradient(var(--c) calc(var(--t) * 1turn), rgba(255, 255, 255, .45) 0); box-shadow: 0 6px 18px rgba(20, 30, 60, .35); }
#fishReel b { position: absolute; inset: 9px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #ffd66b, #f2a33a);
  color: #4a2c0a; font: 800 19px Nunito, sans-serif; }
#fishReel.cast b { background: linear-gradient(180deg, #b9ecb0, #5cc37a); color: #17431f; }
#fishReel.idle b { background: linear-gradient(180deg, #fff7e8, #e9dcc3); color: #7a6a55; }
#fishReel.bite b { background: linear-gradient(180deg, #ffb36b, #ff7a3a); color: #fff; animation: fishPulse .45s ease-in-out infinite; }
#fishReel.strained b { animation: fishShake .12s linear infinite; }
#fishReel.down b { transform: scale(.94); filter: brightness(1.08); }
#fishLeave { position: absolute; right: calc(150px + env(safe-area-inset-right, 0px)); bottom: calc(86px + env(safe-area-inset-bottom, 0px)); pointer-events: auto; border: 0; border-radius: 999px;
  padding: 11px 18px; min-height: 44px; background: rgba(255, 247, 232, .9); color: #4a3320; font: 800 15px Nunito, sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(20, 30, 60, .3); }
.fishCatch { position: fixed; left: 50%; top: 24%; transform: translateX(-50%); z-index: 14; pointer-events: none; padding: 12px 24px; border-radius: 18px; text-align: center;
  background: rgba(255, 247, 232, .96); color: #4a3320; font: 800 22px Nunito, sans-serif; box-shadow: 0 8px 22px rgba(20, 30, 60, .35); animation: fishCatch 2.6s ease forwards;
  white-space: nowrap; zoom: var(--ui-scale, 1); }
.fishCatch small { display: block; font-size: 14px; color: #c0621c; }
@keyframes fishPop { from { transform: translateX(-50%) scale(1.14); } to { transform: translateX(-50%) scale(1); } }
@keyframes fishPulse { 50% { transform: scale(1.1); } }
@keyframes fishShake { 0% { transform: translate(-2px, 1px); } 50% { transform: translate(2px, -1px); } 100% { transform: translate(-1px, 2px); } }
@keyframes fishCatch { 0% { opacity: 0; transform: translate(-50%, 14px) scale(.9); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1.04); } 16% { transform: translate(-50%, 0) scale(1); }
  82% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -10px); } }
@media (max-height: 520px) {
  #fishHint { bottom: calc(14px + env(safe-area-inset-bottom, 0px)); font-size: 15px; }
  #fishKeys { display: none; }
  #fishReel { width: 88px; height: 88px; } #fishReel b { font-size: 16px; }
  .fishCatch { top: 22%; font-size: 18px; padding: 8px 18px; }
}
@media (max-width: 520px) {
  #fishHint { font-size: 15px; bottom: calc(146px + env(safe-area-inset-bottom, 0px)); white-space: normal; border-radius: 18px; }
  .fishCatch { font-size: 19px; }
}`;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster();
const LINE_N = 16;

function addCss() {
  if (document.getElementById('fishCss')) return;
  const s = document.createElement('style');
  s.id = 'fishCss';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export class FishingSession {
  constructor(director, { rand = Math.random } = {}) {
    const d = this.d = director, g = this.g = d.game;
    this.player = g.player;
    this.rand = rand;
    this.done = false;
    this.phase = 'intro';          // intro -> aim -> (sim: cast..hooked) -> caught | escaped -> aim ...
    this.t = 0;
    this.sim = null;
    this.casts = 0; this.caught = 0; this.lost = 0;
    this.msg = null; this.msgT = 0;
    this.frozen = !!g.world.frozen;
    const hour = g.shownHour?.() ?? g.time.hour;
    this.dusk = g.time.hour > 17.6 && g.time.hour < 20.5 || hour > 17.6 && hour < 20.5;
    const aspect = innerWidth / innerHeight;
    const shot = this.shotDef = fishingShot(aspect, this.frozen);
    this.area = this.frozen ? WATERS.ice : shot.tall > 0.5 ? WATERS.tall : WATERS.wide;
    this.pond = new FishPond(g, { area: this.area, dusk: this.dusk, rand, wildlife: d.wildlife });
    // camera: ease up over Mika's shoulder
    this.fovBefore = g.follow.fovBase;
    g.follow.fovBase = shot.fov;
    g.follow.cutscene({ pos: shot.pos, look: shot.look }, 1.1);
    this.shot = g.follow.shot;
    // where the float may land
    const a = this.area;
    this.home = { x: a.cx, z: a.cz };
    this.ok = this.frozen
      ? (x, z) => Math.hypot(x - a.cx, z - a.cz) <= a.hole - 0.55
      : (x, z) => z < 28.3 && x > 6.3 && g.world.heightAt(x, z) < WATER_Y - 0.7 && this.pond.school.inside(x, z, 1.18);
    this.aim = this.plan(d.fishAim || { x: a.cx - a.rx * 0.2, z: a.cz + a.rz * 0.3 });
    this.float = { x: this.aim.x, z: this.aim.z, cx: this.aim.x, cz: this.aim.z };
    // the catch: landed fish lie in a row on the dock; older ones go into the creel (drawn with the school's own batches)
    this.pile = []; this.outgoing = []; this.creelCount = 0; this.pileId = 0;
    this.pond.extra = pond => this.drawPile(pond);
    this.build();
    this.bind();
    this.poseBefore = this.player.pose;
    // reached "Fish" from the water beside the dock: she climbs up to cast
    if (this.player.swimming || this.player.pos.y < 0.45) this.player.teleport(STAND.x, STAND.z, undefined, this.player.facing);
    // the press that started this must not count as a held reel (the phone's action button is hidden under the finger)
    g.input.release('act'); g.input.release('jump');
    this.hud();
  }

  plan(p) { return planCast(p, { origin: this.player.pos, home: this.home, ok: this.ok, min: CAST.min, max: this.frozen ? 9 : CAST.max }); }

  // ------------------------------------------------------------------------------------------------ what it adds
  build() {
    const g = this.g, scene = g.scene, p = this.player;
    this.own = [];
    const keep = o => { scene.add(o); this.own.push(o); return o; };
    // the rod, in Mika's right hand (her lantern on her belt meanwhile)
    // It rides on her hand but is aimed in the world (toward the float, lifted by the fight), so it reads from above.
    const rod = g.assets?.clone?.('fishing-rod');
    if (rod && p.grip) {
      rod.traverse(o => { if (o.isMesh) o.castShadow = false; });
      scene.add(rod);
      rod.rotation.order = 'YXZ';
      this.rod = rod;
      const tip = rod.getObjectByName('Tip');
      this.tipLocal = tip ? tip.position.clone() : V(0, 0.92, 1.78);
      this.rodRest = Math.atan2(this.tipLocal.y, this.tipLocal.z);     // the model already rises this much
      this.rodLift = 0.9;
      p.carry?.want('worn', 'fishing');      // the lantern hangs on her belt while she fishes
    }
    // the float: red over white, with a little mast
    const fl = this.floatObj = keep(new THREE.Group());
    const red = new THREE.MeshBasicMaterial({ color: '#ff4a3a' }), white = new THREE.MeshBasicMaterial({ color: '#fffaf0' });
    fl.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red));
    fl.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.26, 6).translate(0, 0.28, 0), red);
    fl.add(mast);
    fl.traverse(o => { o.name = 'fishing:float'; });
    fl.visible = false;
    // the line: a thin ribbon turned to the camera (a 1 px GL line vanishes on a phone)
    const lg = new THREE.BufferGeometry();
    this.linePos = new Float32Array(LINE_N * 2 * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < LINE_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    lg.setIndex(idx);
    this.line = keep(new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, fog: false })));
    this.line.frustumCulled = false; this.line.visible = false; this.line.name = 'fishing:line';
    // the aim ring on the water
    const ring = this.ring = keep(new THREE.Group());
    const rm = this.ringMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 36).rotateX(-Math.PI / 2), rm);
    const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16).rotateX(-Math.PI / 2), rm);
    r1.renderOrder = r2.renderOrder = 5;
    ring.add(r1, r2);
    ring.traverse(o => { o.name = 'fishing:aim'; });
    ring.visible = false;
    // the creel by her feet: a small wicker basket, with a count once fish are in it
    const creel = this.creel = keep(new THREE.Group());
    const wick = new THREE.MeshBasicMaterial({ color: '#b78748', side: THREE.DoubleSide }), dark = new THREE.MeshBasicMaterial({ color: '#6a4720' }), rim = new THREE.MeshBasicMaterial({ color: '#ddb06a' });
    this.creelMats = [[wick, '#b78748'], [dark, '#6a4720'], [rim, '#ddb06a']];
    const cr = PILE.creel.r;
    creel.add(new THREE.Mesh(new THREE.CylinderGeometry(cr, cr * 0.8, 0.3, 12, 1, true).translate(0, 0.15, 0), wick));
    creel.add(new THREE.Mesh(new THREE.CircleGeometry(cr * 0.95, 12).rotateX(-Math.PI / 2).translate(0, 0.2, 0), dark));
    creel.add(new THREE.Mesh(new THREE.TorusGeometry(cr, 0.026, 6, 14).rotateX(Math.PI / 2).translate(0, 0.3, 0), rim));
    creel.add(new THREE.Mesh(new THREE.TorusGeometry(cr * 0.9, 0.018, 5, 14).rotateX(Math.PI / 2).translate(0, 0.14, 0), dark));
    creel.position.set(PILE.creel.x, PILE.dock.y, PILE.creel.z);
    const cc = this.countCanvas = document.createElement('canvas');
    cc.width = 96; cc.height = 48;
    this.countTex = new THREE.CanvasTexture(cc);
    this.countTex.colorSpace = THREE.SRGBColorSpace;
    const tag = this.countTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.countTex, depthWrite: false, fog: false }));
    tag.position.set(0, 0.62, 0); tag.scale.set(0.62, 0.31, 1); tag.visible = false; tag.renderOrder = 6;
    creel.add(tag);
    creel.traverse(o => { o.name = 'fishing:creel'; o.castShadow = false; });
    for (const o of this.own) o.traverse(m => { m.raycast = () => {}; });

    addCss();
    document.body.classList.add('fishing');
    const pad = this.pad = document.createElement('div');
    pad.id = 'fishPad';
    const ui = this.ui = document.createElement('div');
    ui.id = 'fishUi';
    ui.innerHTML = '<div id="fishHint" class="off" role="status"><span></span><i></i></div><div id="fishKeys"></div>' +
      '<button id="fishLeave" type="button"></button><button id="fishReel" type="button" class="cast"><b></b></button>';
    document.body.append(pad, ui);
    this.el = { hint: ui.querySelector('#fishHint'), text: ui.querySelector('#fishHint span'), bar: ui.querySelector('#fishHint i'),
      keys: ui.querySelector('#fishKeys'), reel: ui.querySelector('#fishReel'), reelText: ui.querySelector('#fishReel b'), leave: ui.querySelector('#fishLeave') };
    this.el.leave.textContent = `✕ ${tx(BTN.leave)}`;
    this.el.keys.textContent = tx(HINTS.keys);
    this.shown = {};
  }

  bind() {
    const off = this.off = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); off.push(() => t.removeEventListener(ev, fn, opt)); };
    this.padHeld = false; this.btnHeld = false; this.tapped = false; this.castAt = null; this.castNow = false; this.leave = false;
    this.hover = null;
    on(this.pad, 'pointerdown', e => {
      e.preventDefault();
      this.touch = e.pointerType !== 'mouse';
      if (this.phase === 'aim') { const p = this.pointAt(e); if (p) this.castAt = p; return; }
      this.padHeld = true; this.tapped = true;
      try { this.pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    on(this.pad, 'pointermove', e => { if (e.pointerType === 'mouse') this.hover = { x: e.clientX, y: e.clientY }; });
    const up = () => { this.padHeld = false; this.btnHeld = false; };
    on(this.pad, 'pointerup', up);
    on(this.pad, 'pointercancel', up);
    on(this.pad, 'contextmenu', e => e.preventDefault());
    on(this.el.reel, 'pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (this.phase === 'aim') { this.castNow = true; return; }
      this.btnHeld = true; this.tapped = true;
      try { this.el.reel.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    on(this.el.reel, 'pointerup', up);
    on(this.el.reel, 'pointercancel', up);
    on(this.el.reel, 'contextmenu', e => e.preventDefault());
    on(this.el.leave, 'click', () => { this.quit(); });
    on(window, 'blur', up);
    on(document, 'visibilitychange', up);
  }

  /** The point on the water under a pointer event (or { x, y } in client pixels). */
  pointAt(e) {
    const r = this.g.renderer.renderer.domElement.getBoundingClientRect();
    _ndc.set(((e.clientX ?? e.x) - r.left) / r.width * 2 - 1, -(((e.clientY ?? e.y) - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.g.camera);
    const o = _ray.ray.origin, dir = _ray.ray.direction;
    if (dir.y > -0.02) return null;
    const k = (WATER_Y - o.y) / dir.y;
    return { x: o.x + dir.x * k, z: o.z + dir.z * k };
  }

  /** Client pixels of a point on the water (QA and tests click there). */
  screenOf(x, z) {
    const r = this.g.renderer.renderer.domElement.getBoundingClientRect();
    _a.set(x, WATER_Y, z).project(this.g.camera);
    return [Math.round(r.left + (_a.x + 1) / 2 * r.width), Math.round(r.top + (1 - _a.y) / 2 * r.height)];
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(dt) {
    if (this.done) return;
    const d = this.d, g = this.g, inp = g.input, p = this.player;
    // the story takes the screen (a dialogue, a scene), or Mika is no longer at the spot: reel in and step back
    if (d.busy > 0 || d.ui.dialogueOpen || d.scenes?.active || Math.hypot(p.pos.x - SPOT.x, p.pos.z - SPOT.z) > 4.5) { this.done = true; return; }
    this.t += dt;
    this.msgT = Math.max(0, this.msgT - dt);
    // (the input module reports pad buttons as presses only, so a held pad button is read here: A or X reels)
    let padBtn = false;
    if (inp.lastDevice === 'gamepad') for (const gp of navigator.getGamepads?.() || []) if (gp && (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed)) padBtn = true;
    const key = inp.held('act') || inp.held('jump') || padBtn;
    const keyPress = inp.pressed('act') || inp.pressed('jump');
    const held = key || keyPress || this.padHeld || this.btnHeld || this.tapped;     // a tap shorter than a frame still counts
    this.tapped = false;
    this.updatePile(dt);
    if (this.phase === 'leaving') {
      // the catch hops into the creel while the camera comes back down behind her
      this.pond.update(dt, null, null, null);
      this.draw(dt);
      if (this.t > this.leaveFor) this.done = true;
      return;
    }

    if (this.phase === 'intro') {
      // she steps to the end of the dock while the camera lifts
      const k = Math.min(1, dt * 7);
      p.pos.x += (STAND.x - p.pos.x) * k; p.pos.z += (STAND.z - p.pos.z) * k;
      if (this.t > 0.7) this.go('aim');
      this.castAt = null; this.castNow = false;
    } else if (this.phase === 'aim') {
      // the mouse steers the ring; so do the move keys and the stick
      const mv = inp.move;
      if (Math.abs(mv.x) + Math.abs(mv.y) > 0.05) {
        g.camera.getWorldDirection(_a); _a.y = 0; _a.normalize();
        const sp = 5.5 * dt;
        this.aim = this.plan({ x: this.aim.x + (-_a.z * mv.x + _a.x * mv.y) * sp, z: this.aim.z + (_a.x * mv.x + _a.z * mv.y) * sp });
        this.hover = null;
      } else if (this.hover) {
        const w = this.pointAt(this.hover);
        if (w) this.aim = this.plan(w);
      }
      if (this.castAt) { this.aim = this.plan(this.castAt); this.cast(); }
      else if (this.castNow || keyPress) this.cast();
      this.castAt = null; this.castNow = false;
    } else if (this.sim && !this.sim.over) {
      this.step(dt, held);
    } else {
      // the catch (or the loss) plays out, then the water is hers again
      if (this.leap) this.updateLeap(dt);
      if (this.t > (this.phase === 'caught' ? 2.1 : 1.5) && !this.leap) { this.sim = null; this.suitor = null; this.go('aim'); }
    }

    // Mika turns to where the float is (or will be)
    const fx = this.phase === 'aim' || this.phase === 'intro' ? this.aim.x : this.float.cx, fz = this.phase === 'aim' || this.phase === 'intro' ? this.aim.z : this.float.cz;
    p.turnTo(Math.atan2(fx - p.pos.x, fz - p.pos.z), dt, 9);
    const sim = this.sim;
    const drive = sim && this.suitor && !sim.over ? { phase: sim.phase, dist: sim.dist, nibble: sim.nibble, progress: sim.progress, surging: sim.surging, origin: p.pos } : null;
    this.pond.update(dt, sim && !sim.over && sim.phase !== 'cast' ? this.float : null, drive, this.leap || null);
    this.draw(dt);
    this.hud();
  }

  go(phase) {
    this.phase = phase; this.t = 0;
    if (phase === 'aim') this.player.pose = null;
  }

  cast() {
    const p = this.player, d = this.d, st = d.q.state;
    const story = st.step === 'c1.fish';
    this.casts++;
    d.fishAim = { x: this.aim.x, z: this.aim.z };
    this.float = { x: this.aim.x, z: this.aim.z, cx: this.aim.x, cz: this.aim.z };
    this.suitor = null; this.leap = null;
    this.sim = new FishingSim({
      rand: this.rand, easy: !!this.g.easy, gentle: !!this.g.easy && story,
      choose: () => {
        // the story's three fish are trout; a starfin only comes at dusk
        const fish = makeFish(FISH, this.rand, { dusk: this.dusk, forced: story ? 'trout' : null, easy: !!this.g.easy });
        const s = this.suitor = this.pond.school.suitorFor(fish.species, this.float);
        s.size = 0.8 + sizeFraction(fish.species, fish.cm) * 0.75;
        fish.dist = s.r;
        return fish;
      },
    });
    this.go('cast');
    this.tipFrom = null;
    p.pose = 'Reel';
    p.gesture('Cast', { lock: true, then: 'Reel' });
    d.audio.whoosh?.(2);
    this.msg = null;
  }

  step(dt, held) {
    const sim = this.sim, d = this.d, a = d.audio, fl = this.float;
    const events = sim.update(dt, held);
    this.phase = sim.phase;
    if (sim.over) this.t = 0;
    this.held = held;
    if (sim.phase === 'hooked' && held) {
      this.reelT = (this.reelT || 0) - dt;
      if (this.reelT <= 0) { this.reelT = 0.09 + Math.random() * 0.06; a.reel?.(); }
    }
    for (const e of events) {
      if (e === 'land') { a.plop?.(0.8); this.pond.ripple(fl.x, fl.z, 0.9, 0.9); d.fx.burst(_a.set(fl.x, 0.1, fl.z), { n: 10, color: [0.85, 0.95, 1], speed: 1.6, size: 0.14, life: 0.5, gravity: 6 }); }
      else if (e === 'nibble') { a.blip?.(1.5); this.pond.ripple(fl.x, fl.z, 0.4, 0.6); }
      else if (e === 'bite') {
        a.splash?.(0.5); this.pond.ripple(fl.x, fl.z, 1.1, 0.8); this.pond.ripple(fl.x, fl.z, 0.6, 0.6);
        d.fx.burst(_a.set(fl.x, 0.1, fl.z), { n: 16, color: [0.9, 0.97, 1], speed: 2.4, size: 0.16, life: 0.6, gravity: 7 });
        try { navigator.vibrate?.(40); } catch { /* ignore */ }
      } else if (e === 'hook') { a.reel?.(); this.player.gesture('Reel', { lock: true, then: 'Reel' }); }
      else if (e === 'surge') { if (this.suitor) this.pond.ripple(this.suitor.x, this.suitor.z, 0.8, 0.7); a.splash?.(0.15); }
      else if (e === 'strain') { a.miss?.(); this.g.follow.shake = 0.2; }
      else if (e === 'early' || e === 'missed' || e === 'lost') {
        this.say(e, 2.2, 'bad'); a.miss?.();
        const sc = this.pond.school;
        for (const f of sc.fish) if ((f === this.suitor || (e === 'early' && f.state === 'swim' && !f.deep && Math.hypot(f.x - fl.x, f.z - fl.z) < 2.6))) sc.flee(f, fl.x, fl.z, 3.2, e === 'early' ? 1.2 : 0.9);
        if (e === 'early') this.pond.ripple(fl.x, fl.z, 0.7, 0.5);
        this.suitor = null;
      } else if (e === 'snap' || e === 'slack') {
        this.lost++;
        this.say(e, 2.4, 'bad'); a.bad?.();
        if (this.suitor) {
          this.pond.school.flee(this.suitor, this.player.pos.x, this.player.pos.z, e === 'snap' ? 4.5 : 3.2, 1.5);
          this.pond.ripple(this.suitor.x, this.suitor.z, 1.2, 0.9);
          if (e === 'snap') d.fx.splash(_a.set(this.suitor.x, 0.05, this.suitor.z));
        }
        this.g.follow.shake = e === 'snap' ? 0.3 : 0;
        this.player.pose = null;
        this.player.gesture('Sad', { lock: true });
      } else if (e === 'caught') this.land();
    }
  }

  /** The fish leaves the water for Mika's hands; the catch is told to the story as it lands. */
  land() {
    const sim = this.sim, f = this.suitor, d = this.d, p = this.player;
    this.caught++;
    const fish = sim.fish;
    this.pending = { species: fish.species, cm: fish.cm };
    d.audio.splash?.(0.8);
    if (f) {
      d.fx.splash(_a.set(f.x, 0.05, f.z));
      this.pond.ripple(f.x, f.z, 1.3, 1);
      f.state = 'held';
      this.leap = { f, t: 0, x0: f.x, z0: f.z, x: f.x, y: -0.2, z: f.z, yaw: f.heading, pitch: 0, roll: 0, slot: pileSlot(this.pile.length), species: fish.species };
    } else this.tell();
    p.pose = null;
  }

  updateLeap(dt) {
    const L = this.leap, p = this.player;
    L.t += dt;
    const k = Math.min(1, L.t / 0.75);
    // out of the water, over the edge of the dock, and down on the planks in its place in the row
    const s = L.slot;
    L.x = L.x0 + (s.x - L.x0) * k; L.z = L.z0 + (s.z - L.z0) * k;
    L.y = -0.2 + (PILE.dock.y + 0.3) * k + Math.sin(k * Math.PI) * 2.1;
    L.yaw += dt * 9; L.pitch = Math.sin(k * Math.PI) * 0.9; L.roll += dt * 5;
    L.k = 1 - (1 - PILE.scale) * k;
    void p;
    if (k >= 1) {
      this.pond.school.take(L.f, 3);
      this.leap = null;
      this.lay(L.species, L.f.size, s);
      this.tell();
    }
  }

  /** A landed fish takes its place in the row; when the row is full the oldest hops into the creel. */
  lay(species, size, at) {
    const item = { id: ++this.pileId, species, size, x: at.x, z: at.z, yaw: at.yaw, t: 0, n: -1 };
    const r = pileAdd(this.pile, item);
    for (const it of this.pile) if (r.creel.includes(it.id)) this.send(it, 0);
    this.pile = r.pile;
  }

  /** Into the creel, after `delay` s. */
  send(it, delay) { it.ot = -delay; it.sx = it.x; it.sz = it.z; this.outgoing.push(it); }

  updatePile(dt) {
    const d = this.d, drops = !this.pond.light;
    for (let i = 0; i < this.pile.length; i++) {
      const it = this.pile[i], s = pileSlot(i), k = Math.min(1, dt * 6);
      it.x += (s.x - it.x) * k; it.z += (s.z - it.z) * k; it.yaw += (s.yaw - it.yaw) * k;
      it.t += dt;
      // each time it comes down on the wood: a slap, a few drops
      const n = it.t < 1.5 ? Math.floor(it.t / 0.5) : 3;
      if (n !== it.n && n < 3) {
        it.n = n;
        d.audio.plop?.(0.45 - n * 0.12);
        if (drops) d.fx.burst(_a.set(it.x, PILE.dock.y + 0.08, it.z), { n: 5 - n, color: [0.85, 0.95, 1], speed: 1.3, size: 0.09, life: 0.4, gravity: 6 });
      } else it.n = n;
    }
    if (!this.outgoing.length) return;
    for (const it of this.outgoing) {
      const before = it.ot;
      it.ot += dt;
      if (before < 0.34 && it.ot >= 0.34) { this.creelCount++; d.audio.blip?.(1.2 + (this.creelCount % 4) * 0.12); this.drawCount(); }
    }
    this.outgoing = this.outgoing.filter(it => it.ot < 0.34);
  }

  /** The catch, drawn with the school's batches (called by the pond just before it sends them to the GPU). */
  drawPile(pond) {
    const Y = PILE.dock.y, t = this.t;
    for (let i = 0; i < this.pile.length; i++) {
      const it = this.pile[i];
      if (it.ot !== undefined) continue;
      let y = Y + 0.05 + 0.055 * it.size, roll = Math.PI / 2, tail = 0;
      if (it.t < 1.5) {
        const a = 1 - it.t / 1.5, ph = it.t / 0.5;
        y += Math.abs(Math.sin(ph * Math.PI)) * 0.2 * a; roll += Math.sin(ph * Math.PI * 2) * 0.5 * a; tail = Math.sin(it.t * 34) * 1.4 * a;
      } else {
        const c = (it.t + i * 0.83) % 4.7;       // now and then it still flops
        if (c < 0.32) { const f = Math.sin(c / 0.32 * Math.PI); y += f * 0.06; roll += f * 0.16; tail = f; }
      }
      pond.put(it.species, it.size, it.x, y, it.z, it.yaw, 0, roll, tail, PILE.scale);
    }
    for (const it of this.outgoing) {
      const k = Math.max(0, it.ot / 0.34), c = PILE.creel;
      if (k <= 0) { pond.put(it.species, it.size, it.x, Y + 0.05 + 0.055 * it.size, it.z, it.yaw, 0, Math.PI / 2, 0, PILE.scale); continue; }
      pond.put(it.species, it.size, it.sx + (c.x - it.sx) * k, Y + 0.12 + k * 0.2 + Math.sin(k * Math.PI) * 0.55, it.sz + (c.z - it.sz) * k, it.yaw + k * 5, k * 1.2, Math.PI / 2, Math.sin(t * 30), PILE.scale * (1 - 0.55 * k));
    }
  }

  drawCount() {
    const c = this.countCanvas, x = c.getContext('2d');
    x.clearRect(0, 0, 96, 48);
    x.fillStyle = 'rgba(255,247,232,0.95)';
    x.beginPath(); x.roundRect(4, 4, 88, 40, 20); x.fill();
    x.fillStyle = '#4a3320'; x.font = '800 28px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`× ${this.creelCount}`, 48, 26);
    this.countTex.needsUpdate = true;
    this.countTag.visible = this.creelCount > 0;
  }

  /**
   * Mika packs up (Backspace, Esc, Leave): the row hops into the creel one after another and the camera eases back
   * behind her; the session is done a moment later. Returns true while it is packing up (the director waits).
   */
  quit() {
    if (this.done) return false;
    if (this.phase === 'leaving') return true;
    const g = this.g, p = this.player, f = g.follow;
    if (this.leap) { this.pond.school.take(this.leap.f, 3); this.lay(this.leap.species, this.leap.f.size, this.leap.slot); this.leap = null; }
    this.tell();
    this.sim = null; this.suitor = null;
    this.pile.forEach((it, i) => this.send(it, i * 0.07));
    this.pile = [];
    this.leaveFor = Math.max(0.75, this.outgoing.length * 0.07 + 0.45);
    this.ui.style.display = 'none';
    this.pond.setClear(0);
    p.pose = null;
    p.gesture('Interact', { lock: true });
    // where the follow camera will stand: behind her, looking the way she looks
    f.yaw = p.facing; f.pitch = 0.34;
    const cy = Math.cos(f.pitch), fwd = _a.set(Math.sin(f.yaw) * cy, -Math.sin(f.pitch), Math.cos(f.yaw) * cy);
    const pivot = _b.copy(p.pos); pivot.y += 1.45;
    const pos = pivot.clone().addScaledVector(fwd, -f.zoomTarget), look = pivot.clone().addScaledVector(fwd, 10);
    f.fovBase = this.fovBefore;
    f.cutscene({ pos, look }, this.leaveFor);
    this.shot = f.shot;
    this.eased = true;
    this.go('leaving');
    return true;
  }

  /** director.event({ type: 'catch' }) + the name and size on screen. Called once per catch, even when leaving mid-leap. */
  tell() {
    const c = this.pending;
    if (!c) return;
    this.pending = null;
    const d = this.d, st = d.q.state;
    const best = (st.fishBest ??= {});
    const had = best[c.species] || 0, record = c.cm > had;
    if (record) best[c.species] = c.cm;
    const note = sizeFraction(c.species, c.cm) >= BIG ? tx(CATCH.big) : record && had ? tx(CATCH.record) : '';
    const el = document.createElement('div');
    el.className = 'fishCatch';
    el.textContent = tx(CATCH.line, { fish: tx(FISH[c.species]?.name || c.species), cm: c.cm });
    if (note) { const s = document.createElement('small'); s.textContent = note; el.appendChild(s); }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2700);
    this.lastCatch = { ...c, record, note };
    if (!this.done) this.player.gesture('Cheer', { lock: true });
    d.event({ type: 'catch', species: c.species });
  }

  say(key, sec = 2, tone = '') { this.msg = { key, tone }; this.msgT = sec; }

  // ------------------------------------------------------------------------------------------------ drawing
  draw(dt) {
    const g = this.g, sim = this.sim, fl = this.float, t = this.t, obj = this.floatObj;
    const night = g.night || 0;
    // aim ring
    const aiming = this.phase === 'aim' || this.phase === 'intro';
    this.ring.visible = aiming;
    if (aiming) {
      const s = 1 + Math.sin(performance.now() / 180) * 0.08;
      this.ring.position.set(this.aim.x, WATER_Y + 0.04, this.aim.z);
      this.ring.scale.set(s, 1, s);
      this.ringMat.opacity = this.phase === 'intro' ? Math.min(0.95, this.t * 1.5) : 0.95;
    }
    // the rod: in her hand, pointing where she fishes; swung over the shoulder for the cast, bent down by a bite, held
    // high and shaking in the fight
    const tip = _b, p = this.player, ph0 = sim?.phase;
    if (this.rod) {
      let lift = 0.95;
      if (ph0 === 'cast') { const k = Math.min(1, sim.t / CAST.flight); lift = 2.1 - 1.55 * k * k * (3 - 2 * k); }
      else if (ph0 === 'wait' || ph0 === 'approach' || ph0 === 'nibble') lift = 0.6;
      else if (ph0 === 'bite') lift = 0.4;
      else if (ph0 === 'hooked') lift = 0.85 + sim.tension * 0.35 + Math.sin(t * 40) * sim.tension * 0.03;
      else if (ph0 === 'caught') lift = 1.3;
      this.rodLift += (lift - this.rodLift) * Math.min(1, dt * (ph0 === 'cast' ? 30 : 9));
      p.grip.updateWorldMatrix(true, false);
      p.grip.getWorldPosition(this.rod.position);
      const tx_ = aiming ? this.aim.x : fl.cx, tz_ = aiming ? this.aim.z : fl.cz;
      this.rod.rotation.set(-(this.rodLift - this.rodRest), Math.atan2(tx_ - this.rod.position.x, tz_ - this.rod.position.z), 0);
      this.rod.updateMatrixWorld(true);
      tip.copy(this.tipLocal).applyMatrix4(this.rod.matrixWorld);
    } else tip.copy(p.pos).add(_c.set(Math.sin(p.facing) * 0.9, 2, Math.cos(p.facing) * 0.9));
    // float
    if (this.creelMats) for (const [m, c] of this.creelMats) m.color.set(c).multiplyScalar(1 - night * 0.45);
    const out = !!sim && (!sim.over || !!this.leap || (this.phase === 'escaped' && this.t < 0.25));
    obj.visible = out;
    this.line.visible = out;
    if (!out) return;
    let x = fl.cx, z = fl.cz, y = WATER_Y - 0.02, tilt = 0, tension = 0, hooked = false;
    const ph = sim.phase;
    if (ph === 'cast') {
      const k = Math.min(1, sim.t / CAST.flight);
      this.tipFrom ??= tip.clone();
      x = this.tipFrom.x + (fl.cx - this.tipFrom.x) * k; z = this.tipFrom.z + (fl.cz - this.tipFrom.z) * k;
      y = this.tipFrom.y * (1 - k) + (WATER_Y - 0.02) * k + Math.sin(k * Math.PI) * CAST.arc;
    } else if (ph === 'wait' || ph === 'approach') { y += Math.sin(t * 2.2) * 0.02; tilt = Math.sin(t * 3) * 0.1; }
    else if (ph === 'nibble') { y += Math.sin(t * 2.2) * 0.015 - Math.sin((1 - sim.nibble) * Math.PI) * (sim.nibble > 0 ? 0.11 : 0); tilt = sim.nibble * 0.35; }
    else if (ph === 'bite') { y -= 0.2 + Math.sin(t * 25) * 0.02; tilt = 0.5; x += Math.sin(t * 31) * 0.02; }
    else if ((ph === 'hooked' || this.leap || ph === 'caught' || ph === 'escaped') && this.suitor) {
      hooked = true;
      if (this.leap) { x = this.leap.x; y = this.leap.y; z = this.leap.z; }
      else { x = this.suitor.x; z = this.suitor.z; y -= 0.1 - this.suitor.lift * 0.5; }
      tension = sim.tension; tilt = 0.6;
    }
    fl.x = ph === 'hooked' ? fl.cx : x; fl.z = ph === 'hooked' ? fl.cz : z;
    obj.position.set(x, y, z);
    obj.rotation.set(tilt, 0, tilt * 0.4);
    obj.visible = !this.leap;
    const dim = 1 - night * 0.3;
    obj.children[0].material.color.setRGB(1 * dim, 0.29 * dim, 0.23 * dim, THREE.SRGBColorSpace);
    obj.children[1].material.color.setRGB(1 * dim, 0.98 * dim, 0.94 * dim, THREE.SRGBColorSpace);
    // line: rod tip -> float, sagging when idle, taut, red and trembling as the tension climbs
    const P = this.linePos, cam = g.camera.position, end = _c.set(x, y + (this.leap ? 0 : 0.4), z);
    const sag = hooked ? 0.06 : ph === 'cast' ? 0.1 : 0.55, w = 0.016 + _a.copy(tip).distanceTo(cam) * 0.0011;
    const dirx = end.x - tip.x, diry = end.y - tip.y, dirz = end.z - tip.z;
    for (let i = 0; i < LINE_N; i++) {
      const s = i / (LINE_N - 1);
      const px = tip.x + dirx * s, pz = tip.z + dirz * s;
      const py = tip.y + diry * s - Math.sin(s * Math.PI) * sag + Math.sin(t * 60 + i * 2) * tension * 0.05 * Math.sin(s * Math.PI);
      // side = tangent x toCamera
      _a.set(dirx, diry - Math.cos(s * Math.PI) * Math.PI * sag, dirz);
      _d.set(cam.x - px, cam.y - py, cam.z - pz);
      _a.cross(_d).normalize().multiplyScalar(w);
      P[i * 6] = px + _a.x; P[i * 6 + 1] = py + _a.y; P[i * 6 + 2] = pz + _a.z;
      P[i * 6 + 3] = px - _a.x; P[i * 6 + 4] = py - _a.y; P[i * 6 + 5] = pz - _a.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.material.color.setRGB(1 * (1 - night * 0.25), (1 - tension * 0.75) * (1 - night * 0.25), (1 - tension * 0.9) * (1 - night * 0.25));
    void dt;
  }

  hintKey() {
    const sim = this.sim;
    if (this.msgT > 0 && this.msg && (this.phase === 'wait' || this.phase === 'escaped' || this.phase === 'aim')) return this.msg;
    switch (this.phase) {
      case 'intro': case 'aim': return { key: this.touch ?? this.d.ui.touch ? 'aimTouch' : 'aimMouse' };
      case 'wait': return { key: 'wait' };
      case 'approach': return { key: 'approach' };
      case 'nibble': return { key: 'nibble' };
      case 'bite': return { key: 'bite', tone: 'hot' };
      case 'hooked': return sim.tension >= 0.75 ? { key: 'strain', tone: 'bad' } : sim.surging ? { key: 'surge', tone: 'hot' } : { key: 'reel' };
      case 'escaped': return this.msg || { key: 'snap', tone: 'bad' };
      default: return { key: null };
    }
  }

  /** The hint text now (English key), for QA. */
  get title() { const k = this.hintKey().key; return k ? HINTS[k] : ''; }

  hud() {
    const el = this.el, s = this.shown, sim = this.sim;
    const h = this.hintKey();
    if (s.key !== h.key || s.tone !== h.tone) {
      s.key = h.key; s.tone = h.tone;
      el.hint.className = `${h.key ? '' : 'off'} ${h.tone || ''}`;
      if (h.key) el.text.textContent = tx(HINTS[h.key]);
    }
    const hooked = this.phase === 'hooked';
    const prog = hooked ? Math.round(sim.progress * 100) : 0;
    if (s.prog !== prog) { s.prog = prog; el.bar.style.width = `${prog}%`; }
    const mode = this.phase === 'aim' || this.phase === 'intro' ? 'cast' : this.phase === 'bite' ? 'bite' : hooked ? 'reel' : 'idle';
    const cls = `${mode}${hooked && sim.tension >= 0.75 ? ' strained' : ''}${this.held && (hooked || mode === 'bite') ? ' down' : ''}`;
    if (s.cls !== cls) {
      s.cls = cls; el.reel.className = cls;
      el.reelText.textContent = tx(mode === 'cast' ? BTN.cast : mode === 'bite' ? BTN.hook : BTN.reel);
    }
    const ten = hooked ? Math.round(sim.tension * 50) / 50 : 0;
    if (s.ten !== ten) {
      s.ten = ten;
      el.reel.style.setProperty('--t', ten);
      el.reel.style.setProperty('--c', ten < 0.5 ? '#58c46c' : ten < 0.75 ? '#f0c23a' : '#ef4b3a');
    }
  }

  /** State for the QA hook and the autopilot (read-only). */
  view() {
    const sim = this.sim, r = v => Math.round(v * 100) / 100;
    return {
      phase: this.phase, title: this.title, bite: sim ? r(sim.biteLeft) : 0,
      tension: sim ? r(sim.tension) : 0, progress: sim ? r(sim.progress) : 0, surging: !!sim?.surging, species: sim?.fish?.species || null, cm: sim?.fish?.cm || null,
      casts: this.casts, caught: this.caught, lost: this.lost, last: this.lastCatch || null,
      pile: this.pile.map(it => [it.species, r(it.x), r(it.z), r(it.size)]), creel: this.creelCount, creelScreen: this.screenOf(PILE.creel.x, PILE.creel.z),
      aim: [r(this.aim.x), r(this.aim.z)], aimScreen: this.screenOf(this.aim.x, this.aim.z), float: [r(this.float.x), r(this.float.z)],
      fish: this.pond.school.fish.filter(f => f.state !== 'gone').map(f => [f.species, r(f.x), r(f.z), f.state, f.deep ? 1 : 0]),
      frozen: this.frozen, dusk: this.dusk,
    };
  }

  // ------------------------------------------------------------------------------------------------ giving it all back
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.done = true;
    this.tell();                                   // a fish already won is never lost by leaving
    const g = this.g, p = this.player;
    for (const f of this.off) f();
    this.off = [];
    this.pad.remove(); this.ui.remove();
    g.input.release('act'); g.input.release('jump');
    document.body.classList.remove('fishing');
    for (const o of this.own) {
      g.scene.remove(o);
      o.traverse(m => { m.geometry?.dispose(); [m.material].flat().forEach(x => { x?.map?.dispose?.(); x?.dispose?.(); }); });
    }
    this.own = [];
    if (this.rod) { g.scene.remove(this.rod); this.rod = null; p.carry?.release('fishing'); }
    this.pond.dispose();
    p.pose = this.poseBefore ?? null;
    g.follow.fovBase = this.fovBefore;
    this.pond.extra = null;
    if (g.follow.shot === this.shot) { g.follow.clearCutscene(!this.eased); g.follow.first = true; }
  }
}
