import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {brakingDeceleration} from './Dynamics';
export class RacingLine {
  readonly planner:LinePlanner;
  private arrows:THREE.InstancedMesh;
  private dummy=new THREE.Object3D();
  private color=new THREE.Color();
  visible=true; targetKmh=0; instruction='ACCELERATE';
  constructor(private track:Track,scene:THREE.Scene){
    this.planner=new LinePlanner(track);
    const shape=new THREE.Shape();shape.moveTo(-.64,-.85);shape.lineTo(0,-.25);shape.lineTo(.64,-.85);shape.lineTo(.64,-.28);shape.lineTo(0,.5);shape.lineTo(-.64,-.28);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1,steps:1});geometry.rotateX(Math.PI/2);
    const material=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x061006,emissiveIntensity:.25,roughness:.35,metalness:.1});
    this.arrows=new THREE.InstancedMesh(geometry,material,80);this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.arrows.frustumCulled=false;scene.add(this.arrows);
  }
  toggle(){this.visible=!this.visible;}
  update(vehicle:Vehicle){
    this.arrows.visible=this.visible;
    const allowed=this.planner.advice(vehicle.progress,vehicle.speed,vehicle.offRoad);
    this.targetKmh=Math.round(allowed*3.6);
    // Hysteresis prevents alternating brake/accelerate prompts near the limit.
    const threshold=this.instruction==='BRAKE'?3:9;
    this.instruction=vehicle.kmh>this.targetKmh+threshold?'BRAKE':vehicle.kmh>this.targetKmh-10?'HOLD':'ACCELERATE';
    if(!this.visible)return;
    // World-anchored markers don't slide along the asphalt when driving.
    const step=2.6/this.track.length,start=Math.ceil(vehicle.progress/step)*step;
    for(let i=0;i<80;i++){
      const t=start+i*step,p=this.planner.point(t),q=this.planner.point(t+.001);
      const distance=i*2.6,limit=this.planner.cornerLimit(t);
      const brakingDistance=Math.max(0,(vehicle.speed*vehicle.speed-limit*limit)/(2*brakingDeceleration(vehicle.speed)));
      const deficit=vehicle.speed-limit;
      const needsBrake=deficit>2.5&&distance<brakingDistance+vehicle.speed*.22;
      this.color.setHex(needsBrake?0xff3025:deficit>0&&distance<brakingDistance+30?0xffd728:0x45ff34);
      this.dummy.position.set(p.x,.27,p.z);this.dummy.rotation.set(0,Math.atan2(q.x-p.x,q.z-p.z),0);
      const scale=1-.4*Math.max(0,(i-55)/25);this.dummy.scale.set(scale,1,scale);this.dummy.updateMatrix();
      this.arrows.setMatrixAt(i,this.dummy.matrix);this.arrows.setColorAt(i,this.color);
    }
    this.arrows.instanceMatrix.needsUpdate=true;if(this.arrows.instanceColor)this.arrows.instanceColor.needsUpdate=true;
  }
}
