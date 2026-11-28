// © 2026 Bui Cong Nguyen · solluxlabs.com
// Is the Night Star at the shrine tonight? (docs/NIGHT-STAR.md) A small game system started with the story or Explore
// (src/main.js): twice a second it asks content/night-star.js nightStarState, and only at night near the shrine does it
// fetch the show (game/nightstar/night-star.js) and her files. ?nightstar=off: never.
import { NIGHT_STAR_SHOW, nightStarState } from '../../content/night-star.js';
import { canEnter, photoState } from '../photo.js';

export class NightStarWatch {
  constructor(game, director) { this.g = game; this.d = director; this.t = 0; this.ns = null; this.importing = null; this.away = true; }

  /** The facts nightStarState reads. */
  facts() {
    const g = this.g, d = this.d, p = g.player?.pos, S = NIGHT_STAR_SHOW;
    const free = canEnter(photoState(g)) && !d.busy && !d.minigame && !d.scenes?.active && !d.singplay && !g.paused && !d.tourLock && !g.zone;
    const open = !!(d.explore || d.q?.unlocked?.('shrineStairs'));
    return { night: g.night || 0, dist: p ? Math.hypot(p.x - S.x, p.z - S.z) : Infinity, free: free || !!this.ns?.perf, open, indoors: !!g.interiors?.active };
  }

  update(dt) {
    this.ns?.update(dt);
    if ((this.t -= dt) > 0) return;
    this.t = 0.5;
    const f = this.facts(), st = nightStarState(f);
    // (a show under way ends only when Mika goes far or Sing & Play starts: not when the clock or a setting turns to day)
    const mid = !!this.ns?.perf && f.dist <= NIGHT_STAR_SHOW.leave && !this.d.singplay;
    if ((st === 'gone' && !mid) || this.d.singplay) {
      this.ns?.vanish();
      if (this.ns && (f.dist > NIGHT_STAR_SHOW.leave || f.night < NIGHT_STAR_SHOW.night)) this.ns.spent = false;   // (another visit, another night)
      return;
    }
    if (!this.ns) { this.importing ??= import('./night-star.js').then(m => { this.ns = new m.NightStar(this.g, this.d); }).catch(e => { console.warn('[nightstar]', e); }); return; }
    this.ns.load();
    if (st === 'here' && f.free) this.ns.appear();
  }
}

/** Start watching for her (once a story or Explore session is under way). */
export function watchNightStar(game, director) {
  if (game.params?.get?.('nightstar') === 'off' || game.nightStar) return game.nightStar || null;
  const w = game.nightStar = new NightStarWatch(game, director);
  game.systems.push(w);
  return w;
}
