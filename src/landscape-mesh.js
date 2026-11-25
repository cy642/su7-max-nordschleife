import * as T from 'three';

export const clamp = T.MathUtils.clamp;
export function smooth(a,b,x) {
  const t=clamp((x-a)/(b-a),0,1);
  return t*t*(3-2*t);
}
export function random(seed) {
  return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}
export function roadside(p, lane, up=0) {
  return [p.x-p.tz*lane,p.y+up,p.z+p.tx*lane];
}
export function roadSurvey(route,sample) {
  const stations=[],bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(let s=0;s<route.length;s+=12) {
    const p={...sample(s),s};stations.push(p);
    bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);
    bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z);
  }
  function split(list,axis) {
    if(!list.length)return null;
    list.sort((a,b)=>a[axis]-b[axis]);
    const i=list.length>>1,other=axis==='x'?'z':'x';
    return {p:list[i],axis,left:split(list.slice(0,i),other),right:split(list.slice(i+1),other)};
  }
  const tree=split(stations.slice(),'x');
  function nearest(x,z) {
    let distance2=Infinity,station;
    function visit(n) {
      if(!n)return;
      const dx=x-n.p.x,dz=z-n.p.z,dist=dx*dx+dz*dz,delta=n.axis==='x'?dx:dz;
      if(dist<distance2){distance2=dist;station=n.p;}
      visit(delta<0?n.left:n.right);
      if(delta*delta<distance2)visit(delta<0?n.right:n.left);
    }
    visit(tree);return {p:station,d:Math.sqrt(distance2)};
  }
  return {bounds,nearest};
}

export function canvasMap(width,height,draw) {
  const el=document.createElement('canvas');el.width=width;el.height=height;
  draw(el.getContext('2d'),width,height);
  const map=new T.CanvasTexture(el);map.colorSpace=T.SRGBColorSpace;return map;
}

// Scenery fixtures share immutable unit geometry. Different paint colours use instance colour.
export function fixtureBatch(scene) {
  const batches=new Map();
  const cube=new T.BoxGeometry(1,1,1);
  const upright=new T.Vector3(0,1,0);
  const material=new T.MeshLambertMaterial({color:0xffffff});
  const glow=new T.MeshBasicMaterial({color:0xffffff});
  const transform=new T.Object3D(),color=new T.Color();
  function add(x,y,z,w,h,d,tint,yaw=0,geometry=cube,mat=material,rotation=null) {
    const key=geometry.id+'/'+mat.id;
    if(!batches.has(key))batches.set(key,{geometry,mat,poses:[],colors:[]});
    transform.position.set(x,y,z);transform.scale.set(w,h,d);
    if(rotation)transform.quaternion.copy(rotation);else transform.rotation.set(0,yaw,0);
    transform.updateMatrix();
    const batch=batches.get(key);batch.poses.push(transform.matrix.clone());batch.colors.push(tint);
  }
  function beam(a,b,width,depth,tint,mat=material) {
    const v=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),len=v.length();
    if(!len)return;
    const rot=new T.Quaternion().setFromUnitVectors(upright,v.divideScalar(len));
    add((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,len,depth,tint,0,cube,mat,rot);
  }
  function flush() {
    for(const {geometry,mat,poses,colors} of batches.values()){
      const mesh=new T.InstancedMesh(geometry,mat,poses.length);
      for(let i=0;i<poses.length;i++){mesh.setMatrixAt(i,poses[i]);mesh.setColorAt(i,color.set(colors[i]));}
      mesh.computeBoundingSphere();scene.add(mesh);
    }
  }
  return {add,beam,flush,glow,material,cube};
}

export function makeSurface(scene,positions,indices,material,colors=null,uv=null) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);
  if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();g.computeBoundingSphere();
  const mesh=new T.Mesh(g,material);scene.add(mesh);return mesh;
}
