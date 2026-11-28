// © 2026 Bui Cong Nguyen · solluxlabs.com
// Explore's calendar and "Go to…" (docs/EXPLORE-AND-SHOW.md "Time travel"). Pure: no game, no DOM (tests/valley-clock.test.mjs).
//
// The valley keeps a calendar in the Explore save (quest state `explore`): the season (the quest's own `season`), the day
// within it (`sd`, 0..SEASON_DAYS-1), the hour (the quest's `hour`), and `days`, every day travelled so far. Explore's
// clock holds still on its own (as it always has); the player moves it with Go to…, only ever FORWARD, to the next time
// the chosen moment comes round:
//   - a time of day: later today if it is still to come, else tomorrow (the last day of a season carries into the next)
//   - a season: its first day, at the chosen hour (or the hour it is now); the season it is already in: the next time it
//     comes round, a year on, unless only the hour moves forward within today
//   - a ready-made moment: a season, an hour and the festival (on or off) together
// Whatever lies between is lived through at once: `days` grows by the days skipped, and every daily thing reads the
// valley's date (the real date + `days`): the stamp card, the voiced visits heard "today", the station sisters' day, the
// Night Star's night. Nothing can be gone back to, so nothing repeats.
import { N_ } from '../i18n/i18n.js';

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const SEASON_DAYS = 7;            // a valley week each season: a valley year is 28 days
export const DAY_MS = 864e5;
/** The four times of day (the same hours as Sing & Play's Time choice: game/singplay/time-row.js TIME_CHOICES). */
export const TIMES = Object.freeze([
  Object.freeze({ id: 'morning', hour: 8, label: N_('Morning') }),
  Object.freeze({ id: 'noon', hour: 12.5, label: N_('Noon') }),
  Object.freeze({ id: 'sunset', hour: 18, label: N_('Sunset') }),
  Object.freeze({ id: 'night', hour: 21, label: N_('Night') }),
]);
export const SEASON_LABELS = Object.freeze({ spring: N_('Spring'), summer: N_('Summer'), autumn: N_('Autumn'), winter: N_('Winter') });
/** Ready-made moments (each with its own small picture in the panel: ui/goto-ui.js). */
export const MOMENTS = Object.freeze([
  Object.freeze({ id: 'blossom', name: N_('Cherry blossom morning'), season: 'spring', hour: 7.5 }),
  Object.freeze({ id: 'festival', name: N_('Summer festival night'), season: 'summer', hour: 20.5, festival: true }),
  Object.freeze({ id: 'leaves', name: N_('Autumn leaves afternoon'), season: 'autumn', hour: 15.5 }),
  Object.freeze({ id: 'snow', name: N_('Snowy evening'), season: 'winter', hour: 18.5 }),
]);
export const moment = id => MOMENTS.find(m => m.id === id) || null;
export const timeOf = id => TIMES.find(t => t.id === id) || null;

const norm = h => ((h % 24) + 24) % 24;
const clampDay = v => (Number.isFinite(v) ? Math.min(SEASON_DAYS - 1, Math.max(0, Math.floor(v))) : 0);

/** The calendar from a quest state: { season, sd, hour, days, festival }. */
export function calendarOf(st) {
  const e = st?.explore || {};
  return {
    season: SEASONS.includes(st?.season) ? st.season : 'spring',
    sd: clampDay(e.sd), hour: Number.isFinite(st?.hour) ? norm(st.hour) : 10,
    days: Number.isFinite(e.days) && e.days >= 0 ? Math.floor(e.days) : 0, festival: !!e.festival,
  };
}

/**
 * Where a jump lands (forward only). cal: calendarOf(); to: { season?, hour?, festival? }.
 * -> { season, sd, hour, days (total), skipped (days lived through), festival, same (nothing changes) }
 */
export function travel(cal, to = {}) {
  const S = SEASONS.indexOf(cal.season), hour = Number.isFinite(to.hour) ? norm(to.hour) : cal.hour;
  const festival = typeof to.festival === 'boolean' ? to.festival : cal.festival;
  let skipped = 0, sd = cal.sd, season = cal.season;
  const later = hour > cal.hour + 1 / 120;          // (half a minute: the same hour is not "later")
  const target = to.season && SEASONS.includes(to.season) ? to.season : null;
  if (target && target !== cal.season) {
    // the first day of that season: the rest of this one, then the whole seasons in between
    const steps = (SEASONS.indexOf(target) - S + 4) % 4;
    skipped = (SEASON_DAYS - cal.sd) + (steps - 1) * SEASON_DAYS;
    sd = 0; season = target;
  } else if (later) {
    skipped = 0;                                     // later today
  } else if (target) {
    // this season again, at an hour already past today: tomorrow while the season lasts, else a year on
    if (cal.sd + 1 < SEASON_DAYS) { skipped = 1; sd = cal.sd + 1; }
    else { skipped = 1 + 3 * SEASON_DAYS; sd = 0; }
  } else if (Number.isFinite(to.hour)) {
    // tomorrow (the calendar carries into the next season after its last day)
    skipped = 1;
    if (cal.sd + 1 < SEASON_DAYS) sd = cal.sd + 1;
    else { sd = 0; season = SEASONS[(S + 1) % 4]; }
  }
  const same = skipped === 0 && !later && season === cal.season && festival === cal.festival;
  return { season, sd, hour, days: cal.days + skipped, skipped, festival, same };
}

/** Write a landing into a quest state (season, hour, explore.days / sd / festival). */
export function applyTravel(st, to) {
  st.season = to.season; st.hour = to.hour;
  st.explore = { ...(st.explore || {}), days: to.days, sd: to.sd, festival: to.festival };
  return st;
}

/** The valley's "now" for the daily things: the real time, `days` later (Explore); the real time in the story. */
export const valleyTime = (days = 0, now = Date.now()) => new Date(now + Math.max(0, days | 0) * DAY_MS);

/** How a jump reads on its tile: { key, vars } for tx() — today, tomorrow, or the season and day it lands on. */
export function landingLabel(cal, to) {
  const r = travel(cal, to);
  if (r.same) return { key: N_('Now'), vars: {} };
  if (r.skipped === 0) return { key: N_('Later today'), vars: {} };
  if (r.skipped === 1 && r.season === cal.season) return { key: N_('Tomorrow'), vars: {} };
  return { key: N_('{season}, day {n}'), vars: { season: SEASON_LABELS[r.season], n: r.sd + 1 } };
}
