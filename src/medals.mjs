import {gateBenchmarks} from './competition.mjs';

export const MEDAL_TIERS = [
  ['gold', '金牌', 'expert'],
  ['silver', '银牌', 'sport'],
  ['bronze', '铜牌', 'club']
];

export function medalTargets(length, vehicleId) {
  return MEDAL_TIERS.map(([id, label, tier]) => ({
    id,
    label,
    time: Math.ceil(gateBenchmarks([length], tier, vehicleId)[0].time * 10) / 10
  }));
}

export function medalFor(time, targets) {
  return targets.find(t => time <= t.time) ?? null;
}
