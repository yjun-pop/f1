import * as THREE from 'three';
import {Track} from '../game/Track';
import {circuitById,type CircuitId} from '../game/Circuits';
import {environmentFor} from '../game/CircuitEnvironment';
import {WorldLighting} from '../game/WorldLighting';

// Four recognizable corners per circuit; the section coordinates are shared
// with the actual scenery. No start-line shot is required.
const INTRO_SECTIONS:Record<CircuitId,readonly number[]>={
  monza:[1,6,8,11],silverstone:[9,10,12,15],spa:[2,5,10,18],
  monaco:[4,6,8,15],suzuka:[3,11,13,15],interlagos:[1,4,10,12],
  singapore:[5,12,14,16],montreal:[1,6,10,14]
};
const SHOT_HOLD_MS=3000,FADE_MS=600;

/** Menu scenery only: no Race, drivers, vehicles, audio or simulation loop. */
export class CircuitBackdrop {
  readonly targetFPS=120;
  private renderer:THREE.WebGLRenderer;
  private scene?:THREE.Scene;private track?:Track;private lighting?:WorldLighting;
  private camera=new THREE.PerspectiveCamera(57,1,.5,1500);
  private changing=false;private shotTimer=0;private shotIndex=0;
  private focus=new THREE.Vector3();private forward=new THREE.Vector3();private normal=new THREE.Vector3();
  private frame=0;private timer=0;private stopped=false;private selected?:CircuitId;
  private elapsed=0;private last=0;private renderedAt=0;private detailAt=-1;private shadowAt=-2;
  private count=0;private paintedAt=0;private scale=1;private sampleTime=0;private sampleFrames=0;private warmup=2;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  private resize=()=>{const w=window.innerWidth,h=window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25,Math.sqrt(2800000/(w*h)))*this.scale);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
  private visibility=()=>{this.last=0;if(document.hidden)window.clearTimeout(this.shotTimer);else if(this.track&&!this.changing&&this.host.classList.contains('is-ready'))this.scheduleShot();};
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
    window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);this.changing=true;this.host.classList.remove('is-ready');
    // Keep the outgoing frame intact until its 600ms fade has finished.
    // Only the latest selection may replace the scenery beneath the hidden layer.
    this.afterFade(()=>{
      if(this.stopped)return;
      try{
        this.clearWorld();const scene=new THREE.Scene(),definition=circuitById(id);this.scene=scene;
        this.track=new Track(scene,definition);
        this.lighting=new WorldLighting(scene,this.renderer,'medium',!!definition.night,environmentFor(id));
        this.renderer.toneMappingExposure=environmentFor(id).exposure;
        this.elapsed=this.last=this.renderedAt=0;this.detailAt=-1;this.shadowAt=-2;this.warmup=2;
        this.shotIndex=0;this.prepareShot();
        this.paintedAt=this.sampleTime=this.sampleFrames=0;
        this.host.dataset.circuit=id;this.changing=false;this.resize();
      }catch(error){console.warn('Circuit backdrop unavailable',error);this.clearWorld();this.changing=false;}
    });
  }
  private animate=(now:number)=>{
    if(this.stopped)return;this.frame=requestAnimationFrame(this.animate);
    if(document.hidden||this.changing){this.last=0;return;}
    const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;this.elapsed+=dt;
    // rAF follows the display. Never impose a 30fps fallback or simulate frames.
    if(now-this.renderedAt<1000/this.targetFPS-.6||!this.track||!this.scene||!this.lighting)return;
    const paintDt=this.paintedAt?Math.min(.1,(now-this.paintedAt)/1000):0;this.paintedAt=now;
    this.renderedAt=now-((now-this.renderedAt)%(1000/this.targetFPS));
    this.poseCamera(this.reduced.matches?0:this.elapsed);
    if(this.elapsed-this.detailAt>.25){this.track.updatePresentation(this.camera.position,'medium');this.detailAt=this.elapsed;}
    if(this.elapsed-this.shadowAt>1.5){this.lighting.sun.target.position.copy(this.focus);this.lighting.sun.position.copy(this.focus).add(this.lighting.sunOffset);this.renderer.shadowMap.needsUpdate=true;this.shadowAt=this.elapsed;}
    this.renderer.render(this.scene,this.camera);
    if(!this.host.classList.contains('is-ready')){this.host.classList.add('is-ready');this.scheduleShot();}
    if(++this.count%30===0)this.host.dataset.frames=String(this.count);
    if(this.warmup>0){this.warmup-=dt;return;}
    this.sampleTime+=paintDt;this.sampleFrames++;
    if(this.sampleTime>2){
      this.host.dataset.renderFps=(this.sampleFrames/this.sampleTime).toFixed(1);
      // Spend fewer pixels rather than dropping the requested refresh cadence.
      if(this.sampleFrames/this.sampleTime<58&&this.scale>.65){this.scale=Math.max(.65,this.scale*.85);this.resize();}
      this.sampleTime=this.sampleFrames=0;
    }
  };
  private afterFade(action:()=>void){
    const hidden=()=>{
      if(this.stopped)return;
      // Check the actual CSS transition value, including slow frames.
      if(Number(getComputedStyle(this.host).opacity)>.001){this.timer=window.setTimeout(hidden,32);return;}
      action();
    };
    this.timer=window.setTimeout(hidden,this.reduced.matches?0:FADE_MS+32);
  }
  private scheduleShot(){
    window.clearTimeout(this.shotTimer);
    if(this.stopped||this.reduced.matches||document.hidden)return;
    const hold=()=>{
      if(this.stopped||this.changing||document.hidden)return;
      if(Number(getComputedStyle(this.host).opacity)<.999){this.shotTimer=window.setTimeout(hold,32);return;}
      // Start the three-second hold only when the incoming frame is fully visible.
      this.shotTimer=window.setTimeout(()=>{
        if(this.stopped||this.changing||!this.track||document.hidden)return;
        this.changing=true;this.host.classList.remove('is-ready');
        this.afterFade(()=>{
          if(this.stopped||!this.track)return;
          this.shotIndex=(this.shotIndex+1)%INTRO_SECTIONS[this.track.circuit.id].length;
          this.prepareShot();this.elapsed=this.last=0;this.detailAt=-1;this.shadowAt=-2;
          this.changing=false;
        });
      },SHOT_HOLD_MS);
    };
    hold();
  }
  private prepareShot(){
    if(!this.track)return;
    const number=INTRO_SECTIONS[this.track.circuit.id][this.shotIndex];
    const section=this.track.sections.find(s=>s.number===number)!;
    this.focus.copy(this.track.roadPoint(section.progress));this.focus.y+=2;
    // This basis stays fixed for the whole shot, including sharp chicanes.
    this.forward.copy(this.track.tangent(section.progress));this.normal.copy(this.track.roadNormal(section.progress));
    this.host.dataset.view=section.name;this.host.dataset.viewIndex=String(this.shotIndex);
  }
  private poseCamera(time:number){
    if(!this.track)return;
    // Drift around one fixed landmark. Following the instantaneous road tangent
    // spun the view in chicanes, and the old 12s shot index teleported the camera.
    // Within each view, slow continuous curves never reset the viewing angle.
    const forward=-85+18*Math.sin(time/24),side=(this.shotIndex%2===0?1:-1)*(45+18*Math.sin(time/35));
    const height=(environmentFor(this.track.circuit.id).city?62:42)+8*Math.sin(time/29);
    this.camera.position.copy(this.focus).addScaledVector(this.forward,forward).addScaledVector(this.normal,side);
    this.camera.position.y+=height;this.camera.lookAt(this.focus);
  }
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
  dispose(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.frame);window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);this.clearWorld();this.renderer.dispose();this.renderer.forceContextLoss();this.host.remove();}
}
