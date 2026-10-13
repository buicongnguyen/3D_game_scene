// The sky compass: which way am I looking? Shared by the Stargazing trick (game/tricks/stars.js) and the free viewer
// "Look up at the sky" (game/skygaze.js). Two pieces, both plain DOM over the canvas:
//   the horizon marks  the letters N, E, S, W (and a small tick for NE, SE, SW, NW) standing on the horizon of the sky view,
//                      at their true directions, so they slide as the view turns. N is gold.
//   the rose chip      a small round compass in a corner (its gold needle points north) with the facing direction written
//                      out ("Looking north-east"), for when the view is tilted up and the horizon is out of sight.
// The sky's directions are those of content/constellations.js worldDir(): x east, y up, z south (north is -z).
//
// The top of this file is pure maths (no DOM, no three.js; tests/sky-compass.test.mjs). createSkyCompass() builds the DOM.
// Nothing is written to the page unless the view changed: the marks move when the camera does, the needle turns when the
// heading changed by a degree, the words change when the heading enters another eighth of the circle (with a little
// hysteresis, so they never flicker on a boundary).
import { N_, tx, getLang } from '../i18n/i18n.js';

const RAD = Math.PI / 180;
export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** The four letters on the horizon (translated: vi B, Đ, N, T; ko 북, 동, 남, 서; ja 北, 東, 南, 西). */
export const COMPASS_LETTER = [N_('N'), N_('E'), N_('S'), N_('W')];
/** The eight directions as words, for sentences ("Look to the {dir}"). */
export const COMPASS_NAME = [N_('north'), N_('north-east'), N_('east'), N_('south-east'), N_('south'), N_('south-west'), N_('west'), N_('north-west')];
const FACING = N_('Looking {dir}');

export const wrap360 = a => ((a % 360) + 360) % 360;
/** The signed difference a - b of two azimuths, in -180..180. */
export const azDiff = (a, b) => { const d = wrap360(a - b); return d > 180 ? d - 360 : d; };
/** Azimuth (degrees from north through east) of a horizontal direction x (east), z (south). */
export const azimuthOf = (x, z) => wrap360(Math.atan2(x, -z) / RAD);
/** Which of the eight compass points an azimuth is nearest: 0 N, 1 NE, 2 E … 7 NW. */
export const compassIndex = az => Math.round(wrap360(az) / 45) % 8;
/** The same, but it keeps the point it had (`prev`) until the azimuth is `margin` degrees into the next one. */
export function compassHeld(az, prev, margin = 4) {
  if (prev == null || prev < 0) return compassIndex(az);
  return Math.abs(azDiff(az, prev * 45)) <= 22.5 + margin ? prev : compassIndex(az);
}
/** The direction as a word in the language in use ("north-west"). */
export const compassName = (az, t = tx) => t(COMPASS_NAME[compassIndex(az)]);
/** The rose chip's words for a compass point ("Looking north-west"). */
export const facingText = (index, t = tx) => t(FACING, { dir: t(COMPASS_NAME[index]) });

/** A view from the direction it looks along (x east, y up, z south): { az, alt (degrees), fov (vertical, degrees), aspect }. */
export function viewOf(fx, fy, fz, fov, aspect, out = {}) {
  const l = Math.hypot(fx, fy, fz) || 1;
  out.az = azimuthOf(fx, fz);
  out.alt = Math.asin(Math.max(-1, Math.min(1, fy / l))) / RAD;
  out.fov = fov; out.aspect = aspect;
  return out;
}

/**
 * Where a point of the sky (azimuth and altitude, degrees) lands on the screen of a view that does not roll (a lookAt
 * camera): out.x, out.y in -1..1 (x right, y up) and out.front (false: it is behind the viewer, x and y mean nothing).
 */
export function projectSky(az, alt, view, out = { x: 0, y: 0, front: false }) {
  const A = view.az * RAD, P = view.alt * RAD, a = alt * RAD, z = az * RAD;
  const dx = Math.sin(z) * Math.cos(a), dy = Math.sin(a), dz = -Math.cos(z) * Math.cos(a);
  const sA = Math.sin(A), cA = Math.cos(A), sP = Math.sin(P), cP = Math.cos(P);
  // forward (sA cP, sP, -cA cP), right (cA, 0, sA), up (-sA sP, cP, cA sP)
  const f = dx * sA * cP + dy * sP - dz * cA * cP;
  const tv = Math.tan(view.fov * RAD / 2);
  out.front = f > 0.02;
  if (!out.front) { out.x = out.y = 0; return out; }
  out.x = (dx * cA + dz * sA) / f / (tv * view.aspect);
  out.y = (-dx * sA * sP + dy * cP + dz * cA * sP) / f / tv;
  return out;
}

/** The eight horizon marks of a view: out[i] = { x, y, front, on } for N, NE, E … (on: inside the picture). `alt`: how high they stand. */
export function horizonMarks(view, out = Array.from({ length: 8 }, () => ({ x: 0, y: 0, front: false, on: false })), alt = 0) {
  for (let i = 0; i < 8; i++) {
    const m = projectSky(i * 45, alt, view, out[i]);
    m.on = m.front && Math.abs(m.x) <= 1 && Math.abs(m.y) <= 1;
  }
  return out;
}

// ------------------------------------------------------------------------------------ the DOM
const CSS = `
.skyc{position:fixed;inset:0;z-index:13;pointer-events:none;overflow:hidden}
.skyc.in{position:absolute}
.skyc-m{position:absolute;left:0;top:0;display:none;flex-direction:column;align-items:center;font:600 16px/1 Fredoka,Nunito,system-ui,sans-serif;color:rgba(226,235,255,.9);
 text-shadow:0 0 3px #000,0 0 7px rgba(0,0,0,.9),0 1px 2px #000;transition:opacity .4s}
.skyc-m i{display:block;width:2px;height:7px;margin-top:3px;border-radius:1px;background:currentColor;opacity:.75;box-shadow:0 0 3px #000}
.skyc-m.t{color:rgba(196,208,240,.7)}
.skyc-m.t i{height:5px;margin-top:0}
.skyc-m.n{color:#ffd76a;font-size:20px}
.skyc-m.n i{height:9px;opacity:1}
.skyc.dim .skyc-m{opacity:.45}
.skyc.off .skyc-m{opacity:0}
.skyc-rose{position:fixed;left:calc(16px + env(safe-area-inset-left,0px));top:calc(14px + env(safe-area-inset-top,0px));z-index:15;display:flex;align-items:center;gap:7px;
 padding:4px 14px 4px 5px;border-radius:999px;background:rgba(14,20,48,.74);color:#e9f0ff;font:700 14px/1.2 Nunito,system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.3);
 pointer-events:none;white-space:nowrap;zoom:var(--ui-scale,1)}
.skyc-rose.in{position:absolute;zoom:1}
.skyc-rose svg{flex:none;width:34px;height:34px;display:block}
.skyc-rose .nd{transform-origin:15px 15px}
@media (max-width:560px){.skyc-rose.trick{top:calc(66px + env(safe-area-inset-top,0px))}}
body.touch .skyc-rose.gaze{top:calc(68px + env(safe-area-inset-top,0px))}
/* a phone held upright has no free corner in the viewer: a short form (the rose and one word) sits between "Look down" and the wishes */
@media (max-aspect-ratio:1/1){body.touch .skyc-rose.gaze{top:calc(17px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);padding:4px 11px 4px 5px;gap:5px;font-size:12px}
 body.touch .skyc-rose.gaze span{display:none}
 body.touch .skyc-rose.gaze::after{content:attr(data-dir)}}
@media (max-aspect-ratio:1/1) and (max-width:379px){body.touch .skyc-rose.gaze{padding:4px 5px}body.touch .skyc-rose.gaze::after{display:none}}
`;
const ROSE_SVG = '<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="rgba(255,255,255,.08)" stroke="rgba(233,240,255,.55)" stroke-width="1.4"/>'
  + '<g class="nd"><path d="M15 3.2 18.4 15h-6.8z" fill="#ffd76a"/><path d="M15 26.8 18.4 15h-6.8z" fill="#8f9bc4"/><circle cx="15" cy="15" r="1.7" fill="#14203a"/></g></svg>';

/**
 * Build a compass. o: { host (default document.body), kind ('trick' | 'gaze': where the rose chip sits), inside (true:
 * the host is a zoomed full-screen layer, as #skyGaze; positions are then in its own pixels), horizon, rose (false: leave
 * that piece out) }. Returns { el, rose, update(camera, opts), horizon(mode), state(), remove() }. Call update every frame;
 * call remove() on every way out (it is safe to call twice).
 */
export function createSkyCompass({ host = document.body, kind = 'trick', inside = false, horizon = true, rose = true } = {}) {
  if (!document.getElementById('skyCompassCss')) {
    const s = document.createElement('style');
    s.id = 'skyCompassCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const el = document.createElement('div');
  el.className = `skyc${inside ? ' in' : ''}`;
  const marks = [];
  if (horizon) for (let i = 0; i < 8; i++) {
    const m = document.createElement('div');
    m.className = `skyc-m${i % 2 ? ' t' : i === 0 ? ' n' : ''}`;
    m.innerHTML = i % 2 ? '<i></i>' : '<b></b><i></i>';
    el.appendChild(m);
    marks.push({ el: m, shown: false, x: NaN, y: NaN });
  }
  host.appendChild(el);
  let chip = null, needle = null, words = null;
  if (rose) {
    chip = document.createElement('div');
    chip.className = `skyc-rose ${kind}${inside ? ' in' : ''}`;
    chip.innerHTML = `${ROSE_SVG}<span></span>`;
    needle = chip.querySelector('.nd'); words = chip.lastChild;
    host.appendChild(chip);
  }
  const view = { az: 0, alt: 0, fov: 55, aspect: 1 }, proj = horizonMarks(view);
  const last = { fx: 9, fy: 9, fz: 9, fov: 0, aspect: 0, w: 0, h: 0, key: '' };
  let lang = null, needleAz = 999, point = -1, mode = 'on', removed = false, still = 0;
  const say = i => { point = i; words.textContent = facingText(i); chip.dataset.dir = tx(COMPASS_NAME[i]); };
  const letters = () => { if (horizon) for (let i = 0; i < 4; i++) marks[i * 2].el.firstChild.textContent = tx(COMPASS_LETTER[i]); };

  return {
    el, rose: chip,
    /**
     * Follow the camera (a three.js camera: its matrixWorld, fov and aspect are read). opts: { zoom (of an `inside` host),
     * top, bottom, left, right (pixels kept free at each edge), avoid: [[x0, y0, x1, y1], …] (boxes a mark may not stand
     * in: the touch buttons), alt (degrees above the true horizon the marks stand, so they clear the hills) }.
     */
    update(cam, { zoom = 1, top = 0, bottom = 0, left = 14, right = 14, avoid = null, alt = 0 } = {}) {
      if (removed) return;
      const e = cam.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10];
      const l = getLang();
      if (l !== lang) { lang = l; letters(); point = -1; }
      const w = innerWidth / zoom, h = innerHeight / zoom, key = `${top}|${bottom}|${left}|${right}|${alt}`;
      const moved = Math.abs(fx - last.fx) > 2e-4 || Math.abs(fy - last.fy) > 2e-4 || Math.abs(fz - last.fz) > 2e-4 || cam.fov !== last.fov || cam.aspect !== last.aspect || w !== last.w || h !== last.h || key !== last.key;
      if (!moved) {
        // at rest the words name the nearest point (the hysteresis is only for a view on the move)
        if (chip && ++still === 8 && Math.abs(view.alt) < 86 && point !== compassIndex(view.az)) say(compassIndex(view.az));
        return;
      }
      still = 0;
      last.fx = fx; last.fy = fy; last.fz = fz; last.fov = cam.fov; last.aspect = cam.aspect; last.w = w; last.h = h; last.key = key;
      viewOf(fx, fy, fz, cam.fov, cam.aspect, view);
      if (horizon) {
        horizonMarks(view, proj, alt);
        for (let i = 0; i < 8; i++) {
          const m = marks[i], p = proj[i];
          const x = Math.round((p.x * 0.5 + 0.5) * w), y = Math.round((-p.y * 0.5 + 0.5) * h);
          let show = p.on && x >= left && x <= w - right && y >= top + 22 && y <= h - bottom;
          if (show && avoid) for (const r of avoid) if (x > r[0] && x < r[2] && y > r[1] && y - 20 < r[3]) { show = false; break; }
          if (show !== m.shown) { m.shown = show; m.el.style.display = show ? 'flex' : 'none'; }
          // the foot of the mark stands on the horizon
          if (show && (x !== m.x || y !== m.y)) { m.x = x; m.y = y; m.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; }
        }
      }
      if (chip) {
        // straight up or down there is no heading: the needle and the words keep what they had
        if (Math.abs(view.alt) < 86) {
          if (Math.abs(azDiff(view.az, needleAz)) >= 1) { needleAz = view.az; needle.style.transform = `rotate(${(-view.az).toFixed(1)}deg)`; }
          const now = compassHeld(view.az, point);
          if (now !== point) say(now);
        }
      }
    },
    /** The horizon letters: 'on', 'dim' or 'off' (they fade). */
    horizon(m) { if (m === mode) return; mode = m; el.classList.toggle('dim', m === 'dim'); el.classList.toggle('off', m === 'off'); },
    /** For tests and the QA scripts: what is on the page now. */
    state() {
      return { az: +view.az.toFixed(1), alt: +view.alt.toFixed(1), point: COMPASS_POINTS[point] || null, words: words?.textContent || null, mode,
        marks: marks.map((m, i) => (m.shown ? { p: COMPASS_POINTS[i], x: m.x, y: m.y, text: m.el.firstChild.textContent || '' } : null)).filter(Boolean) };
    },
    remove() { removed = true; el.remove(); chip?.remove(); },
  };
}
