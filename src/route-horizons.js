import * as T from 'three';
import {canvasMap,clamp,makeSurface,random,roadside,smooth} from './landscape-mesh.js';
import {getRouteTheme} from './route-themes.mjs';

function hash(x,z){
  let n=Math.imul(x,1597334677)^Math.imul(z,3812015801);
  n=Math.imul(n^(n>>>16),2246822519);return ((n^(n>>>13))>>>0)/4294967296;
}
function noise(x,z){
  const i=Math.floor(x),j=Math.floor(z),u=smooth(0,1,x-i),v=smooth(0,1,z-j);
  const a=hash(i,j),b=hash(i+1,j),c=hash(i,j+1),d=hash(i+1,j+1);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
function fractal(x,z){return .55*noise(x,z)+.28*noise(x*2.1+7,z*2.1)+.13*noise(x*4.1,z*4.1+5)+.04*noise(x*9,z*9);}

// A seamless material shared by the distant slopes, cuts and road banks.
export function stoneUV(x,y,z) { return [(x*.86+z*.34)/34,(y*.90+z*.48-x*.28)/23]; }
export function landTexture(mode){
  const snow=mode==='alpine',dark=mode==='volcano';
  function tile(x,y,n) {
    const i=Math.floor(x*n),j=Math.floor(y*n),u=smooth(0,1,x*n-i),v=smooth(0,1,y*n-j);
    const h=(a,b)=>hash((a%n+n)%n,(b%n+n)%n);
    return (h(i,j)*(1-u)+h(i+1,j)*u)*(1-v)+(h(i,j+1)*(1-u)+h(i+1,j+1)*u)*v;
  }
  const map=canvasMap(256,256,(c,w,h)=>{
    const im=c.createImageData(w,h),rng=random(2212);
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const x=i/w,y=j/h,n=tile(x,y,4),n2=tile(x,y,11),fine=tile(x,y,32);
      const phase=y*12+.72*n+.24*n2;
      const bed=Math.abs(Math.sin(Math.PI*phase));
      const cracks=(1-smooth(.018,.14,bed))*(.28+.72*n);
      const flecks=rng();
      const value=snow ? 215+20*n+14*fine+8*flecks-21*cracks-8*smooth(.64,.89,n2)
        : dark ? 168+24*n+16*fine+10*flecks-32*cracks
        : 204+18*n+12*fine+10*flecks+11*Math.sin(phase*Math.PI*2)-28*cracks;
      const p=(i+j*w)*4;
      im.data[p]=value;im.data[p+1]=value+(snow?1:dark?-3:-1);im.data[p+2]=value+(snow?3:dark?-5:-4);im.data[p+3]=255;
    }
    c.putImageData(im,0,0);
  });
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map;
}

function applyWeatherToSky(base, weather){
  const spec={...base, zenith:[...base.zenith], horizon:[...base.horizon]};
  if(weather==='sunset'){
    spec.zenith=[Math.round(base.zenith[0]*.7+28),Math.round(base.zenith[1]*.55+22),Math.round(base.zenith[2]*.6+44)];
    spec.horizon=[246,154,96];
    spec.mist=0xd99b7b;spec.fog=base.fog*1.12;
    spec.hemiSky=0xffcca3;spec.sun=0xffb068;spec.sunPower=base.sunPower*.95;spec.env=base.env*.85;
  }else if(weather==='rain'){
    spec.zenith=base.zenith.map((v,i)=>Math.round(v*.45+(i===2?34:24)));
    spec.horizon=base.horizon.map((v,i)=>Math.round(v*.55+(i===2?54:46)));
    spec.mist=base.stars?0x263142:0x768591;spec.fog=base.fog*1.75;
    spec.hemiSky=0xa6bcc9;spec.sun=0xc6d8e6;spec.sunPower=base.sunPower*.48;spec.ambient=base.ambient*.82;
    spec.env=base.env*.62;spec.cloud=Math.max(.85,base.cloud);spec.stars=false;
  }else if(weather==='fog'){
    spec.zenith=base.zenith.map(v=>Math.round(v*.55+78));
    spec.horizon=base.horizon.map(v=>Math.round(v*.45+118));
    spec.mist=base.stars?0x4c586a:0xc4cfd4;spec.fog=Math.max(base.fog*2.55,.0021);
    spec.hemiSky=0xdce6eb;spec.sun=0xebf0f2;spec.sunPower=base.sunPower*.65;spec.env=base.env*.75;spec.cloud=.82;
  }
  return spec;
}

export function setRouteSky(scene,route,bounds,weather='clear') {
  const theme=getRouteTheme(route.id),spec=applyWeatherToSky(theme.sky,weather);
  const night=Boolean(spec.stars)||theme.night;
  scene.background=new T.Color(spec.mist);
  scene.fog=new T.FogExp2(spec.mist,spec.fog);
  scene.environmentIntensity=spec.env;
  const ambient=new T.HemisphereLight(spec.hemiSky,spec.hemiGround,spec.ambient);
  const sun=new T.DirectionalLight(spec.sun,spec.sunPower);
  sun.position.set(weather==='sunset'?-320:-240,weather==='sunset'?92:190,130);
  scene.add(ambient,sun);
  const sky=canvasMap(768,256,(ctx,w,h)=>{
    const img=ctx.createImageData(w,h);
    const cyber=theme.biome==='cyber',volcano=theme.biome==='volcano';
    for(let y=0;y<h;y++){
      const elevation=(.5-y/h)*Math.PI;
      const blend=clamp(Math.sqrt(Math.max(0,Math.sin(elevation))),0,1);
      const cloudHeight=smooth(.005,.13,elevation)*(1-smooth(.7,1.4,elevation));
      for(let x=0;x<w;x++){
        const a=2*Math.PI*x/w,dirX=Math.cos(a),dirZ=Math.sin(a);
        const f=fractal(dirX*5.7+elevation*5.8,dirZ*5.7+elevation*13);
        const cloud=smooth(.47,.72,f)*cloudHeight*spec.cloud;
        const offset=4*(x+y*w);
        const cloudTone=weather==='rain'?138:night?130:244;
        for(let k=0;k<3;k++){
          const bg=spec.horizon[k]*(1-blend)+spec.zenith[k]*blend;
          img.data[offset+k]=bg+(cloudTone-bg)*cloud;
        }
        if(cyber&&elevation>0.04&&elevation<0.52&&weather==='clear'){
          const band=Math.max(0,Math.sin(a*3+elevation*8))*smooth(.04,.22,elevation)*(1-smooth(.28,.52,elevation));
          img.data[offset]+=band*32;img.data[offset+1]+=band*24;img.data[offset+2]+=band*58;
        }
        if(volcano&&elevation>-0.06&&elevation<0.24){
          const ember=(1-smooth(0,.24,Math.abs(elevation)))*.45*(.5+.5*Math.sin(a*2+1.2));
          img.data[offset]=Math.min(255,img.data[offset]+ember*70);
          img.data[offset+1]=Math.min(255,img.data[offset+1]+ember*20);
        }
        img.data[offset+3]=255;
      }
    }
    ctx.putImageData(img,0,0);const rng=random(58);
    if(spec.stars){
      for(let n=0;n<300;n++){const x=rng()*w,y=rng()*h*.44;ctx.fillStyle='rgba(218,234,255,'+(.23+.56*rng())+')';ctx.fillRect(x,y,.7+rng()*.6,.7);}
    }
    if(weather!=='rain'&&weather!=='fog'){
      const sx=w*.34,sy=h*(weather==='sunset'?.42:night?.343:.375),radius=night?2.5:weather==='sunset'?3.6:2.1;
      const halo=ctx.createRadialGradient(sx,sy,0,sx,sy,night?16:weather==='sunset'?44:32);
      halo.addColorStop(0,night?'rgba(220,233,253,.7)':'rgba(255,224,175,.85)');
      halo.addColorStop(1,'rgba(250,210,180,0)');
      ctx.fillStyle=halo;ctx.fillRect(sx-45,sy-45,90,90);
      ctx.fillStyle=night?'#edf4fe':'#fff4d2';ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();
    }
  });
  const dome=new T.Mesh(new T.SphereGeometry(4050,52,20),new T.MeshBasicMaterial({map:sky,side:T.BackSide,fog:false,toneMapped:false,depthWrite:false}));
  dome.position.set((bounds.minX+bounds.maxX)*.5,0,(bounds.minZ+bounds.maxZ)*.5);dome.renderOrder=-20;scene.add(dome);
}

function buildTrees(route,sample,survey,height,kit,spec) {
  const rng=random(spec.canopy==='sakura'?903:517);
  const trunk=new T.CylinderGeometry(.32,.46,1,6);
  const crown=spec.canopy==='sakura'?new T.DodecahedronGeometry(.62,0):new T.ConeGeometry(.65,1,7);
  const crownTop=new T.DodecahedronGeometry(.54,0);
  const step=Math.max(12,route.length/spec.count);
  for(let s=18;s<route.length-18;s+=step*(.7+rng()*.6)){
    const p=sample(s);
    if(route.tunnels.some(t=>s>=t.start-14&&s<=t.end+14))continue;
    for(const side of [-1,1]){
      if(rng()>.72)continue;
      const lat=(15.5+rng()**1.35*52)*side;
      const [x,,z]=roadside(p,lat);
      if(survey.nearest(x,z).d<14.5)continue;
      const y=height(x,z);
      if(y<1.2)continue;
      const h=6.5+rng()*7.5,w=4.4+rng()*4.6,yaw=rng()*6.28;
      const col=spec.palette[Math.floor(rng()*spec.palette.length)];
      kit.add(x,y+h*.28,z,.7,h*.6, .7,0x4e3c32,yaw,trunk);
      if(spec.canopy==='sakura'){
        kit.add(x,y+h*.68,z,w*1.15,h*.55,w*1.1,col,yaw,crown);
        kit.add(x+Math.cos(yaw)*w*.22,y+h*.82,z+Math.sin(yaw)*w*.22,w*.78,h*.42,w*.78,col,yaw+1,crownTop);
      }else{
        kit.add(x,y+h*.58,z,w,h*.62,w,col,yaw,crown);
        kit.add(x,y+h*.86,z,w*.72,h*.48,w*.72,col,yaw+.8,crown);
      }
    }
  }
}

export function buildLandforms(scene,route,sample,survey,kit) {
  const theme=getRouteTheme(route.id),land=theme.land;
  const mode=land.mode,snow=mode==='alpine',coast=mode==='coast',volcano=mode==='volcano';
  const step=20,pad=land.pad;
  const x0=Math.floor((survey.bounds.minX-pad)/step)*step,z0=Math.floor((survey.bounds.minZ-pad)/step)*step;
  const nx=Math.ceil((survey.bounds.maxX+pad-x0)/step)+1,nz=Math.ceil((survey.bounds.maxZ+pad-z0)/step)+1;
  const heights=new Float32Array(nx*nz),dists=new Float32Array(nx*nz),textureNoise=new Float32Array(nx*nz);
  const positions=[],indices=[],colors=[],uv=[],color=new T.Color();
  const cx=(survey.bounds.minX+survey.bounds.maxX)*.5,cz=(survey.bounds.minZ+survey.bounds.maxZ)*.5;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=x0+i*step,z=z0+j*step,idx=j*nx+i,{p,d}=survey.nearest(x,z);
    const broad=fractal(x*.0016+4,z*.0017-3),medium=fractal(x*.005,z*.006+29);
    const ridges=1-Math.abs(2*noise(x*.00215+broad*1.3,z*.00285+medium*.55)-1);
    const breaks=noise(x*.015+13,z*.015);
    const side=Math.sign(-(x-p.x)*p.tz+(z-p.z)*p.tx);
    const open=smooth(-.35,.8,side*Math.cos(2*Math.PI*p.s/route.length*3-.7));
    let relief;
    if(snow){
      relief=smooth(52+42*open,485+250*open,d)*(60+357*ridges**3+347*broad)+smooth(35+open*30,145,d)*(medium-.43)*80;
    }else if(mode==='autumn'){
      relief=smooth(38+28*open,360+180*open,d)*(45+210*ridges**2.2+190*broad)+smooth(28,120,d)*(medium-.45)*46;
    }else if(coast){
      // Keep the outer sea side low beneath water while raising scenic hills inland.
      const inland=Math.hypot(x-cx,z-cz)<Math.hypot(p.x-cx,p.z-cz);
      if(inland)relief=smooth(36,240,d)*(34+115*ridges**2+95*broad)+smooth(26,105,d)*(medium-.45)*26;
      else relief=-smooth(20,120,d)*(p.y+12)+smooth(20,90,d)*(medium-.5)*4;
    }else if(volcano){
      const caldera=Math.hypot(x-cx,z-cz);
      const craterDrop=caldera<340?-smooth(45,190,d)*Math.max(0,p.y-10):0;
      relief=craterDrop+smooth(44+26*open,380+190*open,d)*(55+275*ridges**2.6+210*broad)+smooth(32,125,d)*(medium-.45)*50;
    }else{
      const cut=smooth(.42,.63,medium)*68+smooth(.52,.69,broad)*82;
      relief=smooth(40+32*open,235+103*open,d)*(9+cut+42*broad+breaks*13);
    }
    const height=p.y-4.2+relief;
    heights[idx]=height;dists[idx]=d;textureNoise[idx]=medium;
    positions.push(x,height,z);
    uv.push(...stoneUV(x,height,z));
    if(i+1<nx&&j+1<nz)indices.push(idx,idx+nx,idx+1,idx+1,idx+nx,idx+nx+1);
  }
  const cA=new T.Color(land.rockA),cB=new T.Color(land.rockB),cCap=new T.Color(land.cap);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const idx=j*nx+i,h=heights[idx],d=dists[idx],q=textureNoise[idx],x=x0+i*step,z=z0+j*step;
    const dx=(heights[j*nx+Math.min(nx-1,i+1)]-heights[j*nx+Math.max(0,i-1)])/(2*step);
    const dz=(heights[Math.min(nz-1,j+1)*nx+i]-heights[Math.max(0,j-1)*nx+i])/(2*step),slope=Math.hypot(dx,dz);
    if(snow){
      const rough=noise(x*.03,z*.03);
      const cover=clamp(.78-slope*.76+q*.46+(h-165)*.00077+dx*.24+(rough-.5)*.68,0,1);
      color.copy(cA).lerp(cB,q).lerp(cCap,smooth(.20,.93,cover));
      color.multiplyScalar(.90+.13*rough);
    }else if(mode==='autumn'){
      const foliage=clamp(.72-slope*.62+q*.45+(noise(x*.02,z*.02)-.5)*.4,0,1);
      color.copy(cA).lerp(cB,smooth(.15,.72,foliage)).lerp(cCap,smooth(.55,.95,foliage*q*1.4));
      color.multiplyScalar(.88+.18*noise(x*.025,z*.025));
    }else if(coast){
      const grass=clamp(.85-slope*.75+q*.35,0,1);
      color.copy(cA).lerp(cB,smooth(.2,.85,grass)).lerp(cCap,smooth(.55,.92,grass)*smooth(3,18,h));
      if(h<3)color.lerp(new T.Color(0xdcc9a4),smooth(3,-1,h));
    }else if(volcano){
      const glow=smooth(28,8,h)*smooth(30,90,d)*smooth(.44,.75,q);
      color.copy(cA).lerp(cB,q*.75+slope*.25).lerp(cCap,glow);
      color.multiplyScalar(.88+.16*noise(x*.024,z*.024));
    }else{
      const strata=Math.sin(h*.47+.6*Math.sin(x*.007)+z*.005);
      color.copy(cA).lerp(cB,.25+.45*q+.25*strata).lerp(cCap,(1-smooth(.27,.95,slope))*(.33+.35*q));
      color.multiplyScalar(.92+.09*strata+.07*noise(x*.019,z*.02));
    }
    colors.push(color.r,color.g,color.b);
  }
  const material=new T.MeshLambertMaterial({vertexColors:true,map:landTexture(mode),side:T.DoubleSide});
  makeSurface(scene,positions,indices,material,colors,uv);
  function height(x,z){
    const u=clamp((x-x0)/step,0,nx-1.0001),v=clamp((z-z0)/step,0,nz-1.0001),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
    const idx=j*nx+i;
    return a+b<1?heights[idx]*(1-a-b)+heights[idx+1]*a+heights[idx+nx]*b:
      heights[idx+nx+1]*(a+b-1)+heights[idx+nx]*(1-a)+heights[idx+1]*(1-b);
  }
  if(land.mesas)buildMesas(scene,route,sample,survey,height,material);
  if(land.trees)buildTrees(route,sample,survey,height,kit,land.trees);
  if(land.lavaPools){
    const disc=new T.CylinderGeometry(1,1,.6,16);
    const rngLava=random(771);
    for(let i=0;i<18;i++){
      const a=i*Math.PI*2/18+rngLava()*.2,r=45+rngLava()*210;
      const lx=cx+Math.cos(a)*r,lz=cz+Math.sin(a)*r;
      if(survey.nearest(lx,lz).d<42)continue;
      const ly=height(lx,lz),rad=18+rngLava()*38;
      kit.add(lx,ly+1.2,lz,rad,1,rad*(.65+rngLava()*.5),i%2?0xff5b1a:0xff8728,rngLava()*6.28,disc,kit.glow);
    }
  }
  const rng=random(snow?242:184);
  const boulder=new T.DodecahedronGeometry(.5,0);
  for(let s=0;s<route.length;s+=9+rng()*14){
    const sign=rng()>.51?1:-1,lat=(18+rng()**2*100)*sign,p=sample(s);
    const [x,,z]=roadside(p,lat),{d}=survey.nearest(x,z);
    if(d<17)continue;
    const size=.8+rng()**2*(snow?11:9),radius=size*.62;
    const contacts=[height(x,z),height(x-radius,z),height(x+radius,z),height(x,z-radius),height(x,z+radius)];
    const y=Math.min(...contacts),yaw=rng()*6.28;
    if(coast&&y<.5)continue;
    if(Math.max(...contacts)-y>size*.74)continue;
    const depth=size*(1+rng()*.4);
    kit.add(x,y+size*.13,z,size*1.3,size*.87,depth,rng()>.45?land.boulderA:land.boulderB,yaw,boulder);
    if(land.snowCap&&size>2)kit.add(x,y+size*.39,z,size*1.20,size*.32,depth*.94,0xe3e8e9,yaw,boulder);
    if(volcano&&size>4&&rng()>.62)kit.add(x,y+size*.06,z,size*1.45,.25,depth*1.1,0xff5a1f,yaw,boulder,kit.glow);
  }
  return {height,material};
}

function buildMesas(scene,route,sample,survey,height,material) {
  const rand=random(4767),pos=[],idx=[],colors=[],uv=[],tone=new T.Color();
  const layers=[[0,1.25,0xc9885e],[.16,1.05,0xc77f51],[.18,1.02,0xe6a778],[.30,.91,0xb36647],
    [.44,.88,0xcb8155],[.47,.92,0x9c573e],[.55,.85,0xd18d62],[.71,.81,0xb96643],[.78,.79,0xcb8051],
    [.81,.82,0xefb181],[.96,.77,0xbe714b],[1,.70,0xe6a077]];
  for(let s=10;s<route.length;s+=72+rand()*64){
    const side=rand()>.5?1:-1,p=sample(s),distance=48+rand()*210,r=15+rand()**1.5*68;
    const [x,,z]=roadside(p,side*distance),safe=survey.nearest(x,z).d;
    if(safe<r*1.6+20)continue;
    const ground=height(x,z)-12,h=30+rand()*87,aspect=.65+rand()*.38,angle=rand()*6.28;
    const spokes=13,shape=Array.from({length:spokes},()=>.82+.30*rand());
    let footing=ground-5;
    for(let k=0;k<spokes;k++){
      const a=angle+k*2*Math.PI/spokes,rr=r*shape[k]*1.25;
      footing=Math.min(footing,height(x+Math.cos(a)*rr,z+Math.sin(a)*rr*aspect)-5);
    }
    for(let band=1;band<layers.length;band++){
      for(let j=0;j<spokes;j++){
        const base=pos.length/3,tint=layers[band][2],shade=.80+.21*shape[j];
        for(const [row,k] of [[band-1,j],[band-1,(j+1)%spokes],[band,(j+1)%spokes],[band,j]]){
          const a=angle+k*2*Math.PI/spokes,[level,scale]=layers[row],rr=r*shape[k]*scale;
          const v=[x+Math.cos(a)*rr,row===0?footing:ground+level*h+Math.sin(a*3+.4)*2.7,z+Math.sin(a)*rr*aspect];
          pos.push(...v);uv.push(...stoneUV(...v));
          tone.set(tint).multiplyScalar(shade);colors.push(tone.r,tone.g,tone.b);
        }
        idx.push(base,base+2,base+1,base,base+3,base+2);
      }
    }
    for(let j=0;j<spokes;j++){
      const base=pos.length/3;pos.push(x,ground+h+1,z);
      uv.push(...stoneUV(x,ground+h+1,z));
      for(const k of [(j+1)%spokes,j]){
        const a=angle+k*Math.PI*2/spokes,rr=r*shape[k]*.70;
        const v=[x+Math.cos(a)*rr,ground+h+Math.sin(a*3+.4)*2.7,z+Math.sin(a)*rr*aspect];
        pos.push(...v);uv.push(...stoneUV(...v));
      }
      idx.push(base,base+1,base+2);tone.set(0xe1a26e);
      for(let k=0;k<3;k++)colors.push(tone.r,tone.g,tone.b);
    }
  }
  makeSurface(scene,pos,idx,material,colors,uv);
}
