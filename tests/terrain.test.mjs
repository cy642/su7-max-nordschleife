import test from 'node:test';
import assert from 'node:assert/strict';
import course from '../src/course.json' with {type:'json'};
import {LENGTH, STEP, sample} from '../src/track.mjs';
import {buildRoadTerrain} from '../src/terrain.mjs';

test('the terrain stays below the road and accessible verges along the entire lap', () => {
  const terrain = buildRoadTerrain(course.terrain, sample, LENGTH, STEP / 2);
  for (let s = 0; s < LENGTH; s++) {
    const p = sample(s);
    for (const lane of [-8.8, -5.9, -3, 0, 3, 5.9, 8.8]) {
      const ground = terrain.heightAt(p.x - lane * p.tz, p.z + lane * p.tx);
      assert.ok(ground <= p.y - 0.5, `Terrain hits the race corridor at ${s} m, lane ${lane}`);
    }
  }
});

test('scenery heights interpolate the displayed triangles on both sides of the diagonal', () => {
  const grid = {nx:2, nz:2, x:0, z:0, step:1, h:[0, 10, 10, 0]};
  const {heightAt} = buildRoadTerrain(grid, null, 0, 1);
  assert.equal(heightAt(.25, .25), 0);
  assert.equal(heightAt(.75, .75), 0);
  assert.equal(heightAt(.5, .5), 5);
  assert.equal(heightAt(1, 1), -5);
});
