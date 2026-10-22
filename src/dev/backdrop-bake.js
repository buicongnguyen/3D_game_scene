// The far view of a play zone (docs/PLAY-ZONES-PLAN.md, world/zone.js), rendered from the whole valley: a cube of six
// pictures taken from the zone's middle, with the near plane at the zone's edge so nothing inside the zone is in them
// (the zone draws its own). scripts/bake-zone-backdrops.mjs calls this through the QA helpers and writes the files.
//
// The faces are the scene before the post-processing (linear light, as the game's RenderPass sees it), scaled by
// `scale` to keep the bright sky inside 8 bits, stored as sRGB WebP. The zone draws them as the scene background at
// 1/scale, so they go through the same bloom, grade and tone mapping as everything else.
import * as THREE from 'three';

const toSrgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** -> six WebP data URLs, faces +x, -x, +y, -y, +z, -z, rows in the render target's order (see world/zone-backdrop.js) */
export async function bakeBackdrop(game, { x, y, z, near, inside = 0, size = 768, scale = 0.5, quality = 0.88 }) {
  const r = game.renderer.renderer, scene = game.scene;
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(near, 4600, rt);
  cam.position.set(x, y, z);
  scene.add(cam);
  // what stands inside the zone (`inside` metres round x, z) is the zone's own: not in the picture, or it would be painted
  // onto the far ground behind it. Every object outside it is in, all six ways round.
  const hidden = [], box = new THREE.Box3(), sph = new THREE.Sphere();
  const within = (cx, cz) => Math.hypot(cx - x, cz - z) < inside;
  const hide = o => { if (o.visible) { o.visible = false; hidden.push(o); } };
  for (const c of scene.children) {
    if (/^(terrain|river|foliage|interiors)$/.test(c.name) || c.isLight || c.isCamera || c === cam) continue;
    if (c.name === 'grass') { hide(c); continue; }
    for (const o of /^(structures|railway|paddies|riverbed)$/.test(c.name) ? c.children : [c]) {
      if (o.isInstancedMesh) continue;
      box.setFromObject(o, false);
      if (box.isEmpty()) continue;
      box.getBoundingSphere(sph);
      // (not the sky dome, the clouds or anything else the size of the map: their middle may well be in the zone)
      if (sph.radius < 200 && within(sph.center.x, sph.center.z)) hide(o);
    }
  }
  // the forests keep only the trees in front of the game's camera (world/foliage.js): every tree outside the zone instead
  const fol = game.foliage, cull = fol?.frustum.intersectsSphere;
  if (fol) { fol.frustum.intersectsSphere = s => !within(s.center.x, s.center.z); fol.update(game.camera, true); }
  // the game keeps its own world matrices up to date (engine/matrices.js): make sure all of them are, for six views
  scene.updateMatrixWorld(true);
  r.shadowMap.needsUpdate = true;
  const was = r.getRenderTarget();
  cam.update(r, scene);
  r.setRenderTarget(was);
  if (fol) { fol.frustum.intersectsSphere = cull; fol.update(game.camera, true); }
  const buf = new Uint16Array(size * size * 4), out = [];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), half = THREE.DataUtils.fromHalfFloat;
  for (let f = 0; f < 6; f++) {
    r.readRenderTargetPixels(rt, 0, 0, size, size, buf, f);
    for (let i = 0; i < size * size; i++) {
      for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.round(255 * Math.min(1, toSrgb(Math.max(0, half(buf[i * 4 + k]) * scale))));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    out.push(c.toDataURL('image/webp', quality));
  }
  scene.remove(cam);
  for (const o of hidden) o.visible = true;
  rt.dispose();
  return out;
}
