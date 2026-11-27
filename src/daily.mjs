const DAILY_ROUTES = ['nord', 'duku', 'subsea', 'canyon', 'harbor'];
const DAILY_VEHICLES = ['su7', 'max', 'yu7gt', 'ultra', 'visiongt'];
const DAILY_EVENTS = ['race', 'pursuit', 'elimination', 'racingline', 'checkpoint', 'speedtrap'];
const DAILY_DIFFICULTIES = ['sport', 'sport', 'expert', 'expert', 'master'];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailyChallenge(dateKey) {
  const rng = mulberry32(fnv1a(String(dateKey)));
  const pick = list => list[Math.floor(rng() * list.length)];
  return {
    date: dateKey,
    route: pick(DAILY_ROUTES),
    vehicleId: pick(DAILY_VEHICLES),
    eventType: pick(DAILY_EVENTS),
    difficulty: pick(DAILY_DIFFICULTIES),
    mode: 'sprint'
  };
}

export function nextStreak(prev, today) {
  if (prev && prev.last === today) return prev;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (match && prev && typeof prev.last === 'string') {
    const yesterday = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] - 1));
    if (prev.last === yesterday.toISOString().slice(0, 10)) {
      return {last:today, count:(Number.isInteger(prev.count) ? prev.count : 0) + 1};
    }
  }
  return {last:today, count:1};
}
