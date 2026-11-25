import * as T from 'three';

const point=(x,y,z)=>new T.Vector3(x,y,z);
function surface(parent,material,rows,cols,vertex) {
  const positions=[],uv=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    positions.push(...vertex(i/cols,j/rows));uv.push(i/cols,j/rows);
    if(i<cols&&j<rows){const a=j*(cols+1)+i,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const m=new T.Mesh(g,material);parent.add(m);return m;
}
function part(parent,geometry,material,x=0,y=0,z=0){
  const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;
}
function welt(parent,material,points,r=.004,closed=false){
  const shape=new T.CatmullRomCurve3(points.map(v=>point(...v)),closed);
  return part(parent,new T.TubeGeometry(shape,Math.max(18,points.length*4),r,6,closed),material);
}
function cushion(parent,mat,x,y,z,w,h,d,tilt=0) {
  const m=part(parent,new T.SphereGeometry(1,24,16),mat,x,y,z);
  m.scale.set(w,h,d);m.rotation.x=tilt;return m;
}
function fabricMaterial(){
  const c=document.createElement('canvas');c.width=c.height=96;
  const ctx=c.getContext('2d');ctx.fillStyle='#304a4d';ctx.fillRect(0,0,96,96);
  for(let i=-96;i<192;i+=4){
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i-65,96);ctx.strokeStyle='#3b5557';ctx.lineWidth=1;ctx.stroke();
  }
  for(let r=0;r<96;r+=4)for(let x=(r%8?0:2);x<96;x+=4){
    ctx.fillStyle='#294144';ctx.fillRect(x,r,2,1);
  }
  const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;tx.wrapS=tx.wrapT=T.RepeatWrapping;
  tx.repeat.set(7,3);tx.anisotropy=4;
  return new T.MeshStandardMaterial({color:0xb0b9b6,map:tx,roughness:.95,envMapIntensity:.28,side:T.DoubleSide});
}
function outline(shape,points){
  const corners=points.map((p,i)=>{
    const nearer=other=>{const d=Math.hypot(other[0]-p[0],other[1]-p[1]);const t=Math.min(.24,.012/d);return [p[0]+(other[0]-p[0])*t,p[1]+(other[1]-p[1])*t];};
    return {p,start:nearer(points[(i+points.length-1)%points.length]),end:nearer(points[(i+1)%points.length])};
  });
  shape.moveTo(...corners[0].start);
  for(const {p,start,end} of corners){shape.lineTo(...start);shape.quadraticCurveTo(...p,...end);}
  shape.closePath();return shape;
}
function plate(parent,material,silhouette,cutouts=[],depth=.017){
  const shape=outline(new T.Shape(),silhouette);
  for(const loop of cutouts)shape.holes.push(outline(new T.Path(),loop));
  return part(parent,new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.004,bevelThickness:.004,curveSegments:8}),material);
}
function frontDial(wheel,x,y,r,material){
  const d=part(wheel,new T.CylinderGeometry(r,r,.009,20),material,x,y,-.014);
  d.rotation.x=Math.PI/2;return d;
}
export function createVisionCockpit(cabin,batch){
  const cover=new T.MeshStandardMaterial({color:0x151c20,metalness:.13,roughness:.64,side:T.DoubleSide});
  // The enclosed footwell receives little skylight; give the carpet a baked weave.
  const carpet=document.createElement('canvas');carpet.width=carpet.height=32;
  const pile=carpet.getContext('2d');pile.fillStyle='#111a1e';pile.fillRect(0,0,32,32);
  for(let j=0;j<32;j+=2)for(let i=j%4;i<32;i+=4){pile.fillStyle='#172125';pile.fillRect(i,j,2,1);}
  const carpetMap=new T.CanvasTexture(carpet);carpetMap.colorSpace=T.SRGBColorSpace;carpetMap.wrapS=carpetMap.wrapT=T.RepeatWrapping;carpetMap.repeat.set(12,8);
  const floor=new T.MeshBasicMaterial({map:carpetMap,toneMapped:false,side:T.DoubleSide});
  const edge=new T.MeshStandardMaterial({color:0x333f40,roughness:.42,metalness:.56,side:T.DoubleSide});
  const fascia=new T.MeshStandardMaterial({color:0x10181c,roughness:.96,metalness:0,envMapIntensity:.12,side:T.DoubleSide});
  const fabric=fabricMaterial();
  const cyan=new T.MeshBasicMaterial({color:0x66c9d8,toneMapped:false});
  const stitch=new T.MeshStandardMaterial({color:0x859d98,roughness:.85});
  const brass=new T.MeshStandardMaterial({color:0xb9a965,roughness:.31,metalness:.65});
  const cap=new T.MeshStandardMaterial({color:0x273333,roughness:.40,metalness:.25});
  const grip=new T.MeshStandardMaterial({color:0x242d2c,roughness:.79,envMapIntensity:.30});

  // Continuous inner tub and fascia screen off the wheel wells from the driver's eye.
  part(cabin,new T.BoxGeometry(1.63,.085,2.27),floor,0,.352,.00);
  surface(cabin,floor,1,28,(u,v)=>{
    const x=(u*2-1)*1.025,b=Math.abs(x);
    return [x,.33+v*(.456+.055*Math.sin(Math.PI*b)),.93+.15*(1-b*b)];
  });
  // A single padded U runs from one door, around the fascia, to the other door.
  const left=[[-.755,.754,-.88],[-.747,.758,-.48],[-.736,.766,.01],[-.70,.776,.29],
    [-.60,.778,.49],[-.45,.773,.63],[-.24,.766,.746]];
  const arc=new T.CatmullRomCurve3([...left,[0,.766,.79],...left.slice().reverse().map(([x,y,z])=>[-x,y,z])].map(p=>point(...p)));
  function bandPoint(t,offset,drop){
    const p=arc.getPointAt(t),d=arc.getTangentAt(t);
    return [p.x-d.z*offset,p.y+drop,p.z+d.x*offset];
  }
  const cross=[ [.110,.012],[.064,.024],[.022,.018],[-.018,-.008],[-.038,-.047],
    [-.035,-.087],[-.018,-.127],[.003,-.161] ];
  surface(cabin,fabric,cross.length-1,82,(u,v)=>{
    const [out,up]=cross[Math.round(v*(cross.length-1))];return bandPoint(u,out,up);
  });
  surface(cabin,floor,3,70,(u,v)=>bandPoint(u,.003+.06*(1-v),-.39+v*.231));
  welt(cabin,cyan,Array.from({length:37},(_,i)=>bandPoint(i/36,.036,.025)),.0028);
  const rimY=x=>.766+.041*x*x;
  const rimZ=x=>.79-.64*x*x;
  surface(cabin,fascia,7,48,(u,v)=>{
    const x=(2*u-1)*(.91-.12*v),b=x*x;return [x,rimY(x)-.035+v*(.076+.05*b),T.MathUtils.lerp(rimZ(x),1.21-.17*b,v)];
  });
  for(const side of [-1,1]){
    surface(cabin,fabric,14,35,(u,v)=>{
      const z=-.83+u*1.61;
      return [side*(.674+.117*Math.pow(v,1.6)+.009*Math.cos(z*4)),.38+.44*v,z];
    });
    surface(cabin,cover,3,30,(u,v)=>{
      const z=-.8+1.66*u;return [side*(.78+.17*v),.827+.022*v,z];
    });
    const sx=side*.35;
    cushion(cabin,fabric,sx,.454,-.22,.253,.105,.39);
    cushion(cabin,fabric,sx,.647,-.565,.236,.29,.085,-.18);
    for(const k of [-1,1]){
      cushion(cabin,fabric,sx+k*.22,.516,-.22,.053,.09,.32,-.08);
      welt(cabin,stitch,[[sx+k*.16,.546,.032],[sx+k*.18,.553,-.20],[sx+k*.175,.558,-.40]],.0018);
    }
  }
  // Sloping console and two recessed footwells close the space below the dash.
  const consoleZ=v=>-.57+1.19*v,consoleY=v=>.47+.105*v+.016*Math.sin(v*Math.PI);
  surface(cabin,fascia,24,12,(u,v)=>[(u*2-1)*(.093+.043*v)-.055,consoleY(v)-.019*(u*2-1)**2,consoleZ(v)]);
  for(const side of [-1,1]){
    surface(cabin,fascia,20,3,(u,v)=>[-.055+side*((.093+.043*v)*(.98+.23*(1-u))),.364+u*(consoleY(v)-.384),consoleZ(v)]);
    welt(cabin,cyan,[[.10],[.26],[.48],[.68],[.83]].map(([v])=>[-.055+side*(.093+.043*v)*.91,consoleY(v)-.012,consoleZ(v)]),.0016);
  }
  const column=part(cabin,new T.CylinderGeometry(.039,.068,.32,18),cover,.355,.703,.54);column.rotation.x=1.32;
  const switchPlate=part(cabin,new T.BoxGeometry(.087,.006,.205),new T.MeshBasicMaterial({color:0x263438,toneMapped:false}),-.055,.568,.342);switchPlate.rotation.x=-.068;
  const selector=part(cabin,new T.CylinderGeometry(.023,.025,.011,24),edge,-.055,.573,.301);
  part(cabin,new T.CylinderGeometry(.018,.018,.004,24),cap,selector.position.x,.580,selector.position.z);
  for(const z of [.37,.397,.424])part(cabin,new T.BoxGeometry(.024,.004,.004),stitch,-.055,.573+(z-.36)*.07,z);
  for(const [x,width] of [[.28,.059],[.428,.082]]){
    const pedal=part(cabin,new T.BoxGeometry(width,.09,.015),edge,x,.472,.624);pedal.rotation.x=.26;
    for(let j=0;j<4;j++)part(cabin,new T.BoxGeometry(width*.81,.006,.005),cover,x,.444+j*.015,.608+j*.003);
  }
  const vent=part(cabin,new T.BoxGeometry(.22,.063,.030),cover,-.35,.624,.755);
  for(let k=0;k<4;k++)part(cabin,new T.BoxGeometry(.184,.003,.012),edge,vent.position.x,vent.position.y-.020+k*.013,vent.position.z-.021);
  // The screen is raised above the leading edge, with a dark rounded bezel.
  const c=document.createElement('canvas');c.width=1024;c.height=120;
  const ctx=c.getContext('2d'),texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const display=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,toneMapped:false});
  const screenPos=(u,v,frame=false)=>{
    const a=2*u-1,b=2*v-1;
    const x=-a*((frame?.634:.621)-.019*Math.abs(b)**3);
    const z=.957-.143*a*a+.018*v;
    const height=(frame?.064:.053)*(1-.27*Math.abs(a)**4);
    return [x,.847+b*height+.020*a*a,z+(frame?.009:0)];
  };
  surface(cabin,fascia,12,52,(u,v)=>screenPos(u,v,true));surface(cabin,display,12,52,(u,v)=>screenPos(u,v));
  // X spokes sit between the four corner grips. Each side panel has a real opening.
  const wheel=new T.Group();wheel.position.set(.355,.742,.360);wheel.rotation.order='YXZ';wheel.rotation.x=.10;cabin.add(wheel);
  for(const side of [-1,1]){
    const reflected=pts=>pts.map(([x,y])=>[side*x,y]);
    plate(wheel,cover,reflected([[.048,.058],[.135,.111],[.182,.104],[.210,.071],[.210,-.048],[.177,-.097],[.133,-.095],[.048,-.052],[.066,-.027],[.146,-.058],[.165,-.043],[.166,.052],[.142,.061],[.067,.03]]));
    welt(wheel,grip,[[.14,.096],[.172,.091],[.194,.065],[.198,.015],[.194,-.048],[.171,-.078],[.145,-.080]].map(([x,y])=>[side*x,y,-.004]),.009);
    plate(wheel,edge,reflected([[.005,.015],[.131,.079],[.143,.063],[.050,-.002],[.144,-.055],[.128,-.071],[.009,-.019]]),[],.012);
    for(const [y,r] of [[.052,.019],[-.047,.016]]){
      frontDial(wheel,side*.132,y,r,brass);frontDial(wheel,side*.132,y,r*.76,cap).position.z=-.021;
      const mark=part(wheel,new T.BoxGeometry(.003,.007,.002),cyan,side*.132+.002,y+.008,-.027);mark.rotation.z=.27;
    }
    for(let i=0;i<3;i++)frontDial(wheel,side*(.065+.014*i),.026+i*.006,.0032,i===1?cyan:brass);
  }
  plate(wheel,cap,[[-.062,.030],[-.042,.057],[.040,.057],[.067,.030],[.068,-.025],[.037,-.049],[-.040,-.049],[-.066,-.025]],[],.025);
  const markCanvas=document.createElement('canvas');markCanvas.width=192;markCanvas.height=80;
  const markCtx=markCanvas.getContext('2d');markCtx.textAlign='center';markCtx.fillStyle='#d2d7c9';markCtx.font='bold 26px Arial';markCtx.fillText('XIAOMI',96,55);
  const markTexture=new T.CanvasTexture(markCanvas);markTexture.colorSpace=T.SRGBColorSpace;
  const logo=part(wheel,new T.PlaneGeometry(.084,.035),new T.MeshBasicMaterial({map:markTexture,transparent:true,toneMapped:false}),0,.012,-.008);logo.rotation.y=Math.PI;
  for(let i=0;i<4;i++)part(wheel,new T.BoxGeometry(.004,.003,.003),i===0?cyan:brass,(i-1.5)*.008,-.023,-.008);
  for(const side of [-1,1]){
    const paddle=part(wheel,new T.BoxGeometry(.021,.090,.017),edge,side*.172,.002,.032);paddle.rotation.z=side*.09;
    for(let i=0;i<3;i++){
      const rib=part(wheel,new T.BoxGeometry(.013,.002,.002),edge,side*.191,.037-i*.022,-.005);
      rib.rotation.z=side*.22;
    }
  }
  batch(cabin);batch(wheel);
  const seatEye=point(.112,1.018,-.381);
  let previous='';
  function update(speed,steer,braking,reverse){
    wheel.rotation.z=steer*.80;
    const kph=Math.round(Math.abs(speed)*3.6),stamp=kph+'/'+reverse+'/'+braking;
    if(previous===stamp)return;previous=stamp;
    ctx.fillStyle='#081216';ctx.fillRect(0,0,1024,120);
    ctx.fillStyle='#314447';ctx.fillRect(0,108,1024,2);
    ctx.fillStyle='#dce9e6';ctx.textAlign='left';ctx.font='600 81px Arial';ctx.fillText(String(kph),78,87);
    ctx.font='500 24px Arial';ctx.fillStyle='#91a6a7';ctx.fillText('km/h',247,82);
    ctx.font='bold 39px Arial';ctx.fillStyle=reverse?'#edb460':'#b5cfb7';ctx.fillText(reverse?'R':'D',22,78);
    const horizon=ctx.createLinearGradient(0,11,0,101);horizon.addColorStop(0,'#4f6448');horizon.addColorStop(1,'#101d21');
    ctx.fillStyle=horizon;ctx.beginPath();ctx.moveTo(455,22);ctx.lineTo(546,22);ctx.lineTo(627,100);ctx.lineTo(373,100);ctx.fill();
    ctx.strokeStyle='#d6c478';ctx.lineWidth=3;
    for(const dir of [-1,1]){ctx.beginPath();ctx.moveTo(500+dir*22,26);ctx.lineTo(500+dir*87,97);ctx.stroke();}
    ctx.fillStyle='#b9cec8';ctx.font='600 28px Arial';ctx.fillText('VISION GT',664,63);
    ctx.fillStyle=braking?'#eeb589':'#8baba6';ctx.font='18px Arial';ctx.fillText(braking?'BRAKE':'DRIVE',668,90);
    ctx.fillStyle='#4d665a';ctx.fillRect(867,49,114,8);ctx.fillStyle='#c7c678';ctx.fillRect(867,49,Math.max(5,114*kph/360),8);
    texture.needsUpdate=true;
  }
  return {seatEye,update};
}
