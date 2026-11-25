import {crossingFraction} from './challenges.mjs';
import {curvature, sample} from './track.mjs';

// Both cars set off at the green light. The target has a physical lead and
// follows a fixed pace for this car class; it never reads the player's gap.
const pursuitSetup = {
  club:   {lead:45,  speed:.72, grip:.62, power:.60},
  sport:  {lead:85,  speed:.82, grip:.79, power:.76},
  expert: {lead:130, speed:.91, grip:.97, power:.88},
  master: {lead:175, speed:.97, grip:1.10, power:.97}
};

export function pursuitPlan(vehicle, difficulty) {
  const tier = pursuitSetup[difficulty];
  return {
    lead:Math.round(tier.lead * Math.sqrt(vehicle.physics.specificPower / 226)),
    top:vehicle.topSpeed / 3.6 * tier.speed,
    grip:vehicle.physics.grip * tier.grip,
    launch:vehicle.physics.launch * tier.power,
    power:vehicle.physics.specificPower * tier.power,
    drag:vehicle.physics.drag,
    brakes:vehicle.physics.brakes * .82
  };
}

export function stepPursuitTarget(target, plan, dt) {
  const bend = curvature(target.s, 20);
  // Approach speed permits braking to each sampled corner speed before the apex.
  let limit = plan.top;
  for (const ahead of [0, 35, 80, 145]) {
    const curve = ahead === 0 ? bend : curvature(target.s + ahead, 20);
    const cornerSpeedSq = plan.grip / Math.max(.0001, Math.abs(curve));
    limit = Math.min(limit, Math.sqrt(cornerSpeedSq + 2 * plan.brakes * ahead));
  }
  const resistance = plan.drag * target.v ** 2 + .14 + 9.81 * sample(target.s).grade;
  const acceleration = Math.min(plan.launch, plan.power / Math.max(1, target.v)) - resistance;
  target.v = Math.max(0, target.v + Math.max(-plan.brakes * dt, Math.min(limit - target.v, acceleration * dt)));
  target.s += target.v * dt;
  const lane = -1.7 + Math.max(-1.1, Math.min(1.1, bend * 55));
  target.slip += (Math.max(-2.1, Math.min(2.1, lane - target.lane)) - target.slip) * -Math.expm1(-4 * dt);
  target.lane += target.slip * dt;
  target.h = Math.atan2(target.slip, Math.max(8, target.v));
}

const lineSetup = {
  club:   {halfWidth:2.05, pace:.65, quota:2/3},
  sport:  {halfWidth:1.55, pace:.80, quota:.75},
  expert: {halfWidth:1.15, pace:.92, quota:.84},
  master: {halfWidth:.85, pace:1.02, quota:.92}
};
export const MISS_SECONDS = 4;
const phases = ['入弯', '弯心', '出弯'];

export function racingLinePlan(length, difficulty) {
  const {halfWidth, pace, quota} = lineSetup[difficulty];
  const count = length > 4000 ? 12 : 3;
  const gates = [];
  for (let i = 0; i < count; i++) {
    const from = Math.round(i * length / count + 165);
    const to = Math.round((i + 1) * length / count - 135);
    let apex = from, bend = curvature(from, 24);
    for (let s = from + 20; s <= to; s += 20) {
      const candidate = curvature(s, 24);
      if (Math.abs(candidate) > Math.abs(bend)) { apex = s; bend = candidate; }
    }
    const inside = Math.sign(bend) || 1;
    const cornerSpeed = Math.min(135, Math.max(48, 3.6 * Math.sqrt(12 / Math.max(.0001, Math.abs(bend)))));
    const spacing = Math.round(50 + cornerSpeed * .32);
    for (let phase = 0; phase < phases.length; phase++) {
      gates.push({
        s:apex + (phase - 1) * spacing,
        lane:inside * (phase === 1 ? 2.85 : -2.85),
        halfWidth,
        minKph:Math.round((cornerSpeed + (phase === 1 ? 0 : 7)) * pace),
        phase:phases[phase]
      });
    }
  }
  return {gates, required:Math.ceil(gates.length * quota), hits:0, misses:0};
}

// A gate is judged once on forward crossing, using the car centre at the line.
export function judgeLineGate(gate, car) {
  if (!gate || car.previous.s >= gate.s || car.s < gate.s) return null;
  const t = crossingFraction(car, gate.s);
  const lane = car.previous.lane + t * (car.lane - car.previous.lane);
  const kph = 3.6 * (car.previous.v + t * (car.v - car.previous.v));
  if (Math.abs(lane - gate.lane) > gate.halfWidth) return '偏线';
  return kph < gate.minKph ? '速度不足' : '命中';
}
