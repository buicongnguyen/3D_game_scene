// © 2026 Bui Cong Nguyen · solluxlabs.com
// The author's mark: "Bui Cong Nguyen · solluxlabs.com" on the loading screen, the title, the pause menu, the credits and
// the journal's back page; a quiet "solluxlabs.com" in the corner during play and burned into photos and recorded videos.
// Off its own sites (a copy hosted elsewhere) the corner and the title say "Original game by Bui Cong Nguyen ·
// solluxlabs.com" instead. Nothing is hidden or obfuscated, and nothing stops the game.
//   homeHost(hostname) -> bool                   (pure: buicongnguyen.github.io, solluxlabs.com, localhost, LAN)
//   stampCanvas(ctx, w, h, text?)                 (a small corner mark on a 2D canvas: photos, video frames)
//   mountBrand(ui)                                (the DOM lines; once, after the UI is made; follow language changes)
//   colophonHTML()                                (the journal's back page line)
//   consoleBanner()
import { tx, N_, onLangChange } from '../i18n/i18n.js';

export const AUTHOR = 'Bui Cong Nguyen';
export const SITE = 'solluxlabs.com';
export const SITE_URL = 'https://solluxlabs.com';
export const YEAR = 2026;
export const MARK = `${AUTHOR} · ${SITE}`;
export const COPYRIGHT = `© ${YEAR} ${AUTHOR}`;

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The game's own homes: its Pages site, the author's site, and local / LAN test servers (and file://). */
export function homeHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'buicongnguyen.github.io' || h === SITE || h.endsWith('.' + SITE)) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h)) return true;
  return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** Is this copy running somewhere else? (?brandcheck=foreign shows that look on a home host, for tests.) */
export function foreignCopy(loc = globalThis.location) {
  try {
    if (new URLSearchParams(loc?.search || '').get('brandcheck') === 'foreign') return true;
    return !homeHost(loc?.hostname);
  } catch { return false; }
}

/** The mark in the bottom-right corner of a picture: small (2.2 % of its short side, 11 px at least), soft white with a dark edge. */
export function stampCanvas(ctx, w, h, text = SITE) {
  if (!ctx || !(w > 0) || !(h > 0)) return;
  const s = Math.min(w, h), px = Math.max(11, Math.round(s * 0.022)), pad = Math.round(Math.max(8, s * 0.022));
  ctx.save();
  ctx.font = `700 ${px}px Nunito, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.max(2, px * 0.25);
  ctx.shadowOffsetY = Math.max(1, px * 0.06);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.fillText(text, w - pad, h - pad);
  ctx.restore();
}

const CSS = `
.brand-line{margin:0;font-family:var(--ui);font-size:12px;line-height:1.3;font-weight:700;color:rgba(255,255,255,.78);text-shadow:0 1px 2px rgba(0,0,0,.6);text-align:center;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;column-gap:4px}
.brand-line a{color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,.45);text-underline-offset:2px;display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:0 6px;pointer-events:auto;user-select:text}
.brand-line a:hover,.brand-line a:focus-visible{color:#ffe9a8}
#title .brand-line{flex:none}
#title .brand-line.foreign{color:#ffe9a8}
@media (max-height:480px) and (orientation:landscape){#title .brand-line{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(2px + var(--safe-b));justify-content:flex-end}}
#loading .brand-line{position:absolute;left:0;right:0;bottom:calc(14px + var(--safe-b));color:rgba(255,255,255,.62)}
#pause .brand-line,#credits .brand-line{color:var(--ink-soft);text-shadow:none;margin-top:6px}
#pause .brand-line a,#credits .brand-line a{text-decoration-color:rgba(28,35,64,.35)}
#pause .brand-line a:hover,#credits .brand-line a:hover{color:var(--gold-deep)}
#credits .brand-author{margin-top:4px}
#credits .brand-author .brand-line{justify-content:flex-start;margin-top:0}
#credits .brand-author small{display:block;font-size:12px;color:var(--ink-soft)}
.brand-colophon{margin:18px 0 0;padding-top:10px;border-top:1px dashed rgba(28,35,64,.25);font-size:12px;color:var(--ink-soft);text-align:center}
#brandMark{position:absolute;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(6px + var(--safe-b));font-family:var(--ui);font-size:11px;font-weight:700;letter-spacing:.02em;color:rgba(255,255,255,.5);text-shadow:0 1px 2px rgba(0,0,0,.45);pointer-events:none;white-space:nowrap;z-index:0}
#brandMark.foreign{color:rgba(255,255,255,.72);max-width:calc(100vw - 150px);white-space:normal}
`;

const link = () => `<a href="${SITE_URL}" target="_blank" rel="noopener">${SITE}</a>`;
/** "Author: Bui Cong Nguyen · solluxlabs.com" (the site a link). */
const authorLine = () => `<span>${esc(tx(N_('Author: {name}'), { name: AUTHOR }))} ·</span>${link()}`;
const originalLine = () => `<span>${esc(tx(N_('Original game by {name}'), { name: AUTHOR }))} ·</span>${link()}`;

/** The journal's back page. */
export function colophonHTML() {
  return `<p class="brand-colophon">${esc(tx(N_("Mika's Journal")))} · ${esc(COPYRIGHT)} · ${esc(SITE)}</p>`;
}

/** The lines on the screens; again after a language change. */
export function mountBrand(ui) {
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  if (!$('brandCss')) { const st = document.createElement('style'); st.id = 'brandCss'; st.textContent = CSS; document.head.appendChild(st); }
  const foreign = foreignCopy();
  const put = (parent, id, cls, after) => {
    if (!parent) return null;
    let el = $(id);
    if (!el) { el = document.createElement(cls === 'mark' ? 'div' : 'p'); el.id = id; if (after) after.after(el); else parent.appendChild(el); }
    return el;
  };
  const paint = () => {
    // loading / boot screen: the plain mark (nothing there takes a tap)
    const load = put($('loading'), 'brandLoading');
    if (load) { load.className = 'brand-line'; load.textContent = MARK; }
    // title footer: the author line and the site's link (a new tab); a copy elsewhere names the original
    const title = put($('title'), 'brandTitle');
    if (title) { title.className = 'brand-line' + (foreign ? ' foreign' : ''); title.innerHTML = foreign ? originalLine() : authorLine(); }
    // pause menu footer
    const pb = $('pause')?.querySelector('.book');
    const pause = put(pb, 'brandPause');
    if (pause) { pause.className = 'brand-line'; pause.innerHTML = authorLine(); }
    // credits: the author first (after the finale's end card), then the existing credits, then the voices and the song
    const cr = $('credits')?.querySelector('.book');
    if (cr) {
      const a = put(cr, 'brandCredits', null, $('endCard'));
      a.className = 'brand-author';
      a.innerHTML = `<b>${esc(tx(N_('Author')))}</b><span class="brand-line">${esc(AUTHOR)} ·${link()}</span>` +
        `<small>${esc(COPYRIGHT)}. ${esc(tx(N_('All rights reserved.')))}</small>`;
      let v = $('brandVoices');
      if (!v) { v = document.createElement('p'); v.id = 'brandVoices'; const album = $('creditsAlbum'); if (album) album.before(v); else cr.appendChild(v); }
      v.innerHTML = `<b>${esc(tx(N_('Voices and songs')))}</b><br>` +
        `<span>${esc(tx(N_('The voices in the language homes are synthetic (made by computer, not recorded people): Kokoro (English), VieNeu-TTS (Vietnamese), Supertonic (Korean).')))}</span><br>` +
        `<span>${esc(tx(N_("Kotone's song “Golden Rails”: original lyrics, music made with ACE-Step 1.5.")))}</span><br>` +
        `<span>${esc(tx(N_('Story, code and the Blender-made models: {who}.'), { who: COPYRIGHT }))}</span>`;
    }
    // in play: the quiet corner mark (the HUD hides it with itself; photo mode and recordings carry their own)
    const mark = put($('hud'), 'brandMark', 'mark');
    if (mark) {
      mark.setAttribute('aria-hidden', 'true');
      mark.className = foreign ? 'foreign' : '';
      mark.textContent = foreign ? `${tx(N_('Original game by {name}'), { name: AUTHOR })} · ${SITE}` : SITE;
    }
  };
  paint();
  onLangChange(paint);
  ui && (ui.brand = { foreign, paint });
}

let bannered = false;
export function consoleBanner() {
  if (bannered || typeof console === 'undefined') return;
  bannered = true;
  try {
    console.info(`%cStarline%c  ${COPYRIGHT} · ${SITE}  —  ${SITE_URL}\nOriginal game, story, code and art by ${AUTHOR}. All rights reserved.`,
      'font:700 14px sans-serif;color:#f2b53a', 'font:600 12px sans-serif;color:inherit');
  } catch { /* ignore */ }
}
