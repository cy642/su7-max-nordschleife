import test from 'node:test';
import assert from 'node:assert/strict';
import {draftFactor} from '../src/slipstream.mjs';
import {driveCar} from '../src/driving.mjs';

test('draftFactor responds to gap, lateral offset, and minimum speed', () => {
  const car = {s:100, lane:0, v:35};
  assert.ok(draftFactor(car, [{s:110, lane:0.1, v:36}]) > 0.5);
  assert.equal(draftFactor(car, [{s:110, lane:2, v:36}]), 0);
  assert.equal(draftFactor({s:100, lane:0, v:18}, [{s:110, lane:0, v:20}]), 0);
  assert.equal(draftFactor(car, [{s:140, lane:0, v:40}]), 0);
  assert.equal(draftFactor(car, [{s:90, lane:0, v:35}]), 0);
});

test('slipstream reduces aerodynamic drag at highway speed under full throttle', () => {
  const noDraft = {vehicleId:'max', s:0, lane:0, v:50, h:0, slip:0, steer:0, yawRate:0, pitch:0, roll:0};
  const withDraft = {...noDraft};
  for (let i = 0; i < 100; i++) {
    driveCar(noDraft, {gas:true, brake:false, steerAxis:0, draft:0}, 0, 0, 0, .01);
    driveCar(withDraft, {gas:true, brake:false, steerAxis:0, draft:1}, 0, 0, 0, .01);
  }
  assert.ok(withDraft.v > noDraft.v);
});
