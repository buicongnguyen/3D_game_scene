// The daily stamp card's save shape only (docs/STAMPS.md), so quest.js can keep the field clean without loading the card's
// code (game/stamps.js, a lazy chunk). Every save carries an empty card (about 80 bytes):
//   { day: '', tasks: [], total: 0, cards: 0, lucky: '', seen: [] }
//   task: { k: 'deliver'|'find'|'play', id, done, carry? (deliver), spot? 0..2 (find), base? >= 0 (play) }
// day: the card's local day key (YYYY-MM-DD, game/stamps-rules.js dayKeyOf); total: stamps banked for good; cards: full
// cards; lucky: the weather moment seen on this card (its English name, '' until one); seen: decorations already revealed.

const KINDS = ['deliver', 'find', 'play'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const freshStamps = () => ({ day: '', tasks: [], total: 0, cards: 0, lucky: '', seen: [] });

const count = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const whole = v => Number.isInteger(v) && v >= 0;

/** One task of the right kind for its slot, or null (the card is then drawn again). */
function cleanTask(t, k) {
  if (!t || typeof t !== 'object' || Array.isArray(t) || t.k !== k || typeof t.id !== 'string' || !t.id || typeof t.done !== 'boolean') return null;
  // (the same key order as game/stamps-rules.js drawCard, so a cleaned card equals the drawn one)
  if (k === 'deliver') return typeof t.carry === 'boolean' ? { k, id: t.id, carry: t.carry, done: t.done } : null;
  if (k === 'find') return whole(t.spot) && t.spot <= 2 ? { k, id: t.id, spot: t.spot, done: t.done } : null;
  return whole(t.base) ? { k, id: t.id, base: t.base, done: t.done } : null;
}

/**
 * A safe card from whatever a save holds. Anything that is not an object gives a fresh card; a card of the wrong shape
 * keeps the banked stamps but loses its day and tasks, which makes the game draw today's card again.
 */
export function cleanStamps(x) {
  const s = freshStamps();
  if (!x || typeof x !== 'object' || Array.isArray(x)) return s;
  s.total = count(x.total);
  s.cards = count(x.cards);
  s.lucky = typeof x.lucky === 'string' ? x.lucky.slice(0, 24) : '';
  s.seen = Array.isArray(x.seen) ? [...new Set(x.seen.filter(v => typeof v === 'string' && v))] : [];
  const tasks = Array.isArray(x.tasks) && x.tasks.length === 3 ? x.tasks.map((t, i) => cleanTask(t, KINDS[i])) : null;
  if (typeof x.day === 'string' && DAY.test(x.day) && tasks && tasks.every(Boolean)) { s.day = x.day; s.tasks = tasks; }
  else s.lucky = '';                                     // (the lucky stamp belongs to a card)
  return s;
}

/** Is the stamp card on? ?stamps=off never loads it; a QA run (?qa) has it only with ?stamps=on, so old suites stay as they were. */
export function stampsWanted(params) {
  const v = params?.get?.('stamps');
  if (v === 'off') return false;
  if (params?.has?.('qa')) return v === 'on';
  return true;
}
