import * as T from 'three';

function smokeTexture(){
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(32,32,4,32,32,30);
  g.addColorStop(0,'rgba(240,248,252,.55)');
  g.addColorStop(.5,'rgba(220,232,238,.28)');
  g.addColorStop(1,'rgba(220,232,238,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  return new T.CanvasTexture(c);
}

// Lightweight pooled 3D tyre smoke + camera-locked 3D rain streaks.
export function createFX(parent){
  const group=new T.Group();
  group.name='Dynamic racing FX';
  parent.add(group);

  const SMOKE_COUNT=42;
  const puffGeo=new T.PlaneGeometry(1,1);
  const tex=smokeTexture();
  const puffs=Array.from({length:SMOKE_COUNT},()=>{
    const mat=new T.MeshBasicMaterial({map:tex,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide});
    const mesh=new T.Mesh(puffGeo,mat);
    mesh.visible=false;
    group.add(mesh);
    return {mesh,mat,life:0,max:1,vx:0,vy:0,vz:0,size:1};
  });
  let cursor=0,emitAcc=0;

  const wheelLocal=new T.Vector3();
  function spawnPuff(carObj,side,intensity,wet){
    const p=puffs[cursor];cursor=(cursor+1)%SMOKE_COUNT;
    wheelLocal.set(side*.86,.22,-1.52).applyQuaternion(carObj.quaternion).add(carObj.position);
    p.mesh.position.copy(wheelLocal);
    p.vx=(Math.random()-.5)*1.4;p.vy=.85+Math.random()*.95;p.vz=(Math.random()-.5)*1.4;
    p.max=.55+Math.random()*.35;p.life=p.max;p.size=.65+intensity*.55;
    p.mat.color.setHex(wet?0xc6e2ee:0xeef4f7);
    p.mesh.visible=true;
  }

  // 3D Rain streak field anchored around camera
  const DROPS=280;
  const rainPos=new Float32Array(DROPS*6);
  const rainSeeds=Array.from({length:DROPS},()=>({
    x:(Math.random()-.5)*36,y:Math.random()*18,z:(Math.random()-.5)*36,speed:18+Math.random()*10
  }));
  const rainGeo=new T.BufferGeometry();
  rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3));
  const rainMat=new T.LineBasicMaterial({color:0xcce6f5,transparent:true,opacity:.36,depthWrite:false});
  const rainLines=new T.LineSegments(rainGeo,rainMat);
  rainLines.frustumCulled=false;rainLines.visible=false;
  group.add(rainLines);

  function reset(){
    for(const p of puffs){p.life=0;p.mesh.visible=false;}
    rainLines.visible=false;
  }

  function update(dt,camera,carObj,{emitting,intensity,wet,raining,tunnelCover,speed}){
    if(emitting&&dt>0){
      emitAcc+=dt*(14+intensity*24);
      while(emitAcc>=1){
        emitAcc-=1;
        spawnPuff(carObj,-1,intensity,wet);
        spawnPuff(carObj,1,intensity,wet);
      }
    }else emitAcc=0;

    for(const p of puffs){
      if(p.life<=0)continue;
      p.life-=dt;
      if(p.life<=0){p.mesh.visible=false;continue;}
      const t=1-p.life/p.max;
      p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;
      const s=p.size*(1+t*2.6);
      p.mesh.scale.set(s,s,1);
      p.mesh.quaternion.copy(camera.quaternion);
      p.mat.opacity=(1-t)*(1-t)*.55;
    }

    const showRain=Boolean(raining&&tunnelCover<.55);
    rainLines.visible=showRain;
    if(showRain){
      rainMat.opacity=.38*(1-tunnelCover);
      const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
      const streak=Math.min(2.6,.75+Math.abs(speed)*.022);
      const fwd=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
      const windX=fwd.x*Math.min(10,Math.abs(speed)*.14);
      const windZ=fwd.z*Math.min(10,Math.abs(speed)*.14);
      for(let i=0;i<DROPS;i++){
        const d=rainSeeds[i];
        d.y-=d.speed*dt;
        if(d.y<-2){d.y=16+Math.random()*3;d.x=(Math.random()-.5)*34;d.z=(Math.random()-.5)*34;}
        const wx=cx+d.x,wy=cy-2+d.y,wz=cz+d.z;
        const j=i*6;
        rainPos[j]=wx;rainPos[j+1]=wy;rainPos[j+2]=wz;
        rainPos[j+3]=wx-windX*.08;rainPos[j+4]=wy-streak;rainPos[j+5]=wz-windZ*.08;
      }
      rainGeo.attributes.position.needsUpdate=true;
    }
  }

  return {group,update,reset};
}
