import test from 'node:test';
import assert from 'node:assert/strict';
import {ACHIEVEMENTS, defaultProfile, parseProfile, recordCareer} from '../src/achievements.mjs';

test('career profile persists safely and unlocks achievements once', () => {
  assert.equal(ACHIEVEMENTS.length, 12);
  assert.deepEqual(parseProfile('{invalid'), defaultProfile());

  const first = recordCareer(defaultProfile(), {
    finished:true, won:true, distanceKm:3.2, topSpeed:312, bestDrift:1800,
    medalId:'gold', routeId:'fuji', weather:'rain', nordFull:true, champWon:true, streak:3
  });
  const ids = new Set(first.newlyUnlocked.map(a => a.id));
  for (const expected of ['first_finish','first_win','speed_300','drift_master','rain_king','gold_hunter','nord_full','champ_winner','daily_streak']) {
    assert.ok(ids.has(expected), expected);
  }
  assert.equal(ids.has('speed_350'), false);

  // Recording again does not re-unlock already unlocked achievements
  const second = recordCareer(first.profile, {finished:true, topSpeed:360, routeId:'cyber'});
  assert.deepEqual(second.newlyUnlocked.map(a => a.id), ['speed_350']);
  assert.equal(second.profile.tracks.length, 2);
  assert.deepEqual(parseProfile(JSON.stringify(second.profile)), second.profile);
});
