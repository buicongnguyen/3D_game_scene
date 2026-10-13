// A small chooser two tricks share (the kite: which kite to build; the paper planes: which plane to fold): a row of
// picture buttons, and under it the chosen one's name, one line about it and two or three bars that say how it flies.
// It sits under the round's HUD, not over the whole screen, so the "How to play" card and the touch buttons stay free.
// Mouse and touch press a picture and then the button; keyboard and gamepad move with left / right and choose with the
// action (or Jump). The round calls step(input) every frame while it is up (the game's own Input: no key listeners here).
import { tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';

const CSS = `
#trickPick{position:fixed;left:50%;top:calc(68px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;width:min(400px,94vw);box-sizing:border-box;
 padding:9px 12px 11px;border-radius:18px;background:rgba(255,247,232,.95);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);touch-action:manipulation;user-select:none;-webkit-user-select:none}
#trickPick h3{margin:0 0 6px;font:600 17px Fredoka,Nunito,sans-serif;color:#c2541c;text-align:center}
#trickPick .row{display:flex;gap:6px;justify-content:center}
#trickPick .it{all:unset;box-sizing:border-box;flex:1 1 0;max-width:74px;min-width:0;aspect-ratio:1;border-radius:14px;background:#f4dfb5;box-shadow:0 3px 0 #d9bd85;cursor:pointer;position:relative;
 display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
#trickPick .it img,#trickPick .it svg{width:86%;height:86%;display:block;pointer-events:none}
#trickPick .it.sel{background:#ffe9b8;box-shadow:0 3px 0 #f08a3c,0 0 0 3px #f08a3c}
#trickPick .it.lock img,#trickPick .it.lock svg{opacity:.35;filter:grayscale(.7)}
#trickPick .it.lock::after{content:'';position:absolute;right:4px;bottom:4px;width:16px;height:16px;border-radius:50%;background:#a89c88 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='4.5' y='7.5' width='7' height='5' rx='1' fill='%23fff'/%3E%3Cpath d='M6 7.5V6a2 2 0 0 1 4 0v1.5' fill='none' stroke='%23fff' stroke-width='1.4'/%3E%3C/svg%3E") center/contain}
#trickPick .info{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;margin-top:9px;text-align:left}
#trickPick .info b{font:600 17px Fredoka,Nunito,sans-serif;color:#7a3e16}
#trickPick .info p{margin:0;grid-column:1;font-size:13px;font-weight:600;line-height:1.25;color:#6a4a32;min-height:2.5em}
#trickPick .bars{grid-column:2;grid-row:1/3;display:grid;grid-template-columns:auto auto;gap:3px 6px;align-items:center;font-size:12px;color:#8a6a4a}
#trickPick .bars i{display:flex;gap:2px}
#trickPick .bars i u{width:9px;height:9px;border-radius:3px;background:#ead9b8}
#trickPick .bars i u.on{background:#f08a3c}
#trickPick .go{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:9px;padding:8px 10px;border-radius:13px;background:#f08a3c;color:#fff;font:700 15px Nunito,sans-serif;text-align:center;cursor:pointer;
 box-shadow:0 3px 0 #b8581a;-webkit-tap-highlight-color:transparent}
#trickPick .go.off{background:#d8cdb8;box-shadow:0 3px 0 #b9ad96;color:#6f6455;cursor:default}
#trickPick kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@media (max-width:520px){#trickPick{top:calc(112px + env(safe-area-inset-top,0px));padding:7px 9px 9px}#trickPick h3{font-size:15px;margin-bottom:5px}#trickPick .it{max-width:60px;border-radius:12px}
 #trickPick .info{margin-top:7px}#trickPick .info p{font-size:12px;min-height:3.7em}#trickPick .go{margin-top:6px;padding:7px 10px}}
@media (max-height:480px){#trickPick{top:calc(60px + env(safe-area-inset-top,0px));padding:6px 10px 8px}#trickPick h3{font-size:14px;margin-bottom:4px}#trickPick .it{max-width:54px}
 #trickPick .info{margin-top:5px}#trickPick .info p{font-size:12px;min-height:2.5em}#trickPick .go{margin-top:5px;padding:6px 10px}}
`;

/**
 * Open the chooser. items: [{ id, name, desc, pic (an image url or SVG markup), stats: [[label, 1..5]], lock: a line that
 * says what opens it (or '' when it is open) }] (name, desc, labels and lock already translated). sel: the id offered first.
 * Returns { done: Promise<id | null>, step(input), close(), sel(): the id shown now }. onSel(id) is called when the
 * shown one changes (the round shows that kite in the picture).
 */
export function openPick({ title, items, sel = null, go = '', touch = false, onSel = null }) {
  addCss('trickPickCss', CSS);
  document.getElementById('trickPick')?.remove();
  const el = document.createElement('div');
  el.id = 'trickPick';
  el.setAttribute('role', 'dialog');
  const pic = it => (/^\s*</.test(it.pic) ? it.pic : `<img alt="" src="${it.pic}">`);
  el.innerHTML = `<h3></h3><div class="row">${items.map((it, i) => `<button class="it${it.lock ? ' lock' : ''}" type="button" data-i="${i}">${pic(it)}</button>`).join('')}</div>
    <div class="info"><b></b><p></p><div class="bars"></div></div><button class="go" type="button"></button>`;
  el.querySelector('h3').textContent = title;
  document.body.appendChild(el);
  const q = s => el.querySelector(s), btns = [...el.querySelectorAll('.it')];
  let at = Math.max(0, items.findIndex(it => it.id === sel)), resolve = null, open = true, axis = 0;
  const done = new Promise(r => { resolve = r; });
  const show = () => {
    const it = items[at];
    btns.forEach((b, i) => { b.classList.toggle('sel', i === at); b.setAttribute('aria-label', items[i].name); });
    q('.info b').textContent = it.name;
    q('.info p').textContent = it.desc;
    q('.bars').innerHTML = it.stats.map(([l, n]) => `<span></span><i>${[1, 2, 3, 4, 5].map(k => `<u${k <= n ? ' class="on"' : ''}></u>`).join('')}</i>`).join('');
    q('.bars').querySelectorAll('span').forEach((s, i) => { s.textContent = it.stats[i][0]; });
    const b = q('.go');
    b.classList.toggle('off', !!it.lock);
    if (it.lock) b.textContent = it.lock;
    else b.innerHTML = `${go || tx('Choose')}${touch ? '' : '<kbd>E</kbd>'}`;
    onSel?.(it.id);
  };
  const finish = v => { if (!open) return; open = false; el.remove(); resolve(v); };
  const choose = () => { if (!items[at].lock) finish(items[at].id); };
  const move = i => { const n = Math.max(0, Math.min(items.length - 1, i)); if (n !== at) { at = n; show(); } };
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const b = e.target.closest?.('.it');
    if (b) { e.preventDefault(); move(+b.dataset.i); } else if (e.target.closest?.('.go')) { e.preventDefault(); choose(); }
  });
  show();
  return {
    done, el,
    sel: () => items[at].id,
    /** Keyboard and gamepad, read from the game's Input once a frame. */
    step(input) {
      if (!open) return;
      const x = input.move.x, dir = x > 0.5 ? 1 : x < -0.5 ? -1 : 0;
      if (dir && dir !== axis) move(at + dir);
      axis = dir;
      if (input.pressed('act') || input.pressed('jump')) choose();
    },
    close() { finish(null); },
  };
}
