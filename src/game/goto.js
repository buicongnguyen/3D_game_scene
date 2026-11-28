// © 2026 Bui Cong Nguyen · solluxlabs.com
// Go to… at runtime (docs/EXPLORE-AND-SHOW.md "Time travel"; the rules: game/valley-clock.js). Explore only. A jump:
// a short fade (or, from the show's Time chip, the 2-s ease of the sky), then the valley lands on the new day and hour:
//   season    the quest's season (fields, paddies, trees, grass, the weather: game.setSeason) and its music
//   hour      the Explore clock (game.time.hour and the quest's hour); Settings' display-only season and time are let go
//             (Go to… is the valley's own time now, not a look)
//   days      game.dayShift: the stamp card, the voiced visits and the station sisters read the valley's date from it
//   a new day the stamp card turns over, the sisters come again, the Night Star may sing again; Town Life re-plans every
//             person from the new hour (game/schedule.js: a big hour step is a timelapse)
//   festival  on or off (game/festival.js)
// and the Explore save is written. Refused while something owns the valley (a song, a round, a ride, a scene).
import { tx, N_ } from '../i18n/i18n.js';
import { calendarOf, travel, applyTravel } from './valley-clock.js';
import { canEnter, photoState } from './photo.js';

export const GOTO_EASE = 2;        // s: the show's Time chip eases the sky this long (game/singplay/time-row.js TIME_EASE)
export const GOTO_FADE = 380;      // ms: the panel's fade out and in again
export const REASONS = Object.freeze({
  song: N_('Stop the song first'), busy: N_("Time can't move right now"), off: N_('Only in Explore'),
});
const norm = h => ((h % 24) + 24) % 24;

export class GoTo {
  constructor(game, director) { this.g = game; this.d = director; this.ease = null; this.busy = false; this.listeners = new Set(); }

  get enabled() { return !!this.d.explore && !this.g.zone && !this.d.tourLock; }
  cal() { return calendarOf(this.d.q?.state); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** May the valley's time move now? -> { ok, reason } */
  state() {
    const d = this.d, g = this.g;
    if (!this.enabled) return { ok: false, reason: 'off' };
    if (d.performing) return { ok: false, reason: 'song' };
    if (this.busy || d.busy > 0 || d.scenes?.active || d.minigame || d.tricks?.round || d.yard?.round || d.cows?.riding || g.player?.mounted || !canEnter(photoState(g))) return { ok: false, reason: 'busy' };
    return { ok: true };
  }

  /** Jump: { season?, hour?, festival? } (a moment, a season, a time, the switch). fade: the panel's; ease: the show's. */
  async go(to, { fade = true, ease = false } = {}) {
    const s = this.state();
    if (!s.ok) { this.d.ui?.toast?.(tx(REASONS[s.reason])); return false; }
    const cal = this.cal(), r = travel(cal, to);
    if (r.same) return true;
    const moves = r.skipped > 0 || r.season !== cal.season || Math.abs(r.hour - cal.hour) > 1 / 120;
    if (!moves) { this.land(cal, r, false); return true; }   // (only the festival switch)
    this.busy = true;
    try {
      if (fade && !ease) await this.d.ui?.fade?.(true, GOTO_FADE);
      this.land(cal, r, ease);
      if (fade && !ease) await this.d.ui?.fade?.(false, GOTO_FADE);
    } finally { this.busy = false; }
    return true;
  }

  /** Write the landing into the valley and the save. */
  land(cal, r, ease) {
    const g = this.g, d = this.d, st = d.q.state;
    applyTravel(st, r);
    g.dayShift = r.days;
    // Go to… is the valley's own time: Settings' display-only season and time let go (ui.js keeps its controls in step)
    g.seasonOverride = null; g.timeOverride = null; g.cycleHour = undefined;
    this.d.ui?.letGoOfLook?.();
    if (r.season !== g.time.season || g.shownSeason !== r.season) { g.setSeason(r.season); d.audio?.setMusic?.(r.season, d.festival?.on ? d.festival.mood || 'calm' : 'calm'); }
    if (ease) this.ease = { from: g.time.hour, span: norm(r.hour - g.time.hour) || (r.skipped ? 24 : 0), t: 0, to: r.hour };
    else { this.ease = null; g.time.hour = r.hour; }
    d.festival?.set(r.festival);
    if (r.skipped > 0) this.newDay(r.skipped);
    d.refreshObjective?.(true);
    d.save?.();
    for (const fn of this.listeners) { try { fn(r); } catch (e) { console.warn('[goto]', e); } }
  }

  /** The days lived through: the daily things turn over (the rest reads the valley's date or the new hour by itself). */
  newDay(n) {
    const d = this.d, g = this.g;
    try { d.stamps?.roll?.(); } catch (e) { console.warn('[goto] stamps', e); }
    try { d.visitors?.newDay?.(n); } catch (e) { console.warn('[goto] visitors', e); }
    if (g.nightStar?.ns) g.nightStar.ns.spent = false;
  }

  /** A song starts mid-ease: straight to the hour it was easing to. */
  settle() { if (!this.ease) return; this.g.time.hour = this.ease.to; this.ease = null; }

  /** Every frame: the show's ease of the sky (smoothstep, forward round the clock). */
  update(dt) {
    const e = this.ease; if (!e) return;
    e.t += dt;
    const k = Math.min(1, e.t / GOTO_EASE), s = k * k * (3 - 2 * k);
    this.g.time.hour = norm(e.from + e.span * s);
    if (k >= 1) { this.g.time.hour = e.to; this.ease = null; }
  }
}

/** Go to… for an Explore session (src/main.js, after the save is loaded): the valley's date read from the save. */
export function startGoTo(game, director) {
  const t = director.goto ??= new GoTo(game, director);
  if (!game.systems.includes(t)) game.systems.push(t);
  game.dayShift = t.cal().days;
  return t;
}
