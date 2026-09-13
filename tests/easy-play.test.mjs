import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {updateEasyPlay,magnifierCrop,EASY_PLAY} from '../easy-play.js';
import {createAimView} from '../aim-view.js';

test('Easy Play keeps a grounded anchor, fixed view and screen-relative movement',()=>{
  const walker={keys:{KeyW:true},joyX:0,joyY:0,yaw:0,pos:new THREE.Vector3(),vel:new THREE.Vector3(),cam:new THREE.PerspectiveCamera(),groundY:0};
  const ground=()=>10,collide=(x,z)=>[x,z];
  updateEasyPlay(walker,1,ground,collide);
  assert.equal(walker.pos.z,-5);assert.equal(walker.cam.position.y,18);assert.equal(walker.groundY,10);
  const dir=new THREE.Vector3();walker.cam.getWorldDirection(dir);
  assert.ok(Math.abs(Math.asin(-dir.y)-EASY_PLAY.pitch)<1e-5);
  walker.aiming=true;updateEasyPlay(walker,1,ground,collide);assert.equal(walker.pos.z,-5);assert.equal(walker.vel.length(),0);
  walker.aiming=false;walker.yaw=Math.PI/2;updateEasyPlay(walker,1,ground,collide);assert.ok(Math.abs(walker.pos.x+5)<1e-5);
  updateEasyPlay(walker,1,ground,()=>[0,0]);assert.equal(walker.pos.length(),0,'collision result is respected');
});

test('magnifier crops stay inside the frame, including corners and portrait screens',()=>{
  assert.equal(magnifierCrop(1280,720,.5,.5).w,120,'360px panel displays a 120px region at 3x');
  assert.equal(magnifierCrop(640,360,.5,.5,360/220,360,1280).w,60,'render scaling preserves 3x CSS magnification');
  for(const [w,h]of [[1280,720],[390,844]])for(const u of [0,.5,1])for(const v of [0,.5,1]){
    const c=magnifierCrop(w,h,u,v);assert.ok(c.x>=0&&c.y>=0);assert.ok(c.x+c.w<=w+.001&&c.y+c.h<=h+.001);
    assert.ok(c.cx>=c.x&&c.cx<=c.x+c.w+.001);assert.ok(c.cy>=c.y&&c.cy<=c.y+c.h+.001);
  }
});

test('hold magnifier rejects quick taps, tracks aim and releases safely',()=>{
  const nodes=new Map();let draws=0,shots=0,aims=0,time=0;
  const node=()=>({width:360,height:220,events:{},setAttribute(){},setPointerCapture(){},
    addEventListener(n,fn){this.events[n]=fn;},getBoundingClientRect(){return {left:0,top:0,width:this.width,height:this.height};},
    getContext(){return {drawImage(){draws++;},beginPath(){},arc(){},moveTo(){},lineTo(){},stroke(){}};},
    querySelector(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}});
  const canvas=node(),document={createElement:node,body:{append(){}},documentElement:{classList:{toggle(){}}}};
  const walker={easyPlay:true,cinematic:0,gameActive:true,keys:{KeyW:true},joyX:1,joyY:1,vel:new THREE.Vector3(1,0,0)};
  const aim=createAimView({canvas,document,walker,now:()=>time,onAim(){aims++;},onShoot(){shots++;}});
  let prevented=false;
  const event={button:2,pointerType:'mouse',pointerId:1,clientX:180,clientY:110,preventDefault(){prevented=true;}};
  canvas.events.pointerdown(event);canvas.events.pointerup(event);
  assert.equal(prevented,false,'mouse pointerdown must not suppress compatibility mouse button events');
  time=200;aim.render(false);assert.equal(aim.opened,false,'quick tap cannot activate');
  canvas.events.pointerdown(event);time=400;aim.render(false);
  assert.equal(aim.opened,true);assert.equal(walker.aiming,true);assert.equal(walker.vel.length(),0);assert.equal(shots,0);
  aim.render(true);assert.equal(draws,2);assert.equal(nodes.get('#aimShoot').disabled,false);
  nodes.get('#aimShoot').onclick();assert.equal(shots,1);
  const view=nodes.get('#aimCanvas');view.events.pointerdown(event);view.events.pointermove({...event,clientX:200});assert.equal(aims,2);
  canvas.events.mousedown({...event,button:0});assert.equal(shots,2,'left mouse fires while right is held');
  canvas.events.mouseup({...event,button:0});assert.equal(aim.opened,true,'left mouse release keeps scope held');
  canvas.events.pointerup(event);assert.equal(aim.opened,false);
  aim.render(false);assert.equal(draws,2,'closed scope does not render');assert.equal(walker.aiming,false);
  const hold=nodes.get('#huntAim');hold.events.pointerdown({...event,button:0});time=600;aim.render(true);
  hold.events.pointermove({...event,clientX:200});assert.equal(aim.opened,true);
  nodes.get('#huntFire').onclick();assert.equal(shots,3,'other thumb fires without closing scope');
  hold.events.pointercancel(event);assert.equal(aim.opened,false);
  hold.events.pointerdown(event);aim.close();time=800;aim.render(false);assert.equal(aim.opened,false,'cancelled pending hold stays closed');
  hold.events.pointerdown(event);walker.gameActive=false;time=1000;aim.render(false);assert.equal(aim.opened,false,'menu cancels pending hold');
});
