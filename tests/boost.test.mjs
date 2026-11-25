import test from 'node:test';
import assert from 'node:assert/strict';
import {newBoost,toggleBoost,endBoost,supportsBoost} from '../src/boost.mjs';
import {driveCar} from '../src/driving.mjs';
import {getVehicle} from '../src/vehicles.mjs';

test('one press gives twenty race seconds and only unlocks after the full cooldown',()=>{
  const boost=newBoost();
  assert.ok(toggleBoost(boost,7,'max',1));
  assert.deepEqual(boost,{end:27,ready:57,uses:1});
  assert.equal(toggleBoost(boost,27,'max',1),false);
  assert.equal(toggleBoost(boost,56.999,'max',1),false);
  assert.ok(toggleBoost(boost,57,'max',1));
  assert.equal(boost.uses,2);
});

test('cancelling early or shifting to reverse starts cooldown without extending or refilling it',()=>{
  for(const cancel of [(b,t)=>toggleBoost(b,t,'su7',1),endBoost]){
    const boost=newBoost();
    assert.ok(toggleBoost(boost,0,'su7',1));
    cancel(boost,2);
    assert.deepEqual(boost,{end:2,ready:32,uses:1});
    endBoost(boost,8);
    assert.equal(boost.ready,32);
    assert.equal(toggleBoost(boost,32,'su7',-1),false);
    assert.ok(toggleBoost(boost,32,'su7',1));
  }
  assert.equal(toggleBoost(newBoost(),0,'visiongt',1),false);
});

function coastOrDrive(id,speed,seconds,input) {
  const car={vehicleId:id,gear:speed<0?-1:1,s:0,v:speed,lane:0,h:0,slip:0,steer:0,yawRate:0,pitch:0,roll:0};
  for(let i=0;i<seconds*100;i++){
    driveCar(car,{steerAxis:0,gas:false,brake:false,...input},0,0,0,.01);
  }
  return car.v;
}
test('rolling acceleration increases only on equipped cars under forward throttle, with the same speed limiter',()=>{
  for(const id of ['su7','max','yu7gt','ultra','visiongt']){
    const speed=30;
    const normal=coastOrDrive(id,speed,2,{gas:true});
    const peak=coastOrDrive(id,speed,2,{gas:true,boost:true});
    if(supportsBoost(id))assert.ok(peak>normal+.7,id);
    else assert.equal(peak,normal);
    for(const [v,input] of [[speed,{}],[speed,{gas:true,brake:true}],[speed,{gas:true,handbrake:true}],[-3,{brake:true}]]){
      assert.equal(coastOrDrive(id,v,1,{...input,boost:true}),coastOrDrive(id,v,1,input));
    }
    const top=getVehicle(id).topSpeed/3.6;
    assert.equal(coastOrDrive(id,top-.01,1,{gas:true,boost:true}),top);
  }
});
