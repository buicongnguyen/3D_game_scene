// The HUD's little map, top right (owner 2026-11-27: the clock pill did nothing and was large; "a tiny map to locate
// where we are and the direction to the next task"). A round window on the journal map's own picture of the valley
// (ui/map.js: the land, paths, railway and roofs), turned so the way the camera looks is up, with Mika's arrow in the
// middle and a gold star for the current goal (pinned to the rim, pointing the way, while it is farther than the map
// shows). The time is a small label under it. Tapping it opens the journal's Map page.
//
// Cost: the valley picture is painted once per season (the land a few ms per frame until it is done), then each
// redraw (about 12 a second) is one clipped, rotated drawImage and a few small shapes on an 84-112 px canvas.
import { valleyLand, MAP_CROP as CROP, paintVectors, outdoorsOf, mikaOnMap } from './map.js';

const K = 0.9;                 // CSS px per metre: the rim is ~47 m away on the phone's 84 px map, ~62 m on the PC's 112
const EVERY = 80;              // ms between redraws
const PAPER = '#f4e6c6', MIKA = '#e0567a', GOLD = '#ffd23f', INK = '#3b2a1a';

export class MiniMap {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pic = null; this.picKey = '';
    this.last = 0; this.size = 0; this.dpr = 1;
    this.dir = { x: 0, y: 0, z: -1 };
    addEventListener('resize', () => { this.size = 0; });
  }

  measure() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return false;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * this.dpr);
    if (this.canvas.width !== w) { this.canvas.width = this.canvas.height = w; }
    this.size = r.width;
    return true;
  }

  /** The whole valley at K px a metre (device pixels), or null while the land is still painting. */
  picture() {
    const land = valleyLand(this.game);
    if (!land.done) { land.step(3); return this.pic; }
    const key = `${land.key}@${this.dpr}`;
    if (this.picKey === key) return this.pic;
    const dpr = this.dpr, k = K * dpr;
    const c = this.pic || document.createElement('canvas');
    c.width = Math.round((CROP.x1 - CROP.x0) * k); c.height = Math.round((CROP.z1 - CROP.z0) * k);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(land.canvas, 0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintVectors(ctx, this.game, land.season, (x, z) => [(x - CROP.x0) * K, (z - CROP.z0) * K], K);
    this.pic = c; this.picKey = key;
    return c;
  }

  /** Called every frame with the camera and the goal (a Vector3 or null); redraws a dozen times a second. */
  update(now, camera, goal) {
    if (now - this.last < EVERY) return;
    this.last = now;
    if (!this.size && !this.measure()) return;
    if (!this.game.world?.grid || !this.game.player) return;
    const pic = this.picture();
    const ctx = this.ctx, W = this.canvas.width, R = W / 2, dpr = this.dpr, k = K * dpr;
    const at = mikaOnMap(this.game);
    // map up = the way the camera looks (world x -> map x, world z -> map y)
    const f = camera.getWorldDirection ? camera.getWorldDirection(this.v ??= camera.position.clone()) : this.dir;
    const rot = -Math.PI / 2 - Math.atan2(f.z, f.x);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const turn = (dx, dz) => [dx * cos - dz * sin, dx * sin + dz * cos];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, W);
    if (pic) {
      ctx.translate(R, R); ctx.rotate(rot);
      ctx.drawImage(pic, -(at.x - CROP.x0) * k, -(at.z - CROP.z0) * k);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // a soft rim, like the journal map's page edge
    const g = ctx.createRadialGradient(R, R, R * 0.62, R, R, R);
    g.addColorStop(0, 'rgba(120, 80, 30, 0)'); g.addColorStop(1, 'rgba(120, 80, 30, 0.32)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);

    // north, on the rim
    const [nx, ny] = turn(0, -1), nr = R - 7 * dpr;
    ctx.font = `700 ${11 * dpr}px Nunito, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255, 247, 232, 0.9)'; ctx.strokeText('N', R + nx * nr, R + ny * nr);
    ctx.fillStyle = INK; ctx.fillText('N', R + nx * nr, R + ny * nr);

    // the goal: a star where it is, or on the rim with a pointer when it is farther than the map shows
    const o = goal && outdoorsOf(this.game, goal);
    if (o) {
      let [gx, gy] = turn((o.x - at.x) * k, (o.z - at.z) * k);
      const d = Math.hypot(gx, gy), edge = R - 9 * dpr, far = d > edge;
      if (far) { gx *= edge / d; gy *= edge / d; }
      if (far) {
        const a = Math.atan2(gy, gx);
        ctx.save(); ctx.translate(R + gx, R + gy); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(8 * dpr, 0); ctx.lineTo(1 * dpr, -5 * dpr); ctx.lineTo(1 * dpr, 5 * dpr); ctx.closePath();
        ctx.fillStyle = GOLD; ctx.fill(); ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = '#8a5a1e'; ctx.stroke();
        ctx.restore();
      }
      star(ctx, R + gx, R + gy, (far ? 5.5 : 6.5) * dpr);
    }

    // Mika: a pink arrow the way she faces (model +Z faces (sin, cos))
    const fa = this.game.player.facing ?? 0;
    const [ax, ay] = turn(Math.sin(fa), Math.cos(fa));
    ctx.save(); ctx.translate(R, R); ctx.rotate(Math.atan2(ay, ax));
    ctx.beginPath(); ctx.moveTo(7 * dpr, 0); ctx.lineTo(-5 * dpr, -5 * dpr); ctx.lineTo(-2.5 * dpr, 0); ctx.lineTo(-5 * dpr, 5 * dpr); ctx.closePath();
    ctx.fillStyle = MIKA; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = GOLD; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = '#8a5a1e'; ctx.stroke();
}
