// End times use the simulation clock so pausing cannot discharge or refill Boost.
export const BOOST_SECONDS = 20;
export const BOOST_COOLDOWN = 30;
const equipped = new Set(['su7', 'max', 'yu7gt', 'ultra']);
export const supportsBoost = vehicleId => equipped.has(vehicleId);

export function newBoost() {
  return {end:0, ready:0, uses:0};
}

export function endBoost(boost, time) {
  if (time < boost.end) {
    boost.end = time;
    boost.ready = time + BOOST_COOLDOWN;
  }
}

export function toggleBoost(boost, time, vehicleId, gear) {
  if (!supportsBoost(vehicleId) || gear !== 1) return false;
  if (time < boost.end) {
    endBoost(boost, time);
  } else {
    if (time < boost.ready) return false;
    boost.end = time + BOOST_SECONDS;
    boost.ready = boost.end + BOOST_COOLDOWN;
    boost.uses++;
  }
  return true;
}
