import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const cache=new Map(),threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  let js=ts.transpileModule(fs.readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const folder=name.slice(0,name.lastIndexOf('/'));
  js=js.replace(/import '\.\/[^']+\.css';/g,'').replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`).replace(/from 'three'/g,`from '${threeURL}'`);
  js=js.replace(/from '\.\.\/(game|ui)\/(\w+)'/g,(_,dir,dep)=>`from '${moduleURL(dir+'/'+dep)}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(folder+'/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
const {WheelInput,validWheelProfile,steeringValue,pedalValue,changedPedal,WHEEL_STORAGE_KEY}=await import(moduleURL('game/WheelInput'));
const clone=value=>JSON.parse(JSON.stringify(value));
const profile=()=>({version:1,deviceId:'USB Racing Wheel',pedalDeviceId:'USB Racing Wheel',enabled:true,steering:{axis:0,center:0,left:-1,right:1},throttle:{source:'axis',index:1,rest:1,full:-1},brake:{source:'axis',index:2,rest:1,full:-1},buttons:{shiftDown:0,shiftUp:1,boost:2,drs:3,pause:4,camera:5},deadzone:.02,sensitivity:1});
const pad=(id='USB Racing Wheel',index=0,axes=[0,1,1])=>({id,index,connected:true,axes:[...axes],buttons:Array.from({length:12},()=>({pressed:false,value:0}))});
const button=(p,index,down)=>{p.buttons[index]={pressed:down,value:down?1:0};};
function fixture(p=profile(),device=pad()){
  let devices=[device];const saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},wheel=new WheelInput(()=>devices,storage);wheel.save(p);
  return {wheel,device,storage,saved,setDevices:value=>devices=value};
}
assert.equal(validWheelProfile(profile()),true);
for(const mutate of [p=>p.steering.right=-.4,p=>p.steering.axis=NaN,p=>p.throttle.full=p.throttle.rest,p=>p.brake.index=1,p=>p.buttons.shiftUp=0,p=>p.deadzone=.9,p=>p.sensitivity=Infinity,p=>p.deviceId='',p=>p.deviceIndex=-1]){const p=profile();mutate(p);assert.equal(validWheelProfile(p),false);}
const cleanStorage={getItem:()=>'{broken',setItem:()=>{}};assert.equal(new WheelInput(()=>[],cleanStorage).profile,undefined);
console.log('PASS: versioned calibration validation rejects corrupt ranges, duplicate controls, non-finite values and malformed storage');

const calibrated=profile();calibrated.steering={axis:0,center:.1,left:-.7,right:.9};
assert.equal(steeringValue(.1,calibrated),0);assert.equal(steeringValue(-.7,calibrated),1);assert.equal(steeringValue(.9,calibrated),-1);assert.equal(steeringValue(.11,calibrated),0);
assert.ok(steeringValue(-.3,calibrated)>.47&&steeringValue(-.3,calibrated)<.51);
assert.equal(pedalValue(1,calibrated.throttle),0);assert.equal(pedalValue(-1,calibrated.throttle),1);assert.equal(pedalValue(0,calibrated.throttle),.5);
assert.deepEqual(changedPedal([0,1,1],[0,-1,1],[],[],0),calibrated.throttle);
assert.deepEqual(changedPedal([0],[0],[0,0],[0,1],0),{source:'button',index:1,rest:0,full:1});
console.log('PASS: asymmetric steering, left/right convention, deadzone, inverted pedals and axis/analog-trigger calibration');

const f=fixture();assert.equal(f.wheel.poll(),false);assert.equal(f.wheel.armed,true);
f.device.axes=[-.51,0,.5];f.wheel.poll();assert.ok(f.wheel.controls.steer>.49);assert.equal(f.wheel.controls.throttle,.5);assert.equal(f.wheel.controls.brake,.25);
button(f.device,1,true);f.wheel.poll();f.wheel.poll();assert.equal(f.wheel.consume('shiftUp'),true);assert.equal(f.wheel.consume('shiftUp'),false);
for(let i=0;i<144;i++)f.wheel.poll();assert.equal(f.wheel.consume('shiftUp'),false);
button(f.device,1,false);f.wheel.poll();button(f.device,1,true);f.wheel.poll();assert.equal(f.wheel.consume('shiftUp'),true);
button(f.device,2,true);f.wheel.poll();assert.equal(f.wheel.controls.boost,true);
console.log('PASS: analog pedal overlap, proportional steering, held ERS and exactly one paddle edge across multiple render/physics frames');

const held=fixture();held.device.axes[1]=-1;button(held.device,1,true);held.wheel.poll();assert.equal(held.wheel.controls,null);assert.equal(held.wheel.armed,false);
held.device.axes[1]=1;button(held.device,1,false);held.wheel.poll();assert.equal(held.wheel.armed,true);assert.equal(held.wheel.consume('shiftUp'),false);
held.device.axes[1]=-1;held.wheel.poll();assert.equal(held.wheel.controls.throttle,1);
held.setDevices([]);assert.equal(held.wheel.poll(),true);assert.equal(held.wheel.controls,null);assert.equal(held.wheel.down('boost'),false);assert.equal(held.wheel.poll(),false);
held.setDevices([pad('Other device',0)]);held.wheel.poll();assert.equal(held.wheel.controls,null,'A new device in the old USB/gamepad slot must never inherit controls');
held.device.index=3;held.setDevices([null,null,null,held.device]);held.wheel.poll();assert.equal(held.wheel.armed,false);held.device.axes[1]=1;held.wheel.poll();assert.equal(held.wheel.armed,true);
held.wheel.suspend();assert.equal(held.wheel.controls,null);assert.equal(held.wheel.consume('shiftUp'),false);
console.log('PASS: neutral arming, unplug loss signal, identity-based reconnection, index changes and no stale throttle/buttons');

const split=profile();split.pedalDeviceId='USB Pedals';split.throttle={source:'button',index:0,rest:0,full:1};split.brake={source:'button',index:1,rest:0,full:1};
const separate=fixture(split),pedals=pad('USB Pedals',2,[]);separate.setDevices([separate.device,null,pedals]);separate.wheel.poll();pedals.buttons[0].value=.7;pedals.buttons[1].value=.2;separate.wheel.poll();assert.equal(separate.wheel.controls.throttle,.7);assert.equal(separate.wheel.controls.brake,.2);
separate.setDevices([separate.device]);assert.equal(separate.wheel.poll(),true);
const same=profile();same.deviceId=same.pedalDeviceId='Identical USB interface';same.deviceIndex=0;same.pedalIndex=1;same.throttle={source:'axis',index:0,rest:1,full:-1};same.brake={source:'axis',index:1,rest:1,full:-1};
assert.ok(validWheelProfile(same));const identical=fixture(same,pad(same.deviceId,0,[0])),other=pad(same.deviceId,1,[1,1]);identical.setDevices([identical.device,other]);identical.wheel.poll();other.axes[0]=0;identical.wheel.poll();assert.equal(identical.wheel.controls.throttle,.5);assert.equal(identical.wheel.controls.steer,0);
console.log('PASS: separately connected pedal interfaces, analog trigger values, missing-pedal pause signal and duplicate-name device selection');

const combined=profile();combined.throttle={source:'axis',index:1,rest:0,full:1};combined.brake={source:'axis',index:1,rest:0,full:-1};assert.ok(validWheelProfile(combined));
const shared=fixture(combined,pad('USB Racing Wheel',0,[0,0]));shared.wheel.poll();shared.device.axes[1]=.5;shared.wheel.poll();assert.equal(shared.wheel.controls.throttle,.5);assert.equal(shared.wheel.controls.brake,0);shared.device.axes[1]=-.8;shared.wheel.poll();assert.equal(shared.wheel.controls.throttle,0);assert.equal(shared.wheel.controls.brake,.8);
shared.wheel.configuring=true;shared.wheel.poll();assert.equal(shared.wheel.controls,null);assert.equal(shared.wheel.consume('shiftDown'),false);
const unavailable=new WheelInput(()=>{throw new Error('Permissions Policy');},cleanStorage);assert.doesNotThrow(()=>unavailable.poll());assert.equal(unavailable.supported,false);
const volatile=fixture(),blocked=new WheelInput(()=>[volatile.device],{getItem:()=>null,setItem:()=>{throw new Error('blocked');}});assert.equal(blocked.save(profile()),false);blocked.poll();assert.equal(blocked.armed,true);
const restored=new WheelInput(()=>[volatile.device],volatile.storage);restored.poll();assert.equal(restored.profile.deviceId,'USB Racing Wheel');restored.save({...restored.profile,enabled:false});restored.poll();assert.equal(restored.controls,null);
console.log('PASS: combined-pedal axis, calibration isolation, unsupported/blocked APIs, durable profiles and session-only storage fallback');

globalThis.window={innerWidth:1280,innerHeight:720,addEventListener:()=>{}};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {Input}=await import(moduleURL('game/Input')),{Track}=await import(moduleURL('game/Track')),{Vehicle}=await import(moduleURL('game/Vehicle'));
const events=new Map();window.addEventListener=(name,fn)=>events.set(name,fn);
const driver=fixture(),input=new Input(driver.wheel),track=new Track(new THREE.Scene()),car=new Vehicle(track,new THREE.Scene());input.poll();driver.device.axes=[-.4,0,.5];input.poll();
const realDrive=car.drive.bind(car);let controls;car.drive=(dt,value)=>controls=value;car.update(1/120,input);
assert.equal(controls.throttle,.5);assert.equal(controls.brake,.25);assert.equal(controls.keyboard,false);assert.ok(controls.steer>.38&&controls.steer<.41);
const key=(code,focused=false)=>({code,repeat:false,target:{matches:()=>focused},preventDefault:()=>{}});
events.get('keydown')(key('KeyS'));car.update(1/120,input);assert.equal(controls.throttle,0);assert.equal(controls.brake,1);
events.get('keyup')(key('KeyS'));events.get('keydown')(key('KeyD'));car.update(1/120,input);assert.equal(controls.steer,-1);assert.equal(controls.keyboard,true);
input.clear();driver.device.axes=[0,1,1];input.poll();car.drive=realDrive;car.resetAt(400/track.length);driver.device.axes[1]=-1;input.poll();
for(let i=0;i<120;i++)car.update(1/120,input);assert.ok(car.speed>8);assert.equal(car.offRoad,false);
car.speed=25;driver.device.axes=[0,1,0];input.poll();for(let i=0;i<30;i++)car.update(1/120,input);assert.ok(car.speed<24);
car.setTransmissionMode('manual');driver.device.axes=[0,1,1];input.clear();input.poll();button(driver.device,1,true);input.poll();car.update(1/120,input);const gear=car.transmission.gear;assert.equal(gear,2);
for(let i=0;i<30;i++){input.poll();car.update(1/120,input);}assert.equal(car.transmission.gear,gear);
console.log('PASS: real Vehicle uses analog throttle/brake/steering, keyboard override, physical acceleration/braking and single manual paddle shifts');

const {Game}=await import(moduleURL('game/Game'));
let silenced=0;const loss=fixture(),raceInput=new Input(loss.wheel),session={input:raceInput,race:{state:'racing',elapsed:23},paused:false,accumulator:.01,audio:{silence:()=>silenced++},pause(){Game.prototype.pause.call(this);}};
Game.prototype.pollWheel.call(session);assert.equal(session.paused,false);loss.setDevices([]);Game.prototype.pollWheel.call(session);assert.equal(session.paused,true);assert.equal(session.accumulator,0);assert.equal(session.race.elapsed,23);assert.equal(silenced,1);assert.equal(raceInput.analog(),null);
loss.setDevices([loss.device]);Game.prototype.pollWheel.call(session);assert.equal(session.paused,true,'Reconnection must not resume the race automatically');session.paused=false;loss.wheel.configuring=true;Game.prototype.pollWheel.call(session);assert.equal(session.paused,true);
console.log('PASS: production Game pre-physics polling pauses a disconnected/configuring wheel, silences sound and freezes the race until explicit resume');

// Native dialog behavior is supplied by the browser. Exercise its actual event
// wiring and wizard using a minimal DOM adapter and simulated device snapshots.
let now=performance.now(),rafId=0;const frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++rafId,fn);return rafId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
function node(tag='div'){
 const events=new Map(),nodes=new Map();let html='';const el={tagName:tag.toUpperCase(),value:'',checked:false,disabled:false,hidden:false,open:false,textContent:'',children:[],attributes:{},
  setAttribute:(key,value)=>el.attributes[key]=value,addEventListener:(type,fn)=>{const list=events.get(type)??[];list.push(fn);events.set(type,list);},
  querySelector:selector=>nodes.get(selector.slice(1)),appendChild:child=>el.children.push(child),replaceChildren:(...children)=>el.children=children,focus:()=>{},
  emit(type){for(const fn of events.get(type)??[])fn({target:el,stopPropagation(){}});},click(){if(!el.disabled)el.emit('click');},showModal(){el.open=true;},close(){el.open=false;el.emit('close');},
  get innerHTML(){return html;},set innerHTML(value){html=value;for(const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const child=node(match[1]),attrs=match[2];child.value=/\bvalue="([^"]+)"/.exec(attrs)?.[1]??'';child.checked=/\bchecked\b/.test(attrs);child.hidden=/\bhidden\b/.test(attrs);child.disabled=/\bdisabled\b/.test(attrs);nodes.set(match[3],child);}}
 };return el;
}
globalThis.document={createElement:node,body:node('body')};
const {WheelSetup}=await import(moduleURL('ui/WheelSetup'));
const pump=()=>{now+=100;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(now);};
function wizard(device=pad()){const saved=new Map(),wheel=new WheelInput(()=>[device],{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)}),ui=new WheelSetup(wheel);ui.open();return {device,wheel,ui,saved,n:id=>ui.element.querySelector('#'+id)};}
function calibrate(w){
 w.n('wheel-calibrate').click();w.device.axes=[0,1,1];w.n('wheel-next').click();w.device.axes[0]=-.8;w.n('wheel-next').click();w.device.axes[0]=.9;w.n('wheel-next').click();w.device.axes=[0,1,1];w.n('wheel-next').click();w.device.axes[1]=-1;w.n('wheel-next').click();w.device.axes=[0,1,1];w.n('wheel-next').click();w.device.axes[2]=-1;w.n('wheel-next').click();w.device.axes=[0,1,1];pump();
}
const ui=wizard();assert.equal(ui.ui.element.tagName,'DIALOG');assert.equal(ui.n('wheel-save').disabled,true);calibrate(ui);assert.equal(ui.n('wheel-save').disabled,false);
button(ui.device,1,true);ui.n('wheel-bind-shiftUp').click();pump();assert.equal(ui.n('wheel-bind-shiftUp').textContent,'지정','Already held buttons must not accidentally bind');
button(ui.device,1,false);pump();button(ui.device,1,true);pump();assert.equal(ui.n('wheel-bind-shiftUp').textContent,'버튼 2');
button(ui.device,1,false);pump();ui.n('wheel-bind-shiftDown').click();button(ui.device,1,true);pump();assert.equal(ui.n('wheel-bind-shiftDown').textContent,'지정');assert.ok(ui.n('wheel-message').textContent.includes('사용 중'));
button(ui.device,1,false);pump();ui.n('wheel-save').click();assert.equal(ui.ui.element.open,false);assert.equal(ui.wheel.configuring,false);assert.equal(ui.wheel.profile.buttons.shiftUp,1);assert.equal(JSON.parse(ui.saved.get(WHEEL_STORAGE_KEY)).steering.left,-.8);
ui.ui.open();ui.n('wheel-deadzone').value='10';ui.n('wheel-close').click();assert.equal(ui.wheel.profile.deadzone,.02,'Closing must discard unsaved edits');
ui.ui.open();ui.n('wheel-keyboard').click();assert.equal(ui.wheel.profile.enabled,false);assert.equal(frames.size,0,'Closing settings must stop its polling loop');
console.log('PASS: complete seven-step settings workflow, live device selection, held-button learning, duplicate rejection, save/cancel and keyboard switch');

const trigger=wizard(pad('USB Racing Wheel',0,[0]));trigger.n('wheel-calibrate').click();trigger.n('wheel-next').click();trigger.device.axes[0]=-1;trigger.n('wheel-next').click();trigger.device.axes[0]=1;trigger.n('wheel-next').click();trigger.device.axes[0]=0;trigger.n('wheel-next').click();trigger.device.buttons[7].value=1;trigger.n('wheel-next').click();trigger.device.buttons[7].value=0;trigger.n('wheel-next').click();trigger.device.buttons[6].value=1;trigger.n('wheel-next').click();trigger.device.buttons[6].value=0;pump();trigger.n('wheel-save').click();
assert.equal(trigger.wheel.profile.throttle.source,'button');assert.equal(trigger.wheel.profile.throttle.index,7);assert.equal(trigger.wheel.profile.brake.index,6);
console.log('PASS: the real setup wizard detects analog-button pedals without assuming fixed wheel axis numbers');
