import * as THREE from 'three';
import {Track} from '../game/Track';
import {circuitById,type CircuitId} from '../game/Circuits';
import {environmentFor} from '../game/CircuitEnvironment';
import {WorldLighting} from '../game/WorldLighting';

// Four recognizable corners per circuit; the section coordinates are shared
// with the actual scenery. No start-line shot is required.
const INTRO_SECTIONS:Record<CircuitId,readonly number[]>={
  monza:[1,6,8,11],silverstone:[18,10,12,15],spa:[3,5,10,18],
  monaco:[6,8,10,15],suzuka:[18,3,11,15],interlagos:[1,4,10,12],
  singapore:[5,12,14,16],montreal:[1,6,10,14]
};
const SHOT_HOLD_MS=3000,OVERLAP_MS=600;

/** Menu scenery only: no Race, drivers, vehicles, audio or simulation loop. */
export class CircuitBackdrop {
  readonly targetFPS=120;
  private renderer:THREE.WebGLRenderer;
  private overlap:HTMLCanvasElement;
  private overlapPending=false;private holdPending=false;private sceneReady=false;private resizePending=false;
  private scene?:THREE.Scene;private track?:Track;private lighting?:WorldLighting;
  private camera=new THREE.PerspectiveCamera(57,1,.5,1500);
  private interacting=false;
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
    this.overlap=document.createElement('canvas');this.overlap.className='circuit-overlap';this.overlap.setAttribute('aria-hidden','true');this.overlap.style.opacity='0';this.overlap.width=this.overlap.height=1;host.append(this.overlap);
    host.dataset.targetFps=String(this.targetFPS);host.dataset.transition='idle';
    this.resize();window.addEventListener('resize',this.resize);document.addEventListener('visibilitychange',this.visibility);
    this.frame=requestAnimationFrame(this.animate);
  }
  select(id:CircuitId){
    if(this.stopped||id===this.selected)return;this.selected=id;
    window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);this.captureOutgoing();this.changing=true;this.holdPending=false;
    // Keep one opaque outgoing image while only the latest selected world loads.
    this.timer=window.setTimeout(()=>{
      if(this.stopped||this.selected!==id)return;
      try{
        this.sceneReady=false;this.clearWorld();const scene=new THREE.Scene(),definition=circuitById(id);this.scene=scene;
        this.track=new Track(scene,definition);
        this.lighting=new WorldLighting(scene,this.renderer,'medium',!!definition.night,environmentFor(id));
        this.renderer.toneMappingExposure=environmentFor(id).exposure;
        this.elapsed=this.last=this.renderedAt=0;this.detailAt=-1;this.shadowAt=-2;this.warmup=2;
        this.shotIndex=0;this.prepareShot();
        this.paintedAt=this.sampleTime=this.sampleFrames=0;
        this.host.dataset.circuit=id;this.changing=false;this.holdPending=true;
      }catch(error){console.warn('Circuit backdrop unavailable',error);this.clearWorld();this.changing=false;}
    },this.reduced.matches?0:80);
  }
  private animate=(now:number)=>{
    if(this.stopped)return;this.frame=requestAnimationFrame(this.animate);
    if(document.hidden||this.changing){this.last=0;return;}
    const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;this.elapsed+=dt;
    // rAF follows the display. Never impose a 30fps fallback or simulate frames.
    if(now-this.renderedAt<1000/this.targetFPS-.6||!this.track||!this.scene||!this.lighting)return;
    const paintDt=this.paintedAt?Math.min(.1,(now-this.paintedAt)/1000):0;this.paintedAt=now;
    this.renderedAt=now-((now-this.renderedAt)%(1000/this.targetFPS));
    if(this.resizePending){this.resize();this.resizePending=false;}
    this.poseCamera(this.reduced.matches?0:this.elapsed);
    if(this.elapsed-this.detailAt>.25){this.track.updatePresentation(this.camera.position,'medium');this.detailAt=this.elapsed;}
    if(this.elapsed-this.shadowAt>1.5){this.lighting.sun.target.position.copy(this.focus);this.lighting.sun.position.copy(this.focus).add(this.lighting.sunOffset);this.renderer.shadowMap.needsUpdate=true;this.shadowAt=this.elapsed;}
    this.renderer.render(this.scene,this.camera);
    this.sceneReady=true;
    if(!this.host.classList.contains('is-ready'))this.host.classList.add('is-ready');
    if(this.overlapPending){
      // The incoming scene has actually rendered before the outgoing image fades.
      this.overlapPending=false;this.holdPending=false;this.overlap.style.transition=this.reduced.matches?'none':'';this.overlap.style.opacity='0';this.finishOverlap();
    }else if(this.holdPending){this.holdPending=false;this.scheduleShot();}
    if(++this.count%30===0)this.host.dataset.frames=String(this.count);
    if(this.warmup>0){this.warmup-=dt;return;}
    this.sampleTime+=paintDt;this.sampleFrames++;
    if(this.sampleTime>2){
      this.host.dataset.renderFps=(this.sampleFrames/this.sampleTime).toFixed(1);
      // Spend fewer pixels rather than dropping the requested refresh cadence.
      if(this.sampleFrames/this.sampleTime<58&&this.scale>.65){this.scale=Math.max(.65,this.scale*.85);this.resizePending=true;}
      this.sampleTime=this.sampleFrames=0;
    }
  };
  setInteracting(active:boolean){
    if(this.interacting===active)return;
    this.interacting=active;window.clearTimeout(this.shotTimer);
    if(!active&&this.track&&!this.changing)this.scheduleShot();
  }
  /** Snapshot only at a cut: one WebGL renderer/world, no second live scene. */
  private captureOutgoing(){
    if(this.reduced.matches){this.clearOverlap();return;}
    const opacity=Number(getComputedStyle(this.overlap).opacity);
    if(opacity>=.999){this.overlapPending=true;return;}
    if(!this.sceneReady||!this.scene)return;
    try{
      // Copy immediately after drawing; preserveDrawingBuffer stays disabled.
      this.renderer.render(this.scene,this.camera);
      const source=this.renderer.domElement;let image:HTMLCanvasElement=source;
      if(opacity>.001){
        // Rapid map changes preserve the currently visible blend, not an older
        // single scene. This temporary 2D buffer is released after the copy.
        image=document.createElement('canvas');image.width=source.width;image.height=source.height;
        const ctx=image.getContext('2d')!;ctx.drawImage(source,0,0);ctx.globalAlpha=opacity;ctx.drawImage(this.overlap,0,0,image.width,image.height);
      }
      this.overlap.style.transition='none';this.overlap.width=source.width;this.overlap.height=source.height;
      this.overlap.getContext('2d')!.drawImage(image,0,0,this.overlap.width,this.overlap.height);
      if(image!==source)image.width=image.height=1;
      this.overlap.style.opacity='1';void this.overlap.offsetWidth;
      this.overlapPending=true;this.host.dataset.transition='overlap';
    }catch(error){console.warn('Backdrop overlap unavailable',error);this.clearOverlap();}
  }
  private clearOverlap(){
    this.overlap.style.transition='none';this.overlap.style.opacity='0';this.overlap.width=this.overlap.height=1;
    this.overlapPending=false;this.host.dataset.transition='idle';
  }
  private finishOverlap(){
    const finish=()=>{
      if(this.stopped||this.changing||this.overlapPending)return;
      if(Number(getComputedStyle(this.overlap).opacity)>.001){this.timer=window.setTimeout(finish,32);return;}
      this.clearOverlap();this.scheduleShot();
    };
    this.timer=window.setTimeout(finish,this.reduced.matches?0:OVERLAP_MS+32);
  }
  private scheduleShot(){
    window.clearTimeout(this.shotTimer);
    if(this.stopped||this.interacting||this.reduced.matches||document.hidden||this.overlapPending||this.host.dataset.transition==='overlap')return;
    const hold=()=>{
      if(this.stopped||this.interacting||this.changing||document.hidden)return;
      if(Number(getComputedStyle(this.host).opacity)<.999){this.shotTimer=window.setTimeout(hold,32);return;}
      // Start the three-second hold only when the incoming frame is fully visible.
      this.shotTimer=window.setTimeout(()=>{
        if(this.stopped||this.interacting||this.changing||!this.track||document.hidden)return;
        this.captureOutgoing();
        this.shotIndex=(this.shotIndex+1)%INTRO_SECTIONS[this.track.circuit.id].length;
        this.prepareShot();this.elapsed=this.last=0;this.detailAt=-1;this.shadowAt=-2;this.holdPending=true;
      },SHOT_HOLD_MS);
    };
    hold();
  }
  private prepareShot(){
    if(!this.track)return;
    const number=INTRO_SECTIONS[this.track.circuit.id][this.shotIndex];
    const section=this.track.sections.find(s=>s.number===number)!;
    this.focus.copy(this.track.roadPoint(section.progress));this.focus.y+=2;
    // Compose landmark shots around their actual built context. A road-only
    // anchor can leave the hotel/terraces behind the camera after safe siting.
    const id=this.track.circuit.id,pit=this.track.group.getObjectByName('pit-building');
    if(pit&&(id==='silverstone'&&number===18||id==='montreal'&&number===14)){
      this.focus.lerp(pit.position,.75);this.focus.y+=7;
    }
    if(id==='monaco'&&number===8&&this.track.tunnel){
      this.focus.copy(this.track.roadPoint(this.track.tunnel.start+125/this.track.length));this.focus.y+=12;
    }
    const sites=this.track.group.userData.venueArchitecture?.sites as {name:string;frame:{p:THREE.Vector3}}[]|undefined;
    const site=sites?.find(s=>id==='spa'&&number===3&&s.name==='spa-raidillon-terraces'||id==='singapore'&&number===12&&s.name==='singapore-fullerton-colonnade');
    if(site){this.focus.lerp(site.frame.p,.6);this.focus.y+=id==='singapore'?9:4;}
    if(id==='suzuka'&&number===18){
      const wheel=this.track.group.getObjectByName('suzuka-ferris-wheel')?.userData.geographicAnchor?.placed as THREE.Vector3|undefined;
      if(wheel){this.focus.lerp(wheel,.55);this.focus.y+=16;}
    }
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
  dispose(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.frame);window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);this.clearOverlap();this.clearWorld();this.renderer.dispose();this.renderer.forceContextLoss();this.host.remove();}
}
