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
const {Vehicle,resolveCollision}=await import(moduleURL('Vehicle'));
const {Race}=await import(moduleURL('Race'));
const {LinePlanner}=await import(moduleURL('LinePlanner'));
const {HANDLING,steeringLock}=await import(moduleURL('Dynamics'));
const {RaceAerodynamics}=await import(moduleURL('Aerodynamics'));
const {CIRCUITS,selectedCircuit,circuitURL}=await import(moduleURL('Circuits'));

const {gridSlot}=await import(moduleURL('StartingGrid'));
const {circuitPreview}=await import(moduleURL('../ui/CircuitMenu'));
const {createNightSkyTexture,createSkyTexture}=await import(moduleURL('WorldLighting'));
const records=new Map(CIRCUITS.map(c=>[`apex-best-${c.id}-v3`,'200']));globalThis.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,String(value))};
assert.equal(CIRCUITS.length,8);assert.equal(new Set(CIRCUITS.map(c=>c.id)).size,8);assert.equal(new Set(CIRCUITS.map(c=>circuitPreview(c))).size,8);
for(const circuit of CIRCUITS){assert.equal(selectedCircuit(`?circuit=${circuit.id}`,null).id,circuit.id);assert.equal(selectedCircuit('',circuit.id).id,circuit.id);assert.equal(new URL(circuitURL('https://example.test/f1/',circuit.id,true)).searchParams.get('circuit'),circuit.id);}
console.log('PASS: eight distinct track layouts, saved selection and direct/share/start URLs resolve every circuit');
for(const circuit of CIRCUITS.slice(3)){
 const scene=new THREE.Scene(),track=new Track(scene,circuit),planner=new LinePlanner(track);
 assert.ok(Math.abs(track.length-circuit.length)<.001);assert.equal(track.sections.length,circuit.cornerCount);assert.ok(track.sections.every((s,i)=>!i||s.progress>track.sections[i-1].progress));
 assert.ok(track.tangent(-.1/track.length).dot(track.tangent(.1/track.length))>.999);assert.ok(track.sections[0].progress*track.length>200);assert.ok([...planner.speeds].every(v=>Number.isFinite(v)&&v>4));
 for(let i=0;i<12;i++){const slot=gridSlot(i+1),t=slot.meters/track.length;assert.ok(track.tangent(t).dot(track.tangent(0))>.97,'All grid slots must lie on the starting straight');assert.ok(track.group.getObjectByName(`grid-box-${i+1}`));}
 track.group.updateMatrixWorld(true);
 for(const stand of track.group.children.filter(o=>o.name==='grandstand')){const inverse=stand.matrixWorld.clone().invert();for(const point of planner.points){const q=point.clone().applyMatrix4(inverse);assert.ok(!(Math.abs(q.x)<30&&q.z>-3&&q.z<14&&q.y>-2&&q.y<10),'Grandstands must not obstruct a neighboring section of the racing line');}}
 const visual=track.group.getObjectByName('circuit-landmarks');assert.ok(visual);let pointLights=0;visual.traverse(o=>{if(o.isPointLight)pointLights++;});assert.equal(pointLights,0,'Landmarks must not allocate a point light or shadow map for each lamp/window');
 if(circuit.id==='monaco'){assert.ok(track.group.getObjectByName('monaco-tunnel'));assert.ok(track.group.getObjectByName('city-buildings'));assert.ok(track.group.getObjectByName('harbour-water'));}
 if(circuit.id==='interlagos')assert.ok(track.group.getObjectByName('senna-s-runoff'));
 if(circuit.id==='montreal'){assert.ok(track.group.getObjectByName('wall-of-champions'));assert.ok(track.group.getObjectByName('harbour-water'));}
 if(circuit.night){const building=track.group.getObjectByName('city-buildings');assert.ok(building?.material.emissiveIntensity>.5);assert.equal(circuit.id,'singapore');}
 if(circuit.overpass){
  const bridge=circuit.overpass,upper=track.point(bridge.progress),lower=track.point(bridge.lowerProgress);assert.ok(upper.clone().setY(0).distanceTo(lower.clone().setY(0))<5);assert.ok(upper.y-lower.y>6);
  assert.ok(track.group.getObjectByName('suzuka-overpass'));assert.ok(track.barrierPaths.every(p=>p.length>track.length*.95),'A real grade-separated crossing must not be cut out as a planar barrier loop');
  const a=new Vehicle(track,scene),b=new Vehicle(track,scene);a.resetAt(bridge.progress);b.resetAt(bridge.lowerProgress);b.position.x=a.position.x;b.position.z=a.position.z;a.speed=b.speed=35;assert.equal(resolveCollision(a,b),false,'Cars on the two decks must not collide');
  for(let k=0;k<120;k++){a.drive(1/120,{throttle:0,brake:0,steer:0});assert.ok(Math.abs(a.position.y-track.elevation(a.progress))<1e-8);assert.ok(Math.abs(a.progress-bridge.progress)<.02,'Crossing the lower branch must not steal the upper car’s track progress');}
  const crossingRace=new Race(track,scene,planner,{opponentCount:1}),under=new Vehicle(track,scene);under.resetAt(bridge.lowerProgress);crossingRace.state='racing';crossingRace.elapsed=60;crossingRace.balanceRivals=()=>{};const upperDriver=crossingRace.opponents[0],start=bridge.progress-20/track.length,offset=crossingRace.speedPlanner.point(start).sub(track.point(start)).dot(track.normal(start));upperDriver.car.resetAt(start,offset);upperDriver.lane=0;upperDriver.car.speed=35;upperDriver.racePace=1.43;
  for(let k=0;k<360;k++){crossingRace.update(1/120,under);assert.equal(upperDriver.car.offRoad,false);}assert.ok(upperDriver.car.distance>bridge.progress+30/track.length,'A stopped car on the lower deck must not block an autonomous car on the overpass');assert.equal(upperDriver.collisionCount,0);
 }
 const aero=new RaceAerodynamics(track,planner);assert.equal(aero.zones.length,circuit.drs.length);for(const z of aero.zones){assert.ok(z.start>z.detection&&z.end>z.start);assert.ok(z.end-z.start<track.length*.65,'DRS must end before a later lap rather than remaining open around the circuit');}
 console.log(`PASS: ${circuit.id} published distance, named corners, aligned standing grid, independent DRS zones and bounded static landmarks`);

 const human=new Vehicle(track,scene);let humanOff=0,humanFinish=0;
 for(let k=0;k<120*210;k++){
  const lookahead=THREE.MathUtils.clamp(7+human.speed*.3,9,26),to=planner.point(human.progress+lookahead/track.length).sub(human.position),desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-human.heading),Math.cos(desired-human.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length())),steer=THREE.MathUtils.clamp((angle-human.yawRate*.018)/steeringLock(human.speed),-1,1),difference=planner.advice(human.progress,human.speed)-human.speed;
  human.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});humanOff+=Number(human.offRoad);if(human.distance>=1){humanFinish=(k+1)/120;break;}
 }
 assert.ok(humanFinish>0&&humanFinish<200);assert.equal(humanOff,0);assert.equal(human.gripScale,1);assert.equal(human.powerScale,1);
 const solo=new Race(track,scene,planner,{opponentCount:1}),ghost=new Vehicle(track,scene);ghost.position.set(1e6,0,1e6);solo.state='racing';solo.balanceRivals=()=>{};const o=solo.opponents[0];o.racePace=1.43;o.car.resetAt(0);o.lane=-solo.speedPlanner.point(0).sub(track.point(0)).dot(track.normal(0));
 let soloOff=0,last=0;const laps=[];
 for(let k=0;k<120*320;k++){solo.update(1/120,ghost);soloOff+=Number(o.car.offRoad);if(o.car.distance>=laps.length+1){laps.push(solo.elapsed-last);last=solo.elapsed;if(laps.length===2)break;}}
 assert.equal(laps.length,2);assert.equal(soloOff,0);assert.ok(Math.abs(laps[1]-circuit.referenceLap)<5);assert.equal(o.car.powerScale,1);
 console.log(`PASS: ${circuit.id} stock keyboard lap ${humanFinish.toFixed(2)}s and two clean AI laps ${laps.map(t=>t.toFixed(2)).join(' / ')}s`);

 for(const mirrored of [false,true]){
  const player=new Vehicle(track,scene),race=new Race(track,scene,planner,{player});player.position.set(1e6,0,1e6);race.state='racing';
  if(mirrored)race.opponents.forEach((o,i)=>{const slot=gridSlot(i+1),t=slot.meters/track.length;o.car.resetAt(t,-slot.lane);o.lane=-slot.lane-race.speedPlanner.point(t).sub(track.point(t)).dot(track.normal(t));});
  let departures=0,stops=0;
  for(let k=0;k<120*190;k++){
   race.update(1/120,player);for(const r of race.opponents){departures+=Number(r.car.offRoad);if(race.elapsed>5&&r.car.speed<2)stops++;assert.ok(r.speedCap<=94.25&&r.powerAssist<=1.008);}
   if(mirrored?race.opponents.every(r=>r.car.distance*track.length>circuit.formationEnd+100):race.opponents.every(r=>r.car.distance>=1.02))break;
  }
  assert.equal(departures,0,'The full new circuit must remain driveable by the entire field');assert.equal(stops,0);assert.equal(race.opponents.reduce((n,r)=>n+r.collisionCount,0),0);assert.ok(race.elapsed<180);
  assert.ok(race.opponents.every(r=>r.agent.strategy.goal.targetRank===1&&r.agent.strategy.goal.fieldSize===12));
  console.log(`PASS: ${circuit.id} ${mirrored?'mirrored opening':'full eleven-rival lap'} in ${race.elapsed.toFixed(2)}s, no contacts, stops or track departures`);
  if(!mirrored){const old=new Map(records),key=`apex-best-${circuit.id}-v3`;player.distance=1;race.elapsed=90;race.update(1/120,player);assert.ok(Number(records.get(key))<91);for(const [k,v]of old)if(k!==key)assert.equal(records.get(k),v);race.reset();assert.ok(Math.abs(player.distance*track.length+96)<1e-6);assert.equal(race.state,'ready');assert.ok(race.opponents.every(r=>r.car.boost===100&&r.car.distance<0));}
 }
}
const night=createNightSkyTexture(128),day=createSkyTexture(128),mean=t=>{let sum=0;const d=t.image.data;for(let i=0;i<d.length;i+=4)sum+=THREE.DataUtils.fromHalfFloat(d[i])+THREE.DataUtils.fromHalfFloat(d[i+1])+THREE.DataUtils.fromHalfFloat(d[i+2]);return sum/(d.length/4);};
assert.ok(mean(night)<mean(day)*.08);assert.ok([...night.image.data].every(Number.isFinite));night.dispose();day.dispose();console.log('PASS: Singapore night uses a dark filtered HDR sky instead of the daylight photograph');
