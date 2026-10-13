// The level picker: three big buttons (Easy, Normal, Difficult) shown before a mini game round, each with the stars
// earned on it; a level still closed shows a lock and what opens it. Mouse and touch press a button; keyboard and
// gamepad move with left / right and choose with the action (or Jump), Backspace leaves. The runner calls step(input)
// every frame while it is up (the game's own Input, so the picker needs no key listeners of its own).
import { tx } from '../i18n/i18n.js';
import { LEVELS, LEVEL_NAME, UNLOCK_TEXT, unlocked, levelStars, levelBest } from '../content/levels.js';

const CSS = `
#lvlPick{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35);padding:12px;box-sizing:border-box}
#lvlPick.hidden{display:none}
#lvlPick .box{width:min(560px,96vw);max-height:94vh;overflow:auto;padding:16px 18px 14px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1);box-sizing:border-box}
#lvlPick h2{margin:0 0 2px;font:600 23px Fredoka,Nunito,sans-serif;color:#7a3e16;display:flex;align-items:center;justify-content:center;gap:10px}
#lvlPick h2 img{width:40px;height:40px;border-radius:50%;background:#ffe9b8}
#lvlPick .sub{margin:0 0 12px;color:#8a6a4a;font-weight:600}
#lvlPick .row{display:flex;gap:10px}
#lvlPick button.lv{flex:1 1 0;min-width:0;border:0;border-radius:18px;padding:12px 6px 10px;cursor:pointer;background:#f4dfb5;color:#5a3a22;font:inherit;
 box-shadow:0 4px 0 #d9bd85;-webkit-tap-highlight-color:transparent;touch-action:manipulation;position:relative}
#lvlPick button.lv b{display:block;font:600 19px Fredoka,Nunito,sans-serif}
#lvlPick button.lv .st{display:block;font-size:22px;letter-spacing:2px;color:#f2a51a;margin:2px 0}
#lvlPick button.lv .bt{display:block;font-size:12.5px;font-weight:600;color:#8a6a4a;min-height:2.4em;line-height:1.2}
#lvlPick button.lv.easy b{color:#2f8a4a}
#lvlPick button.lv.normal b{color:#c2541c}
#lvlPick button.lv.hard b{color:#a3312c}
#lvlPick button.lv.sel{background:#ffe9b8;box-shadow:0 4px 0 #f08a3c,0 0 0 3px #f08a3c}
#lvlPick button.lv.lock{background:#ece4d6;box-shadow:0 4px 0 #cfc5b3;cursor:default}
#lvlPick button.lv.lock b,#lvlPick button.lv.lock .st{color:#a89c88}
#lvlPick .foot{display:flex;gap:10px;justify-content:center;margin-top:14px}
#lvlPick .foot button{flex:1;max-width:220px;padding:11px 10px;border:0;border-radius:14px;font:700 16px Nunito,sans-serif;cursor:pointer;background:#f4dfb5;color:#5a3a22}
#lvlPick .foot button.main{background:#f08a3c;color:#fff}
#lvlPick kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@media (max-width:480px){
 #lvlPick .row{flex-direction:column;gap:8px}
 #lvlPick button.lv{display:grid;grid-template-columns:1fr auto;align-items:center;text-align:left;padding:9px 14px;gap:0 10px}
 #lvlPick button.lv .st{grid-row:1/3;grid-column:2;font-size:20px}
 #lvlPick button.lv .bt{min-height:0}
}
`;

let el = null;
function build() {
  if (el || typeof document === 'undefined') return el;
  const s = document.createElement('style');
  s.id = 'lvlPickCss';
  s.textContent = CSS;
  document.head.appendChild(s);
  el = document.createElement('div');
  el.id = 'lvlPick';
  el.className = 'hidden';
  el.setAttribute('role', 'dialog');
  el.innerHTML = '<div class="box"></div>';
  el.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.appendChild(el);
  return el;
}

/**
 * Open the picker. { name: the game's name (already translated), icon: an image url or '', rec: the saved record,
 * level: the one to offer first, unit: the score's unit (translated) or '', touch }.
 * Returns { done: Promise<'easy' | 'normal' | 'hard' | null>, step(input), close() }: call step every frame; close()
 * (the round was taken away) resolves null.
 */
export function openLevelPicker({ name, icon = '', rec = null, level = 'easy', unit = '', touch = false } = {}) {
  if (!build()) return { done: Promise.resolve(level), step() {}, close() {} };
  const box = el.querySelector('.box');
  let sel = unlocked(rec, level) ? level : 'easy', open = true, age = 0, resolve;
  const done = new Promise(r => { resolve = r; });
  const finish = v => { if (!open) return; open = false; el.classList.add('hidden'); box.innerHTML = ''; resolve(v); };
  const star = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  box.innerHTML = `<h2>${icon ? '<img alt="">' : ''}<span></span></h2><p class="sub"></p><div class="row">${LEVELS.map(l => `<button type="button" class="lv ${l}" data-l="${l}"><b></b><span class="st"></span><span class="bt"></span></button>`).join('')}</div>
    <div class="foot"><button type="button" class="back"></button><button type="button" class="main go"></button></div>`;
  if (icon) { const im = box.querySelector('h2 img'); im.onerror = () => { im.style.display = 'none'; }; im.src = icon; }
  box.querySelector('h2 span').textContent = name || '';
  box.querySelector('.sub').textContent = tx('Choose a level');
  for (const b of box.querySelectorAll('button.lv')) {
    const l = b.dataset.l, on = unlocked(rec, l), best = levelBest(rec, l);
    b.classList.toggle('lock', !on);
    b.querySelector('b').textContent = (on ? '' : '🔒 ') + tx(LEVEL_NAME[l]);
    b.querySelector('.st').textContent = star(levelStars(rec, l));
    b.querySelector('.bt').textContent = on ? (best ? tx('Best: {n}', { n: best }) + (unit ? ` ${unit}` : '') : tx('Not played yet')) : tx(UNLOCK_TEXT[l]);
    b.setAttribute('aria-disabled', String(!on));
    b.addEventListener('click', () => { if (!on) return; if (sel === l || touch) { sel = l; finish(l); } else { sel = l; paint(); } });
  }
  box.querySelector('.back').innerHTML = `${tx('Back')}${touch ? '' : '<kbd>⌫</kbd>'}`;
  box.querySelector('.go').innerHTML = `${tx('Play')}${touch ? '' : '<kbd>E</kbd>'}`;
  box.querySelector('.back').addEventListener('click', () => finish(null));
  box.querySelector('.go').addEventListener('click', () => finish(sel));
  function paint() { for (const b of box.querySelectorAll('button.lv')) b.classList.toggle('sel', b.dataset.l === sel); }
  paint();
  el.classList.remove('hidden');
  const move = d => {
    let i = LEVELS.indexOf(sel);
    for (let k = 0; k < LEVELS.length; k++) { i = (i + d + LEVELS.length) % LEVELS.length; if (unlocked(rec, LEVELS[i])) { sel = LEVELS[i]; break; } }
    paint();
  };
  return {
    done,
    get selected() { return sel; },
    step(inp, dt = 0.016) {
      if (!open || !inp) return;
      age += dt;
      if (age < 0.35) return;                        // the press that opened it must not choose
      if (inp.pressed('left') || inp.pressed('up')) move(-1);
      else if (inp.pressed('right') || inp.pressed('down')) move(1);
      else if (inp.pressed('act') || inp.pressed('jump')) finish(sel);
      else if (inp.pressed('back')) finish(null);
    },
    close() { finish(null); },
  };
}
