import * as THREE from 'three';
import { HeightGrid } from './heightfield.js';
import { Terrain, Splat } from './terrain.js';
import { Water, makeHeightTexture } from './water.js';
import { Sky } from './sky.js';

/** Owns the static environment: height grid, terrain, water, sky and lighting. */
export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    const t0 = performance.now();
    this.grid = new HeightGrid(quality.terrainStep);
    this.splat = new Splat(this.grid);
    this.bakeMs = performance.now() - t0;
    this.heightTex = makeHeightTexture(this.grid);
    this.sky = new Sky(scene, renderer, quality);
    this.terrain = new Terrain(scene, this.grid, this.splat);
    this.water = new Water(scene, this.grid, this.heightTex, this.terrain.noise);
    this.season = null;
    this.hour = 10;
    this.lamps = [];
  }

  heightAt(x, z) { return this.grid.heightAt(x, z); }

  setSeason(season) {
    if (season === this.season) return;
    this.season = season;
    this.terrain.setSeason(season);
    this.onSeason?.(season);
  }

  update(dt, focus) {
    const L = this.sky.update(dt, this.season, this.hour, focus);
    this.water.update(dt, this.sky, this.lamps);
    return L;
  }
}
