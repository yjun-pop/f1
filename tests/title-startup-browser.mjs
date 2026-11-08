// Run with Vite and a Chromium CDP endpoint. The real WebGL scene is exercised;
// only failed/delayed module delivery and unavailable WebGL are simulated.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.UI_BASE_URL??'http://127.0.0.1:5180',cdp=process.env.UI_CDP_URL??'http://127.0.0.1:9237';
const pages=await(await fetch(cdp+'/json/list')).json();
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let serial=0;const pending=new Map();let held;
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result);}if(message.method==='Fetch.requestPaused')held=message.params.requestId;});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(expression,label)=>{for(let i=0;i<180;i++){if(await ev(expression))return;await wait(200);}throw Error('Timed out: '+label);};
const shot=async name=>{if(!process.env.UI_SCREENSHOT_DIR)return;await fs.mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(process.env.UI_SCREENSHOT_DIR+'/'+name+'.png',Buffer.from(r.data,'base64'));};
await send('Page.enable');await send('Page.bringToFront');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});

// The HTML shell must remain usable even while the 3D chunk is still in flight.
await send('Fetch.enable',{patterns:[{urlPattern:'*src/ui/TitleRaceScene.ts*'}]});
await send('Page.navigate',{url:base+'/'});
await until(`!!document.querySelector('#boot-skip')&&!document.querySelector('#boot-skip').hidden`,'loading skip');
assert.equal(await ev(`document.querySelector('#app').inert&&!document.querySelector('#boot-screen').classList.contains('is-finished')`),true);
await ev(`document.querySelector('#title-quick').focus()`);
assert.notEqual(await ev(`document.activeElement.id`),'title-quick','Menu must not receive keyboard input through the loader');
await shot('loading');await ev(`document.querySelector('#boot-skip').click()`);
await until(`!document.querySelector('#boot-screen')`,'static entry');
assert.equal(await ev(`document.querySelector('.title-scene').dataset.background==='poster'&&!document.querySelector('#app').inert`),true);
await until(`document.querySelector('.title-race-poster').complete&&document.querySelector('.title-race-poster').naturalWidth>0`,'fallback image');
assert.ok(held);await send('Fetch.continueRequest',{requestId:held});await send('Fetch.disable');await wait(500);
assert.equal(await ev(`document.querySelectorAll('.title-race-canvas').length`),0,'Cancelled loading must not create a late WebGL context');
console.log('PASS: loading shell blocks menu input; static entry works before the 3D chunk and cancels late construction');

await send('Page.navigate',{url:base+'/'});
await until(`document.querySelector('.title-scene')?.dataset.background==='live'&&!document.querySelector('#boot-screen')`,'first real race frame');
assert.equal(await ev(`document.querySelector('#app').inert`),false);
const layouts=[];
for(const [width,height]of[[1920,1080],[1280,720],[2560,1080],[390,844]]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(100);
 const layout=await ev(`(()=>{const a=document.querySelector('#title-account').getBoundingClientRect(),m=document.querySelector('.title-content nav').getBoundingClientRect(),c=document.querySelector('.title-race-canvas').getBoundingClientRect();return {width:innerWidth,height:innerHeight,inside:m.left>=0&&m.right<=innerWidth&&m.top>=a.bottom&&m.bottom<innerHeight,canvas:c.width===innerWidth&&c.height===innerHeight}})()`);
 assert.ok(layout.inside&&layout.canvas,JSON.stringify(layout));layouts.push(layout);await shot('title-'+width);
}
await ev(`document.querySelector('#title-settings').focus();document.querySelector('#title-settings').click()`);await until(`!!document.querySelector('dialog[open]')`,'settings');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await until(`!document.querySelector('dialog[open]')&&document.activeElement.id==='title-settings'`,'settings focus return');
await ev(`document.querySelector('#title-quick').click()`);await until(`!!document.querySelector('#front-menu')`,'quick race');
assert.equal(await ev(`document.querySelectorAll('.title-race-canvas').length`),0,'Entering quick race must release the film canvas');
console.log('PASS: first-frame reveal, responsive menus, settings/Esc focus return and quick-race transition',layouts);

// Deterministic poses in the actual scene verify a pass, wheel movement and a
// camera change without running any gameplay/AI or waiting through a race.
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:base+'/tests/title-race-fixture.html'});await until(`window.prepared===true`,'film fixture');
const film=await ev(`(()=>{const f=window.film;f.pose(0);const p0=f.cars[0].group.position.clone(),g0=f.cars[1].group.position.clone().sub(p0).dot(f.road.getTangentAt(.18));const wheel=f.cars[0].visual.tires[0].rotation.x;f.pose(3);const g1=f.cars[1].group.position.clone().sub(f.cars[0].group.position).dot(f.road.getTangentAt((f.length*.18+3*74)/f.length));f.render();return {cars:f.cars.length,moved:p0.distanceTo(f.cars[0].group.position),passed:g0<0&&g1>0,wheels:wheel!==f.cars[0].visual.tires[0].rotation.x,calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles}})()`);
assert.equal(film.cars,6);assert.ok(film.moved>200&&film.passed&&film.wheels);assert.ok(film.calls<230&&film.triangles<160000,JSON.stringify(film));
const before=await ev(`window.film.elapsed`);await wait(200);assert.equal(await ev(`window.film.elapsed`),before,'Reduced motion must keep the film still');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
await until(`window.film.elapsed>0`,'animated film');
await ev(`cancelAnimationFrame(film.raf);film.elapsed=11.99;film.last=performance.now();film.rendered=0;film.animate(film.last+30);cancelAnimationFrame(film.raf)`);
assert.equal(await ev(`film.shot===1&&film.overlap.width>1`),true,'A camera cut must retain the outgoing frame for overlap');
await ev(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.hiddenTime=film.elapsed`);await wait(200);
assert.equal(await ev(`film.elapsed===window.hiddenTime`),true,'Hidden tabs must stop advancing the film');
await ev(`film.dispose();film.dispose()`);
assert.equal(await ev(`!document.querySelector('canvas')&&film.scene.children.length===0&&film.cars.length===0`),true);
console.log('PASS: six real 3D cars, a completed scripted pass, rotating wheels, camera overlap, reduced motion, hidden-tab pause and idempotent disposal',film);

// GPU creation failure falls back to the local poster; no loading dead end.
const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};`});
await send('Page.navigate',{url:base+'/'});await until(`document.querySelector('.title-scene')?.dataset.background==='poster'&&!document.querySelector('#boot-screen')`,'GPU fallback');
await until(`document.querySelector('.title-race-poster')?.naturalWidth>0`,'GPU fallback image');
assert.equal(await ev(`!document.querySelector('#app').inert&&!document.querySelector('.title-race-canvas')`),true);
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
console.log('PASS: unavailable WebGL shows a local race poster and usable menu');
await send('Network.setCacheDisabled',{cacheDisabled:false});ws.close();
