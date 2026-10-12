// The Ô ăn quan guide owns an isolated example board. Every animation step comes from the same
// pure play() function as the real round; opening help never reads or writes the running simulation.
import { newBoard, cloneBoard, play, finished, totalValue, QUAN_VALUE } from '../game/yard/oanquan.js';
import { N_, tx, onLangChange } from '../i18n/i18n.js';

export const OAN_LESSONS = [
  { id: 'sow', title: N_('1. Sow'), text: N_('Pick up every pebble in one of your five small pits. Put one in each following pit, including the big quan pits.') },
  { id: 'continue', title: N_('2. Keep sowing'), text: N_('After the last pebble, look at the NEXT pit. If it is a small pit with pebbles, pick them all up and keep sowing in the same direction.') },
  { id: 'capture', title: N_('3. Capture'), text: N_('If the next small pit is empty, capture everything in the pit after it. Another empty pit followed by a full one lets you capture again. Two empty pits end the turn.') },
  { id: 'quan', title: N_('4. Capture a quan'), text: N_('You can capture a quan across an empty small pit too. A quan is worth 10 points; a pebble is worth 1.') },
];

export const OAN_RULES = [
  N_('Your five small pits are the lower row. Choose a non-empty one, then choose ◀ or ▶. Keep that direction for the whole turn.'),
  N_('After your last pebble: a full small pit means keep sowing; an empty small pit can mean capture; a quan pit ends your turn, even if it is empty.'),
  N_('An empty side refills with one captured pebble per pit. Missing pebbles are borrowed and repaid when counting. If both players together have fewer than five captured pebbles, the round ends.'),
  N_('This quick round ends when the first quan is captured, or after 24 turns. Your captured points plus pebbles left in your small pits decide the winner. Stones still in quan pits do not count.'),
];

/** Small teaching positions, mirrored for ◀. These are examples, not a new starting layout. */
export function oanExample(id = 'sow', dir = 1) {
  if (!OAN_LESSONS.some(l => l.id === id)) id = 'sow';
  dir = dir === -1 ? -1 : 1;
  const b = newBoard();
  let sq;
  if (id === 'sow') { sq = 2; b.dan[2] = 3; }
  else if (id === 'continue') { sq = 1; b.dan[1] = 1; b.dan[3] = 2; }
  else if (id === 'capture') { sq = 2; b.dan[2] = 1; b.dan[4] = 0; b.dan[5] = 4; }
  else { sq = 3; b.dan[3] = 1; b.dan[5] = 0; }
  if (dir === -1) {
    const before = cloneBoard(b);
    const mirror = i => (6 - i + 12) % 12;
    for (let i = 0; i < 12; i++) { b.dan[mirror(i)] = before.dan[i]; b.quan[mirror(i)] = before.quan[i]; }
    sq = mirror(sq);
  }
  return { board: b, sq, dir, id };
}

/** Manual, deterministic playback: one real pick/drop/capture per click, with no opponent or timers. */
export class OanQuanDemo {
  constructor(id = 'sow', dir = 1) { this.reset(id, dir); }
  reset(id = this.id, dir = this.dir) {
    const e = oanExample(id, dir);
    this.id = e.id; this.dir = e.dir; this.sq = e.sq;
    this.initial = cloneBoard(e.board); this.board = cloneBoard(e.board);
    this.result = play(e.board, 0, e.sq, e.dir);
    this.index = 0; this.hand = 0; this.event = null; this.complete = false;
    this.focus = e.sq; this.cursor = e.sq; this.arrow = null; this.gap = null;
    return this;
  }
  next() {
    if (this.complete) return false;
    const s = this.result.steps[this.index++];
    this.gap = null; this.arrow = null;
    if (!s) {
      this.board = cloneBoard(this.result.board); this.hand = 0; this.complete = true;
      this.event = { t: 'end', quickEnd: finished(this.result.board, true) };
      this.focus = null;
      return true;
    }
    this.event = { ...s }; this.focus = s.sq;
    if (s.t === 'pick') { this.board.dan[s.sq] = 0; this.hand = s.n; this.cursor = s.sq; }
    else if (s.t === 'drop') {
      this.arrow = { from: this.cursor, to: s.sq }; this.cursor = s.sq;
      this.board.dan[s.sq]++; this.hand--;
    } else {
      this.gap = (s.sq - this.dir + 12) % 12;
      this.arrow = { from: this.gap, to: s.sq };
      this.board.dan[s.sq] = 0; this.board.quan[s.sq] = 0;
      this.board.pile[0].dan += s.dan; this.board.pile[0].quan += s.quan;
    }
    return true;
  }
  snapshot() {
    return { id: this.id, dir: this.dir, sq: this.sq, board: cloneBoard(this.board), hand: this.hand,
      event: this.event && { ...this.event }, index: Math.min(this.index, this.result.steps.length),
      steps: this.result.steps.length, complete: this.complete, focus: this.focus, gap: this.gap,
      arrow: this.arrow && { ...this.arrow }, total: totalValue(this.board) + this.hand };
  }
}

export function oanDemoCaption(demo) {
  const s = demo.event;
  if (!s) return tx('Tap the glowing pit, or Next step, to pick up its pebbles. Try either direction.');
  if (s.t === 'pick') return tx('Pick up all {n} pebbles. Keep sowing in your chosen direction.', { n: s.n });
  if (s.t === 'drop') {
    if (demo.hand) return tx('Drop one pebble here. {n} left in your hand.', { n: demo.hand });
    return tx('Last pebble! Look at the NEXT pit in your direction.');
  }
  if (s.t === 'take') return tx('Skip the empty pit and capture {n} points from the next one.', { n: s.dan + s.quan * QUAN_VALUE });
  return s.quickEnd ? tx('A quan was captured: this quick round ends. Count the captured points and your remaining small-pit pebbles.')
    : tx('The next pit ends this turn. Now the other player takes a turn.');
}

const CSS = `
#oanHelpBtn{position:fixed;z-index:25;top:calc(66px + env(safe-area-inset-top,0px));left:calc(12px + env(safe-area-inset-left,0px));min-height:44px;padding:8px 14px;border:2px solid #c9b48c;border-radius:999px;background:#fff7e8;color:#65452d;font:800 15px Nunito,system-ui,sans-serif;box-shadow:0 3px 8px #39271525;touch-action:manipulation;cursor:pointer}
#oanGuide[hidden],#oanHelpBtn[hidden]{display:none!important}
#oanGuide{position:fixed;z-index:32;inset:0;background:#24181055;display:flex;align-items:center;justify-content:center;padding:72px 12px 16px;box-sizing:border-box;color:#543a26;font:700 14px/1.4 Nunito,system-ui,sans-serif}
#oanGuide .og-panel{width:830px;max-width:100%;max-height:100%;box-sizing:border-box;border:2px solid #d7bc8c;border-radius:22px;background:#fff7e8;box-shadow:0 12px 45px #27180766;overflow:auto;overscroll-behavior:contain;padding:16px;touch-action:pan-y}
#oanGuide .og-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
#oanGuide h2{font:600 24px/1.2 Fredoka,Nunito,system-ui,sans-serif;margin:0;color:#b34d23}
#oanGuide h3{font-size:16px;line-height:1.3;margin:0 0 8px}
#oanGuide button{min-height:44px;border:1.5px solid #c9b48c;border-radius:12px;padding:7px 11px;background:#fff;color:#543a26;font:800 14px/1.2 Nunito,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
#oanGuide button:hover{background:#fff0d6}
#oanGuide button:focus-visible,#oanHelpBtn:focus-visible{outline:3px solid #176f8c;outline-offset:2px}
#oanGuide button[aria-pressed=true],#oanGuide button.og-main{background:#de6c30;border-color:#b34d23;color:#fff}
#oanGuide button:disabled{opacity:.6;cursor:default}
#oanGuide .og-close{flex:none;width:44px;padding:0;font-size:26px}
#oanGuide .og-grid{display:grid;grid-template-columns:1fr 1.28fr;gap:18px}
#oanGuide .og-rules ol{padding-left:20px;margin:0}
#oanGuide .og-value{margin:0 0 10px;color:#a7401c;font-size:13px}
#oanGuide .og-rules li{padding-left:2px;margin-bottom:10px}
#oanGuide .og-controls{background:#f4e5cb;border-radius:12px;padding:10px;margin:12px 0 0}
#oanGuide .og-demo{min-width:0;padding:12px;background:#f5e6cd;border-radius:16px}
#oanGuide .og-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
#oanGuide .og-tabs button{font-size:13px;padding:6px}
#oanGuide .og-lesson{min-height:78px;margin:0 0 10px}
#oanGuide .og-direction{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#oanGuide .og-direction b{flex:1}
#oanGuide .og-rowname{text-align:center;font-size:12px;line-height:1.25;margin:3px 0}
#oanGuide .og-board{display:grid;grid-template-columns:.9fr repeat(5,1fr) .9fr;grid-template-rows:repeat(2,minmax(58px,auto));gap:4px;position:relative}
#oanGuide button.og-pit{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;min-height:58px;border:2px solid #bda478;background:#fcf4e7;border-radius:8px;padding:3px;opacity:1;cursor:default;font-size:14px}
#oanGuide button.og-pit.mine{background:#e6f0d5}
#oanGuide button.og-pit.quan{border-radius:30px;background:#f2ddad}
#oanGuide button.og-pit.focus{border-color:#d65b26;box-shadow:inset 0 0 0 2px #ef936b}
#oanGuide button.og-pit.gap{border:2px dashed #176f8c;background:#d9edf0}
#oanGuide button.og-pit.ready{cursor:pointer;box-shadow:0 0 0 3px #db773655}
#oanGuide .og-pebbles{display:flex;align-items:center;justify-content:center;gap:2px;flex-wrap:wrap;max-width:32px;min-height:12px}
#oanGuide .og-pebble{width:6px;height:6px;background:#79644c;border-radius:50%}
#oanGuide .og-quan{width:14px;height:17px;border-radius:7px 7px 5px 5px;background:#d48629;border:1px solid #885126}
#oanGuide .og-pit small{font-size:10px;line-height:1.1}
#oanGuide .og-number{position:absolute;left:3px;top:1px;font-size:9px;font-weight:700;color:#806e56}
#oanGuide .og-arrow{height:20px;text-align:center;color:#a7401c;font-size:13px;margin:4px 0}
#oanGuide .og-counts{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;margin:6px 0}
#oanGuide .og-caption{min-height:58px;background:#fffaf1;border-radius:10px;padding:9px;margin:8px 0;font-size:14px}
#oanGuide .og-actions{display:flex;gap:8px;flex-wrap:wrap}
#oanGuide .og-actions .og-next{flex:1}
#oanGuide .og-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;border-top:1px solid #d7bc8c;padding-top:12px}
#oanGuide .og-note{margin:0;font-size:12px;color:#735d47}
@media(max-width:700px){#oanGuide{padding:72px 8px 8px}#oanGuide .og-panel{padding:12px;border-radius:16px}#oanGuide h2{font-size:21px}#oanGuide .og-grid{grid-template-columns:1fr;gap:12px}#oanGuide .og-rules li{margin-bottom:8px}#oanGuide .og-demo{padding:10px}#oanGuide .og-lesson{min-height:0}#oanGuide .og-footer{align-items:flex-start}#oanHelpBtn{font-size:14px;padding:8px 11px}}
@media(max-height:480px){#oanGuide{padding:60px 8px 6px}#oanGuide .og-panel{padding:10px}#oanGuide .og-head{margin-bottom:6px}#oanHelpBtn{top:12px;left:12px}}
`;

/** The host freezes its round while isOpen, and restores any previous pause in onClose. */
export function createOanQuanGuide({ input = null, touch = false, onOpen = null, onClose = null, onStop = null } = {}) {
  if (typeof document === 'undefined') return { show() {}, hide() {}, open() {}, close() {}, destroy() {}, get isOpen() { return false; } };
  if (!document.getElementById('oanGuideCss')) {
    const css = document.createElement('style'); css.id = 'oanGuideCss'; css.textContent = CSS; document.head.appendChild(css);
  }
  const button = document.createElement('button'); button.id = 'oanHelpBtn'; button.type = 'button'; button.hidden = true;
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'oanGuide');
  const modal = document.createElement('div'); modal.id = 'oanGuide'; modal.hidden = true;
  modal.innerHTML = `<section class="og-panel" role="dialog" aria-modal="true" aria-labelledby="oanGuideTitle" tabindex="-1">
    <div class="og-head"><h2 id="oanGuideTitle"></h2><button class="og-close" type="button">×</button></div>
    <div class="og-grid"><div class="og-rules"><h3></h3><p class="og-value"></p><ol></ol><p class="og-controls"></p></div>
      <div class="og-demo"><h3></h3><div class="og-tabs"></div><p class="og-lesson"></p>
        <div class="og-direction"><b></b><button type="button" data-dir="-1">◀</button><button type="button" data-dir="1">▶</button></div>
        <div class="og-rowname og-theirs"></div><div class="og-board"></div><div class="og-rowname og-mine"></div>
        <div class="og-arrow"></div><div class="og-counts"><span class="og-hand"></span><span class="og-pile"></span></div>
        <p class="og-caption" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="og-actions"><button class="og-next og-main" type="button"></button><button class="og-reset" type="button"></button></div>
      </div></div>
    <div class="og-footer"><p class="og-note"></p><button class="og-resume og-main" type="button"></button><button class="og-stop" type="button"></button></div>
  </section>`;
  document.body.append(button, modal);
  const q = s => modal.querySelector(s), demo = new OanQuanDemo();
  let visible = false, opened = false, destroyed = false, previousFocus = null;
  const set = (s, text) => { q(s).textContent = text; };

  // Each button remains in place while drawing, so keyboard focus is never lost on a demo step.
  const pits = [];
  for (const i of [0, 11, 10, 9, 8, 7, 6, 1, 2, 3, 4, 5]) {
    const pit = document.createElement('button'); pit.type = 'button'; pit.dataset.sq = String(i);
    const quan = i === 0 || i === 6;
    pit.className = `og-pit${quan ? ' quan' : i < 6 ? ' mine' : ''}`;
    const row = quan ? '1 / span 2' : i < 6 ? '2' : '1', col = i === 0 ? 1 : i === 6 ? 7 : i < 6 ? i + 1 : 13 - i;
    pit.style.gridRow = row; pit.style.gridColumn = String(col);
    pit.innerHTML = `<span class="og-number" aria-hidden="true">${i}</span><span class="og-pebbles" aria-hidden="true"></span><b></b><small></small>`;
    pit.addEventListener('click', () => { if (!demo.index && i === demo.sq) { demo.next(); drawDemo(); } });
    q('.og-board').appendChild(pit); pits[i] = pit;
  }
  for (const lesson of OAN_LESSONS) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.dataset.lesson = lesson.id;
    tab.addEventListener('click', () => { demo.reset(lesson.id); drawDemo(); }); q('.og-tabs').appendChild(tab);
  }
  function drawDemo() {
    const s = demo.snapshot(), lesson = OAN_LESSONS.find(l => l.id === s.id);
    set('.og-lesson', tx(lesson.text));
    for (const b of q('.og-tabs').children) { b.textContent = tx(OAN_LESSONS.find(l => l.id === b.dataset.lesson).title); b.setAttribute('aria-pressed', String(b.dataset.lesson === s.id)); }
    for (const b of modal.querySelectorAll('[data-dir]')) {
      b.setAttribute('aria-pressed', String(+b.dataset.dir === s.dir));
      b.setAttribute('aria-label', +b.dataset.dir < 0 ? tx('Sow left ◀') : tx('Sow right ▶'));
    }
    for (let i = 0; i < 12; i++) {
      const pit = pits[i], d = s.board.dan[i], quan = s.board.quan[i];
      pit.classList.toggle('focus', i === s.focus); pit.classList.toggle('gap', i === s.gap);
      pit.classList.toggle('ready', !s.index && i === s.sq);
      pit.disabled = s.index > 0 || i !== s.sq;
      pit.querySelector('b').textContent = String(d);
      pit.querySelector('small').textContent = quan ? tx('1 quan') : '';
      pit.querySelector('.og-pebbles').innerHTML = `${quan ? '<i class="og-quan"></i>' : ''}${Array(Math.min(d, 6)).fill('<i class="og-pebble"></i>').join('')}`;
      pit.setAttribute('aria-label', tx('Pit {n}: {m} pebbles, {q} quan', { n: i, m: d, q: quan }));
    }
    set('.og-hand', tx('In hand: {n}', { n: s.hand }));
    set('.og-pile', tx('Captured: {n} points', { n: s.board.pile[0].dan + s.board.pile[0].quan * QUAN_VALUE }));
    set('.og-arrow', s.arrow ? tx('Pit {n} {arrow} pit {m}', { n: s.arrow.from, m: s.arrow.to, arrow: s.dir === 1 ? '▶' : '◀' }) : tx('Step {n} of {m}', { n: s.index, m: s.steps }));
    set('.og-caption', oanDemoCaption(demo));
    set('.og-next', s.complete ? tx('Example complete') : !s.index ? tx('Pick up') : tx('Next step'));
    q('.og-next').disabled = s.complete;
  }
  function draw() {
    button.textContent = `? ${tx('How to play')}`;
    button.setAttribute('aria-label', tx('How to play Ô ăn quan'));
    set('#oanGuideTitle', tx('How to play Ô ăn quan'));
    q('.og-close').setAttribute('aria-label', tx('Close help'));
    set('.og-rules h3', tx('The rules'));
    set('.og-value', tx('Pebble = 1 point · Quan = 10 points'));
    q('.og-rules ol').replaceChildren(...OAN_RULES.map(rule => { const li = document.createElement('li'); li.textContent = tx(rule); return li; }));
    set('.og-controls', touch ? tx('In the real round: tap one of your lower pits, then ◀ or ▶. Tap ? for a move hint.')
      : input?.lastDevice === 'gamepad' ? tx('In the real round: left/right chooses a pit. X sows ▶; A sows ◀. Up shows a hint.')
        : tx('In the real round: A/D or ←/→ chooses a pit. E sows ▶; Space sows ◀. W shows a hint.'));
    set('.og-demo h3', tx('Try a small example'));
    set('.og-direction b', tx('Sowing direction'));
    set('.og-theirs', tx('Other player’s pits'));
    set('.og-mine', tx('Your pits'));
    set('.og-reset', tx('Restart example'));
    set('.og-note', tx('The round is paused. This example changes no scores or pebbles in your game.'));
    set('.og-resume', tx('Back to the round'));
    set('.og-stop', tx('Stop playing'));
    q('.og-stop').hidden = !onStop;
    drawDemo();
  }
  const consume = e => { e.stopPropagation(); };
  button.addEventListener('pointerdown', consume);
  button.addEventListener('click', e => { e.stopPropagation(); open(); });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) modal.addEventListener(type, consume);
  q('.og-close').addEventListener('click', close); q('.og-resume').addEventListener('click', close);
  q('.og-stop').addEventListener('click', () => { close(); onStop?.(); });
  q('.og-next').addEventListener('click', () => { demo.next(); drawDemo(); });
  q('.og-reset').addEventListener('click', () => { demo.reset(); drawDemo(); });
  for (const b of modal.querySelectorAll('[data-dir]')) b.addEventListener('click', () => { demo.reset(demo.id, +b.dataset.dir); drawDemo(); });

  function key(e) {
    if (!opened) return;
    // Keep gameplay keyboard listeners from receiving keys while the independent help panel owns focus.
    if (e.key === 'Escape' && e.type === 'keydown') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab' && e.type === 'keydown') {
      const focusable = [...modal.querySelectorAll('button:not(:disabled):not([hidden])')];
      const stop = document.getElementById('minigameStop');
      if (stop && !stop.hidden && !stop.classList.contains('hidden')) focusable.push(stop);
      const at = focusable.indexOf(document.activeElement);
      if (at < 0 || (!e.shiftKey && at === focusable.length - 1) || (e.shiftKey && at === 0)) {
        e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    }
    e.stopImmediatePropagation();
  }
  function open() {
    if (!visible || opened || destroyed) return;
    previousFocus = document.activeElement; input?.releaseAll?.();
    opened = true; draw(); modal.hidden = false; button.setAttribute('aria-expanded', 'true');
    onOpen?.();
    document.addEventListener('keydown', key, true); document.addEventListener('keyup', key, true);
    q('.og-close').focus();
  }
  function close() {
    if (!opened) return;
    opened = false; modal.hidden = true; button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', key, true); document.removeEventListener('keyup', key, true);
    input?.releaseAll?.(); onClose?.();
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function show() { if (destroyed) return; visible = true; button.hidden = false; draw(); }
  function hide() { close(); visible = false; button.hidden = true; }
  const unlisten = onLangChange(() => { if (!destroyed) draw(); });
  function destroy() { if (destroyed) return; hide(); destroyed = true; unlisten(); button.remove(); modal.remove(); }
  draw();
  return { show, hide, open, close, destroy, get isOpen() { return opened; } };
}
