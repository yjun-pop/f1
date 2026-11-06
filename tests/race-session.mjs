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

const {RaceLaps,formatTime}=await import(moduleURL('RaceLaps')),{DRIVER_PROFILES}=await import(moduleURL('RaceRoster'));
const {HUD}=await import(moduleURL('../ui/HUD')),{Game}=await import(moduleURL('Game'));
globalThis.Path2D=class {moveTo(){}lineTo(){}};
function fixture(){
 const nodes=new Map(),trace=[],storage=new Map();let markup='',navigation;
 const noop=()=>{};
 const node=id=>({id,events:new Map(),value:'auto',textContent:'',hidden:false,disabled:false,style:{setProperty(){}},classList:{toggle(){}},setAttribute(){},replaceChildren(){},append(...children){this.children=children;},addEventListener(n,f){this.events.set(n,f);},focus(){document.activeElement=this;},blur(){document.activeElement=null;},closest(){return null;},getContext:()=>new Proxy({},{get:()=>noop,set:()=>true})});
 const root={classList:{toggle(){}},querySelector:q=>nodes.get(q.slice(1))??null,querySelectorAll:()=>[],contains:n=>[...nodes.values()].includes(n),get innerHTML(){return markup;},set innerHTML(s){markup=s;for(const m of s.matchAll(/id="([^"]+)"/g))nodes.set(m[1],node(m[1]));}};
 globalThis.window={location:{href:'https://example.test/f1/?circuit=silverstone',assign:url=>navigation=url}};
 globalThis.document={activeElement:null,createElement:()=>node('new')};globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 const track={name:'SILVERSTONE',country:'GREAT BRITAIN',length:5891,circuit:{id:'silverstone'},bounds:{min:{x:0,z:0},max:{x:100,z:100}},point:t=>({x:t*100,z:t*100})};
 const vehicle={transmission:{mode:'manual'},lap:3,progress:.3,aero:{active:false,available:false,wake:0},reset(){trace.push('vehicle-reset');}};
 const samples=[{id:'PLAYER',name:'YOU',distance:-.096},...DRIVER_PROFILES.map((p,i)=>({id:`ai:${p.name.toLowerCase()}`,name:p.name,distance:-(i+1)*.008}))],starts=samples.map(s=>s.distance),clock=new RaceLaps(1000);clock.reset(samples);
 for(let step=1;step<=269;step++){const time=Math.min(step,268.2);samples.forEach((s,i)=>s.distance=starts[i]+time*(i===0?3.096/268.2:i===1?.013:i===2?.0122:.0108));clock.update(samples,time);}
 const classification=clock.standings(samples,268.2);
 const race={classification,bestAtStart:85.125,state:'ready',position:3,fieldSize:12,elapsed:268.2,best:85.125,lapTime:0,lastLap:85.125,intervals:{},aerodynamics:{enabled:false},opponents:[],reset(){this.state='ready';this.classification=[];trace.push('race-reset');},start(){if(this.state==='ready'){this.state='countdown';trace.push('start');}}};
 const game={track,vehicle,race,paused:false,accumulator:.01,input:{clear(){trace.push('clear-input');}},feedback:{reset(){trace.push('feedback-reset');}},audio:{silence(){trace.push('silence');}}};
 const hud=new HUD(root,track,{start:id=>{assert.equal(id,'silverstone');race.start();},restart:()=>Game.prototype.restart.call(game),camera:noop,resume:noop,recover:noop,volume:noop,audioLevel:.7,motionLevel:.6,motion:noop,graphicsMode:'auto',graphicsTier:'medium',graphics:noop,transmissionMode:'manual',transmission:mode=>vehicle.transmission.mode=mode,menu:()=>Game.prototype.selectCircuit.call(game,'silverstone')});game.hud=hud;
 const update=(state=race.state,paused=false)=>{race.state=state;hud.update(vehicle,race,paused,track,1);};
 const click=id=>nodes.get(id).events.get('click')();
 return {nodes,root,hud,game,race,vehicle,trace,update,click,get navigation(){return navigation;}};
}
let f=fixture();
assert.ok(!f.root.innerHTML.includes('circuit-card')&&!f.root.innerHTML.includes('gallery-stage'),'The race must never contain the old circuit-selection menu');
assert.equal(f.nodes.get('start-transmission').value,'manual');f.nodes.get('start-transmission').events.get('change')({target:{value:'auto'}});assert.equal(f.vehicle.transmission.mode,'auto');assert.equal(f.nodes.get('transmission-mode').value,'auto');
f.update('ready');assert.equal(f.nodes.get('overlay').hidden,false);assert.equal(f.nodes.get('race-session-title').textContent,'출발 준비');assert.equal(f.nodes.get('race-session-results').hidden,true);
f.hud.startSelectedCircuit();assert.equal(f.race.state,'countdown');f.update();assert.equal(f.nodes.get('overlay').hidden,true);
f.update('racing');assert.equal(f.nodes.get('overlay').hidden,true);
f.update('finished');assert.equal(f.nodes.get('overlay').hidden,false);assert.equal(f.nodes.get('race-session-title').textContent,'레이스 완료');assert.equal(f.nodes.get('race-session-position').textContent,'P03');assert.equal(f.nodes.get('race-session-best').textContent,formatTime(f.race.classification.find(row=>row.id==='PLAYER').best));assert.equal(f.nodes.get('driver-count').textContent,'12');assert.equal(f.nodes.get('race-session-gearbox').hidden,true);
f.nodes.get('race-session-start').focus();f.trace.length=0;f.click('race-session-start');assert.equal(f.race.state,'countdown');assert.ok(f.trace.indexOf('race-reset')<f.trace.indexOf('start'));assert.equal(document.activeElement,null);f.update();assert.equal(f.nodes.get('overlay').hidden,true);
console.log('PASS: dedicated results without circuit cards, correct lap/rank values, transmission settings, and results restart directly into countdown');
for(const id of['restart','pause-restart']){
 f.update('racing',id==='pause-restart');f.game.paused=true;f.trace.length=0;f.click(id);assert.equal(f.race.state,'countdown');assert.equal(f.game.paused,false);assert.equal(f.game.accumulator,0);assert.ok(f.trace.includes('clear-input'));assert.ok(f.trace.indexOf('race-reset')<f.trace.indexOf('start'));f.update();assert.equal(f.nodes.get('overlay').hidden,true);
}
f.update('finished');f.hud.startSelectedCircuit();assert.equal(f.race.state,'countdown');console.log('PASS: footer, pause and Enter restarts reset once and start the signal without reopening any main/legacy menu');
f=fixture();f.update('finished');f.click('race-session-menu');assert.equal(new URL(f.navigation).searchParams.get('circuit'),'silverstone');assert.equal(new URL(f.navigation).searchParams.has('race'),false);assert.equal(f.game.changingCircuit,true);assert.equal(f.game.paused,true);assert.ok(f.trace.includes('silence'));assert.equal(f.nodes.get('race-session-title').textContent,'화면 전환 중');assert.equal(f.nodes.get('race-session-results').hidden,true);assert.equal(f.nodes.get('race-session-start').disabled,true);assert.ok(!f.root.innerHTML.includes('circuit-card'));
const previous=f.trace.length;f.hud.startSelectedCircuit();assert.equal(f.trace.length,previous);console.log('PASS: finished-to-main navigation requests the real title entry with a compact loading state, silences play and blocks stale start actions');

f=fixture();f.update('finished');assert.equal(f.nodes.get('race-session-details').hidden,false);assert.ok(f.nodes.get('race-session-classification').innerHTML.includes('미완료'));assert.ok(f.nodes.get('race-session-classification').innerHTML.includes('NOVA'));assert.ok(f.nodes.get('race-session-note').textContent.includes('진행 거리순'));assert.equal(f.nodes.get('race-session-record').hidden,true);assert.ok(f.nodes.get('race-session-delta').textContent.startsWith('+'));assert.equal(f.nodes.get('race-session-previous').textContent,'이전 1:25.125');assert.ok(f.nodes.get('race-session-fastest').textContent.startsWith('NOVA'));assert.equal((f.nodes.get('race-session-laps').innerHTML.match(/class="player-lap/g)??[]).length,3);
f=fixture();f.race.bestAtStart=90;f.update('finished');assert.equal(f.nodes.get('race-session-record').hidden,false);assert.equal(f.nodes.get('race-session-record').textContent,'새 개인 최고 기록');assert.ok(f.nodes.get('race-session-delta').textContent.startsWith('−'));f.update('ready');assert.equal(f.nodes.get('race-session-details').hidden,true);assert.equal(f.nodes.get('race-session-record').hidden,true);
console.log('PASS: complete twelve-car results/lap history, honest unfinished status, historical PB delta and new-record/reset states');

f=fixture();f.race.elapsed=10;f.race.intervals={ahead:{id:'ai:near',name:'NEAR',seconds:1,laps:0}};f.race.opponents=[{id:'ai:near',name:'NEAR',car:{position:{x:-3,z:-2},offRoad:false},agent:{intent:'prepare',target:f.vehicle}}];f.update('racing');assert.equal(f.nodes.get('battle-left').hidden,false);assert.equal(f.nodes.get('battle-right').hidden,true);assert.match(f.nodes.get('battle-message').textContent,/NEAR.*추월 준비/);f.race.elapsed=12;f.race.intervals.ahead.seconds=.6;f.update();assert.equal(f.nodes.get('trend-ahead').textContent,'간격 감소');f.race.opponents=[];f.race.elapsed=14;f.update();assert.equal(f.nodes.get('battle-left').hidden,true);assert.equal(f.nodes.get('battle-radio').hidden,true);f.update('finished');assert.equal(f.nodes.get('trend-ahead').textContent,'');assert.equal(f.nodes.get('battle-radio').hidden,true);
console.log('PASS: HUD binds physical-side indicators, contextual radio, same-car interval trends and clears race cues on results');
