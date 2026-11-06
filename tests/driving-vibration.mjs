import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
const cache=new Map();
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  const source=fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`);
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(name.startsWith('../ui/')?'../ui/'+dep:dep)}'`);
  js=js.replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  js=js.replace(/from '\.\.\/ui\/(\w+)'/g,(_,dep)=>`from '${moduleURL('../ui/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}

const {DrivingFeedback}=await import(moduleURL('DrivingFeedback')),{drivingVibrationGain}=await import(moduleURL('DrivingVibration')),{WheelHaptics,RumbleOutput}=await import(moduleURL('WheelRumble'));
const track={length:1000,kerbContact:()=>0};
const telemetry=gear=>({speed:70,distance:.123,progress:.123,lateralSpeed:0,lateralAcceleration:0,acceleration:0,gripUsage:.2,brake:0,throttle:.5,offRoad:false,impactSerial:0,impactStrength:0,transmission:{simulated:true,sample:{gear,rpm:9000,cut:1,blip:0,load:.5,engine:.1}}});
const oldRoad=Math.sin(123/12*Math.PI*2)*.003+Math.sin(123/7.7*Math.PI*2)*.0015;
let previous=0;
for(let gear=1;gear<=8;gear++){
 const car=telemetry(gear),before=JSON.stringify(car),motion=new DrivingFeedback(),frame=motion.update(car,track,1/120,true),gain=drivingVibrationGain(gear);
 assert.ok(gain>previous);previous=gain;assert.ok(Math.abs(frame.heave/(oldRoad*.6)-gain)<1e-10);assert.ok(Math.abs(frame.surfaceHeave-oldRoad*.6)<1e-10,'Engine vibration must not turn flat painted kerbs into large chassis bounces');assert.equal(frame.engine.gear,gear);assert.equal(JSON.stringify(car),before);
 motion.strength=0;assert.equal(motion.update(car,track,1/120,true).surfaceHeave,0);motion.strength=.6;assert.equal(motion.update(car,track,1/120,false).surfaceHeave,0);
 const sent=[],output=new RumbleOutput('usb',async(strong,weak)=>sent.push({strong,weak})),haptic=new WheelHaptics();haptic.strength=1;
 const device={id:'test',connected:true,inputsReady:true,rumble:output};haptic.update(device,car,frame,.1,true);await new Promise(r=>setImmediate(r));
 assert.ok(Math.abs(sent[0].weak-(.02+.5*.045)*gain)<1e-10);haptic.update(device,car,frame,.1,false);await new Promise(r=>setImmediate(r));assert.equal(sent.at(-1).weak,0);haptic.stop();
}
assert.equal(drivingVibrationGain(1),3);assert.equal(drivingVibrationGain(8),6);assert.equal(drivingVibrationGain(NaN),3);assert.equal(drivingVibrationGain(99),6);
console.log('PASS: 3x first-gear continuous vibration, linear 1–8 gear growth, matching screen/wheel gain, unchanged telemetry, disabled settings and pause stop');
