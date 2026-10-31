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
const {HIDWheel,compileHIDLayout,decodeHIDReport}=await import(moduleURL('HIDWheel')),{WheelInput}=await import(moduleURL('WheelInput'));
const item=(size,count,min,max,usages,extra={})=>({reportSize:size,reportCount:count,logicalMinimum:min,logicalMaximum:max,usages,isAbsolute:true,...extra});
const axisItem=item(8,3,0,255,[0x10030,0x10035,0x10032]);
const buttonItem=item(1,16,0,1,[],{isRange:true,usageMinimum:0x90001,usageMaximum:0x90010});
const report={reportId:0,items:[buttonItem,item(4,1,0,7,[0x10039],{hasNull:true}),item(4,1,0,0,[],{isConstant:true}),axisItem]};
const collection={usagePage:1,usage:4,inputReports:[report],children:[{usagePage:1,usage:1,inputReports:[{reportId:0,items:[axisItem]}]}]};
const layout=compileHIDLayout([collection]);assert.equal(layout.axes,3);assert.equal(layout.buttons,16);assert.equal(layout.reports.get(0).bytes,6);
const values=decodeHIDReport(layout,0,new DataView(Uint8Array.from([1,128,8,128,255,0]).buffer));
assert.equal(values.find(v=>v.kind==='button'&&v.index===0).value,1);assert.equal(values.find(v=>v.kind==='button'&&v.index===15).value,1);
assert.equal(values.find(v=>v.kind==='axis'&&v.index===1).value,1);assert.equal(values.find(v=>v.kind==='axis'&&v.index===2).value,-1);
assert.equal(decodeHIDReport(layout,99,new DataView(new ArrayBuffer(0))),null);
console.log('PASS: complete top-level HID report decoding, inherited collection deduplication, padding/hat offsets and independent buttons/axes');

function pack(fields,bytes){const out=new Uint8Array(bytes);for(const [offset,size,signed] of fields){let value=signed<0?2**size+signed:signed;for(let bit=0;bit<size;bit++)if(Math.floor(value/2**bit)%2)out[(offset+bit)>>3]|=1<<((offset+bit)&7);}return out;}
const signed=compileHIDLayout([{usagePage:2,usage:2,inputReports:[{reportId:7,items:[item(3,1,0,0,[],{isConstant:true}),item(13,1,-4096,4095,[0x200c8]),item(16,1,0,65535,[0x200c4])]}]}]);
const buf=new Uint8Array(6);buf[0]=7;buf.set(pack([[3,13,-4096],[16,16,65535]],4),1);
let decoded=decodeHIDReport(signed,7,new DataView(buf.buffer,1,4));assert.equal(decoded[0].value,-1);assert.equal(decoded[1].value,1);
buf.set(pack([[3,13,4095],[16,16,0]],4),1);decoded=decodeHIDReport(signed,7,new DataView(buf.buffer,1,4));assert.equal(decoded[0].value,1);assert.equal(decoded[1].value,-1);
const wide=compileHIDLayout([{usagePage:1,usage:5,inputReports:[{reportId:1,items:[item(32,1,-2147483648,2147483647,[0x10030])]}]}]);
assert.equal(decodeHIDReport(wide,1,new DataView(Uint8Array.from([0,0,0,128]).buffer))[0].value,-1);
assert.throws(()=>decodeHIDReport(signed,7,new DataView(new ArrayBuffer(3))));
assert.throws(()=>compileHIDLayout([collection,{usagePage:1,usage:2,inputReports:[report]}]));
assert.throws(()=>compileHIDLayout([{usagePage:1,usage:4,inputReports:[{reportId:0,items:[item(8,10000,0,255,[0x10030])]}]}]));
console.log('PASS: little-endian/non-byte-aligned signed axes, simulation usages, nonzero DataView offsets, report IDs and malformed layout rejection');

function device(collections=[collection],name='USB racing wheel'){
 const listeners=new Set();return {vendorId:0x1234,productId:0x5678,productName:name,collections,opened:false,opens:0,closes:0,writes:0,
  async open(){this.opens++;this.opened=true;},async close(){this.closes++;this.opened=false;},
  addEventListener(type,fn){assert.equal(type,'inputreport');listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);},
  sendReport(){this.writes++;throw new Error('Output is forbidden');},sendFeatureReport(){this.writes++;throw new Error('Feature commands are forbidden');},
  emit(id,bytes){const data=bytes instanceof DataView?bytes:new DataView(Uint8Array.from(bytes).buffer);for(const fn of listeners)fn({reportId:id,data});},get listeners(){return listeners.size;}};
}
function api(selected,granted=[]){let requestCalls=0,restoreCalls=0,lastFilters;const listeners=new Map();return {requestDevice:options=>{requestCalls++;lastFilters=options.filters;assert.ok(options.filters.every(f=>[1,2].includes(f.usagePage)));return Promise.resolve(selected);},getDevices:async()=>{restoreCalls++;return granted;},addEventListener(type,fn){listeners.set(type,fn);},disconnect(d){d.opened=false;listeners.get('disconnect')?.({device:d});},connect(d){listeners.get('connect')?.({device:d});},get filters(){return lastFilters;},get requests(){return requestCalls;},get restores(){return restoreCalls;}};}
const d=device(),backend=api([d]),hid=new HIDWheel(backend);
const selecting=hid.request();assert.equal(backend.requests,1,'The permission request must run synchronously inside the button gesture');assert.equal(hid.devices.length,0);assert.equal(await selecting,1);assert.equal(d.opens,1);assert.equal(hid.devices.length,1);assert.equal(hid.devices[0].inputsReady,false);
const pad=hid.devices[0],profile={version:1,deviceId:pad.id,pedalDeviceId:pad.id,deviceIndex:pad.index,pedalIndex:pad.index,enabled:true,steering:{axis:0,center:0,left:-1,right:1},throttle:{source:'axis',index:1,rest:1,full:-1},brake:{source:'axis',index:2,rest:1,full:-1},buttons:{shiftUp:0,shiftDown:1,boost:2,drs:3,pause:4,camera:5},deadzone:.02,sensitivity:1};
const storage={getItem:()=>null,setItem:()=>{}},wheel=new WheelInput(()=>[],storage,hid);wheel.save(profile);wheel.poll();assert.equal(wheel.controls,null);assert.ok(wheel.status.includes('USB 입력'));
d.emit(0,[1,0,8,128,255,255]);wheel.poll();assert.equal(wheel.armed,false,'A held first-report paddle must not arm controls');
d.emit(0,[0,0,8,128,255,255]);wheel.poll();assert.equal(wheel.armed,true);assert.equal(wheel.consume('shiftUp'),false);
d.emit(0,[1,0,8,0,0,128]);wheel.poll();assert.equal(wheel.controls.steer,1);assert.equal(wheel.controls.throttle,1);assert.ok(wheel.controls.brake>.49&&wheel.controls.brake<.51);assert.equal(wheel.consume('shiftUp'),true);wheel.poll();assert.equal(wheel.consume('shiftUp'),false);assert.equal(d.writes,0);
console.log('PASS: explicit WebHID selection, real report events feed calibrated controls, held-button arming and no motor/output writes');

d.emit(0,[0]);assert.equal(hid.devices[0].inputsReady,false);assert.equal(wheel.poll(),true);assert.equal(wheel.controls,null);assert.equal(hid.diagnostics.devices[0].invalidReports,1);
d.emit(0,[0,0,8,128,255,255]);wheel.poll();assert.equal(wheel.armed,true);
backend.disconnect(d);assert.equal(hid.devices.length,0);assert.equal(wheel.poll(),true);assert.equal(wheel.controls,null);assert.equal(d.listeners,0);
console.log('PASS: truncated report and physical unplug release every input and trigger the existing pre-physics pause signal');

const splitDevice=device([{usagePage:1,usage:5,inputReports:[{reportId:1,items:[axisItem]},{reportId:2,items:[item(8,2,0,255,[0x90001,0x90002])]}]}]),split=new HIDWheel(api([splitDevice]));await split.request();
splitDevice.emit(1,[128,255,255]);assert.equal(split.devices[0].inputsReady,false);splitDevice.emit(2,[0,128]);assert.equal(split.devices[0].inputsReady,true);assert.ok(split.devices[0].buttons[1].value>.5);const packets=split.diagnostics.devices[0].packets;splitDevice.emit(33,[]);assert.equal(split.diagnostics.devices[0].packets,packets);
await split.disconnect();assert.equal(splitDevice.closes,1);assert.equal(split.devices.length,0);assert.equal(splitDevice.listeners,0);assert.equal(splitDevice.writes,0);
console.log('PASS: multiple required reports, analog button pressure, unrelated report isolation and explicit close cleanup');

const bad=device([{usagePage:0xff00,usage:1,inputReports:[{reportId:0,items:[item(8,4,0,255,[0xff000001])]}]}],'Vendor-only protocol');
const good=device(),restoreAPI=api([], [bad,good]),restoring=new HIDWheel(restoreAPI);await restoring.restore();assert.equal(restoreAPI.requests,0);assert.equal(restoring.devices.length,1);assert.equal(bad.opens,0);assert.equal(good.opens,1);assert.ok(restoring.lastError.includes('표준'));
const forbidden=new HIDWheel(api([bad]));await assert.rejects(()=>forbidden.request());assert.equal(forbidden.devices.length,0);assert.equal(bad.opens,0);assert.equal(bad.writes,0);assert.equal(forbidden.diagnostics.selected.vendorId,'1234');
await restoring.disconnect();await restoring.restore();assert.equal(good.opens,1,'Explicit disconnect must not reopen a remembered device in the same session');
console.log('PASS: permission-only restore, unsupported vendor layouts remain closed, diagnostic IDs and no fabricated wheel input');

const delayed=device();let finish;delayed.open=function(){this.opens++;return new Promise(resolve=>{finish=()=>{this.opened=true;resolve();};});};
const sharedAPI=api([delayed],[delayed]),concurrent=new HIDWheel(sharedAPI),opening=concurrent.request(),restore=concurrent.restore();
await Promise.resolve();await Promise.resolve();assert.equal(delayed.opens,1);assert.equal(delayed.listeners,1);await concurrent.disconnect();finish();assert.equal(await opening,0);await restore;assert.equal(concurrent.devices.length,0);assert.equal(delayed.opened,false);assert.equal(delayed.listeners,0);
const cancel=new HIDWheel(api([]));assert.equal(await cancel.request(),0);assert.equal(cancel.devices.length,0);
const absent=new HIDWheel(undefined);if(!absent.available)await assert.rejects(()=>absent.request());
console.log('PASS: concurrent restore/request deduplication, cancellation during opening, chooser cancellation and unavailable API handling');

const vendorCollection={...collection,usagePage:0xff00,usage:1},wired=device([vendorCollection],'Wired Wheel'),wiredAPI=api([wired]),wiredHID=new HIDWheel(wiredAPI);
await wiredHID.request(true);assert.deepEqual(wiredAPI.filters,[],'The explicit fallback chooser must include non-gamepad application collections');
const wiredPad=wiredHID.devices[0],wiredInput=new WheelInput(()=>[],storage,wiredHID);wiredInput.save({...profile,deviceId:wiredPad.id,pedalDeviceId:wiredPad.id,deviceIndex:wiredPad.index,pedalIndex:wiredPad.index});
wired.emit(0,[0,0,8,128,255,255]);wiredInput.poll();assert.equal(wiredInput.armed,true);wired.emit(0,[1,0,8,0,0,255]);wiredInput.poll();assert.equal(wiredInput.controls.steer,1);assert.equal(wiredInput.controls.throttle,1);assert.equal(wiredInput.consume('shiftUp'),true);
assert.equal(wiredHID.diagnostics.selected.name,'Wired Wheel');assert.equal(wiredHID.diagnostics.selected.collections[0].usagePage,'ff00');assert.equal(wiredHID.diagnostics.selected.collections[0].reports[0].items.length,4);
assert.throws(()=>compileHIDLayout([{...vendorCollection,usagePage:1,usage:6}]),'Keyboard application collections must not become driving inputs');
assert.equal(wired.writes,0);
console.log('PASS: unfiltered user-selected Wired Wheel with vendor application collection uses declared standard axes/buttons without guessed bytes or keyboard input');

const settle=()=>new Promise(resolve=>setImmediate(resolve));
wiredAPI.disconnect(wired);assert.equal(wiredInput.poll(),true);assert.equal(wiredInput.controls,null);assert.ok(wiredHID.connectionNotice.includes('Wired Wheel'));assert.equal(wiredHID.diagnostics.events.at(-1).type,'disconnected');
const replug=device([vendorCollection],'Wired Wheel');wiredAPI.connect(replug);await settle();assert.equal(replug.opens,1);assert.equal(wiredHID.devices[0].id,wiredPad.id);assert.equal(wiredHID.devices[0].inputsReady,false);wiredInput.poll();assert.equal(wiredInput.controls,null);
replug.emit(0,[1,0,8,128,0,255]);wiredInput.poll();assert.equal(wiredInput.armed,false,'Reconnect must discard previous samples and wait for released inputs');replug.emit(0,[0,0,8,128,255,255]);wiredInput.poll();assert.equal(wiredInput.armed,true);assert.equal(wiredInput.consume('shiftUp'),false);
const unrelated=device([vendorCollection],'Another controller');wiredAPI.connect(unrelated);await settle();assert.equal(unrelated.opens,0,'Unrelated granted devices must not be auto-opened');
await wiredHID.disconnect();wiredAPI.connect(replug);await settle();assert.equal(replug.opens,1,'Explicit disconnect must suppress automatic reopening');assert.equal(wiredHID.devices.length,0);
assert.ok(wiredHID.diagnostics.events.some(e=>e.type==='reconnected'));assert.ok(wiredHID.diagnostics.events.some(e=>e.type==='ready'));
console.log('PASS: permitted wheel reconnects with a fresh HID handle and neutral arming, records loss after removal, and respects explicit disconnect');

const racingDevice=device([vendorCollection],'Wired Wheel'),racingAPI=api([racingDevice]),racingHID=new HIDWheel(racingAPI);
let completeOpen; racingDevice.open=function(){this.opens++;if(this.opens===1)return new Promise(resolve=>{completeOpen=()=>{this.opened=true;resolve();};});this.opened=true;return Promise.resolve();};
const firstOpen=racingHID.request(true);await Promise.resolve();racingAPI.disconnect(racingDevice);racingAPI.connect(racingDevice);completeOpen();await assert.rejects(firstOpen);await settle();assert.equal(racingDevice.opens,2);assert.equal(racingDevice.closes,1);assert.equal(racingDevice.listeners,1);assert.equal(racingHID.devices.length,1);assert.equal(racingHID.devices[0].inputsReady,false);
for(let i=0;i<40;i++){racingAPI.disconnect(racingDevice);racingAPI.connect(racingDevice);await settle();}assert.equal(racingHID.diagnostics.events.length,32);assert.equal(racingDevice.listeners,1);
await racingHID.disconnect();assert.equal(racingDevice.listeners,0);
console.log('PASS: reconnect during an unfinished HID open cancels the stale handle, retains one listener and bounds diagnostic history');
