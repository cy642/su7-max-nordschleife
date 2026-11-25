import test from 'node:test';
import assert from 'node:assert/strict';
import {createContacts,footprint} from '../src/contact.mjs';
import {driveCar} from '../src/driving.mjs';

const radius=90, lap=2*Math.PI*radius, step=lap/128;
const track=s=>({x:radius*(1-Math.cos(s/radius)),z:radius*Math.sin(s/radius),
  tx:Math.sin(s/radius),tz:Math.cos(s/radius)});
const car=(s,lane=0,v=0,h=0)=>({s,lane,v,h,slip:0});
test('model dimensions govern footprint, and a parallel rub does not cap a fast Ultra at Max speed', () => {
  const straight=s=>({x:0,z:s,tx:0,tz:1});
  const ultra={...car(100,0,94),vehicleId:'ultra'};
  const max={...car(100,2.30,73),vehicleId:'max'};
  const suv={...max,vehicleId:'yu7gt'};
  assert.ok(footprint(straight,ultra).length > footprint(straight,max).length);
  assert.ok(footprint(straight,suv).width > footprint(straight,max).width);
  const solve=createContacts(straight,5,1000);
  assert.ok(solve([ultra,max]).touched);
  assert.equal(ultra.v,94);
  assert.equal(max.v,73);
});
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

test('a driver can reverse clear of a post and cannot back through another post',()=>{
  const c={...car(17,7),gear:1,steer:0,yawRate:0,roll:0,pitch:0};
  const solve=createContacts(track,step,lap,[{s:20,lane:7,length:.19,width:.3},{s:7,lane:7,length:.19,width:.3}]);
  function drive(seconds,input){
    let hit=false;
    for(let i=0;i<seconds*100;i++){
      driveCar(c,{gas:false,brake:false,steerAxis:0,...input},0,-1/radius,0,.01);
      hit=solve([c]).wall||hit;
    }
    return hit;
  }
  assert.ok(drive(1.5,{gas:true}));
  const frontStop=c.s;
  assert.ok(drive(4,{brake:true}));
  assert.ok(c.gear===-1&&c.s<frontStop-3&&c.s>8.8&&Math.abs(c.v)<.1);
});

test('reversing at full lock along the outside guardrail keeps all four corners inside',()=>{
  const c={...car(40,6.7,-7,-.24),gear:-1,steer:1,yawRate:0,roll:0,pitch:0};
  const solve=createContacts(track,step,lap);
  let hit=false;
  for(let i=0;i<240;i++){
    driveCar(c,{gas:false,brake:true,steerAxis:1},0,-1/radius,0,.01);
    hit=solve([c]).wall||hit;
    for(const [x,z] of corners(c))assert.ok(Math.hypot(x-radius,z)-radius<8.82);
  }
  assert.ok(hit&&c.s<38&&c.v<0);
});
