import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const threeURL=new URL('../node_modules/three/build/three.module.js',import.meta.url).href,cache=new Map();
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  const source=fs.readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/from 'three\/addons\/([^']+)'/g,(_,path)=>`from '${new URL('../node_modules/three/examples/jsm/'+path,import.meta.url).href}'`);
  js=js.replace(/from 'three'/g,`from '${threeURL}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
globalThis.window={innerWidth:1280,innerHeight:720};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {Track}=await import(moduleURL('Track')),{CIRCUITS}=await import(moduleURL('Circuits'));
const {terrainMaps,setSurfaceQuality}=await import(moduleURL('SurfaceTextures'));
const {GRAPHICS_PROFILES}=await import(moduleURL('Graphics'));
const {environmentFor}=await import(moduleURL('CircuitEnvironment'));
const {containsWater}=await import(moduleURL('RegionalWaters'));
const {createSkyBackdrop,createNightSkyTexture}=await import(moduleURL('WorldLighting'));
const {Vehicle,resolveCollision}=await import(moduleURL('Vehicle'));
const {LinePlanner}=await import(moduleURL('LinePlanner'));
const {Race}=await import(moduleURL('Race'));
const track=new Track(new THREE.Scene(),CIRCUITS.find(c=>c.id==='monaco')),scene=new THREE.Scene(),tunnel=track.tunnel,planner=new LinePlanner(track);
const pointDistance=(x,z,w)=>{const t=THREE.MathUtils.clamp(((x-w.ax)*w.dx+(z-w.az)*w.dz)/w.lengthSquared,0,1);return Math.hypot(x-w.ax-t*w.dx,z-w.az-t*w.dz);};
for(const path of track.barrierPaths){assert.ok(path.length>track.length*.93);for(let i=0;i<track.length;i+=9){const p=track.roadPoint(i/track.length);assert.ok(Math.min(...path.points.map(w=>p.distanceToSquared(w)))<19**2,'Every part of the lap needs a visible boundary on both sides');}}
const road=track.surfaceGeometries.get('asphalt-road').getAttribute('position');let clearance=Infinity;
for(let i=0;i<road.count;i+=20){const p=new THREE.Vector3().fromBufferAttribute(road,i);for(const w of track.solidWalls.segments){if(w.kind!=='barrier'||p.x<w.minX-2||p.x>w.maxX+2||p.z<w.minZ-2||p.z>w.maxZ+2)continue;clearance=Math.min(clearance,pointDistance(p.x,p.z,w)-w.halfThickness);}}
assert.ok(clearance>.3,`The new walls must not cross the rendered asphalt (${clearance})`);
console.log('PASS: continuous Monaco boundaries cover both sides of every sector and leave the actual road mesh clear',{lengths:track.barrierPaths.map(p=>p.length),clearance});
const shell=track.group.getObjectByName('monaco-tunnel').children[0].geometry.getAttribute('position');
for(let i=0;i<tunnel.centers.length;i++){assert.ok(new THREE.Vector3().fromBufferAttribute(shell,i*8).distanceTo(tunnel.left[i])<.001);assert.ok(new THREE.Vector3().fromBufferAttribute(shell,i*8+7).distanceTo(tunnel.outerLeft[i])<.001);}
assert.ok(track.solidWalls.segments.some(w=>w.kind==='tunnel'));
console.log('PASS: concrete thickness, visible tunnel faces and collision walls use the same shared layout');
function place(t,lane,headingOffset=0,speed=0,lateral=0){const car=new Vehicle(track,scene),p=track.roadPoint(t),n=track.roadNormal(t);car.resetAt(t);car.position.copy(p).addScaledVector(n,lane);const tangent=track.tangent(t);car.heading=Math.atan2(tangent.x,tangent.z)+headingOffset;car.speed=speed;car.lateralSpeed=lateral;return car;}
const t=(tunnel.start+tunnel.end)*.5;
for(const fps of [15,30,60,144])for(const side of [-1,1]){
 const n=track.roadNormal(t).multiplyScalar(side),car=place(t,side*7.4);car.heading=Math.atan2(n.x,n.z);car.speed=94;let maximumStep=0;
 for(let i=0;i<Math.ceil(fps*.4);i++){const p=car.position.clone();car.drive(1/fps,{throttle:0,brake:0,steer:0});maximumStep=Math.max(maximumStep,p.distanceTo(car.position));}
 const lane=car.position.clone().sub(track.roadPoint(car.progress)).dot(track.roadNormal(car.progress));
 assert.ok(lane*side<tunnel.halfWidth-2.6,`The front wing must stay inside the tunnel at ${fps}fps`);assert.ok(car.impactSerial>0);assert.ok(car.speed<10);assert.ok(maximumStep<94/fps+.6);
 console.log(`PASS: ${fps}fps / side ${side}, high-speed tunnel impact stops the body and wing without tunneling or a position reset`,{lane,speed:car.speed});
}
for(const side of [-1,1]){
 const car=place(t,side*14.1,0,15,-side*8);for(let i=0;i<60;i++)car.drive(1/120,{throttle:0,brake:0,steer:0});
 const lane=car.position.clone().sub(track.roadPoint(car.progress)).dot(track.roadNormal(car.progress));assert.ok(lane*side>tunnel.halfWidth+tunnel.thickness+.9,'A wall must also resist entry from its exterior face');assert.ok(car.impactSerial>0);
}
console.log('PASS: tunnel walls resist outside-to-inside glancing contact on both sides');
for(const side of [-1,1]){
 const a=place(t,side*10.9),b=place(t,side*10.0);
 for(let i=0;i<6;i++)resolveCollision(a,b);
 const lane=a.position.clone().sub(track.roadPoint(a.progress)).dot(track.roadNormal(a.progress));assert.ok(lane*side<tunnel.halfWidth-1.08,'A collision with another car must not push tyres through a static wall');
}
console.log('PASS: car-to-car pushes respect the tunnel wall immediately, on both sides');
for(const side of [-1,1]){
 const car=place(t,side*11.1,0,40,side*4),before=car.distance;for(let i=0;i<30;i++)car.drive(1/120,{throttle:0,brake:0,steer:0});
 assert.ok(car.speed>15&&car.distance>before+4/track.length,'A glancing contact must retain forward motion instead of sticking to the wall');
}
console.log('PASS: glancing wall contact preserves tangential movement and loses normal velocity');
const backing=place(t,7.4),outward=track.roadNormal(t);backing.heading=Math.atan2(outward.x,outward.z);backing.speed=18;
for(let i=0;i<60;i++)backing.drive(1/120,{throttle:0,brake:0,steer:0});const beforeBacking=backing.position.clone();for(let i=0;i<240;i++)backing.drive(1/120,{throttle:.4,brake:0,steer:0,reverse:true});assert.ok(backing.position.clone().sub(beforeBacking).dot(outward)<-1.5,'A crashed car must be able to back away physically');
console.log('PASS: a stopped car can reverse away from the concrete without a recovery teleport');
const portal=place(tunnel.start-5/track.length,0,0,18);for(let i=0;i<240;i++)portal.drive(1/120,{throttle:0,brake:0,steer:0});assert.equal(portal.impactSerial,0);assert.ok(portal.distance>tunnel.start+15/track.length);
console.log('PASS: open entrance and overhead roof allow a normal car to enter the tunnel');
const race=new Race(track,scene,planner),ghost=new Vehicle(track,scene);ghost.position.set(1e6,0,1e6);race.state='racing';let off=0;const wallHits=new Map(),original=track.solidWalls.resolve.bind(track.solidWalls);track.solidWalls.resolve=(car,...args)=>{const hit=original(car,...args);if(hit)wallHits.set(car,(wallHits.get(car)??0)+1);return hit;};
for(let i=0;i<120*130;i++){race.update(1/120,ghost);off+=race.opponents.filter(o=>o.car.offRoad).length;if(race.opponents.every(o=>o.car.distance>=1.02))break;}
assert.equal(off,0);assert.equal(race.opponents.reduce((n,o)=>n+o.collisionCount,0),0);assert.ok(race.opponents.every(o=>o.car.distance>=1.02));assert.ok(race.opponents.every(o=>(wallHits.get(o.car)??0)===0),'AI routes must respect physical walls rather than scrape through them');
console.log('PASS: all eleven autonomous rivals complete Monaco with no wall contacts, car contacts or road departures');
