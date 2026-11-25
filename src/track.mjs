import course from './course.json' with {type:'json'};

export const LENGTH=20832, N=course.points.length, STEP=LENGTH/N;
export const mod=(x,n)=>(x%n+n)%n;
// Remove short-wave GPS heading noise. The same centreline drives the mesh,
// suspension contacts and camera, including through the lap seam.
export const pts=course.points.map((_,i)=>{
  const p={x:0,y:0,z:0};
  for(let k=-2;k<=2;k++){const q=course.points[mod(i+k,N)],w=[1,4,6,4,1][k+2]/16;p.x+=q[0]*w;p.y+=q[1]*w;p.z+=q[2]*w;}
  return p;
});
const spline=pts.map((p,i)=>{
 const prev=pts[mod(i-1,N)],next=pts[(i+1)%N],after=pts[(i+2)%N];
 return ['x','y','z'].map(axis=>{
   const a=p[axis],b=next[axis],m=(b-prev[axis])*.5,n=(after[axis]-a)*.5;
   return [a,m,3*(b-a)-2*m-n,2*(a-b)+m+n];
 });
});
function value(c,t){return ((c[3]*t+c[2])*t+c[1])*t+c[0];}
function deriv(c,t){return (3*c[3]*t+2*c[2])*t+c[1];}
export function sample(s){
  const f=mod(s,LENGTH)/STEP,i=Math.floor(f),t=f-i,[x,y,z]=spline[i];
  const dx=deriv(x,t),dz=deriv(z,t),l=Math.hypot(dx,dz)||STEP;
  return {x:value(x,t),y:value(y,t),z:value(z,t),tx:dx/l,tz:dz/l,grade:deriv(y,t)/l};
}
export function curvature(s,span=11){
  const a=sample(s-span),b=sample(s+span);
  return Math.atan2(a.tx*b.tz-a.tz*b.tx,a.tx*b.tx+a.tz*b.tz)/(2*span);
}
