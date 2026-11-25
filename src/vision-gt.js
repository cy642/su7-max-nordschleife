import {createVisionCockpit} from './vision-cockpit.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original game-scale bodywork drawn from the public, full-size MWC display car.
// z points towards the nose. Sections describe the sill, shoulder and cut-out
// for the bubble canopy independently of the wheel pods.
const stations = [
  // z, half width, outer shoulder y, inner deck y, canopy half width, roof y
  [-2.22,.99,.87,.74,.44,.78],[-2.05,1.035,.97,.80,.52,.90],
  [-1.56,1.07,.985,.84,.63,1.05],[-1.02,1.04,.92,.855,.71,1.18],
  [-.48,.99,.845,.87,.755,1.285],[.02,.965,.79,.866,.77,1.30],
  [.46,.975,.77,.84,.748,1.247],[.87,1.025,.817,.807,.66,1.115],
  [1.19,1.057,.897,.773,.47,.942],[1.39,1.065,.95,.746,.22,.79],
  [1.47,1.066,.957,.737,0,.737],[1.64,1.068,.955,.717,0,.717],
  [1.94,1.056,.899,.66,0,.66],[2.24,1.015,.765,.59,0,.59],
  [2.56,.951,.563,.504,0,.504]
];
const clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp, V=(x,y,z)=>new T.Vector3(x,y,z);
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
function section(z) {
  let i=0;
  while(i<stations.length-2 && stations[i+1][0]<z)i++;
  const a=stations[i],b=stations[i+1],l=stations[Math.max(0,i-1)],r=stations[Math.min(stations.length-1,i+2)];
  const h=b[0]-a[0], t=clamp((z-a[0])/h,0,1);
  return a.slice(1).map((v,k)=>{
    const j=k+1, v1=b[j], m0=h*(v1-l[j])/(b[0]-l[0]),m1=h*(r[j]-v)/(r[0]-a[0]);
    return clamp(mix(v,v1,t)+t*(1-t)*((1-t)*(m0-v1+v)+t*(v1-v-m1)),Math.min(v,v1),Math.max(v,v1));
  });
}
function mesh(parent,geometry,material){
  const part=new T.Mesh(geometry,material);parent.add(part);return part;
}
function patch(parent,mat,rows,cols,point){
  const pos=[],uv=[],idx=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const xyz=point(j/rows,i/cols);pos.push(...xyz);uv.push(i/cols,j/rows);
    if(i<cols&&j<rows){const a=j*(cols+1)+i,b=a+cols+1;idx.push(a,b,b+1,a,b+1,a+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return mesh(parent,g,mat);
}
function curve(points,closed=false){return new T.CatmullRomCurve3(points.map(p=>V(...p)),closed,'centripetal');}
function tube(parent,mat,points,radius,steps=28,closed=false){
  return mesh(parent,new T.TubeGeometry(curve(points,closed),steps,radius,8,closed),mat);
}
function block(parent,mat,x,y,z,w,h,d){
  const m=mesh(parent,new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);return m;
}
function decal(parent,txt,w,h,at,rotation){
  const c=document.createElement('canvas');c.width=384;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='#e9edf1';ctx.font='600 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt,192,44);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
  const m=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
  m.position.set(...at);m.rotation.set(...rotation);return m;
}
// Merge only rigid details with matching materials. Wheels and readouts animate independently.
function batch(parent){
  const byMat=new Map();
  for(const child of [...parent.children]){
    if(!child.isMesh)continue;
    child.updateMatrix();let g=child.geometry;
    if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}
    if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    g.applyMatrix4(child.matrix);
    if(!byMat.has(child.material))byMat.set(child.material,[]);
    byMat.get(child.material).push(g);parent.remove(child);
  }
  for(const [mat,parts] of byMat){const merged=mergeGeometries(parts);mesh(parent,merged,mat);parts.forEach(g=>g.dispose());}
}
export function createVisionGT(){
  const object=new T.Group(),coach=new T.Group(),fixed=new T.Group(),cabin=new T.Group(),glassParts=new T.Group();
  object.add(coach);const liner=new T.Group();coach.add(fixed,cabin,glassParts,liner);liner.visible=false;
  const pbr=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness,side:T.DoubleSide});
  const paint=new T.MeshPhysicalMaterial({color:0xaebfc1,roughness:.27,metalness:.59,clearcoat:.88,clearcoatRoughness:.17,side:T.DoubleSide});
  const black=pbr(0x1a2026,.5,.32),carbon=pbr(0x20282e,.28,.40),rubber=pbr(0x17191b,.02,.74),trim=pbr(0x464e52,.76,.30);
  const shadow=pbr(0x0d141a,.12,.63),rim=pbr(0x4b5157,.84,.30);
  const glass=new T.MeshPhysicalMaterial({color:0x0c1c25,metalness:.12,roughness:.205,ior:1.4,specularIntensity:.43,clearcoat:.31,clearcoatRoughness:.18,envMapIntensity:.32,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide});
  glass.forceSinglePass=true;
  const gasket=pbr(0x13191d,.10,.50);
  // The lower nose lies in the shadow of the floating bonnet. Use woven
  // albedo inside the tunnels so the garage sky does not wash the recess out.
  const weave=document.createElement('canvas');weave.width=weave.height=32;
  const wc=weave.getContext('2d');wc.fillStyle='#34393e';wc.fillRect(0,0,32,32);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const cross=(x+y)%4<2;wc.fillStyle=cross?'#42494d':'#363c40';
    wc.fillRect(x*4,y*4,cross?4:3,cross?3:4);
  }
  const map=new T.CanvasTexture(weave);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(18,10);
  const duct=new T.MeshLambertMaterial({color:0xaab0b2,map,side:T.DoubleSide});
  const splitter=new T.MeshLambertMaterial({color:0xd2d5d7,map,side:T.DoubleSide});
  const lens=pbr(0x10181c,.30,.22);
  const lamp=(color,intensity)=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.24,side:T.DoubleSide});
  const white=lamp(0xd3ebfb,1.2),red=lamp(0xae0614,.69);
  const wheelZ=[1.57,-1.49],axleY=.435,wheelR=.435;
  function realZ(z,x){
    return z-.26*smooth(1.95,2.56,z)*Math.pow(Math.abs(x),2.4);
  }
  function deck(side,z,t){
    const [w,ey,cy,inner]=section(z), x=mix(inner,w,t);
    const cross=t*t*(3-2*t);
    const nose=smooth(1.43,2.38,z);
    const y=mix(cy,ey,cross)+.027*Math.sin(Math.PI*t)**2-.025*Math.pow(t,9)+.046*nose*(1-cross);

    return [side*x,y,realZ(z,x)];
  }
  function archY(z){
    let sill=.17+.018*Math.cos(z);
    for(const axle of wheelZ){
      const d=Math.abs(z-axle),radius=wheelR+.024;
      if(d<radius)sill=Math.max(sill,axleY+Math.sqrt(radius*radius-d*d));
      else if(d<radius+.033)sill=Math.max(sill,mix(axleY,.17,(d-radius)/.033));
    }
    return Math.max(sill,.165+.30*smooth(2.045,2.30,z));
  }
  for(const side of [-1,1]){
    // The bonnet is a single crescent wing: one open horseshoe-shaped throat
    // runs around the *front* of the glazing and returns to both wheel pods.
    function throat(t){
      const mid=1.92-.93*smooth(.06,.66,t)-.10*smooth(.66,.92,t);
      const gap=(.052+.050*smooth(.26,.57,t))*(1-smooth(.63,.77,t));
      return [mid-gap,mid+gap,gap];
    }
    for(const front of [false,true])patch(fixed,paint,60,40,(s,t)=>{
      const [backLip,frontLip,gap]=throat(t),z=front?mix(frontLip,2.56,s):mix(-2.22,backLip,s);
      const p=deck(side,z,t);
      // The centre tongue is visibly below the outer wing's overhanging lip.
      if(!front)p[1]-=.038*(gap/.10)*smooth(backLip-.42,backLip,z);
      return p;
    });
    patch(fixed,duct,6,52,(u,t)=>{
      const [back,front,gap]=throat(t),p=deck(side,mix(back,front,u),t);
      p[1]-=gap*(.45+.9*Math.sin(Math.PI*u));return p;
    });
    for(const edge of [0,1])patch(fixed,black,4,52,(u,t)=>{
      const lips=throat(t),p=deck(side,lips[edge],t);p[1]-=lips[2]*(edge===0?.38+.82*u:1.25*u);return p;
    });
    for(let k=0;k<6;k++){
      const t=.48+k*.029,[back,front,gap]=throat(t),p=deck(side,mix(back,front,.46),t);
      const slat=block(fixed,duct,p[0],p[1]-gap*.72,p[2],.009,.025,(front-back)*.8);slat.rotation.z=side*.22;
    }
    patch(fixed,paint,200,9,(s,u)=>{
      const z=mix(-2.22,2.56,s),[w,ey]=section(z),low=archY(realZ(z,w));
      return [side*(w-.075*(1-u)+.034*Math.sin(Math.PI*u)),mix(low,Math.max(low+.012,ey-.025),u),realZ(z,w)];
    });
    // Return the edge of the body into each wheel well; never leave a thin
    // sheet floating in front of a tyre when seen from the nose.
    patch(fixed,black,216,4,(s,u)=>{
      const z=mix(-2.22,2.56,s),[w]=section(z),zz=realZ(z,w);
      return [side*(w-.075-.064*u),archY(zz)-.008*u,zz];
    });
    // A recessed wheel-house, separate from the silver arch, casts a dark reveal.
    for(const axle of wheelZ)patch(fixed,shadow,48,1,(s,u)=>{
      const a=Math.PI*s,r=wheelR+.026;return [side*mix(.83,1.046,u),axleY+r*Math.sin(a),axle+r*Math.cos(a)];
    });
    // Windscreen crown and smooth shoulders meet at the belt line.
    function canopy(z,u){
      const [,,y,w,roof]=section(z),angle=u*Math.PI/2;
      return [side*w*Math.sin(angle),mix(y,roof,Math.max(0,Math.cos(angle))**.84),z];
    }
    patch(glassParts,glass,70,26,(s,u)=>canopy(mix(-2.22,1.47,s),u));
    // Narrow door-glass reveals and windscreen frit follow the glazing surface.
    // Shell and canopy have separate highlights on the physical show car.
    // The windshield hoop is one continuous bent section from sill to sill.
    // Its crown meets the roof liner above the driver's head.
    patch(glassParts,gasket,48,4,(s,u)=>{
      const z=mix(.87,-.105,s)+(u-.5)*mix(.018,.009,s);
      const p=canopy(z,1-s);p[0]*=1.003;p[1]+=.002;return p;
    });
    patch(glassParts,gasket,30,2,(s,u)=>{
      const p=canopy(mix(-.53,-.69,s)+(u-.5)*.013,1-.8*s);
      p[0]*=1.003;p[1]+=.002;return p;
    });
    patch(fixed,gasket,42,3,(s,u)=>{const z=mix(-2.21,1.43,s),p=canopy(z,.997-.026*u);
      p[0]*=1.004;p[1]+=.002;return p;});
    // Inside, show the actual thickness of the roof surround and A-pillars.
    // The dark headliner and broad, shallow arch join above the panoramic dash.
    const frame=curve([[side*.665,.81,.67],[side*.695,.962,.55],[side*.688,1.104,.44],
      [side*.628,1.205,.34],[side*.50,1.245,.27],[side*.32,1.256,.235],[0,1.257,.218]]);
    patch(liner,gasket,50,8,(s,u)=>{
      const p=frame.getPointAt(s),up=smooth(.18,.75,s);
      return [p.x+side*.095*(1-up)*u,p.y+(.016+.056*up)*u,p.z-mix(.07,.44,up)*u];
    });
    tube(liner,duct,frame.getPoints(30).map(p=>p.toArray()),.009,36);
    // Close the aft end of the canopy into the central floating tail.
    patch(fixed,black,24,4,(s,u)=>{
      const p=canopy(-2.22,s);p[1]-=.086*u;p[2]-=.11*u;return p;
    });
    const zline=[-2.19,-1.7,-1.1,-.5,.05,.55,1.02,1.37];
    tube(fixed,black,zline.map(z=>{const [,,y,w]=section(z);return [side*w,y+.004,z];}),.012);
    // The outer carbon turning vane just aft of the front wheel is a separate sail.
    patch(fixed,carbon,18,12,(s,u)=>[side*(1.011+.049*(1-(2*s-1)**4)*Math.sin(u*Math.PI*.8)),mix(.16,.75+.035*Math.sin(s*Math.PI),u),mix(.65,1.085,s)-.16*(1-u)]);
    for(let i=0;i<3;i++)tube(fixed,gasket,[[side*.993,.763+i*.016,.81],[side*1.023,.766+i*.016,.93],[side*1.037,.776+i*.016,1.02]],.0055);
    tube(fixed,carbon,[[side*.973,.155,-1.09],[side*1.004,.147,-.3],[side*1.02,.14,.82]],.036);
    tube(fixed,trim,[[side*1.032,.81,.70],[side*1.011,.67,.47],[side*.993,.34,.30],[side*.978,.238,.05],[side*.973,.23,-.84]],.005);
    // Slim white DRL on the fender, with a recessed horizontal headlight beneath it.
    function noseLip(t,drop,out){
      const p=deck(side,2.56,t);p[1]-=drop;p[2]+=out;return p;
    }
    // The light is recessed in the front edge of the bonnet, not suspended on
    // a straight bar. A separate vertical DRL follows the crown of each pod.
    patch(fixed,lens,32,4,(s,u)=>noseLip(mix(.39,.99,s),mix(.012,.058,u),.016));
    patch(fixed,white,34,1,(s,u)=>noseLip(mix(.52,.965,s),.036+.006*u,.018));
    const runningLight=[2.05,2.14,2.23,2.33,2.43,2.51];
    tube(fixed,white,runningLight.map(z=>{const p=deck(side,z,.833);p[1]+=.006;return p;}),.009);
    // A rounded upright under each DRL closes the ends of the air opening.
    // Its front face returns beneath the wing and tapers back into the arch.
    const cheek=curve([[.803,0,2.397],[.865,0,2.398],[.958,0,2.308],[.999,0,2.15],
      [.998,0,2.02],[.951,0,2.005],[.865,0,2.105],[.79,0,2.325]],true);
    patch(fixed,paint,12,42,(v,u)=>{
      const c=cheek.getPointAt(u%1);
      return [side*(c.x+.009*Math.sin(Math.PI*v)),.164+.368*v+.025*(c.x-.8),c.z-.018*(1-v)+.006*Math.sin(v*Math.PI)];
    });
    tube(fixed,white,[[side*.845,.209,2.388],[side*.843,.344,2.398],[side*.842,.479,2.401]],.008);
    patch(fixed,duct,9,5,(s,u)=>[side*(.25+.08*(1-s)+.022*u),mix(.148,.477,s),mix(2.02,2.39,u)-.045*s]);
    for(let k=0;k<7;k++){
      const slat=block(fixed,trim,side*.46,.209+k*.038,2.097,.75,.008,.052);
      slat.rotation.x=-.24;
    }
  }
  // Projecting nose and the open front intake above the curved splitter.
  patch(fixed,paint,6,46,(s,u)=>{const x=(2*u-1)*.951;const top=deck(x<0?-1:1,2.56,Math.abs(x)/.951);return [x,top[1]-.047*(1-s),top[2]+.010*Math.sin(s*Math.PI)-.014*(1-s)];});
  patch(fixed,shadow,12,48,(s,u)=>{const x=(2*u-1)*.986;return [x,mix(.13,.59,s),2.09-.13*x*x];});
  // Upper and lower throat surfaces seal the duct in all camera angles.
  patch(fixed,duct,10,48,(s,u)=>{const x=(2*u-1)*.955;return [x,.466+.023*x*x+.035*(1-s),mix(2.04,2.545-.26*x*x,s)];});
  patch(fixed,splitter,10,48,(s,u)=>{const x=(2*u-1)*1.014;return [x,.144+.077*(1-s)+.017*x*x,mix(2.07,2.602-.24*x*x,s)];});
  // A slim badge sits on the centreline of the nose.
  const badgeZ=2.375,badgeY=deck(1,badgeZ,0)[1];
  const badge=mesh(fixed,new T.CylinderGeometry(.033,.033,.0025,32),trim);
  badge.position.set(0,badgeY+.003,badgeZ);badge.rotation.x=.25;
  decal(fixed,'mi',.066,.032,[0,badgeY+.005,badgeZ],[-Math.PI/2+.25,0,Math.PI]);
  patch(fixed,splitter,9,50,(s,u)=>{const x=(2*u-1)*1.052;return [x,.128+.024*s+.02*x*x,mix(1.43,2.63-.26*Math.abs(x)**2.3,s)];});
  patch(fixed,splitter,10,62,(s,u)=>{
    const x=(2*u-1)*1.052,theta=s*Math.PI;return [x,.128+.02*x*x-.021*Math.sin(theta),2.63-.26*Math.abs(x)**2.3-.035*(1-Math.cos(theta))];
  });
  // Long central dorsal blade above the tapering glass. It runs fore/aft.
  for(const side of [-1,1])patch(fixed,black,40,6,(s,u)=>{
    const z=mix(-2.06,-.10,s),roof=section(z)[4];
    return [side*(.025+.012*(1-u)),mix(roof-.008,1.256+.044*s,u),z+.105*u*(1-s)];
  });
  patch(fixed,carbon,30,3,(s,u)=>[(2*u-1)*.025,1.256+.044*s,mix(-1.955,-.10,s)]);
  decal(fixed,'xiaomi',.29,.073,[.037,1.203,-1.72],[0,Math.PI/2,0]);
  decal(fixed,'xiaomi',.29,.073,[-.037,1.203,-1.72],[0,-Math.PI/2,0]);
  // Rear cross-section: a continuous, hollow vent with the top edge dipping
  // under the central tail, not a flat strip across a closed bumper.
  const rearOutline=[[-.92,.88],[-.71,.90],[-.508,.89],[-.455,.716],[-.37,.691],[0,.679],
    [.37,.691],[.455,.716],[.508,.89],[.71,.90],[.92,.88],[1.014,.773],[1.018,.368],
    [.98,.222],[.85,.15],[.57,.125],[0,.115],[-.57,.125],[-.85,.15],[-.98,.222],[-1.018,.368],[-1.014,.773]];
  const rear=curve(rearOutline.map(([x,y])=>[x,y,-2.61+.402*y+.045*x*x]),true);
  const rearPoint=(s)=>rear.getPointAt(s%1);
  patch(fixed,duct,120,10,(s,u)=>{
    const p=rearPoint(s);return [p.x*mix(.98,.82,u),mix(p.y,.48+(p.y-.48)*.69,u),p.z+.045+.41*u];
  });
  patch(fixed,shadow,100,1,(s,u)=>{const p=rearPoint(s);return [p.x*.82*u,.48+(p.y-.48)*.69*u,-1.955];});
  patch(fixed,paint,120,8,(s,u)=>{
    const p=rearPoint(s);return [p.x*(1+.046*Math.sin(u*Math.PI/2)),.5+(p.y-.5)*(1+.12*u),p.z+.026+.25*u];
  });
  // Crowns bridge the rim and the rear shoulders, enclosing the top of the vent.
  for(const side of [-1,1])patch(fixed,paint,12,16,(s,u)=>{
    const x=mix(.49,.999,u),rearY=.896-.024*(u**3),z=-2.59+.402*rearY+.045*x*x;
    const surface=deck(side,-2.165,u);
    return [mix(side*x,surface[0],s),mix(rearY+.027,surface[1],s),mix(z+.015,surface[2],s)];
  });
  for(let i=0;i<9;i++)for(const side of [-1,1]){
    const x=side*(.135+i*.075),fin=block(fixed,black,x,.405,-2.065,.011,.175,.103);
    fin.rotation.x=-.20;
  }
  tube(fixed,red,rearOutline.map(([x,y])=>[x,y,-2.61+.402*y+.045*x*x]),.0125,140,true);
  for(const side of [-1,1])patch(fixed,carbon,5,8,(s,u)=>[side*mix(.07,.47,u),.245+.12*s+.038*u,-2.36+.32*s]);
  block(fixed,carbon,0,.315,-2.25,.032,.23,.51);
  decal(fixed,'X I A O M I',.28,.062,[0,.648,-2.336],[0,Math.PI,0]);
  const cockpit=createVisionCockpit(cabin,batch);
  // From outside only the silhouettes behind the smoked canopy can be seen.
  // Keep the full instrument panel and its switchgear for the driver's view.
  const throughGlass=new T.Group(),seatCloth=pbr(0x26353a,.02,.90);coach.add(throughGlass);
  for(const x of [-.32,.32]){
    const back=mesh(throughGlass,new T.SphereGeometry(1,18,12),seatCloth);
    back.scale.set(.22,.225,.105);back.position.set(x,.72,-.46);back.rotation.x=-.22;
  }
  block(throughGlass,shadow,0,.59,.55,1.19,.128,.27);
  batch(throughGlass);cabin.visible=false;
  // Flush vortex caps and their stationary transverse fairings sit inside the tyre.
  const wheels=[];
  for(const z of wheelZ)for(const side of [-1,1]){
    const hub=new T.Group();hub.position.set(side*.932,axleY,z);object.add(hub);
    function revolved(mat,profile){
      const geometry=new T.LatheGeometry(profile.map(([r,x])=>new T.Vector2(r,x)),56);
      const m=mesh(hub,geometry,mat);m.rotation.z=-side*Math.PI/2;return m;
    }
    revolved(rubber,[[.27,-.104],[.386,-.13],[.423,-.098],[.435,-.057],[.435,.056],[.426,.10],[.392,.126],[.322,.133]]);
    revolved(trim,[[.342,.124],[.349,.134],[.348,.139],[.333,.143],[.321,.13]]);
    revolved(rim,[[.001,.113],[.102,.108],[.166,.068],[.205,.064],[.287,.116],[.325,.134],[.343,.133]]);
    revolved(black,[[.12,.107],[.139,.123],[.161,.121],[.18,.101]]);
    for(let i=0;i<36;i++){
      const a=i*Math.PI/18;const groove=block(hub,rubber,side*.111,.396*Math.sin(a),.396*Math.cos(a),.009,.009,.040);
      groove.rotation.x=-a+.25;
    }
    patch(hub,carbon,24,8,(s,u)=>[side*(.138+.016*Math.sin(Math.PI*u)),.002+.020*Math.cos(u*Math.PI)*(Math.sin(Math.PI*s)**.55),mix(-.325,.325,s)]);
    batch(hub);
    wheels.push({hub,front:z>0});
  }
  const contact=document.createElement('canvas');contact.width=contact.height=96;
  const gc=contact.getContext('2d'),grad=gc.createRadialGradient(48,48,4,48,48,48);
  grad.addColorStop(0,'rgba(0,0,0,.72)');grad.addColorStop(.63,'rgba(0,0,0,.40)');grad.addColorStop(1,'rgba(0,0,0,0)');gc.fillStyle=grad;gc.fillRect(0,0,96,96);
  const sh=mesh(object,new T.PlaneGeometry(3.35,6.72),new T.MeshBasicMaterial({map:new T.CanvasTexture(contact),transparent:true,depthWrite:false}));
  sh.rotation.x=-Math.PI/2;sh.position.y=.018;
  batch(fixed);
  const seatEye=cockpit.seatEye,hoodEye=V(0,1.03,1.29),rearEye=V(0,.68,-2.64);
  let lastBrake=false;
  function drive(speed,steer,braking,dt,reverse=false){
    for(const w of wheels)if(w.front)w.hub.rotation.y=-steer*.3;
    cockpit.update(speed,steer,braking,reverse);
    if(braking!==lastBrake){red.emissiveIntensity=braking?1.95:.69;lastBrake=braking;}

  }
  drive(0,0,false,0);
  return {object,drive,cockpitEye:()=>seatEye,hoodEye:()=>hoodEye,rearEye:()=>rearEye,
    cockpit(enabled){
      glassParts.visible=!enabled;liner.visible=enabled;
      cabin.visible=enabled;throughGlass.visible=!enabled;
    },suspension(pitch,roll){coach.rotation.set(pitch,0,roll,'YXZ');},updateWing(){}};
}
