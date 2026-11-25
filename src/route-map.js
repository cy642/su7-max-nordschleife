import {sample} from './track.mjs';

export function createMap(route){
  const points=Array.from({length:360},(_,i)=>sample(route.length*i/360));
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const tunnels=route.tunnels.map(({start,end})=>{
    const steps=Math.ceil((end-start)/25);
    return Array.from({length:steps+1},(_,i)=>sample(start+(end-start)*i/steps));
  });
  return {
    draw(context,padding){
      const {width,height}=context.canvas;
      const scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxZ-minZ));
      const project=(x,z)=>[(x-(minX+maxX)/2)*scale+width/2,(z-(minZ+maxZ)/2)*scale+height/2];
      context.clearRect(0,0,width,height);context.lineJoin='round';context.lineCap='round';
      function stroke(points,color,close){
        context.beginPath();points.forEach((p,i)=>{
          const [x,y]=project(p.x,p.z);
          if(i===0)context.moveTo(x,y);else context.lineTo(x,y);
        });
        if(close)context.closePath();context.strokeStyle=color;context.stroke();
      }
      context.lineWidth=2.7;stroke(points,'#91a6aa',true);
      for(const tube of tunnels)stroke(tube,'#f6bd7f',false);
      return project;
    }
  };
}
