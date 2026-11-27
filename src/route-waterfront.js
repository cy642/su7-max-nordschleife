import * as T from 'three';
import {canvasMap,makeSurface,random,roadside} from './landscape-mesh.js';
import {getRouteTheme} from './route-themes.mjs';

function addWater(scene,route,survey,waterSpec) {
  const subsea=waterSpec.mode==='subsea',b=survey.bounds,step=40,pad=860;
  const x0=b.minX-pad,z0=b.minZ-pad,nx=Math.ceil((b.maxX-x0+pad)/step)+1,nz=Math.ceil((b.maxZ-z0+pad)/step)+1;
  const pos=[],idx=[],uv=[];
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=x0+i*step,z=z0+j*step,o=j*nx+i;
    pos.push(x,-.22,z);uv.push(x/57,z/57);
    if(i+1===nx||j+1===nz)continue;
    if(subsea){
      const {p,d}=survey.nearest(x+step*.5,z+step*.5);
      if(d<73&&p.s>=route.tunnels[0].start-15&&p.s<=route.tunnels.at(-1).end+15&&p.y<2&&p.y>-15)continue;
    }
    idx.push(o,o+nx,o+1,o+1,o+nx,o+nx+1);
  }
  const map=canvasMap(256,256,(c,w,h)=>{
    const rng=random(1143);c.fillStyle=waterSpec.base;c.fillRect(0,0,w,h);
    for(let i=0;i<3300;i++){
      const x=rng()*w,y=rng()*h,length=2+14*rng(),curve=(rng()-.5)*4;
      c.strokeStyle=rng()>.52?waterSpec.waveA:waterSpec.waveB;
      c.lineWidth=.5+rng();c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+length*.4,y+curve,x+length,y+1);c.stroke();
    }
  });
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=2;
  makeSurface(scene,pos,idx,new T.MeshLambertMaterial({map,color:waterSpec.tint}),null,uv);
}

function ship(kit,x,z,yaw,length,night){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  function part(dx,y,dz,w,h,l,color){kit.add(x+c*dx+s*dz,y,z-s*dx+c*dz,w,h,l,color,yaw);}
  part(0,2,0,length*.16,4.8,length,night?0x3d4b59:0x2c5c67);
  part(0,4.4,0,length*.16,.45,length*.98,0xb48661);
  part(0,8,length*.34,length*.13,7.4,length*.15,0xe6ddc6);
  part(0,12.3,length*.34,length*.15,1.4,length*.17,0x454e50);
  part(length*.025,15,length*.36,2.8,5,4.1,0xaf5947);
  const colors=[0x935744,0x527786,0x927d59,0x546d62,0xbb704e];
  for(let col=0;col<2;col++)for(let row=0;row<6;row++){
    const h=3+(row%3===0?2.2:0);
    part((col-.5)*length*.072,4.9+h/2,(row-3.1)*length*.104,length*.068,h,length*.099,colors[(row+col*3)%colors.length]);
  }
}

function sailboat(kit,x,z,yaw){
  const sail=new T.ConeGeometry(.5,1,3);
  kit.add(x,.6,z,2.4,1.2,7.5,0xf4f7f8,yaw);
  kit.add(x,6.2,z,.24,10.5,.24,0x8a9aa0,yaw);
  kit.add(x,6.2,z,4.8,9.2,.25,0xffffff,yaw,sail);
}

function beacon(kit,x,z,height=27){
  const round=new T.CylinderGeometry(.43,.56,1,14),roof=new T.ConeGeometry(.5,1,14);
  kit.add(x,1,z,12,3,12,0x85929a,0,round);
  for(let i=0;i<5;i++){
    const w=6.5-.5*i;
    kit.add(x,1.4+(i+.5)*height/5,z,w,height/5,w,i%2?0xa74e43:0xede5cc,0,round);
  }
  kit.add(x,height+2,z,6,1,6,0x494c51,0,round);
  kit.add(x,height+3.9,z,3.8,3,3.8,0xffe6a4,0,round,kit.glow);
  kit.add(x,height+6.4,z,6.1,2.4,6.1,0x6b4844,0,roof);
}

function dockCrane(kit,x,z,yaw,scale){
  function coord(a,b,c){
    return [x+(Math.cos(yaw)*a+Math.sin(yaw)*c)*scale,b*scale,z+(-Math.sin(yaw)*a+Math.cos(yaw)*c)*scale];
  }
  const steel=0xc57846,light=0xe1b873;
  function beam(a,b,w=1,c=steel){kit.beam(coord(...a),coord(...b),w*scale,w*scale,c);}
  for(const side of [-1,1]){
    const rail=side*7;
    for(const leg of [-1,1])beam([rail,1,leg*8],[rail*.76,29,leg*6],1.65);
    beam([rail,7,-8],[rail*.76,27,6],.8);beam([rail,7,8],[rail*.76,27,-6],.8);
    beam([rail*.76,28,-19],[rail*.76,28,37],1.15);
    beam([rail*.76,28,-11],[rail*.76,47,-4],1.2);beam([rail*.76,47,-4],[rail*.76,29,30],.48,light);
    beam([rail*.76,47,-4],[rail*.76,29,-19],.46,light);
    for(let j=-17;j<34;j+=6)beam([rail*.76,28,j],[rail*.76,30,j+3],.38,light);
  }
  for(const end of [-1,1])beam([-6,28,end*6],[6,28,end*6],1.4);
  beam([-5,47,-4],[5,47,-4],1.1);
  beam([0,28,22],[0,14,22],.2);beam([-1.6,14,22],[1.6,14,22],.42);
  const lamp=coord(0,47,-4);kit.add(...lamp,1.1,1.4,1.1,0xff6651,0,kit.cube,kit.glow);
}

function buildCyberCity(route,sample,survey,kit){
  const rand=random(2077);
  const windows=canvasMap(128,256,(c,w,h)=>{
    const rng=random(909);c.fillStyle='#13162b';c.fillRect(0,0,w,h);
    for(let j=0;j<28;j++)for(let i=0;i<10;i++){
      const lit=rng();
      c.fillStyle=lit>.88?'#6df7ff':lit>.76?'#ff66e5':lit>.64?'#b79dff':lit>.48?'#3b4675':'#1b213b';
      c.fillRect(i*w/10+2,j*h/28+2,w/10-4,h/28-4);
    }
  });
  const facade=new T.MeshBasicMaterial({map:windows,color:0xdfe4ff});
  const {minX,maxX,minZ,maxZ}=survey.bounds;
  const cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5,farX=(maxX-minX)*.5,farZ=(maxZ-minZ)*.5;
  const neons=[0x58f8ff,0xff56e0,0xa878ff,0xffb75e];
  // Outer skyline ring
  for(let i=0;i<165;i++){
    const a=i/165*Math.PI*2,radius=.96+.28*rand();
    const x=cx+Math.cos(a)*(farX+115)*radius,z=cz+Math.sin(a)*(farZ+120)*radius;
    if(survey.nearest(x,z).d<52)continue;
    const h=35+125*rand()**1.5+42*(.5+.5*Math.cos(a*5)),w=14+rand()*24,d=16+rand()*24;
    const neon=neons[i%neons.length];
    kit.add(x,h/2-.5,z,w,h,d,0x252a48,0,kit.cube,facade);
    kit.add(x,h+.6,z,w*.95,1.2,d*.95,neon,0,kit.cube,kit.glow);
    if(h>110){
      kit.add(x,h+8,z,1.2,16,1.2,0x6a72a8);
      kit.add(x,h+16.5,z,1.1,1.6,1.1,neon,0,kit.cube,kit.glow);
    }
  }
  // Closer urban towers & glowing cyber portals flanking the expressway
  for(let s=60;s<route.length;s+=135){
    if(route.tunnels.some(t=>s>=t.start-25&&s<=t.end+25))continue;
    const p=sample(s),yaw=Math.atan2(p.tx,p.tz);
    const side=(Math.floor(s/135)%2?1:-1);
    const [x,,z]=roadside(p,side*(46+rand()*36));
    if(survey.nearest(x,z).d<38)continue;
    const h=42+rand()*96,w=14+rand()*18,d=14+rand()*18,neon=neons[Math.floor(s)%neons.length];
    kit.add(x,h/2,z,w,h,d,0x2a2f52,yaw,kit.cube,facade);
    kit.add(x,h*.72,z,w+1.2,1.6,d+1.2,neon,yaw,kit.cube,kit.glow);
    kit.add(x,h+.6,z,w*.8,1.1,d*.8,neon,yaw,kit.cube,kit.glow);
  }
  // Overhead neon speed arches along open expressway stretches
  for(let s=260;s<route.length-200;s+=420){
    if(route.tunnels.some(t=>s>=t.start-35&&s<=t.end+35))continue;
    const p=sample(s),yaw=Math.atan2(p.tx,p.tz),neon=s%840===260?0x58f8ff:0xf25cff;
    for(const side of [-1,1])kit.beam(roadside(p,side*10.4,-.4),roadside(p,side*10.4,11.2),.55,.55,0x373c5e);
    kit.beam(roadside(p,-10.6,11.2),roadside(p,10.6,11.2),.7,.55,0x282d49);
    kit.beam(roadside(p,-10.2,10.7),roadside(p,10.2,10.7),.22,.28,neon,kit.glow);
  }
}

export function buildWaterfront(scene,route,sample,survey,kit) {
  const theme=getRouteTheme(route.id),waterSpec=theme.water;
  addWater(scene,route,survey,waterSpec);
  const mode=waterSpec.mode,rand=random(mode==='harbor'?735:215);
  const {minX,maxX,minZ,maxZ}=survey.bounds;
  if(mode==='cyber'){buildCyberCity(route,sample,survey,kit);return;}
  if(mode==='coast'){
    const p=sample(1760),light=roadside(p,46);
    if(survey.nearest(light[0],light[2]).d>26)beacon(kit,light[0],light[2],26);
    for(let i=0;i<14;i++){
      const a=i*Math.PI*2/14,x=(minX+maxX)*.5+Math.cos(a)*(maxX-minX+420)*.58,z=(minZ+maxZ)*.5+Math.sin(a)*(maxZ-minZ+420)*.58;
      if(survey.nearest(x,z).d<75)continue;
      sailboat(kit,x,z,rand()*6.28);
    }
    ship(kit,maxX+185,minZ+240,.35,105,false);
    return;
  }
  if(mode==='subsea'){
    const p=sample(39),light=roadside(p,-45);beacon(kit,light[0],light[2],24);
    kit.add(light[0],.4,light[2],33,2,28,0x829695);
    kit.add(light[0]+8,3.5,light[2]+8,9,5.5,11,0xe6dfc8);
    const cyl=new T.CylinderGeometry(.35,.62,1,10);
    for(let i=0;i<15;i++){
      const a=i*Math.PI*2/15,x=(minX+maxX)*.5+Math.cos(a)*(maxX-minX+900)*.56,z=(minZ+maxZ)*.5+Math.sin(a)*(maxZ-minZ+900)*.58;
      const h=64+rand()*26;
      kit.add(x,h/2,z,4,h,4,0xe7e6dc,0,cyl);
      const phase=rand()*6.28;
      for(let k=0;k<3;k++){const angle=phase+k*2*Math.PI/3;
        kit.beam([x,h,z],[x+Math.cos(angle)*27,h+Math.sin(angle)*27,z+1],1.3,.65,0xf5f3e6);}
    }
    ship(kit,maxX+142,minZ+410,.15,120,false);
    ship(kit,minX-165,minZ+260,1.7,86,false);
    const buoy=new T.ConeGeometry(.5,1,8);
    for(let i=0;i<34;i++){
      const p=sample(i*route.length/34),[x,,z]=roadside(p,(i%2?1:-1)*(76+rand()*35));
      kit.add(x,1.45,z,2.9,3,2.9,i%2?0xbd654c:0x639378,0,buoy);
    }
    return;
  }
  // Harbor skyline, container yards and cranes
  const windows=canvasMap(128,256,(c,w,h)=>{
    const rng=random(781);c.fillStyle='#252e40';c.fillRect(0,0,w,h);
    for(let j=0;j<24;j++)for(let i=0;i<12;i++){
      const lit=rng();
      c.fillStyle=lit>.85?'#ffd99c':lit>.68?'#c5cbd1':lit>.43?'#756b69':'#344152';
      c.fillRect(i*w/12+2,j*h/24+2,w/12-4,h/24-4);
    }
  });
  const facade=new T.MeshBasicMaterial({map:windows,color:0xdfdbd9});
  const farX=(maxX-minX)*.5,farZ=(maxZ-minZ)*.5,cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5;
  for(let i=0;i<140;i++){
    const a=i/140*Math.PI*2,radius=1+.24*rand(),x=cx+Math.cos(a)*(farX+120)*radius,z=cz+Math.sin(a)*(farZ+130)*radius;
    const h=22+84*rand()**1.7+35*(.5+.5*Math.cos(a*4)),w=12+rand()*22,d=15+rand()*24;
    if(survey.nearest(x,z).d<60)continue;
    kit.add(x,h/2-.4,z,w,h,d,rand()>.6?0xa3a8bd:0xc6c6bd,0,kit.cube,facade);
    kit.add(x,h+.45,z,w*.93,1,d*.92,0x556576);
    if(h>100){kit.add(x,h+4,z,1,8,1,0x687284);kit.add(x,h+8.5,z,.74,1,.74,0xff8166,0,kit.cube,kit.glow);}
  }
  for(let s=20;s<route.length;s+=185){
    const p=sample(s),side=s%3>1.5?-1:1,[x,,z]=roadside(p,side*(70+rand()*40)),yaw=Math.atan2(p.tx,p.tz);
    if(survey.nearest(x,z).d<65)continue;
    kit.add(x,-.65,z,69,4.7,96,0x525b62,yaw);
    dockCrane(kit,x,z,yaw, .72+.38*rand());
    for(let i=0;i<17;i++){
      const dx=(i%4-1.5)*7,dz=(Math.floor(i/4)-1.8)*13,level=1+Math.floor(rand()*3);
      for(let j=0;j<level;j++) kit.add(x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,3+j*3,z-Math.sin(yaw)*dx+Math.cos(yaw)*dz,4.4,2.9,11.5,[0x8d5953,0x71888b,0xba7950,0x666f75][(i+j)%4],yaw);
    }
  }
  ship(kit,maxX+80,minZ+490,.04,128,true);
  const p=sample(4420),light=roadside(p,-64);if(survey.nearest(light[0],light[2]).d>30)beacon(kit,light[0],light[2],32);
}
