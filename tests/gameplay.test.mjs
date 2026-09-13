import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync} from 'node:fs';
import {createGameplay} from '../gameplay.js';

for(const [mobile,easy]of [[false,false],[true,false],[true,true]]) test(`real ${mobile?'mobile':'desktop'} ${easy?'Easy Play':'first-person'} assets support shooting, gather, pause, cook and replay`,async()=>{
  const nodes=new Map();
  const node=()=>({style:{},events:{},width:1000,height:600,classList:{toggle(){}},focus(){},setAttribute(){},
    addEventListener(type,fn){(this.events[type]??=[]).push(fn);},
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:600};},
    getContext(){return {drawImage(){},beginPath(){},arc(){},moveTo(){},lineTo(){},stroke(){}};},querySelector(id){
    if(!nodes.has(id)) nodes.set(id,node());return nodes.get(id);
  }});
  const uiDocument={createElement:node,body:{append(){}},documentElement:node()};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const walker={pos:new THREE.Vector3(),groundY:0,yaw:0,vel:new THREE.Vector3(),fly:false,easyPlay:easy};
  const canvas=node();
  camera.position.set(0,1.68,0);
  const loader=new GLTFLoader();
  const obstacles=[];
  let frozen=false;
  const game=await createGameplay({scene,camera,walker,height:()=>0,validGround:()=>true,
    canvas,mobile,toast(){},uiDocument,inputTarget:node(),obstacles,
    habitat:{x:105,z:0,radius:4,spot:new THREE.Vector3(100,0,0),water:()=>2},isFrozen:()=>frozen,
    loadModel:async name=>{
      const bytes=readFileSync(new URL(`../public/models/${mobile?'mobile/':''}${name}.glb`,import.meta.url));
      return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    }});
  const root=scene.getObjectByName('Valley gameplay');
  const tick=(dt=.1,blocked=false)=>game.update(dt,0,true,blocked);
  const interact=()=>nodes.get('#gameInteract').onclick();
  const move=position=>{walker.pos.copy(position);walker.groundY=position.y;camera.position.copy(position);camera.position.y+=1.68;};
  tick();interact();assert.equal(game.complete,false);
  const rabbit=root.children.find(o=>o.name==='rabbit');
  rabbit.position.set(0,0,-10);rabbit.updateWorldMatrix(true,true);
  camera.lookAt(0,.8,-10);camera.updateMatrixWorld(true);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(6,6,1),new THREE.MeshBasicMaterial());
  wall.position.set(0,1,-5);wall.updateMatrixWorld(true);obstacles.push(wall);
  if(easy){
    const event={button:2,pointerId:1,clientX:500,clientY:300,preventDefault(){}};
    for(const fn of canvas.events.pointerdown)fn(event);
    await new Promise(resolve=>setTimeout(resolve,200));game.renderAim();
    assert.equal(walker.aiming,true);assert.ok(Math.abs(rabbit.rotation.z)<1e-8,'opening magnifier never shoots');
  }
  nodes.get('#gameShoot').onclick();assert.ok(Math.abs(rabbit.rotation.z)<1e-8,'wall blocks the shot');
  obstacles.length=0;tick(1);
  camera.lookAt(rabbit.position.x,.8,rabbit.position.z);camera.updateMatrixWorld(true);
  nodes.get('#gameShoot').onclick();assert.equal(rabbit.rotation.z,Math.PI/2,'mesh raycast hits exposed rabbit');
  for(const type of ['wood','berries']){
    for(const item of root.children.filter(o=>o.name===type).slice(0,2)){
      move(item.position);tick();interact();assert.equal(item.visible,false);
      interact(); // Repeated input must not duplicate a pickup.
    }
  }
  assert.match(nodes.get('#gameSupplies').textContent,/Wood 2\/2 · Food 2\/2/);
  move(new THREE.Vector3());tick();interact();
  tick(4,true);assert.equal(game.complete,false,'menu pauses cooking');
  tick(1);move(new THREE.Vector3(10,0,0));tick();
  move(new THREE.Vector3());tick(4);assert.equal(game.complete,false,'leaving cancels cooking');
  interact();tick(3.1);assert.equal(game.complete,true);
  assert.match(nodes.get('#gameSupplies').textContent,/Meals 1/);
  nodes.get('#gameReplay').onclick();assert.equal(game.complete,false);
  assert.equal(game.elapsed,0);assert.equal(walker.pos.length(),0);
  assert.equal(root.children.filter(o=>o.name==='wood'&&o.visible).length,5);
  move(new THREE.Vector3(100,0,0));tick();interact();tick(3.1);
  assert.match(nodes.get('#gameSupplies').textContent,/Food 1\/2/);
  interact();tick(1);move(new THREE.Vector3());tick(3);
  assert.match(nodes.get('#gameSupplies').textContent,/Food 1\/2/,'leaving shore cancels fishing');
  move(new THREE.Vector3(100,0,0));tick();interact();frozen=true;tick(4);
  assert.match(nodes.get('#gameSupplies').textContent,/Food 1\/2/,'freezing cancels fishing');
  assert.equal(root.getObjectByName('River wildlife').visible,false);
});
