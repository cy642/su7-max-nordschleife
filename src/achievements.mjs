export const ACHIEVEMENTS = [
  {id:'first_finish', icon:'🏁', title:'初露锋芒',     desc:'完成任意一场正式赛事'},
  {id:'first_win',    icon:'🏆', title:'首胜奖杯',     desc:'在同场对抗中夺得第 1 名'},
  {id:'speed_300',    icon:'⚡', title:'突破 300',     desc:'单场最高车速达到 300 km/h'},
  {id:'speed_350',    icon:'🚀', title:'极速边界',     desc:'单场最高车速达到 350 km/h'},
  {id:'drift_master', icon:'💨', title:'漂移宗师',     desc:'单次连击漂移达到 1500 分'},
  {id:'rain_king',    icon:'🌧', title:'雨战专家',     desc:'在暴雨天气赢得比赛或达标挑战'},
  {id:'gold_hunter',  icon:'🥇', title:'金牌收割机',   desc:'在个人计时赛中斩获金牌'},
  {id:'nord_full',    icon:'🌲', title:'绿色地狱征服者', desc:'完成纽博格林北环 20.832 km 全圈'},
  {id:'globe_trotter',icon:'🗺', title:'环游车手',     desc:'在 5 条不同赛道完成赛事'},
  {id:'all_tracks',   icon:'👑', title:'九图制霸',     desc:'在全部 9 条赛道留下完赛记录'},
  {id:'champ_winner', icon:'🎖', title:'巡回总冠军',   desc:'赢得巡回锦标赛总冠军'},
  {id:'daily_streak', icon:'🔥', title:'每日打卡',     desc:'每日挑战连续达成 3 天'}
];

export function defaultProfile() {
  return {
    races:0, wins:0, distanceKm:0, topSpeed:0, bestDrift:0,
    medals:0, tracks:[], rainWins:0, champWins:0, nordFull:false,
    maxStreak:0, unlocked:[]
  };
}

export function parseProfile(json) {
  const base = defaultProfile();
  try {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return base;
    for (const k of ['races','wins','distanceKm','topSpeed','bestDrift','medals','rainWins','champWins','maxStreak']) {
      if (typeof obj[k] === 'number' && Number.isFinite(obj[k]) && obj[k] >= 0) base[k] = obj[k];
    }
    if (typeof obj.nordFull === 'boolean') base.nordFull = obj.nordFull;
    if (Array.isArray(obj.tracks)) base.tracks = [...new Set(obj.tracks.filter(t => typeof t === 'string'))];
    if (Array.isArray(obj.unlocked)) base.unlocked = [...new Set(obj.unlocked.filter(t => typeof t === 'string'))];
    return base;
  } catch {
    return base;
  }
}

export function recordCareer(prev, summary = {}) {
  const profile = {
    ...defaultProfile(),
    ...prev,
    tracks: [...(prev?.tracks ?? [])],
    unlocked: [...(prev?.unlocked ?? [])]
  };
  if (summary.finished) profile.races++;
  if (summary.won) profile.wins++;
  if (summary.distanceKm > 0) profile.distanceKm = +(profile.distanceKm + summary.distanceKm).toFixed(2);
  if (summary.topSpeed > profile.topSpeed) profile.topSpeed = Math.round(summary.topSpeed);
  if (summary.bestDrift > profile.bestDrift) profile.bestDrift = Math.round(summary.bestDrift);
  if (summary.medalId) profile.medals++;
  if (summary.routeId && summary.finished && !profile.tracks.includes(summary.routeId)) profile.tracks.push(summary.routeId);
  if (summary.weather === 'rain' && summary.won) profile.rainWins++;
  if (summary.champWon) profile.champWins++;
  if (summary.nordFull) profile.nordFull = true;
  if ((summary.streak || 0) > profile.maxStreak) profile.maxStreak = summary.streak;

  const checks = {
    first_finish: profile.races >= 1,
    first_win: profile.wins >= 1,
    speed_300: profile.topSpeed >= 300,
    speed_350: profile.topSpeed >= 350,
    drift_master: profile.bestDrift >= 1500,
    rain_king: profile.rainWins >= 1,
    gold_hunter: summary.medalId === 'gold' || profile.unlocked.includes('gold_hunter'),
    nord_full: profile.nordFull,
    globe_trotter: profile.tracks.length >= 5,
    all_tracks: profile.tracks.length >= 9,
    champ_winner: profile.champWins >= 1,
    daily_streak: profile.maxStreak >= 3
  };
  const newlyUnlocked = [];
  for (const item of ACHIEVEMENTS) {
    if (checks[item.id] && !profile.unlocked.includes(item.id)) {
      profile.unlocked.push(item.id);
      newlyUnlocked.push(item);
    }
  }
  return {profile, newlyUnlocked};
}
