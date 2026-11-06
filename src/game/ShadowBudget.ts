import * as THREE from 'three';

/** Static scenery shadows remain in a stable world volume until it needs moving. */
export class ShadowBudget {
  private position=new THREE.Vector3(Infinity,Infinity,Infinity);private light=new THREE.Vector3();private invalid=true;private age=0;
  invalidate(){this.invalid=true;}
  shouldRefresh(position:THREE.Vector3,light:THREE.Vector3,dynamic:boolean,dt=1/60){
    this.age+=Math.max(0,dt);
    if(dynamic&&this.age+1e-8>=1/60||this.invalid||position.distanceToSquared(this.position)>=64||light.distanceToSquared(this.light)>.001){
      this.position.copy(position);this.light.copy(light);this.invalid=false;this.age=Math.max(0,Math.min(1/60,this.age-1/60));return true;
    }return false;
  }
}
