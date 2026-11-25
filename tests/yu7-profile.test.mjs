import test from 'node:test';
import assert from 'node:assert/strict';
import {suvPoint} from '../src/yu7-profile.mjs';

test('the GT hatch narrows behind the rear arch and the glass tapers into the roof',()=>{
  const side=(y,z)=>suvPoint(.9,y,z)[0];
  assert.ok(side(.72,-1.50)>side(.72,-2.36)+.07);
  assert.ok(side(.78,-2.15)>side(1.31,-2.15)+.05);
  assert.ok(suvPoint(0,1.19,-1.65)[2]>-1.97);
});

test('both sides of the tail retain the ordering of adjacent body panels',()=>{
  const d=.001;
  for(let z=-2.50;z<=-.38;z+=.047)for(let y=.16;y<=1.48;y+=.041){
    const p=suvPoint(.9,y,z),l=suvPoint(-.9,y,z);
    assert.deepEqual(l,[-p[0],p[1],p[2]]);
    const py=suvPoint(.9,y+d,z),pz=suvPoint(.9,y,z+d);
    const area=(py[1]-p[1])*(pz[2]-p[2])-(py[2]-p[2])*(pz[1]-p[1]);
    assert.ok(area>.25*d*d,'fold near y='+y+' z='+z);
  }
});
