import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surfaceMaps} from './SurfaceTextures';
import {createTireGeometry,createTireLetteringGeometry} from './TireGeometry';
export interface CarVisual {group:THREE.Group;frontWheels:THREE.Group[];tires:THREE.Mesh[];chassis:THREE.Group;contactShadow:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>}
let sidewallMaterial:THREE.MeshStandardMaterial|undefined;
let contactMap:THREE.DataTexture|undefined;
function contactShadowMap(){
  if(contactMap)return contactMap;const w=32,h=64,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,dx=(x+.5)/w*2-1,dz=(y+.5)/h*2-1;data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.exp(-3*(dx**4+dz**4))*Math.max(0,1-dx*dx)*Math.max(0,1-dz*dz)*255;}
  contactMap=new THREE.DataTexture(data,w,h);contactMap.minFilter=contactMap.magFilter=THREE.LinearFilter;contactMap.needsUpdate=true;return contactMap;
}
function tireLettering(){
  if(sidewallMaterial)return sidewallMaterial;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,256,256);ctx.translate(128,128);
  for(const angle of [0,Math.PI]){ctx.save();ctx.rotate(angle);ctx.fillStyle='#f3d26d';ctx.font='bold 19px sans-serif';ctx.textAlign='center';ctx.fillText('APEX',0,-99);ctx.font='9px sans-serif';ctx.fillText('SOFT · SLICK',0,-82);ctx.restore();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return sidewallMaterial=new THREE.MeshStandardMaterial({map,alphaTest:.35,side:THREE.DoubleSide,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
}
export function createCar(color:number):CarVisual {
  const group=new THREE.Group(),chassis=new THREE.Group();group.add(chassis);
  const carbon=new THREE.MeshPhysicalMaterial({...surfaceMaps('carbon'),color:0xd0d5dd,roughness:.65,metalness:.15,clearcoat:.3,clearcoatRoughness:.25,bumpScale:.002});
  const paint=new THREE.MeshPhysicalMaterial({color,roughness:.24,metalness:.55,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.25});
  const silver=new THREE.MeshPhysicalMaterial({color:0xc6cdd1,roughness:.22,metalness:.85,clearcoat:.65,clearcoatRoughness:.15});
  const rubber=new THREE.MeshStandardMaterial({...surfaceMaps('rubber'),color:0xa7aaad,roughness:.94,bumpScale:.001});
  const accent=new THREE.MeshStandardMaterial({color:0xb48b40,roughness:.58,metalness:.1});
  const inlet=new THREE.MeshStandardMaterial({color:0x080d12,roughness:.94});
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
  const stripe=addBox(chassis,.13,.015,1.65,0,.66,1.75,paint);stripe.rotation.x=-.025;
  addBox(chassis,2.15,.055,.62,0,.28,2.8,carbon);
  for(let j=0;j<3;j++)addBox(chassis,2.05-j*.10,.035,.15,0,.35+j*.065,2.62+j*.15,silver);
  for(const side of [-1,1]){
    const pod=tapered(.63,.38,2.1,.33,-.8,paint);pod.position.x=side*.66;pod.name='driver';
    const intake=addBox(chassis,.44,.16,.045,side*.64,.59,.26,inlet);intake.name='driver';
    const lip=addBox(chassis,.48,.035,.17,side*.64,.69,.23,silver);lip.name='driver';
    for(let slot=0;slot<6;slot++){const vent=addBox(chassis,.24,.014,.055,side*.71,.684,-.3-slot*.12,inlet);vent.rotation.y=side*.24;vent.name='driver';}
    const floorEdge=addBox(chassis,.085,.055,2.5,side*.86,.22,-.55,silver);floorEdge.rotation.y=side*.018;
    for(let fin=0;fin<3;fin++){const vane=addBox(chassis,.025,.18,.27,side*(.59+fin*.13),.29,.51,carbon);vane.rotation.y=side*-.25;}
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
  const airbox=addBox(chassis,.24,.24,.36,0,1.15,-.97,carbon);airbox.name='driver';
  const airInlet=addBox(chassis,.16,.14,.015,0,1.16,-.78,inlet);airInlet.name='driver';
  const camera=addBox(chassis,.48,.065,.11,0,1.33,-1.02,accent);camera.name='driver';
  const fin=addBox(chassis,.035,.29,.94,0,1.12,-1.75,paint);fin.name='driver';
  addBox(chassis,.32,.11,.16,0,.62,-2.57,inlet);
  const haloPath=[[-.48,.85,-1],[-.54,1.51,-.5],[-.5,1.62,.2],[0,1.64,.63],[.5,1.62,.2],[.54,1.51,-.5],[.48,.85,-1]];
  const halo=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPath.map(p=>new THREE.Vector3(...p as [number,number,number]))),40,.036,8,false),carbon);halo.name='driver';chassis.add(halo);
  const strut=new THREE.Mesh(new THREE.CylinderGeometry(.024,.035,Math.hypot(.96,.2),8),carbon);strut.position.set(0,1.16,.73);strut.rotation.x=Math.atan2(-.2,.96);strut.name='driver';chassis.add(strut);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.253,20,10,0,Math.PI*2,Math.PI*.36,Math.PI*.25),new THREE.MeshPhysicalMaterial({color:0x151e29,metalness:.9,roughness:.1}));visor.position.copy(helmet.position);visor.name='driver';chassis.add(visor);
  for(let i=-3;i<=3;i++)addBox(chassis,.025,.24,.55,i*.2,.27,-2.38,carbon);
  const rainLight=addBox(chassis,.14,.07,.04,0,.49,-2.69,new THREE.MeshStandardMaterial({color:0xa61109,emissive:0xff1808,emissiveIntensity:2}));rainLight.name='rain-light';
  const tires:THREE.Mesh[]=[],frontWheels:THREE.Group[]=[];
  for(const side of [-1,1])for(const front of [false,true]){
    const pivot=new THREE.Group();pivot.name='wheel-pivot';pivot.position.set(side*.91,.5,front?1.55:-1.85);group.add(pivot);if(front)frontWheels.push(pivot);
    const width=front?.34:.42,tire=new THREE.Mesh(createTireGeometry(width),rubber);pivot.add(tire);
    const label=new THREE.Mesh(createTireLetteringGeometry(tire.geometry,width,side),tireLettering());pivot.add(label);
    for(const face of [-1,1]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.315,.012,6,40),silver);ring.rotation.y=Math.PI/2;ring.position.x=face*(front?.163:.203);pivot.add(ring);
      const pieces:THREE.BufferGeometry[]=[new THREE.CylinderGeometry(.11,.11,.018,20).toNonIndexed()];
      for(let spoke=0;spoke<6;spoke++){
        const part=new THREE.BoxGeometry(.6,.028,.032).toNonIndexed();part.rotateY(spoke*Math.PI/6);pieces.push(part);
      }
      const rim=new THREE.Mesh(mergeGeometries(pieces),silver);for(const part of pieces)part.dispose();
      rim.rotation.z=Math.PI/2;rim.position.x=face*(front?.17:.21);pivot.add(rim);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.027,12),accent);hub.rotation.z=Math.PI/2;hub.position.x=face*(front?.19:.23);pivot.add(hub);
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.012,24),carbon);disc.rotation.z=Math.PI/2;disc.position.x=face*(front?.13:.17);pivot.add(disc);
    }
    // All parts rotate about the actual axle (X), including sidewall markings.
    // One mesh per material replaces the old individual rings/spokes/hubs.
    const wheelBatches=new Map<THREE.Material,THREE.BufferGeometry[]>();
    for(const child of [...pivot.children])if(child instanceof THREE.Mesh){
      child.updateMatrix();const material=child.material as THREE.Material,parts=wheelBatches.get(material)??[];
      const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geometry.applyMatrix4(child.matrix);parts.push(geometry);wheelBatches.set(material,parts);pivot.remove(child);child.geometry.dispose();
    }
    for(const [material,parts] of wheelBatches){const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();const mesh=new THREE.Mesh(geometry,material);pivot.add(mesh);tires.push(mesh);}
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
  group.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=!(child.material as THREE.Material).alphaTest;child.receiveShadow=true;}});
  const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(2.8,5.8),new THREE.MeshBasicMaterial({map:contactShadowMap(),transparent:true,opacity:.32,depthWrite:false,toneMapped:false}));contactShadow.name='contact-shadow';contactShadow.rotation.x=-Math.PI/2;contactShadow.position.set(0,.042,-.1);contactShadow.renderOrder=-1;group.add(contactShadow);
  return {group,chassis,frontWheels,tires,contactShadow};
}
