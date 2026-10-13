// The picture behind the title menu before the valley is loaded (quick start): the valley at golden hour as it was
// filmed for the phones' title (public/video/title-*.jpg and .mp4, see docs/VIDEO.md). The still shows at once (75 kB);
// the short looping clip plays over it where the browser can. No 3D, no valley code: a <video> over the canvas.
// (The file names follow content/video.js clipKey: the tall cut for an upright screen.)
const CSS = `
#titleStill{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#0b1024 center/cover no-repeat;z-index:1;pointer-events:none;opacity:0;transition:opacity .5s}
#titleStill.on{opacity:1}
/* a 960 px clip on a big screen: a touch of softness reads as a far view, not as a small picture stretched */
@media (min-width:1100px) and (min-height:600px){#titleStill{filter:blur(1.2px) saturate(1.06);transform:scale(1.01)}}
body.quick-play #titleStill{display:none}
`;

export class TitleStill {
  constructor() {
    if (!document.getElementById('titleStillCss')) { const s = document.createElement('style'); s.id = 'titleStillCss'; s.textContent = CSS; document.head.appendChild(s); }
    const v = this.el = document.createElement('video');
    v.id = 'titleStill';
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.preload = 'none';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.disablePictureInPicture = true; v.disableRemotePlayback = true;
    v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
    document.getElementById('game').after(v);
    this.cut = null;
    this.onResize = () => this.fit();
    addEventListener('resize', this.onResize);
    this.fit();
    requestAnimationFrame(() => v.classList.add('on'));
  }

  /** The cut for this screen (again when a phone is turned). */
  fit() {
    const cut = innerHeight > innerWidth ? 'tall' : 'wide';
    if (cut === this.cut) return;
    this.cut = cut;
    const v = this.el, base = new URL('video/', document.baseURI).href;
    v.style.backgroundImage = `url("${base}title-${cut}.jpg")`;
    v.poster = `${base}title-${cut}.jpg`;
    let ok = false;
    try { ok = !!v.canPlayType('video/mp4; codecs="avc1.640020"'); } catch { /* no video: the still stays */ }
    if (!ok || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.src = `${base}title-${cut}.mp4`;
    v.play().catch(() => {});                       // autoplay refused: the still stays
  }

  /** While a quick game owns the screen the clip rests (body.quick-play hides it). */
  rest(on) { if (on) this.el.pause(); else if (this.el.src) this.el.play().catch(() => {}); }

  remove() {
    removeEventListener('resize', this.onResize);
    const v = this.el;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
    v.remove();
  }
}
