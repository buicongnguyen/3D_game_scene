// The Fire drill's menu icon (public/icons/trick-firedrill.webp, 160 x 160): drawn here as SVG, rasterised by Chromium.
import { chromium } from 'playwright';
import fs from 'node:fs';
const O = '#3b2a20';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
<ellipse cx="82" cy="140" rx="62" ry="10" fill="#3b2a20" opacity=".16"/>
<g stroke="${O}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
<path d="M96 132h52l-5 12h-42z" fill="#5b616b"/>
<path d="M122 44c5 20 26 28 26 54a26 24 0 0 1-52 0c0-14 8-19 12-31 4 5 5 9 8 13 4-10 5-21 6-36z" fill="#f2671e"/>
<path d="M122 78c3 11 13 15 13 26a13 13 0 0 1-26 0c0-7 4-9 6-15 2 3 3 5 4 7 2-5 2-10 3-18z" fill="#ffd23a" stroke="none"/>
<path d="M122 100c1.500 5 6 7 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 1 2 2 3 .500-2 .800-4 1-7z" fill="#fff6cf" stroke="none"/>
<path d="M58 30c18-12 34-8 44 14" fill="none" stroke-width="7"/>
<path d="M97 37l9 12-13 5z" fill="${O}"/>
<rect x="22" y="52" width="50" height="90" rx="14" fill="#e23a2c"/>
<path d="M22 86h50v22H22z" fill="#ffd95a"/>
<rect x="34" y="34" width="26" height="18" rx="3" fill="#55585e"/>
<path d="M26 26h44" stroke-width="8"/>
<path d="M30 40l42-6" stroke="#e23a2c" stroke-width="7"/><path d="M30 40l42-6" fill="none" stroke-width="0"/>
<circle cx="80" cy="46" r="7" fill="none" stroke="#f2a51a" stroke-width="5"/>
<circle cx="29" cy="44" r="7" fill="#f4f4f0"/>
</g>
<path d="M30 62v70" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>
<g fill="#fff" opacity=".92"><circle cx="100" cy="112" r="7"/><circle cx="109" cy="121" r="9"/><circle cx="97" cy="124" r="6"/></g>
</svg>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 160, height: 160 }, deviceScaleFactor: 1 });
await p.setContent(`<body style="margin:0;background:transparent">${svg}<canvas width="160" height="160"></canvas></body>`);
const data = await p.evaluate(async s => {
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); await img.decode();
  const c = document.querySelector('canvas'); c.getContext('2d').drawImage(img, 0, 0, 160, 160);
  return c.toDataURL('image/webp', 0.92);
}, svg);
fs.writeFileSync('public/icons/trick-firedrill.webp', Buffer.from(data.split(',')[1], 'base64'));
await p.setContent(`<body style="margin:0;background:#fff8ea"><img src="${data}"></body>`);
await p.screenshot({ path: '.tools/firedrill-icon-preview.png' });
await b.close();
console.log('icon', fs.statSync('public/icons/trick-firedrill.webp').size);
