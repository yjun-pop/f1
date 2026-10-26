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
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
globalThis.window={innerWidth:1280,innerHeight:720};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {Vehicle}=await import(moduleURL('Vehicle'));
const {CockpitCamera}=await import(moduleURL('Camera'));
const {Track,ROAD_HALF_WIDTH}=await import(moduleURL('Track'));
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
// Compare curvature per metre: final offset samples have unequal spacing,
// so raw second differences are not a geometric bending measure.
const energy=(points)=>points.reduce((sum,p,i)=>{
  const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];
  const ab=a.distanceTo(p),bc=p.distanceTo(c),ca=c.distanceTo(a);
  const cross=(p.x-a.x)*(c.z-a.z)-(p.z-a.z)*(c.x-a.x);
  const curvature=2*cross/Math.max(.001,ab*bc*ca);
  return sum+curvature*curvature*(ab+bc)*.5;
},0);
const center=Array.from({length:planner.count},(_,i)=>track.point(i/planner.count));
assert.ok(energy(planner.points)<energy(center),'Optimized path must reduce geometric curvature energy');
for(let i=0;i<planner.count;i++){
  const t=i/planner.count,p=planner.point(t),q=planner.point(t+1/planner.count);
  assert.ok(q.clone().sub(p).dot(track.tangent(t))>0,'Line must always advance along the circuit');
  for(const fraction of [.25,.5,.75]){
    const progress=(i+fraction)/planner.count,point=planner.point(progress);
    const nearest=track.nearestProgress(point,progress);
    assert.ok(point.distanceTo(track.point(nearest))<ROAD_HALF_WIDTH-2,'Segments must preserve vehicle clearance between optimization samples');
  }
}
for(let i=0;i<planner.count;i++){const j=(i+1)%planner.count;assert.ok(planner.speeds[i]**2<=planner.speeds[j]**2+2*brakingDeceleration(planner.speeds[i])*.88*planner.distances[i]+1e-5,'Braking envelope including seam');assert.ok(Number.isFinite(planner.speeds[i])&&planner.speeds[i]>0);}
assert.ok(planner.point(0).distanceTo(planner.point(1))<1e-9,'Closed line seam');
console.log('PASS: optimized line clearance, non-centerline geometry, reduced bending, braking distance and closed-loop continuity');

// Check the actual inside of each geometric turn, independently of the line's
// stored signed offsets. Compound chicanes must alternate sides at their apices.
assert.equal(planner.apices.length,11,'The Monza GP line must identify all eleven geometric turn apices');
for(const apex of planner.apices){
  const t=apex.progress,before=track.tangent(t-16/track.length),after=track.tangent(t+16/track.length);
  const turn=before.x*after.z-before.z*after.x;
  const lateral=planner.point(t).sub(track.point(t)).dot(track.normal(t));
  assert.ok(Math.sign(turn)*lateral>2,'Every apex must lie in the inside half of the road, not follow the outside edge');
}
const offsetsAt=meters=>planner.point(meters/track.length).sub(track.point(meters/track.length)).dot(track.normal(meters/track.length));
for(const [name,entry,apex,exit] of [['Lesmo 1',2500,2639,2725],['Lesmo 2',2850,2954,3020],['Parabolica',5100,5333,5600]]){
  assert.ok(offsetsAt(entry)<-3&&offsetsAt(apex)>3&&offsetsAt(exit)<-3,`${name} must use outside-entry, inside-apex and outside-exit`);
}
assert.deepEqual(planner.apices.slice(0,2).map(a=>a.direction),[1,-1],'Rettilifilo must link opposite apex sides');
assert.deepEqual(planner.apices.slice(3,5).map(a=>a.direction),[-1,1],'Roggia must link opposite apex sides');
assert.deepEqual(planner.apices.slice(7,10).map(a=>a.direction),[-1,1,-1],'Ascari must connect all three turn directions');
console.log('PASS: eleven inside apices, outside-inside-outside single corners and alternating chicane geometry');

const {RacingLine}=await import(moduleURL('RacingLine'));
const guide=new RacingLine(track,scene);v.reset();guide.update(v);
assert.equal(guide.ribbon.visible,false,'Guide must be hidden on the long starting straight');
assert.equal(guide.markers.visible,false,'Upright cues must also disappear on straights');
v.resetAt(600/track.length);v.speed=80;guide.update(v);
assert.equal(guide.ribbon.visible,false,'High speed alone must not enable guidance far from a corner');
v.resetAt(track.sections[0].progress-90/track.length);v.speed=70;guide.update(v);
assert.ok(guide.ribbon.visible&&guide.sampleCount>50,'Approaching T1 must show entry through the chicane exit');
assert.ok(guide.markers.visible&&guide.markers.count>0,'The line must remain readable head-on through upright cues');
const cueMatrix=new THREE.Matrix4();guide.markers.getMatrixAt(0,cueMatrix);
assert.ok(cueMatrix.elements[5]>0&&Math.abs(cueMatrix.elements[4])<1e-6&&Math.abs(cueMatrix.elements[6])<1e-6,'Cues must stand vertically instead of lying on asphalt');
assert.ok(cueMatrix.elements[13]>.2,'Cues must float above the road');
const ribbonPositions=guide.ribbon.geometry.getAttribute('position');
for(let sample=0;sample<guide.sampleCount;sample++){
  const base=sample*3;
  assert.equal(ribbonPositions.getX(base),ribbonPositions.getX(base+2));
  assert.equal(ribbonPositions.getZ(base),ribbonPositions.getZ(base+2));
  assert.ok(ribbonPositions.getY(base)>.2,'Ribbon must float clear of the asphalt');
  assert.ok(ribbonPositions.getY(base+2)-ribbonPositions.getY(base)>.45,'Ribbon must be vertical, not painted on the road');
}
const startMeters=Math.ceil((v.progress*track.length+2)/2.5)*2.5;
for(let sample=0;sample<guide.sampleCount-1;sample++){
  const expected=guide.planner.point((startMeters+sample*2.5)/track.length);
  assert.ok(Math.hypot(ribbonPositions.getX(sample*3)-expected.x,ribbonPositions.getZ(sample*3)-expected.z)<.001,'Ribbon must follow the actual optimized path');
}
const ribbonColors=guide.ribbon.geometry.getAttribute('color');
const fastColor=new THREE.Color().fromBufferAttribute(ribbonColors,10);
v.speed=8;guide.update(v);const slowColor=new THREE.Color().fromBufferAttribute(ribbonColors,10);
assert.ok(fastColor.r-fastColor.g>slowColor.r-slowColor.g,'Actual overspeed must shift the guide toward braking colors');
assert.ok(slowColor.g>slowColor.r,'Low speed relative to the recommended speed must invite acceleration');
// Enter the braking zone at high speed, then brake early without moving.
v.resetAt(800/track.length);v.speed=86;guide.update(v);assert.ok(guide.ribbon.visible);
v.speed=10;guide.update(v);assert.ok(guide.ribbon.visible,'Braking must not make an already active corner guide disappear');
v.resetAt(1130/track.length);v.speed=10;guide.update(v);assert.equal(guide.ribbon.visible,false,'After the corner exit the guide must disappear');
v.resetAt(920/track.length);v.speed=40;guide.toggle();guide.update(v);assert.equal(guide.ribbon.visible,false,'G must still disable corner guidance');
guide.toggle();guide.update(v);assert.ok(guide.ribbon.visible);
console.log('PASS: corner-only visibility, floating vertical geometry, optimized path alignment, actual speed colors and toggle');

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
// Reproduce full digital steering after braking, trail braking, and release.
for(const [speed,brakingTime,turnTime,trail,maxSlip,minYaw] of [[60,1.7,1.5,false,6.2,.95],[40,0,1,true,6,1],[60,0,1,false,3,.45]]){
  const car=body();car.speed=speed;let peakSlip=0,peakYaw=0;
  for(let i=0;i<brakingTime*120;i++)integrateBody(car,{throttle:0,brake:1,steer:0,keyboard:true},1/120);
  for(let i=0;i<(turnTime+2)*120;i++){
    const turning=i<turnTime*120;
    integrateBody(car,{throttle:0,brake:turning&&trail?1:0,steer:turning?1:0,keyboard:true},1/120);
    peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(car.lateralSpeed,Math.max(1,car.speed)))*180/Math.PI);
    peakYaw=Math.max(peakYaw,Math.abs(car.yawRate));
  }
  assert.ok(peakSlip<maxSlip,'Digital corner entry must limit excessive sliding');
  assert.ok(peakYaw>minYaw,'Stability must preserve useful turning authority');
  assert.ok(Math.abs(car.lateralSpeed)<.02&&Math.abs(car.yawRate)<.02,'Released steering must settle without continued drift');
}
const tap=body();tap.speed=60;
for(let i=0;i<12;i++)integrateBody(tap,{throttle:0,brake:0,steer:1,keyboard:true},1/120);
assert.ok(tap.steer>.2&&tap.steer<.3,'Short key presses must build steering gradually');
for(let i=0;i<12;i++)integrateBody(tap,{throttle:0,brake:0,steer:0,keyboard:true},1/120);
assert.equal(tap.steer,0,'Released keys must recenter promptly');
const straight=body(),assistedStraight=body();
for(let i=0;i<120;i++){
  integrateBody(straight,{throttle:0,brake:1,steer:0},1/120);
  integrateBody(assistedStraight,{throttle:0,brake:1,steer:0,keyboard:true},1/120);
}
assert.equal(assistedStraight.speed,straight.speed,'Straight braking must preserve the existing stopping distance');
v.reset();v.speed=40;
v.update(.1,{down:(...keys)=>keys.some(key=>['KeyW','KeyS','ShiftLeft'].includes(key))});
assert.equal(v.throttle,0);assert.equal(v.brake,1);assert.equal(v.boosting,false);assert.equal(v.boost,100);
assert.ok(v.speed<40,'Braking must take priority over held throttle and boost');
console.log('PASS: keyboard corner entry, trail braking, turning authority, release, straight stopping distance and brake priority');

// Run the actual AI controls against the same physical car model.
race.reset();race.start();race.update(4.1,v);v.resetAt(0);v.position.set(1000,0,1000);
let offroad=0;const laneStart=race.opponents.map(o=>o.lane);
// Keep representative player telemetry moving while the player mesh stays
// outside the circuit, so this endurance check isolates the AI vehicles.
for(let step=0;step<120*140;step++){
  v.distance=step/120*45/track.length;v.progress=v.distance%1;
  race.update(1/120,v);offroad+=race.opponents.filter(o=>o.car.offRoad).length;
}
const summary=race.opponents.map(o=>({name:o.name,distance:o.distance,speed:o.speed,offRoad:o.car.offRoad,lane:o.lane}));
console.log('AI run:',JSON.stringify(summary),'offroad fraction',offroad/(120*140*5));
assert.ok(race.opponents.every(o=>Number.isFinite(o.speed)&&o.distance*track.length>4000),'Each AI should make physical progress');
assert.ok(new Set(race.opponents.map(o=>o.speed.toFixed(1))).size>=4,'Rivals should develop different speeds');
assert.ok(race.opponents.some((o,i)=>Math.abs(o.lane-laneStart[i])>1),'AI should change lane decisions');
assert.ok(offroad/(120*140*5)<.04,'AI must generally remain on the circuit');
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
// The previous spacing-dependent line needed 139.9s with this controller.
assert.ok(finishedAt<130,'The wider, curvature-based line must preserve its physical lap-time improvement');
assert.equal(offRoadSteps,0,'The recommended line and speed must keep the follower on asphalt');
assert.ok(peakSlip<10*Math.PI/180,'Guidance must avoid sustained large tire slip');
assert.ok(planner.speed(600/track.length)>85,'Corner safety margin must preserve straight-line speed');
console.log(`PASS: guided physical lap in ${finishedAt.toFixed(1)}s, no off-road frames, peak slip ${(peakSlip*180/Math.PI).toFixed(1)} degrees`);

const keyboardFollower=new Vehicle(track,new THREE.Scene());
let keyboardFinish=0,keyboardOffRoad=0,keyboardSlip=0;const visitedApices=new Set();let cornerError=0;
for(let step=0;step<120*180;step++){
  const lookahead=THREE.MathUtils.clamp(7+keyboardFollower.speed*.3,9,26);
  const to=planner.point(keyboardFollower.progress+lookahead/track.length).sub(keyboardFollower.position);
  const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-keyboardFollower.heading),Math.cos(desired-keyboardFollower.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
  const steer=THREE.MathUtils.clamp((angle-keyboardFollower.yawRate*.018)/steeringLock(keyboardFollower.speed),-1,1);
  const difference=planner.advice(keyboardFollower.progress,keyboardFollower.speed)-keyboardFollower.speed;
  keyboardFollower.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});
  for(const [index,apex] of planner.apices.entries())if(Math.abs(keyboardFollower.progress-apex.progress)*track.length<5){visitedApices.add(index);cornerError=Math.max(cornerError,keyboardFollower.position.distanceTo(planner.point(keyboardFollower.progress)));}
  if(keyboardFollower.offRoad)keyboardOffRoad++;
  keyboardSlip=Math.max(keyboardSlip,Math.abs(Math.atan2(keyboardFollower.lateralSpeed,Math.max(1,keyboardFollower.speed))));
  if(keyboardFollower.distance>=1){keyboardFinish=(step+1)/120;break;}
}
assert.ok(keyboardFinish>0,'Following the recommended speed must complete a physical lap');
assert.ok(keyboardFinish<130,'The wider, curvature-based line must preserve its physical lap-time improvement');
assert.equal(keyboardOffRoad,0,'The recommended line and speed must keep player handling on asphalt');
assert.ok(keyboardSlip<10*Math.PI/180,'Guidance must avoid sustained large tire slip');
assert.ok(planner.speed(600/track.length)>85,'Corner safety margin must preserve straight-line speed');
console.log(`PASS: guided physical lap in ${keyboardFinish.toFixed(1)}s, no off-road frames, peak slip ${(keyboardSlip*180/Math.PI).toFixed(1)} degrees`);

assert.equal(visitedApices.size,11,'Player handling must physically traverse all eleven apex zones');
assert.ok(cornerError<2,'Player handling must remain within two metres of the line at every apex');
console.log('PASS: player keyboard handling, eleven apex zones and maximum apex tracking error',cornerError);

// Independently sum the guide polyline, including partial segments and seams.
const guideLength=planner.points.reduce((sum,p,i)=>sum+p.distanceTo(planner.points[(i+1)%planner.count]),0);
assert.ok(Math.abs(planner.pathDistance(0,1)-guideLength)<1e-7);
assert.ok(Math.abs(planner.pathDistance(.99,1.01)-planner.pathDistance(.99,1)-planner.pathDistance(0,.01))<1e-7);
assert.ok(Math.abs(planner.pathDistance(-.01,.01)-planner.pathDistance(.99,1.01))<1e-7);
assert.equal(planner.pathDistance(.3,.3),0);
for(let i=0;i<planner.count;i++){
  const t=(i+.5)/planner.count;
  assert.ok(planner.cornerLimit(t,true)<=planner.cornerLimit(t)+1e-8,'Low-grip guidance must never exceed dry corner limits');
}
for(const apex of planner.apices){
  assert.ok(planner.cornerLimit(apex.progress,true)<planner.cornerLimit(apex.progress)*.8,'Every grass corner target must reflect reduced lateral grip');
}
for(const grass of [false,true]){
  let speed=94,travelled=0;
  while(speed>20){const next=Math.max(20,speed-brakingDeceleration(speed,grass)*.65/1000);travelled+=(speed+next)*.5/1000;speed=next;}
  const predicted=planner.brakingDistance(94,20,grass);
  assert.ok(predicted>=travelled-1&&predicted<travelled*1.03,'Stopping distance must match numerical braking with falling downforce');
}
assert.equal(planner.brakingDistance(20,30),0,'An acceleration target requires no braking distance');
const realSpeed=planner.speed,realLimit=planner.cornerLimit;
planner.speed=()=>94;
planner.cornerLimit=t=>{const meters=((t%1+1)%1)*track.length;return meters>=400&&meters<440?20:94;};
assert.equal(planner.advice(0,94,false),94,'Dry braking must not react to a distant isolated corner prematurely');
assert.ok(planner.advice(0,94,true)<90,'Low-grip braking must look beyond the old 240 metre cutoff');
planner.speed=realSpeed;planner.cornerLimit=realLimit;
const realZones=guide.zones;
guide.zones=[{start:400,end:500,minimumSpeed:20}];guide.engagedZone=-1;
v.resetAt(0);v.speed=94;guide.update(v);assert.equal(guide.ribbon.visible,false);
v.offRoad=true;guide.update(v);assert.ok(guide.ribbon.visible,'The line must appear early enough for low-grip braking');
v.offRoad=false;guide.zones=realZones;guide.engagedZone=-1;
console.log('PASS: guide arc distance, lap seams, grass corner limits, extended stopping horizon and early low-grip visibility');

// A speed profile that brakes into a chicane and accelerates out must be
// painted continuously, using attainable future speed instead of coloring
// every future point against the unchanged approach speed.
const savedSpeed=guide.planner.speed.bind(guide.planner),savedAdvice=guide.planner.advice.bind(guide.planner);
const savedLimit=guide.planner.cornerLimit.bind(guide.planner),savedZones=guide.zones;
guide.zones=[{start:30,end:180,minimumSpeed:24}];guide.engagedZone=-1;
guide.planner.speed=t=>{const distance=((t%1+1)%1)*track.length;return distance<65?50-distance*.4:24+(distance-65)*.2;};
guide.planner.cornerLimit=()=>87;guide.planner.advice=()=>30;
v.resetAt(0);v.speed=70;guide.update(v);
const colors=guide.ribbon.geometry.getAttribute('color');
const brakingColor=new THREE.Color().fromBufferAttribute(colors,10*3+1),exitColor=new THREE.Color().fromBufferAttribute(colors,50*3+1);
assert.ok(brakingColor.r>brakingColor.g,'Braking demand must be red/orange');
assert.ok(exitColor.g>exitColor.r,'The exit must invite acceleration after the predicted braking');
const shades=new Set(Array.from({length:guide.sampleCount},(_,i)=>[colors.getX(i*3+1),colors.getY(i*3+1),colors.getZ(i*3+1)].map(v=>v.toFixed(3)).join(',')));
assert.ok(shades.size>12,'Color strength must be a continuous gradient, not three discrete states');
assert.equal(colors.getW((guide.sampleCount-1)*3+1),0,'The ribbon must fade out at the end of the exit');
guide.planner.speed=()=>30;v.speed=30;guide.update(v);
const holdColor=new THREE.Color().fromBufferAttribute(colors,10*3+1);
assert.ok(holdColor.r>.9&&holdColor.g>.5&&holdColor.b<.2,'Matching a constant optimal speed must show the neutral yellow');
// The same corner must remain active across the start/finish seam.
guide.zones=[{start:track.length-50,end:track.length+65,minimumSpeed:20}];guide.engagedZone=-1;
v.resetAt(1-100/track.length);v.speed=30;guide.update(v);assert.ok(guide.ribbon.visible);
v.resetAt(20/track.length);guide.update(v);assert.ok(guide.ribbon.visible,'Wrapping progress must not lose the corner exit');
v.resetAt(90/track.length);v.speed=0;guide.update(v);assert.equal(guide.ribbon.visible,false,'Wrapped exit must clear normally');
guide.planner.speed=savedSpeed;guide.planner.advice=savedAdvice;guide.planner.cornerLimit=savedLimit;guide.zones=savedZones;guide.engagedZone=-1;
console.log('PASS: continuous braking/holding/acceleration gradients, end fade and cyclic corner windows');

// Rank policy: tiny reductions ahead, stronger top-speed/power assistance
// behind, total-distance ranking across seams, and no kinematic corrections.
const rankRace=new Race(track,new THREE.Scene(),planner),rankPlayer=new Vehicle(track,new THREE.Scene());
rankPlayer.distance=1.01;rankRace.elapsed=40;
const standings=[1.05,1.02,.99,.95,.9];
rankRace.opponents.forEach((o,i)=>{o.car.distance=standings[i];o.car.speed=70;});
const rankPositions=rankRace.opponents.map(o=>o.car.position.clone());
let capJump=0;
for(let step=0;step<120*20;step++){
  const before=rankRace.opponents.map(o=>o.speedCap);rankRace.balanceRivals(rankPlayer,1/120);
  rankRace.opponents.forEach((o,i)=>{capJump=Math.max(capJump,Math.abs(o.speedCap-before[i]));});
}
assert.equal(rankRace.position,3);assert.deepEqual(rankRace.opponents.map(o=>o.rank),[1,2,4,5,6]);
for(const [i,o] of rankRace.opponents.entries()){
  if(o.rank<rankRace.position){assert.ok(o.speedCap>=94*.9799&&o.speedCap<94*.989,'Ahead rivals must only lose about 1.2-2% of top speed');assert.equal(o.powerAssist,1);}
  else{assert.ok(o.speedCap>94&&o.speedCap<=104,'All rivals behind must receive a bounded higher speed cap');assert.ok(o.powerAssist>1&&o.powerAssist<=1.15);}
  assert.ok(o.car.position.equals(rankPositions[i])&&o.car.speed===70,'Balancing must never move a car or assign its velocity');
}
assert.ok(capJump<.12,'Top-speed changes must ease in gradually');
// A leader's 2nd and 3rd place challengers alternate attack priority.
rankPlayer.distance=1.1;rankRace.elapsed=56;
rankRace.opponents.forEach((o,i)=>{o.car.distance=1.1-(20+i*15)/track.length;});
for(let step=0;step<120*15;step++)rankRace.balanceRivals(rankPlayer,1/120);
assert.equal(rankRace.position,1);assert.ok(rankRace.opponents[0].attack>.95&&rankRace.opponents[1].attack<.5);
assert.ok(rankRace.opponents[0].speedCap>rankRace.opponents[1].speedCap+.6,'The designated challenger must receive a stronger near-leader attack');
assert.ok(rankRace.opponents.slice(2).every(o=>o.attack<.01),'Only the two closest challengers receive the leader-duel priority');
rankRace.elapsed=70;
for(let step=0;step<120*15;step++)rankRace.balanceRivals(rankPlayer,1/120);
assert.ok(rankRace.opponents[1].attack>.95&&rankRace.opponents[0].attack<.5,'Attack priority must rotate between 2nd and 3rd');
assert.ok(rankRace.opponents[1].speedCap>rankRace.opponents[0].speedCap+.6,'The boosted top-speed advantage must rotate too');
const reversing=rankRace.opponents[0],oldCap=reversing.speedCap;
rankPlayer.distance=reversing.car.distance-.1;rankRace.balanceRivals(rankPlayer,1/120);
assert.ok(reversing.speedCap<oldCap&&reversing.speedCap>94,'After passing the player, a rival must ease off gradually rather than instantly');
for(let step=0;step<120*20;step++)rankRace.balanceRivals(rankPlayer,1/120);
assert.ok(reversing.speedCap<94&&reversing.powerAssist<1.0001,'Former challengers must shed their catch-up advantage after overtaking');
reversing.car.boost=5;
rankRace.reset();assert.ok(rankRace.opponents.every(o=>o.speedCap===94&&o.powerAssist===1&&o.attack===0&&o.car.raceSpeedCap===undefined&&o.car.boost===100),'Restart must clear rank assistance');
console.log('PASS: rank-based speed caps, slight leader reduction, rotating 2nd/3rd attacks, lap seams and reset');

// Compare real rolling acceleration on the same main straight.
function rankedStraight(gapMeters){
  const race=new Race(track,new THREE.Scene(),planner),player=new Vehicle(track,new THREE.Scene());race.opponents.splice(1);
  const rival=race.opponents[0],progress=100/track.length;
  const lane=planner.point(progress).sub(track.point(progress)).dot(track.normal(progress))+.6;
  rival.car.resetAt(progress,lane);rival.car.speed=75;rival.distance=progress;
  player.distance=progress+gapMeters/track.length;race.state='racing';race.elapsed=20;
  for(let step=0;step<120*20;step++)race.balanceRivals(player,1/120);
  let peak=0,offroad=0;
  for(let step=0;step<120*6;step++){
    player.distance=rival.car.distance+gapMeters/track.length;player.progress=(player.distance%1+1)%1;
    player.position.copy(track.point(player.progress));player.speed=80;
    race.update(1/120,player);peak=Math.max(peak,rival.car.speed);offroad+=rival.car.offRoad?1:0;
  }
  return {peak,meters:rival.car.distance*track.length-100,offroad};
}
const aheadRun=rankedStraight(-400),behindRun=rankedStraight(400);
assert.ok(behindRun.peak>aheadRun.peak+1&&behindRun.peak-aheadRun.peak<10,'Catch-up must be physical but bounded to avoid a visibly excessive speed advantage');
assert.ok(behindRun.meters>aheadRun.meters+5,'Higher caps must translate into physical progress, not only configuration');
assert.equal(behindRun.offroad+aheadRun.offroad,0);
const coasting={...body(),speed:100,raceSpeedCap:92,raceCruiseCap:85,racePowerAssist:1};
integrateBody(coasting,{steer:0,throttle:0,brake:0},1/120);
assert.ok(coasting.speed>99.8&&coasting.speed<100,'A reduced cap must let an over-speed car decelerate physically rather than snap to the cap');
console.log('PASS: physical rank-based straight-line catch-up and smooth speed-limit reductions',JSON.stringify({aheadKmh:(aheadRun.peak*3.6).toFixed(1),behindKmh:(behindRun.peak*3.6).toFixed(1)}));

// Measure a full solo lap: speed multipliers alone must not hide a poor driver.
const skilledRace=new Race(track,new THREE.Scene(),planner),benchmarkPlayer=new Vehicle(track,new THREE.Scene());
skilledRace.opponents.splice(1);skilledRace.start();skilledRace.update(4.1,benchmarkPlayer);
const skilledRival=skilledRace.opponents[0];
// Keep base caps fixed for this driver regression; rank-dependent gameplay is
// measured separately above and in the physical lead-exchange test below.
skilledRace.balanceRivals=()=>{skilledRace.position=1;skilledRival.rank=2;};
const calibratedLaps=[];let skilledOffroad=0,lastCrossing=0;
for(let step=0;step<120*270;step++){
  benchmarkPlayer.distance=skilledRival.car.distance-40/track.length;
  benchmarkPlayer.progress=(benchmarkPlayer.distance%1+1)%1;
  benchmarkPlayer.position.copy(track.point(benchmarkPlayer.progress));benchmarkPlayer.speed=skilledRival.car.speed;
  skilledRace.update(1/120,benchmarkPlayer);skilledOffroad+=skilledRival.car.offRoad?1:0;
  if(skilledRival.car.distance>=calibratedLaps.length+1){
    const time=(step+1)/120;calibratedLaps.push(time-lastCrossing);lastCrossing=time;
    if(calibratedLaps.length===3)break;
  }
}
assert.equal(calibratedLaps.length,3,'The calibrated AI must complete three actual physical laps');
assert.ok(calibratedLaps[0]<90,'Standing-start target: under 90 seconds');
assert.ok(calibratedLaps.slice(1).every(time=>time>=85&&time<=87),'Flying-lap target: 86 seconds +/- 1 second');
assert.equal(skilledOffroad,0,'The calibrated laps must remain on asphalt');
console.log('PASS: 86-second AI calibration over three clean physical laps',calibratedLaps.map(t=>t.toFixed(2)));

// On a straight, drive around a slower physical vehicle instead of queuing
// indefinitely or clamping an impossible passing lane into the blocked lane.
const passingRace=new Race(track,new THREE.Scene(),planner),slowCar=new Vehicle(track,new THREE.Scene());
passingRace.opponents.splice(1);const passer=passingRace.opponents[0];
const lineLane=t=>planner.point(t).sub(track.point(t)).dot(track.normal(t))+.6;
passer.car.resetAt(300/track.length,lineLane(300/track.length));passer.car.speed=45;
passer.lane=.6;passer.distance=passer.car.distance;
slowCar.resetAt(350/track.length,lineLane(350/track.length));slowCar.speed=15;
passingRace.start();passingRace.update(4.1,slowCar);
let passingOffroad=0;
for(let step=0;step<120*10;step++){
  const drag=.00105*slowCar.speed*slowCar.speed+.35,engine=17*(1-slowCar.speed/140);
  slowCar.drive(1/120,{steer:0,throttle:drag/engine,brake:0});
  passingRace.update(1/120,slowCar);passingOffroad+=passer.car.offRoad?1:0;
}
assert.ok((passer.car.distance-slowCar.distance)*track.length>20,'AI must complete a clean straight-line pass');
assert.equal(passingOffroad,0,'Passing must stay on the road');
console.log('PASS: AI finds a free corridor and overtakes a slower car on asphalt');

// Small target movements must not flip a pass, but a newly occupied lane
// must override the preference immediately.
const tacticalRace=new Race(track,new THREE.Scene(),planner),tacticalPlayer=new Vehicle(track,new THREE.Scene());
tacticalRace.opponents.splice(1);const tactical=tacticalRace.opponents[0];tacticalRace.elapsed=20;
const place=(car,meters,bias,speed)=>{const t=meters/track.length,offset=planner.point(t).sub(track.point(t)).dot(track.normal(t));car.resetAt(t,offset+bias);car.speed=speed;};
place(tactical.car,300,3.5,45);tactical.lane=3.5;place(tacticalPlayer,340,3.5,30);
tacticalRace.decide(tactical,tacticalPlayer);const chosenSide=Math.sign(tactical.passLane-3.5);
assert.ok(chosenSide!==0&&tactical.passUntil>tacticalRace.elapsed,'A clear pass must establish a side preference');
place(tacticalPlayer,340,3.5+chosenSide*.15,30);tacticalRace.elapsed+=.03;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(Math.sign(tactical.passLane-3.5),chosenSide,'A slight target movement must not reverse the passing side');
const blocker=new Vehicle(track,new THREE.Scene());place(blocker,315,tactical.passLane,30);
tacticalRace.opponents.push({...tactical,car:blocker});tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(Math.sign(tactical.passLane-3.5),-chosenSide,'A blocked corridor must override the remembered passing side');

// A large closing speed requires braking earlier than the old fixed gap.
tacticalRace.opponents.splice(1);place(tactical.car,400,0,90);tactical.lane=0;
place(tacticalPlayer,445,0,30);
for(const bias of [-3.5,3.5]){const car=new Vehicle(track,new THREE.Scene());place(car,420,bias,30);tacticalRace.opponents.push({...tactical,car});}
tacticalRace.decide(tactical,tacticalPlayer);
assert.ok(tactical.control.brake>.3,'A rapidly closing rival must brake before entering the old fixed following gap');
assert.equal(!!tactical.control.boost,false,'Blocked traffic must not consume ERS');

// One early defensive move, no reactionary second move, and no blocking once
// the attacking car is alongside.
tacticalRace.opponents.splice(1);const defenseMeters=planner.apices[0].progress*track.length-230;
place(tactical.car,defenseMeters,.6,60);tactical.lane=.6;
place(tacticalPlayer,defenseMeters-35,.6,70);tacticalRace.elapsed=30;
tacticalRace.decide(tactical,tacticalPlayer);const defenseLane=tactical.defendLane,defenseCooldown=tactical.defendCooldown;
assert.ok(tactical.defendUntil>30&&defenseCooldown>=38,'An early approaching attack must trigger one bounded defensive move');
place(tacticalPlayer,defenseMeters-35,-.6,70);tacticalRace.elapsed=30.3;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.defendLane,defenseLane,'Defense must not follow a trailing car from side to side');
place(tacticalPlayer,defenseMeters-5,-.6,70);tacticalRace.elapsed=30.4;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.defendUntil,0,'A car alongside must cancel the defensive move');
place(tacticalPlayer,defenseMeters-35,.6,70);tacticalRace.elapsed=31.5;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.defendCooldown,defenseCooldown,'A continuous threat must not bypass the defensive cooldown');
assert.ok(tactical.defendUntil<=tacticalRace.elapsed);

// A designated challenger may spend a partial battery on a clear straight.
place(tactical.car,200,0,75);tactical.lane=0;tactical.car.boost=25;tactical.control.boost=false;
tactical.speedCap=108;tactical.rank=2;tacticalRace.position=1;tactical.attack=1;
tacticalPlayer.position.set(1e6,0,1e6);tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.control.boost,true,'The designated attacker must use a partial ERS battery when a pass is available');
tactical.control.boost=false;tactical.attack=0;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.control.boost,false,'A non-attacker must keep its normal ERS reserve');
tacticalRace.reset();assert.ok(tacticalRace.opponents.every(o=>o.passLane===undefined&&o.passUntil===0&&o.defendUntil===0&&o.defendCooldown===0),'Restart must clear tactical memory');
console.log('PASS: stable passing side, blocked-lane escape, closing-speed braking, single defensive move, cooldown, alongside clearance and tactical ERS');

// Exercise five rivals together against a fast player over more than two laps.
const packRace=new Race(track,new THREE.Scene(),planner),fastPlayer=new Vehicle(track,new THREE.Scene());
packRace.start();packRace.update(4.1,fastPlayer);
const packOffroad=packRace.opponents.map(()=>0);
for(let step=0;step<120*270;step++){
  fastPlayer.distance=step/120*60/track.length;fastPlayer.progress=fastPlayer.distance%1;
  fastPlayer.position.copy(track.point(fastPlayer.progress));fastPlayer.speed=60;
  packRace.update(1/120,fastPlayer);
  packRace.opponents.forEach((o,i)=>{packOffroad[i]+=o.car.offRoad?1:0;});
}
assert.ok(packRace.opponents.every(o=>o.distance>2.65),'Every rival must keep competitive pace with a fast player over multiple laps');
assert.ok(packOffroad.every(frames=>frames/(120*270)<.035),'Faster pack racing must avoid prolonged track departures');
console.log('PASS: all five adaptive rivals exceed 2.65 physical laps in 270s against a fast player');

// Verify rear-facing orientation, actual scene rendering and renderer state
// restoration without requiring a GPU in the physics test runner.
const {RearViewMirror}=await import(moduleURL('RearViewMirror'));
const renderState={target:null,viewport:new THREE.Vector4(0,0,1280,800),scissor:new THREE.Vector4(0,0,1280,800),scissorTest:false};
const mirrorDraws=[];let failMirrorRender=false;
const fakeRenderer={
  autoClear:true,shadowMap:{autoUpdate:true},
  domElement:{getBoundingClientRect:()=>({left:0,top:0,bottom:800,width:1280,height:800})},
  getSize:out=>out.set(1280,800),
  getRenderTarget:()=>renderState.target,setRenderTarget:target=>{renderState.target=target;},
  getViewport:out=>out.copy(renderState.viewport),setViewport:value=>renderState.viewport.copy(value),
  getScissor:out=>out.copy(renderState.scissor),setScissor:value=>renderState.scissor.copy(value),
  getScissorTest:()=>renderState.scissorTest,setScissorTest:value=>{renderState.scissorTest=value;},
  clearDepth:()=>{},
  render:(scene,camera)=>{
    mirrorDraws.push({scene,camera,playerVisible:v.group.visible,target:renderState.target,shadowUpdate:fakeRenderer.shadowMap.autoUpdate});
    if(failMirrorRender)throw new Error('simulated render failure');
  }
};
const mirror=new RearViewMirror(fakeRenderer,scene,{getBoundingClientRect:()=>({left:440,top:16,bottom:116,width:400,height:100})});
for(const heading of [0,.8,Math.PI,-Math.PI/2]){
  v.reset();v.heading=heading;mirror.update(v);
  const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
  assert.ok(mirror.camera.getWorldDirection(new THREE.Vector3()).dot(forward)<-.99,'Rear camera must face behind the vehicle at every heading');
  const right=forward.clone().cross(new THREE.Vector3(0,1,0));
  mirror.camera.updateMatrixWorld(true);
  const behind=v.position.clone().addScaledVector(forward,-20).addScaledVector(right,2).setY(v.position.y+1);
  const projected=behind.project(mirror.camera);
  assert.ok(projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1,'A trailing rival must be visible in the mirror frustum');
  assert.ok(-projected.x>0,'Horizontal reflection must preserve the driver\'s left/right convention');
}
v.group.visible=true;mirror.render(v);
assert.equal(mirrorDraws.length,2,'Mirror must render the live scene and then its reflected texture');
assert.equal(mirrorDraws[0].shadowUpdate,false,'Mirror must reuse the main shadow map instead of rendering it twice');
assert.equal(fakeRenderer.shadowMap.autoUpdate,true,'Main shadow updates must be restored');
assert.equal(mirrorDraws[0].scene,scene);assert.equal(mirrorDraws[0].playerVisible,false);
assert.equal(mirrorDraws[1].playerVisible,true);
assert.ok(mirrorDraws[0].target.width<=640&&mirrorDraws[0].target.height<=180,'Mirror texture must bound the extra render cost');
const mirrorUV=mirror.overlay.children[0].geometry.getAttribute('uv');
assert.equal(mirrorUV.getX(0),1,'Mirror image must actually flip texture coordinates');
assert.equal(renderState.target,null);assert.equal(renderState.scissorTest,false);
assert.ok(renderState.viewport.equals(new THREE.Vector4(0,0,1280,800)));
assert.ok(v.group.visible&&fakeRenderer.autoClear,'Main rendering state must be restored');
failMirrorRender=true;
assert.throws(()=>mirror.render(v),/simulated render failure/);
assert.ok(v.group.visible&&fakeRenderer.autoClear&&renderState.target===null&&!renderState.scissorTest,'Render failures must still restore the main camera state');
assert.equal(fakeRenderer.shadowMap.autoUpdate,true,'Shadow settings must also survive a failed mirror render');
console.log('PASS: live rear-view mirror orientation, reflection, resolution cap and rendering state restoration');


// Calibration assists apply to rivals only. Defaults must remain exactly the
// same for the player, while the assisted car still integrates physical motion.
const playerStock=new Vehicle(track,new THREE.Scene());
assert.equal(playerStock.gripScale,1);assert.equal(playerStock.powerScale,1);
assert.ok(skilledRival.car.gripScale>1&&skilledRival.car.gripScale<=1.5);
assert.ok(skilledRival.car.powerScale>1&&skilledRival.car.powerScale<=1.5);
const implicitStock=body(),explicitStock={...body(),gripScale:1,powerScale:1};
const assistedBody={...body(),gripScale:1.4,powerScale:1.35};
for(let step=0;step<120;step++){
  const control={steer:0,throttle:1,brake:0};
  integrateBody(implicitStock,control,1/120);integrateBody(explicitStock,control,1/120);integrateBody(assistedBody,control,1/120);
}
assert.equal(implicitStock.speed,explicitStock.speed);
assert.ok(implicitStock.position.equals(explicitStock.position),'Player physics must retain the stock trajectory');
assert.ok(assistedBody.speed-35>(implicitStock.speed-35)*1.2,'Rival power calibration must produce real extra acceleration');
assert.ok(assistedBody.position.distanceTo(new THREE.Vector3())>implicitStock.position.distanceTo(new THREE.Vector3()));
for(let step=0;step<120*30;step++)integrateBody(assistedBody,{steer:0,throttle:1,brake:0,boost:true},1/120);
assert.ok(assistedBody.speed<=94,'Base performance without rank assistance must retain the stock hard speed limit');
console.log('PASS: bounded rival performance calibration, unchanged player physics and baseline hard speed limit');

// A return to the racing line must check the swept corridor, not just its
// destination, so it cannot cut across a car already alongside.
const sideRace=new Race(track,new THREE.Scene(),planner),sidePlayer=new Vehicle(track,new THREE.Scene());
sideRace.opponents.splice(1);const sideRival=sideRace.opponents[0],sideProgress=400/track.length;
const offset=planner.point(sideProgress).sub(track.point(sideProgress)).dot(track.normal(sideProgress));
sideRival.car.resetAt(sideProgress,offset+6);sideRival.car.speed=30;sideRival.lane=6;
sidePlayer.resetAt(sideProgress,offset+2.5);sidePlayer.speed=30;
sideRace.elapsed=10;sideRace.decide(sideRival,sidePlayer);
assert.ok(Math.abs(sideRival.lane-6)<.001,'AI must hold its corridor when a merge would cross an alongside vehicle');
console.log('PASS: AI checks the full merge corridor before returning to the racing line');


// Physical top-three contest. A reference driver with the calibrated 86-second
// baseline uses normal throttle/brake/steering controls and no rank assistance.
// Its fixture performance matches the benchmark AI, not the stock player car.
// A slightly slower reference pace (1.40) allows a close contest without
// requiring the previous large catch-up boost or scripted repeated exchanges.
const duelRace=new Race(track,new THREE.Scene(),planner),duelPlayer=new Vehicle(track,new THREE.Scene(),0xaaaaaa,{grip:1.4,power:1.35});
const duelGhost=new Vehicle(track,new THREE.Scene());duelGhost.position.set(1e6,0,1e6);
duelRace.opponents.splice(2);
const duelLane=t=>THREE.MathUtils.clamp(planner.point(t).sub(track.point(t)).dot(track.normal(t))+.6,-7.2,7.2);
duelPlayer.resetAt(200/track.length,duelLane(200/track.length));duelPlayer.speed=75;
duelRace.opponents.forEach((o,i)=>{
  const t=(188-i*12)/track.length;o.car.resetAt(t,THREE.MathUtils.clamp(duelLane(t)+(i%2?3.5:0),-7.2,7.2));
  o.car.speed=75;o.distance=t;o.lane=o.car.position.clone().sub(planner.point(t)).dot(track.normal(t));
});
const referenceDriver={...duelRace.opponents[0],car:duelPlayer,pace:1.40,speedCap:94,powerAssist:1,attack:0,lane:.6,control:{steer:0,throttle:1,brake:0}};
duelRace.state='racing';duelRace.elapsed=20;
let lastLeader='PLAYER',lastChange=0,duelOffroad=0;const leaderStints=[];
for(let step=0;step<120*250;step++){
  referenceDriver.rank=duelRace.position;
  if(step%3===0)duelRace.decide(referenceDriver,duelGhost);
  duelPlayer.drive(1/120,referenceDriver.control);duelRace.update(1/120,duelPlayer);
  const order=[{name:'PLAYER',distance:duelPlayer.distance},...duelRace.opponents.map(o=>({name:o.name,distance:o.car.distance}))].sort((a,b)=>b.distance-a.distance);
  if(order[0].name!==lastLeader){leaderStints.push({name:lastLeader,seconds:step/120-lastChange});lastLeader=order[0].name;lastChange=step/120;}
  duelOffroad+=duelRace.opponents.filter(o=>o.car.offRoad).length;
}
leaderStints.push({name:lastLeader,seconds:250-lastChange});
const sustained=leaderStints.filter(stint=>stint.seconds>=2).reduce((result,stint)=>{
  const previous=result.at(-1);if(previous?.name===stint.name)previous.seconds+=stint.seconds;else result.push({...stint});
  return result;
},[]);
assert.ok(sustained.filter(stint=>stint.name==='PLAYER').length>=2,'The reference player must be able to retake the lead');
assert.ok(sustained.filter(stint=>stint.name!=='PLAYER').length>=1,'Challengers must take and sustain the lead, not only flicker past the player');
assert.ok(duelOffroad/(120*250*2)<.025,'Lead battles must generally stay on the circuit');
assert.equal(duelPlayer.raceSpeedCap,undefined,'The player must never receive AI rank-speed assistance');
console.log('PASS: physical AI overtake and player retake with bounded catch-up',sustained.map(stint=>`${stint.name} ${stint.seconds.toFixed(1)}s`));

// Launch: all drivers use stock power during the first five seconds. Compare
// real acceleration with full throttle on the straight, not just multipliers.
const launchRace=new Race(track,new THREE.Scene(),planner),launchPlayer=new Vehicle(track,new THREE.Scene());
launchRace.state='racing';
for(let step=0;step<120*5;step++){
  launchRace.elapsed=step/120;launchRace.balanceRivals(launchPlayer,1/120);
  launchPlayer.drive(1/120,{throttle:1,brake:0,steer:0});
  for(const o of launchRace.opponents)o.car.drive(1/120,{throttle:1,brake:0,steer:0});
}
assert.ok(launchRace.opponents.every(o=>Math.abs(o.car.speed-launchPlayer.speed)<1),'Opening acceleration must stay within 1 m/s of the stock player');
assert.equal(new Set(launchRace.opponents.map(o=>o.personality)).size,5,'Each rival must have its own personality');
assert.ok(launchRace.opponents.every(o=>o.speedCap<=94.01),'Rank assistance must not affect the opening launch');
console.log('PASS: five individual personalities and comparable five-second standing starts');

const contactRace=new Race(track,new THREE.Scene(),planner),contactPlayer=new Vehicle(track,new THREE.Scene());
const driver=contactRace.opponents[0];contactRace.elapsed=20;
contactRace.scoreContact(driver.car,contactPlayer,'0:1',4);
const score=driver.collisionScore;
assert.ok(score<0&&driver.collisionCount===1&&driver.avoidance>0);
contactRace.elapsed+=.1;contactRace.scoreContact(driver.car,contactPlayer,'0:1',4);
assert.equal(driver.collisionScore,score,'Sustained contact must not produce a new penalty every physics frame');
contactRace.elapsed+=1;contactRace.scoreContact(driver.car,contactPlayer,'0:1',4);
assert.ok(driver.collisionScore<score&&driver.collisionCount===2,'A later separate incident must count again');
// The penalty changes an actual decision: a previously safe following gap now
// causes more conservative braking. Block both overtaking corridors.
contactRace.opponents.splice(1);place(driver.car,400,0,40);driver.lane=0;
place(contactPlayer,413,0,36);
for(const bias of [-3.5,3.5]){const car=new Vehicle(track,new THREE.Scene());place(car,408,bias,36);contactRace.opponents.push({...driver,car});}
driver.avoidance=0;contactRace.decide(driver,contactPlayer);const ordinaryThrottle=driver.control.throttle,ordinaryBrake=driver.control.brake;
driver.avoidance=1.5;contactRace.decide(driver,contactPlayer);
assert.ok(driver.control.brake>ordinaryBrake||driver.control.throttle<ordinaryThrottle,'Negative contact feedback must increase following margin in real control decisions');
contactRace.reset();assert.ok(contactRace.opponents.every(o=>o.collisionScore===0&&o.collisionCount===0&&o.avoidance===0&&o.car.raceLaunchScale===undefined));
console.log('PASS: contact penalty, incident debounce, changed driving decisions and restart');


// Exercise the actual collision-resolution path for both player/AI and AI/AI.
const physicalContactRace=new Race(track,new THREE.Scene(),planner),physicalContactPlayer=new Vehicle(track,new THREE.Scene());
physicalContactRace.opponents.splice(2);physicalContactRace.state='racing';physicalContactRace.elapsed=40;
const [contactA,contactB]=physicalContactRace.opponents;
place(physicalContactPlayer,400,0,0);place(contactA.car,400,0,0);place(contactB.car,600,0,0);
physicalContactRace.update(1/120,physicalContactPlayer);
assert.equal(contactA.collisionCount,1);assert.equal(contactB.collisionCount,0);
place(physicalContactPlayer,100,0,0);place(contactA.car,700,0,0);place(contactB.car,700,0,0);
physicalContactRace.update(1/120,physicalContactPlayer);
assert.equal(contactA.collisionCount,2);assert.equal(contactB.collisionCount,1);
assert.ok(contactA.collisionScore<0&&contactB.collisionScore<0);
console.log('PASS: physical player/AI and AI/AI collisions apply separate agent penalties');

const {soundTelemetry,DrivingAudio}=await import(moduleURL('DrivingAudio'));
const telemetry={speed:0,throttle:0,brake:0,lateralSpeed:0,gripUsage:0,offRoad:false};
assert.equal(soundTelemetry({...telemetry,brake:1}).brake,0,'Stationary braking must be silent');
assert.equal(soundTelemetry(telemetry).tire,0);
assert.ok(soundTelemetry({...telemetry,speed:30,throttle:1}).rpm>soundTelemetry({...telemetry,speed:30}).rpm);
assert.ok(soundTelemetry({...telemetry,speed:30,brake:1}).brake>0);
assert.ok(soundTelemetry({...telemetry,speed:30,lateralSpeed:4,gripUsage:1}).tire>soundTelemetry({...telemetry,speed:30}).tire);
assert.ok(soundTelemetry({...telemetry,speed:30,offRoad:true}).road>soundTelemetry({...telemetry,speed:30}).road);
// A fake Web Audio graph verifies actual routing, silence and gesture reuse.
const audioNodes=[];let resumes=0;
class AudioParam {value=0;setTargetAtTime(value){this.value=value;}}
class AudioNode {gain=new AudioParam();frequency=new AudioParam();pan=new AudioParam();Q=new AudioParam();connections=[];connect(node){this.connections.push(node);}start(){this.started=true;}}
globalThis.AudioContext=class {currentTime=0;sampleRate=48000;destination={};createGain(){const n=new AudioNode();audioNodes.push(n);return n;}createDynamicsCompressor(){return new AudioNode();}createOscillator(){return new AudioNode();}createStereoPanner(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}createBuffer(){return {getChannelData:()=>new Float32Array(96000)};}createBufferSource(){return new AudioNode();}close(){return Promise.resolve();}resume(){resumes++;return Promise.resolve();}};
const audio=new DrivingAudio();audio.unlock([v,a]);const nodeCount=audioNodes.length;audio.unlock([v,a]);assert.equal(audioNodes.length,nodeCount,'Repeated gestures must reuse voices');
audio.update(v,true);assert.ok(audioNodes[0].gain.value>0);audio.toggleMute();assert.equal(audioNodes[0].gain.value,0);audio.toggleMute();
audio.setVolume(.3);assert.equal(audioNodes[0].gain.value,.3);audio.silence();assert.equal(audioNodes[0].gain.value,0);audio.update(v,true);assert.equal(audioNodes[0].gain.value,.3);audio.update(v,false);assert.equal(audioNodes[0].gain.value,0);
assert.ok(resumes===2);
const goodAudioContext=globalThis.AudioContext;
globalThis.AudioContext=class extends goodAudioContext {createStereoPanner(){throw new Error('Unsupported stereo audio');}};
const unavailableAudio=new DrivingAudio();assert.doesNotThrow(()=>{unavailableAudio.unlock([v]);unavailableAudio.update(v,true);unavailableAudio.silence();});
assert.equal(unavailableAudio.context,undefined,'Partial failed graphs must be discarded');
delete globalThis.AudioContext;
console.log('PASS: engine/load, moving brake, tire slip, surface sound, graph reuse, mute, volume and pause/resume silence');
