// Morning exercise: what is on the screen (the round itself is ./exercise.js, the rules ./rules-exercise.js).
//   - the move card: a little picture of the move, the arrow that answers it and its word (a "mirror" badge and the word
//     only in a mirror section; nothing in a "follow me" section);
//   - the count: the number of the count (1..8) and a ring that closes on the next count to answer, with its arrow;
//   - "Great!" / "Good" / "Oops" pops; the balance needle of a hold; the breathing circle;
//   - on a touch screen, five big buttons for one thumb (up, left, tap, right, down; the middle one is held in a hold);
//   - the routine chooser shown before a round.
// Everything is built from JavaScript (no markup in index.html) and taken away again by destroy().
import { tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';
import { ROUTINES, ROUTINE_NAME, ROUTINE_DESC, KEY_WORD } from './rules-exercise.js';

const INK = '#5a3a22', HOT = '#f08a3c';

// ------------------------------------------------------------------------------------------------ pictures
// Stick figures on a 64 x 64 card, seen from behind (as Mika is: her left is the picture's left). Each is a few
// polylines and a head; a side view (the floor poses) faces left.
const L = pts => `<polyline points="${pts.map(p => p.join(',')).join(' ')}"/>`;
const H = (x, y, r = 5.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`;
const ground = '<path d="M4 60h56" stroke="#c9b48c" stroke-width="2.5"/>';
const legs = (k = 0) => L([[27 - k, 58], [28 - k * 0.5, 48], [32, 38], [36 + k * 0.5, 48], [37 + k, 58]]);
export const PICS = {
  stretch: H(32, 14) + L([[32, 21], [32, 38]]) + legs() + L([[24, 3], [27, 12], [32, 21], [37, 12], [40, 3]]),
  swing: H(32, 12) + L([[32, 19], [32, 37]]) + legs() + L([[22, 30], [28, 25], [32, 20], [36, 25], [42, 30]]) + L([[24, 23], [40, 29]]),
  circle: H(32, 12) + L([[32, 19], [32, 37]]) + legs() + L([[18, 6], [25, 13], [32, 20], [39, 13], [46, 6]]) + `<path d="M12 22a20 20 0 0 1 40 0" fill="none" stroke="${HOT}" stroke-width="2.5" stroke-dasharray="4 3"/>`,
  sidebend: H(22, 15) + L([[30, 38], [26, 22]]) + legs() + L([[26, 22], [32, 12], [36, 3], [28, 2]]) + L([[26, 23], [22, 31], [21, 38]]),
  twist: H(32, 12) + L([[32, 19], [32, 37]]) + legs() + L([[8, 21], [20, 20], [32, 20], [38, 24], [44, 22]]) + `<path d="M20 30q12 8 24 0" fill="none" stroke="${HOT}" stroke-width="2.5"/><path d="M20 30l2-5m-2 5 5 1" stroke="${HOT}" stroke-width="2.5"/>`,
  kneebend: H(22, 18) + L([[28, 24], [38, 36]]) + L([[38, 36], [30, 46], [34, 58]]) + L([[38, 36], [32, 47], [37, 58]]) + L([[28, 25], [28, 34], [31, 44]]),
  jump: H(32, 10) + L([[32, 17], [32, 34]]) + L([[27, 50], [28, 43], [32, 34], [36, 43], [37, 50]]) + L([[24, 26], [32, 18], [40, 26]]) + '<path d="M22 58h6M36 58h6" stroke="#c9b48c" stroke-width="2.5"/>',
  breathe: H(32, 14) + L([[32, 21], [32, 38]]) + legs() + L([[19, 6], [26, 13], [32, 21], [38, 13], [45, 6]]) + `<circle cx="32" cy="30" r="13" fill="none" stroke="#57b7e8" stroke-width="2.5" stroke-dasharray="3 3"/>`,
  march: H(30, 10) + L([[30, 17], [31, 35]]) + L([[31, 35], [31, 47], [31, 58]]) + L([[31, 35], [20, 37], [21, 48]]) + L([[24, 30], [30, 19], [38, 26], [40, 20]]),
  knees: H(30, 9) + L([[30, 16], [31, 34]]) + L([[31, 34], [32, 46], [33, 56]]) + L([[31, 34], [18, 31], [20, 43]]) + L([[22, 26], [30, 18], [39, 24], [42, 16]]),
  star: H(32, 13) + L([[32, 20], [32, 36]]) + L([[18, 58], [32, 36], [46, 58]]) + L([[16, 4], [32, 21], [48, 4]]),
  squat: H(30, 17) + L([[32, 24], [40, 40]]) + L([[40, 40], [26, 46], [32, 58]]) + L([[31, 26], [12, 26]]),
  plank: H(10, 37) + L([[16, 40], [44, 55]]) + L([[44, 55], [58, 56]]) + L([[17, 41], [17, 56]]) + ground,
  reach: H(26, 44) + L([[28, 37], [36, 30]]) + L([[36, 30], [38, 44], [36, 58]]) + L([[29, 38], [30, 50]]) + ground,
  mountain: H(32, 12) + L([[32, 19], [32, 37]]) + legs(-1) + L([[26, 36], [27, 27], [32, 20], [37, 27], [38, 36]]),
  tree: H(32, 13) + L([[32, 20], [32, 37]]) + L([[32, 37], [34, 48], [34, 58]]) + L([[32, 37], [22, 44], [33, 49]]) + L([[22, 4], [27, 12], [32, 20], [37, 12], [42, 4]]),
  warrior: H(34, 12) + L([[32, 19], [32, 36]]) + L([[32, 36], [18, 44], [14, 58]]) + L([[32, 36], [46, 47], [52, 58]]) + L([[6, 21], [58, 21]]),
  bird: H(13, 27) + L([[18, 30], [34, 40]]) + L([[34, 40], [34, 50], [34, 58]]) + L([[34, 40], [57, 31]]) + L([[22, 32], [30, 22]]) + ground,
  catcow: H(10, 32) + `<path d="M16 38q14 9 28 0" fill="none"/>` + L([[16, 38], [16, 56]]) + L([[44, 38], [44, 55], [57, 56]]) + ground,
  cobra: H(11, 31) + L([[16, 38], [24, 50], [34, 55], [58, 56]]) + L([[17, 39], [20, 47], [15, 56]]) + ground,
  child: H(15, 51) + `<path d="M20 50q12-14 26-4" fill="none"/>` + L([[46, 46], [38, 56], [54, 56]]) + L([[20, 49], [6, 56]]) + ground,
};
export const ARROW = { up: '▲', down: '▼', left: '◀', right: '▶', tap: '●' };
export const pic = (name, flip = false) => `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${flip ? ' transform="translate(64 0) scale(-1 1)"' : ''}>${PICS[name] || ''}</g></svg>`;

const CSS = `
#exRound{position:fixed;inset:0;z-index:14;pointer-events:none;font:700 15px Nunito,system-ui,sans-serif;color:#5a3a22;zoom:var(--ui-scale,1)}
#exRound.hidden{display:none}
#exRound .card{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));top:calc(84px + env(safe-area-inset-top,0px));width:150px;padding:8px 8px 10px;box-sizing:border-box;
 border-radius:20px;background:rgba(255,247,232,.95);box-shadow:0 6px 20px rgba(40,20,0,.25);text-align:center;transition:opacity .25s,transform .25s}
#exRound .card.off{opacity:0;transform:translateY(-8px)}
#exRound .card svg{display:block;width:88px;height:88px;margin:0 auto;border-radius:16px;background:#fdeccb}
#exRound .card .w{display:block;margin-top:5px;font:600 18px Fredoka,Nunito,sans-serif;color:#7a3e16;line-height:1.1}
#exRound .card .k{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:34px;margin-top:5px;padding:0 9px;border-radius:12px;background:#f08a3c;color:#fff;font:600 20px Fredoka,Nunito,sans-serif;box-shadow:0 3px 0 #b8581c}
#exRound .card .k:empty{display:none}
#exRound .card .mir{display:none;margin:4px auto 0;padding:2px 10px;border-radius:10px;background:#5a7ad8;color:#fff;font-size:12px;width:max-content}
#exRound .card.mirror .mir{display:block}
#exRound .card.mirror svg{display:none}
#exRound .card.mirror .w{font-size:24px;margin:8px 0 2px}
#exRound .beat{position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;align-items:center;gap:12px;
 padding:8px 16px 8px 10px;border-radius:999px;background:rgba(255,247,232,.92);box-shadow:0 6px 20px rgba(40,20,0,.25)}
#exRound .beat{transition:opacity .3s}
#exRound .beat.quiet{opacity:0}
#exRound .ring{position:relative;width:64px;height:64px;flex:none}
#exRound .ring .core{position:absolute;inset:12px;border-radius:50%;background:#f08a3c;color:#fff;display:flex;align-items:center;justify-content:center;font:600 20px Fredoka,Nunito,sans-serif;box-shadow:0 2px 6px rgba(40,20,0,.3)}
#exRound .ring .core.idle{background:#e6d3b0;color:#8a6a4a}
#exRound .ring .shrink{position:absolute;inset:0;border-radius:50%;border:4px solid #f08a3c;opacity:0;will-change:transform}
#exRound .num{font:600 34px Fredoka,Nunito,sans-serif;color:#c2541c;min-width:30px;text-align:center}
#exRound .dots{display:flex;gap:5px}
#exRound .dots i{width:9px;height:9px;border-radius:50%;background:#e6d3b0}
#exRound .dots i.on{background:#f08a3c}
#exRound .dots i.hit{box-shadow:0 0 0 2px #fff,0 0 0 4px #f08a3c88}
#exRound .pop{position:absolute;left:50%;bottom:calc(108px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font:600 34px Fredoka,Nunito,sans-serif;color:#fff;
 text-shadow:0 3px 0 #c2541c,0 6px 14px rgba(40,20,0,.4);opacity:0;white-space:nowrap}
#exRound .pop.good{text-shadow:0 3px 0 #3a8a3a,0 6px 14px rgba(40,20,0,.4)}
#exRound .pop.oops{color:#fff5e8;text-shadow:0 3px 0 #8a6a4a,0 6px 14px rgba(40,20,0,.35);font-size:26px}
#exRound .pop.show{animation:exPop .7s ease-out both}
@keyframes exPop{0%{opacity:0;transform:translate(-50%,10px) scale(.7)}20%{opacity:1;transform:translate(-50%,0) scale(1.08)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}
#exRound .meter,#exRound .breath{display:none}
#exRound.hold .meter{display:flex}
#exRound.breathing .breath{display:flex}
#exRound.hold .ring,#exRound.breathing .ring,#exRound.hold .dots,#exRound.breathing .dots{display:none}
#exRound .meter{flex-direction:column;align-items:center;gap:3px}
#exRound .meter .bar{position:relative;width:190px;height:20px;border-radius:10px;background:#f1d4c4;overflow:hidden}
#exRound .meter .zone{position:absolute;top:0;bottom:0;left:50%;width:32%;margin-left:-16%;background:#9edb8f}
#exRound .meter .needle{position:absolute;top:-2px;bottom:-2px;left:50%;width:6px;margin-left:-3px;border-radius:3px;background:#5a3a22;will-change:transform}
#exRound .meter .lab,#exRound .breath .lab{font-size:13px;white-space:nowrap}
#exRound .meter.off .zone{background:#e6d3b0}
#exRound .breath{align-items:center;gap:10px}
#exRound .breath .circ{position:relative;width:64px;height:64px}
#exRound .breath .guide{position:absolute;inset:0;border-radius:50%;border:3px dashed #57b7e8;will-change:transform}
#exRound .breath .me{position:absolute;inset:0;border-radius:50%;background:#bfe6f7;will-change:transform}
#exRound .breath.ok .me{background:#9edb8f}
#exRound .pad{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));width:198px;height:198px;display:none;pointer-events:none}
#exRound.touch .pad{display:block}
#exRound .pad button{position:absolute;width:62px;height:62px;border:0;border-radius:18px;background:rgba(255,247,232,.92);color:#5a3a22;font:600 22px Fredoka,Nunito,sans-serif;
 box-shadow:0 4px 0 #c9a97a,0 6px 14px rgba(40,20,0,.25);pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;padding:0}
#exRound .pad button.press{transform:translateY(3px);background:#ffe1b0;box-shadow:0 1px 0 #c9a97a}
#exRound .pad button.want{background:#f08a3c;color:#fff;box-shadow:0 4px 0 #b8581c,0 0 0 4px #ffffffaa}
#exRound .pad .up{left:68px;top:0}#exRound .pad .down{left:68px;bottom:0}
#exRound .pad .left{left:0;top:68px}#exRound .pad .right{right:0;top:68px}
#exRound .pad .tap{left:68px;top:68px;border-radius:50%;font-size:30px;line-height:1}
#exRound .pad .tap.lab{font-size:13px;line-height:1.05}
#exRound.touch .beat{left:calc(14px + env(safe-area-inset-left,0px));transform:none}
#exRound.touch .pop{left:calc(120px + env(safe-area-inset-left,0px))}
body.ex-round #touch{display:none}
body.ex-round #trickHint.top{max-width:min(460px,62vw)}
@media (max-width:560px){
 body.ex-round #trickHint.top{max-width:88vw}
 #exRound .card{width:118px;top:calc(214px + env(safe-area-inset-top,0px));padding:6px 6px 8px;border-radius:16px}
 #exRound .card svg{width:66px;height:66px}
 #exRound .card .w{font-size:15px}
 #exRound .beat{gap:6px;padding:6px 10px 6px 6px}
 #exRound .dots{display:none}
 #exRound .meter .bar{width:120px}
 #exRound.touch .beat{bottom:calc(22px + env(safe-area-inset-bottom,0px))}
 #exRound.touch .pop{left:calc(76px + env(safe-area-inset-left,0px));bottom:calc(118px + env(safe-area-inset-bottom,0px));font-size:30px}
}
@media (max-height:480px){
 #exRound .card{top:calc(114px + env(safe-area-inset-top,0px));width:auto;max-width:230px;padding:5px 8px 5px 5px;display:flex;align-items:center;gap:7px;text-align:left;border-radius:16px}
 #exRound .card svg{width:46px;height:46px;border-radius:12px}
 #exRound .card .w{font-size:14px;margin:0;flex:1}
 #exRound .card .k{height:28px;min-width:30px;font-size:16px;margin:0;padding:0 6px}
 #exRound .card .mir{margin:0}
 #exRound .pad{transform:scale(.86);transform-origin:right bottom}
 #exRound .dots{display:none}
 #exRound .beat{transform:translateX(-50%) scale(.86);transform-origin:center bottom;bottom:calc(10px + env(safe-area-inset-bottom,0px))}
 #exRound.touch .beat{transform:scale(.86);transform-origin:left bottom}
 #exRound .pop{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
 #exRound.touch .pop{left:calc(70px + env(safe-area-inset-left,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));font-size:28px}
}
#exPick{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35);padding:12px;box-sizing:border-box}
#exPick .box{width:min(560px,96vw);max-height:94vh;overflow:auto;padding:16px 18px 14px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1);box-sizing:border-box}
#exPick h2{margin:0 0 10px;font:600 23px Fredoka,Nunito,sans-serif;color:#7a3e16}
#exPick .row{display:flex;gap:10px}
#exPick button.rt{flex:1 1 0;min-width:0;border:0;border-radius:18px;padding:10px 6px;cursor:pointer;background:#f4dfb5;color:#5a3a22;font:inherit;box-shadow:0 4px 0 #d9bd85;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#exPick button.rt svg{display:block;width:64px;height:64px;margin:0 auto 4px;border-radius:14px;background:#fdeccb}
#exPick button.rt b{display:block;font:600 18px Fredoka,Nunito,sans-serif;color:#c2541c}
#exPick button.rt span{display:block;font-size:12.5px;font-weight:600;color:#8a6a4a;line-height:1.2;margin-top:3px}
#exPick button.rt.sel{background:#ffe9b8;box-shadow:0 4px 0 #f08a3c,0 0 0 3px #f08a3c}
#exPick .foot{display:flex;gap:10px;justify-content:center;margin-top:14px}
#exPick .foot button{flex:1;max-width:220px;min-height:44px;padding:11px 10px;border:0;border-radius:14px;font:700 16px Nunito,sans-serif;cursor:pointer;background:#f4dfb5;color:#5a3a22}
#exPick .foot button.main{background:#f08a3c;color:#fff}
#exPick kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@media (max-width:480px){
 #exPick .row{flex-direction:column;gap:8px}
 #exPick button.rt{display:grid;grid-template-columns:52px 1fr;align-items:center;text-align:left;padding:8px 12px;gap:0 10px}
 #exPick button.rt svg{grid-row:1/3;width:52px;height:52px;margin:0}
}
@media (max-height:480px){#exPick button.rt svg{width:44px;height:44px}#exPick .box{padding:10px 14px}}
`;

const ROUTINE_PIC = { radio: 'stretch', workout: 'star', yoga: 'tree' };

/** The routine chooser. Resolves 'radio' | 'workout' | 'yoga', or null when the player backs out. step(input) each frame. */
export function openRoutinePicker({ title, routine = 'radio', touch = false }) {
  addCss('exUiCss', CSS);
  const el = document.createElement('div');
  el.id = 'exPick';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="box"><h2></h2><div class="row">${ROUTINES.map(r => `<button type="button" class="rt" data-r="${r}">${pic(ROUTINE_PIC[r])}<b></b><span></span></button>`).join('')}</div>
    <div class="foot"><button type="button" class="back"></button><button type="button" class="main go"></button></div></div>`;
  document.body.appendChild(el);
  el.querySelector('h2').textContent = title;
  let sel = ROUTINES.includes(routine) ? routine : 'radio', open = true, resolve, age = 0;
  const done = new Promise(r => { resolve = r; });
  const finish = v => { if (!open) return; open = false; el.remove(); resolve(v); };
  for (const b of el.querySelectorAll('button.rt')) {
    const r = b.dataset.r;
    b.querySelector('b').textContent = tx(ROUTINE_NAME[r]);
    b.querySelector('span').textContent = tx(ROUTINE_DESC[r]);
    b.addEventListener('click', () => { if (sel === r || touch) finish(r); else { sel = r; paint(); } });
  }
  el.querySelector('.back').innerHTML = `${tx('Back')}${touch ? '' : '<kbd>⌫</kbd>'}`;
  el.querySelector('.go').innerHTML = `${tx('Play')}${touch ? '' : '<kbd>E</kbd>'}`;
  el.querySelector('.back').addEventListener('click', () => finish(null));
  el.querySelector('.go').addEventListener('click', () => finish(sel));
  const paint = () => { for (const b of el.querySelectorAll('button.rt')) b.classList.toggle('sel', b.dataset.r === sel); };
  paint();
  let stick = 0;
  return {
    done,
    step(inp, dt) {
      if (!open) return;
      age += dt;
      if (age < 0.3) return;
      const sx = inp.move?.x || 0, sd = sx > 0.6 ? 1 : sx < -0.6 ? -1 : 0, edge = sd !== stick ? sd : 0;
      stick = sd;
      const d = inp.pressed('right') || inp.pressed('down') || edge > 0 ? 1 : inp.pressed('left') || inp.pressed('up') || edge < 0 ? -1 : 0;
      if (d) { sel = ROUTINES[(ROUTINES.indexOf(sel) + d + ROUTINES.length) % ROUTINES.length]; paint(); }
      else if (inp.pressed('act') || inp.pressed('jump')) finish(sel);
      else if (inp.pressed('back')) finish(null);
    },
    close() { finish(null); },
  };
}

/**
 * The round's screen. touch: draw the buttons. Returns an object the round drives every frame; its `pad` state is what
 * the touch buttons hold ({ up, down, left, right, tap } held, and `edges` pressed since the last read).
 */
export function makeHud({ touch = false }) {
  addCss('exUiCss', CSS);
  const el = document.createElement('div');
  el.id = 'exRound';
  el.className = touch ? 'touch' : '';
  el.innerHTML = `<div class="card off"><div class="pic"></div><span class="w"></span><span class="k"></span><span class="mir"></span></div>
    <div class="beat"><div class="ring"><div class="shrink"></div><div class="core idle"></div></div><div class="num"></div><div class="dots">${'<i></i>'.repeat(8)}</div>
      <div class="meter"><div class="bar"><div class="zone"></div><div class="needle"></div></div><span class="lab"></span></div>
      <div class="breath"><div class="circ"><div class="me"></div><div class="guide"></div></div><span class="lab"></span></div></div>
    <div class="pop"></div>
    <div class="pad">${['up', 'left', 'tap', 'right', 'down'].map(k => `<button type="button" class="${k}" data-k="${k}" aria-label="${k}"></button>`).join('')}</div>`;
  document.body.appendChild(el);
  document.body.classList.add('ex-round');
  const q = s => el.querySelector(s);
  const card = q('.card'), core = q('.core'), shrink = q('.shrink'), num = q('.num'), dots = [...el.querySelectorAll('.dots i')], beat = q('.beat');
  const pop = q('.pop'), needle = q('.needle'), meter = q('.meter'), breath = q('.breath'), me = q('.breath .me'), guide = q('.breath .guide');
  const pad = { up: false, down: false, left: false, right: false, tap: false, edges: [] };
  const buttons = {};
  const listeners = [];
  for (const b of el.querySelectorAll('.pad button')) {
    const k = b.dataset.k;
    buttons[k] = b;
    b.textContent = ARROW[k];
    const down = e => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture?.(e.pointerId); } catch { /* a pointer the page did not see start */ } if (!pad[k]) pad.edges.push(k); pad[k] = true; b.classList.add('press'); };
    const up = e => { e.preventDefault?.(); pad[k] = false; b.classList.remove('press'); };
    b.addEventListener('pointerdown', down);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  const release = () => { for (const k of ['up', 'down', 'left', 'right', 'tap']) { pad[k] = false; buttons[k]?.classList.remove('press'); } };
  const vis = () => { if (document.hidden) release(); };
  document.addEventListener('visibilitychange', vis);
  listeners.push(() => document.removeEventListener('visibilitychange', vis));
  let last = {};
  const set = (k, v, f) => { if (last[k] !== v) { last[k] = v; f(v); } };
  return {
    el, pad,
    /** The move card: { pic, word, key, flip, mode: 'full' | 'word' | 'none', show }. */
    card({ picName = '', word = '', key = '', flip = false, mode = 'full', show = true }) {
      const sig = `${picName}|${word}|${key}|${flip}|${mode}|${show}`;
      set('card', sig, () => {
        card.classList.toggle('off', !show || mode === 'none');
        card.classList.toggle('mirror', mode === 'word');
        if (mode !== 'word') q('.card .pic').innerHTML = picName ? pic(picName, flip) : '';
        q('.card .w').textContent = word;
        q('.card .k').textContent = mode === 'full' && key ? ARROW[key] : '';
        q('.card .mir').textContent = tx('Mirror!');
      });
    },
    /** The count: n (1..8, or 0 for none), dots lit up to n, the next cue's key and how near it is (0..1, 1 = now). */
    count(n, hits, key, near, mode) {
      set('num', n, v => { num.textContent = v ? String(v) : ''; dots.forEach((d, i) => d.classList.toggle('on', i < v)); });
      set('hits', hits, v => dots.forEach((d, i) => d.classList.toggle('hit', !!(v & (1 << i)))));
      const shown = key ? (mode === 'full' ? ARROW[key] : '?') : '';
      set('key', shown, v => { core.textContent = v; core.classList.toggle('idle', !v); });
      const s = key && near > 0 ? 2.1 - 1.1 * near : 1, op = key && near > 0 ? Math.min(1, near * 1.6) : 0;
      set('ring', `${Math.round(s * 50)}|${Math.round(op * 20)}`, () => { shrink.style.transform = `scale(${s.toFixed(3)})`; shrink.style.opacity = op.toFixed(2); });
      set('quiet', !n && !el.classList.contains('hold') && !el.classList.contains('breathing'), v => beat.classList.toggle('quiet', v));
    },
    pop(kind) {
      const text = kind === 'great' ? tx('Great!') : kind === 'good' ? tx('Good') : kind === 'wrong' ? tx('Other way!') : tx('Oops');
      pop.textContent = text;
      pop.className = `pop ${kind === 'great' ? '' : kind === 'good' ? 'good' : 'oops'}`;
      void pop.offsetWidth;
      pop.classList.add('show');
    },
    /** Hold mode: w (-1..1) the needle, steady, holding; or null to leave hold mode. */
    hold(st) {
      set('mode', st ? 'hold' : last.breath ? 'breathing' : '', v => { el.classList.toggle('hold', v === 'hold'); });
      if (!st) return;
      set('needle', Math.round(st.w * 100), v => { needle.style.transform = `translateX(${(v * 0.95).toFixed(0)}px)`; });
      set('steady', st.holding, v => meter.classList.toggle('off', !v));
      set('hlab', st.holding ? (st.steady ? 'ok' : st.w > 0 ? 'l' : 'r') : 'press', v => {
        q('.meter .lab').textContent = v === 'ok' ? tx('Steady!') : v === 'press' ? tx('Hold the button') : v === 'l' ? tx('Wobbly: tap left') : tx('Wobbly: tap right');
      });
    },
    /** Breath mode: guide (0..1 the guide circle), mine (0..1), inNow, ok; or null. */
    breath(st) {
      set('breath', !!st, v => el.classList.toggle('breathing', v));
      if (!st) return;
      set('guide', Math.round(st.guide * 50), () => { guide.style.transform = `scale(${(0.4 + 0.6 * st.guide).toFixed(3)})`; });
      set('mine', Math.round(st.mine * 50), () => { me.style.transform = `scale(${(0.4 + 0.6 * st.mine).toFixed(3)})`; });
      set('bok', st.ok, v => breath.classList.toggle('ok', v));
      set('blab', st.inNow, v => { q('.breath .lab').textContent = v ? tx('Breathe in: hold') : tx('Breathe out: let go'); });
    },
    /** Light the touch button that answers now (and label the middle one for a hold or a breath). */
    want(key, middle) {
      set('want', key || '', v => { for (const [k, b] of Object.entries(buttons)) b.classList.toggle('want', k === v); });
      set('mid', middle || '', v => { if (buttons.tap) { buttons.tap.textContent = v ? tx(v) : ARROW.tap; buttons.tap.classList.toggle('lab', !!v); } });
    },
    release,
    destroy() {
      release();
      listeners.forEach(f => f());
      el.remove();
      document.body.classList.remove('ex-round');
    },
  };
}

export { KEY_WORD };
