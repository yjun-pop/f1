import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const three=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;let js=ts.transpileModule(fs.readFileSync('src/ui/CornerDemoMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from 'three'",`from '${three}'`);const {pathHeading,turnTowards,advanceDemo}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));const {Vector3}=await import(three);
const point=t=>new Vector3(Math.cos(t*2*Math.PI)*40,0,Math.sin(t*2*Math.PI)*40);
for(const t of[0,.1,.25,.5,.99,1.01]){const h=pathHeading(point,t,80*Math.PI),tangent=point(t+1e-5).sub(point(t-1e-5)).normalize();assert.ok(new Vector3(Math.sin(h),0,Math.cos(h)).dot(tangent)>.9999);}
const lane=t=>new Vector3(t*100,0,Math.sin(t*2)*8);assert.ok(Math.abs(pathHeading(lane,.3,100)-Math.PI/2)>.05,'Heading follows the changing lateral path, not the straight track centre');
const a=179*Math.PI/180,b=-179*Math.PI/180;assert.ok(Math.abs(turnTowards(a,b,1/60,24)-a)<.02);assert.equal(turnTowards(a,b,0,24),a);
let car=0,camera=0;for(let i=0;i<20;i++){car=turnTowards(car,Math.PI/2,1/60,24);camera=turnTowards(camera,Math.PI/2,1/60,3);}assert.ok(car-camera>.4,'Camera retains a readable view of the vehicle turning');
let slow=0,fast=0;for(let i=0;i<30;i++)slow=turnTowards(slow,1,1/30,24);for(let i=0;i<120;i++)fast=turnTowards(fast,1,1/120,24);assert.ok(Math.abs(slow-fast)<1e-8);console.log('PASS path-aligned heading, lateral movement, yaw seam, visible corner rotation and frame-rate independent smoothing');

const run=dts=>{let distance=0,speed=40;for(const dt of dts)({distance,speed}=advanceDemo(distance,speed,dt,1000,m=>m<20?40:20));return {distance,speed};};
const baseline=run(Array(120).fill(1/120));for(const dts of[Array(60).fill(1/60),Array(30).fill(1/30),Array(10).fill([.013,.027,.019,.041]).flat()]){const result=run(dts);assert.ok(Math.abs(result.distance-baseline.distance)<.1);assert.ok(Math.abs(result.speed-baseline.speed)<.2);}
const start=advanceDemo(0,20,1/60,1000,()=>80);assert.ok(start.speed-20<=.101);const brake=advanceDemo(0,80,1/60,1000,()=>20);assert.ok(80-brake.speed<=.334);console.log('PASS stable playback across 30/60/120Hz and uneven frames, bounded acceleration/braking');
