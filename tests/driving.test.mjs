import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCar} from '../src/driving.mjs';

const fresh = (v = 20) => ({v, lane:0, h:0, slip:0, steer:0, yawRate:0, pitch:0, roll:0, s:0});
function run(car, seconds, input, bend = 0) {
  for (let i = 0; i < Math.round(seconds * 100); i++) {
    driveCar(car, {steerAxis:0, gas:false, brake:false, handbrake:false, ...input}, 0, bend, 0, .01);
  }
  return car;
}

test('a short steering press changes lanes promptly and settles after release', () => {
  const right = run(fresh(), .5, {steerAxis:1});
  const left = run(fresh(), .5, {steerAxis:-1});
  assert.ok(right.lane > .9 && right.lane < 1.4);
  assert.equal(right.lane, -left.lane);
  const releaseLane = right.lane;
  run(right, .7, {});
  assert.ok(right.lane - releaseLane < 1.5);
  assert.ok(Math.abs(right.slip) < .2);
});

test('countersteer reverses movement, and lighter touch input produces a finer correction', () => {
  const full = run(fresh(), .4, {steerAxis:1});
  const fine = run(fresh(), .4, {steerAxis:.35});
  assert.ok(fine.lane > 0 && fine.lane < full.lane / 2);
  run(full, .5, {steerAxis:-1});
  assert.ok(full.steer < -.95 && full.slip < -1);
});

test('turn-in stays controllable at highway speed and remains symmetric on bends', () => {
  assert.ok(run(fresh(60), .4, {steerAxis:1}).h < run(fresh(20), .4, {steerAxis:1}).h);
  const right = run(fresh(), .55, {steerAxis:.7}, .025);
  const left = run(fresh(), .55, {steerAxis:-.7}, -.025);
  const unsteered = run(fresh(), .55, {}, .025);
  assert.ok(right.lane > unsteered.lane && unsteered.lane < 0);
  assert.equal(right.lane, -left.lane);
});

test('brakes override the accelerator, and the handbrake tightens a moving turn', () => {
  const braking = run(fresh(), .45, {brake:true});
  assert.equal(braking.v, run(fresh(), .45, {gas:true, brake:true}).v);
  const ordinary = run(fresh(), .45, {steerAxis:1});
  const pivot = run(fresh(), .45, {steerAxis:1, handbrake:true});
  assert.ok(pivot.h > ordinary.h && pivot.v < ordinary.v && braking.v < pivot.v);
  assert.equal(run(fresh(0), 1, {gas:true, handbrake:true, steerAxis:1}).lane, 0);
});
