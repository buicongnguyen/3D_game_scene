import * as THREE from 'three';

export const EASY_PLAY={height:8,pitch:35*Math.PI/180,speed:5};
export function updateEasyPlay(walker,dt,height,collide){
  const k=walker.keys;
  let forward=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  let side=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);
  if(Math.hypot(walker.joyX,walker.joyY)>.001){forward=-walker.joyY;side=walker.joyX;}
  if(walker.aiming){forward=side=0;}
  const amount=Math.max(1,Math.hypot(forward,side));forward/=amount;side/=amount;
  const sy=Math.sin(walker.yaw),cy=Math.cos(walker.yaw),speed=EASY_PLAY.speed*(k.ShiftLeft||k.ShiftRight?1.6:1);
  const vx=(-sy*forward+cy*side)*speed,vz=(-cy*forward-sy*side)*speed;
  walker.vel.set(vx,0,vz);walker.speed=Math.hypot(vx,vz);
  const x=Math.max(-1050,Math.min(1050,walker.pos.x+vx*dt)),z=Math.max(-1050,Math.min(1050,walker.pos.z+vz*dt));
  const resolved=collide(x,z,walker.groundY,.42);walker.pos.x=resolved[0];walker.pos.z=resolved[1];
  walker.groundY=height(walker.pos.x,walker.pos.z);walker.fly=false;walker.freeY=undefined;walker.flyY=0;
  const back=EASY_PLAY.height/Math.tan(EASY_PLAY.pitch);
  const cx=walker.pos.x+sy*back,cz=walker.pos.z+cy*back;
  walker.cam.position.set(cx,Math.max(walker.groundY+EASY_PLAY.height,height(cx,cz)+2.5),cz);
  const target=walker.easyTarget||(walker.easyTarget=new THREE.Vector3());
  target.set(walker.pos.x,walker.groundY,walker.pos.z);walker.cam.lookAt(target);
  if(walker.easyObstacles?.length){
    const ray=walker.easyRay||(walker.easyRay=new THREE.Raycaster());
    const origin=walker.easyOrigin||(walker.easyOrigin=new THREE.Vector3());
    const direction=walker.easyDirection||(walker.easyDirection=new THREE.Vector3());
    origin.copy(target);origin.y+=1;
    direction.copy(walker.cam.position).sub(origin);const distance=direction.length();direction.normalize();
    ray.set(origin,direction);ray.far=distance;
    const hit=ray.intersectObjects(walker.easyObstacles,false)[0];
    if(hit){
      walker.cam.position.copy(origin).addScaledVector(direction,Math.max(.5,hit.distance-.7));
      walker.cam.position.y=Math.max(walker.cam.position.y,height(walker.cam.position.x,walker.cam.position.z)+1);
      walker.cam.lookAt(target);
    }
  }
}

export function magnifierCrop(width,height,u,v,aspect=360/220,displayWidth=360,viewportWidth=width){
  const w=Math.min(width,height*aspect,width*displayWidth/Math.max(1,viewportWidth)/3),h=w/aspect;
  const cx=u*width,cy=v*height;
  return {x:Math.max(0,Math.min(width-w,cx-w/2)),y:Math.max(0,Math.min(height-h,cy-h/2)),w,h,cx,cy};
}
