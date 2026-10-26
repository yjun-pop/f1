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
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
globalThis.window={innerWidth:1280,innerHeight:720};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {Vehicle}=await import(moduleURL('Vehicle'));
const {CockpitCamera}=await import(moduleURL('Camera'));
const {Track}=await import(moduleURL('Track'));
const {Race}=await import(moduleURL('Race'));
const {LinePlanner}=await import(moduleURL('LinePlanner'));
const {brakingDeceleration,integrateBody,HANDLING,steeringLock}=await import(moduleURL('Dynamics'));
const scene=new THREE.Scene(),track=new Track(scene),v=new Vehicle(track,scene),camera=new CockpitCamera(scene);
const input=(key)=>({down:(...keys)=>keys.includes(key)});
for(const heading of [0,.8,Math.PI,-Math.PI/2]){
  for(const [key,side] of [['KeyA',-1],['ArrowLeft',-1],['KeyD',1],['ArrowRight',1]]){
    v.reset();v.heading=heading;v.speed=30;
    const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
    const screenRight=forward.clone().cross(new THREE.Vector3(0,1,0));
    v.update(.04,input(key));
    const turned=new THREE.Vector3(Math.sin(v.heading),0,Math.cos(v.heading));
    assert.ok(turned.dot(screenRight)*side>0,`${key} must turn toward screen ${side<0?'left':'right'}`);
  }
  v.heading=heading;camera.mode=0;camera.update(v,1);camera.mode=1;camera.update(v,1);
  const view=camera.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(view.clone().setY(0).normalize().dot(new THREE.Vector3(Math.sin(heading),0,Math.cos(heading)))>.9999);
  assert.ok(view.y<-.05 && view.y>-.15,'Raised cockpit must aim slightly down toward the road');
  assert.ok(Math.abs(camera.camera.position.y-v.position.y-camera.eyeHeight)<1e-6,'Raised driver eye height');
  const road=v.position.clone().add(new THREE.Vector3(Math.sin(heading)*15,.27,Math.cos(heading)*15)).project(camera.camera);
  assert.ok(road.y>-.5&&road.y<.5,'Road 15m ahead should occupy the clear central viewing area');
}
v.reset();const start=v.position.clone();v.update(.04,input('KeyW'));assert.ok(v.position.clone().sub(start).dot(track.tangent(0))>0);
v.speed=40;v.update(.04,input('KeyS'));assert.ok(v.speed<40);
v.update(.04,{down:(...keys)=>keys.includes('KeyW')||keys.includes('ShiftLeft')});assert.ok(v.boost<100);
const planner=new LinePlanner(track);
const race=new Race(track,scene,planner);race.start();race.update(4.1,v);assert.equal(race.state,'racing');
for(let lap=1;lap<=3;lap++){v.distance=lap;race.elapsed+=30-1/120;race.update(1/120,v);}
assert.equal(race.state,'finished');assert.equal(race.best,30);assert.ok(Math.abs(race.elapsed-90)<1e-8);
race.reset();assert.equal(race.state,'ready');assert.equal(race.elapsed,0);
// A start-line crossing in reverse must remove progress, rather than award a lap.
v.reset();v.position.copy(track.point(1-2/track.length));v.progress=2/track.length;v.lastProgress=2/track.length;v.update(0,input(''));assert.ok(v.distance<0);assert.equal(v.lap,1);
console.log('PASS: screen-relative steering at 4 headings, camera, acceleration/braking, boost, 3-lap finish, restart, reverse crossing');

assert.ok([...planner.offsets].every(o=>Math.abs(o)<=7.8001),'Line must leave car-width clearance from kerbs');
assert.ok([...planner.offsets].some(o=>Math.abs(o)>1),'Line must use road width, not simply follow center');
const energy=(points)=>points.reduce((sum,p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return sum+(a.x-2*p.x+b.x)**2+(a.z-2*p.z+b.z)**2;},0);
const center=Array.from({length:planner.count},(_,i)=>track.point(i/planner.count));
assert.ok(energy(planner.points)<energy(center),'Optimized path must reduce bending energy');
for(let i=0;i<planner.count;i++){const j=(i+1)%planner.count;assert.ok(planner.speeds[i]**2<=planner.speeds[j]**2+2*brakingDeceleration(planner.speeds[i])*.88*planner.distances[i]+1e-5,'Braking envelope including seam');assert.ok(Number.isFinite(planner.speeds[i])&&planner.speeds[i]>0);}
assert.ok(planner.point(0).distanceTo(planner.point(1))<1e-9,'Closed line seam');
console.log('PASS: optimized line clearance, non-centerline geometry, reduced bending, braking distance and closed-loop continuity');
const {RacingLine}=await import(moduleURL('RacingLine'));
const guide=new RacingLine(track,scene);v.reset();guide.update(v);
guide.arrows.geometry.computeBoundingBox();const bounds=guide.arrows.geometry.boundingBox;
assert.ok(bounds.max.y-bounds.min.y>.1,'Guidance must have real vertical thickness');
assert.equal(guide.arrows.count,80,'Guide should use one instanced batch');
v.resetAt(track.sections[0].progress-30/track.length);v.speed=86;guide.update(v);const red=new THREE.Color();let hasBrakeMarker=false;for(let i=0;i<80;i++){guide.arrows.getColorAt(i,red);if(red.r>red.g*1.5)hasBrakeMarker=true;}assert.ok(hasBrakeMarker,'Excess speed approaching T1 requires red braking guidance');
guide.toggle();guide.update(v);assert.equal(guide.arrows.visible,false);
console.log('PASS: extruded 3D arrow geometry, instanced rendering, braking color and guide toggle');

// A 72 km/h corner far ahead must not demand braking at 126 km/h yet.
const actualCornerLimit=guide.planner.cornerLimit.bind(guide.planner);
guide.planner.cornerLimit=t=>{const p=((t%1)+1)%1;return p>=150/track.length&&p<210/track.length?20:94;};
v.resetAt(0);v.speed=35;guide.instruction='ACCELERATE';guide.update(v);
assert.notEqual(guide.instruction,'BRAKE','A distant corner must not trigger premature braking');
v.resetAt(144/track.length);v.speed=35;guide.update(v);
assert.equal(guide.instruction,'BRAKE','The same corner must trigger braking inside the stopping range');
guide.planner.cornerLimit=actualCornerLimit;
const body=()=>({position:new THREE.Vector3(),speed:35,lateralSpeed:0,yawRate:0,heading:0,steer:0,offRoad:false,acceleration:0,lateralAcceleration:0,gripUsage:0});
const dry=body(),grass=body();grass.offRoad=true;
for(let i=0;i<120;i++){integrateBody(dry,{throttle:0,brake:0,steer:.7},1/120);integrateBody(grass,{throttle:0,brake:0,steer:.7},1/120);}
assert.ok(Math.abs(dry.lateralAcceleration)>Math.abs(grass.lateralAcceleration),'Grass must reduce cornering grip');
const braking=body();for(let i=0;i<120;i++)integrateBody(braking,{throttle:0,brake:1,steer:0},1/120);assert.ok(braking.speed<20,'Tire-limited braking should slow the car');
const inertia=body();inertia.lateralSpeed=6;integrateBody(inertia,{throttle:0,brake:0,steer:0},1/120);assert.ok(inertia.lateralSpeed>0,'Side-slip must persist instead of snapping to heading');
const {resolveCollision}=await import(moduleURL('Vehicle'));
const a=new Vehicle(track,scene),b=new Vehicle(track,scene);a.resetAt(0);b.resetAt(0);b.position.copy(a.position).addScaledVector(track.tangent(0),4);a.speed=40;b.speed=10;assert.ok(resolveCollision(a,b));assert.ok(a.speed<40&&b.speed>10,'Collision must exchange momentum');
console.log('PASS: physics-based advice, surface grip, braking, persistent side-slip and collision momentum');
// Run the actual AI controls against the same physical car model.
race.reset();race.start();race.update(4.1,v);v.resetAt(0);v.position.set(1000,0,1000);
let offroad=0;const laneStart=race.opponents.map(o=>o.lane);
for(let step=0;step<120*140;step++){race.update(1/120,v);offroad+=race.opponents.filter(o=>o.car.offRoad).length;}
const summary=race.opponents.map(o=>({name:o.name,distance:o.distance,speed:o.speed,offRoad:o.car.offRoad,lane:o.lane}));
console.log('AI run:',JSON.stringify(summary),'offroad fraction',offroad/(120*140*5));
assert.ok(race.opponents.every(o=>Number.isFinite(o.speed)&&o.distance*track.length>4000),'Each AI should make physical progress');
assert.ok(new Set(race.opponents.map(o=>o.speed.toFixed(1))).size>=4,'Rivals should develop different speeds');
assert.ok(race.opponents.some((o,i)=>Math.abs(o.lane-laneStart[i])>1),'AI should change lane decisions');
assert.ok(offroad/(120*140*5)<.18,'AI must generally remain on the circuit');
console.log('PASS: individual AI pace, dynamic lane decisions and physical circuit driving');
// A normal high-speed turn should not produce a sustained drift on dry asphalt.
for(const speed of [40,60]){
  const b=body();b.speed=speed;let peak=0;
  for(let step=0;step<360;step++){integrateBody(b,{throttle:.4,brake:0,steer:step<120?.6:0},1/120);peak=Math.max(peak,Math.abs(Math.atan2(b.lateralSpeed,b.speed)));}
  assert.ok(peak<4*Math.PI/180,'Normal cornering should stay below four degrees of side-slip');
  assert.ok(Math.abs(b.lateralSpeed)<.1,'Lateral drift should settle after steering is released');
}
console.log('PASS: dry high-speed cornering stability and slip recovery');

assert.ok(Math.abs(track.length-5793)<.1,'Monza should use the published lap distance');
assert.equal(track.cornerCount,11);
assert.ok(track.sections[0].progress*track.length>850,'Start must provide a long acceleration run before T1');
for(let distance=30;distance<850;distance+=50){assert.ok(track.tangent(distance/track.length).angleTo(track.tangent((distance+10)/track.length))<.001,'The main straight must stay straight');}
const first=track.point(0),forward=track.tangent(0);v.reset();
for(let step=0;step<120*10;step++)v.update(1/120,input('KeyW'));
const moved=v.position.clone().sub(first),sideways=moved.clone().addScaledVector(forward,-moved.dot(forward)).length();
assert.ok(sideways<.5&&!v.offRoad,'A straight launch should not need steering input');
assert.ok(moved.length()>400,'Main straight should permit sustained acceleration');
console.log('PASS: real Monza lap length, long straight, 11 corners and unsteered full-throttle launch');

// The guide must be driveable with the actual tire model, not just have a
// mathematically valid curvature envelope. Follow one lap without opponents.
const follower=new Vehicle(track,new THREE.Scene());
let finishedAt=0,offRoadSteps=0,peakSlip=0;
for(let step=0;step<120*180;step++){
  const lookahead=THREE.MathUtils.clamp(7+follower.speed*.3,9,26);
  const to=planner.point(follower.progress+lookahead/track.length).sub(follower.position);
  const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-follower.heading),Math.cos(desired-follower.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
  const steer=THREE.MathUtils.clamp((angle-follower.yawRate*.018)/steeringLock(follower.speed),-1,1);
  const difference=planner.advice(follower.progress,follower.speed)-follower.speed;
  follower.drive(1/120,{steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});
  if(follower.offRoad)offRoadSteps++;
  peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(follower.lateralSpeed,Math.max(1,follower.speed))));
  if(follower.distance>=1){finishedAt=(step+1)/120;break;}
}
assert.ok(finishedAt>0,'Following the recommended speed must complete a physical lap');
assert.equal(offRoadSteps,0,'The recommended line and speed must keep the follower on asphalt');
assert.ok(peakSlip<10*Math.PI/180,'Guidance must avoid sustained large tire slip');
assert.ok(planner.speed(600/track.length)>85,'Corner safety margin must preserve straight-line speed');
console.log(`PASS: guided physical lap in ${finishedAt.toFixed(1)}s, no off-road frames, peak slip ${(peakSlip*180/Math.PI).toFixed(1)} degrees`);

// A fast car before a chicane must still see the exit as an acceleration zone.
const savedSpeed=guide.planner.speed.bind(guide.planner),savedAdvice=guide.planner.advice.bind(guide.planner);
guide.planner.speed=t=>{const distance=((t%1+1)%1)*track.length;return distance<65?50-distance*.4:24+(distance-65)*.2;};
guide.planner.advice=()=>30;
v.resetAt(0);v.speed=70;guide.toggle();guide.update(v);
const marker=new THREE.Color();
guide.arrows.getColorAt(10,marker);assert.ok(marker.r>marker.g*1.5,'Deceleration zone must be red');
guide.arrows.getColorAt(40,marker);assert.ok(marker.g>marker.r*1.5,'Exit must be green even when the approaching car is too fast');
guide.planner.speed=()=>30;guide.planner.advice=()=>30;v.speed=30;guide.update(v);
guide.arrows.getColorAt(30,marker);assert.ok(marker.r>.5&&marker.g>.5&&marker.b<.1,'Constant-speed zone must be yellow');
guide.planner.speed=savedSpeed;guide.planner.advice=savedAdvice;
console.log('PASS: braking, holding and exit acceleration colors describe their own road positions');
