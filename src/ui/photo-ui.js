import { tx, N_ } from '../i18n/i18n.js';
import { FILTERS, FRAMES, LENSES, ROLLS } from '../game/photo.js';
import { drawFrame } from './photo-frame.js';

// Photo mode's screen (game/photo-mode.js owns the state): the frame canvas over the picture, a gesture surface over
// the game's canvas (so the game's own touch stick and look-drag never see these touches: input.js binds them on the
// canvas), the top bar, the tray of chips and the card after a shot. Built from JS when the mode opens and removed
// when it closes; its styles come with it (#photoCss). Keys are read in the capture phase, so the game's own key
// handlers (and the pause menu's Esc) never see the ones photo mode uses; WASD and the arrows pass through to input.js.
// On a phone held upright the tray starts folded (tabs and the shutter row only, clear of Mika); a tab opens its chips,
// the open tab or a touch on the picture folds them again, and while a finger is on the picture the controls step
// aside so the whole framed picture shows.

const OWN = new Set(['KeyQ', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'KeyT', 'KeyF', 'KeyB', 'KeyG', 'KeyH', 'KeyR', 'Space', 'Enter', 'NumpadEnter', 'Escape', 'KeyV', 'Backspace']);
const TABS = [['pose', N_('Pose')], ['filter', N_('Filter')], ['frame', N_('Frame')], ['lens', N_('Lens')]];
const CARD_MS = 10000;          // the card after a shot, untouched (a touch or a focus keeps it until the next shot)
const WIDE = '(min-aspect-ratio: 4/3)';

const CSS = `
body.photo-mode #hud, body.photo-mode #touch, body.photo-mode #barks, body.photo-mode #mgChip { visibility: hidden !important; }
/* (toasts stay: a full album or a refused storage is said there, over the photo's controls and clear of the top bar) */
body.photo-mode #hud { z-index: 19; }
body.photo-mode #toasts { visibility: visible; top: 42%; }
#photoMode { position: fixed; inset: 0; z-index: 16; pointer-events: none; }
#photoMode .ph-frame { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 16; pointer-events: none; }
#photoMode .ph-surface { position: absolute; inset: 0; z-index: 17; pointer-events: auto; touch-action: none; cursor: grab; }
#photoMode .ph-surface:active { cursor: grabbing; }
#photoMode .ph-ui { position: absolute; inset: 0; z-index: 18; pointer-events: none; zoom: var(--ui-scale, 1); transition: opacity 0.12s; }
/* a finger on the picture: the controls step aside, so the whole framed picture (caption band included) shows */
#photoMode.peek .ph-ui { opacity: 0; }
#photoMode.peek .ph-ui * { pointer-events: none !important; }
#photoMode .ph-top { position: absolute; top: calc(10px + var(--safe-t)); left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#photoMode button { pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; }
#photoMode button:focus-visible { outline: 3px solid var(--gold-deep); outline-offset: 2px; }
#photoMode .ph-btn { min-height: 44px; min-width: 44px; padding: 0 16px; border: 0; border-radius: 14px; background: rgba(255, 247, 232, 0.92); color: var(--ink); font: 700 15px var(--ui); box-shadow: var(--shadow); }
#photoMode .ph-btn[aria-pressed="true"] { background: var(--gold); color: #3b1c05; }
#photoMode .ph-done { font: 600 17px var(--head); background: linear-gradient(180deg, #ffd66b, #f2a33a); color: #3b1c05; padding: 0 20px; }
#photoMode .ph-hint { position: absolute; top: calc(64px + var(--safe-t)); left: 16px; right: 16px; margin: 0; text-align: center; transition: opacity 0.6s; }
#photoMode .ph-hint span { display: inline-block; max-width: 520px; padding: 6px 14px; border-radius: 14px; background: rgba(11, 16, 36, 0.62); color: #fff7e8; font: 700 13px/1.35 var(--ui); }
#photoMode .ph-hint.gone { opacity: 0; }
#photoMode .ph-tray { position: absolute; left: 50%; bottom: calc(12px + var(--safe-b)); transform: translateX(-50%); width: min(calc(100% - 32px), 520px); box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; gap: 8px; background: rgba(255, 247, 232, 0.84); border-radius: var(--r); box-shadow: var(--shadow); backdrop-filter: blur(8px); pointer-events: auto; }
/* tab labels never wrap: when one does not fit, the row turns two by two (PhotoUI.fitTabs) */
#photoMode .ph-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
#photoMode .ph-tabs.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
#photoMode .ph-tab { min-height: 44px; border: 0; border-radius: 12px; background: rgba(28, 35, 64, 0.07); color: var(--ink-soft); font: 600 15px/1.1 var(--head); padding: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#photoMode .ph-tab[aria-pressed="true"] { background: var(--ink); color: #fff7e8; }
/* three rows of chips (3 x 44 + 2 x 8 + 2 x 1 padding), the same on every tab, so the tab bar never moves under a finger */
#photoMode .ph-chips { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 8px; height: 150px; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; padding: 1px; }
/* more chips below: the last row fades out */
#photoMode .ph-chips.more { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent); }
#photoMode .ph-chip { min-height: 44px; padding: 0 14px; border: 2px solid rgba(242, 181, 58, 0.55); border-radius: 999px; background: #fff; color: var(--ink); font: 700 14px/1.15 var(--ui); }
#photoMode .ph-chip[aria-pressed="true"] { background: var(--gold); border-color: var(--gold); color: #3b1c05; }
#photoMode .ph-chip.toggle::before { content: '○ '; }
#photoMode .ph-chip.toggle[aria-pressed="true"]::before { content: '● '; }
#photoMode .ph-note { flex-basis: 100%; margin: 2px 4px; font: 700 13px/1.3 var(--ui); color: var(--ink-soft); }
#photoMode .ph-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
#photoMode .ph-row .ph-btn { box-shadow: none; background: rgba(28, 35, 64, 0.08); font-size: 14px; padding: 0 12px; line-height: 1.15; }
#photoMode .ph-row .ph-reset { justify-self: start; }
#photoMode .ph-row .ph-hide { justify-self: end; }
#photoMode .ph-shutter { width: 68px; height: 68px; border-radius: 50%; border: 4px solid #fff; padding: 0; background: radial-gradient(circle, #fff 0 50%, var(--gold) 52% 100%); box-shadow: 0 0 0 3px var(--gold-deep), var(--shadow); transition: transform 0.1s; }
#photoMode .ph-shutter:active { transform: scale(0.92); }
#photoMode .ph-card { position: absolute; top: calc(62px + var(--safe-t)); left: 50%; transform: translateX(-50%); width: min(calc(100% - 32px), 380px); box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 10px; background: rgba(255, 247, 232, 0.96); border-radius: var(--r); box-shadow: var(--shadow); pointer-events: auto; animation: rise 0.25s ease; }
#photoMode .ph-card img { flex: 0 0 auto; width: auto; height: auto; max-width: 120px; max-height: 96px; border-radius: 3px; box-shadow: 0 3px 10px rgba(28, 35, 64, 0.3); }
#photoMode .ph-card .ph-cbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
#photoMode .ph-card b { font: 600 16px var(--head); }
#photoMode .ph-card .ph-cbtns { display: flex; flex-wrap: wrap; gap: 8px; }
#photoMode .ph-card .ph-btn { box-shadow: none; background: rgba(28, 35, 64, 0.08); font-size: 14px; padding: 0 14px; }
#photoMode .ph-card .ph-save { background: linear-gradient(180deg, #ffd66b, #f2a33a); color: #3b1c05; }
#photoMode .hidden { display: none !important; }
#photoMode.bare .ph-top, #photoMode.bare .ph-tray, #photoMode.bare .ph-hint, #photoMode.bare .ph-card { display: none; }
/* upright: the tray can fold to its tabs and the shutter row */
@media not all and (min-aspect-ratio: 4/3) {
  #photoMode .ph-tray.folded .ph-chips { display: none; }
}
/* a wide screen (a desktop, a phone on its side): the tray is a column on the right, clear of Mika in the middle */
@media (min-aspect-ratio: 4/3) {
  #photoMode .ph-tray { left: auto; right: calc(16px + env(safe-area-inset-right, 0px)); top: calc(10px + var(--safe-t)); bottom: auto; max-height: calc(100% - 20px - var(--safe-t) - var(--safe-b)); transform: none; width: 284px; }
  #photoMode .ph-chips { height: auto; max-height: none; flex: 0 1 auto; min-height: 0; }
  #photoMode .ph-top { right: calc(316px + env(safe-area-inset-right, 0px)); left: calc(16px + env(safe-area-inset-left, 0px)); }
  #photoMode .ph-hint { right: calc(316px + env(safe-area-inset-right, 0px)); left: calc(16px + env(safe-area-inset-left, 0px)); }
  #photoMode .ph-card { left: calc(16px + env(safe-area-inset-left, 0px)); transform: none; width: min(calc(100% - 348px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), 380px); }
}
/* a phone on its side: the column runs the full height, narrower */
@media (min-aspect-ratio: 4/3) and (max-height: 500px) {
  #photoMode .ph-tray { width: 260px; bottom: calc(10px + var(--safe-b)); max-height: none; }
  #photoMode .ph-chips { flex: 1 1 auto; }
  #photoMode .ph-top { right: calc(292px + env(safe-area-inset-right, 0px)); }
  #photoMode .ph-hint { right: calc(292px + env(safe-area-inset-right, 0px)); top: calc(60px + var(--safe-t)); }
  #photoMode .ph-card { width: min(calc(100% - 324px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), 380px); top: calc(60px + var(--safe-t)); }
}
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };

export class PhotoUI {
  constructor(mode) {
    this.mode = mode;
    const g = mode.g;
    this.touch = !!g.ui.touch;
    this.held = { q: false, e: false };
    this.hidden = false;
    this.tab = 'pose';
    this.folded = this.upright();     // a phone held upright starts with the chips folded away, clear of Mika
    this.cardHeld = false;
    this.cardKeep = false;
    this.acc = { ox: 0, oy: 0, px: 0, py: 0, zoom: 1 };
    this.pts = new Map();
    if (!document.getElementById('photoCss')) { const s = el('style'); s.id = 'photoCss'; s.textContent = CSS; document.head.appendChild(s); }
    const root = this.root = el('div'); root.id = 'photoMode';
    this.canvas = el('canvas', 'ph-frame');
    this.surface = el('div', 'ph-surface');
    const ui = el('div', 'ph-ui');
    // top bar
    const top = el('div', 'ph-top');
    const done = btn('ph-btn ph-done', tx('Done'));
    done.addEventListener('click', () => mode.exit());
    this.gridBtn = btn('ph-btn ph-grid', tx('Grid'));
    this.gridBtn.setAttribute('aria-pressed', String(!!mode.choice.grid));   // (the grid is kept from the last time)
    this.gridBtn.addEventListener('click', () => mode.setGrid(!mode.choice.grid));
    top.append(done, this.gridBtn);
    this.hint = el('p', 'ph-hint');
    this.hint.append(el('span', '', this.touch ? tx('Drag to look · pinch to zoom · two fingers to move')
      : g.input.lastDevice === 'gamepad' ? tx('Right stick looks · left stick moves · triggers zoom · A takes the photo')
        : tx('Drag to look · right-drag or WASD to move · wheel to zoom · Space takes the photo')));
    this.hintTimer = setTimeout(() => this.hint.classList.add('gone'), 4000);
    // the card after a shot: kept while a pointer is over it, and for good once it is touched or focused
    this.card = el('div', 'ph-card hidden');
    this.card.addEventListener('pointerenter', () => clearTimeout(this.cardTimer));
    this.card.addEventListener('pointerleave', () => this.armCard());
    for (const ev of ['pointerdown', 'focusin']) this.card.addEventListener(ev, () => this.holdCard());
    // the tray: tabs, chips, and the row with the shutter
    const tray = this.tray = el('div', 'ph-tray');
    const tabs = this.tabRow = el('div', 'ph-tabs');
    this.tabBtns = TABS.map(([id, label]) => {
      const b = btn('ph-tab', tx(label)); b.dataset.tab = id;
      b.addEventListener('click', () => {
        if (id === this.tab && !this.folded) this.setFolded(true);
        else { this.showTab(id); this.setFolded(false); }
      });
      return b;
    });
    tabs.append(...this.tabBtns);
    this.chips = el('div', 'ph-chips');
    this.chips.addEventListener('scroll', () => this.fadeChips(), { passive: true });
    const row = el('div', 'ph-row');
    const reset = btn('ph-btn ph-reset', tx('Reset view'));
    reset.addEventListener('click', () => mode.resetView());
    const shutter = btn('ph-shutter'); shutter.setAttribute('aria-label', tx('Take photo')); shutter.title = tx('Take photo');
    shutter.addEventListener('click', () => mode.shutter());
    const hide = btn('ph-btn ph-hide', tx('Hide controls'));
    hide.addEventListener('click', () => this.setHidden(true));
    row.append(reset, shutter, hide);
    tray.append(tabs, this.chips, row);
    ui.append(top, this.hint, this.card, tray);
    root.append(this.canvas, this.surface, ui);
    // a click by mouse or finger leaves no focus on a control, so Space and Enter stay the shutter; a control reached
    // with Tab keeps its focus and Enter presses it (key())
    root.addEventListener('click', e => { if (e.detail > 0) e.target.closest?.('button')?.blur(); }, true);
    document.body.appendChild(root);
    this.bindGestures();
    this.onKey = e => this.key(e, true);
    this.onKeyUp = e => this.key(e, false);
    this.onResize = () => { this.resetGestures(); if (!this.upright()) this.setFolded(false); this.fitTabs(); this.fadeChips(); this.redrawFrame(); mode.applyFilter(); };
    this.onBlur = () => this.resetGestures();
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', this.onKeyUp, true);
    addEventListener('resize', this.onResize);
    addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.showTab('pose');
    this.setFolded(this.folded);
    this.fitTabs();
    this.redrawFrame();
    document.fonts?.ready.then(() => { if (this.root.isConnected) { this.fitTabs(); this.fadeChips(); this.redrawFrame(); } });
  }

  destroy() {
    clearTimeout(this.hintTimer); clearTimeout(this.cardTimer);
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('keyup', this.onKeyUp, true);
    removeEventListener('resize', this.onResize);
    removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    this.canvas.width = 0;
    this.root.remove();
  }

  // ------------------------------------------------------------------ keys
  /** Photo mode's keys, in the capture phase: kept from the game and the menus (skygaze.js does the same). */
  key(e, down) {
    if (!OWN.has(e.code)) return;
    // the browser's and the system's shortcuts (Ctrl/Cmd+R, F, 1-3, V...) stay theirs; a key let go always counts (Q/E)
    if (down && (e.ctrlKey || e.metaKey || e.altKey) && e.code !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation();
    const m = this.mode;
    // Enter on a control reached with the keyboard presses it (Save picture, Share, a chip, Done); Space stays the shutter
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target instanceof HTMLButtonElement && this.root.contains(e.target)) {
      if (down && !e.repeat) e.target.click();
      return;
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE') { this.held[e.code === 'KeyQ' ? 'q' : 'e'] = down; return; }
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3': m.setLens(LENSES[+e.code.slice(5) - 1].id); this.showTab('lens'); break;
      case 'KeyT': m.step('pose', 1); break;
      case 'KeyF': m.step('filter', 1); break;
      case 'KeyB': m.step('frame', 1); break;
      case 'KeyG': m.setGrid(!m.choice.grid); break;
      case 'KeyH': this.setHidden(!this.hidden); break;
      case 'KeyR': m.resetView(); break;
      case 'Space': case 'Enter': case 'NumpadEnter': m.shutter(); break;
      default: m.exit();             // Esc, V, Backspace
    }
  }

  // ------------------------------------------------------------------ gestures
  /** What the pointers did since the last frame: orbit (ox, oy px), pan (px, py px) and a dolly factor. */
  takeGestures() {
    const a = this.acc, out = { ...a };
    a.ox = a.oy = a.px = a.py = 0; a.zoom = 1;
    return out;
  }

  resetGestures() {
    for (const id of this.pts.keys()) { try { this.surface.releasePointerCapture(id); } catch { /* gone */ } }
    this.pts.clear();
    this.root.classList.remove('peek');
    this.held.q = this.held.e = false;
    this.acc.ox = this.acc.oy = this.acc.px = this.acc.py = 0; this.acc.zoom = 1;
  }

  bindGestures() {
    const s = this.surface, pts = this.pts, inp = this.mode.g.input;
    const two = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span: Math.hypot(a.x - b.x, a.y - b.y) }; };
    s.addEventListener('contextmenu', e => e.preventDefault());
    s.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { s.setPointerCapture(e.pointerId); } catch { /* fine */ }
      const touch = e.pointerType !== 'mouse';
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), pan: !touch && (e.button === 2 || e.shiftKey), touch });
      // composing: the chips fold away, and a finger shows the whole picture while it is down
      this.setFolded(true);
      if (touch && !this.hidden) this.root.classList.add('peek');
    });
    s.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const sens = inp.sensitivity || 1, inv = inp.invertY ? -1 : 1;
      if (p.touch && pts.size >= 2) {
        const before = two();
        p.x = e.clientX; p.y = e.clientY;
        const after = two();
        this.acc.px += after.x - before.x; this.acc.py += after.y - before.y;
        if (before.span > 8 && after.span > 8) this.acc.zoom *= before.span / after.span;
        p.moved = true;
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.moved = true;
      if (p.pan || (!p.touch && e.shiftKey)) { this.acc.px += dx; this.acc.py += dy; }
      else { const k = (p.touch ? 1.35 : 1) * sens; this.acc.ox += dx * k; this.acc.oy += dy * k * inv; }
    });
    const up = e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      pts.delete(e.pointerId);
      if (!pts.size) this.root.classList.remove('peek');
      // any tap or click on the picture brings hidden controls back
      if (this.hidden && !p.moved && performance.now() - p.t < 400) this.setHidden(false);
    };
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
    s.addEventListener('wheel', e => { e.preventDefault(); if (e.deltaY) this.acc.zoom *= Math.pow(1.12, Math.sign(e.deltaY)); }, { passive: false });
  }

  // ------------------------------------------------------------------ tray
  /** Held upright (the tray at the bottom): the only layout where the chips fold. */
  upright() { return !(typeof matchMedia === 'function' && matchMedia(WIDE).matches); }

  setFolded(on) {
    this.folded = !!on && this.upright();
    this.tray.classList.toggle('folded', this.folded);
    for (const b of this.tabBtns) b.setAttribute('aria-expanded', String(!this.folded && b.dataset.tab === this.tab));
    if (!this.folded) this.fadeChips();
  }

  /** Tab labels on one line each: when one does not fit (a long translation, a large text size), two rows of two. */
  fitTabs() {
    const row = this.tabRow;
    row.classList.remove('two');
    row.classList.toggle('two', this.tabBtns.some(b => b.scrollWidth > b.clientWidth + 1));
  }

  /** The fade at the chips' foot, only while more of them are below. */
  fadeChips() {
    const c = this.chips;
    c.classList.toggle('more', c.scrollHeight - c.scrollTop - c.clientHeight > 4);
  }

  showTab(id) {
    this.tab = id;
    for (const b of this.tabBtns) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === id));
      b.setAttribute('aria-expanded', String(!this.folded && b.dataset.tab === id));
    }
    const m = this.mode, c = this.chips, chip = (kind, id, label, on, cls = '') => {
      const b = btn('ph-chip' + cls, tx(label)); b.dataset.kind = kind; b.dataset.id = id;
      b.setAttribute('aria-pressed', String(!!on));
      b.addEventListener('click', () => this.pick(kind, id));
      return b;
    };
    c.replaceChildren();
    if (id === 'pose') {
      // the toggles first: they go with every pose (Face the camera is wanted for almost every shot: play's camera is behind her)
      if (m.canPose) c.append(chip('face', 'face', N_('Face the camera'), m.choice.face, ' toggle'));
      if (m.tamoHere) c.append(chip('tamo', 'tamo', N_('Tamo joins'), m.choice.tamo, ' toggle'));
      for (const p of m.poses()) c.append(chip('pose', p.id, p.label, m.choice.pose === p.id));
      if (!m.canPose) c.append(el('p', 'ph-note', tx('Poses need Mika standing on the ground')));
    } else if (id === 'filter') {
      for (const f of FILTERS) c.append(chip('filter', f.id, f.label, m.choice.filter === f.id));
    } else if (id === 'frame') {
      for (const f of FRAMES) c.append(chip('frame', f.id, f.label, m.choice.frame === f.id));
      c.append(chip('caption', 'caption', N_('Caption'), m.choice.caption, ' toggle'));
    } else {
      for (const l of LENSES) c.append(chip('lens', l.id, l.label, m.choice.lens === l.id));
      for (const r of ROLLS) c.append(chip('roll', r.id, r.label, Math.abs(m.rig.roll - r.roll) < 0.01));
    }
    c.scrollTop = 0;
    this.fadeChips();
  }

  pick(kind, id) {
    const m = this.mode;
    m.g.audio?.click?.();
    if (kind === 'pose') m.setPose(id);
    else if (kind === 'face') m.setFace(!m.choice.face);
    else if (kind === 'tamo') m.setTamo(!m.choice.tamo);
    else if (kind === 'filter') m.setFilter(id);
    else if (kind === 'frame') m.setFrame(id);
    else if (kind === 'caption') m.setCaption(!m.choice.caption);
    else if (kind === 'lens') m.setLens(id);
    else if (kind === 'roll') m.setRoll(ROLLS.find(r => r.id === id).roll);
  }

  /** Chips follow the mode's choices (a key or the pad may have changed them). */
  sync() {
    const m = this.mode, on = (kind, id) => ({ pose: m.choice.pose === id, face: m.choice.face, tamo: m.choice.tamo, filter: m.choice.filter === id,
      frame: m.choice.frame === id, caption: m.choice.caption, lens: m.choice.lens === id })[kind];
    for (const b of this.chips.querySelectorAll('.ph-chip')) if (b.dataset.kind !== 'roll') b.setAttribute('aria-pressed', String(!!on(b.dataset.kind, b.dataset.id)));
    this.gridBtn.setAttribute('aria-pressed', String(!!m.choice.grid));
    this.syncRoll();
  }

  syncRoll() {
    const r = this.mode.rig.roll;
    for (const b of this.chips.querySelectorAll('.ph-chip[data-kind="roll"]')) b.setAttribute('aria-pressed', String(Math.abs(r - ROLLS.find(x => x.id === b.dataset.id).roll) < 0.01));
  }

  /** Hide everything but the picture and its frame; any tap, H or Select brings it back (with a card waiting, if a shot was taken meanwhile). */
  setHidden(on) {
    this.hidden = !!on;
    this.root.classList.toggle('bare', this.hidden);
    if (this.hidden) { this.resetGestures(); document.activeElement?.blur?.(); clearTimeout(this.cardTimer); }
    else this.armCard();
  }

  /** The frame over the live view, redrawn only when it changes; nothing at all (no layer, no memory) when it would be empty. */
  redrawFrame() {
    const m = this.mode, c = this.canvas, on = m.choice.frame !== 'none' || m.choice.grid;
    c.classList.toggle('hidden', !on);
    if (!on) { if (c.width || c.height) { c.width = 0; c.height = 0; } return; }
    const dpr = Math.min(devicePixelRatio || 1, 2);              // (the saved file's own ceiling: game/photo.js fitShot)
    const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    drawFrame(ctx, w, h, m.choice.frame, m.choice.caption ? m.captionText() : '', { grid: m.choice.grid });
  }

  // ------------------------------------------------------------------ after a shot
  /**
   * The card after a shot. Its Save picture and Share buttons hold the only reference to the full-size File (a few
   * megabytes): it is freed when hideCard() empties the card (the next shot, the timer) or destroy() removes it (the
   * mode closes). Keep it nowhere else. Not kept in the album (full, or storage refused): the card is the only copy,
   * so it does not time out.
   */
  showCard({ thumb, kept, file }) {
    clearTimeout(this.cardTimer);
    this.cardHeld = false;
    this.cardKeep = !kept;
    this.hint.classList.add('gone');
    const c = this.card, toast = t => this.mode.g.ui.toast(t);
    c.replaceChildren();
    const img = el('img'); img.alt = ''; img.src = thumb;
    const body = el('div', 'ph-cbody');
    if (kept) body.append(el('b', '', tx('In your album')));
    const btns = el('div', 'ph-cbtns');
    const save = btn('ph-btn ph-save', tx('Save picture'));
    save.addEventListener('click', () => {
      this.holdCard();
      const u = URL.createObjectURL(file), a = document.createElement('a');
      a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      // (iOS asks before it fetches the URL: give a slow answer time)
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    });
    btns.append(save);
    let canShare = false;
    try { canShare = !!navigator.canShare?.({ files: [file] }); } catch { /* no */ }
    if (canShare) {
      const share = btn('ph-btn ph-share', tx('Share'));
      share.addEventListener('click', () => {
        this.holdCard();
        navigator.share({ files: [file] }).catch(e => {
          if (e?.name === 'AbortError' || e?.name === 'InvalidStateError') return;     // (closed, or a sheet already open)
          console.warn('[photo] share failed', e);
          toast(tx("Couldn't share the photo. Try Save picture."));
        });
      });
      btns.append(share);
    }
    body.append(btns);
    c.append(img, body);
    c.classList.remove('hidden');
    this.armCard();
  }

  /** The card's timer, only while it can be seen and nobody has reached for it. */
  armCard() {
    clearTimeout(this.cardTimer);
    const c = this.card;
    if (this.hidden || this.cardHeld || this.cardKeep || c.classList.contains('hidden') || c.matches(':hover, :focus-within')) return;
    this.cardTimer = setTimeout(() => this.hideCard(), CARD_MS);
  }

  holdCard() { this.cardHeld = true; clearTimeout(this.cardTimer); }

  hideCard() {
    clearTimeout(this.cardTimer);
    this.cardHeld = this.cardKeep = false;
    this.card.classList.add('hidden'); this.card.replaceChildren();
  }
}
