import * as THREE from 'three';
import {Track} from '../game/Track';
import {CIRCUITS,circuitById,type CircuitId} from '../game/Circuits';
import {environmentFor} from '../game/CircuitEnvironment';
import {WorldLighting} from '../game/WorldLighting';

// Four recognizable corners per circuit; the section coordinates are shared
// with the actual scenery. No start-line shot is required.
const INTRO_SECTIONS:Record<CircuitId,readonly number[]>={
  monza:[1,6,8,11],silverstone:[18,10,12,15],spa:[3,5,10,18],
  monaco:[6,8,10,15],suzuka:[18,3,11,15],interlagos:[1,4,10,12],
  singapore:[5,12,14,16],montreal:[1,6,10,14]
};
const SHOT_HOLD_MS=3000,OVERLAP_MS=600,MAX_WORLDS=3;
interface BackdropWorld {scene:THREE.Scene;track:Track;lighting:WorldLighting}

/** Menu scenery only: no Race, drivers, vehicles, audio or simulation loop. */
export class CircuitBackdrop {
  readonly targetFPS=120;
  private renderer:THREE.WebGLRenderer;
  private overlap:HTMLCanvasElement;
  private overlapPending=false;private holdPending=false;private sceneReady=false;private resizePending=false;
  private scene?:THREE.Scene;private track?:Track;private lighting?:WorldLighting;
  private worlds=new Map<CircuitId,BackdropWorld>();
  private idle=0;private warmTimer=0;
  private camera=new THREE.PerspectiveCamera(57,1,.5,1500);
  private interacting=false;
  private changing=false;private shotTimer=0;private shotIndex=0;
  private focus=new THREE.Vector3();private forward=new THREE.Vector3();private normal=new THREE.Vector3();
  private frame=0;private timer=0;private stopped=false;private selected?:CircuitId;
  private elapsed=0;private last=0;private renderedAt=0;private detailAt=-1;private shadowAt=-2;
  private count=0;private paintedAt=0;private scale=1;private sampleTime=0;private sampleFrames=0;private warmup=2;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  private resize=()=>{const w=window.innerWidth,h=window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25,Math.sqrt(2800000/(w*h)))*this.scale);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
  private visibility=()=>{this.last=0;if(document.hidden){window.clearTimeout(this.shotTimer);this.cancelPreload();}else if(this.track&&!this.changing&&this.host.classList.contains('is-ready')){this.scheduleShot();this.preloadNeighbors();}};
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
    window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);this.cancelPreload();this.changing=true;this.holdPending=false;
    const activate=()=>{
      if(this.stopped||this.selected!==id)return;
      try{
        const world=this.worldFor(id);
        // Leave the outgoing camera live until its replacement is ready. Cached
        // neighbours reach this point in the same selection event, without a wait.
        this.captureOutgoing();this.sceneReady=false;
        this.scene=world.scene;this.track=world.track;this.lighting=world.lighting;
        this.renderer.toneMappingExposure=environmentFor(id).exposure;
        this.elapsed=this.last=this.renderedAt=0;this.detailAt=-1;this.shadowAt=-2;this.warmup=2;
        this.shotIndex=0;this.prepareShot();
        this.paintedAt=this.sampleTime=this.sampleFrames=0;
        this.host.dataset.circuit=id;this.changing=false;this.holdPending=true;
      }catch(error){console.warn('Circuit backdrop unavailable',error);this.selected=this.track?.circuit.id;this.changing=false;this.clearOverlap();this.scheduleShot();}
    };
    if(this.worlds.has(id))activate();
    else this.timer=window.setTimeout(activate,0);
  }
  private neighborIds(){
    const index=CIRCUITS.findIndex(c=>c.id===this.selected);
    return [CIRCUITS[(index+1)%CIRCUITS.length].id,CIRCUITS[(index+CIRCUITS.length-1)%CIRCUITS.length].id];
  }
  private worldFor(id:CircuitId){
    const cached=this.worlds.get(id);if(cached)return cached;
    if(this.worlds.size>=MAX_WORLDS){
      const keep=new Set([this.selected,...this.neighborIds()]);
      const evict=[...this.worlds.keys()].find(key=>key!==this.track?.circuit.id&&!keep.has(key))??[...this.worlds.keys()].find(key=>key!==this.track?.circuit.id&&key!==id);
      if(evict)this.releaseWorld(evict);
    }
    const scene=new THREE.Scene(),definition=circuitById(id);
    try{
      const track=new Track(scene,definition),lighting=new WorldLighting(scene,this.renderer,'medium',!!definition.night,environmentFor(id));
      const world={scene,track,lighting};this.worlds.set(id,world);return world;
    }catch(error){this.disposeScene(scene);throw error;}
  }
  private cancelPreload(){
    window.clearTimeout(this.warmTimer);this.warmTimer=0;
    if(this.idle){window.cancelIdleCallback(this.idle);this.idle=0;}
  }
  private preloadNeighbors(){
    this.cancelPreload();
    if(this.stopped||document.hidden||this.interacting||this.changing||!this.track)return;
    const id=this.neighborIds().find(key=>!this.worlds.has(key));if(!id)return;
    const selected=this.selected;
    const prepare=()=>{
      this.idle=this.warmTimer=0;
      if(this.stopped||document.hidden||this.interacting||this.changing||selected!==this.selected)return;
      try{this.warmWorld(this.worldFor(id));}catch(error){this.releaseWorld(id);console.warn('Circuit preload unavailable',error);return;}
      this.preloadNeighbors();
    };
    // Retain only the current and adjacent worlds, and prepare them outside the
    // click handler. Never create another renderer or simulation for the cache.
    if(window.requestIdleCallback)this.idle=window.requestIdleCallback(prepare,{timeout:800});
    else this.warmTimer=window.setTimeout(prepare,200);
  }
  private animate=(now:number)=>{
    if(this.stopped)return;this.frame=requestAnimationFrame(this.animate);
    if(document.hidden){this.last=0;return;}
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
      this.overlapPending=false;this.holdPending=false;this.overlap.style.transition=this.reduced.matches?'none':'';this.overlap.style.opacity='0';this.finishOverlap();this.preloadNeighbors();
    }else if(this.holdPending){this.holdPending=false;this.scheduleShot();this.preloadNeighbors();}
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
    this.interacting=active;window.clearTimeout(this.shotTimer);this.cancelPreload();
    if(!active&&this.track&&!this.changing){this.scheduleShot();this.preloadNeighbors();}
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
      this.clearOverlap();this.scheduleShot();this.preloadNeighbors();
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
  private shotFor(track:Track,index:number){
    const focus=new THREE.Vector3(),forward=new THREE.Vector3(),normal=new THREE.Vector3();
    const number=INTRO_SECTIONS[track.circuit.id][index];
    const section=track.sections.find(s=>s.number===number)!;
    focus.copy(track.roadPoint(section.progress));focus.y+=2;
    // Compose landmark shots around their actual built context. A road-only
    // anchor can leave the hotel/terraces behind the camera after safe siting.
    const id=track.circuit.id,pit=track.group.getObjectByName('pit-building');
    if(pit&&(id==='silverstone'&&number===18||id==='montreal'&&number===14)){
      focus.lerp(pit.position,.75);focus.y+=7;
    }
    if(id==='monaco'&&number===8&&track.tunnel){
      focus.copy(track.roadPoint(track.tunnel.start+125/track.length));focus.y+=12;
    }
    const sites=track.group.userData.venueArchitecture?.sites as {name:string;frame:{p:THREE.Vector3}}[]|undefined;
    const site=sites?.find(s=>id==='spa'&&number===3&&s.name==='spa-raidillon-terraces'||id==='singapore'&&number===12&&s.name==='singapore-fullerton-colonnade');
    if(site){focus.lerp(site.frame.p,.6);focus.y+=id==='singapore'?9:4;}
    if(id==='suzuka'&&number===18){
      const wheel=track.group.getObjectByName('suzuka-ferris-wheel')?.userData.geographicAnchor?.placed as THREE.Vector3|undefined;
      if(wheel){focus.lerp(wheel,.55);focus.y+=16;}
    }
    // This basis stays fixed for the whole shot, including sharp chicanes.
    forward.copy(track.tangent(section.progress));normal.copy(track.roadNormal(section.progress));
    return {focus,forward,normal,name:section.name};
  }
  private prepareShot(){
    if(!this.track)return;
    const shot=this.shotFor(this.track,this.shotIndex);this.focus.copy(shot.focus);this.forward.copy(shot.forward);this.normal.copy(shot.normal);
    this.host.dataset.view=shot.name;this.host.dataset.viewIndex=String(this.shotIndex);
  }
  private warmWorld(world:BackdropWorld){
    const shot=this.shotFor(world.track,0),camera=this.camera.clone();
    this.poseCamera(0,world.track,camera,0,shot.focus,shot.forward,shot.normal);
    world.track.updatePresentation(camera.position,'medium');
    world.lighting.sun.target.position.copy(shot.focus);world.lighting.sun.position.copy(shot.focus).add(world.lighting.sunOffset);
    const exposure=this.renderer.toneMappingExposure,shadows=this.renderer.shadowMap.needsUpdate;
    try{
      this.renderer.toneMappingExposure=environmentFor(world.track.circuit.id).exposure;this.renderer.shadowMap.needsUpdate=true;
      // Prime the exact canvas shader variants, textures, geometry and shadows.
      // Restore the live scene in the same task, before the browser presents it.
      this.renderer.render(world.scene,camera);
    }finally{
      this.renderer.toneMappingExposure=exposure;this.renderer.shadowMap.needsUpdate=shadows;
      if(this.scene)this.renderer.render(this.scene,this.camera);
    }
  }
  private poseCamera(time:number,track=this.track,camera=this.camera,index=this.shotIndex,focus=this.focus,forwardAxis=this.forward,normal=this.normal){
    if(!track)return;
    // Drift around one fixed landmark. Following the instantaneous road tangent
    // spun the view in chicanes, and the old 12s shot index teleported the camera.
    // Within each view, slow continuous curves never reset the viewing angle.
    const forward=-85+18*Math.sin(time/24),side=(index%2===0?1:-1)*(45+18*Math.sin(time/35));
    const height=(environmentFor(track.circuit.id).city?62:42)+8*Math.sin(time/29);
    camera.position.copy(focus).addScaledVector(forwardAxis,forward).addScaledVector(normal,side);
    camera.position.y+=height;camera.lookAt(focus);
  }
  private resources(scene:THREE.Scene){
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const key of ['nearGeometry','farGeometry'])if(object.userData[key])geometries.add(object.userData[key]);if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);});
    for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
    return {geometries,materials,textures};
  }
  private disposeScene(scene:THREE.Scene){
    const used=this.resources(scene),retained=[...this.worlds.values()].map(world=>this.resources(world.scene));
    scene.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});
    const release=<T extends {dispose():void}>(resources:Set<T>,others:Set<T>[])=>{for(const resource of resources)if(!others.some(set=>set.has(resource)))resource.dispose();};
    release(used.geometries,retained.map(r=>r.geometries));release(used.materials,retained.map(r=>r.materials));release(used.textures,retained.map(r=>r.textures));
    scene.clear();
  }
  private releaseWorld(id:CircuitId){
    const world=this.worlds.get(id);if(!world)return;this.worlds.delete(id);
    world.lighting.dispose();this.disposeScene(world.scene);this.renderer.renderLists.dispose();
  }
  private clearWorld(){
    for(const id of this.worlds.keys())this.releaseWorld(id);
    this.scene=undefined;this.track=undefined;this.lighting=undefined;
  }
  dispose(){if(this.stopped)return;this.stopped=true;this.cancelPreload();cancelAnimationFrame(this.frame);window.clearTimeout(this.timer);window.clearTimeout(this.shotTimer);window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);this.clearOverlap();this.clearWorld();this.renderer.dispose();this.renderer.forceContextLoss();this.host.remove();}
}
