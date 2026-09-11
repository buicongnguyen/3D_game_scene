import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HOUSE_STYLES,HOUSE_HALF_EXTENT,HOUSE_CHIMNEY_HEIGHT,loadVillageModels,createVillageModels} from '../village-models.js';

for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} Blender houses fit collision bounds, raycast and light correctly`,async()=>{
  let total=0;
  const loader=new GLTFLoader();
  const models=await loadVillageModels(mobile,async name=>{
    const b=readFileSync(new URL(`../public/models/${mobile?'mobile/':''}${name}.glb`,import.meta.url));total+=b.length;
    if(mobile){const original=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));assert.ok(b.length<original.length,'mobile strips small detail');}
    const g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
    assert.ok(g.materials.length<=7);
    let triangles=0;
    for(const mesh of g.meshes)for(const p of mesh.primitives){
      assert.notEqual(p.attributes.COLOR_0,undefined);
      triangles+=g.accessors[p.indices].count/3;
    }
    assert.ok(triangles<2200,`${name} geometry budget`);
    return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  });
  assert.ok(total<(mobile?450000:600000),`${total} download bytes`);
  HOUSE_STYLES.forEach((name,i)=>{
    const b=new THREE.Box3().setFromObject(models[name]);
    assert.ok(b.min.x>=-HOUSE_HALF_EXTENT.x&&b.max.x<=HOUSE_HALF_EXTENT.x,name+' width');
    assert.ok(b.min.z>=-HOUSE_HALF_EXTENT.z&&b.max.z<=HOUSE_HALF_EXTENT.z,name+' depth');
    assert.ok(b.min.y<=-1.9,'foundation reaches terrace');
    assert.ok(b.max.y>=HOUSE_CHIMNEY_HEIGHT[i]-.02,'chimney smoke anchors reach actual cap');
  });
  const scene=new THREE.Scene(),poses=HOUSE_STYLES.map((_,style)=>({style,x:style*15,y:0,z:0,yaw:.6,sx:1,sy:1,sz:1}));
  const result=createVillageModels(scene,models,poses,new THREE.MeshBasicMaterial());scene.updateMatrixWorld(true);
  assert.equal(new Set(result.root.children.map(m=>m.name)).size,4);
  assert.ok(result.root.children.every(m=>m.isInstancedMesh&&m.count===1&&m.userData.depth));
  const matrix=new THREE.Matrix4();result.root.children[0].getMatrixAt(0,matrix);
  // Rotation is -yaw in Three.js, matching the existing positive-yaw collision OBB.
  const worldX=new THREE.Vector3(1,0,0).transformDirection(matrix);
  assert.ok(Math.abs(worldX.z-Math.sin(.6))<1e-5);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1,10),new THREE.Vector3(0,0,-1));
  assert.ok(ray.intersectObjects(result.root.children,false).length,'houses block interaction rays');
  result.updateNight(1);const windows=result.root.children.filter(m=>m.material.name==='village window');
  assert.equal(windows.length,4);assert.ok(windows.every(m=>m.material.emissiveIntensity===.65));
  result.updateNight(0);assert.ok(windows.every(m=>m.material.emissiveIntensity===0));
});
