import * as THREE from 'three';
import {Input} from './Input';
import {Track} from './Track';
import {Controls,integrateBody} from './Dynamics';
import {createCar,CarVisual} from './CarModel';
import {TIRE_RADIUS} from './TireGeometry';
export class Vehicle {
  raceLaunchScale?:number;raceSpeedCap?:number;raceCruiseCap?:number;racePowerAssist?:number;
  private readonly baseGrip:number;raceGripAssist?:number;
  get gripScale(){return Math.min(1.5,this.baseGrip*(this.raceGripAssist??1));}
  readonly powerScale:number;
  readonly position=new THREE.Vector3();readonly group:THREE.Group;
  private model:CarVisual;
  speed=0;lateralSpeed=0;yawRate=0;heading=0;steer=0;steerAngle=0;progress=0;lap=1;offRoad=false;
  acceleration=0;lateralAcceleration=0;gripUsage=0;
  distance=0;throttle=0;brake=0;boost=100;boosting=false;
  private lastProgress=0;
  constructor(private track:Track,scene:THREE.Scene,color=0x8c969f,performance={grip:1,power:1}){
    this.baseGrip=THREE.MathUtils.clamp(performance.grip,1,1.5);
    this.powerScale=THREE.MathUtils.clamp(performance.power,1,1.5);
    this.model=createCar(color);this.group=this.model.group;scene.add(this.group);this.reset();
  }
  reset(){this.resetAt(0,0);this.boost=100;}
  resetAt(progress:number,lane=0){
    this.progress=((progress%1)+1)%1;this.lastProgress=this.progress;this.distance=progress;this.lap=1+Math.max(0,Math.floor(progress));
    this.position.copy(this.track.point(progress)).addScaledVector(this.track.normal(progress),lane);
    const t=this.track.tangent(progress);this.heading=Math.atan2(t.x,t.z);
    this.speed=0;this.lateralSpeed=0;this.yawRate=0;this.steer=0;this.steerAngle=0;this.throttle=0;this.brake=0;this.boosting=false;this.offRoad=false;this.acceleration=0;this.lateralAcceleration=0;this.gripUsage=0;this.sync();
  }
  recover(){const distance=this.distance,lap=this.lap;this.resetAt(this.progress);this.distance=distance;this.lap=lap;}
  update(dt:number,input:Input){
    const brake=input.down('KeyS','ArrowDown')?1:0;
    this.drive(dt,{throttle:!brake&&input.down('KeyW','ArrowUp')?1:0,brake,steer:(input.down('KeyA','ArrowLeft')?1:0)-(input.down('KeyD','ArrowRight')?1:0),boost:!brake&&input.down('ShiftLeft','ShiftRight'),keyboard:true});
  }
  drive(dt:number,control:Controls){
    this.throttle=control.throttle;this.brake=control.brake;this.boosting=!!control.boost&&this.boost>1&&control.throttle>0&&control.brake===0&&!this.offRoad;
    this.boost=THREE.MathUtils.clamp(this.boost+(this.boosting?-24:8)*dt,0,100);
    let remaining=dt;while(remaining>1e-8){const step=Math.min(1/120,remaining);integrateBody(this,{...control,boost:this.boosting},step);remaining-=step;}
    this.progress=this.track.nearestProgress(this.position,this.progress);
    const center=this.track.point(this.progress),offset=this.position.clone().sub(center);const lateral=offset.length();this.offRoad=lateral>9.7;
    if(lateral>14.55){const normal=offset.normalize();this.position.copy(center).addScaledVector(normal,14.55);const velocity=this.velocity,closing=velocity.dot(normal);if(closing>0)this.setVelocity(velocity.addScaledVector(normal,-closing*1.22));this.yawRate*=.6;}
    let delta=this.progress-this.lastProgress;if(delta<-.5)delta+=1;if(delta>.5)delta-=1;this.distance+=delta;this.lastProgress=this.progress;this.lap=1+Math.max(0,Math.floor(this.distance+1e-6));
    this.sync(dt);
  }
  get velocity(){return new THREE.Vector3(Math.sin(this.heading)*this.speed+Math.cos(this.heading)*this.lateralSpeed,0,Math.cos(this.heading)*this.speed-Math.sin(this.heading)*this.lateralSpeed);}
  setVelocity(v:THREE.Vector3){this.speed=Math.max(0,v.x*Math.sin(this.heading)+v.z*Math.cos(this.heading));this.lateralSpeed=v.x*Math.cos(this.heading)-v.z*Math.sin(this.heading);}
  sync(dt=0){
    this.group.position.copy(this.position);this.group.rotation.y=this.heading;
    this.model.chassis.rotation.x=THREE.MathUtils.damp(this.model.chassis.rotation.x,-this.acceleration*.0014,9,dt);
    this.model.chassis.rotation.z=THREE.MathUtils.damp(this.model.chassis.rotation.z,this.lateralAcceleration*.0015,9,dt);
    for(const wheel of this.model.frontWheels)wheel.rotation.y=this.steerAngle;
    for(const tire of this.model.tires)tire.rotateX(this.speed*dt/TIRE_RADIUS);
  }
  present(bounce=0){this.model.chassis.position.y=bounce;}
  get kmh(){return Math.round(this.speed*3.6);}
}
/** Capsule-shaped bodies: equal-mass normal impulse plus tangential friction. */
export function resolveCollision(a:Vehicle,b:Vehicle){
  let closest=Infinity,pa=new THREE.Vector3(),pb=new THREE.Vector3();
  const fa=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading)),fb=new THREE.Vector3(Math.sin(b.heading),0,Math.cos(b.heading));
  for(const da of [-1.45,0,1.45])for(const db of [-1.45,0,1.45]){const x=a.position.clone().addScaledVector(fa,da),y=b.position.clone().addScaledVector(fb,db),d=x.distanceToSquared(y);if(d<closest){closest=d;pa=x;pb=y;}}
  const distance=Math.sqrt(closest),radius=2.15;if(distance>=radius)return false;
  const normal=distance>.001?pa.clone().sub(pb).divideScalar(distance):new THREE.Vector3(1,0,0),depth=radius-distance;
  a.position.addScaledVector(normal,depth*.51);b.position.addScaledVector(normal,-depth*.51);
  const va=a.velocity,vb=b.velocity,closing=va.clone().sub(vb).dot(normal);
  if(closing<0){const impulse=-closing*.57;va.addScaledVector(normal,impulse);vb.addScaledVector(normal,-impulse);
    const tangent=va.clone().sub(vb);tangent.addScaledVector(normal,-tangent.dot(normal));
    if(tangent.lengthSq()>.0001){tangent.normalize();const friction=THREE.MathUtils.clamp(-va.clone().sub(vb).dot(tangent)*.5,-impulse*.3,impulse*.3);va.addScaledVector(tangent,friction);vb.addScaledVector(tangent,-friction);}
    a.setVelocity(va);b.setVelocity(vb);
    const leverA=pa.clone().sub(a.position),leverB=pb.clone().sub(b.position);a.yawRate+=THREE.MathUtils.clamp((leverA.z*normal.x-leverA.x*normal.z)*impulse*.035,-.4,.4);b.yawRate-=THREE.MathUtils.clamp((leverB.z*normal.x-leverB.x*normal.z)*impulse*.035,-.4,.4);}
  a.sync();b.sync();return true;
}
