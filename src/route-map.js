import {sample} from './track.mjs';

export function createMap(route){
  const points=Array.from({length:360},(_,i)=>sample(route.length*i/360));
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const tunnels=route.tunnels.map(({start,end})=>{
    const steps=Math.ceil((end-start)/25);
    return Array.from({length:steps+1},(_,i)=>sample(start+(end-start)*i/steps));
  });
  const startPt=points[0];
  return {
    draw(context,padding,accent=route.accent||'#8cb3ba'){
      const {width,height}=context.canvas;
      const scale=Math.min((width-padding*2)/Math.max(1,maxX-minX),(height-padding*2)/Math.max(1,maxZ-minZ));
      const project=(x,z)=>[(x-(minX+maxX)/2)*scale+width/2,(z-(minZ+maxZ)/2)*scale+height/2];
      context.clearRect(0,0,width,height);context.lineJoin='round';context.lineCap='round';
      function stroke(list,color,close,lineWidth){
        context.beginPath();list.forEach((p,i)=>{
          const [x,y]=project(p.x,p.z);
          if(i===0)context.moveTo(x,y);else context.lineTo(x,y);
        });
        if(close)context.closePath();context.strokeStyle=color;context.lineWidth=lineWidth;context.stroke();
      }
      stroke(points,'rgba(120,165,180,.28)',true,5.5);
      stroke(points,accent,true,2.4);
      for(const tube of tunnels)stroke(tube,'#ffbe73',false,3.1);
      const [sx,sy]=project(startPt.x,startPt.z);
      context.fillStyle='#ffffff';context.beginPath();context.arc(sx,sy,3,0,Math.PI*2);context.fill();
      return project;
    }
  };
}
