import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrift, stepDrift, bankDrift, driftTarget} from '../src/drift.mjs';

test('drift accumulates combo points, chains corners, banks cleanly, and resets on wall hit', () => {
  const d = createDrift();
  const car = {v:30, h:.18, lane:0, gear:1};
  for (let i = 0; i < 150; i++) stepDrift(d, car, {handbrake:0}, false, null, .01);
  assert.ok(d.active && d.current > 200 && d.mult > 1);

  // Brief straight keeps chain alive, then second corner bumps multiplier
  stepDrift(d, {...car, h:0}, {handbrake:0}, false, null, .5);
  assert.equal(d.active, false);
  assert.ok(d.current > 0);
  const beforeChain = d.mult;
  stepDrift(d, car, {handbrake:0}, false, null, .01);
  assert.ok(d.mult > beforeChain);

  // Banking adds total, bestCombo, and Boost cooldown credit
  const banked = bankDrift(d);
  assert.ok(banked > 300);
  assert.equal(d.total, banked);
  assert.ok(d.boostCredit > 0);
  assert.equal(d.current, 0);

  // Wall hit cancels an unbanked combo
  for (let i = 0; i < 60; i++) stepDrift(d, car, {handbrake:0}, false, null, .01);
  assert.ok(d.current > 40);
  stepDrift(d, car, {handbrake:0}, false, {wall:true}, .01);
  assert.equal(d.current, 0);
  assert.equal(d.event?.type, 'lost');

  assert.ok(driftTarget(3200, 'master') > driftTarget(3200, 'club'));
});
