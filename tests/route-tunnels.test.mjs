import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildRouteTunnels} from '../src/route-tunnels.js';
import {ROUTES,selectTrack,sample} from '../src/track.mjs';

test('tunnel shells leave room for the chase camera across curves, portals and both shoulders',()=>{
  const ray=new T.Raycaster(), origin=new T.Vector3(), direction=new T.Vector3();
  for(const id of ['duku','subsea','canyon','harbor','fuji','sakura','cyber','volcano']){
    const route=selectTrack(id),scene=new T.Scene();
    buildRouteTunnels(scene,route,sample);scene.updateMatrixWorld(true);
    for(const tunnel of route.tunnels){
      const stations=[tunnel.start+.3,tunnel.end-.3];
      for(let s=tunnel.start+15;s<tunnel.end;s+=39)stations.push(s);
      for(const s of stations){
        const f=sample(s);
        for(const lane of [-7.7,0,7.7]){
          origin.set(f.x-f.tz*lane,f.y+4.4,f.z+f.tx*lane);
          ray.set(origin,direction.set(0,1,0));ray.far=1.60;
          assert.equal(ray.intersectObjects(scene.children).length,0,id+' low roof at '+s);
          ray.set(origin,direction.set(f.tx,f.grade,f.tz).normalize());ray.far=4.5;
          assert.equal(ray.intersectObjects(scene.children).length,0,id+' cabin obstruction at '+s);
        }
      }
    }
  }
  selectTrack('nord');
});

test('adjoining concrete and glass tunnels blend their lighting and support wrapped laps',()=>{
  const route=selectTrack('subsea'),scene=new T.Scene(),tunnels=buildRouteTunnels(scene,route,sample);
  const glass=route.tunnels.find(t=>t.type==='glass');
  assert.equal(tunnels.update(0),0);
  assert.equal(tunnels.update(glass.start-12),1);
  assert.ok(Math.abs(tunnels.update(glass.start)-.66)<1e-8);
  assert.ok(Math.abs(tunnels.update(glass.start+12)-.32)<1e-8);
  assert.equal(tunnels.update(glass.start+route.length),tunnels.update(glass.start-route.length));
  scene.traverse(mesh=>{
    if(!mesh.geometry)return;
    const attr=mesh.geometry.attributes;
    assert.equal(attr.position.count,attr.color.count);
    if(attr.swim)assert.equal(attr.position.count,attr.swim.count);
  });
  selectTrack('nord');
  const empty=new T.Scene();
  assert.equal(buildRouteTunnels(empty,ROUTES.nord,sample).update(0),0);
  assert.equal(empty.children.length,0);
});
