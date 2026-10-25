import * as THREE from 'three';
import { CELL, CellVisibility, cellIndex, cellsEnabled } from './cells.js';

const grids = new WeakMap();
const maxScale = s => Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));

/** Generous animated/held-prop envelope, without visiting a skeleton or changing its animation. */
export function actorBounds(actor, box = new THREE.Box3()) {
  const root = actor.root, model = actor.model;
  const scale = maxScale(root.scale) * Math.max(1, model ? maxScale(model.scale) : 1);
  const offset = model ? model.position.length() * maxScale(root.scale) : 0;
  const r = 5 * scale + offset, p = root.position;
  box.min.set(p.x - r, p.y - r, p.z - r);
  box.max.set(p.x + r, p.y + 10 * scale + offset, p.z + r);
  return box;
}

/**
 * Moving actors have their own current-position cells and per-actor gates. Logical visibility, distance detail,
 * paths, animation and callbacks stay with NPC; only whole offscreen drawing subtrees are skipped.
 */
export class ActorCellGrid {
  constructor(scene, world, cell = CELL) {
    this.scene = scene; this.world = world; this.cell = cell;
    this.entries = new Map(); this.cells = new Map(); this.registered = new WeakSet();
    this.visibility = new CellVisibility(world); this.box = new THREE.Box3();
    this.group = new THREE.Group(); this.group.name = 'npc:cells'; // Zone pruning already preserves npc: roots.
    scene.add(this.group);
    grids.set(scene, this);
    scene.userData.actorCellGrid = this;
    (scene.userData.cellGrids ??= []).push(this);
  }

  add(actor) {
    const root = actor.root;
    if (!this.registered.has(root)) {
      // Foreign owners may detach their whole group on disposal. Do not retain that subtree in a strong map.
      // The root-local listener survives a temporary transfer and re-enrols only on a direct return to our scene.
      root.addEventListener('added', () => { if (root.parent === this.scene && !actor.gone) this.add(actor); });
      this.registered.add(root);
    }
    if (!this.entries.has(root)) this.entries.set(root, { actor, root, gate: null, cell: null });
    return actor;
  }

  leaveCell(entry) {
    const cell = entry.cell;
    entry.gate?.removeFromParent(); entry.cell = null;
    if (!cell) return;
    cell.entries.delete(entry);
    if (!cell.entries.size) { cell.group.removeFromParent(); this.cells.delete(cell.key); }
  }

  bypass(entry) {
    // A room, train seat or other owner keeps its parent. Only release our own identity parent.
    if (entry.gate && entry.root.parent === entry.gate) this.scene.add(entry.root);
    this.leaveCell(entry);
  }

  updateForCamera(camera) {
    this.visibility.prepare(camera);
    for (const cell of this.cells.values()) cell.shown = false;
    for (const [root, entry] of this.entries) {
      const actor = entry.actor, owned = entry.gate && root.parent === entry.gate;
      if (!root.parent || actor.gone) {
        if (actor.gone && (owned || root.parent === this.scene)) root.removeFromParent();
        this.leaveCell(entry); this.entries.delete(root); continue;
      }
      if (root.parent !== this.scene && !owned) {
        this.leaveCell(entry); this.entries.delete(root); continue;
      }
      if (actor.resident || actor.riding || actor.ridden || root.position.y > 300) {
        this.bypass(entry); continue;
      }
      const key = `${cellIndex(root.position.x, this.cell)},${cellIndex(root.position.z, this.cell)}`;
      if (!entry.gate) { entry.gate = new THREE.Group(); entry.gate.name = `actor:${actor.id || root.name}`; }
      if (entry.cell?.key !== key) {
        this.leaveCell(entry);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = { key, group: new THREE.Group(), entries: new Set(), shown: false };
          cell.group.name = `actor-cell:${key}`; this.cells.set(key, cell); this.group.add(cell.group);
        }
        cell.group.add(entry.gate); cell.entries.add(entry); entry.cell = cell;
      }
      if (root.parent !== entry.gate) entry.gate.add(root); // Every parent is at identity: world transforms stay exact.
      entry.gate.visible = root.visible !== false && this.visibility.intersects(actorBounds(actor, this.box), actor.shadow !== false);
      if (entry.gate.visible) entry.cell.shown = true;
    }
    for (const cell of this.cells.values()) cell.group.visible = cell.shown;
  }
}

/** Register only; first reparenting waits until rendering, after the caller sets resident/riding flags and position. */
export function registerActor(actor, scene, world) {
  if (!cellsEnabled() || !scene?.isScene || world?.scene !== scene) return null;
  const grid = grids.get(scene) || new ActorCellGrid(scene, world);
  grid.add(actor);
  return grid;
}
