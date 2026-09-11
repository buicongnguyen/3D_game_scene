import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupplies,cookMeal,objective,inReach,dinnerResult} from '../game-rules.mjs';
test('interaction uses elevation and completion respects dusk boundary',()=>{
  assert.equal(inReach({x:0,y:10,z:0},{x:0,y:0,z:0}),false);
  assert.equal(inReach({x:0,y:0,z:0},{x:2,y:0,z:0}),true);
  assert.match(dinnerResult(599),/before dusk/);
  assert.match(dinnerResult(600),/late supper/);
});
test('dinner requires both ingredients and can only complete once',()=>{
  const s=createSupplies();
  assert.equal(cookMeal(s),false);
  s.wood=2; assert.equal(cookMeal(s),false); assert.equal(s.wood,2);
  s.food=2; assert.match(objective(s),/Return to camp/);
  assert.equal(cookMeal(s),true);
  assert.deepEqual(s,{wood:0,food:0,meals:1});
  s.wood=2;s.food=2;assert.equal(cookMeal(s),false);
  assert.match(objective(s),/Dinner is ready/);
});
