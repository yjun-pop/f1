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
const {AeroState,RaceAerodynamics}=await import(moduleURL('Aerodynamics'));
const {CIRCUITS,selectedCircuit,circuitURL}=await import(moduleURL('Circuits'));
assert.equal(selectedCircuit('',null).id,'monza');
assert.equal(selectedCircuit('','spa').id,'spa');
assert.equal(selectedCircuit('?circuit=silverstone','spa').id,'silverstone');
assert.equal(selectedCircuit('?circuit=unknown','spa').id,'monza');
assert.equal(new URL(circuitURL('https://example.test/f1/?x=1#race','spa')).search,'?x=1&circuit=spa');
console.log('PASS: circuit selection defaults, persistence, invalid-ID fallback and shareable URLs');
const records=new Map(CIRCUITS.map((c,i)=>[`apex-best-${c.id}-v3`,160+i]));
globalThis.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,String(value))};
let uiTrack;
for(const circuit of CIRCUITS.slice(1)){
  const scene=new THREE.Scene(),track=new Track(scene,circuit),planner=new LinePlanner(track);if(circuit.id==='silverstone')uiTrack=track;
  assert.ok(Math.abs(track.length-circuit.length)<.001);
  assert.ok(track.point(0).distanceTo(track.point(1))<1e-8);
  assert.ok(track.tangent(-.1/track.length).dot(track.tangent(.1/track.length))>.999,'Start line must have a continuous straight seam');
  assert.equal(track.sections.length,circuit.cornerCount);
  assert.ok(track.sections.every((s,i)=>i===0||s.progress>track.sections[i-1].progress));
  assert.ok(track.sections[0].progress*track.length>200,'The entire grid must have room before the first corner');
  assert.ok([...planner.speeds].every(v=>Number.isFinite(v)&&v>5));
  assert.ok([...planner.offsets].every(v=>Math.abs(v)<=7.8001));
  const garages=track.group.getObjectByName('pit-garage-details'),pit=track.group.getObjectByName('pit-building');
  assert.ok(pit.position.distanceTo(garages.position)<1e-8,'Pit structure and garage details must use the same circuit anchor');
  assert.equal(track.drsZones.length,2);
  for(const z of track.drsZones){
    assert.ok(z.start>z.detection&&z.end>z.start&&z.end-z.detection<track.length);
    assert.ok(z.end-z.start>250&&z.end-z.start<1200,'DRS must occupy a bounded straight, not an inherited Monza interval');
    assert.ok(track.tangent(z.start/track.length-8/track.length).angleTo(track.tangent(z.start/track.length+8/track.length))<.08,`${circuit.id} ${z.id}: activation belongs on a straight`);
    const aero=new RaceAerodynamics(track,planner),front={aero:new AeroState(),speed:65,offRoad:false,heading:0},rear={...front,aero:new AeroState()};
    const start=track.length+z.detection-30;
    for(let step=0;step<Math.ceil((z.end-z.detection+100)/65*60);step++){
      const time=step/60;
      for(const [car,lag] of [[front,0],[rear,39]]){const m=start+time*65-lag;car.distance=m/track.length;car.progress=(car.distance%1+1)%1;car.position=track.point(car.progress);const f=track.tangent(car.progress);car.heading=Math.atan2(f.x,f.z);}
      aero.update([front,rear],100+time,true);
      const m=rear.distance*track.length-track.length;
      if(m>z.start+5&&m<z.end-5)assert.equal(rear.aero.available,true,'A valid detection ticket must survive into this circuit’s activation zone');
      if(m>z.end+2)assert.equal(rear.aero.available,false,'DRS must expire at this circuit’s end line');
    }
  }
  console.log(`PASS: ${circuit.id} scaled layout, closed start, ${track.cornerCount} named corners, guide clearance, pit alignment and two detection-gated DRS zones`);

  const keyboard=new Vehicle(track,scene);let keyboardFinish=0,keyboardOffroad=0;
  for(let step=0;step<120*200;step++){
    const lookahead=THREE.MathUtils.clamp(7+keyboard.speed*.3,9,26),to=planner.point(keyboard.progress+lookahead/track.length).sub(keyboard.position);
    const desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-keyboard.heading),Math.cos(desired-keyboard.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-keyboard.yawRate*.018)/steeringLock(keyboard.speed),-1,1);
    const difference=planner.advice(keyboard.progress,keyboard.speed)-keyboard.speed;
    keyboard.drive(1/120,{keyboard:true,steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1)});
    keyboardOffroad+=keyboard.offRoad?1:0;
    if(keyboard.distance>=1){keyboardFinish=(step+1)/120;break;}
  }
  assert.ok(keyboardFinish>0&&keyboardFinish<185);assert.equal(keyboardOffroad,0,'The new circuit’s line must be driveable with stock keyboard handling');
  console.log(`PASS: ${circuit.id} actual keyboard guide lap ${keyboardFinish.toFixed(2)}s, no track departures`);

  const solo=new Race(track,scene,planner,{opponentCount:1}),ghost=new Vehicle(track,scene);
  assert.equal(solo.best,Number(records.get(`apex-best-${circuit.id}-v3`)));
  ghost.position.set(1e6,0,1e6);solo.state='racing';solo.balanceRivals=()=>{};
  const o=solo.opponents[0];o.racePace=1.43;const laps=[];let last=0,offroad=0;
  for(let step=0;step<120*340;step++){
    solo.update(1/120,ghost);offroad+=o.car.offRoad?1:0;
    if(o.car.distance>=laps.length+1){const time=(step+1)/120;laps.push(time-last);last=time;if(laps.length===2)break;}
  }
  assert.equal(laps.length,2);assert.equal(offroad,0);
  assert.ok(Math.abs(laps[1]-circuit.referenceLap)<5,'Difficulty learning must use a calibrated circuit-specific lap reference');
  console.log(`PASS: ${circuit.id} actual AI standing/flying laps ${laps.map(t=>t.toFixed(2)).join(' / ')}s, no track departures`);

  for(const mirrored of [false,true]){
    const race=new Race(track,scene,planner);race.state='racing';
    if(mirrored)race.opponents.forEach((r,i)=>{const lane=i%2?-3:3;r.car.resetAt((15+(10-i)*12)/track.length,lane);r.lane=lane-race.speedPlanner.point(r.car.progress).sub(track.point(r.car.progress)).dot(track.normal(r.car.progress));});
    assert.equal(race.fieldSize,12);let gridOffroad=0,seconds=0,stopped=0;
    for(let step=0;step<120*50;step++){
      race.update(1/120,ghost);seconds=(step+1)/120;
      for(const r of race.opponents){gridOffroad+=r.car.offRoad?1:0;if(seconds>5&&r.car.speed<2)stopped++;}
      if(race.opponents.every(r=>r.car.distance*track.length>circuit.formationEnd+150))break;
    }
    assert.ok(seconds<50,'Every driver must clear the opening turns');assert.equal(gridOffroad,0);assert.equal(stopped,0);
    assert.equal(race.opponents.reduce((n,r)=>n+r.collisionCount,0),0,'A full standing grid must not collide at the first corner');
    console.log(`PASS: ${circuit.id} ${mirrored?'mirrored':'default'} twelve-car grid clears opening turns in ${seconds.toFixed(2)}s without contacts, stops or track departures`);
  }
  const beforeOther=records.get('apex-best-monza-v3');
  solo.reset();solo.state='racing';ghost.distance=1;solo.elapsed=circuit.referenceLap;
  solo.update(1/120,ghost);assert.equal(records.get('apex-best-monza-v3'),beforeOther);
  assert.ok(Math.abs(Number(records.get(`apex-best-${circuit.id}-v3`))-circuit.referenceLap)<.02);
  console.log(`PASS: ${circuit.id} best lap persists independently of Monza and other circuits`);
}

const {HUD}=await import(moduleURL('../ui/HUD'));
const {Game}=await import(moduleURL('Game'));
const nodes=new Map();
const node=()=>({events:new Map(),value:'',textContent:'',innerHTML:'',hidden:false,addEventListener(type,fn){this.events.set(type,fn);},setAttribute(){},focus(){},classList:{toggle(){}},replaceChildren(){},getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})});
const root={innerHTML:'',classList:{toggle(){}},querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll:()=>[]};
globalThis.Path2D=class {moveTo(){}lineTo(){}};
const choices=[],noop=()=>{};let menuOpened=0;
const hud=new HUD(root,uiTrack,{start:id=>choices.push(id),restart:noop,camera:noop,resume:noop,recover:noop,volume:noop,audioLevel:.65,motionLevel:.6,motion:noop,graphicsMode:'auto',graphicsTier:'medium',graphics:noop,menu:()=>menuOpened++});
assert.ok(root.innerHTML.includes('SILVERSTONE · GREAT BRITAIN'));
assert.ok(root.innerHTML.includes('5.89 KM'));
assert.ok(root.innerHTML.includes('circuit-monza')&&root.innerHTML.includes('circuit-silverstone')&&root.innerHTML.includes('circuit-spa'));
assert.ok(!root.innerHTML.includes('MONZA · ITALY'));
nodes.get('#circuit-spa').events.get('change')({target:{value:'spa'}});
assert.deepEqual(choices,[],'Previewing a card must not start or navigate away');
hud.startSelectedCircuit();assert.deepEqual(choices,['spa']);
nodes.get('#change-circuit').events.get('click')();assert.equal(menuOpened,1);
let navigation,cleared=0,silenced=0,loading;
globalThis.window.location={href:'https://example.test/f1/',assign:url=>navigation=url};
const game={track:uiTrack,input:{clear:()=>cleared++},audio:{silence:()=>silenced++},hud:{showCircuitLoading:label=>loading=label}};
Game.prototype.selectCircuit.call(game,'spa');
assert.equal(game.paused,true);assert.equal(game.changingCircuit,true);assert.equal(game.accumulator,0);
assert.equal(cleared,1);assert.equal(silenced,1);assert.equal(loading,'스파');
assert.equal(records.get('apex-circuit'),'spa');assert.equal(new URL(navigation).searchParams.get('circuit'),'spa');
console.log('PASS: circuit-specific HUD, deferred card choice, confirmed start, pause-menu return and saved/silenced navigation');
