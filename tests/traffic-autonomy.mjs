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
globalThis.window={innerWidth:1280,innerHeight:720};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {Track}=await import(moduleURL('Track'));
const {Vehicle}=await import(moduleURL('Vehicle'));
const {Race}=await import(moduleURL('Race'));
const {LinePlanner}=await import(moduleURL('LinePlanner'));
const {CIRCUITS}=await import(moduleURL('Circuits'));
const {TrafficPlanner}=await import(moduleURL('TrafficPlanner'));
const {engineAcceleration}=await import(moduleURL('Powertrain'));
const {observeTraffic}=await import(moduleURL('DriverAgent'));
let referenceTrack;
for(const circuit of CIRCUITS){
 const track=new Track(new THREE.Scene(),circuit),planner=new LinePlanner(track);if(circuit.id==='monza')referenceTrack=track;
 for(const scenario of ['corner','sideways','clear-side','offroad','close','creeping','train']){
  const scene=new THREE.Scene(),race=new Race(track,scene,planner),player=new Vehicle(track,scene);race.state='racing';race.elapsed=20;race.balanceRivals=()=>{};
  const count=scenario==='train'?5:1,straight=circuit.id==='monza'?500:circuit.id==='silverstone'?120:650;
  const where=(scenario==='close'||scenario==='creeping'||scenario==='train'?straight:track.sections[0].progress*track.length);
  player.resetAt(where/track.length,scenario==='offroad'?12:0);player.offRoad=scenario==='offroad';if(scenario==='creeping')player.speed=3;if(scenario==='sideways')player.heading+=Math.PI/2;
  for(const [i,o] of race.opponents.entries()){
   if(i>=count){o.car.position.set(1e6+i*20,0,1e6);o.car.drive=()=>{};continue;}
   const lane=scenario==='clear-side'?-6:0;o.car.resetAt((where-(scenario==='close'?8:scenario==='train'?18+i*14:45))/track.length,lane);o.car.boost=0;o.lane=lane-race.speedPlanner.point(o.car.progress).sub(track.point(o.car.progress)).dot(track.normal(o.car.progress));
  }
  const active=race.opponents.slice(0,count);let offroad=0,seconds=0,reverseFrames=0;const sides=new Set();
  assert.equal(new Set(race.opponents.map(o=>o.agent.trafficPlanner)).size,11,'Every driver must own a distinct local planner');
  for(let k=0;k<120*30;k++){
   const positions=active.map(o=>o.car.position.clone());
   if(scenario==='creeping'){const drag=.00105*player.speed*player.speed+.35,engine=engineAcceleration(player.speed,false,player.transmission.sample.drive);player.drive(1/120,{steer:0,brake:0,throttle:THREE.MathUtils.clamp((drag+(3-player.speed)*2)/engine,0,1)});}
   race.update(1/120,player);seconds=(k+1)/120;
   for(const [i,o] of active.entries()){
    offroad+=o.car.offRoad?1:0;reverseFrames+=o.control.reverse?1:0;
    const lane=o.car.position.clone().sub(track.point(o.car.progress)).dot(track.normal(o.car.progress));if(Math.abs(lane)>2)sides.add(Math.sign(lane));
    assert.ok(o.car.position.distanceTo(positions[i])<1,'Autonomy must drive through physical positions, never teleport past traffic');
   }
   if(active.every(o=>(o.car.distance-player.distance)*track.length>18))break;
  }
  assert.ok(seconds<30,`${circuit.id} ${scenario}: every follower must find a way past a stalled player`);
  assert.equal(active.reduce((n,o)=>n+o.collisionCount,0),0,`${circuit.id} ${scenario}: avoidance must leave actual capsule clearance`);
  assert.equal(offroad,0,`${circuit.id} ${scenario}: routes must stay on the road`);
  if(scenario==='close')assert.ok(reverseFrames>0,'A car already queued too close must check behind and physically create steering room');
  if(scenario==='train'&&circuit.id==='monza')assert.equal(sides.size,2,'Individual traffic choices must use both available sides');
  console.log(`PASS: ${circuit.id} ${scenario}, ${count} physical driver(s) clear the obstacle in ${seconds.toFixed(2)}s without contacts or track departures`);
 }
}

const reversing=new Vehicle(referenceTrack,new THREE.Scene());reversing.resetAt(400/referenceTrack.length);const start=reversing.position.clone(),distance=reversing.distance;
for(let i=0;i<120*2;i++)reversing.drive(1/120,{throttle:.2,brake:0,steer:0,reverse:true});
assert.ok(reversing.speed>=-2.2&&reversing.speed<-.5);assert.ok(reversing.distance<distance);
assert.ok(start.distanceTo(reversing.position)>1&&start.distanceTo(reversing.position)<4.5);assert.equal(reversing.lap,1);
for(let i=0;i<120*2;i++)reversing.drive(1/120,{throttle:0,brake:1,steer:0});
assert.equal(reversing.speed,0,'Reverse must brake to rest before forward driving resumes');
console.log('PASS: bounded reverse acceleration and speed, real backward progress, unchanged lap credit and brake-to-rest transition');

const snapshot=observeTraffic([reversing])[0],heading=snapshot.heading;reversing.heading+=1;reversing.speed=20;
assert.equal(snapshot.heading,heading);assert.equal(snapshot.velocity.length(),0,'Planning must see the pre-physics velocity snapshot, independent of driver update order');
console.log('PASS: immutable heading/velocity observations shared at one physical instant');

// Identical opportunities have different outcomes for different personalities;
// an empty battery does not forbid a momentum pass using the stock engine.
const straight={length:6000,point:t=>new THREE.Vector3(0,0,t*6000),normal:()=>new THREE.Vector3(1,0,0),tangent:()=>new THREE.Vector3(0,0,1)};
const car={position:straight.point(.1),progress:.1,distance:.1,heading:0,speed:60,lateralSpeed:0,steerAngle:0,gripScale:1.4,gripUsage:0,offRoad:false,boost:0};
const opponent={...car,position:straight.point(.1+38/6000),progress:.1+38/6000,speed:27,velocity:new THREE.Vector3(0,0,27)};
const traffic=[{car:opponent,position:opponent.position.clone(),progress:opponent.progress,speed:27,heading:0,velocity:opponent.velocity}];
const aggressive=new TrafficPlanner(straight,{aggression:.95,caution:.25,phase:1,lineBias:0},straight);
const patient=new TrafficPlanner(straight,{aggression:.2,caution:.9,phase:1,lineBias:0},straight);
const attack=aggressive.update(car,traffic,50,60,true,()=>60),hold=patient.update(car,traffic,50,60,true,()=>60);
assert.equal(attack?.mode,'attack');assert.equal(hold,null,'A cautious driver must reject an overtake that takes too long');
assert.ok(Math.abs(attack.laneAt(.11)-opponent.position.x)>2.8);
console.log('PASS: private personality-dependent route decisions and actual momentum opportunities without extra ERS or top speed');

const stoppedCar={...car,speed:0};
const wall=(lane,heading=Math.PI/2,gap=20,speed=0)=>{
 const other={...stoppedCar,heading,speed,position:new THREE.Vector3(lane,0,600+gap),progress:(600+gap)/6000,velocity:new THREE.Vector3(0,0,speed),yawRate:0};
 return {car:other,position:other.position.clone(),progress:other.progress,speed,heading,velocity:other.velocity,yawRate:0};
};
const obstacles=[wall(-6),wall(0),wall(6)],blocked=new TrafficPlanner(straight,{aggression:.8,caution:.4,phase:0,lineBias:0},straight);
let waiting=blocked.update(stoppedCar,obstacles,50,40,true,()=>40);assert.equal(waiting.mode,'wait');
const closeCar={...stoppedCar,position:straight.point(.102),progress:.102,distance:.102};
waiting=blocked.update(closeCar,obstacles,51,40,true,()=>40);assert.equal(waiting.mode,'wait');assert.equal(blocked.recoveries,0,'A fully blocked road must not trigger endless back-and-forth attempts');
const open=blocked.update(closeCar,obstacles.slice(1),52,40,true,()=>40);assert.equal(open.mode,'backout','Opening a side corridor must release a stopped car’s private recovery plan');
const rear=wall(0,0,4,12),boxed=new TrafficPlanner(straight,{aggression:.8,caution:.4,phase:0,lineBias:0},straight);
const unsafeReverse=boxed.update(closeCar,[...obstacles.slice(1),rear],52,40,true,()=>40);assert.notEqual(unsafeReverse.mode,'backout','A fast car close behind must forbid backing into its path');
console.log('PASS: no invented path through a blocked road, independent replanning when a lane opens and rear-clearance checks before backing');

const cautiousCorner=new TrafficPlanner(straight,{aggression:.95,caution:.25,phase:1,lineBias:0},straight);
assert.equal(cautiousCorner.update(car,traffic,50,34,true,()=>27),null,'Legitimate corner braking is not evidence of a slow opponent to pass');
const turning=wall(0,.7,25,27);turning.velocity=new THREE.Vector3(Math.sin(.7)*27,0,Math.cos(.7)*27);
const noFalseSpin=new TrafficPlanner(straight,{aggression:.95,caution:.25,phase:1,lineBias:0},straight);
assert.equal(noFalseSpin.update(car,[turning],50,34,false,()=>34),null,'A normal body/velocity alignment with a large centreline heading difference is not a spin');
console.log('PASS: normal corner heading and braking do not become fake accidents or spurious overtaking opportunities');

const reorder=new TrafficPlanner(straight,{aggression:.95,caution:.25,phase:1,lineBias:0},straight),reorder2=new TrafficPlanner(straight,{aggression:.95,caution:.25,phase:1,lineBias:0},straight);
const behind=wall(6,0,-30,25),first=reorder.update(car,[...traffic,behind],50,60,true,()=>60),second=reorder2.update(car,[behind,...traffic],50,60,true,()=>60);
assert.equal(first.mode,second.mode);assert.equal(first.laneAt(.11),second.laneAt(.11));
assert.notEqual(reorder.stationary,reorder2.stationary);reorder.reset();assert.equal(reorder.mode,'clear');assert.equal(reorder.routesChosen,0);assert.equal(reorder.recoveries,0);
console.log('PASS: snapshot iteration-order independence, private route memory and complete race reset');

const mergingPlanner=new TrafficPlanner(straight,{aggression:.8,caution:.4,phase:0,lineBias:0},straight);
mergingPlanner.mergeUntil=53;
const alongsideCar={...car,speed:30,position:new THREE.Vector3(4.023,0,600)};
const alongsideTraffic=wall(0,0,0,30),merge=mergingPlanner.update(alongsideCar,[alongsideTraffic],50,40,true,()=>40);
assert.equal(merge.mode,'merge');assert.ok(merge.laneAt(.11)>3.8,'An occupied rejoin corridor must retain the free parallel lane');assert.ok(merge.speed>30,'A safe parallel lane must allow progress instead of mirroring the other car forever');
console.log('PASS: occupied rejoin lane holds a free parallel corridor and continues racing without a forced stop');
