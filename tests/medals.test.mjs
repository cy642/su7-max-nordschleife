import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUTES, selectTrack} from '../src/track.mjs';
import {medalTargets, medalFor} from '../src/medals.mjs';

test('medalTargets orders gold < silver < bronze and medalFor checks boundaries', () => {
  try {
    selectTrack('nord');
    const targets = medalTargets(ROUTES.nord.sprint, 'max');
    assert.equal(targets.length, 3);
    const [gold, silver, bronze] = targets;
    assert.equal(gold.id, 'gold');
    assert.equal(silver.id, 'silver');
    assert.equal(bronze.id, 'bronze');
    assert.ok(gold.time < silver.time && silver.time < bronze.time);

    assert.equal(medalFor(gold.time - 0.5, targets).id, 'gold');
    assert.equal(medalFor(gold.time, targets).id, 'gold');
    assert.equal(medalFor(gold.time + 0.05, targets).id, 'silver');
    assert.equal(medalFor(silver.time, targets).id, 'silver');
    assert.equal(medalFor(silver.time + 0.05, targets).id, 'bronze');
    assert.equal(medalFor(bronze.time, targets).id, 'bronze');
    assert.equal(medalFor(bronze.time + 0.05, targets), null);
  } finally {
    selectTrack('nord');
  }
});
