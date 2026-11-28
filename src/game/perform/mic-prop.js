// © 2026 Bui Cong Nguyen · solluxlabs.com
// The lead singer's hand mic: one small mesh, one material (colours in the vertices: a dark body, a gold band, a silver
// grille), built in code (~300 triangles, no download), on her grip_R bone where mic-grip.js fitted the handle in that
// body's own palm (content/kotone-club-fit.js, the bake's Kotone fit, only without a fit). Shown only while she sings
// (scaled in and out), no shadow. The shape follows Avatar Studio's stage mic (src/stage-mic-prop.js): a 36 mm handle in
// the fist, a short tail below the little finger, a neck widening to a 38 mm ball head above the thumb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MIC_FIT } from '../../content/kotone-club-fit.js';

const BODY = new THREE.Color('#1c1d22'), BAND = new THREE.Color('#c9a86a'), GRILLE = new THREE.Color('#aab1ba');

/** The mic's geometry in metres, the handle's centre at the origin, the head up +Y. */
export function micGeometry({ radius = .02, half = .034, headR = .019, neck = .006, tail = .07 } = {}) {
  const parts = [];
  const add = (geo, y, color) => { geo.translate(0, y, 0); const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) color.toArray(c, i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g); };
  add(new THREE.CylinderGeometry(radius, radius, 2 * half, 10, 1, true), 0, BODY);
  add(new THREE.CylinderGeometry(radius, radius * .8, tail, 10, 1, true), -half - tail / 2, BODY);
  add(new THREE.CircleGeometry(radius * .8, 10).rotateX(Math.PI / 2), -half - tail, BODY);
  add(new THREE.CylinderGeometry(headR * .8, radius, neck, 10, 1, true), half + neck / 2, BODY);
  add(new THREE.CylinderGeometry(headR * .88, headR * .88, headR * .22, 12, 1, true), half + neck + headR * .1, BAND);
  add(new THREE.SphereGeometry(headR, 12, 8), half + neck + headR * .82, GRILLE);
  const g = mergeGeometries(parts); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

let mat = null;
const geos = new Map();
/** The capsule's centre up the mic's axis from the handle's centre (metres, micGeometry's defaults). */
export const micHeadY = half => half + .006 + .019 * .82;
/**
 * A mic placed on `model`'s grip_R (null when the model has no grip). One mesh, one material, geometry shared by size.
 * fit: mic-grip.js fitMicGrip(model) (the handle fitted in this body's palm); without one, Kotone's baked MIC_FIT.
 */
export function makeMic(model, fit = null) {
  const grip = model.getObjectByName('grip_R'); if (!grip) return null;
  const own = Boolean(fit?.grip), radius = own ? fit.r : MIC_FIT.radius, half = own ? +fit.half.toFixed(4) : MIC_FIT.half, key = `${radius}:${half}:${own ? fit.tail : ''}`;
  mat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .5 });
  if (!geos.has(key)) geos.set(key, micGeometry(own ? { radius, half, tail: fit.tail } : { radius, half }));
  const mesh = new THREE.Mesh(geos.get(key), mat);
  mesh.name = 'KotoneMic';
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
  if (own) { mesh.position.copy(fit.grip.centre); mesh.quaternion.copy(fit.grip.quaternion); }
  else { mesh.position.fromArray(MIC_FIT.centre); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().fromArray(MIC_FIT.up).normalize()); }
  const s = own ? fit.grip.scale : MIC_FIT.scale; mesh.scale.setScalar(s);
  mesh.userData.headY = micHeadY(half);
  mesh.visible = false;
  grip.add(mesh);
  return {
    mesh,
    /** 0..1 shown (a scale pop in and out; invisible at 0). */
    show(k) { mesh.visible = k > .02; if (mesh.visible) mesh.scale.setScalar(s * (.4 + .6 * k)); },
    dispose() { mesh.removeFromParent(); },
  };
}
