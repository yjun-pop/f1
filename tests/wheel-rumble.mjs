import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const cache=new Map();
function moduleURL(name){
 if(cache.has(name))return cache.get(name);
 let js=ts.transpileModule(fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 js=js.replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
 const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
const {USBWheel,xbox360Interface,decodeXbox360}=await import(moduleURL('USBWheel')),{WheelInput}=await import(moduleURL('WheelInput'));
const alt={alternateSetting:0,interfaceClass:0xff,interfaceSubclass:0x5d,interfaceProtocol:1,endpoints:[{endpointNumber:2,direction:'in',type:'interrupt',packetSize:32},{endpointNumber:2,direction:'out',type:'interrupt',packetSize:32}]};
const configs=[{configurationValue:2,interfaces:[{interfaceNumber:3,alternate:alt,alternates:[alt]}]}];
function device(configurations=configs){
 let pending;const d={vendorId:0x1234,productId:0x5678,productName:'Wired Wheel',manufacturerName:'Test',opened:false,configurations,configuration:null,opens:0,closes:0,claims:[],writes:0,reads:0,
  async open(){this.opens++;this.opened=true;},async close(){this.closes++;this.opened=false;if(pending){pending.reject(new Error('closed'));pending=undefined;}},
  async selectConfiguration(value){this.configuration=this.configurations.find(c=>c.configurationValue===value);},async claimInterface(number){this.claims.push(number);},async selectAlternateInterface(number,setting){this.alt=[number,setting];},
  transferIn(endpoint,bytes){assert.equal(endpoint,2);assert.equal(bytes,32);assert.equal(pending,undefined,'There must be only one pending input request');this.reads++;return new Promise((resolve,reject)=>{pending={resolve,reject};});},
  emit(data,status='ok'){assert.ok(pending,'A read must be pending');const p=pending;pending=undefined;p.resolve({status,data});},fail(error=new Error('unplugged')){const p=pending;pending=undefined;p.reject(error);},
  transferOut(){this.writes++;throw new Error('Output is forbidden');},controlTransferOut(){this.writes++;throw new Error('Output is forbidden');},
 };return d;
}
function api(d,granted=[]){const listeners=new Map();return {requests:0,requestDevice(options){this.requests++;assert.deepEqual(options.filters,[{vendorId:0x0079,productId:0x189c}]);return Promise.resolve(d);},async getDevices(){return granted;},addEventListener(type,fn){listeners.set(type,fn);},disconnect(device){device.opened=false;listeners.get('disconnect')?.({device});},connect(device){listeners.get('connect')?.({device});}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function packet({x=0,y=0,rx=0,ry=0,gas=0,brake=0,flags=0}={}){const a=new Uint8Array(20),d=new DataView(a.buffer);a[1]=20;d.setUint16(2,flags,true);a[4]=brake;a[5]=gas;for(const [offset,value] of [[6,x],[8,y],[10,rx],[12,ry]])d.setInt16(offset,value,true);return d;}
const {RumbleOutput,WheelHaptics,rumbleFor}=await import(moduleURL('WheelRumble'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const known=device();known.vendorId=0x0079;known.productId=0x189c;
const written=[];known.transferOut=async function(endpoint,data){assert.equal(endpoint,2);assert.equal(this.opened,true);written.push([...data]);return {status:'ok',bytesWritten:data.length};};
const transport=new USBWheel(api(known));await transport.request();const pad=transport.devices[0];
assert.equal(rumbleFor(pad),undefined,'No vibration before a complete input report');assert.equal(written.length,0,'Connecting must not start motors');
known.emit(packet());await settle();const output=rumbleFor(pad);assert.ok(output?.available);
await output.play(.5,.25,15);assert.deepEqual(written[0],[0,8,0,128,64,0,0,0]);
await wait(30);assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0],'An unattended effect must end with a neutral packet');
await output.play(Infinity,-5,15);assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0]);
await output.play(2,1,15);assert.deepEqual(written.at(-1),[0,8,0,255,255,0,0,0]);await output.stop();
console.log('PASS: known Wired Wheel routes exact bounded XInput rumble packets only after valid input, with an independent stop watchdog');

const queue=[];let release;
const serialized=new RumbleOutput('usb',async(s,w)=>{queue.push([s,w]);if(queue.length===1)await new Promise(resolve=>{release=resolve;});});
const first=serialized.play(.4,.2);serialized.play(.8,.7);const stopping=serialized.stop();release();await first;await stopping;
assert.deepEqual(queue,[[.4,.2],[0,0]],'A queued stop must supersede stale effects after an in-flight write');
const race=[];const microtask=new RumbleOutput('usb',async(s,w)=>{race.push([s,w]);});
await microtask.play(.5,.3).then(()=>microtask.stop());assert.deepEqual(race.at(-1),[0,0]);
let failures=0;const faulty=new RumbleOutput('usb',async()=>{failures++;throw new Error('USB stalled');});await faulty.play(.5,.5);
assert.ok(faulty.error.includes('stalled'));assert.equal(failures,2);await faulty.play(.8,.8);assert.equal(failures,2,'Failed output must not retry motor effects forever');
console.log('PASS: serialized/coalesced writes, stop precedence, promise completion race, bounded error handling and no stale motor restart');

const engine={gear:3,load:.7},feedback={kerb:0,engine},car={speed:60,distance:1,lateralSpeed:0,brake:0,offRoad:false,impactSerial:0,impactStrength:0};
const haptics=new WheelHaptics();haptics.setStrength(1);const unchanged=JSON.stringify(car);
haptics.update(pad,car,feedback,.06,true);await settle();const base=written.at(-1);
assert.ok(base[4]>0);haptics.update(pad,car,{...feedback,engine:{...engine,gear:4}},1/60,true);await settle();const shift=written.at(-1);assert.ok(shift[3]>base[3]+90,'A gear change must produce an immediate motor pulse');
haptics.stop();await settle();haptics.update(pad,car,{...feedback,kerb:1},.06,true);await settle();const kerb=written.at(-1);assert.ok(kerb[3]>base[3]+70&&kerb[4]>base[4]+70);
haptics.stop();await settle();haptics.update(pad,car,feedback,.06,true);await settle();haptics.update(pad,{...car,impactSerial:1,impactStrength:10},feedback,1/60,true);await settle();assert.ok(written.at(-1)[3]>120,'A measured physical impact must trigger rumble');
haptics.update(pad,car,feedback,.06,false);await settle();assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0]);
haptics.update(pad,car,feedback,.06,true);await settle();haptics.setStrength(0);await settle();assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0]);
const silentCount=written.length;for(let i=0;i<120;i++)haptics.update(pad,car,feedback,1/60,true);await settle();assert.equal(written.length,silentCount);
assert.equal(JSON.stringify(car),unchanged,'Vibration may not mutate physics');
console.log('PASS: real gear/kerb/impact telemetry drives different effects, strength zero and pause stop motors, with unchanged vehicle physics');

const nativeWrites=[];const actuator={type:'dual-rumble',async playEffect(type,effect){nativeWrites.push({type,...effect});return 'complete';},async reset(){nativeWrites.push('stop');return 'complete';}};
const native={id:'native wheel',index:0,connected:true,mapping:'standard',axes:[0],buttons:[],vibrationActuator:actuator};
const n=rumbleFor(native);assert.ok(n?.available);await n.play(.3,.2,40);assert.deepEqual(nativeWrites[0],{type:'dual-rumble',duration:40,startDelay:0,strongMagnitude:.3,weakMagnitude:.2});await n.stop();assert.equal(nativeWrites.at(-1),'stop');
assert.equal(rumbleFor({...native,vibrationActuator:{...actuator,type:'vibration'}}),undefined);
const unsupported=device();const u=new USBWheel(api(unsupported));await u.request();unsupported.emit(packet());await settle();assert.equal(rumbleFor(u.devices[0]),undefined);await u.disconnect();assert.equal(unsupported.writes,0,'Unknown USB identities must never receive guessed output');
const inputOnly=device([{configurationValue:1,interfaces:[{interfaceNumber:0,alternate:{...alt,endpoints:alt.endpoints.filter(e=>e.direction==='in')},alternates:[{...alt,endpoints:alt.endpoints.filter(e=>e.direction==='in')}]}]}]);inputOnly.vendorId=0x0079;inputOnly.productId=0x189c;const io=new USBWheel(api(inputOnly));await io.request();assert.equal(io.devices[0].rumble,undefined);await io.disconnect();
console.log('PASS: native dual-rumble uses the declared browser actuator; unknown USB, unsupported actuators and input-only interfaces remain output-free');

haptics.setStrength(.6);const firstPreview=haptics.test(pad);await settle();assert.ok(written.at(-1)[3]>0);
known.emit(new DataView(Uint8Array.from([0,20,0]).buffer));await settle();assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0]);assert.equal(rumbleFor(pad),undefined);haptics.stop();assert.equal(await firstPreview,false);
known.emit(packet());await settle();const unplugPreview=haptics.test(pad);await settle();await transport.disconnect();haptics.stop();assert.equal(await unplugPreview,false);assert.equal(known.opened,false);assert.deepEqual(written.at(-1),[0,8,0,0,0,0,0,0],'Disconnect must stop before closing its interface');haptics.stop();
const events=new Map();globalThis.window={addEventListener:(name,fn)=>events.set(name,fn)};
const focused=new WheelHaptics();const blurPreview=focused.test(native);await settle();events.get('blur')();await settle();assert.equal(await blurPreview,false);assert.equal(nativeWrites.at(-1),'stop');const pagePreview=focused.test(native);await settle();events.get('pagehide')();await settle();assert.equal(await pagePreview,false);assert.equal(nativeWrites.at(-1),'stop');
console.log('PASS: malformed input, explicit disconnect, lost focus and page exit cancel both gameplay and preview effects before stale effects can resume');

const failedDevice=device();failedDevice.vendorId=0x0079;failedDevice.productId=0x189c;failedDevice.transferOut=async()=>({status:'stall'});
const failedTransport=new USBWheel(api(failedDevice));await failedTransport.request();failedDevice.emit(packet());await settle();await failedTransport.devices[0].rumble.play(.4,.3);assert.equal(failedTransport.devices[0].inputsReady,true);assert.ok(failedTransport.diagnostics.devices[0].rumble.error.includes('stall'));failedDevice.emit(packet({x:32767}));await settle();assert.equal(failedTransport.devices[0].axes[0],1,'Output failure must preserve valid wheel input');await failedTransport.disconnect();
const hungDevice=device();hungDevice.vendorId=0x0079;hungDevice.productId=0x189c;let finishOutput;hungDevice.transferOut=()=>new Promise(resolve=>{finishOutput=resolve;});
const hungTransport=new USBWheel(api(hungDevice));await hungTransport.request();hungDevice.emit(packet());await settle();const hungPad=hungTransport.devices[0];void hungPad.rumble.play(.4,.3);await hungTransport.disconnect();assert.equal(hungDevice.opened,false);assert.equal(hungTransport.devices.length,0);finishOutput({status:'ok',bytesWritten:8});await settle();assert.equal(hungPad.rumble.available,false);
console.log('PASS: USB rumble transfer failure preserves live steering input, and a stuck output cannot block explicit disconnect or restart stale motors');

const deferred=[],browserEvents=[];
const slowNative={...native,id:'Slow native',vibrationActuator:{type:'dual-rumble',playEffect(type,params){browserEvents.push(params);return new Promise(resolve=>deferred.push(resolve));},async reset(){browserEvents.push('stop');return 'complete';}}};
const preempt=rumbleFor(slowNative);await preempt.play(.8,.2);await preempt.play(.2,.8);assert.equal(browserEvents.length,2,'A browser effect completion promise must not delay the next motor pulse');await preempt.stop();assert.equal(browserEvents.at(-1),'stop','Native stop must be issued before old effect promises finish');deferred[0]('preempted');deferred[1]('complete');await settle();assert.equal(preempt.error,'');
const rejectedNative={...native,id:'Rejected native',vibrationActuator:{type:'dual-rumble',async playEffect(){return 'not-supported';},async reset(){return 'complete';}}};const rejectedOutput=rumbleFor(rejectedNative);await rejectedOutput.play(.5,.5);await settle();assert.ok(rejectedOutput.error);assert.equal(rejectedOutput.available,false);
const doubleEvents=[];const doublePad={...native,id:'Two-pulse native',vibrationActuator:{type:'dual-rumble',async playEffect(type,params){doubleEvents.push(params);return 'complete';},async reset(){doubleEvents.push('stop');return 'complete';}}};
const double=new WheelHaptics();double.setStrength(.6);assert.equal(await double.test(doublePad),true);const doublePulses=doubleEvents.filter(e=>e!=='stop');assert.equal(doublePulses.length,2);assert.ok(doublePulses.every(e=>e.duration===250&&e.strongMagnitude>.5&&e.strongMagnitude<=.6&&e.weakMagnitude>.5));assert.equal(doubleEvents.at(-1),'stop');assert.equal(rumbleFor(doublePad).diagnostics.nonzero,2);assert.equal(rumbleFor(doublePad).diagnostics.stopReason,'테스트 완료');
const cancelled=double.test(doublePad);await settle();double.stop('설정 창 닫힘');await cancelled;const count=doubleEvents.length;await wait(450);assert.equal(doubleEvents.length,count,'A cancelled multi-pulse test must never issue its second pulse');assert.equal(rumbleFor(doublePad).diagnostics.stopReason,'설정 창 닫힘');
console.log('PASS: native effects preempt without awaiting physical completion, async unsupported results surface, and two clear test pulses cancel without stale restarts');

function capabilityWheel(){const d=device();d.vendorId=0x0079;d.productId=0x189c;d.transferOut=async(endpoint,data)=>({status:'ok',bytesWritten:data.length});return d;}
function motorReply(left,right){const bytes=Uint8Array.from([0,8,0,left,right,0,0,0]);const storage=new Uint8Array(14);storage.set(bytes,3);return {status:'ok',data:new DataView(storage.buffer,3,8)};}
const capDevice=capabilityWheel();let capabilityCalls=0,resolveCapability;
capDevice.controlTransferIn=(setup,length)=>{capabilityCalls++;assert.deepEqual(setup,{requestType:'vendor',recipient:'interface',request:1,value:0,index:3});assert.equal(length,8);return new Promise(resolve=>{resolveCapability=resolve;});};
const capTransport=new USBWheel(api(capDevice));await capTransport.request();capDevice.emit(packet());await settle();const capID=capTransport.devices[0].id;
const capOne=capTransport.checkRumbleCapabilities(capID),capTwo=capTransport.checkRumbleCapabilities(capID);assert.equal(capabilityCalls,1);assert.equal(capTransport.rumbleCapabilities(capID).state,'reading');resolveCapability(motorReply(255,128));const caps=await capOne;await capTwo;assert.equal(caps.advertised,true);assert.equal(caps.strong,255);assert.equal(caps.weak,128);assert.equal(capTransport.devices[0].inputsReady,true);assert.equal(capTransport.devices[0].rumble.diagnostics.writes,0,'Capability lookup must not write any motor commands');assert.equal(capTransport.diagnostics.devices[0].rumble.capabilities.state,'reported');await capTransport.checkRumbleCapabilities(capID);assert.equal(capabilityCalls,1,'Static capabilities should be read only once per connection');await capTransport.disconnect();
for(const [reply,state] of [[motorReply(0,0),'reported'],[{status:'stall'},'unavailable'],[{status:'ok',data:new DataView(new ArrayBuffer(4))},'invalid']]){
 const d=capabilityWheel();d.controlTransferIn=async()=>reply;const t=new USBWheel(api(d));await t.request();d.emit(packet());await settle();const id=t.devices[0].id,cap=await t.checkRumbleCapabilities(id);assert.equal(cap.state,state);if(state==='reported')assert.equal(cap.advertised,false,'A zero advertisement is recorded separately from proven lack of physical motors');assert.equal(t.devices[0].inputsReady,true);assert.equal(t.devices[0].rumble.available,true,'Unknown capability information must not disable manual rumble or steering');await t.disconnect();
}
const silentDevice=capabilityWheel();let silentCalls=0;silentDevice.controlTransferIn=()=>{silentCalls++;return new Promise(()=>{});};const silentTransport=new USBWheel(api(silentDevice));await silentTransport.request();silentDevice.emit(packet());await settle();const silentID=silentTransport.devices[0].id;assert.equal((await silentTransport.checkRumbleCapabilities(silentID)).state,'timeout');await silentTransport.checkRumbleCapabilities(silentID);assert.equal(silentCalls,1,'An unanswered control read must not create an unbounded queue');assert.equal(silentTransport.devices[0].inputsReady,true);await silentTransport.disconnect();
const errorDevice=capabilityWheel();errorDevice.controlTransferIn=async()=>{throw new Error('Control read rejected');};const errorTransport=new USBWheel(api(errorDevice));await errorTransport.request();errorDevice.emit(packet());await settle();assert.equal((await errorTransport.checkRumbleCapabilities(errorTransport.devices[0].id)).state,'error');assert.equal(errorTransport.devices[0].inputsReady,true);await errorTransport.disconnect();
let finishProbe;const probeGate=new Promise(resolve=>{finishProbe=resolve;});const beforeCount=doubleEvents.length,probing=double.test(doublePad,()=>probeGate);await settle();assert.equal(doubleEvents.length,beforeCount,'A gated test must await its read-only preflight');double.stop('지원 조회 중 창 닫힘');finishProbe();assert.equal(await probing,false);assert.equal(doubleEvents.length,beforeCount,'Closing during preflight must not start motors when the query finishes');
console.log('PASS: documented read-only XInput motor capability query, byte offsets, cached/deduplicated reads, zero/invalid/stalled/error/timeout responses and safe cancellation during preflight');
