import * as T from 'three';
import {canvasMap,fixtureBatch,makeSurface,random,roadside,roadSurvey,smooth} from './landscape-mesh.js';
import {buildLandforms,setRouteSky,stoneUV} from './route-horizons.js';
import {buildWaterfront} from './route-waterfront.js';

function asphaltTexture(night) {
  const map=canvasMap(256,256,(ctx,w,h)=>{
    const img=ctx.createImageData(w,h),rng=random(1251);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const edge=Math.abs(x/w-.5),wheel=.5+.5*Math.cos((x/w-.18)*Math.PI*8);
      const shade=(night?82:78)+rng()*19+4*Math.sin(y*.072+x*.019)-wheel*4-edge*3;
      const i=(y*w+x)*4;
      img.data[i]=shade;img.data[i+1]=shade+2;img.data[i+2]=shade+4;img.data[i+3]=255;
    }
    ctx.putImageData(img,0,0);
    for(let i=0;i<120;i++){
      const x=rng()*w,y=rng()*h;ctx.fillStyle='rgba(223,216,210,.13)';ctx.fillRect(x,y,.5+rng(),1);
    }
  });
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map;
}
const roadStyles={
  duku:{shoulder:0xa5a6a1,side:0xb7bec3,lines:0xecead9,center:0xf1c367,rail:0x9ba3a3,reflector:0xc94930},
  canyon:{shoulder:0xb48e6d,side:0xcb946f,lines:0xf0dfb4,center:0xffbc67,rail:0x977b62,reflector:0xf4a34f},
  subsea:{shoulder:0x83969b,side:0x7f9490,lines:0xf5f2d9,center:0xe3e9e5,rail:0x98a9ad,reflector:0x80e1da},
  harbor:{shoulder:0x636871,side:0x868384,lines:0xf0eadb,center:0xfcb55e,rail:0x9da6b1,reflector:0xffbe6d}
};
const tint=new T.Color();
function geometryBuffer(){return {pos:[],idx:[],colors:[],uv:[]};}
function quad(buffer,points,colors,uv=null){
  const base=buffer.pos.length/3;
  for(let k=0;k<4;k++){
    buffer.pos.push(...points[k]);tint.set(Array.isArray(colors)?colors[k]:colors);buffer.colors.push(tint.r,tint.g,tint.b);
    if(uv)buffer.uv.push(...uv[k]);
  }
  buffer.idx.push(base,base+1,base+2,base+2,base+1,base+3);
}
function buildRoad(scene,route,sample,kit,land) {
  const {id,length}=route,style=roadStyles[id],night=id==='harbor',snow=id==='duku',marine=id==='subsea';
  const pavement=new T.MeshLambertMaterial({map:asphaltTexture(night),vertexColors:true});
  const verges=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const marking=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
  const materialList=[pavement,verges,marking,land?.material];
  const n=Math.ceil(length/3.8),stride=length/n,samples=Array.from({length:n+1},(_,i)=>sample(i*stride));
  const insideTunnel=s=>route.tunnels.some(t=>s>=t.start&&s<=t.end);
  const tunnelDistance=s=>Math.min(...route.tunnels.map(t=>Math.max(t.start-s,s-t.end,0)));
  function bank(p,s,side){
    const exposed=smooth(6,38,tunnelDistance(s));
    const wind=.48+.33*Math.sin(s*.013+side*1.65)+.19*Math.sin(s*.038+.9);
    return (.22+2.7*smooth(.49,.91,wind))*exposed;
  }
  for(let chunk=0;chunk<n;chunk+=80){
    const buffers=[geometryBuffer(),geometryBuffer(),geometryBuffer(),geometryBuffer()];
    const [asphalt,sides,paint,cut]=buffers;
    for(let i=chunk;i<Math.min(chunk+80,n);i++){
      const a=samples[i],b=samples[i+1],s=i*stride,t=s+stride;
      // Coordinates increase from driver's left to right, then down-course.
      function strip(buf,left,right,h1,h2,color,uv=null){
        quad(buf,[roadside(a,left,h1),roadside(a,right,h2),roadside(b,left,h1),roadside(b,right,h2)],color,uv);
      }
      const shade=night?.70+.28*Math.max(0,Math.cos(s*Math.PI/24))**2:.97;
      const v=Math.round(255*shade),gray=(v<<16)+(v<<8)+v;
      strip(asphalt,-5.92,5.92,0,0,gray,[[0,s/11],[1,s/11],[0,t/11],[1,t/11]]);
      const fade=marine?smooth(8,80,tunnelDistance(s)):1;
      if(i%4===0)strip(paint,-.075,.075,.020,.020,style.center);
      for(const side of [-1,1]){
        strip(sides,5.90*side,8.9*side,-.029,-.11,style.shoulder);
        strip(paint,5.51*side,5.64*side,.024,.024,style.lines);
        // Crown and interior face line up with the simulated rail at lane +/-8.81m.
        strip(sides,8.83*side,8.83*side,.29,.77,style.rail);
        strip(sides,8.83*side,9.05*side,.77,.79,0xb5b9b8);
        if(id==='harbor'||marine){
          strip(sides,8.85*side,9.12*side,-1.20,.29,night?0x545d65:0x808d92);
          strip(sides,8.80*side,9.28*side,-1.24,-1.24,0x737b7e);
          if(marine&&fade>.001){
            const w=9.2+fade*(14+3*Math.sin(s*.021+side));
            const w2=9.2+smooth(8,80,tunnelDistance(t))*(14+3*Math.sin(t*.021+side));
            quad(sides,[roadside(a,side*9.1,-.30),roadside(a,side*w,-1.55),roadside(b,side*9.1,-.30),roadside(b,side*w2,-1.55)],0xb5aaa0);
            quad(sides,[roadside(a,side*w,-1.55),roadside(a,side*(w+9),-11),roadside(b,side*w2,-1.55),roadside(b,side*(w2+9),-11)],0x858a86);
          }
        }else{
          const inner=roadside(a,side*10.5,-.21),inner2=roadside(b,side*10.5,-.21);
          const outer=roadside(a,side*32),outer2=roadside(b,side*32);
          outer[1]=land.height(outer[0],outer[2])-.15;outer2[1]=land.height(outer2[0],outer2[2])-.15;
          strip(cut,8.8*side,10.5*side,-.11,-.21,style.side);
          if(snow){
            const high=bank(a,s,side),next=bank(b,t,side),width=12+1.5*Math.sin(s*.025+side),width2=12+1.5*Math.sin(t*.025+side);
            const lip=roadside(a,side*width,high),lip2=roadside(b,side*width2,next);
            const cap=roadside(a,side*(width+2.3),high+.18),cap2=roadside(b,side*(width2+2.3),next+.18);
            quad(cut,[inner,lip,inner2,lip2],[0xb1b6b8,0xe4e9eb,0xb1b6b8,0xe4e9eb]);
            quad(cut,[lip,cap,lip2,cap2],0xecf0f2);
            quad(cut,[cap,outer,cap2,outer2],[0xe0e6e9,0xd0d4d4,0xe0e6e9,0xd0d4d4]);
          }else quad(cut,[inner,outer,inner2,outer2],[0xd19d72,0xc78c61,0xd19d72,0xc78c61]);
        }
      }
    }
    for(let b=0;b<buffers.length;b++){
      const data=buffers[b];
      if(!data.pos.length)continue;
      if(data===cut)for(let i=0;i<data.pos.length;i+=3)data.uv.push(...stoneUV(data.pos[i],data.pos[i+1],data.pos[i+2]));
      makeSurface(scene,data.pos,data.idx,materialList[b],data.colors,data.uv.length?data.uv:null);
    }
  }
  // Scale markers, rail posts and roadside reflectors share draw calls across the lap.
  for(let s=0;s<length;s+=13.6){
    const p=sample(s),yaw=Math.atan2(p.tx,p.tz),index=Math.round(s/13.6);
    for(const side of [-1,1]){
      kit.add(...roadside(p,9*side,.28),.12,.68,.12,0x767e7d,yaw);
      if(index%2===0)kit.add(...roadside(p,8.84*side,.66),.20,.12,.21,style.reflector,yaw,kit.cube,kit.glow);
      if(snow&&index%4===0&&!insideTunnel(s)){
        const at=h=>roadside(p,9.62*side,h);
        kit.add(...at(1.24),.12,2.5,.12,0xcb4838,yaw);
        kit.add(...at(1.73),.13,.34,.13,0xece7d3,yaw);
      }
    }
  }
  for(let col=0;col<16;col++)for(let row=0;row<2;row++){
    const p=sample(row*.5),yaw=Math.atan2(p.tx,p.tz);
    kit.add(...roadside(p,(col-7.5)*.72,.037),.718,.021,.50,(col+row)%2?0xf3efdc:0x36383b,yaw);
  }
  for(let i=1;i<=6;i++){
    const p=sample(-i*7),yaw=Math.atan2(p.tx,p.tz);
    kit.add(...roadside(p,i%2?-2.25:2.25,.035),2.32,.017,.14,0xdddccf,yaw);
  }
  if(night)buildViaduct(route,sample,kit,insideTunnel);
}

function buildViaduct(route,sample,kit,insideTunnel) {
  for(let s=0;s<route.length;s+=48){
    const p=sample(s),yaw=Math.atan2(p.tx,p.tz);
    for(const side of [-1,1]){
      kit.add(...roadside(p,side*6,-p.y*.5-1.65),1.45,p.y+1.3,2.35,0x75828a,yaw);
      if(insideTunnel(s)||side!==((s/48)%2?1:-1))continue;
      kit.beam(roadside(p,side*9.45,-.1),roadside(p,side*9.45,8.4),.17,.19,0xa6afaf);
      kit.beam(roadside(p,side*9.45,8.1),roadside(p,side*7.05,8.75),.12,.15,0xb0b8bb);
      kit.add(...roadside(p,side*7.05,8.65),.72,.15,.58,0xffdea2,yaw,kit.cube,kit.glow);
    }
    kit.add(...roadside(p,0,-1.1),16.2,1.3,2.7,0x828b8e,yaw);
  }
  for(const s of [2100,2320]){
    const p=sample(s),yaw=Math.atan2(p.tx,p.tz);
    for(const side of [-1,1]){
      kit.beam(roadside(p,side*12,-3),roadside(p,side*8.6,45),1.7,2.1,0xabbdc9);
      kit.add(...roadside(p,side*8.6,45),.6,.85,.58,0xff9054,yaw,kit.cube,kit.glow);
      for(const dist of [-64,-48,-32,32,48,64]){
        const anchor=roadside(sample(s+dist),11.2*side,.6);
        kit.beam(anchor,roadside(p,8.8*side,29+Math.abs(dist)*.24),.13,.13,0xd1c0a7);
      }
    }
    kit.beam(roadside(p,-9.1,37),roadside(p,9.1,37),1.1,1.7,0x9daeb8);
  }
}

function roadSign(scene,route,sample,kit) {
  const labels={duku:['独库雪山','天山垭口'],subsea:['海底隧道','海岸入口'],canyon:['丹霞峡谷','红砂台地'],harbor:['夜港高架','东码头']};
  const [name,section]=labels[route.id];
  const map=canvasMap(512,192,(c,w,h)=>{
    c.fillStyle={duku:'#30575b',subsea:'#17586a',canyon:'#834a35',harbor:'#253d5b'}[route.id];c.fillRect(0,0,w,h);
    c.strokeStyle='#d4ddd5';c.lineWidth=5;c.strokeRect(9,9,w-18,h-18);
    c.textAlign='center';c.fillStyle='#faf4df';c.font='bold 74px "Microsoft YaHei",sans-serif';c.fillText(name,w/2,99);
    c.font='34px "Microsoft YaHei",sans-serif';c.fillText(section+'    '+(route.length/1000).toFixed(1)+' km',w/2,157);
  });
  const p=sample(31),yaw=Math.atan2(p.tx,p.tz),at=roadside(p,-10.65,3.15);
  const board=new T.Mesh(new T.PlaneGeometry(4.5,1.7),new T.MeshBasicMaterial({map,side:T.DoubleSide}));
  board.position.set(...at);board.rotation.y=yaw+Math.PI;scene.add(board);
  for(const d of [-1.15,1.15])kit.add(...roadside(p,-10.65+d,1.28),.10,2.55,.10,0x909a99,yaw);
}

export function buildRouteLandscape(scene,route,sample) {
  const survey=roadSurvey(route,sample),kit=fixtureBatch(scene);
  setRouteSky(scene,route,survey.bounds);
  let height=null;
  if(route.id==='duku'||route.id==='canyon')height=buildLandforms(scene,route,sample,survey,kit);
  else buildWaterfront(scene,route,sample,survey,kit);
  buildRoad(scene,route,sample,kit,height);
  roadSign(scene,route,sample,kit);kit.flush();
  return scene;
}
