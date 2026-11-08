import * as THREE from 'three';
import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';
import type {Vehicle} from './Vehicle';
import {HANDLING,steeringLock,cornerSpeed,brakingDeceleration} from './Dynamics';

/** Out-lap controls use the same drivetrain and body integration as the player. */
export class FlyingStart {
 readonly runIn:number;private points:THREE.Vector3[];private limits:Float64Array;
 constructor(private track:Track,planner:LinePlanner){
  const count=Math.ceil(track.length/4);this.points=Array.from({length:count},(_,i)=>track.roadPoint(i/count));
  // Smooth small centreline kinks without moving the run-in outside the road.
  const raw=this.points;this.points=raw.map((base,i)=>{
   const t=i/count;
   const smoothed=new THREE.Vector3();let total=0;
   for(let j=-16;j<=16;j++){const w=Math.exp(-.5*(j/8)**2);smoothed.addScaledVector(raw[(i+j+count)%count],w);total+=w;}
   smoothed.divideScalar(total).sub(base);const length=smoothed.length();if(length>.0001)smoothed.multiplyScalar(2.4*Math.tanh(length/2.4)/length);
   const candidate=base.clone().add(smoothed),center=track.point(t),normal=track.normal(t),bounds=track.drivingBounds(t,6);
   const offset=candidate.clone().sub(center).dot(normal);candidate.addScaledVector(normal,THREE.MathUtils.clamp(offset,bounds.min,bounds.max)-offset);return candidate;
  });
  this.limits=new Float64Array(count);const distances=new Float64Array(count);
  for(let i=0;i<count;i++){const a=this.points[(i+count-1)%count],b=this.points[i],c=this.points[(i+1)%count];distances[i]=b.distanceTo(c);const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.001,a.distanceTo(b)*b.distanceTo(c)*c.distanceTo(a));this.limits[i]=cornerSpeed(curvature/.9);}
  // Propagate corner braking needs upstream; straight-line speed comes from Vehicle.drive.
  for(let pass=0;pass<3;pass++)for(let i=count-1;i>=0;i--){const next=(i+1)%count,v=this.limits[next];this.limits[i]=Math.min(this.limits[i],Math.sqrt(v*v+2*brakingDeceleration(v)*.65*distances[i]));}
  const last=Math.max(...planner.apices.map(a=>a.progress).filter(t=>t<.985),.75);
  const base=Math.min(track.length*.4,Math.max(600,(1-last)*track.length+350));let runIn=base;
  for(let extra=0;extra<=400;extra+=20){const distance=base+extra;if(distance>track.length*.45)break;const t=-distance/track.length,a=this.point(t).sub(this.point(t-20/track.length)),b=this.point(t+20/track.length).sub(this.point(t));if(a.angleTo(b)<.03){runIn=distance;break;}}
  this.runIn=runIn;
 }
 private point(t:number){const f=((t%1+1)%1)*this.points.length,i=Math.floor(f);return this.points[i].clone().lerp(this.points[(i+1)%this.points.length],f-i);}
 private target(t:number){const f=((t%1+1)%1)*this.limits.length,i=Math.floor(f);return THREE.MathUtils.lerp(this.limits[i],this.limits[(i+1)%this.limits.length],f-i);}
 stage(car:Vehicle,offset=0){
  const distance=(-this.runIn+offset)/this.track.length;car.resetAt(distance);
  car.position.copy(this.point(car.progress));
  const forward=this.point(car.progress+2/this.track.length).sub(this.point(car.progress-2/this.track.length));car.heading=Math.atan2(forward.x,forward.z);
  car.speed=Math.min(70,this.target(car.progress)*.85);
  const mode=car.transmission.mode;car.transmission.setMode('auto',car.speed);car.transmission.setMode(mode,car.speed);car.sync();
 }
 drive(car:Vehicle,dt:number,traffic:readonly {car:Vehicle;distance:number;speed:number}[]=[]){
  const look=THREE.MathUtils.clamp(7+car.speed*.3,9,26),to=this.point(car.progress+look/this.track.length).sub(car.position);
  const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
  const slip=Math.atan2(car.lateralSpeed,Math.max(8,car.speed)),counter=Math.sign(slip)*Math.max(0,Math.abs(slip)-.04)*.8;
  const steer=THREE.MathUtils.clamp((angle-car.yawRate*.018+counter)/steeringLock(car.speed,car.gripScale),-1,1);
  let target=this.target(car.progress);
  for(const other of traffic){const gap=(other.distance-car.distance)*this.track.length;if(other.car!==car&&gap>0&&gap<80)target=Math.min(target,Math.max(0,other.speed+(gap-12)*.7));}
  const difference=target-car.speed;
  const boost=car.distance*this.track.length> -310&&target>85&&car.speed>30&&Math.abs(error)<.08;
  // Preserve the selected mode and live gearbox state for a continuous handoff.
  const mode=car.transmission.mode;car.transmission.mode='auto';
  try{car.drive(dt,{steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1),boost});}finally{car.transmission.mode=mode;car.transmission.sample.mode=mode;}
 }
}
