import {MathUtils} from 'three';

const smooth=MathUtils.smoothstep;

// The roof stays high over the rear passengers, then turns down towards the
// hatch. The upper glass and bumper draw in around the wide rear-wheel stance.
const roofStations=[
 [-2.50,-2.50],[-2.32,-2.33],[-1.98,-2.128],[-1.65,-1.89],[-1.2,-1.59],
 [-.72,-1.13],[-.28,-.55],[.15,.002],[.62,.57],[1.08,1.08]
];
export function suvPoint(x,y,z){
 let roofZ=z;
 for(let i=1;i<roofStations.length;i++){
   const [s0,t0]=roofStations[i-1],[s1,t1]=roofStations[i];
   if(z<s0||z>s1)continue;
   const prev=roofStations[Math.max(0,i-2)],next=roofStations[Math.min(roofStations.length-1,i+1)];
   const t=(z-s0)/(s1-s0),u=1-t;
   const m0=(t1-prev[1])/(s1-prev[0]),m1=(next[1]-t0)/(next[0]-s0);
   roofZ=(1+2*t)*u*u*t0+t*u*u*(s1-s0)*m0+t*t*(3-2*t)*t1-t*t*u*(s1-s0)*m1;break;
 }
 const upperBody=smooth(y,.70,1.19),rearQuarter=smooth(-z,.42,1.72);
 const shoulder=.061*rearQuarter*smooth(y,.56,1.0)*(1-smooth(y,1.19,1.44));
 const clearance=.067*smooth(y,.16,.95)+.055*smooth(y,.92,1.40);
 const hip=.032*Math.exp(-((Math.abs(z)-1.50)**2)/.19)*smooth(y,.35,.78)*(1-smooth(y,1.08,1.35));
 const end=smooth(-z,1.54,2.43);
 const glassTaper=.074*rearQuarter*smooth(y,.87,1.27);
 const hatchTaper=end*(.071+.031*(1-smooth(y,.41,.76)));
 const crownDrop=.043*rearQuarter*smooth(y,.92,1.27);
 return [x*(1.018+hip-glassTaper-hatchTaper),y+clearance+shoulder-crownDrop,
   MathUtils.lerp(z,roofZ,upperBody)*1.0036];
}
