import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { tx, getLang, onLangChange } from '../i18n/i18n.js';
import { storyId } from '../game/stories/index.js';
import { SIGNS, BOARD, signPlace, signFor } from '../content/signs.js';
import { DOOR_SPOTS } from './interiors.js';

/*
 * Name boards (content/signs.js): a wooden board at every building saying what it is. All the board faces are cells of
 * ONE canvas texture, and the posts and frames take their wood colour from the same texture, so the boards of a whole
 * village are a single mesh and a single draw call. The texture is repainted (never per frame) when the language or
 * the story changes and once the web fonts have arrived. At night the faces glow softly (emissive, no lights).
 */

const CELL_W = 384, CELL_H = 128, COLS = 5, ROWS = 8;       // 40 cells in a 2048 x 1024 canvas; the last row is wood
const TEX_W = 2048, TEX_H = 1024;
const SWATCH_Y = (ROWS - 1) * CELL_H + CELL_H / 2;
// flat colour swatches in the last row: [x in px, colour]
const SWATCH = { wood: [200, '#8b5a33'], dark: [600, '#6b4222'], light: [1000, '#b9824a'], lantern: [1400, '#ff9a3c'] };
const FACE = '#f1dfb6', LINE = '#c79c5c', INK = '#3b1f0b', INK_SUB = '#7a4a20';
const CLUSTER = 60;                                           // boards within this many metres share a mesh

// rounded, friendly faces per script, the same families the menus use (ui/style.css, i18n.js)
const FONTS = {
  en: ['Fredoka', 'Nunito'], vi: ['Baloo 2', 'Nunito'], ko: ['Jua', 'Gothic A1'], ja: ['Zen Maru Gothic', 'Nunito'],
};
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
const fontOf = (px, lang, weight = 700) => `${weight} ${px}px ${(FONTS[lang] || FONTS.en).map(f => `"${f}"`).join(', ')}, system-ui, sans-serif`;

let emojiOk = null;
/** Does this device paint colour emoji? (Without an emoji font a pictogram would be an empty box: leave it out.) */
function hasEmoji() {
  if (emojiOk !== null) return emojiOk;
  emojiOk = false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `30px ${EMOJI}`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText('🍙', 20, 22);
    const d = g.getImageData(0, 0, 40, 40).data;
    let ink = 0, colour = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      ink++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24 || d[i] > 200) colour++;
    }
    emojiOk = ink > 60 && colour > 20;
  } catch { /* no canvas: no pictograms */ }
  return emojiOk;
}

/** Largest font size (from `start` down to `min`) at which every line fits `width`. */
function fit(g, lines, width, start, min, lang) {
  let px = start;
  for (; px > min; px -= 2) {
    g.font = fontOf(px, lang);
    if (lines.every(l => g.measureText(l).width <= width)) break;
  }
  g.font = fontOf(px, lang);
  return px;
}

/**
 * Split a long name into the two most even lines: at a space, or, for Japanese (written without spaces), after a
 * particle (の, と, や, ・, &) when one sits near the middle, else at the middle character. Null when it cannot be split.
 */
export function twoLines(text) {
  const words = text.split(' ');
  if (words.length < 2) {
    const ch = [...text];
    if (ch.length < 6 || !/[぀-ヿ一-鿿]/.test(text)) return null;
    let cut = Math.ceil(ch.length / 2), best = Infinity;
    ch.forEach((c, i) => {
      const off = Math.abs(i + 1 - ch.length / 2);
      if ('のとや・&＆'.includes(c) && i > 0 && i < ch.length - 2 && off <= ch.length / 4 && off < best) { best = off; cut = i + 1; }
    });
    return [ch.slice(0, cut).join(''), ch.slice(cut).join('')];
  }
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const worst = Math.max(a.length, b.length);
    if (!best || worst < best.worst) best = { worst, lines: [a, b] };
  }
  return best.lines;
}

/** Paint one board face into its cell: cream paper, a thin line border, a pictogram and the (shrunk-to-fit) name. */
export function paintFace(g, x, y, text, sub, icon, lang) {
  g.fillStyle = FACE;
  g.fillRect(x, y, CELL_W, CELL_H);
  g.strokeStyle = LINE;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect?.(x + 9, y + 9, CELL_W - 18, CELL_H - 18, 14);
  if (!g.roundRect) g.rect(x + 9, y + 9, CELL_W - 18, CELL_H - 18);
  g.stroke();
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  let left = x + 20;
  if (icon && hasEmoji()) {
    g.font = `60px ${EMOJI}`;
    g.fillStyle = '#000';
    g.fillText(icon, x + 54, y + CELL_H / 2 + 4);
    left = x + 94;
  }
  const right = x + CELL_W - 18, width = right - left, cx = (left + right) / 2;
  g.fillStyle = INK;
  if (sub) {
    fit(g, [text], width, 60, 22, lang);
    g.fillText(text, cx, y + 47);
    g.fillStyle = INK_SUB;
    fit(g, [sub], width, 34, 16, lang);
    g.fillText(sub, cx, y + 97);
    return;
  }
  const one = fit(g, [text], width, 76, 22, lang);
  const split = one < 56 ? twoLines(text) : null;
  // two lines only when they come out clearly larger than the one line would be
  if (split && fit(g, split, width, 54, 20, lang) > one * 0.9) {
    g.fillText(split[0], cx, y + 40);
    g.fillText(split[1], cx, y + 92);
    return;
  }
  fit(g, [text], width, 76, 22, lang);
  g.fillText(text, cx, y + CELL_H / 2 + 2);
}

const swatchUv = name => [SWATCH[name][0] / TEX_W, 1 - SWATCH_Y / TEX_H];

/** A box painted with one flat swatch colour. `glow` scales the night glow of that part. */
function box(w, h, d, x, y, z, swatch, glow = 0.15) {
  const b = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const [u, v] = swatchUv(swatch), uv = b.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  b.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(uv.count).fill(glow), 1));
  return b;
}

/** The two faces of a board (front looks along +Z, the back is the same text for people on the other side). */
function faces(w, h, y, cell, glow) {
  const col = cell % COLS, row = Math.floor(cell / COLS);
  const u0 = (col * CELL_W) / TEX_W, u1 = ((col + 1) * CELL_W) / TEX_W, v1 = 1 - (row * CELL_H) / TEX_H, v0 = 1 - ((row + 1) * CELL_H) / TEX_H;
  return [0, Math.PI].map(turn => {
    const p = new THREE.PlaneGeometry(w, h);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
    p.translate(0, y, 0.036);
    if (turn) p.rotateY(turn);
    p.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(uv.count).fill(glow), 1));
    return p;
  });
}

/** One board's geometry in its own space: stands on y = 0 at the origin, front face looking along +Z. */
function boardGeometry(sign, cell) {
  const [w, h] = BOARD[sign.kind] || BOARD.home;
  const glow = sign.kind === 'shop' ? 1.7 : 1;
  const parts = [];
  if (sign.mount === 'hang') {
    // a tall post on the +X side, an arm over the path side, the board hanging from two straps, a little shop lantern
    const top = 3.12, cy = top - 0.2 - h / 2, px = w / 2 + 0.36;
    parts.push(box(0.15, top + 0.5, 0.15, px, (top + 0.5) / 2 - 0.3, 0, 'wood'));
    parts.push(box(0.22, 0.07, 0.22, px, top + 0.23, 0, 'dark'));
    parts.push(box(w + 0.9, 0.11, 0.11, 0.05, top, 0, 'wood'));
    parts.push(box(0.09, 0.62, 0.09, px - 0.3, top - 0.34, 0, 'wood'));
    for (const sx of [-1, 1]) parts.push(box(0.035, 0.2, 0.035, sx * w * 0.36, top - 0.13, 0, 'dark'));
    parts.push(box(w + 0.1, h + 0.1, 0.06, 0, cy, 0, 'dark'));
    parts.push(...faces(w, h, cy, cell, glow));
    parts.push(box(0.03, 0.16, 0.03, -w / 2 - 0.26, top - 0.12, 0, 'dark'));
    parts.push(box(0.2, 0.26, 0.2, -w / 2 - 0.26, top - 0.32, 0, 'lantern', 5));
    parts.push(box(0.24, 0.04, 0.24, -w / 2 - 0.26, top - 0.18, 0, 'dark'));
  } else {
    // two posts, the board between them, a small plank roof against the rain
    const cy = 1.42, topY = cy + h / 2;
    for (const sx of [-1, 1]) parts.push(box(0.12, topY + 0.5, 0.12, sx * (w / 2 + 0.1), (topY + 0.5) / 2 - 0.3, 0, 'wood'));
    parts.push(box(w + 0.1, h + 0.1, 0.06, 0, cy, 0, 'dark'));
    parts.push(...faces(w, h, cy, cell, glow));
    parts.push(box(w + 0.62, 0.07, 0.36, 0, topY + 0.22, 0, 'light'));
    parts.push(box(w + 0.5, 0.05, 0.14, 0, topY + 0.28, 0, 'dark'));
  }
  const g = mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return g;
}

export class Signs {
  /** structures: the Structures instance (its group, its placed buildings and the world's ground). */
  constructor(structures) {
    this.s = structures;
    this.group = new THREE.Group();
    this.group.name = 'signs';
    structures.group.add(this.group);
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, emissiveMap: this.texture, emissive: '#ffd9a6', emissiveIntensity: 0, roughness: 0.85, metalness: 0 });
    this.material.name = 'Name boards';
    // each part carries how much of the night glow it takes: faces fully, shop faces and lanterns more, wood hardly
    this.material.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;');
    };
    patchMaterial(this.material);
    this.material.customProgramCacheKey = () => 'fx01-boards';
    this.clusters = [];
    this.build();
    this.paint();
    this.offLang = onLangChange(() => { this.paint(); this.loadFonts(); });
    this.loadFonts();
    // a face used on a board for the first time arrives a moment later: paint again when it lands
    this.onFonts = () => { clearTimeout(this.fontT); this.fontT = setTimeout(() => this.paint(), 200); };
    document.fonts?.addEventListener?.('loadingdone', this.onFonts);
  }

  build() {
    const S = this.s, world = S.world;
    const placed = [];
    SIGNS.forEach((sign, cell) => {
      const rec = sign.building ? S.byId.get(sign.building) : null;
      if (sign.building && !rec) return;
      const p = signPlace(sign, rec, rec?.fp, rec ? DOOR_SPOTS[rec.name] : null);
      const y = p.top !== null && rec ? rec.y + p.top : world.heightAt(p.x, p.z);
      const g = boardGeometry(sign, cell);
      g.rotateY(p.yaw).translate(p.x, y, p.z);
      placed.push({ sign, x: p.x, y, z: p.z, yaw: p.yaw, g });
    });
    this.placed = placed;
    for (const b of placed) {
      let c = this.clusters.find(k => Math.hypot(k.x - b.x, k.z - b.z) < CLUSTER);
      if (!c) this.clusters.push(c = { x: b.x, z: b.z, list: [] });
      c.list.push(b);
    }
    for (const c of this.clusters) {
      const geo = mergeGeometries(c.list.map(b => b.g));
      for (const b of c.list) { b.g.dispose(); b.g = null; }
      geo.computeBoundingSphere();
      c.x = geo.boundingSphere.center.x; c.z = geo.boundingSphere.center.z; c.r = geo.boundingSphere.radius;
      c.mesh = new THREE.Mesh(geo, this.material);
      c.mesh.name = 'name-boards';
      c.mesh.castShadow = world.quality?.propShadows !== false;
      c.mesh.receiveShadow = true;
      this.group.add(c.mesh);
    }
  }

  /** Repaint every face in the current language and story (cheap: ~30 short strings; never called per frame). */
  paint() {
    const g = this.ctx, lang = getLang(), story = storyId();
    g.fillStyle = SWATCH.wood[1];
    g.fillRect(0, 0, TEX_W, TEX_H);
    for (const [x, colour] of Object.values(SWATCH)) { g.fillStyle = colour; g.fillRect(x - 200, (ROWS - 1) * CELL_H, 400, CELL_H); }
    SIGNS.forEach((sign0, cell) => {
      const sign = signFor(sign0, story);
      // a board starts with a capital, even where the translation is written to sit inside a sentence
      const name = tx(sign.text), text = name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
      paintFace(g, (cell % COLS) * CELL_W, Math.floor(cell / COLS) * CELL_H, text, sign.sub ? tx(sign.sub) : '', sign.icon, lang);
    });
    this.texture.needsUpdate = true;
    this.painted = `${lang}|${story}`;
  }

  /** Ask for the language's display faces with the very letters the boards need (Vietnamese marks, Hangul, kana, kanji). */
  loadFonts() {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const lang = getLang(), story = storyId();
    const sample = [...new Set(SIGNS.map(s => signFor(s, story)).flatMap(s => [tx(s.text), s.sub ? tx(s.sub) : '']).join(''))].join('');
    Promise.all((FONTS[lang] || FONTS.en).slice(0, 1).map(f => document.fonts.load(`700 40px "${f}"`, sample)))
      .then(() => { if (!this.disposed) this.paint(); }).catch(() => { /* the fallback face stays */ });
  }

  /** Night glow 0..1 (called every frame with the sky's night value: one assignment). */
  setNight(night) { this.material.emissiveIntensity = 0.5 * night; }

  /** Called with the structures' distance cull (a few times a second): hide far villages' boards, follow the story. */
  cull(camPos, q) {
    const far = Math.max(q.propDist * 1.5, 150);
    for (const c of this.clusters) {
      const d = Math.hypot(c.x - camPos.x, c.z - camPos.z) - c.r;
      c.mesh.visible = c.mesh.visible ? d < far : d < far - 12;
    }
    if (this.painted !== `${getLang()}|${storyId()}`) { this.paint(); this.loadFonts(); }
  }

  dispose() {
    this.disposed = true;
    this.offLang?.();
    clearTimeout(this.fontT);
    document.fonts?.removeEventListener?.('loadingdone', this.onFonts);
    for (const c of this.clusters) { c.mesh.geometry.dispose(); this.group.remove(c.mesh); }
    this.clusters.length = 0;
    this.texture.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
