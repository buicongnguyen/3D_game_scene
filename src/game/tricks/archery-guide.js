// The archery round's "How to shoot" help (docs/RURAL-TRICKS.md): a short card with three steps, each a little loop drawn in code
// (a canvas, no pictures to load): 1 AIM (the circle slides onto the target), 2 HOLD (the ring fills, the string comes back),
// 3 LET GO (the arrow flies, the wind sock bends: aim a little upwind). The words and the control glyphs follow the device in use
// (keyboard and mouse, touch, gamepad). It opens by itself on the first try, can be skipped, and opens again from the "?" button.
// Also here: the small "cue" under the crosshair, the bouncing marker over the target, and the ghost hand that shows the draw when
// the player has done nothing for a while.
//
// Everything made here is removed by destroy() (and the animation frame stopped), quit or not.
import { N_, tx } from '../../i18n/i18n.js';
import { RING_COLOURS } from '../../world/archery.js';

export const GUIDE_CSS = `
#archHelp{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(30,18,6,.46);font:700 15px Nunito,system-ui,sans-serif;color:#5a3a22;cursor:default;pointer-events:auto;touch-action:manipulation;padding:12px;box-sizing:border-box;-webkit-user-select:none;user-select:none}
#archHelp.hidden{display:none}
#archHelp .card{position:relative;max-width:760px;width:100%;max-height:100%;overflow:auto;background:#fff7e8;border-radius:22px;box-shadow:0 14px 40px rgba(30,15,0,.45);padding:16px 18px 14px;box-sizing:border-box;text-align:center;zoom:var(--ui-scale,1)}
#archHelp h2{margin:0 0 10px;font:600 26px Fredoka,Nunito,sans-serif;color:#c2541c}
#archHelp .steps{display:flex;gap:12px;justify-content:center}
#archHelp .step{flex:1 1 0;min-width:0;background:#ffffffcc;border-radius:16px;padding:8px 8px 10px;box-shadow:inset 0 0 0 2px #f0dfbf}
#archHelp .step canvas{width:100%;aspect-ratio:11/7;display:block;border-radius:12px;background:#cfeaff}
#archHelp .step .n{display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background:#f08a3c;color:#fff;font:600 18px/30px Fredoka,Nunito,sans-serif;margin-right:6px;vertical-align:middle;text-align:center}
#archHelp .step b{font:600 24px Fredoka,Nunito,sans-serif;vertical-align:middle}
#archHelp .step p{margin:4px 0 0;font-size:16px;line-height:1.25}
#archHelp .step p.sub{font-size:13px;color:#8a6a4a;font-weight:600}
#archHelp .btns{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:12px}
#archHelp button{font:700 18px Fredoka,Nunito,sans-serif;border:0;border-radius:16px;padding:10px 26px;cursor:pointer;color:#fff;background:#f08a3c;box-shadow:0 4px 0 #b8581a;-webkit-tap-highlight-color:transparent;min-height:46px}
#archHelp button.skip{background:transparent;color:#8a6a4a;box-shadow:none;padding:10px 14px;font-size:15px;text-decoration:underline}
#archHelp kbd,#archCue kbd{display:inline-block;min-width:22px;padding:1px 6px;border-radius:6px;background:#fff;box-shadow:0 2px 0 #c9b48c,inset 0 0 0 1.5px #c9b48c;font:700 14px Nunito,sans-serif;color:#5a3a22}
@media (max-width:620px){
 #archHelp .card{padding:12px 12px 10px;border-radius:18px}
 #archHelp h2{font-size:22px;margin-bottom:8px}
 #archHelp .steps{flex-direction:column;gap:8px}
 #archHelp .step{display:grid;grid-template-columns:42% 1fr;grid-template-rows:auto auto auto;gap:2px 10px;align-content:center;align-items:center;text-align:left;padding:6px}
 #archHelp .step canvas{grid-row:1/4}
 #archHelp .step p{margin:0;font-size:14px;line-height:1.2}
 #archHelp .step .t{align-self:end}
 #archHelp .step p.sub{display:none;align-self:start}
 #archHelp .step:last-child p.sub{display:block}
 #archHelp .btns{margin-top:10px}
}
#archCue{position:absolute;left:50%;top:50%;transform:translate(-50%,0);margin-top:44px;padding:5px 14px;border-radius:16px;background:rgba(255,247,232,.95);box-shadow:0 4px 14px rgba(40,20,0,.28);font:600 18px Fredoka,Nunito,sans-serif;color:#c2541c;white-space:nowrap;pointer-events:none;zoom:var(--ui-scale,1);opacity:0;transition:opacity .2s}
#archCue.on{opacity:1}
#archCue.go{color:#2f8a2a}
#archCue kbd{margin:0 3px;font-size:15px}
#archMark{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .2s}
#archMark.on{opacity:1}
#archMark i{position:absolute;left:-17px;top:-70px;width:34px;height:34px;font-style:normal;text-align:center;font:700 32px/34px Fredoka,sans-serif;color:#ffe052;text-shadow:0 2px 0 #c2441f,0 0 8px #0008;animation:archBob .8s ease-in-out infinite}
#archMark u{position:absolute;left:-34px;top:-34px;width:68px;height:68px;border-radius:50%;border:4px dashed #ffe052;box-sizing:border-box;animation:archSpin 6s linear infinite;opacity:.9}
@keyframes archBob{0%,100%{transform:translateY(0)}50%{transform:translateY(9px)}}
@keyframes archSpin{to{transform:rotate(360deg)}}
@keyframes archPulse{0%,100%{box-shadow:0 6px 0 #b8581a,0 10px 22px rgba(0,0,0,.3),0 0 0 0 rgba(255,222,120,.9)}60%{box-shadow:0 6px 0 #b8581a,0 10px 22px rgba(0,0,0,.3),0 0 0 18px rgba(255,222,120,0)}}
#archDraw.pulse{animation:archPulse 1s ease-out infinite}
#archGhost{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s}
#archGhost.on{opacity:1}
#archGhost .gring{position:absolute;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;opacity:.75;
 background:conic-gradient(#ffd34a calc(var(--p,0) * 1%),rgba(255,255,255,.3) 0);-webkit-mask:radial-gradient(circle,transparent 21px,#000 22px,#000 27px,transparent 28px);mask:radial-gradient(circle,transparent 21px,#000 22px,#000 27px,transparent 28px)}
#archGhost .gcap{position:absolute;min-width:38px;height:38px;line-height:38px;padding:0 8px;margin:-19px 0 0 -19px;border-radius:10px;background:#fff;color:#5a3a22;text-align:center;font:700 20px/38px Nunito,sans-serif;box-shadow:0 4px 0 #c9b48c,0 6px 14px #0004;opacity:.9;transition:transform .08s,box-shadow .08s}
#archGhost .gcap.down{transform:translateY(4px);box-shadow:0 0 0 #c9b48c,0 2px 8px #0004;background:#ffe9b8}
#archGhost .ghand{position:absolute;width:44px;height:44px;margin:-8px 0 0 -14px;opacity:.9;transition:transform .12s;filter:drop-shadow(0 3px 5px #0006)}
#archGhost .ghand.down{transform:scale(.86)}
#archGhost .garrow{position:absolute;left:0;top:0;width:0;height:0}
#archGhost .garrow svg{position:absolute;left:-34px;top:-9px;width:68px;height:18px;overflow:visible;filter:drop-shadow(0 2px 3px #0007)}
#archGhost .glab{position:absolute;padding:3px 10px;border-radius:12px;background:rgba(255,247,232,.92);font:600 15px Fredoka,Nunito,sans-serif;color:#c2541c;white-space:nowrap;transform:translate(-50%,0);box-shadow:0 3px 10px #0003}
#archHelp .tip{margin:10px 0 0;padding:7px 12px;border-radius:14px;background:#ffe9b8;font-size:16px;line-height:1.25;color:#8a4a12}
@media (max-height:500px){#archHelp .card.tipped .step p.sub{display:none}#archHelp .tip{margin-top:6px;padding:5px 12px;font-size:14px}}
#archNote{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);box-sizing:border-box;width:max-content;max-width:min(600px,calc(100vw - 500px));padding:7px 16px;border-radius:18px;background:rgba(255,247,232,.95);box-shadow:0 4px 14px rgba(40,20,0,.28);font:600 17px/1.25 Fredoka,Nunito,sans-serif;color:#c2541c;text-align:center;pointer-events:none;zoom:var(--ui-scale,1);opacity:0;transition:opacity .3s}
#archNote.on{opacity:1}
@media (max-width:620px){#archNote{bottom:calc(150px + env(safe-area-inset-bottom,0px));max-width:88vw;font-size:16px}}
@media (max-height:500px) and (min-width:621px){#archNote{left:calc(10px + env(safe-area-inset-left,0px));top:calc(152px + env(safe-area-inset-top,0px));bottom:auto;transform:none;max-width:236px;font-size:15px;padding:6px 12px;text-align:left}}
#archHelpBtn{position:absolute;left:calc(10px + env(safe-area-inset-left,0px));top:calc(106px + env(safe-area-inset-top,0px));width:40px;height:40px;border-radius:50%;padding:0;background:rgba(90,58,34,.82);font:700 22px/40px Fredoka,Nunito,sans-serif;text-align:center;zoom:var(--ui-scale,1)}
@media (max-width:520px){#archHelpBtn{top:calc(112px + env(safe-area-inset-top,0px));left:calc(90px + env(safe-area-inset-left,0px))}}
`;

// ------------------------------------------------------------------------------------------------ words
// (full sentences, so each can be translated whole)
const STEP_TITLE = [N_('Aim'), N_('Hold'), N_('Let go')];
const STEP_TEXT = {
  key: [N_('Move the mouse. Put the circle on the target.'), N_('Hold {act} or the mouse button. The string comes back.'), N_('Let go to shoot!')],
  touch: [N_('Drag a finger on the screen. Put the circle on the target.'), N_('Press and hold the orange Draw button.'), N_('Lift your finger to shoot!')],
  pad: [N_('Move the stick. Put the circle on the target.'), N_('Hold the right trigger (RT). The string comes back.'), N_('Let go to shoot!')],
};
const STEP_SUB = [N_('A green circle means: right on the target.'), N_('The ring fills up: a long draw flies fast and straight.'), N_('Does the wind sock bend? Aim a little upwind.')];
/** The balloon end in one line: said under the picture when the end begins, and on the card while it is played. */
export const BALLOON_NOTE = N_('Balloons! Pop the top one and its weight breaks the ones below.');
/** The text of a control for a device, for the cue and the glyphs. */
export function controlLabel(dev) { return dev === 'touch' ? tx('Draw') : dev === 'pad' ? 'RT' : 'E'; }

// ------------------------------------------------------------------------------------------------ drawing the loops
const TAU = Math.PI * 2;
const ease = k => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
const SKY = ['#8fd0f4', '#e4f5ff'], GRASS = ['#7fd05a', '#5db445'];

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function scene(g, w, h, tgt, sock) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, SKY[0]); sky.addColorStop(1, SKY[1]);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = GRASS[1]; g.beginPath(); g.moveTo(0, h * 0.62); g.quadraticCurveTo(w * 0.5, h * 0.5, w, h * 0.6); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.fillStyle = GRASS[0]; g.fillRect(0, h * 0.74, w, h * 0.26);
  // the target on its stand
  const r = tgt.r;
  g.strokeStyle = '#93683a'; g.lineWidth = 3; g.beginPath();
  g.moveTo(tgt.x - r * 0.5, tgt.y + r); g.lineTo(tgt.x - r * 0.9, tgt.y + r * 2.2);
  g.moveTo(tgt.x + r * 0.5, tgt.y + r); g.lineTo(tgt.x + r * 0.9, tgt.y + r * 2.2); g.stroke();
  g.fillStyle = '#e8c98a'; g.beginPath(); g.arc(tgt.x, tgt.y, r * 1.1, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) { g.fillStyle = RING_COLOURS[i * 2]; g.beginPath(); g.arc(tgt.x, tgt.y, r * (1 - i * 0.2), 0, TAU); g.fill(); }
  if (sock) {
    // the wind sock on its pole: bends toward `sock.dir` (-1..1)
    g.strokeStyle = '#f3efe4'; g.lineWidth = 3; g.beginPath(); g.moveTo(sock.x, sock.y + h * 0.3); g.lineTo(sock.x, sock.y); g.stroke();
    const L = h * 0.22, a = (sock.dir > 0 ? 1 : -1) * (0.15 + 0.5 * Math.abs(sock.k));
    for (let i = 0; i < 4; i++) {
      const x0 = sock.x + Math.sin(a) * L * i / 4, y0 = sock.y + (1 - Math.cos(a)) * L * i / 4 + Math.sin(sock.t * 7 + i) * 1.5 * Math.abs(sock.k);
      g.fillStyle = i % 2 ? '#fff6e0' : '#e8553d'; g.beginPath(); g.ellipse(x0 + Math.sin(a) * L / 8, y0 + 5, L / 7, 6 - i, a, 0, TAU); g.fill();
    }
  }
}

function cross(g, x, y, col) {
  g.lineWidth = 3; g.strokeStyle = col; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); g.strokeStyle = '#c2441f'; g.lineWidth = 1.5; g.stroke();
}

/** A glyph of the control for a device: mouse (key), finger (touch) or stick (pad), or the pressed key / Draw button / trigger. */
function glyph(g, dev, kind, x, y, k, label) {
  g.save(); g.translate(x, y);
  if (kind === 'move') {
    // k: the offset the thumb or the hand moves by
    if (dev === 'key') {
      g.translate(k.x * 0.6, k.y * 0.6);
      g.fillStyle = '#fff'; roundRect(g, -11, -17, 22, 34, 11); g.fill(); g.strokeStyle = '#8a6a4a'; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.moveTo(-11, -4); g.lineTo(11, -4); g.moveTo(0, -17); g.lineTo(0, -4); g.stroke();
    } else if (dev === 'touch') {
      g.strokeStyle = '#ffffffaa'; g.lineWidth = 4; g.setLineDash([2, 7]); g.beginPath(); g.moveTo(-k.x * 0.6, -k.y * 0.6); g.lineTo(k.x * 0.6, k.y * 0.6); g.stroke(); g.setLineDash([]);
      g.translate(k.x * 0.6, k.y * 0.6);
      g.fillStyle = '#f6c29c'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); g.strokeStyle = '#8a6a4a'; g.lineWidth = 2; g.stroke();
    } else {
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill(); g.strokeStyle = '#8a6a4a'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#5a3a22'; g.beginPath(); g.arc(k.x * 0.25, k.y * 0.25, 9, 0, TAU); g.fill();
    }
  } else {
    const down = k > 0.5;
    if (dev === 'touch') {
      g.fillStyle = down ? '#ff9d50' : '#f08a3c'; g.beginPath(); g.arc(0, down ? 3 : 0, 20, 0, TAU); g.fill();
      g.fillStyle = '#b8581a'; g.beginPath(); g.arc(0, 6, 20, 0, Math.PI); g.fill();
      g.fillStyle = down ? '#ff9d50' : '#f08a3c'; g.beginPath(); g.arc(0, down ? 3 : 0, 20, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.font = '700 11px Nunito,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, down ? 4 : 1);
    } else {
      const wdt = dev === 'pad' ? 40 : 32, oy = down ? 4 : 0;
      g.fillStyle = '#c9b48c'; roundRect(g, -wdt / 2, -14 + 4, wdt, 30, 8); g.fill();
      g.fillStyle = down ? '#ffe9b8' : '#fff'; roundRect(g, -wdt / 2, -14 + oy, wdt, 30, 8); g.fill();
      g.fillStyle = '#5a3a22'; g.font = '700 17px Nunito,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 1 + oy);
    }
  }
  g.restore();
}

function bow(g, x, y, R, pull, arrowLen) {
  g.strokeStyle = '#d8a43e'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.arc(x - R * 0.35 + pull * 3, y, R, -1.15, 1.15); g.stroke();
  const tx_ = x - R * 0.35 + pull * 3 + Math.cos(1.15) * R, ty = Math.sin(1.15) * R;
  g.strokeStyle = '#fff3d6'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(tx_, y - ty); g.lineTo(x - pull * R * 0.55 - R * 0.1, y); g.lineTo(tx_, y + ty); g.stroke();
  if (arrowLen) {
    const nx = x - pull * R * 0.55 - R * 0.1;
    g.strokeStyle = '#ead7a4'; g.lineWidth = 3; g.beginPath(); g.moveTo(nx, y); g.lineTo(nx + arrowLen, y); g.stroke();
    g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(nx + arrowLen, y, 3.6, 0, TAU); g.fill();
    g.strokeStyle = '#e8553d'; g.lineWidth = 3; g.beginPath(); g.moveTo(nx + 2, y); g.lineTo(nx + 12, y); g.stroke();
  }
  g.lineCap = 'butt';
}

/** Draw one step's loop at time t (seconds) into a canvas context of css size w x h. */
export function drawStep(g, w, h, step, t, dev, label) {
  const T = { x: w * 0.74, y: h * 0.5, r: h * 0.2 };
  if (step === 0) {
    scene(g, w, h, T);
    const k = ease((t % 3.2 - 0.3) / 1.7), x = w * 0.2 + (T.x - w * 0.2) * k, y = h * 0.84 + (T.y - h * 0.84) * k;
    const on = (t % 3.2) > 2.1;
    cross(g, x, y, on ? '#3fcf36' : '#ffffff');
    if (on) { g.strokeStyle = '#3fcf3688'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 11 + ((t * 20) % 12), 0, TAU); g.stroke(); }
    glyph(g, dev, 'move', w * 0.15, h * 0.34, { x: (x - w * 0.2) * 0.25 - 6, y: (y - h * 0.84) * 0.25 }, label);
  } else if (step === 1) {
    scene(g, w, h, T);
    const c = t % 3.2, k = ease((c - 0.4) / 1.4), down = c > 0.3 && c < 2.9;
    cross(g, T.x, T.y, '#3fcf36');
    // the ring fills round the crosshair
    g.strokeStyle = k >= 1 ? '#7fe06a' : '#ffd34a'; g.lineWidth = 5; g.beginPath(); g.arc(T.x, T.y, 19, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
    bow(g, w * 0.3, h * 0.68, h * 0.26, down ? k : 0, w * 0.2);
    glyph(g, dev, 'press', w * 0.12, h * 0.3, down ? 1 : 0, label);
  } else {
    const c = t % 3.2, rel = c > 0.5, f = ease((c - 0.5) / 0.75), wind = 0.6 + 0.4 * Math.sin(t * 2);
    scene(g, w, h, T, { x: w * 0.9, y: h * 0.16, dir: 1, k: wind, t });
    // the dotted arc, then the arrow along it
    const ax = w * 0.34, ay = h * 0.68, ex = T.x - 6, ey = T.y + 1;
    const at = u => [ax + (ex - ax) * u, ay + (ey - ay) * u - Math.sin(u * Math.PI) * h * 0.2];
    g.fillStyle = '#ffffffcc';
    for (let i = 1; i < 10; i++) { const p = at(i / 10); g.beginPath(); g.arc(p[0], p[1], 2, 0, TAU); g.fill(); }
    if (!rel) bow(g, w * 0.3, h * 0.68, h * 0.26, 1, w * 0.2);
    else {
      bow(g, w * 0.3, h * 0.68, h * 0.26, Math.max(0, 1 - (c - 0.5) * 9), 0);
      const u = Math.min(1, f), p = at(u), q = at(Math.min(1, u + 0.02));
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      g.save(); g.translate(p[0], p[1]); g.rotate(ang);
      g.strokeStyle = '#ead7a4'; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.fill();
      g.strokeStyle = '#e8553d'; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, 0); g.lineTo(-10, 0); g.stroke();
      g.restore();
      if (u >= 1 && c < 2.8) { g.fillStyle = '#ffe052'; g.font = '700 15px Fredoka,sans-serif'; g.textAlign = 'center'; g.fillText('10!', T.x, T.y - T.r - 8 - Math.min(8, (c - 1.25) * 16)); }
    }
    glyph(g, dev, 'press', w * 0.12, h * 0.3, rel ? 0 : 1, label);
  }
}

// ------------------------------------------------------------------------------------------------ the guide itself
/**
 * parent: the element the layer lives in (#archUi). dev: 'key' | 'touch' | 'pad'. onClose(): the card was closed (by Got it, Skip or a key).
 * Returns the guide, with open(), close(), isOpen, cue(), mark(), ghost*(), update(dt) and destroy().
 */
export function createGuide(parent, dev0, onClose) {
  const doc = parent.ownerDocument;
  let dev = dev0, label = controlLabel(dev), open = false, raf = 0, t0 = 0, dead = false, canvases = [], tip = null;
  const help = doc.createElement('div');
  help.id = 'archHelp'; help.className = 'hidden';
  help.setAttribute('role', 'dialog');
  const build = d => {
    dev = d; label = controlLabel(d);
    const steps = [0, 1, 2].map(i => `<div class="step"><canvas width="330" height="210" data-i="${i}"></canvas>
      <p class="t"><span class="n">${i + 1}</span><b>${tx(STEP_TITLE[i])}</b></p><p class="txt">${tx(STEP_TEXT[d][i], { act: '<kbd>E</kbd>' })}</p><p class="sub">${tx(STEP_SUB[i])}</p></div>`).join('');
    help.innerHTML = `<div class="card${tip ? ' tipped' : ''}"><h2>${tx('How to shoot')}</h2><div class="steps">${steps}</div>${tip ? `<p class="tip">${tx(tip)}</p>` : ''}
      <div class="btns"><button class="go">${tx('Got it!')}</button><button class="skip">${tx('Skip')}</button></div></div>`;
    canvases = [...help.querySelectorAll('canvas')];
    help.querySelector('.go').addEventListener('click', closeIt);
    help.querySelector('.skip').addEventListener('click', closeIt);
  };
  parent.appendChild(help);
  const fit = () => {
    const dpr = Math.min(2, doc.defaultView.devicePixelRatio || 1);
    for (const c of canvases) { const r = c.getBoundingClientRect(); const w = Math.max(60, Math.round((r.width || 220) * dpr)), h = Math.round(w * 7 / 11); if (c.width !== w) { c.width = w; c.height = h; } }
  };
  const frame = ts => {
    if (!open || dead) return;
    if (!t0) t0 = ts;
    const t = (ts - t0) / 1000;
    fit();
    canvases.forEach((c, i) => {
      const g = c.getContext('2d'), dpr = c.width / (c.getBoundingClientRect().width || 220) || 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStep(g, c.width / dpr, c.height / dpr, i, t, dev, label);
    });
    raf = doc.defaultView.requestAnimationFrame(frame);
  };
  function closeIt() { if (!open) return; G.close(); onClose?.(); }
  build(dev);
  help.addEventListener('pointerdown', e => e.stopPropagation());

  // the cue, the marker over the target and the ghost layer
  const cue = doc.createElement('div'); cue.id = 'archCue';
  const mark = doc.createElement('div'); mark.id = 'archMark'; mark.innerHTML = '<u></u><i>&#9660;</i>';
  const ghost = doc.createElement('div'); ghost.id = 'archGhost';
  ghost.innerHTML = `<div class="gring"></div><div class="gcap"></div><svg class="ghand" viewBox="0 0 44 44"><path d="M16 4c3 0 4 2 4 4v13l2-1c2-1 4 0 4 2l1-1c2-1 4 0 4 2l1-1c2-1 4 1 4 3v8c0 6-4 10-10 10h-4c-5 0-8-3-10-7l-6-10c-1-2 0-4 2-4s3 1 4 3l2 3V8c0-2 1-4 4-4z" fill="#fff" stroke="#8a6a4a" stroke-width="2" stroke-linejoin="round"/></svg>
    <div class="garrow"><svg viewBox="0 0 68 18"><path d="M2 9h56" stroke="#ead7a4" stroke-width="5" stroke-linecap="round"/><path d="M58 3l8 6-8 6z" fill="#ff7a2a"/><path d="M2 9h14" stroke="#e8553d" stroke-width="5" stroke-linecap="round"/></svg></div><div class="glab"></div>`;
  const note = doc.createElement('div'); note.id = 'archNote';
  parent.append(cue, mark, ghost, note);
  const memo = {};
  const gl = { ring: ghost.querySelector('.gring'), cap: ghost.querySelector('.gcap'), hand: ghost.querySelector('.ghand'), arrow: ghost.querySelector('.garrow'), lab: ghost.querySelector('.glab') };
  const setDevice = d => {
    if (d !== dev) build(d);
    gl.cap.textContent = label;
    gl.cap.style.display = d === 'touch' ? 'none' : '';
    gl.hand.style.display = d === 'touch' ? '' : 'none';
    memo.cue = null;
  };
  gl.arrow.style.opacity = 0;
  gl.lab.textContent = tx('Hold, then let go!');
  setDevice(dev);
  const G = {
    el: help, cueEl: cue,
    get isOpen() { return open; },
    /** Follow the device in use (the words and glyphs change if it did). */
    setDevice,
    dismiss: closeIt,
    open(d) {
      if (open || dead) return;
      if (d) setDevice(d);
      open = true; t0 = 0;
      help.classList.remove('hidden');
      doc.body.classList.add('arch-help');
      if (doc.pointerLockElement) doc.exitPointerLock?.();
      raf = doc.defaultView.requestAnimationFrame(frame);
    },
    close() {
      if (!open) return;
      open = false;
      help.classList.add('hidden');
      doc.body.classList.remove('arch-help');
      if (raf) doc.defaultView.cancelAnimationFrame(raf);
      raf = 0;
    },
    /** The small pill under the crosshair: step 'aim' | 'hold' | 'release' or null to hide. */
    setCue(step, x, y) {
      const key = step || '';
      if (memo.cue !== key) {
        memo.cue = key;
        cue.classList.toggle('on', !!step);
        cue.classList.toggle('go', step === 'release');
        if (step === 'aim') cue.textContent = tx('Aim');
        else if (step === 'hold') cue.innerHTML = dev === 'touch' ? tx('Hold Draw') : `${tx('Hold')} <kbd>${label}</kbd>`;
        else if (step === 'release') cue.textContent = tx('Let go!');
      }
      if (step && (memo.cx !== x || memo.cy !== y)) { memo.cx = x; memo.cy = y; cue.style.left = `${x}px`; cue.style.top = `${y}px`; }
    },
    /** One short line at the foot of the picture (a new kind of end begins), or null to take it away. */
    setNote(text) {
      const key = text || '';
      if (memo.note === key) return;
      memo.note = key;
      if (text) note.textContent = tx(text);
      note.classList.toggle('on', !!text);
    },
    /** A line the card carries under its three steps while a special end is played (null: none). */
    setTip(text) { if (tip !== (text || null)) { tip = text || null; build(dev); } },
    /** The bouncing marker over the target the player should aim at (screen px) or hidden. */
    setMark(on, x, y) {
      if (memo.mark !== on) { memo.mark = on; mark.classList.toggle('on', !!on); }
      if (on && (memo.mx !== x || memo.my !== y)) { memo.mx = x; memo.my = y; mark.style.transform = `translate(${x}px,${y}px)`; }
    },
    /**
     * The ghost hand at loop time t (0..GHOST_LOOP): anchors { cx, cy: the crosshair, tx, ty: the target, bx, by: the Draw button }.
     * It presses the control, the ring fills, it lets go and an arrow flies to the target. on=false hides it.
     */
    setGhost(on, t = 0, A = null) {
      if (memo.gh !== on) { memo.gh = on; ghost.classList.toggle('on', !!on); }
      if (!on || !A) return;
      const c = t % GHOST_LOOP, k = Math.min(1, Math.max(0, (c - 0.5) / 1.2)), down = c > 0.45 && c < 1.9;
      gl.ring.style.left = `${A.cx}px`; gl.ring.style.top = `${A.cy}px`;
      gl.ring.style.setProperty('--p', String(Math.round(k * 50) * 2));
      gl.ring.style.opacity = c > 0.45 && c < 2.0 ? 0.8 : 0;
      const px = dev === 'touch' ? A.bx : A.cx + 96, py = dev === 'touch' ? A.by : A.cy + 70;
      gl.cap.style.left = `${px}px`; gl.cap.style.top = `${py}px`; gl.cap.classList.toggle('down', down);
      gl.hand.style.left = `${px}px`; gl.hand.style.top = `${py}px`; gl.hand.classList.toggle('down', down);
      gl.lab.style.left = `${Math.max(90, Math.min(innerWidth - 90, A.cx))}px`; gl.lab.style.top = `${A.cy + 52}px`;
      // the arrow: a curve from the crosshair's lower left to the target
      const u = Math.min(1, Math.max(0, (c - 1.95) / 0.7));
      if (u > 0 && u < 1.0001 && c < 2.9) {
        const sx = A.cx - 40, sy = A.cy + 20, ex = A.tx, ey = A.ty, mx = (sx + ex) / 2, my = Math.min(sy, ey) - 50;
        const bx = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * ex, by = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * ey;
        const dx = 2 * (1 - u) * (mx - sx) + 2 * u * (ex - mx), dy = 2 * (1 - u) * (my - sy) + 2 * u * (ey - my);
        gl.arrow.style.transform = `translate(${bx}px,${by}px) rotate(${Math.atan2(dy, dx)}rad)`;
        gl.arrow.style.opacity = c < 2.7 ? 0.9 : Math.max(0, (2.9 - c) / 0.2);
      } else gl.arrow.style.opacity = 0;
    },
    destroy() {
      dead = true;
      G.close();
      help.remove(); cue.remove(); mark.remove(); ghost.remove(); note.remove();
    },
  };
  return G;
}

/** Seconds one ghost demonstration takes. */
export const GHOST_LOOP = 3.2;
