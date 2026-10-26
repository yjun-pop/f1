import * as THREE from 'three';
import {Input} from './Input';
import {Track} from './Track';
import {Vehicle} from './Vehicle';
import {CockpitCamera} from './Camera';
import {RacingLine} from './RacingLine';
import {Race} from './Race';
import {HUD} from '../ui/HUD';
export class Game {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();private input=new Input();private track:Track;private vehicle:Vehicle;private cockpit:CockpitCamera;private line:RacingLine;private hud:HUD;private race:Race;
  private paused=false;private previous=performance.now();private accumulator=0;
  constructor(container:HTMLElement,hudRoot:HTMLElement){
    this.scene.background=new THREE.Color(0x070d19);this.scene.fog=new THREE.Fog(0x101a29,110,650);
    this.scene.add(new THREE.HemisphereLight(0xaac7ec,0x152333,1.5));
    const sun=new THREE.DirectionalLight(0xe4efff,3.2);sun.position.set(-100,180,-80);this.scene.add(sun);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.setSize(window.innerWidth,window.innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;container.appendChild(this.renderer.domElement);
    this.track=new Track(this.scene);this.vehicle=new Vehicle(this.track,this.scene);this.cockpit=new CockpitCamera(this.scene);this.line=new RacingLine(this.track,this.scene);this.race=new Race(this.track,this.scene,this.line.planner);
    this.hud=new HUD(hudRoot,this.track,{start:()=>{if(this.race.state==='finished')this.restart();this.race.start();},restart:()=>this.restart(),camera:()=>this.cockpit.toggle(),resume:()=>this.resume(),recover:()=>{this.vehicle.recover();this.resume();},height:value=>this.cockpit.eyeHeight=value});
    window.addEventListener('resize',()=>{this.renderer.setSize(window.innerWidth,window.innerHeight);this.cockpit.resize();});
    window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    requestAnimationFrame(this.frame);
  }
  private pause(){if(this.race.state==='racing'||this.race.state==='countdown'){this.paused=true;this.accumulator=0;this.input.clear();}}
  private resume(){this.paused=false;this.accumulator=0;this.previous=performance.now();this.input.clear();}
  private restart(){this.vehicle.reset();this.race.reset();this.paused=false;this.accumulator=0;this.input.clear();}
  private frame=(now:number)=>{
    const dt=Math.max(0,Math.min((now-this.previous)/1000,.04));this.previous=now;
    if(this.input.consume('Escape')){if(this.paused)this.resume();else this.pause();}
    if(this.input.consume('Enter')){if(this.paused)this.resume();else{if(this.race.state==='finished')this.restart();this.race.start();}}
    if(this.input.consume('KeyR')&&!this.paused&&this.race.state==='racing')this.vehicle.recover();
    if(this.input.consume('KeyG'))this.line.toggle();if(this.input.consume('KeyC'))this.cockpit.toggle();
    if(!this.paused){this.accumulator+=dt;while(this.accumulator>=1/120){if(this.race.state==='racing')this.vehicle.update(1/120,this.input);this.race.update(1/120,this.vehicle);this.accumulator-=1/120;}}
    this.cockpit.update(this.vehicle,dt);this.line.update(this.vehicle);this.hud.update(this.vehicle,this.race,this.paused,this.track,this.line,this.cockpit.mode);this.renderer.render(this.scene,this.cockpit.camera);requestAnimationFrame(this.frame);
  };
}
