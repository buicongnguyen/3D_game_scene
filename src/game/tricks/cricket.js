// Cricket by its song (docs/RURAL-TRICKS.md trick 5): summer and autumn evenings on the hill above Takamori. The screen
// goes to dusk and a cricket sings somewhere in the grass: its song pans to the side it comes from and swells as Mika
// gets near, and a pulse on the edge of the screen shows the same for eyes. Close up it goes quiet when she moves
// ("shh"); stand still and it starts again. Then a three-beat tap on the beat of its song tickles it into the cage.
// Three crickets; the last one is counted for 14 seconds: its chirps tell the temperature (Dolbear's law), and a guess
// earns a bonus. At the end the cage is opened and they all go home.
//
// The rules (the hearing, the hush, the tickle, the count, the score) are pure and Node-tested (./rules-cricket.js);
// the round below only draws and sounds them. Cheap: three pooled bug pictures, a few DOM bits written when they change.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { inHours } from '../../content/tricks.js';
import { placeProblems } from '../../world/roads.js';
import { CRICKET, rng, tempFor, celsius, fahrenheit, thermoTimes, guessOptions, Tickle, Crickets, cricketScore } from './rules-cricket.js';
import { BUG_CSS, Critter, Cage, Release } from './bugkit.js';
import { addCss } from './util.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3();
const PREFER_NIGHT = 21.5;       // the hour of the round's look, unless it is already dark

const CSS = `
#cricketRadar{position:fixed;inset:0;z-index:13;pointer-events:none;overflow:hidden}
#cricketRadar .dot{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;opacity:0;
 background:radial-gradient(circle,#fff6b8 0,#ffe066 35%,rgba(255,200,60,.45) 60%,rgba(255,200,60,0) 72%);box-shadow:0 0 22px 8px rgba(255,224,102,.35)}
#cricketRadar .ring{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(255,236,150,.8);opacity:0}
#cricketTap{position:fixed;left:50%;top:37%;transform:translate(-50%,-50%);z-index:15;width:150px;height:150px;pointer-events:none}
#cricketTap .target{position:absolute;inset:35px;border-radius:50%;border:4px solid #fff3c4;background:rgba(255,243,196,.18);box-shadow:0 0 14px rgba(255,236,150,.6)}
#cricketTap .beat{position:absolute;inset:35px;border-radius:50%;border:4px solid #ffb43a;opacity:.95}
#cricketTap .dots{position:absolute;left:0;right:0;bottom:-6px;display:flex;gap:10px;justify-content:center}
#cricketTap .dots i{width:16px;height:16px;border-radius:50%;background:rgba(255,247,232,.35);border:2px solid #fff3c4}
#cricketTap .dots i.on{background:#ffd23f;border-color:#fff}
#cricketTap.hidden,#cricketThermo.hidden,#cricketRadar .hidden{display:none}
#cricketThermo{position:fixed;left:50%;top:calc(150px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;width:min(320px,88vw);padding:12px 14px 12px;
 border-radius:18px;background:rgba(255,247,232,.95);box-shadow:0 6px 20px rgba(40,20,0,.28);font:700 15px Nunito,system-ui,sans-serif;color:#5a3a22;text-align:center;zoom:var(--ui-scale,1)}
#cricketThermo h3{margin:0 0 4px;font:600 18px Fredoka,Nunito,sans-serif;color:#7a3e16}
#cricketThermo .n{font:600 44px/1.1 Fredoka,Nunito,sans-serif;color:#c2541c}
#cricketThermo .n.pulse{animation:cricketN .22s}
#cricketThermo .cap{font:700 13px Nunito,sans-serif;color:#7a6a58}
#cricketThermo .bar{height:10px;margin:6px 0 2px;border-radius:5px;background:#ead9b8;overflow:hidden}
#cricketThermo .bar i{display:block;height:100%;width:0;background:#f2b53a}
#cricketThermo .opts{display:flex;gap:8px;justify-content:center;margin-top:8px}
#cricketThermo button{flex:1;padding:10px 4px;border:0;border-radius:12px;font:700 18px Fredoka,Nunito,sans-serif;background:#f4dfb5;color:#5a3a22;cursor:pointer;touch-action:manipulation;pointer-events:auto}
#cricketThermo button.sel{outline:3px solid #f08a3c}
#cricketThermo button.right{background:#9be86a}#cricketThermo button.wrong{background:#f0b08a}
#cricketThermo .skip{margin-top:6px;background:none;font:700 13px Nunito,sans-serif;color:#7a6a58;text-decoration:underline;padding:4px}
@keyframes cricketN{40%{transform:scale(1.18)}}
`;

const plural = (n, one, many) => (n === 1 ? tx(one) : tx(many, { n }));

class CricketRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.world = g.world;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.audio = ctx.audio;
    this.seed = seed;
    this.rand = rng(seed);
    this.season = g.shownSeason || g.time?.season || 'summer';
    this.temp = tempFor(seed, this.season);
    const grid = g.world.grid;
    this.crickets = new Crickets({ rand: this.rand, centre: ctx.place, temp: this.temp, first: !!ctx.first, ok: (x, z) => !placeProblems(x, z, grid).length });
    this.phase = 'hunt';
    this.t = 0;
    this.left = ctx.roundTime;
    this.tickle = null;
    this.cue = 0;
    this.pl = { x: 0, z: 0, speed: 0 };
    this.said = {};
    this.flash = 0;
    this.rx = this.ry = 0;
    this.shown = { dots: -1, lab: '', prox: -1, n: -1, tap: '' };
    this.carry = null;
    this.guessed = false;
    this.guess = null;
    this.thermo = null;
    this.release = null;
    this.own = [];
    this.keyOff = null;
  }

  get active() { return this.crickets.active; }

  build() {
    const g = this.g, ctx = this.ctx, assets = g.assets;
    addCss('bugCss', BUG_CSS);
    addCss('cricketCss', CSS);
    // three pictures, one for each cricket (the hunted one shows only when it is revealed)
    this.pics = this.crickets.list.map(() => { const c = new Critter(assets, 'cricket'); this.scene.add(c.root); return c; });
    this.cage = new Cage(assets, this.player);
    const el = this.el = document.createElement('div');
    el.className = 'bugBox';
    el.innerHTML = '<div class="row"></div><div class="lab"></div><div class="bar"><i></i></div>';
    document.body.appendChild(el);
    const row = el.querySelector('.row');
    this.dotEls = this.crickets.list.map(() => { const s = document.createElement('span'); s.className = 'cnt'; s.innerHTML = `<img alt="" src="${ctx.ui.icon('cricket')}"><span class="alt"></span>`; s.querySelector('.alt').textContent = tx('Cricket'); const im = s.querySelector('img'); im.onerror = () => { s.classList.add('noimg'); im.remove(); }; s.style.opacity = '0.35'; row.appendChild(s); return s; });
    this.q = { lab: el.querySelector('.lab'), fill: el.querySelector('.bar i') };
    // the edge pulse that shows where the song comes from
    const rd = this.rd = document.createElement('div');
    rd.id = 'cricketRadar';
    rd.innerHTML = '<div class="ring hidden"></div><div class="dot hidden"></div>';
    document.body.appendChild(rd);
    this.dot = rd.querySelector('.dot'); this.rring = rd.querySelector('.ring');
    // the beat to tap on, and the thermometer
    const tp = this.tapEl = document.createElement('div');
    tp.id = 'cricketTap';
    tp.className = 'hidden';
    tp.innerHTML = '<div class="target"></div><div class="beat"></div><div class="dots"><i></i><i></i><i></i></div>';
    document.body.appendChild(tp);
    this.beatEl = tp.querySelector('.beat'); this.beatDots = [...tp.querySelectorAll('.dots i')];
    const th = this.thEl = document.createElement('div');
    th.id = 'cricketThermo';
    th.className = 'hidden';
    th.innerHTML = '<h3></h3><div class="n">0</div><div class="cap"></div><div class="bar"><i></i></div><div class="opts"></div><button class="skip"></button>';
    document.body.appendChild(th);
    this.th = { h: th.querySelector('h3'), n: th.querySelector('.n'), cap: th.querySelector('.cap'), fill: th.querySelector('.bar i'), opts: th.querySelector('.opts'), skip: th.querySelector('.skip') };
    this.th.skip.textContent = tx('Skip');
    this.th.skip.hidden = true;
    ctx.debug.view = () => this.view();
    ctx.debug.round = this;
    this.setLab(tx('Follow the song'));
    // ambient crickets keep quiet (and out of sight) while one is being listened for
    const crit = ctx.director.wildlife?.critters;
    if (crit) { crit.quiet = true; (crit.hidden ??= new Set()).add('cricket'); this.crit = crit; }
  }

  setLab(text) { if (text !== this.shown.lab) { this.shown.lab = text; this.q.lab.textContent = text; } }

  // ---------------------------------------------------------------- hunting
  update(dt) {
    this.t += dt;
    const p = this.player, pl = this.pl, ph = this.phase;
    pl.x = p.pos.x; pl.z = p.pos.z; pl.speed = p.speed;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (ph === 'hunt') {
      this.left -= dt;
      this.crickets.update(dt, pl, this.g.follow.yaw);
      this.hunt();
    } else if (ph === 'tickle') this.doTickle(dt);
    else if (ph === 'carry') this.doCarry(dt);
    else if (ph === 'thermo') this.doThermo(dt);
    else if (ph === 'guess') this.doGuess(dt);
    this.draw(dt);
    for (const c of this.pics) c.update(dt);
    this.hud();
  }

  hunt() {
    const ev = this.crickets.events, ctx = this.ctx, a = this.audio;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.kind === 'chirp') {
        a?.chirpAt?.(e.vol, e.pitch, e.pan, e.pulses);
        this.flash = 1;
        this.rel = e.rel; this.dist = e.d; this.heardAt = this.t;
        if (!this.said.heard && ctx.first) { this.said.heard = 1; ctx.hint(N_('Listen! Turn toward the song and walk. It gets louder as you get close.'), 6); }
      } else if (e.kind === 'hush') {
        this.heardAt = -9;
        if (!this.said.hush) { this.said.hush = 1; ctx.hint(N_('Shh! It heard you. Stand perfectly still and it will start again.'), 5); }
      } else if (e.kind === 'resume') {
        a?.chirpAt?.(1, e.c.pitch, 0, e.c.pulses);
        this.flash = 1; this.rel = 0; this.dist = e.d; this.heardAt = this.t;
        if (!this.said.close) { this.said.close = 1; ctx.hint(N_('It is right here. Take a tiny step closer, then stand still again.'), 4.5); }
      } else if (e.kind === 'reveal') this.startTickle(e.c);
    }
    ev.length = 0;
    const c = this.active;
    if (!c || this.phase !== 'hunt') return;
    const d = this.crickets.heard.d, near = d < CRICKET.near;
    this.setLab(c.st === 'hush' ? tx('Stand still…') : near ? tx('It is very close. Shh!') : tx('Follow the song'));
  }

  startTickle(c) {
    const ctx = this.ctx, p = this.player, g = this.g;
    this.phase = 'tickle';
    this.tickle = new Tickle(c.beat, this.crickets.windowFor(c));
    this.tickle.start();
    this.cue = 0;
    ctx.lock(true);
    // she turns to it and kneels over it; the camera comes down to the grass
    p.turnTo?.(Math.atan2(c.x - p.pos.x, c.z - p.pos.z), 1, 50);
    const pic = this.pics[c.i], gy = this.world.heightAt(c.x, c.z);
    pic.root.position.set(c.x, gy + 0.04, c.z);
    pic.root.rotation.y = Math.atan2(p.pos.x - c.x, p.pos.z - c.z) + Math.PI;
    pic.root.scale.setScalar(1);
    pic.root.visible = true;
    pic.pose('idle', true);
    // the camera stands off to one side of the two of them, low, so Mika is at the edge of the picture and the cricket in the middle
    const f = Math.atan2(c.x - p.pos.x, c.z - p.pos.z), side = f + Math.PI / 2, mx = (p.pos.x + c.x) / 2, mz = (p.pos.z + c.z) / 2;
    const cx = mx + Math.sin(side) * 1.5, cz = mz + Math.cos(side) * 1.5;
    g.follow.cutscene({ pos: _v.set(cx, Math.max(gy + 1.0, this.world.heightAt(cx, cz) + 1.05), cz).clone(), look: _w.set(c.x, gy + 0.4, c.z).clone() }, 0.6);   // (looking a little above it puts the cricket under the beat ring)
    this.tapEl.classList.remove('hidden');
    this.beatDots.forEach(d => d.classList.remove('on'));
    this.setLab(tx('Tap with the beat'));
    ctx.hint(ctx.first ? (this.touch ? N_('Three taps on its beat: tap {act} when the orange ring reaches the circle. Gently!') : N_('Three taps on its beat: press {act} or Space when the orange ring reaches the circle. Gently!')) : N_('Tap with its beat, three times.'), 5);
    this.audio?.chime?.(1);
  }

  doTickle(dt) {
    const k = this.tickle, c = this.active, inp = this.g.input, a = this.audio;
    // the song, as a count-in and then the beat itself: two beats before the first tap, then one on each
    const b = k.beat;
    while (this.cue < 5 && k.t >= CRICKET.lead + (this.cue - 2) * b) {
      a?.chirpAt?.(1, c.pitch, 0, c.pulses);
      this.pics[c.i].pose('chirp', true);
      this.flash = 1;
      this.cue++;
    }
    const tapped = inp.pressed('act') || inp.pressed('tap') || inp.pressed('jump') || inp.pressed('click');
    const r = k.update(dt, tapped);
    if (r) {
      if (r === 'rough') {
        a?.bad?.();
        this.ctx.hint(N_('Too rough! It hopped away. Tap softly, right on the beat.'), 4);
        this.endTickle();
        this.crickets.flee(this.pl);
        this.pics[c.i].root.visible = false;
        this.phase = 'hunt';
      } else {
        a?.[r === 'perfect' ? 'good' : 'blip']?.(r === 'perfect' ? undefined : 1.4);
        this.player.gesture?.('Interact', { lock: false });
        if (k.n <= this.beatDots.length) this.beatDots[k.n - 1]?.classList.add('on');
        if (k.done) { this.finishTickle(k.quality); return; }
      }
    }
    // the ring closes on the circle as the beat comes
    const s = k.done || k.failed ? 1 : 1 + Math.max(0, Math.min(1.8, k.toBeat)) * 1.15;
    const txt = s.toFixed(2);
    if (txt !== this.shown.tap) { this.shown.tap = txt; this.beatEl.style.transform = `scale(${txt})`; this.beatEl.style.opacity = k.toBeat > 1.9 ? 0 : 0.95; }
  }

  endTickle() {
    this.tapEl.classList.add('hidden');
    this.ctx.lock(false);
    this.g.follow.clearCutscene(false);
    this.tickle = null;
  }

  /** Three good taps: it hops into the cage. */
  finishTickle(q) {
    const c = this.active, pic = this.pics[c.i];
    this.endTickle();
    this.crickets.catchIt(q);
    this.crickets.events.length = 0;
    this.audio?.pickup?.();
    this.ctx.fx?.burst?.(_v.set(c.x, this.world.heightAt(c.x, c.z) + 0.3, c.z), { n: 12, color: [1, 0.9, 0.45], speed: 1.1, size: 0.1, gravity: 0.5 });
    this.carry = { c, pic, t: 0, from: pic.root.position.clone() };
    pic.pose('crouch', true);
    this.phase = 'carry';
  }

  doCarry(dt) {
    const k = this.carry, r = k.pic.root;
    k.t += dt;
    if (k.t < 0.3) return;                                   // the crouch
    const u = Math.min(1, (k.t - 0.3) / 0.55), e = u * u * (3 - 2 * u);
    this.cage.holder.getWorldPosition(_v);
    r.position.lerpVectors(k.from, _v, e);
    r.position.y += Math.sin(Math.PI * u) * 0.6;
    r.scale.setScalar(1 - 0.6 * u);
    this.cage.open(Math.sin(Math.PI * u) * 0.5);
    if (u >= 1) {
      this.cage.open(0);
      r.visible = false;
      this.carry = null;
      this.ctx.fx?.glint?.(_v, false);
      if (this.crickets.done) this.startThermo(); else this.phase = 'hunt';
      if (this.phase === 'hunt') this.setLab(tx('Follow the song'));
    }
  }

  // ---------------------------------------------------------------- the thermometer
  startThermo() {
    const ctx = this.ctx, p = this.player, f = p.facing;
    this.phase = 'thermo';
    ctx.lock(true);
    const x = p.pos.x + Math.sin(f + 0.8) * 1.8, z = p.pos.z + Math.cos(f + 0.8) * 1.8;   // beside her, not in front: from the camera she would hide it
    this.cage.stand(this.scene, this.world, x, z, f + Math.PI);
    const last = this.pics[this.pics.length - 1], m = this.cage.mouth(_v);
    last.root.position.copy(m); last.root.scale.setScalar(0.7); last.root.visible = true; last.pose('sing', true);   // it sings on the lid for the whole count
    this.thermo = { t: 0, n: 0, times: thermoTimes(this.crickets.n14), c: this.crickets.list[this.crickets.list.length - 1] };
    this.thEl.classList.remove('hidden');
    this.th.h.textContent = tx('Chirp thermometer');
    this.th.n.textContent = '0';
    this.th.cap.textContent = tx('chirps in 14 seconds');
    this.th.opts.textContent = '';
    this.th.skip.hidden = true;
    this.setLab(tx('Count the chirps'));
    ctx.hint(N_('Count the chirps for 14 seconds. They tell how warm the night is!'), 6);
  }

  doThermo(dt) {
    const T = this.thermo, a = this.audio;
    T.t += dt;
    while (T.n < T.times.length && T.t >= T.times[T.n]) {
      T.n++;
      a?.chirpAt?.(0.9, T.c.pitch, 0, T.c.pulses);
      this.flash = 1;
      this.th.n.textContent = T.n;
      this.th.n.classList.remove('pulse'); void this.th.n.offsetWidth; this.th.n.classList.add('pulse');
    }
    const pct = Math.round(Math.min(1, T.t / CRICKET.thermoSeconds) * 100);
    if (pct !== this.shown.prox) { this.shown.prox = pct; this.th.fill.style.width = `${pct}%`; }
    if (T.t >= CRICKET.thermoSeconds) this.startGuess();
  }

  startGuess() {
    const ctx = this.ctx, n = this.crickets.n14;
    this.phase = 'guess';
    this.guess = { opts: guessOptions(this.temp, this.rand), sel: 1, t: 0, done: false };
    this.th.h.textContent = tx('How warm is the night?');
    this.th.opts.textContent = '';
    this.guess.btns = this.guess.opts.map((v, i) => {
      const b = document.createElement('button');
      b.textContent = `${v} °C`;
      b.onpointerdown = e => { e.preventDefault(); this.answer(i); };
      this.th.opts.appendChild(b);
      return b;
    });
    this.th.skip.hidden = false;
    this.th.skip.onpointerdown = e => { e.preventDefault(); this.answer(-1); };
    this.markSel();
    this.setLab(tx('Make a guess'));
    ctx.hint(this.touch ? tx('{n} chirps in 14 seconds. Add 40 for °F. Tap how warm you think it is!', { n }) : tx('{n} chirps in 14 seconds. Add 40 for °F. Pick how warm you think it is: 1, 2 or 3.', { n }), 9);
    const key = e => {
      if (this.phase !== 'guess' || this.guess.done) return;
      const k = e.key;
      if (k === '1' || k === '2' || k === '3') this.answer(+k - 1);                  // (the arrows, A / D and the stick move along, E / Space / the buttons pick: doGuess)
    };
    addEventListener('keydown', key);
    this.keyOff = () => removeEventListener('keydown', key);
  }

  markSel() { this.guess.btns.forEach((b, i) => b.classList.toggle('sel', i === this.guess.sel)); }

  answer(i) {
    const G = this.guess;
    if (G.done) return;
    G.done = true; G.t = 0;
    G.pick = i;
    const right = i >= 0 && G.opts[i] === this.temp;
    this.guessed = right;
    G.btns.forEach((b, k) => { if (G.opts[k] === this.temp) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
    this.th.skip.hidden = true;
    this.audio?.[right ? 'star' : i < 0 ? 'click' : 'blip']?.();
    this.ctx.hint(right ? N_('Spot on! A cricket is a very good thermometer.') : i < 0 ? N_('Never mind. Now every cricket goes home.') : N_('Close! Now every cricket goes home.'), 3.5);
  }

  doGuess(dt) {
    const G = this.guess, inp = this.g.input;
    G.t += dt;
    if (!G.done) {
      // the stick (or A / D) moves along the three answers, the action or jump button picks: a pad needs no keyboard
      const mx = inp.move?.x || 0;
      if (Math.abs(mx) > 0.55 && !this.stickHeld) { this.stickHeld = true; G.sel = (G.sel + (mx > 0 ? 1 : 2)) % 3; this.markSel(); this.audio?.click?.(); }
      if (Math.abs(mx) < 0.3) this.stickHeld = false;
      if (G.t > 0.4 && (inp.pressed('act') || inp.pressed('jump'))) this.answer(G.sel);
    }
    if (G.done ? G.t > 2.2 : G.t > 22) { if (!G.done) this.answer(-1); else this.finish(); }
  }

  finish() {
    this.keyOff?.();
    this.keyOff = null;
    this.thEl.classList.add('hidden');
    this.phase = 'release';
    this.startRelease();
  }

  // ---------------------------------------------------------------- the release
  startRelease() {
    const ctx = this.ctx, p = this.player;
    ctx.lock(true);
    if (!this.cage.holder.parent || this.cage.onHip) {
      const f = p.facing, x = p.pos.x + Math.sin(f + 0.8) * 1.8, z = p.pos.z + Math.cos(f + 0.8) * 1.8;
      this.cage.stand(this.scene, this.world, x, z, f + Math.PI);
    }
    const items = this.crickets.list.filter(c => c.caught).map(c => ({ critter: this.pics[c.i] }));
    this.release = new Release(this.cage, items, this.world, this.rand);
    p.gesture?.('Interact', { lock: false });
    this.audio?.chime?.(2);
    this.phase = 'release';
  }

  updateRelease(dt) {
    this.t += dt;
    if (!this.release) return true;
    return this.release.update(dt);
  }

  // ---------------------------------------------------------------- the picture
  draw(dt) {
    // the edge pulse: toward the sound, bigger and brighter the nearer it is
    const dot = this.dot, ring = this.rring;
    const show = this.phase === 'hunt' && this.t - (this.heardAt ?? -9) < 1.4 && this.dist !== undefined;
    if (!show && !this.dotOff) { this.dotOff = true; dot.classList.add('hidden'); ring.classList.add('hidden'); }
    if (!show) return;
    if (this.dotOff) { this.dotOff = false; dot.classList.remove('hidden'); ring.classList.remove('hidden'); }
    const w = innerWidth, h = innerHeight, rel = this.rel, prox = Math.max(0, 1 - this.dist / CRICKET.hear);
    const tx_ = w * 0.5 + Math.sin(rel) * w * 0.44, ty = h * 0.52 - Math.cos(rel) * h * 0.34;
    this.rx += (tx_ - this.rx) * Math.min(1, dt * 14); this.ry += (ty - this.ry) * Math.min(1, dt * 14);
    const sc = (0.55 + prox * 1.5) * (1 + this.flash * 0.45), op = Math.min(1, 0.18 + this.flash * 0.85);
    const key = `${Math.round(this.rx)},${Math.round(this.ry)},${sc.toFixed(2)},${op.toFixed(2)}`;
    if (key !== this.shown.dotKey) {
      this.shown.dotKey = key;
      dot.style.transform = `translate(${this.rx.toFixed(0)}px,${this.ry.toFixed(0)}px) scale(${sc.toFixed(2)})`;
      dot.style.opacity = op.toFixed(2);
      ring.style.transform = `translate(${this.rx.toFixed(0)}px,${this.ry.toFixed(0)}px) scale(${(sc * (1.2 + (1 - this.flash) * 1.4)).toFixed(2)})`;
      ring.style.opacity = (this.flash * 0.7).toFixed(2);
    }
  }

  hud() {
    const s = this.shown, n = this.crickets.caught;
    if (n !== s.dots) { s.dots = n; this.dotEls.forEach((e, i) => { e.style.opacity = i < n ? '1' : '0.35'; if (i === n - 1) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } }); }
    const prox = this.phase === 'hunt' && this.active ? Math.round(Math.max(0, 1 - this.crickets.heard.d / CRICKET.hear) * 50) * 2 : -1;
    if (prox !== s.prox2) { s.prox2 = prox; this.q.fill.style.width = prox < 0 ? '0%' : `${prox}%`; this.q.fill.className = prox > 70 ? 'hot' : prox > 40 ? 'mid' : ''; }
  }

  score() { return cricketScore(this.crickets.list, this.guessed); }

  view() {
    const c = this.active, H = this.crickets.heard;
    return {
      phase: this.phase, temp: this.temp, n14: this.crickets.n14, seed: this.seed, caught: this.crickets.caught, score: this.score(), left: this.left,
      active: c ? { i: c.i, x: c.x, z: c.z, st: c.st, d: H.d, rel: H.rel, pan: H.pan, vol: H.vol, fails: c.fails, beat: c.beat } : null,
      tickle: this.tickle ? { t: this.tickle.t, n: this.tickle.n, toBeat: this.tickle.toBeat, beat: this.tickle.beat, failed: this.tickle.failed } : null,
      guess: this.guess ? { opts: this.guess.opts, done: this.guess.done } : null,
      thermo: this.thermo ? { n: this.thermo.n, t: this.thermo.t } : null,
    };
  }

  dispose() {
    this.ctx.lock?.(false);
    this.keyOff?.();
    if (this.crit) { this.crit.quiet = false; this.crit.hidden?.delete('cricket'); }
    this.g.follow.clearCutscene?.(true);
    this.cage?.dispose();
    for (const c of this.pics || []) c.dispose();
    this.el?.remove(); this.rd?.remove(); this.tapEl?.remove(); this.thEl?.remove();
  }
}

export default {
  id: 'cricket',
  async play(ctx) {
    await ctx.ensureModels?.(['bug-cage']);
    if (ctx.quit) return { score: 0, quit: true };
    const g = ctx.game, qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new CricketRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    r.touch = !!ctx.ui?.touch;
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    // dusk for the round, when the hour on screen is not already dark
    const h = g.shownHour ? g.shownHour() : 21;
    const dark = inHours(h, ctx.trick.hours) && (g.night || 0) > 0.6;
    if (!dark) ctx.setNight?.(true, PREFER_NIGHT);
    try {
      r.build();
      ctx.hint(ctx.first
        ? N_('Close your eyes and listen: a cricket is singing. Walk toward the song. When it goes quiet, stand still.')
        : N_('Follow the cricket\'s song. Quiet means stand still.'), 7);
      ctx.hud(0, r.left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        ctx.hud(r.score(), r.phase === 'hunt' || r.phase === 'tickle' ? Math.max(0, r.left) : null);
        if (r.phase === 'hunt' && r.left <= 0) return { done: true };
        if (r.phase === 'release') return { done: true };
        return undefined;
      });
      const C = r.crickets;
      if (!res?.quit) {
        // time ran out in the grass: the ones caught go home from the cage; or the game already opened it
        if (r.phase !== 'release') { r.keyOff?.(); r.thEl.classList.add('hidden'); r.startRelease(); }
        ctx.hint(N_('Off you go, little singers. Goodnight!'), 3.5);
        await ctx.loop(dt => (r.updateRelease(dt) ? true : undefined));
        if (!ctx.quit) await ctx.wait(0.5);
      }
      const n = C.caught, friends = n ? ['cricket'] : [];
      const out = {
        score: r.score(), quit: !!res?.quit, caught: n,
        extra: n ? plural(n, N_('1 cricket'), N_('{n} crickets')) : tx('The song got away'),
        detail: { caught: n, temp: r.temp, n14: C.n14, guessed: r.guessed, friends, seed: r.seed },
      };
      if (r.thermo) {
        const n14 = C.n14, f = fahrenheit(n14), c = Math.round(celsius(n14));
        out.fact = {
          title: tx('Chirp thermometer'),
          text: r.guessed ? tx('{n} chirps in 14 seconds: {n} + 40 = {f} °F, about {c} °C. You guessed it!', { n: n14, f, c })
            : tx('{n} chirps in 14 seconds: {n} + 40 = {f} °F, about {c} °C.', { n: n14, f, c }),
        };
      }
      return out;
    } finally {
      r.dispose();
    }
  },
  ambient() {},
  _Round: CricketRound,
};
