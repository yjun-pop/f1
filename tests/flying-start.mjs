import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const cache=new Map(),three=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  let source=ts.transpileModule(fs.readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  source=source.replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`).replace(/from 'three'/g,`from '${three}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(name.split('/')[0]+'/'+dep)}'`).replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL('game/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;cache.set(name,url);return url;
}
globalThis.window={innerWidth:1280,innerHeight:720};globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};globalThis.localStorage={getItem:()=>null,setItem(){}};
const {Track}=await import(moduleURL('game/Track')),{Vehicle}=await import(moduleURL('game/Vehicle')),{LinePlanner}=await import(moduleURL('game/LinePlanner')),{Race}=await import(moduleURL('game/Race'));
const {CIRCUITS}=await import(moduleURL('game/Circuits'));
const {CockpitCamera}=await import(moduleURL('game/Camera')),{DrivingFeedback}=await import(moduleURL('game/DrivingFeedback')),{VehiclePose}=await import(moduleURL('game/VehiclePose'));
for(const circuit of CIRCUITS){
 const scene=new THREE.Scene(),track=new Track(scene,circuit),car=new Vehicle(track,scene),planner=new LinePlanner(track),race=new Race(track,scene,planner,{player:car,totalLaps:1,flyingStart:true,opponentCount:0});
 const camera=new CockpitCamera(scene),feedback=new DrivingFeedback(),pose=new VehiclePose();car.setTransmissionMode('manual');pose.capture(car);race.start();assert.equal(race.countdown,4);assert.equal(race.startSignal.lights,1);let time=0,previousCamera,previousRotation;
 while(race.state==='countdown'&&time<70){
  const position=car.position.clone(),speed=car.speed;pose.capture(car);race.update(1/120,car);time+=1/120;
  if(race.state==='countdown'){assert.equal(race.startSignal.lights,Math.min(4,1+Math.floor(time+1e-8)),circuit.id+' lights must follow seconds, not distance');assert.equal(race.elapsed,0);}
  assert.equal(car.offRoad,false,circuit.id+' departure');assert.equal(car.impactSerial,0,circuit.id+' wall impact');
  assert.ok(position.distanceTo(car.position)<Math.max(speed,car.speed)/120*1.5+.02,circuit.id+' position warp');assert.equal(car.transmission.mode,'manual');
  const physical=car.position.clone();camera.update(car,1/120,feedback.update(car,track,1/120,true),pose.present(car,.5));assert.ok(car.position.equals(physical),'Rendering must not change physical position');
  if(previousCamera){assert.ok(camera.camera.position.distanceTo(previousCamera)<2,circuit.id+' camera jump');assert.ok(camera.camera.quaternion.angleTo(previousRotation)<.08,circuit.id+' camera angle jump');}
  previousCamera=camera.camera.position.clone();previousRotation=camera.camera.quaternion.clone();
 }
 assert.ok(Math.abs(time-4)<1/60,circuit.id+' visible start must match the original four-second signals');assert.equal(race.state,'racing',circuit.id+' failed handoff');assert.ok(race.elapsed>=0&&race.elapsed<1/120);assert.equal(race.startSignal.lights,5);assert.equal(race.classification[0].completed,0);assert.equal(race.classification[0].best,null);assert.equal(car.boost,100);assert.ok(car.speed>55&&car.speed<=94);assert.ok(car.transmission.gear>1);
 if(circuit.id==='monza')assert.ok(car.speed>80,'Monza must cross close to the physically attainable speed');
 pose.capture(car);const speed=car.speed;car.update(1/120,{down:()=>false,consume:()=>false});race.update(1/120,car);camera.update(car,1/120,feedback.update(car,track,1/120,true),pose.present(car,.5));assert.ok(Math.abs(car.speed-speed)<1);assert.ok(camera.camera.position.distanceTo(previousCamera)<2);assert.ok(camera.camera.quaternion.angleTo(previousRotation)<.08);
 race.reset();assert.ok(car.distance<0);assert.equal(car.transmission.mode,'manual');assert.equal(race.classification[0].lapTimes.length,0);
 console.log('PASS physical flying start',{circuit:circuit.id,runIn:Math.round(race.flyingController.runIn),seconds:time.toFixed(2),lineKmh:Math.round(speed*3.6)});
}
for(const circuit of [CIRCUITS[0],CIRCUITS[1],CIRCUITS[3]]){
 const scene=new THREE.Scene(),track=new Track(scene,circuit),car=new Vehicle(track,scene),race=new Race(track,scene,new LinePlanner(track),{player:car,totalLaps:1,flyingStart:true,opponentCount:11});race.start();const cars=[car,...race.opponents.map(o=>o.car)];let time=0,minGap=Infinity;
 while(race.state==='countdown'&&time<90){race.update(1/120,car);time+=1/120;for(let a=0;a<cars.length;a++){assert.equal(cars[a].offRoad,false);assert.equal(cars[a].impactSerial,0);for(let b=a+1;b<cars.length;b++)minGap=Math.min(minGap,cars[a].position.distanceTo(cars[b].position));}}
 assert.equal(race.state,'racing');assert.ok(Math.abs(time-4)<1/60,'Full field must use the same four-second sequence');assert.ok(minGap>4.3,`${circuit.id} warmup overlap ${minGap}`);console.log('PASS twelve-car physical run-in',{circuit:circuit.id,seconds:time.toFixed(2),minGap});
}
for(const fps of [60,120,144]){
 const car={position:new THREE.Vector3(),heading:0,group:new THREE.Group()},pose=new VehiclePose();pose.capture(car);let accumulator=0,last;
 for(let frame=0;frame<fps;frame++){accumulator+=1/fps;while(accumulator>=1/120){pose.capture(car);car.position.z+=70/120;accumulator-=1/120;}pose.present(car,accumulator*120);if(frame>2)assert.ok(Math.abs(car.group.position.z-last-70/fps)<1e-8,'Render pose must advance even on 144Hz frames without a physics step');last=car.group.position.z;}
 pose.capture(car);car.heading=Math.PI*2-.01;pose.present(car,.5);assert.ok(Math.abs(pose.heading)<.01,'Yaw interpolation must use the short arc');pose.capture(car);car.position.z+=100;pose.present(car,.1);assert.equal(car.group.position.z,car.position.z,'Recovery must not fly through the world');
}
console.log('PASS render interpolation at 60/120/144Hz, camera/vehicle alignment, short-arc yaw and teleport reset');

for(const fps of [30,60,120,144,165]){
 const cars=[0,1].map(i=>({position:new THREE.Vector3(i*3.5,0,i*2),heading:0,group:new THREE.Group()})),poses=cars.map(car=>{const pose=new VehiclePose();pose.capture(car);return pose;});let accumulator=0;
 for(let frame=0;frame<fps;frame++){accumulator+=1/fps;while(accumulator>=1/120){cars.forEach((car,i)=>{poses[i].capture(car);car.position.z+=70/120;});accumulator-=1/120;}cars.forEach((car,i)=>poses[i].present(car,accumulator*120));assert.ok(cars[1].group.position.clone().sub(cars[0].group.position).distanceTo(new THREE.Vector3(3.5,0,2))<1e-8,'Parallel cars must stay at the same render time');}
}
console.log('PASS parallel vehicle render timing at 30/60/120/144/165Hz');
