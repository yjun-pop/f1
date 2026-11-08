import * as THREE from 'three';
import type {Vehicle} from './Vehicle';
/** One shared render pose keeps the cockpit attached between physics ticks. */
export class VehiclePose {
 readonly position=new THREE.Vector3();heading=0;
 private previous=new THREE.Vector3();private previousHeading=0;
 capture(car:Vehicle){this.previous.copy(car.position);this.previousHeading=car.heading;}
 present(car:Vehicle,alpha:number){
  const fraction=this.previous.distanceToSquared(car.position)>900?1:THREE.MathUtils.clamp(alpha,0,1);
  this.position.copy(this.previous).lerp(car.position,fraction);
  const turn=Math.atan2(Math.sin(car.heading-this.previousHeading),Math.cos(car.heading-this.previousHeading));
  this.heading=this.previousHeading+turn*fraction;car.group.position.copy(this.position);car.group.rotation.y=this.heading;return this;
 }
}
