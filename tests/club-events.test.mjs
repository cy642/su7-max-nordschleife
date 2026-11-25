import test from 'node:test';
import assert from 'node:assert/strict';
import {pursuitPlan, stepPursuitTarget, racingLinePlan, judgeLineGate} from '../src/club-events.mjs';
import {curvature, LENGTH} from '../src/track.mjs';
import {VEHICLES} from '../src/vehicles.mjs';

const tiers = ['club', 'sport', 'expert', 'master'];

test('pursuit puts one target physically ahead, and higher tiers reach the line sooner in every car class', () => {
  for (const vehicle of Object.values(VEHICLES)) {
    let previousLead = 0, previousTime = Infinity;
    for (const tier of tiers) {
      const plan = pursuitPlan(vehicle, tier);
      const target = {s:plan.lead, v:0, lane:-1.7, slip:0};
      assert.ok(plan.lead > previousLead);
      let t = 0;
      while (target.s < 3200 && t < 180) {
        stepPursuitTarget(target, plan, .05);
        t += .05;
      }
      assert.ok(target.s >= 3200 && t < previousTime);
      previousTime = t;
      previousLead = plan.lead;
    }
  }
});

test('both courses organise ordered outside-inside-outside gates at actual bends with escalating targets', () => {
  for (const length of [3200, LENGTH]) {
    const expected = length === 3200 ? 9 : 36;
    let prior = null;
    for (const tier of tiers) {
      const plan = racingLinePlan(length, tier);
      assert.equal(plan.gates.length, expected);
      assert.ok(plan.required >= expected * 2 / 3 && plan.required <= expected);
      let lastS = 0;
      for (const gate of plan.gates) {
        assert.ok(gate.s > lastS && gate.s < length);
        assert.ok(Math.abs(gate.lane) + gate.halfWidth < 5.25);
        lastS = gate.s;
      }
      for (let i = 0; i < expected; i += 3) {
        const [entry, apex, exit] = plan.gates.slice(i, i + 3);
        assert.equal(entry.lane, exit.lane);
        assert.equal(Math.sign(entry.lane), -Math.sign(apex.lane));
        assert.equal(Math.sign(apex.lane), Math.sign(curvature(apex.s, 24)));
        assert.ok(apex.minKph < entry.minKph);
      }
      if (prior) {
        assert.ok(plan.required >= prior.required);
        assert.ok(plan.gates[0].halfWidth < prior.gates[0].halfWidth);
        assert.ok(plan.gates[0].minKph > prior.gates[0].minKph);
      }
      prior = plan;
    }
  }
});

test('line judging samples position and pace at crossing and cannot score stopping or reversing', () => {
  const gate = {s:100, lane:2, halfWidth:1, minKph:72};
  const car = {previous:{s:98, lane:0, v:18}, s:102, lane:4, v:22};
  assert.equal(judgeLineGate(gate, car), '命中');
  assert.equal(judgeLineGate(gate, {...car, lane:-4}), '偏线');
  assert.equal(judgeLineGate(gate, {...car, v:20}), '速度不足');
  assert.equal(judgeLineGate(gate, {...car, s:98}), null);
  assert.equal(judgeLineGate(gate, {...car, previous:{s:102, lane:2, v:-1}, s:99}), null);
  assert.equal(judgeLineGate(gate, {...car, previous:{s:100, lane:2, v:20}}), null);
  assert.equal(judgeLineGate(undefined, car), null);
});
