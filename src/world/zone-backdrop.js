// A play zone's far view (docs/PLAY-ZONES-PLAN.md): the whole valley as seen from the zone's middle, baked by
// scripts/bake-zone-backdrops.mjs into six pictures, drawn as the scene's background. Inside the zone everything is real;
// the ground and the river fade into the picture over the last BAND metres (world/zone-fade.js), and the sky dome is
// not drawn (the picture has the sky of the game's hour in it).
import * as THREE from 'three';
import { BACKDROPS } from '../content/zone-backdrops.js';
import { setZoneFade } from './zone-fade.js';

/** Metres inside a zone's edge where the real ground starts fading into the far view (the bake's near plane). */
export const BAND = 10;
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/** Is there a baked far view for this game? */
export const hasBackdrop = id => !!BACKDROPS[id];

/** Fetch the six pictures (`hd`: the sharper set for Medium and High). -> { texture, scale, ...meta } or null. */
export async function loadBackdrop(id, { hd = false, base = './' } = {}) {
  const b = BACKDROPS[id];
  if (!b) return null;
  const dir = `${b.dir}${hd && b.hd ? 'hd/' : ''}`;
  try {
    const images = await Promise.all(FACES.map(f => new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${base}${dir}${f}.webp`;
    })));
    const texture = new THREE.CubeTexture(images);
    texture.colorSpace = THREE.SRGBColorSpace;
    // the faces hold the rows in the order the cube render target had them: drawn with the render target's orientation
    texture.isRenderTargetTexture = true;
    texture.needsUpdate = true;
    return { ...b, texture };
  } catch (e) {
    console.warn(`[zone] no far view for ${id}`, e);
    return null;
  }
}

/**
 * Put the far view up: the sky is the background (no sky dome), the ground past the zone's edge wears the picture
 * (projected from where it was taken: world/terrain.js), the river fades out there (the picture has it).
 */
export function applyBackdrop(game, zone, bd) {
  const { scene, world } = game;
  scene.background = bd.texture;
  scene.backgroundIntensity = 1 / bd.scale;
  if (world.sky?.mesh) world.sky.mesh.visible = false;
  setZoneFade(zone, zone.r - BAND, zone.r - 2);
  const u = world.terrain.uniforms;
  u.uBackdrop.value = bd.texture; u.uBdPos.value.set(zone.x, bd.y, zone.z); u.uBdScale.value = 1 / bd.scale; u.uBdOn.value = 1;
  // no grass tufts past the edge (they grow where the ground paint's alpha says)
  const sp = world.splat;
  for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
    if (Math.hypot(sp.x0 + i + 0.5 - zone.x, sp.z0 + j + 0.5 - zone.z) > zone.r - 3) sp.data[(j * sp.w + i) * 4 + 3] = 0;
  }
  sp.texture.needsUpdate = true;
}
