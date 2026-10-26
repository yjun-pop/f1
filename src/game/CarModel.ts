import * as THREE from 'three';
export interface CarVisual {group:THREE.Group;frontWheels:THREE.Group[];tires:THREE.Mesh[];chassis:THREE.Group}
export function createCar(color:number):CarVisual {
  const group=new THREE.Group(),chassis=new THREE.Group();group.add(chassis);
  const carbon=new THREE.MeshStandardMaterial({color:0x111820,roughness:.48,metalness:.35});
  const paint=new THREE.MeshStandardMaterial({color,roughness:.27,metalness:.6});
  const silver=new THREE.MeshStandardMaterial({color:0xc6cdd1,roughness:.3,metalness:.78});
  const rubber=new THREE.MeshStandardMaterial({color:0x0b0e12,roughness:.92});
  const accent=new THREE.MeshStandardMaterial({color:0xca253e,roughness:.35,metalness:.4});
  const addBox=(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;};
  const tapered=(wRear:number,wFront:number,length:number,height:number,z:number,mat:THREE.Material)=>{
    const shape=new THREE.Shape();shape.moveTo(-wRear/2,-length/2);shape.lineTo(wRear/2,-length/2);shape.lineTo(wFront/2,length/2);shape.lineTo(-wFront/2,length/2);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelThickness:.07,bevelSize:.07,bevelSegments:3,steps:1});geo.rotateX(Math.PI/2);
    const m=new THREE.Mesh(geo,mat);m.position.set(0,.48,z);chassis.add(m);return m;
  };
  addBox(chassis,1.7,.1,4.8,0,.18,-.1,carbon);
  const shell=tapered(1.25,.56,3.25,.43,-.2,paint);shell.name='driver';
  const nose=tapered(.62,.22,2.65,.16,1.85,silver);nose.position.y=.56;
  addBox(chassis,2.65,.08,.65,0,.28,3.05,carbon);
  for(let j=0;j<3;j++)addBox(chassis,2.4-j*.13,.045,.13,0,.38+j*.075,2.86+j*.15,silver);
  for(const side of [-1,1]){
    const pod=tapered(.63,.38,2.1,.33,-.8,paint);pod.position.x=side*.77;pod.name='driver';
    addBox(chassis,.06,.45,.8,side*1.31,.45,3.02,accent);
    addBox(chassis,.055,.65,.7,side*1.05,1.02,-2.4,carbon);
    for(const z of [-1.55,1.55])for(const offset of [-.38,.38]){
      const a=new THREE.Vector3(side*.35,.48,z+offset),b=new THREE.Vector3(side*1.08,.5,z);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,a.distanceTo(b),8),carbon);arm.position.copy(a).add(b).multiplyScalar(.5);arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());chassis.add(arm);
    }
  }
  addBox(chassis,2.15,.1,.7,0,1.3,-2.4,carbon);addBox(chassis,2.1,.07,.4,0,1.15,-2.35,silver);
  const seat=new THREE.Mesh(new THREE.SphereGeometry(.49,24,16),carbon);seat.scale.set(.9,.45,1.6);seat.position.set(0,.77,-.45);seat.name='driver';chassis.add(seat);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.25,24,16),accent);helmet.position.set(0,1.02,-.45);helmet.name='driver';chassis.add(helmet);
  const top=new THREE.Mesh(new THREE.SphereGeometry(.6,24,16),paint);top.scale.set(.6,.7,1.5);top.position.set(0,.8,-1.2);top.name='driver';chassis.add(top);
  const tires:THREE.Mesh[]=[],frontWheels:THREE.Group[]=[];
  for(const side of [-1,1])for(const front of [false,true]){
    const pivot=new THREE.Group();pivot.position.set(side*1.12,.61,front?1.55:-1.85);group.add(pivot);if(front)frontWheels.push(pivot);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.61,.61,front?.41:.49,40,1),rubber);tire.rotation.z=Math.PI/2;pivot.add(tire);tires.push(tire);
    for(const face of [-1,1]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.012,6,48),accent);ring.rotation.y=Math.PI/2;ring.position.x=face*(front?.21:.25);pivot.add(ring);
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.012,16),carbon);rim.rotation.z=Math.PI/2;rim.position.x=face*(front?.217:.257);pivot.add(rim);
    }
    const shoulder=new THREE.Mesh(new THREE.TorusGeometry(.51,.085,8,40),rubber);shoulder.rotation.y=Math.PI/2;shoulder.position.x=side*(front?.12:.16);pivot.add(shoulder);
  }
  return {group,chassis,frontWheels,tires};
}
