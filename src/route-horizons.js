import * as T from 'three';
import {canvasMap,clamp,makeSurface,random,roadside,smooth} from './landscape-mesh.js';

const hues={
  duku:{zenith:[41,103,162],horizon:[202,222,231],mist:0xc3d7df,fog:.00054,sky:0xe1f0ff,ground:0xb7b4aa,key:0xfff1d5,keyPower:1.7,ambient:1.15},
  canyon:{zenith:[79,128,168],horizon:[242,195,155],mist:0xe7bd9c,fog:.00073,sky:0xffe3c1,ground:0x9c6954,key:0xffdfa9,keyPower:1.72,ambient:1.12},
  subsea:{zenith:[43,117,164],horizon:[187,222,225],mist:0xb1cfd1,fog:.00090,sky:0xe4f7ff,ground:0x739ca8,key:0xffedcc,keyPower:1.67,ambient:1.22},
  harbor:{zenith:[10,21,47],horizon:[76,84,117],mist:0x556079,fog:.00074,sky:0xabc9f1,ground:0x697989,key:0xb0d0ff,keyPower:.8,ambient:1.06}
};

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
// The vertical component lets thin rock beds follow an exposed cliff face.
export function stoneUV(x,y,z) { return [(x*.86+z*.34)/34,(y*.90+z*.48-x*.28)/23]; }
export function landTexture(snow){
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
        : 204+18*n+12*fine+10*flecks+11*Math.sin(phase*Math.PI*2)-28*cracks;
      const p=(i+j*w)*4;
      im.data[p]=value;im.data[p+1]=value+(snow?1:-1);im.data[p+2]=value+(snow?3:-4);im.data[p+3]=255;
    }
    c.putImageData(im,0,0);
  });
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map;
}

export function setRouteSky(scene,route,bounds) {
  const spec=hues[route.id],night=route.id==='harbor';
  scene.background=new T.Color(spec.mist);
  scene.fog=new T.FogExp2(spec.mist,spec.fog);
  scene.environmentIntensity=night?.42:.83;
  const ambient=new T.HemisphereLight(spec.sky,spec.ground,spec.ambient);
  const sun=new T.DirectionalLight(spec.key,spec.keyPower);sun.position.set(-240,190,130);
  scene.add(ambient,sun);
  const sky=canvasMap(768,256,(ctx,w,h)=>{
    const img=ctx.createImageData(w,h);
    for(let y=0;y<h;y++){
      const elevation=(.5-y/h)*Math.PI;
      const blend=clamp(Math.sqrt(Math.max(0,Math.sin(elevation))),0,1);
      const cloudHeight=smooth(.005,.13,elevation)*(1-smooth(.7,1.4,elevation));
      for(let x=0;x<w;x++){
        const a=2*Math.PI*x/w,dirX=Math.cos(a),dirZ=Math.sin(a);
        const f=fractal(dirX*5.7+elevation*5.8,dirZ*5.7+elevation*13);
        const cloud=smooth(.47,.72,f)*cloudHeight*(night?.17:.70);
        const offset=4*(x+y*w);
        for(let k=0;k<3;k++){
          const bg=spec.horizon[k]*(1-blend)+spec.zenith[k]*blend;
          img.data[offset+k]=bg+( (night?130:244)-bg)*cloud;
        }
        img.data[offset+3]=255;
      }
    }
    ctx.putImageData(img,0,0);const rng=random(58);
    if(night){
      for(let n=0;n<280;n++){const x=rng()*w,y=rng()*h*.44;ctx.fillStyle='rgba(218,234,255,'+(.23+.56*rng())+')';ctx.fillRect(x,y,.7+rng()*.6,.7);}
    }
    // The moon/sun is away from the driving vanishing point at the start.
    const sx=w*.34,sy=h*(night?.343:.375),radius=night?2.5:2.1;
    const halo=ctx.createRadialGradient(sx,sy,0,sx,sy,night?16:32);
    halo.addColorStop(0,night?'rgba(220,233,253,.7)':'rgba(255,237,195,.8)');halo.addColorStop(1,'rgba(250,230,208,0)');
    ctx.fillStyle=halo;ctx.fillRect(sx-33,sy-33,66,66);ctx.fillStyle=night?'#edf4fe':'#fff7dc';ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();
  });
  const dome=new T.Mesh(new T.SphereGeometry(4050,52,20),new T.MeshBasicMaterial({map:sky,side:T.BackSide,fog:false,toneMapped:false,depthWrite:false}));
  dome.position.set((bounds.minX+bounds.maxX)*.5,0,(bounds.minZ+bounds.maxZ)*.5);dome.renderOrder=-20;scene.add(dome);
}

export function buildLandforms(scene,route,sample,survey,kit) {
  const snow=route.id==='duku',step=20,pad=snow?990:700;
  const x0=Math.floor((survey.bounds.minX-pad)/step)*step,z0=Math.floor((survey.bounds.minZ-pad)/step)*step;
  const nx=Math.ceil((survey.bounds.maxX+pad-x0)/step)+1,nz=Math.ceil((survey.bounds.maxZ+pad-z0)/step)+1;
  const heights=new Float32Array(nx*nz),dists=new Float32Array(nx*nz),textureNoise=new Float32Array(nx*nz);
  const positions=[],indices=[],colors=[],uv=[],color=new T.Color();
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=x0+i*step,z=z0+j*step,idx=j*nx+i,{p,d}=survey.nearest(x,z);
    const broad=fractal(x*.0016+4,z*.0017-3),medium=fractal(x*.005,z*.006+29);
    const ridges=1-Math.abs(2*noise(x*.00215+broad*1.3,z*.00285+medium*.55)-1);
    const breaks=noise(x*.015+13,z*.015);
    let relief;
    const side=Math.sign(-(x-p.x)*p.tz+(z-p.z)*p.tx);
    const open=smooth(-.35,.8,side*Math.cos(2*Math.PI*p.s/route.length*3-.7));
    if(snow)relief=smooth(52+42*open,485+250*open,d)*(60+357*ridges**3+347*broad)+smooth(35+open*30,145,d)*(medium-.43)*80;
    else {
      const cut=smooth(.42,.63,medium)*68+smooth(.52,.69,broad)*82;
      relief=smooth(40+32*open,235+103*open,d)*(9+cut+42*broad+breaks*13);
    }
    const height=p.y-4.2+relief;
    heights[idx]=height;dists[idx]=d;textureNoise[idx]=medium;
    positions.push(x,height,z);
    uv.push(...stoneUV(x,height,z));
    if(i+1<nx&&j+1<nz)indices.push(idx,idx+nx,idx+1,idx+1,idx+nx,idx+nx+1);
  }
  const rock=new T.Color(0x5e6772),shale=new T.Color(0x969ba2),ice=new T.Color(0xf3f6f5);
  const sand=new T.Color(0xe6ae83),red=new T.Color(0x9a513b),orange=new T.Color(0xd48153);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const idx=j*nx+i,h=heights[idx],d=dists[idx],q=textureNoise[idx],x=x0+i*step,z=z0+j*step;
    const dx=(heights[j*nx+Math.min(nx-1,i+1)]-heights[j*nx+Math.max(0,i-1)])/(2*step);
    const dz=(heights[Math.min(nz-1,j+1)*nx+i]-heights[Math.max(0,j-1)*nx+i])/(2*step),slope=Math.hypot(dx,dz);
    if(snow){
      const rough=noise(x*.03,z*.03);
      const cover=clamp(.78-slope*.76+q*.46+(h-165)*.00077+dx*.24+(rough-.5)*.68,0,1);
      color.copy(rock).lerp(shale,q).lerp(ice,smooth(.20,.93,cover));
      color.multiplyScalar(.90+.13*rough);
    }else{
      const strata=Math.sin(h*.47+.6*Math.sin(x*.007)+z*.005);
      color.copy(red).lerp(orange,.25+.45*q+.25*strata).lerp(sand,(1-smooth(.27,.95,slope))*(.33+.35*q));
      color.multiplyScalar(.92+.09*strata+.07*noise(x*.019,z*.02));
    }
    colors.push(color.r,color.g,color.b);
  }
  const material=new T.MeshLambertMaterial({vertexColors:true,map:landTexture(snow),side:T.DoubleSide});
  makeSurface(scene,positions,indices,material,colors,uv);
  // Sample the same two triangles used by the terrain mesh when joining cut shoulders.
  function height(x,z){
    const u=clamp((x-x0)/step,0,nx-1.0001),v=clamp((z-z0)/step,0,nz-1.0001),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
    const idx=j*nx+i;
    return a+b<1?heights[idx]*(1-a-b)+heights[idx+1]*a+heights[idx+nx]*b:
      heights[idx+nx+1]*(a+b-1)+heights[idx+nx]*(1-a)+heights[idx+1]*(1-b);
  }
  if(!snow)buildMesas(scene,route,sample,survey,height,material);
  const rng=random(snow?242:184);
  const boulder=new T.DodecahedronGeometry(.5,0);
  for(let s=0;s<route.length;s+=9+rng()*14){
    const sign=rng()>.51?1:-1,lat=(18+rng()**2*100)*sign,p=sample(s);
    const [x,,z]=roadside(p,lat),{d}=survey.nearest(x,z);
    if(d<17)continue;
    const size=.8+rng()**2*(snow?11:9),radius=size*.62;
    const contacts=[height(x,z),height(x-radius,z),height(x+radius,z),height(x,z-radius),height(x,z+radius)];
    const y=Math.min(...contacts),yaw=rng()*6.28;
    if(Math.max(...contacts)-y>size*.74)continue;
    const depth=size*(1+rng()*.4);
    kit.add(x,y+size*.13,z,size*1.3,size*.87,depth,snow?(rng()>.45?0xb1b4b2:0x757c83):(rng()>.6?0xb75d40:0xd5905e),yaw,boulder);
    if(snow&&size>2)kit.add(x,y+size*.39,z,size*1.20,size*.32,depth*.94,0xe3e8e9,yaw,boulder);
  }
  return {height,material};
}

// Layered, irregular horizontal cap rocks give this route a stepped mesa silhouette.
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
