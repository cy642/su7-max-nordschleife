import test from 'node:test';
import assert from 'node:assert/strict';
import {competitionRecordGroup, paceSettings, rivalProfile, rivalRoad, rivalSpeed} from '../src/competition.mjs';
import {checkpointPlan, speedTrapTarget} from '../src/challenges.mjs';
import {LENGTH} from '../src/track.mjs';
import {VEHICLES} from '../src/vehicles.mjs';

function qualifyingRun(tier, vehicle) {
  const profile = rivalProfile(tier, vehicle);
  let s = -7, v = 0, time = 0, sprint;
  while (s < LENGTH && time < 1000) {
    const {grade, target} = rivalRoad(profile, s);
    v = rivalSpeed(profile, v, target, grade, 0, .05);
    s += v * .05;
    time += .05;
    if (s >= 3200 && !sprint) sprint = time;
  }
  assert.ok(s >= LENGTH);
  return [sprint, time];
}
test('each tier is meaningfully faster on both routes; the field matches the selected class', () => {
  for (const id of ['su7','max','visiongt']) {
    let previous = [Infinity,Infinity];
    for (const tier of Object.keys(paceSettings)) {
      const times = qualifyingRun(tier, id);
      assert.ok(times.every((t,i) => t < previous[i] * .97), id+' '+tier);
      previous = times;
    }
  }
  assert.ok(qualifyingRun('master','visiongt')[0] + 10 < qualifyingRun('master','su7')[0]);
});

test('the braking plan wraps at the start line and cannot instantaneously match a slow car', () => {
  const profile = rivalProfile('master','max');
  assert.deepEqual(rivalRoad(profile,-7),rivalRoad(profile,LENGTH-7));
  assert.ok(Math.abs(rivalSpeed(profile,0,60,0,0,.01) - (VEHICLES.max.physics.launch-.14)*.01) < 1e-9);
  const v = rivalSpeed(profile,60,8,0,0,.01);
  assert.ok(v < 60 && v > 59.8);
});

test('checkpoint budgets and attainable radar goals scale across all four tiers and five cars', () => {
  for (const {id,topSpeed} of Object.values(VEHICLES)) {
    for (const length of [3200,LENGTH]) {
      let priorTime = Infinity, priorRadar = 0;
      for (const tier of Object.keys(paceSettings)) {
        const plan = checkpointPlan(length,tier,id);
        assert.equal(plan.gates.length,plan.bonuses.length);
        assert.ok(plan.bonuses.every(value => value > 0));
        const budget = plan.bonuses.reduce((a,b)=>a+b,plan.allowance);
        const radar = speedTrapTarget(length,tier,id);
        assert.ok(budget < priorTime && radar > priorRadar && radar <= topSpeed, id+' '+tier);
        priorTime = budget;
        priorRadar = radar;
      }
    }
  }
  const plan = checkpointPlan(3200,'sport','max');
  assert.equal(plan.allowance,34);
  assert.deepEqual(plan.bonuses,[25,25,25]);
  const advanced = checkpointPlan(3200,'master','max').bonuses;
  assert.ok(Math.max(...advanced) - Math.min(...advanced) > 3);
});

test('legacy sport scores remain readable while harder rules and new races use separate records', () => {
  for (const event of ['checkpoint','speedtrap']) {
    assert.equal(competitionRecordGroup(event,'sport'),'solo');
    assert.equal(competitionRecordGroup(event,'master'),'master');
  }
  for (const event of ['pursuit','racingline','elimination','race']) {
    assert.equal(competitionRecordGroup(event,'sport'),'sport');
  }
  for (const event of ['time','practice','airfield','freedrive']) {
    assert.equal(competitionRecordGroup(event,'master'),'solo');
  }
});
