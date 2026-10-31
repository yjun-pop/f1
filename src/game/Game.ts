import * as THREE from 'three';
import {DrivingAudio} from './DrivingAudio';
import {DrivingFeedback} from './DrivingFeedback';
import {Input} from './Input';
import {transmissionMode,type TransmissionMode} from './Powertrain';
import {Track} from './Track';
import {selectedCircuit,circuitById,circuitURL,type CircuitId} from './Circuits';
import {Vehicle} from './Vehicle';
import {CockpitCamera} from './Camera';
import {RacingLine} from './RacingLine';
import {Race} from './Race';
import {HUD} from '../ui/HUD';
import {RearViewMirror} from './RearViewMirror';
import {WorldLighting} from './WorldLighting';
import {GraphicsQuality,graphicsMode,recommendedTier,renderPixelRatio,type GraphicsMode} from './Graphics';
import {ShadowBudget} from './ShadowBudget';
import {setSurfaceQuality} from './SurfaceTextures';
export class Game {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();private input=new Input();private track:Track;private vehicle:Vehicle;private cockpit:CockpitCamera;private line:RacingLine;private hud:HUD;private race:Race;
  private mirror:RearViewMirror;
  private audio=new DrivingAudio();private feedback=new DrivingFeedback();
  private sun:THREE.DirectionalLight;
  private graphics:GraphicsQuality;private lighting:WorldLighting;
  private paused=false;private changingCircuit=false;private previous=performance.now();private accumulator=0;
  private shadows=new ShadowBudget();private sceneAge=Infinity;private scenePosition=new THREE.Vector3(Infinity,0,0);private hudAge=Infinity;private hudStamp='';
  constructor(container:HTMLElement,hudRoot:HTMLElement,options:{circuit?:CircuitId;autoStart?:boolean;transmission?:TransmissionMode;audioContext?:AudioContext}={}){
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.setSize(window.innerWidth,window.innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(this.renderer.domElement);
    let savedGraphics:unknown;try{savedGraphics=localStorage.getItem('apex-graphics-quality');}catch{}
    this.graphics=new GraphicsQuality(graphicsMode(savedGraphics),recommendedTier({memory:(navigator as Navigator&{deviceMemory?:number}).deviceMemory,cores:navigator.hardwareConcurrency,maxTextureSize:this.renderer.capabilities.maxTextureSize,width:window.innerWidth}));
    this.lighting=new WorldLighting(this.scene,this.renderer,this.graphics.tier);this.sun=this.lighting.sun;
    this.renderer.shadowMap.autoUpdate=false;
    void this.lighting.loadSky(new URL('../assets/park-sky.hdr',import.meta.url).href);
    let savedCircuit:unknown;try{savedCircuit=localStorage.getItem('apex-circuit');}catch{}
    this.track=new Track(this.scene,options.circuit?circuitById(options.circuit):selectedCircuit(window.location.search,savedCircuit));this.vehicle=new Vehicle(this.track,this.scene);this.cockpit=new CockpitCamera(this.scene);this.line=new RacingLine(this.track,this.scene);this.race=new Race(this.track,this.scene,this.line.planner);
    try{localStorage.setItem('apex-circuit',this.track.circuit.id);}catch{}
    try{
      const saved=localStorage.getItem('apex-motion-strength');
      this.feedback.strength=saved!==null&&Number.isFinite(Number(saved))?Math.max(0,Math.min(1,Number(saved))):window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:.6;
    }catch{this.feedback.strength=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:.6;}
    try{this.vehicle.setTransmissionMode(transmissionMode(localStorage.getItem('apex-transmission-mode')));}catch{}
    if(options.transmission)this.vehicle.setTransmissionMode(options.transmission);
    this.hud=new HUD(hudRoot,this.track,{start:id=>{if(id!==this.track.circuit.id){this.selectCircuit(id,true);return;}if(this.race.state==='finished')this.restart();this.race.start();},restart:()=>this.restart(),camera:()=>this.cockpit.toggle(),resume:()=>this.resume(),recover:()=>{this.vehicle.recover();this.feedback.reset();this.resume();},volume:value=>this.audio.setVolume(value),audioLevel:this.audio.level,motionLevel:this.feedback.strength,motion:value=>{this.feedback.strength=value;try{localStorage.setItem('apex-motion-strength',String(value));}catch{}},graphicsMode:this.graphics.mode,graphicsTier:this.graphics.tier,graphics:mode=>this.selectGraphics(mode),transmissionMode:this.vehicle.transmission.mode,transmission:mode=>this.selectTransmission(mode),menu:()=>this.selectCircuit(this.track.circuit.id),wheel:()=>this.openWheelSettings()});
    this.mirror=new RearViewMirror(this.renderer,this.scene,hudRoot.querySelector<HTMLElement>('#rearview-viewport')!);
    this.applyGraphics();
    const unlockAudio=()=>this.audio.unlock([this.vehicle,...this.race.opponents.map(o=>o.car)]);
    window.addEventListener('pointerdown',unlockAudio);window.addEventListener('keydown',unlockAudio);
    window.addEventListener('resize',()=>{this.applyGraphics();this.cockpit.resize();});
    window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    if(options.audioContext)this.audio.unlock([this.vehicle,...this.race.opponents.map(o=>o.car)],options.audioContext);
    if(options.autoStart)this.race.start();
    requestAnimationFrame(this.frame);
  }
  private selectCircuit(id:CircuitId,autoStart=false){
    const next=circuitById(id);
    this.changingCircuit=true;this.paused=true;this.input.clear();this.accumulator=0;this.audio.silence();
    try{localStorage.setItem('apex-circuit',next.id);}catch{}
    // Navigation owns world teardown: only one circuit/renderer/audio graph
    // remains alive, including after repeated swaps on lower-memory devices.
    this.hud.showCircuitLoading(next.label);
    window.location.assign(circuitURL(window.location.href,next.id,autoStart));
  }
  private selectTransmission(mode:TransmissionMode){this.vehicle.setTransmissionMode(mode);this.hud.setTransmissionMode(mode);try{localStorage.setItem('apex-transmission-mode',mode);}catch{}}
  private openWheelSettings(){
    this.pause();this.input.clear();
    void import('../ui/WheelSetup').then(module=>module.openWheelSetup()).catch(error=>{console.error(error);this.hud.setWheelStatus('휠 설정을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');});
  }
  private selectGraphics(mode:GraphicsMode){this.graphics.select(mode);try{localStorage.setItem('apex-graphics-quality',mode);}catch{}this.applyGraphics();}
  private applyGraphics(){
    setSurfaceQuality(this.graphics.tier,this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio,window.innerWidth,window.innerHeight,this.graphics.tier,this.graphics.renderScale));this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.lighting.setQuality(this.graphics.tier);this.mirror.setQuality(this.graphics.tier);this.hud.setGraphics(this.graphics.mode,this.graphics.tier);
    this.cockpit.camera.far=this.graphics.profile.viewFar;this.cockpit.camera.updateProjectionMatrix();
    this.vehicle.setGraphics(this.graphics.tier);for(const rival of this.race.opponents)rival.car.setGraphics(this.graphics.tier);this.shadows.invalidate();
    for(const rival of this.race.opponents)rival.car.setPresentation(rival.car.position.distanceTo(this.vehicle.position),this.graphics.tier);
    this.track.updatePresentation(this.vehicle.position,this.graphics.tier);
  }
  private pause(){if(this.race.state==='racing'||this.race.state==='countdown'){this.paused=true;this.audio.silence();this.accumulator=0;this.input.clear();}}
  private resume(){this.paused=false;this.accumulator=0;this.previous=performance.now();this.input.clear();}
  private restart(){this.audio.silence();this.feedback.reset();this.vehicle.reset();this.race.reset();this.paused=false;this.accumulator=0;this.input.clear();}
  private pollWheel(){if(this.input.poll()||this.input.wheel.configuring)this.pause();}
  private frame=(now:number)=>{
    if(this.changingCircuit)return;
    const elapsed=(now-this.previous)/1000,dt=Math.max(0,Math.min(elapsed,.04));this.previous=now;
    this.pollWheel();
    if(this.input.consume('Escape')){if(this.paused)this.resume();else this.pause();}
    if(this.input.consume('Enter')){if(this.paused)this.resume();else if(this.race.state==='ready'||this.race.state==='finished')this.hud.startSelectedCircuit();}
    if(this.input.consume('KeyR')&&!this.paused&&this.race.state==='racing'){this.vehicle.recover();this.feedback.reset();}
    if(this.input.consume('KeyM')){this.audio.toggleMute();this.hud.setMuted(this.audio.isMuted);}
    if(this.input.consume('KeyT'))this.selectTransmission(this.vehicle.transmission.mode==='auto'?'manual':'auto');
    if(this.paused||this.race.state!=='racing'){this.input.consume('KeyQ');this.input.consume('KeyE');this.input.consume('KeyF');}
    if(this.input.consume('KeyG'))this.line.toggle();if(this.input.consume('KeyC'))this.cockpit.toggle();
    if(!this.paused){this.accumulator+=dt;while(this.accumulator>=1/120){if(this.race.state==='racing'){this.race.prepareAerodynamics(this.vehicle);this.vehicle.update(1/120,this.input);}this.race.update(1/120,this.vehicle);this.accumulator-=1/120;}}
    const feedback=this.feedback.update(this.vehicle,this.track,dt,!this.paused&&this.race.state==='racing');
    this.audio.update(this.vehicle,!this.paused&&(this.race.state==='racing'||this.race.state==='countdown'),feedback);
    this.audio.updateStart(this.race.startSignal,!this.paused);this.track.setStartLights(this.race.startSignal.lights);
    this.vehicle.present(feedback.surfaceHeave);
    if(this.graphics.observe(elapsed,!this.paused&&this.race.state==='racing'))this.applyGraphics();
    this.sceneAge+=dt;
    if(this.sceneAge>=.1||this.scenePosition.distanceToSquared(this.vehicle.position)>400){this.track.updatePresentation(this.vehicle.position,this.graphics.tier);for(const rival of this.race.opponents)rival.car.setPresentation(rival.car.position.distanceTo(this.vehicle.position),this.graphics.tier);this.scenePosition.copy(this.vehicle.position);this.sceneAge=0;}
    // Keep a small, texel-stable shadow volume around the player, not the full circuit.
    if(this.shadows.shouldRefresh(this.vehicle.position,this.lighting.sunOffset,this.graphics.tier==='high'&&!this.paused&&this.race.state==='racing')){
      const texel=130/this.sun.shadow.mapSize.x,x=Math.round(this.vehicle.position.x/texel)*texel,z=Math.round(this.vehicle.position.z/texel)*texel;
      this.sun.target.position.set(x,0,z);this.sun.position.set(x,0,z).add(this.lighting.sunOffset);this.renderer.shadowMap.needsUpdate=true;
    }
    this.cockpit.update(this.vehicle,dt,feedback);this.line.update(this.vehicle);
    const hudStamp=`${this.race.state}/${this.paused}/${this.cockpit.mode}`;this.hudAge+=dt;
    if(this.hudAge>=.1||hudStamp!==this.hudStamp){this.hud.update(this.vehicle,this.race,this.paused,this.track,this.cockpit.mode);this.hud.setWheelStatus(this.input.wheel.status,!!this.input.wheel.profile?.enabled&&!this.input.wheel.armed&&!this.paused);this.hudAge=0;this.hudStamp=hudStamp;}
    this.renderer.render(this.scene,this.cockpit.camera);this.mirror.render(this.vehicle,!this.paused&&this.race.state==='racing'?dt:0);requestAnimationFrame(this.frame);
  };
}
