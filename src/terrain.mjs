function gridPoint(grid, x, z) {
  const a = Math.max(0, Math.min(grid.nx - 1, (x - grid.x) / grid.step));
  const b = Math.max(0, Math.min(grid.nz - 1, (z - grid.z) / grid.step));
  const i = Math.min(Math.floor(a), grid.nx - 2);
  const j = Math.min(Math.floor(b), grid.nz - 2);
  return {k: j * grid.nx + i, u: a - i, v: b - j};
}

// Use the same diagonal as the two triangles in the visible terrain cell.
function interpolate(h, nx, {k, u, v}) {
  if (u + v <= 1) return h[k] * (1 - u - v) + h[k + 1] * u + h[k + nx] * v;
  return h[k + nx + 1] * (u + v - 1) + h[k + nx] * (1 - u) + h[k + 1] * (1 - v);
}

export function buildRoadTerrain(grid, sample, length, spacing) {
  const base = Float64Array.from(grid.h, height => height - 5);
  const cut = new Float64Array(base.length);
  // Both verges join the world terrain beyond this corridor. Lower every corner
  // of a crossed cell by at least the clearance required anywhere within it.
  for (let s = 0; s < length; s += spacing) {
    const p = sample(s);
    for (let lane = -16; lane <= 16; lane += 4) {
      const cell = gridPoint(grid, p.x - p.tz * lane, p.z + p.tx * lane);
      const depth = interpolate(base, grid.nx, cell) - p.y + 1;
      if (depth <= 0) continue;
      for (const k of [cell.k, cell.k + 1, cell.k + grid.nx, cell.k + grid.nx + 1]) {
        cut[k] = Math.max(cut[k], depth);
      }
    }
  }
  const heights = base.map((height, i) => height - cut[i]);
  return {heights, heightAt: (x, z) => interpolate(heights, grid.nx, gridPoint(grid, x, z))};
}
