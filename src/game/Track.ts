import * as THREE from 'three';
import {surfaceMaps} from './SurfaceTextures';
import {MONZA_POINTS,MONZA_LENGTH,MONZA_SECTIONS,MONZA_ORIGIN} from './MonzaLayout';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CircuitDetails} from './CircuitDetails';
import type {GraphicsTier} from './Graphics';
import {connectKerbSegments,createKerbContacts,createKerbGeometry,kerbPaintMap,type KerbContactSegment} from './KerbGeometry';
import {createWoodland,landscapeShade} from './NaturalScenery';
import {createRoadDressing} from './RoadDressing';
import {VisualRoadCurve} from './VisualRoadCurve';
import {createTrackChunks,freezeStaticWorld} from './TrackChunks';
import {GRAPHICS_PROFILES} from './Graphics';
export const ROAD_HALF_WIDTH=10;
export class Track {
  readonly name='MONZA';readonly country='ITALY';readonly cornerCount=11;
  readonly curve:THREE.CatmullRomCurve3;readonly length:number;
  readonly group=new THREE.Group();
  readonly sections:{number:number;name:string;progress:number}[]=[];
  readonly bounds=new THREE.Box3();
  private samples:THREE.Vector3[]=[];private sampleCount=0;private kerbSegments=new Uint8Array(0);
  private kerbContacts:KerbContactSegment[][]=[];
  readonly details:CircuitDetails;
  private startBulbs:THREE.MeshStandardMaterial[]=[];
  private visualRoad:VisualRoadCurve;
  readonly surfaceGeometries=new Map<string,THREE.BufferGeometry>();
  private kerbNearby=new Uint8Array(0);
  constructor(scene:THREE.Scene){
    let raw=MONZA_POINTS.map(([x,z])=>new THREE.Vector3(x,0,z));
    // Long sparse source segments must remain straight. Densification prevents
    // Catmull-Rom tangents from pulling kilometre-long straights into arcs.
    const t1=raw.findIndex(p=>Math.abs(p.z+988.105)<8);
    if(t1>0)raw=[raw[0],...raw.slice(t1)];
    const direction=raw[1].clone().sub(raw[0]).normalize();
    raw[raw.length-1].copy(raw[0]).addScaledVector(direction,-52);
    const points:THREE.Vector3[]=[];
    for(let i=0;i<raw.length;i++){
      const p=raw[i],q=raw[(i+1)%raw.length],steps=Math.ceil(p.distanceTo(q)/6);
      for(let k=0;k<steps;k++)points.push(p.clone().lerp(q,k/steps));
    }
    this.curve=new THREE.CatmullRomCurve3(points,true,'centripetal');
    this.curve.arcLengthDivisions=24000;this.curve.updateArcLengths();
    const scale=MONZA_LENGTH/this.curve.getLength();for(const p of points)p.multiplyScalar(scale);
    this.curve.updateArcLengths();this.length=this.curve.getLength();
    this.visualRoad=new VisualRoadCurve(this.length,t=>this.point(t));
    this.sampleCount=Math.ceil(this.length/2);
    this.samples=Array.from({length:this.sampleCount},(_,i)=>this.point(i/this.sampleCount));
    this.bounds.setFromPoints(this.samples);
    for(const section of MONZA_SECTIONS){const [lon,lat]=section.coordinate;
      const p=new THREE.Vector3((lon-MONZA_ORIGIN[0])*111320*Math.cos(MONZA_ORIGIN[1]*Math.PI/180)*scale,0,-(lat-MONZA_ORIGIN[1])*111320*scale);
      let closest=0,best=Infinity;for(let i=0;i<this.sampleCount;i++){const d=this.samples[i].distanceToSquared(p);if(d<best){best=d;closest=i;}}
      this.sections.push({number:section.number,name:section.name,progress:closest/this.sampleCount});
    }
    this.buildRoad();this.buildScenery();this.buildCircuit();this.buildLighting();this.buildBrakeBoards();this.details=new CircuitDetails(this);this.details.update(this.point(0),'medium');scene.add(this.group);
    freezeStaticWorld(this.group);
  }
  updatePresentation(position:THREE.Vector3,tier:GraphicsTier){
    this.details.update(position,tier);
    const forest=this.group.getObjectByName('woodland'),profile=GRAPHICS_PROFILES[tier];
    if(forest)for(const child of forest.children){
      const mesh=child as THREE.InstancedMesh,bounds=mesh.userData.worldBounds as THREE.Sphere;
      if(!bounds)continue;const distance=bounds.center.distanceTo(position)-bounds.radius;mesh.visible=distance<profile.forestRange;
      if(mesh.userData.nearGeometry){mesh.geometry=distance<profile.forestDetail?mesh.userData.nearGeometry:mesh.userData.farGeometry;mesh.castShadow=tier==='high'||distance<85;}
    }
  }
  setStartLights(count:number){this.startBulbs.forEach((material,i)=>{const lit=i<count;material.color.setHex(lit?0xcc160a:0x190b0c);material.emissiveIntensity=lit?3:.015;});}
  point(t:number){return this.curve.getPointAt(((t%1)+1)%1);}
  tangent(t:number){return this.curve.getTangentAt(((t%1)+1)%1).normalize();}
  normal(t:number){const v=this.tangent(t);return new THREE.Vector3(-v.z,0,v.x);}
  roadPoint(t:number){return this.visualRoad.point(t);}
  roadNormal(t:number){return this.visualRoad.normal(t);}
  kerbContact(position:THREE.Vector3,heading:number,progress:number){
    const cell=Math.round(((progress%1+1)%1)*this.kerbSegments.length)%this.kerbSegments.length;
    if(!this.kerbNearby[cell]||position.distanceToSquared(this.point(progress))<5.5*5.5)return 0;
    let contact=0;
    for(const axle of [-1.8,1.8])for(const side of [-1,1]){
      const wheel=position.clone().add(new THREE.Vector3(Math.sin(heading)*axle+Math.cos(heading)*side,0,Math.cos(heading)*axle-Math.sin(heading)*side));
      const t=this.nearestProgress(wheel,progress),index=Math.round(t*this.kerbSegments.length)%this.kerbSegments.length;
      let overlap=0;
      for(let offset=-6;offset<=6;offset++)for(const segment of this.kerbContacts[(index+offset+this.kerbContacts.length)%this.kerbContacts.length]){
        if(Math.abs(segment.det)<1e-6)continue;
        const x=wheel.x-segment.x,z=wheel.z-segment.z,along=(x*segment.nz-z*segment.nx)/segment.det;
        if(along<0||along>1)continue;
        const lateral=(segment.dx*z-segment.dz*x)/segment.det;
        overlap=Math.max(overlap,Math.max(0,Math.min(lateral+.26,.7)-Math.max(lateral-.26,-.7))/.52);
      }
      contact+=overlap;
    }
    return Math.min(1,contact/2);
  }
  nextSection(progress:number){return this.sections.find(s=>s.progress>progress+.002)||this.sections[0];}
  nearestProgress(position:THREE.Vector3,guess:number){
    const origin=Math.floor(((guess%1+1)%1)*this.sampleCount);let best=guess,min=Infinity;
    for(let offset=-24;offset<=24;offset++){
      const i=(origin+offset+this.sampleCount)%this.sampleCount,j=(i+1)%this.sampleCount,p=this.samples[i],q=this.samples[j];
      const dx=q.x-p.x,dz=q.z-p.z,alpha=THREE.MathUtils.clamp(((position.x-p.x)*dx+(position.z-p.z)*dz)/Math.max(.0001,dx*dx+dz*dz),0,1);
      const distance=(position.x-p.x-alpha*dx)**2+(position.z-p.z-alpha*dz)**2;
      if(distance<min){min=distance;best=((i+alpha)/this.sampleCount)%1;}
    }return best;
  }
  private buildRoad(){
    const count=Math.ceil(this.length),positions:number[]=[],uvs:number[]=[],indices:number[]=[],colors:number[]=[];
    for(let i=0;i<=count;i++){
      const t=i/count,p=this.roadPoint(t),n=this.roadNormal(t);
      for(const side of [-1,-.55,0,.55,1]){const q=p.clone().addScaledVector(n,side*ROAD_HALF_WIDTH),shade=(.85+Math.abs(side)*.13)*landscapeShade(q.x*.6,q.z*.6);positions.push(q.x,.035,q.z);uvs.push((side+1)*ROAD_HALF_WIDTH/4,t*this.length/4);colors.push(shade,shade,shade);}
      if(i<count)for(let cross=0;cross<4;cross++){const k=i*5+cross;indices.push(k,k+1,k+5,k+1,k+6,k+5);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({...surfaceMaps('asphalt'),color:0xb9bfc4,vertexColors:true,side:THREE.DoubleSide,roughness:.94,metalness:0,bumpScale:.012});
    this.surfaceGeometries.set('asphalt-road',geometry);this.group.add(createTrackChunks(geometry,material,this.length,'asphalt-road'));
    this.group.add(createRoadDressing(this));
    for(const side of [-1,1]){const points=Array.from({length:count+1},(_,i)=>this.roadPoint(i/count).addScaledVector(this.roadNormal(i/count),side*9.6).setY(.07));this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xe4e8e9})));}
    const start=new THREE.Group();start.position.copy(this.point(0));const t=this.tangent(0);start.rotation.y=Math.atan2(t.x,t.z);
    for(let row=0;row<2;row++)for(let col=0;col<20;col++){const tile=new THREE.Mesh(new THREE.BoxGeometry(1,.025,.7),new THREE.MeshBasicMaterial({color:(row+col)%2?0x14191f:0xfaf8f0}));tile.position.set(col-9.5,.1,row*.7);start.add(tile);}this.group.add(start);
    // Physical grid boxes, rather than floating markings on the main straight.
    const lineMaterial=new THREE.LineBasicMaterial({color:0xc5cecf});
    for(let i=0;i<12;i++){const t=(i*8+14)/this.length,p=this.point(t),n=this.normal(t),f=this.tangent(t),side=i%2?1:-1;p.addScaledVector(n,side*3.3).setY(.08);const vertices=[p.clone().addScaledVector(n,-1.3).addScaledVector(f,-2.4),p.clone().addScaledVector(n,1.3).addScaledVector(f,-2.4),p.clone().addScaledVector(n,1.3).addScaledVector(f,2.4)];this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),lineMaterial));}
  }
  private buildScenery(){
    const center=this.bounds.getCenter(new THREE.Vector3());
    const ground=new THREE.PlaneGeometry(6500,6500,96,96),points=ground.getAttribute('position'),colors:number[]=[];
    for(let i=0;i<points.count;i++){const shade=landscapeShade(center.x+points.getX(i),center.z-points.getY(i));colors.push(shade,shade,.94*shade);}
    ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const grass=new THREE.Mesh(ground,new THREE.MeshStandardMaterial({...surfaceMaps('grass'),color:0xc0c8b4,vertexColors:true,roughness:1,bumpScale:.018}));grass.name='grass-terrain';grass.receiveShadow=true;grass.rotation.x=-Math.PI/2;grass.position.set(center.x,-.08,center.z);this.group.add(grass);
    this.group.add(createWoodland(this,p=>{for(let j=0;j<this.samples.length;j+=10)if(this.samples[j].distanceToSquared(p)<24*24)return false;return true;}));
  }
  private buildCircuit(){
    const dummy=new THREE.Object3D(),count=Math.ceil(this.length/3.1),barrierCount=Math.ceil(this.length/4.2);
    this.kerbSegments=new Uint8Array(count);
    for(let i=0;i<count;i++){const t=i/count;if(this.tangent(t-5/this.length).angleTo(this.tangent(t+5/this.length))>=.018)this.kerbSegments[i]=1;}
    connectKerbSegments(this.kerbSegments,this.length);this.kerbContacts=createKerbContacts(this,this.kerbSegments);
    this.kerbNearby=Uint8Array.from(this.kerbSegments,(_,i)=>{for(let j=-8;j<=8;j++)if(this.kerbSegments[(i+j+count)%count])return 1;return 0;});
    const kerbGeometry=createKerbGeometry(this,this.kerbSegments);this.surfaceGeometries.set('continuous-kerbs',kerbGeometry);
    const kerbs=createTrackChunks(kerbGeometry,new THREE.MeshStandardMaterial({map:kerbPaintMap(),roughness:.88,metalness:0}),this.length,'continuous-kerbs');
    const barriers=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,1.2,4.4),new THREE.MeshStandardMaterial({color:0x315248,roughness:.7}),barrierCount*2);let b=0;
    for(const side of [-1,1]){
      for(let i=0;i<barrierCount;i++){const t=i/barrierCount,p=this.point(t).addScaledVector(this.normal(t),side*16.2),v=this.tangent(t);dummy.position.set(p.x,.6,p.z);dummy.rotation.set(0,Math.atan2(v.x,v.z),0);dummy.updateMatrix();barriers.setMatrixAt(b++,dummy.matrix);}
    }barriers.receiveShadow=true;this.group.add(kerbs,barriers);
    const steel=new THREE.MeshStandardMaterial({color:0x263b36}),standMaterial=new THREE.MeshStandardMaterial({color:0x47545b});
    const seatMaterial=new THREE.MeshStandardMaterial({roughness:.85}),seatGeometry=new THREE.BoxGeometry(.55,.16,.55),roofMaterial=new THREE.MeshStandardMaterial({color:0xcbd6d5,roughness:.65});
    for(const t of [.007,.028,.15,.215,.35,.45,.59,.74,.9]){const p=this.point(t).addScaledVector(this.normal(t),-37),stand=new THREE.Group();stand.name='grandstand';
      const steps:THREE.BufferGeometry[]=[];
      for(let row=0;row<6;row++){const geometry=new THREE.BoxGeometry(55,.8,2.4);geometry.translate(0,row*.9+.8,row*2.1);steps.push(geometry);}
      const stepGeometry=mergeGeometries(steps);for(const geometry of steps)geometry.dispose();const terraces=new THREE.Mesh(stepGeometry,standMaterial);terraces.receiveShadow=true;stand.add(terraces);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(58,.3,17),roofMaterial);roof.position.set(0,9,5);roof.castShadow=true;roof.receiveShadow=true;stand.add(roof);
      const seats=new THREE.InstancedMesh(seatGeometry,seatMaterial,6*60),supports=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,8.5,.18),steel,8);let s=0;
      for(let row=0;row<6;row++)for(let col=0;col<60;col++){dummy.position.set(-26+col*.88,row*.9+1.29,row*2.1);dummy.rotation.set(0,0,0);dummy.updateMatrix();seats.setMatrixAt(s,dummy.matrix);seats.setColorAt(s++,new THREE.Color([0x8a3136,0xbdc6bf,0x3b675d][Math.floor(col/20)]));}
      for(let j=0;j<8;j++){dummy.position.set(-26+(j%4)*17.3,4.4,j<4?-.6:12);dummy.updateMatrix();supports.setMatrixAt(j,dummy.matrix);}stand.add(seats,supports);
      stand.position.copy(p);stand.rotation.y=Math.atan2(this.tangent(t).x,this.tangent(t).z)+Math.PI/2;this.group.add(stand);}
    const pit=new THREE.Group();pit.position.copy(this.point(.035)).addScaledVector(this.normal(.035),31);pit.rotation.y=Math.atan2(this.tangent(.035).x,this.tangent(.035).z);
    const building=new THREE.Mesh(new THREE.BoxGeometry(17,7,240),new THREE.MeshStandardMaterial({color:0xa1b0b0,roughness:.75}));building.position.y=3.5;pit.add(building);const windows=new THREE.Mesh(new THREE.BoxGeometry(17.2,1.5,225),new THREE.MeshStandardMaterial({color:0x233d4b,metalness:.5,roughness:.3}));windows.position.y=5.4;pit.add(windows);this.group.add(pit);
    const start=this.point(24/this.length),forward=this.tangent(24/this.length),gantry=new THREE.Group();gantry.name='start-gantry';
    for(const side of [-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(.5,8,.5),steel);post.position.set(side*12,4,0);gantry.add(post);}const board=new THREE.Mesh(new THREE.BoxGeometry(25,2,.65),steel);board.position.y=7;gantry.add(board);
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#143d2e';ctx.fillRect(0,0,1024,96);ctx.fillStyle='#fff';ctx.font='bold italic 56px sans-serif';ctx.textAlign='center';ctx.fillText('MONZA  /  TEMPLE OF SPEED',512,66);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(23,1.65),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}));sign.position.set(0,7,-.34);sign.rotation.y=Math.PI;gantry.add(sign);gantry.position.copy(start);gantry.rotation.y=Math.atan2(forward.x,forward.z);this.group.add(gantry);
    // Real lamps face back towards the grid, beneath the start-line gantry.
    // Shared/merged housings keep the signal independent of HUD and postprocessing.
    const signal=new THREE.Group();signal.name='start-lights';gantry.add(signal);
    const rack=new THREE.Mesh(new THREE.BoxGeometry(5.35,1.85,.3),new THREE.MeshStandardMaterial({color:0x242b30,roughness:.8}));rack.position.set(0,5.1,-.25);signal.add(rack);
    const housings:THREE.BufferGeometry[]=[],lens=new THREE.CircleGeometry(.32,24);
    for(let column=0;column<5;column++){
      const housing=new THREE.BoxGeometry(.86,1.65,.16);housing.translate((column-2),5.1,-.46);housings.push(housing);
      const material=new THREE.MeshStandardMaterial({color:0x190b0c,emissive:0xff1305,emissiveIntensity:.015,roughness:.45,toneMapped:false});this.startBulbs.push(material);
      for(const y of [4.7,5.5]){const bulb=new THREE.Mesh(lens,material);bulb.name=`start-lamp-${column}`;bulb.position.set((column-2),y,-.55);bulb.rotation.y=Math.PI;signal.add(bulb);}
    }
    const housingGeometry=mergeGeometries(housings);for(const housing of housings)housing.dispose();
    signal.add(new THREE.Mesh(housingGeometry,new THREE.MeshStandardMaterial({color:0x07090b,roughness:.9})));
  }
  private buildLighting(){
    const count=Math.ceil(this.length/52),dummy=new THREE.Object3D(),steel=new THREE.MeshStandardMaterial({color:0x61716e,metalness:.6,roughness:.4});
    const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.23,15,6),steel,count),lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(3,.16,1.1),new THREE.MeshBasicMaterial({color:0xe8f4ff}),count);
    for(let i=0;i<count;i++){const t=i/count,side=i%2?1:-1,p=this.point(t).addScaledVector(this.normal(t),side*19),n=this.normal(t);dummy.rotation.set(0,0,0);dummy.position.set(p.x,7.5,p.z);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);dummy.position.set(p.x-n.x*side*1.5,15,p.z-n.z*side*1.5);dummy.rotation.y=Math.atan2(this.tangent(t).x,this.tangent(t).z);dummy.updateMatrix();lamps.setMatrixAt(i,dummy.matrix);}this.group.add(poles,lamps);
  }
  private buildBrakeBoards(){
    for(const section of this.sections.filter(s=>[1,4,6,7,8,11].includes(s.number)))for(const distance of [150,100,50]){
      const t=section.progress-distance/this.length,p=this.point(t).addScaledVector(this.normal(t),-12.5),v=this.tangent(t),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#eaf1e9';ctx.fillRect(0,0,128,128);ctx.fillStyle='#14231d';ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.fillText(String(distance),64,85);
      const board=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));board.position.copy(p).setY(1.9);board.rotation.y=Math.atan2(v.x,v.z)+Math.PI;this.group.add(board);
    }
  }
}
