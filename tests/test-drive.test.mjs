import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetry, resetTransient, sampleTelemetry} from '../src/test-drive.mjs';

const gas = {gas:true}, brake = {brake:true};
const tick = (stats,v,dt,inputs={},extra={}) =>
  sampleTelemetry(stats,{v,gear:v<0?-1:1,...extra},dt,inputs);
const close = (value,expected) => assert.ok(Math.abs(value-expected)<1e-8);

test('odometer counts both directions, discards teleports and preserves records after recovery',()=>{
  const stats=createTelemetry();
  tick(stats,0,0);
  tick(stats,10,1,gas);tick(stats,0,1,brake);
  tick(stats,-4,1);tick(stats,0,1);
  close(stats.distanceM,14);close(stats.topSpeedKph,36);
  resetTransient(stats);
  tick(stats,0,0,{}, {s:3500});
  close(stats.distanceM,14);close(stats.topSpeedKph,36);
  assert.equal(stats.best100ToZeroM,null);
});

test('launch timing starts at rest and interpolates the 100 km/h crossing',()=>{
  const stats=createTelemetry();
  tick(stats,0,0);tick(stats,10,1,gas);tick(stats,20,1,gas);tick(stats,30,1,gas);
  close(stats.bestZeroTo100S,100/36);
  resetTransient(stats);
  tick(stats,0,0);tick(stats,12,1,gas);tick(stats,24,1,gas);tick(stats,36,1,gas);
  close(stats.bestZeroTo100S,100/43.2);
});

test('100–0 counts only the distance below the threshold for a continuous forward brake',()=>{
  const stats=createTelemetry();
  tick(stats,30,0);tick(stats,20,1,brake);tick(stats,10,1,brake);tick(stats,0,1,brake);
  close(stats.best100ToZeroM,(100/3.6)**2/20);
  resetTransient(stats);
  tick(stats,35,0);tick(stats,21,1,brake);tick(stats,7,1,brake);tick(stats,0,.5,brake);
  close(stats.best100ToZeroM,(100/3.6)**2/28);
});

test('reverse, a released brake, handbrake, collision or recovery void an unfinished attempt',()=>{
  for(const interrupt of [
    stats=>tick(stats,10,.1,{}),
    stats=>tick(stats,10,.1,{...brake,handbrake:true}),
    stats=>tick(stats,-2,.1,brake),
    stats=>sampleTelemetry(stats,{v:10},.1,brake,{touched:true}),
    stats=>sampleTelemetry(stats,{v:10},.1,brake,{wall:true}),
    stats=>resetTransient(stats)
  ]){
    const stats=createTelemetry();
    tick(stats,32,0);tick(stats,23,1,brake);interrupt(stats);tick(stats,0,.3,brake);
    assert.equal(stats.best100ToZeroM,null);
  }
  const stats=createTelemetry();
  tick(stats,0,0);tick(stats,10,1,gas);tick(stats,12,.5,{});tick(stats,30,2,gas);
  assert.equal(stats.bestZeroTo100S,null);
  resetTransient(stats);
  tick(stats,0,0);tick(stats,10,1,gas);sampleTelemetry(stats,{v:30},.1,gas,{wall:true});
  assert.equal(stats.bestZeroTo100S,null);
  tick(stats,-35,1,gas);
  assert.equal(stats.bestZeroTo100S,null);
});
