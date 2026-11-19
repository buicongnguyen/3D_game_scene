// The daily stamp card in the journal's Neighbours tab, and the little stamp that slams onto a card near the top of the
// screen when a job is done (docs/STAMPS.md). Phone portrait first: no text under 11 px, every tap 44 px or more.
// Styles: ui/style.css (.stampcard, .stamp-row, .stamp-ring, .stamp-ink, .stamp-play, #stampPop).
import { tx } from '../i18n/i18n.js';
import { DECOR } from '../content/stamps.js';
import { askerOf, placeOf, taskText, nextThreshold, CARD } from '../game/stamps-rules.js';

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ring = done => `<span class="stamp-ring${done ? ' on' : ''}" aria-hidden="true">${done ? '<i class="stamp-ink">★</i>' : ''}</span>`;
const row = (cls, done, who, task, sub, extra = '') => `<div class="stamp-row${cls}">${ring(done)}<div class="stamp-text"><b>${esc(who)}</b>` +
  `<span class="stamp-task">${esc(task)}</span>${sub ? `<span class="stamp-sub">${esc(sub)}</span>` : ''}</div>${extra}</div>`;

/** The card and the cottage decorations, as HTML. rt: the Stamps runtime (game/stamps.js). */
export function cardHTML(rt, ui) {
  const s = rt.s;
  if (!s.day || s.tasks.length !== CARD) return '';
  const done = s.tasks.filter(t => t.done).length;
  const rows = s.tasks.map(t => {
    const sub = t.done ? tx('Stamped') : t.carry ? tx('Carrying') : placeOf(t) ? tx('Near {place}', { place: tx(placeOf(t)) }) : '';
    const play = t.k === 'play' && !t.done && rt.playEntry(t.id)
      ? `<button type="button" class="stamp-play" data-play="${esc(t.id)}"${rt.d.minigameMenu?.canOpen() ? '' : ' disabled'}>${esc(tx('Play'))}</button>` : '';
    return row(t.done ? ' done' : '', t.done, tx(askerOf(t, undefined, rt.plays)), taskText(t, undefined, rt.plays, tx), sub, play);
  });
  // the lucky stamp: only where a weather moment can really come (the moments exist and neither they nor the falling
  // petals, leaves and snow are switched off), or one was already seen on this card
  const g = rt.g;
  if ((g.moments && !g.momentsOff && !g.weatherOff) || s.lucky) rows.push(row(' lucky' + (s.lucky ? ' done' : ''), !!s.lucky, tx('Lucky stamp'), tx('See a weather moment'), s.lucky ? tx(s.lucky) : ''));
  const next = nextThreshold(s.total);
  const decor = DECOR.map(D => {
    const known = s.total >= D.at;
    const card = ui.cardHTML(known, D.icon || null, tx(D.name), known ? tx('From {name}', { name: tx(D.from) }) : tx('At {n} stamps', { n: D.at }));
    return D.icon ? card : card.replace('<div>', `<span class="pic stamp-glyph" aria-hidden="true">${D.glyph || '★'}</span><div>`);
  });
  return `<div class="stampcard"><div class="stamp-head"><h3>${esc(tx("Today's stamp card"))}</h3><span class="stamp-count">${esc(tx('{n} of 3 stamps today', { n: done }))}</span></div>` +
    `<p class="stamp-intro">${esc(tx('Three little jobs from the neighbours. Each one earns a stamp, and stamps bring decorations for the cottage.'))}</p>` +
    rows.join('') +
    `<p class="stamp-total">${esc(tx('Stamps: {n}', { n: s.total }))} · ${esc(next === null ? tx('Every decoration is in the cottage!') : tx('Next decoration at {n} stamps', { n: next }))}</p></div>` +
    `<h3 class="stamp-decor-h">${esc(tx('Cottage decorations'))}</h3><div class="cards stamp-decor">${decor.join('')}</div>`;
}

/** Draw the card into the Neighbours tab's #stampCard section and wire its Play button. */
export function renderCard(el, rt, ui) {
  el.innerHTML = cardHTML(rt, ui);
  el.querySelector('.stamp-play')?.addEventListener('click', e => { ui.audio?.click?.(); rt.play(e.currentTarget.dataset.play); });
}

// ------------------------------------------------------------------ the stamp pop
let pop = null, hideT = 0;

/** Where the pop goes: 22 % down, but never over the objective card or the Mini games chip under it. */
function popTop() {
  let top = Math.round(innerHeight * 0.22);
  for (const id of ['objective', 'mgChip']) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden') || el.closest('.hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.right > innerWidth / 2 - 115 && r.left < innerWidth / 2 + 115) top = Math.max(top, Math.round(r.bottom + 10));
  }
  return Math.min(top, Math.round(innerHeight * 0.5) - 42);
}

/**
 * The pop's empty live region, made once before the first stamp can land (the Stamps runtime calls this when it starts):
 * screen readers announce changes only in a live region they already know, so one made and filled at once stays silent.
 */
export function ensurePop() {
  if (typeof document === 'undefined') return null;
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'stampPop';
    pop.setAttribute('role', 'status');
    pop.setAttribute('aria-live', 'polite');
    document.body.appendChild(pop);
  }
  return pop;
}

/** "Stamp! n/3": a mini card whose new stamp slams in. Fixed near the top, never takes a tap, gone after 1.8 s. */
export function showPop(n) {
  if (!ensurePop()) return;
  const rings = [0, 1, 2].map(i => `<span class="sp-ring${i < n - 1 ? ' on' : i === n - 1 ? ' new' : ''}">${i < n ? '★' : ''}</span>`).join('');
  // (only "Stamp! n/3" is read out: the rings are a picture of it)
  pop.innerHTML = `<div class="sp-card"><b>${esc(tx('Stamp! {n}/3', { n }))}</b><div class="sp-rings" aria-hidden="true">${rings}</div></div>`;
  pop.style.top = `${popTop()}px`;
  pop.classList.remove('show');
  void pop.offsetWidth;            // restart the slam
  pop.classList.add('show');
  clearTimeout(hideT);
  hideT = setTimeout(() => pop.classList.remove('show'), 1800);
}
