import * as THREE from 'three';
import {Track} from '../game/Track';
import {LinePlanner} from '../game/LinePlanner';
import {circuitById,type CircuitId} from '../game/Circuits';
import {createTrafficCar} from '../game/TrafficCarModel';
import {pathHeading,turnTowards} from './CornerDemoMotion';
import {TRACK_TIPS} from '../career/TrackBriefing';
/** Scripted demonstration along the game's planned path, not a recorded player lap. */
export class CornerDemo {
 private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(62,1,.3,900);private renderer:THREE.WebGLRenderer;
 private track:Track;private planner:LinePlanner;private car=createTrafficCar(0xff795f);private raf=0;private last=0;private metres=0;private from=0;private span=300;private stopped=false;private paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
 private observer:ResizeObserver;private guide?:THREE.Line;private sceneryAge=0;private cameraHeading=0;private resetPose=true;
 constructor(private host:HTMLElement,id:CircuitId){
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1));this.renderer.setClearColor(0x879aa7);this.scene.fog=new THREE.Fog(0x879aa7,180,700);this.scene.add(new THREE.HemisphereLight(0xd8ecff,0x5d6146,2));const sun=new THREE.DirectionalLight(0xffecd5,2.5);sun.position.set(90,140,70);this.scene.add(sun);
  this.track=new Track(this.scene,circuitById(id));this.planner=new LinePlanner(this.track);this.scene.add(this.car);
  host.innerHTML='<div class="corner-demo-status" role="status"></div><button class="corner-demo-toggle" type="button"></button>';host.prepend(this.renderer.domElement);
  const button=host.querySelector<HTMLButtonElement>('button')!;const label=()=>{button.textContent=this.paused?'재생 ▶':'일시정지 Ⅱ';};label();button.onclick=()=>{this.paused=!this.paused;label();};
  this.observer=new ResizeObserver(()=>{const w=host.clientWidth,h=210;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.observer.observe(host);this.select(id,0);this.raf=requestAnimationFrame(this.frame);
 }
 select(id:CircuitId,index:number){const tip=TRACK_TIPS[id][index],a=this.track.sections.find(s=>s.number===tip.sections[0])!,b=this.track.sections.find(s=>s.number===tip.sections.at(-1))!;this.from=a.progress*this.track.length-170;this.span=((b.progress-a.progress+1)%1)*this.track.length+310;this.metres=0;this.last=0;this.resetPose=true;if(this.guide){this.scene.remove(this.guide);this.guide.geometry.dispose();(this.guide.material as THREE.Material).dispose();}const points=Array.from({length:Math.ceil(this.span/4)+1},(_,i)=>this.planner.point((this.from+Math.min(this.span,i*4))/this.track.length).add(new THREE.Vector3(0,.15,0)));this.guide=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x76f2bf}));this.scene.add(this.guide);const p=this.planner.point(this.from/this.track.length),t=this.track.tangent(this.from/this.track.length);this.camera.position.copy(p).addScaledVector(t,-9).add(new THREE.Vector3(0,4,0));}
 private frame=(now:number)=>{if(this.stopped)return;this.raf=requestAnimationFrame(this.frame);const dt=this.last?Math.min(.04,(now-this.last)/1000):0;this.last=now;if(document.hidden||!this.host.isConnected)return;
  let progress=(this.from+this.metres)/this.track.length;const speed=Math.max(12,this.planner.speed(progress)*.9);
  if(!this.paused){this.metres+=speed*dt;if(this.metres>=this.span){this.metres%=this.span;this.resetPose=true;}}
  progress=(this.from+this.metres)/this.track.length;
  const p=this.planner.point(progress),heading=pathHeading(t=>this.planner.point(t),progress,this.track.length);
  if(this.resetPose){this.car.rotation.y=this.cameraHeading=heading;}else{this.car.rotation.y=turnTowards(this.car.rotation.y,heading,dt,24);this.cameraHeading=turnTowards(this.cameraHeading,heading,dt,3);}
  this.car.position.copy(p);
  const direction=new THREE.Vector3(Math.sin(this.cameraHeading),0,Math.cos(this.cameraHeading)),cameraPosition=p.clone().addScaledVector(direction,-9).add(new THREE.Vector3(0,4,0));
  if(this.resetPose)this.camera.position.copy(cameraPosition);else this.camera.position.lerp(cameraPosition,1-Math.exp(-dt*12));this.resetPose=false;
  this.camera.lookAt(p.clone().add(new THREE.Vector3(0,1,0)));this.renderer.domElement.style.opacity=String(this.paused?1:Math.min(1,this.metres/12,(this.span-this.metres)/12));
  const next=this.planner.speed(progress+35/this.track.length)*.9,phase=next<speed-2?'감속':next>speed+2?'탈출 · 가속':'코너 통과';this.host.querySelector('.corner-demo-status')!.textContent=`예시 주행 · ${phase} · ${Math.round(speed*3.6)} km/h`;this.sceneryAge+=dt;if(this.sceneryAge>.2){this.sceneryAge=0;this.track.updatePresentation(p,'low');}this.renderer.render(this.scene,this.camera);
 };
 dispose(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.raf);this.observer.disconnect();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o instanceof THREE.InstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();this.host.replaceChildren();}
}
