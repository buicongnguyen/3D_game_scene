// The dance game's performers (art/blender/build_performers.py, docs/PERFORMERS.md): who they are, their outfit looks,
// the skin tones and the body-shape controls a character studio can offer. Pure data (no three.js, no DOM), Node-readable;
// src/engine/wardrobe.js puts a look, a skin tone or a shape on a model.
//
// A performer's GLB holds a 'Body' mesh (head, face, hair, neck, hands) and one mesh per wardrobe part, named by slot:
// Top_*, Bottom_*, Shoes_*, Hat_*. A look shows the parts it lists (every other wardrobe part is hidden) and recolours
// materials by name ('Top', 'Top trim', 'Inner', 'Bottom', 'Bottom trim', 'Legwear', 'Shoes', 'Shoe sole', 'Hat',
// 'Hat trim', 'Hair accent'); what a look does not name keeps the colour the file was built with.
import { N_ } from '../i18n/i18n.js';

/** Skin tones for the 'Skin' material, fairest first (sRGB). The fairest is bright and warm, never grey. */
export const SKIN_TONES = [
  { id: 'porcelain', name: N_('Porcelain'), hex: '#fdd2bb' },
  { id: 'fair', name: N_('Fair'), hex: '#f8c4a6' },
  { id: 'light', name: N_('Light'), hex: '#efb68f' },
  { id: 'medium', name: N_('Medium'), hex: '#e3a274' },
  { id: 'tan', name: N_('Tan'), hex: '#c58556' },
  { id: 'brown', name: N_('Brown'), hex: '#9b6140' },
  { id: 'deep', name: N_('Deep'), hex: '#6b4029' },
];
export const SKIN = Object.fromEntries(SKIN_TONES.map(s => [s.id, s]));

/**
 * Body-shape morphs (shape keys on the body AND on every garment, so clothes follow). A control runs 0..1, 0.5 is the
 * shape as designed; the runtime sets influence = 2 * (v - 0.5) (wardrobe.js setShape). The ranges are modest by design.
 */
export const SHAPES = [
  { id: 'shape_build', name: N_('Build'), lo: N_('Slim'), hi: N_('Sturdy') },
  { id: 'shape_chest', name: N_('Chest') },
  { id: 'shape_waist', name: N_('Waist') },
  { id: 'shape_hips', name: N_('Hips') },
  { id: 'shape_thigh', name: N_('Thighs') },
  { id: 'shape_arm', name: N_('Arms') },
];
export const SHAPE_IDS = SHAPES.map(s => s.id);

/**
 * Proportion controls (bone transforms per instance; the performers' clips key only rotations and the hips' position,
 * so a clip never undoes them). [min, max, default].
 */
export const PROPORTIONS = {
  height: [0.94, 1.06, 1],       // the whole figure (root bone scale)
  head: [0.9, 1.1, 1],           // head bone scale
  neck: [0.85, 1.2, 1],          // neck bone scale, the head scaled back by the same amount
  shoulders: [-0.015, 0.015, 0], // metres each shoulder joint moves out (+) or in (-)
  arms: [0.94, 1.06, 1],         // upper arm scale, the hand scaled back
  legs: [0.94, 1.08, 1],         // thigh scale, the foot scaled back; the figure is lifted so the feet stay on the ground
};

const look = (id, name, parts, tint) => ({ id, name, parts, tint, swatch: tint.Top || tint.Bottom });

export const PERFORMERS = {
  nabi: {
    name: N_('Nabi'), role: N_('Dancer'), body: 'f', skin: 'fair', defaultLook: 'stage',
    looks: [
      look('stage', N_('Stage jacket'), ['Top_crop', 'Bottom_skirtS', 'Shoes_sneakers'],
        { Top: '#ff4f9a', 'Top trim': '#f6c344', Inner: '#fffaf4', Bottom: '#8f73ff', 'Bottom trim': '#f6c344', Legwear: '#2e3566', Shoes: '#fffaf6', 'Shoe sole': '#ff7ab4', 'Hair accent': '#ff4f9a' }),
      look('street', N_('Street style'), ['Top_long', 'Bottom_trousers', 'Shoes_sneakers'],
        { Top: '#4fb6ff', 'Top trim': '#ffffff', Bottom: '#fff1d6', 'Bottom trim': '#ffd45a', Shoes: '#ffffff', 'Shoe sole': '#4fb6ff', 'Hair accent': '#4fb6ff' }),
      look('gala', N_('Long skirt'), ['Top_crop', 'Bottom_skirtL', 'Shoes_flats'],
        { Top: '#ffffff', 'Top trim': '#f6c344', Inner: '#ffd3e4', Bottom: '#ff6f61', 'Bottom trim': '#f6c344', Legwear: '#f3cdb8', Shoes: '#f6c344', 'Shoe sole': '#c9922e', 'Hair accent': '#f6c344' }),
    ],
  },
  haru: {
    name: N_('Haru'), role: N_('Dancer'), body: 'm', skin: 'fair', defaultLook: 'stage',
    looks: [
      look('stage', N_('Stage jacket'), ['Top_jacket', 'Bottom_trousers', 'Shoes_sneakers', 'Hat_cap'],
        { Top: '#2f6bff', 'Top trim': '#dfe7f2', Inner: '#fbfbfb', Bottom: '#2c3040', 'Bottom trim': '#dfe7f2', Shoes: '#fbfbfb', 'Shoe sole': '#2f6bff', Hat: '#2c3040', 'Hat trim': '#dfe7f2' }),
      look('street', N_('Street style'), ['Top_long', 'Bottom_trousers', 'Shoes_sneakers'],
        { Top: '#ff9f2e', 'Top trim': '#ffffff', Bottom: '#e9e1cf', 'Bottom trim': '#ff9f2e', Shoes: '#ffffff', 'Shoe sole': '#2c3040' }),
      look('smart', N_('Long coat'), ['Top_coat', 'Bottom_trousers', 'Shoes_boots'],
        { Top: '#d9b98a', 'Top trim': '#6b4a2a', Inner: '#ffffff', Bottom: '#2c3040', 'Bottom trim': '#6b4a2a', Shoes: '#5a3a24', 'Shoe sole': '#2a1d17' }),
    ],
  },
  byeol: {
    name: N_('Byeol'), role: N_('Singer'), body: 'f', skin: 'porcelain', defaultLook: 'concert',
    looks: [
      look('concert', N_('Long coat'), ['Top_coat', 'Bottom_skirtL', 'Shoes_boots'],
        { Top: '#5bb8ff', 'Top trim': '#eef2f8', Inner: '#fffaf6', Bottom: '#c58cff', 'Bottom trim': '#eef2f8', Legwear: '#f6e6ef', Shoes: '#fdfdfd', 'Shoe sole': '#c9d3e0' }),
      look('pop', N_('Bright and short'), ['Top_long', 'Bottom_skirtS', 'Shoes_boots'],
        { Top: '#ffd25e', 'Top trim': '#ffffff', Bottom: '#ff7ab4', 'Bottom trim': '#ffffff', Legwear: '#ffffff', Shoes: '#ffffff', 'Shoe sole': '#ffd25e' }),
      look('sweet', N_('Jacket and trousers'), ['Top_crop', 'Bottom_trousers', 'Shoes_flats'],
        { Top: '#b48cff', 'Top trim': '#ffffff', Inner: '#fff3f8', Bottom: '#ffffff', 'Bottom trim': '#b48cff', Shoes: '#b48cff', 'Shoe sole': '#ffffff' }),
    ],
  },
  hoa: {
    name: N_('Hoa'), role: N_('Dance teacher'), body: 'f', skin: 'light', defaultLook: 'aodai',
    looks: [
      look('aodai', N_('Red ao dai'), ['Top_aodai', 'Bottom_trousers', 'Shoes_flats'],
        { Top: '#e8473e', 'Top trim': '#f2c14e', Bottom: '#fffaf0', 'Bottom trim': '#f2c14e', Shoes: '#e8473e', 'Shoe sole': '#f2c14e', 'Hair accent': '#ff8fb1' }),
      look('aodai2', N_('Blue ao dai'), ['Top_aodai', 'Bottom_trousers', 'Shoes_flats'],
        { Top: '#3f7fe0', 'Top trim': '#f2c14e', Bottom: '#fffaf0', 'Bottom trim': '#f2c14e', Shoes: '#3f7fe0', 'Shoe sole': '#f2c14e', 'Hair accent': '#ffd25e' }),
      look('casual', N_('Village day'), ['Top_long', 'Bottom_skirtL', 'Shoes_flats'],
        { Top: '#fff3e0', 'Top trim': '#e8473e', Bottom: '#2fae8f', 'Bottom trim': '#f2c14e', Legwear: '#f4dccc', Shoes: '#e8473e', 'Shoe sole': '#f2c14e', 'Hair accent': '#ff8fb1' }),
    ],
  },
};

/** The performer's row, or null. */
export const performer = id => PERFORMERS[id] || null;
/** Look ids of a performer, in the order the wardrobe card shows them. */
export const lookIds = id => (PERFORMERS[id]?.looks || []).map(l => l.id);
/** A look (its id, or the performer's default when the id is unknown). */
export function lookOf(id, lookId) {
  const p = PERFORMERS[id];
  if (!p) return null;
  return p.looks.find(l => l.id === lookId) || p.looks.find(l => l.id === p.defaultLook) || p.looks[0];
}
/** A saved look id kept only when it is one of the performer's looks. */
export const cleanLook = (id, lookId) => (lookIds(id).includes(lookId) ? lookId : null);
/** Clamp a proportion control into its range. */
export function clampProportion(key, v) {
  const r = PROPORTIONS[key];
  if (!r || !Number.isFinite(v)) return r ? r[2] : 1;
  return Math.min(r[1], Math.max(r[0], v));
}
