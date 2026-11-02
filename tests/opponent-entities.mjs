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
const {Opponent}=await import(moduleURL('Opponent'));
const {gridSlot}=await import(moduleURL('StartingGrid'));
const state=o=>({position:o.car.position.toArray(),distance:o.distance,speed:o.speed,boost:o.car.boost,control:{...o.control},decisions:o.agent.decisions,memory:o.agent.memorySize,mode:o.agent.strategy.mode,contacts:o.collisionCount,penalty:o.collisionScore});
for(const circuit of CIRCUITS){
 const scene=new THREE.Scene(),track=new Track(scene,circuit),line=new LinePlanner(track),ghost=new Vehicle(track,scene),race=new Race(track,scene,line);
 ghost.position.set(1e6,0,1e6);
 const entrants=[...race.opponents],brains=entrants.map(o=>o.agent);
 for(const property of ['id','car','agent','control'])assert.equal(new Set(entrants.map(o=>o[property])).size,11,`${circuit.id}: private ${property}`);
 for(const property of ['strategy','trafficPlanner','corner'])assert.equal(new Set(brains.map(a=>a[property])).size,11,`${circuit.id}: private ${property}`);
 assert.ok(entrants.every(o=>o instanceof Opponent&&o.agent.driver===o));
 const run=()=>{race.state='racing';for(let k=0;k<120*6;k++)race.update(1/120,ghost);return new Map(race.opponents.map(o=>[o.id,state(o)]));};
 const first=run();race.reset();race.opponents.reverse();const reversed=run();
 for(const o of entrants){const a=first.get(o.id),b=reversed.get(o.id);assert.deepEqual(b,a,`${circuit.id}: shuffling entrants must not change a driver's decisions or motion`);assert.equal(o.agent.strategy.goal.targetRank,1);assert.equal(o.agent.strategy.goal.fieldSize,12);}
 assert.ok(new Set(entrants.map(o=>o.agent.decisions)).size>1,'Drivers retain different reaction clocks');
 const [driver,...others]=entrants,before=others.map(state);
 driver.onContact(ghost,4,race.elapsed);driver.car.boost=7;
 assert.ok(driver.collisionScore<0&&driver.collisionCount===1);assert.equal(driver.agent.memoryFor(ghost).contacts,1);
 assert.deepEqual(others.map(state),before,'An incident, energy use and private learning must not leak into another entrant');
 driver.reset(gridSlot(1),1);assert.deepEqual(others.map(state),before,'Resetting a single entrant must not reset the field');
 assert.equal(driver.car.boost,100);assert.equal(driver.agent.memorySize,0);assert.equal(driver.collisionCount,0);
 race.reset();race.state='racing';
 const drive=entrants.map(o=>o.car.drive);
 for(const [i,o]of entrants.entries()){o.car.position.set(1e6+100+i*20,0,1e6);o.car.drive=()=>{};}
 const touch=()=>{entrants[0].car.resetAt(.001,0);entrants[1].car.resetAt(.001,1);};
 touch();race.update(1/120,ghost);assert.equal(entrants[0].collisionCount,1);assert.equal(entrants[1].collisionCount,1);
 race.opponents.reverse();touch();race.update(1/120,ghost);
 assert.equal(entrants[0].collisionCount,1,'A reordered field must not turn one sustained contact into another penalty');assert.equal(entrants[1].collisionCount,1);
 assert.ok(entrants.slice(2).every(o=>o.collisionCount===0),'Uninvolved entrants must not receive a contact penalty');
 entrants.forEach((o,i)=>o.car.drive=drive[i]);
 race.reset();assert.ok(entrants.every((o,i)=>o.agent===brains[i]&&o.agent.decisions===0&&o.agent.memorySize===0&&o.agent.trafficPlanner.routesChosen===0));
 console.log(`PASS: ${circuit.id} eleven independent entrant objects, isolated incidents/energy/reset, stable contact identities and order-independent physical decisions`);
}
