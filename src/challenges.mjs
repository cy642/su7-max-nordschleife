import {gateBenchmarks} from './competition.mjs';
import {activeRouteId, curvature, ROUTES} from './track.mjs';

// Checkpoints use absolute race time, so pausing does not consume the allowance.
export function checkpointPlan(length, difficulty='sport', vehicleId='max') {
  const legs = Math.max(4, Math.min(12, Math.round(length / 1150)));
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
  if (activeRouteId === 'nord') {
    if (length === ROUTES.nord.length) return [2700, 10300, 19750];
    if (length === ROUTES.nord.sprint) return [420, 1630, 2860];
  }
  // Pick a fast approach in each third. A line immediately after a hairpin
  // should not reward braking later at the expense of making the next turn.
  return [0, 1, 2].map(sector => {
    const from = Math.round(length * (sector + .36) / 3);
    const end = Math.round(length * (sector + .94) / 3);
    let best = from, leastTurn = Infinity;
    for (let s = from; s <= end; s += 16) {
      const turn = Math.abs(curvature(s - 55, 22)) + Math.abs(curvature(s, 22)) + Math.abs(curvature(s + 30, 22));
      if (turn < leastTurn) { best = s; leastTurn = turn; }
    }
    return best;
  });
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
