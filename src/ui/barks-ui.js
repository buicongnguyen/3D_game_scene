// The little speech bubbles over people's heads (see game/barks.js for what they say and when). A handful of DOM
// elements are reused; each frame the ones in use are moved to their speaker's head on screen.
import * as THREE from 'three';
import { tx } from '../i18n/i18n.js';

const MAX = 3;                 // bubbles that can be up at once (the clock allows fewer)
const FADE = 0.35;             // seconds to fade in and out
const V = new THREE.Vector3();

export class BarkBubbles {
  constructor(parent = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'barks';
    this.root.setAttribute('aria-hidden', 'true'); // they repeat nothing the player needs: pure atmosphere
    parent.appendChild(this.root);
    this.slots = Array.from({ length: MAX }, () => {
      const el = document.createElement('div');
      el.className = 'bark';
      el.innerHTML = '<b></b><span></span>';
      this.root.appendChild(el);
      return { el, name: el.firstChild, text: el.lastChild, id: null, age: 0, life: 0, anchor: null, shown: false };
    });
  }

  /** Put a bubble over `anchor()` (a function returning the world point of the speaker's head). Returns false if full. */
  show(id, text, anchor, { name = '', life = 4.6 } = {}) {
    const s = this.slots.find(x => x.id === id) || this.slots.find(x => x.id === null);
    if (!s) return false;
    s.id = id; s.age = 0; s.life = life; s.anchor = anchor; s.shown = false;
    s.name.textContent = name;
    s.name.hidden = !name;
    s.text.textContent = tx(text);
    s.el.classList.toggle('named', !!name);
    return true;
  }

  hide(id) { const s = this.slots.find(x => x.id === id); if (s) this.free(s); }
  clear() { for (const s of this.slots) this.free(s); }
  free(s) { s.id = null; s.anchor = null; s.shown = false; s.el.style.opacity = '0'; s.el.classList.remove('on'); }

  /** Move every live bubble to its speaker. `hidden`: dialogue or a menu is up, so nothing is drawn. */
  update(dt, camera, hidden = false) {
    const w = innerWidth, h = innerHeight;
    for (const s of this.slots) {
      if (s.id === null) continue;
      s.age += dt;
      if (s.age >= s.life) { this.free(s); continue; }
      const p = s.anchor?.(V);
      if (!p) { this.free(s); continue; }
      const dist = camera.position.distanceTo(p);
      p.project(camera);
      const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
      const visible = !hidden && p.z < 1 && x > 60 && x < w - 60 && y > 90 && y < h - 30;
      const k = Math.min(1, s.age / FADE, (s.life - s.age) / FADE);
      // farther speakers are slightly smaller and fainter, so the nearest remark reads first
      const near = THREE.MathUtils.clamp(1.15 - dist / 40, 0.7, 1);
      s.el.style.opacity = visible ? String(Math.max(0, k) * (0.55 + 0.45 * near)) : '0';
      s.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%) scale(${near.toFixed(2)})`;
      s.el.classList.toggle('on', visible);
    }
  }
}
