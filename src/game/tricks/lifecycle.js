// From egg to wings: a thinking game about how small animals grow up. Mika sits down in the riverside meadow with her
// teacher, who lays out picture cards: put a life in order, find the missing card, spot the stranger, match young and
// grown-up, say where a stage lives, and (Difficult) read a grid or answer a question about the whole life. No reflexes,
// no clock on screen: look, think, choose. The rules and the data are rules-lifecycle.js, the pictures lifecycle-art.js.
//
// What this file owns: the card board (a DOM overlay over the softly dimmed world), the seated teacher beside Mika and
// the camera shot of the two of them. Everything is put back in `finally` (the board, the listeners, the teacher's rig).
//
// The board and the round are shared: another card game hands makeBoard / playCards its own kit (rules, pictures,
// words). "From seed to harvest" (crops.js) is played on this board.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { NPC } from '../../actors/npc.js';
import { addCss, disposeRigs } from './util.js';
import { enterFocus } from '../../engine/focus.js';
import { makeRound, check, solve, explain, STAGE, ANIMAL, HOME_NAME, pointsFor, MAX_MISSES, quickBonus } from './rules-lifecycle.js';
import { cardSvg, creatureOf } from './lifecycle-art.js';

const CSS = `
body.life-round #trickHud,body.life-round #trickHint,body.life-round #touch,body.life-round #toasts{display:none!important}
/* the board has its own way out in its header (Leave); the shared Stop button would lie over the cards on a phone */
body.life-round #minigameStop{display:none!important}
body.life-round #howTo{z-index:18}
@media (max-width:700px),(max-height:480px){body.life-round #howTo{display:none!important}
 /* a phone: the board fills the screen, so the clock and the two round buttons would only show through it */
 body.life-round #clock,body.life-round #btnMenu,body.life-round #btnJournal{visibility:hidden}}
#lifeBoard{position:fixed;inset:0;z-index:17;display:flex;align-items:center;justify-content:center;background:rgba(40,52,24,.16);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
#lifeBoard .pn{position:relative;box-sizing:border-box;width:min(772px,calc(100vw - 16px));height:min(680px,calc(100dvh - 16px));display:flex;flex-direction:column;overflow:hidden;
 padding:10px 14px 12px;border-radius:24px;background:rgba(255,248,234,.95);box-shadow:0 14px 40px rgba(40,20,0,.3);margin:max(8px,env(safe-area-inset-top,0px)) max(8px,env(safe-area-inset-right,0px)) max(8px,env(safe-area-inset-bottom,0px)) max(8px,env(safe-area-inset-left,0px))}
#lifeBoard .hd{flex:none;display:flex;align-items:center;gap:10px;min-height:44px}
#lifeBoard .hd img{width:34px;height:34px;border-radius:50%;background:#ffe9b8}
#lifeBoard .hd .nm{font:600 18px Fredoka,Nunito,sans-serif;color:#7a3e16;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lifeBoard .dots{display:flex;gap:5px;margin-left:auto}
#lifeBoard .dots i{width:13px;height:13px;border-radius:50%;background:#ecd9b4;box-shadow:inset 0 0 0 2px #d9bd85}
#lifeBoard .dots i.now{background:#fff;box-shadow:inset 0 0 0 3px #f08a3c}
#lifeBoard .dots i.ok{background:#59b85c;box-shadow:none}
#lifeBoard .dots i.half{background:#f2b53a;box-shadow:none}
#lifeBoard .dots i.no{background:#c9b9a2;box-shadow:none}
#lifeBoard .sc{font:600 18px Fredoka,Nunito,sans-serif;color:#c2541c;white-space:nowrap}
#lifeBoard .leave{box-sizing:border-box;min-height:44px;min-width:64px;padding:0 14px;border-radius:14px;background:#f4dfb5;color:#5a3a22;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px}
#lifeBoard .q{flex:none;margin:4px 0 6px;font:600 21px/1.2 Fredoka,Nunito,sans-serif;color:#7a3e16;text-align:center}
#lifeBoard .area{flex:1 1 0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
#lifeBoard .area.side{flex-direction:row}
#lifeBoard .show,#lifeBoard .pick{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:8px}
#lifeBoard .show.seq{gap:8px 18px}
#lifeBoard .show:empty,#lifeBoard .ban:empty{display:none}
#lifeBoard .ban{flex:none;display:flex;flex-direction:column;align-items:center;gap:4px}
#lifeBoard .show.grid{display:grid;grid-template-columns:repeat(3,auto);gap:6px;padding:6px;border-radius:16px;background:#f3e3c0}
#lifeBoard .pick{padding:6px;border-radius:18px;background:#f8ecd2;min-width:calc(var(--c) + 20px);min-height:calc(var(--c) + 8px)}
#lifeBoard .lc-card{position:relative;box-sizing:border-box;width:calc(var(--c) + 8px);padding:4px 4px 2px;border-radius:calc(var(--c) * .14 + 4px);background:#fff;box-shadow:0 3px 0 #d9bd85,0 0 0 2px #e6cf9f;
 -webkit-tap-highlight-color:transparent;transition:transform .12s}
#lifeBoard .lc-card svg{display:block;width:var(--c);height:var(--c);border-radius:calc(var(--c) * .14);pointer-events:none}
#lifeBoard .lc-card .lb{display:flex;align-items:center;justify-content:center;height:2.3em;font-size:max(10px,min(14px,calc(var(--c) * .125)));line-height:1.12;text-align:center;color:#5a3a22;overflow:hidden;pointer-events:none}
#lifeBoard [data-f]{cursor:pointer}
#lifeBoard .lc-card.sel{box-shadow:0 3px 0 #f08a3c,0 0 0 4px #f08a3c;transform:translateY(-3px)}
#lifeBoard .lc-card.good{box-shadow:0 3px 0 #3f9a44,0 0 0 4px #59b85c;background:#eefbe6}
#lifeBoard .lc-card.bad{animation:lcShake .4s}
#lifeBoard .lc-card.off{opacity:.38;filter:grayscale(.7);cursor:default}
#lifeBoard .lc-card.rest{opacity:.62}
#lifeBoard .lc-card.big{box-shadow:0 3px 0 #d9bd85,0 0 0 3px #f2b53a}
#lifeBoard .slot{position:relative;box-sizing:border-box;width:calc(var(--c) + 8px);height:calc(var(--c) + 8px + var(--lh));border-radius:calc(var(--c) * .14 + 4px);background:#fff7e3;box-shadow:inset 0 0 0 3px #e2c99a;
 display:flex;align-items:center;justify-content:center;font:600 calc(var(--c) * .36) Fredoka,Nunito,sans-serif;color:#d9bd85}
#lifeBoard .slot .lc-card{position:absolute;inset:0;box-shadow:0 0 0 2px #e6cf9f}
#lifeBoard .slot .lc-card.good{box-shadow:0 0 0 4px #59b85c}
#lifeBoard .slot.gap{box-shadow:inset 0 0 0 3px #f08a3c;color:#f08a3c;background:#fff1d6}
#lifeBoard .seq > *:not(:last-child)::after{content:'';position:absolute;right:-14px;top:50%;width:0;height:0;margin-top:-7px;border:7px solid transparent;border-left:9px solid #d9a35a;border-right:0}
#lifeBoard .cur{outline:4px solid #2f8ad8;outline-offset:3px}
#lifeBoard .say{flex:none;box-sizing:border-box;margin:8px 0 8px;min-height:3.9em;max-height:6.4em;overflow:auto;padding:8px 14px;border-radius:16px;background:#fff1cf;font-size:15px;line-height:1.28;font-weight:600}
#lifeBoard .say b{color:#c2541c;margin-right:6px}
#lifeBoard .say.yes{background:#e3f6dc}
#lifeBoard .say.no{background:#ffe9d9}
#lifeBoard .say:empty{visibility:hidden}
#lifeBoard .go{flex:none;align-self:center;box-sizing:border-box;min-height:50px;min-width:200px;padding:0 26px;border-radius:16px;background:#f08a3c;color:#fff;box-shadow:0 4px 0 #b8581a;
 display:flex;align-items:center;justify-content:center;gap:8px;font:700 18px Nunito,system-ui,sans-serif}
#lifeBoard .go.off{background:#e7d8bd;color:#a8977c;box-shadow:0 4px 0 #cfbf9f;cursor:default}
#lifeBoard .go kbd{font:700 12px Nunito,sans-serif;padding:1px 6px;border-radius:5px;background:#0002}
#lifeBoard .ghost{position:fixed;left:0;top:0;z-index:3;pointer-events:none;opacity:.92;transform-origin:0 0}
#lifeBoard .pn > *{position:relative;z-index:1}
#lifeBoard .pn > .fly{position:absolute;left:0;top:0;width:54px;height:54px;pointer-events:none;z-index:0}
#lifeBoard .fly svg{width:100%;height:100%;overflow:visible}
#lifeBoard .fly.wing{animation:lcFly 3.6s linear forwards}
#lifeBoard .fly.wing svg{animation:lcBob .5s ease-in-out infinite alternate}
#lifeBoard .pn > .fly.hop{top:auto;bottom:6px;animation:lcFly 3.2s linear forwards}
#lifeBoard .fly.hop svg{animation:lcHop .64s ease-out infinite}
@keyframes lcShake{0%,100%{transform:none}20%{transform:translateX(-7px) rotate(-3deg)}50%{transform:translateX(6px) rotate(2deg)}80%{transform:translateX(-3px)}}
@keyframes lcFly{from{transform:translate(-70px,10px)}to{transform:translate(100vw,2px)}}
@keyframes lcBob{from{transform:translateY(-5px) scaleX(1)}to{transform:translateY(6px) scaleX(.72)}}
@keyframes lcHop{0%,100%{transform:translateY(0)}50%{transform:translateY(-30px)}}
@media (max-width:560px){
 #lifeBoard .pn{padding:8px 10px 10px;border-radius:20px;height:calc(100dvh - 16px)}
 #lifeBoard .hd .nm{display:none}
 #lifeBoard .dots{margin-left:0}
 #lifeBoard .sc{margin-left:auto}
 #lifeBoard .q{font-size:19px}
 #lifeBoard .say{font-size:14px;min-height:5em;padding:7px 11px}
 #lifeBoard .go{min-width:70%}
}
@media (max-height:480px){
 #lifeBoard .pn{width:calc(100vw - 16px);display:grid;grid-template-columns:1fr 252px;grid-template-rows:auto auto 1fr auto;gap:0 12px;padding:6px 12px 8px}
 #lifeBoard .hd{grid-column:1/3;min-height:44px}
 #lifeBoard .area{grid-column:1;grid-row:2/5;gap:10px}
 #lifeBoard .q{grid-column:2;grid-row:2;font-size:17px;margin:2px 0 6px;text-align:left}
 #lifeBoard .say{grid-column:2;grid-row:3;font-size:13px;margin:0 0 6px;min-height:0;max-height:none;align-self:stretch;padding:7px 10px}
 #lifeBoard .go{grid-column:2;grid-row:4;min-width:0;align-self:end;justify-self:stretch;min-height:46px}
}
@media (prefers-reduced-motion:reduce){#lifeBoard .fly{display:none}#lifeBoard .lc-card.bad{animation:none}}
`;

const INTRO = {
  sora: N_("Sit down by me, Mi-chan. These are my nature cards: every little animal's life, from egg to grown-up."),
  rin: N_("Sit down, city girl. These are Sora's old nature cards: every little animal's life, from egg to grown-up."),
};
const INTRO_2 = N_('Nobody is counting the seconds. Look at the pictures, think, and then choose.');
// the guided first play: what the teacher says as each of the first puzzles is laid out
const GUIDE = [
  N_('A butterfly has four shapes in its life. Pick the cards one by one, from first to last. The eggs come first!'),
  N_('Now one card is missing from the row. Pick the card that fills the gap, then press Check.'),
  N_('You have got it! The next ones are all yours. A wrong answer is fine: just think and try again.'),
];
const HINT = {
  order: N_('Pick a card to lay it in the row. Pick it again to take it back.'),
  choice: N_('Pick a card, then press Check.'),
};
const BTN = { check: N_('Check'), next: N_('Next'), finish: N_('Finish') };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = id => (id.startsWith('home.') ? HOME_NAME[id.slice(5)] : STAGE[id]?.name) || '';

/**
 * What a card game brings to the board (makeBoard, playCards):
 *   check, solve, explain, pointsFor, MAX_MISSES   its rules (the shapes of rules-lifecycle.js)
 *   cardSvg(id), nameOf(id)                        a card's picture and its name
 *   alwaysLabel(id), labelled(p)                   cards named even on Difficult, and puzzles made of such cards
 *   prompt(p)                                      the question, translated (default: tx(p.prompt))
 *   banner(p, done)                                HTML shown over the cards (a chart to read), or ''
 *   celebrate(p)                                   { svg, hop } that crosses the board after a first-try answer, or null
 *   guide, hint                                    the teacher's lines of the guided first play; the two how-to hints
 */
const LIFE_KIT = {
  check, solve, explain, pointsFor, MAX_MISSES, cardSvg, nameOf,
  alwaysLabel: id => id.startsWith('home.'),
  labelled: p => p.type === 'home',
  celebrate(p) {
    const a = ANIMAL[p.animal];
    // the grown-up of the life just solved crosses the board: the picture without its background
    return a ? { svg: creatureOf(`${a.id}.adult`), hop: !(a.wings && a.id !== 'grasshopper') } : null;
  },
  get guide() { return GUIDE; },
  get hint() { return HINT; },
};

/** The largest card size (px) at which `rows` (lists of how many cards sit side by side) fit a w x h box. */
export function fitCards(w, h, rows, { labels = false, gaps = [], side = false } = {}) {
  for (let c = 132; c >= 48; c -= 2) {
    const outer = c + 8, lh = labels ? Math.max(10, Math.min(14, c * 0.125)) * 2.3 + 2 : 0;
    // side: a 3 x 3 grid with its four choices beside it, two by two (a wide screen)
    if (side) { if (5 * outer + 12 + 12 + 14 + 8 + 12 <= w && 3 * (outer + lh) + 12 + 12 <= h) return c; continue; }
    let lines = 0, ok = true;
    rows.forEach((n, i) => {
      const gap = gaps[i] ?? 8, per = Math.floor((w + gap) / (outer + gap));
      if (n.fixed) { if (per < n.fixed) ok = false; lines += n.lines; } else if (per < 1) ok = false; else lines += Math.ceil(n / per);
    });
    if (ok && lines * (outer + lh + 8) + 14 * (rows.length - 1) + 12 <= h) return c;
  }
  return 48;
}

export function makeBoard(ctx, round, teacherName, kit = LIFE_KIT) {
  addCss('lifeCss', CSS);
  const touch = !!ctx.ui?.touch, total = round.puzzles.length;
  const root = document.createElement('div');
  root.id = 'lifeBoard';
  root.innerHTML = `<section class="pn" role="dialog"><div class="hd"><img alt=""><span class="nm"></span><div class="dots">${round.puzzles.map(() => '<i></i>').join('')}</div><span class="sc"></span><div class="leave" data-f data-role="leave" data-g="0" role="button"></div></div>
    <div class="q" aria-live="polite"></div><div class="area"><div class="ban"></div><div class="show"></div><div class="pick"></div></div><div class="say" aria-live="polite"></div><div class="go" data-f data-role="go" data-g="3" role="button"></div></section>`;
  const $ = s => root.querySelector(s);
  const el = { pn: $('.pn'), q: $('.q'), area: $('.area'), ban: $('.ban'), show: $('.show'), pick: $('.pick'), say: $('.say'), go: $('.go'), sc: $('.sc'), dots: [...root.querySelectorAll('.dots i')] };
  const img = $('.hd img');
  img.onerror = () => { img.style.display = 'none'; };
  img.src = ctx.ui.icon(ctx.trick.icon);
  $('.nm').textContent = tx(ctx.trick.name);
  $('.leave').textContent = tx('Leave');
  document.body.append(root);
  document.body.classList.add('life-round');

  // ---- the state of the round
  const S = { i: -1, p: null, slots: [], tray: [], locked: [], sel: null, off: new Set(), misses: 0, answered: false, shownAnswer: false,
    score: 0, seconds: 0, firstTry: 0, marks: [], cur: -1, nav: false, finished: false, leave: false, drag: null, flash: null };
  const unit = tx(ctx.trick.unit);
  const card = (id, cls, attrs = '') => `<div class="lc-card ${cls || ''}" data-card="${id}" ${attrs}>${kit.cardSvg(id)}${S.p.labels || kit.alwaysLabel(id) ? `<span class="lb">${esc(tx(kit.nameOf(id)))}</span>` : ''}</div>`;
  const say = (text, cls = '', who = true) => {
    el.say.className = `say ${cls}`;
    el.say.innerHTML = text ? `${who ? `<b>${esc(teacherName)}:</b>` : ''}<span>${esc(text)}</span>` : '';
  };

  function fit() {
    const p = S.p;
    if (!p) return;
    const labels = p.labels || kit.labelled(p), ban = !!el.ban.firstChild;
    const rows = [], gaps = [];
    if (p.type === 'order') { rows.push(p.slots, p.cards.length); gaps.push(18, 8); }
    else if (p.type === 'next') { rows.push(p.row.length, p.choices.length); gaps.push(18, 8); }
    else if (p.type === 'grid') { rows.push({ fixed: 3, lines: 3 }, p.choices.length); gaps.push(6, 8); }
    else if (p.show) rows.push(1, p.choices.length);
    else rows.push(p.choices.length);
    let w = el.area.clientWidth - 12, h = el.area.clientHeight;
    const side = (p.type === 'grid' || ban) && w > h * 1.15;
    el.area.classList.toggle('side', side);
    if (ban) {
      // a chart over the cards (beside them on a wide screen): it takes its share, the cards fit what is left
      root.style.setProperty('--wh', `${Math.round(side ? Math.min(h - 34, 250, w * 0.42) : Math.min(220, h * 0.46, w - 24))}px`);
      if (side) w -= el.ban.offsetWidth + 14; else h -= el.ban.offsetHeight + 14;
    }
    const c = fitCards(w, h, rows, { labels, gaps, side: side && !ban });
    root.style.setProperty('--c', `${c}px`);
    root.style.setProperty('--lh', labels ? `${(Math.max(10, Math.min(14, c * 0.125)) * 2.3 + 2).toFixed(1)}px` : '0px');
    // wrapped rows are balanced (3 + 2, never 4 + 1): each row box is only as wide as its share of the cards
    const balance = (box, n, gap) => {
      if (!n || typeof n !== 'number') { box.style.maxWidth = ''; return; }
      const per = Math.max(1, Math.floor((w + gap) / (c + 8 + gap))), lines = Math.ceil(n / per), each = Math.ceil(n / lines);
      box.style.maxWidth = `${each * (c + 8 + gap) - gap + (box === el.pick ? 12 : 0)}px`;
    };
    balance(el.show, rows.length > 1 ? rows[0] : 0, gaps[0] ?? 8);
    if (side && !ban) el.pick.style.maxWidth = `${2 * (c + 8) + 8 + 12}px`; else balance(el.pick, rows[rows.length - 1], 8);
  }

  function render() {
    const p = S.p;
    if (!p) return;
    el.q.textContent = kit.prompt ? kit.prompt(p) : tx(p.prompt);
    el.sc.textContent = `${S.score} ${unit}`;
    el.dots.forEach((d, i) => { d.className = i === S.i && !S.answered ? 'now' : S.marks[i] || ''; });
    const done = S.answered;
    let show = '', pick = '', seq = false;
    if (p.type === 'order') {
      seq = true;
      show = S.slots.map((c, i) => `<div class="slot" ${c && !S.locked[i] && !done ? `data-f data-role="slot" data-i="${i}" data-g="1"` : ''}>${i + 1}${c ? card(c, S.locked[i] || done ? 'good' : '') : ''}</div>`).join('');
      pick = S.tray.map(c => card(c, done ? 'off' : '', done ? '' : 'data-f data-role="tray" data-g="2"')).join('');
    } else {
      if (p.type === 'next') { seq = true; show = p.row.map(c => (c ? card(c) : done ? card(p.answer, 'good') : '<div class="slot gap">?</div>')).join(''); }
      else if (p.type === 'grid') show = p.grid.flat().map(c => (c ? card(c) : done ? card(p.answer, 'good') : '<div class="slot gap">?</div>')).join('');
      else if (p.show) show = p.show.map(c => card(c, 'big')).join('');
      pick = p.choices.map(c => {
        const cls = done ? (c === p.answer ? 'good' : 'rest') : S.off.has(c) ? `off${S.flash?.bad === c ? ' bad' : ''}` : c === S.sel ? 'sel' : '';
        return card(c, cls, done || S.off.has(c) ? '' : 'data-f data-role="choice" data-g="2"');
      }).join('');
    }
    el.show.className = `show${seq ? ' seq' : ''}${p.type === 'grid' ? ' grid' : ''}`;
    el.ban.innerHTML = kit.banner?.(p, done) || '';
    el.show.innerHTML = show;
    el.pick.innerHTML = pick;
    const ready = done || (p.type === 'order' ? S.slots.every(Boolean) : !!S.sel);
    el.go.classList.toggle('off', !ready);
    el.go.innerHTML = `${esc(tx(done ? (S.i + 1 < total ? BTN.next : BTN.finish) : BTN.check))}${touch ? '' : '<kbd>Space</kbd>'}`;
    S.flash = null;
    fit();
    paintCursor();
  }

  // ---- keyboard and gamepad: a cursor over everything that can be pressed
  const items = () => [...root.querySelectorAll('[data-f]')].filter(e => !e.classList.contains('off'));
  function paintCursor() {
    const list = items();
    root.querySelectorAll('.cur').forEach(e => e.classList.remove('cur'));
    if (!S.nav || !list.length) return;
    if (S.cur < 0 || S.cur >= list.length) S.cur = Math.max(0, list.findIndex(e => e.dataset.g === '2'));
    list[S.cur]?.classList.add('cur');
  }
  function move(dx, dy) {
    const list = items();
    if (!list.length) return;
    if (!S.nav) { S.nav = true; S.cur = -1; paintCursor(); return; }
    const at = list[S.cur] || list[0];
    if (dx) {
      // along the row; past its end, on to the next thing that can be pressed (the Check button after the last card)
      let k = S.cur + dx;
      if (k < 0) k = list.length - 1; else if (k >= list.length) k = 0;
      if (list[k].dataset.role === 'leave' && at.dataset.role !== 'leave') k = dx > 0 ? (k + 1) % list.length : (k - 1 + list.length) % list.length;
      S.cur = k;
    } else {
      const a = at.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = -1, bd = Infinity;
      list.forEach((e, k) => {
        const b = e.getBoundingClientRect(), by = b.top + b.height / 2, off = (by - ay) * dy;
        if (off < 8) return;                                        // only things further that way
        const d = off * 3 + Math.abs(b.left + b.width / 2 - ax);
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) S.cur = best;
    }
    paintCursor();
  }
  const keepCursor = find => { const k = items().findIndex(find); if (k >= 0) S.cur = k; paintCursor(); };

  // ---- what a press does
  function press(e) {
    if (!e || S.finished) return;
    const role = e.dataset.role;
    if (role === 'leave') { S.leave = true; return; }
    if (role === 'go') { if (!e.classList.contains('off')) go(); return; }
    if (S.answered) return;
    if (role === 'choice') {
      const id = e.dataset.card;
      if (S.sel === id) { go(); return; }                           // a second press on the chosen card checks it
      S.sel = id;
      ctx.audio.click?.();
      render();
      keepCursor(x => x.dataset.card === id);
    } else if (role === 'tray') {
      const k = S.slots.indexOf(null);
      if (k < 0) return;
      place(e.dataset.card, k);
      keepCursor(x => x.dataset.role === (S.slots.includes(null) ? 'tray' : 'go'));
    } else if (role === 'slot') {
      const i = +e.dataset.i;
      if (S.slots[i] && !S.locked[i]) { S.tray.push(S.slots[i]); S.slots[i] = null; ctx.audio.click?.(); render(); keepCursor(x => x.dataset.role === 'slot' && +x.dataset.i === i); }
    }
  }
  /** Lay a card in slot k: from the tray or from another slot; a card already lying there goes back to the tray. */
  function place(id, k) {
    if (S.locked[k] || S.answered) return;
    const from = S.slots.indexOf(id);
    if (from === k) return;
    if (from >= 0) S.slots[from] = null; else S.tray = S.tray.filter(c => c !== id);
    if (S.slots[k]) S.tray.push(S.slots[k]);
    S.slots[k] = id;
    ctx.audio.click?.();
    render();
  }

  function celebrate(p) {
    const a = kit.celebrate?.(p);
    if (!a) return;
    const f = document.createElement('div');
    f.className = `fly ${a.hop ? 'hop' : 'wing'}`;
    f.innerHTML = `<svg viewBox="0 0 120 120">${a.svg}</svg>`;
    f.addEventListener('animationend', ev => { if (ev.target === f) f.remove(); });
    el.pn.append(f);                // (it passes behind the cards, the words and the buttons: never over something to read)
  }

  function finishPuzzle(right, points) {
    S.answered = true;
    S.score += points;
    S.marks[S.i] = !right ? 'no' : S.misses ? 'half' : 'ok';
    if (right && !S.misses) S.firstTry++;
  }
  function go() {
    const p = S.p;
    if (S.answered) { next(); return; }
    const answer = p.type === 'order' ? S.slots.slice() : S.sel;
    const res = kit.check(p, answer);
    if (res.right) {
      finishPuzzle(true, kit.pointsFor(S.misses));
      if (p.type === 'order') S.locked = S.slots.map(() => true);
      say(`${tx('Yes!')} ${kit.explain(p, answer, true).map(s => tx(s)).join(' ')}`, 'yes');
      ctx.audio.good?.();
      if (!S.misses) celebrate(p);
    } else {
      S.misses++;
      const why = kit.explain(p, answer, false).map(s => tx(s)).join(' ');
      ctx.audio.miss?.();
      if (S.misses >= kit.MAX_MISSES) {
        // three misses: the teacher shows the answer and says why (no points, no fuss)
        finishPuzzle(false, 0);
        S.shownAnswer = true;
        if (p.type === 'order') { S.slots = kit.solve(p); S.tray = p.extra.slice(); S.locked = S.slots.map(() => true); }
        say(`${tx('Let me show you.')} ${p.why.map(s => tx(s)).join(' ')}`, 'no');
      } else if (p.type === 'order') {
        // the cards in the right place stay (green); the others go back to the tray
        res.good.forEach((g, i) => { if (g) S.locked[i] = true; else if (S.slots[i]) { S.tray.push(S.slots[i]); S.slots[i] = null; } });
        say(`${tx('Not quite.')} ${why}`, 'no');
      } else {
        S.off.add(answer);
        S.flash = { bad: answer };
        S.sel = null;
        say(`${tx('Not quite.')} ${why}`, 'no');
      }
    }
    render();
    if (S.answered) keepCursor(x => x.dataset.role === 'go');
  }
  function next() {
    if (S.i + 1 >= total) { S.finished = true; return; }
    start(S.i + 1);
  }
  function start(i) {
    const p = round.puzzles[i];
    Object.assign(S, { i, p, sel: null, off: new Set(), misses: 0, answered: false, shownAnswer: false, cur: -1, flash: null });
    S.slots = p.type === 'order' ? new Array(p.slots).fill(null) : [];
    S.locked = S.slots.map(() => false);
    S.tray = p.type === 'order' ? p.cards.slice() : [];
    if (ctx.first && kit.guide[i]) say(tx(kit.guide[i]));
    else if (i === 0 || (ctx.easy && i < 2)) say(tx(p.type === 'order' ? kit.hint.order : kit.hint.choice), '', false);
    else say('');
    render();
  }

  // ---- mouse and touch: a press, or a drag of a card onto a slot (or back to the tray)
  const listeners = [];
  const on = (target, name, fn, opts) => { target.addEventListener(name, fn, opts); listeners.push(() => target.removeEventListener(name, fn, opts)); };
  const dropDrag = () => { S.drag?.ghost?.remove(); S.drag?.el?.classList.remove('off'); S.drag = null; };
  on(root, 'pointerdown', e => {
    e.stopPropagation();
    if (e.button > 0 || S.drag) return;
    const t = e.target.closest?.('[data-f]');
    if (!t) return;
    e.preventDefault();
    S.nav = false; paintCursor();
    const c = t.dataset.role === 'tray' ? t : t.dataset.role === 'slot' ? t.querySelector('.lc-card') : null;
    S.drag = { id: e.pointerId, t, x: e.clientX, y: e.clientY, card: c && !S.answered ? c : null, ghost: null, el: null };
  });
  on(root, 'pointermove', e => {
    const d = S.drag;
    if (!d || d.id !== e.pointerId || !d.card) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) return;
      const r = d.card.getBoundingClientRect();
      d.ghost = d.card.cloneNode(true);
      d.ghost.classList.add('ghost');
      d.ghost.classList.remove('sel', 'cur');
      d.ghost.style.width = `${r.width}px`;
      d.ox = d.x - r.left; d.oy = d.y - r.top;
      root.append(d.ghost);
      d.el = d.card; d.el.classList.add('off');
    }
    d.ghost.style.transform = `translate(${e.clientX - d.ox}px,${e.clientY - d.oy}px) scale(1.06)`;
  });
  const up = e => {
    const d = S.drag;
    if (!d || d.id !== e.pointerId) return;
    const dragged = !!d.ghost, id = d.card?.dataset.card;
    dropDrag();
    if (e.type === 'pointercancel') { render(); return; }
    if (!dragged) { press(d.t); return; }
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under?.closest?.('.slot'), k = slot ? [...el.show.children].indexOf(slot) : -1;
    if (k >= 0 && S.p.type === 'order') place(id, k);
    else if (under?.closest?.('.pick') && S.slots.includes(id)) { S.slots[S.slots.indexOf(id)] = null; S.tray.push(id); render(); }
    else render();
  };
  on(root, 'pointerup', up);
  on(root, 'pointercancel', up);
  on(root, 'contextmenu', e => e.preventDefault());
  on(window, 'resize', () => { dropDrag(); fit(); });

  return {
    S, root,
    start,
    /** One frame: the keys and the pad (the game's own Input), and the thinking time. Returns true when the round is over. */
    step(inp, dt) {
      if (S.finished) return true;
      if (!S.answered) S.seconds += dt;
      if (inp.pressed('left')) move(-1, 0);
      else if (inp.pressed('right')) move(1, 0);
      else if (inp.pressed('up')) move(0, -1);
      else if (inp.pressed('down')) move(0, 1);
      else if (inp.pressed('jump')) { if (!el.go.classList.contains('off')) go(); }
      else if (inp.pressed('act')) { if (!S.nav) { S.nav = true; S.cur = -1; paintCursor(); } else press(items()[S.cur]); }
      return S.finished;
    },
    destroy() {
      dropDrag();
      listeners.forEach(f => f());
      root.remove();
      document.body.classList.remove('life-round');
    },
  };
}

/** The teacher, seated beside Mika for the round (her own rig and, on the light tiers, her own merged palette). */
function seatTeacher(g, model, x, z, facing) {
  if (!g.assets.has?.(model)) return null;
  const shared = new Set(), local = new Set();
  const assets = { clone(name) {
    const c = g.assets.clone(name);
    c?.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) shared.add(m); });
    return c;
  } };
  const npc = new NPC(g.scene, assets, g.world, 'life-teacher', model, { x, z, facing });
  npc.model.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (!shared.has(m)) local.add(m);
    if (!npc.anim) local.add(o.geometry);
  });
  const sit = ['SitGrass', 'SitFloor'].find(c => npc.anim?.has(c));
  npc.anim?.play(sit || 'Idle');
  return { npc, sat: !!sit, update(dt) { npc.anim?.update(dt); }, dispose() { npc.root.removeFromParent(); disposeRigs(npc.root); local.forEach(o => o.dispose?.()); } };
}

/**
 * A round of a card game on the board: Mika and her teacher sit down by the sign, the cards are played, everything is
 * put back. { round, seed, kit, intro: [what the teacher says on the guided first play], bonusFor: the level's small
 * bonus, debug: the key under ctx.debug, rise: how high the camera stands over the ground (higher looks down on what
 * lies behind the two) }. Returns what a trick's play() returns.
 */
export async function playCards(ctx, { round, seed, kit = LIFE_KIT, intro = [], bonusFor = quickBonus, debug = 'life', rise = 1.7 }) {
    const g = ctx.game, p = ctx.player, d = ctx.director, follow = g.follow;
    let board = null, teacher = null, still = null;
    try {
      ctx.lock(true);
      ctx.hud(0, null);
      // Mika turns her back to the sign and sits; the teacher sits at her side, turned a little toward her
      const sign = ctx.place, away = Math.atan2(p.pos.x - sign.x, p.pos.z - sign.z);
      const face = Math.hypot(p.pos.x - sign.x, p.pos.z - sign.z) < 6 ? away : p.facing;
      p.facing = face;
      const fx = Math.sin(face), fz = Math.cos(face), sx = Math.cos(face), sz = -Math.sin(face);
      // the real teacher may be standing right here (the story walked her over): she is not doubled
      const real = d.npcs?.[ctx.teacher];
      const near = real?.visible && Math.hypot(real.pos.x - p.pos.x, real.pos.z - p.pos.z) < 30;
      if (!near) teacher = seatTeacher(g, ctx.teacher, p.pos.x + sx * 1.15 + fx * 0.1, p.pos.z + sz * 1.15 + fz * 0.1, face - 0.5);
      // the shot: from in front of the two. On a wide screen the board leaves a margin on the right, and the camera looks
      // past them so that they sit in that margin instead of behind the cards.
      const mid = new THREE.Vector3(p.pos.x + sx * 0.55, p.pos.y, p.pos.z + sz * 0.55);
      const DIST = 7.4, wide = innerWidth >= 1100 && innerWidth > innerHeight * 1.5;
      const aside = wide ? 0.8 * DIST * Math.tan((follow.camera.fov || 50) * Math.PI / 360) * (innerWidth / innerHeight) : 0;
      const cam = new THREE.Vector3(mid.x + fx * DIST, 0, mid.z + fz * DIST);
      cam.y = Math.max(mid.y, g.world.heightAt(cam.x, cam.z)) + rise;
      // (the camera looks back along -f: its right-hand side is (fz, 0, -fx))
      const shot = { pos: cam, look: new THREE.Vector3(mid.x - fz * aside, mid.y + 0.7, mid.z + fx * aside) };
      follow.cutscene(shot, 1.1);
      ctx.debug[debug] = { round, seed, get board() { return board?.S || null; }, solve: () => (board?.S.p ? kit.solve(board.S.p) : null) };

      if (ctx.first) {
        // a short talk first: on a phone the How to play card is open over the middle of the screen for these seconds
        if (intro.length) await ctx.say(intro.map((text, k) => (k ? [ctx.teacher, text] : [ctx.teacher, text, 'Talk'])));
        if (ctx.quit) return { score: 0, quit: true };
        follow.cutscene(shot, 0.8);                 // (the talk framed the speaker and let the camera go)
      }
      board = makeBoard(ctx, round, d.tricks.teacherName(ctx.trick), kit);
      board.start(0);
      const pose = { waiting: true };
      let up = 0;
      const res = await ctx.loop(dt => {
        // the board covers the screen: once the two have sat down the valley behind is one still picture (engine/focus.js)
        if (!still && (up += dt) > 1.8) still = enterFocus(g, { hold: true });
        ctx.groundPose?.(pose);
        teacher?.update(dt);
        if (board.S.leave) return { quit: true };
        return board.step(ctx.input, Math.min(0.1, dt)) ? { done: true } : undefined;
      });
      if (res?.quit) return { score: 0, quit: true };
      const S = board.S, bonus = bonusFor(round.level, S.seconds, ctx.roundTime);
      const note = tx('{n} of {total} right at the first try', { n: S.firstTry, total: round.puzzles.length }) + (bonus ? ` · ${tx('steady thinking +{n}', { n: bonus })}` : '');
      return { score: S.score + bonus, note, detail: { firstTry: S.firstTry, puzzles: round.puzzles.length, seconds: Math.round(S.seconds), bonus, seed } };
    } finally {
      still?.exit();
      board?.destroy();
      teacher?.dispose();
      follow.clearCutscene(true);
      ctx.lock(false);
      ctx.input.releaseAll?.();
    }
}

export default {
  id: 'lifecycle',
  async play(ctx) {
    // (a QA script may name the seed, so a run can be repeated)
    const seed = (typeof window !== 'undefined' && window.__STARLINE_QA__?.seed) || Math.floor(Math.random() * 2 ** 31) + 1;
    const round = makeRound({ level: ctx.level, seed, first: ctx.first });
    return playCards(ctx, { round, seed, intro: [INTRO[ctx.teacher] || INTRO.sora, INTRO_2] });
  },
};
