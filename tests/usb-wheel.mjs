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
assert.deepEqual(xbox360Interface(device()),{config:2,number:3,alternate:0,endpoint:2,bytes:32});
for(const change of [{interfaceClass:3},{interfaceProtocol:129},{interfaceSubclass:0x47},{endpoints:[{endpointNumber:2,direction:'out',type:'interrupt',packetSize:32}]}]){
 const a={...alt,...change};assert.throws(()=>xbox360Interface(device([{configurationValue:1,interfaces:[{interfaceNumber:0,alternate:a,alternates:[a]}]}])));
}
let state=decodeXbox360(packet({x:-32768,y:32767,gas:255,brake:128,flags:(1<<12)|(1<<9)|(1<<0)}));assert.deepEqual(state.axes,[-1,1,0,0]);assert.equal(state.buttons[7].value,1);assert.equal(state.buttons[6].value,128/255);assert.equal(state.buttons[0].pressed,true);assert.equal(state.buttons[5].pressed,true);assert.equal(state.buttons[12].pressed,true);
const offsetBuffer=new Uint8Array(24);offsetBuffer.set(new Uint8Array(packet({rx:32767}).buffer),3);assert.equal(decodeXbox360(new DataView(offsetBuffer.buffer,3,20)).axes[2],1);
assert.equal(decodeXbox360(new DataView(Uint8Array.from([3,3,0]).buffer)),null);assert.throws(()=>decodeXbox360(new DataView(new ArrayBuffer(1))));assert.throws(()=>decodeXbox360(new DataView(Uint8Array.from([0,20,0]).buffer)));
console.log('PASS: wired Xbox 360 interface validation, signed axes, trigger pressure, button flags, DataView offsets and rejection of wireless/HID/unknown reports');

const d=device(),transportAPI=api(d),usb=new USBWheel(transportAPI),selecting=usb.request();assert.equal(transportAPI.requests,1);assert.equal(await selecting,1);assert.equal(d.opens,1);assert.deepEqual(d.claims,[3]);assert.equal(usb.devices[0].inputsReady,false);
const pad=usb.devices[0],storage={getItem:()=>null,setItem:()=>{}},wheel=new WheelInput(()=>[],storage,undefined,usb);
const profile={version:1,deviceId:pad.id,pedalDeviceId:pad.id,deviceIndex:pad.index,pedalIndex:pad.index,enabled:true,steering:{axis:0,center:0,left:-1,right:1},throttle:{source:'button',index:7,rest:0,full:1},brake:{source:'button',index:6,rest:0,full:1},buttons:{shiftUp:5,shiftDown:4,boost:0,drs:1,pause:9,camera:8},deadzone:.02,sensitivity:1};
wheel.save(profile);wheel.poll();assert.equal(wheel.controls,null);d.emit(packet({gas:255,flags:1<<9}));await settle();wheel.poll();assert.equal(wheel.armed,false);d.emit(packet());await settle();wheel.poll();assert.equal(wheel.armed,true);assert.equal(wheel.consume('shiftUp'),false);
d.emit(packet({x:-32768,gas:255,brake:128,flags:(1<<9)|(1<<12)}));await settle();wheel.poll();assert.equal(wheel.controls.steer,1);assert.equal(wheel.controls.throttle,1);assert.equal(wheel.controls.brake,128/255);assert.equal(wheel.controls.boost,true);assert.equal(wheel.consume('shiftUp'),true);wheel.poll();assert.equal(wheel.consume('shiftUp'),false);assert.equal(d.writes,0);
console.log('PASS: explicit WebUSB permission, configuration/claim, actual USB receive loop and calibrated steering/pedals/paddle/ERS through production WheelInput');

d.emit(new DataView(Uint8Array.from([0,20,0]).buffer));await settle();assert.equal(wheel.poll(),true);assert.equal(wheel.controls,null);assert.equal(usb.devices[0].inputsReady,false);assert.equal(usb.diagnostics.devices[0].invalidReports,1);
d.emit(packet());await settle();wheel.poll();assert.equal(wheel.armed,true);d.fail();await settle();assert.equal(wheel.poll(),true);assert.equal(wheel.controls,null);assert.equal(usb.devices.length,0);assert.equal(d.opened,false);assert.ok(usb.diagnostics.lastError.includes('unplugged'));
const replug=device();transportAPI.connect(replug);await settle();assert.equal(replug.opens,1);assert.equal(usb.devices[0].inputsReady,false);assert.equal(usb.devices[0].id,pad.id);replug.emit(packet());await settle();wheel.poll();assert.equal(wheel.armed,true);
await usb.disconnect();transportAPI.connect(replug);await settle();assert.equal(usb.devices.length,0);assert.equal(replug.opens,1);assert.equal(replug.opened,false);assert.equal(replug.writes,0);
console.log('PASS: malformed USB packets and transfer errors clear controls, permitted replug requires fresh input, and explicit disconnect cancels the pending read');

const native={id:'Native gamepad',index:16,connected:true,mapping:'',axes:[0],buttons:[]},bothDevice=device(),bothUSB=new USBWheel(api(bothDevice));await bothUSB.request();const both=new WheelInput(()=>[native],storage,undefined,bothUSB);both.poll();assert.equal(new Set(both.devices.map(p=>p.index)).size,2);assert.equal(both.devices.find(p=>p.source==='usb').displayName,'Wired Wheel');
await bothUSB.disconnect();const unsupported=device([{configurationValue:1,interfaces:[]}]),invalidUSB=new USBWheel(api(unsupported));await assert.rejects(()=>invalidUSB.request());assert.equal(unsupported.opens,0);assert.equal(unsupported.writes,0);assert.equal(invalidUSB.diagnostics.selected.name,'Wired Wheel');assert.ok(invalidUSB.diagnostics.lastError.includes('FF/5D/01'));
const cancel=new USBWheel({requestDevice:async()=>{const e=new Error('Cancelled');e.name='NotFoundError';throw e;},getDevices:async()=>[]});assert.equal(await cancel.request(),0);
const restoredDevice=device(),restoreAPI=api(restoredDevice,[restoredDevice]),restored=new USBWheel(restoreAPI);await restored.restore();assert.equal(restoreAPI.requests,0);assert.equal(restoredDevice.opens,1);await restored.disconnect();await restored.restore();assert.equal(restoredDevice.opens,1);
console.log('PASS: native/WebUSB slot separation, unsupported selected-device diagnostics without claiming interfaces, chooser cancellation and permission-only restore');

const delayed=device();let finish;delayed.claimInterface=function(){return new Promise(resolve=>{finish=resolve;});};const delayedUSB=new USBWheel(api(delayed)),opening=delayedUSB.request();await settle();assert.equal(delayed.opened,true);await delayedUSB.disconnect();finish();assert.equal(await opening,0);assert.equal(delayedUSB.devices.length,0);assert.equal(delayed.opened,false);assert.equal(delayed.reads,0);
console.log('PASS: disconnect while claiming an interface closes the late handle without starting input or retaining stale controls');

// Descriptor fixture from a published lsusb report for 0079:189c. This is not a
// report captured from the user's physical wheel; packet data above is simulated.
const actualAlt={...alt,endpoints:[{endpointNumber:1,direction:'in',type:'interrupt',packetSize:32},{endpointNumber:2,direction:'out',type:'interrupt',packetSize:32}]};
const actualRoute=device([{configurationValue:1,interfaces:[{interfaceNumber:0,alternate:actualAlt,alternates:[actualAlt]}]}]);actualRoute.vendorId=0x0079;actualRoute.productId=0x189c;
assert.deepEqual(xbox360Interface(actualRoute),{config:1,number:0,alternate:0,endpoint:1,bytes:32});
console.log('PASS: published 0079:189c Wired Wheel descriptor selects configuration 1, interface 0 and interrupt IN endpoint 1 at 32 bytes');

const configured=device();configured.configuration=configs[0];configured.selectConfiguration=async()=>{throw new Error('An active matching configuration must never be reset');};const configuredUSB=new USBWheel(api(configured));await configuredUSB.request();assert.equal(configuredUSB.diagnostics.setup.configurationAfterOpen,2);assert.equal(configuredUSB.diagnostics.setup.stage,'receive-input');await configuredUSB.disconnect();
const otherConfig={...configs[0],configurationValue:4},changed=device([configs[0],otherConfig]);changed.open=async function(){this.opened=true;this.configuration=otherConfig;};changed.selectConfiguration=async()=>{throw new Error('A configuration exposed by open() must be preferred');};const changedUSB=new USBWheel(api(changed));await changedUSB.request();assert.equal(changedUSB.diagnostics.devices[0].route.config,4);assert.equal(changedUSB.diagnostics.setup.configurationBeforeOpen,null);assert.equal(changedUSB.diagnostics.setup.configurationAfterOpen,4);await changedUSB.disconnect();
const refused=device();refused.selectConfiguration=async()=>{const e=new Error("Failed to execute 'selectConfiguration' on 'USBDevice': Unable to set device configuration.");e.name='NetworkError';throw e;};const refusedUSB=new USBWheel(api(refused));await assert.rejects(()=>refusedUSB.request(),error=>error.message.includes('USB 구성 2')&&error.cause?.name==='NetworkError');assert.equal(refused.opened,false);assert.equal(refused.closes,1);assert.deepEqual(refused.claims,[]);assert.equal(refused.reads,0);assert.equal(refusedUSB.devices.length,0);const failed=refusedUSB.diagnostics.setup;assert.equal(failed.stage,'select-configuration');assert.equal(failed.status,'failed');assert.equal(failed.activeConfiguration,null);assert.equal(failed.error.name,'NetworkError');assert.ok(failed.error.message.includes('Unable to set device configuration'));assert.ok(refusedUSB.diagnostics.events.some(e=>e.type==='select-configuration'));
const broken=device();broken.selectConfiguration=async()=>{};const brokenUSB=new USBWheel(api(broken));await assert.rejects(()=>brokenUSB.request());assert.equal(broken.reads,0);assert.deepEqual(broken.claims,[]);
console.log('PASS: active configuration reuse after open, exact selectConfiguration failure diagnostics, close cleanup and no interface claims or fabricated input after failure');

const unplugged=device(),unplugAPI=api(unplugged),unplugUSB=new USBWheel(unplugAPI);unplugged.selectConfiguration=async()=>{unplugAPI.disconnect(unplugged);throw new Error('Unable to set device configuration.');};await assert.rejects(()=>unplugUSB.request(),/장치가 분리되거나/);assert.equal(unplugUSB.diagnostics.setup.disconnectedDuringSetup,true);assert.equal(unplugUSB.diagnostics.setup.stage,'select-configuration');assert.ok(unplugUSB.diagnostics.events.some(e=>e.type==='disconnected'));assert.equal(unplugged.reads,0);assert.deepEqual(unplugged.claims,[]);
console.log('PASS: physical disconnect during configuration is retained in setup diagnostics and never proceeds to input or interface claims');
