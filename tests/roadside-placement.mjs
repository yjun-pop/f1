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
const {ScenerySpace,sceneryFootprint,footprintsOverlap}=await import(moduleURL('ScenerySpace'));
const straight=new ScenerySpace(100,t=>new THREE.Vector3(0,0,t*100));
assert.equal(straight.intersectsFootprint({x:0,z:50,yaw:0,halfX:2,halfZ:2},0),true);
assert.equal(straight.intersectsFootprint({x:30,z:50,yaw:0,halfX:2,halfZ:2},17),false);
assert.equal(straight.intersectsFootprint({x:30,z:50,yaw:Math.PI/4,halfX:40,halfZ:8},0),true,'A rotated roof can cross a road while its centre is well outside it');
assert.equal(straight.intersectsFootprint({x:0,z:35.25,yaw:0,halfX:.2,halfZ:.15},0),true,'A road segment crossing a narrow footprint must be detected between sample endpoints');
console.log('PASS: segment/footprint intersection catches roof overhang, rotation and crossings between road samples');
const unit=new THREE.Vector3(1,1,1),matrix=new THREE.Matrix4(),q=new THREE.Vector3();
for(const circuit of CIRCUITS){
 const track=new Track(new THREE.Scene(),circuit),road=track.surfaceGeometries.get('asphalt-road').getAttribute('position'),stands=track.group.children.filter(o=>o.name==='grandstand'),pit=track.group.getObjectByName('pit-building');
 assert.ok(stands.length>=8);const structures=[...stands,pit];
 for(const structure of structures){
  const inverse=structure.matrixWorld.clone().invert(),isPit=structure===pit;
  for(let i=0;i<road.count;i++){
   q.fromBufferAttribute(road,i).applyMatrix4(inverse);
   assert.ok(!(Math.abs(q.x)<(isPit?12:29.1)&&q.z>(isPit?-120:-3.6)&&q.z<(isPit?120:13.6)),`${circuit.id}: actual road mesh enters ${structure.name} roof/support footprint`);
  }
 }
 for(let a=0;a<structures.length;a++)for(let b=a+1;b<structures.length;b++)assert.equal(footprintsOverlap(structures[a].userData.footprint,structures[b].userData.footprint),false,'Relocation must not create overlapping stands/pit buildings');
 if(circuit.id==='silverstone'){
  assert.equal(stands.length,12);const oldPose=track.point(.15).addScaledVector(track.normal(.15),-37),yaw=Math.atan2(track.tangent(.15).x,track.tangent(.15).z)+Math.PI/2;
  const inverse=new THREE.Matrix4().compose(oldPose,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),unit).invert();let oldHits=0;
  for(let i=0;i<road.count;i++){q.fromBufferAttribute(road,i).applyMatrix4(inverse);oldHits+=Number(Math.abs(q.x)<29&&q.z>-3.5&&q.z<13.5);}
  assert.ok(oldHits>0,'This fixture must reproduce the reported Silverstone stand intrusion before relocation');
  const moved=stands.find(o=>Math.abs(o.userData.sourceProgress-.15)<1e-6);assert.ok(Math.abs(moved.userData.progress-.15)*track.length>=15);
 }
 const houses=[];track.group.getObjectByName('circuit-landmarks').traverse(o=>{
  if(!o.isInstancedMesh||o.name!=='roadside-houses'||!o.material.map)return;
  for(let i=0;i<o.count;i++){
   o.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix),size=new THREE.Vector3().setFromMatrixScale(matrix),yaw=Math.atan2(matrix.elements[8],matrix.elements[10]);
   const box=sceneryFootprint(p,yaw,-size.x/2,size.x/2,-size.z/2,size.z/2);assert.equal(track.scenerySpace.intersectsFootprint(box,17),false,'A close facade must stay beyond the road and its safety margin');houses.push(p);
  }
 });
 if(environmentFor(circuit.id).city){
  assert.ok(houses.length>=40);const close=houses.filter(p=>track.scenerySpace.distanceSquared(p.x,p.z,55)<55**2);assert.ok(close.length>=30);
  let views=0;for(let i=0;i<100;i++){const p=track.point(i/100),f=track.tangent(i/100),n=track.normal(i/100);if(close.some(h=>{const d=h.clone().sub(p),ahead=d.dot(f);return ahead>10&&ahead<220&&Math.abs(d.dot(n))<ahead*.84+12;}))views++;}
  if(circuit.id==='interlagos'){assert.ok(close.length>=100);assert.ok(views>=65,'Brazil needs a continuous close urban layer visible along most of the lap, not a distant skyline only');}
  console.log(`PASS: ${circuit.id} ${houses.length} independent close buildings, ${close.length} within 55m and ${views}/100 forward roadside views, with road clearance`);
 }
 console.log(`PASS: ${circuit.id} complete road mesh clears ${stands.length} grandstands and the pit including roofs, columns and adjacent returning roads`);
}
