import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
const cache=new Map();
function moduleURL(name){
  if(name==='../ui/Settings')return 'data:text/javascript,'+encodeURIComponent('export function readSettings(){return {}};export function openSettings(){};export function applyHUDScale(){};export function confirmRaceAction(message,action){action()}');
  if(cache.has(name))return cache.get(name);
  const source=fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`);
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(name.startsWith('../ui/')?'../ui/'+dep:dep)}'`);
  js=js.replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  js=js.replace(/from '\.\.\/ui\/(\w+)'/g,(_,dep)=>`from '${moduleURL('../ui/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
globalThis.window={innerWidth:1280,innerHeight:720};
globalThis.document={querySelector:()=>null,documentElement:{dataset:{}},createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};

const {Track}=await import(moduleURL('Track')),{LinePlanner}=await import(moduleURL('LinePlanner')),{Vehicle}=await import(moduleURL('Vehicle')),{AcademyDrive}=await import(moduleURL('AcademyDrive')),{HANDLING,steeringLock}=await import(moduleURL('Dynamics'));
const scene=new THREE.Scene(),track=new Track(scene),planner=new LinePlanner(track),car=new Vehicle(track,scene);
let control={throttle:0,brake:0,steer:0,boost:false};const input={analog:()=>control,consume:()=>false,down:(...keys)=>control.boost&&keys.includes('ShiftLeft')};
const steer=()=>{const look=Math.max(9,Math.min(26,7+car.speed*.3)),to=(car.ersEnabled?track.point(car.progress+look/track.length).addScaledVector(track.normal(car.progress+look/track.length),-1.8):planner.point(car.progress+look/track.length)).sub(car.position),desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading)),angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));return Math.max(-1,Math.min(1,(angle-car.yawRate*.018)/steeringLock(car.speed,car.gripScale)));};
for(let lesson=0;lesson<4;lesson++){
 const trial=new AcademyDrive(track,car,planner,lesson,scene);let gates=0,max=0;
 for(let tick=0;tick<120*50&&!['success','failed'].includes(trial.phase);tick++){
  const status=trial.status;control={throttle:0,brake:0,steer:0,boost:false};
  if(status.phase==='waiting'){
   const pose=car.position.clone(),energy=car.boost;for(let i=0;i<5;i++)trial.step(1/120,input);assert.equal(car.position.distanceTo(pose),0);assert.equal(car.boost,energy);gates++;
   control=status.key.startsWith('브레이크 놓기')?{throttle:0,brake:0,steer:.3,boost:false}:lesson===1?{throttle:0,brake:1,steer:0,boost:false}:{throttle:1,brake:0,steer:steer(),boost:lesson===3};
  }else if(status.phase==='driving')control={throttle:lesson===1?car.speed<19?.25:0:1,brake:lesson===1&&car.speed>trial.target*1.1?1:0,steer:steer(),boost:lesson===3};
  trial.step(1/120,input);max=Math.max(max,car.kmh);
 }
 console.log('Trial physics',lesson,{phase:trial.phase,cue:trial.status.cue,max,gates,metres:car.distance*track.length,apex:trial.apex,exit:trial.exit,speed:car.kmh,gap:trial.status.gap});assert.equal(trial.phase,'success');assert.ok(gates>=1);
 const update=car.update,pose=car.position.clone();car.update=()=>{throw Error('Manual input after success');};for(let i=0;i<30;i++)trial.step(1/120,input);assert.ok(car.position.distanceTo(pose)>0);car.update=update;trial.opponent?.group.removeFromParent();
}
car.ersEnabled=false;car.resetAt(.02);car.boost=100;car.speed=40;car.drive(1/120,{throttle:1,brake:0,steer:0,boost:true});assert.equal(car.boosting,false);assert.equal(car.boost,100);
console.log('PASS actual four-test vehicle physics, frozen input cues, disabled energy and continued input-free success motion');

const steeringCue=new AcademyDrive(track,car,planner,1,scene);steeringCue.turnGate=true;steeringCue.phase='waiting';control={throttle:0,brake:0,steer:.2,boost:false};steeringCue.step(1/120,input);assert.equal(steeringCue.phase,'waiting');assert.equal(steeringCue.status.releaseRequired,true,'The prompt must use the same .15 steering threshold as its action gate');control.steer=0;steeringCue.step(1/120,input);assert.equal(steeringCue.status.releaseRequired,false);
console.log('PASS steering release prompt matches actual gate activation');
