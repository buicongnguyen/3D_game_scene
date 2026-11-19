// The daily stamp card's rules (Explore only; docs/STAMPS.md): the day key, drawing a card, banking stamps, the cottage
// decorations they unlock, and the words the objective card and the journal show. Pure: no three.js, no DOM. The runtime is
// game/stamps.js, the save shape game/stamps-save.js, the tables content/stamps.js; tests/stamps.test.mjs checks all of it.
import { TABLES, DECOR, playAsker } from '../content/stamps.js';
import { PEOPLE } from '../content/townsfolk.js';
import { PLACES } from '../world/layout.js';
import { recordOf } from '../content/minigames.js';

export const ROLLOVER = 4;      // a new card comes at 04:00 local time, so a late evening still belongs to its day
export const BONUS = 1;         // the extra stamp for a full card
export const CARD = 3;          // deliver, find, play

const p2 = n => String(n).padStart(2, '0');
/** The local day a moment belongs to, as YYYY-MM-DD (ISO keys compare in calendar order). */
export const dayKeyOf = (date, h = ROLLOVER) => { const d = new Date(date.getTime() - h * 3600e3); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const prevDay = key => { const [y, m, d] = key.split('-').map(Number); return dayKeyOf(new Date(y, m - 1, d - 1, 12), 0); };
/** A new card is due: none yet, or a later day (a clock moved back keeps the card), unless a parcel is still being carried. */
export const shouldRoll = (s, today) => !s.day || (today > s.day && !(s.tasks[0]?.carry && !s.tasks[0].done));

/** FNV-1a, 32 bit. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Whole days from 2000-01-01 to a day key (calendar maths in UTC, so summer time never skips or repeats a day). */
export const dayIndex = key => { const [y, m, d] = key.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 1)) / 864e5); };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A shuffled 0..n-1 for one block of n days (FNV-1a seeded). */
function order(n, block, slot, salt) {
  const r = mulberry32(hash32(`${block}|${slot}|${salt}`)), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/**
 * Which of n entries a card slot shows on a day: deterministic, never yesterday's pick, and every entry once in each run
 * of n days. Days go in blocks of n, each block a shuffle of all n; where a block would start with the entry the last
 * block ended on, its first two swap.
 */
export function pick(day, slot, n, salt = '') {
  if (n <= 1) return 0;
  const k = dayIndex(day);
  if (n === 2) return (((k + (hash32(`${slot}|${salt}`) & 1)) % 2) + 2) % 2;
  const b = Math.floor(k / n), r = k - b * n, a = order(n, b, slot, salt);
  if (r < 2 && a[0] === order(n, b - 1, slot, salt)[n - 1]) { const t = a[0]; a[0] = a[1]; a[1] = t; }
  return a[r];
}

// ------------------------------------------------------------------ games
/** The games a card can ask for: every trick and playground game, and one fishing place (the dock). Sorted by id. */
export function playCandidates(catalogue) {
  const games = catalogue.filter(e => e.kind === 'trick' || e.kind === 'yard');
  const fish = catalogue.find(e => e.id === 'fish:dock') || catalogue.find(e => e.kind === 'fish');
  return [...games, ...(fish ? [fish] : [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** How often a game was played so far (its record's plays; fishing: every fish caught). A task is done above its base. */
export function playProgress(e, st) {
  if (!e || !st) return 0;
  if (e.kind === 'fish') return Object.values(st.fishLog || {}).reduce((a, v) => a + (Number.isFinite(v) ? Math.max(0, v) : 0), 0);
  return recordOf(e, st).plays;
}

// ------------------------------------------------------------------ the card
const byId = (list, id) => list.find(x => x.id === id) || null;

/** Today's card: one delivery, one find (at one of its three spots), one game, with that game's progress as the base. */
export function drawCard(day, tables = TABLES, st = null, plays = []) {
  const D = tables.deliveries[pick(day, 0, tables.deliveries.length, 'deliver')];
  const F = tables.finds[pick(day, 1, tables.finds.length, 'find')];
  const P = plays[pick(day, 2, plays.length, 'play')] || null;
  return [
    { k: 'deliver', id: D.id, carry: false, done: false },
    { k: 'find', id: F.id, spot: hash32(`${day}|1|spot`) % 3, done: false },
    { k: 'play', id: P ? P.id : 'none', base: playProgress(P, st), done: !P },
  ];
}

/** After a content change: a slot whose entry is gone is drawn again (keeping whether it was done). -> true when it changed */
export function validateCard(s, tables = TABLES, st = null, plays = []) {
  if (!s.day || s.tasks.length !== CARD) return false;
  const known = [id => !!byId(tables.deliveries, id), id => !!byId(tables.finds, id), id => !!byId(plays, id)];
  let fresh = null, changed = false;
  s.tasks.forEach((t, i) => {
    if (known[i](t.id) || (i === 2 && !plays.length)) return;
    fresh ??= drawCard(s.day, tables, st, plays);
    s.tasks[i] = { ...fresh[i], done: t.done };
    changed = true;
  });
  return changed;
}

/** Decorations whose threshold lies in (before, after]. */
export const crossed = (before, after, decor = DECOR) => decor.filter(d => d.at > before && d.at <= after).map(d => d.id);
export const decorUnlocked = (total, decor = DECOR) => decor.filter(d => total >= d.at).map(d => d.id);
/** The next threshold above total, or null when every decoration is in. */
export const nextThreshold = (total, decor = DECOR) => decor.reduce((m, d) => (d.at > total && (m === null || d.at < m) ? d.at : m), null);

/** Stamp a task. null when it was already done; else { full, unlocked } (a full card also banks the bonus stamp). */
export function award(s, slot, decor = DECOR) {
  const t = s.tasks?.[slot];
  if (!t || t.done) return null;
  const before = s.total;
  t.done = true;
  if (t.k === 'deliver') t.carry = false;
  s.total += 1;
  const full = s.tasks.length === CARD && s.tasks.every(x => x.done);
  if (full) { s.cards += 1; s.total += BONUS; }
  return { full, unlocked: crossed(before, s.total, decor) };
}

/** The lucky stamp: once per card, for seeing a weather moment. It banks a stamp but is not one of the three. */
export function luck(s, name, decor = DECOR) {
  if (!s.day || s.tasks.length !== CARD || s.lucky) return null;
  const before = s.total;
  s.lucky = String(name || 'lucky').slice(0, 24);
  s.total += 1;
  return { unlocked: crossed(before, s.total, decor) };
}

// ------------------------------------------------------------------ words (tx is passed in: i18n stays out of the rules)
const person = id => PEOPLE.find(p => p.id === id) || null;
export const nameOf = id => person(id)?.name || id;
const placeName = key => PLACES[key]?.name || '';

/** Who asks for a task (English source name). */
export function askerOf(t, tables = TABLES, plays = []) {
  if (t.k === 'deliver') { const D = byId(tables.deliveries, t.id); return D ? nameOf(D.from) : ''; }
  if (t.k === 'find') { const F = byId(tables.finds, t.id); return F ? nameOf(F.asker) : ''; }
  const e = byId(plays, t.id);
  return e ? playAsker(e) : '';
}

/** Where a task is (English source place name): the sender's village, or the find's place. */
export function placeOf(t, tables = TABLES) {
  if (t.k === 'deliver') { const D = byId(tables.deliveries, t.id); return D ? placeName(person(t.carry ? D.to : D.from)?.village) : ''; }
  if (t.k === 'find') { const F = byId(tables.finds, t.id); return F ? placeName(F.spots[t.spot]?.[2]) : ''; }
  return '';
}

/** The task as one line ("Take the Kawabe letters to Mr. Sato"). */
export function taskText(t, tables = TABLES, plays = [], tx = s => s) {
  if (t.k === 'deliver') { const D = byId(tables.deliveries, t.id); return D ? tx('Take {what} to {name}', { what: tx(D.what), name: tx(nameOf(D.to)) }) : ''; }
  if (t.k === 'find') { const F = byId(tables.finds, t.id); return F ? tx('Find {what}', { what: tx(F.name) }) : ''; }
  const e = byId(plays, t.id);
  return e ? tx('Play {game}', { game: tx(e.name) }) : '';
}

/** The objective card's line: the first task not done yet, or the full card. null while there is no card. */
export function objectiveText(s, tables = TABLES, tx = s => s, plays = []) {
  if (!s?.day || s.tasks?.length !== CARD) return null;
  const t = s.tasks.find(x => !x.done);
  if (!t) return tx('Stamp card full. A new one comes tomorrow.');
  return tx('Stamp card {n}/3: {task}', { n: s.tasks.filter(x => x.done).length, task: taskText(t, tables, plays, tx) });
}

/** Where the guide arrow points: { door } (a building id) for a delivery, { x, z } for a find, or null. */
export function targetOf(s, tables = TABLES) {
  if (!s?.day || s.tasks?.length !== CARD) return null;
  const [d, f] = s.tasks;
  if (!d.done) { const D = byId(tables.deliveries, d.id); if (D) return { door: d.carry ? D.toDoor : D.fromDoor }; }
  if (!f.done) { const sp = byId(tables.finds, f.id)?.spots[f.spot]; if (sp) return { x: sp[0], z: sp[1] }; }
  return null;
}
