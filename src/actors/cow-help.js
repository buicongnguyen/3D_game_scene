// How to ride and race, drawn in code: the little animated pictures (inline SVG + CSS keyframes, no assets), the free-ride
// coach card (3 steps, learn by doing) and the cow race's intro card. Texts and the step logic are pure and tested:
// game/tricks/rules-cowhelp.js. Used by actors/cow-ride.js and game/tricks/cowrace.js.
import { tx } from '../i18n/i18n.js';
import { RIDE_STEPS, RACE_STEPS, rideStepText, raceStepText } from '../game/tricks/rules-cowhelp.js';

const CSS = `
.ch-kc{display:inline-block;min-width:26px;padding:3px 7px;border-radius:7px;background:#fff;border:2px solid #b89a78;border-bottom-width:4px;color:#5a3a22;font:700 13px Nunito,system-ui,sans-serif;text-align:center;line-height:1.1}
.ch-art{position:relative;width:96px;height:76px;flex:none}
.ch-art>*{position:absolute}
.ch-art svg{display:block;overflow:visible}
.ch-art .cowtop{left:6px;top:2px;width:56px;height:60px;transform-origin:50% 66%;animation:chTurn 2.6s ease-in-out infinite}
.ch-art .stick{right:0;bottom:2px;width:36px;height:36px;border-radius:50%;background:#5a3a2222;border:3px solid #5a3a2255}
.ch-art .stick i{display:block;width:16px;height:16px;margin:7px;border-radius:50%;background:#f08a3c;box-shadow:0 2px 0 #b8581c;animation:chStick 2.6s ease-in-out infinite}
.ch-art .wasd{right:0;bottom:4px;display:flex;gap:4px}
.ch-art .wasd .ch-kc:nth-child(1){animation:chKeyL 2.6s ease-in-out infinite}.ch-art .wasd .ch-kc:nth-child(2){animation:chKeyR 2.6s ease-in-out infinite}
@keyframes chTurn{0%,100%{transform:rotate(-26deg)}50%{transform:rotate(26deg)}}
@keyframes chStick{0%,100%{transform:translateX(-9px)}50%{transform:translateX(9px)}}
@keyframes chKeyL{0%,40%{background:#ffd08a;transform:translateY(2px)}50%,100%{background:#fff;transform:none}}
@keyframes chKeyR{0%,50%{background:#fff;transform:none}60%,90%{background:#ffd08a;transform:translateY(2px)}100%{background:#fff;transform:none}}
.ch-art .stam{left:2px;top:6px;width:90px;height:16px;border-radius:9px;background:#fff7e8;border:2px solid #b89a78;overflow:hidden}
.ch-art .stam i{display:block;height:100%;border-radius:8px;background:#7fcf6a;animation:chStam 3.2s ease-in-out infinite}
.ch-art .stam b{position:absolute;left:3px;top:-1px;width:14px;height:14px}
@keyframes chStam{0%{width:100%;background:#7fcf6a}55%{width:30%;background:#f0a040}70%{width:24%;background:#e4584a}100%{width:100%;background:#7fcf6a}}
.ch-art .hold{left:6px;bottom:4px;display:flex;gap:5px;align-items:center;animation:chHold 3.2s ease-in-out infinite}
.ch-art .gbtn{white-space:nowrap;display:inline-block;padding:7px 12px;border-radius:14px;background:#f08a3c;color:#fff;font:700 13px Fredoka,Nunito,sans-serif;box-shadow:0 3px 0 #b8581c}
@keyframes chHold{0%,60%{transform:translateY(3px);filter:brightness(1.1)}75%,100%{transform:none;filter:none}}
.ch-art .speed{right:2px;bottom:6px;width:30px;height:24px}
.ch-art .speed i{position:absolute;height:3px;border-radius:2px;background:#5a3a2255;animation:chSpeed .5s linear infinite}
@keyframes chSpeed{0%{transform:translateX(10px);opacity:0}30%{opacity:1}100%{transform:translateX(-18px);opacity:0}}
.ch-art .bub{left:2px;top:0;padding:4px 10px;border-radius:14px 14px 14px 3px;background:#fff;border:2px solid #4d9fd8;color:#2a6a9a;font:700 15px Fredoka,Nunito,sans-serif;animation:chMoo 2.2s ease-in-out infinite;transform-origin:0 100%}
@keyframes chMoo{0%,100%{transform:scale(.7);opacity:.2}15%,55%{transform:scale(1.08);opacity:1}70%{transform:scale(1)}}
.ch-art .keys{left:2px;bottom:2px;display:flex;gap:5px;align-items:center}
.ch-art .hop{right:0;top:2px;width:44px;height:50px}
.ch-art .hop .kid{position:absolute;left:2px;bottom:0;width:14px;height:20px;animation:chHop 2.2s ease-in-out infinite}
@keyframes chHop{0%,40%{transform:translate(0,0)}60%{transform:translate(14px,-18px)}80%,100%{transform:translate(26px,0)}}
.ch-art .lanes{left:0;top:0;width:96px;height:50px}
.ch-art .lanes .ln{position:absolute;top:2px;bottom:2px;width:2px;background:#5a3a2255}
.ch-art .lanes .cowtop{width:24px;height:26px;left:4px;top:20px;animation:chLane 3s ease-in-out infinite}
@keyframes chLane{0%,100%{transform:translateX(0)}50%{transform:translateX(58px)}}
.ch-art .ringbox{left:12px;top:2px;width:56px;height:56px}
.ch-art .ringbox .out{position:absolute;inset:0;border-radius:50%;border:3px solid #c2541c;animation:chRing 1.4s cubic-bezier(.4,0,.8,1) infinite}
.ch-art .ringbox .core{position:absolute;inset:14px;border-radius:50%;background:#f08a3c;border:3px solid #fff;display:flex;align-items:center;justify-content:center;animation:chCore 1.4s linear infinite}
.ch-art .ringbox .core svg{width:16px;height:16px}
@keyframes chRing{0%{transform:scale(1.9);opacity:.25}85%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes chCore{0%,80%{background:#f08a3c}88%,100%{background:#5fcf68}}
.ch-art .tap{right:0;bottom:2px;animation:chTap 1.4s linear infinite}
@keyframes chTap{0%,78%{transform:none}86%{transform:translateY(3px) scale(.92)}100%{transform:none}}
.ch-art .puff{left:4px;top:2px;width:34px;height:24px;animation:chPuff 2.4s ease-in-out infinite}
@keyframes chPuff{0%,100%{opacity:.15;transform:translateY(4px)}50%{opacity:1;transform:translateY(-2px)}}
.ch-art .mashx{left:4px;bottom:2px;display:flex;gap:3px;align-items:center}
.ch-art .mashx svg{width:15px;height:15px;opacity:.9;animation:chMash .5s steps(2) infinite}
.ch-art .mashx svg:nth-child(2){animation-delay:.15s}.ch-art .mashx svg:nth-child(3){animation-delay:.3s}
@keyframes chMash{0%{transform:translateY(0)}100%{transform:translateY(-3px)}}
.ch-art .grass{right:2px;top:4px;width:34px;height:34px;animation:chGrass 1.6s ease-in-out infinite}
@keyframes chGrass{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
.ch-art .flag{right:6px;bottom:2px;width:30px;height:28px}
.ch-art .balarc{left:8px;top:0;width:80px;height:44px}
.ch-art .balarc .mk{transform-box:view-box;transform-origin:40px 62px;animation:chBal 3s ease-in-out infinite}
.ch-art .balkid{left:38px;top:30px;width:20px;height:28px;transform-origin:50% 100%;animation:chBalKid 3s ease-in-out infinite}
.ch-art .balkeys{left:14px;bottom:0;display:flex;gap:26px}
.ch-art .balkeys .ch-kc:nth-child(1){animation:chBalL 3s ease-in-out infinite}.ch-art .balkeys .ch-kc:nth-child(2){animation:chBalR 3s ease-in-out infinite}
.ch-art .balstick{left:32px;bottom:-4px;width:30px;height:30px;border-radius:50%;background:#5a3a2222;border:3px solid #5a3a2255;box-sizing:border-box}
.ch-art .balstick i{display:block;width:13px;height:13px;margin:5.500px;border-radius:50%;background:#f08a3c;box-shadow:0 2px 0 #b8581c;animation:chBalStick 3s ease-in-out infinite}
@keyframes chBal{0%,100%{transform:rotate(0deg)}22%{transform:rotate(40deg)}45%{transform:rotate(0deg)}70%{transform:rotate(-40deg)}90%{transform:rotate(0deg)}}
@keyframes chBalKid{0%,100%{transform:rotate(0deg)}22%{transform:rotate(26deg)}45%{transform:rotate(0deg)}70%{transform:rotate(-26deg)}90%{transform:rotate(0deg)}}
@keyframes chBalL{0%,20%{background:#fff;transform:none}24%,44%{background:#ffd08a;transform:translateY(2px)}48%,100%{background:#fff;transform:none}}
@keyframes chBalR{0%,68%{background:#fff;transform:none}72%,88%{background:#ffd08a;transform:translateY(2px)}92%,100%{background:#fff;transform:none}}
@keyframes chBalStick{0%,20%{transform:none}24%,44%{transform:translateX(-7px)}48%,68%{transform:none}72%,88%{transform:translateX(7px)}92%,100%{transform:none}}
`;

/** The balance gauge as an SVG arc: red ends, yellow, a green middle `warn` wide (0..1), a marker group .mk that turns about (cx, cy). */
export function gaugeSvg({ w = 160, h = 62, cx = 80, cy = 112, r = 96, span = 56, warn = 0.6, sw = 9 } = {}) {
  const pt = deg => { const a = (deg - 90) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`; };
  const arc = (a, b, color, width = sw) => `<path d="M${pt(a)}A${r} ${r} 0 0 1 ${pt(b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  const g = span * warn, y = span * (warn + (1 - warn) * 0.45);
  return `<svg viewBox="0 0 ${w} ${h}">${arc(-span, span, '#fff', sw + 5)}${arc(-span, span, '#e4584a')}${arc(-y, y, '#f2c542')}${arc(-g, g, '#5fcf68')}`
    + `<g class="mk"><circle cx="${cx}" cy="${cy - r}" r="${(sw * 0.95).toFixed(1)}" fill="#fff" stroke="#5a3a22" stroke-width="2.500"/><circle cx="${cx}" cy="${cy - r}" r="${(sw * 0.4).toFixed(1)}" fill="#c2541c"/></g></svg>`;
}

let cssOn = false;
export function ensureCss() {
  if (cssOn || typeof document === 'undefined') return;
  cssOn = true;
  if (document.getElementById('cowHelpCss')) return;
  const s = document.createElement('style');
  s.id = 'cowHelpCss';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------------------------------------------------ icons
const ICONS = {
  hoof: '<svg viewBox="0 0 32 32"><path fill="#fff" d="M9 5c-3 2-4 9-2 15 1 4 4 6 6 5 2-1 1-8 0-12-1-4-2-7-4-8zM23 5c3 2 4 9 2 15-1 4-4 6-6 5-2-1-1-8 0-12 1-4 2-7 4-8z"/></svg>',
  hoofDark: '<svg viewBox="0 0 32 32"><path fill="#5a3a22" d="M9 5c-3 2-4 9-2 15 1 4 4 6 6 5 2-1 1-8 0-12-1-4-2-7-4-8zM23 5c3 2 4 9 2 15-1 4-4 6-6 5-2-1-1-8 0-12 1-4 2-7 4-8z"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path fill="#f2a51a" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 1 2 2 3 1-2 1-5 1-8z"/><path fill="#ffe08a" d="M12 22a3.5 3.5 0 0 1-3.5-3.5c0-2 2-3 3.5-5 1.500 2 3.500 3 3.500 5A3.500 3.500 0 0 1 12 22z"/></svg>',
  puff: '<svg viewBox="0 0 28 20"><path fill="#fff" stroke="#b89a78" stroke-width="1.500" d="M7 17a5 5 0 0 1-1-9.800A6 6 0 0 1 17.500 5 5 5 0 0 1 22 8.500 4.500 4.500 0 0 1 21 17z"/><circle cx="11" cy="12" r="1.100" fill="#b89a78"/><circle cx="17" cy="12" r="1.100" fill="#b89a78"/><path d="M12 15q2 -1.500 4 0" stroke="#b89a78" stroke-width="1.200" fill="none"/></svg>',
  grass: '<svg viewBox="0 0 34 34"><path fill="#5fb04a" d="M17 3l6 22H11z"/><path fill="#7ccb58" d="M9 8l9 17H7z"/><path fill="#4f9a3c" d="M26 9l2 16h-9z"/><rect x="9" y="22" width="16" height="4" rx="2" fill="#d9553a"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path fill="#f2b53a" stroke="#b8640a" stroke-width="1.200" d="M13 2 5 14h6l-1 8 8-12h-6z"/></svg>',
  flag: '<svg viewBox="0 0 30 28"><rect x="4" y="2" width="2.500" height="24" fill="#8a5a30"/><path d="M6 3h18v12H6z" fill="#fff"/><path d="M6 3h6v6H6zM18 3h6v6h-6zM12 9h6v6h-6z" fill="#2a2a2a"/></svg>',
  cross: '<svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3 3 13" stroke="#e4584a" stroke-width="2.500" stroke-linecap="round"/></svg>',
  moo: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="8" cy="10.500" r="1.400" fill="#4d9fd8"/><circle cx="12" cy="10.500" r="1.400" fill="#4d9fd8"/><circle cx="16" cy="10.500" r="1.400" fill="#4d9fd8"/></svg>',
  hop: '<svg viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M4 19c2-8 8-11 15-9M14 4l6 6-6 5"/></svg>',
  kid: '<svg viewBox="0 0 14 20"><circle cx="7" cy="4" r="3.500" fill="#f1c7a1"/><rect x="2" y="8" width="10" height="9" rx="3" fill="#e0567a"/></svg>',
};
export const icon = name => ICONS[name] || '';

const COW_TOP = `<svg class="cowtop" viewBox="0 0 64 68"><g stroke="#5a3a22" stroke-width="2">
<ellipse cx="32" cy="42" rx="14" ry="21" fill="#fff"/><ellipse cx="27" cy="38" rx="5" ry="6" fill="#3a2a22" stroke="none"/><ellipse cx="38" cy="50" rx="4" ry="5" fill="#3a2a22" stroke="none"/>
<ellipse cx="22" cy="17" rx="4.500" ry="2.500" fill="#fff" transform="rotate(-20 22 17)"/><ellipse cx="42" cy="17" rx="4.500" ry="2.500" fill="#fff" transform="rotate(20 42 17)"/>
<ellipse cx="32" cy="15" rx="8.500" ry="8" fill="#fff"/><ellipse cx="32" cy="10" rx="5.500" ry="4" fill="#f4a6b4"/>
<rect x="25" y="31" width="14" height="12" rx="3" fill="#d9553a"/></g></svg>`;

const kc = t => `<span class="ch-kc">${t}</span>`;
const spaceKey = () => '<span class="ch-kc" style="min-width:52px">Space</span>';

/** The little animation for a step: kind = 'steer' | 'gallop' | 'moo' (free ride), 'rsteer' | 'rbeat' | 'rmash' (race). */
export function art(kind, touch) {
  switch (kind) {
    case 'steer': return `<div class="ch-art">${COW_TOP}${touch ? '<div class="stick"><i></i></div>' : `<div class="wasd">${kc('A')}${kc('D')}</div>`}</div>`;
    case 'gallop': return `<div class="ch-art"><div class="stam">${icon('bolt').replace('<svg', '<svg class="b"')}<i></i></div>${touch ? `<div class="hold"><span class="gbtn">${tx('Gallop')}</span></div>` : `<div class="hold">${kc('E')}<span style="font:700 12px Nunito,sans-serif;color:#7a6a58">/</span>${kc('Shift')}</div>`}<div class="speed"><i style="top:4px;width:14px;animation-delay:0s"></i><i style="top:11px;width:20px;animation-delay:.18s"></i><i style="top:18px;width:12px;animation-delay:.34s"></i></div></div>`;
    case 'moo': return `<div class="ch-art"><div class="bub">${tx('MOO!')}</div><div class="hop">${icon('kid').replace('<svg', '<svg class="kid"')}</div>${touch ? '' : `<div class="keys">${kc('M')}${spaceKey()}</div>`}</div>`;   // (on a phone the real buttons, pulsing, are the keys)
    case 'rsteer': return `<div class="ch-art"><div class="lanes">${[0, 1, 2, 3].map(i => `<span class="ln" style="left:${2 + i * 30}px"></span>`).join('')}${COW_TOP}</div>${touch ? '<div class="stick" style="right:30px;bottom:0;transform:scale(.7)"><i></i></div>' : `<div class="wasd" style="right:auto;left:22px;bottom:0">${kc('A')}${kc('D')}</div>`}</div>`;
    case 'rbeat': return `<div class="ch-art"><div class="ringbox"><span class="out"></span><span class="core">${icon('hoof')}</span></div>${touch ? `<div class="tap"><span class="gbtn" style="padding:5px 9px">${tx('Giddy-up!')}</span></div>` : `<div class="tap">${kc('E')}</div>`}</div>`;
    case 'rmash': return `<div class="ch-art"><div class="puff">${icon('puff')}</div><div class="mashx">${icon('hoofDark')}${icon('hoofDark')}${icon('hoofDark')}${icon('cross')}</div><div class="grass">${icon('grass')}</div><div class="flag">${icon('flag')}</div></div>`;
    case 'rbalance': return `<div class="ch-art"><div class="balarc">${gaugeSvg({ w: 80, h: 44, cx: 40, cy: 62, r: 50, span: 50, warn: 0.5, sw: 6 })}</div>${icon('kid').replace('<svg', '<svg class="balkid"')}${touch ? '<div class="balstick"><i></i></div>' : `<div class="balkeys">${kc('A')}${kc('D')}</div>`}</div>`;
    default: return '<div class="ch-art"></div>';
  }
}

// --------------------------------------------------------------------------------------------- the free-ride coach card
const COACH_CSS = `
#cowCoach{position:fixed;left:50%;top:calc(76px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;width:min(470px,94vw);display:none;align-items:center;gap:10px;box-sizing:border-box;
 padding:10px 12px;border-radius:20px;background:#fffdf6f4;box-shadow:0 8px 24px rgba(40,20,0,.32);border:3px solid #f08a3c;color:#4a3020;font:700 15px Nunito,system-ui,sans-serif;zoom:var(--ui-scale,1);pointer-events:none}
#cowCoach.on{display:flex}
#cowCoach .cc-body{flex:1;min-width:0}
#cowCoach .cc-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
#cowCoach .cc-title{font:600 18px Fredoka,Nunito,sans-serif;color:#c2541c}
#cowCoach .cc-dots{display:flex;gap:4px}#cowCoach .cc-dots i{width:9px;height:9px;border-radius:50%;background:#e8d4b0}
#cowCoach .cc-dots i.on{background:#f08a3c}#cowCoach .cc-dots i.done{background:#5fcf68}
#cowCoach .cc-text{margin-top:2px;line-height:1.25}
#cowCoach .cc-extra{margin-top:3px;font-size:13px;font-weight:600;color:#7a6a58;line-height:1.2}
#cowCoach .ch-art{zoom:1.15}
#cowCoach .cc-btns{display:flex;flex-direction:column;gap:6px;pointer-events:auto}
#cowCoach button{min-height:40px;min-width:64px;padding:6px 12px;border:0;border-radius:12px;font:700 14px Nunito,sans-serif;background:#f4dfb5;color:#5a3a22;cursor:pointer}
#cowCoach button.cc-next{background:#f08a3c;color:#fff}
#cowCoach .cc-ok{position:absolute;right:-8px;top:-10px;width:32px;height:32px;border-radius:50%;background:#5fcf68;color:#fff;font:700 20px/32px Fredoka,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:scale(0);transition:transform .2s}
#cowCoach.ok .cc-ok{transform:scale(1)}
#cowCoach.ok{border-color:#5fcf68}
@media (max-width:700px){#cowCoach{top:calc(166px + env(safe-area-inset-top,0px));width:calc(100vw - 20px);padding:8px 10px}#cowCoach .ch-art{width:84px;height:68px;transform:scale(.92);transform-origin:0 50%}}
`;

/** The free-ride coach card. handlers: { onNext(), onSkip() }. render(step, text, doneFlag). */
export class RideCoachCard {
  constructor(touch, { onNext, onSkip } = {}) {
    this.touch = touch;
    this.step = -1;
    if (typeof document === 'undefined') { this.el = null; return; }
    ensureCss();
    if (!document.getElementById('cowCoachCss')) { const s = document.createElement('style'); s.id = 'cowCoachCss'; s.textContent = COACH_CSS; document.head.appendChild(s); }
    const el = document.createElement('div');
    el.id = 'cowCoach';
    el.innerHTML = '<div class="cc-art"></div><div class="cc-body"><div class="cc-top"><b class="cc-title"></b><span class="cc-dots"><i></i><i></i><i></i></span></div><div class="cc-text"></div><div class="cc-extra"></div></div><div class="cc-btns"><button class="cc-next"></button><button class="cc-skip"></button></div><div class="cc-ok">&#10003;</div>';
    document.body.appendChild(el);
    this.el = el;
    this.q = s => el.querySelector(s);
    this.q('.cc-next').addEventListener('click', e => { e.stopPropagation(); onNext?.(); });
    this.q('.cc-skip').addEventListener('click', e => { e.stopPropagation(); onSkip?.(); });
    this.lang = null;
  }
  get shown() { return !!this.el?.classList.contains('on'); }
  /** Show step `step` (0..2, or 3 for the closing line). */
  render(step, done = false) {
    const el = this.el;
    if (!el) return;
    if (step !== this.step) {
      this.step = step;
      const t = rideStepText(step, this.touch), last = step >= RIDE_STEPS.length;
      this.q('.cc-art').innerHTML = last ? '' : art(RIDE_STEPS[step], this.touch);
      this.q('.cc-art').style.display = last ? 'none' : '';
      this.q('.cc-title').textContent = tx(t.title);
      this.q('.cc-text').textContent = tx(t.text);
      this.q('.cc-extra').textContent = t.extra ? tx(t.extra) : '';
      this.q('.cc-extra').style.display = t.extra ? '' : 'none';
      this.q('.cc-next').textContent = last ? tx('Got it') : tx('Next');
      this.q('.cc-skip').textContent = tx('Skip');
      this.q('.cc-skip').style.display = last ? 'none' : '';
      [...el.querySelectorAll('.cc-dots i')].forEach((d, i) => { d.className = i < step ? 'done' : i === step ? 'on' : ''; });
      el.querySelector('.cc-dots').style.visibility = last ? 'hidden' : '';
    }
    el.classList.toggle('ok', !!done);
  }
  show(on) { this.el?.classList.toggle('on', !!on); if (!on) this.step = -1; }
  dispose() { this.el?.remove(); this.el = null; }
}

// --------------------------------------------------------------------------------------------- the race's intro card
const CARD_CSS = `
#cowCard{position:fixed;inset:0;z-index:31;display:none;align-items:center;justify-content:center;background:rgba(10,14,30,.4);zoom:var(--ui-scale,1)}
#cowCard.on{display:flex}
#cowCard .box{width:min(720px,94vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px 18px 14px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.4);color:#4a3020;text-align:center;font:700 15px Nunito,system-ui,sans-serif}
#cowCard h2{margin:0 0 10px;font:600 24px Fredoka,Nunito,sans-serif;color:#7a3e16}
#cowCard .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#cowCard .st{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 8px;border-radius:16px;background:#fff1cf}
#cowCard .st b{display:block;font:600 18px Fredoka,Nunito,sans-serif;color:#c2541c}
#cowCard .st span{line-height:1.25}
#cowCard .go{margin-top:12px;min-height:52px;min-width:200px;padding:10px 22px;border:0;border-radius:16px;background:#f08a3c;color:#fff;font:700 20px Fredoka,Nunito,sans-serif;box-shadow:0 4px 0 #b8581c;cursor:pointer}
#cowCard .go kbd{font:700 12px Nunito,sans-serif;padding:1px 6px;border-radius:5px;background:#0003;margin-left:8px}
#cowCard .st .ch-art{zoom:1.3}
#cowCard .sub{margin-top:8px;font-size:13px;font-weight:600;color:#7a6a58}
@media (min-width:641px){#cowCard.four .box{width:min(900px,94vw)}#cowCard.four .steps{grid-template-columns:repeat(4,1fr)}}
@media (max-width:640px){#cowCard.four .st{padding:6px 10px}#cowCard.four h2{margin-bottom:6px}#cowCard.four .steps{gap:7px}}
@media (max-width:900px) and (min-width:641px){#cowCard.four .box{padding:10px 12px}#cowCard.four h2{font-size:20px;margin-bottom:6px}#cowCard.four .st{padding:6px 6px;font-size:13px}#cowCard.four .st b{font-size:15px}#cowCard.four .st .ch-art{zoom:1}#cowCard.four .go{margin-top:8px;min-height:44px}#cowCard.four .sub{display:none}}
@media (max-width:640px){#cowCard .steps{grid-template-columns:1fr}#cowCard .st{flex-direction:row;text-align:left;gap:12px;padding:8px 10px}#cowCard .st .tt{flex:1}#cowCard .st b{display:block}#cowCard .box{padding:12px 12px 12px}#cowCard h2{font-size:22px;margin-bottom:8px}
 #cowCard .st .ch-art{zoom:1}}
`;

/** The race's 3-step intro card (one card, all three steps). open(onClose) shows it; close() hides it. */
export class RaceCard {
  constructor(touch) {
    this.touch = touch;
    this.onClose = null;
    if (typeof document === 'undefined') { this.el = null; return; }
    ensureCss();
    if (!document.getElementById('cowCardCss')) { const s = document.createElement('style'); s.id = 'cowCardCss'; s.textContent = CARD_CSS; document.head.appendChild(s); }
    const el = document.createElement('div');
    el.id = 'cowCard';
    el.innerHTML = '<div class="box"><h2></h2><div class="steps"></div><button class="go"></button><div class="sub"></div></div>';
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('.go').addEventListener('click', e => { e.stopPropagation(); this.close(); });
  }
  get shown() { return !!this.el?.classList.contains('on'); }
  /** balance: the race day has a bareback heat, so the card has a fourth step (keep your balance). */
  open(onClose, { start = true, balance = false } = {}) {
    const el = this.el;
    if (!el) return;
    this.onClose = onClose || null;
    const q = s => el.querySelector(s);
    q('h2').textContent = tx('How to win the cow race');
    el.classList.toggle('four', !!balance);
    q('.steps').innerHTML = RACE_STEPS.slice(0, balance ? 4 : 3).map(kind => {
      return `<div class="st">${art(kind, this.touch)}<div class="tt"><b></b><span></span></div></div>`;
    }).join('');
    el.querySelectorAll('.st').forEach((s, i) => { const t = raceStepText(i, this.touch); s.querySelector('.tt b').textContent = tx(t.title); s.querySelector('.tt span').textContent = tx(t.text); });
    q('.go').innerHTML = `${start ? tx("Let's race!") : tx('Back to the race')}${this.touch ? '' : '<kbd>E</kbd>'}`;
    q('.sub').textContent = tx('Tap when the ring closes. Not too fast: tired cows are slow.');
    el.classList.add('on');
  }
  close() {
    if (!this.shown) return;
    this.el.classList.remove('on');
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }
  dispose() { this.el?.remove(); this.el = null; }
}
