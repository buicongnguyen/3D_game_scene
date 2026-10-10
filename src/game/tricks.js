// Grandma's Countryside Tricks at runtime (docs/RURAL-TRICKS.md, content/tricks.js). The framework owns everything a
// trick shares: the sign at its place, the teaching (the teacher's first talk in season plays the intro once), the
// round (a small HUD with timer and score, hint bubbles, a temporary night look), the results card with the real-world
// fact, the rewards in quest.state.tricks and the ambient look of each place. Each trick's game is a module in
// ./tricks/<id>.js exporting { id, play(ctx), ambient?(dt, ctx) }; they load on demand and may be missing.
import * as THREE from 'three';
import { TRICKS, TRICK, trickOpen, inHours, recordRound } from '../content/tricks.js';
import { CAST, DIALOGUE } from './story.js';
import { tx, getLang } from '../i18n/i18n.js';
import { storyId } from './stories/index.js';

const AMBIENT_R = 60;          // the place's ambient life runs while Mika is this close
const LOAD_R = 75;             // a trick's game is fetched when Mika comes this close to its sign (or opens it)
const SIGN_R = 2.6;

// the trick games, loaded on demand (Vite turns the glob into lazy chunks; Node falls back to a plain import)
let GLOB = null;
try { GLOB = import.meta.glob('./tricks/*.js'); } catch { GLOB = null; }
async function loadModule(id) {
  try {
    const key = `./tricks/${id}.js`;
    if (GLOB) return GLOB[key] ? (await GLOB[key]()).default || null : null;
    return (await import(/* @vite-ignore */ new URL(key, import.meta.url).href)).default || null;
  } catch (e) { console.warn(`[tricks] ${id} not available`, e); return null; }
}

/** Load models that are not part of the main library (content/models.js) on demand; null when the file is missing. */
export async function ensureModels(assets, names) {
  await Promise.all(names.map(async n => {
    if (assets.has(n)) return;
    const g = await assets.get(n);
    if (g) (assets.resolved ??= new Map()).set(n, g);
  }));
}

const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

const CSS = `
#trickHud{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:12px;align-items:center;
 padding:7px 16px 7px 8px;border-radius:999px;background:rgba(255,247,232,.94);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 16px Nunito,system-ui,sans-serif;color:#5a3a22;zoom:var(--ui-scale,1)}
#trickHud img{width:34px;height:34px;border-radius:50%;background:#ffe9b8}
#trickHud .t{font:600 20px Fredoka,Nunito,sans-serif;min-width:52px;text-align:center;color:#c2541c}
#trickHud .s{font:600 18px Fredoka,Nunito,sans-serif}
#trickHud.hidden,#trickHint.hidden,#trickCard.hidden{display:none}
#trickHint{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:16;max-width:min(520px,90vw);
 padding:10px 16px;border-radius:18px;background:rgba(255,253,246,.96);box-shadow:0 6px 18px rgba(40,20,0,.25);font:700 16px Nunito,system-ui,sans-serif;color:#4a3020;
 text-align:center;transition:opacity .3s;zoom:var(--ui-scale,1);pointer-events:none}
#trickHint.top{bottom:auto;top:calc(76px + env(safe-area-inset-top,0px))}
#trickHint b{color:#c2541c;margin-right:6px}
body.trick-round #objective{visibility:hidden}
@media (max-width:560px){body.trick-round #clock{visibility:hidden}}
@media (max-width:520px){#trickHud .n{display:none}#trickHud{white-space:nowrap}}
#trickCard{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35)}
#trickCard .box{width:min(440px,92vw);max-height:88vh;overflow:auto;padding:20px 22px 16px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1)}
#trickCard img{width:72px;height:72px;border-radius:50%;background:#ffe9b8}
#trickCard h2{margin:6px 0 2px;font:600 24px Fredoka,Nunito,sans-serif;color:#7a3e16}
#trickCard .stars{font-size:38px;letter-spacing:4px;color:#f2a51a;text-shadow:0 2px 0 #b8640a33}
#trickCard .stars i{font-style:normal;display:inline-block;animation:trickStar .5s both}
#trickCard .score{font:600 20px Fredoka,Nunito,sans-serif}
#trickCard .best{color:#2f8a4a;min-height:1.2em}
#trickCard .fact{margin:12px 0 4px;padding:10px 12px;border-radius:14px;background:#fff1cf;text-align:left;font-weight:600}
#trickCard .fact b{display:block;color:#c2541c;margin-bottom:2px}
#trickCard .safe{color:#7a6a58;font-size:13px;margin:6px 0 0}
#trickCard .btns{display:flex;gap:10px;justify-content:center;margin-top:14px}
#trickCard button{flex:1;padding:11px 10px;border:0;border-radius:14px;font:700 16px Nunito,sans-serif;cursor:pointer;background:#f4dfb5;color:#5a3a22}
#trickCard button.main{background:#f08a3c;color:#fff}
#trickCard kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@keyframes trickStar{from{transform:scale(0) rotate(-40deg);opacity:0}to{transform:none;opacity:1}}
`;

export class Tricks {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.mods = {};             // id -> module (or null when missing), once loaded
    this.loading = {};          // id -> the promise of its module (loaded when Mika comes near the sign, or plays)
    this.openArg = { season: '', hour: 0, frozen: true, raining: false };
    this.round = null;          // the round running now { id, ctx }
    this.locks = false;         // true while a round holds Mika still (read by director.update)
    this.ambientOn = new Set();
    this.loops = new Set();     // per-frame callbacks of the running round (ctx.loop)
    this.signs = [];
    this.t = 0;
    this.buildUi();
    for (const t of TRICKS) this.spawnSign(t);
  }

  // ------------------------------------------------------------------ state helpers
  get st() { return this.d.q?.state; }
  rec(id) { return this.st?.tricks?.[id] || null; }
  teacherOf(t) { return t.teacher[storyId()] || t.teacher.classic; }
  teacherName(t) { return tx(CAST[this.teacherOf(t)]?.name || this.teacherOf(t)); }
  season() { return this.g.shownSeason || this.g.time.season; }
  /** Is the trick playable now (season, clear sky; a running clock must also be inside its hours). */
  open(t) {
    const g = this.g, o = g.timeOverride, a = this.openArg;
    // the story clock stands still (a fixed Settings hour too): the round brings its own night. A day cycle must reach the hours.
    a.frozen = !g.time.speed && o !== 'cycle-slow' && o !== 'cycle-fast';
    a.season = this.season(); a.hour = g.shownHour(); a.raining = g.fx?.weather === 'rain';
    return trickOpen(t, a);
  }
  /** Tricks are part of the valley from chapter one on (not in the prologue). */
  ready() { return !!this.st && this.st.chapter >= 1; }

  // ------------------------------------------------------------------ signs
  spawnSign(t) {
    const g = this.g, w = g.world;
    const y = w.heightAt(t.place.x, t.place.z);
    const at = new THREE.Vector3(t.place.x, y, t.place.z);
    const m = g.assets.clone('signpost');
    if (m) {
      m.position.copy(at);
      m.rotation.y = t.place.face ?? 0;
      m.scale.setScalar(0.8);
      // like every small prop: no shadow on the tier that drops prop shadows (a post is seven meshes)
      const shadows = w.quality?.propShadows !== false;
      m.traverse(o => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = true; } });
      g.scene.add(m);
    }
    // obj is shown within signFar of Mika (update); `hidden`: a round has taken it out of its picture (the kite)
    const sign = { t, at, obj: m, hidden: false };
    this.signs.push(sign);
    // asked every frame while Mika stands by the sign: the two texts are made once per language
    const text = [null, null];
    let textLang = null;
    const label = () => {
      const lang = getLang(), o = this.open(t) ? 1 : 0;
      if (lang !== textLang) { textLang = lang; text[0] = text[1] = null; }
      return text[o] ??= o ? tx('Try: {name}', { name: tx(t.name) }) : tx('{name}: back in {when}', { name: tx(t.name), when: tx(t.when) });
    };
    this.d.interact(`trick:${t.id}`, at.clone().setY(y + 1), label, () => this.ready() && !this.round,
      () => (this.open(t) ? this.play(t.id) : this.d.ui.toast(tx('{name}: back in {when}', { name: tx(t.name), when: tx(t.when) }), t.icon)), SIGN_R, null, 0.4);
  }

  // ------------------------------------------------------------------ teaching
  /** Called by director.talk before the usual talk: the teacher's first talk in season teaches the trick (once). */
  onTalk(who) {
    const st = this.st;
    if (!st || !this.ready() || this.round || this.d.q.step.talk?.[who]) return false;
    for (const t of TRICKS) {
      if (this.teacherOf(t) !== who || this.rec(t.id)?.intro || !this.open(t) || !DIALOGUE[t.intro]) continue;
      st.tricks[t.id] = { learned: true, best: 0, stars: 0, plays: 0, ...(st.tricks[t.id] || {}), intro: true };
      this.d.say(t.intro).then(() => {
        this.d.ui.toast(tx('New trick: {name} (see the journal)', { name: tx(t.name) }), t.icon);
        this.d.audio.chime(2);
      });
      return true;
    }
    return false;
  }

  /** The tricks Grandma (or Rin) could teach now, for a hint or a board. */
  inSeason() { return TRICKS.filter(t => this.open(t)); }

  // ------------------------------------------------------------------ the round
  /** The trick's game module, fetched once (the same promise for everyone who asks while it loads). */
  module(id) {
    return this.loading[id] ??= loadModule(id).then(m => (this.mods[id] = m));
  }

  /** Save now, although a round owns the screen (director.save refuses during a round: the card is a safe moment). */
  saveNow() {
    const r = this.round;
    this.round = null;
    try { this.d.save(); } finally { this.round = r; }
  }

  async play(id) {
    if (this.round || this.d.busy || this.d.minigame) return null;
    const t = TRICK[id], d = this.d, g = this.g;
    if (!t) return null;
    this.round = { id, starting: true };
    let result = null;
    const met = new Set();
    try {
      const mod = await this.module(id);
      if (!mod?.play) { d.ui.toast(tx('{name} is not ready yet', { name: tx(t.name) }), t.icon); return null; }
      const st = this.st;
      st.tricks[id] = { learned: true, best: 0, stars: 0, plays: 0, ...(st.tricks[id] || {}) };
      let again = true;
      while (again) {
        const first = !st.tricks[id].plays;
        const ctx = this.makeCtx(t, first);
        this.round = { id, ctx };
        this.locks = false;
        d.ui.prompt(null);
        g.input.releaseAll?.();
        this.hud(t, ctx);
        let res = null;
        try { res = await mod.play(ctx); } catch (e) { console.error(`[tricks] ${id} failed`, e); res = { score: 0, quit: true }; }
        result = res || { score: 0 };
        this.endRound(ctx);
        if (result.quit) break;
        const score = Math.max(0, Math.floor(result.score || 0));
        const { rec, stars, newBest } = recordRound(st.tricks[id], t, score);
        st.tricks[id] = { ...st.tricks[id], ...rec };
        d.ui.toast(`${starText(stars)} ${tx(t.name)}${newBest ? ` · ${tx('New best!')}` : ''}`, t.icon);
        if (stars) d.audio.star(); else d.audio.good();
        // creatures met in the round (the sap trap's beetles) join the friends journal once the card is closed
        for (const f of result.detail?.friends || []) met.add(f);
        this.saveNow();          // the result is kept even if the game is closed on the card
        again = await this.results(t, score, stars, newBest, first, result);
      }
    } finally {
      // whatever happened above (a failed card included), the round never keeps the screen
      this.loops.clear();
      this.el?.card.classList.add('hidden');
      this.round = null;
      this.locks = false;
      if (!d.busy) g.player.locked = false;
      d.actCooldown = 0.5;
    }
    d.save();
    for (const f of met) d.meetFriend?.(f);
    return result;
  }

  makeCtx(t, first) {
    const d = this.d, g = this.g, self = this;
    const ctx = {
      director: d, game: g, player: g.player, audio: d.audio, ui: d.ui, fx: d.fx, input: g.input, trick: t,
      first, roundTime: first ? (t.firstLength ?? t.length) : t.length,
      place: new THREE.Vector3(t.place.x, g.world.heightAt(t.place.x, t.place.z), t.place.z),
      teacher: this.teacherOf(t), quit: false, t: 0,
      debug: {},           // what a trick shows the QA autopilot (window.__STARLINE_QA__.director.tricks.round.ctx.debug)
      /** A speech bubble from the teacher (guided hints, cheers). life in seconds. */
      hint(text, life = 4.5) { self.showHint(text, self.teacherName(t), life); },
      /** Put the hint bubble at the top of the screen (true) when the bottom is where the action is (stargazing).
       *  top: optional distance from the top edge in px (below a trick's own gauge). */
      hintTop(on, top = 0) { self.el.hint.classList.toggle('top', !!on); self.el.hint.style.top = on && top ? `calc(${top}px + env(safe-area-inset-top,0px))` : ''; },
      /** Top HUD: time left (seconds) and the score (number, with the trick's unit). */
      hud(score, timeLeft) { self.setHud(score, timeLeft, t); },
      /** Hold Mika still (true) or let her walk (false) during the round. */
      lock(on) { self.locks = !!on; if (on) { g.player.vel.set(0, 0, 0); } },
      /** A night look for the round only (the story clock is untouched); setNight(false) restores. Idempotent. */
      setNight(on, hour = 22.5) { self.setNight(on, hour); },
      /** Run fn(dt) every frame until it returns a value (resolved). Backspace (back) quits: resolves { quit: true }. */
      loop(fn) { return new Promise(res => { if (ctx.quit) res({ quit: true }); else self.loops.add({ fn, res }); }); },
      /** Wait on the game clock (pauses with the game). */
      wait(sec) { let t0 = 0; return ctx.loop(dt => ((t0 += dt) >= sec ? true : undefined)); },
      /** Fade the screen to black (true) or back (false). */
      fade(on, ms = 400) { return d.ui.fade(on, ms); },
      /** Play dialogue lines (or a DIALOGUE id) as a local scene; Mika is held while it runs. */
      async say(idOrLines) {
        const lines = typeof idOrLines === 'string' ? DIALOGUE[idOrLines] : idOrLines;
        if (!lines) return;
        d.busy++;
        try { await d.dialogueBody(lines, { local: true }); } finally { d.busy--; }
      },
      /** The action press this frame: E / Do it / gamepad A; tap and click are left to the trick. */
      pressed() { return g.input.pressed('act'); },
      ensureModels: names => ensureModels(g.assets, names),
    };
    return ctx;
  }

  endRound(ctx) {
    const g = this.g;
    for (const l of this.loops) l.res({ quit: true });
    this.loops.clear();
    this.setNight(false);
    this.hideHint();
    this.el.hint.classList.remove('top');
    this.el.hint.style.top = '';
    document.body.classList.remove('trick-round');
    this.el.hud.classList.add('hidden');
    g.follow.clearCutscene(true);
    this.locks = false;
    ctx.quit = true;
  }

  /** The results card. Resolves true for "Play again". */
  results(t, score, stars, newBest, first, res) {
    const ui = this.d.ui, el = this.el.card, rec = this.rec(t.id);
    this.locks = true;
    const unit = tx(t.unit);
    el.querySelector('.box').innerHTML = `<img alt="" src="${ui.icon(t.icon)}" onerror="this.style.display='none'">
      <h2></h2><div class="stars">${[0, 1, 2].map(i => `<i style="animation-delay:${0.2 + i * 0.25}s">${i < stars ? '★' : '☆'}</i>`).join('')}</div>
      <div class="score"></div><div class="best"></div>
      <div class="fact"><b></b><span class="why"></span></div>
      <div class="fact"><b></b><span class="real"></span></div>
      <p class="safe"></p>
      <div class="btns"><button class="again"></button><button class="main done"></button></div>`;
    const q = s => el.querySelector(s);
    q('h2').textContent = tx(t.name);
    q('.score').textContent = `${score} ${unit}`;
    q('.best').textContent = newBest && rec.plays > 1 ? tx('New best!') : tx('Best: {n}', { n: rec.best });
    q('.fact b').textContent = tx('Why it works');
    q('.why').textContent = tx(t.why);
    el.querySelectorAll('.fact b')[1].textContent = tx('How to do it for real');
    q('.real').textContent = tx(t.howReal);
    q('.safe').textContent = t.safety ? tx(t.safety) : '';
    const touch = ui.touch;
    q('.again').innerHTML = `${tx('Play again')}${touch ? '' : '<kbd>Space</kbd>'}`;
    q('.done').innerHTML = `${tx('Done')}${touch ? '' : '<kbd>E</kbd>'}`;
    if (res?.extra) q('.score').textContent += ` · ${tx(res.extra)}`;
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

  // ------------------------------------------------------------------ look
  setNight(on, hour = 22.5) {
    const g = this.g;
    if (on) {
      if (!this.savedTime) this.savedTime = { o: g.timeOverride, c: g.cycleHour };
      g.timeOverride = hour;
    } else if (this.savedTime) {
      g.timeOverride = this.savedTime.o;
      g.cycleHour = this.savedTime.c;
      this.savedTime = null;
    }
  }

  // ------------------------------------------------------------------ UI
  buildUi() {
    if (typeof document === 'undefined') { this.el = null; return; }
    if (!document.getElementById('trickCss')) {
      const s = document.createElement('style');
      s.id = 'trickCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const mk = (id, html) => { const e = document.createElement('div'); e.id = id; e.className = 'hidden'; e.innerHTML = html; document.body.appendChild(e); return e; };
    this.el = {
      hud: mk('trickHud', '<img alt="" onerror="this.style.display=\'none\'"><span class="n"></span><span class="t"></span><span class="s"></span>'),
      hint: mk('trickHint', '<b></b><span></span>'),
      card: mk('trickCard', '<div class="box"></div>'),
    };
    this.el.hud._tEl = this.el.hud.querySelector('.t');
    this.el.hud._sEl = this.el.hud.querySelector('.s');
  }

  hud(t, ctx) {
    const h = this.el.hud;
    h.querySelector('img').src = this.d.ui.icon(t.icon);
    h.querySelector('.n').textContent = tx(t.name);
    this.setHud(0, ctx.roundTime, t);
    h.classList.remove('hidden');
    document.body.classList.add('trick-round');
  }

  setHud(score, timeLeft, t) {
    // called every frame of a round: the page is only touched (and a text only built) when a shown value changes
    const h = this.el.hud;
    const secs = timeLeft === null || timeLeft === undefined ? -1 : Math.max(0, Math.ceil(timeLeft));
    if (h._secs !== secs) { h._secs = secs; h._tEl.textContent = secs < 0 ? '' : fmtTime(secs); }
    const lang = getLang();
    if (h._score !== score || h._unit !== t.unit || h._lang !== lang) {
      h._score = score; h._unit = t.unit; h._lang = lang;
      h._sEl.textContent = `${score} ${tx(t.unit)}`;
    }
  }

  showHint(text, name, life) {
    const h = this.el.hint;
    h.firstChild.textContent = name ? `${name}:` : '';
    h.lastChild.textContent = tx(text);
    h.classList.remove('hidden');
    h.style.opacity = '1';
    this.hintLeft = life;
  }

  hideHint() { this.el.hint.classList.add('hidden'); this.hintLeft = 0; }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const d = this.d, g = this.g;
    this.t += dt;
    if (this.loops.size) {
      const cardUp = !this.el.card.classList.contains('hidden');
      if (g.input.pressed('back') && this.round?.ctx && !cardUp) {
        // Backspace leaves the round: every waiting step resolves { quit: true } and the trick cleans up
        this.round.ctx.quit = true;
        for (const l of [...this.loops]) { this.loops.delete(l); l.res({ quit: true }); }
      } else for (const l of this.loops) {          // (a Set may lose its current entry while it is walked)
        let r;
        // a bug inside a round must not freeze the game: end that round as if quit, and say so in the console
        try { r = l.fn(dt); } catch (e) { console.error('trick round failed', e); r = { quit: true }; }
        if (r !== undefined) { this.loops.delete(l); l.res(r); }
      }
      if (this.round?.ctx) this.round.ctx.t += dt;
    }
    if (this.hintLeft > 0) { this.hintLeft -= dt; if (this.hintLeft <= 0) this.hideHint(); }
    // the ambient look of each place: in season, at the trick's hours (as shown on screen), with Mika near
    if (!this.st) return;
    const p = g.player.pos, hour = g.shownHour(), season = this.season(), inside = !!g.interiors?.active;
    // signposts are small props: hidden beyond one and a half times the tier's prop distance (back 12 m inside it)
    const far = (g.renderer?.q?.propDist ?? 240) * 1.5;
    for (const s of this.signs) {
      const t = s.t, mod = this.mods[t.id];
      const dx = p.x - s.at.x, dz = p.z - s.at.z, d2 = dx * dx + dz * dz;
      if (s.obj) {
        const lim = s.obj.visible ? far : far - 12, show = !s.hidden && d2 < lim * lim;
        if (s.obj.visible !== show) s.obj.visible = show;
      }
      if (mod === undefined) {
        // not fetched yet: ask for it as Mika comes near, so its sign answers at once and its place can come alive
        if (d2 < LOAD_R * LOAD_R && !inside && !this.loading[t.id] && this.ready()) this.module(t.id);
        continue;
      }
      if (!mod?.ambient) continue;
      const near = d2 < AMBIENT_R * AMBIENT_R && !inside;
      const on = near && this.round?.id !== t.id && t.seasons.includes(season) && inHours(hour, t.hours);
      if (on) { this.ambientOn.add(t.id); mod.ambient(dt, this.ambientCtx(t)); }
      else if (this.ambientOn.has(t.id)) { this.ambientOn.delete(t.id); mod.ambient(0, { ...this.ambientCtx(t), off: true }); }
    }
  }

  ambientCtx(t) {
    const g = this.g;
    return (this._actx ??= {})[t.id] ??= { director: this.d, game: g, player: g.player, audio: this.d.audio, trick: t, place: new THREE.Vector3(t.place.x, g.world.heightAt(t.place.x, t.place.z), t.place.z), off: false };
  }

  /** Journal rows: one per trick, for the Tricks tab. */
  journal() {
    return TRICKS.map(t => {
      const r = this.rec(t.id);
      return { t, learned: !!r?.learned, best: r?.best || 0, stars: r?.stars || 0, plays: r?.plays || 0, open: this.open(t), teacher: this.teacherName(t) };
    });
  }
}

