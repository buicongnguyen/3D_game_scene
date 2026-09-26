// Seasons and time of day: pure data + interpolation (no three.js). Colours are sRGB hex.
// Art direction: vivid and warm by day; nights are deep blue with black-blue water, and the
// colour lives in the lamps and lanterns rather than in a pink afterglow.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const PALETTES = {
  spring: {
    grass: ['#5db53a', '#8ec84a', '#3d9636'], dirt: '#c08f58', sand: '#d5bf8f', rock: '#a29a8e', forest: '#4f7f2c',
    leaves: '#7cc646', needles: '#3c7f3a', maple: '#98d04c', blossom: '#ffadc9', peachLeaves: '#6cbc42',
    snow: 0, grassDensity: 1, bareTrees: false, particles: 'petals',
    sky: { zenith: '#2f86ea', horizon: '#bfe5ff' }, fog: '#b9dcff', sunTint: '#fff1d8',
  },
  summer: {
    grass: ['#48a837', '#72bd40', '#2d8633'], dirt: '#b98552', sand: '#d8c28e', rock: '#a0978a', forest: '#3d7229',
    leaves: '#3f9e38', needles: '#2f7436', maple: '#52ad3c', blossom: '#5fae3e', peachLeaves: '#4aa83a',
    snow: 0, grassDensity: 1.15, bareTrees: false, particles: 'fireflies',
    sky: { zenith: '#1f7ae8', horizon: '#a6dbff' }, fog: '#aad6ff', sunTint: '#fff4dd',
  },
  autumn: {
    grass: ['#b8b04a', '#d6a442', '#8f9c3b'], dirt: '#ad774a', sand: '#dcc088', rock: '#9c9184', forest: '#8a6a2e',
    leaves: '#ee9a2a', needles: '#3b6c35', maple: '#e23b28', blossom: '#e8672c', peachLeaves: '#d9a232',
    snow: 0, grassDensity: 0.85, bareTrees: false, particles: 'leaves',
    sky: { zenith: '#2f7fd8', horizon: '#ffdcab' }, fog: '#f2d9b8', sunTint: '#ffe3b4',
  },
  winter: {
    grass: ['#eef3fa', '#e3ebf6', '#d6e2f0'], dirt: '#9c8a78', sand: '#d9d6cc', rock: '#8f8c88', forest: '#e8eef7',
    leaves: '#3f6a44', needles: '#2c5a3a', maple: '#3f6a44', blossom: '#3f6a44', peachLeaves: '#3f6a44',
    snow: 1, grassDensity: 0, bareTrees: true, particles: 'snow',
    sky: { zenith: '#4d8fdc', horizon: '#dcecff' }, fog: '#d8e8fb', sunTint: '#fff2e6',
  },
};

// Time-of-day keys (hour -> look). Sky/fog colours are multiplied with the season sky by weight `seasonSky`.
const KEYS = [
  { h: 0, zenith: '#050b1f', horizon: '#0f1f45', fog: '#0d1a38', sun: '#9fb8ff', sunI: 0.55, hemi: 0.3, env: 0.22, stars: 1, seasonSky: 0, night: 1 },
  { h: 4.8, zenith: '#060d24', horizon: '#14264f', fog: '#122347', sun: '#9fb8ff', sunI: 0.5, hemi: 0.3, env: 0.18, stars: 1, seasonSky: 0, night: 1 },
  { h: 6.0, zenith: '#2a55a8', horizon: '#ffb07a', fog: '#e9b08a', sun: '#ffb27a', sunI: 1.2, hemi: 0.45, env: 0.4, stars: 0.2, seasonSky: 0.2, night: 0.35 },
  { h: 7.5, zenith: '#3b86e6', horizon: '#ffe0bb', fog: '#f4dcc0', sun: '#ffd9a8', sunI: 2.6, hemi: 0.8, env: 0.7, stars: 0, seasonSky: 0.7, night: 0 },
  { h: 10, zenith: '#ffffff', horizon: '#ffffff', fog: '#ffffff', sun: '#ffffff', sunI: 3.3, hemi: 1.0, env: 0.85, stars: 0, seasonSky: 1, night: 0 },
  { h: 15, zenith: '#ffffff', horizon: '#ffffff', fog: '#ffffff', sun: '#ffffff', sunI: 3.3, hemi: 1.0, env: 0.85, stars: 0, seasonSky: 1, night: 0 },
  { h: 17.2, zenith: '#3a7fe0', horizon: '#ffd08c', fog: '#f7cf98', sun: '#ffc27a', sunI: 3.0, hemi: 0.85, env: 0.75, stars: 0, seasonSky: 0.55, night: 0 },
  { h: 18.4, zenith: '#2b5cb8', horizon: '#ff9a52', fog: '#e59a66', sun: '#ff9448', sunI: 2.0, hemi: 0.6, env: 0.5, stars: 0.05, seasonSky: 0.15, night: 0.2 },
  { h: 19.3, zenith: '#132c66', horizon: '#3b4f8a', fog: '#2a3a6a', sun: '#8aa4ff', sunI: 0.5, hemi: 0.32, env: 0.28, stars: 0.6, seasonSky: 0, night: 0.8 },
  { h: 20.5, zenith: '#050b1f', horizon: '#0f1f45', fog: '#0d1a38', sun: '#9fb8ff', sunI: 0.55, hemi: 0.3, env: 0.22, stars: 1, seasonSky: 0, night: 1 },
  { h: 24, zenith: '#050b1f', horizon: '#0f1f45', fog: '#0d1a38', sun: '#9fb8ff', sunI: 0.55, hemi: 0.3, env: 0.22, stars: 1, seasonSky: 0, night: 1 },
];

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mul = (a, b) => a.map((v, i) => v * b[i]);

/** Unit vector toward the sun (y up): rises in the east (+x), crosses the south (+z) at noon, sets west. */
export function sunDirection(hour, season = 'summer') {
  const maxElev = ({ spring: 52, summer: 64, autumn: 44, winter: 30 }[season] ?? 55) * Math.PI / 180;
  const a = ((hour - 5.6) / 13.4) * Math.PI;
  const e = Math.sin(Math.min(Math.max(a, -0.3), Math.PI + 0.3)) * maxElev;
  const c = Math.cos(e);
  return { x: Math.cos(a) * c, y: Math.sin(e), z: Math.sin(a) * c * 0.8 + 0.2 * c };
}

/**
 * Complete lighting state for (season, hour). Colours returned as linear-ish RGB arrays in 0..1
 * sRGB space (the runtime converts). `night` is 0 by day and 1 at night.
 */
export function lightingAt(season, hour) {
  hour = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (hour - a.h) / (b.h - a.h || 1);
  const s = t * t * (3 - 2 * t);
  const p = PALETTES[season];
  const pick = k => mix(hexToRgb(a[k]), hexToRgb(b[k]), s);
  const num = k => a[k] + (b[k] - a[k]) * s;
  const seasonSky = num('seasonSky');
  // Daytime keys defer to the season's own sky; dawn, dusk and night keys are absolute colours.
  const blend = (abs, seasonal) => mix(abs, seasonal, seasonSky);
  const zenith = blend(pick('zenith'), hexToRgb(p.sky.zenith));
  const horizon = blend(pick('horizon'), hexToRgb(p.sky.horizon));
  const fog = blend(pick('fog'), hexToRgb(p.fog));
  const sunColor = mul(pick('sun'), num('night') > 0.5 ? [1, 1, 1] : hexToRgb(p.sunTint));
  const winterDim = season === 'winter' ? 0.9 : 1;
  const dir = sunDirection(hour, season);
  const night = num('night');
  // At night the key light is the moon, placed high in the south-west.
  const light = night > 0.5 ? { x: -0.45, y: 0.72, z: 0.52 } : dir;
  return {
    hour, season, night, zenith, horizon, fog, sunColor,
    sunIntensity: num('sunI') * winterDim, hemi: num('hemi'), env: num('env'), stars: num('stars'),
    sunDir: dir, lightDir: light,
  };
}

/** Human label for the HUD clock. */
export function clockLabel(hour) {
  const h = Math.floor(((hour % 24) + 24) % 24), m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
