import * as THREE from 'three';
import { paletteMaterial, MAX_PARTS } from './skin-merge.js';

// The people come in two sets: the standard models (8–10 parts, 7–16 thousand triangles each) and the light ones
// made from them by art/blender/light_people.py (`<name>.lite.glb`: one mesh, one draw, 3–6 thousand triangles, the
// same skeleton, clips and attachment nodes). Everything asks the model library for a person by the usual name
// ('mika', 'villager-kid'); the library hands out the set chosen here.
//
// A light model has ONE material. Each vertex carries the number of the part it came from (aPart) and the model
// carries a palette: name, colour, roughness and metalness per part, as the standard materials had them. Colour =
// palette x baked ambient occlusion, the same sum the standard parts make, so the two sets look alike, and a
// villager's shirt, trousers and hair can still be tinted by the part's name.

export const PEOPLE = ['mika', 'genzo', 'rin', 'ota', 'hana', 'sora', 'villager-man', 'villager-woman', 'villager-kid'];
export const PEOPLE_CHOICES = ['auto', 'std', 'lite'];
const KEY = 'starline-opt-people';
const LITE = '.lite';

/** The player's choice in Settings: 'auto' (light on the Low tier, standard elsewhere), 'std' or 'lite'. */
export function getPeopleChoice() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return PEOPLE_CHOICES.includes(v) ? v : 'auto'; } catch { return 'auto'; }
}
export function setPeopleChoice(v) {
  try { localStorage.setItem(KEY, JSON.stringify(PEOPLE_CHOICES.includes(v) ? v : 'auto')); } catch { /* keep playing */ }
}

/**
 * Is this a weak device, one that Automatic gives the light people? The Low tier AND an old or small machine: little
 * memory (navigator.deviceMemory <= 3 GB), few cores (<= 4) or frames already known to run slow. A capable modern
 * phone on Low keeps the standard people; anyone can still choose Light by hand. Pure: the caller passes what it knows.
 */
export function weakDevice({ tier, memory, cores, slow } = {}) {
  if (tier !== 'low') return false;
  return !!slow || (memory != null && memory <= 3) || (cores != null && cores <= 4);
}
const device = () => (typeof navigator === 'undefined' ? {} : { memory: navigator.deviceMemory, cores: navigator.hardwareConcurrency });

/** The set a choice means on this quality tier (and this device). */
export const peopleSetFor = (choice, qualityName, dev = device()) => choice === 'lite' || choice === 'std' ? choice
  : weakDevice({ tier: qualityName, ...dev }) ? 'lite' : 'std';

/** The set to load now: `?people=lite|std` (testing) wins over the setting. -> 'lite' | 'std' */
export function peopleSet(qualityName, params, dev) {
  const url = params?.get?.('people');
  if (url === 'lite' || url === 'light') return 'lite';
  if (url === 'std' || url === 'standard') return 'std';
  return peopleSetFor(getPeopleChoice(), qualityName, dev);
}

/** The file (without .glb) that holds `name` in this set. */
export const peopleFile = (name, set) => set === 'lite' && PEOPLE.includes(name) ? name + LITE : name;

const liteMesh = root => { let m = null; root?.traverse?.(o => { if (!m && o.isSkinnedMesh && o.userData.people?.parts) m = o; }); return m; };
export const isLite = root => !!liteMesh(root);

// what a light model's palette is made from, by its source file (kept out of userData: clones copy that as JSON)
const LIBS = new Map();

function build(mesh, tint) {
  const lib = LIBS.get(mesh.userData.people.source), pal = [], metal = [];
  for (let i = 0; i < MAX_PARTS; i++) {
    const p = lib.parts[i];
    const c = p ? tint?.[p.name] ? new THREE.Color(tint[p.name]) : lib.colors[i] : null;
    pal.push(p ? new THREE.Vector4(c.r, c.g, c.b, p.roughness) : new THREE.Vector4(1, 1, 1, 1));
    metal.push(p ? p.metalness : 0);
  }
  const m = paletteMaterial(lib.base, pal, metal);
  m.name = 'People palette';
  return m;
}

/** A freshly loaded light model: its part numbers become the palette attribute, its one material the palette shader. */
export function prepareLite(gltf) {
  const mesh = liteMesh(gltf.scene);
  if (!mesh) return false;
  const g = mesh.geometry, info = mesh.userData.people;
  if (g.attributes._part) { g.setAttribute('aPart', g.attributes._part); g.deleteAttribute('_part'); }
  if (!g.attributes.aPart || info.parts.length > MAX_PARTS) { console.warn('[people] light model without part numbers', info.source); return false; }
  LIBS.set(info.source, {
    parts: info.parts, base: mesh.material,
    // (the colours in the file are linear, like every glTF base colour)
    colors: info.parts.map(p => new THREE.Color().setRGB(p.color[0], p.color[1], p.color[2], THREE.LinearSRGBColorSpace)),
  });
  mesh.material = build(mesh, null);
  gltf.scene.userData.lite = true;
  return true;
}

/**
 * Tint parts of a light person by name ({ 'Villager shirt': '#e0567a', … }): this clone gets a palette of its own.
 * Returns false for a standard model (the caller then tints its materials, as before).
 */
export function tintLite(model, tint) {
  const mesh = liteMesh(model);
  if (!mesh) return false;
  if (tint && LIBS.get(mesh.userData.people.source)?.parts.some(p => tint[p.name])) mesh.material = build(mesh, tint);
  return true;
}
