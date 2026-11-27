import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUTES, selectTrack, activeRouteId, sample, LENGTH, STEP, pts} from '../src/track.mjs';
import {rivalProfile, rivalRoad} from '../src/competition.mjs';
import {speedTraps, speedTrapTarget, checkpointPlan} from '../src/challenges.mjs';
import {racingLinePlan} from '../src/club-events.mjs';

const tours = ['duku','subsea','canyon','harbor','fuji','sakura','cyber','volcano'];

test('tour circuits close smoothly, measure horizontal metres, and clear distant pieces of road', () => {
  try {
    for (const id of tours) {
      const route=selectTrack(id);
      assert.equal(activeRouteId, id);
      assert.equal(pts.length*STEP, LENGTH);
      assert.deepEqual(sample(-25), sample(LENGTH-25));
      assert.deepEqual(sample(.5), sample(LENGTH+.5));
      const checkpoints=[];
      for(let s=0;s<LENGTH;s+=8){
        const a=sample(s),b=sample(s+1);
        const span=Math.hypot(b.x-a.x,b.z-a.z);
        assert.ok(span>.988&&span<1.012, id+' at '+s);
        assert.ok(Math.abs(a.grade)<.1);
        if(s%32===0)checkpoints.push({...a,s});
      }
      for(const a of checkpoints)for(const b of checkpoints){
        const gap=b.s-a.s;
        if(gap<128||gap>LENGTH-128)continue;
        assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>60,id+' road overlaps at '+a.s);
      }
      assert.ok(route.sections.every(([s],i)=>s>(route.sections[i-1]?.[0]??-1)&&s<LENGTH));
      assert.ok(route.tunnels.every((t,i)=>t.start>0&&t.start<t.end&&t.end<LENGTH&&t.start>=(route.tunnels[i-1]?.end??0)));
      assert.ok(route.practice.every(p=>p.start>=0&&p.start<p.end&&p.end<=LENGTH));
      const intro=route.practice[0];
      const highlight=route.tunnels.find(t=>t.start-intro.start>=90&&t.start-intro.start<=130);
      assert.ok(highlight&&highlight.end<intro.end);
    }
    selectTrack('subsea');
    for(let s=0;s<LENGTH;s+=8){
      if(sample(s).y<0)assert.ok(ROUTES.subsea.tunnels.some(t=>s>=t.start&&s<=t.end));
    }
  } finally {
    selectTrack('nord');
  }
});

test('pace profiles and race markers use the selected circuit over short and complete laps', () => {
  try {
    const profiles=[];
    for(const id of tours){
      const route=selectTrack(id),profile=rivalProfile('master','max');
      profiles.push({id,profile,at:rivalRoad(profile,1000)});
      for(const distance of [route.sprint,route.length]){
        const traps=speedTraps(distance),line=racingLinePlan(distance,'master').gates.map(g=>g.s);
        const checkpoints=checkpointPlan(distance,'master','max');
        for(const gates of [traps,line,checkpoints.gates]){
          assert.ok(gates.every((s,i)=>s>(gates[i-1]??0)&&s<distance));
        }
        assert.equal(traps.length,3);
        assert.ok(checkpoints.bonuses.every(b=>b>0));
        assert.ok(speedTrapTarget(distance,'master','max')>speedTrapTarget(distance,'club','max'));
      }
    }
    assert.equal(new Set(profiles.map(entry=>entry.profile)).size,tours.length);
    for(const {id,profile,at} of profiles){
      assert.deepEqual(rivalRoad(profile,1000),at);
      selectTrack(id);
      assert.equal(rivalProfile('master','max'),profile);
      assert.deepEqual(rivalRoad(profile,1000+LENGTH),at);
    }
  } finally {
    selectTrack('nord');
  }
  assert.equal(ROUTES.nord.length,LENGTH);
  assert.deepEqual(speedTraps(3200),[420,1630,2860]);
});
