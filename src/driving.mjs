import {getVehicle} from './vehicles.mjs';
import {supportsBoost} from './boost.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => mix(a, b, -Math.expm1(-rate * dt));
function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

export const MAX_REVERSE_SPEED = 7;
function updateSpeed(car, input, grade, shoulder, wing, vehicle, dt) {
  const brake = Number(input.brake);
  const handbrake = Number(input.handbrake || 0);
  const throttle = brake || handbrake ? 0 : Number(input.gas);
  const oldSpeed = car.v;
  car.gear ??= 1;
  if (car.gear === -1 && oldSpeed === 0 && throttle) car.gear = 1;
  const requestingReverse = car.gear === 1 && oldSpeed === 0 && brake && !input.gas && !handbrake;
  car.reverseHold = requestingReverse ? (car.reverseHold || 0) + dt : 0;
  if (car.reverseHold >= .35) car.gear = -1;
  if (car.gear === -1) {
    const coast = Math.max(.65, 1.65 + shoulder - grade * 9.81);
    let acceleration = coast;
    if (handbrake || input.gas) acceleration = Math.max(coast, mix(10.5, 6.1, shoulder));
    else if (brake) acceleration = -4.2 * (1 - shoulder * .36) - grade * 9.81;
    return clamp(oldSpeed + acceleration * dt, -MAX_REVERSE_SPEED, 0);
  }
  // Hold the standing start on a gradient until the driver commands movement.
  if (oldSpeed === 0 && !throttle) return 0;
  const setup = vehicle.physics;
  const brakeScale = clamp(Number(input.brakeScale ?? 1), .5, 1.3);
  const dragScale = clamp(Number(input.dragScale ?? 1), .7, 1.3);
  const topScale = clamp(Number(input.topScale ?? 1), .85, 1.15);
  // More power for a rolling pass. Tyre-limited launch and the speed limiter still apply.
  const power = setup.specificPower * (input.boost && supportsBoost(vehicle.id) ? 1.24 : 1);
  const drive = Math.min(setup.launch, power / Math.max(1, oldSpeed));
  const regen = throttle || brake || handbrake ? 0 : 1.15 * smoothstep(0, 7, oldSpeed);
  const draft = clamp(Number(input.draft || 0), 0, 1);
  const drag = (setup.drag * dragScale + wing * .000075) * oldSpeed ** 2 * (1 - .38 * draft) + .14 + grade * 9.81;
  const braking = Math.max(brake * mix(setup.brakes * brakeScale, 6.1 * brakeScale, shoulder), handbrake * mix(7.6 * brakeScale, 4.8 * brakeScale, shoulder));
  const acc = drive * throttle * (1 - shoulder * .33) - braking - regen - drag
    - shoulder * (1.6 + .0028 * oldSpeed ** 2);
  return clamp(oldSpeed + dt * acc, 0, (vehicle.topSpeed * topScale - wing * 4) / 3.6);
}

// Distance along the road and speed are signed. Positive lane and heading turn right.
export function driveCar(car, input, grade, bend, wing, dt, pavedRunway=false) {
  const vehicle = getVehicle(car.vehicleId);
  const activeWing = vehicle.wing === 'active' ? wing : 0;
  const shoulder = pavedRunway ? 0 : smoothstep(5.25, 6.55, Math.abs(car.lane));
  const handbrake = Number(input.handbrake || 0);
  const oldSpeed = car.v;
  const v = car.v = updateSpeed(car, input, grade, shoulder, activeWing, vehicle, dt);
  const speed = Math.abs(v), acc = (v - oldSpeed) / dt;

  const axis = clamp(input.steerAxis, -1, 1);
  const highSpeed = smoothstep(12, 66, speed);
  // At racing speeds a tap must reach the tyres before the next steering input.
  // Ramp this in above city speed, and leave the softer grass response intact.
  const roadResponse = smoothstep(20, 46, speed) * (1 - shoulder);
  const countersteer = axis * car.steer < 0;
  const steerRate = axis === 0 || countersteer ? 24 + 12 * roadResponse : mix(18, 10, highSpeed) + 16 * roadResponse;
  car.steer = damp(car.steer, axis, steerRate, dt);

  const setup = vehicle.physics;
  const gripScale = clamp(Number(input.gripScale ?? 1), .6, 1.25);
  const driftScale = clamp(Number(input.driftScale ?? 1), .8, 1.5);
  const grip = mix((setup.grip + (setup.aeroGrip + activeWing * 2.4) * (v / 74) ** 2) * gripScale, 5.45, shoulder);
  const cornerGrip = grip * Math.sqrt(1 - .47 * Math.min(.98, Math.abs(acc) / 16) ** 2);
  // At walking pace the wheel angle sets the radius. At speed tyre grip caps yaw.
  const steeringGain = mix(1.82, 1.42, highSpeed) + .22 * roadResponse;
  const maxYaw = Math.sign(v) * Math.min(speed * .16, cornerGrip / Math.max(speed, 1) * steeringGain);
  const pivot = 1 + handbrake * .36 * driftScale * smoothstep(4, 16, speed);
  const previousHeading = car.h;
  car.yawRate = damp(car.yawRate, car.steer * maxYaw * pivot, (axis === 0 ? 21 : 15) + 13 * roadResponse, dt);
  const excess = clamp((Math.abs(bend) * v * v - cornerGrip) / grip, 0, 3.2);
  const follow = bend * v * (.49 + .25 * excess);
  // Releasing the control settles the car promptly after a tap. Holding a turn
  // leaves the driver enough steering authority to take a tighter line.
  const unwind = axis * car.h < 0 ? Math.abs(axis) : 0;
  const settle = mix(6.6 + 4 * roadResponse, 1.7, Math.abs(axis)) + 6.5 * roadResponse * unwind;
  car.h = clamp(car.h + dt * (car.yawRate - follow - settle * car.h), -.55, .55);
  const washout = Math.sign(bend) * excess * Math.min(3.6, speed * .065);
  const lateralGoal = Math.sin(car.h) * v - washout;
  car.slip = damp(car.slip, lateralGoal, mix(15, 6, shoulder) + 11 * roadResponse, dt);
  car.lane += car.slip * dt;
  car.s += Math.cos(car.h) * v * dt;
  const lateralAcc = (bend * v + (car.h - previousHeading) / dt) * v;
  car.roll = damp(car.roll, -clamp(lateralAcc, -15, 15) * .0021 * setup.rollScale, 6.3, dt);
  car.pitch = damp(car.pitch, -clamp((v - oldSpeed) / dt, -14, 11) * .0022, 5.8, dt);
  return shoulder > .52;
}
