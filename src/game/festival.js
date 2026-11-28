// © 2026 Bui Cong Nguyen · solluxlabs.com
// Festival on demand (docs/EXPLORE-AND-SHOW.md "Festival"): in Explore the player switches the valley's festival on (and
// off) in any season, from Go to… (ui/goto-ui.js). Kept in the Explore save (quest state `explore.festival`).
// What it turns on, all of it things the valley already has or one cheap new set:
//   - the train's festival garlands (world/railway.js setFestival)
//   - fireflies on festival nights (the weather particles; winter keeps its snow)
//   - the festival tune in the evening (the music's 'finale' mood, 16:30-23:00; a song on stage holds the music as ever)
//   - people stay out late round the festival square: Town Life sends them home at 23:00, not 20:00 (game/schedule.js)
//   - the festival stage on the Takamori square (content/stages.js 'festival'): bamboo poles and strings of paper lanterns
//     round it, lit with the valley's other festival lanterns at dusk (fx/cel-decor.js material: one draw for the lanterns,
//     one for the poles, no shadows, no lights)
// The lasting decorations of the four lamps (fx/celebrate.js decorate) are up in Explore whatever the switch says.
import * as THREE from 'three';
import { FESTIVAL_STAGE } from '../content/stages.js';

/** The festival tune plays between these hours (the show's own evening starts at about 18:50). */
export const EVENING = Object.freeze([16.5, 23]);
export const isFestivalEvening = h => h >= EVENING[0] && h < EVENING[1];
/** People stay out until this hour on a festival night (game/schedule.js): those within FESTIVAL_NEAR metres of the
 *  festival stage (Takamori's people; the station and Kawabe go home as ever, so their phone budgets hold). */
export const LATE = 23;
export const FESTIVAL_NEAR = 150;
/** The weather a festival night asks for (null: the season's own). */
export const festivalWeather = ({ on, night, season }) => (on && night > 0.45 && season !== 'winter' ? 'fireflies' : null);

/**
 * The lanterns round a stage spot: four poles at the corners of a box `w` x `d` metres (x across, z along the spot's
 * facing), strings between them (not the front one, toward the camera) sagging `sag`; one lantern every `step` metres. Pure: -> { poles: [{x, z}], lanterns:
 * [{x, y (over the ground line between its poles), z, i}] } in world x/z (y relative to the string's ends).
 */
export function lanternRing(spot, { w = 15, d = 12, back = 2, step = 0.9, sag = 0.55 } = {}) {
  const s = Math.sin(spot.facing), c = Math.cos(spot.facing);
  const at = (x, z) => ({ x: spot.x + x * c + z * s, z: spot.z - x * s + z * c });
  // the box reaches `back` m toward the camera and d - back behind the performers (+z: the view behind them, the backdrop);
  // corners: front left, front right, back right, back left
  const corners = [at(-w / 2, -back), at(w / 2, -back), at(w / 2, d - back), at(-w / 2, d - back)];
  const poles = corners, lanterns = [];
  for (let k = 0; k < 4; k++) {
    if (k === 0) continue;                                   // (the front string would hang across the view: left out)
    const a = corners[k], b = corners[(k + 1) % 4], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(len / step));
    for (let i = 1; i < n; i++) { const t = i / n; lanterns.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: -Math.sin(Math.PI * t) * sag, t, i: lanterns.length }); }
  }
  return { poles, lanterns };
}

const POLE_H = 4.2;
const COLOURS = ['#ff5a3a', '#ff8a2e', '#ffc23a', '#ff6fa0', '#fff0d0'];

export class Festival {
  constructor(game, director) {
    this.g = game; this.d = director;
    this.on = false; this.dress = null; this.mood = null; this.weather = null;
  }

  /** Turn the festival on or off (from the Explore save, Go to…, or a moment). */
  set(on) {
    on = !!on;
    if (this.on === on && (this.dress || !on)) return;
    this.on = on;
    this.g.festival = on;                  // (Town Life's late night, game/townlife.js; the weather, game/game.js applyLook)
    this.g.railway?.setFestival?.(on);
    if (on && !this.dress) this.build();
    if (this.dress) this.dress.visible = on;
    this.weather = undefined;              // (re-decided on the next update)
  }

  /** The lanterns and poles round the festival stage (made once, then shown or hidden). */
  build() {
    const g = this.g, decor = g.celebrate?.decor;
    if (!decor || !g.world) return;
    const ring = lanternRing(FESTIVAL_STAGE), h = (x, z) => g.world.heightAt(x, z);
    const group = this.dress = new THREE.Group(); group.name = 'festival:lanterns';
    const poleMat = new THREE.MeshStandardMaterial({ color: '#c9b07a', roughness: 0.8 });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.065, POLE_H, 6), poleMat, ring.poles.length);
    const m = new THREE.Matrix4();
    ring.poles.forEach((p, i) => poles.setMatrixAt(i, m.makeTranslation(p.x, h(p.x, p.z) + POLE_H / 2 - 0.1, p.z)));
    poles.castShadow = false; poles.receiveShadow = true; poles.computeBoundingSphere();
    const L = new THREE.InstancedMesh(decor.lanternGeometry(), decor.mat, ring.lanterns.length);
    const top = Math.max(...ring.poles.map(p => h(p.x, p.z))) + POLE_H - 0.35, col = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3(1.15, 1.15, 1.15);
    ring.lanterns.forEach((o, i) => {
      L.setMatrixAt(i, m.compose(new THREE.Vector3(o.x, top + o.y, o.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), s));
      L.setColorAt(i, col.set(COLOURS[i % COLOURS.length]));
    });
    if (L.instanceColor) L.instanceColor.needsUpdate = true;
    L.castShadow = false; L.receiveShadow = false; L.computeBoundingSphere();
    group.add(poles, L);
    g.scene.add(group);
  }

  /** Every frame: the fireflies and the tune follow the hour (set only when they change). */
  update() {
    const g = this.g, d = this.d;
    const want = festivalWeather({ on: this.on, night: g.night || 0, season: g.shownSeason || g.time.season });
    if (want !== this.weather) { this.weather = want; g.festivalWeather = want; g.applyLook?.(); }
    const mood = this.on && isFestivalEvening(g.shownHour()) ? 'finale' : 'calm';
    if (mood !== this.mood) { const first = this.mood === null; this.mood = mood; if (!first || mood !== 'calm') d.audio?.setMusic?.(g.shownSeason || g.time.season, mood); }
  }
}

/** The festival for an Explore session (src/main.js), set from the save. -> the Festival */
export function startFestival(game, director) {
  const f = director.festival ??= new Festival(game, director);
  if (!game.systems.includes(f)) game.systems.push(f);
  f.set(!!director.q?.state?.explore?.festival);
  return f;
}
