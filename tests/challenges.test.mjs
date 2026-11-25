import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpointPlan, speedTraps, eliminationRounds, recordEliminationCrossings, cutOrder} from '../src/challenges.mjs';

test('both routes give each checkpoint and speed trap a unique line before the finish', () => {
  for (const length of [3200, 20832]) {
    const {gates, allowance, bonus} = checkpointPlan(length);
    assert.equal(gates.length, length === 3200 ? 3 : 11);
    assert.ok(allowance > bonus && bonus > 0);
    for (const lines of [gates, speedTraps(length)]) {
      assert.ok(lines.every((s, i) => s > (lines[i - 1] ?? 0) && s < length));
    }
    assert.equal(speedTraps(length).length, 3);
  }
});

test('a breakaway that crosses round two early retains its place; reversing cannot log another crossing', () => {
  const rounds = eliminationRounds(3000);
  const cars = Array.from({length:6}, (_, id) => ({id, previous:{s:0}, s:0}));
  function cross(id, line, time, fraction = .5) {
    const c = cars[id];
    c.previous.s = line - fraction;
    c.s = c.previous.s + 1;
    recordEliminationCrossings(rounds, [c], time, 1);
  }
  cross(3, 1000, 20);
  cross(3, 2000, 40);
  cross(2, 1000, 42);
  cross(1, 1000, 43, .2);
  assert.equal(cutOrder(rounds[0], cars), null);
  cross(0, 1000, 43, .4);
  const survivors = cutOrder(rounds[0], cars).slice(0, 4);
  assert.deepEqual(survivors.map(c => c.id), [3,2,1,0]);
  const firstTime = rounds[1].passed.get(cars[3]);
  cross(3, 2000, 58);
  assert.equal(rounds[1].passed.get(cars[3]), firstTime);
  cross(1, 2000, 65);
  assert.deepEqual(cutOrder(rounds[1], survivors).slice(0,2).map(c=>c.id), [3,1]);
});
