import * as T from 'three';
import {RUNWAY,runwaySample} from './airfield-run.mjs';

export function placeOnRunway(object,s,lane,height=0,heading=0) {
  object.position.set(-lane,height,s);
  object.rotation.set(0,-heading,0,'YXZ');
  return runwaySample(s);
}

// Batch fixed runway markings, glass panels, and buildings by geometry/material.
export function createAirfieldScene(circuit) {
  const scene=new T.Scene();
  scene.background=circuit.background;
  scene.environment=circuit.environment;
  scene.backgroundIntensity=.94;
  scene.environmentIntensity=.55;
  scene.fog=new T.FogExp2(0xb4c5ca,.0015);
  scene.add(new T.HemisphereLight(0xf3f8ff,0x8e916d,1.65));
  const sun=new T.DirectionalLight(0xffe6bb,2.05);
  sun.position.set(-80,100,-38);scene.add(sun);
  const cube=new T.BoxGeometry(1,1,1), cone=new T.ConeGeometry(.5,1,12);
  const groups=new Map();
  function part(x,y,z,w,h,d,color,geometry=cube,tilt=0){
    const key=color+'-'+geometry.id;
    if(!groups.has(key))groups.set(key,{geometry,color,poses:[]});
    const pose=new T.Object3D();
    pose.position.set(x,y,z);pose.scale.set(w,h,d);pose.rotation.z=tilt;pose.updateMatrix();
    groups.get(key).poses.push(pose.matrix);
  }
  function paint(x,z,w,d,color){part(x,.012,z,w,.018,d,color);}
  part(0,-.24,330,2050,.35,2120,0x818760);
  part(-59,-.065,265,86,.12,490,0x798087);
  part(51,-.06,280,72,.10,30,0x5c6263);
  for(const x of [-14.5,14.5])paint(x,360,.18,939,0xf0eee1);
  for(const x of [-11,-9.8,-8.6,8.6,9.8,11])paint(x,5,.78,11,0xe0ddcd);
  // Apron joints and yellow taxiway stripes connect the hangars to the strip.
  for(let z=25;z<500;z+=11)paint(-58,z,82,.055,0x4b5355);
  for(const x of [-28,-41,-54,-67,-80])paint(x,265,.045,480,0x4b5355);
  paint(-33,266,.18,415,0xe0af4e);paint(35,279,41,.23,0xe0af4e);
  for(let i=0;i<8;i++)paint(-33+i*2,410+i*.6,2.1,.22,0xe0af4e);
  for(let s=-70;s<815;s+=18)paint(0,s,.15,6,0xe5e4d6);
  for(let s=-8;s<=640;s+=20){
    for(const x of [-RUNWAY.laneLimit,RUNWAY.laneLimit]) {
      part(x,.06,s,.49,.12,.49,0x323937);
      part(x,.35,s,.40,.61,.40,0xd65b20,cone);
      part(x,.41,s,.19,.10,.19,0xfcf1d8);
    }
  }
  for(let s=0;s<820;s+=10){
    for(const x of [-14.8,14.8])part(x,.13,s,.20,.25,.20,0xc3e9ff);
  }
  for(const z of [0,RUNWAY.split]){
    for(let i=0;i<16;i++)for(let r=0;r<2;r++)paint(-5.625+i*.75,z+.55*r,.75,.55,(i+r)%2?0x292e31:0xf2f2e4);
  }
  const stop=RUNWAY.target,edge=RUNWAY.boxHalfWidth;
  for(const x of [-edge,edge])paint(x,stop,.28,RUNWAY.tolerance*2,0xf5b955);
  for(const z of [stop-RUNWAY.tolerance,stop+RUNWAY.tolerance])paint(0,z,edge*2,.38,0xf5b955);
  paint(0,stop,edge*2,.42,0xffd66a);

  function sign(x,z,message,background){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
    const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,512,160);
    c.strokeStyle='#f9f4db';c.lineWidth=6;c.strokeRect(8,8,496,144);
    c.fillStyle='#fbf5d9';c.font='bold 85px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(message,256,87,474);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const board=new T.Mesh(new T.PlaneGeometry(4.8,1.5),new T.MeshBasicMaterial({map:tex}));
    board.rotation.y=Math.PI;board.position.set(x,1.7,z);scene.add(board);
    for(const dx of [-1.7,1.7])part(x+dx,.65,z,.12,1.3,.12,0x5f645b);
  }
  sign(9,8,'09 / TEST','#394b50');sign(-9,396,'400 m','#285553');
  sign(9,485,'BRAKE','#864827');sign(-9,stop,'STOP','#85591b');
  for(const z of [100,200,300,500])sign(11,z,String(z),'#4e5351');
  for(let i=0;i<4;i++){
    const z=55+i*88;
    part(-75,5.0,z,31,10,48,0xc0c9c7);
    part(-75,10.1,z,33,1.4,50,0x899c9c);
    for(const dz of [-13.8,0,13.8]){
      part(-59.35,4.05,z+dz,.45,7.8,12,0x738a8f);
      for(let k=0;k<3;k++)part(-59.06,6.4,z+dz+(k-1)*3.55,.18,1.4,3.05,0x3d5960);
    }
  }
  part(58,8,190,6,16,7,0xc6cbbe);
  part(58,16.5,190,12.8,1.3,11,0xa3a9a0);
  part(58,18.5,190,11.8,3.0,10,0x385c67);
  part(58,20.3,190,13.4,1,11.5,0xc5c4ac);
  part(58,22.5,190,.25,3.5,.25,0x7d8681);
  // Distant airport perimeter with a low, irregular forested ridgeline.
  const ridge=[];
  for(let i=0;i<96;i++){
    for(const j of [i,i+1]){
      const a=j*Math.PI/48,r=820+74*Math.cos(a*7);
      const top=17+10*Math.sin(a*3)+9*Math.cos(a*13)+5*Math.sin(a*25);
      const x=Math.sin(a)*r,z=315+Math.cos(a)*r;
      ridge.push(x,-1,z,x,top,z);
    }
  }
  const mountain=new T.BufferGeometry();
  mountain.setAttribute('position',new T.Float32BufferAttribute(ridge,3));
  const faces=[];for(let i=0;i<96;i++){const a=i*4;faces.push(a,a+1,a+2,a+2,a+1,a+3);}
  mountain.setIndex(faces);scene.add(new T.Mesh(mountain,new T.MeshBasicMaterial({color:0x698078,side:T.DoubleSide})));
  // Parked light aircraft have long wings, tapered noses and raised tail fins.
  for(const z of [100,250,347]){
    part(-37,1.35,z,1.55,1.5,10,0xd8dbd6);
    part(-37,1.75,z+1.0,15,.24,2.2,0xcdd0ca);
    part(-37,1.75,z-4,5.2,.20,1.25,0xc2cecc);
    part(-37,2.65,z-4.1,.22,2.0,1.65,0xa7543d);
    part(-37,2.13,z+1,1.18,.48,2.0,0x47606a);
    for(const x of [-38.4,-35.6])part(x,.54,z,.4,.85,.65,0x373b3c);
  }
  for(const {geometry,color,poses} of groups.values()){
    const mesh=new T.InstancedMesh(geometry,new T.MeshStandardMaterial({color,roughness:.84}),poses.length);
    poses.forEach((m,i)=>mesh.setMatrixAt(i,m));scene.add(mesh);
  }
  // Give the wide foreground a road grain with continuous tyre wear over the run.
  const surface=document.createElement('canvas');surface.width=256;surface.height=512;
  const ctx=surface.getContext('2d'),pixels=ctx.createImageData(256,512);
  let seed=74822;
  for(let y=0;y<512;y++)for(let x=0;x<256;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const offset=(y*256+x)*4;
    const tyre=Math.exp(-((Math.abs(x-128)-10)**2)/7);
    const level=84+(seed>>>24)*.12-tyre*10+(y%96===0?-6:0);
    pixels.data[offset]=level;pixels.data[offset+1]=level+3;pixels.data[offset+2]=level+4;pixels.data[offset+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new T.CanvasTexture(surface);texture.colorSpace=T.SRGBColorSpace;
  texture.wrapT=T.RepeatWrapping;texture.repeat.y=25;texture.anisotropy=4;
  const strip=new T.Mesh(new T.PlaneGeometry(30,940),new T.MeshLambertMaterial({map:texture}));
  strip.rotation.x=-Math.PI/2;strip.position.set(0,.001,360);scene.add(strip);
  return scene;
}
