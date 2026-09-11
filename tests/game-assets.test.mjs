import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for(const tier of ['', 'mobile/']) test(`${tier||'desktop/'} assets have valid geometry, surface colors and bounded download cost`,()=>{
  let total=0;
  for(const name of ['rabbit','wood','berries','camp','bow','fish','crab']){
    const data=readFileSync(new URL(`../public/models/${tier}${name}.glb`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'glTF');
    assert.equal(data.readUInt32LE(4),2);
    assert.equal(data.readUInt32LE(8),data.length);
    const length=data.readUInt32LE(12);
    const gltf=JSON.parse(data.toString('utf8',20,20+length));
    assert.ok(gltf.meshes.length>0);
    assert.ok(gltf.materials.length<=5);
    let triangles=0;
    for(const mesh of gltf.meshes) for(const primitive of mesh.primitives){
      assert.ok(primitive.attributes.COLOR_0!==undefined,`${name} lost baked surface colors`);
      const position=gltf.accessors[primitive.attributes.POSITION];
      assert.ok(position.min.every(Number.isFinite)&&position.max.every(Number.isFinite));
      triangles+=gltf.accessors[primitive.indices].count/3;
    }
    assert.ok(triangles<(tier?4000:10000),`${name}: ${triangles} triangles exceeds budget`);
    if(name==='rabbit') assert.ok(gltf.nodes.some(n=>n.name?.includes('foot')));
    total+=data.length;
  }
  assert.ok(total<(tier?850000:1700000),`${tier} models grew to ${total} bytes`);
});
