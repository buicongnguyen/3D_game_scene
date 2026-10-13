// The Mini games picker: a panel of game cards with a tab for each category. Built from JS (no index.html parts), used
// from the title menu (before any game exists) and from the pause menu / the "Mini games" chip in the game.
//   keyboard   arrows move between cards (Up from the top row reaches the tabs, Left / Right change tab), Enter plays, Esc closes
//   touch      cards are 72 px+ buttons in a scroller with momentum
//   gamepad    D-pad / left stick move, A plays, B closes, LB / RB change tab; a focus ring shows where you are
// The picker is data-driven: src/content/minigames.js lists the games; here we only draw them.
import { buildCatalogue, CATEGORIES, SEASON_NAME, recordOf, badgeOf } from '../content/minigames.js';
import { tx, onLangChange } from '../i18n/i18n.js';

const TAB_KEY = 'starline-minigames-tab';
const CSS = `
#mgPicker{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(8,12,30,.62);backdrop-filter:blur(4px);padding:12px;
 font-family:Nunito,system-ui,sans-serif}
#mgPicker.hidden{display:none}
#mgPicker .mg-box{width:min(1020px,100%);height:min(760px,100%);display:flex;flex-direction:column;border-radius:26px;background:#fff8ea;color:#4a3020;
 box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;zoom:var(--ui-scale,1)}
#mgPicker header{display:flex;align-items:center;gap:10px;padding:14px 18px 4px}
#mgPicker h2{margin:0;flex:1;font:600 26px Fredoka,Nunito,sans-serif;color:#7a3e16}
#mgPicker .mg-x{flex:none;min-width:44px;min-height:44px;border:0;border-radius:50%;background:#f4dfb5;color:#5a3a22;font:700 22px Nunito,sans-serif;cursor:pointer}
#mgPicker .mg-sub{margin:0;padding:0 18px 6px;font-weight:700;font-size:14px;color:#7a6a58}
#mgPicker .mg-tabs{display:flex;gap:6px;padding:4px 14px 8px;overflow-x:auto;scrollbar-width:none;flex:none}
#mgPicker .mg-tabs::-webkit-scrollbar{display:none}
#mgPicker .mg-tab{flex:none;min-height:44px;padding:6px 14px;border:0;border-radius:999px;background:#f4dfb5;color:#5a3a22;font:700 15px Nunito,sans-serif;cursor:pointer;
 display:flex;align-items:center;gap:6px;white-space:nowrap}
#mgPicker .mg-tab img{width:24px;height:24px;border-radius:50%;background:#ffe9b8}
#mgPicker .mg-tab[aria-selected=true]{background:#f08a3c;color:#fff}
#mgPicker .mg-tab small{font-weight:700;opacity:.75}
#mgPicker .mg-grid{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:8px 14px 14px;
 display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));grid-auto-rows:max-content;gap:10px;align-content:start;scroll-padding:12px}
#mgPicker .mg-card{position:relative;display:flex;gap:12px;align-items:flex-start;text-align:left;min-height:84px;padding:12px 12px 10px;border:2px solid transparent;border-radius:18px;
 background:#fff;color:#4a3020;box-shadow:0 2px 8px rgba(80,40,0,.12);cursor:pointer;font:600 14px Nunito,sans-serif}
#mgPicker .mg-card:hover{background:#fffdf6}
#mgPicker .mg-card:focus,#mgPicker .mg-card.pad{outline:none;border-color:#f08a3c;box-shadow:0 0 0 3px #f08a3c88,0 4px 14px rgba(80,40,0,.2)}
#mgPicker .mg-tab:focus{outline:3px solid #f08a3c88;outline-offset:1px}
#mgPicker .mg-x:focus{outline:3px solid #f08a3c88}
#mgPicker .mg-ic{flex:none;width:56px;height:56px;border-radius:50%;background:#ffe9b8;object-fit:cover;display:flex;align-items:center;justify-content:center;font:600 26px Fredoka,Nunito,sans-serif;color:#7a3e16}
#mgPicker .mg-tx{flex:1;min-width:0;overflow-wrap:anywhere}
#mgPicker .mg-tx h3{margin:0 0 2px;font:600 18px/1.2 Fredoka,Nunito,sans-serif;color:#7a3e16;padding-right:58px}
#mgPicker .mg-tx p{margin:2px 0 0;line-height:1.3}
#mgPicker .mg-tx .d{font-weight:700}
#mgPicker .mg-tx .w{font-size:12.5px;color:#7a6a58}
#mgPicker .mg-tx .w b{color:#c2541c}
#mgPicker .mg-row{display:flex;gap:8px;align-items:center;margin-top:5px;font-weight:700;font-size:13px}
#mgPicker .mg-stars{color:#f2a51a;letter-spacing:1px;font-size:16px}
#mgPicker .mg-stars i{font-style:normal;color:#d9cdb4}
#mgPicker .mg-stars i.on{color:#f2a51a}
#mgPicker .mg-best{color:#2f8a4a}
#mgPicker .mg-badge{position:absolute;right:10px;top:10px;padding:2px 9px;border-radius:999px;background:#2f8a4a;color:#fff;font:700 12px Nunito,sans-serif}
#mgPicker .mg-badge.new{background:#e0457b}
#mgPicker .mg-quick{flex:none;padding:1px 9px 1px 7px;border-radius:999px;background:#fff1c2;color:#7a4e00;box-shadow:inset 0 0 0 1.5px #f2c14e;font:700 12px Nunito,sans-serif;white-space:nowrap}
#mgPicker .mg-foot{flex:none;padding:6px 18px 10px;font-size:12.5px;font-weight:700;color:#7a6a58;text-align:center}
@media (max-width:560px){
 #mgPicker{padding:0}
 #mgPicker .mg-box{border-radius:0;height:100%}
 #mgPicker .mg-grid{grid-template-columns:1fr}
 #mgPicker h2{font-size:22px}
 #mgPicker .mg-foot{display:none}
}
@media (max-height:480px){#mgPicker .mg-sub,#mgPicker .mg-foot{display:none}#mgPicker header{padding-top:8px}#mgPicker h2{font-size:20px}}
`;

const hh = h => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

export class MinigamePicker {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this.list = [];
    this.tab = null;
    this.resolve = null;
  }

  ensure() {
    if (this.el) return;
    if (!document.getElementById('mgPickerCss')) {
      const s = document.createElement('style'); s.id = 'mgPickerCss'; s.textContent = CSS; document.head.appendChild(s);
    }
    const el = this.el = document.createElement('div');
    el.id = 'mgPicker'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="mg-box"><header><h2></h2><button class="mg-x" type="button" aria-label="Close">×</button></header><p class="mg-sub"></p>
      <div class="mg-tabs" role="tablist"></div><div class="mg-grid" role="list"></div><div class="mg-foot"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('.mg-x').addEventListener('click', () => this.close(null));
    el.addEventListener('pointerdown', e => { if (e.target === el) this.close(null); });
  }

  /** Show the picker. Resolves with the chosen catalogue entry, or null when closed. `st`: the quest state for bests and stars. */
  open({ st = null, current = null, quick = false } = {}) {
    this.ensure();
    if (this.resolve) this.close(null);
    this.st = st; this.current = current;
    this.quick = !!quick;        // the title's list before the valley is loaded: mark the games that start at once
    this.list = buildCatalogue();
    const cats = CATEGORIES.filter(c => this.list.some(e => e.cat === c.id));
    let want = null;
    try { want = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
    this.tab = cats.find(c => c.id === want)?.id || cats[0]?.id || null;
    this.cats = cats;
    this.padMode = false;
    this.render();
    this.el.classList.remove('hidden');
    this.offLang = onLangChange(() => this.render());
    this.onKey = e => this.key(e);
    addEventListener('keydown', this.onKey, true);
    this.startPad();
    this.focusFirst();
    return new Promise(res => { this.resolve = res; });
  }

  close(entry) {
    if (!this.el || !this.resolve) return;
    const res = this.resolve;
    this.resolve = null;
    this.el.classList.add('hidden');
    removeEventListener('keydown', this.onKey, true);
    this.offLang?.(); this.offLang = null;
    cancelAnimationFrame(this.padRaf);
    this.ui.audio?.click?.();
    res(entry);
  }

  recOf(e) { return recordOf(e, this.st); }

  render() {
    const el = this.el;
    el.querySelector('h2').textContent = tx('Mini games');
    el.querySelector('.mg-sub').textContent = tx('Pick any game and play right away. No story needed.');
    el.querySelector('.mg-x').setAttribute('aria-label', tx('Close'));
    el.querySelector('.mg-foot').textContent = tx('Arrows to move · Enter to play · Esc to close');
    const tabs = el.querySelector('.mg-tabs');
    tabs.innerHTML = '';
    for (const c of this.cats) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mg-tab'; b.dataset.cat = c.id; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === this.tab));
      b.tabIndex = c.id === this.tab ? 0 : -1;
      const img = document.createElement('img'); img.alt = ''; img.src = this.ui.icon(c.icon); img.onerror = () => img.remove();
      const span = document.createElement('span'); span.textContent = tx(c.name);
      const n = document.createElement('small'); n.textContent = String(this.list.filter(e => e.cat === c.id).length);
      b.append(img, span, n);
      b.addEventListener('click', () => this.setTab(c.id, true));
      tabs.appendChild(b);
    }
    const grid = el.querySelector('.mg-grid');
    grid.innerHTML = '';
    for (const e of this.list.filter(x => x.cat === this.tab)) grid.appendChild(this.card(e));
  }

  card(e) {
    const rec = this.recOf(e), badge = badgeOf(e, rec);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mg-card'; b.dataset.id = e.id; b.setAttribute('role', 'listitem');
    const ic = document.createElement('img'); ic.className = 'mg-ic'; ic.alt = ''; ic.src = this.ui.icon(e.icon);
    ic.onerror = () => { const g = document.createElement('div'); g.className = 'mg-ic'; g.textContent = (tx(e.name)[0] || '?').toUpperCase(); ic.replaceWith(g); };
    const t = document.createElement('div'); t.className = 'mg-tx';
    const h = document.createElement('h3'); h.textContent = e.kind === 'sky' ? `${tx(e.name)}` : tx(e.name);
    const d = document.createElement('p'); d.className = 'd'; d.textContent = tx(e.desc);
    const w = document.createElement('p'); w.className = 'w';
    const where = document.createElement('b'); where.textContent = tx('Where');
    w.append(where, `: ${tx(e.where)}`);
    const w2 = document.createElement('p'); w2.className = 'w';
    const when = document.createElement('b'); when.textContent = tx('When');
    w2.append(when, `: ${tx(e.when)} · ${tx(SEASON_NAME[e.season])} ${hh(e.hour)}`);
    const row = document.createElement('div'); row.className = 'mg-row';
    const stars = document.createElement('span'); stars.className = 'mg-stars'; stars.setAttribute('aria-label', tx('{n} of 3 stars', { n: rec.stars }));
    for (let i = 0; i < 3; i++) { const s = document.createElement('i'); s.textContent = '★'; if (i < rec.stars) s.className = 'on'; stars.appendChild(s); }
    row.appendChild(stars);
    if (rec.best > 0) { const bs = document.createElement('span'); bs.className = 'mg-best'; bs.textContent = tx('Best: {n}', { n: rec.best }); row.appendChild(bs); }
    if (this.quick && e.quick) {
      // quick start: this one opens in a moment, with no valley to load (a slow phone's best choice)
      const qk = document.createElement('span'); qk.className = 'mg-quick'; qk.textContent = `⚡ ${tx('Quick')}`; qk.title = tx('Starts right away: no valley to load');
      row.appendChild(qk);
    }
    t.append(h, d, w, w2, row);
    b.append(ic, t);
    if (badge) { const bd = document.createElement('span'); bd.className = `mg-badge ${badge}`; bd.textContent = badge === 'new' ? tx('New') : tx('Try me'); b.appendChild(bd); }
    b.addEventListener('click', () => this.close(e));
    return b;
  }

  setTab(id, focusTab = false) {
    if (id === this.tab) return;
    this.tab = id;
    try { localStorage.setItem(TAB_KEY, id); } catch { /* ignore */ }
    this.render();
    if (focusTab) this.el.querySelector(`.mg-tab[data-cat="${id}"]`)?.focus();
    this.el.querySelector('.mg-grid').scrollTop = 0;
  }

  cards() { return [...this.el.querySelectorAll('.mg-card')]; }
  tabsEls() { return [...this.el.querySelectorAll('.mg-tab')]; }

  focusFirst() {
    const cur = this.current && this.cards().find(c => c.dataset.id === this.current);
    (cur || this.cards()[0] || this.tabsEls()[0])?.focus({ preventScroll: true });
  }

  /** Move the focus one step: dir 'up' | 'down' | 'left' | 'right' (cards by their place on the screen). */
  move(dir) {
    const a = document.activeElement, cards = this.cards(), tabs = this.tabsEls();
    this.el.classList.toggle('pad', this.padMode);
    if (a && a.classList.contains('mg-tab')) {
      const i = tabs.indexOf(a);
      if (dir === 'left' || dir === 'right') { const n = tabs[Math.max(0, Math.min(tabs.length - 1, i + (dir === 'right' ? 1 : -1)))]; if (n !== a) this.setTab(n.dataset.cat, true); }
      else if (dir === 'down') cards[0]?.focus();
      return;
    }
    if (!a || !a.classList.contains('mg-card')) { cards[0]?.focus() || tabs[0]?.focus(); return; }
    const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = 1e9;
    for (const c of cards) {
      if (c === a) continue;
      const q = c.getBoundingClientRect(), qx = q.left + q.width / 2, qy = q.top + q.height / 2, dx = qx - cx, dy = qy - cy;
      const ok = dir === 'down' ? dy > r.height * 0.4 : dir === 'up' ? dy < -r.height * 0.4 : dir === 'right' ? dx > r.width * 0.4 && Math.abs(dy) < r.height * 0.6 : dx < -r.width * 0.4 && Math.abs(dy) < r.height * 0.6;
      if (!ok) continue;
      const dist = dir === 'up' || dir === 'down' ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
      if (dist < bd) { bd = dist; best = c; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest' }); }
    else if (dir === 'up') this.el.querySelector('.mg-tab[aria-selected=true]')?.focus();
  }

  key(e) {
    if (e.repeat && e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
    const c = e.code;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    if (c === 'Escape' || c === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); this.close(null); return; }
    if (map[c]) { e.preventDefault(); e.stopImmediatePropagation(); this.padMode = true; this.move(map[c]); return; }
    if (c === 'PageUp' || c === 'BracketLeft' || c === 'PageDown' || c === 'BracketRight') {
      e.preventDefault(); e.stopImmediatePropagation();
      const i = this.cats.findIndex(x => x.id === this.tab), n = this.cats[(i + (c === 'PageDown' || c === 'BracketRight' ? 1 : this.cats.length - 1)) % this.cats.length];
      this.setTab(n.id, false); this.focusFirst();
      return;
    }
    if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') {
      const a = document.activeElement;
      if (a && this.el.contains(a)) { e.preventDefault(); e.stopImmediatePropagation(); a.click(); }
      return;
    }
    if (c === 'Tab') { e.stopImmediatePropagation(); return; }     // the browser's own tab order inside the panel; the game never sees it
    e.stopImmediatePropagation();                                   // nothing else reaches the game while the picker is up
  }

  /** The gamepad: D-pad / left stick, A, B, LB / RB. */
  startPad() {
    let prev = {};
    const poll = () => {
      this.padRaf = requestAnimationFrame(poll);
      const gp = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      if (!gp) return;
      const bt = i => !!gp.buttons[i]?.pressed;
      const now = { a: bt(0), b: bt(1), lb: bt(4), rb: bt(5), up: bt(12) || gp.axes[1] < -0.6, down: bt(13) || gp.axes[1] > 0.6, left: bt(14) || gp.axes[0] < -0.6, right: bt(15) || gp.axes[0] > 0.6 };
      const edge = k => now[k] && !prev[k];
      if (Object.values(now).some(Boolean)) this.padMode = true;
      for (const k of ['up', 'down', 'left', 'right']) if (edge(k)) { this.move(k); this.markPad(); }
      if (edge('lb') || edge('rb')) { const i = this.cats.findIndex(x => x.id === this.tab); this.setTab(this.cats[(i + (edge('rb') ? 1 : this.cats.length - 1)) % this.cats.length].id); this.focusFirst(); this.markPad(); }
      if (edge('a')) { const a = document.activeElement; if (a && this.el.contains(a)) a.click(); }
      if (edge('b')) this.close(null);
      prev = now;
    };
    this.padRaf = requestAnimationFrame(poll);
  }

  markPad() { this.el.querySelectorAll('.mg-card.pad').forEach(x => x.classList.remove('pad')); document.activeElement?.classList.add('pad'); }
}
