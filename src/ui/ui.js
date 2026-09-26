import { CAST, ITEMS, JOURNAL, STAR_POEM, FISH, STEPS, STEP_INDEX, CHAPTERS, FRIENDS, KEEPSAKES, ALBUM } from '../game/story.js';
import { FALLEN_STARS } from '../world/layout.js';
import { tx, N_, isCJK, LANGS, getLang, setLang, onLangChange } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
    this.bindLanguage();
  }

  // ------------------------------------------------------------------ language
  bindLanguage() {
    const pills = $('titleLangs'), sel = $('optLang');
    for (const [k, l] of Object.entries(LANGS)) {
      const b = document.createElement('button');
      b.textContent = l.name;
      b.dataset.lang = k;
      b.lang = l.html;
      b.addEventListener('click', () => setLang(k));
      pills.appendChild(b);
      const o = document.createElement('option');
      o.value = k;
      o.textContent = l.name;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => setLang(sel.value));
    const sync = () => {
      const l = getLang();
      sel.value = l;
      pills.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
      this.refreshText();
    };
    onLangChange(sync);
    sync();
  }

  /** Re-draw everything that holds translated text after a language change. */
  refreshText() {
    this._inv = null;
    this._prompt = undefined;
    this.setTitleHint();
    $('tAct').textContent = tx('Act');
    this.game.director?.refreshObjective();
    if (this.overlay === 'journal') this.journalTab(this._tab || 'story');
  }

  setTitleHint() {
    $('titleHint').textContent = this.touch ? tx('Left thumb moves · drag the right side to look · Act does anything nearby')
      : tx('WASD / stick to move · Mouse drag to look · E to do anything nearby · Space to jump or swim up · C to dive');
  }

  // ------------------------------------------------------------------ screens
  setLoad(p, label) {
    $('loadBar').style.width = `${Math.round(p * 100)}%`;
    $('loadLabel').textContent = tx(label);
  }
  hideLoading() { $('loading').classList.add('hidden'); }

  /** Title screen. slots: [{slot, data}] from Director.slots(). Resolves with { mode: 'new'|'continue', slot }. */
  title(slots, last = 1) {
    $('title').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    const any = slots.some(s => s.data);
    $('btnContinue').classList.toggle('hidden', !any);
    this.setTitleHint();
    return new Promise(resolve => {
      const done = v => { $('title').classList.add('hidden'); cleanup(); this.audio?.click(); resolve(v); };
      const onNew = async () => { const slot = await this.pickSlot('new', slots, last); if (slot) done({ mode: 'new', slot }); };
      const onCont = async () => { const slot = await this.pickSlot('continue', slots, last); if (slot) done({ mode: 'continue', slot }); };
      const cleanup = () => { $('btnNew').removeEventListener('click', onNew); $('btnContinue').removeEventListener('click', onCont); };
      $('btnNew').addEventListener('click', onNew);
      $('btnContinue').addEventListener('click', onCont);
      (any ? $('btnContinue') : $('btnNew')).focus();
    });
  }

  /** The profile chooser: three save slots with where each story stands. Resolves with a slot number or null. */
  pickSlot(mode, slots, last) {
    const box = $('slots');
    $('slotsTitle').textContent = tx(mode === 'new' ? 'Start a new story in…' : 'Continue which story?');
    box.classList.remove('hidden');
    return new Promise(resolve => {
      const close = v => { box.classList.add('hidden'); $('slotsClose').onclick = null; resolve(v); };
      $('slotsClose').onclick = () => close(null);
      const render = () => {
        const list = $('slotList');
        list.innerHTML = '';
        for (const s of slots) {
          const row = document.createElement('div');
          row.className = 'slot';
          const pick = document.createElement('button');
          pick.className = 'pick' + (s.slot === last && s.data ? ' last' : '');
          pick.innerHTML = `<span class="num ${s.data ? '' : 'empty'}">${s.slot}</span><span class="info">${this.slotInfo(s.data)}</span>`;
          pick.disabled = mode === 'continue' && !s.data;
          pick.onclick = () => {
            if (mode === 'new' && s.data && !confirm(tx('Start a new game in this slot? The story saved here will be replaced.'))) return;
            this.audio?.click();
            close(s.slot);
          };
          row.appendChild(pick);
          if (s.data) {
            const del = document.createElement('button');
            del.className = 'del';
            del.textContent = tx('Delete');
            del.onclick = () => {
              if (!confirm(tx('Delete this save? This cannot be undone.'))) return;
              try { localStorage.removeItem(s.slot === 1 ? 'starline-save-1' : `starline-save-${s.slot}`); } catch { /* ignore */ }
              s.data = null;
              if (!slots.some(x => x.data)) $('btnContinue').classList.add('hidden');
              if (mode === 'continue' && !slots.some(x => x.data)) { close(null); return; }
              render();
            };
            row.appendChild(del);
          }
          list.appendChild(row);
        }
      };
      render();
    });
  }

  slotInfo(data) {
    if (!data?.quest) return `<b>${esc(tx('Empty'))}</b><span>${esc(tx('A new story begins here.'))}</span>`;
    const q = data.quest, c = CHAPTERS[q.chapter] || CHAPTERS[0];
    const lamps = Object.values(q.lamps || {}).filter(Boolean).length;
    const mins = Math.floor((q.playtime || 0) / 60);
    const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
    const step = STEPS[STEP_INDEX[q.step]];
    const obj = step ? tx(step.objective).replace(/\s*[(（]\{\w+\}\/\d+[)）]/g, '').replace(/\{\w+\}/g, '') : '';
    let when = '';
    try { when = new Date(data.at).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { /* ignore */ }
    return `<b>${esc(tx(c.title))} — ${esc(tx(c.name))}</b><span>${esc(obj)}</span>` +
      `<span>${esc(tx('Lamps {n}/4 · Stars {s}/12 · {time}', { n: lamps, s: (q.stars || []).length, time }))}${when ? ` · ${esc(when)}` : ''}</span>`;
  }

  showHud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !on || !this.touch);
  }

  // ------------------------------------------------------------------ HUD
  setObjective(chapter, text, pulse = false) {
    const c = CHAPTERS[chapter];
    $('objChapter').textContent = c ? `${tx(c.title)} — ${tx(c.name)}` : '';
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
      d.innerHTML = `<img alt="" src="${this.icon(it.icon)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))"><span>${tx(it.name)}${n > 1 ? ` ×${n}` : ''}</span>`;
      el.appendChild(d);
    }
  }

  prompt(text, key) {
    if (this._prompt === text) return;
    this._prompt = text;
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); $('tAct').textContent = tx('Act'); return; }
    p.classList.remove('hidden');
    $('promptText').textContent = text;
    $('promptKey').textContent = this.touch ? tx('Act') : key || 'E';
    $('tAct').textContent = tx('Act');
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
  /** The yellow guide: a pin over the target when it is on screen, an arrow at the screen edge when not. from = Mika. */
  marker(camera, target, from) {
    const m = $('marker');
    if (!target || this.dialogueOpen) { m.classList.add('hidden'); return; }
    const v = target.clone().project(camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    const pad = 54;
    const on = !behind && x > pad && x < innerWidth - pad && y > pad + 60 && y < innerHeight - pad;
    m.classList.remove('hidden');
    m.classList.toggle('onscreen', on);
    const arrow = m.querySelector('.arrow');
    if (!on) {
      if (behind) { x = innerWidth - x; y = innerHeight - y; }
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const dx = x - cx, dy = y - cy;
      const s = Math.min((cx - pad) / Math.abs(dx || 1e-3), (cy - pad - 30) / Math.abs(dy || 1e-3));
      x = cx + dx * s; y = cy + dy * s;
      arrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    } else {
      arrow.style.transform = '';
      y -= 36;
    }
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    const d = (from || camera.position).distanceTo(target);
    const dt = d > 3.5 ? `${Math.round(d)} m` : '';
    if (this._markerDist !== dt) { this._markerDist = dt; $('markerDist').textContent = dt; }
  }

  // ------------------------------------------------------------------ captions
  /** Letterbox bars for cinematic moments. */
  cinema(on) { $('captions').classList.toggle('cinema', on); document.body.classList.toggle('cinema', on); }

  /** Narration across the top of the screen; captions queue, never overlap. Resolves when shown and gone. */
  caption(text, ms = 4600) {
    const show = async () => {
      const el = $('captionText');
      el.textContent = tx(text);
      el.classList.add('show');
      await new Promise(r => setTimeout(r, ms));
      el.classList.remove('show');
      await new Promise(r => setTimeout(r, 750));
    };
    this.captionChain = (this.captionChain || Promise.resolve()).then(show);
    return this.captionChain;
  }

  card(chapter) {
    const c = CHAPTERS[chapter];
    if (!c) return Promise.resolve();
    const el = $('card');
    $('cardChapter').textContent = tx(c.title);
    $('cardName').textContent = tx(c.name);
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
    const key = e => {
      if (!this.dialogueOpen || e.repeat) return;
      const c = e.code;
      if (['KeyQ', 'Backspace', 'ArrowLeft'].includes(c)) { e.preventDefault(); this.nav?.('back'); return; }
      if (this.choiceActive) {
        if (c === 'ArrowUp' || c === 'KeyW') { this.selChoice(-1); e.preventDefault(); return; }
        if (c === 'ArrowDown' || c === 'KeyS') { this.selChoice(1); e.preventDefault(); return; }
        if (['Enter', 'KeyE', 'Space'].includes(c)) { this.pickChoice(this.choiceSel); e.preventDefault(); }
        return;
      }
      if (!['Enter', 'KeyE', 'Space', 'KeyF', 'ArrowRight'].includes(c)) return;
      e.preventDefault();
      this.nav?.('next');
    };
    addEventListener('keydown', key);
    // tapping the text or the game view turns the page; the buttons do their own thing
    $('dialogue').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; if (!this.choiceActive) this.nav?.('next'); });
    $('game').addEventListener('pointerdown', () => { if (this.dialogueOpen && !this.choiceActive) this.nav?.('next'); });
    $('dlgNext').addEventListener('click', () => this.nav?.('next'));
    $('dlgBack').addEventListener('click', () => this.nav?.('back'));
    $('dlgSkip').addEventListener('click', () => this.nav?.('skip'));
  }

  /** Group dialogue lines into pages: up to three short lines (or a speech's worth of text) per page. */
  static paginate(lines, cjk = false, narrow = false) {
    // phones get shorter pages so a page never needs scrolling
    const MAX = (cjk ? 150 : 270) * (narrow ? 0.6 : 1), PER = narrow ? 2 : 3;
    const pages = [];
    let cur = null;
    for (const l of lines) {
      if (l.choice) {
        // the question and its answers share a page when there is room
        if (!cur || cur.lines.length >= PER) { cur = { lines: [], len: 0 }; pages.push(cur); }
        cur.choice = l.choice;
        cur = null;
        continue;
      }
      const len = [...(l[1] || '')].length;
      if (!cur || cur.lines.length >= PER || (cur.lines.length && cur.len + len > MAX)) { cur = { lines: [], len: 0 }; pages.push(cur); }
      cur.lines.push(l);
      cur.len += len;
    }
    return pages;
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
    const now = { a: gp.buttons[0]?.pressed || gp.buttons[2]?.pressed, b: gp.buttons[1]?.pressed || gp.buttons[14]?.pressed, up: gp.buttons[12]?.pressed || gp.axes[1] < -0.6, down: gp.buttons[13]?.pressed || gp.axes[1] > 0.6 };
    const prev = this._gpPrev || {};
    this._gpPrev = now;
    if (now.b && !prev.b) { this.nav?.('back'); return; }
    if (this.choiceActive) {
      if (now.up && !prev.up) this.selChoice(-1);
      if (now.down && !prev.down) this.selChoice(1);
      if (now.a && !prev.a) this.pickChoice(this.choiceSel);
    } else if (now.a && !prev.a) this.nav?.('next');
  }

  async dialogueInner(lines, { onLine } = {}) {
    this.dialogueOpen = true;
    this.prompt(null);
    const local = lines.map(l => (l.choice ? { choice: l.choice.map(o => ({ ...o, text: tx(o.text) })) } : [l[0], tx(l[1]), l[2]]));
    const pages = UI.paginate(local, isCJK(), innerWidth < 640 || innerHeight < 520);
    $('dialogue').classList.remove('hidden');
    let result = null, i = 0;
    const seen = new Set();
    while (i < pages.length) {
      const act = await this.showPage(pages, i, seen.has(i) ? null : onLine);
      seen.add(i);
      if (act === 'back') { i = Math.max(0, i - 1); continue; }
      if (act === 'skip') {
        // skipping never skips a decision: jump to the next page that asks one
        const ci = pages.findIndex((p, k) => k > i && p.choice);
        if (ci < 0) break;
        i = ci;
        continue;
      }
      if (act && act.choice !== undefined) result = act.choice;
      i++;
    }
    $('dialogue').classList.add('hidden');
    this.nav = null;
    this.dialogueOpen = false;
    return result;
  }

  /** Render one page as a little chat: portrait, name and line per row. Resolves with the reader's move. */
  showPage(pages, i, onLine) {
    const page = pages[i];
    const box = $('dlgLines');
    box.innerHTML = '';
    page.lines.forEach(([who, text, anim], k) => {
      const c = CAST[who] || CAST.narrator;
      const row = document.createElement('div');
      row.className = 'dl-row' + (who === 'narrator' ? ' narr' : '') + (who === 'mika' ? ' me' : '') + (who === 'sora' ? ' letter' : '');
      row.style.setProperty('--c', c.color);
      row.style.animationDelay = `${k * 0.14}s`;
      const hasPortrait = ['mika', 'tamo', 'genzo', 'rin', 'ota', 'hana'].includes(who);
      if (who !== 'narrator') {
        const av = document.createElement('div');
        av.className = 'av';
        if (hasPortrait) av.style.backgroundImage = `url(./portraits/${who}.webp)`;
        else { av.style.background = c.color; av.textContent = [...tx(c.name || '?')][0]; }
        row.appendChild(av);
      }
      const bub = document.createElement('div');
      bub.className = 'bub';
      if (c.name) { const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = tx(c.name); bub.appendChild(nm); }
      const t = document.createElement('div');
      t.className = 'tx';
      t.textContent = text;
      bub.appendChild(t);
      row.appendChild(bub);
      box.appendChild(row);
      // gestures and voice blips follow the rows as they appear
      if (onLine) setTimeout(() => { if (this.dialogueOpen) onLine(who, anim); }, k * 420);
      if (who !== 'narrator') setTimeout(() => this.audio?.blip(c.pitch), k * 140);
    });
    box.scrollTop = 0;
    const last = i === pages.length - 1;
    $('dlgPage').textContent = pages.length > 1 ? `${i + 1} / ${pages.length}` : '';
    $('dlgBack').disabled = i === 0;
    $('dlgNext').style.display = page.choice ? 'none' : '';
    $('dlgNextLabel').textContent = tx(last ? N_('Close') : N_('Next'));
    $('dlgSkip').style.visibility = pages.length > 1 && !page.choice ? '' : 'hidden';
    $('dlgChoices').innerHTML = '';
    return new Promise(resolve => {
      const shownAt = performance.now();
      this.nav = move => {
        // a press that arrives with the page itself (a held key, a double tap) must not skip it unread
        if (move === 'next' && performance.now() - shownAt < 180) return;
        if (move === 'back' && i === 0) return;
        if (move === 'next' && page.choice) return;
        this.nav = null;
        this.choiceActive = false;
        this.onChoice = null;
        this.audio?.click();
        resolve(move);
      };
      if (page.choice) this.choice(page.choice).then(v => { this.nav = null; resolve({ choice: v }); });
    });
  }

  choice(options) {
    this.choiceActive = true;
    this.choiceSel = 0;
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
    // Esc and J work on the menus themselves: game input is switched off while paused
    addEventListener('keydown', e => {
      if (!this.overlay || e.repeat) return;
      const field = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.code === 'Escape' || (e.code === 'KeyJ' && this.overlay === 'journal' && !field)) { e.preventDefault(); this.closeOverlay(); }
      else if (e.code === 'KeyJ' && !field && this.game.director?.quest) { e.preventDefault(); this.openJournal(); }
    });
    document.querySelectorAll('#journalTabs button').forEach(b => b.addEventListener('click', () => this.journalTab(b.dataset.tab)));
    const g = this.game;
    const q = $('optQuality');
    q.value = g.renderer.qualityName;
    q.addEventListener('change', () => { g.renderer.setQuality(q.value); this.toast(tx('Graphics setting saved — reload to apply fully')); });
    const load = (k, d) => { try { return JSON.parse(localStorage.getItem(`starline-opt-${k}`)) ?? d; } catch { return d; } };
    const save = (k, v) => { try { localStorage.setItem(`starline-opt-${k}`, JSON.stringify(v)); } catch { /* ignore */ } };
    const sens = $('optSens'), inv = $('optInvert'), mus = $('optMusic'), sfx = $('optSfx'), fps = $('optFps'), diff = $('optDifficulty');
    diff.value = load('difficulty', 'easy');
    sens.value = load('sens', 1); inv.checked = load('invert', false); mus.value = load('music', 0.55); sfx.value = load('sfx', 0.8); fps.checked = load('fps', false);
    // advanced: what you see (season, time, weather), how it renders, how big the words are
    const ADV = { season: '', time: '', weather: true, shadows: true, scale: '', fov: 55, camDist: 6.2, text: '1' };
    const season = $('optSeason'), time = $('optTime'), weather = $('optWeather'), shadows = $('optShadows'), scale = $('optScale'),
      fov = $('optFov'), camDist = $('optCamDist'), text = $('optText');
    const loadAdv = () => {
      season.value = load('season', ADV.season); time.value = load('time', ADV.time); weather.checked = load('weather', ADV.weather);
      shadows.checked = load('shadows', ADV.shadows); scale.value = load('scale', ADV.scale); fov.value = load('fov', ADV.fov);
      camDist.value = load('camDist', ADV.camDist); text.value = load('text', ADV.text);
    };
    loadAdv();
    let lastCam = null;
    const apply = () => {
      g.input.sensitivity = +sens.value; g.input.invertY = inv.checked;
      g.easy = diff.value !== 'normal';
      save('difficulty', diff.value);
      this.audio?.setVolumes(+mus.value, +sfx.value);
      $('fps').classList.toggle('hidden', !fps.checked);
      save('sens', +sens.value); save('invert', inv.checked); save('music', +mus.value); save('sfx', +sfx.value); save('fps', fps.checked);
      g.seasonOverride = season.value || null;
      const tv = time.value;
      g.timeOverride = tv === '' ? null : tv.startsWith('cycle') ? tv : +tv;
      if (typeof g.timeOverride !== 'string') g.cycleHour = undefined;
      g.weatherOff = !weather.checked;
      if (g.world) g.applyLook?.();
      if (g.sky?.sun) g.sky.sun.castShadow = shadows.checked;
      if (g.renderer) { g.renderer.fixedScale = scale.value ? +scale.value : null; if (g.renderer.fixedScale) { g.renderer.scale = g.renderer.fixedScale; g.renderer.resize(); } }
      if (g.follow) { g.follow.fovBase = +fov.value; if (lastCam !== +camDist.value) { g.follow.zoomTarget = +camDist.value; lastCam = +camDist.value; } }
      document.documentElement.style.setProperty('--ui-scale', text.value);
      save('season', season.value); save('time', tv); save('weather', weather.checked); save('shadows', shadows.checked);
      save('scale', scale.value); save('fov', +fov.value); save('camDist', +camDist.value); save('text', text.value);
    };
    [sens, inv, mus, sfx, fps, diff, season, time, weather, shadows, scale, fov, camDist, text].forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', apply));
    $('btnResetAdv').addEventListener('click', () => {
      for (const [k, v] of Object.entries(ADV)) save(k, v);
      loadAdv();
      apply();
    });
    this.applySettings = apply;
    apply();
  }

  /** Show a panel on top of the stack. The one underneath (the pause menu too) hides until this one closes. */
  open(id) {
    if (this.overlay && this.overlay !== id) $(this.overlay).classList.add('hidden');
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
        .map(s => `<div class="step ${STEP_INDEX[s.id] < cur ? 'done' : ''}">${STEP_INDEX[s.id] < cur ? '✓' : '★'} ${esc(tx(s.objective).replace(/\s*[(（]\{\w+\}\/\d+[)）]/g, '').replace(/\{\w+\}/g, ''))}</div>`);
      const lamps = [['forest', 'Forest Lamp'], ['mill', 'Mill Lamp'], ['orchard', 'Orchard Lamp'], ['viaduct', 'Viaduct Lamp']].map(([l, n]) => `${q.lamps[l] ? '🟡' : '⚫'} ${esc(tx(n))}`).join(' &nbsp; ');
      body.innerHTML = `<p>${lamps}</p><h3>${esc(tx(CHAPTERS[q.chapter].title))} — ${esc(tx(CHAPTERS[q.chapter].name))}</h3>${rows.join('')}`;
    } else if (tab === 'pages') {
      const keep = q.keepsakes || [];
      body.innerHTML = JOURNAL.map((p, i) => q.pages.includes(i) ? `<div class="page"><b>${esc(tx(p.title))}</b><br>${esc(tx(p.text))}</div>` : `<div class="page locked"><b>${esc(tx('Page {n}', { n: i + 1 }))}</b><br>${esc(tx('Not found yet.'))}</div>`).join('') +
        `<h3>${esc(tx('Keepsakes'))} · ${keep.length} / ${KEEPSAKES.length}</h3><div class="cards">` +
        KEEPSAKES.map(k => this.cardHTML(keep.includes(k.id), k.model, tx(k.name), keep.includes(k.id) ? tx(k.text) : tx('Still in {place}.', { place: tx(k.where) }))).join('') + '</div>';
    } else if (tab === 'stars') {
      body.innerHTML = `<p>${esc(tx('{n} / 12 found.', { n: q.stars.length }))} ${esc(q.stars.length === 12 ? tx('Sora left one more letter…') : tx('Each star holds a line of Sora\'s poem.'))}</p><div class="grid">` +
        FALLEN_STARS.map((s, i) => q.stars.includes(s.id) ? `<div class="star">★ ${esc(tx(STAR_POEM[i]))}</div>` : `<div class="star locked">☆ ${esc(tx(s.hint))}</div>`).join('') + '</div>';
    } else if (tab === 'fish') {
      const kinds = Object.entries(FISH), caught = kinds.filter(([k]) => q.fishLog[k]).length;
      body.innerHTML = `<p>${esc(tx('{n} of {total} kinds caught', { n: caught, total: kinds.length }))}</p><div class="cards">` + kinds.map(([k, f]) => {
        const n = q.fishLog[k] || 0;
        return this.cardHTML(n > 0, f.icon, tx(f.name), n ? tx(f.desc) : tx(f.hint), n ? `× ${n}` : tx('Not caught yet'), n ? tx(f.hint) : '', f.hue);
      }).join('') + '</div>';
    } else if (tab === 'album') {
      const photos = this.game.director?.album() || {};
      body.innerHTML = `<p>${esc(tx('Every Star Lamp you light throws a party. Each one leaves a photo here.'))}</p><div class="album">` +
        ALBUM.map((a, i) => `<div class="polaroid" style="--tilt:${[-2, 1.5, -1, 2][i % 4]}deg">${photos[a.id] ? `<img alt="" src="${photos[a.id]}">` : '<div class="blank">★</div>'}<p>${esc(tx(a.title))}</p></div>`).join('') + '</div>';
    } else if (tab === 'friends') {
      const met = q.friends || {}, n = FRIENDS.filter(f => met[f.id]).length;
      body.innerHTML = `<p>${esc(tx('{n} of {total} friends made. Walk up to a creature and press E to say hello.', { n, total: FRIENDS.length }))}</p><div class="cards">` +
        FRIENDS.map(f => this.cardHTML(!!met[f.id], f.icon, tx(f.name), met[f.id] ? tx(f.desc) : tx(f.hint), met[f.id] ? '♥' : tx('Not met yet'))).join('') + '</div>';
    } else {
      const row = (keys, text) => `<div class="step">${keys.map(k => `<kbd>${k}</kbd>`).join(' ')} ${esc(tx(text))}</div>`;
      body.innerHTML = this.touch
        ? [row([], N_('Left thumb: move. Drag the right side: look.')), row([tx('Act')], N_('Talk, pick up, light lamps — anything nearby')), row([tx('Jump')], N_('Jump, or swim up in the water')), row([tx('Dive')], N_('Dive while swimming')), row([tx('Kite')], N_('Fly or land the Star Kite, once you have it')), row([tx('Jump'), tx('Jump')], N_('Run and tap Jump twice for a ×4 speed leap (four taps: ×16)'))].join('')
        : [row(['W', 'A', 'S', 'D'], N_('Move')), row(['Shift'], N_('Run faster')), row(['Space'], N_('Jump, or swim up in the water')), row(['C'], N_('Dive while swimming')), row(['G'], N_('Fly or land the Star Kite, once you have it')), row(['W', 'Space', 'Space'], N_('Run forward and tap Space twice for a ×4 speed leap (four taps: ×16)')),
          row(['E'], N_('Talk, pick up, light lamps — anything nearby')), row(['E', 'Q'], N_('Next / back in conversations')), row([tx('Mouse')], N_('Drag to look · wheel to zoom')),
          row(['J'], N_('Journal')), row(['Esc'], N_('Pause')), row(['🎮'], N_('Gamepad supported'))].join('');
    }
  }

  /** A journal card: picture (a silhouette until found), name, tag and a line or two. */
  cardHTML(known, icon, name, text, tag = '', sub = '', hue = 0) {
    const img = icon ? `<span class="pic"><img alt="" src="${this.icon(icon)}" style="${hue ? `filter:hue-rotate(${hue}deg)` : ''}" onerror="this.style.visibility='hidden'"></span>` : '';
    return `<div class="jcard ${known ? '' : 'unknown'}">${img}<div><b>${esc(name)}</b>${tag ? ` <span class="tag">${esc(tag)}</span>` : ''}<p>${esc(text)}</p>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div></div>`;
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
    hold('tDive', 'dive');
    hold('tKite', 'kite');
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
    const title = tx(state.title);
    if ($('fishTitle').textContent !== title) $('fishTitle').textContent = title;
    const bite = state.phase === 'bite';
    $('fishing').classList.toggle('bite', bite);
    $('fishFloat').classList.toggle('bite', bite);
    $('fishBite').style.width = `${state.bite * 100}%`;
  }
  showCooking(on) { $('cooking').classList.toggle('hidden', !on); }
  cooking(state) {
    $('cookProg').style.width = `${state.progress * 100}%`;
  }
  ride(on, lit, total) {
    $('rideHud').classList.toggle('hidden', !on);
    if (on) $('rideText').textContent = tx('Trackside lanterns lit {n} / {total}', { n: lit, total });
  }
  kiteButton(on) {
    if (this._kiteBtn === on) return;
    this._kiteBtn = on;
    $('tKite').classList.toggle('hidden', !on || !this.touch);
  }
  leap(mul) {
    const on = mul > 1;
    if (this._leap === mul) return;
    this._leap = mul;
    $('leap').classList.toggle('hidden', !on);
    if (on) $('leap').textContent = `⚡ ×${mul}`;
  }
  /** A camera flash (for the photographs). */
  flash() {
    const f = $('flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  /** The credits show the year's photographs. */
  creditsAlbum(photos) {
    $('creditsAlbum').innerHTML = ALBUM.filter(a => photos?.[a.id]).map(a => `<img alt="${esc(tx(a.title))}" src="${photos[a.id]}">`).join('');
  }

  swimming(on) {
    if (this._swim === on) return;
    this._swim = on;
    $('tDive').classList.toggle('hidden', !on || !this.touch);
  }
  fpsText(t) { $('fps').textContent = t; }
  error(msg) { const e = $('err'); e.textContent = msg; e.classList.remove('hidden'); }
}
