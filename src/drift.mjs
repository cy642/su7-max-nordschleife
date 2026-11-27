export function createDrift() {
  return {
    total:0, current:0, mult:1, chainTime:0,
    active:false, activeTime:0, bestCombo:0, count:0,
    boostCredit:0, event:null
  };
}

export function stepDrift(state, car, input, grass, hit, dt) {
  state.event = null;
  state.boostCredit = 0;
  if (dt <= 0) return state;

  const crashed = Boolean(hit?.wall || hit?.touched || (grass && Math.abs(car.lane || 0) > 6.3));
  if (crashed) {
    if (state.current >= 40) {
      state.event = {type:'lost', points:Math.round(state.current * state.mult)};
    }
    state.current = 0; state.mult = 1; state.chainTime = 0;
    state.active = false; state.activeTime = 0;
    return state;
  }

  const speed = Math.abs(car.v || 0);
  const angle = Math.abs(car.h || 0);
  const handbrake = Number(input?.handbrake || 0) > 0;
  const drifting = !grass && car.gear !== -1 && speed >= 14 && (angle >= .072 || (handbrake && angle >= .045));

  if (drifting) {
    if (!state.active && state.current > 0 && state.chainTime > 0) {
      state.mult = Math.min(5, +(state.mult + .5).toFixed(2));
    }
    state.active = true;
    state.chainTime = 2.8;
    state.activeTime += dt;
    state.mult = Math.min(5, state.mult + dt * .22);
    const rate = speed * (angle * 9.5 + (handbrake ? .35 : 0)) * 3.8;
    state.current += rate * dt;
  } else {
    state.active = false;
    if (state.current > 0) {
      state.chainTime -= dt;
      if (state.chainTime <= 0) bankDrift(state);
    }
  }
  return state;
}

export function bankDrift(state) {
  if (state.current <= 0) return 0;
  const banked = Math.round(state.current * state.mult);
  const mult = +state.mult.toFixed(1);
  state.current = 0; state.mult = 1; state.chainTime = 0;
  state.active = false; state.activeTime = 0;
  if (banked >= 50) {
    state.total += banked;
    state.count++;
    state.bestCombo = Math.max(state.bestCombo, banked);
    state.boostCredit = Math.min(6, banked / 450);
    state.event = {type:'bank', points:banked, mult};
    return banked;
  }
  return 0;
}

const DRIFT_RATE = {club:.55, sport:.85, expert:1.2, master:1.65};

export function driftTarget(length, difficulty = 'sport') {
  const rate = DRIFT_RATE[difficulty] ?? DRIFT_RATE.sport;
  return Math.max(1500, Math.round(length * rate / 100) * 100);
}
