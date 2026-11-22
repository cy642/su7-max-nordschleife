import test from 'node:test';
import assert from 'node:assert/strict';
import {createContacts,footprint} from '../src/contact.mjs';

const radius=90, lap=2*Math.PI*radius, step=lap/128;
const track=s=>({x:radius*(1-Math.cos(s/radius)),z:radius*Math.sin(s/radius),
  tx:Math.sin(s/radius),tz:Math.cos(s/radius)});
const car=(s,lane=0,v=0,h=0)=>({s,lane,v,h,slip:0});
function corners(c) {
  const b=footprint(track,c);
  return [[1,1],[-1,1],[-1,-1],[1,-1]].map(([f,r])=>[
    b.x+f*b.fx*2.50+r*b.rx*1.12,b.z+f*b.fz*2.50+r*b.rz*1.12]);
}
// Project the physical car corners independently of the contact solver's padded boxes.
function separate(a,b) {
  const polygon=corners(a),other=corners(b);
  return [polygon,other].some(p=>p.some(([x,z],i)=>{
    const [u,v]=p[(i+1)%4],project=([px,pz])=>px*(z-v)+pz*(u-x);
    const A=polygon.map(project),B=other.map(project);
    return Math.max(...A)<=Math.min(...B)||Math.max(...B)<=Math.min(...A);
  }));
}
function simulate(cars,n,control=()=>{},posts=[]) {
  const solve=createContacts(track,step,lap,posts);
  let touched=false,wall=false;
  for(let tick=0;tick<n;tick++) {
    const before=cars.map(c=>({...c}));
    control(cars,tick);
    for(const c of cars){c.s+=c.v*Math.cos(c.h)*.01;c.lane+=c.slip*.01;}
    const hit=solve(cars);touched||=hit.touched;wall||=hit.wall;
    for(const alpha of [.25,.5,.75,1]) {
      const poses=cars.map((c,i)=>({...c,...Object.fromEntries(['s','lane','h'].map(k=>
        [k,before[i][k]+alpha*(c[k]-before[i][k])]))}));
      for(let i=0;i<poses.length;i++)for(let j=0;j<i;j++)
        assert.ok(separate(poses[i],poses[j]),'overlap '+JSON.stringify({tick,i,j,alpha}));
    }
  }
  return {touched,wall};
}
test('full-speed rear impact and pile-up preserve grid order through the lap seam',()=>{
  const cars=[car(-8,0,73),...Array.from({length:5},(_,i)=>car(i*5.65))];
  assert.ok(simulate(cars,260).touched);
  for(let i=1;i<cars.length;i++)assert.ok(cars[i].s>cars[i-1].s);
  assert.ok(cars.at(-1).s>26);
});
test('yawed cars can scrape, but do not swap sides or intersect while sliding',()=>{
  const cars=[car(80,-1.72,35,.16),car(80,1.72,35,-.16)];
  assert.ok(simulate(cars,110,([a,b])=>{a.slip=2;b.slip=-2;}).touched);
  assert.ok(cars[0].lane<cars[1].lane);
});
test('opponents collide with each other while the player passes in a clear lane',()=>{
  const cars=[car(0,-3,50),car(7,2,45),car(15,2,10)];
  simulate(cars,110);
  assert.ok(cars[0].s>cars[2].s&&cars[2].s>cars[1].s);
});
test('two cars squeezed against a curved guardrail stay inside it',()=>{
  const cars=[car(34,4,18,.18),car(34,7.0,18,.08)];
  assert.ok(simulate(cars,120,([a,b])=>{a.slip=5;b.slip=1;}).wall);
  for(const c of cars)for(const [x,z] of corners(c))
    assert.ok(Math.hypot(x-radius,z)-radius<8.82);
});
test('gantry post stops a head-on impact at racing speed',()=>{
  const cars=[car(7,7,73)];
  assert.ok(simulate(cars,80,()=>{},[{s:20,lane:7,length:.19,width:.15}]).wall);
  assert.ok(cars[0].s<19&&cars[0].v<1);
});
