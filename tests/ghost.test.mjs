import test from 'node:test';
import assert from 'node:assert/strict';
import {GHOST_DT, createRecorder, recordGhost, encodeGhost, decodeGhost, ghostPose, ghostTimeAt} from '../src/ghost.mjs';

test('ghost recording encodes and decodes within 1 cm across a multi-step run', () => {
  const rec = createRecorder();
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const t = i * GHOST_DT;
    const car = {
      s: 12.345 + i * 3.337 + Math.sin(i * .2) * .4,
      lane: Math.sin(i * .15) * 2.5,
      h: Math.cos(i * .1) * .25
    };
    recordGhost(rec, t, car);
    samples.push(car);
  }
  recordGhost(rec, 0.02, {s:999, lane:0, h:0});
  assert.equal(rec.s.length, 60);

  const decoded = decodeGhost(JSON.parse(JSON.stringify(encodeGhost(rec))));
  assert.ok(decoded);
  assert.equal(decoded.n, 60);
  for (let i = 0; i < decoded.n; i++) {
    assert.ok(Math.abs(decoded.s[i] - samples[i].s) < 0.01, `s mismatch at ${i}`);
    assert.ok(Math.abs(decoded.lane[i] - samples[i].lane) < 0.01, `lane mismatch at ${i}`);
    assert.ok(Math.abs(decoded.h[i] - samples[i].h) < 0.002, `h mismatch at ${i}`);
  }
});

test('ghostPose interpolates between samples, holds briefly at finish, then returns null', () => {
  const rec = createRecorder();
  recordGhost(rec, 0, {s:0, lane:-2, h:0});
  recordGhost(rec, 0.1, {s:10, lane:2, h:0.2});
  recordGhost(rec, 0.2, {s:20, lane:0, h:-0.1});
  const ghost = decodeGhost(encodeGhost(rec));

  const early = ghostPose(ghost, -0.5);
  assert.equal(early.s, 0);
  assert.equal(early.lane, -2);

  const mid = ghostPose(ghost, 0.05);
  assert.ok(Math.abs(mid.s - 5) < 0.01);
  assert.ok(Math.abs(mid.lane - 0) < 0.01);
  assert.ok(Math.abs(mid.h - 0.1) < 0.002);

  const held = ghostPose(ghost, 0.5);
  assert.equal(held.s, 20);
  assert.equal(ghostPose(ghost, 1.25), null);
});

test('ghostTimeAt stays monotonic when a recorded run rolls backwards', () => {
  const rec = createRecorder();
  const path = [0, 10, 20, 15, 18, 25, 40];
  path.forEach((s, i) => recordGhost(rec, i * GHOST_DT, {s, lane:0, h:0}));
  const ghost = decodeGhost(encodeGhost(rec));

  assert.equal(ghostTimeAt(ghost, -5), 0);
  assert.equal(ghostTimeAt(ghost, 41), null);
  let prev = -1;
  for (let s = 0; s <= 40; s += 1) {
    const t = ghostTimeAt(ghost, s);
    assert.ok(t !== null && t >= prev, `non-monotonic at s=${s}: ${t} < ${prev}`);
    prev = t;
  }
  assert.equal(decodeGhost({v:2}), null);
  assert.equal(decodeGhost({v:1, dt:0.1, s0:0, ds:[1], lane:[0,0], h:[0]}), null);
});
