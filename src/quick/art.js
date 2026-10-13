// What the quick-start runtime shows in place of the valley (./runtime.js). No files to fetch: two painted still scenes
// for the card games (inline SVG: a summer meadow by the river for "From egg to wings", the autumn fields for "From
// seed to harvest"), the ground of the playground for marbles and ô ăn quan (one canvas texture: swept earth with
// grass round it, the same earth as the mats in game/yard/views.js) and the faces of the three Kawabe kids for the
// scoreboard chip (drawn here: in the valley the chip is a snapshot of the kid's model, which is not loaded).
import * as THREE from 'three';

export const CSS = `
#quickScene{position:fixed;inset:0;z-index:2;overflow:hidden;pointer-events:none;background:#bfe6f7}
#quickScene.hidden{display:none}
#quickScene svg{position:absolute;inset:0;width:100%;height:100%;display:block}
#quickScene .drift{animation:quickDrift 90s linear infinite alternate}
#quickScene .drift.b{animation-duration:130s;animation-direction:alternate-reverse}
@keyframes quickDrift{from{transform:translateX(-40px)}to{transform:translateX(70px)}}
@media (prefers-reduced-motion:reduce){#quickScene .drift{animation:none}}
/* a quick game owns the screen: of the game HUD only the toasts are wanted (the rest belongs to the valley) */
body.quick-play #hud > :not(#toasts){display:none!important}
/* a phone on its side: there is no walking stick to keep clear of here, so the way out sits in the corner, under the How to play card */
@media (orientation:landscape) and (max-height:520px){body.quick-play.touch #minigameStop{bottom:calc(14px + env(safe-area-inset-bottom,0px))}}
`;

const cloud = (x, y, s, cls) => `<g class="drift ${cls}" opacity=".92"><g transform="translate(${x} ${y}) scale(${s})" fill="#fff"><ellipse cx="0" cy="0" rx="70" ry="26"/><ellipse cx="-38" cy="-16" rx="40" ry="26"/><ellipse cx="16" cy="-26" rx="50" ry="34"/><ellipse cx="62" cy="-10" rx="36" ry="22"/></g></g>`;
const tree = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-6" width="6" height="22" rx="2" fill="#8a5a34"/><ellipse cx="0" cy="-26" rx="24" ry="28" fill="${c1}"/><ellipse cx="-7" cy="-33" rx="12" ry="13" fill="${c2}" opacity=".55"/></g>`;
// (a fixed scatter: the same picture every time)
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A summer morning in the riverside meadow. */
function meadow() {
  const r = rnd(7), flowers = [], blades = [];
  const COL = ['#ffffff', '#ffe36e', '#ff9fb8', '#ffffff', '#ffd1e0'];
  for (let i = 0; i < 90; i++) {
    const x = r() * 1600, y = 660 + r() * r() * 230, s = 0.6 + (y - 640) / 260;
    // none on the water
    if (x > 560 - (y - 640) * 0.9 && x < 1010 - (y - 640) * 0.35) continue;
    flowers.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3.2 * s).toFixed(1)}" fill="${COL[i % COL.length]}"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 * s).toFixed(1)}" fill="#f6b21a"/>`);
  }
  for (let i = 0; i < 70; i++) {
    const left = i % 2 === 0, x = left ? r() * 430 : 1170 + r() * 430, h = 70 + r() * 120, lean = (r() - 0.5) * 60, w = 7 + r() * 7;
    blades.push(`<path d="M${x.toFixed(0)} 905 Q ${(x + lean * 0.3).toFixed(0)} ${(905 - h * 0.6).toFixed(0)} ${(x + lean).toFixed(0)} ${(905 - h).toFixed(0)} Q ${(x + lean * 0.5 + w).toFixed(0)} ${(905 - h * 0.5).toFixed(0)} ${(x + w).toFixed(0)} 905 Z" fill="${['#3f9a4d', '#4faa55', '#2f8a46'][i % 3]}"/>`);
  }
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<linearGradient id="qmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8f2"/><stop offset=".5" stop-color="#bfe8f8"/><stop offset=".78" stop-color="#fdf4d6"/></linearGradient>
<radialGradient id="qmSun"><stop offset="0" stop-color="#fffbe0" stop-opacity=".95"/><stop offset=".3" stop-color="#fff3b8" stop-opacity=".55"/><stop offset="1" stop-color="#fff3b8" stop-opacity="0"/></radialGradient>
<linearGradient id="qmNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd27a"/><stop offset="1" stop-color="#4fa955"/></linearGradient>
<linearGradient id="qmRiver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4ecf8"/><stop offset="1" stop-color="#6fc3e6"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#qmSky)"/>
<circle cx="1310" cy="150" r="230" fill="url(#qmSun)"/><circle cx="1310" cy="150" r="54" fill="#fffbe6"/>
${cloud(260, 170, 1.25, '')}${cloud(820, 110, 0.85, 'b')}${cloud(1480, 300, 0.9, '')}${cloud(520, 330, 0.6, 'b')}
<path d="M0 500 C 180 410 360 420 560 470 S 900 380 1120 440 S 1460 390 1600 450 V900 H0Z" fill="#bfe3b4"/>
<path d="M0 560 C 240 470 520 540 780 510 S 1240 460 1600 540 V900 H0Z" fill="#9fd58f"/>
${tree(150, 520, 1.1, '#6dbb6c', '#a9e08f')}${tree(215, 532, 0.8, '#5fae63', '#a9e08f')}${tree(1380, 505, 1.15, '#6dbb6c', '#a9e08f')}${tree(1452, 520, 0.85, '#5fae63', '#a9e08f')}${tree(1010, 492, 0.7, '#77c272', '#b5e79b')}${tree(470, 512, 0.75, '#77c272', '#b5e79b')}
<path d="M0 650 C 300 600 560 650 820 628 S 1320 606 1600 656 V900 H0Z" fill="url(#qmNear)"/>
<path d="M905 628 C 850 660 960 700 880 760 S 640 850 560 900 H 1010 C 1020 840 1150 780 1130 720 S 990 670 1040 624 Z" fill="url(#qmRiver)"/>
<path d="M930 662 q 40 14 10 40 M 900 742 q -30 30 -90 50 M 1040 760 q -20 40 -80 70" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
${flowers.join('')}
${blades.join('')}
</svg>`;
}

/** An autumn morning over the fields: golden rice, green rows, turned soil, the first stooks standing. */
function fields() {
  const r = rnd(19), rows = [], ears = [];
  // furrows of the near field, fanning out toward the viewer
  for (let i = 0; i <= 22; i++) { const x0 = 300 + i * 46, x1 = -500 + i * 120; rows.push(`<path d="M${x0} 742 L ${x1} 905" stroke="#8f6238" stroke-width="5" opacity=".45"/>`); }
  for (let i = 0; i < 64; i++) {
    const left = i % 2 === 0, x = left ? r() * 400 : 1200 + r() * 400, h = 90 + r() * 110, lean = (left ? 1 : -1) * (10 + r() * 46);
    ears.push(`<path d="M${x.toFixed(0)} 905 Q ${(x + lean * 0.2).toFixed(0)} ${(905 - h * 0.7).toFixed(0)} ${(x + lean).toFixed(0)} ${(905 - h).toFixed(0)}" fill="none" stroke="#c9952e" stroke-width="5" stroke-linecap="round"/><ellipse cx="${(x + lean * 1.12).toFixed(0)}" cy="${(905 - h + 8).toFixed(0)}" rx="7" ry="20" transform="rotate(${(left ? 1 : -1) * 28} ${(x + lean * 1.12).toFixed(0)} ${(905 - h + 8).toFixed(0)})" fill="${['#f0c64a', '#e6b53c', '#f6d566'][i % 3]}"/>`);
  }
  const stook = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="30" rx="34" ry="8" fill="#7a5a2a" opacity=".25"/><path d="M-26 30 Q -20 -20 0 -34 Q 20 -20 26 30 Z" fill="#e9c35a"/><path d="M-10 28 Q -6 -8 0 -30 M 10 28 Q 6 -8 0 -30" fill="none" stroke="#c9952e" stroke-width="3"/><path d="M-14 -6 Q 0 0 14 -6" fill="none" stroke="#a9742a" stroke-width="4" stroke-linecap="round"/></g>`;
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<linearGradient id="qfSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecbee"/><stop offset=".45" stop-color="#cfe9f4"/><stop offset=".72" stop-color="#ffe9bf"/></linearGradient>
<radialGradient id="qfSun"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset=".3" stop-color="#ffe7a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>
<linearGradient id="qfGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d76c"/><stop offset="1" stop-color="#e7b944"/></linearGradient>
<linearGradient id="qfSoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2955e"/><stop offset="1" stop-color="#a87747"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#qfSky)"/>
<circle cx="300" cy="170" r="240" fill="url(#qfSun)"/><circle cx="300" cy="170" r="52" fill="#fff8dc"/>
${cloud(760, 130, 1.1, '')}${cloud(1330, 210, 0.9, 'b')}${cloud(1060, 330, 0.55, '')}
<path d="M0 480 C 140 400 260 330 400 420 S 640 300 800 400 S 1080 330 1240 410 S 1480 360 1600 430 V900 H0Z" fill="#c5d3e8"/>
<path d="M0 530 C 220 450 460 500 700 480 S 1180 440 1600 520 V900 H0Z" fill="#ecc276"/>
${tree(120, 498, 1.1, '#e2703a', '#f6a85a')}${tree(190, 510, 0.85, '#f0a13a', '#ffd27a')}${tree(560, 470, 0.8, '#cf5a2e', '#f08a4a')}${tree(1010, 452, 0.75, '#f0a13a', '#ffd27a')}${tree(1400, 482, 1.1, '#e2703a', '#f6a85a')}${tree(1474, 498, 0.85, '#d9892f', '#ffd27a')}
<path d="M0 590 C 300 545 620 580 900 560 S 1380 540 1600 580 V900 H0Z" fill="url(#qfGold)"/>
<path d="M0 596 C 300 551 620 586 900 566 S 1380 546 1600 586" fill="none" stroke="#fff3b0" stroke-width="5" opacity=".7"/>
<path d="M0 660 C 280 628 600 668 900 644 S 1360 630 1600 664 V900 H0Z" fill="#9cc765"/>
<path d="M0 684 C 280 652 600 692 900 668 S 1360 654 1600 688 M0 706 C 280 676 600 716 900 692 S 1360 678 1600 712" fill="none" stroke="#7fb04f" stroke-width="6" opacity=".7"/>
<path d="M0 740 C 300 716 620 748 900 730 S 1360 716 1600 744 V900 H0Z" fill="url(#qfSoil)"/>
${rows.join('')}
${stook(1180, 596, 1)}${stook(1262, 606, 0.86)}${stook(1110, 610, 0.8)}${stook(420, 600, 0.9)}
${ears.join('')}
</svg>`;
}

const SCENES = { lifecycle: meadow, crops: fields };
/** The still scene behind a card game (SVG markup), by trick id. */
export const sceneFor = id => (SCENES[id] || meadow)();

// ------------------------------------------------------------------------------------------------ the playground's ground
/**
 * The ground under marbles and ô ăn quan: a patch of swept earth (the mats of game/yard/views.js fade into it: the same
 * colours) with the yard's grass round it, a few daisies in the grass. `half`: half the side of the quad in metres.
 */
export function groundTexture(half = 9) {
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), mid = N / 2, k = N / 2 / half, r = rnd(4321);
  g.fillStyle = '#86bb5c'; g.fillRect(0, 0, N, N);
  // grass: soft patches of lighter and darker green, then short blades
  for (let i = 0; i < 520; i++) {
    const x = r() * N, y = r() * N, s = 14 + r() * 38;
    g.fillStyle = [`rgba(118,176,82,.35)`, `rgba(150,200,104,.3)`, `rgba(96,156,72,.3)`][i % 3];
    g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.4), r() * 3, 0, 7); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = r() * N, y = r() * N, l = 3 + r() * 5;
    g.strokeStyle = [`rgba(70,132,60,.5)`, `rgba(176,220,120,.5)`, `rgba(88,150,66,.5)`][i % 3]; g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - l); g.stroke();
  }
  // the earth: an uneven round patch, worn by many feet (the grass thins toward it)
  const R0 = 3.9 * k, edge = a => R0 * (1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2.2) + 0.03 * Math.sin(a * 9));
  const blob = (scale, fill) => { g.fillStyle = fill; g.beginPath(); for (let i = 0; i <= 120; i++) { const a = i / 120 * 6.2832, d = edge(a) * scale; g[i ? 'lineTo' : 'moveTo'](mid + Math.cos(a) * d, mid + Math.sin(a) * d); } g.fill(); };
  blob(1.16, 'rgba(160,170,92,.45)'); blob(1.08, 'rgba(184,160,98,.6)'); blob(1.0, '#c39a60');
  const earth = g.createRadialGradient(mid, mid, 0, mid, mid, R0);
  earth.addColorStop(0, '#d2ab70'); earth.addColorStop(0.62, '#c59c62'); earth.addColorStop(1, 'rgba(190,148,92,0)');
  g.fillStyle = earth; g.beginPath(); g.arc(mid, mid, R0, 0, 7); g.fill();
  for (let i = 0; i < 2600; i++) {
    const a = r() * 6.2832, d = Math.sqrt(r()) * R0 * 0.98, x = mid + Math.cos(a) * d, y = mid + Math.sin(a) * d;
    g.fillStyle = r() < 0.5 ? `rgba(120,84,44,${0.08 + r() * 0.12})` : `rgba(255,236,196,${0.08 + r() * 0.14})`;
    g.beginPath(); g.arc(x, y, 0.6 + r() * 1.3, 0, 7); g.fill();
  }
  // tufts creeping in over the edge, and daisies in the grass
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.2832, d = edge(a) * (0.94 + r() * 0.2), x = mid + Math.cos(a) * d, y = mid + Math.sin(a) * d;
    for (let j = 0; j < 5; j++) { g.strokeStyle = j % 2 ? 'rgba(92,154,66,.9)' : 'rgba(128,186,84,.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + j * 1.6 - 4, y); g.lineTo(x + (j - 2) * 3.2, y - 6 - r() * 5); g.stroke(); }
  }
  for (let i = 0; i < 150; i++) {
    const a = r() * 6.2832, d = R0 * (1.22 + r() * 1.2), x = mid + Math.cos(a) * d, y = mid + Math.sin(a) * d;
    if (x < 6 || y < 6 || x > N - 6 || y > N - 6) continue;
    g.fillStyle = i % 4 === 0 ? '#ffe36e' : '#ffffff';
    for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.2566) * 2.6, y + Math.sin(p * 1.2566) * 2.6, 1.9, 0, 7); g.fill(); }
    g.fillStyle = '#f2a51a'; g.beginPath(); g.arc(x, y, 1.5, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export const GROUND_COLOUR = '#86bb5c';

// ------------------------------------------------------------------------------------------------ the kids' faces
const FACE = {
  // Kenta, the ball captain: short black hair, a sun-browned face
  v3: { skin: '#eab98a', hair: '#2f2620', top: '<path d="M14 30 Q 14 9 32 9 Q 50 9 50 30 Q 44 19 32 20 Q 20 19 14 30 Z"/>', extra: '' },
  // Yui, the hopscotch champion: a fringe and two bunches tied with red
  v20: { skin: '#f6cfa8', hair: '#5a3a26', top: '<path d="M13 32 Q 12 9 32 9 Q 52 9 51 32 Q 46 22 32 23 Q 18 22 13 32 Z"/><circle cx="10" cy="34" r="7.5"/><circle cx="54" cy="34" r="7.5"/>', extra: '<circle cx="15" cy="29" r="2.6" fill="#e2543a"/><circle cx="49" cy="29" r="2.6" fill="#e2543a"/>' },
  // Daichi, always in the river: tousled brown hair, a towel band
  v10: { skin: '#f0c59a', hair: '#6b4a2c', top: '<path d="M13 31 Q 10 12 24 10 Q 28 5 34 9 Q 44 6 48 14 Q 54 20 51 31 Q 45 21 38 22 Q 30 18 24 22 Q 18 22 13 31 Z"/>', extra: '<path d="M15.5 24 Q 32 18 48.5 24" fill="none" stroke="#fdfdf6" stroke-width="3.4" stroke-linecap="round"/>' },
};
/** A kid's face as an image URL (64 px, the scoreboard chip crops it round). */
export function faceOf(id) {
  const f = FACE[id] || FACE.v3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ffe2b0"/>` +
    `<path d="M8 70 Q 10 50 32 50 Q 54 50 56 70 Z" fill="#6aa6d8"/><rect x="27" y="44" width="10" height="9" rx="3" fill="${f.skin}"/>` +
    `<ellipse cx="32" cy="31" rx="18.5" ry="19" fill="${f.skin}"/><g fill="${f.hair}">${f.top}</g>${f.extra}` +
    `<ellipse cx="24.5" cy="33" rx="2.4" ry="3" fill="#3a2a20"/><ellipse cx="39.5" cy="33" rx="2.4" ry="3" fill="#3a2a20"/>` +
    `<circle cx="25.3" cy="32" r=".9" fill="#fff"/><circle cx="40.3" cy="32" r=".9" fill="#fff"/>` +
    `<ellipse cx="19.5" cy="39" rx="3.6" ry="2.3" fill="#f59a8a" opacity=".55"/><ellipse cx="44.5" cy="39" rx="3.6" ry="2.3" fill="#f59a8a" opacity=".55"/>` +
    `<path d="M26.5 41.5 Q 32 46.5 37.5 41.5" fill="none" stroke="#7a3a2a" stroke-width="2" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
