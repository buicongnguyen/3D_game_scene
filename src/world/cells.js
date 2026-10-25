import * as THREE from 'three';

export const CELL = 64;
export const cellIndex = (x, cell = CELL) => Math.floor(x / cell + 0.5);
export const cellsEnabled = () => typeof location === 'undefined' || new URLSearchParams(location.search).get('cells') !== 'off';

// Match Structures' old hysteresis: disappear at d, return 12 m (or 6%) inside d.
export function distanceVisible(shown, distance2, distance) {
  const d = shown ? distance : Math.min(distance - 12, distance * 0.94);
  return distance2 < d * d;
}

export function cullReference(focus, cameraPosition) {
  return focus && (focus.x - cameraPosition.x) ** 2 + (focus.z - cameraPosition.z) ** 2 < 225 ? focus : cameraPosition;
}

function wrapper(name) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.cellGroup = true;
  return group;
}

/** Shared conservative view test; shadow camera bookkeeping must never change the rendered shadow map. */
export class CellVisibility {
  constructor(world = null) {
    this.world = world;
    this.frustum = new THREE.Frustum();
    this.projection = new THREE.Matrix4();
    this.shadowFrustum = new THREE.Frustum();
    this.shadowCamera = new THREE.OrthographicCamera();
    this.lightAt = new THREE.Vector3();
    this.lightTarget = new THREE.Vector3();
  }

  prepare(camera) {
    this.view = this.shadows = false;
    if (!camera?.isCamera) return;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.view = true;
    const sun = this.world?.sky?.sun;
    if (sun?.castShadow) {
      const cam = this.shadowCamera;
      cam.projectionMatrix.copy(sun.shadow.camera.projectionMatrix);
      sun.getWorldPosition(this.lightAt);
      sun.target.getWorldPosition(this.lightTarget);
      cam.position.copy(this.lightAt);
      cam.lookAt(this.lightTarget);
      cam.updateMatrixWorld();
      this.shadowFrustum.setFromProjectionMatrix(this.projection.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      this.shadows = true;
    }
  }

  intersects(box, castsShadow = true) {
    return !this.view || box.isEmpty() || this.frustum.intersectsBox(box) || (castsShadow && this.shadows && this.shadowFrustum.intersectsBox(box));
  }
}

/** Identity parents let existing world-space transforms and gameplay visibility stay unchanged. */
export class CellGrid {
  constructor(parent, cell = CELL, world = null) {
    this.parent = parent;
    this.cell = cell;
    this.world = world;
    this.cells = new Map();
    this.visibility = new CellVisibility(world);
    if (world?.scene) (world.scene.userData.cellGrids ??= []).push(this);
  }

  add(obj, x, z, kind = 'always') {
    const i = cellIndex(x, this.cell), j = cellIndex(z, this.cell), key = `${i},${j}`;
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { group: wrapper(`cell:${key}`), kinds: new Map() };
      this.cells.set(key, cell);
      this.parent.add(cell.group);
    }
    let bucket = cell.kinds.get(kind);
    if (!bucket) {
      bucket = { group: wrapper(kind === 'building' ? 'buildings' : kind === 'prop' ? 'props' : kind), entries: [], box: new THREE.Box3(), dirty: true };
      cell.kinds.set(kind, bucket);
      cell.group.add(bucket.group);
    }
    // A separate distance gate preserves both the old exact prop boundary and gameplay's obj.visible.
    // A cell alone is too coarse: its near edge would keep props up to 90 m beyond the old cutoff.
    const gate = kind === 'always' ? obj : wrapper(`range:${obj.name || kind}`);
    if (gate !== obj) gate.add(obj);
    bucket.group.add(gate);
    bucket.entries.push({ obj, gate, x, z });
    bucket.dirty = true;
    return obj;
  }

  refreshBounds(bucket) {
    bucket.box.makeEmpty();
    // Bounds include geometry crossing the nominal cell edge, e.g. a yard or viaduct arch.
    for (const { obj, gate } of bucket.entries) if (gate.parent === bucket.group) {
      obj.updateWorldMatrix(true, true);
      bucket.box.union(new THREE.Box3().setFromObject(obj));
    }
    if (!bucket.box.isEmpty()) bucket.box.max.y += 30;
    bucket.dirty = false;
  }

  update(ref, camera, q) {
    this.visibility.prepare(camera);
    for (const cell of this.cells.values()) {
      if (cell.group.parent !== this.parent) continue; // play-zone pruning removed this cell
      let cellShown = false;
      for (const [kind, bucket] of cell.kinds) {
        if (bucket.group.parent !== cell.group) continue;
        if (bucket.dirty) this.refreshBounds(bucket);
        const distance = kind === 'prop' ? q.propDist : kind === 'mid' ? q.midDist ?? q.buildDist : kind === 'building' ? q.buildDist : Infinity;
        let near = false;
        for (const e of bucket.entries) {
          if (e.gate.parent !== bucket.group) continue;
          if (e.gate !== e.obj) e.gate.visible = distanceVisible(e.gate.visible, (e.x - ref.x) ** 2 + (e.z - ref.z) ** 2, distance);
          near ||= e.gate.visible;
        }
        bucket.group.visible = near && this.visibility.intersects(bucket.box);
        cellShown ||= bucket.group.visible;
      }
      cell.group.visible = cellShown;
    }
  }

  updateForCamera(camera, q) {
    this.update(cullReference(this.world?.focus, camera.position), camera, q);
  }
}

/** Also runs for focus snapshots and tours, before the matrix walker skips hidden subtrees. */
export function updateCellGrids(scene, camera, q) {
  for (const grid of scene.userData.cellGrids || []) grid.updateForCamera(camera, q);
}
