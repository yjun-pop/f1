import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const cache=new Map(),three=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  let source=ts.transpileModule(fs.readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  source=source.replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`).replace(/from 'three'/g,`from '${three}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(name.split('/')[0]+'/'+dep)}'`).replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL('game/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;cache.set(name,url);return url;
}
const {RaceLaps,formatTime}=await import(moduleURL('game/RaceLaps'));
const snapshot=[];
for(const fps of [30,60,120,144]){
 const clock=new RaceLaps(1000),samples=[{id:'PLAYER',name:'YOU',distance:-.096},{id:'ai:nova',name:'NOVA',distance:-.008},{id:'ai:vector',name:'VECTOR',distance:-.016}],starts=samples.map(s=>s.distance),speeds=[.02,.022,.019];clock.reset(samples);
 let time=0;for(let frame=1;frame<=fps*155;frame++){time=frame/fps;samples.forEach((s,i)=>s.distance=starts[i]+speeds[i]*time);clock.update(frame%2?[...samples].reverse():samples,time);if(clock.lap('PLAYER',3))break;}
 const rows=clock.standings(samples,time),player=rows.find(row=>row.id==='PLAYER');
 assert.equal(rows[0].id,'ai:nova');assert.equal(player.position,2);assert.equal(player.completed,3);assert.ok(Math.abs(player.finish-154.8)<1e-7);assert.ok(Math.abs(player.best-50)<1e-7);assert.equal(player.current,null);
 assert.equal(rows[2].finish,null);assert.equal(rows[2].completed,2);assert.ok(rows[2].current>0);assert.equal(rows[0].lapTimes.length,3);snapshot.push({fps,finish:player.finish,best:player.best});
 const frozen=JSON.stringify(rows);samples[1].distance=5;clock.update(samples,time+200);assert.equal(clock.standings(samples,time+200)[0].lapTimes.length,3);assert.equal(JSON.stringify(rows),frozen);
 clock.reset(samples.map(s=>({...s,distance:-.02})));assert.ok(clock.standings(samples,0).every(row=>row.lapTimes.length===0&&row.best===null&&row.finish===null));
}
console.log('PASS: independent interpolated lap clocks at 30/60/120/144fps, grid launch, three-lap cap, unfinished entrants, immutable snapshots and reset',snapshot);
const reverse=new RaceLaps(1000),sample={id:'PLAYER',name:'YOU',distance:.99};reverse.reset([sample]);sample.distance=1.01;reverse.update([sample],1);sample.distance=.99;reverse.update([sample],2);sample.distance=1.01;reverse.update([sample],3);assert.equal(reverse.standings([sample],3)[0].lapTimes.length,1);assert.equal(reverse.lap('PLAYER',1).seconds,.5);
const invalid=new RaceLaps(1000),jump={id:'PLAYER',name:'YOU',distance:0};invalid.reset([jump]);jump.distance=.2;invalid.update([jump],10);jump.distance=1.8;invalid.update([jump],10.01);jump.distance=1.99;invalid.update([jump],30);jump.distance=2.01;invalid.update([jump],31);assert.equal(invalid.lap('PLAYER',1),undefined);assert.equal(invalid.lap('PLAYER',2).seconds,null);assert.equal(invalid.standings([jump],31)[0].best,null);
assert.equal(formatTime(59.9998),'1:00.000');assert.equal(formatTime(85.125),'1:25.125');for(const value of [0,-1,NaN,Infinity,null,undefined])assert.equal(formatTime(value),'—:——.———');
console.log('PASS: reverse recrossings are not extra laps, teleports/partial laps cannot create best times, and millisecond formatting carries across minutes');
const {resultTable,playerLapCards}=await import(moduleURL('ui/LapTables'));
const html=resultTable([{id:'PLAYER',name:'<img src=x onerror=alert(1)>',position:1,distance:3,completed:3,current:null,last:80,best:80,finish:245,lapTimes:[{lap:1,seconds:85,elapsed:85},{lap:2,seconds:80,elapsed:165},{lap:3,seconds:80,elapsed:245}]}]);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(playerLapCards(undefined).includes('완료 기록 없음'));
console.log('PASS: result names are escaped, missing laps stay empty and no finish estimates are fabricated');
globalThis.window={innerWidth:1280,innerHeight:720};globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};const records=new Map([['apex-best-monza-v3','105']]);globalThis.localStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
const {Track}=await import(moduleURL('game/Track')),{Vehicle}=await import(moduleURL('game/Vehicle')),{LinePlanner}=await import(moduleURL('game/LinePlanner')),{Race}=await import(moduleURL('game/Race'));
const scene=new THREE.Scene(),track=new Track(scene),player=new Vehicle(track,scene),race=new Race(track,scene,new LinePlanner(track),{player,opponentCount:1}),rival=race.opponents[0];race.start();race.update(race.countdown+.01,player);player.resetAt(0);player.position.set(1e6,0,1e6);rival.car.resetAt(0);rival.plan=()=>{};rival.advance=dt=>{rival.car.distance+=.012*dt;rival.distance=rival.car.distance;};race.balanceRivals=()=>{};race.update(0,player);
for(let second=1;second<=300;second++){player.distance=second/100;race.update(1,player);}
assert.equal(race.state,'finished');assert.equal(race.position,2);assert.equal(race.classification[0].id,rival.id);assert.equal(race.classification[1].id,'PLAYER');assert.equal(race.classification[0].lapTimes.length,3);assert.ok(Math.abs(race.classification[0].finish-250)<1e-6);assert.ok(Math.abs(race.classification[1].finish-300)<1e-6);assert.ok(Math.abs(race.best-100)<1e-6);assert.equal(race.bestAtStart,105);assert.ok(Math.abs(Number(records.get('apex-best-monza-v3'))-100)<1e-6);
const result=JSON.stringify(race.classification);race.update(10,player);assert.equal(JSON.stringify(race.classification),result);race.reset();assert.equal(race.state,'ready');assert.ok(race.classification.every(row=>!row.lapTimes.length));assert.equal(race.bestAtStart,race.best);
console.log('PASS: production Race collects AI after advance, records finish order and all three player laps, preserves the pre-race PB, freezes results and clears timing on restart');

const guidance={track:{length:1000},count:250,distances:new Float64Array(250).fill(4),accelerationProfiles:new Map(),accelerationProfile:LinePlanner.prototype.accelerationProfile,cornerLimit:t=>t>=.2&&t<.25?20:90,pathDistance:(a,b)=>(b-a)*1000,brakingDistance:()=>100,guidance:LinePlanner.prototype.guidance};
const approaching=LinePlanner.prototype.brakingCue.call(guidance,0,50);assert.ok(approaching.distance>0&&approaching.distance<160);assert.equal(approaching.target,72);
const due=LinePlanner.prototype.brakingCue.call(guidance,.19,50);assert.equal(due.distance,0);assert.equal(LinePlanner.prototype.brakingCue.call(guidance,0,5),null);
console.log('PASS: braking-point distance and HUD target come from the same advice envelope');
const {SpeedGuidance,smoothEffort}=await import(moduleURL('game/SpeedGuidance'));
const samples=Array.from({length:151},(_,i)=>({distance:i*4,progress:i/250,limit:i<60?90:i<85?25:90,allowed:i<60?90:i<85?25:90,effort:0}));
const profile=new SpeedGuidance(samples,70,()=>15);assert.ok(profile.cue);assert.equal(profile.target,profile.at(0).allowed);assert.equal(profile.cue.target,90,'Cue identifies the first binding constraint');
for(let i=0;i<samples.length-1;i++){const a=samples[i],b=samples[i+1];assert.ok(a.allowed<=a.limit+1e-8);assert.ok(a.allowed*a.allowed<=b.allowed*b.allowed+30*(b.distance-a.distance)+1e-6);assert.ok(Math.abs(a.effort-b.effort)<=.06*(b.distance-a.distance)+1e-7);}
const spike=Array.from({length:9},(_,i)=>({progress:0,distance:i*4,limit:30,allowed:30,effort:i===4?-1:1}));smoothEffort(spike);assert.equal(spike[4].effort,-1);assert.ok(spike[3].effort<0&&spike[5].effort<0);
console.log('PASS: raw speed limits and physical braking bounds, continuous signed colors and preserved genuine braking spikes');
const {RacingLine}=await import(moduleURL('game/RacingLine'));
const visual=new RacingLine(track,scene);visual.zones=[{start:track.length-40,end:track.length+120,minimumSpeed:20}];
function markerPositions(metres){player.resetAt(metres/track.length);player.speed=70;visual.update(player);const result=new Set(),matrix=new THREE.Matrix4();for(let i=0;i<visual.markers.count;i++){visual.markers.getMatrixAt(i,matrix);result.add([matrix.elements[12],matrix.elements[14]].map(v=>v.toFixed(3)).join(','));}assert.equal(visual.targetKmh,Math.round(visual.planner.advice(player.progress,player.speed)*3.6));assert.deepEqual(visual.brakingCue,visual.planner.brakingCue(player.progress,player.speed));return result;}
const before=markerPositions(track.length-2),after=markerPositions(1);assert.ok(before.size>3&&after.size>3);assert.ok([...before].filter(key=>after.has(key)).length>=Math.min(before.size,after.size)-2,'Markers must stay at their world positions across a lap seam');
console.log('PASS: shared HUD/line target and braking cue, fixed world-space arrow spacing across the start/finish seam');

const {QUICK_RACE_LAPS,quickRaceLaps}=await import(moduleURL('game/RaceLaps'));
for(const n of QUICK_RACE_LAPS){
 assert.equal(quickRaceLaps(String(n)),n);const clock=new RaceLaps(1000,n),sample={id:'PLAYER',name:'YOU',distance:0};clock.reset([sample]);
 for(let second=1;second<=n*100+100;second++){sample.distance=second/100;clock.update([sample],second);}
 const row=clock.standings([sample],n*100+100)[0];assert.equal(row.finish,n*100);assert.equal(row.lapTimes.length,n);assert.equal((playerLapCards(row,n).match(/class="player-lap /g)||[]).length,n);assert.ok(resultTable([{...row,finish:null}],n).includes(` / ${n}랩`));
}
for(const invalid of [null,undefined,'0','2','7','11','-1','NaN'])assert.equal(quickRaceLaps(invalid),3);
for(const n of [1,10]){
 const driver=new Vehicle(track,scene),session=new Race(track,scene,new LinePlanner(track),{player:driver,opponentCount:1,totalLaps:n});session.start();session.update(session.countdown+.01,driver);driver.resetAt(0);driver.position.set(1e6,0,1e6);session.opponents[0].plan=()=>{};session.opponents[0].advance=()=>{};session.balanceRivals=()=>{};session.update(0,driver);
 for(let second=1;second<=n*100;second++){driver.distance=second/100;session.update(1,driver);if(second<n*100)assert.equal(session.state,'racing');}
 assert.equal(session.state,'finished');assert.equal(session.laps.totalLaps,n);assert.equal(session.classification.find(r=>r.id==='PLAYER').lapTimes.length,n);session.reset();assert.equal(session.laps.totalLaps,n);
}
console.log('PASS: 1/3/5/10 lap clocks, bounded URL choices, variable result rows/cards and real Race finish/restart at 1 and 10 laps');
