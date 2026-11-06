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
const {Vehicle}=await import(moduleURL('Vehicle'));
const {Track}=await import(moduleURL('Track'));
const {Race:FullGridRace}=await import(moduleURL('Race'));
const {LinePlanner}=await import(moduleURL('LinePlanner'));
const {HANDLING,steeringLock}=await import(moduleURL('Dynamics'));
const scene=new THREE.Scene(),track=new Track(scene),planner=new LinePlanner(track);
for(const [rank,driverPace] of [[6,1.05]]){
 const race=new FullGridRace(track,new THREE.Scene(),planner),player=new Vehicle(track,new THREE.Scene());race.state='racing';
 const origin=200/track.length;player.resetAt(origin);
 race.opponents.forEach((o,i)=>{const slot=i<rank-1?i+1:i+2;const delta=(rank-slot)*18;const t=origin+delta/track.length;const lane=i%2?3:-3;o.car.resetAt(t,lane);o.lane=lane-race.speedPlanner.point(t).sub(track.point(t)).dot(track.normal(t));});
 let playerOff=0,departed=0,pressure=0,measured=0;const snapshots=[];
 for(let step=0;step<120*330&&race.state==='racing';step++){
  const lookahead=THREE.MathUtils.clamp(7+player.speed*.3,9,26),to=planner.point(player.progress+lookahead/track.length).sub(player.position);
  const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-player.heading),Math.cos(desired-player.heading));
  const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
  const steer=THREE.MathUtils.clamp((angle-player.yawRate*.018)/steeringLock(player.speed),-1,1);
  let advised=Math.min(94,planner.advice(player.progress,player.speed)*driverPace);
  for(const o of race.opponents){let gap=o.car.progress-player.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;gap*=track.length;const side=o.car.position.clone().sub(player.position).dot(track.normal(player.progress));if(gap>0&&gap<40&&Math.abs(side)<2.8)advised=Math.min(advised,Math.max(0,o.car.speed+(gap-8-player.speed*.12)*.5));}
  const difference=advised-player.speed;
  player.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1),boost:advised>78&&player.speed>35&&Math.abs(error)<.09});
  race.update(1/120,player);playerOff+=player.offRoad?1:0;departed+=race.opponents.filter(o=>o.car.offRoad).length;
  if(step>120*30){measured++;if(race.opponents.some(o=>Math.abs(o.car.distance-player.distance)*track.length<80))pressure++;}
  if(step% (120*60)===0)snapshots.push({time:step/120,position:race.position,gaps:race.opponents.map(o=>Math.round((o.car.distance-player.distance)*track.length))});
 }
 const gaps=race.opponents.map(o=>Math.round((o.car.distance-player.distance)*track.length));
 assert.equal(departed,0,'Calibrated competition must remain on asphalt');
 assert.equal(playerOff,0,'The reference driver must stay physically valid');
 assert.ok(pressure/measured>.8,'A nearby battle must be sustained');
 assert.ok(gaps.every(g=>Math.abs(g)<450),'Neither side of the field may keep escaping the calibrated race');
 assert.ok(gaps.filter(g=>Math.abs(g)<180).length>=6,'Competition must involve a field, not just a single nearby rival');
 assert.ok(race.opponents.every(o=>o.agent.strategy.goal.targetRank===1&&o.car.powerScale===1&&o.powerAssist<=1.008&&o.speedCap<=94.25));

 console.log(JSON.stringify({initialRank:rank,driverPace,position:race.position,elapsed:race.elapsed,gaps,near:gaps.filter(g=>Math.abs(g)<180).length,pressure:pressure/Math.max(1,measured),playerOff,departed,contacts:race.opponents.reduce((n,o)=>n+o.collisionCount,0),snapshots}));
}
