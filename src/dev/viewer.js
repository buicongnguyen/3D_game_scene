// Development viewer: ?view=x,y,z,tx,ty,tz&season=autumn&hour=17 renders the world from a fixed camera.
// Used by .tools/dev/capture.mjs for look-development screenshots.
import * as THREE from 'three';

export function viewerCamera(camera, params) {
  const v = params.get('view');
  if (!v) return false;
  const [x, y, z, tx, ty, tz] = v.split(',').map(Number);
  camera.position.set(x, y, z);
  camera.lookAt(new THREE.Vector3(tx, ty, tz));
  return true;
}
