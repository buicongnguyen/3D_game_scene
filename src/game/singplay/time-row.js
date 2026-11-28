// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's Time choice (docs/SING-AND-PLAY.md "Time of day"): Morning, Noon, Sunset, Night. One tap eases the valley
// to that hour over TIME_EASE seconds (sky, sun, lamps, the night value all follow the shown hour); the clock then runs
// on slowly while she is free and holds still while she performs (a song's look never changes mid-song). The mode owns
// the shown hour through game.timeOverride only: game.time.hour (the story and Explore clock) is never touched, and Sing
// & Play writes no Explore save. The choice is remembered per device (TIME_KEY).
// Data + handlers for any host (today a flat row beside the stages; a picker later): TIME_CHOICES, currentTime(sp),
// pickTime(sp, id), timeIcon(id). mountTime() is the thin row.
import { tx, N_, getLang } from '../../i18n/i18n.js';
import { NIGHT_STAR, nameOf } from '../../content/troupe.js';

export const TIME_KEY = 'starline:singplay:time';
/** The four times of day: id, the hour the valley eases to, the label (English key) and its pictogram. */
export const TIME_CHOICES = Object.freeze([
  Object.freeze({ id: 'morning', hour: 8, label: N_('Morning'), icon: 'sunrise' }),
  Object.freeze({ id: 'noon', hour: 12.5, label: N_('Noon'), icon: 'sun' }),
  Object.freeze({ id: 'sunset', hour: 18, label: N_('Sunset'), icon: 'sunset' }),
  Object.freeze({ id: 'night', hour: 21, label: N_('Night'), icon: 'moon' }),
]);
export const TIME_EASE = 2;           // s: a tap eases the valley to the new hour in this long
export const CLOCK_RATE = 1 / 600;    // game hours a real second while she is free (an hour every 10 minutes); held while she performs

const norm = h => ((h % 24) + 24) % 24;
export const timeChoice = id => TIME_CHOICES.find(c => c.id === id) || null;
/** The band an hour falls in (Night from 19:00: the show's own night, show-cues.js isShowNight, starts at about 18:50). */
export function bandOf(hour) {
  const h = norm(hour);
  return h >= 5.5 && h < 10.5 ? 'morning' : h >= 10.5 && h < 16 ? 'noon' : h >= 16 && h < 19 ? 'sunset' : 'night';
}
/** The shorter way round the clock from `from` to `to` (hours, -12..12). */
export const hourSpan = (from, to) => (((to - from) % 24) + 36) % 24 - 12;
/** The eased hour at k (0..1) of the way: smoothstep, so the sky starts and ends gently. */
export const easeHour = (from, span, k) => { const t = Math.min(1, Math.max(0, k)); return norm(from + span * t * t * (3 - 2 * t)); };
/** The choice stored on this device, or null. */
export const loadTime = (store = globalThis.localStorage) => { try { const v = store?.getItem(TIME_KEY); return timeChoice(v) ? v : null; } catch { return null; } };
const keepTime = id => { try { localStorage.setItem(TIME_KEY, id); } catch { /* per-device convenience */ } };
/** Should the bar say the Night Star sings best at night? (her pick, any time but Night: a hint, never a forced change) */
export const nightHint = (singer, band) => singer === NIGHT_STAR && band !== 'night';

/** 18 px pictograms in the button's own colour (SVG markup). */
const svg = body => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const TIME_ICONS = Object.freeze({
  sunrise: svg('<path d="M5 18a7 7 0 0 1 14 0"/><path d="M2 21h20"/><path d="M12 3v5M9.5 5.5 12 3l2.5 2.5"/><path d="M4.2 11.2l1.4 1.4M19.8 11.2l-1.4 1.4"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>'),
  sunset: svg('<path d="M5 18a7 7 0 0 1 14 0"/><path d="M2 21h20"/><path d="M12 8V3M9.5 5.5 12 8l2.5-2.5"/><path d="M4.2 11.2l1.4 1.4M19.8 11.2l-1.4 1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M17 3.5v3M15.5 5h3" stroke-width="1.6"/>'),
});
export const timeIcon = id => TIME_ICONS[timeChoice(id)?.icon] || '';

/** The mode's clock: the shown hour (game.timeOverride), a tap's ease, the slow run while free and the hold during a song. */
export class SingTime {
  constructor(sp) {
    this.sp = sp; this.g = sp.g;
    this.hour = norm(sp.g.shownHour?.() ?? 17.5);
    this.ease = null; this.band = bandOf(this.hour);
  }

  /** The band shown pressed: where a tap is taking the valley, else the hour's own band. */
  currentTime() { return this.ease?.to || bandOf(this.hour); }

  /** Ease the valley to a time of day (not during a song). -> whether it was taken */
  pickTime(id, { save = true } = {}) {
    const c = timeChoice(id); if (!c || this.sp.perf) return false;
    if (save) keepTime(id);
    const span = hourSpan(this.hour, c.hour);
    this.ease = Math.abs(span) > 1 / 60 ? { from: this.hour, span, t: 0, to: id } : null;
    if (!this.ease) this.hour = c.hour;
    this.apply(); this.changed();
    return true;
  }

  /** A song starts mid-ease: the valley goes straight to the hour it was easing to (the show decides day or night now). */
  settle() { if (!this.ease) return; this.hour = norm(this.ease.from + this.ease.span); this.ease = null; this.apply(); this.changed(); }

  /** Every frame (paused: not called, so the clock stops with the game). */
  update(dt) {
    const e = this.ease;
    if (e) { e.t += dt; this.hour = easeHour(e.from, e.span, e.t / TIME_EASE); if (e.t >= TIME_EASE) { this.hour = norm(e.from + e.span); this.ease = null; } }
    else if (!this.sp.perf) this.hour = norm(this.hour + dt * CLOCK_RATE);
    this.apply();
    if (this.currentTime() !== this.band) this.changed();
  }

  apply() { this.g.timeOverride = this.hour; this.g.cycleHour = undefined; }
  changed() { this.band = this.currentTime(); this.sp.label?.(); }

  /** The bar's one-line hint for the Night Star picked by day ('' otherwise; never during a song). */
  hint() { return !this.sp.perf && nightHint(this.sp.singer, this.currentTime()) ? tx(N_('{name} sings best at night'), { name: nameOf(NIGHT_STAR, getLang()) || 'Stella' }) : ''; }
}

/** The pressed band for a host (null before the mode is up). */
export const currentTime = sp => sp?.time?.currentTime() ?? null;
/** A host's tap on a time of day. -> whether it was taken (refused during a song) */
export const pickTime = (sp, id) => sp?.time?.pickTime(id) ?? false;

/**
 * The flat Time row, sharing a line with the stages (phones: the line scrolls sideways; PC: the four join the Perform row).
 * Hidden with the other setup rows while she performs. -> the SingTime (sp.time), with refresh()
 */
export function mountTime(sp) {
  const t = new SingTime(sp);
  const row = document.createElement('div');
  row.id = 'spTime'; row.className = 'singplay-group sp-time'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', tx(N_('Time of day')));
  const btns = TIME_CHOICES.map(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = `spTime-${c.id}`; b.className = 'singplay-btn singplay-seg sp-time-btn'; b.dataset.time = c.id;
    b.innerHTML = timeIcon(c.id);
    const s = document.createElement('span'); s.textContent = tx(c.label); b.appendChild(s);
    b.addEventListener('click', e => { e.stopPropagation(); sp.g.audio?.click?.(); if (!t.pickTime(c.id)) sp.ui.toast?.(tx(N_('Stop the song first'))); });
    row.appendChild(b); return b;
  });
  const line = document.createElement('div');
  line.className = 'singplay-line sp-time-line';
  line.append(row);
  if (sp.stages?.el) line.append(sp.stages.el);
  sp.bar.insertBefore(line, sp.hint || null);
  if (!document.getElementById('singplayTimeStyle')) {
    const st = document.createElement('style'); st.id = 'singplayTimeStyle';
    st.textContent = `.sp-time-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}.sp-time-btn svg{flex:0 0 auto}
.sp-time-line>.singplay-stages{flex:0 0 auto;overflow:visible}
@media (min-width:641px) and (min-height:481px){.singplay-bar>.sp-time-line{display:contents}.singplay-bar>.singplay-line,.singplay-bar>.singplay-hint,.sp-time-line>.singplay-stages{order:1}.sp-time-line>.sp-time{order:0;flex:0 0 auto;margin-left:8px}.sp-time-line>.singplay-stages{flex:0 1 100%;overflow-x:auto}}
@media (max-width:640px),(max-height:480px) and (orientation:landscape){.sp-time-btn{flex-direction:column;gap:2px;padding:0 8px;min-width:48px;font-size:11px;line-height:1.1}.sp-time-btn svg{width:16px;height:16px}.sp-time-line>.singplay-stages{contain:none}}`;
    document.head.appendChild(st);
  }
  t.el = row;
  t.refresh = () => { const on = t.currentTime(), busy = !!sp.perf; for (const b of btns) { b.setAttribute('aria-pressed', String(b.dataset.time === on)); b.setAttribute('aria-disabled', String(busy)); } };
  t.refresh();
  // the choice remembered on this device: the valley eases to it now (its band already showing: the hour stays as it is)
  const saved = loadTime();
  if (saved && saved !== t.currentTime()) t.pickTime(saved, { save: false });
  return t;
}
