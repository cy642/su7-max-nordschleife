import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHERS, WEATHER_LIST, getWeather} from '../src/weather.mjs';
import {PAINTS, TUNES, getTune, getPaint} from '../src/tuning.mjs';
import {driveCar} from '../src/driving.mjs';
import {VEHICLES} from '../src/vehicles.mjs';

test('weather and tuning presets fall back cleanly and modify car dynamics', () => {
  assert.deepEqual(WEATHER_LIST, ['clear', 'sunset', 'rain', 'fog']);
  assert.equal(getWeather('unknown'), WEATHERS.clear);
  assert.equal(getTune('unknown'), TUNES.balanced);
  assert.equal(getPaint('stock', VEHICLES.ultra).hex, VEHICLES.ultra.color);
  assert.equal(getPaint('lava', VEHICLES.max).hex, PAINTS.find(p => p.id === 'lava').hex);

  // Rain reduces braking deceleration vs clear weather
  const dry = {vehicleId:'max', v:45, lane:0, h:0, slip:0, steer:0, yawRate:0, pitch:0, roll:0, s:0};
  const wet = {...dry};
  for (let i = 0; i < 80; i++) {
    driveCar(dry, {steerAxis:0, gas:0, brake:1, gripScale:WEATHERS.clear.grip, brakeScale:WEATHERS.clear.brake}, 0, 0, 0, .01);
    driveCar(wet, {steerAxis:0, gas:0, brake:1, gripScale:WEATHERS.rain.grip, brakeScale:WEATHERS.rain.brake}, 0, 0, 0, .01);
  }
  assert.ok(wet.v > dry.v);

  // Speed tune reaches higher top speed than aero tune
  const fast = {vehicleId:'max', v:60, lane:0, h:0, slip:0, steer:0, yawRate:0, pitch:0, roll:0, s:0};
  const aero = {...fast};
  for (let i = 0; i < 2000; i++) {
    driveCar(fast, {steerAxis:0, gas:1, brake:0, dragScale:TUNES.speed.drag, topScale:TUNES.speed.top}, 0, 0, 0, .01);
    driveCar(aero, {steerAxis:0, gas:1, brake:0, dragScale:TUNES.aero.drag, topScale:TUNES.aero.top}, 0, 0, 0, .01);
  }
  assert.ok(fast.v > aero.v + 3);
});
