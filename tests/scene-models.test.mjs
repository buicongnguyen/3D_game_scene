import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SCENE_MODELS,loadSceneModels,createModelWildlife,upgradeTrain} from '../scene-models.js';

for(const mobile of [false,true])test(`Blender scene models: ${mobile?'mobile':'desktop'} budgets, motion, culling and train assembly`,async()=>{
  const loader=new GLTFLoader();let bytes=0;
  const models=await loadSceneModels(mobile,async name=>{
    const b=readFileSync(new URL(`../public/models/${mobile?'mobile/':''}${name}.glb`,import.meta.url));
    assert.equal(b.readUInt32LE(8),b.length);
    bytes+=b.length;
    const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
    assert.ok(gltf.materials.length<=6,name);
    let triangles=0;
    for(const mesh of gltf.meshes)for(const p of mesh.primitives){
      assert.notEqual(p.attributes.COLOR_0,undefined,name);
      triangles+=gltf.accessors[p.indices].count/3;
      assert.ok(gltf.accessors[p.attributes.POSITION].min.every(Number.isFinite));
    }
    assert.ok(triangles<(mobile?4000:10000),`${name}: ${triangles}`);
    return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  });
  assert.equal(Object.keys(models).length,SCENE_MODELS.length);
  assert.ok(bytes<(mobile?1000000:1900000),String(bytes));
  const parent=new THREE.Group(),wildlife=createModelWildlife(parent,models,8,8);
  const fauna=Array.from({length:6},(_,species)=>({alive:true,species,x:species,y:.72,z:0,size:1,heading:0,turnSeed:0,vx:1,vz:0,lodTicket:.1}));
  const bird={x:0,y:10,z:0,vx:1,vy:1,vz:0,ph:.1,p:{size:1,age:.1}};
  const args={fauna,birds:[bird],camera:new THREE.Vector3(),time:1,showFauna:true,far:100};
  wildlife.update(args);
  for(const pool of wildlife.pools){
    assert.equal(pool.count,1);
    for(const part of pool.parts){
      assert.equal(part.mesh.count,1);
      assert.ok([...part.mesh.instanceMatrix.array.slice(0,16)].every(Number.isFinite));
    }
  }
  const wing=wildlife.pools[6].parts.find(p=>p.wing);assert.ok(wing);
  const old=Array.from(wing.mesh.instanceMatrix.array.slice(0,16));
  bird.p.age=.7;wildlife.update(args);
  assert.notDeepEqual(Array.from(wing.mesh.instanceMatrix.array.slice(0,16)),old,'wings animate');
  wildlife.update({...args,showFauna:false});assert.equal(wildlife.pools[0].count,0);
  bird.ph=0;fauna[0].lodTicket=0;
  wildlife.update({...args,faunaScale:0,birdScale:0});assert.ok(wildlife.pools.every(p=>p.count===0));
  wildlife.update({...args,camera:new THREE.Vector3(1000,0,0)});assert.ok(wildlife.pools.every(p=>p.count===0));
  const group=()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));return g;};
  const train={locoGroup:group(),tenderGroup:group(),cars:Array.from({length:10},group),driveRadius:.7,wheels:[]};
  train.group=new THREE.Group();train.group.add(train.locoGroup,train.tenderGroup,...train.cars);
  for(const container of [train.locoGroup,train.tenderGroup,...train.cars]){
    const wheel=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());wheel.position.set(1,.5,1);container.add(wheel);
    train.wheels.push({m:wheel,r:.5,drive:false});
  }
  upgradeTrain(train,models);
  assert.equal(train.cars.length,10);
  for(const wheel of train.wheels){assert.ok(wheel.m.isGroup);assert.equal(wheel.m.position.x,1);assert.equal(wheel.m.scale.x,.5);wheel.m.rotation.z=1;}
  train.updateBlenderWheels();
  const wheels=train.group.children.filter(o=>o.isInstancedMesh);
  assert.equal(wheels.length,2,'wheel materials are instanced across the full train');
  assert.equal(wheels[0].count,12);
  assert.equal(train.body,train.locoGroup.children.find(o=>o.isGroup&&o!==train.wheels[0].m));
});
