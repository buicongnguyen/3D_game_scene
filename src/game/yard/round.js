// The Kawabe playground yard at runtime (content/yard.js, world/yard.js, ./index.js). Three jobs:
//   - the kids' own play: Town Life hands over the kids whose day plan says `play: 'footnet' | 'keepup'` (townlife.js
//     updateGames -> ambient); they rally by themselves, the same pure simulation Mika plays, with nobody human in it.
//     It sleeps while every kid is beyond the draw distance.
//   - Mika joins: "Join the game" on the court or at the box of shuttlecocks starts a scored round of the game on the
//     scoreboard (the kids there take sides; with nobody about, the Kawabe kids are called over; at night she plays
//     the kick-board). A fixed court camera, a small HUD, the landing ring, kids' speech bubbles, a results card.
//   - "Change the game" at the scoreboard post picks the other game (./index.js YARD_GAMES).
// The round runner is modelled on game/tricks.js (HUD pill, hint, results card with stars, Play again / Done,
// Backspace quits, the record kept in quest.state.yard); the yard is not one of Grandma's tricks, so it has its own.
import * as THREE from 'three';
import { YARD, toWorld, toCourt, KID_STYLE, YARD_NAMES, recordYard, cleanYard } from '../../content/yard.js';
import { YARD_GAME, nextGame, levelFor, ambientRoles } from './index.js';
import { COURT } from './rules.js';
import { shuttleGeometry } from '../../world/yard.js';
import { BARK_RANGE } from '../barks.js';
import { tx, N_, getLang } from '../../i18n/i18n.js';

const HEAR = 30;              // the yard's sounds carry this far
const INVITE_R = 11;          // a kid calls Mika over when she comes this close to a game
const SHUTTLE_SCALE = 2.0;    // a touch bigger than life, so it reads from the court camera
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), QT = new THREE.Quaternion();
const W1 = { x: 0, z: 0 }, W2 = { x: 0, z: 0 }, C1 = { u: 0, v: 0 }, INP = { mx: 0, mv: 0, kick: false, pos: C1 };   // per-frame scratch

// what the kids call out
const SAY = {
  invite: [N_('Mika! Come and play!'), N_('We need one more! Mika!')],
  join: [N_("Mika's playing! Mika's playing!"), N_('City girl on the court!')],
  nice: [N_('Whoa, nice one!'), N_('Did you see that?'), N_('Good kick, Mika!')],
  ours: [N_('Yes! Our point!'), N_('That one was ours!')],
  aww: [N_('Aww!'), N_('Hey! No fair!')],
  theirs: [N_('Got you!'), N_('Too slow!'), N_('Point for us!')],
  net: [N_('The net moved!'), N_('Oops. Into the net.')],
  out: [N_('That was in! …It was out.'), N_('Out! Way out!')],
  strong: [N_("That's my power kick!"), N_('Captain scores!')],
  tricky: [N_("Didn't see that coming, did you?"), N_('Over there! No, there!')],
  wobbly: [N_('Oops. That was the wind.'), N_('I meant to do that!')],
  drop: [N_('Dropped it!'), N_('Again! From one!')],
  count: [N_('Ten! Keep going!'), N_('Twenty! Nobody breathe!'), N_("Thirty! That's a record!")],
  win: [N_('You beat us! Again tomorrow?'), N_('Mika wins! She kicks like a Kawabe kid!')],
  lose: [N_('We win! Rematch any time, city girl.'), N_('Kawabe wins! You were close, though.')],
  watch: [N_('Go on! Go on!'), N_("I'm next!"), N_('Point!')],
  own: [N_('Mine!'), N_('Over the net!'), N_('Got it!'), N_('Point!'), N_('Keep it up!')],
  footnet: [N_("Foot-tennis! I'll take this side!")],
  keepup: [N_('Keep it up! Everybody in a ring!')],
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const CSS = `
#yardHud{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:10px;align-items:center;white-space:nowrap;
 padding:7px 16px;border-radius:999px;background:rgba(255,247,232,.94);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 16px Nunito,system-ui,sans-serif;color:#5a3a22;zoom:var(--ui-scale,1)}
#yardHud .big{font:600 22px Fredoka,Nunito,sans-serif;color:#c2541c;min-width:56px;text-align:center}
#yardHud .sub{font:700 13px Nunito,sans-serif;color:#8a6a4a}
#yardHud .l,#yardHud .r{max-width:28vw;overflow:hidden;text-overflow:ellipsis}
#yardHud.hidden,#yardHint.hidden,#yardCard.hidden,#yardStop.hidden{display:none}
#yardHint{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;max-width:min(520px,90vw);
 padding:8px 15px;border-radius:16px;background:rgba(255,253,246,.94);box-shadow:0 6px 18px rgba(40,20,0,.22);font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;
 text-align:center;zoom:var(--ui-scale,1);pointer-events:none}
#yardHint.good{background:rgba(220,255,214,.96);color:#1f6a34}
#yardHint.bad{background:rgba(255,232,214,.96);color:#a2441c}
#yardStop{position:fixed;left:14px;top:calc(64px + env(safe-area-inset-top,0px));z-index:17;padding:8px 14px;border:0;border-radius:999px;cursor:pointer;
 background:rgba(255,253,246,.92);color:#4a3020;font:700 14px Nunito,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);zoom:var(--ui-scale,1)}
#yardStop kbd{font:700 11px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
body.touch #yardStop kbd{display:none}
@media (max-width:560px){#yardHud{font-size:14px;padding:6px 12px;gap:7px}#yardHud .big{font-size:19px;min-width:44px}#yardHud .sub{display:none}
 #yardHint{top:calc(112px + env(safe-area-inset-top,0px));font-size:14px;max-width:78vw}#yardStop{top:auto;bottom:calc(196px + env(safe-area-inset-bottom,0px));left:12px}}
#yardCard{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35)}
#yardCard .box{width:min(400px,90vw);padding:20px 22px 16px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1)}
#yardCard h2{margin:2px 0;font:600 24px Fredoka,Nunito,sans-serif;color:#7a3e16}
#yardCard .verdict{font:600 18px Fredoka,Nunito,sans-serif;color:#2f8a4a}
#yardCard .stars{font-size:38px;letter-spacing:4px;color:#f2a51a;text-shadow:0 2px 0 #b8640a33}
#yardCard .stars i{font-style:normal;display:inline-block;animation:yardStar .5s both}
#yardCard .score{font:600 26px Fredoka,Nunito,sans-serif;margin:2px 0}
#yardCard .best{color:#7a6a58;min-height:1.2em}
#yardCard .btns{display:flex;gap:10px;justify-content:center;margin-top:14px}
#yardCard button{flex:1;padding:11px 10px;border:0;border-radius:14px;font:700 16px Nunito,sans-serif;cursor:pointer;background:#f4dfb5;color:#5a3a22}
#yardCard button.main{background:#f08a3c;color:#fff}
#yardCard kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@keyframes yardStar{from{transform:scale(0) rotate(-40deg);opacity:0}to{transform:none;opacity:1}}
`;

export class Yard {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.round = null;            // the round Mika is playing { id, sim, … }
    this.locks = false;           // true while the round holds Mika still (read by director.update)
    this.loops = new Set();       // per-frame steps of the running round
    this.here = [];               // kids Town Life handed over this frame (their plan says: play at the yard)
    this.hereGame = null;
    this.amb = null;              // the kids' own game { sig, game, sim, roles, … }
    this.override = null;         // the game Mika chose at the post while kids are playing
    this.held = [];               // kids taken out of their day plan for Mika's round
    this.seated = new Map();      // kid -> bench seat index
    this.kickT = 9;               // Mika's leg swing clock
    this.inviteCool = 0;
    this.debug = { auto: null, seed: null, at: 0.12 };   // QA: auto = 'win' | 'lose' plays Mika's part (window.__STARLINE_QA__.director.yard)
    this.y0 = this.g.world.heightAt(YARD.x, YARD.z);
    this.build();
    this.buildUi();
    this.register();
    this.showBoard();
  }

  // ------------------------------------------------------------------ state helpers
  get st() { return this.d.q?.state; }
  get save() { const st = this.st; if (!st) return { game: 'footnet' }; if (!st.yard?.game) st.yard = cleanYard(st.yard); return st.yard; }
  /** The yard is part of the valley from chapter one on, and in Explore. */
  ready() { return !!this.st && this.st.chapter >= 1; }
  /** Kids are on the court playing by themselves, close enough to be drawn. */
  kidsPlaying() { return !!this.amb && this.amb.awake; }
  /** The game on the scoreboard: the one the kids are at, or the one Mika chose. */
  current() { return this.amb ? (YARD_GAME[this.override] ? this.override : this.amb.want) : this.save.game; }
  near(r = HEAR) { const p = this.g.player.pos; return Math.hypot(p.x - YARD.x, p.z - YARD.z) < r; }

  // ------------------------------------------------------------------ the few things the games draw
  build() {
    const scene = this.g.scene;
    const geo = shuttleGeometry();
    const mat = new THREE.MeshStandardMaterial({ name: 'Yard shuttle', vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, emissive: '#fff4dc', emissiveIntensity: 0 });
    const sh = this.shuttle = new THREE.Mesh(geo, mat);
    sh.name = 'yard:shuttle';
    sh.scale.setScalar(SHUTTLE_SCALE);
    sh.castShadow = this.g.world.quality?.propShadows !== false;
    sh.visible = false;
    // the shadow under it and the landing ring (inner ring = where; outer ring closes in on it = when)
    const flat = (g, color, opacity) => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      return m;
    };
    this.blob = flat(new THREE.CircleGeometry(0.2, 14), '#1a2a14', 0.35);
    this.ring = flat(new THREE.RingGeometry(0.44, 0.56, 28), '#ffd34a', 0.95);
    this.ringOut = flat(new THREE.RingGeometry(0.6, 0.635, 32), '#ffffff', 0.7);
    this.blob.name = 'yard:blob'; this.ring.name = 'yard:ring'; this.ringOut.name = 'yard:ringOut';
    scene.add(sh, this.blob, this.ring, this.ringOut);
    this.prev = new THREE.Vector3();
    this.tmpCam = new THREE.PerspectiveCamera();
  }

  buildUi() {
    if (typeof document === 'undefined') { this.el = null; return; }
    if (!document.getElementById('yardCss')) {
      const s = document.createElement('style');
      s.id = 'yardCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const mk = (tag, id, html) => { const e = document.createElement(tag); e.id = id; e.className = 'hidden'; e.innerHTML = html; document.body.appendChild(e); return e; };
    this.el = {
      hud: mk('div', 'yardHud', '<span class="l"></span><span class="big"></span><span class="r"></span><span class="sub"></span>'),
      hint: mk('div', 'yardHint', ''),
      stop: mk('button', 'yardStop', ''),
      card: mk('div', 'yardCard', '<div class="box"></div>'),
    };
    const h = this.el.hud;
    h._l = h.querySelector('.l'); h._big = h.querySelector('.big'); h._r = h.querySelector('.r'); h._sub = h.querySelector('.sub');
    this.el.stop.addEventListener('click', () => this.quit());
  }

  register() {
    const d = this.d, p = this.g.player, Y = YARD;
    const rack = new THREE.Vector3(Y.rack.x + 0.6, this.y0 + 1, Y.rack.z);
    const post = new THREE.Vector3(Y.board.x, this.y0 + 1, Y.board.z);
    const text = { key: '', join: '', board: '' };
    const refresh = () => {
      const id = this.current(), playing = this.kidsPlaying(), key = `${getLang()}|${id}|${playing}`;
      if (key === text.key) return;
      text.key = key;
      const name = tx(YARD_NAMES[id]);
      text.join = playing ? tx('Join the game: {name}', { name }) : tx('Play: {name}', { name });
      text.board = tx('Change the game (now: {name})', { name });
    };
    const free = () => this.ready() && !this.round && !d.busy && !d.scenes.active && !this.g.interiors?.active && !this.g.kite?.active;
    // on the court itself the prompt follows Mika; off it, it waits at the box of shuttlecocks
    const onCourt = () => Math.abs(p.pos.x - Y.x) < Y.w / 2 + 0.4 && Math.abs(p.pos.z - Y.z) < Y.l / 2 + 0.4 && Math.abs(p.pos.z - Y.z) > 0.5;
    d.interact('yard:join', null, () => { refresh(); return text.join; }, free, () => this.play(), 2.6,
      () => (onCourt() ? V.copy(p.pos).setY(p.pos.y + 1) : rack), 0.3);
    d.interact('yard:board', post, () => { refresh(); return text.board; }, free, () => this.changeGame(), 2.1, null, 0.6);
  }

  // ------------------------------------------------------------------ the scoreboard
  showBoard(sim = null, id = this.current()) {
    const b = this.g.structures?.yard;
    if (!b) return;
    const name = tx(YARD_NAMES[id]);
    if (!sim) b.setBoard(name, id === 'keepup' ? '0' : '0 : 0', '');
    else if (id === 'keepup') b.setBoard(name, String(sim.count), tx('Best: {n}', { n: sim.best }));
    else b.setBoard(name, `${sim.score[0]} : ${sim.score[1]}`, sim.wall ? tx('Three in a row: a point') : tx('First to {n}', { n: sim.target }));
  }

  changeGame() {
    const id = nextGame(this.current());
    this.save.game = id;
    if (this.amb) { this.override = id; this.shoutAny(this.amb.kids, pick(SAY[id])); }
    this.d.ui.toast(tx('Next game: {name}', { name: tx(YARD_NAMES[id]) }));
    this.d.audio.click();
    if (!this.amb) this.showBoard(null, id);
    this.d.save?.();
  }

  // ------------------------------------------------------------------ bodies
  /** A speech bubble over a kid (Town Life person `it`). */
  shout(it, text, life = 2.4) {
    if (!it || !it.n.visible || it.n.far) return;
    const n = it.n;
    this.d.barks.ui.show(`yard:${it.p.id}`, text, out => { n.head(out); out.y += 0.3 - (n.sitting ? 0.35 : 0); return out; }, { name: tx(it.p.name || ''), life });
    if (this.near()) this.d.audio?.blip?.(1.4);
  }
  shoutAny(kids, text) { const k = kids?.length ? pick(kids) : null; if (k) this.shout(k, text); }

  /** Put a sim player's body where the sim has it: a kid runs or stands, turning to the shuttle. */
  drive(it, pl, sim, dt) {
    const n = it.n, w = toWorld(pl.u, pl.v, W1);
    const dx = w.x - n.pos.x, dz = w.z - n.pos.z, moved = Math.hypot(dx, dz);
    n.path = null;
    n.sitting = false;
    n.pos.x = w.x; n.pos.z = w.z; n.pos.y = this.y0;
    if (pl.moving && moved > 1e-4) n.targetFacing = Math.atan2(dx, dz);
    else if (sim.shuttle.on) { const s = toWorld(sim.shuttle.u, sim.shuttle.v, W2); if (Math.hypot(s.x - w.x, s.z - w.z) > 0.6) n.targetFacing = Math.atan2(s.x - w.x, s.z - w.z); }
    const a = n.anim;
    if (!a || a.busy) return;
    if (pl.moving && a.has('Run')) a.play('Run', { speed: Math.min(1.2, Math.max(0.55, moved / Math.max(dt, 1e-3) / 4.2)) });
    else a.play('Idle');
  }

  /** Sit a kid on a bench to watch. */
  seat(it) {
    if (this.seated.has(it)) return;
    const used = new Set(this.seated.values());
    let i = 0;
    while (used.has(i) && i < 4) i++;
    this.seated.set(it, i);
    const b = YARD.benches[Math.floor(i / 2) % YARD.benches.length], off = i % 2 ? -0.42 : 0.42, n = it.n;
    const x = b.x + 0.02, z = b.z + off;
    const sit = () => {
      if (this.seated.get(it) !== i) return;
      n.place(x, z, b.face);
      n.sitting = true;
      const clip = n.anim?.has?.('Sit') ? 'Sit' : 'Idle';
      n.setIdle(clip);
      if (n.anim && !n.anim.busy) n.anim.play(clip);
    };
    if (Math.hypot(n.pos.x - x, n.pos.z - z) > 1.2 && !this.round) n.walk([[x + 0.5, z]], sit, 2.4); else sit();
  }

  unseat(it) {
    if (!this.seated.delete(it)) return;
    const n = it.n;
    if (n.sitting) { n.sitting = false; n.place(n.pos.x + 0.7, n.pos.z, n.facing); }
    n.setIdle('Idle');
    if (n.anim && !n.anim.busy) n.anim.play('Idle');
  }

  cheer(it) {
    const a = it.n.anim;
    if (!a || !a.has('Cheer') || it.n.far) return;
    a.once('Cheer', { then: it.n.sitting ? it.n.idleClip : 'Idle' });
  }

  // ------------------------------------------------------------------ the kids' own play
  /** Town Life: these kids' plans say "play at the yard" right now (called every frame for each such game). */
  ambient(gm, kids) {
    for (const k of kids) if (!this.here.includes(k)) this.here.push(k);
    this.hereGame ??= gm.game;
  }

  endAmbient() {
    const A = this.amb;
    if (!A) return;
    for (const it of [...this.seated.keys()]) this.unseat(it);
    for (const it of A.kids) { if (it.n.anim && !it.n.anim.busy) it.n.anim.play('Idle'); }
    this.amb = null;
    this.override = null;
    this.hideShuttle();
    this.showBoard();
  }

  startAmbient(kids, game, prev) {
    const ids = kids.map(k => k.p.id);
    const R = ambientRoles(game, ids, prev?.rounds || 0, prev?.loser || null);
    const G = YARD_GAME[R.game];
    const by = id => kids.find(k => k.p.id === id);
    for (const it of [...this.seated.keys()]) if (!R.watch.includes(it.p.id)) this.unseat(it);
    for (const id of R.watch) this.seat(by(id));
    const players = R.play.map((id, i) => {
      const it = by(id), c = toCourt(it.n.pos.x, it.n.pos.z);
      return { id, team: R.game === 'footnet' ? (R.play.length === 2 ? i : i % 2) : 0, style: KID_STYLE[id] || 'steady', u: c.u, v: c.v };
    });
    const seed = (prev?.seed || Math.floor(Math.random() * 1e9)) + 1;
    const sim = G.create({ seed, players, level: 'normal', target: 3 });
    this.amb = { want: game, game: R.game, kids, roles: R, sim, bodies: sim.players.map(pl => by(pl.id) || null), rounds: prev?.rounds || 0, loser: null, seed, rest: 3, awake: true };
    this.showBoard(sim, R.game);
  }

  stepAmbient(dt) {
    const kids = this.here, want = this.override && YARD_GAME[this.override] ? this.override : this.hereGame;
    if (!kids.length || !want) { this.endAmbient(); return; }
    // (the same kids at the same game as last frame: nothing to work out)
    let same = !!this.amb && this.amb.want === want && this.amb.kids.length === kids.length;
    for (let i = 0; same && i < kids.length; i++) same = this.amb.kids.includes(kids[i]);
    if (!same) this.startAmbient(kids.slice(), want, this.amb);
    const A = this.amb, sim = A.sim;
    // nobody near enough to be drawn: the game sleeps where it stands
    A.awake = A.kids.some(k => !k.n.far);
    if (!A.awake) { this.hideShuttle(); return; }
    if (sim.over) {
      A.rest -= dt;
      for (let i = 0; i < A.bodies.length; i++) if (A.bodies[i]) { sim.players[i].moving = false; this.drive(A.bodies[i], sim.players[i], sim, dt); }
      if (A.rest <= 0) {
        // the loser sits the next one out (with three kids)
        A.rounds++;
        A.loser = A.game === 'footnet' ? sim.players.find(q => q.team === (sim.over.won ? 1 : 0))?.id || null : null;
        this.startAmbient(A.kids, A.want, A);
      }
      return;
    }
    sim.step(Math.min(dt, 0.05));
    for (let i = 0; i < A.bodies.length; i++) if (A.bodies[i]) this.drive(A.bodies[i], sim.players[i], sim, dt);
    this.present(sim, dt, false);
    this.events(sim, A.kids, A.game, false);
    // a kid calls Mika over when she walks up
    this.inviteCool -= dt;
    if (this.inviteCool <= 0 && this.ready() && this.near(INVITE_R) && !this.d.busy && !this.d.ui.dialogueOpen) {
      this.inviteCool = 45;
      this.shoutAny(A.kids, pick(SAY.invite), 3);
    }
  }

  // ------------------------------------------------------------------ showing a sim (the kids' game and Mika's)
  hideShuttle() { this.shuttle.visible = false; this.blob.visible = false; this.ring.visible = false; this.ringOut.visible = false; this.prevOn = false; }

  present(sim, dt, withRing) {
    const S = sim.shuttle, sh = this.shuttle;
    sh.visible = S.on;
    this.blob.visible = S.on && S.y > 0.25;
    if (S.on) {
      const w = toWorld(S.u, S.v, W1);
      V.set(w.x, this.y0 + Math.max(0.1, S.y), w.z);
      // the cork leads: turn it along the way it is flying
      if (this.prevOn && sim.flight) {
        V2.subVectors(V, this.prev);
        if (V2.lengthSq() > 1e-6) { QT.setFromUnitVectors(DOWN, V2.normalize()); sh.quaternion.slerp(QT, Math.min(1, dt * 14)); }
      } else sh.quaternion.identity();
      sh.position.copy(V);
      this.prev.copy(V); this.prevOn = true;
      this.blob.position.set(w.x, this.y0 + 0.035, w.z);
      this.blob.scale.setScalar(1 + Math.min(2, S.y * 0.25));
    } else this.prevOn = false;
    const M = sim.marker, on = withRing && M.on && sim.state === 'rally';
    this.ring.visible = on;
    this.ringOut.visible = on && M.mine && !M.out;
    if (on) {
      const w = toWorld(M.u, M.v, W1), L = sim.L, mat = this.ring.material;
      this.ring.position.set(w.x, this.y0 + 0.045, w.z);
      this.ringOut.position.set(w.x, this.y0 + 0.05, w.z);
      const mid = (L.p0 + L.p1) / 2;
      this.ringOut.scale.setScalar(1 + Math.min(1.25, Math.max(0, M.tau - mid)) * 1.7);
      const state = M.out ? 3 : !M.mine ? 2 : M.tau <= L.p1 ? 1 : 0;
      if (state !== this.ringState) {
        this.ringState = state;
        mat.color.set(['#ffd34a', '#59e06a', '#9fd0ff', '#ff8a7a'][state]);
        mat.opacity = state >= 2 ? 0.55 : 0.95;
        this.ring.scale.setScalar(state === 2 ? 0.7 : 1);
      }
    }
  }

  /** The sim's events: sounds, kicks, cheers, bubbles. kids: the Town Life people in it. */
  events(sim, kids, id, mine) {
    if (!sim.events.length) return;
    const d = this.d, a = d.audio, hear = this.near(), by = who => kids.find(k => k.p.id === who);
    const talk = this.near(BARK_RANGE);
    for (const e of sim.events) {
      const it = e.who ? by(e.who) : null;
      switch (e.type) {
        case 'windup': if (it && !it.n.far && it.n.anim?.has?.('Kick')) it.n.anim.once('Kick', { then: 'Idle' }); break;
        case 'serve':
        case 'kick':
          if (e.human) this.kickT = 0;
          if (hear) {
            a.tone(e.quality === 'perfect' ? 640 : 470, { type: 'triangle', dur: 0.07, vol: mine ? 0.1 : 0.05, rev: 0.1 });
            a.noise({ dur: 0.05, vol: mine ? 0.09 : 0.04, freq: 2200 });
          }
          if (e.human && e.quality === 'perfect') { this.hint(tx('Perfect!'), 0.9, 'good'); d.fx?.twinkle?.(this.shuttle.position); if (Math.random() < 0.3) this.shoutAny(kids, pick(SAY.nice)); }
          if (!mine && talk && e.type === 'kick' && Math.random() < 0.12) this.shout(it, pick(SAY.own), 1.6);
          if (id === 'keepup') { this.showBoard(sim, id); if (mine && [10, 20, 30].includes(sim.count)) this.shoutAny(kids, SAY.count[sim.count / 10 - 1]); }
          break;
        case 'whiff':
          this.kickT = 0;
          if (hear) a.noise({ dur: 0.12, vol: 0.05, freq: 900, sweep: 1.5 });
          this.hint(e.why === 'far' ? tx('Too far: stand in the ring') : tx('Too early!'), 1.1, 'bad');
          break;
        case 'wall': if (hear) { a.tone(170, { dur: 0.1, vol: 0.13, rev: 0.15 }); a.noise({ dur: 0.05, vol: 0.08, freq: 1500 }); } break;
        case 'land': if (hear) a.land(0.25); break;
        case 'point': this.onPoint(sim, kids, id, mine, e, talk); break;
        default: break;
      }
    }
    sim.events.length = 0;
  }

  onPoint(sim, kids, id, mine, e, talk) {
    const d = this.d;
    this.showBoard(sim, id);
    for (const it of this.seated.keys()) { this.cheer(it); if (talk && Math.random() < 0.3) this.shout(it, pick(SAY.watch), 1.8); }
    if (id === 'keepup') {
      if (mine && e.human) { d.audio.miss(); this.hint(e.lives > 0 ? tx('Dropped it! Lives left: {n}', { n: e.lives }) : tx('Dropped it!'), 1.6, 'bad'); }
      else if (talk && (mine || Math.random() < 0.4)) this.shout(kids.find(k => k.p.id === e.who), pick(SAY.drop), 1.8);
      return;
    }
    const scorers = sim.players.filter(p => p.team === e.team && !p.human).map(p => kids.find(k => k.p.id === p.id)).filter(Boolean);
    const losers = sim.players.filter(p => p.team !== e.team && !p.human).map(p => kids.find(k => k.p.id === p.id)).filter(Boolean);
    for (const it of scorers) this.cheer(it);
    if (mine) {
      if (e.team === 0) { d.audio.good(); this.hint(e.why === 'streak' ? tx('Three in a row: a point!') : tx('Point for Mika!'), 1.5, 'good'); } else { d.audio.miss(); this.hint(sim.wall ? tx('Point for the kick-board') : tx('Point for the kids'), 1.5, 'bad'); }
    }
    if (!talk) return;
    if (e.why === 'net' || e.why === 'out') this.shoutAny(losers, pick(SAY[e.why]));
    else if (mine && e.team === 0) this.shoutAny(scorers.length ? scorers : losers, pick(scorers.length ? SAY.ours : SAY.aww));
    else if (scorers.length && (mine || Math.random() < 0.5)) {
      const it = pick(scorers), own = SAY[KID_STYLE[it.p.id]];
      this.shout(it, mine ? pick(Math.random() < 0.5 && own ? own : SAY.theirs) : pick(own || SAY.own));
    }
  }

  // ------------------------------------------------------------------ UI bits
  hint(text, life = 2.5, tone = '') {
    const h = this.el?.hint;
    if (!h || !this.round) return;
    h.textContent = text;
    h.className = tone;
    this.hintLeft = life;
  }

  setHud(sim, id, names) {
    const h = this.el.hud;
    let l, big, r, sub;
    if (id === 'keepup') {
      l = tx('Touches'); big = String(sim.count); r = tx('Best: {n}', { n: sim.best });
      const s = Math.max(0, Math.ceil(sim.timeLeft));
      sub = `${'♥'.repeat(Math.max(0, sim.lives))}${'♡'.repeat(Math.max(0, 3 - sim.lives))} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else { l = names.mine; big = `${sim.score[0]} : ${sim.score[1]}`; r = names.theirs; sub = sim.wall ? tx('Three in a row: a point') : tx('First to {n}', { n: sim.target }); }
    if (h._kl !== l) { h._kl = l; h._l.textContent = l; }
    if (h._kb !== big) { h._kb = big; h._big.textContent = big; }
    if (h._kr !== r) { h._kr = r; h._r.textContent = r; }
    if (h._ks !== sub) { h._ks = sub; h._sub.textContent = sub; }
  }

  // ------------------------------------------------------------------ Mika's round
  /** The Kawabe kids who can play right now: those on the court first, then whoever is out of doors (never at night). */
  callKids() {
    const town = this.d.town, out = [];
    if (!town || this.d.townFrozen?.()) return out;
    const c = { x: YARD.x, z: YARD.z };
    for (const id of Object.keys(KID_STYLE)) {
      const it = town.byId.get(id);
      if (!it || !it.n.visible || it.n.riding) continue;
      out.push(it);
    }
    const at = it => (this.here.includes(it) || this.amb?.kids.includes(it) ? 0 : 1000) + Math.hypot(it.n.pos.x - c.x, it.n.pos.z - c.z);
    return out.sort((a, b) => at(a) - at(b));
  }

  /** Where the court camera stands for this screen: north of the court, high enough to see it all. */
  cameraFor(focus) {
    const portrait = innerHeight > innerWidth * 1.15;
    const cam = this.tmpCam, fov = portrait ? 66 : 50, pitch = (portrait ? 56 : 27) * Math.PI / 180;
    cam.fov = fov; cam.aspect = innerWidth / innerHeight; cam.near = 1; cam.far = 500; cam.updateProjectionMatrix();
    const c = toWorld(focus.u, focus.v), look = new THREE.Vector3(c.x, this.y0 + 0.6, c.z);
    const pos = new THREE.Vector3();
    const top = portrait ? 0.74 : 0.6, bottom = portrait ? -0.56 : -0.88, side = 0.9;
    const pts = [];
    for (const su of [-1, 1]) for (const sv of [-1, 1]) pts.push([focus.u + su * focus.w / 2, 0, focus.v + sv * focus.l / 2]);
    pts.push([focus.u, 2.4, focus.v - focus.l / 2], [focus.u - focus.w / 2, 1.5, focus.v + focus.l / 2], [focus.u + focus.w / 2, 1.5, focus.v + focus.l / 2]);
    for (let dist = 7; dist <= 42; dist += 0.5) {
      pos.set(look.x, look.y + Math.sin(pitch) * dist, look.z - Math.cos(pitch) * dist);
      cam.position.copy(pos); cam.lookAt(look); cam.updateMatrixWorld(true);
      let ok = true;
      for (const [u, y, v] of pts) {
        const w = toWorld(u, v);
        V.set(w.x, this.y0 + y, w.z).project(cam);
        if (Math.abs(V.x) > side || V.y > top || V.y < bottom) { ok = false; break; }
      }
      if (ok) break;
    }
    return { pos, look, fov };
  }

  async play() {
    const d = this.d, g = this.g;
    if (this.round || d.busy || d.minigame || d.tricks?.round || !this.ready()) return null;
    const id = this.current(), G = YARD_GAME[id];
    if (!G) return null;
    this.round = { id, starting: true };
    d.ui.prompt(null);
    g.input.releaseAll?.();
    const follow = g.follow, keep = { yaw: follow.yaw, fov: follow.fovBase };
    let result = null;
    try {
      this.locks = true;
      g.player.vel.set(0, 0, 0);
      g.player.carry?.want('worn', 'yard');      // arms out for balance: the lantern stays on her belt
      await d.ui.fade(true, 280);
      let again = true, first = true;
      while (again) {
        const st = this.save, level = levelFor(st[id], g.easy);
        const res = await this.runRound(G, level, first);
        first = false;
        result = res || { quit: true };
        if (result.quit) break;
        const { rec, newBest } = recordYard(st[id], result);
        st[id] = rec;
        if (result.stars) d.audio.star(); else d.audio.good();
        this.saveNow();
        again = await this.results(G, result, rec, newBest);
        if (again) { this.locks = true; await d.ui.fade(true, 220); }
      }
    } catch (e) {
      console.error('[yard] round failed', e);
    } finally {
      // whatever happened, the round never keeps the screen, the camera or the kids
      for (const l of this.loops) l.res({ quit: true });
      this.loops.clear();
      this.endRound(keep);
      this.round = null;
      this.locks = false;
      g.player.carry?.release('yard');
      if (!d.busy) g.player.locked = false;
      d.actCooldown = 0.5;
      d.ui.fade(false, 200);
    }
    d.save?.();
    return result;
  }

  /** One round: sides, places, camera, then the sim runs on Mika's input until it is over (or she stops). */
  async runRound(G, level, first) {
    const d = this.d, g = this.g, p = g.player, id = G.id, town = d.town;
    // ---- who plays where
    const kids = this.callKids();
    const T = G.teams(kids);
    const playing = [...T.mine, ...T.theirs], watching = kids.filter(k => !playing.includes(k));
    this.endAmbient();
    for (const it of this.held) it.yardHold = false;
    this.held = kids.slice();
    for (const it of kids) {
      it.yardHold = true;
      it.wasHere = this.here.includes(it) || !!it.game && (it.game.game === 'footnet' || it.game.game === 'keepup');
      town.setProp(it, null);
      it.n.path = null; it.n.onPathDone = null; it.n.sitting = false;
      it.n.anim?.cancelOneShot?.();
    }
    for (const it of [...this.seated.keys()]) this.unseat(it);
    for (const it of watching) this.seat(it);
    const players = [{ id: 'mika', team: 0, human: true }];
    for (const it of T.mine) players.push({ id: it.p.id, team: 0, style: KID_STYLE[it.p.id] });
    for (const it of T.theirs) players.push({ id: it.p.id, team: 1, style: KID_STYLE[it.p.id] });
    const sim = G.create({ seed: this.debug.seed ?? Math.floor(Math.random() * 1e9), players, level, target: G.target(level), wall: !!T.wall });
    const R = this.round = { id, sim, kids: playing, level };
    const human = sim.human;
    // ---- places (under the fade)
    const hw = toWorld(human.u, human.v);
    p.teleport(hw.x, hw.z, undefined, 0);
    for (const pl of sim.players) { const it = playing.find(k => k.p.id === pl.id); if (it) { const w = toWorld(pl.u, pl.v); it.n.place(w.x, w.z, pl.team === 0 ? 0 : Math.PI); it.n.setIdle('Idle'); it.n.anim?.play('Idle'); } }
    // ---- camera and HUD
    const shot = this.cameraFor(G.focus), follow = g.follow;
    follow.fovBase = shot.fov;
    follow.cutscene({ pos: shot.pos, look: shot.look }, 0.01);
    follow.yaw = 0;                                   // Mika's stick is read against this heading: up = up the court
    const names = {
      mine: T.mine.length ? `${tx('Mika')} & ${tx(T.mine[0].p.name)}` : tx('Mika'),
      theirs: T.wall ? tx('Kick-board') : T.theirs.map(k => tx(k.p.name)).join(' & '),
    };
    R.names = names;
    this.setHud(sim, id, names);
    this.showBoard(sim, id);
    this.el.hud.classList.remove('hidden');
    this.el.stop.classList.remove('hidden');
    this.el.stop.innerHTML = `${tx('Stop playing')}<kbd>⌫</kbd>`;
    document.body.classList.add('trick-round', 'yard-round');
    this.hintLeft = 0; this.el.hint.classList.add('hidden');
    await d.ui.fade(false, 280);
    this.locks = false;
    if (first && playing.length) this.shoutAny(playing, pick(SAY.join), 2.6);
    this.hint(tx('Press {act} to serve'), 60);
    let taught = level !== 'first', served = false, serveHint = true;
    const bodies = sim.players.map(pl => (pl.human ? null : playing.find(k => k.p.id === pl.id) || null));
    // ---- the rally
    const out = await this.loop(dt => {
      const inp = g.input;
      let mx = inp.move.x, mv = -inp.move.y, kick = inp.pressed('act') || inp.pressed('tap');
      // keep her on her half
      const c = toCourt(p.pos.x, p.pos.z, C1);
      const cu = Math.max(-COURT.W / 2 - 0.8, Math.min(COURT.W / 2 + 0.8, c.u)), cv = Math.max(0.45, Math.min(COURT.HALF + 1.2, c.v));
      if (cu !== c.u || cv !== c.v) { const w = toWorld(cu, cv, W1); p.pos.x = w.x; p.pos.z = w.z; }
      const A = this.debug.auto;
      if (A) {
        // QA autopilot: the bot's stick moves her (same speed as her run), its kick is her kick
        const b = G.bot(sim, A === 'lose' ? () => -1 : this.debug.at);
        mx = b.mx; mv = b.mv; kick = b.kick;
        const w = toWorld(cu + mx * 4.4 * dt, cv + mv * 4.4 * dt, W1);
        p.pos.x = w.x; p.pos.z = w.z;
        p.vel.x = 0; p.vel.z = 0;
      }
      toCourt(p.pos.x, p.pos.z, C1);
      INP.mx = mx; INP.mv = mv; INP.kick = kick;
      sim.step(Math.min(dt, 0.05), INP);
      if (!served && sim.state === 'rally') {
        served = true;
        this.hint(taught ? '' : tx('Stand in the ring. Press {act} as the shuttle comes down.'), taught ? 0.01 : 7);
        taught = true; serveHint = false;
      } else if (served && sim.state === 'serve' && sim.server === human && !serveHint && !(this.hintLeft > 0)) { serveHint = true; this.hint(tx('Press {act} to serve'), 60); }
      else if (sim.state === 'rally' && serveHint) { serveHint = false; this.hint('', 0.01); }
      for (let i = 0; i < bodies.length; i++) if (bodies[i]) this.drive(bodies[i], sim.players[i], sim, dt);
      // she faces up the court when she stands still
      if (p.speed < 0.4) p.turnTo(0, dt, 8);
      this.present(sim, dt, true);
      this.events(sim, playing, id, true);
      this.setHud(sim, id, names);
      if (sim.over) return sim.over;
      return undefined;
    });
    // ---- the end of it
    this.hideShuttle();
    this.el.hud.classList.add('hidden');
    this.el.stop.classList.add('hidden');
    this.el.hint.classList.add('hidden'); this.hintLeft = 0;
    if (!out || out.quit) return { quit: true };
    this.locks = true;
    p.vel.set(0, 0, 0);
    const won = id === 'keepup' ? out.stars > 0 : out.won;
    for (const it of playing) this.cheer(it);
    for (const it of this.seated.keys()) this.cheer(it);
    if (won) { p.anim?.once?.('Cheer', { then: 'Idle' }); d.audio.fanfare?.(); }
    if (id === 'footnet' && playing.length) this.shoutAny(playing, pick(out.won ? SAY.win : SAY.lose), 3.2);
    await this.wait(1.5);
    return out;
  }

  /** Give the camera, the kids and the screen back. */
  endRound(keep) {
    const g = this.g, town = this.d.town;
    this.hideShuttle();
    if (this.el) {
      this.el.hud.classList.add('hidden'); this.el.stop.classList.add('hidden'); this.el.hint.classList.add('hidden'); this.el.card.classList.add('hidden');
      document.body.classList.remove('trick-round', 'yard-round');
    }
    this.hintLeft = 0;
    g.follow.fovBase = keep.fov;
    g.follow.yaw = keep.yaw;
    g.follow.clearCutscene(true);
    for (const it of [...this.seated.keys()]) this.unseat(it);
    for (const it of this.held) {
      it.yardHold = false;
      it.n.anim?.cancelOneShot?.();
      it.n.setIdle('Idle'); it.n.anim?.play('Idle');
      // kids called over from somewhere else go back to their day (the ones whose plan is the yard just carry on)
      if (!it.wasHere) town?.release(it.p.id);
    }
    this.held = [];
    this.kickT = 9;
    this.showBoard();
  }

  quit() {
    if (!this.round || !this.loops.size || !this.el.card.classList.contains('hidden')) return;
    for (const l of [...this.loops]) { this.loops.delete(l); l.res({ quit: true }); }
  }

  /** Run fn(dt) every frame until it returns a value. */
  loop(fn) { return new Promise(res => this.loops.add({ fn, res })); }
  wait(sec) { let t = 0; return this.loop(dt => ((t += dt) >= sec ? true : undefined)); }

  /** Save now, although a round owns the screen (director.save refuses during one: the card is a safe moment). */
  saveNow() {
    const r = this.round;
    this.round = null;
    try { this.d.save(); } finally { this.round = r; }
  }

  /** The results card. Resolves true for "Play again". */
  results(G, res, rec, newBest) {
    const ui = this.d.ui, el = this.el.card, id = G.id, R = this.round;
    this.locks = true;
    el.querySelector('.box').innerHTML = `<h2></h2><div class="verdict"></div>
      <div class="stars">${[0, 1, 2].map(i => `<i style="animation-delay:${0.2 + i * 0.25}s">${i < res.stars ? '★' : '☆'}</i>`).join('')}</div>
      <div class="score"></div><div class="best"></div>
      <div class="btns"><button class="again"></button><button class="main done"></button></div>`;
    const q = s => el.querySelector(s);
    q('h2').textContent = tx(G.name);
    if (id === 'keepup') {
      q('.verdict').textContent = res.stars >= 3 ? tx('Nobody in Kawabe keeps it up like that!') : res.stars ? tx('Well kept up!') : tx('Good try!');
      q('.score').textContent = tx('{n} touches in a row', { n: res.score });
      q('.best').textContent = newBest && rec.plays > 1 ? tx('New best!') : tx('Best: {n}', { n: rec.best });
    } else {
      q('.verdict').textContent = res.won ? tx('You win!') : tx('The kids win this one');
      if (!res.won) q('.verdict').style.color = '#a2441c';
      q('.score').textContent = `${R.names.mine} ${res.mine} : ${res.theirs} ${R.names.theirs}`;
      q('.best').textContent = tx('Wins: {n} · Longest rally: {m}', { n: rec.wins, m: rec.rally });
    }
    const touch = ui.touch;
    q('.again').innerHTML = `${tx('Play again')}${touch ? '' : '<kbd>Space</kbd>'}`;
    q('.done').innerHTML = `${tx('Done')}${touch ? '' : '<kbd>E</kbd>'}`;
    el.classList.remove('hidden');
    return new Promise(resolve => {
      let t0 = 0;
      const finish = again => { this.loops.delete(l); el.classList.add('hidden'); this.locks = false; resolve(again); };
      q('.again').onclick = () => finish(true);
      q('.done').onclick = () => finish(false);
      const l = {
        fn: dt => {
          t0 += dt;
          const inp = this.g.input;
          if (t0 < 0.6) return;                  // the press that ended the round must not close the card
          if (inp.pressed('jump')) finish(true);
          else if (inp.pressed('act') || inp.pressed('back')) finish(false);
        },
        res: () => finish(false),
      };
      this.loops.add(l);
    });
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const g = this.g;
    if (this.loops.size) {
      const cardUp = !this.el.card.classList.contains('hidden');
      if (g.input.pressed('back') && this.round?.sim && !cardUp) this.quit();
      else for (const l of [...this.loops]) {
        let r;
        // a bug inside a round must not freeze the game: end that round as if she stopped, and say so in the console
        try { r = l.fn(dt); } catch (e) { console.error('[yard] round failed', e); r = { quit: true }; }
        if (r !== undefined) { this.loops.delete(l); l.res(r); }
      }
    }
    if (this.hintLeft > 0 && this.el) {
      const h = this.el.hint;
      h.classList.toggle('hidden', !h.textContent);
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) h.classList.add('hidden');
    }
    // the kids' own game, while Mika is not in one
    if (!this.round) {
      const frozen = this.d.townFrozen?.() || this.d.busy > 0 || !!this.d.scenes.active;
      if (!frozen) this.stepAmbient(dt);
    }
    this.here.length = 0;
    this.hereGame = null;
    this.swing(dt);
    // after dark: the net's unlit strings dim, and the shuttle keeps a little glow of its own so it can be followed
    const night = g.night || 0;
    g.structures?.yard?.setNight(night);
    if (this.shuttle.visible) this.shuttle.material.emissiveIntensity = 0.45 * night;
  }

  /** Mika has no kick clip: her right leg swings from the hip for a third of a second (after the mixer, before drawing). */
  swing(dt) {
    if (this.kickT > 0.4) return;
    this.kickT += dt;
    const p = this.g.player;
    const B = this.bones ??= { thigh: p.model?.getObjectByName('thigh_R') || null, shin: p.model?.getObjectByName('shin_R') || null, hips: p.model?.getObjectByName('hips') || null };
    if (!B.thigh) return;
    const k = Math.min(1, this.kickT / 0.34), s = Math.sin(k * Math.PI);
    B.thigh.rotateX(-1.25 * s);
    B.shin?.rotateX(0.7 * Math.sin(Math.min(1, k * 1.6) * Math.PI) * (1 - k));
  }
}
