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
const {Powertrain,gearEfficiency,engineAcceleration,transmissionMode,REV_LIMIT_RPM}=await import(moduleURL('Powertrain'));
const {integrateBody}=await import(moduleURL('Dynamics'));
const {EngineSoundState}=await import(moduleURL('EngineSound'));
const {RaceStrategy}=await import(moduleURL('RaceStrategy'));
const {DRIVER_PROFILES}=await import(moduleURL('RaceRoster'));
const body=(speed=0)=>({position:new THREE.Vector3(),speed,lateralSpeed:0,yawRate:0,heading:0,steer:0,offRoad:false,acceleration:0,lateralAcceleration:0,gripUsage:0,throttle:1,brake:0,transmission:new Powertrain()});
const accelerate={throttle:1,brake:0,steer:0,boost:false};
assert.equal(transmissionMode('manual'),'manual');assert.equal(transmissionMode('bad'),'auto');
// Actual force, not just a different display: a high gear loses low-speed
// wheel torque, and holding first reaches a real acceleration limit.
const normal=body(20),tooHigh=body(20);tooHigh.transmission.mode='manual';tooHigh.transmission.gear=8;
integrateBody(normal,accelerate,1/120);integrateBody(tooHigh,accelerate,1/120);
assert.ok(normal.acceleration>tooHigh.acceleration*2,'Wrong high gear must reduce actual acceleration');
assert.ok(gearEfficiency(20,8)<gearEfficiency(20,1)*.5);
const held=body(),automatic=body();held.transmission.mode='manual';let cutCount=0,recoveryCount=0,wasCut=false;
for(let i=0;i<120*15;i++){
  integrateBody(held,accelerate,1/120);integrateBody(automatic,accelerate,1/120);
  const cut=held.transmission.sample.cut<.5;
  cutCount+=cut&&!wasCut?1:0;recoveryCount+=!cut&&wasCut?1:0;wasCut=cut;
  assert.equal(held.transmission.gear,1,'Manual must never silently upshift');
}
assert.ok(held.speed<29&&automatic.speed>held.speed+30,'Held first must hit its ratio-limited speed while auto keeps accelerating');
assert.ok(cutCount>5&&recoveryCount>5,'The physical limiter must repeatedly cut engine force');
const heldSpeed=held.speed,heldRPM=held.transmission.rpm;
assert.equal(held.transmission.shift(1,held.speed),true);
let shiftCut=false,shiftedRPM=heldRPM;
for(let i=0;i<120;i++){integrateBody(held,accelerate,1/120);shiftCut ||=held.transmission.sample.cut<.9;if(i===14)shiftedRPM=held.transmission.rpm;}
assert.ok(held.speed>heldSpeed+5&&shiftedRPM<heldRPM-1000&&shiftCut,'An upshift must lower RPM, cut torque briefly, then free acceleration');
console.log('PASS: physical gear torque, manual held-gear speed limit, actual ignition cuts and upshift acceleration recovery');

// Mechanical protection, bounded gears and anti-repeat apply to manual input.
const protectedBox=new Powertrain();protectedBox.setMode('auto',50);protectedBox.setMode('manual',50);protectedBox.advance(50,1,0,.1);
const protectedGear=protectedBox.gear;
assert.equal(protectedBox.shift(-1,50),false);assert.equal(protectedBox.gear,protectedGear,'Unsafe downshifts must not engage');
assert.equal(protectedBox.shift(1,50),true);assert.equal(protectedBox.shift(1,50),false,'A held/repeated request must respect shift time');
protectedBox.reset();assert.equal(protectedBox.mode,'manual');assert.equal(protectedBox.gear,1);assert.equal(protectedBox.shift(-1,0),false);
for(let gear=2;gear<=8;gear++){protectedBox.advance(0,0,0,.1);protectedBox.advance(0,0,0,.1);assert.equal(protectedBox.shift(1,0),true);}
protectedBox.advance(0,0,0,.1);protectedBox.advance(0,0,0,.1);assert.equal(protectedBox.shift(1,0),false);assert.equal(protectedBox.gear,8);
protectedBox.setMode('auto',40);assert.equal(protectedBox.gear,3);assert.equal(protectedBox.shift(1,40),false);
console.log('PASS: over-rev downshift rejection, shift cooldown, eight-gear bounds, mode selection and manual-mode reset');

// Physics and presentation use the very same completed gearbox sample.
const coupled=body(25),engine=new EngineSoundState();let realCuts=0;
for(let i=0;i<240;i++){
  const before=coupled.speed;integrateBody(coupled,accelerate,1/120);
  const state=coupled.transmission.sample,snapshot=JSON.stringify(state);
  const expected=engineAcceleration(before,false,state.drive)-(.00105*before*before+.35);
  assert.ok(Math.abs(coupled.acceleration-expected)<1e-10,'The sampled gear and cut must determine actual wheel force');
  for(const renderDt of [0,1/30,1/144,.1]){
    const sound=engine.advance(coupled,renderDt);
    assert.equal(sound.rpm,state.rpm);assert.equal(sound.gear,state.gear);assert.equal(sound.cut,state.cut);
    assert.equal(JSON.stringify(coupled.transmission.sample),snapshot,'Rendering must never advance physical shifting');
  }
  realCuts+=state.cut<1?1:0;
}
assert.ok(realCuts>0);
for(const boost of [false,true]){
  const player=body(35),rival=body(35);rival.gripScale=1.4;rival.raceSpeedCap=94;rival.raceCruiseCap=87;
  for(let step=0;step<120*15;step++){
    integrateBody(player,{...accelerate,boost},1/120);integrateBody(rival,{...accelerate,boost},1/120);
    assert.ok(Math.abs(player.speed-rival.speed)<1e-10);assert.equal(player.transmission.gear,rival.transmission.gear);
  }
}
console.log('PASS: shared physical RPM/gear/cut, render independence and equal player/AI drivetrain output with finite existing speed caps');

const context={elapsed:50,distance:1.2,speed:65,boost:70,gripUsage:.8,lateralSpeed:0,window:true,brakingSoon:false,settling:false};
const target={},attacker=new RaceStrategy({...DRIVER_PROFILES[0],phase:0}),manager=new RaceStrategy({...DRIVER_PROFILES[10],phase:1});
const challenge={...context,ahead:{id:target,gap:35,closing:1}};
const attackPlan=attacker.update(challenge),managementPlan=manager.update(challenge);
assert.equal(attackPlan.mode,'attack');assert.equal(attackPlan.deploy,true);assert.equal(attackPlan.allowAttack,true);
assert.ok(managementPlan.reserve>attackPlan.reserve,'Personalities must keep different resource budgets');
assert.equal(attacker.update({...challenge,elapsed:51,window:false,brakingSoon:true}).mode,'prepare');assert.equal(attacker.plan.deploy,false);
assert.equal(attacker.update({...challenge,elapsed:52,boost:7}).mode,'harvest');assert.equal(attacker.plan.allowAttack,false);
assert.equal(attacker.update({...challenge,elapsed:53,boost:28}).mode,'harvest','Resource recovery needs hysteresis, not every-frame toggling');
const momentum=attacker.update({...challenge,elapsed:53.5,boost:7,ahead:{...challenge.ahead,closing:4}});
assert.equal(momentum.mode,'harvest');assert.equal(momentum.deploy,false);assert.equal(momentum.allowAttack,true,'A faster car may pass using momentum while saving ERS');
assert.equal(attacker.update({...challenge,elapsed:54,boost:65}).mode,'attack');assert.equal(attacker.plan.deploy,true);
assert.equal(attacker.update({...context,elapsed:55,behind:{id:{},gap:25,closing:2}}).mode,'defend');
const finish=attacker.update({...challenge,elapsed:56,distance:2.9,boost:12});
assert.equal(finish.mode,'finish');assert.equal(finish.deploy,true);assert.equal(finish.allowAttack,true);assert.equal(finish.reserve,5);
assert.equal(attacker.update({...challenge,elapsed:57,brakingSoon:true}).deploy,false,'An attack must never spend ERS into an imminent braking zone');
console.log('PASS: individual ERS attack/prepare/harvest/defence/final-sprint decisions and resource recovery hysteresis');

// Real, bounded batteries: strategy cannot invent energy to keep attacking.
const energyDriver=new RaceStrategy({...DRIVER_PROFILES[10],phase:1});let energy=30,used=0,recovered=0;const modes=new Set();
for(let i=0;i<60*45;i++){
  const plan=energyDriver.update({...challenge,elapsed:60+i/60,boost:energy});modes.add(plan.mode);
  const deploy=plan.deploy&&energy>1;
  energy=Math.max(0,Math.min(100,energy+(deploy?-24:8)/60));used+=deploy?1:0;recovered+=deploy?0:1;
  assert.ok(energy>=0&&energy<=100);
}
assert.ok(used>60&&recovered>60&&modes.has('attack')&&modes.has('harvest'));
attacker.onContact(100,1.2);const afterContact=attacker.update({...challenge,elapsed:100});
assert.equal(afterContact.allowAttack,false);assert.equal(attacker.learnedOpportunities,1);assert.equal(manager.learnedOpportunities,0);
const learnedReserve=attacker.update({...challenge,elapsed:108}).reserve;
assert.ok(learnedReserve>attackPlan.reserve,'A local failed attempt must make the same driver more cautious there');
attacker.recordPass(true,1.2);assert.ok(attacker.update({...challenge,elapsed:109}).reserve<learnedReserve);
for(let i=0;i<120*3;i++)attacker.update({...challenge,elapsed:110+i/120,gripUsage:1.35,lateralSpeed:8});
assert.equal(attacker.mode,'manage');assert.ok(attacker.tyreLoad>.72&&attacker.plan.driveScale<1&&attacker.plan.allowAttack===false);
for(let i=0;i<120*12;i++)attacker.update({...challenge,elapsed:113+i/120});
assert.ok(attacker.tyreLoad<.1&&attacker.plan.allowAttack);
attacker.reset();assert.equal(attacker.tyreLoad,0);assert.equal(attacker.learnedOpportunities,0);assert.equal(attacker.attacks,0);
console.log('PASS: actual finite battery budgets, private opportunity learning, contact caution, tire-load management, recovery and reset');
