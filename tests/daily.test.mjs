import test from 'node:test';
import assert from 'node:assert/strict';
import {localDateKey, dailyChallenge, nextStreak} from '../src/daily.mjs';
import {ROUTES} from '../src/routes.mjs';
import {VEHICLES} from '../src/vehicles.mjs';
import {WEATHERS} from '../src/weather.mjs';

test('dailyChallenge is deterministic, valid, and varies routes across 60 days', () => {
  const a = dailyChallenge('2026-11-27');
  const b = dailyChallenge('2026-11-27');
  assert.deepEqual(a, b);
  assert.equal(a.mode, 'sprint');

  const validEvents = new Set(['race', 'pursuit', 'elimination', 'racingline', 'checkpoint', 'speedtrap', 'drift']);
  const validDiffs = new Set(['sport', 'expert', 'master']);
  const seenRoutes = new Set();
  for (let i = 0; i < 60; i++) {
    const key = localDateKey(new Date(2026, 0, 1 + i));
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
    const d = dailyChallenge(key);
    assert.ok(Object.hasOwn(ROUTES, d.route), d.route);
    assert.ok(Object.hasOwn(VEHICLES, d.vehicleId), d.vehicleId);
    assert.ok(validEvents.has(d.eventType), d.eventType);
    assert.ok(validDiffs.has(d.difficulty), d.difficulty);
    assert.ok(Object.hasOwn(WEATHERS, d.weather), d.weather);
    seenRoutes.add(d.route);
  }
  assert.ok(seenRoutes.size >= 6);
});

test('nextStreak increments consecutively, preserves same-day, and resets after gaps', () => {
  const day1 = nextStreak(null, '2026-11-27');
  assert.deepEqual(day1, {last:'2026-11-27', count:1});
  assert.deepEqual(nextStreak(day1, '2026-11-27'), day1);

  const day2 = nextStreak(day1, '2026-11-28');
  assert.deepEqual(day2, {last:'2026-11-28', count:2});

  const reset = nextStreak(day2, '2026-12-01');
  assert.deepEqual(reset, {last:'2026-12-01', count:1});
});
