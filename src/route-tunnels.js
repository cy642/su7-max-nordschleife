import * as T from 'three';

const clamp = T.MathUtils.clamp;
const liningWidth = 11.45;
const profile = [[-1,-.65],[-1,1.55],[-1,3.7]];
for (let i=1; i<=12; i++) {
  const a=Math.PI*i/12;
  profile.push([-Math.cos(a),3.7+6.15*Math.sin(a)]);
}
profile.push([1,1.55],[1,-.65]);

// Linear colours are cached because thousands of separate panels share a palette.
const palette = new Map();
function ink(hex) {
  if (!palette.has(hex)) palette.set(hex,new T.Color(hex));
  return palette.get(hex);
}
function fade(x) {
  x=clamp(x,0,1);
  return x*x*(3-2*x);
}
function noise(a,b) {
  const v=Math.sin(a*17.87+b*73.29)*43758.5453;
  return v-Math.floor(v);
}

class Faces {
  constructor(sample) {
    this.sample=sample;this.frames=new Map();
    this.positions=[];this.colors=[];this.indices=[];
  }
  point([s,x,y],color) {
    let frame=this.frames.get(s);
    if (!frame) {frame=this.sample(s);this.frames.set(s,frame);}
    this.positions.push(frame.x-frame.tz*x,frame.y+y,frame.z+frame.tx*x);
    const c=ink(color);this.colors.push(c.r,c.g,c.b);
    if(this.swim){
      const m=this.swim,along=(s-m.s)*m.co+(x-m.x)*m.si;
      const tail=m.length*clamp(-1.58*along/m.length,0,1.1)**2;
      this.motion.push(m.dx,m.dz,m.phase,tail);
    }
  }
  swimmer(s,x,length,angle,phase){
    const frame=this.sample(s),co=Math.cos(angle),si=Math.sin(angle);
    this.motion??=[];
    this.swim={s,x,length,co,si,dx:frame.tx*co-frame.tz*si,dz:frame.tz*co+frame.tx*si,phase};
  }
  quad(a,b,c,d,color,far=color) {
    const n=this.positions.length/3;
    this.point(a,color);this.point(b,color);this.point(c,far);this.point(d,far);
    this.indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  tri(a,b,c,color) {
    const n=this.positions.length/3;
    this.point(a,color);this.point(b,color);this.point(c,color);this.indices.push(n,n+1,n+2);
  }
  mesh(parent,material,name) {
    if (!this.indices.length) return;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(this.colors,3));
    if(this.motion)geometry.setAttribute('swim',new T.Float32BufferAttribute(this.motion,4));
    geometry.setIndex(this.indices);geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,material);mesh.name=name;parent.add(mesh);
  }
}

function arch(s,width=liningWidth,dy=0) {
  return profile.map(([x,y])=>[s,x*width,y+dy]);
}
function bands(faces,a,b,color) {
  for(let i=0;i<a.length-1;i++)faces.quad(a[i],b[i],b[i+1],a[i+1],color);
}
function stripe(faces,s,t,x,y,width,height,color) {
  faces.quad([s,x,y],[t,x,y],[t,x+width,y+height],[s,x+width,y+height],color);
}
function rib(faces,s,depth,thickness,frameColor,lidColor) {
  const front=arch(s,liningWidth+.035),back=arch(s+depth,liningWidth+.035);
  const inner=arch(s,liningWidth-thickness,-thickness*.57);
  const innerBack=arch(s+depth,liningWidth-thickness,-thickness*.57);
  bands(faces,front,inner,frameColor);bands(faces,inner,innerBack,lidColor);bands(faces,innerBack,back,frameColor);
}
function sleeve(faces,s,x,y,r,side,color,roll=0) {
  // Wall-mounted illuminated route indicators are parallel to the road.
  const stem=.095*r;
  for (const dir of [-1,1]) {
    faces.quad([s-1.2*r,x,y+dir*.56*r+roll],[s-1.2*r+stem,x,y+dir*.56*r+roll],
      [s+r+stem,x-side*.008,y+roll],[s+r,x-side*.008,y+roll],color);
  }
}
function mountainRing(s,canyon) {
  return profile.map(([x,y],i)=>{
    const crown=Math.max(0,(y-2)/8);
    const wave=1.6*Math.sin(s*.064+i*1.32)+1.12*Math.sin(s*.17-i*1.45);
    const wide=(canyon?29:34)+4*Math.sin(s*.036+i*.53)+wave;
    return [s,x*wide,y<0?-1.1:y*(canyon?1.62:1.9)+crown*(3.6+wave)];
  });
}
const darkRock=[0x667072,0x687274,0x626d6e,0x606a6e];
const redRock=[0x8a6050,0x916452,0x8a6353,0x865c4d];
const snowRock=[0x696f75,0x798186,0x808889,0x686e72];
const canyonWall=[0x9d6547,0xae7452,0x9e6a4f,0x926145];
function rockSkin(faces,s,t,section,routeId) {
  const canyon=routeId==='canyon';
  const rockyArch=station=>arch(station).map(([z,x,y],i)=>{
    const offset=.14*Math.sin(station*.26+i*.94)+.12*Math.cos(station*.38-i);
    return [z,x+Math.sign(x)*offset,y+offset*Math.max(0,y/10)];
  });
  const a=rockyArch(s),b=rockyArch(t),outerA=mountainRing(s,canyon),outerB=mountainRing(t,canyon);
  const palette=canyon?redRock:darkRock,high=canyon?canyonWall:snowRock;
  for(let i=0;i<a.length-1;i++) {
    const j=Math.floor(noise(Math.round(s),i)*4);
    faces.quad(a[i],b[i],b[i+1],a[i+1],palette[j]);
    const snow=!canyon&&profile[i][1]>7&&(i>=6&&i<=10||noise(s,i)>.28);
    faces.tri(outerA[i],outerB[i],outerB[i+1],snow?0xd4dce0:high[j]);
    faces.tri(outerA[i],outerB[i+1],outerA[i+1],snow?0xe3e7e5:high[(j+1)%4]);
  }
  // Cover the shoulder at the mouth, leaving the arch opening entirely clear.
  for(const end of [section.start,section.end]) {
    if(s!==end&&t!==end)continue;
    const into=end===section.start?1:-1;
    const inner=arch(end,liningWidth+.7,.6),outer=mountainRing(end,canyon);
    const middle=inner.map((p,i)=>{
      const q=outer[i],blend=.43+.095*Math.cos(i*1.63);
      return [end-into*(2.3+6.1*Math.cos(i*2.24)**2),p[1]+(q[1]-p[1])*blend,p[2]+(q[2]-p[2])*blend];
    });
    for(let i=0;i<inner.length-1;i++) {
      const cut=high[Math.floor(noise(end,i)*4)];
      faces.quad(inner[i],middle[i],middle[i+1],inner[i+1],cut);
      faces.tri(middle[i],outer[i],outer[i+1],cut);faces.tri(middle[i],outer[i+1],middle[i+1],high[(i+1)%4]);
    }
  }
}
function concreteSkin(faces,s,t) {
  const a=arch(s),b=arch(t);
  for(let i=0;i<a.length-1;i++){
    const height=(profile[i][1]+profile[i+1][1])/2;
    const color=height<1.3?0x344854:height<3.7?0x779190:height<6.4?0x65777b:height<8.8?0x53636a:0x404d55;
    faces.quad(a[i],b[i],b[i+1],a[i+1],color);
  }
}
function interiorDetails(faces,s,t,section,routeId) {
  const glass=section.type==='glass',rock=section.type==='rock';
  for(const side of [-1,1]) {
    const wall=side*(liningWidth-(rock?.34:.055));
    stripe(faces,s,t,side*10.97,-.12,0,glass?.87:1.22,glass?0x354e56:rock?0x666760:0x344855);
    stripe(faces,s,t,side*10.97,glass?.75:1.1,side*.41,.02,0x829395);
    stripe(faces,s,t,side*10.955,glass?.63:.88,0,.085,glass?0x86e9e0:rock?0xf1b35c:0x5dd8d4);
    if(glass) {
      // Slender glazing beads and tinted highlights leave the panoramic side panels clear.
      stripe(faces,s,t,side*11.40,3.5,0,.037,0x88aaac);
      stripe(faces,s,t,side*9.92,6.72,-side*.03,.027,0x90b8b6);
    } else {
      stripe(faces,s,t,wall,2.0,0,.13,rock?0x996d3f:0x327a86);
      stripe(faces,s,t,side*7.96,7.84,side*.22,.04,0x3a4143);
    }
  }
  const spacing=glass?16:rock?21:15;
  for(let station=section.start+spacing/2+Math.ceil((s-section.start-spacing/2)/spacing)*spacing;station<t;station+=spacing){
    if(station<s||station+2>section.end) continue;
    const index=Math.round((station-section.start-spacing/2)/spacing);
    if(glass||index%2===0)rib(faces,station,glass?.32:.28,glass?.18:.13,glass?0x668992:0x39434a,glass?0xa7c0bb:0x5a666a);
    for(const side of [-1,1]){
      const x=side*10.94;
      stripe(faces,station,station+.37,x,.56,0,.17,side<0?0xf3bf69:0xbaf2e8);
      if(glass) {
        stripe(faces,station+.25,station+.54,side*11.13,1.12,0,1.4,0xb4e6d6);
      } else {
        const outer=side*7.84;
        stripe(faces,station,station+4.0,outer,7.91,side*.46,-.34,rock?0x8c8564:0x89a3a8);
        stripe(faces,station+.15,station+3.85,outer+.06*side,7.85,side*.32,-.23,rock?0xffe2a4:0xe0ffff);
        if(index%5===2) {
          const wall=side*11.26;
          stripe(faces,station,station+2.5,wall,2.55,0,.72,0x24816c);
          sleeve(faces,station+1.25,wall-.02*side,2.90,.52,side,0xe1efce);
        }
      }
    }
    if(!glass&&routeId==='subsea'&&index%4===0){
      stripe(faces,station,station+.22,-3.0,9.4,6,0,0x849698);
    }
  }
}

function outerWaterLevel(s,x,y) {
  return [s,x*(1+.05*Math.sin(s*.023+y*.095)),y+.65*Math.cos(s*.044+x*.13)];
}
function waterSkin(water,s,t){
  // A local volume keeps daylight portals and the open-air road visible outside the viewing chambers.
  const section=[[-11.45,-2.5,0x385c63],[-19,-2.2,0x416f72],[-31,-3.1,0x3c6c75],[-44,1,0x246375],
    [-44,5,0x246e82],[-39,14,0x438c99],[-28,22,0x76adaf],[-14,25,0x8fc4be],
    [0,27,0x8cc9c4],[14,25,0x8cc0bd],[28,22,0x72acb1],[39,14,0x438d9f],[44,5,0x267389],
    [44,1,0x296b7d],[31,-3.1,0x406e74],[19,-2.2,0x467575],[11.45,-2.5,0x385960]];
  for(let i=0;i<section.length-1;i++){
    const [x,y,col]=section[i],[x2,y2,col2]=section[i+1];
    water.quad(outerWaterLevel(s,x,y),outerWaterLevel(t,x,y),outerWaterLevel(t,x2,y2),outerWaterLevel(s,x2,y2),col,col2);
  }
}
function fish(faces,s,x,y,length,angle,phase,manta=false){
  // Express fish in tangent-plane coordinates to keep their proportions on banked approaches.
  faces.swimmer(s,x,length,angle,phase);
  const co=Math.cos(angle),si=Math.sin(angle);
  const v=(along,across,up)=>[s+length*(along*co-across*si),x+length*(along*si+across*co),y+up*length];
  if(manta){
    const nose=v(.37,0,.015),spine=v(.02,0,.093),hips=v(-.31,0,0);
    for(const side of [-1,1]){
      const elbow=v(.10,side*.39,.018),tip=v(-.17,side*.62,.12);
      const root=v(-.26,side*.21,-.03),sweep=v(-.17,side*.39,.011);
      faces.quad(nose,elbow,tip,spine,0x3a6773,0x63858a);faces.quad(spine,tip,sweep,root,0x477382,0x557e83);
      faces.tri(spine,root,hips,0x62858a);
      faces.tri(nose,v(.46,side*.12,.005),elbow,0x75999b);
    }
    faces.tri(v(-.20,.034,0),v(-1.04,-.14,.018),v(-.20,-.034,0),0x436973);
    return;
  }
  const shark=length>3;
  const shades=shark?[0x395766,0x486d79,0x6c898b,0x97a6a0]:[0x426f80,0x688e95,0x9fb6ad,0xc8cdb4];
  const levels=[1,0,0,0,1,2,3,2];
  const stations=shark
    ?[[-.43,.013,.021],[-.33,.034,.046],[-.13,.076,.10],[.09,.100,.12],[.27,.084,.095],[.38,.061,.068],[.47,.028,.034],[.493,.003,.006]]
    :[[-.38,.013,.022],[-.26,.042,.083],[-.05,.095,.155],[.15,.11,.15],[.31,.08,.101],[.42,.034,.047],[.45,.005,.011]];
  let prev;
  for(const [z,w,h] of stations){
    const ring=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return v(z,w*Math.cos(a),.014+h*Math.sin(a));});
    if(prev)for(let j=0;j<ring.length;j++){
      const k=(j+1)%ring.length;
      faces.quad(prev[j],ring[j],ring[k],prev[k],shades[levels[j]],shades[levels[k]]);
    }
    prev=ring;
  }
  const tail=v(shark?-.43:-.38,0,.014);
  faces.quad(tail,v(-.49,0,.15),v(-.565,0,shark?.235:.195),v(-.50,0,.029),shades[0]);
  faces.quad(tail,v(-.50,0,.008),v(-.548,0,shark?-.119:-.17),v(-.467,0,-.096),shades[1]);
  faces.quad(v(.076,0,.108),v(-.025,0,shark?.222:.19),v(-.064,0,.190),v(-.105,0,.088),shades[0],shades[1]);
  for(const sign of [-1,1]){
    faces.quad(v(.17,sign*.058,.01),v(-.062,sign*.23,-.066),v(-.083,sign*.21,-.069),v(.014,sign*.067,-.017),shades[1],shades[2]);
    if(shark){
      const eye=v(.343,sign*.062,.035);
      faces.quad(eye,v(.335,sign*.066,.044),v(.322,sign*.071,.037),v(.327,sign*.070,.027),0x223f48);
    }
  }
}
function shoal(faces,s,side,rnd){
  const height=2.1+rnd()*6.8,base=14+rnd()*4,size=7+Math.floor(rnd()*8),phase=rnd()*Math.PI*2;
  for(let j=0;j<size;j++){
    const t=j/size-.5,wide=1-t*t*2.8;
    fish(faces,s+t*11.6+(rnd()-.5)*2.2,side*(base+t*3.5+(rnd()-.5)*wide*4),height+t*2.4+(rnd()-.5)*wide*2.8,
      .53+rnd()*.9,side*(.80+rnd()*.69),phase+t*.7+rnd()*.38);
  }
}
function whale(faces,s,side) {
  faces.swimmer(s,side*22.5,14,Math.atan2(side*.47,.88),s*.016);
  const p=(long,across,height)=>[s+long*.88-across*.47,side*(22.5+long*.47+across*.88),5.2+height];
  const stations=[[-7.1,.25,.30,.22],[-5.6,.58,.66,.38],[-3.4,1.15,1.08,.46],
    [0,1.65,1.5,.32],[2.8,1.64,1.43,.22],[5.10,1.05,.94,.13],[6.65,.13,.15,.27]];
  const shade=[0x486876,0x3a5b69,0x325567,0x325567,0x3a5b69,0x486876,0x5b8387,0x698c8c,0x698c8c,0x5b8387];
  let prev;
  for(const [z,w,h,offset] of stations){
    const ring=Array.from({length:10},(_,i)=>{
      const a=i*Math.PI/5;return p(z,w*Math.cos(a),offset+h*Math.sin(a));
    });
    if(prev)for(let i=0;i<ring.length;i++){
      const j=(i+1)%ring.length;
      faces.quad(prev[i],ring[i],ring[j],prev[j],shade[i],shade[j]);
    }
    prev=ring;
  }
  faces.tri(p(-1.3,0,1.55),p(-2.35,0,2.43),p(-2.4,0,1.37),0x31556a);
  for(const wing of [-1,1]){
    faces.quad(p(-6.2,0,.18),p(-7.95,wing*3.1,.42),p(-8.13,wing*2.15,.32),p(-7.48,0,.13),0x345c70);
    faces.tri(p(2.4,wing*1.04,-.3),p(-.8,wing*3.45,-1.3),p(.52,wing*1.3,-.53),0x42676f);
  }
}
function reef(faces,s,side,rnd) {
  for(let j=0;j<6;j++){
    const x=side*(13.6+rnd()*12),z=s+(rnd()-.5)*16,w=1.1+rnd()*3.5,h=.4+rnd()*2.45;
    const crown=[z+.23*w,x+.13*w,-1.8+h];
    for(let k=0;k<6;k++){
      const a=k*Math.PI/3,b=a+Math.PI/3;
      faces.tri(crown,[z+Math.cos(a)*w,x+Math.sin(a)*w*.80,-2.6],[z+Math.cos(b)*w,x+Math.sin(b)*w*.80,-2.6],k%2?0x406f6d:0x537f73);
    }
    for(let k=0;k<5;k++){
      const a=z+(rnd()-.5)*w,b=x+(rnd()-.5)*w,rise=2.3+rnd()*5.5,drift=.5+rnd()*.78;
      faces.quad([a,b,-1.7],[a+.33,b,-1.7],[a+drift+.21,b+drift*.5,-1.7+rise*.58],[a+drift-.13,b+drift*.5,-1.7+rise*.58],0x27594e);
      faces.tri([a+drift+.21,b+drift*.5,-1.7+rise*.58],[a+drift*.5,b+.6,-1.7+rise],[a+drift-.13,b+drift*.5,-1.7+rise*.58],0x518577);
    }
  }
}
function seaLife(faces,bottom,beams,s,t,section){
  for(let i=Math.max(0,Math.ceil((s-section.start-18)/44));;i++){
    const center=section.start+18+i*44;
    if(center>=t||center+12>=section.end)break;
    let seed=(Math.round(section.start)+i*7981+23)>>>0;
    const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const side=rnd()>.5?1:-1;
    shoal(faces,center,side,rnd);reef(bottom,center,-side,rnd);
    if(i%3!==0&&i%5!==2)fish(faces,center+rnd()*15,-side*(15+rnd()*7),2.8+rnd()*7.1,4.3+rnd()*3.4,side*(.35+rnd()*1.7),rnd()*6.3);
    if(i%4===0)fish(faces,center+11,-side*7,12.8+rnd()*2,5.5+rnd()*1.5,side*(.65+rnd()*.65),rnd()*6.3,true);
    if(i%5===2)whale(faces,center+7,side);
    // Broad shafts stay behind the glazing rather than passing through the driver's camera.
    const x=side*(19+rnd()*3);
    beams.quad([center-3,x,20],[center-2.4,x+.4,20],[center+11,x+side*6,-1.6],[center+5,x+side*5,-1.6],0x9dded1);
  }
}
function glassFilms(faces,s,t){
  // Sparse reflections make the enclosure readable while preserving the view into the water.
  for(const side of [-1,1]){
    faces.quad([s,side*11.41,1.7],[t,side*11.41,1.7],[t,side*11.41,3.22],[s,side*11.41,3.22],0x78c1c4,0x94d4ce);
  }
}
function portal(faces,s,toward,rock){
  const main=arch(s,liningWidth+.45,.40),lip=arch(s,liningWidth-.08,-.045);
  const ext=arch(s+toward*2.5,liningWidth+(rock?1.14:.85),.75);
  bands(faces,main,ext,rock?0x798082:0x7e9094);bands(faces,main,lip,rock?0xa9a8a0:0xa2b6b8);
  for(const side of [-1,1]){
    const x=side*(liningWidth-.11);
    for(let k=0;k<4;k++){
      const y=.36+k*.59;
      faces.quad([s,x,y],[s,x+side*.47,y+.20],[s,x+side*.47,y+.49],[s,x,y+.29],rock?0xe9b765:0x79c6c5);
    }
  }
}
function waterSurfaceMaterial(clock){
  const mat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uSeaTime=clock;
    shader.vertexShader='varying vec3 vReef;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vReef=position;');
    shader.fragmentShader='uniform float uSeaTime; varying vec3 vReef;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 uv = vec2(vReef.x*.85+vReef.y*.42, vReef.z*.71-vReef.y*.36);
      float t=uSeaTime*.12;
      float f=sin(uv.x+sin(uv.y*.76+t))+.62*sin(uv.y*1.44+sin(uv.x*.65-t))+.28*sin(uv.x*2.16-uv.y*.84);
      float g=cos(uv.y*.72+cos(uv.x*1.82-t))-.56*cos(uv.x*1.66+uv.y*.43+t);
      float ripple=1.-smoothstep(.04,.36,min(abs(f),abs(g)));
      float drift=sin(uv.x*.12+t*.18+cos(uv.y*.17))*.021;
      diffuseColor.rgb *= .963 + .061*ripple + drift;`);
  };
  return mat;
}
function swimmerMaterial(clock){
  const mat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uSeaTime=clock;
    shader.vertexShader='uniform float uSeaTime; attribute vec4 swim;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float t=uSeaTime,phase=swim.z;
      vec2 forward=swim.xy,side=vec2(-forward.y,forward.x);
      float drift=1.7*sin(t*.17+phase);
      float beat=sin(t*2.45+phase-swim.w*.44)*swim.w*.084;
      transformed.xz+=forward*drift+side*(beat+.33*cos(t*.27+phase));
      transformed.y+=.17*sin(t*.37+phase);`);
  };
  return mat;
}
function stoneMaterial(){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide,vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vStone;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vStone=position;');
    shader.fragmentShader=`varying vec3 vStone;
      float rockHash(vec2 p){
        vec3 q=fract(p.xyx*vec3(.11369,.13787,.13819));
        q+=dot(q,q.yzx+19.19);return fract((q.x+q.y)*q.z);
      }
      float strata(vec2 p){
        vec2 i=floor(p),a=fract(p);a=a*a*(3.0-2.0*a);
        return mix(mix(rockHash(i),rockHash(i+vec2(1.,0.)),a.x),mix(rockHash(i+vec2(0.,1.)),rockHash(i+1.),a.x),a.y);
      }
      `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
       vec2 uv=vec2(vStone.x*.37+vStone.z*.57,vStone.y+vStone.z*.12-vStone.x*.09);
       float grain=strata(uv*1.23);
       float noise=.52*strata(uv*.34)+.30*grain+.18*strata(uv*4.1);
       float seam=fract(uv.y*.41+.83*strata(uv*.28)+.10*grain);
       float crack=1.-smoothstep(.01,.072,min(seam,1.-seam));
       diffuseColor.rgb *= (.53+.75*noise-.18*crack);
       diffuseColor.rgb += vec3(.016,.015,.014)*smoothstep(.65,.82,noise);
       `);
  };
  return material;
}
function buildBlock(group,sample,section,route,start,end,materials,externalStart,externalEnd){
  const shell=new Faces(sample),stone=new Faces(sample),water=new Faces(sample),life=new Faces(sample),glare=new Faces(sample);
  const rock=section.type==='rock',glass=section.type==='glass';
  const count=Math.ceil((end-start)/6);
  for(let i=0;i<count;i++){
    const s=i===0?start:start+(end-start)*i/count;
    const t=i+1===count?end:start+(end-start)*(i+1)/count;
    if(rock)rockSkin(stone,s,t,section,route.id);
    else if(glass){waterSkin(water,s,t);glassFilms(glare,s,t);}
    else concreteSkin(shell,s,t);
    interiorDetails(shell,s,t,section,route.id);
  }
  if(glass)seaLife(life,water,glare,start,end,section);
  if(start===section.start){
    if(externalStart)portal(shell,start,1,rock);
    else rib(shell,start,.54,.24,0x5c747b,0xa6b8ae);
  }
  if(end===section.end&&externalEnd)portal(shell,end,-1,rock);
  shell.mesh(group,materials.solid,'Tunnel structure and lighting');
  stone.mesh(group,materials.stone,'Excavated rock and mountain face');
  water.mesh(group,materials.water,'Water and seabed');
  life.mesh(group,materials.swimmers,'Fish and rays');
  glare.mesh(group,materials.glare,'Glass reflections and light shafts');
}

export function buildRouteTunnels(scene,route,sample){
  const sections=route.tunnels??[],blocks=[];
  if(!sections.length)return {update:()=>0};
  const clock={value:0},hasWindows=sections.some(s=>s.type==='glass');
  const materials={
    solid:new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}),
    stone:sections.some(s=>s.type==='rock')?stoneMaterial():null,
    water:hasWindows?waterSurfaceMaterial(clock):null,
    swimmers:hasWindows?swimmerMaterial(clock):null,
    glare:hasWindows?new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.095,depthWrite:false}):null
  };
  const tunnels=new T.Group();tunnels.name='Drive-through tunnels';scene.add(tunnels);
  for(let i=0;i<sections.length;i++){
    const section=sections[i],blocksNeeded=Math.ceil((section.end-section.start)/210);
    for(let j=0;j<blocksNeeded;j++){
      const start=j===0?section.start:section.start+(section.end-section.start)*j/blocksNeeded;
      const end=j+1===blocksNeeded?section.end:section.start+(section.end-section.start)*(j+1)/blocksNeeded;
      const group=new T.Group();group.name=section.type+' '+Math.round(start);tunnels.add(group);
      buildBlock(group,sample,section,route,start,end,materials,sections[i-1]?.end!==section.start,sections[i+1]?.start!==section.end);
      blocks.push({group,fish:group.getObjectByName('Fish and rays'),center:(start+end)*.5,radius:(end-start)*.5});
    }
  }
  return {
    update(distance,elapsed=0) {
      clock.value=elapsed;
      const s=T.MathUtils.euclideanModulo(distance,route.length);
      for(const block of blocks){
        const difference=Math.abs(s-block.center);
        const reach=Math.min(difference,route.length-difference)-block.radius;
        block.group.visible=reach<1250;
        if(block.fish)block.fish.visible=reach<460;
      }
      // Crossfade adjacent tunnel sections as well as open portals.
      let cover=0;
      for(const section of sections){
        const opacity=section.type==='glass'?.32:1;
        cover+=opacity*(fade((s-section.start+9)/18)-fade((s-section.end+9)/18));
      }
      return clamp(cover,0,1);
    }
  };
}
