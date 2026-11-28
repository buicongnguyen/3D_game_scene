// Sing & Play's stage list (docs/SING-AND-PLAY.md): one flat, always visible row of ready-made spots
// (content/stages.js). A tap takes Kotone there (teleport, the camera reset behind her), ready to press Perform.
// Its own row element and its own style block, so the rest of the bar stays as it was. On a phone it scrolls sideways;
// on a phone on its side it takes no width of its own (contain: inline-size), so the bar stays clear of the Do it button.
import { tx, N_ } from '../../i18n/i18n.js';
import { STAGES } from '../../content/stages.js';

const NEAR = 3;   // m: she counts as standing on a stage this close to it (its button shows pressed)

/** Is she at this stage now? */
export const atStage = (p, st) => Math.hypot(p.x - st.x, p.z - st.z) < NEAR;

/** Build the row into the Sing & Play bar (before its hint line). -> { el, refresh() } */
export function mountStages(sp) {
  const row = document.createElement('div');
  row.id = 'spStages'; row.className = 'singplay-stages'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', tx(N_('Stages')));
  const btns = STAGES.map(st => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = `spStage-${st.id}`; b.className = 'singplay-btn singplay-stage'; b.textContent = tx(st.name); b.dataset.stage = st.id;
    b.addEventListener('click', e => { e.stopPropagation(); sp.g.audio?.click?.(); jump(sp, st); });
    row.appendChild(b); return b;
  });
  sp.bar.insertBefore(row, sp.hint || null);
  if (!document.getElementById('singplayStagesStyle')) {
    const st = document.createElement('style'); st.id = 'singplayStagesStyle';
    st.textContent = `.singplay-stages{flex-basis:100%;display:flex;justify-content:center;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
.singplay-stages::-webkit-scrollbar{display:none}.singplay-stage{flex:0 0 auto;scroll-snap-align:start;background:rgba(232,244,236,.92);white-space:nowrap}.singplay-stage[aria-pressed=true]{background:#2f7d5b;color:#fff}
@media (max-width:640px){.singplay-stages{justify-content:flex-start}.singplay-bar:has(.singplay-stages) .singplay-hint{top:204px}}
@media (max-height:480px) and (orientation:landscape){.singplay-stages{justify-content:flex-start;contain:inline-size}.singplay-stages .singplay-btn{min-height:44px;padding:0 12px;font-size:13px}}`;
    document.head.appendChild(st);
  }
  const refresh = () => {
    const p = sp.g.player.pos, busy = !!sp.perf;
    for (const b of btns) { const st = STAGES.find(s => s.id === b.dataset.stage); b.setAttribute('aria-pressed', String(atStage(p, st))); b.setAttribute('aria-disabled', String(busy)); }
  };
  refresh();
  return { el: row, refresh };
}

/** Take her to a stage: out of a room first, then the teleport and the camera behind her; never during a song. */
export async function jump(sp, st) {
  const g = sp.g, p = g.player;
  if (sp.perf) { sp.ui.toast?.(tx(N_('Stop the song first'))); return false; }
  if (g.interiors?.active) { try { await g.interiors.exit(); } catch { /* outdoors anyway */ } }
  p.teleport(st.x, st.z, undefined, st.facing);
  g.follow.first = true; g.follow.yaw = st.facing; g.follow.pitch = .3;
  g.follow.clearCutscene?.(true);
  sp.checkT = 0; sp.keepPlace?.();
  sp.stages?.refresh();
  return true;
}
