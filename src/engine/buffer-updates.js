/** One bounded component range, including changes not yet consumed by the renderer. */
export function dirtyRange(attribute, start, count) {
  if (count <= 0) return;
  let end = start + count;
  for (const r of attribute.updateRanges) {
    start = Math.min(start, r.start);
    end = Math.max(end, r.start + r.count);
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(start, end - start);
  attribute.needsUpdate = true;
}

/** Float32-aware comparison avoids resending unchanged instance transforms. */
export function writeInstanceMatrix(attribute, slot, matrix) {
  const a = attribute.array, e = matrix.elements, offset = slot * 16;
  let changed = false;
  for (let j = 0; j < 16; j++) {
    const v = Math.fround(e[j]);
    if (a[offset + j] !== v) { a[offset + j] = v; changed = true; }
  }
  if (changed) dirtyRange(attribute, offset, 16);
  return changed;
}
