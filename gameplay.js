import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSupplies, cookMeal, objective, MISSION, inReach, dinnerResult } from './game-rules.mjs';

export async function createGameplay({scene,camera,walker,height,validGround,canvas,mobile,toast,obstacles=[],
  loadModel=null,uiDocument=document,inputTarget=window}){
  const root=new THREE.Group(); root.name='Valley gameplay'; scene.add(root);
  const light=new THREE.HemisphereLight(0xffedcf,0x394c43,2.2); root.add(light);
  const loader=new GLTFLoader();
  const models={};
  await Promise.all(['rabbit','wood','berries','camp','bow'].map(async name=>{
    const gltf=await (loadModel?loadModel(name):loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`));
    models[name]=gltf.scene;
  }));
  const camp=new THREE.Vector3(walker.pos.x,0,walker.pos.z);
  camp.y=height(camp.x,camp.z);
  const supplies=createSupplies(), items=[], animals=[];
  let active=false, elapsed=0, cooldown=0, hint='', nearest=null, cooking=0, finishedAt=null;
  const playerGround=new THREE.Vector3(), interactionTarget=new THREE.Vector3();
  const raycaster=new THREE.Raycaster();
  const ray=new THREE.Ray(), forward=new THREE.Vector3(), center=new THREE.Vector3();
  const sphere=new THREE.Sphere(new THREE.Vector3(),.85);
  const markerGeo=new THREE.OctahedronGeometry(.22);
  const markerMat=new THREE.MeshBasicMaterial({color:0xf2c967});
  const bow=models.bow.clone(true); root.add(bow);
  const bowOffset=new THREE.Vector3();
  const trailGeometry=new THREE.BufferGeometry();
  const trailPoints=new Float32Array(6);trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPoints,3));
  const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xeedba5,transparent:true,opacity:.8}));
  trail.frustumCulled=false;trail.visible=false;root.add(trail);
  function model(name,x,z){
    const object=models[name].clone(true); object.name=name;object.position.set(x,height(x,z),z);
    root.add(object); return object;
  }
  // Deterministic radial placement with terrain/water/collision rejection.
  function point(i,radius){
    for(let n=0;n<80;n++){
      const a=i*2.399+n*.43, r=radius+n*.15;
      const x=camp.x+Math.cos(a)*r,z=camp.z+Math.sin(a)*r;
      if(validGround(x,z)) return {x,z};
    }
    return null;
  }
  model('camp',camp.x,camp.z);
  const campMarker=new THREE.Mesh(markerGeo,markerMat); campMarker.position.copy(camp); campMarker.position.y+=2.2; root.add(campMarker);
  function populate(){
    for(const entry of [...items,...animals]) root.remove(entry.object);
    items.length=animals.length=0;
    for(let i=0;i<10;i++){
      const p=point(i,8+i*2); if(!p) continue;
      const type=i<5?'wood':'berries';
      items.push({type,object:model(type,p.x,p.z),taken:false});
    }
    for(let i=0;i<(mobile?4:6);i++){
      const p=point(i+14,19+i*3); if(!p) continue;
      const object=model('rabbit',p.x,p.z);
      object.scale.setScalar(1.4);
      const feet=[];object.traverse(o=>{if(o.name.includes('foot')) feet.push({object:o,rest:o.rotation.x});});
      animals.push({object,feet,home:new THREE.Vector3(p.x,0,p.z),angle:i*1.7,down:false,phase:i});
    }
  }
  populate();
  if(items.filter(i=>i.type==='wood').length<2||items.filter(i=>i.type==='berries').length<2){
    throw new Error('Camp terrain cannot support mission supplies');
  }
  const hud=uiDocument.createElement('section'); hud.id='gameHud';
  hud.innerHTML='<strong>DINNER BEFORE DUSK</strong><p id="gameObjective"></p><div id="gameSupplies"></div><div id="gameDirection"></div><div id="gameHint" role="status"></div><div class="game-buttons"><button id="gameInteract">Collect / Cook · E</button><button id="gameShoot">Shoot · click</button><button id="gameReplay" hidden>Play again</button></div>';
  uiDocument.body.append(hud);
  const objectiveNode=hud.querySelector('#gameObjective'), suppliesNode=hud.querySelector('#gameSupplies'), directionNode=hud.querySelector('#gameDirection'), hintNode=hud.querySelector('#gameHint');
  const replay=hud.querySelector('#gameReplay');
  function refresh(){
    objectiveNode.textContent=supplies.meals?dinnerResult(finishedAt??elapsed):objective(supplies);
    suppliesNode.textContent=`Wood ${supplies.wood}/2 · Food ${supplies.food}/2 · Meals ${supplies.meals}`;
    replay.hidden=!supplies.meals;
  }
  function reachable(entry){
    if(walker.fly||entry.taken) return false;
    playerGround.set(walker.pos.x,walker.groundY,walker.pos.z);
    const position=entry.type==='camp'?camp:entry.object.position;
    if(!inReach(playerGround,position)) return false;
    interactionTarget.copy(position);interactionTarget.y+=.4;
    forward.copy(interactionTarget).sub(camera.position);
    const distance=forward.length();forward.normalize();
    raycaster.set(camera.position,forward);raycaster.far=distance;
    return raycaster.intersectObjects(obstacles,false).length===0;
  }
  function interact(){
    if(!active) return;
    if(nearest&&reachable(nearest)){
      if(nearest.type==='camp'){
        if(supplies.meals){toast(dinnerResult(finishedAt));return;}
        if(cooking>0) return;
        if(supplies.wood>=2&&supplies.food>=2){cooking=MISSION.cookSeconds;toast('Cooking — stay by the campfire');}
        else toast('You need 2 wood and 2 food.');
      }else{
        if(nearest.type==='wood') supplies.wood++; else supplies.food++;
        nearest.taken=true; nearest.object.visible=false;
        toast(nearest.type==='wood'?'Collected firewood':'Collected food');
      }
      nearest=null; refresh();
    } else toast('Move closer on foot with a clear view to collect.');
  }
  function shoot(){
    if(!active||cooldown>0||walker.fly) return;
    cooldown=.8;
    camera.getWorldDirection(forward); ray.set(camera.position,forward);
    let target=null, distance=MISSION.shotRange;
    raycaster.set(camera.position,forward);raycaster.far=distance;
    const blocked=raycaster.intersectObjects(obstacles,false)[0];
    if(blocked) distance=blocked.distance;
    for(const animal of animals){
      if(animal.down||animal.taken||!animal.object.visible) continue;
      sphere.center.copy(animal.object.position); sphere.center.y+=.8;
      if(ray.intersectSphere(sphere,center)){
        animal.object.updateWorldMatrix(true,true);
        raycaster.far=distance;
        const actualHit=raycaster.intersectObject(animal.object,true)[0];
        if(!actualHit) continue;
        const d=actualHit.distance;
        if(d<distance){
          let clear=true;
          for(let t=1;t<d;t+=1){
            const x=camera.position.x+forward.x*t,z=camera.position.z+forward.z*t;
            if(height(x,z)>camera.position.y+forward.y*t){clear=false;break;}
          }
          if(clear){target=animal;distance=d;}
        }
      }
    }
    if(target){target.down=true;target.object.rotation.z=Math.PI/2;target.type='food';toast('Rabbit hit — approach and collect with E');}
        else toast('Miss — approach quietly, aim at a rabbit within 35m');
    trailPoints[0]=camera.position.x;trailPoints[1]=camera.position.y-.2;trailPoints[2]=camera.position.z;
    trailPoints[3]=camera.position.x+forward.x*distance;trailPoints[4]=camera.position.y+forward.y*distance;trailPoints[5]=camera.position.z+forward.z*distance;
    trailGeometry.attributes.position.needsUpdate=true;trail.visible=true;
  }
  hud.querySelector('#gameInteract').onclick=()=>{interact();canvas.focus();};
  hud.querySelector('#gameShoot').onclick=()=>{shoot();canvas.focus();};
  replay.onclick=()=>{
    if(!active) return;
    Object.assign(supplies,createSupplies());elapsed=0;cooldown=0;cooking=0;finishedAt=null;nearest=null;trail.visible=false;
    walker.pos.x=camp.x;walker.pos.z=camp.z;walker.groundY=camp.y;
    walker.fly=false;walker.freeY=undefined;walker.flyY=0;walker.vel.set(0,0,0);
    populate();refresh();canvas.focus();
  };
  inputTarget.addEventListener('keydown',e=>{
    if(e.repeat||!active||e.target.closest?.('input,button,textarea,select')) return;
    if(e.code==='KeyE'){e.preventDefault();interact();}
  });
  canvas.addEventListener('pointerdown',e=>{if(e.button===0&&uiDocument.pointerLockElement===canvas) shoot();});
  refresh();
  let hudTime=0;
  return {
    update(dt,time,enabled,blocked){
      active=enabled&&!blocked; root.visible=enabled; hud.hidden=!enabled;
      uiDocument.documentElement.classList.toggle('game-playing',active);
      hud.style.pointerEvents=blocked?'none':'auto';
      if(!active) return;
      if(!supplies.meals) elapsed+=dt;
      cooldown=Math.max(0,cooldown-dt);
      playerGround.set(walker.pos.x,walker.groundY,walker.pos.z);
      light.intensity=2.2-Math.min(elapsed/MISSION.duskSeconds,1)*1.35;
      if(cooking>0){
        if(walker.fly||!inReach(playerGround,camp)){cooking=0;toast('Cooking cancelled — return to camp.');}
        else {
          cooking=Math.max(0,cooking-dt);
          if(cooking===0&&cookMeal(supplies)){finishedAt=elapsed;toast(dinnerResult(elapsed));refresh();}
        }
      }
      bowOffset.set(.35,-.32,-.65).applyQuaternion(camera.quaternion);
      bow.position.copy(camera.position).add(bowOffset);bow.quaternion.copy(camera.quaternion);
      bow.scale.setScalar(.65);bow.visible=!walker.fly;
      trail.visible=cooldown>.68;
      nearest=null;let closest=3.8;
      for(const item of items){
        if(item.taken) continue;
        const d=playerGround.distanceTo(item.object.position);
        if(d<closest){closest=d;nearest=item;}
      }
      for(const animal of animals){
        if(animal.taken) continue;
        const o=animal.object, dist=Math.hypot(o.position.x-walker.pos.x,o.position.z-walker.pos.z);
        if(animal.down){const d=playerGround.distanceTo(o.position);if(d<closest){closest=d;nearest=animal;}continue;}
        o.visible=dist<85;
        if(!o.visible) continue;
        const fleeing=dist<9;
        animal.angle=fleeing?Math.atan2(o.position.x-walker.pos.x,o.position.z-walker.pos.z):animal.angle+Math.sin(elapsed*.3+animal.phase)*dt*.35;
        if(Math.hypot(o.position.x-animal.home.x,o.position.z-animal.home.z)>55) animal.angle=Math.atan2(animal.home.x-o.position.x,animal.home.z-o.position.z);
        const speed=fleeing?3:.35, x=o.position.x+Math.sin(animal.angle)*speed*dt,z=o.position.z+Math.cos(animal.angle)*speed*dt;
        if(validGround(x,z)){o.position.set(x,height(x,z)+Math.abs(Math.sin(elapsed*(fleeing?13:4)+animal.phase))*(fleeing?.14:.025),z);}
        else animal.angle+=dt*4;
        o.rotation.y=animal.angle+Math.PI;
        for(let i=0;i<animal.feet.length;i++){
          const foot=animal.feet[i];foot.object.rotation.x=foot.rest+Math.sin(elapsed*(fleeing?13:4)+i*Math.PI)* (fleeing?.45:.08);
        }
      }
      const campDistance=Math.hypot(walker.pos.x-camp.x,walker.pos.z-camp.z);
      if(inReach(playerGround,camp,3.5)) nearest={type:'camp'};
      if(walker.fly) nearest=null;
      campMarker.rotation.y+=dt;
      hint=cooking>0?`Cooking… ${Math.ceil(cooking)}s`:nearest?(nearest.type==='camp'?'E — Cook at camp':'E — Collect '+nearest.type):'Left click — hunt · E — collect · Esc — menu';
      hudTime+=dt;
      if(hudTime>.15){
        hudTime=0;hintNode.textContent=hint;
        let guide=camp, label='Camp', best=Infinity;
        if(supplies.wood<2||supplies.food<2){
          for(const item of items){
            if(item.taken||(item.type==='wood'?supplies.wood>=2:supplies.food>=2)) continue;
            const d=Math.hypot(item.object.position.x-walker.pos.x,item.object.position.z-walker.pos.z);
            if(d<best){best=d;guide=item.object.position;label=item.type==='wood'?'Wood':'Berries';}
          }
        }
        let angle=Math.atan2(-(guide.x-walker.pos.x),-(guide.z-walker.pos.z))-walker.yaw;
        angle=Math.atan2(Math.sin(angle),Math.cos(angle));
        const arrow=Math.abs(angle)<.4?'↑':Math.abs(angle)>2.5?'↓':angle>0?'←':'→';
        const distance=Math.hypot(guide.x-walker.pos.x,guide.z-walker.pos.z);
        directionNode.textContent=`${arrow} ${label} ${Math.round(distance)}m · Camp ${Math.round(campDistance)}m · ${Math.max(0,Math.ceil((600-elapsed)/60))} min to dusk`;
      }
    },
    get elapsed(){return elapsed;},
    get complete(){return supplies.meals>0;}
  };
}
