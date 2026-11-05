import * as THREE from 'three';
import {Track} from '../game/Track';
import {circuitById,type CircuitId} from '../game/Circuits';
import {environmentFor} from '../game/CircuitEnvironment';
import {WorldLighting} from '../game/WorldLighting';

/** Menu scenery only: no Race, drivers, vehicles, audio or simulation loop. */
export class CircuitBackdrop {
  readonly targetFPS=120;
  private renderer:THREE.WebGLRenderer;
  private scene?:THREE.Scene;private track?:Track;private lighting?:WorldLighting;
  private camera=new THREE.PerspectiveCamera(57,1,.5,1500);
  private frame=0;private timer=0;private stopped=false;private selected?:CircuitId;
  private elapsed=0;private last=0;private renderedAt=0;private detailAt=-1;private shadowAt=-2;
  private count=0;private paintedAt=0;private scale=1;private sampleTime=0;private sampleFrames=0;private warmup=2;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  private resize=()=>{const w=window.innerWidth,h=window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25,Math.sqrt(2800000/(w*h)))*this.scale);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
  private visibility=()=>{this.last=0;};
  constructor(private host:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate=false;
    this.renderer.domElement.setAttribute('aria-hidden','true');host.append(this.renderer.domElement);
    host.dataset.targetFps=String(this.targetFPS);
    this.resize();window.addEventListener('resize',this.resize);document.addEventListener('visibilitychange',this.visibility);
    this.frame=requestAnimationFrame(this.animate);
  }
  select(id:CircuitId){
    if(this.stopped||id===this.selected)return;this.selected=id;
    window.clearTimeout(this.timer);this.host.classList.remove('is-ready');
    // Coalesce quick arrow presses and let the fade paint before world creation.
    this.timer=window.setTimeout(()=>{
      if(this.stopped)return;
      try{
        this.clearWorld();const scene=new THREE.Scene(),definition=circuitById(id);this.scene=scene;
        this.track=new Track(scene,definition);
        this.lighting=new WorldLighting(scene,this.renderer,'medium',!!definition.night,environmentFor(id));
        this.renderer.toneMappingExposure=environmentFor(id).exposure;
        this.elapsed=this.last=this.renderedAt=0;this.detailAt=-1;this.shadowAt=-2;this.warmup=2;
        this.host.dataset.circuit=id;this.resize();
      }catch(error){console.warn('Circuit backdrop unavailable',error);this.clearWorld();}
    },240);
  }
  private animate=(now:number)=>{
    if(this.stopped)return;this.frame=requestAnimationFrame(this.animate);
    if(document.hidden){this.last=0;return;}
    const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;this.elapsed+=dt;
    // rAF follows the display. Never impose a 30fps fallback or simulate frames.
    if(now-this.renderedAt<1000/this.targetFPS-.6||!this.track||!this.scene||!this.lighting)return;
    const paintDt=this.paintedAt?Math.min(.1,(now-this.paintedAt)/1000):0;this.paintedAt=now;
    this.renderedAt=now-((now-this.renderedAt)%(1000/this.targetFPS));
    const shot=Math.floor(this.elapsed/12),phase=(this.elapsed%12)/12;
    const anchors=[0,this.track.sections[2]?.progress??.25,this.track.sections[6]?.progress??.65];
    const progress=anchors[shot%anchors.length]+(this.reduced.matches?0:phase*100/this.track.length);
    const p=this.track.roadPoint(progress),n=this.track.roadNormal(progress),forward=this.track.tangent(progress);
    const height=shot%3===0?32:shot%3===1?18:44,side=shot%2===0?38:-32;
    this.camera.position.copy(p).addScaledVector(n,side).addScaledVector(forward,-62);this.camera.position.y+=height;
    const target=p.clone().addScaledVector(forward,42);target.y+=2;this.camera.lookAt(target);
    if(this.elapsed-this.detailAt>.25){this.track.updatePresentation(this.camera.position,'medium');this.detailAt=this.elapsed;}
    if(this.elapsed-this.shadowAt>1.5){this.lighting.sun.target.position.copy(p);this.lighting.sun.position.copy(p).add(this.lighting.sunOffset);this.renderer.shadowMap.needsUpdate=true;this.shadowAt=this.elapsed;}
    this.renderer.render(this.scene,this.camera);
    this.host.classList.add('is-ready');
    if(++this.count%30===0)this.host.dataset.frames=String(this.count);
    // Fade between camera shots without retaining a second rendered world.
    this.host.style.setProperty('--shot-opacity',String(this.reduced.matches?1:Math.min(1,phase*22,(1-phase)*22)));
    if(this.reduced.matches)this.elapsed=0.6;
    if(this.warmup>0){this.warmup-=dt;return;}
    this.sampleTime+=paintDt;this.sampleFrames++;
    if(this.sampleTime>2){
      this.host.dataset.renderFps=(this.sampleFrames/this.sampleTime).toFixed(1);
      // Spend fewer pixels rather than dropping the requested refresh cadence.
      if(this.sampleFrames/this.sampleTime<58&&this.scale>.65){this.scale=Math.max(.65,this.scale*.85);this.resize();}
      this.sampleTime=this.sampleFrames=0;
    }
  };
  private clearWorld(){
    this.lighting?.dispose();this.lighting=undefined;
    if(this.scene){
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
      this.scene.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const key of ['nearGeometry','farGeometry'])if(object.userData[key])geometries.add(object.userData[key]);if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);});
      for(const material of materials){for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();}
      geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());this.scene.clear();
    }
    this.scene=undefined;this.track=undefined;this.renderer.renderLists.dispose();
  }
  dispose(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.frame);window.clearTimeout(this.timer);window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);this.clearWorld();this.renderer.dispose();this.renderer.forceContextLoss();this.host.remove();}
}
