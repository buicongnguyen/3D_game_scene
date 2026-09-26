import { CAST, ITEMS, JOURNAL, STAR_POEM, FISH, STEPS, STEP_INDEX, CHAPTERS } from '../game/story.js';
import { FALLEN_STARS } from '../world/layout.js';

const $ = id => document.getElementById(id);

const SEASON_SVG = {
  spring: '<svg viewBox="0 0 24 24"><g fill="#f58fb3">' + [0, 72, 144, 216, 288].map(a => `<ellipse cx="12" cy="6.2" rx="3.4" ry="5" transform="rotate(${a} 12 12)"/>`).join('') + '</g><circle cx="12" cy="12" r="2.6" fill="#ffd66b"/></svg>',
  summer: '<svg viewBox="0 0 24 24"><g stroke="#f2a33a" stroke-width="2.2" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="12" y1="2.5" x2="12" y2="5.5" transform="rotate(${a} 12 12)"/>`).join('') + '</g><circle cx="12" cy="12" r="5" fill="#ffc53d"/></svg>',
  autumn: '<svg viewBox="0 0 24 24"><path fill="#e2432a" d="M12 2l1.8 4.4 4-2-1 4.6 4.4.4-3.4 3.2 2.2 3.8-4.6-.8L12 20l-3.4-4.4-4.6.8 2.2-3.8L2.8 9.4l4.4-.4-1-4.6 4 2z"/><path stroke="#8a3a1a" stroke-width="1.5" d="M12 12v10"/></svg>',
  winter: '<svg viewBox="0 0 24 24"><g stroke="#6aa8e8" stroke-width="2" stroke-linecap="round">' + [0, 60, 120].map(a => `<g transform="rotate(${a} 12 12)"><line x1="12" y1="2" x2="12" y2="22"/><line x1="12" y1="5" x2="9.5" y2="3"/><line x1="12" y1="5" x2="14.5" y2="3"/><line x1="12" y1="19" x2="9.5" y2="21"/><line x1="12" y1="19" x2="14.5" y2="21"/></g>`).join('') + '</g></svg>',
};

export class UI {
  constructor(game, audio) {
    this.game = game;
    this.audio = audio;
    this.dialogueOpen = false;
    this.overlay = null;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.touch) document.body.classList.add('touch');
    this.bindMenus();
    this.bindTouch();
    this.bindDialogue();
  }

  // ------------------------------------------------------------------ screens
  setLoad(p, label) {
    $('loadBar').style.width = `${Math.round(p * 100)}%`;
    $('loadLabel').textContent = label;
  }
  hideLoading() { $('loading').classList.add('hidden'); }

  title(hasSave) {
    $('title').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    $('btnContinue').classList.toggle('hidden', !hasSave);
    if (this.touch) $('titleHint').textContent = 'Left thumb moves · drag right side to look · Act, Jump and Aim buttons';
    return new Promise(resolve => {
      const done = v => { $('title').classList.add('hidden'); cleanup(); this.audio?.click(); resolve(v); };
      const onNew = () => {
        if (hasSave && !confirm('Start a new game? Your saved progress will be replaced.')) return;
        done('new');
      };
      const onCont = () => done('continue');
      const cleanup = () => { $('btnNew').removeEventListener('click', onNew); $('btnContinue').removeEventListener('click', onCont); };
      $('btnNew').addEventListener('click', onNew);
      $('btnContinue').addEventListener('click', onCont);
      (hasSave ? $('btnContinue') : $('btnNew')).focus();
    });
  }

  showHud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !on || !this.touch);
  }

  // ------------------------------------------------------------------ HUD
  setObjective(chapter, text, pulse = false) {
    const c = CHAPTERS[chapter];
    $('objChapter').textContent = c ? `${c.title} — ${c.name}` : '';
    if ($('objText').textContent !== text) {
      $('objText').textContent = text;
      if (pulse) { const o = $('objective'); o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse'); }
    }
  }

  setClock(season, label) {
    if (this._season !== season) { $('seasonIcon').innerHTML = SEASON_SVG[season] || ''; this._season = season; }
    if (this._clock !== label) { $('clockText').textContent = label; this._clock = label; }
  }

  icon(name) { return `./icons/${name}.webp`; }

  setInventory(inv) {
    const shown = Object.entries(inv).filter(([k, n]) => n > 0 && ITEMS[k]);
    const key = JSON.stringify(shown);
    if (key === this._inv) return;
    this._inv = key;
    const el = $('inventory');
    el.innerHTML = '';
    for (const [k, n] of shown) {
      const it = ITEMS[k];
      const d = document.createElement('div');
      d.className = 'inv';
      d.innerHTML = `<img alt="" src="${this.icon(it.icon)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))"><span>${it.name}${n > 1 ? ` ×${n}` : ''}</span>`;
      el.appendChild(d);
    }
  }

  prompt(text, key) {
    if (this._prompt === text) return;
    this._prompt = text;
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); $('tAct').textContent = 'Act'; return; }
    p.classList.remove('hidden');
    $('promptText').textContent = text;
    $('promptKey').textContent = this.touch ? 'Act' : key || 'E';
    $('tAct').textContent = text.split(' ')[0];
  }

  toast(text, icon) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon ? `<img alt="" src="${this.icon(icon)}" onerror="this.remove()">` : ''}<span></span>`;
    t.querySelector('span').textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3300);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  /** Screen-space objective marker; target in world space or null. */
  marker(camera, target) {
    const m = $('marker');
    if (!target || this.dialogueOpen) { m.classList.add('hidden'); return; }
    const v = target.clone().project(camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    const pad = 46;
    const on = !behind && x > pad && x < innerWidth - pad && y > pad + 60 && y < innerHeight - pad;
    m.classList.remove('hidden');
    m.classList.toggle('onscreen', on);
    const arrow = m.firstElementChild;
    if (!on) {
      if (behind) { x = innerWidth - x; y = innerHeight - y; }
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const dx = x - cx, dy = y - cy;
      const s = Math.min((cx - pad) / Math.abs(dx || 1e-3), (cy - pad - 30) / Math.abs(dy || 1e-3));
      x = cx + dx * s; y = cy + dy * s;
      arrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    } else {
      arrow.style.transform = '';
      y -= 30;
    }
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    const d = camera.position.distanceTo(target);
    $('markerDist').textContent = d > 8 ? `${Math.round(d)} m` : '';
  }

  reticle(on, lock, label) {
    const r = $('reticle');
    r.classList.toggle('hidden', !on);
    r.classList.toggle('lock', !!lock);
    $('reticleLabel').textContent = label || '';
    $('tFire').classList.toggle('hidden', !on || !this.touch);
  }

  card(chapter) {
    const c = CHAPTERS[chapter];
    if (!c) return Promise.resolve();
    const el = $('card');
    $('cardChapter').textContent = c.title;
    $('cardName').textContent = c.name;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.audio?.chime(chapter);
    return new Promise(r => setTimeout(() => { el.classList.add('hidden'); r(); }, 3600));
  }

  fade(on, ms = 500) {
    $('fade').style.transitionDuration = `${ms}ms`;
    $('fade').classList.toggle('on', on);
    return new Promise(r => setTimeout(r, ms));
  }

  // ------------------------------------------------------------------ dialogue
  bindDialogue() {
    const adv = e => {
      if (!this.dialogueOpen) return;
      if (e.type === 'keydown') {
        if (this.choiceActive) {
          if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.selChoice(-1); e.preventDefault(); return; }
          if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.selChoice(1); e.preventDefault(); return; }
          if (['Enter', 'KeyE', 'Space'].includes(e.code)) { this.pickChoice(this.choiceSel); e.preventDefault(); }
          return;
        }
        if (!['Enter', 'KeyE', 'Space', 'KeyF'].includes(e.code)) return;
        e.preventDefault();
      }
      if (this.choiceActive) return;
      this.advance?.();
    };
    addEventListener('keydown', adv);
    $('dialogue').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; adv(e); });
    $('game').addEventListener('pointerdown', e => adv(e));
    $('dlgSkip').addEventListener('click', () => { this.skipAll = true; this.advance?.(); });
  }

  selChoice(d) {
    const b = [...$('dlgChoices').children];
    this.choiceSel = (this.choiceSel + d + b.length) % b.length;
    b.forEach((x, i) => x.classList.toggle('sel', i === this.choiceSel));
  }

  pickChoice(i) { this.onChoice?.(i); }

  /** Play dialogue lines; resolves with the chosen value if the dialogue ends with a choice. */
  async dialogue(lines, opts = {}) {
    // one dialogue at a time: a second caller waits for the box to be free
    const prev = this.dlgChain || Promise.resolve();
    let release;
    this.dlgChain = new Promise(r => { release = r; });
    await prev;
    try { return await this.dialogueInner(lines, opts); } finally { release(); }
  }

  /** Gamepad support for dialogue: A / X advance, D-pad or stick picks a choice. Called every frame. */
  pollGamepad() {
    if (!this.dialogueOpen) { this._gpPrev = null; return; }
    const gp = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    if (!gp) return;
    const now = { a: gp.buttons[0]?.pressed || gp.buttons[2]?.pressed, up: gp.buttons[12]?.pressed || gp.axes[1] < -0.6, down: gp.buttons[13]?.pressed || gp.axes[1] > 0.6 };
    const prev = this._gpPrev || {};
    this._gpPrev = now;
    if (this.choiceActive) {
      if (now.up && !prev.up) this.selChoice(-1);
      if (now.down && !prev.down) this.selChoice(1);
      if (now.a && !prev.a) this.pickChoice(this.choiceSel);
    } else if (now.a && !prev.a) this.advance?.();
  }

  async dialogueInner(lines, { onLine } = {}) {
    this.dialogueOpen = true;
    this.skipAll = false;
    this.prompt(null);
    $('dialogue').classList.remove('hidden');
    let result = null;
    for (const line of lines) {
      if (line.choice) { result = await this.choice(line.choice); continue; }
      if (this.skipAll) continue;
      const [who, text, anim] = line;
      onLine?.(who, anim);
      await this.showLine(who, text);
    }
    $('dialogue').classList.add('hidden');
    this.dialogueOpen = false;
    return result;
  }

  showLine(who, text) {
    const c = CAST[who] || CAST.narrator;
    const narr = who === 'narrator' || who === 'sora' || who === 'kiku';
    $('dlgName').textContent = c.name || '';
    $('dlgName').style.display = c.name ? '' : 'none';
    $('dlgName').style.background = c.color;
    const p = $('dlgPortrait');
    const hasPortrait = ['mika', 'tamo', 'genzo', 'rin', 'ota', 'hana'].includes(who);
    p.classList.toggle('none', !hasPortrait);
    if (hasPortrait) p.style.backgroundImage = `url(./portraits/${who}.webp)`;
    const el = $('dlgText');
    el.classList.toggle('narration', narr);
    $('dlgChoices').innerHTML = '';
    $('dlgNext').style.visibility = 'hidden';
    return new Promise(resolve => {
      let i = 0, done = false;
      const chars = [...text];
      el.textContent = '';
      const step = () => {
        if (done) return;
        i = Math.min(chars.length, i + 2);
        el.textContent = chars.slice(0, i).join('');
        if (i % 4 === 0 && !narr) this.audio?.blip(c.pitch);
        if (i >= chars.length) { finish(); return; }
        this.typeTimer = setTimeout(step, 24);
      };
      const finish = () => {
        done = true;
        clearTimeout(this.typeTimer);
        el.textContent = text;
        $('dlgNext').style.visibility = 'visible';
        this.advance = () => { this.advance = null; this.audio?.click(); resolve(); };
      };
      this.advance = () => finish();
      if (this.skipAll) { resolve(); return; }
      step();
    });
  }

  choice(options) {
    this.choiceActive = true;
    this.choiceSel = 0;
    $('dlgNext').style.visibility = 'hidden';
    const box = $('dlgChoices');
    box.innerHTML = '';
    return new Promise(resolve => {
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o.text;
        if (i === 0) b.classList.add('sel');
        b.addEventListener('click', () => this.pickChoice(i));
        box.appendChild(b);
      });
      this.onChoice = i => {
        this.choiceActive = false;
        this.onChoice = null;
        box.innerHTML = '';
        this.audio?.click();
        resolve(options[i].value);
      };
    });
  }

  // ------------------------------------------------------------------ overlays
  bindMenus() {
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closeOverlay()));
    $('btnSettings').addEventListener('click', () => this.open('settings'));
    $('btnCredits').addEventListener('click', () => this.open('credits'));
    $('btnMenu').addEventListener('click', () => this.game.togglePause?.(true));
    $('btnJournal').addEventListener('click', () => this.openJournal());
    $('btnResume').addEventListener('click', () => this.game.togglePause?.(false));
    $('btnPauseJournal').addEventListener('click', () => this.openJournal());
    $('btnPauseSettings').addEventListener('click', () => this.open('settings'));
    $('btnSaveQuit').addEventListener('click', () => this.game.saveAndQuit?.());
    document.querySelectorAll('#journalTabs button').forEach(b => b.addEventListener('click', () => this.journalTab(b.dataset.tab)));
    const g = this.game;
    const q = $('optQuality');
    q.value = g.renderer.qualityName;
    q.addEventListener('change', () => { g.renderer.setQuality(q.value); this.toast('Graphics setting saved — reload to apply fully'); });
    const load = (k, d) => { try { return JSON.parse(localStorage.getItem(`starline-opt-${k}`)) ?? d; } catch { return d; } };
    const save = (k, v) => { try { localStorage.setItem(`starline-opt-${k}`, JSON.stringify(v)); } catch { /* ignore */ } };
    const sens = $('optSens'), inv = $('optInvert'), mus = $('optMusic'), sfx = $('optSfx'), fps = $('optFps');
    sens.value = load('sens', 1); inv.checked = load('invert', false); mus.value = load('music', 0.55); sfx.value = load('sfx', 0.8); fps.checked = load('fps', false);
    const apply = () => {
      g.input.sensitivity = +sens.value; g.input.invertY = inv.checked;
      this.audio?.setVolumes(+mus.value, +sfx.value);
      $('fps').classList.toggle('hidden', !fps.checked);
      save('sens', +sens.value); save('invert', inv.checked); save('music', +mus.value); save('sfx', +sfx.value); save('fps', fps.checked);
    };
    [sens, inv, mus, sfx, fps].forEach(el => el.addEventListener('input', apply));
    apply();
  }

  open(id) {
    if (this.overlay && this.overlay !== 'pause') $(this.overlay).classList.add('hidden');
    $(id).classList.remove('hidden');
    this.overlayStack = [...(this.overlayStack || []).filter(x => x !== id), id];
    this.overlay = id;
  }

  closeOverlay() {
    const top = this.overlayStack?.pop();
    if (top) $(top).classList.add('hidden');
    this.overlay = this.overlayStack?.[this.overlayStack.length - 1] || null;
    if (this.overlay) $(this.overlay).classList.remove('hidden');
    if (!this.overlay) this.game.togglePause?.(false, true);
  }

  closeAll() {
    for (const id of ['journal', 'pause', 'settings', 'credits']) $(id).classList.add('hidden');
    this.overlayStack = [];
    this.overlay = null;
  }

  openJournal() {
    this.game.togglePause?.(true, true);
    this.open('journal');
    this.journalTab(this._tab || 'story');
  }

  journalTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#journalTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const q = this.game.quest?.state;
    const body = $('journalBody');
    if (!q) { body.textContent = ''; return; }
    if (tab === 'story') {
      const cur = STEP_INDEX[q.step];
      const rows = STEPS.slice(0, cur + 1).filter(s => s.chapter === q.chapter || STEP_INDEX[s.id] === cur)
        .map(s => `<div class="step ${STEP_INDEX[s.id] < cur ? 'done' : ''}">${STEP_INDEX[s.id] < cur ? '✓' : '★'} ${s.objective.replace(/\s*\(\{\w+\}\/\d+\)/g, '').replace(/\{\w+\}/g, '')}</div>`);
      const lamps = ['forest', 'mill', 'orchard', 'viaduct'].map(l => `${q.lamps[l] ? '🟡' : '⚫'} ${l[0].toUpperCase() + l.slice(1)} Lamp`).join(' &nbsp; ');
      body.innerHTML = `<p>${lamps}</p><h3>${CHAPTERS[q.chapter].title} — ${CHAPTERS[q.chapter].name}</h3>${rows.join('')}`;
    } else if (tab === 'pages') {
      body.innerHTML = JOURNAL.map((p, i) => q.pages.includes(i) ? `<div class="page"><b>${p.title}</b><br>${p.text}</div>` : `<div class="page locked"><b>Page ${i + 1}</b><br>Not found yet.</div>`).join('');
    } else if (tab === 'stars') {
      body.innerHTML = `<p>${q.stars.length} / 12 found. ${q.stars.length === 12 ? 'Sora left one more letter…' : 'Each star holds a line of Sora\'s poem.'}</p><div class="grid">` +
        FALLEN_STARS.map((s, i) => q.stars.includes(s.id) ? `<div class="star">★ ${STAR_POEM[i]}</div>` : `<div class="star locked">☆ ${s.hint}</div>`).join('') + '</div>';
    } else if (tab === 'fish') {
      body.innerHTML = Object.entries(FISH).map(([k, f]) => `<div class="step">${q.fishLog[k] ? '🐟' : '·'} ${q.fishLog[k] ? f.name : '???'} ${q.fishLog[k] ? `× ${q.fishLog[k]}` : ''}${f.dusk ? ' <i>(bites at dusk)</i>' : ''}</div>`).join('');
    } else {
      body.innerHTML = this.touch
        ? '<p>Left thumb: move. Drag the right side: look. <b>Act</b>: talk / pick up / interact. <b>Jump</b>. Hold <b>Aim</b> and tap <b>Spark</b> to send Tamo.</p>'
        : '<p><kbd>W A S D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump · drag mouse to look · wheel to zoom<br><kbd>E</kbd> talk / interact / advance dialogue<br>Hold <b>right mouse</b> (or <kbd>Q</kbd>) to aim, <b>left click</b> (or <kbd>R</kbd>) to spark<br><kbd>J</kbd> journal · <kbd>Esc</kbd> pause · gamepad supported</p>';
    }
  }

  // ------------------------------------------------------------------ touch
  bindTouch() {
    const input = this.game.input;
    const hold = (id, action, held) => {
      const b = $(id);
      const down = e => { e.preventDefault(); b.classList.add('down'); if (held) input.touch.aimHeld = true; else input.press(action); };
      const up = e => { e.preventDefault(); b.classList.remove('down'); if (held) input.touch.aimHeld = false; else input.release(action); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
    };
    hold('tJump', 'jump');
    hold('tAct', 'act');
    hold('tAim', 'aim', true);
    hold('tFire', 'fire');
    input.onStick = s => {
      const st = $('stick');
      if (!s) { st.classList.remove('on'); return; }
      st.classList.add('on');
      st.style.left = `${s.ox}px`; st.style.top = `${s.oy}px`;
      const dx = s.x - s.ox, dy = s.y - s.oy, l = Math.hypot(dx, dy), m = Math.min(l, 50) / (l || 1);
      $('stickKnob').style.transform = `translate(${dx * m}px, ${dy * m}px)`;
    };
  }

  // ------------------------------------------------------------------ minigame widgets
  showFishing(on) { $('fishing').classList.toggle('hidden', !on); }
  fishing(state) {
    $('fishTitle').textContent = state.title;
    $('fishZone').style.left = `${(state.zone - state.zoneW / 2) * 100}%`;
    $('fishZone').style.width = `${state.zoneW * 100}%`;
    $('fishMark').style.left = `${state.fish * 100}%`;
    $('fishCatch').style.width = `${state.progress * 100}%`;
    $('fishZone').parentElement.style.visibility = state.phase === 'reel' ? 'visible' : 'hidden';
  }
  showCooking(on) { $('cooking').classList.toggle('hidden', !on); }
  cooking(state) {
    $('cookBeat').style.transform = `scale(${state.ring})`;
    $('cookBeat').style.borderColor = state.flash > 0 ? (state.good ? '#2e7d32' : '#c62828') : '';
    $('cookProg').style.width = `${state.progress * 100}%`;
  }
  ride(on, lit, total) {
    $('rideHud').classList.toggle('hidden', !on);
    if (on) $('rideText').textContent = `Trackside lanterns lit ${lit} / ${total}`;
  }
  fpsText(t) { $('fps').textContent = t; }
  error(msg) { const e = $('err'); e.textContent = msg; e.classList.remove('hidden'); }
}
