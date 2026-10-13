// The stage cards of "From egg to wings", drawn as SVG (120 x 120, flat and warm like the How to play pictograms, but
// bigger): no files to load, crisp at any size. Pure strings, so Node can make a contact sheet of them.
// Each card is a little scene: the background says where the stage lives (water with its surface line, a plant, the
// soil in cross-section, the open air), the creature is drawn over it with a dark-brown outline.
const INK = '#5a3a22';
const O = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const o = (w = 1.8) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// ---------------------------------------------------------------------------------------------- backgrounds
const BG = {
  air: `<rect width="120" height="120" fill="#dff2fc"/><path d="M-4 96q30-12 62-4t66-6v38H-4z" fill="#cdeaa6"/>
    <g fill="#fff"><ellipse cx="24" cy="22" rx="13" ry="6"/><ellipse cx="34" cy="18" rx="9" ry="6"/><ellipse cx="98" cy="34" rx="12" ry="5"/></g>`,
  leaf: `<rect width="120" height="120" fill="#f1f8dc"/><circle cx="100" cy="18" r="10" fill="#ffe89a"/>`,
  soil: `<rect width="120" height="120" fill="#e3f3fb"/><path d="M0 44q30-5 60 0t60 0v76H0z" fill="#c9965f"/><path d="M0 44q30-5 60 0t60 0v8q-30 5-60 0t-60 0z" fill="#8a5f38"/>
    <g fill="none" stroke="#5fa544" stroke-width="3" stroke-linecap="round"><path d="M12 44q-2-10-6-14M16 44q1-12 6-17M94 44q-2-11-7-15M99 44q2-10 8-14M56 43q-1-8-4-11"/></g>
    <g fill="#b07f4b"><circle cx="18" cy="96" r="4"/><circle cx="100" cy="78" r="3.4"/><circle cx="88" cy="106" r="5"/><circle cx="30" cy="70" r="2.6"/></g>`,
  water: `<rect width="120" height="120" fill="#e9f6fc"/><path d="M0 30q10-4 20 0t20 0 20 0 20 0 20 0 20 0v90H0z" fill="#a4daee"/>
    <path d="M0 30q10-4 20 0t20 0 20 0 20 0 20 0 20 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="M0 110q30-8 60-2t60-4v16H0z" fill="#8fcbe2"/>`,
  // deep water: the pond bottom, for the creatures that live down there
  pond: `<rect width="120" height="120" fill="#a4daee"/><path d="M0 14q10-4 20 0t20 0 20 0 20 0 20 0 20 0V0H0z" fill="#e9f6fc"/>
    <path d="M0 14q10-4 20 0t20 0 20 0 20 0 20 0 20 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="M0 98q28-8 60-3t60-5v30H0z" fill="#d9c08a"/><g fill="#b9a06c" ${o(1.4)}><ellipse cx="22" cy="106" rx="9" ry="5"/><ellipse cx="96" cy="104" rx="8" ry="4.6"/></g>`,
};
const bubbles = (...at) => `<g fill="#ffffff99" stroke="#fff" stroke-width="1.4">${at.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
const reed = (x, h = 80) => `<path d="M${x} 120V${120 - h}" stroke="#5fa544" stroke-width="4" stroke-linecap="round"/><path d="M${x} ${128 - h}q-9-4-13-14q11 1 13 9" fill="#7cc35a" ${o(1.6)}/>`;
const eye = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${o(1.6)}/><circle cx="${x + r * 0.2}" cy="${y + r * 0.1}" r="${r * 0.5}" fill="${INK}"/>`;

// ---------------------------------------------------------------------------------------------- creatures
/** A grasshopper facing right, drawn in a 100 x 80 box. wings: 0 none (small nymph), 1 buds (big nymph), 2 full. */
function hopper(wings) {
  const G = '#8cc84f', D = '#6aa93a', P = '#d8eb9c';
  return `<g>
    <path d="M52 55L58 72l8 2M66 54l8 16 8 1" fill="none" ${o(2.6)}/>
    <path d="M12 52C16 40 44 34 66 38c9 2 10 12 3 15-18 7-44 8-57-1z" fill="${G}" ${O}/>
    <path d="M22 50q3 5 0 8M31 48q3 6 0 11M40 46q3 7 0 13" fill="none" ${o(1.5)}/>
    ${wings === 2 ? `<path d="M64 37C46 30 20 36 3 49c20 4 44 1 61-7z" fill="${P}" ${O}/><path d="M56 39C42 37 26 40 12 47" fill="none" ${o(1.3)}/>` : ''}
    ${wings === 1 ? `<path d="M60 37c-9-4-18-2-24 4 9 3 18 2 24-2z" fill="${P}" ${O}/>` : ''}
    <path d="M40 50C34 34 26 22 18 16c-3 6 4 24 12 38z" fill="${D}" ${O}/>
    <path d="M18 16L8 72l-7 3" fill="none" ${o(2.8)}/>
    <path d="M64 34c10-4 20 2 20 12s-6 16-14 14c-6-2-9-9-8-17z" fill="${G}" ${O}/>
    ${eye(77, 42, 4.4)}
    <path d="M76 55q4 2 7-1" fill="none" ${o(1.6)}/>
    <path d="M74 33C76 20 84 12 96 8M79 34C84 24 92 20 99 19" fill="none" ${o(1.8)}/>
  </g>`;
}
const grass = `<path d="M0 96q30-6 60-2t60-4v30H0z" fill="#bfe08f"/>
  <g fill="none" stroke="#5fa544" stroke-width="3.4" stroke-linecap="round"><path d="M8 118Q10 80 22 62M26 118Q22 92 12 80M104 118Q102 84 112 66M92 118Q96 96 88 84"/></g>`;

/** A sitting frog seen from the front, in a 120 x 100 box. tail: a froglet still has a little one. */
function frog(tail) {
  const G = '#6cc24a', D = '#4fa238', B = '#eef7c4';
  return `<g>
    ${tail ? `<path d="M92 66c18-8 36-2 46 12-14 8-34 6-46-4z" fill="#8a7862" ${O}/>` : ''}
    <ellipse cx="27" cy="78" rx="15" ry="11" transform="rotate(-24 27 78)" fill="${D}" ${O}/><ellipse cx="93" cy="78" rx="15" ry="11" transform="rotate(24 93 78)" fill="${D}" ${O}/>
    <path d="M14 88h20M106 88H86" fill="none" stroke="${D}" stroke-width="7" stroke-linecap="round"/><path d="M12 91h22M108 91H86" fill="none" ${o(2)}/>
    <path d="M60 30c22 0 34 16 34 32S80 90 60 90 26 78 26 62s12-32 34-32z" fill="${G}" ${O}/>
    <ellipse cx="60" cy="72" rx="20" ry="14" fill="${B}"/>
    <circle cx="42" cy="32" r="12" fill="${G}" ${O}/><circle cx="78" cy="32" r="12" fill="${G}" ${O}/>
    ${eye(42, 31, 7)}${eye(78, 31, 7)}
    <path d="M40 52q20 14 40 0" fill="none" ${o(2.4)}/>
    <path d="M46 78v12m-5 0h10M74 78v12m-5 0h10" fill="none" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
    <path d="M41 93h10M69 93h10" fill="none" ${o(2)}/>
    <circle cx="33" cy="50" r="3" fill="#f6a5a0" opacity=".7"/><circle cx="87" cy="50" r="3" fill="#f6a5a0" opacity=".7"/>
  </g>`;
}
const lily = (x, y, rx = 46) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.26}" fill="#57b05a" ${O}/><path d="M${x} ${y}l${rx * 0.7} ${-rx * 0.1}" fill="none" ${o(1.4)}/>`;

/** A tadpole facing left in a 110 x 60 box. legs: 0 none, 1 back legs (and front buds). */
function tadpole(legs, body = '#57493c') {
  return `<g>
    <path d="M52 30C70 14 86 44 108 24c-6 22-30 26-56 14z" fill="#8a7862" ${O}/>
    ${legs ? `<path d="M50 42l10 10-3 6M46 44l-2 12 5 4" fill="none" ${o(3)}/><path d="M26 44l-4 8" fill="none" ${o(2.6)}/>` : ''}
    <ellipse cx="34" cy="30" rx="24" ry="17" fill="${body}" ${O}/>
    <ellipse cx="34" cy="37" rx="14" ry="7" fill="#ffffff26"/>
    ${eye(22, 25, 5)}
    <path d="M14 35q4 4 9 2" fill="none" stroke="#f3e6d0" stroke-width="1.8" stroke-linecap="round"/>
  </g>`;
}

const ART = {
  // ---- butterfly
  'butterfly.egg': ['leaf', `
    <path d="M10 96C14 44 64 14 110 16c2 46-32 92-100 80z" fill="#7cc35a" ${O}/>
    <path d="M10 96C42 70 78 42 110 16M40 73l-4-20M40 73l20 4M62 54l-3-20M62 54l22 3M84 36l-2-12" fill="none" stroke="#4f9a3c" stroke-width="2" stroke-linecap="round"/>
    <g fill="#fff6c2" ${o(1.7)}><ellipse cx="50" cy="52" rx="5" ry="6"/><ellipse cx="62" cy="46" rx="5" ry="6"/><ellipse cx="74" cy="42" rx="5" ry="6"/><ellipse cx="56" cy="64" rx="5" ry="6"/><ellipse cx="68" cy="58" rx="5" ry="6"/><ellipse cx="80" cy="54" rx="5" ry="6"/><ellipse cx="70" cy="70" rx="5" ry="6"/></g>
    <g fill="#fff" opacity=".9"><circle cx="48.500" cy="50" r="1.4"/><circle cx="60.500" cy="44" r="1.4"/><circle cx="72.500" cy="40" r="1.4"/><circle cx="54.500" cy="62" r="1.4"/><circle cx="66.500" cy="56" r="1.4"/><circle cx="78.500" cy="52" r="1.4"/><circle cx="68.500" cy="68" r="1.4"/></g>`],
  'butterfly.caterpillar': ['leaf', `
    <path d="M4 92C24 62 84 58 116 78c-22 26-84 34-112 14z" fill="#7cc35a" ${O}/>
    <path d="M4 92C40 80 80 76 116 78" fill="none" stroke="#4f9a3c" stroke-width="2" stroke-linecap="round"/>
    <circle cx="104" cy="70" r="8" fill="#f1f8dc"/><circle cx="96" cy="62" r="6" fill="#f1f8dc"/>
    <path d="M22 74v8M34 70v9M47 68v9M60 68v9M73 70v9" fill="none" ${o(3)}/>
    <g ${O}><circle cx="20" cy="62" r="11" fill="#9bd657"/><circle cx="33" cy="57" r="12" fill="#f7dc4a"/><circle cx="47" cy="54" r="12.500" fill="#9bd657"/><circle cx="61" cy="55" r="12.500" fill="#f7dc4a"/><circle cx="74" cy="59" r="12" fill="#9bd657"/></g>
    <g fill="${INK}"><circle cx="20" cy="56" r="1.800"/><circle cx="33" cy="50" r="1.800"/><circle cx="47" cy="47" r="1.800"/><circle cx="61" cy="48" r="1.800"/><circle cx="74" cy="52" r="1.800"/></g>
    <circle cx="88" cy="56" r="12" fill="#f08a3c" ${O}/>
    ${eye(92, 53, 4)}
    <path d="M87 62q4 3 8 0" fill="none" ${o(1.6)}/>
    <path d="M84 45q-3-8-8-10M92 44q1-8 6-11" fill="none" ${o(1.8)}/>`],
  'butterfly.chrysalis': ['leaf', `
    <path d="M0 22Q60 10 120 20" fill="none" stroke="#9a6a3c" stroke-width="7" stroke-linecap="round"/>
    <path d="M26 20c-2-12 6-18 18-18 0 10-6 18-18 18z" fill="#7cc35a" ${O}/><path d="M92 19c8 8 18 8 26 2-6-8-18-10-26-2z" fill="#7cc35a" ${O}/>
    <path d="M60 18v10" fill="none" ${o(2.4)}/>
    <path d="M60 26c18 2 26 26 18 48-4 12-10 26-18 30-8-4-14-18-18-30-8-22 0-46 18-48z" fill="#9fd66e" ${O}/>
    <path d="M45 46q15 7 30 0" fill="none" ${o(1.6)}/>
    <g fill="#ffd23f" ${o(1)}><circle cx="48" cy="40" r="2.600"/><circle cx="56" cy="42.500" r="2.600"/><circle cx="64" cy="42.500" r="2.600"/><circle cx="72" cy="40" r="2.600"/></g>
    <path d="M46 62q14 8 28 0M50 76q10 6 20 0M55 89q5 3 10 0" fill="none" stroke="#6aa93a" stroke-width="2" stroke-linecap="round"/>
    <path d="M52 34q-5 8-5 18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`],
  'butterfly.adult': ['air', `
    <g><path d="M58 58C44 20 14 10 8 34c-4 16 20 30 50 30z" fill="#f08a3c" ${O}/>
    <path d="M58 64C38 62 18 76 26 96c8 14 28 2 32-24z" fill="#ffc04d" ${O}/>
    <circle cx="20" cy="34" r="5" fill="#fff" ${o(1.4)}/><circle cx="34" cy="26" r="3.400" fill="#fff" ${o(1.4)}/><circle cx="36" cy="84" r="4.400" fill="#f08a3c" ${o(1.4)}/>
    <path d="M56 58C42 50 30 46 20 46M56 66C46 70 38 78 34 86" fill="none" ${o(1.4)}/></g>
    <g transform="translate(120 0) scale(-1 1)"><path d="M58 58C44 20 14 10 8 34c-4 16 20 30 50 30z" fill="#f08a3c" ${O}/>
    <path d="M58 64C38 62 18 76 26 96c8 14 28 2 32-24z" fill="#ffc04d" ${O}/>
    <circle cx="20" cy="34" r="5" fill="#fff" ${o(1.4)}/><circle cx="34" cy="26" r="3.400" fill="#fff" ${o(1.4)}/><circle cx="36" cy="84" r="4.400" fill="#f08a3c" ${o(1.4)}/>
    <path d="M56 58C42 50 30 46 20 46M56 66C46 70 38 78 34 86" fill="none" ${o(1.4)}/></g>
    <path d="M57 42Q50 28 44 24M63 42Q70 28 76 24" fill="none" ${o(1.8)}/><circle cx="44" cy="24" r="2" fill="${INK}"/><circle cx="76" cy="24" r="2" fill="${INK}"/>
    <ellipse cx="60" cy="66" rx="5" ry="22" fill="#7a5230" ${O}/><circle cx="60" cy="44" r="6.500" fill="#7a5230" ${O}/>
    <circle cx="57.500" cy="43" r="1.500" fill="#fff"/><circle cx="62.500" cy="43" r="1.500" fill="#fff"/>`],

  // ---- mosquito
  'mosquito.raft': ['water', `
    ${reed(104, 96)}
    <ellipse cx="54" cy="33" rx="40" ry="5" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/>
    <path d="M24 30q30 16 60 0l-4-6H28z" fill="#7a5a3a" ${O}/>
    <g fill="#a9825a" ${o(1.3)}>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<rect x="${29 + i * 5.6}" y="${17 - Math.sin(i / 8 * Math.PI) * 3}" width="5" height="13" rx="2.500"/>`).join('')}</g>
    <g fill="#c9a880" ${o(1.1)}>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle cx="${34 + i * 5.6}" cy="${16 - Math.sin((i + 0.5) / 8 * Math.PI) * 3}" r="2.300"/>`).join('')}</g>
    ${bubbles([30, 70, 3], [84, 84, 4], [58, 96, 2.4])}`],
  'mosquito.wriggler': ['water', `
    ${reed(12, 70)}
    <ellipse cx="82" cy="30" rx="12" ry="3" fill="none" stroke="#fff" stroke-width="2"/>
    <path d="M70 52L82 31" fill="none" stroke="${INK}" stroke-width="8.500" stroke-linecap="round"/><path d="M70 52L82 31" fill="none" stroke="#e2b877" stroke-width="4.500" stroke-linecap="round"/>
    <g fill="#d9a968" ${O}><circle cx="68" cy="56" r="7"/><circle cx="62" cy="64" r="7.600"/><circle cx="56" cy="72" r="8.200"/><circle cx="50" cy="80" r="8.800"/></g>
    <path d="M74 60l10 6M78 54l10 2" fill="none" ${o(1.5)}/>
    <ellipse cx="41" cy="90" rx="14" ry="12" fill="#c98f4c" ${O}/>
    <path d="M30 82l-9-6M28 90l-11-1M32 99l-8 7M52 99l5 8" fill="none" ${o(1.5)}/>
    <circle cx="33" cy="104" r="8.500" fill="#d9a968" ${O}/>
    ${eye(30, 104, 3.2)}<path d="M33 110q3 1 5-1" fill="none" ${o(1.3)}/>
    ${bubbles([92, 56, 2.6], [98, 78, 3.6])}`],
  'mosquito.tumbler': ['water', `
    ${reed(108, 64)}
    <ellipse cx="50" cy="30" rx="16" ry="3" fill="none" stroke="#fff" stroke-width="2"/>
    <path d="M42 40L40 30M56 40L58 30" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M42 40L40 31M56 40L58 31" fill="none" stroke="#e2b877" stroke-width="3.400" stroke-linecap="round"/>
    <path d="M62 62C84 66 92 86 78 98 68 106 54 100 54 90" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
    <path d="M62 62C84 66 92 86 78 98 68 106 54 100 54 90" fill="none" stroke="#d9a968" stroke-width="10.500" stroke-linecap="round"/>
    <path d="M78 70l5-5M84 82l7-2M76 97l4 6M64 100l-1 7" fill="none" ${o(1.4)}/>
    <ellipse cx="49" cy="58" rx="22" ry="20" fill="#c98f4c" ${O}/>
    <path d="M36 66q12 8 26 0" fill="none" stroke="#a87238" stroke-width="2" stroke-linecap="round"/>
    ${eye(40, 54, 4.6)}
    ${bubbles([22, 62, 3], [26, 90, 2.4])}`],
  'mosquito.adult': ['air', `
    <path d="M58 52C66 26 88 12 104 14c2 16-18 34-42 42z" fill="#ffffffd9" ${O}/><path d="M56 52C54 30 66 10 80 6c6 14-4 36-20 48z" fill="#ffffffd9" ${O}/>
    <path d="M62 50C74 36 88 24 100 18M59 48C62 34 70 20 78 12" fill="none" stroke="#b9c8d4" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M46 62L34 78l-8 20M54 64L50 84l-10 18M62 62L72 80l-2 22" fill="none" ${o(2)}/>
    <path d="M62 58c14 2 30 10 44 24-16 2-34-4-48-14z" fill="#b98a5e" ${O}/>
    <path d="M74 64l-5 10M84 69l-5 10M94 76l-4 8" fill="none" ${o(1.8)}/>
    <ellipse cx="52" cy="56" rx="13" ry="11" fill="#a87248" ${O}/>
    <circle cx="35" cy="50" r="9" fill="#b98a5e" ${O}/>
    ${eye(32, 48, 4.4)}
    <path d="M28 55L10 74" fill="none" ${o(2.6)}/>
    <path d="M32 42Q26 30 16 28M37 41Q36 30 28 22" fill="none" ${o(1.6)}/>`],

  // ---- grasshopper
  'grasshopper.eggs': ['soil', `
    <path d="M60 46v12" fill="none" stroke="#8a5f38" stroke-width="4" stroke-linecap="round"/>
    <path d="M38 62c6-10 40-10 46 0 8 16-6 44-22 46-18 0-32-28-24-46z" fill="#a9763f" ${O}/>
    <g fill="#fbeeb4" ${o(1.7)}><ellipse cx="50" cy="72" rx="4.600" ry="11" transform="rotate(-18 50 72)"/><ellipse cx="60" cy="70" rx="4.600" ry="11"/><ellipse cx="70" cy="72" rx="4.600" ry="11" transform="rotate(18 70 72)"/>
    <ellipse cx="54" cy="90" rx="4.600" ry="11" transform="rotate(-10 54 90)"/><ellipse cx="65" cy="90" rx="4.600" ry="11" transform="rotate(10 65 90)"/></g>`],
  'grasshopper.nymph': ['leaf', `<g transform="translate(30 46) scale(.6)">${hopper(0)}</g>`, grass],
  'grasshopper.bignymph': ['leaf', `<g transform="translate(20 34) scale(.8)">${hopper(1)}</g>`, grass],
  'grasshopper.adult': ['leaf', `<g transform="translate(6 16) scale(1.08)">${hopper(2)}</g>`, grass],

  // ---- frog
  'frog.spawn': ['water', `
    ${reed(100, 92)}
    <g fill="#ffffffb0" stroke="#6fb3d0" stroke-width="1.8">${[[36, 44, 10], [54, 40, 10], [72, 46, 10], [28, 60, 10], [46, 58, 11], [64, 60, 10], [80, 64, 9], [38, 76, 10], [57, 77, 10], [74, 80, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    <g fill="${INK}">${[[36, 44], [54, 40], [72, 46], [28, 60], [46, 58], [64, 60], [80, 64], [38, 76], [57, 77], [74, 80]].map(([x, y], i) => `<circle cx="${x + (i % 3) - 1}" cy="${y + (i % 2)}" r="3.400"/>`).join('')}</g>`],
  'frog.tadpole': ['water', `${reed(106, 60)}<g transform="translate(6 42)">${tadpole(0)}</g>${bubbles([20, 50, 2.6], [14, 40, 1.8])}`],
  'frog.legs': ['water', `${reed(106, 60)}<g transform="translate(6 40)">${tadpole(1, '#6c7a3e')}</g>${bubbles([20, 48, 2.6])}`],
  'frog.froglet': ['water', `<g transform="translate(12 22) scale(.64)">${frog(true)}</g>`, lily(60, 92, 50)],
  'frog.adult': ['water', `<g transform="translate(6 8) scale(.9)">${frog(false)}</g>`, lily(60, 100, 54)],

  // ---- dragonfly
  'dragonfly.eggs': ['pond', `
    <path d="M60 120C58 90 62 60 58 22" fill="none" stroke="#4f9a3c" stroke-width="5" stroke-linecap="round"/>
    <path d="M59 84C40 80 26 66 22 48c22 0 36 14 37 36z" fill="#7cc35a" ${O}/><path d="M60 62c16-4 30-16 34-32-20 0-33 12-34 32z" fill="#7cc35a" ${O}/>
    <g fill="#fff6c2" ${o(1.5)}><ellipse cx="34" cy="56" rx="3" ry="6" transform="rotate(-40 34 56)"/><ellipse cx="42" cy="62" rx="3" ry="6" transform="rotate(-40 42 62)"/><ellipse cx="50" cy="70" rx="3" ry="6" transform="rotate(-40 50 70)"/>
    <ellipse cx="70" cy="50" rx="3" ry="6" transform="rotate(40 70 50)"/><ellipse cx="78" cy="42" rx="3" ry="6" transform="rotate(40 78 42)"/><ellipse cx="85" cy="35" rx="3" ry="6" transform="rotate(40 85 35)"/></g>
    ${bubbles([92, 70, 3], [26, 86, 2.4], [98, 56, 1.8])}`],
  'dragonfly.nymph': ['pond', `
    <g transform="rotate(-62 60 62)">
    <path d="M52 44L32 34l-8 8M50 54L28 56l-6 10M52 64L34 78l-2 10M68 44L88 34l8 8M70 54L92 56l6 10M68 64L86 78l2 10" fill="none" ${o(2.4)}/>
    <path d="M60 52c12 0 16 14 14 28-2 12-8 22-14 26-6-4-12-14-14-26-2-14 2-28 14-28z" fill="#a8974e" ${O}/>
    <path d="M47 70h26M48 80h24M51 90h18" fill="none" stroke="#7d6f36" stroke-width="2" stroke-linecap="round"/>
    <path d="M56 104l-2 8M60 106v9M64 104l2 8" fill="none" ${o(2.2)}/>
    <ellipse cx="60" cy="48" rx="12" ry="10" fill="#b8a85c" ${O}/>
    <path d="M54 50c-4 6-4 14 0 20 3-6 4-14 0-20zM66 50c4 6 4 14 0 20-3-6-4-14 0-20z" fill="#d6c888" ${o(1.5)}/>
    <ellipse cx="60" cy="33" rx="13" ry="9" fill="#a8974e" ${O}/>
    ${eye(50, 31, 5)}${eye(70, 31, 5)}
    </g>${bubbles([98, 40, 3], [104, 26, 2])}`],
  'dragonfly.adult': ['air', `
    <g transform="rotate(-24 60 60)">
    <g fill="#ffffffd0" ${O}><path d="M58 46C40 30 14 28 4 36c8 12 34 18 54 14z"/><path d="M62 46c18-16 44-18 54-10-8 12-34 18-54 14z"/>
    <path d="M58 54C42 52 20 60 12 72c12 6 34 0 46-12z"/><path d="M62 54c16-2 38 6 46 18-12 6-34 0-46-12z"/></g>
    <path d="M56 46C40 38 22 34 8 36M64 46c16-8 34-12 48-10M56 56C42 58 26 64 16 72M64 56c14 2 30 8 40 16" fill="none" stroke="#b9c8d4" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M60 56c4 0 5 4 5 10l-2 44c0 4-6 4-6 0l-2-44c0-6 1-10 5-10z" fill="#e2574c" ${O}/>
    <path d="M56 70h8M56.500 80h7M57 90h6M57.500 100h5" fill="none" ${o(1.5)}/>
    <ellipse cx="60" cy="48" rx="9" ry="11" fill="#c9443c" ${O}/>
    <circle cx="60" cy="33" r="9" fill="#e2574c" ${O}/>
    ${eye(54, 31, 4.6)}${eye(66, 31, 4.6)}
    </g>`],
};

// the four homes, as pictures for the "Where does it live?" buttons
const HOME_ART = {
  water: ['water', `${reed(96, 84)}<path d="M20 62q8-6 16 0t16 0M44 86q8-6 16 0t16 0" fill="none" stroke="#fff" stroke-width="3.400" stroke-linecap="round"/>${bubbles([30, 92, 4], [70, 58, 3])}`],
  leaf: ['leaf', `<path d="M60 118C58 90 60 60 60 40" fill="none" stroke="#4f9a3c" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 92C36 92 16 76 12 52c26-2 46 14 48 40z" fill="#7cc35a" ${O}/><path d="M60 70c24 0 44-16 48-40-26-2-46 14-48 40z" fill="#8fd04f" ${O}/>
    <path d="M60 92C44 80 28 66 12 52M60 70c16-12 32-26 48-40" fill="none" stroke="#4f9a3c" stroke-width="2" stroke-linecap="round"/>`],
  soil: ['soil', `<path d="M40 70q10-8 20 0t20 0M30 94q10-8 20 0t20 0" fill="none" stroke="#8a5f38" stroke-width="3.400" stroke-linecap="round"/>`],
  air: ['air', `<circle cx="92" cy="60" r="13" fill="#ffd23f" ${o(2)}/><path d="M22 66q10-8 20 0M52 50q8-6 16 0" fill="none" ${o(2.2)}/>`],
};

// A card is [background, creature, props under the creature (grass, a lily pad)].
/** The inner SVG of a card (`animal.stage` or `home.<home>`), background included; '' for an unknown id. */
export function artOf(id) {
  const a = id.startsWith('home.') ? HOME_ART[id.slice(5)] : ART[id];
  return a ? BG[a[0]] + (a[2] || '') + a[1] : '';
}
/** Only the creature of a stage card (no background, no props): what crosses the board when its life is solved. */
export function creatureOf(id) {
  return ART[id]?.[1] || '';
}
/** A whole <svg> for a card. */
export function cardSvg(id, cls = '') {
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 120 120" aria-hidden="true">${artOf(id)}</svg>`;
}
export const ART_IDS = Object.keys(ART);
export const HOME_ART_IDS = Object.keys(HOME_ART).map(h => `home.${h}`);
