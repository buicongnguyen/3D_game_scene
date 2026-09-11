import * as THREE from 'three';

// A small local habitat, not a population spread over the entire river.
export function createRiverLife({root,models,habitat,height,mobile}){
  const group=new THREE.Group();group.name='River wildlife';root.add(group);
  const animals=[];
  const count=mobile?10:22;
  for(let i=0;i<count;i++){
    const crab=i%4===0,large=!crab&&i%3===0;
    const object=models[crab?'crab':'fish'].clone(true);
    object.name=crab?'river crab':large?'large fish':'small fish';
    object.scale.setScalar(crab?.9:large?1.6:.7);
    group.add(object);animals.push({object,crab,large,phase:i*2.399});
  }
  const spot=habitat.spot.clone();
  const marker=new THREE.Mesh(new THREE.TorusGeometry(.55,.055,4,16),new THREE.MeshBasicMaterial({color:0x6be1e5}));
  marker.position.copy(spot);marker.position.y+=1.5;group.add(marker);
  return {
    spot,
    update(time,position,frozen){
      group.visible=!frozen&&position.distanceTo(spot)<180;
      if(!group.visible) return;
      marker.rotation.y=time*.7;
      for(const animal of animals){
        const a=animal.phase+time*(animal.crab?.04:animal.large?.18:.30);
        const radius=habitat.radius*(animal.crab?.70:.45);
        const x=habitat.x+Math.cos(a)*radius,z=habitat.z+Math.sin(a)*radius;
        const bed=height(x,z), surface=habitat.water(x,z);
        const margin=animal.crab?.28:animal.large?.6:.28;
        animal.object.visible=surface-bed>margin*2;
        const y=animal.crab?bed+.03:Math.max(bed+margin,surface-margin-.35-Math.sin(a*2)*.1);
        animal.object.position.set(x,y,z);
        animal.object.rotation.y=Math.PI-a;
      }
    }
  };
}
