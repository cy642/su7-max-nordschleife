import test from 'node:test';
import assert from 'node:assert/strict';
import {newRunwayTrial,stepRunwayTrial,runwaySample} from '../src/airfield-run.mjs';

function car(s,v,from,oldSpeed,lane=0) {
  return {s,v,lane,previous:{s:from,v:oldSpeed}};
}

test('timing interpolates the first forward crossings; the stop uses a stable car inside the box',()=>{
  const trial=newRunwayTrial(), tick=.1;
  // Wait for five seconds after green. Timing starts with the first forward movement.
  stepRunwayTrial(trial,car(0,0,0,0),5,tick);
  stepRunwayTrial(trial,car(.05,1,0,0),5.1,tick);
  assert.equal(stepRunwayTrial(trial,car(55,28,52,27),8,tick),'');
  assert.ok(trial.hundred>2.9 && trial.hundred<3);
  stepRunwayTrial(trial,car(403,45,398,45),18,tick);
  assert.equal(trial.quarter,12.94);
  stepRunwayTrial(trial,car(402,45,399,45),15,tick);
  assert.equal(trial.quarter,12.94);
  assert.equal(stepRunwayTrial(trial,car(580,0,580,0),19,tick),'');
  assert.equal(stepRunwayTrial(trial,car(601,0,601,0,4.5),20,tick),'');
  assert.equal(stepRunwayTrial(trial,car(601,0,601,0),21,tick),'');
  assert.equal(stepRunwayTrial(trial,car(601,0,601,0),21.1,tick),'试车完成');
  assert.equal(trial.error,1);
});

test('early stop, reversing, escaping the cones, overshoot, and an incomplete launch cannot score',()=>{
  const attempt=newRunwayTrial(),initial=car(0,0,0,0);
  assert.equal(runwaySample(400).z,400);assert.equal(runwaySample(0).grade,0);
  assert.equal(stepRunwayTrial(attempt,initial,5,1),'');
  assert.equal(stepRunwayTrial(attempt,car(24,-1,25,-1),6,.01),'倒车中止测试');
  assert.equal(stepRunwayTrial(attempt,car(55,5,54,5,-6.01),7,.01),'驶出测试走廊');
  assert.equal(stepRunwayTrial(attempt,car(610.1,5,609.9,5),8,.01),'驶过停车区');
  assert.equal(stepRunwayTrial(attempt,car(600,0,600,0),9,.3),'未完成加速项目');
  assert.equal(attempt.error,null);
});
