// © 2026 Bui Cong Nguyen · solluxlabs.com
import { tx } from '../i18n/i18n.js';
import { readShots, deleteShot, MAX_SHOTS, SEASON_NAMES, captionPlace } from '../game/photo.js';

// The player's own photo-mode pictures in the journal's Album tab ("Your photos", under the party photos), each with a
// delete button that asks first, in the journal itself (ui.js confirmIn belongs to the title's profile box). The
// pictures keep their own shape: a phone's are tall, so they are shown whole, never cropped to 16:9 like the party photos.

const CSS = `
#albumShots { margin-top: 18px; }
#albumShots .shots { grid-template-columns: repeat(auto-fill, minmax(min(190px, 40%), 1fr)); gap: 14px; }
#albumShots .polaroid.shot { transform: none; display: flex; flex-direction: column; padding-bottom: 6px; }
#albumShots .polaroid.shot:hover { transform: none; }
#albumShots .polaroid.shot img { aspect-ratio: var(--ar, 16 / 9); object-fit: contain; max-height: 280px; background: #f4ecdc; }
#albumShots .shot-foot { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
#albumShots .shot-foot p { flex: 1; min-width: 0; margin: 0 2px; font-size: 13px; text-align: left; }
#albumShots .shot-del { flex: 0 0 44px; width: 44px; height: 44px; border: 0; border-radius: 12px; background: rgba(224, 86, 122, 0.12); color: var(--rose); font: 800 18px var(--ui); cursor: pointer; }
#albumShots .shot-ask { margin: 8px 2px 2px; }
#albumShots .shot-ask .confirm-q { margin: 0 0 10px; font-size: 14px; }
#albumShots .shot-ask .confirm-row { flex-wrap: wrap; gap: 8px; }
#albumShots .shot-ask .confirm-row button { flex: 1 1 64px; min-width: 0; padding: 0 10px; }
#albumShots .shots-empty { color: var(--ink-soft); font-weight: 700; }
#creditsAlbum img.shot { aspect-ratio: auto; object-fit: contain; max-height: 180px; width: auto; max-width: 150px; }
`;

function css() {
  if (document.getElementById('photoAlbumCss')) return;
  const s = document.createElement('style'); s.id = 'photoAlbumCss'; s.textContent = CSS; document.head.appendChild(s);
}

const slotOf = ui => ui.game.director?.slot ?? 1;
const store = () => { try { return localStorage; } catch { return null; } };
const label = s => [s.place && captionPlace(tx(s.place)), s.season && SEASON_NAMES[s.season] && tx(SEASON_NAMES[s.season])].filter(Boolean).join(' · ');

/** Fill `el` (the Album tab's "Your photos" section) and keep it current as photos are deleted. */
export function mountShots(el, ui) {
  if (!el) return;
  css();
  const st = store(), slot = slotOf(ui);
  const list = st ? readShots(st, slot) : [];
  el.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = `${tx('Your photos')} · ${list.length} / ${MAX_SHOTS}`;
  el.append(h);
  if (!list.length) {
    const p = document.createElement('p'); p.className = 'shots-empty';
    p.textContent = tx('No photos of your own yet. Open Photo mode from the menu.');
    el.append(p);
    return;
  }
  const grid = document.createElement('div'); grid.className = 'album shots';
  for (const s of list) {
    const tile = document.createElement('div'); tile.className = 'polaroid shot'; tile.dataset.id = s.id;
    const img = document.createElement('img');
    img.alt = label(s); img.loading = 'lazy'; img.src = s.url;
    if (s.w > 0 && s.h > 0) img.style.setProperty('--ar', `${s.w} / ${s.h}`);
    const foot = document.createElement('div'); foot.className = 'shot-foot';
    const cap = document.createElement('p'); cap.textContent = label(s);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'shot-del'; del.textContent = '✕';
    del.setAttribute('aria-label', tx('Delete photo')); del.title = tx('Delete photo');
    del.addEventListener('click', () => ask(foot, del, () => { ui.audio?.click?.(); if (st) deleteShot(st, slot, s.id); mountShots(el, ui); el.querySelector('.shot-del')?.focus({ preventScroll: true }); }));
    foot.append(cap, del);
    tile.append(img, foot);
    grid.append(tile);
  }
  el.append(grid);
}

/** The inline "Delete this photo?" card in place of the caption row; Back puts the tile as it was. */
function ask(foot, del, yes) {
  const card = document.createElement('div'); card.className = 'shot-ask';
  const q = document.createElement('p'); q.className = 'confirm-q'; q.textContent = tx('Delete this photo?');
  const row = document.createElement('div'); row.className = 'confirm-row';
  const no = document.createElement('button'); no.type = 'button'; no.className = 'confirm-no'; no.textContent = tx('Back');
  const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'confirm-yes'; ok.textContent = tx('Delete');
  row.append(no, ok); card.append(q, row);
  foot.replaceWith(card);
  no.addEventListener('click', () => { card.replaceWith(foot); del.focus({ preventScroll: true }); });
  ok.addEventListener('click', yes);
  no.focus({ preventScroll: true });
  requestAnimationFrame(() => card.scrollIntoView({ block: 'center' }));
}

/** The credits' photo strip: the four newest of the player's own, after the party photos. -> HTML */
export function creditsShots(slot, esc) {
  css();
  const st = store();
  return (st ? readShots(st, slot) : []).slice(0, 4).map(s => `<img class="shot" alt="${esc(label(s))}" src="${esc(s.url)}">`).join('');
}
