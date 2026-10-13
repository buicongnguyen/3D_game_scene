// One discoverable way out of every playable mini-game, through its own cleanup.
import { tx } from '../i18n/i18n.js';

const cardOpen = card => !!card && !card.classList.contains('hidden');
export function stoppableGame(d) {
  if (d.game.paused || d.ui.overlay || d.ui.dialogueOpen || d.busy || d.scenes?.active || d.yard?.guide?.isOpen) return null;
  if (d.workshop?.active) {
    return d.workshop.ctx && !d.workshop.ctx.quit && !d.workshop.s?.done
      ? { kind: 'workshop', token: d.workshop.ctx } : null;
  }
  if (d.tricks?.round?.ctx && !d.tricks.round.ctx.quit && !cardOpen(d.tricks.el?.card))
    return { kind: 'trick', token: d.tricks.round.ctx };
  if (d.yard?.round && !d.yard.round.cancelled && !cardOpen(d.yard.el?.card))
    return { kind: 'yard', token: d.yard.round };
  if (d.minigame?.kind === 'fish' && !d.minigame.m.done && d.minigame.m.phase !== 'leaving')
    return { kind: 'fish', token: d.minigame };
  if (d.minigame?.kind === 'cook') return { kind: 'cook', token: d.minigame };
  if (d.sky?.active && !d.sky.leaving) return { kind: 'sky', token: d.sky.active };
  return null;
}

export function stopGame(d, expected = stoppableGame(d)) {
  const current = stoppableGame(d);
  if (!current || !expected || current.token !== expected.token) return false;
  d.game.input.releaseAll?.();
  if (current.kind === 'workshop') d.workshop.quit();
  else if (current.kind === 'trick') d.tricks.quitRound();
  else if (current.kind === 'yard') d.yard.quit();
  else if (current.kind === 'fish') { if (!d.minigame.m.quit()) d.endMinigame(); }
  else if (current.kind === 'cook') d.endMinigame();
  else if (current.kind === 'sky') d.sky.stop(false); // descend normally before releasing the camera
  return true;
}

const CSS = `
#minigameStop{position:fixed;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:34;
 display:flex;align-items:center;gap:8px;min-height:48px;min-width:48px;padding:10px 16px;border:2px solid #a45b24;border-radius:16px;
 background:#fff4dc;color:#603619;box-shadow:0 4px 14px #3216;font:800 16px Nunito,system-ui,sans-serif;cursor:pointer;touch-action:manipulation;zoom:var(--ui-scale,1)}
#minigameStop.hidden{display:none}#minigameStop:focus-visible{outline:3px solid #f28b35;outline-offset:3px}#minigameStop:hover{background:#fff}
#minigameStop .stop-icon{width:12px;height:12px;background:currentColor;border-radius:2px}
body.touch #minigameStop{left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(196px + env(safe-area-inset-bottom,0px));font-size:15px}
/* an upright phone: above the teacher's hint bubble (which sits 150 px up), not on top of its first words */
@media (orientation:portrait){body.touch.trick-round:not(.yard-round) #minigameStop{bottom:calc(232px + env(safe-area-inset-bottom,0px))}}
body #minigameStop[data-kind="workshop"]{top:calc(112px + env(safe-area-inset-top,0px));bottom:auto}
body #minigameStop[data-kind="sky"]{top:calc(16px + env(safe-area-inset-top,0px));bottom:auto}
body.minigame-stoppable #yardStop,body.minigame-stoppable #archLeave,body.minigame-stoppable #fishLeave,
body.minigame-stoppable #wsLeave,body.minigame-stoppable #swimLesson .leave,body.minigame-stoppable #skyGaze .down{display:none}
`;

export class MinigameStop {
  constructor(director) {
    this.d = director;
    if (typeof document === 'undefined') return;
    if (!document.getElementById('minigameStopCss')) {
      const style = document.createElement('style'); style.id = 'minigameStopCss'; style.textContent = CSS; document.head.appendChild(style);
    }
    const button = document.createElement('button');
    button.id = 'minigameStop'; button.type = 'button'; button.className = 'hidden';
    const icon = document.createElement('span'); icon.className = 'stop-icon'; icon.setAttribute('aria-hidden', 'true');
    this.label = document.createElement('span'); button.append(icon, this.label);
    button.addEventListener('pointerdown', e => e.stopPropagation());
    button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (stopGame(this.d, this.target)) this.update(); });
    // Input maps Space to Jump even on buttons. Consume activation before it reaches gameplay.
    for (const type of ['keydown', 'keyup']) button.addEventListener(type, e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      if (type === 'keydown' && !e.repeat) button.click();
    });
    document.body.appendChild(button); this.button = button; this.update();
  }
  update() {
    this.target = stoppableGame(this.d);
    if (!this.button) return;
    // from the Mini games list the way out leads back to the list: say so
    const menu = this.d.minigameMenu;
    const text = menu?.running && menu.session && !menu.session.story ? tx('Back to games') : tx('Stop playing');
    if (this.text !== text) { this.text = text; this.label.textContent = text; this.button.setAttribute('aria-label', text); }
    const kind = this.target?.kind || '';
    if (this.button.dataset.kind !== kind) this.button.dataset.kind = kind;
    this.button.classList.toggle('hidden', !this.target);
    document.body.classList.toggle('minigame-stoppable', !!this.target);
  }
}
