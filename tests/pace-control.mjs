import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
async function module(name){let js=ts.transpileModule(fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;js=js.replace(/from 'three'/g,`from '${threeURL}'`);return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const {PaceControl}=await module('PaceControl'),{RaceStrategy}=await module('RaceStrategy');
const behind=new PaceControl(),ahead=new PaceControl(),duel=new PaceControl();let b,a,d,previous=1.2;
for(let i=0;i<120*30;i++){b=behind.update(1.2,-150-i*2/120,1/120,true);a=ahead.update(1.2,150+i*2/120,1/120,true);d=duel.update(1.2,20,1/120,true);assert.ok(Math.abs(b-previous)<.002);previous=b;}
assert.ok(b>1.25);assert.ok(a<1.15);assert.equal(d,1.2);assert.ok(b<=1.47&&a>=.65);assert.equal(behind.update(1.2,-200,1/120,false),1.2);assert.equal(behind.update(1.2,-200,1/120,true)>1.2,true);behind.reset();assert.equal(behind.update(1.2,20,1/120,true),1.2);
const jump=new PaceControl();for(let i=0;i<120*10;i++)jump.update(1.2,200,1/120,true);assert.ok(Math.abs(jump.update(1.2,-1000,1/120,true)-1.2)<.001,'A teleport resets gap-trend learning');
console.log('PASS: sustained trailing/leading gap corrections, free close duels, bounded smooth targets, invalid-player reset and discontinuity handling');
for(const character of [{aggression:.9,caution:.3,phase:0,personality:'공격형'},{aggression:.4,caution:.8,phase:1,personality:'기회 대기형'},{aggression:.6,caution:.6,phase:2,personality:'에너지 관리형'}]){
 const strategy=new RaceStrategy(character),rival={};
 const observation={elapsed:40,distance:.5,speed:70,boost:85,gripUsage:.5,lateralSpeed:0,window:true,brakingSoon:false,settling:false,ahead:{id:rival,gap:55,closing:-4},race:{rank:3,fieldSize:12,leaderGap:200,remainingLaps:2.5}};
 const plan=strategy.update(observation);assert.equal(plan.mode,'prepare');assert.equal(plan.deploy,true,'Losing ground must not disable ERS with a charged battery');
 assert.equal(strategy.update({...observation,elapsed:41,brakingSoon:true}).deploy,false);assert.equal(strategy.update({...observation,elapsed:42,boost:5}).deploy,false);assert.equal(strategy.goal.targetRank,1);
}
console.log('PASS: each personality can use real ERS to create a closing opportunity, with braking/energy safeguards and the win objective retained');
for(const direction of [-1,1]){const control=new PaceControl();let pace;for(let i=0;i<120*25;i++)pace=control.update(1.2,direction*(240-i*3/120),1/120,true);assert.ok(direction>0?pace<=1.2:pace>=1.2,'Closing an existing gap must not strengthen an escaping leader or weaken the pursuer');}
console.log('PASS: matching is one-sided outside the battle zone; approaching leaders gain no pace bonus and closing pursuers receive no penalty');
const {PackDirector}=await module('PackDirector'),matching=new PackDirector();matching.pace=1.05;matching.recordCorner(28,20);
assert.ok(matching.targets(30,11,12,1.42,0,12).pace<1.06,'One fast corner must not raise the whole field to elite pace while the player is last');
assert.ok(matching.targets(-30,2,1,1.42,1,12).pace>1.4,'A leading player still faces the corner ability they actually demonstrated');
assert.ok(matching.targets(300,1,12,1.42,0,12).pace<matching.targets(30,11,12,1.42,0,12).pace,'Distant higher positions must be progressively attainable');
console.log('PASS: corner ability is weighted by current player rank, with attainable leaders from the back and strong pressure at the front');

const queued=new PackDirector(),queuedPlayer={speed:25,lateralAcceleration:18,acceleration:0,brake:.1};for(let i=0;i<120*20;i++)queued.observe(queuedPlayer,60,true,1/120,true);assert.equal(queued.active,true);assert.equal(queued.pace,1);for(let i=0;i<120*20;i++)queued.observe(queuedPlayer,60,true,1/120,false);assert.ok(queued.pace<.75);
console.log('PASS: traffic-limited laps do not teach the field to crawl, while clean slower driving still adapts difficulty');
