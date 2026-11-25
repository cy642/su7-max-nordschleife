const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => mix(a, b, -Math.expm1(-rate * dt));
function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

export const MAX_REVERSE_SPEED = 7;
function updateSpeed(car, input, grade, shoulder, wing, dt) {
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
  const drive = Math.min(10.55, 226 / Math.max(1, oldSpeed));
  const regen = throttle || brake || handbrake ? 0 : 1.15 * smoothstep(0, 7, oldSpeed);
  const drag = (.00030 + wing * .000075) * oldSpeed ** 2 + .14 + grade * 9.81;
  const braking = Math.max(brake * mix(13.9, 6.1, shoulder), handbrake * mix(7.6, 4.8, shoulder));
  const acc = drive * throttle * (1 - shoulder * .33) - braking - regen - drag
    - shoulder * (1.6 + .0028 * oldSpeed ** 2);
  return clamp(oldSpeed + dt * acc, 0, (265 - wing * 4) / 3.6);
}

// Distance along the road and speed are signed. Positive lane and heading turn right.
export function driveCar(car, input, grade, bend, wing, dt) {
  const shoulder = smoothstep(5.25, 6.55, Math.abs(car.lane));
  const handbrake = Number(input.handbrake || 0);
  const oldSpeed = car.v;
  const v = car.v = updateSpeed(car, input, grade, shoulder, wing, dt);
  const speed = Math.abs(v), acc = (v - oldSpeed) / dt;

  const axis = clamp(input.steerAxis, -1, 1);
  const highSpeed = smoothstep(12, 66, speed);
  const countersteer = axis * car.steer < 0;
  const steerRate = axis === 0 || countersteer ? 24 : mix(18, 10, highSpeed);
  car.steer = damp(car.steer, axis, steerRate, dt);

  const grip = mix(12.8 + wing * 2.4 * (v / 74) ** 2, 5.45, shoulder);
  const cornerGrip = grip * Math.sqrt(1 - .47 * Math.min(.98, Math.abs(acc) / 16) ** 2);
  // At walking pace the wheel angle sets the radius. At speed tyre grip caps yaw.
  const maxYaw = Math.sign(v) * Math.min(speed * .16, cornerGrip / Math.max(speed, 1) * mix(1.82, 1.42, highSpeed));
  const pivot = 1 + handbrake * .36 * smoothstep(4, 16, speed);
  const previousHeading = car.h;
  car.yawRate = damp(car.yawRate, car.steer * maxYaw * pivot, axis === 0 ? 21 : 15, dt);
  const excess = clamp((Math.abs(bend) * v * v - cornerGrip) / grip, 0, 3.2);
  const follow = bend * v * (.49 + .25 * excess);
  // Releasing the control settles the car promptly after a tap. Holding a turn
  // leaves the driver enough steering authority to take a tighter line.
  const settle = mix(6.6, 1.7, Math.abs(axis));
  car.h = clamp(car.h + dt * (car.yawRate - follow - settle * car.h), -.55, .55);
  const washout = Math.sign(bend) * excess * Math.min(3.6, speed * .065);
  const lateralGoal = Math.sin(car.h) * v - washout;
  car.slip = damp(car.slip, lateralGoal, mix(15, 6, shoulder), dt);
  car.lane += car.slip * dt;
  car.s += Math.cos(car.h) * v * dt;
  const lateralAcc = (bend * v + (car.h - previousHeading) / dt) * v;
  car.roll = damp(car.roll, -clamp(lateralAcc, -15, 15) * .0021, 6.3, dt);
  car.pitch = damp(car.pitch, -clamp((v - oldSpeed) / dt, -14, 11) * .0022, 5.8, dt);
  return shoulder > .52;
}
