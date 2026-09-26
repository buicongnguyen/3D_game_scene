import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {updateViewDepth,updateModelLighting,trainMaterial,sceneSamples} from '../render-stability.js';

test('aerial depth precision improves without clipping first-person equipment',()=>{
  const camera=new THREE.PerspectiveCamera(60,1,.12,14000);
  const original=camera.projectionMatrix.clone();
  const depthStep=(near,distance)=>distance*distance*(14000-near)/(14000*near*(2**24-1));
  updateViewDepth(camera,true);
  assert.equal(camera.near,1.2);
  assert.ok(depthStep(camera.near,300)<.005,'sub-half-centimetre depth resolution at 300m');
  assert.ok(depthStep(camera.near,300)<depthStep(.12,300)/9);
  camera.updateProjectionMatrix=()=>{throw new Error('unchanged mode must not rebuild projection');};
  updateViewDepth(camera,true);
  delete camera.updateProjectionMatrix;
  updateViewDepth(camera,false);
  assert.equal(camera.near,.12);assert.deepEqual(camera.projectionMatrix,original);
});

test('daytime model fill remains readable, night stays dim and transitions smoothly',()=>{
  const sun={},ambient={};
  updateModelLighting(sun,ambient,Math.sin(14*Math.PI/180));
  assert.equal(sun.intensity,2.2);assert.equal(ambient.intensity,1.25);
  let previous=0;
  for(let h=-1;h<=1;h+=.001){
    updateModelLighting(sun,ambient,h);
    assert.ok(Number.isFinite(sun.intensity+ambient.intensity));
    assert.ok(ambient.intensity>=previous);previous=ambient.intensity;
    assert.ok(sun.intensity>=0&&sun.intensity<=2.2);
    if(h<0)assert.equal(sun.intensity,0);
  }
  updateModelLighting(sun,ambient,-.24);assert.equal(ambient.intensity,.32);
});

test('train finishes retain vertex color and do not modify shared source assets',()=>{
  const source=new THREE.MeshStandardMaterial({metalness:.65,roughness:.35,vertexColors:true});
  source.name='locomotive enamel';
  const result=trainMaterial(source);
  assert.notEqual(result,source);assert.equal(result.metalness,.05);
  assert.equal(result.roughness,.64);assert.equal(result.vertexColors,true);
  assert.equal(source.metalness,.65);assert.equal(source.color.r,1);
  assert.equal(result.color.r,1.35);
});

test('edge antialiasing respects low/mobile budgets and hardware sample limits',()=>{
  assert.deepEqual([0,1,2,3,4].map(q=>sceneSamples(q,false,4)),[0,0,2,4,4]);
  assert.deepEqual([0,1,2,3,4].map(q=>sceneSamples(q,true,4)),[0,0,0,2,2]);
  assert.equal(sceneSamples(4,false,2),2);assert.equal(sceneSamples(4,false,0),0);
});
