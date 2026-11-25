import course from './course.json' with {type:'json'};
import {ROUTES} from './routes.mjs';
export {ROUTES};

export const mod=(x,n)=>(x%n+n)%n;

// Every consumer, including tires, guardrails, the camera and mesh builders,
// samples the same closed Catmull–Rom spline at the same distance.
function coefficients(points) {
  const n=points.length;
  return points.map((p,i)=>{
    const prev=points[mod(i-1,n)],next=points[(i+1)%n],after=points[(i+2)%n];
    return ['x','y','z'].map(axis=>{
      const a=p[axis],b=next[axis],m=(b-prev[axis])*.5,n=(after[axis]-a)*.5;
      return [a,m,3*(b-a)-2*m-n,2*(a-b)+m+n];
    });
  });
}
function value(c,t){return ((c[3]*t+c[2])*t+c[1])*t+c[0];}
function deriv(c,t){return (3*c[3]*t+2*c[2])*t+c[1];}

function surveyPoints() {
  // Suppress short-wave GPS heading noise in the surveyed Nürburgring trace.
  const n=course.points.length;
  return course.points.map((_,i)=>{
    const p={x:0,y:0,z:0};
    for(let k=-2;k<=2;k++){
      const q=course.points[mod(i+k,n)],w=[1,4,6,4,1][k+2]/16;
      p.x+=q[0]*w;p.y+=q[1]*w;p.z+=q[2]*w;
    }
    return p;
  });
}

function routePoints(route) {
  const knots=route.knots.map(([x,z])=>({x,y:0,z}));
  const curves=coefficients(knots);
  // Resample the drawn outline by horizontal arc length. Uniform knot time
  // would make cars surge around tight corners and crawl along long straights.
  const outline=[{x:knots[0].x,z:knots[0].z,s:0}];
  for(const [cx,,cz] of curves){
    for(let j=1;j<=80;j++){
      const x=value(cx,j/80),z=value(cz,j/80),prev=outline.at(-1);
      outline.push({x,z,s:prev.s+Math.hypot(x-prev.x,z-prev.z)});
    }
  }
  const scale=route.length/outline.at(-1).s;
  const count=Math.ceil(route.length/8),heights=route.heights;
  let edge=1,h=1;
  return Array.from({length:count},(_,i)=>{
    const s=i/count*route.length,drawn=s/scale;
    while(edge<outline.length-1&&outline[edge].s<drawn)edge++;
    const from=outline[edge-1],to=outline[edge],f=(drawn-from.s)/(to.s-from.s);
    while(h<heights.length-1&&heights[h][0]<s)h++;
    const [s0,y0]=heights[h-1],[s1,y1]=heights[h],t=(s-s0)/(s1-s0);
    return {x:(from.x+(to.x-from.x)*f)*scale,
      y:y0+(y1-y0)*t*t*(3-2*t),z:(from.z+(to.z-from.z)*f)*scale};
  });
}

const tracks=new Map();
export let activeRouteId,LENGTH,N,STEP,pts;
let spline;
export function selectTrack(id) {
  const route=Object.hasOwn(ROUTES,id)?ROUTES[id]:ROUTES.nord;
  if(activeRouteId===route.id)return route;
  if(!tracks.has(route.id)){
    const points=route.id==='nord'?surveyPoints():routePoints(route);
    tracks.set(route.id,{points,spline:coefficients(points)});
  }
  const track=tracks.get(route.id);
  activeRouteId=route.id;LENGTH=route.length;pts=track.points;
  N=pts.length;STEP=LENGTH/N;spline=track.spline;
  return route;
}
selectTrack('nord');

export function sample(s){
  const f=mod(s,LENGTH)/STEP,i=Math.floor(f),t=f-i,[x,y,z]=spline[i%N];
  const dx=deriv(x,t),dz=deriv(z,t),l=Math.hypot(dx,dz)||STEP;
  return {x:value(x,t),y:value(y,t),z:value(z,t),tx:dx/l,tz:dz/l,grade:deriv(y,t)/l};
}
export function curvature(s,span=11){
  const a=sample(s-span),b=sample(s+span);
  return Math.atan2(a.tx*b.tz-a.tz*b.tx,a.tx*b.tx+a.tz*b.tz)/(2*span);
}
