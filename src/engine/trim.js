// Memory: a model's vertex data is kept in the browser twice, as the typed arrays three.js made for it and as the copy
// on the graphics card. Once a geometry has been uploaded nothing reads the first copy again, if the geometry belongs
// to a model that no code re-reads (houses, trees, rooms). `trimOnUpload` frees those arrays right after the upload,
// the idiom three.js documents (BufferAttribute.onUpload). Bounds are worked out first, so Box3.setFromObject and
// frustum culling still work.
//
// The price: a lost WebGL context cannot be refilled from memory (the arrays are gone). `trimmed.arrays` tells main.js
// whether that is so; if it is, a context that comes back is answered with "Reload" (progress is saved) instead of
// carrying on with a picture that cannot be rebuilt.
export const trimmed = { arrays: 0 };
const seen = new WeakSet();

/** `root`: a model scene (or any object). Static meshes only: skinned, instanced and morphing ones are left alone. */
// Off by default: a phone that leaves the browser for a moment often loses its WebGL context, and with the arrays gone the
// picture could not be rebuilt when it came back (the player would have to reload). The saving is only about 8 MB; turn it on
// with ?trim=on to measure it.
export const TRIM_ARRAYS = typeof location !== 'undefined' && /[?&]trim=on/.test(location.search);

export function trimOnUpload(root) {
  if (!TRIM_ARRAYS) return;
  root.traverse(o => {
    const g = o.geometry;
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !g || g.isInstancedBufferGeometry || seen.has(g)) return;
    if (/^Col_/.test(o.name) || Object.keys(g.morphAttributes).length) return;   // collision boxes are measured again for every room of a kind
    seen.add(g);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    for (const a of [...Object.values(g.attributes), g.index]) {
      if (!a || !a.array || a.isInterleavedBufferAttribute || a.isGLBufferAttribute) continue;
      a.onUpload(() => { a.array = null; trimmed.arrays++; });
    }
  });
}

/** The models whose geometry is only ever drawn: every building and the trees (and their far versions). */
export function trimModels(assets, names) {
  for (const n of names) { const g = assets.gltf(n); if (g) trimOnUpload(g.scene); }
}
