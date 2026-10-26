import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surfaceMaps} from './SurfaceTextures';
export interface CarVisual {group:THREE.Group;frontWheels:THREE.Group[];tires:THREE.Mesh[];chassis:THREE.Group}
export function createCar(color:number):CarVisual {
  const group=new THREE.Group(),chassis=new THREE.Group();group.add(chassis);
  const carbon=new THREE.MeshPhysicalMaterial({...surfaceMaps('carbon'),color:0xd0d5dd,roughness:.65,metalness:.15,clearcoat:.3,clearcoatRoughness:.25,bumpScale:.002});
  const paint=new THREE.MeshPhysicalMaterial({color,roughness:.24,metalness:.55,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.25});
  const silver=new THREE.MeshPhysicalMaterial({color:0xc6cdd1,roughness:.22,metalness:.85,clearcoat:.65,clearcoatRoughness:.15});
  const rubber=new THREE.MeshStandardMaterial({...surfaceMaps('rubber'),color:0xa7aaad,roughness:1,bumpScale:.004});
  const accent=new THREE.MeshStandardMaterial({color:0xb48b40,roughness:.58,metalness:.1});
  const addBox=(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;};
  const tapered=(wRear:number,wFront:number,length:number,height:number,z:number,mat:THREE.Material)=>{
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[],rings=10,sides=20;
    for(let ring=0;ring<=rings;ring++){
      const t=ring/rings,width=THREE.MathUtils.lerp(wRear,wFront,t)+Math.sin(t*Math.PI)*Math.min(.12,wRear*.15);
      for(let side=0;side<=sides;side++){
        const angle=side/sides*Math.PI*2;
        positions.push(Math.cos(angle)*width*.5,Math.sin(angle)*height*.5+height*.2,(t-.5)*length);uvs.push(side/sides,t);
        if(ring<rings&&side<sides){const i=ring*(sides+1)+side;indices.push(i,i+1,i+sides+1,i+1,i+sides+2,i+sides+1);}
      }
    }
    for(const end of [0,rings]){
      const center=positions.length/3;positions.push(0,height*.2,(end/rings-.5)*length);uvs.push(.5,end/rings);
      for(let side=0;side<sides;side++){const i=end*(sides+1)+side;if(end===0)indices.push(center,i+1,i);else indices.push(center,i,i+1);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,mat);m.position.set(0,.48,z);chassis.add(m);return m;
  };
  addBox(chassis,1.7,.1,4.8,0,.18,-.1,carbon);
  const shell=tapered(1.25,.56,3.25,.43,-.2,paint);shell.name='driver';
  const nose=tapered(.62,.22,2.4,.16,1.65,silver);nose.position.y=.56;
  addBox(chassis,2.15,.055,.62,0,.28,2.8,carbon);
  for(let j=0;j<3;j++)addBox(chassis,2.05-j*.10,.035,.15,0,.35+j*.065,2.62+j*.15,silver);
  for(const side of [-1,1]){
    const pod=tapered(.63,.38,2.1,.33,-.8,paint);pod.position.x=side*.66;pod.name='driver';
    addBox(chassis,.06,.45,.8,side*1.06,.42,2.8,accent);
    addBox(chassis,.055,.65,.7,side*1.05,1.02,-2.4,carbon);
    for(const z of [-1.55,1.55])for(const offset of [-.38,.38]){
      const a=new THREE.Vector3(side*.35,.48,z+offset),b=new THREE.Vector3(side*.88,.5,z);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,a.distanceTo(b),8),carbon);arm.position.copy(a).add(b).multiplyScalar(.5);arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());chassis.add(arm);
    }
  }
  for(const side of [-1,1])addBox(chassis,.32,.16,.06,side*.66,.65,.28,carbon);
  addBox(chassis,2.15,.1,.7,0,1.3,-2.4,carbon);addBox(chassis,2.1,.07,.4,0,1.15,-2.35,silver);
  const seat=new THREE.Mesh(new THREE.SphereGeometry(.49,24,16),carbon);seat.scale.set(.9,.45,1.6);seat.position.set(0,.77,-.45);seat.name='driver';chassis.add(seat);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.25,24,16),accent);helmet.position.set(0,1.02,-.45);helmet.name='driver';chassis.add(helmet);
  const top=new THREE.Mesh(new THREE.SphereGeometry(.6,24,16),paint);top.scale.set(.6,.7,1.5);top.position.set(0,.8,-1.2);top.name='driver';chassis.add(top);
  const haloPath=[[-.48,.85,-1],[-.52,1.31,-.5],[-.48,1.34,.2],[0,1.34,.5],[.48,1.34,.2],[.52,1.31,-.5],[.48,.85,-1]];
  const halo=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPath.map(p=>new THREE.Vector3(...p as [number,number,number]))),40,.036,8,false),carbon);halo.name='driver';chassis.add(halo);
  const strut=new THREE.Mesh(new THREE.CylinderGeometry(.029,.04,.64,8),carbon);strut.position.set(0,1.04,.61);strut.rotation.x=-.32;strut.name='driver';chassis.add(strut);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.253,20,10,0,Math.PI*2,Math.PI*.36,Math.PI*.25),new THREE.MeshPhysicalMaterial({color:0x151e29,metalness:.9,roughness:.1}));visor.position.copy(helmet.position);visor.name='driver';chassis.add(visor);
  for(let i=-3;i<=3;i++)addBox(chassis,.025,.24,.55,i*.2,.27,-2.38,carbon);
  const rainLight=addBox(chassis,.14,.07,.04,0,.49,-2.69,new THREE.MeshStandardMaterial({color:0xa61109,emissive:0xff1808,emissiveIntensity:2}));rainLight.name='rain-light';
  const tires:THREE.Mesh[]=[],frontWheels:THREE.Group[]=[];
  for(const side of [-1,1])for(const front of [false,true]){
    const pivot=new THREE.Group();pivot.position.set(side*.91,.61,front?1.55:-1.85);group.add(pivot);if(front)frontWheels.push(pivot);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.61,.61,front?.34:.42,40,1),rubber);tire.rotation.z=Math.PI/2;pivot.add(tire);tires.push(tire);
    for(const face of [-1,1]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.012,6,48),accent);ring.rotation.y=Math.PI/2;ring.position.x=face*(front?.18:.22);pivot.add(ring);
      const pieces:THREE.BufferGeometry[]=[new THREE.CylinderGeometry(.21,.21,.018,24).toNonIndexed()];
      for(let spoke=0;spoke<6;spoke++){
        const part=new THREE.BoxGeometry(.42,.035,.045).toNonIndexed();part.rotateY(spoke*Math.PI/6);pieces.push(part);
      }
      const rim=new THREE.Mesh(mergeGeometries(pieces),silver);for(const part of pieces)part.dispose();
      rim.rotation.z=Math.PI/2;rim.position.x=face*(front?.185:.225);pivot.add(rim);tires.push(rim);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.027,12),accent);hub.rotation.z=Math.PI/2;hub.position.x=face*(front?.20:.24);pivot.add(hub);
    }
    const shoulder=new THREE.Mesh(new THREE.TorusGeometry(.51,.085,8,40),rubber);shoulder.rotation.y=Math.PI/2;shoulder.position.x=side*(front?.12:.16);pivot.add(shoulder);
  }
  // Consolidate static bodywork by material/visibility, retaining the cockpit
  // hiding rules and dynamic wheel pivots while reducing draw calls per car.
  const batches=new Map<string,{material:THREE.Material;hiddenInCockpit:boolean;parts:THREE.BufferGeometry[]}>();
  for(const child of [...chassis.children])if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
    child.updateMatrix();const hidden=child.name==='driver',key=child.material.uuid+hidden;
    if(!batches.has(key))batches.set(key,{material:child.material,hiddenInCockpit:hidden,parts:[]});
    const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geometry.applyMatrix4(child.matrix);
    batches.get(key)!.parts.push(geometry);chassis.remove(child);child.geometry.dispose();
  }
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.parts);for(const part of batch.parts)part.dispose();
    const body=new THREE.Mesh(geometry,batch.material);body.name=batch.hiddenInCockpit?'driver':'bodywork';body.castShadow=true;body.receiveShadow=true;chassis.add(body);
  }
  group.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}});
  return {group,chassis,frontWheels,tires};
}
