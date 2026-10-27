import * as THREE from 'three';

/** Static scenery shadows remain in a stable world volume until it needs moving. */
export class ShadowBudget {
  private position=new THREE.Vector3(Infinity,Infinity,Infinity);private light=new THREE.Vector3();private invalid=true;
  invalidate(){this.invalid=true;}
  shouldRefresh(position:THREE.Vector3,light:THREE.Vector3,dynamic:boolean){
    if(dynamic||this.invalid||position.distanceToSquared(this.position)>=64||light.distanceToSquared(this.light)>.001){
      this.position.copy(position);this.light.copy(light);this.invalid=false;return true;
    }return false;
  }
}
