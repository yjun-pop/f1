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
  js=js.replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
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
assert.equal(camera.eyeHeight,1.5,'The driver eye height must remain fixed at 1.5m');
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
const race=new Race(track,scene,planner);race.start();race.update(race.countdown+.1,v);assert.equal(race.state,'racing');
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
for(const [speed,brakingTime,turnTime,trail,maxSlip,minYaw] of [[60,1.7,1.5,false,6.2,.95],[40,0,1,true,8,1],[60,0,1,false,3,.45]]){
  const car=body();car.speed=speed;let peakSlip=0,peakYaw=0;
  for(let i=0;i<brakingTime*120;i++)integrateBody(car,{throttle:0,brake:1,steer:0,keyboard:true},1/120);
  for(let i=0;i<(turnTime+2)*120;i++){
    const turning=i<turnTime*120;
    integrateBody(car,{throttle:0,brake:turning&&trail?1:0,steer:turning?1:0,keyboard:true},1/120);
    peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(car.lateralSpeed,Math.max(1,car.speed)))*180/Math.PI);
    peakYaw=Math.max(peakYaw,Math.abs(car.yawRate));
  }
  assert.ok(peakSlip<maxSlip,'Digital corner entry must limit excessive sliding');
  if(trail)assert.ok(peakSlip>6,'Full simultaneous braking and steering must require managing tire slip');
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
race.reset();race.start();race.update(race.countdown+.1,v);v.resetAt(0);v.position.set(1000,0,1000);
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
assert.ok(behindRun.peak>aheadRun.peak+1&&behindRun.peak<=104&&aheadRun.peak>=72,'A distant leader must ease off and a distant trailing car must close within physical speed bounds');
assert.ok(behindRun.meters>aheadRun.meters+5,'Higher caps must translate into physical progress, not only configuration');
assert.equal(behindRun.offroad+aheadRun.offroad,0);
const coasting={...body(),speed:100,raceSpeedCap:92,raceCruiseCap:85,racePowerAssist:1};
integrateBody(coasting,{steer:0,throttle:0,brake:0},1/120);
assert.ok(coasting.speed>99.8&&coasting.speed<100,'A reduced cap must let an over-speed car decelerate physically rather than snap to the cap');
console.log('PASS: physical rank-based straight-line catch-up and smooth speed-limit reductions',JSON.stringify({aheadKmh:(aheadRun.peak*3.6).toFixed(1),behindKmh:(behindRun.peak*3.6).toFixed(1)}));

// Measure a full solo lap: speed multipliers alone must not hide a poor driver.
const skilledRace=new Race(track,new THREE.Scene(),planner),benchmarkPlayer=new Vehicle(track,new THREE.Scene());
skilledRace.opponents.splice(1);skilledRace.start();skilledRace.update(skilledRace.countdown+.1,benchmarkPlayer);
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
passingRace.start();passingRace.update(passingRace.countdown+.1,slowCar);
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
tacticalRace.opponents.splice(1);const defenseMeters=planner.apices[2].progress*track.length-230;
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
assert.equal(tactical.control.boost,true,'Other challengers must also spend ERS to pressure a leading player');
tactical.control.boost=false;tactical.car.boost=21;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.control.boost,false,'A secondary challenger must retain its lower but bounded ERS reserve');
tactical.car.boost=25;tactical.rank=3;tacticalRace.position=2;tacticalRace.decide(tactical,tacticalPlayer);
assert.equal(tactical.control.boost,false,'Outside the player-leader contest the normal ERS reserve must remain');
tacticalRace.reset();assert.ok(tacticalRace.opponents.every(o=>o.passLane===undefined&&o.passUntil===0&&o.defendUntil===0&&o.defendCooldown===0),'Restart must clear tactical memory');
console.log('PASS: stable passing side, blocked-lane escape, closing-speed braking, single defensive move, cooldown, alongside clearance and tactical ERS');

// Exercise five rivals together against a fast player over more than two laps.
const packRace=new Race(track,new THREE.Scene(),planner),fastPlayer=new Vehicle(track,new THREE.Scene());
packRace.start();packRace.update(packRace.countdown+.1,fastPlayer);
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
// Safe queues may delay a pass for this particular reference driver; do not
// require a fixed number of lead swaps. Clean overtaking is checked above.
assert.ok(duelRace.opponents.some(o=>Math.abs(o.car.distance-duelPlayer.distance)*track.length<120),'At least one physical challenger must remain close after the 250-second battle');
assert.ok(duelOffroad/(120*250*2)<.025,'Lead battles must generally stay on the circuit');
assert.equal(duelPlayer.raceSpeedCap,undefined,'The player must never receive AI rank-speed assistance');
console.log('PASS: sustained close physical contest with bounded catch-up and safe corner queues',sustained.map(stint=>`${stint.name} ${stint.seconds.toFixed(1)}s`));

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
class AudioParam {value=0;events=[];setTargetAtTime(value){this.value=value;}cancelScheduledValues(time){this.events.push({kind:"cancel",time});}setValueAtTime(value,time){this.value=value;this.events.push({kind:"set",value,time});}linearRampToValueAtTime(value,time){this.value=value;this.events.push({kind:"ramp",value,time});}}
class AudioNode {gain=new AudioParam();frequency=new AudioParam();pan=new AudioParam();Q=new AudioParam();threshold=new AudioParam();knee=new AudioParam();ratio=new AudioParam();connections=[];connect(node){this.connections.push(node);}start(){this.started=true;}setPeriodicWave(wave){this.wave=wave;}}
globalThis.AudioContext=class {currentTime=0;sampleRate=48000;destination={};createPeriodicWave(real,imag){return {real,imag};}createGain(){const n=new AudioNode();audioNodes.push(n);return n;}createDynamicsCompressor(){return new AudioNode();}createOscillator(){return new AudioNode();}createStereoPanner(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}createBuffer(){return {getChannelData:()=>new Float32Array(96000)};}createBufferSource(){return new AudioNode();}close(){return Promise.resolve();}resume(){resumes++;return Promise.resolve();}};
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


// Stateful reference-engine sound: upshift cuts, RPM drops, downshift blips,
// bounded pitch and hysteresis, independent from the physical controls.
const {EngineSoundState,ENGINE_TIMBRES}=await import(moduleURL('EngineSound'));
const gearbox=new EngineSoundState(),trace=[];let hadCut=false,hadBlip=false;
let testSpeed=0,previousGear=1;
for(let i=0;i<120*42;i++){
  const accelerating=i<120*24;testSpeed=Math.max(0,Math.min(94,testSpeed+(accelerating?4:-6)/120));
  const car={...telemetry,speed:testSpeed,throttle:accelerating?1:0,brake:accelerating?0:1};
  const snapshot=JSON.stringify(car),sample=gearbox.advance(car,1/120);
  assert.equal(JSON.stringify(car),snapshot,'Audio must never alter vehicle inputs or motion');
  assert.ok(Number.isFinite(sample.rpm)&&sample.rpm>=3800&&sample.rpm<=12800);
  if(sample.gear!==previousGear){trace.push({gear:sample.gear,speed:testSpeed,rpm:sample.rpm});previousGear=sample.gear;}
  hadCut ||=sample.cut<.8;hadBlip ||=sample.blip>.2;
}
assert.ok(trace.some(x=>x.gear===8),'Full acceleration must reach the eighth audio gear');
assert.equal(gearbox.gear,1);assert.ok(hadCut&&hadBlip,'Acceleration must cut on upshifts; braking must trigger rev-matching blips');
assert.ok(trace.length<=14,'A smooth acceleration/braking sweep must not chatter between gears');
const upshifts=trace.filter((entry,i)=>entry.gear>(trace[i-1]?.gear??1));
for(const [i,kmh] of [98,129,159,189,224,259,294].entries())assert.ok(Math.abs(upshifts[i].speed*3.6-kmh)<2,'Monza upshifts must follow the calibrated eight-speed gearing');
const hardBrakeGearbox=new EngineSoundState();hardBrakeGearbox.advance({...telemetry,speed:94},1/60);
let brakingGear;
for(let i=0;i<120*2.5;i++)brakingGear=hardBrakeGearbox.advance({...telemetry,speed:Math.max(20,94-i/120*35),throttle:0,brake:1},1/120);
assert.ok(brakingGear.gear<=2,'Hard braking into a chicane must not leave the display stuck in a high gear');
assert.equal(new EngineSoundState().advance({...telemetry,speed:0},1/60).gear,1,'The engaged launch gear is first, not an invented neutral');
const stableGearbox=new EngineSoundState();const stable={...telemetry,speed:42,throttle:.7};
for(let i=0;i<600;i++)stableGearbox.advance(stable,1/120);
const heldGear=stableGearbox.gear;
for(let i=0;i<600;i++){stableGearbox.advance({...stable,speed:42+Math.sin(i)*.1},1/120);assert.equal(stableGearbox.gear,heldGear);}
assert.equal(ENGINE_TIMBRES.length,4);
assert.equal(new Set(ENGINE_TIMBRES.map(x=>JSON.stringify(x.high))).size,4,'Reference-derived manufacturers must have different spectra');
for(const timbre of ENGINE_TIMBRES)for(const band of [timbre.low,timbre.high]){
  assert.ok(band.every(x=>Number.isFinite(x)&&x>=0));assert.equal(band[0],0);
  assert.ok(band.slice(8).some(x=>x>.05),'Reference upper harmonics must survive beyond the previous two-tone engine');
}
// The real graph must use the measured periodic spectra with a load-dependent
// low-pass; the driver and the closest rival must have different timbres.
const referenceAudio=new DrivingAudio();globalThis.AudioContext=goodAudioContext;
referenceAudio.unlock([v,a]);referenceAudio.update(v,true);
assert.equal(referenceAudio.voices.length,2);
assert.notDeepEqual(referenceAudio.voices[0].high.wave.imag,referenceAudio.voices[1].high.wave.imag);
assert.ok(referenceAudio.voices.every(voice=>voice.low.frequency.value===voice.high.frequency.value&&voice.filter.frequency.value>=1900));
assert.ok(referenceAudio.voices.every(voice=>voice.lowGain.gain.value>=0&&voice.highGain.gain.value>=0));
delete globalThis.AudioContext;
console.log('PASS: reference harmonic banks, individual engine timbres, eight gears, shift cut, downshift blips, pitch bounds and anti-chatter');


// Reproduce the five-car standing-start pile-up at Rettifilo, then repeat
// with mirrored grid lanes and a fast rolling pack. Check real contacts and
// road departures until every car clears BOTH chicane apices.
const chicaneResults=[];
for(const scenario of ['grid','mirrored-grid','rolling-pack']){
  const testRace=new Race(track,new THREE.Scene(),planner),ghost=new Vehicle(track,new THREE.Scene());
  ghost.position.set(1e6,0,1e6);testRace.state='racing';
  if(scenario!=='grid')testRace.opponents.forEach((o,i)=>{
    const meters=scenario==='rolling-pack'?700+(4-i)*12:15+(4-i)*12;
    const progress=meters/track.length,lane=i%2?-3:3;
    o.car.resetAt(progress,lane);o.car.speed=scenario==='rolling-pack'?75:0;
    o.lane=lane-planner.point(progress).sub(track.point(progress)).dot(track.normal(progress));
  });
  let offroad=0,cleared=false,time=0;const firstHeavyBrake=Array(5).fill(Infinity);
  for(let step=0;step<120*45;step++){
    testRace.update(1/120,ghost);time=(step+1)/120;
    offroad+=testRace.opponents.filter(o=>o.car.offRoad).length;
    testRace.opponents.forEach((o,i)=>{const meters=o.car.progress*track.length;if(meters>650&&meters<1080&&o.control.brake>.4)firstHeavyBrake[i]=Math.min(firstHeavyBrake[i],meters);});
    if(testRace.opponents.every(o=>o.car.distance*track.length>1180)){cleared=true;break;}
  }
  assert.ok(cleared,`${scenario}: all five must clear the chicane without stopping indefinitely`);
  assert.equal(testRace.opponents.reduce((sum,o)=>sum+o.collisionCount,0),0,`${scenario}: no AI contact at the first chicane`);
  assert.equal(offroad,0,`${scenario}: chicane traffic must stay on asphalt`);
  if(scenario==='grid')assert.ok(firstHeavyBrake.every(meters=>meters>800&&meters<1080),'Normal launch must not panic-brake 350m before the chicane');
  chicaneResults.push({scenario,seconds:time.toFixed(2),contacts:0,offroad:0});
}
const queueRace=new Race(track,new THREE.Scene(),planner),queuePlayer=new Vehicle(track,new THREE.Scene());
queueRace.opponents.splice(1);const queued=queueRace.opponents[0];
place(queued.car,800,-3,70);queued.lane=-3;place(queuePlayer,830,3,35);
queueRace.elapsed=20;queued.passLane=-3;queued.passUntil=22;
queueRace.decide(queued,queuePlayer);
assert.ok(queued.control.brake>.2,'A car in the other lane must still cause early queue braking');
assert.equal(queued.passUntil,0);assert.equal(queued.defendUntil,0);
// A full-throttle sample must keep the standalone whistle below the engine
// and attenuate the broad high end without removing the measured timbres.
globalThis.AudioContext=goodAudioContext;
const balancedAudio=new DrivingAudio();v.speed=90;v.throttle=1;
balancedAudio.unlock([v]);for(let i=0;i<240;i++)balancedAudio.update(v,true);
const balancedVoice=balancedAudio.voices[0];
assert.ok(balancedVoice.turboGain.gain.value<=.0061,'The isolated high-frequency tone must stay subdued');
assert.ok(balancedVoice.shelf.gain.value<=-5&&balancedVoice.shelf.type==='highshelf');
assert.ok(balancedVoice.filter.frequency.value<=4500,'Full load must keep a bounded, non-resonant high end');
assert.ok(balancedVoice.lowGain.gain.value>0||balancedVoice.highGain.gain.value>0,'Engine body must remain audible');
delete globalThis.AudioContext;
console.log('PASS: first-chicane queue, cross-lane braking and balanced high-frequency audio',chicaneResults);

// Each car owns a distinct brain, reaction clock and opponent memory. All
// first-step decisions use the same pre-integration snapshot of the field.
const agentRace=new Race(track,new THREE.Scene(),planner),agentGhost=new Vehicle(track,new THREE.Scene());
agentGhost.position.set(1e6,0,1e6);agentRace.state='racing';
const brains=agentRace.opponents.map(o=>o.agent);
assert.equal(new Set(brains).size,5);
agentRace.update(1/120,agentGhost);
const sharedObservation=brains[0].observation.traffic;
for(const [i,o] of agentRace.opponents.entries()){
  assert.equal(o.agent.driver,o);assert.equal(o.agent.decisions,1);
  assert.equal(o.agent.observation.traffic,sharedObservation);
  const observed=sharedObservation.find(sample=>sample.car===o.car);
  assert.notEqual(observed.position,o.car.position,'Perception must not change as another car integrates motion');
  const previous=observed.position.clone();o.car.position.x+=1;assert.ok(observed.position.equals(previous));o.car.position.x-=1;
  assert.equal(o.agent,brains[i]);
}
for(let i=0;i<120*2;i++)agentRace.update(1/120,agentGhost);
assert.ok(brains.every(brain=>brain.decisions>1&&brain.memorySize>0));
assert.ok(new Set(brains.map(brain=>brain.decisions)).size>1,'Reaction profiles must produce independent decision clocks');
agentRace.scoreContact(agentRace.opponents[0].car,agentGhost,'isolated-contact',3);
assert.equal(brains[0].memoryFor(agentGhost).contacts,1);
assert.ok(brains.slice(1).every(brain=>brain.memoryFor(agentGhost)===undefined),'An unrelated driver must not inherit another driver\'s incident');
assert.ok(agentRace.opponents.slice(1).every(o=>o.collisionScore===0));
agentRace.reset();assert.ok(brains.every(brain=>brain.memorySize===0&&brain.decisions===0&&brain.intent==='race'));
assert.ok(agentRace.opponents.every((o,i)=>o.agent===brains[i]),'Restart must reset the existing brains rather than leak controllers');

// A recent incident changes only that driver's tactical decision, then the
// same safe corridor becomes available again after its local settling time.
const learningRace=new Race(track,new THREE.Scene(),planner),learningTarget=new Vehicle(track,new THREE.Scene());
learningRace.opponents.splice(1);const learningDriver=learningRace.opponents[0];learningRace.elapsed=20;
place(learningDriver.car,300,0,45);learningDriver.lane=0;place(learningTarget,340,0,30);
learningRace.decide(learningDriver,learningTarget);assert.equal(learningDriver.agent.intent,'overtake');
assert.equal(learningDriver.agent.target,learningTarget);
learningRace.scoreContact(learningDriver.car,learningTarget,'learning-contact',2);
learningRace.elapsed=20.3;learningRace.decide(learningDriver,learningTarget);
assert.equal(learningDriver.agent.intent,'yield');assert.equal(learningDriver.passLane,undefined);
learningRace.elapsed=21.5;learningRace.decide(learningDriver,learningTarget);assert.equal(learningDriver.agent.intent,'overtake');
assert.equal(learningDriver.agent.memoryFor(learningTarget).contacts,1);

// Reversing iteration order must not change decisions just because one car
// happened to move first. Keep the original grid positions when reversing.
const orderA=new Race(track,new THREE.Scene(),planner),orderB=new Race(track,new THREE.Scene(),planner);
orderA.state=orderB.state='racing';orderB.opponents.reverse();
for(let i=0;i<120*2;i++){orderA.update(1/120,agentGhost);orderB.update(1/120,agentGhost);}
for(const a of orderA.opponents){
  const b=orderB.opponents.find(o=>o.name===a.name);
  assert.ok(a.car.position.distanceTo(b.car.position)<1e-7,'Driver iteration order must not alter the launch');
  assert.ok(Math.abs(a.control.steer-b.control.steer)<1e-8&&Math.abs(a.control.throttle-b.control.throttle)<1e-8);
}
console.log('PASS: five independent driver agents, individual reaction clocks, snapshot perception, private contact memory, tactical settling, reset and iteration-order independence');


// Both sides of the field must converge on the active player's pace. Match
// normalized pace, so braking at a corner does not park the other cars.
const {PackDirector}=await import(moduleURL('PackDirector'));
const director=new PackDirector(),paceCar=new Vehicle(track,new THREE.Scene());paceCar.speed=60;
for(let i=0;i<120*10;i++)director.observe(paceCar,60,true,1/120);
assert.ok(director.active);assert.ok(Math.abs(director.pace-1)<1e-9);
const closeTarget=director.targets(28,1,3,1.46,0),escaped=director.targets(250,1,3,1.46,0),lagging=director.targets(-250,5,3,1.45,1);
assert.ok(escaped.cap<closeTarget.cap&&escaped.pace<closeTarget.pace,'A distant leader must ease corner pace as well as straight speed');
assert.ok(lagging.cap>closeTarget.cap&&lagging.pace>closeTarget.pace&&lagging.power>1,'Every distant trailing rival must get useful catch-up targets');
assert.ok(lagging.cap<=104&&lagging.pace<=1.47&&lagging.power<=1.15);
paceCar.speed=30;for(let i=0;i<120*10;i++)director.observe(paceCar,30,true,1/120);
assert.ok(Math.abs(director.pace-1)<1e-9,'A slower corner at the same relative pace must not reduce the field to that absolute speed');
paceCar.speed=0;for(let i=0;i<120*3;i++)director.observe(paceCar,87,true,1/120);assert.equal(director.active,false,'Parking must not stop the entire race');
director.reset();assert.equal(director.pace,1);assert.equal(director.active,false);

// Run a stock keyboard-handling reference driver for a full three-lap race.
// This controller follows the guide and brakes for physical traffic, just as
// a driver must; it receives no AI grip/power or rank-speed assistance.
const closeRace=new Race(track,new THREE.Scene(),planner),closePlayer=new Vehicle(track,new THREE.Scene());
closeRace.state='racing';let nearFrames=0,measuredFrames=0;const earlyStops=Array(5).fill(0);
for(let step=0;step<120*400&&closeRace.state==='racing';step++){
  const lookahead=THREE.MathUtils.clamp(7+closePlayer.speed*.3,9,26),to=planner.point(closePlayer.progress+lookahead/track.length).sub(closePlayer.position);
  const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-closePlayer.heading),Math.cos(desired-closePlayer.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
  const steer=THREE.MathUtils.clamp((angle-closePlayer.yawRate*.018)/steeringLock(closePlayer.speed),-1,1);
  let advised=planner.advice(closePlayer.progress,closePlayer.speed);
  for(const o of closeRace.opponents){
    let gap=o.car.progress-closePlayer.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;gap*=track.length;
    const lateral=o.car.position.clone().sub(closePlayer.position).dot(track.normal(closePlayer.progress));
    if(gap>0&&gap<40&&Math.abs(lateral)<2.8)advised=Math.min(advised,Math.max(0,o.car.speed+(gap-8-closePlayer.speed*.12)*.5));
  }
  const difference=advised-closePlayer.speed;
  closePlayer.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});
  closeRace.update(1/120,closePlayer);
  if(step>120*30){measuredFrames++;if(closeRace.opponents.every(o=>Math.abs(o.car.distance-closePlayer.distance)*track.length<150))nearFrames++;}
  closeRace.opponents.forEach((o,i)=>{const meters=o.car.progress*track.length;if(meters>650&&meters<970&&o.car.speed<10)earlyStops[i]++;});
}
assert.equal(closeRace.state,'finished');
assert.ok(nearFrames/measuredFrames>.9,'All five rivals must remain within 150m for most of an actual stock-player race');
assert.ok(closeRace.opponents.every(o=>Math.abs(o.car.distance-closePlayer.distance)*track.length<100),'The leader and every trailing rival must finish close to the player');
assert.ok(earlyStops.every(frames=>frames===0),'Rivals must not crawl or stop on the first-corner approach');
assert.equal(closePlayer.gripScale,1);assert.equal(closePlayer.powerScale,1);assert.equal(closePlayer.raceSpeedCap,undefined);
console.log('PASS: two-sided player-pace matching and full three-lap close field',{nearFraction:nearFrames/measuredFrames,gaps:closeRace.opponents.map(o=>Math.round((o.car.distance-closePlayer.distance)*track.length)),earlyStops});
closeRace.reset();assert.ok(closeRace.opponents.every(o=>o.racePace===undefined));


// A leading player must be challenged rather than assigned a safe following
// procession. The first two goals must invite a pass, and pressure must remain
// active even after rivals are already within 10–20m of the leader.
const pressureDirector=new PackDirector();
for(const rank of [2,3])assert.ok(pressureDirector.targets(-15,rank,1,1.42,1).desiredGap>0);
const closeChaser=pressureDirector.targets(-15,2,1,1.42,1),ordinaryFollower=pressureDirector.targets(-15,3,2,1.42,1);
assert.ok(closeChaser.pace>ordinaryFollower.pace&&closeChaser.cap>ordinaryFollower.cap,'Closing the gap must not switch off leader pressure');
for(const rank of [2,3,4,5,6]){
  const target=pressureDirector.targets(-60,rank,1,1.42,0);
  assert.ok(target.cap>=100&&target.power>=1.1,'All five trailing cars must actively pursue a leading player');
  assert.ok(target.pace<=1.47&&target.cap<=104&&target.power<=1.15,'Pursuit must retain the existing physical safety bounds');
}

for(const driverPace of [1,1.1]){
  const leaderRace=new Race(track,new THREE.Scene(),planner),leaderPlayer=new Vehicle(track,new THREE.Scene());
  leaderPlayer.resetAt(200/track.length);leaderRace.state='racing';
  let firstChallenge=Infinity,wasLeading=true,pressureFrames=0,leadingFrames=0;
  for(let step=0;step<120*180;step++){
    const lookahead=THREE.MathUtils.clamp(7+leaderPlayer.speed*.3,9,26),to=planner.point(leaderPlayer.progress+lookahead/track.length).sub(leaderPlayer.position);
    const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-leaderPlayer.heading),Math.cos(desired-leaderPlayer.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-leaderPlayer.yawRate*.018)/steeringLock(leaderPlayer.speed),-1,1);
    let advised=Math.min(94,planner.advice(leaderPlayer.progress,leaderPlayer.speed)*driverPace);
    for(const o of leaderRace.opponents){
      let gap=o.car.progress-leaderPlayer.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;gap*=track.length;
      const side=o.car.position.clone().sub(leaderPlayer.position).dot(track.normal(leaderPlayer.progress));
      if(gap>0&&gap<40&&Math.abs(side)<2.8)advised=Math.min(advised,Math.max(0,o.car.speed+(gap-8-leaderPlayer.speed*.12)*.5));
    }
    const difference=advised-leaderPlayer.speed;
    leaderPlayer.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1),boost:advised>78&&leaderPlayer.speed>35&&Math.abs(error)<.09});
    leaderRace.update(1/120,leaderPlayer);
    const gap=Math.min(...leaderRace.opponents.map(o=>(leaderPlayer.distance-o.car.distance)*track.length));
    if(step>120*20&&leaderRace.position===1){leadingFrames++;if(gap<25)pressureFrames++;}
    if(wasLeading&&leaderRace.position>1)firstChallenge=Math.min(firstChallenge,step/120);
    wasLeading=leaderRace.position===1;
  }
  assert.ok(firstChallenge<70,'A player with a 137–185m head start must face a physical overtake attempt within 70 seconds');
  assert.ok(pressureFrames/Math.max(1,leadingFrames)>.6,'A leading stock player must generally have a challenger within 25m');
  assert.ok(leaderRace.opponents.every(o=>Math.abs(o.car.distance-leaderPlayer.distance)*track.length<150),'The entire pursuing field must remain within the common 150m pack range');
  assert.equal(leaderPlayer.gripScale,1);assert.equal(leaderPlayer.powerScale,1);assert.equal(leaderPlayer.raceSpeedCap,undefined);
  console.log('PASS: leading player faces sustained physical pressure and an AI pass',{driverPace,firstChallenge,pressureFraction:pressureFrames/Math.max(1,leadingFrames),gaps:leaderRace.opponents.map(o=>Math.round((leaderPlayer.distance-o.car.distance)*track.length))});
}


// Regression for the reported pace: physically generate a ~90s standing lap
// (including a two-second launch hesitation) and ~85.6s flying laps. The
// fixture uses the existing calibrated AI performance to reproduce those
// timings; the game's player stays stock. Replay that trajectory as a ghost
// while every rival still drives and collides through normal vehicle physics.
const replayDirector=new PackDirector();replayDirector.recordLap(90,true);
assert.ok(replayDirector.referencePace>1.44,'A 90s standing lap must identify the fast driver instead of matching straight speed');
replayDirector.recordLap(85.6);assert.ok(replayDirector.referencePace>1.46);
const eliteTarget=replayDirector.targets(-150,6,1,1.36,0);
assert.ok(eliteTarget.pace>1.49&&eliteTarget.pace<=1.53&&eliteTarget.power>1.3&&eliteTarget.power<=1.35&&eliteTarget.cap<=104);
replayDirector.reset();assert.equal(replayDirector.referencePace,1,'Restart must clear fast-lap classification');
replayDirector.recordLap(120);assert.equal(replayDirector.referencePace,1,'A slower lap must not activate the elite pursuit limits');

const referenceRace=new Race(track,new THREE.Scene(),planner),referenceGhost=new Vehicle(track,new THREE.Scene());
referenceGhost.position.set(1e6,0,1e6);referenceRace.opponents.splice(1);const recordedDriver=referenceRace.opponents[0];
const referenceOffset=planner.point(0).sub(track.point(0)).dot(track.normal(0));
recordedDriver.car.resetAt(0,referenceOffset+.6);recordedDriver.lane=.6;referenceRace.state='racing';
referenceRace.balanceRivals=()=>{referenceRace.position=1;recordedDriver.rank=2;};
const trajectory=[],referenceLaps=[];let referenceCrossed=0,previousCrossing=0,referenceOffroad=0;
for(let step=0;step<120*280;step++){
  if(step>=120*2)referenceRace.update(1/120,referenceGhost);
  const c=recordedDriver.car;
  trajectory.push({position:c.position.clone(),progress:c.progress,distance:c.distance,heading:c.heading,speed:c.speed,acceleration:c.acceleration,lateralAcceleration:c.lateralAcceleration,brake:c.brake,throttle:c.throttle});
  referenceOffroad+=c.offRoad?1:0;
  if(c.distance>=referenceCrossed+1){const time=(step+1)/120;referenceLaps.push(time-previousCrossing);previousCrossing=time;referenceCrossed++;if(referenceCrossed===3)break;}
}
assert.equal(referenceLaps.length,3);assert.ok(Math.abs(referenceLaps[0]-90)<1);
assert.ok(referenceLaps.slice(1).every(lap=>Math.abs(lap-85.6)<.7));assert.equal(referenceOffroad,0);
const eliteResults=[];
for(const initial of ['grid','180m-deficit']){
  const eliteRace=new Race(track,new THREE.Scene(),planner),recordedPlayer=new Vehicle(track,new THREE.Scene());eliteRace.state='racing';
  if(initial==='180m-deficit')eliteRace.opponents.forEach((o,i)=>{
    const progress=-(180+i*14)/track.length,lane=i%2?3:-3;o.car.resetAt(progress,lane);
    o.lane=lane-planner.point(progress).sub(track.point(progress)).dot(track.normal(progress));
  });
  const departures=Array(5).fill(0);
  for(const f of trajectory){
    recordedPlayer.position.copy(f.position);recordedPlayer.progress=f.progress;recordedPlayer.distance=f.distance;recordedPlayer.heading=f.heading;recordedPlayer.speed=f.speed;
    recordedPlayer.acceleration=f.acceleration;recordedPlayer.lateralAcceleration=f.lateralAcceleration;recordedPlayer.brake=f.brake;recordedPlayer.throttle=f.throttle;
    eliteRace.update(1/120,recordedPlayer);
    eliteRace.opponents.forEach((o,i)=>{departures[i]+=o.car.offRoad?1:0;assert.ok(o.car.gripScale<=1.5&&o.powerAssist<=1.35&&o.speedCap<=104);});
  }
  const gaps=eliteRace.opponents.map(o=>(recordedPlayer.distance-o.car.distance)*track.length);
  assert.ok(gaps.every(gap=>Math.abs(gap)<150),'Every rival must finish within 150m of the actual 90/85-second reference');
  assert.ok(Math.min(...gaps.map(Math.abs))<35,'At least one challenger must be within 35m at the finish');
  assert.ok(departures.every(frames=>frames/trajectory.length<.02),'Elite pursuit must not repeatedly throw rivals off the track');
  if(initial==='180m-deficit'){
    assert.ok(departures.every(frames=>frames===0));assert.ok(eliteRace.opponents.every(o=>o.collisionCount===0),'Clean pursuit from behind must remain contact-free');
  }
  assert.equal(recordedPlayer.gripScale,1);assert.equal(recordedPlayer.powerScale,1);assert.equal(recordedPlayer.raceSpeedCap,undefined);
  eliteResults.push({initial,gaps:gaps.map(Math.round),offroadFraction:departures.map(frames=>frames/trajectory.length)});
  eliteRace.reset();assert.ok(eliteRace.opponents.every(o=>o.car.gripScale===1.4&&o.car.raceGripAssist===undefined));
}
console.log('PASS: 90s standing / 85.6s flying reference and all five physical rivals stay close',referenceLaps,eliteResults);

// Engine body must add controlled, load-linked low exhaust orders, with a
// short throttle/gear engagement punch and the same master mute path.
globalThis.AudioContext=goodAudioContext;
const bodyPlayer=new Vehicle(track,new THREE.Scene()),bodyRival=new Vehicle(track,new THREE.Scene());
const bodyAudio=new DrivingAudio();bodyAudio.unlock([bodyPlayer,bodyRival]);bodyAudio.update(bodyPlayer,true);
const bodyVoice=bodyAudio.voices[0],nearbyVoice=bodyAudio.voices[1],idleBody=bodyVoice.bodyGain.gain.value;
assert.ok(idleBody>0&&bodyVoice.body.frequency.value>=32&&bodyVoice.body.frequency.value<=72);
assert.equal(bodyVoice.bodyShelf.type,'lowshelf');assert.equal(bodyVoice.bodyShelf.gain.value,2.5);
assert.equal(bodyVoice.bodyFilter.frequency.value,220);assert.ok(bodyVoice.bodyFilter.Q.value<=.5);
assert.ok(nearbyVoice.bodyGain.gain.value<idleBody*.6,'Rival bass must not drown out the driver\'s engine body');
assert.ok(bodyVoice.pulseDepth.connections.includes(bodyVoice.bodyGain.gain),'Roughness must modulate the exhaust layer at audio rate');
bodyPlayer.throttle=1;bodyAudio.update(bodyPlayer,true);const initialPunch=bodyVoice.bodyGain.gain.value;
for(let i=0;i<120;i++)bodyAudio.update(bodyPlayer,true);
assert.ok(bodyVoice.bodyGain.gain.value>idleBody*2.5,'Sustained throttle must strengthen the exhaust body');
assert.ok(initialPunch>bodyVoice.bodyGain.gain.value+.1,'Throttle punch must decay rather than leave a permanent gain boost');
assert.ok(bodyVoice.pulseDepth.gain.value<bodyVoice.bodyGain.gain.value*.1);
let hadEngagement=false;
for(let i=0;i<120*24;i++){
  bodyPlayer.speed=Math.min(94,bodyPlayer.speed+4/120);bodyAudio.context.currentTime+=1/120;
  bodyAudio.update(bodyPlayer,true);
  if(bodyVoice.state.gear>1&&bodyVoice.thump>.17)hadEngagement=true;
  assert.ok(bodyVoice.body.frequency.value>=32&&bodyVoice.body.frequency.value<=72);
  assert.ok(bodyVoice.bodyGain.gain.value<=.65,'Exhaust transients must stay bounded');
}
assert.ok(hadEngagement,'A gear engagement must produce a brief low-frequency punch');
assert.equal(bodyVoice.shelf.gain.value,-5);assert.ok(bodyVoice.turboGain.gain.value<=.0061,'The previously tamed high note must remain subdued');
bodyAudio.toggleMute();assert.equal(bodyAudio.master.gain.value,0);
bodyAudio.toggleMute();bodyAudio.silence();assert.equal(bodyAudio.master.gain.value,0);
bodyAudio.update(bodyPlayer,true);assert.ok(bodyAudio.master.gain.value>0);
bodyAudio.setVolume(.4);assert.equal(bodyAudio.master.gain.value,.4);
delete globalThis.AudioContext;
console.log('PASS: low exhaust body, load-linked roughness, transient decay, gear punch, bounded bass, preserved treble balance and unified mute');

// Presentation must read real wheel/kerb overlap, leave physics untouched,
// and keep the road readable even under maximum braking and camera strength.
const {DrivingFeedback,windLevel}=await import(moduleURL('DrivingFeedback'));
const feelCar=new Vehicle(track,new THREE.Scene()),feel=new DrivingFeedback();feel.strength=1;
const kerbProgress=planner.apices[0].progress,kerbHeading=Math.atan2(track.tangent(kerbProgress).x,track.tangent(kerbProgress).z);
assert.equal(track.kerbContact(track.point(kerbProgress),kerbHeading,kerbProgress),0,'Track centre must not shake as if it were a kerb');
const edge=track.roadPoint(kerbProgress).addScaledVector(track.roadNormal(kerbProgress),9.6);
assert.ok(track.kerbContact(edge,kerbHeading,kerbProgress)>.25,'A wheel overlapping a rendered corner kerb must be detected');
const straightProgress=400/track.length,straightHeading=Math.atan2(track.tangent(straightProgress).x,track.tangent(straightProgress).z);
assert.equal(track.kerbContact(track.point(straightProgress).addScaledVector(track.normal(straightProgress),9.3),straightHeading,straightProgress),0,'A road edge without rendered kerbs must stay smooth');
feelCar.resetAt(straightProgress);feelCar.speed=60;feelCar.acceleration=-35;feelCar.lateralAcceleration=30;
const physicalBefore={position:feelCar.position.clone(),heading:feelCar.heading,speed:feelCar.speed,distance:feelCar.distance,progress:feelCar.progress,lateral:feelCar.lateralSpeed,boost:feelCar.boost};
let feedback;
for(let i=0;i<120;i++)feedback=feel.update(feelCar,track,1/120,true);
assert.ok(feedback.pitch<-.03&&Math.abs(feedback.pitch)<.05&&feedback.heave<-.05&&Math.abs(feedback.roll)<.009,'Braking cues need a visible lower bound as well as a safe upper bound');
assert.ok(Math.abs(feedback.heave)<.08&&Math.abs(feedback.sway)<.04&&Math.abs(feedback.longitudinal)<.09);
assert.ok(feelCar.position.equals(physicalBefore.position));assert.equal(feelCar.heading,physicalBefore.heading);assert.equal(feelCar.speed,physicalBefore.speed);assert.equal(feelCar.distance,physicalBefore.distance);assert.equal(feelCar.progress,physicalBefore.progress);assert.equal(feelCar.lateralSpeed,physicalBefore.lateral);assert.equal(feelCar.boost,physicalBefore.boost);
const feelCamera=new CockpitCamera(new THREE.Scene());feelCamera.update(feelCar,1);
const levelDirection=feelCamera.camera.getWorldDirection(new THREE.Vector3()).clone();
feelCamera.update(feelCar,1/60,feedback);const brakeDirection=feelCamera.camera.getWorldDirection(new THREE.Vector3());
assert.ok(brakeDirection.y<levelDirection.y,'Braking must produce a small nose-down camera cue');
assert.ok(Math.abs(feelCamera.camera.position.y-feelCar.position.y-feelCamera.eyeHeight)<.08);
feelCamera.camera.updateMatrixWorld(true);
const visibleRoad=feelCar.position.clone().addScaledVector(track.tangent(straightProgress),15).setY(.27).project(feelCamera.camera);
assert.ok(Math.abs(visibleRoad.x)<.5&&Math.abs(visibleRoad.y)<.6,'Feedback must preserve the central road view');
feelCamera.mode=0;feelCamera.update(feelCar,1,feedback);assert.ok(Number.isFinite(feelCamera.camera.position.x));
feel.strength=0;const noMotion=feel.update(feelCar,track,1/60,true);
for(const key of ['pitch','roll','heave','sway','longitudinal','surfaceHeave','cockpitHeave','cockpitPitch','boostFov'])assert.equal(Math.abs(noMotion[key]),0,'Zero motion strength must disable added camera movement');
assert.ok(noMotion.wind>0,'Motion preference must not silence wind audio');
feel.strength=1;feelCar.resetAt(kerbProgress,9.6);feelCar.position.copy(edge);feelCar.speed=35;
let kerbFrame,maxKerbBounce=0;for(let i=0;i<60;i++){feelCar.distance+=35/60/track.length;kerbFrame=feel.update(feelCar,track,1/60,true);maxKerbBounce=Math.max(maxKerbBounce,Math.abs(kerbFrame.surfaceHeave));}
assert.ok(kerbFrame.kerb>.2&&maxKerbBounce>.004&&maxKerbBounce<=.019,'Low painted kerbs need small perceptible suspension travel without a raised-block bounce');
feelCar.present(kerbFrame.surfaceHeave);assert.ok(Math.abs(feelCar.model.chassis.position.y)<=.019);
const frozen=feel.update(feelCar,track,1/60,false);
for(const key of ['pitch','roll','heave','sway','longitudinal','surfaceHeave','cockpitHeave','cockpitPitch','kerb','wind','boostFov'])assert.equal(frozen[key],0);
feel.reset();assert.equal(feel.update(feelCar,track,1/60,false).longitudinal,0);

// A single shared gearbox drives camera engagement, steering-wheel display
// and engine sound, while wind and kerb audio share master mute/pause.
feelCar.reset();feelCar.speed=0;feelCar.acceleration=0;feelCar.lateralAcceleration=0;feelCar.throttle=1;feel.reset();
let engagementCount=0;
for(let i=0;i<120*24;i++){
  feelCar.speed=Math.min(94,feelCar.speed+4/120);feelCar.distance+=feelCar.speed/120/track.length;feelCar.progress=feelCar.distance%1;
  feelCar.position.copy(track.point(feelCar.progress));const t=track.tangent(feelCar.progress);feelCar.heading=Math.atan2(t.x,t.z);
  feedback=feel.update(feelCar,track,1/120,true);
  if(feedback.engine.cut<1&&feedback.longitudinal<-.005)engagementCount++;
}
assert.equal(feedback.engine.gear,8);assert.ok(engagementCount>0,'Upshifts must create short camera engagement pulses');
assert.equal(windLevel(0),0);assert.ok(windLevel(90)>windLevel(40));assert.ok(windLevel(200)<=.14);
assert.ok(windLevel(200/3.6)>.03&&windLevel(300/3.6)>.08,'Wind must retain its speed-dependent presence at the reduced volume');
globalThis.AudioContext=goodAudioContext;
const feelAudio=new DrivingAudio();feelAudio.unlock([feelCar]);feelAudio.update(feelCar,true,feedback);
assert.equal(feelAudio.voices[0].low.frequency.value,feedback.engine.rpm/120,'Audio must consume the same RPM as camera feedback');
assert.equal(feelAudio.wind.gain.value,windLevel(feelCar.speed));feelAudio.update(feelCar,true,{...feedback,kerb:1});assert.ok(feelAudio.kerb.gain.value>0);
feelAudio.toggleMute();assert.equal(feelAudio.master.gain.value,0);feelAudio.toggleMute();feelAudio.update(feelCar,false,frozen);assert.equal(feelAudio.master.gain.value,0);
delete globalThis.AudioContext;
// Damped motion should remain stable across common render frame rates.
feelCar.resetAt(straightProgress);feelCar.speed=60;feelCar.acceleration=-30;feelCar.lateralAcceleration=25;
const frameRateSamples=[30,60,144].map(fps=>{const f=new DrivingFeedback();f.strength=1;let result;for(let i=0;i<fps;i++)result=f.update(feelCar,track,1/fps,true);return result;});
for(const sample of frameRateSamples.slice(1))for(const key of ['pitch','roll','heave','sway'])assert.ok(Math.abs(sample[key]-frameRateSamples[0][key])<1e-6);
const {Input}=await import(moduleURL('Input'));const savedWindow=globalThis.window,listeners={};
globalThis.window={...savedWindow,addEventListener:(name,handler)=>{listeners[name]=handler;}};
const sliderInput=new Input();let prevented=false;
listeners.keydown({code:'ArrowRight',repeat:false,target:{matches:()=>true},preventDefault:()=>{prevented=true;}});
assert.equal(sliderInput.down('ArrowRight'),false);assert.equal(prevented,false,'Range inputs must retain their native keyboard controls');
listeners.keydown({code:'Escape',repeat:false,target:{matches:()=>true},preventDefault:()=>{}});assert.equal(sliderInput.consume('Escape'),true,'Escape must still resume while a range input has focus');
listeners.keydown({code:'ArrowRight',repeat:false,target:{matches:()=>false},preventDefault:()=>{prevented=true;}});assert.equal(sliderInput.down('ArrowRight'),true);assert.equal(prevented,true);
globalThis.window=savedWindow;
console.log('PASS: real kerb overlap, brake/gear camera feedback, stable horizon, adjustable motion, frame-rate independence, shared RPM, wind/kerb audio and pause/mute');

// Exercise what is actually painted, and require a visible screen-space shift
// at the default 60% strength rather than merely checking for nonzero values.
let paintedGear;
const paintContext=new Proxy({fillText:(text,x,y)=>{if(x===192&&y===148)paintedGear=text;}},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
feelCamera.display.getContext=()=>paintContext;feelCamera.mode=1;
const shiftScreenChecks=[];
for(const fps of [30,60,144]){
  feelCar.resetAt(straightProgress);feelCar.throttle=1;const defaultFeel=new DrivingFeedback();
  let peakPixels=0,visibleFrames=0,peakCockpit=0;
  for(let i=0;i<fps*24;i++){
    feelCar.speed=Math.min(94,i/fps*4);feelCar.distance+=feelCar.speed/fps/track.length;
    const frame=defaultFeel.update(feelCar,track,1/fps,true);
    const roadPoint=feelCar.position.clone().addScaledVector(track.tangent(straightProgress),15).setY(.27);
    feelCamera.update(feelCar,1/fps,frame);feelCamera.camera.updateMatrixWorld(true);
    assert.equal(paintedGear,String(frame.engine.gear),'Painted gear must match the shared engine state in the same frame');
    const actual=roadPoint.clone().project(feelCamera.camera);
    feelCamera.update(feelCar,0,{...frame,pitch:0,roll:0,heave:0,sway:0,longitudinal:0,cockpitHeave:0,cockpitPitch:0});feelCamera.camera.updateMatrixWorld(true);
    const neutral=roadPoint.clone().project(feelCamera.camera),pixels=Math.abs(actual.y-neutral.y)*720/2;
    peakPixels=Math.max(peakPixels,pixels);peakCockpit=Math.max(peakCockpit,Math.abs(frame.cockpitPitch));
    if(pixels>2)visibleFrames++;
  }
  assert.ok(peakPixels>4&&peakPixels<20,'Default shift feedback must move the road by several pixels without hiding it');
  assert.ok(visibleFrames/fps>.25&&peakCockpit>.01,'Upshift feedback must last across frames and visibly move the steering wheel');
  shiftScreenChecks.push({fps,peakPixels:Math.round(peakPixels*10)/10,visibleSeconds:Math.round(visibleFrames/fps*100)/100});
}
feelCar.speed=0;feel.reset();const launchFrame=feel.update(feelCar,track,1/60,true);
feelCamera.update(feelCar,1/60,launchFrame);assert.equal(paintedGear,'1','A stopped car in its launch gear must not be painted as neutral');
const brakingFrame={...launchFrame,engine:{...launchFrame.engine,gear:2}};
feelCamera.update(feelCar,.001,brakingFrame);assert.equal(paintedGear,'2','A gear change must bypass the 80ms dashboard refresh throttle');
console.log('PASS: calibrated gearing, rapid downshifts, real dashboard painting and visible default-strength shift feedback',shiftScreenChecks);

// Graphics selection must respect explicit choices and ignore isolated stalls,
// background-tab time and pause, while adapting sustained slow frame rates.
const {GraphicsQuality,GRAPHICS_PROFILES,graphicsMode,recommendedTier}=await import(moduleURL('Graphics'));
assert.equal(graphicsMode('broken'),'auto');assert.equal(graphicsMode('high'),'high');
assert.equal(recommendedTier({maxTextureSize:2048,width:1600,memory:8,cores:8}),'low');
assert.equal(recommendedTier({maxTextureSize:8192,width:1600,memory:8,cores:8}),'medium');
assert.equal(recommendedTier({maxTextureSize:8192,width:1600}),'medium');
const automaticGraphics=new GraphicsQuality('auto','high');
for(let i=0;i<60*12;i++)automaticGraphics.observe(1/60,true);
assert.equal(automaticGraphics.tier,'high','Smooth play must keep the selected quality');
automaticGraphics.observe(1,true);
for(let i=0;i<30;i++)automaticGraphics.observe(1/30,true);
assert.equal(automaticGraphics.tier,'high','A short stall must not trigger a quality change');
for(let i=0;i<20;i++)automaticGraphics.observe(1/30,true);
assert.equal(automaticGraphics.tier,'medium','Sustained slow frames must reduce quality one step');
for(let i=0;i<30*9;i++)automaticGraphics.observe(1/30,true);
assert.equal(automaticGraphics.tier,'low');
automaticGraphics.select('high');for(let i=0;i<20*20;i++)automaticGraphics.observe(1/20,true);
assert.equal(automaticGraphics.tier,'high','Manual quality must never be overridden');
automaticGraphics.select('auto');for(let i=0;i<20*20;i++)automaticGraphics.observe(1/20,false);
assert.equal(automaticGraphics.tier,'high','Pausing must not reduce quality');
for(const tier of ['low','medium','high']){
  const p=GRAPHICS_PROFILES[tier];assert.ok(p.shadowSize>=512&&p.shadowSize<=2048&&p.mirrorWidth<=640&&p.pixelRatio<=1.75);
}
// Keep the real mirror image composited each frame, with a smaller/slower scene
// capture on low quality. Changing tiers must preserve aspect and refresh now.
failMirrorRender=false;mirror.setQuality('low');mirrorDraws.length=0;
for(let i=0;i<60;i++)mirror.render(v,1/60);
const lowCaptures=mirrorDraws.filter(draw=>draw.scene===scene);
assert.equal(lowCaptures.length,15);assert.equal(mirrorDraws.filter(draw=>draw.scene===mirror.overlay).length,60);
assert.ok(mirror.target.width<=320&&mirror.target.height<=90);
assert.ok(Math.abs(mirror.target.width/mirror.target.height-mirror.camera.aspect)<.06,'Reduced mirror targets must preserve their camera aspect');
mirror.setQuality('low');mirrorDraws.length=0;for(let i=0;i<144;i++)mirror.render(v,1/144);
assert.equal(mirrorDraws.filter(draw=>draw.scene===scene).length,15,'Fractional frame periods must preserve the mirror capture rate on fast displays');
mirror.setQuality('high');mirrorDraws.length=0;mirror.render(v,0);
assert.equal(mirrorDraws.filter(draw=>draw.scene===scene).length,1,'Quality changes must invalidate the cached mirror image');
assert.equal(renderState.target,null);assert.equal(fakeRenderer.shadowMap.autoUpdate,true);
// Detailed geometry must remain finite, the tyre surface must clear the road,
// and merged spokes/sidewall markings must rotate around X with the tyre.
const {createCar}=await import(moduleURL('CarModel'));const detailedCar=createCar(0xc12e35);
let carMeshes=0,carTriangles=0;
detailedCar.group.traverse(child=>{if(child instanceof THREE.Mesh){carMeshes++;const geometry=child.geometry;carTriangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3;assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));}});
assert.ok(carMeshes<=33,'Model detail must not restore the old per-part draw-call overhead');
const pivots=detailedCar.group.children.filter(child=>child.name==='wheel-pivot');assert.equal(pivots.length,4);
for(const pivot of pivots){
  const bounds=new THREE.Box3().setFromObject(pivot);assert.ok(bounds.min.y>.035&&bounds.min.y<.065,'Tyres must meet the asphalt without sinking');
  assert.ok(pivot.children.length<=5&&pivot.children.every(child=>detailedCar.tires.includes(child)));
}
v.reset();v.speed=30;const spinMesh=v.model.tires[0],oldSpin=spinMesh.quaternion.clone();v.sync(.1);
const expectedSpin=oldSpin.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),30*.1/.455));
assert.ok(spinMesh.quaternion.angleTo(expectedSpin)<1e-6,'Merged wheel parts must complete full rotations about their axle');
// Stand width must run parallel to the circuit, not extend across the road.
const {GRANDSTAND_PROGRESS}=await import(moduleURL('Grandstands'));
const stands=track.group.children.filter(child=>child.name==='grandstand');assert.equal(stands.length,12);
for(const stand of stands){
  const localWidth=new THREE.Vector3(1,0,0).applyEuler(stand.rotation);
  // Use the closest source position globally since stands are beyond the local
  // nearest-progress search window and can sit beside a return leg.
  const candidates=GRANDSTAND_PROGRESS;
  const t=candidates.reduce((best,t)=>stand.position.distanceToSquared(track.point(t).addScaledVector(track.normal(t),-37))<stand.position.distanceToSquared(track.point(best).addScaledVector(track.normal(best),-37))?t:best,candidates[0]);
  assert.ok(Math.abs(localWidth.dot(track.tangent(t)))>.999);
  const crowd=stand.getObjectByName('spectator-bodies'),heads=stand.getObjectByName('spectator-heads');
  assert.ok(crowd instanceof THREE.InstancedMesh&&heads instanceof THREE.InstancedMesh);assert.equal(crowd.count,360);assert.equal(heads.count,360);assert.equal(crowd.castShadow,false);
  assert.ok(stand.children.some(child=>child instanceof THREE.InstancedMesh&&child.count===360));
}
assert.equal(stands.filter(s=>s.userData.progress<.06).length,5,'The opening straight must gain three filled stands');
for(let i=1;i<5;i++)assert.ok(stands[i].position.distanceTo(stands[i-1].position)>58,'New roofs must not overlap their neighbours');
const crowdStand=stands[1],crowdBody=crowdStand.getObjectByName('spectator-bodies'),crowdHeads=crowdStand.getObjectByName('spectator-heads');
track.updatePresentation(crowdStand.position,'medium');assert.equal(crowdBody.geometry,crowdBody.userData.nearGeometry);assert.equal(crowdHeads.visible,true);
track.updatePresentation(crowdStand.position.clone().add(new THREE.Vector3(180,0,0)),'medium');assert.equal(crowdBody.geometry,crowdBody.userData.farGeometry);assert.equal(crowdHeads.visible,false);
track.updatePresentation(crowdStand.position.clone().add(new THREE.Vector3(1000,0,0)),'medium');assert.equal(crowdBody.visible,false);
const near=track.point(0);track.updatePresentation(near,'low');const lowDetailCount=track.details.group.children.filter(child=>child.visible).length;
track.updatePresentation(near,'high');const highDetailCount=track.details.group.children.filter(child=>child.visible).length;
assert.ok(lowDetailCount>0&&highDetailCount>=lowDetailCount&&highDetailCount<track.details.group.children.length/2,'Only nearby detail chunks should be submitted');
const farFence=track.details.group.children.find(child=>!child.visible&&child.name==='catch-fence');
const farPosition=new THREE.Box3().setFromObject(farFence).getCenter(new THREE.Vector3());track.updatePresentation(farPosition,'low');assert.equal(farFence.visible,true,'Nearby detail must reappear after moving or recovering');
const {createSkyTexture,WorldLighting}=await import(moduleURL('WorldLighting'));
for(const tier of ['low','medium','high']){
  const sky=createSkyTexture(GRAPHICS_PROFILES[tier].reflectionWidth);
  assert.equal(sky.image.width,GRAPHICS_PROFILES[tier].reflectionWidth);assert.equal(sky.image.height,sky.image.width/2);
  assert.ok(sky.image.data.every(value=>Number.isFinite(THREE.DataUtils.fromHalfFloat(value))));sky.dispose();
}
// Run THREE's real PMREM pass orchestration with a renderer stub to verify
// resource lifetime and state restoration; this does not claim GPU image QA.
const reflectionState={target:null,passes:0};
const reflectionRenderer={autoClear:true,xr:{enabled:true},compile:()=>{},getRenderTarget:()=>reflectionState.target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,setRenderTarget:target=>{reflectionState.target=target;},render:()=>{reflectionState.passes++;}};
const reflectionScene=new THREE.Scene(),lighting=new WorldLighting(reflectionScene,reflectionRenderer,'low');
const oldSky=reflectionScene.background,oldEnvironment=lighting.environment,oldShadow=new THREE.WebGLRenderTarget(512,512);
let freedSky=false,freedEnvironment=false,freedShadow=false;
oldSky.addEventListener('dispose',()=>{freedSky=true;});oldEnvironment.addEventListener('dispose',()=>{freedEnvironment=true;});oldShadow.addEventListener('dispose',()=>{freedShadow=true;});lighting.sun.shadow.map=oldShadow;
lighting.setQuality('high');assert.ok(!freedSky&&freedEnvironment&&freedShadow,'Changing quality must preserve the sharp sky while releasing previous reflection and shadow targets');
assert.equal(lighting.sun.shadow.mapSize.x,GRAPHICS_PROFILES.high.shadowSize);assert.equal(lighting.sun.shadow.map,null);
assert.ok(lighting.environment.width>oldEnvironment.width&&reflectionScene.environment===lighting.environment.texture);
assert.equal(reflectionState.target,null);assert.equal(reflectionRenderer.xr.enabled,true);assert.equal(reflectionRenderer.autoClear,true);
const bakePasses=reflectionState.passes;lighting.setQuality('high');assert.equal(reflectionState.passes,bakePasses,'An unchanged quality must not rebuild reflections');
let freedLast=false;lighting.environment.addEventListener('dispose',()=>{freedLast=true;});lighting.dispose();assert.ok(freedLast&&reflectionScene.environment===null&&reflectionScene.background===null);
console.log('PASS: manual/automatic graphics, stall/pause safeguards, mirror capture budgets, wheel geometry/spin, road-parallel stands, distance culling and HDR reflection profiles',{carMeshes,carTriangles,lowDetailCount,highDetailCount});

// Painted kerbs must share a smooth road-following surface, including the tight
// inside of Rettifilo: no rotated boxes, reversed faces or broken corner runs.
const kerbRibbon=track.group.getObjectByName('continuous-kerbs');assert.ok(kerbRibbon instanceof THREE.Group&&kerbRibbon.children.every(child=>child instanceof THREE.Mesh));
const ribbonGeometry=track.surfaceGeometries.get('continuous-kerbs'),kerbSurfacePositions=ribbonGeometry.getAttribute('position'),kerbSurfaceUV=ribbonGeometry.getAttribute('uv');
assert.ok(kerbSurfacePositions.count<ribbonGeometry.index.count*.3,'Adjacent painted sections must share their actual vertices');
for(let i=0;i<ribbonGeometry.index.count;i+=3){
  const a=new THREE.Vector3().fromBufferAttribute(kerbSurfacePositions,ribbonGeometry.index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(kerbSurfacePositions,ribbonGeometry.index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(kerbSurfacePositions,ribbonGeometry.index.getX(i+2));
  assert.ok(b.sub(a).cross(c.sub(a)).y>1e-7,'Kerbs must not fold or disappear at tight inside corners');
}
for(let i=0;i<kerbSurfacePositions.count;i++){
  const t=ribbonGeometry.getAttribute('progress').getX(i),p=track.roadPoint(t),n=track.roadNormal(t),lateral=Math.abs((kerbSurfacePositions.getX(i)-p.x)*n.x+(kerbSurfacePositions.getZ(i)-p.z)*n.z);
  assert.ok(lateral>=9.649&&lateral<=11.051,'Visible strips must stay on the shared road-edge footprint');
  assert.ok(kerbSurfacePositions.getY(i)>=-.07801&&kerbSurfacePositions.getY(i)<=.05501,'Kerbs must blend low into the road and grass');
}
let cornerRuns=0;for(let i=0;i<track.kerbSegments.length;i++)if(track.kerbSegments[i]&&!track.kerbSegments[(i+track.kerbSegments.length-1)%track.kerbSegments.length])cornerRuns++;
assert.ok(cornerRuns<=22,'A single corner must not break into many short disconnected kerbs');
for(const section of track.sections){const t=section.progress,h=Math.atan2(track.tangent(t).x,track.tangent(t).z);assert.equal(track.kerbContact(track.point(t),h,t),0,'Track centres must not trigger kerb feedback');}
const visibleKerbEdge=track.roadPoint(kerbProgress).addScaledVector(track.roadNormal(kerbProgress),9.6);
assert.ok(track.kerbContact(visibleKerbEdge,kerbHeading,kerbProgress)>.25,'Wheel feedback must follow the smoothed visible kerb');
// Slick tread and its shoulders are one carcass. Sidewall text conforms to it
// within 0.35mm rather than creating a flat disc or a raised outer trim ring.
const {createTireGeometry,createTireLetteringGeometry,TIRE_RADIUS}=await import(moduleURL('TireGeometry'));
for(const width of [.34,.42]){
  const tire=createTireGeometry(width),points=tire.getAttribute('position'),normals=tire.getAttribute('normal');let treadPoints=0;
  for(let i=0;i<points.count;i++){
    const axial=points.getX(i),radius=Math.hypot(points.getY(i),points.getZ(i));
    assert.ok(Math.abs(axial)<=width/2+1e-6&&radius<=TIRE_RADIUS+1e-6);
    if(Math.abs(axial)<width*.2){treadPoints++;assert.ok(Math.abs(radius-TIRE_RADIUS)<1e-6&&Math.abs(normals.getX(i))<1e-6,'The middle of a slick tyre must be flat across its width');}
  }
  assert.ok(treadPoints>=64);
  const sourcePoints=new Set(Array.from({length:points.count},(_,i)=>[points.getX(i),points.getY(i),points.getZ(i)].map(v=>(Math.abs(v)<.00005?0:v).toFixed(4)).join('/')));
  for(const side of [-1,1]){
    const decal=createTireLetteringGeometry(tire,width,side),dp=decal.getAttribute('position'),dn=decal.getAttribute('normal');assert.ok(dp.count>0);
    for(let i=0;i<dp.count;i++){
      const original=[dp.getX(i)-dn.getX(i)*.00035,dp.getY(i)-dn.getY(i)*.00035,dp.getZ(i)-dn.getZ(i)*.00035].map(v=>(Math.abs(v)<.00005?0:v).toFixed(4)).join('/');
      assert.ok(sourcePoints.has(original),'Every printed vertex must follow the rubber surface');
    }
    decal.dispose();
  }
  tire.dispose();
}
const {surfaceMaps}=await import(moduleURL('SurfaceTextures'));const rubberHeight=surfaceMaps('rubber').bumpMap.image.data;
let lowestRubber=255,highestRubber=0;for(let i=0;i<rubberHeight.length;i+=4){lowestRubber=Math.min(lowestRubber,rubberHeight[i]);highestRubber=Math.max(highestRubber,rubberHeight[i]);}
assert.ok(highestRubber-lowestRubber<=6,'Slick rubber must retain only fine grain, without periodic raised bands');
console.log('PASS: shared curved kerb ribbons, unbroken corner runs, upward faces, low edge profile, matching wheel feedback, flat slick tread, flush lettering and fine rubber grain',{cornerRuns,kerbTriangles:ribbonGeometry.index.count/3});

// F1-style five paired red lights: all motion/timing waits for lights-out,
// and pause is represented by not advancing this simulation clock.
const {StartSequence}=await import(moduleURL('StartSequence'));
const startClock=new StartSequence();assert.equal(startClock.signal.phase,'idle');startClock.arm(.25);const firstStartRun=startClock.signal.run;
assert.equal(startClock.signal.lights,0);startClock.advance(.599);assert.equal(startClock.signal.lights,0);startClock.advance(.001);
for(let lights=1;lights<=5;lights++){assert.equal(startClock.signal.lights,lights);if(lights<5)startClock.advance(1);}
const heldSignal={...startClock.signal};assert.deepEqual(startClock.signal,heldSignal);assert.ok(startClock.remaining>=.8&&startClock.remaining<=2.4);
startClock.advance(startClock.remaining-.01);assert.equal(startClock.signal.lights,5);startClock.advance(.01);assert.deepEqual(startClock.signal,{run:firstStartRun,phase:'go',lights:0});
startClock.reset();assert.equal(startClock.signal.phase,'idle');startClock.arm(1);assert.ok(startClock.signal.run>firstStartRun);
for(const fps of [30,60,120,144]){const clock=new StartSequence();clock.arm(.5);let frames=0;while(clock.signal.phase!=='go'&&frames<fps*10){clock.advance(1/fps);frames++;}assert.ok(Math.abs(frames/fps-6.2)<=1/fps+1e-8);}
const signalRace=new Race(track,new THREE.Scene(),planner),signalPlayer=new Vehicle(track,new THREE.Scene());signalRace.start();
const gridSnapshot=signalRace.opponents.map(o=>o.car.position.clone());
signalRace.update(4.61,signalPlayer);assert.equal(signalRace.state,'countdown');assert.equal(signalRace.startSignal.lights,5);assert.equal(signalRace.elapsed,0);
assert.ok(signalRace.opponents.every((o,i)=>o.car.speed===0&&o.car.position.equals(gridSnapshot[i])),'All opponents must remain on their grid slots while red lights are on');
signalRace.update(signalRace.countdown+.001,signalPlayer);assert.equal(signalRace.state,'racing');assert.equal(signalRace.startSignal.phase,'go');assert.equal(signalRace.elapsed,0);
for(let i=0;i<10;i++)signalRace.update(1/120,signalPlayer);
assert.ok(signalRace.opponents.every(o=>o.car.speed>0),'Every driver must receive the same release from the start signal');
track.setStartLights(3);assert.equal(track.startBulbs.filter(m=>m.emissiveIntensity>1).length,3);track.setStartLights(0);assert.ok(track.startBulbs.every(m=>m.emissiveIntensity<.1));
// The start signal lives on the physical gantry; HUD must not duplicate it.
const {HUD}=await import(moduleURL('../ui/HUD'));
const nodes=new Map();
function makeSignalNode(){const classes=new Set();return {value:'',textContent:'',hidden:false,classes,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},addEventListener:()=>{},focus:()=>{},replaceChildren:()=>{},getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})};}
const hudRoot={innerHTML:'',classList:{toggle:()=>{}},querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,makeSignalNode());return nodes.get(selector);},querySelectorAll:()=>[]};
const savedPath=globalThis.Path2D;globalThis.Path2D=class {moveTo(){}lineTo(){}};
const noop=()=>{};const signalHUD=new HUD(hudRoot,track,{start:noop,restart:noop,camera:noop,resume:noop,recover:noop,volume:noop,audioLevel:.65,motionLevel:.6,motion:noop,graphicsMode:'auto',graphicsTier:'medium',graphics:noop});
signalRace.reset();signalRace.start();signalRace.update(2.61,signalPlayer);signalHUD.update(signalPlayer,signalRace,false,track,1);
assert.ok(!/seat-height|seat-value/.test(hudRoot.innerHTML),'Fixed seat height must not retain an adjustment control');
assert.ok(!/countdown|start-rack|light-pod|start-caption|빨간불이 모두/.test(hudRoot.innerHTML),'No screen-space start lights or captions may remain');
signalHUD.update(signalPlayer,signalRace,true,track,1);assert.equal(nodes.get('#pause-menu').hidden,false);
signalRace.update(signalRace.countdown+.001,signalPlayer);signalHUD.update(signalPlayer,signalRace,false,track,1);assert.equal(nodes.has('#countdown'),false);assert.equal(nodes.has('#start-caption'),false);
globalThis.Path2D=savedPath;
// Start cues have a dedicated volume/mute path, so countdown beeps do not
// depend on an engine voice being audible. No queued wall-clock beeps survive pause.
globalThis.AudioContext=goodAudioContext;const signalAudio=new DrivingAudio();signalAudio.unlock([signalPlayer]);signalAudio.update(signalPlayer,false);
const audibleStart=new StartSequence();audibleStart.arm(.25);signalAudio.updateStart(audibleStart.signal,true);
const cuePeaks=()=>signalAudio.cueGain.gain.events.filter(e=>e.kind==='ramp'&&e.value>0).length;
for(let lights=1;lights<=5;lights++){
  audibleStart.advance(lights===1?.6:1);const before=cuePeaks();signalAudio.updateStart(audibleStart.signal,true);assert.equal(cuePeaks(),before+1);assert.equal(signalAudio.cue.frequency.value,660);
  assert.ok(signalAudio.cueBus.gain.value>0&&signalAudio.master.gain.value===0);signalAudio.updateStart(audibleStart.signal,true);assert.equal(cuePeaks(),before+1,'A held red light must not beep repeatedly');
}
const pausedPeakCount=cuePeaks();signalAudio.updateStart(audibleStart.signal,false);assert.equal(signalAudio.cueBus.gain.value,0);signalAudio.updateStart(audibleStart.signal,true);assert.equal(cuePeaks(),pausedPeakCount);
audibleStart.advance(audibleStart.remaining);signalAudio.updateStart(audibleStart.signal,true);assert.equal(cuePeaks(),6);assert.equal(signalAudio.cue.frequency.value,990);
signalAudio.setVolume(.3);assert.equal(signalAudio.cueBus.gain.value,.3);signalAudio.toggleMute();assert.equal(signalAudio.cueBus.gain.value,0);signalAudio.toggleMute();signalAudio.silence();assert.equal(signalAudio.cueBus.gain.value,0);assert.equal(signalAudio.cueGain.gain.value,0);delete globalThis.AudioContext;
// Actual bundled HDR source, local material variation and independently culled
// tree batches must be valid and stay within the existing quality profiles.
const {HDRLoader}=await import('three/addons/loaders/HDRLoader.js');const hdrBytes=fs.readFileSync(new URL('../src/assets/park-sky.hdr',import.meta.url));
const parsedSky=new HDRLoader().parse(hdrBytes.buffer.slice(hdrBytes.byteOffset,hdrBytes.byteOffset+hdrBytes.byteLength)),sourceSky=new THREE.DataTexture(parsedSky.data,parsedSky.width,parsedSky.height,THREE.RGBAFormat,THREE.HalfFloatType);sourceSky.flipY=true;
const {resizeSkyTexture}=await import(moduleURL('WorldLighting'));
for(const tier of ['low','medium','high']){const photo=resizeSkyTexture(sourceSky,GRAPHICS_PROFILES[tier].reflectionWidth);assert.equal(photo.image.width,GRAPHICS_PROFILES[tier].reflectionWidth);assert.equal(photo.flipY,true);assert.ok(photo.image.data.every(value=>Number.isFinite(THREE.DataUtils.fromHalfFloat(value))));photo.dispose();}
const scenery=track.group.getObjectByName('woodland');assert.ok(scenery.children.length>=20&&scenery.children.every(child=>child instanceof THREE.InstancedMesh));
assert.ok(scenery.children.filter(child=>child.material.map).every(child=>child.material.alphaTest>0),'Leaf cutouts must survive forest detail changes');
const roadMesh=track.surfaceGeometries.get('asphalt-road'),grassMesh=track.group.getObjectByName('grass-terrain').geometry;
for(const geometry of [roadMesh,grassMesh]){const colors=geometry.getAttribute('color');assert.ok(colors&&colors.array.some(v=>Math.abs(v-colors.getX(0))>.03),'World-scale variation must break up repeated texture tiles');}
for(const name of ['curved-rubber','gravel-runoff']){const mesh=track.group.getObjectByName(name);assert.ok(mesh&&mesh.geometry.getAttribute('position').array.every(Number.isFinite));}
const rubberFade=track.group.getObjectByName('curved-rubber').geometry.getAttribute('color');assert.equal(rubberFade.itemSize,4);assert.equal(rubberFade.getW(0),0);assert.equal(rubberFade.getW(80*2),0);assert.equal(rubberFade.getW(40*2),1,'Rubber deposits must fade in and out instead of ending as rectangular stamps');
assert.equal(surfaceMaps('asphalt').map.image.width,512);assert.equal(surfaceMaps('gravel').map.image.width,512);sourceSky.dispose();
console.log('PASS: five-light sequence, variable hold, frame-rate independence, held grid/timers, shared AI launch, gantry-only start lights, unique start cues, pause/mute, bundled HDR and varied road/woodland');
// A late HDR load must adopt the currently selected quality, and a failed load
// must leave the working generated sky in place rather than blank the scene.
const originalHDRLoad=HDRLoader.prototype.loadAsync;
try{
  let resolvePhoto;HDRLoader.prototype.loadAsync=()=>new Promise(resolve=>{resolvePhoto=resolve;});
  const lateScene=new THREE.Scene(),lateLighting=new WorldLighting(lateScene,reflectionRenderer,'high'),pendingPhoto=lateLighting.loadSky('test://bundled-hdr');
  lateLighting.setQuality('low');const latePhoto=sourceSky.clone();resolvePhoto(latePhoto);assert.equal(await pendingPhoto,true);assert.equal(lateScene.background.image.width,512);assert.equal(lateLighting.sky.image.width,256);assert.ok(lateLighting.sunOffset.y>0&&Math.abs(lateLighting.sunOffset.length()-130)<1e-6);
  const workingSky=lateScene.background;HDRLoader.prototype.loadAsync=async()=>{throw new Error('missing photo');};assert.equal(await lateLighting.loadSky('test://missing-hdr'),false);assert.equal(lateScene.background,workingSky);
  let releasedPhoto=false;latePhoto.addEventListener('dispose',()=>{releasedPhoto=true;});lateLighting.dispose();assert.equal(releasedPhoto,true);
}finally{HDRLoader.prototype.loadAsync=originalHDRLoad;}
console.log('PASS: deferred HDR loading follows current quality, matches sun direction, releases resources and preserves a fallback sky on failure');

// Tight bends need an actually smooth path and bounded polygon approximation,
// not only more triangles following the same kinked source line.
const {kerbRows,KERB_PAINT_LENGTH}=await import(moduleURL('KerbGeometry'));
const curvedRows=kerbRows(track,track.kerbSegments);let largestChordError=0,smallestStep=Infinity,largestDeviation=0,largestGuideOffset=0;
for(const rows of curvedRows)for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],t=(a.coordinate+b.coordinate)/2/track.kerbSegments.length,p=track.roadPoint(t),n=track.roadNormal(t);
  smallestStep=Math.min(smallestStep,(b.coordinate-a.coordinate)*track.length/track.kerbSegments.length);
  for(const offset of [-11.05,-9.65,9.65,11.05]){
    const pa=a.p.clone().addScaledVector(a.n,offset),pb=b.p.clone().addScaledVector(b.n,offset),mid=p.clone().addScaledVector(n,offset);
    largestChordError=Math.max(largestChordError,mid.distanceTo(pa.add(pb).multiplyScalar(.5)));
  }
}
assert.ok(largestChordError<=.00100001&&smallestStep<.25,'Small-radius kerbs must refine to less than 1mm midpoint error');
assert.ok(KERB_PAINT_LENGTH<=.75,'Paint marks must be shorter than the former 3.1m blocks');
for(let i=0;i<planner.count;i++){
  const t=i/planner.count;largestDeviation=Math.max(largestDeviation,track.roadPoint(t).distanceTo(track.point(t)));
  largestGuideOffset=Math.max(largestGuideOffset,Math.abs(planner.point(t).sub(track.roadPoint(t)).dot(track.roadNormal(t))));
}
assert.ok(largestDeviation<1.8&&largestGuideOffset<9.5,'The visual smoothing must leave the unchanged physical racing line inside the road');
for(let i=0;i<Math.ceil(track.length);i+=19){const t=i/Math.ceil(track.length),epsilon=.001/track.length;assert.ok(track.roadNormal(t-epsilon).dot(track.roadNormal(t+epsilon))>.999999,'Spline knots and the closed seam must not produce heading discontinuities');}
assert.ok(ribbonGeometry.index.count/3<160000,'Adaptive curves must retain a bounded geometry budget');
console.log('PASS: smooth visual spline, adaptive small-radius kerbs, short arc-length paint, sub-millimetre chord error and preserved racing-line clearance',{largestChordError,smallestStep,largestDeviation,largestGuideOffset});

// Partitioning must remove off-screen work without changing a single source
// triangle or duplicating the large shared attribute buffers.
for(const name of ['asphalt-road','continuous-kerbs']){
  const source=track.surfaceGeometries.get(name),chunks=track.group.getObjectByName(name).children;
  assert.ok(chunks.length>10&&chunks.length<=Math.ceil(track.length/100));
  assert.equal(chunks.reduce((sum,mesh)=>sum+mesh.geometry.index.count,0),source.index.count);
  for(const mesh of chunks){
    assert.equal(mesh.geometry.attributes.position,source.attributes.position,'Chunks must share vertex buffers');
    assert.ok(mesh.geometry.boundingSphere.radius<300,'Local bounds must not span the whole circuit');
    const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index;
    for(let i=0;i<indices.count;i++){const p=new THREE.Vector3().fromBufferAttribute(positions,indices.getX(i));assert.ok(mesh.geometry.boundingBox.containsPoint(p),'No triangle may escape its culling bounds');}
  }
}
let optimizedSurfaceTotal=0;
for(const t of [0,.18,.38,.58,.78,.93]){
  const p=track.point(t),f=track.tangent(t),view=new THREE.PerspectiveCamera(80,16/9,.06,GRAPHICS_PROFILES.medium.viewFar);view.position.copy(p).setY(1.5);view.lookAt(p.clone().addScaledVector(f,26).setY(-.35));view.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse));
  for(const name of ['asphalt-road','continuous-kerbs'])for(const mesh of track.group.getObjectByName(name).children)if(frustum.intersectsObject(mesh))optimizedSurfaceTotal+=mesh.geometry.index.count/3;
}
const fullSurfaceTotal=[...track.surfaceGeometries.values()].reduce((sum,geometry)=>sum+geometry.index.count/3,0);
assert.ok(optimizedSurfaceTotal/6<fullSurfaceTotal*.6,'Representative views must stop submitting most of the full-circuit road geometry');
assert.ok(track.group.children.every(object=>!object.matrixAutoUpdate&&!object.matrixWorldAutoUpdate),'Static world transforms must stay frozen');
assert.equal(v.group.matrixAutoUpdate,true,'Vehicle transforms must remain dynamic');
const {renderPixelRatio}=await import(moduleURL('Graphics'));
for(const tier of ['low','medium','high']){const ratio=renderPixelRatio(2,3840,2160,tier);assert.ok(3840*2160*ratio*ratio<=GRAPHICS_PROFILES[tier].pixelBudget+1);}
const sustainedStalls=new GraphicsQuality('auto','high');sustainedStalls.observe(.3,true);sustainedStalls.observe(.3,true);assert.equal(sustainedStalls.tier,'high');sustainedStalls.observe(.3,true);assert.equal(sustainedStalls.tier,'medium','Three consecutive severe frames must trigger an immediate reduction');for(let i=0;i<29;i++)sustainedStalls.observe(.3,true);
assert.equal(sustainedStalls.tier,'low');assert.ok(sustainedStalls.renderScale<1&&sustainedStalls.renderScale>=.65,'Very slow visible frames must not be mistaken for background-tab gaps');
sustainedStalls.select('medium');for(let i=0;i<100;i++)sustainedStalls.observe(.3,true);assert.equal(sustainedStalls.tier,'medium');assert.equal(sustainedStalls.renderScale,1);
const {ShadowBudget}=await import(moduleURL('ShadowBudget'));const staticShadows=new ShadowBudget(),shadowLight=new THREE.Vector3(-85,50,-77);let shadowRefreshes=0;
for(let i=0;i<120;i++)shadowRefreshes+=staticShadows.shouldRefresh(new THREE.Vector3(i*94/60,0,0),shadowLight,false)?1:0;
assert.ok(shadowRefreshes<=22,'Static scenery shadows should be reused while the stable world volume still covers the car');
assert.equal(staticShadows.shouldRefresh(new THREE.Vector3(1000,0,0),shadowLight,false),true,'Recovery/teleport must refresh shadows immediately');
assert.equal(staticShadows.shouldRefresh(new THREE.Vector3(1000,0,0),shadowLight.clone().setY(70),false),true,'A new sun direction must invalidate cached shadows');
v.setGraphics('medium');let dynamicCasters=0;v.group.traverse(object=>{if(object.castShadow)dynamicCasters++;});assert.equal(dynamicCasters,0);assert.ok(v.model.contactShadow.visible&&v.model.contactShadow.material.opacity>.25);
v.reset();v.position.add(new THREE.Vector3(8,0,12));v.sync();v.group.updateMatrixWorld(true);assert.ok(v.model.contactShadow.getWorldPosition(new THREE.Vector3()).distanceTo(v.position)<.2,'Lightweight car shadows must remain attached to the moving vehicle');
v.setGraphics('high');v.group.traverse(object=>{if(object.castShadow)dynamicCasters++;});assert.ok(dynamicCasters>0);assert.equal(v.model.contactShadow.castShadow,false);
// Actual 3D tree positions must shift on screen as the driver advances. A
// photographed horizon at infinity would remain unchanged under this motion.
// Added start-line stands occupy the former tree sample; check the clear part
// of the same straight beyond the new buildings instead.
const parallaxProgress=360/track.length,parallaxOrigin=track.point(parallaxProgress),parallaxForward=track.tangent(parallaxProgress),treeCandidates=[];const instance=new THREE.Matrix4();
for(const mesh of scenery.children)if(!mesh.material.map)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);const p=new THREE.Vector3().setFromMatrixPosition(instance),relative=p.clone().sub(parallaxOrigin),ahead=relative.dot(parallaxForward),lateral=Math.abs(relative.dot(track.normal(parallaxProgress)));if(ahead>80&&ahead<150&&lateral>23&&lateral<45)treeCandidates.push(p);}
assert.ok(treeCandidates.length>0,'A near tree layer must exist beside the opening straight');
const projectedTrees=[0,20].map(metres=>{const p=parallaxOrigin.clone().addScaledVector(parallaxForward,metres),view=new THREE.PerspectiveCamera(80,16/9,.06,1100);view.position.copy(p).setY(1.5);view.lookAt(p.clone().addScaledVector(parallaxForward,26).setY(-.35));view.updateMatrixWorld(true);return treeCandidates[0].clone().project(view);});
assert.ok(Math.abs(projectedTrees[0].x-projectedTrees[1].x)>.02,'Near scenery must provide real translation parallax');
const nearestBefore=track.nearestProgress;track.nearestProgress=()=>{throw new Error('Unnecessary wheel search');};assert.doesNotThrow(()=>track.kerbContact(track.point(400/track.length),0,400/track.length));track.nearestProgress=nearestBefore;
const {createSkyBackdrop}=await import(moduleURL('WorldLighting'));const skyOnly=createSkyBackdrop(undefined,shadowLight);assert.equal(skyOnly.image.width,512);assert.equal(skyOnly.flipY,true);skyOnly.dispose();
console.log('PASS: exact chunk preservation, shared buffers, local culling, static transforms, pixel limits, sustained-stall recovery, cached shadows, attached car contact shadows and real tree parallax',{meanSurfaceTriangles:Math.round(optimizedSurfaceTotal/6),fullSurfaceTotal,shadowRefreshes});

const forestPit=track.group.children.find(object=>object.children.some(child=>child.geometry?.parameters?.width===17&&child.geometry?.parameters?.depth===240)),forestPitInverse=forestPit.matrixWorld.clone().invert();
for(const mesh of scenery.children)if(!mesh.material.map)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);const local=new THREE.Vector3().setFromMatrixPosition(instance).applyMatrix4(forestPitInverse);assert.ok(Math.abs(local.x)>=16||Math.abs(local.z)>=130,'The near parallax layer must leave the pit building and its canopy clearance empty');}

// Check the rendered wall edges, not only the centreline: a wide strip can
// still fold over itself after a centreline loop has been removed.
function assertUncrossedWall(points){
  const count=points.length;
  for(let i=0;i<count;i++){
    const a=points[i],b=points[(i+1)%count];
    for(let j=i+2;j<count;j++){
      if(i===0&&j===count-1)continue;
      const c=points[j],d=points[(j+1)%count];
      if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))continue;
      const dx=b.x-a.x,dz=b.z-a.z,ex=d.x-c.x,ez=d.z-c.z,den=dx*ez-dz*ex;if(Math.abs(den)<1e-9)continue;
      const x=c.x-a.x,z=c.z-a.z,t=(x*ez-z*ex)/den,u=(x*dz-z*dx)/den;
      assert.ok(!(t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6),'No rendered barrier edge may intersect a non-neighbouring panel');
    }
  }
}
const wallGroup=track.group.getObjectByName('track-barriers');assert.equal(wallGroup.children.length,2);
const roadClearanceSamples=Array.from({length:2000},(_,i)=>track.roadPoint(i/2000));let wallTriangles=0;
for(let side=0;side<2;side++){
  const wall=wallGroup.children[side],vertices=wall.children[0].geometry.getAttribute('position'),rows=vertices.count/8-1;
  for(const edge of [0,5]){
    const points=Array.from({length:rows},(_,i)=>new THREE.Vector3().fromBufferAttribute(vertices,i*8+edge));assertUncrossedWall(points);
    assert.ok(points[0].distanceTo(new THREE.Vector3().fromBufferAttribute(vertices,rows*8+edge))<1e-6,'The closed wall must meet exactly at its lap seam');
    for(let i=0;i<points.length;i+=5){const distance=Math.min(...roadClearanceSamples.map(p=>p.distanceToSquared(points[i])));assert.ok(distance>15.5**2,'A rounded barrier must stay outside the driving surface and kerb');}
  }
  for(const mesh of wall.children){const g=mesh.geometry,p=g.getAttribute('position'),normal=g.getAttribute('normal');assert.ok(p.array.every(Number.isFinite)&&normal.array.every(Number.isFinite));wallTriangles+=g.index.count/3;
    for(let i=0;i<g.index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-10,'Wall panels must not contain collapsed triangles');}
  }
}
assert.ok(wallTriangles<60000,'Continuous walls must keep a bounded geometry budget');
const fixedHalo=camera.camera.getObjectByName('cockpit-halo'),fixedPillar=camera.camera.getObjectByName('halo-pillar');assert.ok(fixedHalo&&fixedPillar);
const pillarPositions=fixedPillar.geometry.getAttribute('position');let pillarMin=Infinity,pillarMax=-Infinity;
for(let i=0;i<pillarPositions.count;i++){pillarMin=Math.min(pillarMin,pillarPositions.getX(i));pillarMax=Math.max(pillarMax,pillarPositions.getX(i));}
assert.ok(pillarMax-pillarMin<.05,'The central halo support must remain narrow at the fixed eye height');
console.log('PASS: non-intersecting full-width closed barriers, road clearance, valid panels, bounded geometry, fixed 1.5m seat, slim halo and 4,320 instanced spectators',{wallTriangles});

// Reference framing: the beam curves around the lower third of the cockpit,
// leaving the road and start lights clear. The only central blade is below it.
const referenceScene=new THREE.Scene(),referenceCamera=new CockpitCamera(referenceScene),referenceCar=new Vehicle(track,referenceScene);
referenceCamera.update(referenceCar,1);referenceScene.updateMatrixWorld(true);
const referenceBeam=referenceCamera.camera.getObjectByName('cockpit-halo'),referenceBlade=referenceCamera.camera.getObjectByName('halo-pillar');
function projectedBounds(mesh){
  const p=mesh.geometry.getAttribute('position'),bounds=new THREE.Box3();
  for(let i=0;i<p.count;i++)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(referenceCamera.camera));
  return bounds;
}
const beamScreen=projectedBounds(referenceBeam),bladeScreen=projectedBounds(referenceBlade);
assert.ok(beamScreen.max.y<-.2&&beamScreen.max.y>-.4,'The flattened halo crown must frame the lower third of the image');
assert.ok(beamScreen.min.y<-1,'The arch must descend to the cockpit sides');
assert.ok(bladeScreen.max.y<beamScreen.max.y-.04&&bladeScreen.min.y>-.7,'The short support must stay underneath the arch, with no aerial above it');
assert.ok(bladeScreen.max.x-bladeScreen.min.x<.02,'The structural blade must not obscure the driving line');
const beamTarget=referenceBeam.localToWorld(new THREE.Vector3(0,-.09,-1.62)),beamRay=new THREE.Raycaster(referenceCamera.camera.position,beamTarget.sub(referenceCamera.camera.position).normalize());
assert.ok(beamRay.intersectObject(referenceBeam).length>0,'Halo faces must render towards the driver');
for(const object of [referenceBeam,referenceBlade]){
  const g=object.geometry,p=g.getAttribute('position'),count=g.index?.count??p.count;
  assert.ok(g.getAttribute('normal').array.every(Number.isFinite)&&g.getAttribute('uv').array.every(Number.isFinite));
  for(let i=0;i<count;i+=3){const at=j=>new THREE.Vector3().fromBufferAttribute(p,g.index?g.index.getX(i+j):i+j),a=at(0),b=at(1),c=at(2);assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12,'Flattened beams and caps must not contain collapsed triangles');}
}
const {KERB_PROFILE}=await import(moduleURL('KerbGeometry'));assert.equal(KERB_PROFILE[0][1],.035);assert.ok(Math.max(...KERB_PROFILE.map(p=>p[1]))-.035<=.020001,'Painted kerbs must rise at most 2cm above asphalt');
console.log('PASS: reference halo silhouette, clear upper view, no aerial, short lower support, valid facing/UVs and low painted kerbs');
