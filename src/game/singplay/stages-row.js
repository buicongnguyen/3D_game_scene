// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's stages (docs/SING-AND-PLAY.md): ready-made spots (content/stages.js). The Stage chip (pickers.js) shows
// the one she stands on, or "Here"; a tap on a stage in its picker takes Kotone there (teleport, the camera reset behind
// her), ready to press Perform. Data + handlers only: atStage, stageAt, jump.
import { tx, N_ } from '../../i18n/i18n.js';
import { STAGES } from '../../content/stages.js';

const NEAR = 3;   // m: she counts as standing on a stage this close to it (its chip names it, its tile shows picked)

/** Is she at this stage now? */
export const atStage = (p, st) => Math.hypot(p.x - st.x, p.z - st.z) < NEAR;
/** The stage she stands on (content/stages.js entry), or null: "Here". */
export const stageAt = p => (p ? STAGES.find(st => atStage(p, st)) || null : null);

/** Take her to a stage: out of a room first, then the teleport and the camera behind her; never during a song. */
export async function jump(sp, st) {
  const g = sp.g, p = g.player;
  if (sp.perf) { sp.ui.toast?.(tx(N_('Stop the song first'))); return false; }
  if (g.interiors?.active) { try { await g.interiors.exit(); } catch { /* outdoors anyway */ } }
  p.teleport(st.x, st.z, undefined, st.facing);
  g.follow.first = true; g.follow.yaw = st.facing; g.follow.pitch = .3;
  g.follow.clearCutscene?.(true);
  sp.checkT = 0; sp.keepPlace?.();
  return true;
}
