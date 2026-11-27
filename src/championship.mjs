export const CHAMPIONSHIP_ROUNDS = ['nord', 'duku', 'subsea', 'canyon', 'harbor'];
export const POINTS = [10, 8, 6, 5, 4, 3];
export const PLAYER = '你';

export function newChampionship(difficulty, vehicleId, names) {
  const table = {[PLAYER]: 0};
  for (const name of names) table[name] = 0;
  return {difficulty, vehicleId, round:0, table, finishes:[]};
}

export function scoreRound(c, order) {
  const table = {...c.table};
  order.forEach((name, i) => {
    table[name] = (table[name] ?? 0) + (POINTS[i] ?? 0);
  });
  const place = order.indexOf(PLAYER);
  const finishes = [...c.finishes, place >= 0 ? place + 1 : order.length + 1];
  return {...c, round:c.round + 1, table, finishes};
}

export function standings(c) {
  return Object.entries(c.table)
    .map(([name, points]) => ({name, points}))
    .sort((a, b) => b.points - a.points);
}

export function isComplete(c) {
  return c.round >= CHAMPIONSHIP_ROUNDS.length;
}

export function parseChampionship(json) {
  try {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (!Number.isInteger(obj.round) || obj.round < 0 || obj.round > CHAMPIONSHIP_ROUNDS.length) return null;
    if (!obj.table || typeof obj.table !== 'object' || Array.isArray(obj.table)) return null;
    if (!Object.values(obj.table).every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    if (!Array.isArray(obj.finishes)) return null;
    return obj;
  } catch {
    return null;
  }
}
