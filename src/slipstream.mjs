export function draftFactor(car, others) {
  if (!car || car.v < 22 || !others?.length) return 0;
  let best = 0;
  for (const other of others) {
    if (!other || other === car) continue;
    const gap = other.s - car.s;
    const dl = Math.abs(other.lane - car.lane);
    if (gap > 3 && gap < 32 && dl < 1.7) {
      const strength = (1 - (gap - 3) / 29) * (1 - dl / 1.7);
      if (strength > best) best = strength;
    }
  }
  return Math.max(0, Math.min(1, best));
}
