import {curvature, LENGTH, mod, sample} from './track.mjs';
import {getVehicle} from './vehicles.mjs';

// The field runs in the selected car's performance class. Each driver follows
// a fixed braking profile, independent of the player's position or speed.
export const paceSettings = {
  club:   {label:'入门', corner:.83, power:.73, brake:.66, top:.82, line:.10},
  sport:  {label:'运动', corner:1.08, power:.87, brake:.80, top:.92, line:.28},
  expert: {label:'专家', corner:1.43, power:.96, brake:.90, top:.97, line:.65},
  master: {label:'大师', corner:1.80, power:1, brake:.98, top:1, line:.85}
};
const nodeCount = Math.ceil(LENGTH / 8), spacing = LENGTH / nodeCount;
const course = new Map();
let turns, slopes;
function survey() {
  turns = Float32Array.from({length:nodeCount}, (_, i) => Math.abs(curvature(i * spacing, 15)));
  slopes = Float32Array.from({length:nodeCount}, (_, i) => sample(i * spacing).grade);
}

export function rivalProfile(tier, vehicleId) {
  const vehicle = getVehicle(vehicleId);
  const key = vehicle.id + '.' + tier;
  if (course.has(key)) return course.get(key);
  if (!turns) survey();
  const skill = paceSettings[tier] ?? paceSettings.sport;
  const car = vehicle.physics;
  const top = vehicle.topSpeed / 3.6 * skill.top;
  const braking = car.brakes * skill.brake;
  const limits = turns.map(turn => Math.min(top, Math.sqrt(car.grip * skill.corner / Math.max(.0001, turn))));
  // Work backwards from every apex, including corners across the lap seam.
  // v_entry² <= v_apex² + 2 * braking * distance.
  for (let i = nodeCount * 2 - 1; i >= 0; i--) {
    const index = i % nodeCount, next = (index + 1) % nodeCount;
    const decel = Math.max(2, braking + slopes[index] * 9.81);
    limits[index] = Math.min(limits[index], Math.sqrt(limits[next] ** 2 + 2 * decel * spacing));
  }
  const profile = {
    skill, limits, braking,
    acceleration(speed, grade) {
      const motor = Math.min(car.launch, car.specificPower / Math.max(1, speed));
      return motor * skill.power - car.drag * speed ** 2 - .14 - 9.81 * grade;
    }
  };
  course.set(key, profile);
  return profile;
}

export function rivalRoad(profile, distance) {
  const t = mod(distance, LENGTH) / spacing, i = Math.floor(t), f = t - i, next = (i + 1) % nodeCount;
  return {
    target:profile.limits[i] * (1 - f) + profile.limits[next] * f,
    grade:slopes[i] * (1 - f) + slopes[next] * f
  };
}

export function rivalSpeed(profile, speed, target, grade, grid, dt) {
  const talent = 1 - grid * .008;
  const braking = Math.max(2, profile.braking + 9.81 * grade);
  const power = profile.acceleration(speed, grade) * talent;
  const change = Math.max(-braking * dt, Math.min(target - speed, power * dt));
  return Math.max(0, speed + change);
}

// A solo standing start sets achievable benchmarks for each car. Integrate
// along the track once per profile, then interpolate at the actual gate lines.
function referenceAt(profile, distance) {
  if (!profile.times) {
    const times = new Float64Array(nodeCount + 1), speeds = new Float32Array(nodeCount + 1);
    for (let i = 0; i < nodeCount; i++) {
      const v = speeds[i], goal = profile.limits[(i + 1) % nodeCount];
      const available = profile.acceleration(v, slopes[i]);
      speeds[i + 1] = Math.min(goal, Math.sqrt(Math.max(1, v * v + 2 * available * spacing)));
      times[i + 1] = times[i] + 2 * spacing / (v + speeds[i + 1]);
    }
    Object.assign(profile, {times, speeds});
  }
  const t = Math.min(nodeCount, Math.max(0, distance / spacing)), i = Math.min(nodeCount - 1, Math.floor(t)), f = t - i;
  return {
    time:profile.times[i] * (1 - f) + profile.times[i + 1] * f,
    speed:profile.speeds[i] * (1 - f) + profile.speeds[i + 1] * f
  };
}

export function gateBenchmarks(lines, tier, vehicleId) {
  const profile = rivalProfile(tier, vehicleId);
  return lines.map(s => referenceAt(profile, s));
}

export function competitionRecordGroup(eventType, difficulty) {
  if (eventType === 'checkpoint' || eventType === 'speedtrap') {
    // Before difficulty selection these two events used the solo record slot.
    return difficulty === 'sport' ? 'solo' : difficulty;
  }
  return ['race','elimination','pursuit','racingline'].includes(eventType) ? difficulty : 'solo';
}
