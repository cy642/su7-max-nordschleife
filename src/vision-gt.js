import {createVisionCockpit} from './vision-cockpit.js';
import {addVisionFrontTrim} from './vision-front-trim.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original game-scale bodywork drawn from the public, full-size MWC display car.
// z points towards the nose. Sections describe the sill, shoulder and cut-out
// for the bubble canopy independently of the wheel pods.
const stations = [
  // z, half width, outer shoulder y, inner deck y, canopy half width, roof y
  [-2.22,.99,.87,.74,.44,.78],[-2.05,1.035,.97,.80,.52,.90],
  [-1.56,1.07,.985,.84,.63,1.05],[-1.02,1.04,.92,.855,.71,1.18],
  [-.48,.99,.845,.864,.765,1.285],[.02,.965,.81,.85,.795,1.30],
  [.46,.975,.79,.826,.82,1.247],[.87,1.025,.812,.805,.816,1.115],
  [1.08,1.049,.847,.798,.795,1.012],[1.19,1.057,.861,.785,.777,.95],
  [1.30,1.062,.868,.763,.757,.891],[1.39,1.065,.873,.741,.684,.832],
  [1.47,1.066,.876,.727,.528,.782],[1.525,1.067,.878,.724,.31,.742],
  [1.55,1.068,.88,.723,0,.723],[1.77,1.068,.864,.694,0,.694],
  [2.04,1.062,.806,.641,0,.641],[2.27,1.047,.718,.565,0,.565],
  [2.39,1.029,.683,.528,0,.528],[2.49,.999,.652,.501,0,.501],
  [2.56,.972,.626,.482,0,.482]
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
  const paint=new T.MeshPhysicalMaterial({color:0xb6c6c9,roughness:.34,metalness:.50,clearcoat:.70,clearcoatRoughness:.23,side:T.DoubleSide});
  const black=pbr(0x1a2026,.5,.32),carbon=pbr(0x20282e,.28,.40),rubber=pbr(0x17191b,.02,.74),trim=pbr(0x464e52,.76,.30);
  const shadow=pbr(0x0d141a,.12,.63),rim=pbr(0x4b5157,.84,.30);
  const glass=new T.MeshPhysicalMaterial({color:0x273b41,metalness:.075,roughness:.32,ior:1.47,specularIntensity:.40,clearcoat:.28,clearcoatRoughness:.26,envMapIntensity:.52,transparent:true,opacity:.94,depthWrite:false,side:T.DoubleSide});
  glass.forceSinglePass=true;
  const gasket=pbr(0x13191d,.10,.50);
  const frit=pbr(0x101c21,.12,.36),cowl=pbr(0x8c9fa4,.46,.34);
  const recessed=new T.MeshLambertMaterial({color:0x101416,side:T.DoubleSide});
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
  const lens=pbr(0x10181c,.30,.22);
  const lamp=(color,intensity)=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.24,side:T.DoubleSide});
  const white=lamp(0xd3ebfb,1.2),red=lamp(0xae0614,.69);
  const wheelZ=[1.57,-1.49],axleY=.419,wheelR=.419;
  function realZ(z,x){
    return z-.26*smooth(1.95,2.56,z)*Math.pow(Math.abs(x),2.4);
  }
  // Cross section of the bonnet's leading edge. The centre is almost level;
  // the light apertures rise into the two front wheel pods.
  const bonnetEdge=[[0,.482],[.22,.483],[.335,.482],[.384,.494],[.431,.516],
    [.484,.528],[.538,.534],[.629,.549],[.730,.565],[.834,.587],
    [.909,.605],[.936,.613],[.958,.623],[.972,.637]];
  function interpolate(points,x){
    let j=1;while(j<points.length-1&&points[j][0]<x)j++;
    const a=points[j-1],b=points[j],l=points[Math.max(0,j-2)],r=points[Math.min(points.length-1,j+1)];
    const h=b[0]-a[0],t=clamp((x-a[0])/h,0,1);
    const ma=(b[1]-l[1])/(b[0]-l[0])*h,mb=(r[1]-a[1])/(r[0]-a[0])*h;
    return mix(a[1],b[1],t)+t*(1-t)*((1-t)*(ma+a[1]-b[1])+t*(b[1]-a[1]-mb));
  }
  function deck(side,z,t){
    const [w,ey,cy,inner]=section(z), x=mix(inner,w,t);
    const cross=smooth(.36,.87,t);
    const crown=.029*Math.sin(Math.PI*t)**2-.019*smooth(.84,1,t);
    const loft=mix(cy,ey,cross)+crown;
    // Give each longitudinal section a continuous falling tangent to its tip.
    // Blending back into a flat-ended radial profile produces a hooked corner.
    const along=clamp((z-1.55)/(2.56-1.55),0,1);
    const peak=.723+.164*smooth(.41,.88,t)+.012*Math.sin(Math.PI*t)**2-.009*smooth(.89,1,t);
    const nose=mix(peak,interpolate(bonnetEdge,x),along*(.38+.62*along));
    const y=mix(loft,nose,smooth(1.35,1.61,z));
    return [side*x,y,realZ(z,x)];
  }
  function archY(z){
    let sill=.17+.018*Math.cos(z);
    for(const axle of wheelZ){
      const d=Math.abs(z-axle),radius=wheelR+.024;
      if(d<radius)sill=Math.max(sill,axleY+Math.sqrt(radius*radius-d*d));
      else if(d<radius+.033)sill=Math.max(sill,mix(axleY,.17,(d-radius)/.033));
    }
    return Math.max(sill,.165+.391*smooth(2.045,2.32,z));
  }
  for(const side of [-1,1]){
    // The bonnet is a single crescent wing: one open horseshoe-shaped throat
    // runs around the *front* of the glazing and returns to both wheel pods.
    function throat(t){
      const mid=1.68-.60*smooth(.05,.68,t)-.14*smooth(.67,.95,t);
      const gap=.048*smooth(.19,.59,t)*(1-smooth(.63,.77,t));
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
      return [side*(w-.075*(1-u)+.034*Math.sin(Math.PI*u)),mix(low,Math.max(low+.006,deck(side,z,1)[1]),u),realZ(z,w)];
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
      return [side*w*Math.sin(angle)**.60,mix(y,roof,Math.max(0,Math.cos(angle))**.38),z];
    }
    function glassLimit(z){
      const [,,y,,roof]=section(z);
      return Math.acos(clamp((.010+.038*smooth(.7,1.44,z))/Math.max(.001,roof-y),0,1)**(1/.38))*2/Math.PI;
    }
    patch(glassParts,glass,94,27,(s,u)=>{const z=mix(-2.22,1.55,s);return canopy(z,glassLimit(z)*u);});
    patch(glassParts,frit,94,6,(s,u)=>{const z=mix(-2.22,1.55,s);return canopy(z,mix(glassLimit(z),1,u));});
    // Satin scuttle encircling the base of the windshield. The surface follows
    // the bonnet as its outward normal turns from lateral to forward at the toe.
    patch(fixed,cowl,115,7,(s,u)=>{
      const z=mix(.31,1.55,s),[, , ,w]=section(z);
      const dw=(section(z+.001)[3]-section(z-.001)[3])/.002;
      const nx=(1-smooth(1.51,1.55,z))/Math.hypot(1,dw),nz=Math.sqrt(Math.max(0,1-nx*nx));
      const width=u*mix(.041,.154,smooth(1.08,1.53,z));
      const zz=z+width*nz,x=w+width*nx,[outside,,,inside]=section(zz);
      const t=clamp((x-inside)/Math.max(.0001,outside-inside),0,1);
      const p=deck(side,zz,t);p[1]+=.0025;return p;
    });
    // At the roof brow, glazing meets the narrow fixed roof panel.
    patch(fixed,cowl,32,20,(s,u)=>{
      const z=mix(-.26,.26-.11*u*u,s),p=canopy(z,.405*u);
      p[1]+=.002;return p;
    });
    // Narrow door-glass reveals and windscreen frit follow the glazing surface.
    // Shell and canopy have separate highlights on the physical show car.
    // The windshield hoop is one continuous bent section from sill to sill.
    // Its crown meets the roof liner above the driver's head.
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
    // A single deep, upswept optical cavity follows the underside of the pod.
    // Its outer end wraps around the silver upright; its inner end dies into
    // the rolled leading edge of the bonnet.
    const innerX=.337,outerX=.962;
    const lower=[[.337,.454],[.403,.45],[.55,.460],[.64,.472],[.75,.481],
      [.865,.486],[.925,.496],[.948,.514],[.958,.55],[.962,.605]];
    function aperture(x,v){
      const top=interpolate(bonnetEdge,x)-.009-.018*(1-smooth(.337,.45,x));
      const low=Math.min(top,interpolate(lower,x));
      const rimZ=realZ(2.56,x)-.001;
      return [side*x,mix(low,top,v),rimZ-.019*(1-v)-.023*Math.sin(Math.PI*v)];
    }
    patch(fixed,lens,76,8,(s,v)=>aperture(mix(innerX,outerX,s),v));
    for(const edge of [0,1])patch(fixed,black,64,3,(s,v)=>{
      const p=aperture(mix(innerX,outerX,s),edge);p[2]-=.058*v;p[1]+=(edge?1:-1)*.006*v;return p;
    });
    // The outer projector pocket curls back underneath the light guide.
    // Its rounded end meets the silver upright without a straight cut-off.
    const pocket=pbr(0x172126,.30,.235);
    patch(fixed,pocket,36,10,(s,u)=>{
      const x=mix(.765,.951,s),p=aperture(x,.35+.17*u);
      const arc=Math.sin(Math.PI*s)**.63;p[1]-=.027*arc*(1-u);p[2]+=.010*arc*Math.sin(Math.PI*u);
      return p;
    });
    // Each horizontal light guide has a charcoal bezel and a narrow diffuser.
    const guideHeights=[[.551,.483],[.645,.494],[.750,.516],[.858,.536],[.925,.551]];
    function guide(t,v,bezel){
      const x=mix(.555,.919,t),y=interpolate(guideHeights,x)+(v-.5)*(bezel?.012:.0067);
      return [side*x,y,realZ(2.56,x)-(bezel?.025:.022)];
    }
    patch(fixed,trim,42,2,(s,v)=>guide(s,v,true));
    patch(fixed,white,42,2,(s,v)=>guide(s,v,false));

    // Flush upper signature: a broad flat inset, normal to the fender surface.
    // Both edges are measured on the compound-curved pod. The changing
    // lateral coordinates keep the guide straight across the fender crown.
    const stripEdges=[
      [2.2865,.8556,2.2846,.8778],[2.3595,.8536,2.3601,.8765],
      [2.4235,.8541,2.4255,.8774],[2.4783,.8557,2.4811,.8792],
      [2.5256,.8564,2.5287,.8797],[2.5683,.8514,2.5739,.8709]];
    function upperStrip(s,v,bezel){
      const f=s*(stripEdges.length-1),j=Math.min(stripEdges.length-2,Math.floor(f));
      const a=stripEdges[j],b=stripEdges[j+1],u=bezel?mix(-.065,1.065,v):v;
      const z=mix(mix(a[0],b[0],f-j),mix(a[2],b[2],f-j),u);
      const t=mix(mix(a[1],b[1],f-j),mix(a[3],b[3],f-j),u);
      const p=deck(side,Math.min(z,2.56),t);
      p[1]+=(bezel?.0014:.0024)-Math.max(0,z-2.56)*.56;
      p[2]+=Math.max(0,z-2.56)*.21;return p;
    }
    patch(fixed,trim,40,3,(s,v)=>upperStrip(s,v,true));
    patch(fixed,white,40,3,(s,v)=>upperStrip(s,v,false));

    const cheek=curve([[.765,0,2.35],[.815,0,2.376],[.876,0,2.361],
      [.927,0,2.315],[.959,0,2.226],[.966,0,2.088],[.918,0,2.047],
      [.827,0,2.11],[.76,0,2.245]],true);
    function pillar(s,u,base){
      const c=cheek.getPointAt(u%1),round=.25+.014*smooth(.85,.96,c.x);
      const top=interpolate(lower,clamp(c.x,.34,.962))-.005;
      const y=base?mix(.128,round,s):mix(round,top,s);
      const toe=1-clamp((y-round)/(top-round),0,1);
      const x=.874+(c.x-.874)*.90+.011*toe;
      return [side*x,y,c.z+.005*toe-.004];
    }
    patch(fixed,carbon,7,60,(s,u)=>pillar(s,u,true));
    patch(fixed,paint,16,60,(s,u)=>pillar(s,u,false));
    function lowerStrip(s,v,bezel){
      const y=mix(.297,.486,s),toe=1-clamp((y-.25)/.24,0,1);
      const x=.873+toe*.014+(v-.5)*(bezel?.023:.018);
      // Follow the rounded front face, keeping the guide in its silver carrier.
      return [side*x,y+.003*(v-.5),2.365+.005*toe-(x-(.873+toe*.014))*.55+(bezel?.001:.003)];
    }
    patch(fixed,trim,32,3,(s,v)=>lowerStrip(s,v,true));
    patch(fixed,white,32,3,(s,v)=>lowerStrip(s,v,false));

    // Paired structural pylons behind the nose. Their feet land on the carbon
    // floor; the passages between them and the outboard uprights stay open.
    const post=curve([[-.029,0,0],[-.024,0,.042],[0,0,.050],[.025,0,.033],
      [.031,0,-.008],[.022,0,-.161],[-.016,0,-.179]],true);
    patch(fixed,carbon,10,32,(s,u)=>{const c=post.getPointAt(u%1);
      const foot=1+.36*(1-smooth(0,.20,s));
      return [side*(.297+foot*c.x+.004*s),mix(.129,.487,s),2.275+foot*c.z+.002*s];});
    // The open mouth bifurcates into a central cooling passage and two
    // wheel ducts. The ceiling, inner cheek and rolled sill frame the far wall.
    const opening=curve([[.365,.151,2.19],[.39,.144,2.191],[.63,.148,2.189],
      [.725,.17,2.189],[.749,.205,2.184],[.72,.252,2.181],
      [.681,.286,2.181],[.59,.297,2.184],[.40,.294,2.186],[.354,.28,2.187]],true);
    const deep=pbr(0x12181b,.09,.74);
    patch(fixed,deep,52,6,(s,u)=>{
      const p=opening.getPointAt(s%1);
      return [side*mix(p.x,.55+(p.x-.55)*.84,u),mix(p.y,.20+(p.y-.20)*.72,u),p.z-.25*u];
    });
    // Surround the opening with one continuous fairing instead of a grille.
    patch(fixed,duct,52,5,(s,u)=>{
      const p=opening.getPointAt(s%1),dx=p.x-.55,dy=p.y-.221;
      const outerX=clamp(.55+dx*1.62,.30,.845);
      const outerY=clamp(.221+dy*3.9,.127,.501);
      return [side*mix(p.x,outerX,u),mix(p.y,outerY,u),p.z+u*.038];
    });
    // Through the aperture the upper diffuser surface catches soft skylight.
    const turnVane=pbr(0x272f32,.08,.81);turnVane.envMapIntensity=.30;
    patch(fixed,turnVane,16,26,(s,u)=>[side*mix(.351,.759,u),
      .145+.041*s+.018*Math.sin(Math.PI*u),mix(1.89,2.151,s)]);
    patch(fixed,recessed,18,28,(s,u)=>{
      const x=.303*u;
      return [side*x,.134+.27*s-.024*u**5,2.168-.10*s-.04*u*u];
    });

  }
  // Rounded silver lip, thick in the middle and finely rolled over the lenses.
  patch(fixed,paint,8,116,(s,u)=>{
    const x=(2*u-1)*.972,abs=Math.abs(x),thickness=.008+.025*(1-smooth(.335,.48,abs));
    return [x,interpolate(bonnetEdge,abs)-thickness*(1-s),
      realZ(2.56,x)+.007*Math.sin(s*Math.PI)-.006*(1-s)];
  });
  patch(fixed,duct,9,70,(s,u)=>{
    const x=(2*u-1)*.962;return [x,interpolate(bonnetEdge,Math.abs(x))-.038-.067*(1-s),
      mix(1.91,realZ(2.56,x)-.025,s)];
  });
  addVisionFrontTrim(fixed,deck,patch);
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
    back.scale.set(.198,.198,.092);back.position.set(x,.72,-.46);back.rotation.x=-.22;
  }
  // A subdued yoke reads through the glass in close front views.
  tube(throughGlass,black,[[.175,.674,.29],[.204,.734,.30],[.30,.748,.30],
    [.37,.724,.30],[.435,.747,.30],[.484,.723,.30],[.489,.654,.29],
    [.439,.617,.29],[.22,.619,.29]],.016,32,true);
  block(throughGlass,shadow,0,.59,.55,1.19,.128,.27);
  batch(throughGlass);cabin.visible=false;
  // Flush vortex caps and their stationary transverse fairings sit inside the tyre.
  const wheels=[];
  for(const z of wheelZ)for(const side of [-1,1]){
    const hub=new T.Group();hub.position.set(side*.932,axleY,z);hub.scale.set(1,wheelR/.435,wheelR/.435);object.add(hub);
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
