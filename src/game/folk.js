// Townsfolk stories and shops: pure logic over a plain state object (no DOM, no three.js).
// st = { folk: { [id]: { stage, asked, met, chat } }, mon, inv: { item: n }, chapter, done(stepId) -> bool, lamps }
// Functions never mutate st: they return `effects`, applied by applyEffects(st, effects) (the quest does this).
// effects = { mon: delta, items: { key: delta }, folk: { [id]: { ...fields to set } } }

/** Story items that are never bought or sold. */
export const PROTECTED = new Set(['cog', 'plate', 'peach', 'bun', 'key', 'timber', 'bolts', 'kite', 'compass', 'honeycomb', 'starfin', 'lanterns', 'honeyChestnuts', 'acorn']);

const folkOf = (st, id) => (st.folk && st.folk[id]) || { stage: 0, asked: false, met: false, chat: 0 };
const needsOf = stage => stage.needs || stage.need || null;
const lampsOf = st => (typeof st.lamps === 'number' ? st.lamps : st.lamps ? Object.values(st.lamps).filter(Boolean).length : 0);

/** Does a stage's `when` hold now? */
export function whenHolds(when, st) {
  if (!when) return true;
  if (when.chapter) { const c = st.chapter ?? 0; if (c < when.chapter[0] || c > when.chapter[1]) return false; }
  if (when.after && !(st.done && st.done(when.after))) return false;
  if (when.lamps !== undefined && lampsOf(st) < when.lamps) return false;
  return true;
}

/** Does Mika carry everything in `needs`? */
export function hasAll(needs, st) {
  if (!needs) return true;
  return Object.entries(needs).every(([k, n]) => (k === 'mon' ? (st.mon || 0) >= n : ((st.inv || {})[k] || 0) >= n));
}

/** The story stage that plays if Mika talks now: { index, stage } or null (chatter time). */
export function stageFor(person, st) {
  const f = folkOf(st, person.id), story = person.story || [];
  const i = f.stage || 0;
  if (i >= story.length) return null;
  return whenHolds(story[i].when, st) ? { index: i, stage: story[i] } : null;
}

/** Is the person waiting for something from Mika (an asked, unmet request)? */
export function waitingFor(person, st) {
  const s = stageFor(person, st), f = folkOf(st, person.id);
  return s && needsOf(s.stage) && f.asked ? needsOf(s.stage) : null;
}

const addItems = (items, obj, sign) => { for (const [k, n] of Object.entries(obj || {})) if (k !== 'mon') items[k] = (items[k] || 0) + sign * n; };

/**
 * Mika talks to a person. Returns { kind: 'stage' | 'ask' | 'chatter', lines: [[speaker, text, clip?]], effects, stage }.
 * A stage with `needs`: the first talk without the items plays `ask` (remembered as asked); with the items it plays
 * the stage lines, takes the items and gives `give`. Afterwards the stage index advances. `protectedItems`: items the
 * main story still needs; a request for one of them waits (it is only asked) until the story is done with it.
 */
export function talkTo(person, st, protectedItems = new Set()) {
  const id = person.id, f = folkOf(st, id);
  const fx = { mon: 0, items: {}, folk: { [id]: { met: true } } };
  const s = stageFor(person, st);
  if (s) {
    const need = needsOf(s.stage);
    if (need && (!hasAll(need, st) || Object.keys(need).some(k => protectedItems.has(k)))) {
      fx.folk[id].asked = true;
      const ask = s.stage.ask ? [[id, s.stage.ask]] : (s.stage.askLines || [[id, '…']]);
      return { kind: 'ask', lines: ask, effects: fx, stage: s.index };
    }
    if (need) { fx.mon -= need.mon || 0; addItems(fx.items, need, -1); }
    const give = s.stage.give || {};
    fx.mon += give.mon || 0;
    addItems(fx.items, give, 1);
    Object.assign(fx.folk[id], { stage: s.index + 1, asked: false });
    return { kind: 'stage', lines: (s.stage.lines || []).map(l => l.slice()), effects: fx, stage: s.index };
  }
  const chatter = person.chatter || [];
  const n = f.chat || 0;
  fx.folk[id].chat = n + 1;
  return { kind: 'chatter', lines: chatter.length ? [[id, chatter[n % chatter.length]]] : [], effects: fx, stage: null };
}

/** Apply effects to st in place (inventory never goes below zero). Returns st. */
export function applyEffects(st, fx) {
  if (!fx) return st;
  st.mon = Math.max(0, (st.mon || 0) + (fx.mon || 0));
  st.inv = st.inv || {};
  for (const [k, n] of Object.entries(fx.items || {})) st.inv[k] = Math.max(0, (st.inv[k] || 0) + n);
  st.folk = st.folk || {};
  for (const [id, v] of Object.entries(fx.folk || {})) st.folk[id] = { ...folkOf(st, id), ...v };
  return st;
}

/**
 * What a shop offers now. buy: [{ key, name, price, affordable }]; sell: [{ key, name, price, have }] — items Mika
 * holds that the shop buys, minus protected story items and `protectedItems` (e.g. fish while the step needs fish).
 */
export function shopOffer(shop, st, goods, protectedItems = new Set()) {
  const mon = st.mon || 0, inv = st.inv || {};
  const buy = (shop.sells || []).filter(k => goods[k]).map(k => ({ key: k, name: goods[k].name, price: goods[k].price, affordable: mon >= goods[k].price }));
  const sell = Object.entries(shop.buys || {})
    .filter(([k]) => (inv[k] || 0) > 0 && !PROTECTED.has(k) && !protectedItems.has(k))
    .map(([k, price]) => ({ key: k, name: goods[k]?.name ?? k, price, have: inv[k] }));
  return { buy, sell };
}

/** Buy one `key`: { ok, reason?, effects }. */
export function buy(shop, key, st, goods) {
  const g = goods[key];
  if (!g || !(shop.sells || []).includes(key)) return { ok: false, reason: 'not-sold', effects: null };
  if ((st.mon || 0) < g.price) return { ok: false, reason: 'broke', effects: null };
  return { ok: true, effects: { mon: -g.price, items: { [key]: 1 }, folk: {} } };
}

/** Sell one `key`: { ok, reason?, effects }. */
export function sell(shop, key, st, protectedItems = new Set()) {
  const price = (shop.buys || {})[key];
  if (price === undefined) return { ok: false, reason: 'not-bought', effects: null };
  if (PROTECTED.has(key) || protectedItems.has(key)) return { ok: false, reason: 'protected', effects: null };
  if (((st.inv || {})[key] || 0) < 1) return { ok: false, reason: 'none', effects: null };
  return { ok: true, effects: { mon: price, items: { [key]: -1 }, folk: {} } };
}

/**
 * Journal "Neighbours": [{ id, name, role, met, done, total, ask }] for every person with a name; `ask` is the
 * pending request text (asked and not yet brought), `done` the completed stage count.
 */
export function folkJournal(people, st) {
  return people.filter(p => p.name).map(p => {
    const f = folkOf(st, p.id), s = stageFor(p, st);
    const pending = s && needsOf(s.stage) && f.asked ? s.stage.ask || null : null;
    const total = (p.story || []).length;
    return { id: p.id, name: p.name, role: p.role || '', met: !!f.met, done: Math.min(f.stage || 0, total), total, ask: pending, stageText: pending || (s?.stage.journal ?? null) };
  });
}
