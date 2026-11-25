import {gateBenchmarks} from './competition.mjs';

// Checkpoints use absolute race time, so pausing does not consume the allowance.
export function checkpointPlan(length, difficulty='sport', vehicleId='max') {
  const legs = length > 4000 ? 12 : 4;
  const gates = Array.from({length: legs - 1}, (_, i) => length * (i + 1) / legs);
  if (difficulty === 'expert' || difficulty === 'master') {
    const times = gateBenchmarks([...gates,length], difficulty, vehicleId).map(point => point.time);
    const margin = difficulty === 'master' ? 1.035 : 1.10;
    const bonuses = times.slice(1).map((time,i) => (time - times[i]) * margin);
    return {gates, allowance:times[0] * margin + (difficulty === 'master' ? 1.6 : 4), bonus:bonuses[0], bonuses};
  }
  const legTime = length / legs / (difficulty === 'club' ? 27 : 32);
  return {
    gates, allowance:legTime + (difficulty === 'club' ? 13 : 9), bonus:legTime, bonuses:gates.map(() => legTime)
  };
}

export function speedTraps(length) {
  return length > 4000 ? [2700, 10300, 19750] : [420, 1630, 2860];
}

export function speedTrapTarget(length, difficulty, vehicleId) {
  const reference = gateBenchmarks(speedTraps(length), difficulty, vehicleId);
  const mean = reference.reduce((total, point) => total + point.speed * 3.6, 0) / reference.length;
  const fraction = {club:.86, sport:.92, expert:.96, master:.985}[difficulty];
  return Math.floor(mean * fraction);
}

export function crossingFraction(car, line) {
  return Math.max(0, Math.min(1, (line - car.previous.s) / Math.max(.0001, car.s - car.previous.s)));
}

// Record both lines independently so a breakaway driver keeps their crossing
// time even if the previous cut is still waiting for its fourth finisher.
export function eliminationRounds(length) {
  return [4, 2].map((qualifiers, i) => ({
    line: length * (i + 1) / 3, qualifiers, passed: new Map()
  }));
}

export function recordEliminationCrossings(rounds, cars, elapsed, dt) {
  for (const round of rounds) {
    for (const car of cars) {
      if (car.previous.s < round.line && car.s >= round.line && !round.passed.has(car)) {
        round.passed.set(car, elapsed - (1 - crossingFraction(car, round.line)) * dt);
      }
    }
  }
}

export function cutOrder(round, cars) {
  const crossed = cars.filter(car => round.passed.has(car));
  if (crossed.length < round.qualifiers) return null;
  return [...cars].sort((a, b) => {
    const ta = round.passed.get(a) ?? Infinity, tb = round.passed.get(b) ?? Infinity;
    return ta === tb ? b.s - a.s : ta - tb;
  });
}
