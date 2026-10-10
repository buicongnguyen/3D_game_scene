import * as THREE from 'three';
import { HeightGrid } from './heightfield.js';
import { Terrain, Splat } from './terrain.js';
import { Water, makeHeightTexture } from './water.js';
import { Sky } from './sky.js';
import { SLIDE, slideHillAt } from './landslide.js';

/**
 * The terrain under the landslide scar is sunk out of sight, but wherever it shows (around the model's rim, or
 * over the model's turf) it must be lit like the hillside it continues: take those vertex normals from the
 * undisturbed hillside, not from the hidden grid (whose steep dips would also trip the shader's rock colour).
 */
function shadeFromHillside(terrain, g) {
  const m = 2 * g.step;
  const x0 = SLIDE.x + SLIDE.x0 - m, x1 = SLIDE.x + SLIDE.x1 + m, z0 = SLIDE.z - SLIDE.y1 - m, z1 = SLIDE.z - SLIDE.y0 + m;
  const at = (i, j) => {
    i = Math.min(g.nx - 1, Math.max(0, i)); j = Math.min(g.nz - 1, Math.max(0, j));
    return slideHillAt(g.x0 + i * g.step, g.z0 + j * g.step) ?? g.h[j * g.nx + i];
  };
  for (const mesh of terrain.group.children) {
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.max.x < x0 || bb.min.x > x1 || bb.max.z < z0 || bb.min.z > z1) continue;
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const i = Math.round((x - g.x0) / g.step), j = Math.round((z - g.z0) / g.step);
      const dx = at(i + 1, j) - at(i - 1, j), dz = at(i, j + 1) - at(i, j - 1), l = Math.hypot(dx, 2 * g.step, dz);
      nor.setXYZ(k, -dx / l, 2 * g.step / l, -dz / l);
    }
    nor.needsUpdate = true;
  }
}

/** Owns the static environment: height grid, terrain, water, sky and lighting. */
export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.quality = quality;   // the tier the world was built for (crop density, prop shadows)
    const t0 = performance.now();
    this.grid = new HeightGrid(quality.terrainStep);
    this.splat = new Splat(this.grid);
    this.bakeMs = performance.now() - t0;
    // grass and water sample the visible ground (the landslide model stands above the grid it hides)
    const visible = this.grid.visibleHeights();
    this.heightTex = makeHeightTexture({ ...this.grid, h: visible });
    this.sky = new Sky(scene, renderer, quality);
    this.terrain = new Terrain(scene, this.grid, this.splat);
    shadeFromHillside(this.terrain, this.grid);
    this.water = new Water(scene, this.grid, this.heightTex, this.terrain.noise);
    this.season = null;
    this.hour = 10;
    this.lamps = [];
    this.seasonHooks = [];   // (season) => void, e.g. set dressing tinted with the season's grass
  }

  /** The visible ground: terrain, or the landslide scar model over its sunk footprint (see heightfield.js). */
  heightAt(x, z) { return this.grid.heightAt(x, z); }

  setSeason(season) {
    if (season === this.season) return;
    this.season = season;
    // winter freezes the river: the ice is walkable (player.groundHeight) and the water turns to ice (water.js)
    this.frozen = season === 'winter';
    this.water.setIce?.(this.frozen);
    this.terrain.setSeason(season);
    for (const f of this.seasonHooks) f(season);
    this.onSeason?.(season);
  }

  update(dt, focus) {
    // the player: distance culling and LOD measure from here while the follow camera orbits around it
    (this.focus ??= new THREE.Vector3()).copy(focus);
    const L = this.sky.update(dt, this.season, this.hour, focus);
    this.water.update(dt, this.sky, this.lamps);
    return L;
  }
}
