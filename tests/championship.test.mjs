import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAMPIONSHIP_ROUNDS, GRAND_TOUR_ROUNDS, getCupRounds, POINTS, PLAYER, newChampionship, scoreRound, standings, isComplete, parseChampionship} from '../src/championship.mjs';

test('championship scores rounds immutably, ranks standings, and marks completion', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const c0 = newChampionship('sport', 'max', names);
  assert.equal(c0.round, 0);
  assert.equal(c0.table[PLAYER], 0);

  const c1 = scoreRound(c0, ['A', PLAYER, 'B', 'C', 'D', 'E']);
  assert.equal(c0.round, 0);
  assert.equal(c0.table[PLAYER], 0);
  assert.equal(c1.round, 1);
  assert.equal(c1.table.A, POINTS[0]);
  assert.equal(c1.table[PLAYER], POINTS[1]);
  assert.deepEqual(c1.finishes, [2]);

  const table = standings(c1);
  assert.equal(table[0].name, 'A');
  assert.equal(table[1].name, PLAYER);
  assert.equal(table.at(-1).points, POINTS[5]);

  let season = c1;
  for (let r = 1; r < CHAMPIONSHIP_ROUNDS.length; r++) {
    assert.equal(isComplete(season), false);
    season = scoreRound(season, [PLAYER, 'A', 'B', 'C', 'D', 'E']);
  }
  assert.equal(isComplete(season), true);
  assert.equal(standings(season)[0].name, PLAYER);

  let grand = newChampionship('expert', 'ultra', names, 'grand');
  assert.equal(getCupRounds(grand).length, 9);
  assert.equal(GRAND_TOUR_ROUNDS.length, 9);
  for (let r = 0; r < 9; r++) {
    assert.equal(isComplete(grand), false);
    grand = scoreRound(grand, [PLAYER, 'A', 'B', 'C', 'D', 'E']);
  }
  assert.equal(isComplete(grand), true);
});

test('parseChampionship rejects malformed inputs without throwing', () => {
  const valid = newChampionship('expert', 'ultra', ['A', 'B']);
  assert.deepEqual(parseChampionship(JSON.stringify(valid)), valid);
  for (const bad of ['', '{not-json', 'null', '[]', '{}', {round:-1, table:{}, finishes:[]}, {round:6, table:{}, finishes:[]}, {round:1.5, table:{}, finishes:[]}, {round:0, table:[], finishes:[]}, {round:0, table:{a:'x'}, finishes:[]}, {round:0, table:{}, finishes:'nope'}]) {
    assert.equal(parseChampionship(bad), null);
  }
});
