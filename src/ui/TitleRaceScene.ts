import * as THREE from 'three';
import {createCar,type CarVisual} from '../game/CarModel';
import {createTrafficCar} from '../game/TrafficCarModel';
import {createNightSkyTexture} from '../game/WorldLighting';

interface FilmCar {group:THREE.Group;visual?:CarVisual;offset:number;lane:number}
const mod=(v:number)=>((v%1)+1)%1;
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const OPENING_SECONDS=4,FILM_SPEED=96;
const RACE_SHOTS=[{id:1,seconds:5.2},{id:4,seconds:2.6},{id:2,seconds:5},{id:3,seconds:4.2}];
const RACE_CYCLE_SECONDS=RACE_SHOTS.reduce((sum,shot)=>sum+shot.seconds,0);
/** Original, scripted race photography. No gameplay physics, AI or lap timers run here. */
export class TitleRaceScene {
 readonly targetFPS=120;
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(49,1,.2,1400);
 readonly renderer:THREE.WebGLRenderer;
 private road=new THREE.CatmullRomCurve3([[-165,0,-330],[-175,0,160],[-90,0,330],[90,0,340],[180,0,170],[170,0,-240],[70,0,-380],[-80,0,-390]].map(p=>new THREE.Vector3(...p)),true,'centripetal');
 private sun=new THREE.DirectionalLight(0xcfe2ff,3.2);
 private length=this.road.getLength();private cars:FilmCar[]=[];
 private raf=0;private stopped=false;private last=0;private rendered=0;private elapsed=0;private shot=0;private shotStarted=0;
 private scale=1;private slow=0;private samples=0;private sampleAge=0;private warmup=2;
 private overlap=document.createElement('canvas');private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 private ownedTextures=new Set<THREE.Texture>();
 private sky?:THREE.DataTexture;private environment?:THREE.WebGLRenderTarget;
 private readonly p=new THREE.Vector3();private readonly t=new THREE.Vector3();private readonly n=new THREE.Vector3();
 private visibility=()=>{this.last=this.rendered=0;cancelAnimationFrame(this.raf);if(!document.hidden&&!this.stopped&&!this.reduced.matches)this.raf=requestAnimationFrame(this.animate);};
 private resize=()=>{const w=innerWidth,h=innerHeight;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.2,Math.sqrt(1800000/(w*h)))*this.scale);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.host.classList.contains('has-live-race')&&this.reduced.matches&&!this.stopped){this.pose(this.elapsed);this.render();}};
 private motion=()=>{this.last=this.rendered=0;cancelAnimationFrame(this.raf);if(this.reduced.matches)this.render();else if(!document.hidden&&!this.stopped)this.raf=requestAnimationFrame(this.animate);};
 private lost=(event:Event)=>{event.preventDefault();this.dispose();this.host.dataset.background='poster';};
 constructor(private host:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.domElement.className='title-race-canvas';this.renderer.domElement.setAttribute('aria-hidden','true');
  this.overlap.className='title-race-overlap';this.overlap.setAttribute('aria-hidden','true');this.overlap.style.opacity='0';
  host.append(this.renderer.domElement,this.overlap);host.dataset.targetFps='120';host.dataset.background='preparing';host.dataset.timeOfDay='night';this.resize();
  window.addEventListener('resize',this.resize);document.addEventListener('visibilitychange',this.visibility);this.reduced.addEventListener('change',this.motion);this.renderer.domElement.addEventListener('webglcontextlost',this.lost);
 }
 async prepare(progress:(label:string,value:number)=>void){
  progress('서킷과 촬영 환경을 준비하는 중…',2);await frame();if(this.stopped)return;
  this.buildWorld();await frame();if(this.stopped)return;
  progress('레이싱 차량을 준비하는 중…',3);
  const colors=[0xe64129,0xe6e9e6,0x00a7a3,0x214ba9,0xefba37,0x8f75bf];
  for(let i=0;i<colors.length;i++){
   if(this.stopped)return;const visual=i<4?createCar(colors[i]):undefined,group=visual?.group??createTrafficCar(colors[i]);
   if(visual){this.finishCar(visual,colors[i],i);visual.contactShadow.material.opacity=.5;group.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=i<2&&object.name!=='contact-shadow'&&!(object.material as THREE.Material).alphaTest;});}
   this.scene.add(group);this.cars.push({group,visual,offset:[0,-4,-17,-30,-49,-70][i],lane:[1.8,-2,3.8,-3.6,.4,2][i]});
   if(i%2===1)await frame();
  }
  if(this.stopped)return;progress('조명과 첫 화면을 준비하는 중…',4);this.pose(0);await frame();if(this.stopped)return;
  this.renderer.compile(this.scene,this.camera);this.render();await frame();if(this.stopped)return;
  this.host.dataset.background='live';this.host.classList.add('has-live-race');
  if(!this.reduced.matches&&!document.hidden)this.raf=requestAnimationFrame(this.animate);
 }
 private at(distance:number,lateral=0,height=0){const u=mod(distance/this.length);this.p.copy(this.road.getPointAt(u));this.t.copy(this.road.getTangentAt(u));this.n.set(this.t.z,0,-this.t.x).normalize();return new THREE.Vector3(this.p.x+this.n.x*lateral,height,this.p.z+this.n.z*lateral);}
 private ribbon(inner:number,outer:number,material:THREE.Material,y=0){
  if(inner>outer)[inner,outer]=[outer,inner];
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],steps=640;
  for(let i=0;i<=steps;i++){for(const lane of [inner,outer]){const p=this.at(i/steps*this.length,lane,y);positions.push(p.x,p.y,p.z);uv.push((lane-inner)/(outer-inner),i/steps*this.length/18);}if(i<steps){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;this.scene.add(mesh);return mesh;
 }
 private roadTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(256,256);
  let seed=741;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<pixels.data.length;i+=4){const value=66+random()*24;pixels.data[i]=value;pixels.data[i+1]=value+2;pixels.data[i+2]=value+5;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);for(const x of [65,77,170,182]){ctx.fillStyle='#10151c20';ctx.fillRect(x,0,7,256);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.ownedTextures.add(texture);return texture;
 }
 private buildWorld(){
  this.scene.fog=new THREE.Fog('#0b162a',180,700);this.sky=createNightSkyTexture(512);this.scene.background=this.sky;
  const pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromEquirectangular(this.sky);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;pmrem.dispose();
  this.scene.add(new THREE.HemisphereLight(0x9ebce8,0x202b3c,.75));
  const rim=new THREE.DirectionalLight(0xffdab4,1.4);rim.position.set(14,12,-10);this.scene.add(rim);
  this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-15,right:15,top:15,bottom:-15,near:1,far:100});this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.015;this.scene.add(this.sun,this.sun.target);
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(2800,2800),new THREE.MeshStandardMaterial({color:0x101b24,roughness:1}));grass.rotation.x=-Math.PI/2;grass.position.y=-.09;this.scene.add(grass);
  this.ribbon(-14,14,new THREE.MeshStandardMaterial({color:0x283442,roughness:1}),-.035);
  this.ribbon(-9.2,9.2,new THREE.MeshStandardMaterial({map:this.roadTexture(),color:0x8a9eb9,roughness:.65,metalness:.04}));
  const line=new THREE.MeshStandardMaterial({color:0xf1eae0,roughness:.9});this.ribbon(-9.2,-9.05,line,.012);this.ribbon(9.05,9.2,line,.012);
  const red=new THREE.MeshStandardMaterial({color:0xba3e32,roughness:.85}),white=new THREE.MeshStandardMaterial({color:0xe3ded4,roughness:.9});
  for(const side of [-1,1]){
   this.ribbon(side*9.3,side*10.3,white,.005);
   const segments=400,curb=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.035,this.length/segments+.04),red,segments/2),dummy=new THREE.Object3D();
   for(let i=0;i<segments/2;i++){const d=i*2*this.length/segments,p=this.at(d,side*9.8,.024);dummy.position.copy(p);dummy.rotation.y=Math.atan2(this.t.x,this.t.z);dummy.updateMatrix();curb.setMatrixAt(i,dummy.matrix);}curb.instanceMatrix.needsUpdate=true;this.scene.add(curb);
   this.wall(side*14.8,0,.95,new THREE.MeshStandardMaterial({color:0xa4b0b8,metalness:.5,roughness:.58,side:THREE.DoubleSide}));
   const count=200,posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.09,3.3,.09),new THREE.MeshStandardMaterial({color:0x687580,metalness:.6,roughness:.6}),count);
   for(let i=0;i<count;i++){dummy.position.copy(this.at(i/count*this.length,side*15.2,1.7));dummy.rotation.y=Math.atan2(this.t.x,this.t.z);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);}posts.instanceMatrix.needsUpdate=true;this.scene.add(posts);
   this.wall(side*15.2,1.0,3.3,new THREE.MeshStandardMaterial({map:this.fenceTexture(),transparent:true,alphaTest:.2,side:THREE.DoubleSide,roughness:.65,metalness:.3,depthWrite:false}));
  }
  this.buildFurniture();this.buildFloodlights();
 }
 private buildFloodlights(){
  // Static stadium fixtures and soft baked pools avoid dozens of real-time
  // spotlights or extra shadow maps while giving passing scenery a night rhythm.
  const count=64,dummy=new THREE.Object3D(),steel=new THREE.MeshStandardMaterial({color:0x65758a,roughness:.5,metalness:.65});
  const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.17,13,6),steel,count);
  const arms=new THREE.InstancedMesh(new THREE.BoxGeometry(5.6,.16,.2),steel,count);
  const panels=new THREE.InstancedMesh(new THREE.BoxGeometry(2.7,.12,1.05),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xd5e8ff,emissiveIntensity:5,toneMapped:false}),count);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'#cee6ff40');gradient.addColorStop(.45,'#a4c9f022');gradient.addColorStop(1,'#8eb7e000');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;this.ownedTextures.add(map);
  const pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(22,38),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),count);
  for(let i=0;i<count;i++){
   const distance=i/count*this.length,side=i%2?1:-1;
   dummy.position.copy(this.at(distance,side*18.3,6.5));const heading=Math.atan2(this.t.x,this.t.z);dummy.rotation.set(0,heading,0);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
   dummy.position.copy(this.at(distance,side*15.6,12.7));dummy.updateMatrix();arms.setMatrixAt(i,dummy.matrix);
   dummy.position.copy(this.at(distance,side*13,12.6));dummy.updateMatrix();panels.setMatrixAt(i,dummy.matrix);
   dummy.position.copy(this.at(distance,side*2.5,.018));dummy.rotation.set(-Math.PI/2,heading,0,'YXZ');dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix);
  }
  for(const mesh of [poles,arms,panels,pools]){mesh.instanceMatrix.needsUpdate=true;this.scene.add(mesh);}
 }
 private buildFurniture(){
  const dummy=new THREE.Object3D(),concrete=new THREE.MeshStandardMaterial({color:0x9bacae,roughness:.86}),dark=new THREE.MeshStandardMaterial({color:0x263441,roughness:.7,metalness:.25});
  const stands=new THREE.InstancedMesh(new THREE.BoxGeometry(26,1,4),concrete,24),roofs=new THREE.InstancedMesh(new THREE.BoxGeometry(29,.35,15),dark,4);
  const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.45,.8,.42),new THREE.MeshStandardMaterial({roughness:1}),4*6*40);let spectator=0;
  for(let section=0;section<4;section++){
   const distance=this.length*(.15+section*.225),side=section%2?-1:1,base=this.at(distance,side*28,0),heading=Math.atan2(this.t.x,this.t.z)+(side>0?Math.PI:0);
   const frame=new THREE.Group();frame.position.copy(base);frame.rotation.y=heading;frame.updateMatrixWorld(true);
   for(let tier=0;tier<6;tier++){
    dummy.position.set(-tier*2.0,tier*.65+.55,0);
    dummy.rotation.set(0,0,0);dummy.scale.set(.14,1,6.5);dummy.updateMatrix();stands.setMatrixAt(section*6+tier,frame.matrixWorld.clone().multiply(dummy.matrix));
    for(let person=0;person<40;person++){dummy.position.set(-tier*2,tier*.65+1.45,-12.3+person*.63);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();heads.setMatrixAt(spectator,frame.matrixWorld.clone().multiply(dummy.matrix));heads.setColorAt(spectator,new THREE.Color().setHSL((person*.173+tier*.11+section*.3)%1,.4,.38));spectator++;}
   }
   dummy.position.set(-5.6,6.8,0);dummy.scale.set(.55,1,2);dummy.updateMatrix();roofs.setMatrixAt(section,frame.matrixWorld.clone().multiply(dummy.matrix));
   // Each roof is supported from the back; no structure crosses the racing corridor.
   for(const z of [-11,0,11]){const support=new THREE.Mesh(new THREE.BoxGeometry(.22,7.5,.22),dark);support.position.set(-12,3.65,z);frame.add(support);}
   this.scene.add(frame);
  }
  for(const mesh of [stands,roofs,heads]){mesh.instanceMatrix.needsUpdate=true;this.scene.add(mesh);}
  const foliage=new THREE.MeshStandardMaterial({map:this.foliageTexture(),alphaTest:.45,roughness:1,side:THREE.DoubleSide});
  for(const angle of [0,Math.PI/2]){
   const trees=new THREE.InstancedMesh(new THREE.PlaneGeometry(14,17),foliage,100);
   for(let i=0;i<100;i++){const side=i%2?1:-1;dummy.position.copy(this.at(i/100*this.length,side*(62+(i%7)*9),8.4));dummy.rotation.set(0,i*.73+angle,0);const scale=.7+(i%5)*.1;dummy.scale.set(scale,scale,scale);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);}
   trees.instanceMatrix.needsUpdate=true;this.scene.add(trees);
  }
  const signs=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,1.05,13),new THREE.MeshStandardMaterial({map:this.signTexture(),roughness:.65}),24);
  for(let i=0;i<24;i++){dummy.position.copy(this.at(i/24*this.length,i%2?15.1:-15.1,.72));dummy.rotation.set(0,Math.atan2(this.t.x,this.t.z),0);dummy.scale.set(1,1,1);dummy.updateMatrix();signs.setMatrixAt(i,dummy.matrix);}signs.instanceMatrix.needsUpdate=true;this.scene.add(signs);
  // Marshal structures and pit garages establish a venue rather than an empty park.
  for(let i=0;i<10;i++){const building=new THREE.Mesh(new THREE.BoxGeometry(11,5.8,12),new THREE.MeshStandardMaterial({color:i%2?0xd2d7d4:0xb9c4cb,roughness:.75}));const d=this.length*.42+i*14;building.position.copy(this.at(d,38,2.85));building.rotation.y=Math.atan2(this.t.x,this.t.z);this.scene.add(building);const glass=new THREE.Mesh(new THREE.BoxGeometry(.1,2.4,9.8),new THREE.MeshStandardMaterial({color:0x243b50,emissive:0x6aa6d0,emissiveIntensity:.65,metalness:.5,roughness:.22}));glass.position.set(-5.56,.55,0);building.add(glass);}
 }
 private finishCar(car:CarVisual,color:number,index:number){
  const seen=new Set<THREE.Material>();car.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){if(seen.has(material))continue;seen.add(material);if(material instanceof THREE.MeshStandardMaterial){if(material.color.getHex()===0xb48b40)material.color.setHex(0x313b43);if(material.color.getHex()===0xc6cdd1){material.color.setHex(0x28313b);material.roughness=.42;material.metalness=.45;}}}});
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f1f3ee';ctx.font='italic bold 64px sans-serif';ctx.textAlign='center';ctx.fillText(`${[17,41,28,63][index]}  APEX`,256,87);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;this.ownedTextures.add(map);
  const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  for(const side of [-1,1]){const decal=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.28),material);decal.position.set(side*.95,.6,-.7);decal.rotation.y=side*Math.PI/2;car.chassis.add(decal);}
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.253,20,12),new THREE.MeshStandardMaterial({color:index%2?0xf0d14f:color,roughness:.3,metalness:.2}));helmet.position.set(0,1.02,-.45);car.chassis.add(helmet);
 }
 private wall(lane:number,bottom:number,top:number,material:THREE.Material){
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],steps=640;
  for(let i=0;i<=steps;i++){for(const y of [bottom,top]){const p=this.at(i/steps*this.length,lane,y);positions.push(p.x,p.y,p.z);uvs.push(i/steps*this.length/3,(y-bottom)/3);}if(i<steps){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();this.scene.add(new THREE.Mesh(geometry,material));
 }
 private fenceTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.strokeStyle='#a8b4bc80';ctx.lineWidth=1.1;for(let i=-64;i<128;i+=16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+64,64);ctx.moveTo(i,0);ctx.lineTo(i-64,64);ctx.stroke();}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;this.ownedTextures.add(texture);return texture;}
 private foliageTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;let seed=91;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.strokeStyle='#655a4e';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(253,510);ctx.lineTo(263,172);ctx.stroke();ctx.lineWidth=5;for(let i=0;i<15;i++){ctx.beginPath();ctx.moveTo(258,440-i*15);ctx.lineTo(90+random()*330,100+random()*210);ctx.stroke();}
  for(let i=0;i<2800;i++){const angle=random()*Math.PI*2,radius=Math.sqrt(random()),x=256+Math.cos(angle)*radius*205,y=210+Math.sin(angle)*radius*178;const light=.8+random()*.4+(1-x/512)*.15;ctx.fillStyle=`rgb(${Math.round(37*light)},${Math.round(65*light)},${Math.round(39*light)})`;ctx.beginPath();ctx.arc(x,y,3+random()*9,0,Math.PI*2);ctx.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.ownedTextures.add(texture);return texture;
 }
 private signTexture(){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#133a39';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#dce7e3';ctx.font='italic bold 48px sans-serif';ctx.textAlign='center';ctx.fillText('APEX  /  FORMULA',512,81);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;this.ownedTextures.add(map);return map;}
 private pose(seconds:number){
  const distance=this.length*.18+seconds*FILM_SPEED;
  const center=this.at(distance);this.sun.position.copy(center).add(new THREE.Vector3(-16,25,10));this.sun.target.position.copy(center);
  const hero=3*Math.sin(seconds*.22),rival=-4+8*Math.sin(seconds*.36+.45),gap=rival-hero;
  this.cars.forEach((car,i)=>{const offset=i===0?hero:i===1?rival:car.offset+Math.sin(seconds*.21+i)*3;
   const lane=i===1?THREE.MathUtils.lerp(1.8,-2,THREE.MathUtils.smoothstep(gap,-14,-8)):car.lane+Math.sin(seconds*.18+i)*.2;
   car.group.position.copy(this.at(distance+offset,lane));car.group.rotation.y=Math.atan2(this.t.x,this.t.z);
   if(car.visual){for(const tire of car.visual.tires)tire.rotation.x=-seconds*FILM_SPEED/.49;for(const wheel of car.visual.frontWheels)wheel.rotation.y=.012*Math.sin(seconds*.6);car.visual.chassis.position.y=Math.sin(seconds*30+i)*.003;}
  });
  this.camera.up.set(0,1,0);
  if(this.shot===0){
   // Track the actual right-front axle from behind and outside the car. A
   // car-relative rig keeps the tyre framed through bends and lateral movement.
   const car=this.cars[0],wheel=car.visual!.frontWheels.find(pivot=>pivot.position.x>0)!;
   const target=wheel.getWorldPosition(new THREE.Vector3()),push=THREE.MathUtils.smoothstep(seconds,0,OPENING_SECONDS);
   const localOffset=new THREE.Vector3(3.15-.45*push-wheel.position.x,.84-wheel.position.y,-.9+.35*push-wheel.position.z);
   localOffset.multiplyScalar(Math.max(1,Math.min(1.5,1/this.camera.aspect))).applyQuaternion(car.group.quaternion);
   this.camera.position.copy(target).add(localOffset);this.camera.lookAt(target);
  }else if(this.shot===4){
   // A world-fixed overhead camera: the pack crosses the frame at full speed
   // rather than remaining centred as it does in the tracking shots.
   const anchor=this.length*.18+(this.shotStarted+.95)*FILM_SPEED,target=this.at(anchor);
   this.camera.position.copy(target).add(new THREE.Vector3(0,38,0));
   this.camera.up.copy(this.t).applyAxisAngle(new THREE.Vector3(0,1,0),.32);this.camera.lookAt(target);
  }else{
   const cameraD=this.shot===1?distance+10:this.shot===2?distance-14:distance+5;
   const cameraLane=this.shot===1?-5.8:this.shot===2?6.7:-10.5;
   this.camera.position.copy(this.at(cameraD,cameraLane+(Math.sin(seconds*.15)*.25),this.shot===3?3.3:1.7));
   const target=this.at(distance+(this.shot===2?8:-13),this.shot===2?1:0,this.shot===3?.85:.72);this.camera.lookAt(target);
  }
  // Shift the opening composition to the right, leaving the menu readable.
  const composition=this.shot===0?(this.camera.aspect>=1?.43:.18):this.shot===4?(this.camera.aspect>=1?.34:.08):0;
  const offset=-composition*this.camera.getFilmWidth()*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect;
  if(this.camera.filmOffset!==offset){this.camera.filmOffset=offset;this.camera.updateProjectionMatrix();}
 }
 private render(){
  this.renderer.render(this.scene,this.camera);
  const calls=String(this.renderer.info.render.calls),triangles=String(this.renderer.info.render.triangles);
  if(this.host.dataset.drawCalls!==calls)this.host.dataset.drawCalls=calls;
  if(this.host.dataset.triangles!==triangles)this.host.dataset.triangles=triangles;
 }
 private animate=(now:number)=>{
  if(this.stopped||document.hidden||this.reduced.matches)return;
  this.raf=requestAnimationFrame(this.animate);const interval=1000/this.targetFPS;if(this.rendered&&now-this.rendered<interval-.3)return;
  if(!this.rendered)this.rendered=now;else{this.rendered+=interval;if(now-this.rendered>interval)this.rendered=now;}
  const dt=this.last?Math.min((now-this.last)/1000,.06):0;this.last=now;this.elapsed+=dt;
  const next=this.shotAt(this.elapsed);
  if(next!==this.shot){this.render();this.overlap.width=this.renderer.domElement.width;this.overlap.height=this.renderer.domElement.height;this.overlap.getContext('2d')?.drawImage(this.renderer.domElement,0,0);this.overlap.style.transition='none';this.overlap.style.opacity='1';this.shot=next;this.shotStarted=this.elapsed;}
  this.pose(this.elapsed);this.render();
  if(this.overlap.style.opacity==='1'){requestAnimationFrame(()=>{if(this.stopped)return;this.overlap.style.transition='opacity .45s ease';this.overlap.style.opacity='0';});}
  this.warmup-=dt;if(this.warmup<0){this.sampleAge+=dt;this.samples++;if(this.sampleAge>1){const fps=this.samples/this.sampleAge;this.slow=fps<48?this.slow+1:0;this.sampleAge=this.samples=0;if(this.slow>=2&&this.scale>.62){this.scale=Math.max(.62,this.scale*.85);if(this.scale<.75){this.renderer.shadowMap.enabled=false;this.host.dataset.shadows='contact';}this.resize();this.slow=0;this.host.dataset.renderScale=this.scale.toFixed(2);}}}
 }
 private shotAt(seconds:number){
  if(seconds<OPENING_SECONDS)return 0;
  let local=(seconds-OPENING_SECONDS)%RACE_CYCLE_SECONDS;
  for(const shot of RACE_SHOTS){if(local<shot.seconds)return shot.id;local-=shot.seconds;}
  return RACE_SHOTS[0].id;
 }
 dispose(){
  if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener('change',this.motion);this.renderer.domElement.removeEventListener('webglcontextlost',this.lost);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);if(object instanceof THREE.InstancedMesh)object.dispose();}});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of this.ownedTextures)texture.dispose();this.ownedTextures.clear();this.environment?.dispose();this.sky?.dispose();this.scene.clear();this.cars.length=0;this.scene.environment=null;this.renderer.dispose();this.renderer.forceContextLoss();this.sun.shadow.map?.dispose();this.renderer.domElement.remove();this.overlap.remove();this.host.classList.remove('has-live-race');
 }
}
