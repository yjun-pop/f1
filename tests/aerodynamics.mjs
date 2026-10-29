import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const cache=new Map(),threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  const source=fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
const {AeroState,RaceAerodynamics,aerodynamicDrag,advanceAero}=await import(moduleURL('Aerodynamics'));
const {integrateBody}=await import(moduleURL('Dynamics'));
const length=6000,track={length,point:t=>new THREE.Vector3(0,0,((t%1+1)%1)*length)};
const planner={apices:[1000,1100,1600,2000,2100,2600,3000,4100,4200,4300,5350].map(m=>({progress:m/length}))};
const makeCar=(metres=0)=>({aero:new AeroState(),position:new THREE.Vector3(),speed:60,offRoad:false,heading:0,distance:metres/length,progress:((metres/length)%1+1)%1});
function place(car,metres,x=0){car.distance=metres/length;car.progress=((car.distance%1)+1)%1;car.position.copy(track.point(car.progress));car.position.x=x;}
function detection(seconds,fps=60,lap=1,zoneIndex=0,reverse=false){
  const aero=new RaceAerodynamics(track,planner),zone=aero.zones[zoneIndex],front=makeCar(),rear=makeCar();
  const start=lap*length+zone.detection-30,behind=seconds*60,stop=zone.start-zone.detection+85;
  let qualifiedBeforeZone=false;
  for(let i=0;i<=Math.ceil((stop+behind)/60*fps);i++){
    const t=i/fps;place(front,start+t*60);place(rear,start+t*60-behind);
    aero.update(reverse?[rear,front]:[front,rear],100+t,true);
    if(rear.distance*length<lap*length+zone.start)qualifiedBeforeZone ||= rear.aero.qualified&&!rear.aero.available;
  }
  return {aero,zone,front,rear,qualifiedBeforeZone,time:100+Math.ceil((stop+behind)/60*fps)/fps};
}
for(const fps of [30,60,144])for(const zone of [0,1]){
  const inside=detection(1,fps,1,zone),outside=detection(1.02,fps,1,zone),firstLap=detection(.5,fps,0,zone),reordered=detection(1,fps,1,zone,true);
  assert.equal(inside.rear.aero.available,true,'One second at the exact detection line must qualify');
  assert.equal(inside.front.aero.available,false,'A lone leading car must not receive DRS');
  assert.equal(inside.qualifiedBeforeZone,true,'Entitlement is earned before activation');
  assert.equal(outside.rear.aero.available,false);assert.equal(firstLap.rear.aero.available,false);
  assert.equal(reordered.rear.aero.available,inside.rear.aero.available,'Iteration order must not decide entitlement');
  assert.equal(inside.rear.aero.zone,inside.zone.id);
}
console.log('PASS: two Monza zones, interpolated one-second detection, first-lap lockout, pre-zone qualification, lap seam and 30/60/144fps');

for(const zoneIndex of [0,1]){
  const earned=detection(.7,60,1,zoneIndex);let time=earned.time;
  let end=Math.floor(earned.rear.distance)*length+earned.zone.end;
  if(end<earned.rear.distance*length)end+=length;
  while(earned.rear.distance*length<end+2){
    time+=1/60;place(earned.front,earned.front.distance*length+1);place(earned.rear,earned.rear.distance*length+1);
    earned.aero.update([earned.front,earned.rear],time,true);
  }
  assert.equal(earned.rear.aero.available,false);assert.equal(earned.rear.aero.active,false);
}
const retained=detection(.7);let retainedTime=retained.time;
for(let i=0;i<120;i++){
  retainedTime+=1/60;place(retained.front,retained.front.distance*length+2);place(retained.rear,retained.rear.distance*length+1);
  retained.aero.update([retained.front,retained.rear],retainedTime,true);
}
assert.equal(retained.rear.aero.available,true,'Widening the current gap must not revoke a valid detection-line entitlement');
const missed=detection(1.1);let missedTime=missed.time;
for(let i=0;i<60;i++){
  missedTime+=1/60;place(missed.front,missed.front.distance*length+1);place(missed.rear,missed.rear.distance*length+1.8);
  missed.aero.update([missed.front,missed.rear],missedTime,true);
}
assert.equal(missed.rear.aero.available,false,'Catching up after a missed detection cannot manufacture entitlement');
const resetPair=detection(.6);resetPair.rear.aero.reset();resetPair.aero.update([resetPair.front,resetPair.rear],resetPair.time+.01,true);
assert.equal(resetPair.rear.aero.qualified,false,'Recovering/restarting must remove old DRS permission');
const teleported=detection(.6);place(teleported.rear,teleported.rear.distance*length+100);teleported.aero.update([teleported.front,teleported.rear],teleported.time+.01,true);
assert.equal(teleported.rear.aero.available,false,'A teleport cannot create or retain a valid detection passage');
const offroad=detection(.6);offroad.rear.offRoad=true;offroad.aero.update([offroad.front,offroad.rear],offroad.time+.01,true);assert.equal(offroad.rear.aero.available,false);
offroad.aero.update([offroad.front,offroad.rear],offroad.time+.02,false);assert.equal(offroad.aero.enabled,false);assert.equal(offroad.front.aero.wake,0);
console.log('PASS: DRS zone expiry, off-road closure, recovery epoch, teleport rejection and inactive-session reset');

function wakeAt(lateral=0,heading=0,gap=25){
  const aero=new RaceAerodynamics(track,planner),front=makeCar(),rear=makeCar();
  for(let i=0;i<=60;i++){place(rear,100+i);place(front,100+i+gap,lateral);front.heading=heading;aero.update([rear,front],i/60,true);}
  return rear.aero.wake;
}
assert.ok(wakeAt()>.9);assert.equal(wakeAt(4),0);assert.equal(wakeAt(0,Math.PI),0);assert.equal(wakeAt(0,0,-20),0);assert.equal(wakeAt(0,0,90),0);
const draft=new AeroState();draft.wake=1;
assert.ok(aerodynamicDrag(80,false,draft)<aerodynamicDrag(80));assert.equal(aerodynamicDrag(80,true,draft),aerodynamicDrag(80,true));
draft.flap=1;assert.ok(aerodynamicDrag(80,false,draft)>aerodynamicDrag(80)*.78,'Stacked aero effects must remain bounded');
const stream=new RaceAerodynamics(track,planner),a=makeCar(),b=makeCar(),c=makeCar();
for(let i=0;i<120;i++){place(a,300+i);place(b,320+i);place(c,330+i);stream.update([a,b,c],i/120,true);}
assert.ok(a.aero.wake<=1);place(a,420,5);place(b,440);place(c,450);stream.update([a,b,c],1,true);assert.equal(a.aero.wake,0,'Pulling out must release the wake without a stored speed boost');
console.log('PASS: heading/offset/distance-sensitive slipstream, bounded multi-car wake, immediate pullout release and no off-road drag benefit');

const wing=new AeroState();wing.available=true;
for(let i=0;i<60;i++)advanceAero(wing,true,80,0,0,0,false,1/120);
assert.ok(wing.active&&wing.flap>.99);
for(const [brake,steer,lateral,offRoad] of [[1,0,0,false],[0,.5,0,false],[0,0,3,false],[0,0,0,true]]){
  wing.flap=1;advanceAero(wing,true,80,brake,steer,lateral,offRoad,1/120);assert.equal(wing.active,false);assert.equal(wing.flap,0);
}
wing.available=false;advanceAero(wing,true,80,0,0,0,false,1/120);assert.equal(wing.active,false);
const body=()=>({aero:new AeroState(),position:new THREE.Vector3(),speed:75,lateralSpeed:0,yawRate:0,heading:0,steer:0,offRoad:false,acceleration:0,lateralAcceleration:0,gripUsage:0});
const plain=body(),following=body(),open=body();following.aero.wake=1;open.aero.available=true;
for(let i=0;i<120*6;i++)for(const [car,drs] of [[plain,false],[following,false],[open,true]])integrateBody(car,{throttle:1,brake:0,steer:0,boost:true,drs},1/120);
assert.ok(following.speed>plain.speed+1&&open.speed>plain.speed+1,'Reduced drag must produce actual speed with the same engine');
assert.ok(open.speed<=94&&following.speed<=94,'Aerodynamics must retain the common speed ceiling');
const player=body(),rival={...body(),gripScale:1.4,raceSpeedCap:94,raceCruiseCap:87};player.aero.wake=rival.aero.wake=.7;player.aero.available=rival.aero.available=true;
for(let i=0;i<120*10;i++){
  integrateBody(player,{throttle:1,brake:0,steer:0,boost:true,drs:true},1/120);integrateBody(rival,{throttle:1,brake:0,steer:0,boost:true,drs:true},1/120);
  assert.ok(Math.abs(player.speed-rival.speed)<1e-10,'Equal player/AI aero conditions must produce equal straight-line performance');
}
console.log('PASS: legal DRS actuator, automatic brake/steer/slip closure, real drag-based acceleration and equal player/AI output',{plain:plain.speed,draft:following.speed,drs:open.speed});

const brakeClosed=body(),brakeOpen=body();brakeOpen.aero.available=true;brakeOpen.aero.active=true;brakeOpen.aero.flap=1;
integrateBody(brakeClosed,{throttle:0,brake:1,steer:0},1/120);integrateBody(brakeOpen,{throttle:0,brake:1,steer:0,drs:true},1/120);
assert.equal(brakeOpen.aero.flap,0);assert.equal(brakeOpen.acceleration,brakeClosed.acceleration);assert.equal(brakeOpen.speed,brakeClosed.speed);
wing.available=true;wing.flap=1;advanceAero(wing,true,80,0,0,0,false,1/120,.3);assert.equal(wing.active,false);
console.log('PASS: brake application restores closed-wing braking in the same physics step, and unstable yaw prevents opening');
