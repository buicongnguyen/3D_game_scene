// © 2026 Bui Cong Nguyen · solluxlabs.com
// The show's door in Explore (docs/EXPLORE-AND-SHOW.md "One Explore"): standing on dry, flat, open ground outdoors with
// nothing else going on (the pause menu's Sing here rule: sing-here.js singHereState), a "Perform" button shows in the
// place where the show's own Perform will be; a tap opens the show layer there and then (singplay.js, fetched the first
// time). Hidden whenever the ground or the moment is not right, and while the show is open (its bar has the button).
import { tx, N_ } from '../../i18n/i18n.js';
import { singHereState } from './sing-here.js';

const MIC = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';

export class ShowDoor {
  constructor(game, director, ui) {
    this.g = game; this.d = director; this.ui = ui; this.t = 0; this.shown = false; this.opening = false;
    const b = this.el = document.createElement('button');
    b.id = 'showDoor'; b.type = 'button'; b.className = 'show-door'; b.hidden = true;
    b.innerHTML = `${MIC}<span></span>`;
    b.addEventListener('click', e => { e.stopPropagation(); this.ui.audio?.click?.(); this.open(); });
    if (!document.getElementById('showDoorStyle')) { const st = document.createElement('style'); st.id = 'showDoorStyle'; st.textContent = STYLE; document.head.appendChild(st); }
    document.body.appendChild(b);
  }

  /** Should the door show now? (Explore, no show open, no dialogue, the Sing here rule.) */
  wanted() {
    const g = this.g, d = this.d;
    if (!d.explore || d.singplay || this.opening || g.paused || this.ui.dialogueOpen || this.ui.overlay || g.params?.get?.('singplay') === 'off') return false;
    return singHereState(g).ok;
  }

  /** Every frame (a game system): checked three times a second. */
  update(dt) {
    if ((this.t -= dt) > 0) return;
    this.t = 0.3;
    const on = this.wanted();
    if (on !== this.shown) { this.shown = on; this.el.hidden = !on; document.body.classList.toggle('show-door-on', on); }
    if (on) { const s = this.el.lastElementChild, t = tx(N_('Perform')); if (s.textContent !== t) { s.textContent = t; this.el.setAttribute('aria-label', t); } }
  }

  async open() {
    if (this.opening || this.d.singplay) return;
    this.opening = true; this.el.hidden = true; this.shown = false;
    try { const m = await import('./singplay.js'); await m.openShow(this.g, this.d, this.ui); }
    catch (e) { console.error('[show] could not open', e); this.ui.toast?.(tx(N_("The show couldn't be opened"))); }
    finally { this.opening = false; }
  }
}

/** The door for an Explore session (game/explore-show.js). */
export function mountShowDoor(game, director, ui) {
  if (director.showDoor) return director.showDoor;
  const door = director.showDoor = new ShowDoor(game, director, ui);
  game.systems.push(door);
  return door;
}

// where the show's own Perform sits (singplay.js BAR_STYLE): PC 16 px over the bottom, touch screens over the Do it /
// Jump buttons, phones on their side in the band left of the touch buttons
const STYLE = `.show-door{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:29;display:inline-flex;align-items:center;justify-content:center;gap:7px;box-sizing:border-box;min-width:150px;min-height:56px;padding:0 24px 0 18px;border:0;border-radius:28px;
 background:linear-gradient(180deg,#ffd66b,#f2a33a);color:#3b1c05;box-shadow:0 3px 12px rgba(0,0,0,.3);font-family:var(--ui,Nunito,system-ui,sans-serif);font-size:18px;font-weight:800;line-height:1;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.show-door[hidden]{display:none}.show-door:focus{outline:none}.show-door:focus-visible{outline:3px solid #ffd36e;outline-offset:2px}
body.touch .show-door{bottom:calc(env(safe-area-inset-bottom,0px) + 124px)}
@media (max-width:640px){.show-door{min-width:118px;min-height:52px;padding:0 18px 0 14px;font-size:16px}}
@media (max-height:480px) and (orientation:landscape){.show-door,body.touch .show-door{bottom:calc(env(safe-area-inset-bottom,0px) + 10px);min-height:50px;min-width:118px;font-size:16px}}
body.show-door-on #prompt{bottom:calc(var(--sp-clear,190px) / var(--ui-scale,1))}`;
