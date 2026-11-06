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

const {GraphicsQuality,renderPixelRatio}=await import(moduleURL('Graphics'));
const {ShadowBudget}=await import(moduleURL('ShadowBudget'));
const {RacingLine}=await import(moduleURL('RacingLine'));
const {Game}=await import(moduleURL('Game'));
const {DrivingAudio}=await import(moduleURL('DrivingAudio'));
globalThis.window={innerWidth:1280,innerHeight:720,devicePixelRatio:1};
const quality=new GraphicsQuality('auto','high');let changes=0;
for(let i=0;i<50*3;i++)changes+=quality.observe(1/50,true)?1:0;
assert.equal(quality.tier,'high');assert.ok(quality.renderScale<1&&changes>0,'Moderate pressure should reduce pixel work before roadside detail');
const ratio=renderPixelRatio(1,1280,720,quality.tier,quality.renderScale);
for(let i=0;i<50*15;i++)quality.observe(1/50,true);
assert.ok(renderPixelRatio(1,1280,720,quality.tier,quality.renderScale)<=ratio,'Persistent load must not raise pixel work while reducing tiers');
quality.select('high');for(let i=0;i<200;i++)quality.observe(1/20,true);assert.equal(quality.renderScale,1);assert.equal(quality.tier,'high');
let pixels=0,resizes=0,mirrorResizes=0;
const fake={appliedTier:'medium',graphics:{tier:'medium',mode:'auto',renderScale:.9},renderer:{getPixelRatio:()=>1,setPixelRatio:()=>pixels++,setSize:()=>resizes++},mirror:{resize:()=>mirrorResizes++},hud:{setGraphics(){}}};
Game.prototype.applyGraphics.call(fake,false);assert.equal(pixels,1);assert.equal(resizes,0);assert.equal(mirrorResizes,0);
Game.prototype.applyGraphics.call(fake,true);assert.equal(resizes,1);assert.equal(mirrorResizes,1);
console.log('PASS: pixel-first moderate adaptation, bounded persistent load, manual quality and resolution-only changes without reflection/mirror/scenery rebuilds');

let guidanceCalls=0;const line=Object.create(RacingLine.prototype);
Object.assign(line,{visible:true,updateAge:Infinity,instruction:'ACCELERATE',zones:[],engagedZone:-1,track:{length:1000},planner:{guidance:()=>{guidanceCalls++;return {target:30,cue:null};}},ribbon:{visible:false,geometry:{setDrawRange(){}}},markers:{visible:false,count:0}});
const car={progress:.1,speed:50,kmh:180,offRoad:false};
for(let i=0;i<120;i++)line.update(car,1/120);assert.ok(guidanceCalls>=60&&guidanceCalls<=61);
const previous=guidanceCalls;line.visible=false;for(let i=0;i<120;i++)line.update(car,1/120);assert.equal(guidanceCalls,previous);assert.equal(line.ribbon.visible,false);line.toggle();line.update(car,1/120);assert.equal(guidanceCalls,previous+1);line.update(car);assert.equal(guidanceCalls,previous+2);
const shadows=new ShadowBudget(),light=new THREE.Vector3(-85,50,-77);let refreshes=0;
for(let i=0;i<120;i++)refreshes+=shadows.shouldRefresh(new THREE.Vector3(i*.1,0,0),light,true,1/120)?1:0;
assert.ok(refreshes>=60&&refreshes<=61);shadows.invalidate();assert.equal(shadows.shouldRefresh(new THREE.Vector3(12,0,0),light,true,0),true);assert.equal(shadows.shouldRefresh(new THREE.Vector3(1000,0,0),light,true,0),true);
console.log('PASS: 60Hz visible line/shadow updates at 120Hz simulation, no hidden guidance work, immediate re-enable, shadow invalidation and teleport refresh');

let automation=0,advances=0;const param=()=>({setTargetAtTime(){automation++;}}),gain=()=>({gain:param()});
const player={position:new THREE.Vector3(),heading:0,speed:60,throttle:1,brake:0,gripUsage:.5,lateralSpeed:0,offRoad:false};
const rival={...player,position:new THREE.Vector3(20,0,0)};
const voice=car=>({car,state:{advance:()=>{advances++;return {rpm:11000,load:1,cut:1,blip:0,engine:.1};}},low:{frequency:param()},high:{frequency:param()},lowGain:gain(),highGain:gain(),filter:{frequency:param()},turbo:{frequency:param()},turboGain:gain(),texture:gain(),previousCut:1,previousLoad:1,thump:0,body:{frequency:param()},bodyGain:gain(),pulse:{frequency:param()},pulseDepth:gain(),gain:gain(),pan:{pan:param()}});
const audio=new DrivingAudio(),own=voice(player),other=voice(rival);Object.assign(audio,{context:{currentTime:.1},active:true,lastUpdate:0,voices:[own,other],kerb:gain(),brake:gain(),tire:gain(),road:gain()});
audio.update(player,true);assert.equal(advances,2);rival.position.x=220;audio.update(player,true);assert.equal(other.sleeping,true);const atSleep=advances;audio.update(player,true);assert.equal(advances,atSleep+1,'Only the audible player voice needs telemetry');rival.position.x=165;audio.update(player,true);assert.equal(other.sleeping,true);rival.position.x=150;audio.update(player,true);assert.equal(other.sleeping,false);
audio.toggleMute();const silent=automation;audio.update(player,true);assert.equal(automation,silent);audio.toggleMute();audio.update(player,true);assert.ok(automation>silent);
console.log('PASS: inaudible rivals fade once, distance hysteresis, nearby voice restoration and no muted AudioParam automation');

const {TrafficPlanner}=await import(moduleURL('TrafficPlanner'));
let geometryCalls=0;
const straight={length:1000,point:t=>{geometryCalls++;return new THREE.Vector3(0,0,t*1000);},normal:()=>{geometryCalls++;return new THREE.Vector3(1,0,0);},tangent:()=>new THREE.Vector3(0,0,1),drivingBounds:()=>({min:-7.1,max:7.1})};
const ownCar={...player,position:new THREE.Vector3(),speed:60,progress:0,distance:0,gripScale:1.4,gripUsage:.2},blocker={...ownCar,position:new THREE.Vector3(0,0,35),progress:.035,speed:0,offRoad:true};
const planner=new TrafficPlanner(straight,{aggression:.7,caution:.5,lineBias:.2,phase:2},{point:t=>new THREE.Vector3(0,0,t*1000)});
const route=planner.update(ownCar,[{car:blocker,position:blocker.position.clone(),progress:.035,speed:0,heading:0,velocity:new THREE.Vector3(),offRoad:true}],20,70,true);assert.ok(route);
const t=.007123,point=route.point(t),expected=point.clone(),afterFirst=geometryCalls;point.set(1e6,0,1e6);
for(let i=0;i<20;i++)assert.ok(route.point(t).distanceTo(expected)<1e-10);
assert.equal(geometryCalls,afterFirst,'Repeated corridor samples must reuse immutable geometry while returning owned vectors');
console.log('PASS: cached corridor geometry is reused without exposing mutable cached positions or changing the observed car');
