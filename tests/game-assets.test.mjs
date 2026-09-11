import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('all gameplay assets are valid GLB files within the initial download budget',()=>{
  let total=0;
  for(const name of ['rabbit','wood','berries','camp','bow']){
    const data=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'glTF');
    assert.equal(data.readUInt32LE(4),2);
    assert.equal(data.readUInt32LE(8),data.length);
    const length=data.readUInt32LE(12);
    const gltf=JSON.parse(data.toString('utf8',20,20+length));
    assert.ok(gltf.meshes.length>0);
    assert.ok(gltf.materials.length<=5);
    if(name==='rabbit') assert.ok(gltf.nodes.some(n=>n.name?.includes('foot')));
    total+=data.length;
  }
  assert.ok(total<400000,`Initial models grew to ${total} bytes`);
});
