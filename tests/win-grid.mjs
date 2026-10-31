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
const {HANDLING,steeringLock}=await import(moduleURL('Dynamics'));
const {CIRCUITS}=await import(moduleURL('Circuits'));
const {gridSlot}=await import(moduleURL('StartingGrid'));
const {RaceStrategy}=await import(moduleURL('RaceStrategy'));
const {DRIVER_PROFILES}=await import(moduleURL('RaceRoster'));
const {observeTraffic}=await import(moduleURL('DriverAgent'));
const context={elapsed:50,distance:1.2,speed:65,boost:60,gripUsage:.8,lateralSpeed:0,window:true,brakingSoon:false,settling:false,
  race:{rank:7,fieldSize:12,leaderGap:260,remainingLaps:1.8},ahead:{id:{},gap:35,closing:-.4}};
const strategies=DRIVER_PROFILES.map((p,phase)=>new RaceStrategy({...p,phase}));
const plans=strategies.map(s=>s.update(context));
assert.ok(strategies.every(s=>s.goal.targetRank===1&&s.goal.rank===7&&s.goal.leaderGap===260));
assert.equal(plans[0].mode,'attack');assert.equal(plans[6].mode,'prepare');assert.equal(plans[10].mode,'prepare');
assert.ok(plans[10].reserve>plans[0].reserve+10);
const leader=new RaceStrategy({...DRIVER_PROFILES[0],phase:0});
assert.equal(leader.update({...context,ahead:undefined,race:{...context.race,rank:1,leaderGap:0},behind:{id:{},gap:25,closing:3}}).mode,'defend');
const challenger=new RaceStrategy({...DRIVER_PROFILES[0],phase:0});
assert.equal(challenger.update({...context,ahead:{...context.ahead,closing:4},behind:{id:{},gap:25,closing:3}}).mode,'attack','A profitable move toward P1 takes precedence over defending a lower place');
const early=new RaceStrategy({...DRIVER_PROFILES[0],phase:0}),late=new RaceStrategy({...DRIVER_PROFILES[0],phase:0});
const earlyPlan=early.update({...context,race:{...context.race,leaderGap:30,remainingLaps:2.8}});
const latePlan=late.update({...context,race:{...context.race,leaderGap:500,remainingLaps:.5}});
assert.ok(late.goal.urgency>early.goal.urgency&&latePlan.reserve<earlyPlan.reserve);
assert.equal(late.update({...context,settling:true}).mode,'manage');
console.log('PASS: all eleven drivers aim for P1 with distinct attack/wait/energy choices, leader defence and finish urgency');

for(const circuit of CIRCUITS){
  const scene=new THREE.Scene(),track=new Track(scene,circuit),planner=new LinePlanner(track),player=new Vehicle(track,scene);
  const race=new Race(track,scene,planner,{player}),cars=[...race.opponents.map(o=>o.car),player];
  assert.equal(race.position,12);assert.equal(cars.length,12);
  cars.forEach((car,i)=>{
    const slot=gridSlot(i+1),p=slot.meters/track.length;
    assert.ok(Math.abs(car.distance*track.length-slot.meters)<1e-7&&car.distance<0);
    assert.equal(car.lap,1);assert.equal(car.speed,0);
    const pose=track.point(p).addScaledVector(track.normal(p),slot.lane);
    assert.ok(car.position.distanceTo(pose)<1e-7);
    assert.ok(track.tangent(p).dot(track.tangent(0))>.97,'The whole starting grid belongs on the straight');
    const box=track.group.getObjectByName(`grid-box-${i+1}`);
    assert.ok(box,'Every physical slot must have a matching visible grid box');
    const positions=box.geometry.getAttribute('position');
    const center=new THREE.Vector3();for(let k=0;k<positions.count;k++)center.add(new THREE.Vector3().fromBufferAttribute(positions,k));center.divideScalar(positions.count).setY(car.position.y);
    assert.ok(center.distanceTo(car.position)<.001);
    for(const other of cars.slice(i+1))assert.ok(car.position.distanceTo(other.position)>7,'Staggered cars must not overlap');
  });
  const start=cars.map(c=>c.position.clone());race.start();
  for(let step=0;step<120*4;step++)race.update(1/120,player);
  assert.equal(race.state,'countdown');assert.equal(race.startSignal.lights,4);
  cars.forEach((c,i)=>assert.ok(c.position.equals(start[i])));
  while(race.state==='countdown')race.update(1/120,player);
  assert.equal(race.elapsed,0);assert.equal(race.startSignal.phase,'go');
  const snap=observeTraffic(cars);const frozenDistances=snap.map(s=>s.distance);cars[0].distance+=.1;
  assert.deepEqual(snap.map(s=>s.distance),frozenDistances,'Rank and leader progress must be immutable during a decision batch');cars[0].distance-=.1;
  race.opponents.forEach(o=>o.agent.think({elapsed:0,playerPosition:12,fieldSize:12,traffic:snap}));
  race.opponents.forEach((o,i)=>{
    assert.equal(o.agent.strategy.goal.targetRank,1);assert.equal(o.agent.strategy.goal.rank,i+1);
    assert.ok(Math.abs(o.agent.strategy.goal.leaderGap-i*8)<1e-6);
  });
  const observer=race.opponents[5].agent,obs={elapsed:50,playerPosition:12,fieldSize:12,traffic:snap};
  observer.think(obs);const plan={...observer.strategy.plan};observer.reset();observer.think({...obs,playerPosition:1});
  assert.deepEqual(observer.strategy.plan,plan,'Changing the human ranking label cannot appoint a different attack strategy');
  cars[0].resetAt(1.2);const distantSnapshot=observeTraffic(cars);cars[0].distance=-1;
  observer.reset();observer.think({...obs,traffic:distantSnapshot});
  assert.ok(Math.abs(observer.strategy.goal.leaderGap-(1.2-cars[5].distance)*track.length)<1e-6,'The win objective must retain a distant leader across a lap seam, outside local traffic perception');
  race.reset();race.state='racing';let seconds=0,departures=0,stops=0;
  for(let step=0;step<120*55;step++){
    const lookahead=THREE.MathUtils.clamp(7+player.speed*.3,9,26),to=planner.point(player.progress+lookahead/track.length).sub(player.position);
    const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-player.heading),Math.cos(desired-player.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-player.yawRate*.018)/steeringLock(player.speed),-1,1);
    let advised=planner.advice(player.progress,player.speed);
    for(const o of race.opponents){let gap=(o.car.distance-player.distance)*track.length;
      const lateral=o.car.position.clone().sub(player.position).dot(track.normal(player.progress));
      if(gap>0&&gap<40&&Math.abs(lateral)<2.8)advised=Math.min(advised,Math.max(0,o.car.speed+(gap-8-player.speed*.12)*.5));
    }
    const difference=advised-player.speed;
    player.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});
    race.update(1/120,player);seconds=(step+1)/120;
    for(const o of race.opponents){departures+=Number(o.car.offRoad);if(seconds>5&&o.car.speed<2)stops++;}
    if(race.opponents.every(o=>o.car.distance*track.length>circuit.formationEnd+150))break;
  }
  assert.ok(seconds<55,'Every AI must clear the opening turns from the real negative-distance grid');
  assert.equal(departures,0);assert.equal(stops,0);assert.equal(race.opponents.reduce((n,o)=>n+o.collisionCount,0),0);
  race.reset();assert.equal(player.distance*track.length,-96);assert.equal(race.state,'ready');
  assert.ok(race.opponents.every(o=>o.car.boost===100&&o.agent.strategy.attacks===0));
  race.state='racing';player.resetAt(-.01,3);race.update(1/120,player);player.resetAt(0,3);race.update(1/120,player);
  assert.equal(race.lastLap,0);assert.equal(race.best,0);assert.equal(player.lap,1);
  race.elapsed=89;player.resetAt(1,3);race.update(1/120,player);
  assert.ok(race.lastLap>89&&race.lastLap<90);assert.equal(player.lap,2);assert.equal(race.state,'racing');
  race.elapsed=174;player.resetAt(2,3);race.update(1/120,player);assert.equal(race.state,'racing');
  race.elapsed=259;player.resetAt(3,3);race.update(1/120,player);assert.equal(race.state,'finished');
  console.log(`PASS: ${circuit.id} P1–P12 staggered standing grid, aligned paint, frozen lights, ${seconds.toFixed(2)}s clean opening, reset and three full laps`);
}
assert.match(fs.readFileSync(new URL('../src/game/Game.ts',import.meta.url),'utf8'),/new Race\([^;]+\{player:this.vehicle\}/,'The playable game must bind its actual player to the standing grid');
