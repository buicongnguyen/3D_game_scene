// The "Float and wait" menu icon (public/icons/trick-floatsafe.webp), drawn here and rasterised with sharp:
//   node scripts/floatsafe-icon.mjs
// A life ring on a disc of pool water with an empty bottle bobbing beside it (original art, no model files).
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stripes = [0, 90, 180, 270].map(a => `<path d="M0 -38A38 38 0 0 1 26.9 -26.9L14.8 -14.8A21 21 0 0 0 0 -21Z" fill="#e8483f" transform="rotate(${a + 22})"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 160 160">
<defs>
 <radialGradient id="w" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#6fd0f2"/><stop offset=".6" stop-color="#2f9bdc"/><stop offset="1" stop-color="#1c6fc0"/></radialGradient>
 <radialGradient id="r" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#40210a" stop-opacity=".28"/></radialGradient>
 <linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#dff6ff"/><stop offset=".5" stop-color="#aee3f5"/><stop offset="1" stop-color="#7cc4e0"/></linearGradient>
</defs>
<ellipse cx="80" cy="96" rx="74" ry="50" fill="#1a5fa8"/>
<ellipse cx="80" cy="91" rx="74" ry="50" fill="url(#w)"/>
<g fill="none" stroke="#e9fbff" stroke-linecap="round" stroke-width="3" opacity=".8"><path d="M22 86q10-7 20 0"/><path d="M112 118q10-7 20 0"/><path d="M40 122q8-5 16 0"/><path d="M118 70q7-5 14 0"/></g>
<g transform="translate(70 78) scale(1 .78)">
 <circle r="41" fill="#0d3f78" opacity=".35" transform="translate(3 9)"/>
 <path d="M0 -38A38 38 0 1 1 0 38A38 38 0 1 1 0 -38ZM0 -21A21 21 0 1 0 0 21A21 21 0 1 0 0 -21Z" fill="#fffaf0" fill-rule="evenodd"/>
 ${stripes}
 <path d="M0 -38A38 38 0 1 1 0 38A38 38 0 1 1 0 -38ZM0 -21A21 21 0 1 0 0 21A21 21 0 1 0 0 -21Z" fill="url(#r)" fill-rule="evenodd"/>
 <path d="M0 -38A38 38 0 1 1 0 38A38 38 0 1 1 0 -38ZM0 -21A21 21 0 1 0 0 21A21 21 0 1 0 0 -21Z" fill="none" stroke="#7a2f1c" stroke-width="2.2" fill-rule="evenodd"/>
</g>
<g transform="translate(124 96) rotate(-28)">
 <ellipse cx="2" cy="19" rx="15" ry="5" fill="#0d3f78" opacity=".3"/>
 <rect x="-9" y="-16" width="18" height="34" rx="7" fill="url(#b)" stroke="#3d7f9c" stroke-width="2"/>
 <rect x="-5" y="-25" width="10" height="10" rx="2.5" fill="url(#b)" stroke="#3d7f9c" stroke-width="2"/>
 <rect x="-6" y="-30" width="12" height="7" rx="2.5" fill="#f08a3c" stroke="#9c4f18" stroke-width="1.6"/>
 <rect x="-9" y="-4" width="18" height="10" fill="#fff" opacity=".65"/>
 <path d="M-5 -12v24" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
</g>
</svg>`;
const out = path.join(ROOT, 'public/icons/trick-floatsafe.webp');
await sharp(Buffer.from(svg)).resize(160, 160).webp({ quality: 92, alphaQuality: 100 }).toFile(out);
console.log('wrote', out);
