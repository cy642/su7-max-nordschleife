import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import course from './course.json' with {type:'json'};
import photographs from './scenery-data.js';
import cabinParts from './cabin.json';
import {buildRoadTerrain} from './terrain.mjs';

import {LENGTH,N,STEP,mod,pts,sample,curvature} from './track.mjs';
export {LENGTH,N,STEP,sample,curvature};
const sections=[[0,'T13','起终点'],[430,'Hatzenbach','哈岑巴赫'],[1850,'Hocheichen','高橡树'],[2700,'Flugplatz','飞行广场'],[3540,'Schwedenkreuz','瑞典十字'],[4300,'Aremberg','阿伦贝格'],[4800,'Fuchsröhre','狐狸洞'],[5800,'Adenauer Forst','阿德瑙森林'],[6900,'Metzgesfeld','梅茨格斯费尔德'],[7600,'Kallenhard','卡伦哈德'],[8300,'Wehrseifen','韦尔赛芬'],[9000,'Breidscheid','布赖德沙伊德'],[9550,'Ex-Mühle','旧磨坊'],[10300,'Bergwerk','矿山弯'],[11200,'Kesselchen','小盆地'],[12600,'Klostertal','修道院谷'],[13100,'Karussell','卡鲁塞尔'],[14050,'Hohe Acht','高八峰'],[15100,'Wippermann','维珀曼'],[15800,'Brünnchen','小泉'],[16600,'Pflanzgarten','植物园'],[17600,'Schwalbenschwanz','燕尾弯'],[18300,'Galgenkopf','绞架山'],[18700,'Döttinger Höhe','多廷格直道'],[20250,'Tiergarten','蒂尔加滕']];
export function section(s){let ss=mod(s,LENGTH);return sections.findLast(k=>k[0]<=ss)||sections[0];}
export const mapPoints=pts.filter((_,i)=>i%8===0).map(p=>[p.x,p.z]);
const V=(x,y,z)=>new T.Vector3(x,y,z);
const lam=(color)=>new T.MeshLambertMaterial({color});
const basic=(color)=>new T.MeshBasicMaterial({color});
function box(parent,w,h,l,mat,x,y,z){const o=new T.Mesh(new T.BoxGeometry(w,h,l),mat);o.position.set(x,y,z);parent.add(o);return o;}
function texture(w,h,draw){const el=document.createElement('canvas');el.width=w;el.height=h;draw(el.getContext('2d'),w,h);const tex=new T.CanvasTexture(el);tex.colorSpace=T.SRGBColorSpace;return tex;}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function xz(p,lat){return [p.x-p.tz*lat,p.z+p.tx*lat];}
export function place(obj,s,lat,h=0,angle=0,roll=0){
 const p=sample(s);obj.position.set(p.x-p.tz*lat,p.y+h,p.z+p.tx*lat);
 obj.rotation.order='YXZ';obj.rotation.set(-Math.atan(p.grade),Math.atan2(p.tx,p.tz)-angle,roll,'YXZ');return p;
}
function nameplate(text,bg,fg){
 const tex=texture(1024,128,(c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font='bold 67px Arial';c.fillText(text,w/2,h/2+3,950);});
 return new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
}
function softShadow(w,l){
 const tex=texture(128,128,c=>{const grad=c.createRadialGradient(64,64,3,64,64,64);grad.addColorStop(0,'rgba(0,0,0,.84)');grad.addColorStop(.52,'rgba(0,0,0,.63)');grad.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=grad;c.fillRect(0,0,128,128);});
 const m=new T.Mesh(new T.PlaneGeometry(w,l),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));m.rotation.x=-Math.PI/2;m.position.y=.026;return m;
}
// The supplied rear kit includes a separate curved insert at the foot of the back
// window. Detach its exact faces before batching the rest of the black rear trim.
function detachDeckPanel(source, geom) {
 const local=source.attributes.position, world=geom.attributes.position, normals=geom.attributes.normal;
 const fixed=[], faces=[], positions=[], directions=[], ids=new Map(), index=geom.index.array;
 for(let i=0;i<index.length;i+=3){
   const id=index[i],x=local.getX(id),y=local.getY(id),z=local.getZ(id);
   if(Math.abs(x)>.55||y<.91||y>.98||z< -2.11||z> -1.90){fixed.push(id,index[i+1],index[i+2]);continue;}
   for(const id of index.subarray(i,i+3)){
     if(!ids.has(id)){
       ids.set(id,positions.length/3);
       positions.push(world.getX(id),world.getY(id),world.getZ(id));
       directions.push(normals.getX(id),normals.getY(id),normals.getZ(id));
     }
     faces.push(ids.get(id));
   }
 }
 geom.setIndex(fixed);
 const panel=new T.BufferGeometry();
 panel.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 panel.setAttribute('normal',new T.Float32BufferAttribute(directions,3));
 panel.setIndex(faces);panel.computeBoundingBox();
 return panel;
}

function mountSpoiler(body,panel,paint) {
 const pivot=panel.boundingBox.getCenter(new T.Vector3());
 panel.translate(-pivot.x,-pivot.y,-pivot.z);
 const blade=new T.Group();blade.name='Active rear spoiler';blade.position.copy(pivot);body.add(blade);
 blade.add(new T.Mesh(panel,paint));
 const lining=new T.MeshStandardMaterial({color:0x20262a,metalness:.32,roughness:.59,side:T.DoubleSide});
 const underside=new T.Mesh(panel,lining);underside.position.y=-.009;blade.add(underside);
 // Close the native opening with a shallow recessed well. The original panel is
 // the floor template, so its curvature meets the lip all the way to each tip.
 const recess=new T.Mesh(panel,lining);recess.position.copy(pivot);recess.position.y-=.033;body.add(recess);
 const up=new T.Vector3(0,1,0),end=new T.Vector3(),delta=new T.Vector3();
 const arms=[-.30,.30].map(x=>{
   const root=pivot.clone().add(new T.Vector3(x,-.040,.026));
   const joint=new T.Vector3(x,-.015,-.010);
   const rod=box(body,.032,1,.045,lining,0,0,0);
   return {root,joint,rod};
 });
 function update(t){
   blade.position.copy(pivot);blade.position.y+=.167*t;blade.position.z-=.089*t;blade.rotation.x=.52*t;
   for(const {root,joint,rod} of arms){
     rod.visible=t>.015;if(!rod.visible)continue;
     end.copy(joint).applyQuaternion(blade.quaternion).add(blade.position);
     delta.subVectors(end,root);rod.scale.y=delta.length();
     rod.position.copy(root).lerp(end,.5);rod.quaternion.setFromUnitVectors(up,delta.normalize());
   }
 }
 update(0);
 return update;
}
export async function carModel(base64){
 const data=Uint8Array.from(atob(base64),v=>v.charCodeAt(0)).buffer;
 const {scene,parser}=await new GLTFLoader().parseAsync(data,'');scene.updateMatrixWorld(true);
 const geometryGroup=new T.Group();
 const paint=new T.MeshPhysicalMaterial({color:0x17adce,metalness:.58,roughness:.26,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.15});
 const box3=new T.Box3().setFromObject(scene,true), size=box3.getSize(new T.Vector3()), center=box3.getCenter(new T.Vector3());
 const scale=4.997/size.z;
 const byMaterial=new Map(),wheelParts=new Map(),wheelPivots=[],body=new T.Group(),windows=new Set();
 let deckPanel;
 geometryGroup.add(body);
 const handwheel=new T.Group(),steeringAxis=new T.Vector3(0,-.34,.94).normalize();
 body.add(handwheel);
 const dashMap=texture(512,120,()=>{}),dash=dashMap.image.getContext('2d');
 const dashMat=new T.MeshBasicMaterial({map:dashMap,side:T.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1});
 let lastReadout=null,lastReverse=false;
 function updateCluster(v,reverse=false){
   const kph=Math.round(Math.abs(v)*3.6);if(lastReadout===kph&&lastReverse===reverse)return;lastReadout=kph;lastReverse=reverse;
   dash.fillStyle='#111c24';dash.fillRect(0,0,512,120);
   dash.fillStyle='#59ded7';dash.fillRect(10,105,490*Math.min(1,kph/265),4);
   dash.textAlign='center';dash.textBaseline='middle';dash.fillStyle='#f4f8fa';dash.font='bold 77px Arial';dash.fillText(String(kph),253,50);
   dash.fillStyle='#a8b6bb';dash.font='18px Arial';dash.fillText('km/h',253,92);
   dash.font='bold 28px Arial';dash.fillStyle=reverse?'#ffcb8e':'#76e6d5';dash.fillText(reverse?'R':'D',51,51);dash.font='20px Arial';dash.fillText('AWD',446,52);
   dashMap.needsUpdate=true;
 }
 updateCluster(0);
 const tail=new T.MeshStandardMaterial({color:0x8d0819,emissive:0xff1424,emissiveIntensity:.65,roughness:.24,metalness:.12});
 scene.traverse(o=>{
  if(!o.isMesh) return;
  let m=o.material;
  if(m.name.includes('CarPaint_SU7'))m=paint;
  else if(m.name.includes('Lights_216')&&o.name.includes('RearKit'))m=tail;
  else if(m.name.includes('Glass_231')){m.transmission=0;m.transparent=true;m.opacity=.87;m.color.setHex(0x182c38);m.roughness=.16;m.metalness=.25;m.depthWrite=false;windows.add(m);}
  else if(m.name==='Light_glass'){m.transparent=true;m.opacity=.13;m.color.setHex(0xb5e8f4);m.depthWrite=false;}
  const geom=o.geometry.clone();geom.applyMatrix4(o.matrixWorld);geom.translate(-center.x,-box3.min.y,-center.z);geom.scale(scale,scale,scale);
  const meshIndex=parser.associations.get(o)?.meshes;
  if(meshIndex===39)deckPanel=detachDeckPanel(o.geometry,geom);
  const instrument=cabinParts[meshIndex];
  if(instrument){
   const wheelIDs=new Set(instrument.wheel),screenIDs=new Set(instrument.screen);
   const fixed=[],wheelFaces=[],screenFaces=[],idx=geom.index.array;
   for(let i=0;i<idx.length;i+=3){const group=wheelIDs.has(idx[i])?wheelFaces:screenIDs.has(idx[i])?screenFaces:fixed;group.push(idx[i],idx[i+1],idx[i+2]);}
   if(wheelFaces.length){
    const pivot=new T.Vector3(.414,.747,.407).applyMatrix4(o.matrixWorld).sub(new T.Vector3(center.x,box3.min.y,center.z)).multiplyScalar(scale);
    handwheel.position.copy(pivot);
    const spin=geom.clone();spin.setIndex(wheelFaces);spin.translate(-pivot.x,-pivot.y,-pivot.z);handwheel.add(new T.Mesh(spin,m));
   }
   if(screenFaces.length){
    const src=o.geometry.attributes.position,points=instrument.screen.map(i=>[src.getX(i),src.getY(i)]);
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minY=Math.min(...ys),maxY=Math.max(...ys),minX=Math.min(...xs),maxX=Math.max(...xs);
    const live=new T.BufferGeometry(),xyz=[],uv=[];
    for(const i of screenFaces){const p=geom.attributes.position;xyz.push(p.getX(i),p.getY(i),p.getZ(i));
      uv.push((maxX-src.getX(i))/(maxX-minX),(src.getY(i)-minY)/(maxY-minY));}
    live.setAttribute('position',new T.Float32BufferAttribute(xyz,3));live.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    body.add(new T.Mesh(live,dashMat));
   }
   geom.setIndex(fixed);
  }
  let ancestor=o.parent;
  while(ancestor&&!/^3DWheel[ _](Front|Rear)/i.test(ancestor.name))ancestor=ancestor.parent;
  if(ancestor&&!/Brake_/i.test(o.name)){
    if(!wheelParts.has(ancestor))wheelParts.set(ancestor,[]);
    wheelParts.get(ancestor).push(new T.Mesh(geom,m));
  }else{if(!byMaterial.has(m))byMaterial.set(m,[]);byMaterial.get(m).push(geom);}
 });
 for(const [m,geoms] of byMaterial){
   const merged=mergeGeometries(geoms,false);
   if(merged)body.add(new T.Mesh(merged,m));else geoms.forEach(g=>body.add(new T.Mesh(g,m)));
 }
 for(const [original,parts] of wheelParts){
   const hub=new T.Group(),spin=new T.Group(),bounds=new T.Box3();parts.forEach(part=>bounds.expandByObject(part,true));
   const pivot=bounds.getCenter(new T.Vector3());hub.position.copy(pivot);for(const part of parts){part.position.copy(pivot).negate();spin.add(part);}
   hub.add(spin);geometryGroup.add(hub);wheelPivots.push({hub,spin,front:original.name.includes('Front')});
 }
 const updateWing=mountSpoiler(body,deckPanel,paint);
 geometryGroup.add(softShadow(3.28,6.48));
 const makeOpponent=(tint)=>{
   const clone=geometryGroup.clone(true),newPaint=paint.clone(),rivalTail=tail.clone();newPaint.color.setHex(tint);
   clone.traverse(o=>{if(o.isMesh&&o.material===paint)o.material=newPaint;else if(o.isMesh&&o.material===tail)o.material=rivalTail;else if(o.isMesh&&windows.has(o.material))o.material=o.material.clone();});return clone;
 };
 const lowDetail=exteriorLod(geometryGroup,paint,tail);
 function makeDistant(tint){
    const clone=lowDetail.clone(true);
    clone.traverse(m=>{if(m.isMesh&&m.name==='paint'){m.material=m.material.clone();m.material.color.setHex(tint);}});
    return clone;
 }
 return {object:geometryGroup,makeOpponent,makeDistant,cockpit(enabled){for(const w of windows)w.opacity=enabled?.025:.87;},suspension(pitch,roll){
    body.rotation.set(pitch,0,roll,'YXZ');
 },drive(speed,steering,brake,dt,reverse=false){
    updateCluster(speed,reverse);handwheel.quaternion.setFromAxisAngle(steeringAxis,steering*(1.25-.65*Math.min(1,Math.abs(speed)/65)));
    for(const w of wheelPivots){w.spin.rotation.x+=speed*dt/.351;if(w.front)w.hub.rotation.y=-steering*.34;}
    tail.emissiveIntensity=brake?2.0:.55;
 },updateWing};
}
function exteriorLod(source,paint,tail){
 // Cluster the original exterior to preserve its silhouette when an AI car recedes.
 source.updateMatrixWorld(true);const groups=new Map(),point=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();
 source.traverseVisible(o=>{
   if(!o.isMesh||o.material.transparent&&o.material.name==='Light_glass'||!o.geometry.index||o.material.map?.image?.width===128&&o.material.depthWrite===false)return;
   const mat=o.material;
   if(/Details_INT|Details_Grid|Chassis/i.test(mat.name))return;
   const role=mat===paint?'paint':mat===tail?'tail':/Glass_231/.test(mat.name)?'glass':/Wheel1A|Disk_/.test(mat.name)?'wheel':'trim';
   if(!groups.has(role))groups.set(role,{vertices:[],normals:[],indices:[],bins:new Map()});const g=groups.get(role);
   const a=o.geometry.attributes.position,normals=o.geometry.attributes.normal,ids=new Map();
   const exteriorPanel=role==='paint'||role==='glass'||role==='tail';
   const cells=exteriorPanel?23:12;
   normalMatrix.getNormalMatrix(o.matrixWorld);
   const faces=o.geometry.index.array;
   for(const i of faces){
     if(ids.has(i))continue;
     point.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);
     normal.fromBufferAttribute(normals,i).applyNormalMatrix(normalMatrix);
     // Keep creases and thin lamp strips distinct where adjacent surfaces share a cell.
     const cell=[point.x*cells,point.y*cells,point.z*cells];
     if(exteriorPanel)cell.push(normal.x,normal.y,normal.z);
     const tag=cell.map(Math.round).join(',');
     let n=g.bins.get(tag);
     if(n===undefined){n=g.vertices.length/3;g.bins.set(tag,n);g.vertices.push(point.x,point.y,point.z);g.normals.push(normal.x,normal.y,normal.z);}
     ids.set(i,n);
   }
   for(let i=0;i<faces.length;i+=3){const a=ids.get(faces[i]),b=ids.get(faces[i+1]),c=ids.get(faces[i+2]);
     if(a!==b&&a!==c&&b!==c)g.indices.push(a,b,c);}
 });
 const highColors={paint:0x91b4a2,tail:0xde2231,glass:0x20313c,wheel:0x697178,trim:0x1c2226};
 const car=new T.Group();for(const [role,data] of groups){
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(data.vertices,3));geo.setAttribute('normal',new T.Float32BufferAttribute(data.normals,3));geo.setIndex(data.indices);
   const material=new T.MeshStandardMaterial({color:highColors[role],roughness:role==='trim'?.8:.35,metalness:role==='paint'?.5:.16,side:T.DoubleSide});
   if(role==='tail'){material.emissive.setHex(0xbd1520);material.emissiveIntensity=.65;}
   const mesh=new T.Mesh(geo,material);mesh.name=role;car.add(mesh);
 }
 car.add(softShadow(3.1,6.2));return car;
}
export async function setupStage(renderer){
 const garage=new T.Scene(),world=new T.Scene();
 const pm=new T.PMREMGenerator(renderer),room=new RoomEnvironment(renderer);
 const environment=pm.fromScene(room,.045);garage.environment=world.environment=environment.texture;pm.dispose();room.dispose();
 garage.background=new T.Color(0x1c303a);garage.fog=new T.FogExp2(0x1c303a,.018);
 garage.add(new T.HemisphereLight(0xebf8ff,0x68777f,2.3));
 const key=new T.DirectionalLight(0xf1fbff,3.2);key.position.set(4,8,5);garage.add(key);const rim=new T.DirectionalLight(0x7eeaff,2.6);rim.position.set(-4,3,-4);garage.add(rim);
 const ground=new T.Mesh(new T.PlaneGeometry(320,320),new T.MeshStandardMaterial({color:0x344750,roughness:.51,metalness:.34}));ground.rotation.x=-Math.PI/2;ground.position.y=-.025;garage.add(ground);
 const trackgrid=new T.GridHelper(150,100,0x47616b,0x3b515c);trackgrid.position.y=-.017;garage.add(trackgrid);
 for(const a of [3.42,3.49,6.65]){const ring=new T.Mesh(new T.RingGeometry(a,a+.014,150),basic(a===3.42?0x62c3cc:0x70888b));ring.rotation.x=-Math.PI/2;ring.position.y=-.009;garage.add(ring);}
 world.add(new T.HemisphereLight(0xe1f5ff,0x839568,1.95));const sun=new T.DirectionalLight(0xffe7bf,2.35);sun.position.set(-100,130,70);world.add(sun);
 const load=new T.TextureLoader(),[outside,roadPhoto,grassPhoto,...treePhotos]=await Promise.all(
   [photographs.sky,photographs.road,photographs.grass,...photographs.trees].map(url=>load.loadAsync(url)));
 for(const tex of [outside,roadPhoto,grassPhoto,...treePhotos])tex.colorSpace=T.SRGBColorSpace;
 outside.mapping=T.EquirectangularReflectionMapping;
 // The light on the car comes from the same panorama as the sky in the mirror.
 world.background=outside;
 const rawHDR=new RGBELoader().parse(Uint8Array.from(atob(photographs.lighting),c=>c.charCodeAt(0)).buffer);
 const hdri=new T.DataTexture(rawHDR.data,rawHDR.width,rawHDR.height,T.RGBAFormat,rawHDR.type);
 hdri.flipY=true;hdri.colorSpace=T.LinearSRGBColorSpace;hdri.mapping=T.EquirectangularReflectionMapping;hdri.needsUpdate=true;
 const baker=new T.PMREMGenerator(renderer);world.environment=baker.fromEquirectangular(hdri).texture;baker.dispose();hdri.dispose();
 world.backgroundBlurriness=0;world.backgroundIntensity=.89;world.environmentIntensity=.95;
 world.fog=new T.FogExp2(0xb4bfc3,.00167);
 sun.intensity=2.0;world.children.find(light=>light.isHemisphereLight).intensity=1.32;
 const sprintFinish=buildTrack(world,roadPhoto,grassPhoto,treePhotos);
 circuitFurniture(world);
 return {garage,world,sprintFinish};
}
function buildTrack(scene,asphalt,grassMap,treePhotos){
 const t=course.terrain,coords=[],indices=[],col=[];
 const terrain=buildRoadTerrain(t,sample,LENGTH,STEP/2);
 const rnd=rng(606),cl=new T.Color();
 for(let j=0;j<t.nz;j++)for(let i=0;i<t.nx;i++){let k=j*t.nx+i;coords.push(t.x+i*t.step,terrain.heights[k],t.z+j*t.step);cl.setHSL(.258+rnd()*.029,.20+rnd()*.08,.245+rnd()*.06);col.push(cl.r,cl.g,cl.b);if(i<t.nx-1&&j<t.nz-1)indices.push(k,k+t.nx,k+1,k+1,k+t.nx,k+t.nx+1);}
 function mesh(pos,idx,mat,colors=null,uv=null){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,mat);scene.add(m);return m;
 }
 const landUV=[];for(let j=0;j<t.nz;j++)for(let i=0;i<t.nx;i++)landUV.push(i*2,j*2);
 mesh(coords,indices,new T.MeshLambertMaterial({vertexColors:true,map:grassMap}),col,landUV);
 asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;asphalt.anisotropy=4;
 const road=new T.MeshStandardMaterial({map:asphalt,color:new T.Color(1.85,1.93,2.04),roughness:.88,side:T.DoubleSide});
 grassMap.wrapS=grassMap.wrapT=T.RepeatWrapping;grassMap.anisotropy=4;
 const grass=new T.MeshLambertMaterial({map:grassMap,color:0xebedd5,side:T.DoubleSide});
 const treeMats=treePhotos.map(map=>new T.MeshBasicMaterial({map,side:T.DoubleSide,alphaTest:.38,alphaToCoverage:true,color:0xd6ddbc}));
 const shadeCanvas=document.createElement('canvas');shadeCanvas.width=2048;shadeCanvas.height=2048;
 const shade=shadeCanvas.getContext('2d');shade.fillStyle='#fff';shade.fillRect(0,0,2048,2048);
 const shadeTex=new T.CanvasTexture(shadeCanvas);shadeTex.flipY=false;shadeTex.anisotropy=2;
 function addBakedLight(mat){
   mat.onBeforeCompile=shader=>{
     shader.uniforms.forestShade={value:shadeTex};
     shader.vertexShader='attribute vec2 shadeUV; varying vec2 vShade;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShade=shadeUV;');
     shader.fragmentShader='uniform sampler2D forestShade; varying vec2 vShade;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','float canopy=texture2D(forestShade,vShade).r; outgoingLight*=mix(vec3(.34,.42,.52),vec3(1.),canopy);\n#include <opaque_fragment>');
     if(mat===road){
       shader.vertexShader='attribute vec2 lineZone; varying vec2 vLineZone;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLineZone=lineZone;');
       shader.fragmentShader='varying vec2 vLineZone;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat d=abs(vLineZone.x); float used=exp(-d*d*.27);float rubber=exp(-pow((d-.83)*2.1,2.));diffuseColor.rgb*=1.-vLineZone.y*(.20*used+.18*rubber);');
     }
   };
 }
 const curb=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
 const metal=new T.MeshStandardMaterial({color:0xc6ccca,metalness:.72,roughness:.39,side:T.DoubleSide}),white=lam(0xe4e1cf);white.side=T.DoubleSide;
 const edgePaint=white.clone();[road,grass,curb,edgePaint,metal].forEach(addBakedLight);
 const chunkMeters=128*STEP;
 const shadowStamps=treePhotos.map(tex=>{const c=document.createElement('canvas');c.width=128;c.height=256;
   const g=c.getContext('2d');g.drawImage(tex.image,0,0,c.width,c.height);g.globalCompositeOperation='source-in';g.fillStyle='#303030';g.fillRect(0,0,c.width,c.height);return c;});
 function treeShadow(s,lateral,p,height,width,index){
   const dx=.90*height,dz=-.72*height,ds=dx*p.tx+dz*p.tz,dl=-dx*p.tz+dz*p.tx;
   for(let j=Math.floor((s+Math.min(ds,0)-width)/chunkMeters);j<=Math.floor((s+Math.max(ds,0)+width)/chunkMeters);j++){
     const tile=mod(j,32),x=(tile%16)*128,y=Math.floor(tile/16)*1024,sx=124/52,sy=1020/chunkMeters;
     shade.save();shade.beginPath();shade.rect(x,y,128,1024);shade.clip();
     shade.translate(x+64+lateral*sx,y+2+(s-j*chunkMeters)*sy);
     const n=Math.hypot(ds,dl)||1;
     shade.transform(ds/n*width*sx,-dl/n*width*sy,-dl*sx,-ds*sy,0,0);
     shade.globalAlpha=.70;shade.drawImage(shadowStamps[index],-.5,-1,1,1);shade.restore();
   }
 }
 const bins=new Map(),cell=36;
 function key(x,z){return Math.floor(x/cell)+','+Math.floor(z/cell);}
 for(const p of pts){const k=key(p.x,p.z);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(p);}
 function safe(x,z){for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=bins.get(key(x+i*cell,z+j*cell));if(a?.some(p=>(p.x-x)**2+(p.z-z)**2<14**2))return false;}return true;}
 for(let start=0;start<N;start+=128){
  const cnt=Math.min(128,N-start),cross=Array.from({length:cnt+1},(_,i)=>sample((start+i)*STEP));
  const pavement=Array.from({length:cnt*4+1},(_,i)=>i%4?sample((start+i/4)*STEP):cross[i/4]);
  function ribbon(l1,h1,l2,h2,mat,colorAt){
   const v=[],ix=[],colors=[],uv=[],lighting=[];let color=new T.Color();
   const fine=mat===road||mat===edgePaint,rows=fine?pavement:cross;
   for(let i=0;i<rows.length;i++){
    const p=rows[i],row=fine?i/4:i,n=start+row;
    for(const [k,[lat,hh]] of [[l1,h1],[l2,h2]].entries()){
     const [x,z]=xz(p,lat);const h=typeof hh==='function'?hh(p,x,z):p.y+hh;
     v.push(x,h,z);uv.push(lat/4.4,n*STEP/4.4);
     const tile=start/128;lighting.push((tile%16*128+64+T.MathUtils.clamp(lat,-26,26)*124/52)/2048,(Math.floor(tile/16)*1024+2+row/128*1020)/2048);
     if(colorAt){color.set(colorAt(n,k));colors.push(color.r,color.g,color.b);}
    }
    if(i+1<rows.length){let a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
   }
   if(mat===curb){
    const curbV=[],curbI=[],curbC=[];
    for(let i=0;i<cnt;i++){let color=new T.Color(colorAt(start+i,0));curbV.push(...v.slice(i*6,(i+2)*6));let a=i*4;curbI.push(a,a+1,a+2,a+1,a+3,a+2);for(let j=0;j<4;j++)curbC.push(color.r,color.g,color.b);}
    const lang=[];for(let i=0;i<cnt;i++)lang.push(...lighting.slice(i*4,i*4+8));
    mesh(curbV,curbI,mat,curbC).geometry.setAttribute('shadeUV',new T.Float32BufferAttribute(lang,2));
   }else{
    const geo=mesh(v,ix,mat,colorAt?colors:null,uv).geometry;geo.setAttribute('shadeUV',new T.Float32BufferAttribute(lighting,2));
    if(mat===road){const line=[];for(let i=0;i<rows.length;i++){const s=(start+i/4)*STEP,bend=curvature(s,24),entry=curvature(s+48,32);
      const lateral=2.8*Math.tanh(bend*120)-1.1*Math.tanh(entry*95);
      const stress=.38+.60*Math.min(1,(Math.abs(entry)+Math.abs(bend))*65);
      line.push(l1-lateral,stress,l2-lateral,stress);
    }geo.setAttribute('lineZone',new T.Float32BufferAttribute(line,2));}
   }
  }
  ribbon(-5.9,0,5.9,0,road);
  for(const side of [-1,1]){
   ribbon(side*5.52,.023,side*5.64,.023,edgePaint);
   const bend=curvature((start+64)*STEP,125);
   if(Math.abs(bend)>.00065||start<128)ribbon(side*5.9,.012,side*6.62,.035,curb,i=>i%2?0xc63b32:0xe7ded1);
   ribbon(side*5.86,-.055,side*15,-.14,grass,(n,k)=>k?0x859a61:(n%5?0x8ea15e:0x909f60));
   ribbon(side*15,-.14,side*48,(p,x,z)=>terrain.heightAt(x,z)-.12,grass,(n,k)=>k?0x6e875a:0x859a61);
   const profile=[[.31,.01],[.37,-.08],[.43,-.09],[.51,0],[.56,.01],[.64,-.08],[.70,-.09],[.79,.015]];
   const pos=[],ind=[],light=[];
   for(let i=0;i<=cnt;i++){
    const p=cross[i],tile=start/128;
    for(let j=0;j<profile.length;j++){const [y,offset]=profile[j],lat=(8.9+offset)*side,[x,z]=xz(p,lat);
     pos.push(x,p.y+y,z);light.push((tile%16*128+64+lat*124/52)/2048,(Math.floor(tile/16)*1024+2+i/128*1020)/2048);
     if(i<cnt&&j<profile.length-1){const a=i*profile.length+j,b=a+profile.length;ind.push(a,b,a+1,a+1,b,b+1);}
    }
   }
   mesh(pos,ind,metal).geometry.setAttribute('shadeUV',new T.Float32BufferAttribute(light,2));
  }
  const trees=treeMats.map(()=>[]),poles=[];
  for(let i=0;i<cnt;i+=2){const p=cross[i];for(const sign of [-1,1]){
   const [x,z]=xz(p,sign*9);poles.push([x,p.y+.42,z,.09,.8,.09]);
   for(let k=0;k<3;k++){const d=(k===0?15+rnd()*9:24+rnd()*64)*sign;const [xx,zz]=xz(p,d);const x=xx+p.tx*rnd()*9,z=zz+p.tz*rnd()*9;if(!safe(x,z)||(start<64&&sign===1))continue;
    const y=p.y+T.MathUtils.clamp((Math.abs(d)-15)/33,0,1)*(terrain.heightAt(x,z)-.12-p.y)-.85;
    const height=12+rnd()*12,species=Math.floor(rnd()*treeMats.length),img=treePhotos[species].image;
    const width=height*img.width/img.height*(.90+rnd()*.30);
    trees[species].push([x,y,z,width,height,rnd()]);
    if(Math.abs(d)<43)treeShadow((start+i)*STEP,d,p,height,width,species);}
  }}
  makeInstances(scene,poles,postGeometry,postMaterial,false);
  trees.forEach((treesOfKind,i)=>makeInstances(scene,treesOfKind,treeGeometry,treeMats[i],true));
 }
 // Start gantry, grid boxes, and kilometre boards give the circuit a race-day scale.
 const gate=new T.Group();scene.add(gate);place(gate,0,0);
 const rail=lam(0x68777c);for(const x of [-7,7])box(gate,.27,5.6,.35,rail,x,2.8,0);
 box(gate,14.5,1.05,.52,lam(0x1e3139),0,5.5,0);
 const banner=new T.Mesh(new T.PlaneGeometry(13.8,.94),nameplate('N O R D S C H L E I F E','#152831','#e6f5ec'));banner.rotation.y=Math.PI;banner.position.set(0,5.5,-.27);gate.add(banner);
 const checker=texture(64,16,(c)=>{for(let x=0;x<16;x++)for(let y=0;y<2;y++){c.fillStyle=(x+y)%2?'#292b2d':'#e6e7da';c.fillRect(x*4,y*8,4,8);}});
 const line=new T.Mesh(new T.PlaneGeometry(11.7,1),new T.MeshLambertMaterial({map:checker}));line.rotation.x=-Math.PI/2;line.position.y=.04;gate.add(line);
 for(let k=1;k<7;k++){const g=new T.Group();place(g,-k*7,k%2?2.5:-2.5);scene.add(g);box(g,2.6,.025,.16,white,0,.03,2.6);for(const x of [-1.28,1.28])box(g,.1,.025,1,white,x,.03,2.16);}
 for(let k=1;k<=20;k++){const g=new T.Group();place(g,k*1000,-9.3);scene.add(g);box(g,.07,1.8,.07,rail,0,.8,0);
  const m=new T.Mesh(new T.PlaneGeometry(2,.68),nameplate(k+'  km','#e6e8d8','#213e3c'));m.rotation.y=Math.PI;m.position.y=1.8;g.add(m);}
 shadeTex.needsUpdate=true;
 const sprintFinish=gate.clone();scene.add(sprintFinish);place(sprintFinish,3200,0);
 sprintFinish.children.find(o=>o.isMesh&&o.geometry===banner.geometry).material=nameplate('NORDRUN   /   FINISH','#123b45','#86f7ee');
 return sprintFinish;
}
const postMaterial=lam(0x7d8580),postGeometry=new T.BoxGeometry(1,1,1);
const brakingCorners=[570,1510,4260,5680,7350,8380,9980,13110,15740,18480];
const brakeBoards=brakingCorners.flatMap(corner=>[100,50].map(before=>({
  s:corner-before,lane:-(Math.sign(curvature(corner,28))||1)*8.2,before,
  width:.64,length:.055
})));
export const trackPosts=[...brakeBoards,...[0,3200].flatMap(s=>[-7,7].map(lane=>({
  s,lane,sprintOnly:s===3200,width:.15,length:.19
})))];
function circuitFurniture(scene){
 const fenceTex=texture(64,64,(ctx)=>{
   ctx.strokeStyle='#a0a6a4';ctx.lineWidth=3.6;ctx.beginPath();
   for(const x of [-64,0,64]){ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.moveTo(x+64,0);ctx.lineTo(x,64);}ctx.stroke();
 });
 fenceTex.wrapS=fenceTex.wrapT=T.RepeatWrapping;fenceTex.anisotropy=4;
 const fenceMat=new T.MeshBasicMaterial({map:fenceTex,side:T.DoubleSide,transparent:true,depthWrite:false,opacity:.58});
 const poleMat=lam(0x7b868a);
 // Catch fencing in marshal and spectator areas. Posts and mesh follow the road grade.
 for(const [begin,end,side] of [[-120,210,1],[220,590,-1],[2200,2380,1],[4100,4320,1],[5430,5680,-1],[8040,9160,1],[13120,13420,-1],[15350,16000,1],[17400,17600,1],[19300,19620,-1]]){
   let coords=[],idx=[],uv=[],posts=[];const steps=Math.ceil((end-begin)/4.3);
   for(let i=0;i<=steps;i++){const dist=begin+(end-begin)*i/steps,p=sample(dist),[x,z]=xz(p,side*10.5);
     coords.push(x,p.y+.55,z,x,p.y+3.25,z);uv.push(i*14,0,i*14,9);
     if(i<steps){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
     posts.push([x,p.y+1.58,z,.075,3.32,.075]);}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);
   scene.add(new T.Mesh(g,fenceMat));makeInstances(scene,posts,postGeometry,poleMat,false);
 }
 // Braking markers face approaching traffic at selected corners.
 for(const {s,lane,before} of brakeBoards){
     const g=new T.Group();place(g,s,lane);scene.add(g);
     box(g,.055,.95,.065,poleMat,0,.4,0);
     const m=new T.Mesh(new T.PlaneGeometry(1.25,.62),nameplate(String(before),'#e6e5d9','#202625'));
     m.position.y=1.12;m.rotation.y=Math.PI;g.add(m);
 }
 const cabin=new T.Group();place(cabin,-15,17.8);cabin.rotation.x=0;scene.add(cabin);
 const concrete=lam(0xa2a099),slate=lam(0x3d474a),window=new T.MeshStandardMaterial({color:0x314a58,metalness:.58,roughness:.27});
 box(cabin,6,3.1,14,concrete,0,1.35,0);box(cabin,5.6,1.03,13.4,window,0,3.30,0);
 box(cabin,6.7,.25,15,slate,0,3.95,0);box(cabin,6.15,.2,14.5,slate,0,2.83,0);
 for(let z=-6;z<=6;z+=2)box(cabin,5.7,1.06,.09,slate,0,3.32,z);
}
const treeGeometry=(()=>{const a=new T.PlaneGeometry(1,1).translate(0,.5,0),b=a.clone().rotateY(Math.PI/2);return mergeGeometries([a,b]);})();
function makeInstances(scene,items,geo,mat,tree){
 if(!items.length)return;
 const inst=new T.InstancedMesh(geo,mat,items.length), dummy=new T.Object3D();
 items.forEach(([x,y,z,a,b,c],i)=>{dummy.position.set(x,y,z);dummy.scale.set(a,b,tree?a:c);dummy.rotation.y=tree?c*Math.PI:0;dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);if(tree)inst.setColorAt(i,new T.Color().setScalar(.65+.34*c));});
 inst.computeBoundingSphere();scene.add(inst);
}
