// The cards of "From seed to harvest", drawn as SVG (120 x 120, flat and warm like lifecycle-art.js): no files to
// load, crisp at any size. Pure strings, so Node can make a contact sheet of them (.tools/crops-sheet.mjs).
// Each card is a little scene: the background says where it happens (a flooded paddy, a dry field, the soil in
// cross-section, snow, a table), the plant is drawn over it with a dark-brown outline on everything that matters.
// What a child must be able to tell apart: rice stands in water and its golden head HANGS; a wheat ear STANDS UP and
// has a beard; a potato is a tuber on a side stem under the soil line, and its plant has broad leaves and star flowers.
const INK = '#5a3a22';
const O = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const o = (w = 1.8) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const line = (d, colour, w = 3) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const f1 = n => +n.toFixed(1);

// ---------------------------------------------------------------------------------------------- backgrounds
const SUN = '<circle cx="100" cy="20" r="11" fill="#ffd95a"/>';
const CLOUD = '<g fill="#fff"><ellipse cx="26" cy="20" rx="13" ry="6"/><ellipse cx="36" cy="16" rx="9" ry="6"/></g>';
const BG = {
  // a table or a cloth: for the things one holds in a hand
  plain: '<rect width="120" height="120" fill="#fbf1d8"/><path d="M0 92q60-10 120 0v28H0z" fill="#f1dfb6"/>',
  // open field, dry ground along the bottom
  field: `<rect width="120" height="120" fill="#dff2fc"/>${SUN}${CLOUD}<path d="M0 96q30-5 60-2t60-3v29H0z" fill="#c9965f"/><path d="M0 96q30-5 60-2t60-3" fill="none" stroke="#8a5f38" stroke-width="3" stroke-linecap="round"/>`,
  // a flooded paddy: sky, a far bund, water with its bright surface line
  paddy: `<rect width="120" height="120" fill="#dff2fc"/>${SUN}${CLOUD}<path d="M0 62q60-8 120 0v10H0z" fill="#8fc46a"/><rect y="70" width="120" height="50" fill="#9ed6ec"/>
    <path d="M0 71q10-3 20 0t20 0 20 0 20 0 20 0 20 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M0 112q60-8 120 0v8H0z" fill="#86c5de"/>`,
  // the soil in cross-section: sky above the ground line, earth below
  soil: `<rect width="120" height="120" fill="#dff2fc"/><path d="M0 60q30-4 60 0t60 0v60H0z" fill="#c9965f"/><path d="M0 60q30-4 60 0t60 0v7q-30 4-60 0t-60 0z" fill="#8a5f38"/>
    <g fill="#b07f4b"><circle cx="14" cy="104" r="4"/><circle cx="106" cy="88" r="3.4"/><circle cx="98" cy="110" r="4.4"/><circle cx="10" cy="80" r="2.6"/></g>`,
  // winter: a pale sky, snow on the ground
  snow: `<rect width="120" height="120" fill="#e3edf8"/><path d="M0 84q30-8 60-3t60-4v43H0z" fill="#fff"/><path d="M0 84q30-8 60-3t60-4" fill="none" stroke="#c6d6ea" stroke-width="2.4" stroke-linecap="round"/>
    <g fill="#fff" stroke="#c6d6ea" stroke-width="1"><circle cx="18" cy="18" r="3"/><circle cx="46" cy="34" r="2.4"/><circle cx="78" cy="14" r="2.8"/><circle cx="102" cy="40" r="3"/><circle cx="64" cy="54" r="2.2"/><circle cx="24" cy="52" r="2.4"/></g>`,
  // a dark store room
  dark: `<rect width="120" height="120" fill="#3d3a55"/><path d="M0 96h120v24H0z" fill="#5a4a48"/><path d="M0 96h120" stroke="#2c2a40" stroke-width="3"/>`,
};

// ---------------------------------------------------------------------------------------------- plants
/** A fan of grass-like leaves from (x, y): n blades, h tall, spread s wide, each a curved stroke. */
function tuft(x, y, h, n, s, colour, w = 3, dark = null) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5, tx = x + t * s * 2, ty = y - h * (1 - Math.abs(t) * 0.5);
    out += line(`M${f1(x + t * 4)} ${y}Q${f1(x + t * s * 0.6)} ${f1(y - h * 0.6)} ${f1(tx)} ${f1(ty)}`, dark && i % 2 ? dark : colour, w);
  }
  return out;
}
/** A grain of rice in its husk: a pointed oval at (x, y), turned a degrees. */
const grain = (x, y, a = 0, k = 1, fill = '#edc65c') => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${k})"><path d="M-9 0Q-4-6 6-4Q10-1 9 1Q4 6-5 4Q-9 3-9 0z" fill="${fill}" ${o(1.6)}/><path d="M-6 0Q0-2 7-1" fill="none" ${o(1)}/></g>`;
/**
 * A hanging head of rice: the stalk comes up from (x, y), bends over to the side (dir 1 right, -1 left) and the
 * grains hang down from the bend. The whole point of the card: a ripe rice head bows.
 */
function riceHead(x, y, h, dir, fill = '#f2b53a', stalk = '#c9a23c') {
  const bx = x + dir * 16, by = y - h, ex = x + dir * 27, ey = y - h + 26;
  let out = line(`M${x} ${y}Q${x} ${f1(y - h * 0.8)} ${f1(x + dir * 6)} ${f1(by + 2)}Q${f1(bx)} ${f1(by - 7)} ${f1(x + dir * 23)} ${f1(by + 6)}Q${f1(ex + dir)} ${f1(by + 14)} ${ex} ${ey}`, stalk, 2.8);
  [[8, 2, 30], [15, 0, 55], [21, 5, 70], [25, 12, 82], [27, 19, 90], [20, 12, 100], [25.500, 25, 96]].forEach(([dx, dy, a]) => {
    out += `<ellipse cx="${f1(x + dir * dx)}" cy="${f1(by + dy + 3)}" rx="4.6" ry="2.7" transform="rotate(${dir * a} ${f1(x + dir * dx)} ${f1(by + dy + 3)})" fill="${fill}" ${o(1.2)}/>`;
  });
  return out;
}
/** An ear of wheat standing straight up on its stalk from (x, y): two rows of kernels and a beard of awns. */
function wheatEar(x, y, h, fill = '#f0bf4a', stalk = '#c9a23c', lean = 0) {
  const tx = x + lean, ty = y - h;
  let out = line(`M${x} ${y}Q${x} ${f1(y - h * 0.5)} ${f1(tx)} ${f1(ty + 4)}`, stalk, 2.8), awns = '';
  for (let i = 0; i < 5; i++) {
    const ky = ty - i * 6.2;
    for (const s of [-1, 1]) {
      awns += `M${f1(tx + s * 3.4)} ${f1(ky - 3)}L${f1(tx + s * (7 + i * 0.8))} ${f1(ky - 17)}`;
      out += `<ellipse cx="${f1(tx + s * 3.3)}" cy="${f1(ky)}" rx="3.5" ry="4.5" transform="rotate(${s * 22} ${f1(tx + s * 3.3)} ${f1(ky)})" fill="${fill}" ${o(1.2)}/>`;
    }
  }
  out += `<ellipse cx="${f1(tx)}" cy="${f1(ty - 30)}" rx="3" ry="4.4" fill="${fill}" ${o(1.2)}/>`;
  return line(`${awns}M${f1(tx)} ${f1(ty - 33)}L${f1(tx)} ${f1(ty - 47)}`, INK, 1.1) + out;
}
/** A potato at (x, y), rx wide: with its eyes (and sprouts growing out of them). */
function potato(x, y, rx = 16, { fill = '#dcb46c', eyes = true, sprouts = 0, a = 0 } = {}) {
  const ry = rx * 0.72;
  let out = `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M${-rx} 0C${-rx} ${-ry * 1.1} ${-rx * 0.3} ${-ry * 1.15} ${rx * 0.3} ${-ry}C${rx * 1.05} ${-ry * 0.9} ${rx * 1.1} ${ry * 0.4} ${rx * 0.5} ${ry * 0.95}C${-rx * 0.2} ${ry * 1.2} ${-rx} ${ry} ${-rx} 0z" fill="${fill}" ${rx > 9 ? O : o(1.6)}/>`;
  const at = [[-0.45, -0.3], [0.3, -0.45], [0.1, 0.35], [-0.5, 0.4], [0.62, 0.1]];
  if (eyes) at.slice(0, rx > 12 ? 5 : 3).forEach(([ex, ey]) => { out += `<path d="M${f1(ex * rx - 3)} ${f1(ey * ry)}q3 2.6 6 0" fill="none" ${o(1.3)}/><circle cx="${f1(ex * rx)}" cy="${f1(ey * ry + 0.4)}" r="1" fill="${INK}"/>`; });
  for (let i = 0; i < sprouts; i++) {
    const [ex, ey] = at[i], sx = ex * rx, sy = ey * ry - 1, up = 11 + (i % 2) * 5;
    out += `<path d="M${f1(sx - 2.4)} ${f1(sy)}Q${f1(sx - 3)} ${f1(sy - up * 0.6)} ${f1(sx + 1)} ${f1(sy - up)}Q${f1(sx + 4)} ${f1(sy - up * 0.5)} ${f1(sx + 2.6)} ${f1(sy)}z" fill="#c9a0d8" ${o(1.3)}/><circle cx="${f1(sx + 1)}" cy="${f1(sy - up)}" r="2.2" fill="#8fc45a" ${o(1.1)}/>`;
  }
  return `${out}</g>`;
}
/** A potato leaf (three broad leaflets on a stalk) growing from (x, y) to the side dir, a degrees up. */
function potatoLeaf(x, y, dir, a, fill = '#5fae46', k = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${-dir * a}) scale(${dir * k} ${k})">${line('M0 0H22', '#4b8f3a', 2.6)}
    <ellipse cx="12" cy="-6" rx="6.5" ry="4.6" transform="rotate(-30 12 -6)" fill="${fill}" ${o(1.4)}/><ellipse cx="12" cy="6" rx="6.5" ry="4.6" transform="rotate(30 12 6)" fill="${fill}" ${o(1.4)}/><ellipse cx="25" cy="0" rx="8" ry="5.4" fill="${fill}" ${o(1.4)}/></g>`;
}
const potatoFlower = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0-8L3-3L8-2L4 2L5 8L0 5L-5 8L-4 2L-8-2L-3-3z" fill="#fff" ${o(f1(Math.min(1.4, 2.6 / k)))}/><circle r="2.6" fill="#ffd23f" ${o(f1(Math.min(1, 2 / k)))}/></g>`;
/** The potato plant above the ground line (y 60 of the soil background): stems, leaves, flowers. */
function potatoTop({ flowers = 0, fill = '#5fae46', stem = '#4b8f3a', droop = false, k = 1 } = {}) {
  if (droop) {
    return `${line('M60 62Q54 50 34 50Q22 50 14 58', '#b9a04a', 3)}${line('M60 62Q68 48 88 50Q100 51 106 58', '#b9a04a', 3)}${line('M60 62Q60 46 52 40', '#b9a04a', 3)}
      ${potatoLeaf(34, 50, -1, -20, '#d9c25a')}${potatoLeaf(86, 50, 1, -22, '#c9a94a')}${potatoLeaf(52, 40, -1, 18, '#d9c25a', 0.9)}${potatoLeaf(70, 54, 1, -30, '#b98f4a', 0.8)}`;
  }
  const h = 44 * k;
  return `${line(`M60 62V${f1(62 - h)}`, stem, 3.4)}${line(`M60 62Q52 ${f1(62 - h * 0.5)} 46 ${f1(62 - h * 0.86)}`, stem, 3)}${line(`M60 62Q68 ${f1(62 - h * 0.5)} 75 ${f1(62 - h * 0.8)}`, stem, 3)}
    ${potatoLeaf(60, 62 - h * 0.34, -1, 16, fill, k)}${potatoLeaf(60, 62 - h * 0.5, 1, 14, fill, k)}${potatoLeaf(47, 62 - h * 0.8, -1, 28, fill, k * 0.9)}${potatoLeaf(74, 62 - h * 0.76, 1, 30, fill, k * 0.9)}${potatoLeaf(60, 62 - h, 1, 80, fill, k * 0.86)}
    ${flowers > 0 ? potatoFlower(48, 62 - h - 3, k) : ''}${flowers > 1 ? potatoFlower(72, 62 - h - 1, k * 0.9) : ''}`;
}
/** The soil heaped up round the stem (hilling), over the ground line. */
const HILL = '<path d="M26 64Q44 60 52 50Q60 44 68 50Q76 60 94 64z" fill="#a8763f" stroke="#8a5f38" stroke-width="2.2" stroke-linejoin="round"/>';
/** New potatoes on their side stems under the plant: n of them, r big. */
function tubers(n, r, fill = '#e6c078') {
  const at = [[40, 84, -10], [78, 86, 12], [58, 100, 4], [26, 100, -20], [94, 104, 16], [62, 80, 0]].slice(0, n);
  return at.map(([x, y]) => line(`M60 66Q${f1((60 + x) / 2)} ${f1(y - 14)} ${x} ${f1(y - r * 0.5)}`, '#f3e3c0', 2.2)).join('') + at.map(([x, y, a]) => potato(x, y, r, { fill, eyes: r > 8, a })).join('');
}
const stubble = (y, xs) => xs.map(x => line(`M${x - 3} ${y}v-6M${x} ${y}v-8M${x + 3} ${y}v-6`, '#d9b65a', 2.2)).join('');
/** A sheaf of rice hung over a pole at (x, y): cut ends up, the heads hanging down. */
const hungSheaf = (x, y, k = 1) => `<path d="M${x - 5 * k} ${y}h${10 * k}l${5 * k} ${30 * k}q${-10 * k} ${6 * k} ${-20 * k} 0z" fill="#e3bd58" ${o(1.6)}/><path d="M${x - 9 * k} ${y + 24 * k}q${9 * k} ${5 * k} ${18 * k} 0l${1 * k} ${6 * k}q${-10 * k} ${6 * k} ${-20 * k} 0z" fill="#f2a93a" ${o(1.4)}/>
  <path d="M${x - 6 * k} ${y + 7 * k}h${12 * k}" fill="none" ${o(1.4)}/>`;
const steam = (x, y) => line(`M${x} ${y}q-5-6 0-11t0-11M${x + 13} ${y + 2}q-5-6 0-11t0-9M${x - 13} ${y + 2}q-5-6 0-11t0-9`, '#d9c8ad', 2.2);
/** A bowl seen from the side at (60, y): its rim an ellipse, whatever is in it drawn between rim and body by the caller. */
const bowlBack = (y, fill = '#fff') => `<ellipse cx="60" cy="${y}" rx="40" ry="10" fill="${fill}" ${O}/>`;
const bowlFront = (y, fill = '#5b9bd5', band = '#fff') => `<path d="M20 ${y}q2 34 40 34t40-34q-40 14-80 0z" fill="${fill}" ${O}/><path d="M26 ${y + 14}q34 12 68 0" fill="none" stroke="${band}" stroke-width="3" stroke-linecap="round"/><path d="M46 ${y + 34}h28l3 6H43z" fill="${fill}" ${O}/>`;
const snowflake = (x, y, r = 7) => line(`M${x - r} ${y}h${2 * r}M${x} ${y - r}v${2 * r}M${f1(x - r * 0.7)} ${f1(y - r * 0.7)}l${f1(r * 1.4)} ${f1(r * 1.4)}M${f1(x - r * 0.7)} ${f1(y + r * 0.7)}l${f1(r * 1.4)} ${f1(-r * 1.4)}`, '#6fa8dc', 2.2);
const rowOf = (n, x0, x1, fn) => Array.from({ length: n }, (_, i) => fn(x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), i)).join('');
/** A farmer bent over the paddy, planting: a conical hat, a blue jacket, an arm down to the water. */
const planter = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-2 0v-17M9 0v-16" fill="none" stroke="#4a5d8a" stroke-width="6" stroke-linecap="round"/><path d="M-10-14Q-2-34 22-33Q32-32 33-25Q20-20 12-14Q2-10-10-14z" fill="#5b8fd0" ${O}/>
  <path d="M27-25Q31-12 30-1" fill="none" stroke="#f1c9a0" stroke-width="5" stroke-linecap="round"/><path d="M27-25Q31-12 30-1" fill="none" ${o(1)} opacity=".0"/>
  <circle cx="35" cy="-29" r="7.5" fill="#f1c9a0" ${o(1.8)}/><path d="M22-31L37-47L52-27Q37-23 22-31z" fill="#f2d68a" ${O}/>${line('M30 0l-3-9M30 0v-10M30 0l3-9', '#59b848', 2.4)}</g>`;

// ---------------------------------------------------------------------------------------------- the cards
// A card is [background, picture].
const GREEN = '#59b848', DEEP = '#2f9440', GOLD = '#d9aa3a';
const ART = {
  // ---- rice
  'rice.seed': ['plain', `<ellipse cx="60" cy="52" rx="42" ry="13" fill="#fff" ${O}/><path d="M18 52q4 30 42 30t42-30q-42 16-84 0z" fill="#e9967a" ${O}/><ellipse cx="60" cy="53" rx="35" ry="9" fill="#a9dcf0"/>
    ${grain(44, 52, -20, 0.8)}${grain(62, 55, 15, 0.8)}${grain(78, 51, -8, 0.8)}${grain(54, 49, 40, 0.7)}
    <path d="M27 97Q17 92 20 80Q22 75 27 76" fill="none" stroke="${INK}" stroke-width="6.400" stroke-linecap="round"/><path d="M27 97Q17 92 20 80Q22 75 27 76" fill="none" stroke="#fff" stroke-width="3.400" stroke-linecap="round"/>${grain(38, 102, -25, 1.5)}${grain(78, 102, 12, 1.5)}`],
  'rice.nursery': ['field', `<path d="M10 78h100l6 30H4z" fill="#8a5f38" ${O}/><path d="M16 82h88l4 18H12z" fill="#6f4a2a"/>
    ${rowOf(13, 18, 102, (x, i) => tuft(x, 96, 30 + (i % 3) * 3, 3, 4, i % 2 ? GREEN : '#74cc55', 2.6))}${rowOf(12, 22, 98, (x, i) => tuft(x, 101, 26 + (i % 2) * 4, 3, 4, i % 2 ? '#74cc55' : GREEN, 2.6))}
    <path d="M10 78h100l6 30" fill="none" ${O}/><path d="M4 108h112" fill="none" ${O}/>`],
  'rice.transplant': ['paddy', `${rowOf(6, 14, 74, x => tuft(x, 80, 9, 3, 3, GREEN, 2))}${rowOf(5, 10, 62, x => tuft(x, 92, 12, 3, 4, GREEN, 2.4))}${rowOf(4, 12, 58, x => tuft(x, 107, 15, 3, 5, GREEN, 2.8))}
    ${line('M4 84h54M2 97h50M2 112h52', '#ffffff90', 1.6)}${planter(74, 104)}<ellipse cx="80" cy="105" rx="16" ry="3" fill="#ffffff80"/>`],
  'rice.tiller': ['paddy', `${tuft(20, 100, 30, 5, 10, GREEN, 2.6)}${tuft(102, 98, 30, 5, 10, GREEN, 2.6)}${tuft(60, 108, 62, 11, 30, DEEP, 3.4, '#4fb24a')}
    <ellipse cx="60" cy="108" rx="20" ry="4" fill="#ffffff80"/><ellipse cx="60" cy="107" rx="7" ry="2.6" fill="${DEEP}"/>`],
  'rice.heading': ['paddy', `${tuft(24, 106, 58, 6, 16, DEEP, 3, '#4fb24a')}${tuft(92, 106, 60, 6, 16, DEEP, 3, '#4fb24a')}${tuft(58, 110, 64, 7, 20, DEEP, 3.2, '#4fb24a')}
    ${[[30, 106, 78, 4], [58, 110, 88, -3], [88, 106, 82, 5], [72, 110, 76, 8]].map(([x, y, h, l]) => `${line(`M${x} ${y}Q${x} ${y - h * 0.6} ${x + l} ${y - h}`, '#8fc45a', 2.6)}
      ${[0, 1, 2, 3].map(i => `<ellipse cx="${f1(x + l + (i % 2 ? 3 : -3) - l * i * 0.06)}" cy="${f1(y - h + 5 + i * 6)}" rx="3.2" ry="4.4" fill="#cfe58a" ${o(1.1)}/>`).join('')}
      <g fill="#fff" stroke="#e9d27a" stroke-width=".8"><circle cx="${x + l + 7}" cy="${y - h + 8}" r="1.7"/><circle cx="${x + l - 7}" cy="${y - h + 16}" r="1.7"/><circle cx="${x + l + 7}" cy="${y - h + 22}" r="1.5"/></g>`).join('')}`],
  'rice.golden': ['field', `${tuft(26, 100, 50, 5, 14, GOLD, 3, '#c2952f')}${tuft(86, 100, 52, 5, 14, GOLD, 3, '#c2952f')}${tuft(58, 104, 54, 6, 16, GOLD, 3.2, '#c2952f')}
    ${riceHead(24, 100, 66, -1)}${riceHead(58, 104, 76, 1)}${riceHead(92, 100, 62, 1)}${riceHead(52, 104, 60, -1)}`],
  'rice.harvest': ['field', `${stubble(102, [10, 24, 96, 110])}${stubble(110, [16, 40, 60, 84, 104])}
    ${line('M22 104L34 44M40 104L28 44M82 104L94 44M100 104L88 44', '#8a5f38', 4)}<path d="M12 50h98" fill="none" stroke="#a8763f" stroke-width="6" stroke-linecap="round"/><path d="M12 50h98" fill="none" ${o(1.2)} opacity=".5"/>
    ${hungSheaf(46, 49)}${hungSheaf(62, 49, 1.06)}${hungSheaf(78, 49)}`],
  // ---- wheat
  'wheat.sow': ['soil', `<path d="M92 12q8 6 4 16q-8-2-9-9q5 1 5-7z" fill="#e8743c" ${o(1.5)}/><path d="M22 20q7 4 5 13q-7-1-9-7q4 0 4-6z" fill="#f2a93a" ${o(1.5)}/>
    <path d="M0 60q30-4 60 0t60 0" fill="none" stroke="#8a5f38" stroke-width="3"/><path d="M8 76q52-10 104 0" fill="none" stroke="#a8763f" stroke-width="12" stroke-linecap="round"/>
    ${rowOf(6, 16, 104, (x, i) => grain(x, 75 - Math.sin(i / 5 * Math.PI) * 4, i % 2 ? 20 : -15, 0.8, '#d9a55a'))}
    <g transform="rotate(-24 60 20)"><path d="M40 2Q60-6 80 2Q88 16 80 30H40Q32 16 40 2z" fill="#e6d2a4" ${O}/><path d="M40 30h40l-4 8H44z" fill="#d9bd85" ${O}/><ellipse cx="60" cy="38" rx="16" ry="3.400" fill="#8a5f38" ${o(1.4)}/><path d="M46 10q14-5 28 0" fill="none" ${o(1.4)}/></g>
    ${grain(66, 50, 70, 0.7, '#d9a55a')}${grain(78, 44, 100, 0.7, '#d9a55a')}${grain(72, 58, 40, 0.7, '#d9a55a')}`],
  'wheat.sprout': ['snow', `${rowOf(7, 12, 108, (x, i) => tuft(x, 86 - (i % 2) * 2, 13, 3, 4, '#4fa83e', 2.6))}${rowOf(6, 16, 104, x => tuft(x, 104, 17, 3, 5, '#4fa83e', 3))}
    ${snowflake(92, 22)}<path d="M4 108q10-6 18 0M44 110q10-6 18 0M84 108q10-6 18 0" fill="none" stroke="#c6d6ea" stroke-width="2" stroke-linecap="round"/>`],
  'wheat.shoot': ['field', `<g fill="#f7b9cf"><circle cx="30" cy="34" r="2.6"/><circle cx="52" cy="24" r="2.2"/><circle cx="74" cy="40" r="2.4"/></g>
    ${rowOf(5, 16, 104, (x, i) => tuft(x, 98 + (i % 2) * 6, 50 + (i % 3) * 5, 4, 8, i % 2 ? '#4fa83e' : '#63bb4c', 3.2))}${rowOf(4, 28, 92, x => line(`M${x} 102V44`, '#3f9438', 3.4))}
    ${line('M4 62v36M1 64l3-4l3 4M1 96l3 4l3-4', '#c2541c', 1.8)}`],
  'wheat.heading': ['field', `${tuft(30, 104, 40, 4, 12, '#4fa83e', 3)}${tuft(86, 104, 40, 4, 12, '#4fa83e', 3)}
    ${wheatEar(34, 104, 44, '#a9d66a', '#4fa83e', -3)}${wheatEar(60, 106, 52, '#a9d66a', '#4fa83e')}${wheatEar(86, 104, 44, '#a9d66a', '#4fa83e', 3)}`],
  'wheat.golden': ['field', `${tuft(30, 104, 40, 4, 12, GOLD, 3, '#c2952f')}${tuft(86, 104, 40, 4, 12, GOLD, 3, '#c2952f')}
    ${wheatEar(34, 104, 44, '#f0bf4a', GOLD, -3)}${wheatEar(60, 106, 52, '#f0bf4a', GOLD)}${wheatEar(86, 104, 44, '#f0bf4a', GOLD, 3)}`],
  'wheat.harvest': ['field', `${stubble(101, [8, 22, 100, 112])}${stubble(110, [14, 34, 62, 88, 106])}
    ${[[36, 0.94], [80, 1]].map(([x, k]) => `<g transform="translate(${x} 104) scale(${k})"><path d="M-17 0Q-8-22-5-34h10Q8-22 17 0z" fill="#e3bd58" ${O}/><path d="M-7-33h14" fill="none" stroke="#a8763f" stroke-width="4" stroke-linecap="round"/>
      ${[-14, -7, 0, 7, 14].map((d, i) => `${line(`M${f1(d * 0.3)}-35L${d}-${52 + (i % 2) * 6}`, GOLD, 2)}<ellipse cx="${d}" cy="-${58 + (i % 2) * 6}" rx="3.4" ry="7" transform="rotate(${d} ${d} -${58 + (i % 2) * 6})" fill="#f0bf4a" ${o(1.2)}/>${line(`M${d}-${65 + (i % 2) * 6}l${f1(d * 0.2)}-9`, INK, 1)}`).join('')}</g>`).join('')}`],
  // ---- potato
  'potato.seed': ['plain', `<ellipse cx="62" cy="96" rx="36" ry="6" fill="#e6d2a4"/>${potato(60, 66, 36)}`],
  'potato.sprout': ['plain', `<ellipse cx="62" cy="100" rx="36" ry="6" fill="#e6d2a4"/>${potato(60, 74, 34, { sprouts: 3 })}`],
  'potato.flower': ['soil', `${HILL}${potatoTop({ flowers: 2 })}${potato(60, 82, 12, { fill: '#b98f5a', eyes: false })}${tubers(2, 5)}`],
  'potato.tubers': ['soil', `${HILL}${potatoTop({ flowers: 0, k: 0.92 })}${tubers(5, 12)}`],
  'potato.dieback': ['soil', `${HILL}${potatoTop({ droop: true })}${tubers(5, 12, '#dcb46c')}`],
  'potato.dig': ['field', `<path d="M0 96q30-5 60-2t60-3v29H0z" fill="#a8763f"/><path d="M34 100q14-22 30-20q16 0 28 22z" fill="#8a5f38"/>
    <path d="M96 10L70 72" fill="none" stroke="#a8763f" stroke-width="6" stroke-linecap="round"/><path d="M88 6l16 8" fill="none" stroke="#a8763f" stroke-width="6" stroke-linecap="round"/><path d="M60 68l20 8" fill="none" stroke="#9aa3ad" stroke-width="5" stroke-linecap="round"/>
    ${line('M61 70L50 96M68 72L58 99M74 75L66 101M80 77L74 102', '#9aa3ad', 3.6)}
    ${potato(30, 100, 13, { a: -12 })}${potato(52, 108, 12, { a: 8 })}${potato(92, 104, 13, { a: 14 })}${potato(74, 110, 11, { a: -6 })}${potato(14, 110, 10)}`],
  // ---- what a crop needs
  'need.water': ['paddy', `<path d="M0 62q60-8 120 0v10H0z" fill="#8fc46a"/>${rowOf(5, 14, 106, x => tuft(x, 86, 12, 3, 4, GREEN, 2.4))}${rowOf(4, 22, 98, x => tuft(x, 104, 15, 3, 5, GREEN, 2.8))}
    <path d="M60 14C48 32 44 40 44 48a16 16 0 0 0 32 0c0-8-4-16-16-34z" fill="#58b6e8" ${O}/><path d="M52 48a8 8 0 0 0 7 8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`],
  'need.cold': ['snow', `${rowOf(5, 18, 102, x => tuft(x, 96, 14, 3, 4, '#4fa83e', 2.8))}${snowflake(34, 34, 12)}${snowflake(92, 60, 7)}
    <rect x="68" y="10" width="12" height="42" rx="6" fill="#fff" ${O}/><circle cx="74" cy="56" r="10" fill="#58a6e8" ${O}/><path d="M74 56V38" stroke="#58a6e8" stroke-width="5" stroke-linecap="round"/>`],
  'need.hill': ['soil', `<path d="M18 64Q40 58 50 42Q60 32 70 42Q80 58 102 64z" fill="#a8763f" stroke="#8a5f38" stroke-width="2.2" stroke-linejoin="round"/>${line('M60 44V22', '#4b8f3a', 3.4)}${potatoLeaf(60, 34, -1, 20)}${potatoLeaf(60, 28, 1, 24)}
    ${tubers(3, 9)}${line('M22 54l12-10M28 42l6 2l-2 7M98 54L86 44M92 42l-6 2l2 7', '#c2541c', 2.6)}
    <path d="M112 8L92 40" fill="none" stroke="#a8763f" stroke-width="5" stroke-linecap="round"/><path d="M84 36l14 10l-9 4z" fill="#9aa3ad" ${o(1.6)}/>`],
  'need.dark': ['dark', `<circle cx="96" cy="24" r="12" fill="none" stroke="#f2d06a" stroke-width="3" stroke-dasharray="3 5"/><path d="M82 38l28-28" stroke="#e2574c" stroke-width="4" stroke-linecap="round"/>
    ${potato(42, 62, 12, { a: -10 })}${potato(64, 58, 13, { a: 8 })}${potato(84, 64, 11, { a: 20 })}${potato(54, 70, 11)}${potato(74, 72, 12, { a: -14 })}
    <path d="M20 66h80l-6 36H26z" fill="#b98550" ${O}/><path d="M24 80h72M27 92h66" fill="none" ${o(1.6)}/><path d="M44 66l2 36M76 66l-2 36" fill="none" ${o(1.4)}/>`],
  // ---- the part we eat
  'part.grain': ['plain', `${riceHead(26, 104, 78, 1, '#f2b53a', '#c9a23c')}${wheatEar(96, 108, 44)}${grain(52, 96, -20, 1.5)}${grain(72, 104, 16, 1.5, '#e3a94a')}${grain(62, 82, 60, 1.3, '#f3dc9a')}`],
  'part.tuber': ['soil', `${line('M60 62V40', '#4b8f3a', 3.4)}${potatoLeaf(60, 50, -1, 18, '#5fae46', 0.9)}${potatoLeaf(60, 44, 1, 22, '#5fae46', 0.9)}${line('M60 64Q60 72 60 76', '#f3e3c0', 2.4)}${potato(60, 92, 24)}
    <circle cx="60" cy="92" r="30" fill="none" stroke="#f08a3c" stroke-width="2.6" stroke-dasharray="4 5"/>`],
  'part.leaf': ['plain', `<path d="M60 108C32 100 16 72 22 34C54 30 78 46 84 76C86 90 76 104 60 108z" fill="#6cc24a" ${O}/><path d="M60 108C54 80 42 56 22 34M51 84L70 74M43 66L62 54M35 50L48 40" fill="none" stroke="#3f8f34" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M70 104C74 84 88 70 106 66C108 84 98 100 70 104z" fill="#8fd04f" ${O}/><path d="M70 104C80 90 92 78 106 66" fill="none" stroke="#3f8f34" stroke-width="2" stroke-linecap="round"/>`],
  'part.flower': ['plain', `${line('M60 112Q58 90 60 72', '#4b8f3a', 4)}${potatoLeaf(59, 98, -1, 24)}${potatoLeaf(60, 90, 1, 20)}${potatoFlower(60, 48, 4.2)}`],
  // ---- what is made from it
  'food.bowl': ['plain', `${steam(60, 36)}${bowlBack(66)}<path d="M26 66Q30 38 60 36Q90 38 94 66Q60 78 26 66z" fill="#fff" ${O}/><path d="M44 52q4-3 8 0M62 46q4-3 8 0M70 58q4-3 8 0M52 62q4-3 8 0" fill="none" stroke="#d9c8ad" stroke-width="1.8" stroke-linecap="round"/>${bowlFront(66)}`],
  'food.ricenoodle': ['plain', `${bowlBack(62, '#f7e7b9')}<path d="M28 62q8-10 16 0t16 0 16 0 16 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M28 62q8-10 16 0t16 0 16 0 16 0" fill="none" ${o(1)}/>
    <path d="M34 68q8-10 16 0t16 0 16 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M34 68q8-10 16 0t16 0 16 0" fill="none" ${o(1)}/>
    <g fill="#59b848" ${o(1.1)}><ellipse cx="44" cy="56" rx="6" ry="3" transform="rotate(-20 44 56)"/><ellipse cx="56" cy="54" rx="6" ry="3" transform="rotate(15 56 54)"/></g><path d="M70 50a9 9 0 0 1 16 6z" fill="#c8e86a" ${o(1.4)}/><circle cx="64" cy="60" r="2.6" fill="#e2574c"/>
    ${bowlFront(62, '#e9967a')}<path d="M70 8L48 50M82 10L58 52" fill="none" stroke="#8a5f38" stroke-width="3.4" stroke-linecap="round"/>`],
  'food.ricecake': ['plain', `<ellipse cx="60" cy="92" rx="50" ry="12" fill="#6cc24a" ${O}/><path d="M16 92q44 8 88 0" fill="none" stroke="#3f8f34" stroke-width="1.8"/>
    <rect x="58" y="54" width="40" height="34" rx="5" fill="#8fc45a" ${O}/><path d="M78 54v34M58 71h40" fill="none" stroke="#e9d27a" stroke-width="3"/><path d="M78 54v34M58 71h40" fill="none" ${o(0.8)}/>
    <ellipse cx="34" cy="76" rx="18" ry="13" fill="#fff" ${O}/><ellipse cx="46" cy="58" rx="16" ry="12" fill="#f9c6d6" ${O}/><path d="M24 72q6-5 12-2" fill="none" stroke="#e6dccb" stroke-width="2.4" stroke-linecap="round"/>`],
  'food.flour': ['plain', `<path d="M28 34Q24 70 30 100h46Q84 70 78 34z" fill="#f3e7cf" ${O}/><path d="M28 34Q40 22 52 30Q64 20 78 34Q54 42 28 34z" fill="#e6d2a4" ${O}/><path d="M44 30l4 6M60 28l-3 8" fill="none" ${o(1.4)}/>
    <g transform="translate(52 62) scale(.62)">${wheatEar(0, 44, 26)}</g><path d="M70 104q14-22 30-6q8 6 12 6z" fill="#fff" ${O}/><path d="M86 92q5-3 9 1" fill="none" stroke="#e6dccb" stroke-width="2.2" stroke-linecap="round"/>`],
  'food.bread': ['plain', `<path d="M14 80Q10 44 44 40h30Q110 44 106 80Q104 96 90 96H30Q16 96 14 80z" fill="#d9944a" ${O}/><path d="M38 46q6 12 0 26M58 44q6 13 0 28M78 46q6 12 0 26" fill="none" stroke="#f3d9a4" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 80q46 12 92 0" fill="none" stroke="#b9743a" stroke-width="2.4" stroke-linecap="round"/>`],
  'food.wheatnoodle': ['plain', `${steam(60, 34)}${bowlBack(62, '#8a5f38')}<ellipse cx="60" cy="63" rx="34" ry="7" fill="#b9743a"/>
    <path d="M30 60q10-12 20 0t20 0 20 0" fill="none" stroke="#f3e3b4" stroke-width="7.500" stroke-linecap="round"/><path d="M36 67q10-10 20 0t20 0" fill="none" stroke="#f3e3b4" stroke-width="7.500" stroke-linecap="round"/>
    <g fill="#8fd04f" stroke="#3f8f34" stroke-width="1.2"><circle cx="46" cy="54" r="3.4"/><circle cx="70" cy="56" r="3.4"/><circle cx="58" cy="50" r="3"/></g>${bowlFront(62, '#4a5d8a', '#e9967a')}`],
  'food.chips': ['plain', `${[[38, 30, -12], [48, 22, -5], [58, 18, 0], [68, 22, 6], [78, 30, 12], [53, 30, -3], [64, 30, 4]].map(([x, y, a]) => `<rect x="${x - 4}" y="${y}" width="8" height="52" rx="2" transform="rotate(${a} ${x} ${y + 52})" fill="#f6cf4a" ${o(1.5)}/>`).join('')}
    <path d="M28 58h64l-9 46H37z" fill="#e2574c" ${O}/><path d="M42 58l5 46M60 58v46M78 58l-5 46" fill="none" stroke="#fff" stroke-width="5"/><path d="M28 58h64l-9 46H37z" fill="none" ${O}/>`],
  'food.stew': ['plain', `${steam(60, 36)}<path d="M8 62h14M98 62h14" fill="none" stroke="#5a4a48" stroke-width="7" stroke-linecap="round"/><ellipse cx="60" cy="62" rx="42" ry="11" fill="#6b4a3a" ${O}/><ellipse cx="60" cy="63" rx="36" ry="8" fill="#b9743a"/>
    ${potato(44, 60, 9, { eyes: false, fill: '#f0d68a' })}${potato(68, 62, 10, { eyes: false, fill: '#f0d68a', a: 20 })}${potato(56, 66, 7, { eyes: false, fill: '#f0d68a' })}<g fill="#f08a3c" ${o(1.2)}><circle cx="80" cy="60" r="4.4"/><circle cx="34" cy="64" r="3.8"/></g><ellipse cx="56" cy="57" rx="4" ry="2" fill="#59b848"/>
    <path d="M18 62q0 40 42 40t42-40q-42 14-84 0z" fill="#5a4a48" ${O}/>`],
};

/** The inner SVG of a card (background included); '' for an unknown id. `crop.<id>` is drawn as that crop's portrait. */
const PORTRAIT = { 'crop.rice': 'rice.golden', 'crop.wheat': 'wheat.golden', 'crop.potato': 'potato.tubers' };
export function artOf(id) {
  const a = ART[PORTRAIT[id] || id];
  return a ? BG[a[0]] + a[1] : '';
}
/** A whole <svg> for a card. */
export function cardSvg(id, cls = '') {
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 120 120" aria-hidden="true">${artOf(id)}</svg>`;
}
export const ART_IDS = Object.keys(ART);

// ---------------------------------------------------------------------------------------------- the year wheel
/** The colour a crop's months are drawn in on the wheel (and its dot in the legend). */
export const CROP_COLOUR = { rice: '#3fa66b', wheat: '#e2a12a', potato: '#a9683a' };
const SEASON_OF = m => (m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3);
const SEASON_FILL = ['#cfe3f6', '#f9d3e0', '#c8e8a0', '#f8cf94'];
const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [f1(100 + r * Math.cos(a)), f1(100 + r * Math.sin(a))]; };
function ring(r0, r1, a0, a1) {
  const [x0, y0] = polar(r1, a0), [x1, y1] = polar(r1, a1), [x2, y2] = polar(r0, a1), [x3, y3] = polar(r0, a0), big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}z`;
}
/**
 * The year as a wheel (200 x 200): twelve numbered months clockwise from January at the top, tinted by season (snow,
 * blossom, sun, red leaf at the rim), and inside it one band for each crop over the months it is in
 * the field. A year is a circle: winter wheat runs over the new year without a break.
 *   arcs: [{ from, to, crop | null }] (crop null: the mystery months, drawn in violet); now: a month marked "today";
 *   flag: the month of a festival (ringed in gold, a star at the rim).
 */
export function wheelSvg({ arcs = [], now = null, flag = null } = {}) {
  let out = '<circle cx="100" cy="100" r="98" fill="#fff8ea"/>';
  for (let m = 1; m <= 12; m++) {
    const a0 = (m - 1) * 30, s = SEASON_OF(m), [tx, ty] = polar(m % 3 === 1 ? 77 : 82, a0 + 15);
    out += `<path d="${ring(68, 97, a0, a0 + 30)}" fill="${SEASON_FILL[s]}" stroke="#fff" stroke-width="2"/>`;
    out += `<text x="${tx}" y="${ty + 5.500}" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="700" font-size="15" fill="${INK}">${m}</text>`;
  }
  // the seasons, as four little signs at the rim of their middle month: a snowflake, a blossom, a sun, a red leaf
  const sign = (deg, svg) => { const [x, y] = polar(91, deg + (deg > 180 ? 7 : -7)); return `<g transform="translate(${x} ${y}) scale(.74)">${svg}</g>`; };
  out += sign(15, line('M-6 0h12M0-6v12M-4.200-4.200l8.400 8.400M-4.200 4.200l8.400-8.400', '#6fa8dc', 2));
  out += sign(105, `<g fill="#f48fb1">${[0, 72, 144, 216, 288].map(a => `<circle cx="${f1(4.4 * Math.sin(a * Math.PI / 180))}" cy="${f1(-4.4 * Math.cos(a * Math.PI / 180))}" r="3"/>`).join('')}</g><circle r="2" fill="#ffd23f"/>`);
  out += sign(195, `<circle r="4.600" fill="#ffc83a"/>${line('M0-9v-2.500M0 9v2.500M-9 0h-2.500M9 0h2.500M-6.400-6.400l-1.800-1.800M6.400 6.400l1.800 1.800M-6.400 6.400l-1.800 1.800M6.400-6.400l1.800-1.800', '#f2a93a', 2)}`);
  out += sign(285, `<path d="M0-8Q7-3 4 5Q0 9-4 5Q-7-3 0-8z" fill="#e8743c"/>${line('M0-4V9', '#b9502a', 1.6)}`);
  const months = arc => ((arc.to - arc.from + 12) % 12) + 1;
  arcs.slice().sort((a, b) => months(b) - months(a)).forEach((arc, i) => {
    const r1 = 63 - i * 17, r0 = r1 - 13, n = months(arc);
    const a0 = (arc.from - 1) * 30 + 3, a1 = a0 + n * 30 - 6;
    out += `<path d="${ring(r0, r1, a0, a1)}" fill="${arc.crop ? CROP_COLOUR[arc.crop] : '#8a6ad8'}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
  });
  if (flag) {
    // the festival: its month ringed in gold, a star at the rim
    const [x, y] = polar(103, (flag - 1) * 30 + 15);
    out += `<path d="${ring(66, 99, (flag - 1) * 30, flag * 30)}" fill="none" stroke="#f2a81c" stroke-width="4" stroke-linejoin="round"/>`;
    out += `<path transform="translate(${x} ${y})" d="M0-11L3.200-4L10.500-3.400L5 1.800L6.500 9L0 5L-6.500 9L-5 1.800L-10.500-3.400L-3.200-4z" fill="#ffd23f" ${o(1.8)}/>`;
  }
  if (now) {
    const a = (now - 1) * 30 + 15, [x, y] = polar(64, a), [bx, by] = polar(0, a);
    out += `<path d="M${bx} ${by}L${x} ${y}" stroke="#c2541c" stroke-width="5" stroke-linecap="round"/><path d="${ring(66, 99, (now - 1) * 30, now * 30)}" fill="none" stroke="#c2541c" stroke-width="4" stroke-linejoin="round"/><circle cx="100" cy="100" r="6" fill="#c2541c"/>`;
  }
  return `<svg class="wheel" viewBox="-16 -16 232 232" aria-hidden="true">${out}</svg>`;
}

/**
 * The game's badge (160 x 160), in the family of the other trick icons: a round piece of sky and field with a bowing
 * rice head and a standing wheat ear, a potato lying in front. public/icons/trick-crops.webp is this picture
 * (.tools/crops-icon.mjs renders it).
 */
export function badgeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><clipPath id="cb"><circle cx="80" cy="76" r="68"/></clipPath></defs>
    <g clip-path="url(#cb)"><rect width="160" height="160" fill="#cfeafb"/><circle cx="118" cy="34" r="15" fill="#ffe27a"/><path d="M0 112q40-10 80-4t80-6v60H0z" fill="#8fd04f"/><path d="M0 126q40-8 80-3t80-5v44H0z" fill="#c9965f"/></g>
    <g transform="translate(6 12) scale(1.12)">${tuft(44, 104, 40, 4, 12, GOLD, 3, '#c2952f')}${wheatEar(44, 104, 46)}${tuft(82, 104, 46, 5, 14, GOLD, 3, '#c2952f')}${riceHead(80, 104, 74, 1)}</g>
    ${potato(112, 132, 24, { a: -8 })}${potato(74, 142, 15, { a: 10, fill: '#e6c078' })}</svg>`;
}
