import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {VEHICLES} from './vehicles.mjs';
import {pts} from './track.mjs';

const carbon=new T.MeshStandardMaterial({color:0x202428,metalness:.42,roughness:.37,side:T.DoubleSide});
const graphite=new T.MeshStandardMaterial({color:0x535862,metalness:.77,roughness:.32,side:T.DoubleSide});
const bright=new T.MeshStandardMaterial({color:0xb8bec4,metalness:.85,roughness:.28,side:T.DoubleSide});
const smooth=(value,lo,hi)=>T.MathUtils.smoothstep(value,lo,hi);
const P=(x,y,z)=>new T.Vector3(x,y,z);

// Loft neighbouring surface rings with end caps. All sections are in car
// coordinates (+Z forward), including the curved tips of the aerofoils.
function loft(rings){
 const positions=[],indices=[],n=rings[0].length;
 for(const ring of rings)for(const p of ring)positions.push(...p);
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
   const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,b,b+n,a,b+n,a+n);
 }
 for(let j=1;j<n-1;j++){const k=(rings.length-1)*n;indices.push(0,j+1,j,k,k+j,k+j+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function aerofoil(halfSpan,y,z,chord,tipRise=0,sweep=0){
 return loft([-1,-.88,-.46,0,.46,.88,1].map(t=>{
   const edge=Math.abs(t),r=edge**2,b=z+sweep*r,c=chord*(1-.23*r),h=y+tipRise*r;
   return [[t*halfSpan,h,b-c*.52],[t*halfSpan,h+.018,b-c*.36],[t*halfSpan,h+.025,b+c*.26],
     [t*halfSpan,h+.006,b+c*.5],[t*halfSpan,h-.013,b+c*.28],[t*halfSpan,h-.011,b-c*.38]];
 }));
}
function flange(side,z0,z1,x,y,width,raise){
 return loft([z0,z0+(z1-z0)*.12,z1-(z1-z0)*.10,z1].map((z,i)=>{
   const w=(i===0||i===3?.5:1)*width;
   return [[x*side,y+raise,z],[(x+w)*side,y+raise*.2,z],[(x+w)*side,y-.015,z],[x*side,y-.012,z]];
 }));
}
function strut(x,y,z,height,lean,footDepth=.14){
 return loft([[y,z,footDepth],[y+height,z+lean,footDepth*.68]].map(([yy,zz,l])=>
   [[x-.022,yy,zz-l/2],[x+.022,yy,zz-l/2],[x+.022,yy,zz+l/2],[x-.022,yy,zz+l/2]]));
}
function addParts(parent,material,parts){
 if(!parts.length)return;
 const flattened=parts.map(part=>{const g=part.index?part.toNonIndexed():part;g.deleteAttribute('uv');return g;});
 const merged=mergeGeometries(flattened,false);parent.add(new T.Mesh(merged,material));
 for(const g of [...new Set([...parts,...flattened])])g.dispose();
}
function rimCover(hub,spin,kind){
 const side=Math.sign(hub.position.x),outer=.132*side,metal=[],dark=[],r=kind==='su7'?.247:.271;
 const center=new T.CylinderGeometry(.082,.085,.015,24);center.rotateZ(Math.PI/2);center.translate(outer,0,0);metal.push(center);
 const annulus=new T.RingGeometry(r*.89,r,40);annulus.rotateY(side*Math.PI/2);annulus.translate(outer,0,0);metal.push(annulus);
 const bands=kind==='su7'?7:5;
 for(let i=0;i<bands;i++){
   const a=i*2*Math.PI/bands,blade=(rad,angle,offset)=>[outer+side*offset,rad*Math.sin(angle),rad*Math.cos(angle)];
   const sections=[.066,r*.72,r*.94].map((rad,j)=>{
     const phase=a+side*.19*j,spread=kind==='su7'?.22:.115;
     return [blade(rad,phase-spread,.004),blade(rad,phase+spread,.006),blade(rad,phase+spread,-.011),blade(rad,phase-spread,-.011)];
   });
   metal.push(loft(sections));
   if(kind==='yu7gt')dark.push(loft(sections.map((ring,j)=>ring.map(([x,y,z])=>[x-.012*side,y*Math.cos(.15)-z*Math.sin(.15),z*Math.cos(.15)+y*Math.sin(.15)]))));
 }
 addParts(spin,kind==='yu7gt'?graphite:bright,metal);addParts(spin,carbon,dark);
}
// Sample the painted shell and bumper at each attachment rather than drawing a
// flat bar across the curved nose or leaving a diffuser suspended behind it.
// Bucket the factory body triangles in the plane perpendicular to each probe
// axis. Construct each index only once during fitting, then release it.
const probeCache=new WeakMap();
const probeAxes={x:[1,2,0],y:[2,0,1],z:[0,1,2]};
const cellId=(a,b)=>a*128+b;
function surfaceProbe(body,includeGlass=false){
 let indices=probeCache.get(body);
 if(!indices){indices=new Map();probeCache.set(body,indices);}
 function build(axis){
   const bins=new Map(),[u,v,w]=probeAxes[axis];
   for(const mesh of body.children){
     if(!mesh.isMesh||mesh.name==='Media screen'||/Details_INT|Chassis/.test(mesh.material.name))continue;
     const g=mesh.geometry,p=g.getAttribute('position'),faces=g.index?.array;
     if(!faces)continue;
     const values=p.array;
     for(let i=0;i<faces.length;i+=3){
       const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
       const au=values[a+u],av=values[a+v],aw=values[a+w],bu=values[b+u]-au,bv=values[b+v]-av,cu=values[c+u]-au,cv=values[c+v]-av;
       const det=bu*cv-bv*cu;if(Math.abs(det)<1e-9)continue;
       const tri={au,av,aw,bu,bv,cu,cv,bw:values[b+w]-aw,cw:values[c+w]-aw,inv:1/det,
         front:mesh.material.side===T.DoubleSide?0:Math.sign(det),glass:mesh.material.transparent};
       const i0=Math.floor((au+Math.min(0,bu,cu))*8),i1=Math.floor((au+Math.max(0,bu,cu))*8);
       const j0=Math.floor((av+Math.min(0,bv,cv))*8),j1=Math.floor((av+Math.max(0,bv,cv))*8);
       for(let iu=i0;iu<=i1;iu++)for(let iv=j0;iv<=j1;iv++){
         const key=cellId(iu,iv);let bucket=bins.get(key);if(!bucket){bucket=[];bins.set(key,bucket);}bucket.push(tri);
       }
     }
   }
   indices.set(axis,bins);return bins;
 }
 return (x,y,z,axis,sign)=>{
   const coords=[x,y,z],[ui,vi,wi]=probeAxes[axis],u=coords[ui],v=coords[vi],bins=indices.get(axis)||build(axis);
   const bucket=bins.get(cellId(Math.floor(u*8),Math.floor(v*8)));if(!bucket)return null;
   let best=-Infinity;
   for(const t of bucket){
     if((t.front&&t.front!==sign)||(!includeGlass&&t.glass))continue;
     const du=u-t.au,dv=v-t.av,b=(du*t.cv-dv*t.cu)*t.inv,c=(dv*t.bu-du*t.bv)*t.inv;
     if(b<-.000001||c<-.000001||b+c>1.000001)continue;
     best=Math.max(best,sign*(t.aw+b*t.bw+c*t.cw));
   }
   if(best===-Infinity)return null;
   coords[wi]=sign*best;return P(...coords);
 };
}
function lip(body,sign,y,outer,extension){
 const sample=surfaceProbe(body),rings=[];
 for(let i=-18;i<=18;i++){
   const x=outer*i/18,edge=Math.abs(i/18),h=y+edge**3*.065;
   const hit=sample(x,h,0,'z',sign);if(!hit)continue;
   const tip=hit.z+sign*extension*(1-edge*.32),root=hit.z-sign*.107;
   rings.push([[x,h+.01,root],[x,h+.004,tip],[x,h-.016,tip],[x,h-.02,root]]);
 }
 return rings.length>1?loft(rings):null;
}
function addDiffuser(body){
 const sample=surfaceProbe(body),parts=[lip(body,-1,.263,.90,.053)].filter(Boolean);
 for(const x of [-.65,-.42,-.19,.19,.42,.65]){
   const hit=sample(x,.27,0,'z',-1);if(!hit)continue;
   parts.push(loft([[hit.z-.032,.222],[hit.z+.16,.177]].map(([zz,yy])=>[[x-.009,yy,zz],[x+.009,yy,zz],[x+.009,.288,zz],[x-.009,.288,zz]])));
 }
 addParts(body,carbon,parts);
}
function addCanard(probe,sign,height,start,end){
 const sections=[];
 for(let i=0;i<=8;i++){
   const t=i/8,z=start+(end-start)*t,y=height-.045*t;
   const hit=probe(0,y,z,'x',sign);if(!hit)continue;
   const root=hit.x-sign*.026,edge=hit.x+sign*(.003+.044*Math.sin(Math.PI*t));
   sections.push([[root,y+.005,z],[edge,y+.004,z],[edge,y-.008,z],[root,y-.005,z]]);
 }
 return sections.length>1?loft(sections):null;
}
function addUltra(body){
 const fixed=[aerofoil(.78,1.225,-2.30,.24,.018,.04)],sample=surfaceProbe(body);
 for(const side of [-1,1]){
   fixed.push(strut(side*.45,1.018,-2.24,.207,-.064));
   fixed.push(flange(side,-1.05,1.13,.892,.18,.071,.034));
   fixed.push(addCanard(sample,side,.34,1.98,2.33),addCanard(sample,side,.425,2.03,2.33));
 }
 fixed.push(lip(body,1,.218,.94,.060));
 addParts(body,carbon,fixed.filter(Boolean));addDiffuser(body);
 // Align the two bonnet stripes to the actual stamped bonnet, up to its nose.
 const stripes=[];
 for(const sign of [-1,1]){
   const rings=[];
   for(let z=1.11;z<=2.26;z+=.045){
     const xs=[.052,.115].map(x=>x*sign),edge=[];
     for(const x of xs){
       const hit=sample(x,0,z,'y',1);if(hit)edge.push([x,hit.y+.003,z]);
     }
     if(edge.length===2)rings.push([edge[0],edge[1],[edge[1][0],edge[1][1]-.001,z],[edge[0][0],edge[0][1]-.001,z]]);
   }
   if(rings.length>1)stripes.push(loft(rings));
 }
 addParts(body,carbon,stripes);
}

// The SUV has a longer roof, a much steeper rear window, a higher waist and
// wider haunches. Wheel centres stay at the 3 m wheelbase as the greenhouse
// moves rearward. The same deformation locates the mirrors and interior trim.
const roofStations=[[-2.50,-2.50],[-2.32,-2.38],[-1.98,-2.22],[-1.65,-2.04],[-1.2,-1.76],[-.72,-1.27],[-.28,-.62],[.15,-.02],[.62,.57],[1.08,1.08]];
function suvPoint(x,y,z){
 let roofZ=z;
 for(let i=1;i<roofStations.length;i++){
   const [s0,t0]=roofStations[i-1],[s1,t1]=roofStations[i];
   if(z<s0||z>s1)continue;
   const prev=roofStations[Math.max(0,i-2)],next=roofStations[Math.min(roofStations.length-1,i+1)];
   const t=(z-s0)/(s1-s0),u=1-t;
   const m0=(t1-prev[1])/(s1-prev[0]),m1=(next[1]-t0)/(next[0]-s0);
   roofZ=(1+2*t)*u*u*t0+t*u*u*(s1-s0)*m0+t*t*(3-2*t)*t1-t*t*u*(s1-s0)*m1;break;
 }
 const high=smooth(y,.70,1.19),rear=smooth(-z,.34,1.7);
 const shoulder=.13*rear*smooth(y,.56,1.0)*(1-smooth(y,1.19,1.44));
 const clearance=.067*smooth(y,.16,.95)+.055*smooth(y,.92,1.40);
 const hip=.032*Math.exp(-((Math.abs(z)-1.50)**2)/.19)*smooth(y,.35,.78)*(1-smooth(y,1.08,1.35));
 return [x*(1.018+hip),y+clearance+shoulder,T.MathUtils.lerp(z,roofZ,high)*1.0036];
}
function cleanBadge(body){
 for(const m of body.children){
   if(!m.isMesh||!m.geometry.index||!/Details_MAT/.test(m.material.name))continue;
   const g=m.geometry,p=g.getAttribute('position'),idx=g.index.array,kept=[];
   for(let i=0;i<idx.length;i+=3){
     const remove=[idx[i],idx[i+1],idx[i+2]].every(j=>p.getX(j)<-.31&&p.getX(j)>-.52&&p.getZ(j)<-2.418&&p.getY(j)>.685&&p.getY(j)<.75);
     if(!remove)kept.push(idx[i],idx[i+1],idx[i+2]);
   }
   if(kept.length!==idx.length){m.geometry=g.clone();m.geometry.setIndex(kept);}
 }
}
function dashboardMap(body,id){
 const screen=body.getObjectByName('Media screen');
 const geometry=screen.geometry.clone(),vertices=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
 geometry.computeBoundingBox();const {min,max}=geometry.boundingBox;
 for(let i=0;i<uv.count;i++)uv.setXY(i,(max.x-vertices.getX(i))/(max.x-min.x),(vertices.getY(i)-min.y)/(max.y-min.y));
 screen.geometry=geometry;
 const outline=document.createElement('canvas');outline.width=512;outline.height=300;
 const g=outline.getContext('2d');g.fillStyle='#182329';g.fillRect(0,0,512,300);
 g.fillStyle='#24343b';g.fillRect(0,66,310,234);
 const bounds=new T.Box3().setFromPoints(pts),size=bounds.getSize(new T.Vector3());
 const k=Math.min(265/size.x,202/size.z);g.strokeStyle='#abd8cb';g.lineWidth=4;g.beginPath();
 for(let i=0;i<pts.length;i+=8){const x=22+(pts[i].x-bounds.min.x)*k,y=78+(pts[i].z-bounds.min.z)*k;i?g.lineTo(x,y):g.moveTo(x,y);}
 g.closePath();g.stroke();
 g.fillStyle='#e8eef0';g.font='bold 32px Arial';g.fillText(id==='yu7gt'?'YU7 GT':id==='ultra'?'SU7 Ultra':'SU7',17,45);
 g.fillStyle='#94afb4';g.font='18px Arial';g.fillText('NORDSCHLEIFE',324,98);g.fillText('20.832 km',324,126);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=300;
 const ctx=canvas.getContext('2d'),map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
 screen.material=new T.MeshBasicMaterial({map,toneMapped:false,side:T.DoubleSide});
 let lastKph=-1,lastGear;
 function update(speed,reverse){
   const kph=Math.round(Math.abs(speed)*3.6);if(lastKph===kph&&lastGear===reverse)return;
   lastKph=kph;lastGear=reverse;ctx.drawImage(outline,0,0);
   ctx.fillStyle='#edfaf4';ctx.font='bold 56px Arial';ctx.fillText(String(kph),324,224);
   ctx.fillStyle='#9db5b8';ctx.font='18px Arial';ctx.fillText('km/h',324,250);
   ctx.fillStyle=reverse?'#ffbd7b':'#8fe3ba';ctx.font='bold 30px Arial';ctx.fillText(reverse?'R':'D',462,222);map.needsUpdate=true;
 }
 update(0,false);return update;
}
function rearBadge(body,id){
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;
 const ctx=canvas.getContext('2d');ctx.font='italic 600 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d0d5d7';
 ctx.fillText({su7:'SU7',ultra:'SU7 Ultra',yu7gt:'YU7 GT'}[id],160,40);
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
 const label=new T.Mesh(new T.PlaneGeometry(.20,.050),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const xyz=id==='yu7gt'?suvPoint(-.427,.719,-2.46):[-.427,.719,-2.46],probe=surfaceProbe(body);
 const at=probe(xyz[0],xyz[1],0,'z',-1),left=probe(xyz[0]-.012,xyz[1],0,'z',-1);
 if(at&&left){
   label.position.copy(at);label.position.z-=.003;
   label.rotation.y=Math.PI-Math.atan2(at.z-left.z,.012);body.add(label);
 }
}
function flushRoof(body){
 for(const m of body.children){
   if(!m.isMesh||!m.material.name.includes('CarPaint_Base_Black'))continue;
   const g=m.geometry.clone(),p=g.getAttribute('position');
   for(let i=0;i<p.count;i++){
     const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
     if(Math.abs(x)>.154||z<.088||z>.30||y<1.355)continue;
     const roof=1.431-(z-.09)*.291-.006*(x/.17)**2;
     if(y>roof)p.setY(i,roof);
   }
   g.computeVertexNormals();m.geometry=g;
 }
}
function shapeSUV(body,handwheel){
 for(const m of body.children){
   if(!m.isMesh)continue;
   const geom=m.geometry.clone(),p=geom.getAttribute('position'),n=geom.getAttribute('normal');
   // Preserve the authored normals at UV seams and sharp panel edges. The
   // inverse-transpose of the local warp keeps reflections continuous.
   const d=.001,normal=new T.Vector3();
   for(let i=0;i<p.count;i++){
     const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=suvPoint(x,y,z),b=suvPoint(x,y+d,z),c=suvPoint(x,y,z+d);
     p.setXYZ(i,...a);
     if(!n)continue;
     const sx=Math.abs(x)>.001?a[0]/x:1.018;
     const xy=(b[0]-a[0])/d,xz=(c[0]-a[0])/d,yy=(b[1]-a[1])/d,yz=(c[1]-a[1])/d,zy=(b[2]-a[2])/d,zz=(c[2]-a[2])/d;
     const nx=n.getX(i)/sx,ny=n.getY(i)-xy*nx,nz=n.getZ(i)-xz*nx,det=yy*zz-yz*zy;
     normal.set(nx,(zz*ny-zy*nz)/det,(yy*nz-yz*ny)/det).normalize();
     n.setXYZ(i,normal.x,normal.y,normal.z);
   }
   geom.computeBoundingSphere();geom.computeBoundingBox();m.geometry=geom;
 }
 handwheel.position.set(...suvPoint(...handwheel.position.toArray()));
}
function gtArch(probe,hub){
 const side=Math.sign(hub.position.x),rings=[];
 for(let i=0;i<=32;i++){
   const a=Math.PI*i/32;
   const cut=[.385,.421].map(r=>[hub.position.y+Math.sin(a)*r,hub.position.z+Math.cos(a)*r]);
   const edge=probe(0,...cut[1],'x',side);
   if(!edge||Math.abs(edge.x)<.82)continue;
   const inner=probe(0,...cut[0],'x',side),xin=inner&&Math.abs(inner.x)>.82?inner.x:edge.x;
   const [yi,zi]=cut[0],[yo,zo]=cut[1];
   rings.push([[xin+side*.006,yi,zi],[edge.x+side*.004,yo,zo],[edge.x-side*.005,yo,zo],[xin-side*.008,yi,zi]]);
 }
 return rings.length>1?loft(rings):null;
}
function gtIntake(probe,side){
 const xyz=[],index=[],columns=20,rows=6;
 for(let i=0;i<=columns;i++){
   const t=i/columns,x=side*(.28+.49*t),bottom=.24+.025*t,top=.47-.08*t-.12*smooth(t,.68,1);
   for(let j=0;j<=rows;j++){
     const y=T.MathUtils.lerp(bottom,top,j/rows),hit=probe(x,y,0,'z',1);
     if(!hit)return null;
     xyz.push(x,y,hit.z+.009);
     if(i<columns&&j<rows){const a=i*(rows+1)+j,b=a+rows+1;index.push(a,b,b+1,a,b+1,a+1);}
   }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setIndex(index);g.computeVertexNormals();return g;
}
function gtSill(probe,side){
 const rings=[];
 for(let i=0;i<=17;i++){
   const t=i/17,z=-1.08+2.14*t,bottom=.205,top=.28+.054*(1-Math.sin(Math.PI*t));
   const lo=probe(0,bottom,z,'x',side),hi=probe(0,top,z,'x',side);if(!lo||!hi)continue;
   rings.push([[lo.x+side*.004,bottom,z],[hi.x+side*.007,top,z],[hi.x-side*.022,top,z],[lo.x-side*.022,bottom,z]]);
 }
 return rings.length>1?loft(rings):null;
}
function addGT(body,bodyPaint,wheels){
 const paint=bodyPaint.clone();paint.side=T.DoubleSide;
 const red=[],dark=[];
 // A bridged roof wing frames the hatch. The lower ducktail follows the lamp line.
 const roof=surfaceProbe(body,true),sections=[];
 for(let i=-10;i<=10;i++){
   const x=i*.061,edge=Math.abs(i)/10,z=-1.55+edge**2*.09,top=roof(x,0,z,'y',1);
   if(!top)continue;
   const y=top.y-.006,tail=z-.34+.13*edge**3;
   sections.push([[x,y+.008,z+.045],[x,y+.027,z-.07],[x,y+.036,tail],[x,y+.016,tail-.012],[x,y-.012,z-.10]]);
 }
 if(sections.length>1)dark.push(loft(sections));
 for(const side of [-1,1]){

   dark.push(flange(side,-1.09,1.09,.952,.193,.068,.035));
 }
 red.push(aerofoil(.71,1.212,-2.382,.15,-.048,.125));
 dark.push(lip(body,1,.244,.95,.044));
 // Place the small bumper inlets on the flanks of the real front shell.
 const probe=surfaceProbe(body);
 for(const sign of [-1,1])dark.push(gtIntake(probe,sign),gtSill(probe,sign));
 for(const {hub} of wheels)dark.push(gtArch(probe,hub));
 addParts(body,paint,red);addParts(body,carbon,dark.filter(Boolean));addDiffuser(body);
}
export function sedanVariant(id,template,basePaint,baseTail,baseWindows){
 const object=template.clone(true),body=object.getObjectByName('Suspended body'),wheel=object.getObjectByName('Cabin wheel');
 const paint=basePaint.clone(),tail=baseTail.clone(),windows=[],windowCopies=new Map();
 paint.color.set(VEHICLES[id].color);
 object.traverse(m=>{
   if(!m.isMesh)return;
   if(m.material===basePaint)m.material=paint;
   else if(m.material===baseTail)m.material=tail;
   else if(baseWindows.has(m.material)){
     if(!windowCopies.has(m.material))windowCopies.set(m.material,m.material.clone());
     m.material=windowCopies.get(m.material);windows.push(m.material);
   }
 });
 const spoiler=body.getObjectByName('Rear aero assembly');
 // These configurations have a fixed rear deck. Leave its native skin shut.
 const blade=spoiler.getObjectByName('Active rear spoiler');blade.position.set(0,0,0);blade.rotation.x=0;
 for(const item of spoiler.children)if(item!==blade)item.visible=false;
 cleanBadge(body);const updateMedia=dashboardMap(body,id);
 const wheelPivots=object.children.filter(o=>o.userData.roadWheel).map(hub=>({hub,spin:hub.children[0],front:hub.userData.front}));
 if(id==='yu7gt'){
   // Bake the retracted skin into car-space so it follows the new hatch contour.
   const skin=blade.geometry.clone().translate(...spoiler.position.toArray());body.remove(spoiler);body.add(new T.Mesh(skin,paint));
   shapeSUV(body,wheel);
   for(const {hub,spin} of wheelPivots){
     hub.position.x*=1.037;hub.position.y*=1.065;hub.scale.set(1.035,1.065,1.065);
     rimCover(hub,spin,id);
   }
   addGT(body,paint,wheelPivots);
 }else if(id==='ultra'){
   object.updateMatrixWorld(true);addUltra(body);
 }else{
   flushRoof(body);
   for(const {hub,spin} of wheelPivots)rimCover(hub,spin,id);
 }
 rearBadge(body,id);probeCache.delete(body);
 return {object,body,handwheel:wheel,windows,wheelPivots,tail,updateMedia};
}
