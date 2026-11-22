// All contact tests use the same world-space heading and centre as the rendered car.
// The small clearance includes mirror tips, suspension movement and interpolation.
const HALF_LENGTH = 2.56, HALF_WIDTH = 1.17;
const radius = (b, x, z) => b.length * Math.abs(b.fx*x + b.fz*z)
                            + b.width * Math.abs(b.rx*x + b.rz*z);

export function footprint(sample, car, length=HALF_LENGTH, width=HALF_WIDTH) {
  const p=sample(car.s), c=Math.cos(car.h||0), s=Math.sin(car.h||0);
  const fx=p.tx*c-p.tz*s, fz=p.tz*c+p.tx*s;
  return {x:p.x-p.tz*car.lane, z:p.z+p.tx*car.lane, y:p.y??0, fx, fz, rx:-fz, rz:fx,
    length, width, tx:p.tx, tz:p.tz};
}

export function contact(a,b) {
  const dx=b.x-a.x, dz=b.z-a.z;
  if (dx*dx+dz*dz>33 || Math.abs(a.y-b.y)>2.4) return null;
  let depth=Infinity, nx=0, nz=0;
  for (const [x,z] of [[a.fx,a.fz],[a.rx,a.rz],[b.fx,b.fz],[b.rx,b.rz]]) {
    const delta=dx*x+dz*z, overlap=radius(a,x,z)+radius(b,x,z)-Math.abs(delta);
    if (overlap<=0) return null;
    if (overlap<depth) {depth=overlap; const sign=delta<0?-1:1; nx=sign*x; nz=sign*z;}
  }
  return {depth,nx,nz};
}

export function createContacts(sample,step,lap,posts=[]) {
  const rails=new Map();
  const index=s=>((Math.floor(s/step)%Math.round(lap/step))+Math.round(lap/step))%Math.round(lap/step);
  function rail(i,side) {
    const key=2*i+(side>0?1:0);
    if (!rails.has(key)) {
      const a=sample(i*step), b=sample((i+1)*step), lane=side*8.81;
      const x=a.x-a.tz*lane, z=a.z+a.tx*lane;
      const dx=b.x-b.tz*lane-x, dz=b.z+b.tx*lane-z, len=Math.hypot(dx,dz);
      rails.set(key,{x,z,dx:dx/len,dz:dz/len,len});
    }
    return rails.get(key);
  }
  const fixtures=posts.map(p=>({...p,box:footprint(sample,p,p.length,p.width)}));
  function adjust(car,b,nx,nz,distance,velocity) {
    // A metre along the racing line covers a different angle at the inside of a bend.
    const a=sample(car.s-.10), c=sample(car.s+.10);
    const scale=Math.max(.45,(b.tx*(c.x-a.x-(c.tz-a.tz)*car.lane)+b.tz*(c.z-a.z+(c.tx-a.tx)*car.lane))/.20);
    const forward=(nx*b.tx+nz*b.tz)/scale, sideways=-nx*b.tz+nz*b.tx;
    car.s+=distance*forward; car.lane+=distance*sideways;
    car.v=Math.max(0,Math.min(76,car.v+velocity*forward));
    car.slip+=velocity*sideways;
  }
  const speed=(car,b,nx,nz)=>(nx*b.tx+nz*b.tz)*car.v*Math.cos(car.h||0)+(-nx*b.tz+nz*b.tx)*car.slip;
  return function resolve(cars,sprint=true) {
    let touched=false, wall=false;
    const boxes=cars.map(c=>footprint(sample,c));
    for(let pass=0;pass<32;pass++) {
      let deepest=0;
      for(let i=0;i<cars.length;i++) {
        const car=cars[i];
        function against(nx,nz,depth) {
          const b=boxes[i], approach=Math.min(0,speed(car,b,nx,nz));
          adjust(car,b,nx,nz,depth+.001,-approach);
          boxes[i]=footprint(sample,car); deepest=Math.max(deepest,depth);
          if(i===0) wall=true;
        }
        if(Math.abs(car.lane)>4.9) {
          const side=Math.sign(car.lane);
          for(const offset of [-step,0,step]) {
            const w=rail(index(car.s+offset),side), b=boxes[i], x=b.x-w.x,z=b.z-w.z;
            const along=x*w.dx+z*w.dz, ext=radius(b,w.dx,w.dz);
            if(along+ext<0 || along-ext>w.len) continue;
            const nx=side*w.dz,nz=-side*w.dx, depth=radius(b,nx,nz)-(x*nx+z*nz);
            if(depth>0) against(nx,nz,depth);
          }
          for(const post of fixtures) {
            if(post.sprintOnly&&!sprint) continue;
            const hit=contact(boxes[i],post.box);
            if(hit) against(-hit.nx,-hit.nz,hit.depth);
          }
        }
        for(let j=0;j<i;j++) {
          const a=boxes[i],b=boxes[j],hit=contact(a,b);
          if(!hit) continue;
          const {depth,nx,nz}=hit;
          const impulse=Math.max(0,speed(car,a,nx,nz)-speed(cars[j],b,nx,nz))*.5;
          const move=(depth+.002)*.5;
          adjust(car,a,-nx,-nz,move,impulse);
          adjust(cars[j],b,nx,nz,move,impulse);
          boxes[i]=footprint(sample,car); boxes[j]=footprint(sample,cars[j]);
          deepest=Math.max(deepest,depth); if(j===0) touched=true;
        }
      }
      if(deepest<.001) break;
    }
    return {touched,wall};
  };
}
