import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const HOUSE_STYLES=['house-two-storey','house-old','house-new','house-art'];
export const HOUSE_CHIMNEY_HEIGHT=[7.264,4.664,3.964,5.264];
// Includes eaves, window sills and the doorstep, not just the wall rectangle.
export const HOUSE_HALF_EXTENT={x:2.34,z:3.03};
export async function loadVillageModels(mobile,loadModel){
  const loader=new GLTFLoader(),models={};
  await Promise.all(HOUSE_STYLES.map(async name=>{
    const gltf=await(loadModel?loadModel(name):loader.loadAsync(`${import.meta.env.BASE_URL}models/${mobile?'mobile/':''}${name}.glb`));
    gltf.scene.updateMatrixWorld(true);models[name]=gltf.scene;
  }));
  return models;
}
export function createVillageModels(scene,models,houses,depth){
  const root=new THREE.Group();root.name='Blender village houses';scene.add(root);
  const object=new THREE.Object3D(),matrix=new THREE.Matrix4(),windows=[];
  for(let style=0;style<HOUSE_STYLES.length;style++){
    const poses=houses.filter(h=>h.style===style);if(!poses.length)continue;
    models[HOUSE_STYLES[style]].traverse(part=>{
      if(!part.isMesh)return;
      const material=part.material.clone();
      if(material.name==='village window'){material.emissive.set(0xffb75c);windows.push(material);}
      const mesh=new THREE.InstancedMesh(part.geometry,material,poses.length);
      mesh.name=HOUSE_STYLES[style];mesh.userData.depth=depth;
      for(let i=0;i<poses.length;i++){
        // Existing village yaw/OBB uses the opposite sign to Three.js rotation Y.
        const h=poses[i];object.position.set(h.x,h.y,h.z);object.rotation.set(0,-h.yaw,0);object.scale.set(h.sx,h.sy,h.sz);object.updateMatrix();
        matrix.multiplyMatrices(object.matrix,part.matrixWorld);mesh.setMatrixAt(i,matrix);
      }
      mesh.computeBoundingSphere();mesh.computeBoundingBox();root.add(mesh);
    });
  }
  return {root,updateNight(night){for(const mat of windows)mat.emissiveIntensity=Math.max(0,Math.min(1,night))*.65;}};
}
