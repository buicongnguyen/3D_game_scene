// © 2026 Bui Cong Nguyen · solluxlabs.com
// Explore's two choice panels (docs/EXPLORE-AND-SHOW.md): Go to… (ready-made moments with a small picture each, the four
// seasons, the four times of day, the festival switch) and Play as (Mika and the singers, face tiles like the show's
// Singer picker). Opened from the pause menu (☰), the journal's Map tab (✎) and the show's bar; never in the story.
// Flat tiles, one tap picks and closes (the festival switch flips in place). Every tile 44 px+, text 11 px+. The rules and
// the travelling are game/valley-clock.js and game/goto.js; the bodies game/play-as.js.
import { tx, N_ } from '../i18n/i18n.js';
import { MOMENTS, SEASONS, SEASON_LABELS, TIMES, landingLabel, calendarOf } from '../game/valley-clock.js';
import { playAsName, playAsPic, MIKA } from '../game/play-as.js';
import { timeIcon } from '../game/singplay/time-row.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtHour = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** The moments' little pictures (inline SVG, 72 x 44): a sky for the hour and the moment's own motif. */
const PICTURES = Object.freeze({
  blossom: '<defs><linearGradient id="xpb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd3f2"/><stop offset="1" stop-color="#fde3c4"/></linearGradient></defs><rect width="72" height="44" fill="url(#xpb)"/><path d="M0 36 Q18 30 36 34 T72 32 V44 H0Z" fill="#7cb86a"/><path d="M14 36 V22" stroke="#6b4a32" stroke-width="2"/><circle cx="14" cy="18" r="9" fill="#f7b6cd"/><circle cx="22" cy="21" r="6" fill="#f3a3c0"/><circle cx="56" cy="12" r="5" fill="#fff6c8"/><g fill="#f7b6cd"><circle cx="34" cy="14" r="1.6"/><circle cx="44" cy="22" r="1.4"/><circle cx="30" cy="26" r="1.3"/><circle cx="52" cy="28" r="1.5"/></g>',
  festival: '<rect width="72" height="44" fill="#1b2142"/><circle cx="60" cy="9" r="4" fill="#fff4c2"/><g fill="#fff" opacity=".8"><circle cx="10" cy="8" r=".8"/><circle cx="24" cy="5" r=".7"/><circle cx="44" cy="10" r=".7"/></g><path d="M4 16 Q36 26 68 16" stroke="#e9d3a6" stroke-width=".8" fill="none"/><g><ellipse cx="14" cy="20" rx="3" ry="3.6" fill="#ff5a3a"/><ellipse cx="25" cy="22.5" rx="3" ry="3.6" fill="#ffc23a"/><ellipse cx="36" cy="23.4" rx="3" ry="3.6" fill="#ff6fa0"/><ellipse cx="47" cy="22.5" rx="3" ry="3.6" fill="#ff8a2e"/><ellipse cx="58" cy="20" rx="3" ry="3.6" fill="#ff5a3a"/></g><path d="M0 40 H72 V44 H0Z" fill="#2c2a3a"/><g fill="#d6f56a"><circle cx="20" cy="34" r="1"/><circle cx="50" cy="31" r="1.1"/><circle cx="38" cy="36" r=".9"/></g>',
  leaves: '<defs><linearGradient id="xpl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c98a"/><stop offset="1" stop-color="#f1e1b8"/></linearGradient></defs><rect width="72" height="44" fill="url(#xpl)"/><path d="M0 34 Q24 28 48 33 T72 31 V44 H0Z" fill="#b9873f"/><path d="M52 34 V20" stroke="#5b3a24" stroke-width="2"/><circle cx="52" cy="16" r="10" fill="#e06a2c"/><circle cx="44" cy="20" r="6" fill="#f0a030"/><g fill="#d9562a"><path d="M16 12 l3 2 -3 2 -3 -2z"/><path d="M28 22 l3 2 -3 2 -3 -2z"/><path d="M8 26 l3 2 -3 2 -3 -2z"/></g>',
  snow: '<defs><linearGradient id="xps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6c9a"/><stop offset="1" stop-color="#c9b6c8"/></linearGradient></defs><rect width="72" height="44" fill="url(#xps)"/><path d="M0 32 Q20 26 40 31 T72 29 V44 H0Z" fill="#f4f7fb"/><path d="M48 30 l8 -8 l8 8z" fill="#7a4a36"/><rect x="50" y="30" width="12" height="7" fill="#9b6a4a"/><rect x="54" y="32" width="4" height="3" fill="#ffd27a"/><g fill="#fff"><circle cx="10" cy="10" r="1.2"/><circle cx="22" cy="18" r="1"/><circle cx="34" cy="8" r="1.3"/><circle cx="30" cy="24" r="1"/><circle cx="16" cy="28" r="1.1"/></g>',
});
const picture = id => `<svg viewBox="0 0 72 44" width="72" height="44" aria-hidden="true" focusable="false">${PICTURES[id] || ''}</svg>`;
const SEASON_ICONS = Object.freeze({
  spring: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="6" r="3"/><circle cx="17.5" cy="10" r="3"/><circle cx="15.5" cy="16.5" r="3"/><circle cx="8.5" cy="16.5" r="3"/><circle cx="6.5" cy="10" r="3"/>',
  summer: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  autumn: '<path d="M12 21V12M12 12c-5 0-8-4-7-9 3 3 7 3 7 9zm0 0c5 0 8-4 7-9-3 3-7 3-7 9z"/>',
  winter: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9.5 4 12 6.5 14.5 4M9.5 20 12 17.5 14.5 20"/>',
});
const ico = body => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const TITLES = Object.freeze({ goto: N_('Go to…'), playAs: N_('Play as') });

/** The panels and the buttons that open them (pause menu, journal map). One per UI. */
export class ExplorePanels {
  constructor(ui, game, director) {
    this.ui = ui; this.g = game; this.d = director; this.el = null; this.kind = null;
    this.style();
  }
  get usable() { return !!this.d.explore && !this.g.zone && !!this.d.goto; }

  style() {
    if (document.getElementById('xpStyle')) return;
    const st = document.createElement('style'); st.id = 'xpStyle';
    st.textContent = PANEL_STYLE;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- the doors
  /** The pause menu's two buttons (shown in Explore while nothing else owns the game: refreshed when the menu opens). */
  mountPause() {
    const after = document.getElementById('btnPauseSingHere') || document.getElementById('btnPausePhoto') || document.getElementById('btnPauseMini');
    if (!after || document.getElementById('btnPauseGoto')) return;
    const mk = (id, key, fn) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'hidden'; b.textContent = tx(key); b.dataset.k = key; b.addEventListener('click', () => { this.ui.audio?.click?.(); fn(); }); return b; };
    const go = mk('btnPauseGoto', TITLES.goto, () => this.open('goto')), as = mk('btnPausePlayAs', TITLES.playAs, () => this.open('playAs'));
    after.after(go, as);
  }
  refreshPause() {
    for (const id of ['btnPauseGoto', 'btnPausePlayAs']) {
      const b = document.getElementById(id); if (!b) continue;
      b.classList.toggle('hidden', !this.usable);
      b.textContent = tx(b.dataset.k);
    }
  }
  /** The journal's Map tab: the two buttons over the map. */
  journalRow(body) {
    if (!this.usable || body.querySelector('.xp-journal')) return;
    const row = document.createElement('div'); row.className = 'xp-journal';
    const now = document.createElement('span'); now.className = 'xp-now'; now.textContent = this.nowText();
    const mk = (key, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'xp-door'; b.textContent = tx(key); b.addEventListener('click', () => { this.ui.audio?.click?.(); fn(); }); return b; };
    row.append(now, mk(TITLES.goto, () => this.open('goto')), mk(TITLES.playAs, () => this.open('playAs')));
    body.prepend(row);
  }
  /** "Summer, day 3 · 20:30 · Festival" */
  nowText() {
    const c = calendarOf(this.d.q?.state);
    return [tx('{season}, day {n}', { season: tx(SEASON_LABELS[c.season]), n: c.sd + 1 }), fmtHour(this.g.time.hour), c.festival ? tx(N_('Festival')) : ''].filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------- the panel
  open(kind) {
    if (!this.usable) return;
    this.close();
    this.kind = kind;
    const el = this.el = document.createElement('div');
    el.id = 'xpPanel'; el.className = 'xp-panel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'xpTitle');
    el.innerHTML = `<div class="xp-sheet"><header><h2 id="xpTitle"></h2><button type="button" class="xp-close" aria-label="${esc(tx(N_('Close')))}">✕</button></header><div class="xp-body"></div></div>`;
    el.querySelector('.xp-close').addEventListener('click', () => this.close());
    el.addEventListener('pointerdown', e => { if (e.target === el) { e.preventDefault(); this.close(); } });
    this.key = e => { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.close(); } };
    addEventListener('keydown', this.key, true);
    document.body.appendChild(el);
    this.render();
    el.querySelector('.xp-tile, .xp-switch, .xp-close')?.focus();
  }
  close() { this.el?.remove(); this.el = null; this.kind = null; if (this.key) removeEventListener('keydown', this.key, true); this.key = null; }

  render() {
    const el = this.el; if (!el) return;
    el.querySelector('#xpTitle').textContent = tx(TITLES[this.kind]);
    const body = el.querySelector('.xp-body'); body.textContent = '';
    if (this.kind === 'goto') this.renderGoto(body); else this.renderPlayAs(body);
  }

  section(body, title, cls = '') {
    const s = document.createElement('section'); s.className = `xp-sec ${cls}`;
    const h = document.createElement('h3'); h.textContent = tx(title); s.appendChild(h);
    const row = document.createElement('div'); row.className = 'xp-row'; row.setAttribute('role', 'listbox'); row.setAttribute('aria-label', tx(title)); s.appendChild(row);
    body.appendChild(s);
    return row;
  }
  tile(row, { art, name, sub, picked = false, disabled = false, onPick, cls = '' }) {
    const b = document.createElement('button'); b.type = 'button'; b.className = `xp-tile ${cls}`; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(picked));
    if (disabled) b.setAttribute('aria-disabled', 'true');
    b.innerHTML = `<span class="xp-art">${art || ''}</span><span class="xp-name">${esc(name)}</span>${sub ? `<span class="xp-sub">${esc(sub)}</span>` : ''}`;
    b.addEventListener('click', () => { if (disabled) return; this.ui.audio?.click?.(); onPick(); });
    row.appendChild(b);
    return b;
  }

  renderGoto(body) {
    const t = this.d.goto, cal = t.cal(), ok = t.state();
    const now = document.createElement('p'); now.className = 'xp-note'; now.textContent = this.nowText(); body.appendChild(now);
    const land = to => { const l = landingLabel(cal, to); return tx(l.key, l.vars.season ? { season: tx(l.vars.season), n: l.vars.n } : l.vars); };
    const go = to => { this.close(); this.leaveMenus(); this.d.goto.go(to); };
    const moments = this.section(body, N_('Moments'), 'xp-moments');
    for (const m of MOMENTS) this.tile(moments, { art: picture(m.id), name: tx(m.name), sub: land(m), disabled: !ok.ok, onPick: () => go({ season: m.season, hour: m.hour, festival: m.festival }), cls: 'pic' });
    const seasons = this.section(body, N_('Season'));
    for (const s of SEASONS) this.tile(seasons, { art: ico(SEASON_ICONS[s]), name: tx(SEASON_LABELS[s]), sub: land({ season: s }), picked: cal.season === s, disabled: !ok.ok, onPick: () => go({ season: s }) });
    const times = this.section(body, N_('Time of day'));
    for (const c of TIMES) this.tile(times, { art: timeIcon(c.id), name: tx(c.label), sub: `${fmtHour(c.hour)} · ${land({ hour: c.hour })}`, disabled: !ok.ok, onPick: () => go({ hour: c.hour }) });
    // the festival: a switch, flipped in place (no time passes)
    const fs = document.createElement('section'); fs.className = 'xp-sec';
    const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'xp-switch'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(cal.festival));
    sw.innerHTML = `<span class="xp-sw-l">${esc(tx(N_('Festival')))}</span><span class="xp-sw-v">${esc(tx(cal.festival ? N_('On') : N_('Off')))}</span>`;
    if (!ok.ok) sw.setAttribute('aria-disabled', 'true');
    sw.addEventListener('click', async () => { if (!this.d.goto.state().ok) return; this.ui.audio?.click?.(); await this.d.goto.go({ festival: !this.d.goto.cal().festival }, { fade: false }); this.render(); });
    fs.appendChild(sw);
    const fn = document.createElement('p'); fn.className = 'xp-note'; fn.textContent = tx(N_('Lanterns, fireflies at night, people out late and a festival stage on the Takamori square, in any season.'));
    fs.appendChild(fn);
    body.appendChild(fs);
    const rule = document.createElement('p'); rule.className = 'xp-note';
    rule.textContent = ok.ok ? tx(N_('Time only moves forward: the days you skip are lived (a new stamp card, new visitors).')) : tx(ok.reason === 'song' ? N_('Stop the song first') : N_("Time can't move right now"));
    body.appendChild(rule);
  }

  renderPlayAs(body) {
    const pa = this.d.playAs; if (!pa) return;
    const busy = !!this.d.performing || pa.mikaNeeded();
    const row = this.section(body, N_('Who walks the valley'), 'xp-faces');
    for (const id of pa.list()) {
      const art = `<img src="${playAsPic(id)}" alt="" width="56" height="56" loading="lazy">`;
      this.tile(row, { art, name: playAsName(id), picked: pa.chosen === id, disabled: busy, cls: `face${pa.wait === id ? ' wait' : ''}`,
        onPick: () => {
          this.close(); this.leaveMenus();
          // (the show open: Mika closes it, she cannot perform; a singer becomes the show's singer too)
          const sp = this.g.singplay?.isOpen ? this.g.singplay : null;
          if (sp && id === MIKA) sp.close();
          if (sp && id !== MIKA) sp.pickSinger(id); else pa.choose(id);
        } });
    }
    const note = document.createElement('p'); note.className = 'xp-note';
    note.textContent = busy ? tx(N_('Not during a song or a game')) : tx(N_('Games, rides and the workshop are played as Mika; the valley still calls you Mika.'));
    body.appendChild(note);
  }

  /** A pick from the pause menu or the journal: back to the valley first. */
  leaveMenus() { if (this.ui.overlay) { this.ui.closeAll?.(); this.g.togglePause?.(false, true); } }
}

const PANEL_STYLE = `.xp-panel{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(20,14,8,.35);padding:calc(12px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px));font-family:var(--ui,Nunito,system-ui,sans-serif)}
.xp-sheet{box-sizing:border-box;width:min(640px,100%);max-height:100%;overflow:auto;background:#fff8ec;color:#3a2a1a;border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.35);padding:12px 16px 16px}
.xp-sheet header{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:-12px;background:#fff8ec;padding:4px 0 6px;z-index:1}
.xp-sheet h2{margin:0;font-size:20px}.xp-sec h3{margin:10px 0 6px;font-size:14px;text-transform:none;color:#6a4a2a}
.xp-close{min-width:44px;min-height:44px;border:0;border-radius:22px;background:#f1e3c8;color:#3a2a1a;font-size:18px;cursor:pointer}
.xp-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.xp-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:64px;padding:6px 4px;border:2px solid transparent;border-radius:12px;background:#f6ead3;color:#3a2a1a;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.xp-tile[aria-selected=true]{border-color:#e2a33a;background:#ffe9b8}.xp-tile[aria-disabled=true]{opacity:.5;cursor:default}
.xp-tile:focus{outline:none}.xp-tile:focus-visible,.xp-switch:focus-visible,.xp-close:focus-visible{outline:3px solid #ffb84d;outline-offset:2px}
.xp-art{display:flex;align-items:center;justify-content:center;min-height:24px}.xp-art svg{display:block;border-radius:6px}.xp-tile.face img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#e8dcc4}
.xp-tile.wait img{animation:xpPulse 1s ease-in-out infinite}@keyframes xpPulse{50%{opacity:.45}}
.xp-name{font-size:14px;font-weight:800;line-height:1.15;text-align:center}.xp-sub{font-size:12px;font-weight:600;line-height:1.15;color:#7a5a3a;text-align:center}
.xp-switch{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;margin-top:10px;padding:0 16px;border:0;border-radius:24px;background:#f6ead3;color:#3a2a1a;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
.xp-switch[aria-checked=true]{background:#ffd98a}.xp-switch[aria-disabled=true]{opacity:.5}.xp-sw-v{min-width:56px;text-align:center;padding:6px 10px;border-radius:16px;background:#fff8ec}
.xp-note{margin:8px 0 0;font-size:13px;line-height:1.35;color:#6a4a2a}
.xp-journal{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px}.xp-now{flex:1 1 auto;font-size:13px;font-weight:700;color:#6a4a2a;min-width:0}
.xp-door{min-height:44px;padding:0 14px;border:0;border-radius:22px;background:#ffe9a8;color:#3a2a1a;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
@media (max-width:520px){.xp-row{grid-template-columns:repeat(2,minmax(0,1fr))}.xp-moments{}.xp-faces .xp-row{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:640px),(max-height:480px){.xp-panel{align-items:flex-end;padding-bottom:0}.xp-sheet{border-radius:18px 18px 0 0;max-height:88vh;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}}
@media (max-height:480px) and (orientation:landscape){.xp-row{grid-template-columns:repeat(4,minmax(0,1fr))}.xp-faces .xp-row{grid-template-columns:repeat(5,minmax(0,1fr))}}`;
