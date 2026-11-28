// © 2026 Bui Cong Nguyen · solluxlabs.com
// "Sing here" (docs/SING-AND-PLAY.md): the Explore pause menu's way into Sing & Play at Mika's own spot and facing.
// Small and pure apart from singHere(): the pause menu asks singHereState() each time it opens; the mode itself
// (singplay.js) loads only when the button is pressed. Explore only (the story keeps its own flow and save).
import { tx, N_ } from '../../i18n/i18n.js';
import { canPerform, gameEnv } from './flat.js';
import { canEnter, photoState } from '../photo.js';

export const SAVE_KEY = 'starline:singplay:v1';   // Kotone's place in Sing & Play (per device)
export const HERE_REASONS = Object.freeze({
  swim: N_('Not while swimming'), ride: N_('Not while riding'), indoors: N_('Not indoors'), ground: N_('Stand on the ground first'),
  water: N_('Too close to the water'), steep: N_('Too steep here'), room: N_('Not enough room here'),
});

/**
 * Should the pause menu offer Sing here, and may it be pressed? -> { show, ok, reason? }
 * Shown in Explore (not the story, not a play zone, not already in the mode) while nothing else owns the game (the same
 * rule as Photo mode, which also refuses riding a cow or the train); allowed only on dry, flat, open ground outdoors.
 */
export function singHereState(g) {
  const d = g?.director, p = g?.player;
  if (!d?.explore || d.singplay || d.tourLock || g.zone || !p || g.params?.get?.('singplay') === 'off') return { show: false, ok: false };
  if (!canEnter(photoState(g))) return { show: false, ok: false };
  const no = reason => ({ show: true, ok: false, reason });
  if (p.swimming) return no('swim');
  if (p.mounted || d.cows?.riding) return no('ride');
  if (g.interiors?.active) return no('indoors');
  if (p.climb || !p.grounded) return no('ground');
  const r = canPerform(p.pos, gameEnv(g));
  return r.ok ? { show: true, ok: true } : no(r.reason);
}

/** The short reason shown under the button (translated). */
export const hereReason = s => (s?.reason ? tx(HERE_REASONS[s.reason] || HERE_REASONS.room) : '');

/**
 * Open Explore's show layer where she stands (docs/EXPLORE-AND-SHOW.md): the Explore save is written first (as any save
 * would), then the layer opens in place, no reload. The Explore save goes on as ever (nothing is written mid-song).
 */
export async function singHere(g, ui) {
  const s = singHereState(g);
  if (!s.show) return false;
  if (!s.ok) { ui?.toast?.(hereReason(s)); return false; }
  const d = g.director;
  d.save?.();
  g.togglePause?.(false);
  try {
    const m = await import('./singplay.js');
    return !!(await m.openShow(g, d, ui))?.isOpen;
  } catch (e) {
    console.error('[singplay] the show could not open', e);
    return false;
  }
}
