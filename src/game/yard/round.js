// The playground yards at runtime (content/yard.js, world/yard.js, ./index.js, ./views.js). Three jobs:
//   - the kids' own play: Town Life hands over the kids whose day plan says `play: '<game>'` at a yard's spot (townlife.js
//     updateGames -> ambient); they play by themselves, the same pure simulation Mika plays with nobody human in it. It
//     sleeps while every kid is beyond the draw distance or the yard is far from Mika.
//   - Mika joins: "Join the game" at the yard starts a scored round of the game on its scoreboard (the kids there take
//     sides; with nobody about, the village kids are called over; at night she plays the practice board). A fixed camera
//     (behind the court or from the side, her choice), a small HUD, the landing ring, kids' speech bubbles, a results card
//     with the real-world note.
//   - "Change the game" at the scoreboard post picks the next game of THAT yard's list.
// The round runner is modelled on game/tricks.js (HUD pill, hint, results card with stars, Play again / Done, Backspace
// quits, the record kept in quest.state.yard); the yard is not one of Grandma's tricks, so it has its own.
import * as THREE from 'three';
import { YARD_LIST, stageOf, toWorld, toCourt, pathBetween, enterPoint, KID_STYLE, YARD_NAMES, YARD_RULES, YARD_NOTES, recordYard, cleanYard, gameOn, setGameOn, yardAt } from '../../content/yard.js';
import { YARD_GAME, nextGame, levelFor, ambientRoles } from './index.js';
import { Views } from './views.js';
import { squareAt } from './views.js';
import { Poses } from './poses.js';
import { SAY, CSS } from './say.js';
import { COURT } from './rules.js';
import { BARK_RANGE } from '../barks.js';
import { tx, getLang } from '../../i18n/i18n.js';

const HEAR = 30;              // the yard's sounds carry this far
const INVITE_R = 11;          // a kid calls Mika over when she comes this close to a game
const AWAKE_R = 85;           // a yard's own game runs while Mika is this close
const V = new THREE.Vector3();
const W1 = { x: 0, z: 0 }, W2 = { x: 0, z: 0 }, C1 = { u: 0, v: 0 }, C2 = { u: 0, v: 0 };
const INP = { mx: 0, mv: 0, kick: false, jump: false, hold: false, pos: C1, aimU: null, aimV: null, pick: null, dir: 0, hint: false };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CAM_KEY = 'starline-yard-cam';

/** What the QA autopilot (debug.auto) feeds each game's stand-in: a careful player, and a hopeless one. */
const QA = {
  win: { footnet: 0.12, keepup: 0.12, volley: 0.12, rope: 0.27, tug: 0, sack: 0.5, marbles: 0.95, oanquan: 2 },
  lose: { footnet: () => -1, keepup: () => -1, volley: () => -1, rope: () => -1, tug: () => 0.7, sack: () => 0.18, marbles: () => 0.08, oanquan: 0 },
};

export class Yard {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.round = null;            // the round Mika is playing { id, sim, ... }
    this.locks = false;           // true while the round holds Mika still (read by director.update)
    this.loops = new Set();       // per-frame steps of the running round
    this.poses = new Poses();
    this.kickT = 9;
    this.debug = { auto: null, seed: null };   // QA: auto = 'win' | 'lose' plays Mika's part (window.__STARLINE_QA__.director.yard)
    this.cam = 'end';
    try { const c = localStorage.getItem(CAM_KEY); if (c === 'side' || c === 'end') this.cam = c; } catch { /* no storage */ }
    this.pad = { dir: 0, hint: false, hold: false, aim: null, pick: null };
    this.ctl = {};
    for (const Y of YARD_LIST) this.ctl[Y.id] = { Y, y0: this.g.world.heightAt(Y.x, Y.z), here: [], hereGame: null, amb: null, override: null, held: [], seated: new Map(), inviteCool: 0 };
    this.views = new Views(this.g.scene, this.g.world.quality);
    this.build();
    this.buildUi();
    for (const c of Object.values(this.ctl)) { this.register(c); this.showBoard(c); }
  }

  // ------------------------------------------------------------------ state helpers
  get st() { return this.d.q?.state; }
  get save() { const st = this.st; if (!st) return { game: 'footnet' }; if (!st.yard?.game) st.yard = cleanYard(st.yard); return st.yard; }
  /** The yards are part of the valley from chapter one on, and in Explore. */
  ready() { return !!this.st && this.st.chapter >= 1; }
  /** Kids are playing by themselves at this yard, close enough to be drawn. */
  kidsPlaying(c) { return !!c.amb && c.amb.awake; }
  /** The game on a yard's scoreboard: the one the kids are at, or the one Mika chose. */
  current(c) { return c.amb ? (c.Y.games.includes(c.override) ? c.override : c.amb.want) : gameOn(this.save, c.Y); }
  near(c, r = HEAR) { const p = this.g.player.pos; return Math.hypot(p.x - c.Y.x, p.z - c.Y.z) < r; }
  /** The yard Mika is nearest to (within `r`), or null. */
  nearest(r = 60) { const p = this.g.player.pos, Y = yardAt(p.x, p.z, r); return Y ? this.ctl[Y.id] : null; }
  mikaBody() { const p = this.g.player; return (this._mb ??= { model: p.model, root: p.root, anim: p.anim, pivot: p.pivot }); }
  kidBody(it) { return (it._yb ??= { model: it.n.model, root: it.n.root, anim: it.n.anim, get far() { return it.n.far; } }); }
  ground(x, z) { return this.g.world.heightAt(x, z); }

  // ------------------------------------------------------------------ the few shared things the games draw
  build() {
    const scene = this.g.scene;
    // the landing / beat ring: the inner ring is where, the outer ring closes on it: when
    const flat = (g, color, opacity) => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false;
      return m;
    };
    this.ring = flat(new THREE.RingGeometry(0.44, 0.56, 28), '#ffd34a', 0.95);
    this.ringOut = flat(new THREE.RingGeometry(0.6, 0.635, 32), '#ffffff', 0.7);
    this.ring.name = 'yard:ring'; this.ringOut.name = 'yard:ringOut';
    scene.add(this.ring, this.ringOut);
    this.tmpCam = new THREE.PerspectiveCamera();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
      cam: mk('button', 'yardCam', ''),
      pad: mk('div', 'yardPad', ''),
      card: mk('div', 'yardCard', '<div class="box"></div>'),
    };
    const h = this.el.hud;
    h._l = h.querySelector('.l'); h._big = h.querySelector('.big'); h._r = h.querySelector('.r'); h._sub = h.querySelector('.sub');
    this.el.stop.addEventListener('click', () => this.quit());
    this.el.cam.addEventListener('click', () => this.toggleCam());
    // the pad: on-screen buttons for the games that are not one-button (oan quan: hint and the two ways round; marbles: hold to flick)
    const pad = this.el.pad, btn = (cls, label, down, up) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = label; b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); down(); });
      const rel = e => { e.preventDefault(); b.classList.remove('down'); up?.(); };
      b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
      pad.appendChild(b);
      return b;
    };
    this.padBtns = {
      hint: btn('', '?', () => { this.pad.hint = true; }),
      left: btn('', '◀', () => { this.pad.dir = -1; }),
      right: btn('', '▶', () => { this.pad.dir = 1; }),
      flick: btn('big', tx('Hold to flick'), () => { this.pad.hold = true; }, () => { this.pad.hold = false; }),
    };
    const canvas = this.g.renderer.renderer.domElement;
    canvas.addEventListener('pointerdown', e => this.onPointer(e));
  }

  /** The on-screen buttons that belong to a game (none for the one-button games). */
  showPad(look) {
    if (!this.el) return;
    const on = look === 'board' || look === 'marbles';
    this.el.pad.classList.toggle('hidden', !on);
    this.padBtns.hint.style.display = this.padBtns.left.style.display = this.padBtns.right.style.display = look === 'board' ? '' : 'none';
    this.padBtns.flick.style.display = look === 'marbles' ? '' : 'none';
    this.padBtns.flick.textContent = tx('Hold to flick');
    document.body.classList.toggle('yard-pad', on);
  }

  register(c) {
    const d = this.d, p = this.g.player, Y = c.Y, y0 = c.y0;
    const rack = new THREE.Vector3(Y.rack.x + 0.6, y0 + 1, Y.rack.z);
    const post = new THREE.Vector3(Y.board.x, y0 + 1, Y.board.z);
    const text = { key: '', join: '', board: '' };
    const refresh = () => {
      const id = this.current(c), playing = this.kidsPlaying(c), key = `${getLang()}|${id}|${playing}`;
      if (key === text.key) return;
      text.key = key;
      const name = tx(YARD_NAMES[id]);
      text.join = playing ? tx('Join the game: {name}', { name }) : tx('Play: {name}', { name });
      text.board = tx('Change the game (now: {name})', { name });
    };
    const free = () => this.ready() && !this.round && !d.busy && !d.scenes.active && !this.g.interiors?.active && !this.g.kite?.active;
    // on the court itself the prompt follows Mika; a game with a stage of its own answers anywhere near that stage; off both it waits at the ball box
    const onCourt = () => Math.abs(p.pos.x - Y.x) < Y.w / 2 + 0.4 && Math.abs(p.pos.z - Y.z) < Y.l / 2 + 0.4 && Math.abs(p.pos.z - Y.z) > 0.5;
    const stagePos = new THREE.Vector3();
    const anchor = () => {
      const id = this.current(c), S = Y.stages?.[id];
      if (S) {
        const reach = id === 'tug' || id === 'sack' ? 9 : 4.5;
        if (Math.hypot(p.pos.x - S.x, p.pos.z - S.z) < reach) return V.copy(p.pos).setY(p.pos.y + 1);
        return stagePos.set(S.x, y0 + 1, S.z);
      }
      return onCourt() ? V.copy(p.pos).setY(p.pos.y + 1) : rack;
    };
    d.interact(`yard:join:${Y.id}`, null, () => { refresh(); return text.join; }, free, () => this.play(c), 2.6, anchor, 0.3);
    d.interact(`yard:board:${Y.id}`, post, () => { refresh(); return text.board; }, free, () => this.changeGame(c), 2.1, null, 0.6);
  }

  // ------------------------------------------------------------------ the scoreboard
  showBoard(c, sim = null, id = this.current(c)) {
    const b = this.g.structures?.yards?.[c.Y.id];
    if (!b) return;
    const name = tx(YARD_NAMES[id]);
    if (!sim || !sim.hud) b.setBoard(name, id === 'keepup' ? '0' : id === 'rope' || id === 'sack' ? '-' : id === 'tug' || id === 'marbles' || id === 'oanquan' || id === 'volley' || id === 'footnet' ? '0 : 0' : '0', tx(YARD_RULES[id], {}));
    else { const h = sim.hud({ mine: '', theirs: '' }); b.setBoard(name, h.big, h.sub || ''); }
  }

  changeGame(c) {
    const id = nextGame(this.current(c), c.Y.games);
    setGameOn(this.save, c.Y, id);
    if (c.amb) { c.override = id; this.shoutAny(c, c.amb.kids, pick(SAY[id] || SAY.own)); }
    this.d.ui.toast(`${tx('Next game: {name}', { name: tx(YARD_NAMES[id]) })} · ${tx(YARD_RULES[id])}`);
    this.d.audio.click();
    if (!c.amb) this.showBoard(c, null, id);
    this.d.save?.();
  }

  // ------------------------------------------------------------------ bodies
  /** A speech bubble over a kid (Town Life person `it`). */
  shout(c, it, text, life = 2.4) {
    if (!it || !it.n.visible || it.n.far) return;
    const n = it.n;
    this.d.barks.ui.show(`yard:${it.p.id}`, text, out => { n.head(out); out.y += 0.3 - (n.sitting ? 0.35 : 0); return out; }, { name: tx(it.p.name || ''), life });
    if (this.near(c)) this.d.audio?.blip?.(1.4);
  }
  shoutAny(c, kids, text) { const k = kids?.length ? pick(kids) : null; if (k) this.shout(c, k, text); }

  /** Where a kid looks in a game (a world point), or null. */
  lookAt(G, pl, sim, S) {
    const out = W2;
    const to = (u, v) => toWorld(u, v, out, S);
    if (G.look === 'shuttle' || G.look === 'ball') return sim.shuttle.on ? to(sim.shuttle.u, sim.shuttle.v) : null;
    if (G.id === 'tug') return to(pl.team === 0 ? 4 : -4, 0);
    if (G.id === 'rope') return pl.role === 'turn' ? to(-pl.u, 0) : to(0, 3);
    if (G.id === 'sack') return to(pl.u, -9);
    if (G.id === 'oanquan') return to(0, pl.v > 0 ? -1 : 1);
    if (G.id === 'marbles') return to(0, 0);
    return null;
  }

  /** Put a sim player's body where the sim has it: a kid runs or stands, turning to what matters; far moves go through the gates. */
  drive(c, it, pl, sim, dt, G, S) {
    const n = it.n, Y = c.Y, w = toWorld(pl.u, pl.v, W1, S);
    n.path = null; n.sitting = false;
    const gy = this.ground(w.x, w.z), a = n.anim;
    if (it.yPath?.length) {
      const [tx_, tz] = it.yPath[0], dx = tx_ - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, 5 * dt);
      n.pos.x += dx / (d || 1) * step; n.pos.z += dz / (d || 1) * step; n.pos.y = this.ground(n.pos.x, n.pos.z);
      n.targetFacing = Math.atan2(dx, dz);
      if (d < 0.1) it.yPath.shift();
      if (a && !a.busy) { if (a.has('Run')) a.play('Run', { speed: 1.1 }); }
      return;
    }
    const dx = w.x - n.pos.x, dz = w.z - n.pos.z, moved = Math.hypot(dx, dz);
    if (moved > 1.6) { it.yPath = pathBetween(Y, n.pos.x, n.pos.z, w.x, w.z); return; }
    n.pos.x = w.x; n.pos.z = w.z; n.pos.y = gy + (pl.y || 0);
    if (pl.moving && moved > 1e-4) n.targetFacing = Math.atan2(dx, dz);
    else { const l = this.lookAt(G, pl, sim, S); if (l && Math.hypot(l.x - w.x, l.z - w.z) > 0.6) n.targetFacing = Math.atan2(l.x - w.x, l.z - w.z); }
    if (!a || a.busy) return;
    if (pl.moving && a.has('Run') && G.moves) a.play('Run', { speed: Math.min(1.2, Math.max(0.55, moved / Math.max(dt, 1e-3) / 4.2)) });
    else a.play('Idle');
  }

  /** Sit a kid on a bench to watch. */
  seat(c, it) {
    if (!it || c.seated.has(it)) return;
    const used = new Set(c.seated.values()), B = c.Y.benches;
    let i = 0;
    while (used.has(i) && i < 4) i++;
    c.seated.set(it, i);
    const b = B[Math.floor(i / 2) % B.length], off = i % 2 ? -0.42 : 0.42, n = it.n;
    const x = b.x + 0.02, z = b.z + off;
    const sit = () => {
      if (c.seated.get(it) !== i) return;
      n.place(x, z, b.face);
      n.sitting = true;
      const clip = n.anim?.has?.('Sit') ? 'Sit' : 'Idle';
      n.setIdle(clip);
      if (n.anim && !n.anim.busy) n.anim.play(clip);
    };
    if (Math.hypot(n.pos.x - x, n.pos.z - z) > 1.2 && !this.round) { const path = pathBetween(c.Y, n.pos.x, n.pos.z, x + 0.5, z); n.walk(path, sit, 2.4); } else sit();
  }

  unseat(c, it) {
    if (!c.seated.delete(it)) return;
    const n = it.n;
    if (n.sitting) { n.sitting = false; n.place(n.pos.x + 0.7, n.pos.z, n.facing); }
    n.setIdle('Idle');
    if (n.anim && !n.anim.busy) n.anim.play('Idle');
  }

  cheer(it) {
    const a = it.n.anim;
    if (!a || !a.has('Cheer') || it.n.far || a.busy) return;
    a.once('Cheer', { then: it.n.sitting ? it.n.idleClip : 'Idle' });
  }

  // ------------------------------------------------------------------ the kids' own play
  /** QA: put the yard's kids into `game` at once (their day plan waits); no game: let them go. window.__STARLINE_QA__.director.yard.debugAmbient('takamori', 'tug') */
  debugAmbient(yardId, game) {
    const c = this.ctl[yardId], town = this.d.town;
    for (const it of c.dbg?.kids || []) it.yardHold = false;
    c.dbg = null;
    if (!game) return;
    const kids = c.Y.kids.map(id => town.byId.get(id)).filter(Boolean);
    for (const it of kids) { it.yardHold = true; it.n.setHidden(false); }
    c.dbg = { game, kids };
  }

  /** Town Life: these kids' plans say "play at the yard" right now (called every frame for each such game). */
  ambient(gm, kids) {
    const Y = yardAt(gm.at[0], gm.at[1], 12), c = Y && this.ctl[Y.id];
    if (!c) return;
    for (const k of kids) if (!c.here.includes(k)) c.here.push(k);
    c.hereGame ??= gm.game;
  }

  endAmbient(c) {
    const A = c.amb;
    if (!A) return;
    for (const it of [...c.seated.keys()]) this.unseat(c, it);
    for (const it of A.kids) { it.yPath = null; if (it.n.anim && !it.n.anim.busy) it.n.anim.play('Idle'); }
    c.amb = null;
    c.override = null;
    this.views.hideAll(c.Y.id);
    this.showBoard(c);
  }

  startAmbient(c, kids, game, prev) {
    const ids = kids.map(k => k.p.id), Y = c.Y;
    const R = ambientRoles(game, ids, prev?.rounds || 0, prev?.loser || null);
    const G = YARD_GAME[R.game], S = stageOf(Y, G.id);
    this.views.hideAll(c.Y.id);                 // (the last game's pieces go away: a new one is starting)
    const by = id => kids.find(k => k.p.id === id);
    for (const it of [...c.seated.keys()]) if (!R.watch.includes(it.p.id)) this.unseat(c, it);
    for (const id of R.watch) this.seat(c, by(id));
    // a kid who is outside the rails steps in at the gate first (the ones whose game is outside walk there on their own)
    const players = R.play.map((id, i) => {
      const it = by(id);
      if (G.look === 'shuttle' || G.look === 'ball') { const e = enterPoint(Y, it.n.pos.x, it.n.pos.z); if (e) { it.n.place(e[0], e[1], it.n.facing); it.yPath = null; } }
      const cc = toCourt(it.n.pos.x, it.n.pos.z, {}, S);
      return { id, team: G.ambientTeam(R.play, i), style: KID_STYLE[id] || 'steady', u: cc.u, v: cc.v };
    });
    const seed = (prev?.seed || Math.floor(Math.random() * 1e9)) + 1;
    const sim = G.create({ seed, players, level: 'normal', target: 3 });
    const view = this.views.get(G.look, Y.id);
    view?.attach(S, this.ground(S.x, S.z));
    c.amb = { want: game, game: R.game, G, S, kids, roles: R, sim, view, bodies: sim.players.map(pl => by(pl.id) || null), rounds: prev?.rounds || 0, loser: null, seed, rest: 3, awake: true };
    this.showBoard(c, sim, R.game);
  }

  stepAmbient(c, dt) {
    const kids = c.here, want = c.Y.games.includes(c.override) ? c.override : c.hereGame;
    if (!kids.length || !want) { this.endAmbient(c); return; }
    let same = !!c.amb && c.amb.want === want && c.amb.kids.length === kids.length;
    for (let i = 0; same && i < kids.length; i++) same = c.amb.kids.includes(kids[i]);
    if (!same) this.startAmbient(c, kids.slice(), want, c.amb);
    const A = c.amb, sim = A.sim, G = A.G;
    // nobody near enough to be drawn (or the yard far from Mika): the game sleeps where it stands
    const asleep = !A.kids.some(k => !k.n.far) || !this.near(c, AWAKE_R);
    A.awake = !asleep;
    if (asleep) { A.view?.hide(); return; }
    if (sim.over) {
      A.rest -= dt;
      for (let i = 0; i < A.bodies.length; i++) if (A.bodies[i]) { sim.players[i].moving = false; this.drive(c, A.bodies[i], sim.players[i], sim, dt, G, A.S); }
      if (A.rest <= 0) {
        A.rounds++;
        A.loser = G.id === 'footnet' || G.id === 'volley' ? sim.players.find(q => q.team === (sim.over.won ? 1 : 0))?.id || null : null;
        this.startAmbient(c, A.kids, A.want, A);
      }
      return;
    }
    sim.step(Math.min(dt, 0.05));
    for (let i = 0; i < A.bodies.length; i++) if (A.bodies[i]) this.drive(c, A.bodies[i], sim.players[i], sim, dt, G, A.S);
    this.present(A.view, sim, dt, false, A.S, this.ground(A.S.x, A.S.z));
    this.events(c, sim, A.kids, G, false, A.S);
    // a kid calls Mika over when she walks up
    c.inviteCool -= dt;
    if (c.inviteCool <= 0 && this.ready() && this.near(c, INVITE_R) && !this.d.busy && !this.d.ui.dialogueOpen) {
      c.inviteCool = 45;
      this.shoutAny(c, A.kids, pick(SAY.invite), 3);
    }
  }

  // ------------------------------------------------------------------ showing a sim (the kids' game and Mika's)
  present(view, sim, dt, withRing, S, y0) {
    view?.update(sim, dt);
    const M = sim.marker, on = withRing && M.on && (sim.state === 'rally' || sim.state === 'pull');
    this.ring.visible = on;
    this.ringOut.visible = on && M.mine && !M.out;
    if (on) {
      const w = toWorld(M.u, M.v, W1, S), L = sim.L || { p0: 0, p1: sim.W?.perfect ?? 0.14 }, mat = this.ring.material;
      this.ring.position.set(w.x, y0 + 0.045, w.z);
      this.ringOut.position.set(w.x, y0 + 0.05, w.z);
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

  /** A pose on a kid (or on Mika). */
  pose(who, kind, c, kids, human) {
    if (human) { this.poses.start(this.mikaBody(), kind); return; }
    const it = kids?.find(k => k.p.id === who);
    if (it && !it.n.far) this.poses.start(this.kidBody(it), kind);
  }

  /** The sim's events: sounds, poses, cheers, bubbles. kids: the Town Life people in it. */
  events(c, sim, kids, G, mine, S) {
    if (!sim.events.length) return;
    const d = this.d, a = d.audio, hear = this.near(c), by = who => kids.find(k => k.p.id === who);
    const talk = this.near(c, BARK_RANGE), id = G.id, tone = (f, o) => hear && a.tone(f, o), noise = o => hear && a.noise(o);
    for (const e of sim.events) {
      const it = e.who ? by(e.who) : null;
      switch (e.type) {
        case 'windup':
          if (id === 'volley') this.pose(e.who, e.kind === 'set' ? 'set' : e.kind === 'bump' ? 'bump' : 'spike', c, kids, false);
          else if (it && !it.n.far && it.n.anim?.has?.('Kick')) it.n.anim.once('Kick', { then: 'Idle' });
          break;
        case 'serve':
        case 'kick':
          if (e.human) { this.kickT = 0; if (id === 'volley') this.poses.start(this.mikaBody(), e.kind === 'set' ? 'set' : e.kind === 'bump' ? 'bump' : e.kind === 'spike' ? 'spike' : 'bump'); else this.poses.start(this.mikaBody(), 'kick'); }
          tone(e.quality === 'perfect' ? 640 : 470, { type: 'triangle', dur: 0.07, vol: mine ? 0.1 : 0.05, rev: 0.1 });
          noise({ dur: 0.05, vol: mine ? 0.09 : 0.04, freq: id === 'volley' ? 900 : 2200 });
          if (e.human && e.quality === 'perfect') { this.hint(tx('Perfect!'), 0.9, 'good'); if (Math.random() < 0.3) this.shoutAny(c, kids, pick(SAY.nice)); }
          if (!mine && talk && e.type === 'kick' && Math.random() < 0.12) this.shout(c, it, pick(SAY.own), 1.6);
          if (id === 'keepup') { this.showBoard(c, sim, id); if (mine && [10, 20, 30].includes(sim.count)) this.shoutAny(c, kids, SAY.count[sim.count / 10 - 1]); }
          if (id === 'volley' && e.kind === 'spike' && talk && it && Math.random() < 0.5) this.shout(c, it, pick(SAY[KID_STYLE[it.p.id]] || SAY.spike), 1.8);
          break;
        case 'pass':
          if (id === 'volley' && talk && Math.random() < 0.25) this.shoutAny(c, kids, pick(SAY.set), 1.6);
          if (id === 'volley' && e.kind === 'set') { this.pose(e.who, 'set', c, kids, !!(sim.human && sim.human.id === e.who)); }
          break;
        case 'whiff':
          this.kickT = 0;
          noise({ dur: 0.12, vol: 0.05, freq: 900, sweep: 1.5 });
          this.hint(e.why === 'far' ? tx('Too far: stand in the ring') : tx('Too early!'), 1.1, 'bad');
          break;
        case 'wall': tone(170, { dur: 0.1, vol: 0.13, rev: 0.15 }); noise({ dur: 0.05, vol: 0.08, freq: 1500 }); break;
        case 'land': if (hear) a.land(0.25); break;
        case 'point': this.onPoint(c, sim, kids, G, mine, e, talk); break;
        // ---- rope jumping
        case 'ground': tone(150, { dur: 0.05, vol: 0.05, rev: 0 }); for (const p of sim.players) if (p.role === 'turn') this.pose(p.id, 'turn', c, kids, false); break;
        case 'jump': this.pose(e.who, 'jump', c, kids, !!e.human); noise({ dur: 0.08, vol: 0.04, freq: 1600, sweep: 0.5 }); break;
        case 'count':
          if (id === 'rope') {
            tone(520 + Math.min(12, e.n) * 22, { type: 'triangle', dur: 0.09, vol: mine ? 0.09 : 0.04, rev: 0.1 });
            if (mine) { this.showBoard(c, sim, id); if (e.n >= 3 && talk) { const t = sim.players.find(p => p.role === 'turn'); if (t && (e.n % 5 === 0 || e.n < 10)) this.shout(c, by(t.id), tx('{n}!', { n: e.n }), 1.1); } }
            if (mine && [8, 16, 30].includes(e.n)) { d.audio.star?.(); this.hint(tx('{n} in a row!', { n: e.n }), 1.3, 'good'); }
          } else if (id === 'sack') { tone(300 + e.n * -50 + 300, { type: 'triangle', dur: 0.12, vol: 0.08 }); this.hint(String(e.n), 0.8, 'good'); }
          break;
        case 'trip':
          if (hear) a.miss();
          if (mine && e.human) this.hint(tx('Tripped! Streak {n}', { n: e.streak }), 1.2, 'bad');
          if (talk) this.shoutAny(c, kids.filter(k => k.p.id !== e.who), pick(SAY.tripped), 1.8);
          this.showBoard(c, sim, id);
          break;
        case 'go':
          if (id === 'sack' || id === 'tug') { tone(660, { type: 'triangle', dur: 0.25, vol: 0.1 }); this.hint(tx('Go!'), 0.8, 'good'); }
          break;
        // ---- tug of war
        case 'beat': tone(220, { dur: 0.1, vol: mine ? 0.08 : 0.04, rev: 0.1 }); if (talk) { const t = sim.players.find(p => !p.human); if (t) this.shout(c, by(t.id), pick(SAY.heave), 0.9); } break;
        case 'pull': this.pose(e.who, 'pull', c, kids, false); break;
        case 'heave':
          this.poses.start(this.mikaBody(), 'pull');
          tone(e.quality === 'perfect' ? 520 : e.quality === 'good' ? 420 : 200, { type: 'triangle', dur: 0.12, vol: 0.09 });
          this.hint(e.quality === 'perfect' ? tx('Perfect heave!') : e.quality === 'good' ? tx('Good heave') : tx('Off the beat'), 0.7, e.quality === 'off' ? 'bad' : 'good');
          break;
        // ---- sack race
        case 'hop': this.pose(e.who, 'hop', c, kids, !!e.human); tone(200 + (e.rhythm || 0) * 120, { type: 'triangle', dur: 0.05, vol: e.human ? 0.07 : 0.03, rev: 0.05 }); break;
        case 'wobble': if (e.human) { this.hint(tx('Wobbling! Slow down'), 0.9, 'bad'); a.bad(); } break;
        case 'fall': if (hear) a.plop?.(0.6); if (talk && it) this.shout(c, it, pick(SAY.fell), 1.8); if (e.human) this.hint(tx('You tumbled! Get up and go'), 1.2, 'bad'); break;
        case 'finish': if (hear) a.chime?.(e.place); if (e.human) this.hint(tx('You finished!'), 1.2, 'good'); break;
        // ---- marbles
        case 'charge': tone(300, { type: 'triangle', dur: 0.08, vol: 0.06 }); break;
        case 'shoot': this.pose(e.who, 'flick', c, kids, !!e.human); tone(380, { type: 'triangle', dur: 0.1, vol: 0.1 }); noise({ dur: 0.08, vol: 0.06, freq: 2400 }); break;
        case 'click': tone(1200 + Math.random() * 600, { type: 'triangle', dur: 0.04, vol: 0.05 * (0.5 + e.strength), rev: 0 }); break;
        case 'out':
          if (hear) a.pickup?.();
          if (e.human) this.hint(tx('Marble out! It is yours'), 1.2, 'good');
          if (talk && !e.human && it) this.shout(c, it, pick(SAY.flick), 1.6);
          this.showBoard(c, sim, id);
          break;
        case 'shotdone': if (e.got === 0 && talk && it && !it.p.human) this.shout(c, it, pick(SAY.soft), 1.4); break;
        // ---- oan quan
        case 'sow': this.pose(e.who, 'sow', c, kids, !!e.human); break;
        case 'pick': tone(330, { type: 'triangle', dur: 0.06, vol: 0.06 }); break;
        case 'drop': tone(700 + Math.random() * 120, { type: 'triangle', dur: 0.035, vol: 0.05, rev: 0 }); noise({ dur: 0.02, vol: 0.03, freq: 3000 }); break;
        case 'take': if (hear) a.chime?.(2); if (talk && it && !e.human) this.shout(c, it, pick(SAY.take), 1.6); if (e.human) this.hint(e.quan ? tx('You captured a quan!') : tx('You captured {n}', { n: e.dan }), 1.4, 'good'); break;
        case 'refill': if (e.human) this.hint(e.borrowed ? tx('Your side is empty: you borrow {n}', { n: e.borrowed }) : tx('Your side is empty: you refill it'), 1.8); break;
        case 'done': this.showBoard(c, sim, id); break;
        case 'select': tone(520, { type: 'triangle', dur: 0.05, vol: 0.06 }); break;
        case 'refuse': a.bad?.(); break;
        case 'up': break;
        default: break;
      }
    }
    sim.events.length = 0;
  }

  onPoint(c, sim, kids, G, mine, e, talk) {
    const d = this.d, id = G.id;
    this.showBoard(c, sim, id);
    for (const it of c.seated.keys()) { this.cheer(it); if (talk && Math.random() < 0.3) this.shout(c, it, pick(SAY.watch), 1.8); }
    if (id === 'keepup') {
      if (mine && e.human) { d.audio.miss(); this.hint(e.lives > 0 ? tx('Dropped it! Lives left: {n}', { n: e.lives }) : tx('Dropped it!'), 1.6, 'bad'); }
      else if (talk && (mine || Math.random() < 0.4)) this.shout(c, kids.find(k => k.p.id === e.who), pick(SAY.drop), 1.8);
      return;
    }
    if (id === 'tug') {
      const win = e.team === 0;
      if (mine) { (win ? d.audio.good() : d.audio.miss()); this.hint(win ? tx('You pulled the flag over the line!') : tx('They pulled the flag over'), 1.6, win ? 'good' : 'bad'); }
      for (const it of kids) this.cheer(it);
      if (talk) this.shoutAny(c, kids, pick(win ? SAY.tugWin : SAY.tugLose), 2.2);
      return;
    }
    const scorers = sim.players.filter(p => p.team === e.team && !p.human).map(p => kids.find(k => k.p.id === p.id)).filter(Boolean);
    const losers = sim.players.filter(p => p.team !== e.team && !p.human).map(p => kids.find(k => k.p.id === p.id)).filter(Boolean);
    for (const it of scorers) this.cheer(it);
    if (mine) {
      if (e.team === 0) { d.audio.good(); this.hint(e.why === 'streak' ? tx('Three in a row: a point!') : tx('Point for Mika!'), 1.5, 'good'); } else { d.audio.miss(); this.hint(sim.wall ? tx('Point for the kick-board') : tx('Point for the kids'), 1.5, 'bad'); }
    }
    if (!talk) return;
    if (e.why === 'net' || e.why === 'out') this.shoutAny(c, losers, pick(SAY[e.why]));
    else if (mine && e.team === 0) this.shoutAny(c, scorers.length ? scorers : losers, pick(scorers.length ? SAY.ours : SAY.aww));
    else if (scorers.length && (mine || Math.random() < 0.5)) {
      const it = pick(scorers), own = SAY[KID_STYLE[it.p.id]];
      this.shout(c, it, mine ? pick(Math.random() < 0.5 && own ? own : SAY.theirs) : pick(own || SAY.own));
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

  setHud(sim, names) {
    const h = this.el.hud, o = sim.hud ? sim.hud(names) : { l: '', big: '', r: '', sub: '' };
    if (h._kl !== o.l) { h._kl = o.l; h._l.textContent = o.l; }
    if (h._kb !== o.big) { h._kb = o.big; h._big.textContent = o.big; }
    if (h._kr !== o.r) { h._kr = o.r; h._r.textContent = o.r; }
    if (h._ks !== (o.sub || '')) { h._ks = o.sub || ''; h._sub.textContent = o.sub || ''; }
  }

  toggleCam() {
    this.cam = this.cam === 'side' ? 'end' : 'side';
    try { localStorage.setItem(CAM_KEY, this.cam); } catch { /* no storage */ }
    if (this.round?.sim) this.frame(this.round);
    this.labelCam();
  }
  labelCam() { if (this.el) this.el.cam.textContent = this.cam === 'side' ? tx('Behind view') : tx('Side view'); }

  // ------------------------------------------------------------------ the camera
  /**
   * A camera that fits `focus` (stage space: centre u, v and the extents w, l) on this screen: behind the near side ('end') or
   * from the side ('side', on the -u side). Returns { pos, look, fov, yaw } (yaw: the heading, which the stick is read against).
   */
  cameraFor(S, focus, mode = 'end', y0 = this.ground(S.x, S.z)) {
    const portrait = innerHeight > innerWidth * 1.15, th = (S.rot || 0) * Math.PI / 180;
    const cam = this.tmpCam, fov = portrait ? 66 : 50;
    const pitch = (focus.pitch ? focus.pitch + (portrait ? 6 : 0) : mode === 'side' ? (portrait ? 50 : 24) : portrait ? 56 : 27) * Math.PI / 180;
    cam.fov = fov; cam.aspect = innerWidth / innerHeight; cam.near = 1; cam.far = 500; cam.updateProjectionMatrix();
    const c = toWorld(focus.u, focus.v, {}, S), look = new THREE.Vector3(c.x, y0 + 0.6, c.z), pos = new THREE.Vector3();
    const dir = mode === 'side' ? [Math.cos(th), Math.sin(th)] : [Math.sin(th), -Math.cos(th)];
    const top = portrait ? 0.74 : 0.6, bottom = portrait ? -0.56 : -0.86, side = 0.9;
    const pts = [];
    for (const su of [-1, 1]) for (const sv of [-1, 1]) pts.push([focus.u + su * focus.w / 2, 0, focus.v + sv * focus.l / 2]);
    pts.push([focus.u, 2.4, focus.v - focus.l / 2], [focus.u, 2.4, focus.v + focus.l / 2], [focus.u - focus.w / 2, 1.5, focus.v], [focus.u + focus.w / 2, 1.5, focus.v]);
    for (let dist = 6; dist <= 48; dist += 0.5) {
      pos.set(look.x + dir[0] * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + dir[1] * Math.cos(pitch) * dist);
      cam.position.copy(pos); cam.lookAt(look); cam.updateMatrixWorld(true);
      let ok = true;
      for (const [u, y, v] of pts) {
        const w = toWorld(u, v, W2, S);
        V.set(w.x, y0 + y, w.z).project(cam);
        if (Math.abs(V.x) > side || V.y > top || V.y < bottom) { ok = false; break; }
      }
      if (ok) break;
    }
    return { pos, look, fov, yaw: Math.atan2(-dir[0], -dir[1]) };
  }

  /** Put the round's camera where it belongs (also when the player changes the view). */
  frame(R) {
    const follow = this.g.follow, shot = this.cameraFor(R.S, R.G.focus, R.G.sideOk ? this.cam : 'end', R.y0);
    follow.fovBase = shot.fov;
    follow.cutscene({ pos: shot.pos, look: shot.look }, R.fresh ? 0.01 : 0.5);
    follow.yaw = shot.yaw;
    R.yaw = shot.yaw;
    R.aspect = innerWidth / innerHeight;
    R.fresh = false;
  }

  /** The stick in stage space: +u right, +v toward the near side, for a camera heading `yaw` and a stage S. */
  stick(S, yaw, out) {
    const inp = this.g.input, mx = inp.move.x, my = inp.move.y, th = (S.rot || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    out.mx = -dx * c - dz * s;
    out.mv = dx * s - dz * c;
    return out;
  }

  // ------------------------------------------------------------------ pointer (marbles aim, oan quan squares)
  onPointer(e) {
    const R = this.round;
    if (!R?.sim || (R.G.look !== 'board' && R.G.look !== 'marbles') || !this.el.card.classList.contains('hidden')) return;
    const canvas = this.g.renderer.renderer.domElement, r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.g.camera);
    this.plane.constant = -(R.y0 + 0.03);
    if (!this.ray.ray.intersectPlane(this.plane, V)) return;
    const cc = toCourt(V.x, V.z, C2, R.S);
    if (R.G.look === 'marbles') this.pad.aim = { u: cc.u, v: cc.v };
    else { const sq = squareAt(cc.u, cc.v); if (sq !== null) this.pad.pick = sq; }
  }

  // ------------------------------------------------------------------ Mika's round
  /** The village kids who can play right now: those at the yard first, then whoever is out of doors, nearest first. */
  callKids(c) {
    const town = this.d.town, out = [];
    if (!town || this.d.townFrozen?.()) return out;
    for (const id of c.Y.kids) {
      const it = town.byId.get(id);
      if (!it || !it.n.visible || it.n.riding) continue;
      out.push(it);
    }
    const at = it => (c.here.includes(it) || c.amb?.kids.includes(it) ? 0 : 1000) + Math.hypot(it.n.pos.x - c.Y.x, it.n.pos.z - c.Y.z);
    return out.sort((a, b) => at(a) - at(b));
  }

  async play(c = this.nearest(40)) {
    const d = this.d, g = this.g;
    if (!c || this.round || d.busy || d.minigame || d.tricks?.round || !this.ready()) return null;
    const id = this.current(c), G = YARD_GAME[id];
    if (!G) return null;
    this.round = { id, starting: true };
    d.ui.prompt(null);
    g.input.releaseAll?.();
    const follow = g.follow, keep = { yaw: follow.yaw, fov: follow.fovBase };
    let result = null;
    try {
      this.locks = true;
      g.player.vel.set(0, 0, 0);
      g.player.carry?.want('worn', 'yard');         // hands free: the lantern rides on her belt
      await d.ui.fade(true, 280);
      let again = true, first = true;
      while (again) {
        const st = this.save, level = levelFor(st[id], g.easy);
        const res = await this.runRound(c, G, level, first);
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
      this.endRound(c, keep);
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
  async runRound(c, G, level, first) {
    const d = this.d, g = this.g, p = g.player, id = G.id, town = d.town, Y = c.Y;
    const S = stageOf(Y, id), y0 = this.ground(S.x, S.z);
    // ---- who plays where
    const kids = this.callKids(c);
    const T = G.teams(kids);
    const playing = [...T.mine, ...T.theirs, ...(T.turn || []).filter(k => !T.theirs.includes(k))], watching = kids.filter(k => !playing.includes(k));
    this.endAmbient(c);
    for (const it of c.held) it.yardHold = false;
    c.held = kids.slice();
    for (const it of kids) {
      it.yardHold = true;
      it.yPath = null;
      it.wasHere = c.here.includes(it) || !!it.game;
      town.setProp(it, null);
      it.n.path = null; it.n.onPathDone = null; it.n.sitting = false;
      it.n.anim?.cancelOneShot?.();
    }
    for (const it of [...c.seated.keys()]) this.unseat(c, it);
    for (const it of watching) this.seat(c, it);
    const players = [{ id: 'mika', team: 0, human: true }];
    for (const it of T.mine) players.push({ id: it.p.id, team: 0, style: KID_STYLE[it.p.id] });
    for (const it of T.theirs) players.push({ id: it.p.id, team: 1, style: KID_STYLE[it.p.id] });
    for (const it of T.turn || []) if (!players.some(q => q.id === it.p.id)) players.push({ id: it.p.id, team: 0, style: KID_STYLE[it.p.id] });
    const sim = G.create({ seed: this.debug.seed ?? Math.floor(Math.random() * 1e9), players, level, target: G.target(level), wall: !!T.wall });
    sim.touchUi = d.ui.touch;
    // nothing is left over from the last round: a pad button held when it ended, a queued sow, the gamepad's half-made flick
    this.gpHold = false; this.stickDir = 0;
    this.pad.dir = 0; this.pad.hint = false; this.pad.hold = false; this.pad.aim = null; this.pad.pick = null;
    const view = this.views.get(G.look, Y.id);
    view?.attach(S, y0);
    const R = this.round = { id, G, sim, S, y0, kids: playing, level, fresh: true, c, yaw: 0 };
    const human = sim.human;
    // ---- places (under the fade)
    const hw = toWorld(human.u, human.v, W1, S);
    p.teleport(hw.x, hw.z, undefined, 0);
    const bodies = sim.players.map(pl => (pl.human ? null : playing.find(k => k.p.id === pl.id) || null));
    for (const it of kids) { const e = enterPoint(Y, it.n.pos.x, it.n.pos.z); if (e && (G.look === 'shuttle' || G.look === 'ball')) it.n.place(e[0], e[1], it.n.facing); }
    sim.players.forEach((pl, i) => { const it = bodies[i]; if (it) { const w = toWorld(pl.u, pl.v, W1, S); it.n.place(w.x, w.z, pl.team === 0 ? 0 : Math.PI); it.n.setIdle('Idle'); it.n.anim?.play('Idle'); } });
    // ---- camera and HUD
    this.frame(R);
    this.labelCam();
    const names = {
      mine: T.mine.length ? `${tx('Mika')} & ${tx(T.mine[0].p.name)}` : tx('Mika'),
      theirs: T.wall ? tx('Kick-board') : (T.theirs.length ? T.theirs : T.turn || []).map(k => tx(k.p.name)).join(' & '),
    };
    R.names = names;
    this.setHud(sim, names);
    this.showBoard(c, sim, id);
    this.showPad(G.look);
    this.el.hud.classList.remove('hidden');
    this.el.stop.classList.remove('hidden');
    this.el.cam.classList.toggle('hidden', !G.sideOk);
    this.el.stop.innerHTML = `${tx('Stop playing')}<kbd>⌫</kbd>`;
    document.body.classList.add('trick-round', 'yard-round');
    this.hintLeft = 0; this.el.hint.classList.add('hidden');
    await d.ui.fade(false, 280);
    this.locks = !G.moves;
    if (first && playing.length && SAY[id]) this.shoutAny(c, playing, pick(SAY[id]), 2.6);
    else if (first && playing.length) this.shoutAny(c, playing, pick(SAY.join), 2.6);
    let lastHint = '';
    // ---- the game
    const out = await this.loop(dt => {
      if (Math.abs(innerWidth / innerHeight - R.aspect) > 0.02) this.frame(R);          // a phone turned on its side: the court is framed again
      const inp = g.input, th = R.yaw;
      // Mika's stick in stage space (the camera may stand behind or beside)
      this.stick(S, th, INP);
      INP.kick = inp.pressed('act') || (G.look !== 'board' && G.look !== 'marbles' && inp.pressed('tap'));
      INP.jump = inp.pressed('jump');
      INP.hold = inp.held('act') || this.pad.hold;
      // a gamepad has no held "act": for the flick, one press starts the charge and the next lets it go
      if (G.look === 'marbles' && inp.lastDevice === 'gamepad') { if (inp.pressed('act')) this.gpHold = !this.gpHold; INP.hold = this.gpHold; } else this.gpHold = false;
      INP.aimU = this.pad.aim ? this.pad.aim.u : null; INP.aimV = this.pad.aim ? this.pad.aim.v : null; this.pad.aim = null;
      INP.pick = null; INP.dir = 0; INP.hint = false;
      if (G.look === 'board') this.boardKeys(sim, inp, INP);
      if (G.moves) {
        // keep her on her half of the court
        const cc = toCourt(p.pos.x, p.pos.z, C1, S);
        const cu = clamp(cc.u, -COURT.W / 2 - 0.8, COURT.W / 2 + 0.8), cv = clamp(cc.v, 0.45, COURT.HALF + 1.2);
        if (cu !== cc.u || cv !== cc.v) { const w = toWorld(cu, cv, W1, S); p.pos.x = w.x; p.pos.z = w.z; }
      }
      const A = this.debug.auto;
      if (A) {
        const arg = QA[A]?.[id], b = G.bot(sim, arg === undefined ? 0.12 : arg);
        if (G.moves) {
          toCourt(p.pos.x, p.pos.z, C1, S);
          const w = toWorld(C1.u + (b.mx || 0) * 4.4 * dt, C1.v + (b.mv || 0) * 4.4 * dt, W1, S);
          p.pos.x = w.x; p.pos.z = w.z; p.vel.x = 0; p.vel.z = 0;
          INP.mx = b.mx || 0; INP.mv = b.mv || 0;
        }
        INP.kick = !!b.kick; INP.hold = !!b.hold || INP.hold;
        if (b.aimU !== undefined) { INP.aimU = b.aimU; INP.aimV = b.aimV; }
        if (b.pick !== undefined) INP.pick = b.pick;
        if (b.dir) INP.dir = b.dir;
      }
      if (G.moves) toCourt(p.pos.x, p.pos.z, C1, S);
      else { C1.u = human.u; C1.v = human.v; }
      sim.step(Math.min(dt, 0.05), INP);
      // the hint under the HUD: what to press now
      const h = sim.hint ? sim.hint() : null, hs = h || '';
      if (hs !== lastHint) { lastHint = hs; if (hs) this.hint(hs, 60); else if (this.hintLeft > 50) this.hint('', 0.01); }
      if (G.moves) for (let i = 0; i < bodies.length; i++) { if (bodies[i]) this.drive(c, bodies[i], sim.players[i], sim, dt, G, S); }
      else {
        for (let i = 0; i < bodies.length; i++) if (bodies[i]) this.drive(c, bodies[i], sim.players[i], sim, dt, G, S);
        this.driveMika(sim, human, S, G, dt);
      }
      if (G.moves && p.speed < 0.4) { const t = (S.rot || 0) * Math.PI / 180; p.turnTo(Math.atan2(-Math.sin(t), Math.cos(t)), dt, 8); }      // she faces the net when she stands still
      this.present(view, sim, dt, true, S, y0);
      this.events(c, sim, playing, G, true, S);
      this.setHud(sim, names);
      this.padSync(sim);
      if (sim.over) return sim.over;
      return undefined;
    });
    // ---- the end of it
    this.views.hideAll(Y.id);
    this.ring.visible = this.ringOut.visible = false;
    this.el.hud.classList.add('hidden');
    this.el.stop.classList.add('hidden');
    this.el.cam.classList.add('hidden');
    this.el.pad.classList.add('hidden'); document.body.classList.remove('yard-pad');
    this.el.hint.classList.add('hidden'); this.hintLeft = 0;
    if (!out || out.quit) return { quit: true };
    this.locks = true;
    p.vel.set(0, 0, 0);
    const won = out.stars > 0;
    for (const it of playing) this.cheer(it);
    for (const it of c.seated.keys()) this.cheer(it);
    if (won) { p.anim?.once?.('Cheer', { then: 'Idle' }); d.audio.fanfare?.(); }
    if (playing.length && (id === 'footnet' || id === 'volley' || id === 'tug')) this.shoutAny(c, playing, pick(id === 'tug' ? (out.won ? SAY.tugLose : SAY.tugWin) : out.won ? SAY.win : SAY.lose), 3.2);
    else if (playing.length && id === 'sack' && out.place === 1) this.shoutAny(c, playing, pick(SAY.sackWin), 3);
    await this.wait(1.5);
    return out;
  }

  /** Mika's body in a game where she does not walk about: put her at her place, facing the game, hopping when the sim says so. */
  driveMika(sim, human, S, G, dt) {
    const p = this.g.player, w = toWorld(human.u, human.v, W1, S);
    p.pos.x = w.x; p.pos.z = w.z; p.vel.set(0, 0, 0);
    const gy = this.ground(w.x, w.z);
    p.pos.y = gy;
    p.root.position.set(w.x, gy + (human.y || 0), w.z);
    const l = this.lookAt(G, human.team === 0 && G.id === 'rope' ? { ...human, role: 'jump' } : human, sim, S);
    if (l) p.turnTo(Math.atan2(l.x - w.x, l.z - w.z), dt, 10);
    p.root.rotation.y = p.facing;
    if (G.id === 'sack' && p.pivot) p.pivot.rotation.x = (human.lean || 0) * 0.3;
    else if (p.pivot && !this.poses.busy(this.mikaBody())) p.pivot.rotation.x = 0;
    if (G.id === 'oanquan' || G.id === 'marbles') p.anim?.play?.('Idle');
  }

  /** Keyboard play of the oan quan board: left / right moves along her squares, E sows counter-clockwise (right), Space the other way, W asks for a hint. */
  boardKeys(sim, inp, out) {
    if (sim.state !== 'think' || !sim.cur.human) { this.pad.pick = null; this.pad.dir = 0; this.pad.hint = false; return; }     // (a tap in the kid's turn must not wait and sow later)
    const mine = [1, 2, 3, 4, 5].filter(i => sim.board.dan[i] > 0);
    if (!mine.length) return;
    // (a gamepad's stick counts as left / right when it is pushed past a threshold, once per push)
    const sx = inp.move.x, sd = sx > 0.6 ? 1 : sx < -0.6 ? -1 : 0, pad = sd !== (this.stickDir || 0) ? sd : 0;
    this.stickDir = sd;
    const step = inp.pressed('right') || pad > 0 ? 1 : inp.pressed('left') || pad < 0 ? -1 : 0;
    if (step) { let i = mine.indexOf(sim.sel); i = i < 0 ? (step > 0 ? 0 : mine.length - 1) : (i + step + mine.length) % mine.length; out.pick = mine[i]; }
    if (inp.pressed('up')) out.hint = true;
    if (sim.sel !== null) { if (inp.pressed('act')) out.dir = 1; else if (inp.pressed('jump')) out.dir = -1; }
    // the pad
    if (this.pad.pick !== null) { out.pick = this.pad.pick; this.pad.pick = null; }
    if (this.pad.dir) { out.dir = this.pad.dir; this.pad.dir = 0; }
    if (this.pad.hint) { out.hint = true; this.pad.hint = false; }
    if (out.dir && sim.sel === null && out.pick === null) out.pick = mine[0];
  }

  padSync(sim) {
    if (!this.el || this.el.pad.classList.contains('hidden')) return;
    const turn = sim.state === 'think' || sim.state === 'aim';
    this.el.pad.style.opacity = turn ? '1' : '0.55';
  }

  /** Give the camera, the kids and the screen back. */
  endRound(c, keep) {
    const g = this.g, town = this.d.town;
    this.views.hideAll(c.Y.id);
    this.ring.visible = this.ringOut.visible = false;
    if (this.el) {
      for (const k of ['hud', 'stop', 'cam', 'hint', 'pad', 'card']) this.el[k].classList.add('hidden');
      document.body.classList.remove('trick-round', 'yard-round', 'yard-pad');
    }
    this.hintLeft = 0;
    g.follow.fovBase = keep.fov;
    g.follow.yaw = keep.yaw;
    g.follow.clearCutscene(true);
    const p = g.player; if (p.pivot) p.pivot.rotation.x = 0;
    for (const it of [...c.seated.keys()]) this.unseat(c, it);
    for (const it of c.held) {
      it.yardHold = false; it.yPath = null;
      it.n.anim?.cancelOneShot?.();
      it.n.setIdle('Idle'); it.n.anim?.play('Idle');
      // kids called over from somewhere else go back to their day (the ones whose plan is the yard just carry on)
      if (!it.wasHere) town?.release(it.p.id);
    }
    c.held = [];
    this.kickT = 9;
    this.showBoard(c);
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
    const card = G.card(res, rec, R.names, newBest);
    el.querySelector('.box').innerHTML = `<h2></h2><div class="verdict"></div>
      <div class="stars">${[0, 1, 2].map(i => `<i style="animation-delay:${0.2 + i * 0.25}s">${i < res.stars ? '★' : '☆'}</i>`).join('')}</div>
      <div class="score"></div><div class="best"></div>
      <div class="fact"><b></b><span class="note"></span></div>
      <div class="btns"><button class="again"></button><button class="main done"></button></div>`;
    const q = s => el.querySelector(s);
    q('h2').textContent = tx(G.name);
    q('.verdict').textContent = card.verdict;
    if (!card.good) q('.verdict').style.color = '#a2441c';
    q('.score').textContent = card.score;
    q('.best').textContent = card.best;
    q('.fact b').textContent = tx('Where it comes from');
    q('.note').textContent = tx(YARD_NOTES[id]);
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
    // the kids' own game at each yard, while Mika is not in one
    const frozen = this.d.townFrozen?.() || this.d.busy > 0 || !!this.d.scenes.active;
    for (const c of Object.values(this.ctl)) {
      if (c.dbg) { for (const it of c.dbg.kids) if (!c.here.includes(it)) c.here.push(it); c.hereGame = c.dbg.game; }
      if (!this.round && !frozen) this.stepAmbient(c, dt);
      c.here.length = 0;
      c.hereGame = null;
    }
    this.poses.update(dt);
    // after dark the balls keep a little glow of their own so they can be followed
    this.views.setNight(g.night || 0);
    g.structures?.yards && Object.values(g.structures.yards).forEach(y => y.setNight(g.night || 0));
  }
}
