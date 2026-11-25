const HUNDRED_KPH = 100 / 3.6;

export function createTelemetry() {
  return {
    distanceM:0, topSpeedKph:0, bestZeroTo100S:null, best100ToZeroM:null,
    previousSpeed:null, launchSeconds:null, brakingMeters:null
  };
}

// Invalidate the unfinished attempts at a reset or teleport. Completed records survive.
export function resetTransient(stats) {
  stats.previousSpeed = stats.launchSeconds = stats.brakingMeters = null;
}

export function sampleTelemetry(stats, player, dt, inputs = player, hit) {
  const speed = player.v;
  const previous = stats.previousSpeed;
  stats.previousSpeed = speed;
  stats.topSpeedKph = Math.max(stats.topSpeedKph, Math.abs(speed) * 3.6);
  if (previous === null || dt <= 0) {
    stats.launchSeconds = stats.brakingMeters = null;
    return;
  }
  // Integrate the speedometer, so a physics correction or a recovery cannot add
  // the distance between the old and new map positions to the odometer.
  stats.distanceM += .5 * (Math.abs(previous) + Math.abs(speed)) * dt;
  if (player.gear === -1 || previous < 0 || speed < 0 || hit?.wall || hit?.touched || player.contact > 0) {
    stats.launchSeconds = stats.brakingMeters = null;
    return;
  }

  if (inputs.gas && !inputs.brake && !inputs.handbrake && speed > previous) {
    if (previous === 0) stats.launchSeconds = 0;
    if (stats.launchSeconds !== null) {
      if (speed >= HUNDRED_KPH) {
        const crossing = dt * (HUNDRED_KPH - previous) / (speed - previous);
        const time = stats.launchSeconds + crossing;
        stats.bestZeroTo100S = Math.min(stats.bestZeroTo100S ?? Infinity, time);
        stats.launchSeconds = null;
      } else stats.launchSeconds += dt;
    }
  } else stats.launchSeconds = null;

  if (inputs.brake && !inputs.gas && !inputs.handbrake && speed < previous) {
    let from = previous, interval = dt;
    if (previous >= HUNDRED_KPH && speed < HUNDRED_KPH) {
      stats.brakingMeters = 0;
      from = HUNDRED_KPH;
      interval *= (from - speed) / (previous - speed);
    }
    if (stats.brakingMeters !== null) {
      stats.brakingMeters += .5 * (from + speed) * interval;
      if (speed === 0) {
        stats.best100ToZeroM = Math.min(stats.best100ToZeroM ?? Infinity, stats.brakingMeters);
        stats.brakingMeters = null;
      }
    }
  } else stats.brakingMeters = null;
}
