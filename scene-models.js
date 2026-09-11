import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SCENE_MODELS=['sheep','rabbit','peacock','chicken','bear','fox','bird','locomotive','tender','coach','train-wheel'];
export async function loadSceneModels(mobile, loadModel){
  const loader=new GLTFLoader(), models={};
  await Promise.all(SCENE_MODELS.map(async name=>{
    const gltf=await (loadModel?loadModel(name):loader.loadAsync(`${import.meta.env.BASE_URL}models/${mobile?'mobile/':''}${name}.glb`));
    gltf.scene.updateMatrixWorld(true);models[name]=gltf.scene;
  }));
  return models;
}

// Material-level instancing keeps populations from multiplying draw calls.
export function createModelWildlife(parent,models,capacity,birdCapacity){
  const root=new THREE.Group();root.name='Blender seasonal wildlife';parent.add(root);
  const names=['sheep','rabbit','peacock','chicken','bear','fox','bird'];
  const pools=names.map((name,species)=>{
    const parts=[];
    models[name].traverse(o=>{
      if(!o.isMesh)return;
      const mesh=new THREE.InstancedMesh(o.geometry,o.material,species===6?birdCapacity:capacity);
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(mesh);
      parts.push({mesh,base:o.matrixWorld.clone(),wing:species===6&&o.name.includes('wing'),foot:o.name.includes('foot'),side:Math.sign(o.position.x)||1});
    });
    return {parts,count:0};
  });
  const transform=new THREE.Object3D(),local=new THREE.Matrix4(),matrix=new THREE.Matrix4(),rotation=new THREE.Matrix4();
  function append(species,x,y,z,size,yaw,pitch,phase,moving){
    const pool=pools[species],index=pool.count;
    if(index>=(species===6?birdCapacity:capacity))return;
    transform.position.set(x,y,z);transform.scale.setScalar(size);transform.rotation.set(pitch,yaw,0,'YXZ');transform.updateMatrix();
    for(const part of pool.parts){
      local.copy(part.base);
      if(part.wing) local.multiply(rotation.makeRotationZ(Math.sin(phase)*.55*part.side));
      else if(part.foot) local.multiply(rotation.makeRotationX(Math.sin(phase+part.side)*moving*.3));
      matrix.multiplyMatrices(transform.matrix,local);part.mesh.setMatrixAt(index,matrix);
    }
    pool.count++;
  }
  return {root,pools,
    update({fauna,birds,camera,time,showFauna,far=140,faunaScale=1,birdScale=1}){
      for(const pool of pools)pool.count=0;
      if(showFauna&&faunaScale>0)for(const d of fauna){
        if(!d.alive||d.lodTicket>faunaScale)continue;
        const dx=d.x-camera.x,dz=d.z-camera.z;
        if(dx*dx+dz*dz>far*far)continue;
        append(d.species,d.x,d.y-d.size*.72,d.z,d.size,-d.heading-Math.PI/2,0,time*4+d.turnSeed,Math.min(1,Math.hypot(d.vx,d.vz)));
      }
      for(const b of birds){
        if(birdScale<=0||b.ph>birdScale)continue;
        const dx=b.x-camera.x,dy=b.y-camera.y,dz=b.z-camera.z;
        if(dx*dx+dy*dy+dz*dz>Math.pow(far*2.5,2))continue;
        const speed=Math.hypot(b.vx,b.vy,b.vz);
        append(6,b.x,b.y,b.z,b.p.size,Math.atan2(-b.vx,-b.vz),Math.asin(Math.max(-1,Math.min(1,b.vy/Math.max(.001,speed)))),b.p.age*Math.PI*2,0);
      }
      for(const pool of pools)for(const part of pool.parts){part.mesh.count=pool.count;part.mesh.instanceMatrix.needsUpdate=true;}
    }
  };
}

export function upgradeTrain(train,models){
  function replaceBody(group,name){
    const previous=group.children[0];group.remove(previous);
    previous.geometry?.dispose();
    const object=models[name].clone(true);group.add(object);
    return object;
  }
  train.body=replaceBody(train.locoGroup,'locomotive');
  replaceBody(train.tenderGroup,'tender');
  for(const car of train.cars)replaceBody(car,'coach');
  const oldGeometry=new Set();
  for(const wheel of train.wheels){
    const previous=wheel.m,object=new THREE.Group();
    object.name='Blender wheel pose';
    object.position.copy(previous.position);
    object.scale.setScalar(wheel.drive?train.driveRadius:wheel.r);
    previous.parent.add(object);previous.parent.remove(previous);
    oldGeometry.add(previous.geometry);wheel.m=object;
  }
  for(const geometry of oldGeometry)geometry.dispose();
  const wheelParts=[];
  models['train-wheel'].traverse(o=>{
    if(!o.isMesh)return;
    const mesh=new THREE.InstancedMesh(o.geometry,o.material,train.wheels.length);
    mesh.name='Blender train wheels';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    train.group.add(mesh);wheelParts.push({mesh,base:o.matrixWorld.clone()});
  });
  const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),pose=new THREE.Matrix4();
  train.updateBlenderWheels=()=>{
    train.group.updateMatrixWorld(true);inverse.copy(train.group.matrixWorld).invert();
    for(let i=0;i<train.wheels.length;i++){
      pose.multiplyMatrices(inverse,train.wheels[i].m.matrixWorld);
      for(const part of wheelParts){matrix.multiplyMatrices(pose,part.base);part.mesh.setMatrixAt(i,matrix);}
    }
    for(const part of wheelParts)part.mesh.instanceMatrix.needsUpdate=true;
  };
}
