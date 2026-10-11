import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import swimming, { POOL, makePool, swimInput, takeSwimmer } from '../src/game/tricks/swimming.js';
import { FollowCamera } from '../src/actors/camera.js';
import { placeProblems } from '../src/world/roads.js';
import { SWIM } from '../src/game/tricks/rules-swimming.js';
import { TRICK, recordRound, cleanTricks } from '../src/content/tricks.js';

function player() {
  const inherited = { update() { throw new Error('world physics must be bypassed in the temporary pool'); } };
  const p = Object.assign(Object.create(inherited), { pos:new THREE.Vector3(-9,3,53), vel:new THREE.Vector3(2,0,-1),
    facing:.7,swimming:false,pitch:0,speed:2,grounded:true,locked:false,root:new THREE.Group(),pivot:new THREE.Group() });
  p.root.position.copy(p.pos);p.root.rotation.y=p.facing;
  p.anim={currentName:'Walk',current:{time:.7,timeScale:.8},cancelOneShot(){},play(name){this.currentName=name;},update(){},snap(name,{time,speed}){this.currentName=name;this.current.time=time;this.current.timeScale=speed;}};
  return p;
}
const vector = v => v.toArray();
const playerState = p => ({pos:vector(p.pos),vel:vector(p.vel),root:vector(p.root.position),facing:p.facing,swimming:p.swimming,
  pitch:p.pitch,speed:p.speed,grounded:p.grounded,locked:p.locked,pivot:p.pivot.rotation.toArray(),clip:p.anim.currentName,
  time:p.anim.current.time,animationSpeed:p.anim.current.timeScale,ownUpdate:Object.hasOwn(p,'update'),ownPose:Object.hasOwn(p,'pose')});

test('pool and its full apron stand on dry, clear land; swimming is a stable longer trick/save record',()=>{
  for(let x=-POOL.apronX;x<=POOL.apronX;x++)for(let z=-POOL.apronZ;z<=POOL.apronZ;z++)assert.deepEqual(placeProblems(POOL.x+x,POOL.z+z),[]);
  assert.equal(TRICK.swimming.length,240);assert.deepEqual(TRICK.swimming.stars,[60,80,95]);
  const {rec}=recordRound(undefined,TRICK.swimming,96);
  assert.deepEqual(cleanTricks({swimming:rec}),{swimming:{learned:true,best:96,stars:3,plays:1}});
});

test('keyboard, touch and existing gamepad X holds map consistently; disabled input cannot act or move',()=>{
  const input={enabled:true,held:a=>a==='act',pressed:()=>false,move:{x:.4,y:.8}};
  assert.deepEqual(swimInput(input),{act:true,mx:.4,mv:-.8});
  input.held=()=>false;input._gp={act:true};assert.equal(swimInput(input).act,true);
  input._gp.act=false;assert.equal(swimInput(input,true).act,true);
  input.enabled=false;assert.deepEqual(swimInput(input,true),{act:false,mx:0,mv:0});
});

test('temporary swimmer owns only the instance and restores inherited/own properties and all changed motion state',()=>{
  for(const own of [false,true]) {
    const p=player();if(own)Object.defineProperty(p,'update',{value(){},writable:true,enumerable:false,configurable:true});
    const before=playerState(p),desc=Object.getOwnPropertyDescriptor(p,'update'),oldUpdate=p.update;
    const restore=takeSwimmer(p);p.pos.set(0,4,0);p.facing=2;p.pitch=1.15;p.pose='Swim';p.poseSpeed=.6;p.speed=.7;p.update(.05);
    assert.deepEqual(vector(p.root.position),[0,4,0]);assert.equal(p.pivot.rotation.x,1.15);assert.equal(p.anim.currentName,'Swim');
    restore();restore();assert.deepEqual(playerState(p),before);assert.equal(p.update,oldUpdate);assert.deepEqual(Object.getOwnPropertyDescriptor(p,'update'),desc);
  }
});

test('pool disposal removes transient actors and geometry without disposing library assets; repeated cleanup is safe',()=>{
  const scene=new THREE.Scene(),libraryGeo=new THREE.BoxGeometry(),libraryMat=new THREE.MeshStandardMaterial();let libraryDisposals=0;
  libraryGeo.addEventListener('dispose',()=>libraryDisposals++);libraryMat.addEventListener('dispose',()=>libraryDisposals++);
  const assets={clone(){const g=new THREE.Group();g.add(new THREE.Mesh(libraryGeo,libraryMat));return g;}};
  for(let repeat=0;repeat<3;repeat++) {
    const pool=makePool({scene,assets,world:{heightAt:()=>3,quality:{mergeChars:false}}});
    assert.equal(scene.children.length,1);assert.equal(pool.group.name,'swimming-practice');assert.equal(pool.coach.id,'swim-coach');assert.equal(pool.adult.id,'swim-watcher');
    let ownedDisposals=0;pool.target.material.addEventListener('dispose',()=>ownedDisposals++);
    pool.dispose();pool.dispose();assert.equal(scene.children.length,0);assert.equal(ownedDisposals,1);assert.equal(libraryDisposals,0);
  }
  libraryGeo.dispose();libraryMat.dispose();
});

// Lightweight DOM exercises the actual round and button listeners without a GPU or source-text assertions.
class Element extends EventTarget {
  constructor(){super();this.style={};this.textContent='';this.children=[];this.nodes=new Map();this.classes=new Set();
    this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x))};}
  append(el){this.children.push(el);el.parent=this;}appendChild(el){this.append(el);}
  querySelector(s){if(!this.nodes.has(s))this.nodes.set(s,new Element());return this.nodes.get(s);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}
  setPointerCapture(){}
}
function dom() {
  const names=['document','window','innerHeight','innerWidth'],previous=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  const document=Object.assign(new EventTarget(),{body:new Element(),head:new Element(),hidden:false,createElement:()=>new Element(),getElementById(id){return [...this.head.children,...this.body.children].find(e=>e.id===id)||null;}});
  const window=new EventTarget();Object.assign(globalThis,{document,window,innerHeight:844,innerWidth:390});
  return {document,window,restore(){for(const [n,d]of previous){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}}};
}
function fixture(loop) {
  const p=player(),scene=new THREE.Scene(),assets={clone:()=>new THREE.Group()},world={heightAt:()=>3,quality:{mergeChars:false}};
  const camera=new THREE.PerspectiveCamera(55,390/844,.1,500);camera.position.set(-12,6,55);
  const follow=new FollowCamera(camera,world,{});follow.look.set(-9,4,53);follow.pos.copy(camera.position);
  const input={enabled:true,lastDevice:'keyboard',move:{x:0,y:0},action:false,held(){return this.action;},pressed(){return false;},releaseAll(){this.action=false;this.move.x=this.move.y=0;}};
  const sign={t:{id:'swimming'},obj:new THREE.Group(),hidden:false};scene.add(sign.obj);
  const visitor=new THREE.Group();visitor.name='npc:visitor';visitor.position.set(POOL.x,3,POOL.z);scene.add(visitor);
  const ctx={game:{scene,assets,world,player:p,input,follow,easy:false},player:p,input,first:true,ui:{touch:true},audio:{good(){}},director:{tricks:{signs:[sign]}},
    roundTime:240,quit:false,lookChanges:[],setNight(...args){this.lookChanges.push(args);},lock(on){this.locked=on;},hud(){},loop:fn=>loop(fn,ctx)};
  return {ctx,p,scene,follow,input,sign,visitor};
}
function guided(lesson) {
  if(lesson.needsRelease)return {};
  if(lesson.stage==='bubbles')return {act:lesson.held?lesson.holdTime<1.6-.025:lesson.airTime>=lesson.rules.air};
  if(lesson.stage==='float') {
    if(lesson.floatMode==='back')return {act:lesson.floatBack<SWIM.floatSeconds-1e-6};
    if(lesson.floatMode==='front')return {act:lesson.held?lesson.holdTime<2-.025:lesson.airTime>=lesson.rules.air};
    return {act:!lesson.held};
  }
  const act=!lesson.held&&(lesson.lastStroke===null||lesson.time-lesson.lastStroke>=lesson.rules.beat-.025);
  if(lesson.stage==='tread')return {act};
  const target=lesson.stage==='glide'?SWIM.glide:SWIM.exit,dx=target.x-lesson.position.x,dz=target.z-lesson.position.z,d=Math.hypot(dx,dz);
  return {act:lesson.stage==='turn'?false:act,mx:dx/d,mv:dz/d};
}

test('actual round requires exit check/entry, all six played skills and dry climb before reward, then restores state',async()=>{
  const env=dom();let frames=0,seen=new Set(),dryExit=false;
  const f=fixture(async(fn,ctx)=>{
    for(let i=0;i<6000;i++) {
      const d=ctx.debug,local=d.local,phase=d.phase;seen.add(phase);
      let act=false,mx=0,mv=0;
      if(phase==='check'){mx=local.x<-.1?1:0;act=Math.abs(local.x)<.15;}
      else if(phase==='entry'){mv=local.z>5.1?-1:0;act=local.z<=5.1;}
      else if(phase==='lesson'){const a=guided(d.lesson);act=!!a.act;mx=a.mx||0;mv=a.mv||0;}
      else if(phase==='out')act=true;
      else if(phase==='done'){dryExit=true;assert.ok(ctx.player.pos.y>=d.pool.deckY-.01);assert.equal(ctx.player.pose,'Idle');}
      ctx.input.action=act;ctx.input.move.x=mx;ctx.input.move.y=-mv;ctx.player.update(.05);
      const value=fn(.05);frames++;if(value!==undefined)return value;
    }
    assert.fail(`round stuck ${ctx.debug.phase} ${ctx.debug.lesson.stage}`);
  });
  const before=playerState(f.p),cameraBefore=vector(f.follow.camera.position),children=f.scene.children.slice();
  try {
    const result=await swimming.play(f.ctx);
    assert.equal(result.score,100);assert.equal(result.detail.complete,true);assert.equal(result.detail.skills,6);assert.ok(dryExit&&frames>1400);
    assert.deepEqual([...seen],['check','entry','lesson','out','climbing','done']);assert.equal(f.ctx.debug.exitCheck,true);assert.equal(f.ctx.debug.entered,true);assert.equal(f.ctx.debug.climbed,true);
    assert.deepEqual(playerState(f.p),before);assert.deepEqual(vector(f.follow.camera.position),cameraBefore);assert.deepEqual(f.scene.children,children);
    assert.equal(f.visitor.visible,true);assert.equal(f.sign.hidden,false);assert.equal(f.ctx.locked,false);assert.equal(env.document.getElementById('swimLesson'),null);
    assert.deepEqual(f.ctx.lookChanges,[[true,11],[false]],'daylight practice restores the original story look');
  }finally{env.restore();}
});

test('pointer cancellation, blur, Leave and thrown round errors all release holds and restore the original session',async()=>{
  for(const mode of ['pointercancel','blur','leave','error','timeout']) {
    const env=dom();let f;
    f=fixture(async(fn,ctx)=>{
      const ui=env.document.getElementById('swimLesson'),act=ui.querySelector('.act');
      const down=new Event('pointerdown',{cancelable:true});Object.assign(down,{pointerId:7,button:0});act.dispatchEvent(down);assert.equal(ctx.debug.pointerHeld,true);
      if(mode==='pointercancel'){const e=new Event('pointercancel',{cancelable:true});e.pointerId=7;act.dispatchEvent(e);assert.equal(ctx.debug.pointerHeld,false);}
      if(mode==='blur'){env.window.dispatchEvent(new Event('blur'));assert.equal(ctx.debug.pointerHeld,false);}
      if(mode==='leave'){ui.querySelector('.leave').dispatchEvent(new Event('click'));assert.equal(ctx.debug.pointerHeld,false);assert.equal(ctx.quit,true);return fn(.05);}
      if(mode==='error')throw new Error('injected round failure');
      if(mode==='timeout'){ctx.roundTime=.05;return fn(.05);}
      ctx.quit=true;return fn(.05);
    });
    const before=playerState(f.p),children=f.scene.children.slice();
    try {
      if(mode==='error')await assert.rejects(swimming.play(f.ctx),/injected round failure/);
      else {const r=await swimming.play(f.ctx);assert.equal(r.score,0);if(mode==='timeout')assert.equal(r.detail.complete,false);else assert.equal(r.quit,true);}
      assert.deepEqual(playerState(f.p),before);assert.deepEqual(f.scene.children,children);assert.equal(f.ctx.locked,false);assert.equal(env.document.getElementById('swimLesson'),null);assert.equal(f.visitor.visible,true);
      assert.deepEqual(f.ctx.lookChanges,[[true,11],[false]],mode);
    }finally{env.restore();}
  }
});
