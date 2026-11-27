export const GHOST_DT = 0.1;

export function createRecorder() {
  return {s:[], lane:[], h:[]};
}

export function recordGhost(rec, elapsed, car) {
  if (elapsed >= rec.s.length * GHOST_DT - 1e-9) {
    rec.s.push(car.s);
    rec.lane.push(car.lane);
    rec.h.push(car.h || 0);
  }
}

export function encodeGhost(rec) {
  const n = rec.s.length;
  if (!n) return {v:1, dt:GHOST_DT, s0:0, ds:[], lane:[], h:[]};
  let cur = Math.round(rec.s[0] * 100);
  const s0 = cur / 100;
  const ds = [];
  for (let i = 1; i < n; i++) {
    const next = Math.round(rec.s[i] * 100);
    ds.push(next - cur);
    cur = next;
  }
  return {
    v: 1,
    dt: GHOST_DT,
    s0,
    ds,
    lane: rec.lane.map(v => Math.round(v * 100)),
    h: rec.h.map(v => Math.round(v * 1000))
  };
}

export function decodeGhost(obj) {
  if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
  const {dt, s0, ds, lane, h} = obj;
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return null;
  if (typeof s0 !== 'number' || !Number.isFinite(s0)) return null;
  if (!Array.isArray(ds) || !Array.isArray(lane) || !Array.isArray(h)) return null;
  const n = lane.length;
  if (n < 2 || ds.length !== n - 1 || h.length !== n) return null;
  if (!ds.every(Number.isFinite) || !lane.every(Number.isFinite) || !h.every(Number.isFinite)) return null;

  const sArr = new Float32Array(n);
  const laneArr = new Float32Array(n);
  const hArr = new Float32Array(n);
  const peak = new Float32Array(n);

  let cm = Math.round(s0 * 100);
  sArr[0] = cm / 100;
  peak[0] = sArr[0];
  laneArr[0] = lane[0] / 100;
  hArr[0] = h[0] / 1000;
  for (let i = 1; i < n; i++) {
    cm += ds[i - 1];
    sArr[i] = cm / 100;
    peak[i] = Math.max(peak[i - 1], sArr[i]);
    laneArr[i] = lane[i] / 100;
    hArr[i] = h[i] / 1000;
  }
  return {dt, n, s:sArr, lane:laneArr, h:hArr, peak};
}

export function ghostPose(g, t) {
  if (!g || g.n < 2 || !Number.isFinite(t)) return null;
  const end = (g.n - 1) * g.dt;
  if (t > end + 1) return null;
  if (t <= 0) return {s:g.s[0], lane:g.lane[0], h:g.h[0]};
  if (t >= end) return {s:g.s[g.n - 1], lane:g.lane[g.n - 1], h:g.h[g.n - 1]};
  const pos = t / g.dt;
  const i = Math.min(g.n - 2, Math.floor(pos));
  const f = pos - i;
  return {
    s: g.s[i] + (g.s[i + 1] - g.s[i]) * f,
    lane: g.lane[i] + (g.lane[i + 1] - g.lane[i]) * f,
    h: g.h[i] + (g.h[i + 1] - g.h[i]) * f
  };
}

export function ghostTimeAt(g, s) {
  if (!g || g.n < 2 || !Number.isFinite(s)) return null;
  if (s <= g.peak[0]) return 0;
  if (s > g.peak[g.n - 1]) return null;
  let lo = 1, hi = g.n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.peak[mid] >= s) hi = mid;
    else lo = mid + 1;
  }
  const p0 = g.peak[lo - 1], p1 = g.peak[lo];
  const frac = p1 > p0 ? (s - p0) / (p1 - p0) : 0;
  return (lo - 1 + frac) * g.dt;
}
