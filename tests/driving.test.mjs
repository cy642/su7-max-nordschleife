import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCar} from '../src/driving.mjs';
import {getVehicle, VEHICLES} from '../src/vehicles.mjs';

const fresh = (v = 20) => ({v, lane:0, h:0, slip:0, steer:0, yawRate:0, pitch:0, roll:0, s:0});
function run(car, seconds, input, bend = 0) {
  for (let i = 0; i < Math.round(seconds * 100); i++) {
    driveCar(car, {steerAxis:0, gas:false, brake:false, handbrake:false, ...input}, 0, bend, 0, .01);
  }
  return car;
}

test('each garage selection reaches its launch target and its own top speed on a flat straight', () => {
  for (const vehicle of Object.values(VEHICLES)) {
    const c = {...fresh(0), vehicleId:vehicle.id};
    let launchTime;
    for (let tick = 1; tick <= 18000; tick++) {
      driveCar(c, {gas:true, brake:false, steerAxis:0}, 0, 0, 0, .01);
      if (launchTime === undefined && c.v >= 100 / 3.6) launchTime = tick / 100;
    }
    assert.ok(Math.abs(launchTime - vehicle.zeroTo100) < .035, vehicle.id);
    assert.ok(Math.abs(c.v * 3.6 - vehicle.topSpeed) < .02, vehicle.id);
  }
});

test('legacy saves drive exactly like the Max; only its adjustable wing responds to input', () => {
  assert.equal(getVehicle('__proto__'), VEHICLES.max);
  for (const vehicle of Object.values(VEHICLES)) {
    const a = {...fresh(60), vehicleId:vehicle.id}, b = {...a}, legacy = fresh(60);
    for (let i = 0; i < 35; i++) {
      const input = {steerAxis:.65, gas:true, brake:false};
      driveCar(a, input, 0, .003, 0, .01);
      driveCar(b, input, 0, .003, 1, .01);
      driveCar(legacy, input, 0, .003, 0, .01);
    }
    if (vehicle.wing === 'active') {
      assert.equal(legacy.lane, a.lane);
      assert.equal(legacy.v, a.v);
      assert.ok(b.v < a.v && b.lane > a.lane);
    } else assert.deepEqual(b, a);
  }
});

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

test('reverse requires holding the brake after stopping; gas stops reverse before driving forward', () => {
  const car = run(fresh(3), .4, {brake:true});
  assert.equal(car.v, 0);
  assert.equal(car.gear, 1);
  run(car, .1, {}); // a released pedal cancels the pending shift
  run(car, .34, {brake:true});
  assert.equal(car.v, 0);
  const stoppedAt = car.s;
  run(car, 2.5, {brake:true});
  assert.equal(car.gear, -1);
  assert.equal(car.v, -7);
  assert.ok(car.s < stoppedAt);
  run(car, .5, {});
  assert.ok(car.v > -7 && car.v < 0);
  while (car.v < 0) run(car, .01, {gas:true});
  assert.equal(car.v, 0);
  run(car, .1, {gas:true});
  assert.ok(car.gear === 1 && car.v > 0);
});

test('backing with right lock turns the nose left and moves the rear right', () => {
  const right = run(fresh(0), 1.5, {steerAxis:1, brake:true});
  const left = run(fresh(0), 1.5, {steerAxis:-1, brake:true});
  assert.ok(right.h < 0 && right.lane > .15);
  assert.equal(right.lane, -left.lane);
  assert.equal(right.h, -left.h);
});

for (const kph of [120, 180, 220]) {
  test(`short press, countersteer and release at ${kph} km/h`, () => {
    const speed = kph / 3.6;
    const car = run(fresh(speed), .25, {steerAxis:1});
    const fine = run(fresh(speed), .25, {steerAxis:.2});
    assert.ok(car.lane > .21 && car.lane < .34);
    assert.ok(fine.lane > .02 && fine.lane < .05);

    run(car, .25, {steerAxis:1});
    const startingLane = car.lane;
    let ticks = 0;
    while (ticks < 60 && car.slip > 0) {
      run(car, .01, {steerAxis:-1});
      ticks++;
    }
    assert.ok(ticks <= 33 && car.lane - startingLane < 1.25);
    run(car, .3, {steerAxis:-1});
    assert.ok(car.slip < -2);
    run(car, .65, {steerAxis:0});
    assert.ok(Math.abs(car.slip) < .2 && Math.abs(car.h) < .01);
  });

  test(`linked bends and opposite lane changes at an entry speed of ${kph} km/h`, () => {
    const speed = kph / 3.6, car = fresh(speed);
    // Right bend, left bend and exit straight. The simulated driver only samples
    // lane position and presses a discrete direction key every tenth of a second.
    const curvature = 11 / speed ** 2;
    for (const [target, bend] of [[2.6,curvature], [-2.6,-curvature], [0,0]]) {
      for (let input = 0; input < 15; input++) {
        const error = target - (car.lane + .24 * car.slip);
        const axis = Math.abs(error) > .35 ? Math.sign(error) : 0;
        run(car, .10, {steerAxis:axis}, bend);
        assert.ok(Math.abs(car.lane) < 4.1);
      }
      assert.ok(Math.abs(car.lane - target) < .7);
    }
  });
}


test('auto hold preserves the zero-speed start on the sloping Nordschleife grid', () => {
  const car=fresh(0);
  const coast={gas:false,brake:false,handbrake:false,steerAxis:0};
  for(let i=0;i<100;i++)driveCar(car,coast,-.105,0,0,.01);
  assert.equal(car.v,0);
  driveCar(car,{...coast,gas:true},-.105,0,0,.01);
  assert.ok(car.v>0);
});
