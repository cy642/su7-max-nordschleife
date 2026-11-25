import * as T from 'three';

// A 2-over-2 twill repeat in millimetre-sized tows. Mipmaps reduce it to a
// dark neutral surface at driving distance, while the tow crowns catch light close up.
function carbonFinish(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const warp=(x+y)/16,weft=(y-x+128)/16;
    const top=(Math.floor(warp)-Math.floor(weft)+16)%4<2;
    const cross=top?warp:weft,along=top?weft:warp;
    const crown=Math.sin(Math.PI*(cross-Math.floor(cross)));
    const fibre=.5+.5*Math.cos(2*Math.PI*cross*4);
    const turn=.5+.5*Math.sin(Math.PI*(along+cross)/2);
    const level=25+(top?16:11)*crown+3*fibre+2*turn,i=(x+128*y)*4;
    image.data.set([level,level+2,level+3,255],i);
  }
  ctx.putImageData(image,0,0);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
  // Second UV channel carries the assembly's soft occlusion, independent
  // of the high-frequency weave. It shades the environment reflection as well.
  const occlusion=new T.DataTexture(new Uint8Array([0,0,0,255,255,255,255,255]),2,1);
  occlusion.channel=1;occlusion.magFilter=occlusion.minFilter=T.LinearFilter;occlusion.needsUpdate=true;
  return new T.MeshPhysicalMaterial({map,aoMap:occlusion,vertexColors:true,roughness:.38,metalness:.12,
    clearcoat:.27,clearcoatRoughness:.24,envMapIntensity:.46,side:T.DoubleSide});
}

function noseEmblem(parent,deck,patch){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const c=canvas.getContext('2d');
  c.translate(96,96);c.beginPath();
  for(let i=0;i<128;i++){
    const a=i*Math.PI/64,cs=Math.cos(a),sn=Math.sin(a);
    const x=92*Math.sign(cs)*Math.pow(Math.abs(cs),.66),y=90*Math.sign(sn)*Math.pow(Math.abs(sn),.66);
    if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
  }
  c.closePath();c.fillStyle='#f5f9f8';c.fill();c.lineWidth=2;c.strokeStyle='#c2ccce';c.stroke();
  // Three machined grooves form the squared m and the separate i bar.
  c.fillStyle='#819499';c.beginPath();c.moveTo(-55,31);c.lineTo(-55,-31);c.lineTo(-4,-31);
  c.quadraticCurveTo(17,-31,17,-10);c.lineTo(17,31);c.lineTo(3,31);c.lineTo(3,-9);
  c.quadraticCurveTo(3,-17,-6,-17);c.lineTo(-41,-17);c.lineTo(-41,31);c.closePath();c.fill();
  c.fillRect(-29,-6,14,37);c.fillRect(30,-31,15,62);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;map.flipY=false;
  const material=new T.MeshStandardMaterial({map,color:0xffffff,metalness:.15,roughness:.31,
    envMapIntensity:.55,transparent:true,depthWrite:false,alphaTest:.07,side:T.DoubleSide});
  // Sample the bonnet height and camber under the whole emblem rather than
  // mounting a horizontal disk above the curved metal. x faces the frontal camera.
  patch(parent,material,8,10,(row,col)=>{
    const z=2.302+row*.100,x=(col-.5)*.092;
    const halfWidth=Math.abs(deck(1,z,1)[0]);
    const p=deck(x<0?-1:1,z,Math.abs(x)/halfWidth);
    return [p[0],p[1]+.0017,p[2]];
  });
}

export function addVisionFrontTrim(parent,deck,patch){
  noseEmblem(parent,deck,patch);
  const finish=carbonFinish(),halfWidth=1.053,mix=T.MathUtils.lerp;
  function frontZ(x){
    const span=Math.abs(x)/halfWidth;
    const corner=T.MathUtils.clamp((span-.92)/.08,0,1);
    return 2.586-.216*Math.pow(span,2.55)-.039*(1-Math.sqrt(1-corner*corner));
  }
  const shoulder=x=>T.MathUtils.smoothstep(Math.abs(x)/halfWidth,.86,1);
  const smooth=(a,b,v)=>T.MathUtils.smoothstep(v,a,b);
  const footprint=(x,z,cx,cz,wx,wz)=>Math.exp(-(((Math.abs(x)-cx)/wx)**2+((z-cz)/wz)**2));
  function topY(x,depth){
    const z=mix(frontZ(x),1.48,depth);
    const inlet=smooth(.045,.26,depth)*(1-shoulder(x));
    const post=footprint(x,z,.286,2.20,.073,.158),cheek=footprint(x,z,.884,2.255,.157,.172);
    return .137+.035*depth+.026*shoulder(x)+.045*depth*depth-.021*inlet+.016*post+.023*cheek;
  }
  function trayShade(x,z){
    const inset=frontZ(x)-z;
    const overhang=smooth(.017,.235,inset);
    const post=footprint(x,z,.286,2.205,.109,.217),cheek=footprint(x,z,.872,2.234,.165,.18);
    const mouth=Math.max(0,1-.52*post-.35*cheek);
    const reflectedSky=.13+.15*smooth(.34,.72,Math.abs(x));
    return mix(.51,reflectedSky,overhang)*mouth;
  }
  function surface(rows,cols,point,sideUV=false,shade=trayShade){
    const part=patch(parent,finish,rows,cols,point),g=part.geometry;
    const p=g.getAttribute('position'),uv=g.getAttribute('uv'),colors=[],ambient=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(sideUV)uv.setXY(i,z/.038,y/.038);
      else uv.setXY(i,x/.038,(z-.8*y)/.038);
      const light=shade(x,z,y);
      colors.push(light,light,light);
      // The centres of the two texels store minimum and maximum visibility.
      ambient.push(.25+.5*light,.5);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    g.setAttribute('uv1',new T.Float32BufferAttribute(ambient,2));
  }
  // One dished tray extends behind the air intakes. Its rolled leading edge
  // turns under the floor and remains solid from a low frontal viewing angle.
  surface(36,80,(depth,u)=>{
    const x=(2*u-1)*halfWidth;
    return [x,topY(x,depth),mix(frontZ(x),1.48,depth)];
  });
  surface(12,72,(s,u)=>{
    const x=(2*u-1)*halfWidth,angle=s*Math.PI;
    return [x,topY(x,0)-.015*(1-Math.cos(angle)),frontZ(x)+.015*Math.sin(angle)];
  },false,()=>.72);
  surface(8,72,(depth,u)=>{
    const x=(2*u-1)*halfWidth;
    return [x,mix(topY(x,0)-.030,.102,depth),mix(frontZ(x),1.48,depth)];
  },false,()=>.31);
  for(const sign of [-1,1]){
    // The outboard fences emerge from the curved corners, taper fore and aft,
    // and have a closed, softly rounded carbon edge.
    surface(44,18,(s,t)=>{
      const z=mix(1.87,frontZ(halfWidth),s);
      const depth=(frontZ(halfWidth)-z)/(frontZ(halfWidth)-1.48);
      const foot=topY(halfWidth,depth)-.026;
      const arch=s<.76?smooth(0,.76,s):1-smooth(.76,1,s);
      const rise=.018+.327*arch;
      const a=t*2*Math.PI,h=.5-.5*Math.cos(a);
      const x=halfWidth-.016+.024*h+.0078*Math.sin(a)+.004*arch;
      return [sign*x,foot+rise*h,z-.014*h];
    },true,()=>.38);
    // A short web connects the fence to the outboard upright above the floor.
    // The opening beneath it is visible head-on.
    surface(14,10,(s,u)=>{
      const a=u*2*Math.PI;
      return [sign*mix(.949,1.05,s),.235+.018*s+.006*Math.sin(a),2.199+.041*s+.014*Math.cos(a)];
    },true,()=>.31);
    // Seal the narrow outside edge between the underside and the tray.
    surface(12,3,(depth,t)=>{
      const x=sign*halfWidth;
      return [x,mix(mix(topY(x,0)-.030,.102,depth),topY(x,depth),t),mix(frontZ(x),1.48,depth)];
    },true,()=>.5);
  }
}
