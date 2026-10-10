// The electric bulb of "A Year with Grandma": a glass pear on a brass screw base. One shared geometry; each bulb has its
// own glass material so the lamps switch on one by one. Used in the lantern heads of the Star Lamps (structures.js)
// and as the bulb Tamo carries up (director.js).
import * as THREE from 'three';

let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const P = [[0.1, 0], [0.12, 0.08], [0.22, 0.24], [0.3, 0.42], [0.28, 0.58], [0.18, 0.69], [0, 0.73]];
  const glass = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const base = new THREE.CylinderGeometry(0.105, 0.09, 0.18, 12);
  base.translate(0, -0.09, 0);
  const metal = new THREE.MeshStandardMaterial({ name: 'Bulb base', color: '#b9a36a', roughness: 0.45, metalness: 0.7 });
  GEO = { glass, base, metal };
  return GEO;
}

/** A bulb standing on its base, centred on its glass. scale 1 = a glass 0.6 m across (they are tower lamps). */
export function makeBulb(scale = 1) {
  const G = geometry();
  const mat = new THREE.MeshStandardMaterial({ name: 'Bulb glass', color: '#fff4d6', emissive: '#ffe7a8', emissiveIntensity: 0.05, roughness: 0.25, metalness: 0 });
  const g = new THREE.Group();
  g.name = 'bulb';
  const glass = new THREE.Mesh(G.glass, mat), base = new THREE.Mesh(G.base, G.metal);
  glass.position.y = base.position.y = -0.36;
  g.add(glass, base);
  g.scale.setScalar(scale);
  g.userData.glass = mat;
  return g;
}

/** Brightness 0..1 of a bulb: a cold glass at 0, a steady warm white at 1. */
export function bulbGlow(bulb, k) { bulb.userData.glass.emissiveIntensity = 0.05 + k * 5.5; }

export function disposeBulb(bulb) { bulb.removeFromParent(); bulb.userData.glass.dispose(); }
