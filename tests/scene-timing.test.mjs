import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMetrics, normalizeTourDuration, retimeTour } from '../scene-timing.mjs';

test('FPS reports real slow frames instead of the simulation limit of 20 FPS', () => {
  const metrics = new FrameMetrics(3);
  for(let i=0;i<6;i++) metrics.push(.1);
  assert.ok(Math.abs(metrics.fps-10)<1e-10);
  metrics.reset();
  metrics.push(0); metrics.push(NaN);
  assert.equal(metrics.fps,0);
  metrics.push(1/60);
  assert.ok(Math.abs(metrics.fps-60)<1e-10);
});

test('duration changes preserve chapter and relative progress across all eight views', () => {
  for(const next of [12,25,60]){
    for(let chapter=0;chapter<24;chapter++){
      const time=10+(chapter+.4)*25;
      const result=retimeTour(time,10,25,next);
      assert.ok(Math.abs((result-10)/next-(chapter+.4))<1e-10);
    }
  }
  assert.equal(retimeTour(4,10,25,60),4);
  assert.equal(retimeTour(10,10,25,12),10);
});

test('invalid duration cannot poison camera timing', () => {
  assert.equal(normalizeTourDuration(NaN),25);
  assert.equal(normalizeTourDuration(Infinity),25);
  assert.equal(normalizeTourDuration(-100),12);
  assert.equal(normalizeTourDuration(100),60);
  assert.equal(normalizeTourDuration('32.6'),33);
});
