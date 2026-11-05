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

const stamp=new THREE.Matrix4(),v=new THREE.Vector3(),corners=[];
for(const circuit of CIRCUITS){
 const track=new Track(new THREE.Scene(),circuit),root=track.group.getObjectByName('circuit-landmarks'),info=track.group.userData.venueArchitecture;
 assert.ok(info);assert.ok(root.getObjectByName(`${circuit.id}-pit-architecture`));
 for(const site of info.sites){
  assert.equal(track.scenerySpace.intersectsFootprint(site.footprint,18),false,`${circuit.id}: the complete facility and apron clear the driving corridor`);
  const {frame:f,footprint:fp}=site,c=Math.cos(fp.yaw),s=Math.sin(fp.yaw);
  for(const x of[-1,1])for(const z of[-1,1]){const px=fp.x+c*x*fp.halfX+s*z*fp.halfZ,pz=fp.z-s*x*fp.halfX+c*z*fp.halfZ;assert.equal(containsWater(px,pz,track.waters),false);assert.ok(f.p.y+1e-6>=track.sceneryHeight(px,pz));}
 }
 let instances=0,meshes=0,materials=new Set(),lights=0;
 root.traverse(o=>{
  if(o.isLight)lights++;
  if(!o.isMesh)return;meshes++;materials.add(o.material);
  if(!o.isInstancedMesh)return;assert.ok(o.count<=499);instances+=o.count;
  if(!o.userData.venueArchitecture||o.name.startsWith('monaco-'))return;
  o.geometry.computeBoundingBox();
  for(let i=0;i<o.count;i++){
   o.getMatrixAt(i,stamp);corners.length=0;
   for(const x of[-.5,.5])for(const y of[-.5,.5])for(const z of[-.5,.5])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(stamp));
   const yaw=Math.atan2(stamp.elements[8],stamp.elements[10]),c=Math.cos(yaw),s=Math.sin(yaw),p=new THREE.Vector3().setFromMatrixPosition(stamp);
   const xs=corners.map(v=>c*(v.x-p.x)-s*(v.z-p.z)),zs=corners.map(v=>s*(v.x-p.x)+c*(v.z-p.z));
   const fp=sceneryFootprint(p,yaw,Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs));
   assert.equal(track.scenerySpace.intersectsFootprint(fp,10.6),false,`${circuit.id} ${o.name}: a roof, post or raised terrace projects into asphalt`);
  }
 });
 assert.equal(lights,0);assert.ok(meshes<700);assert.ok(materials.size<=25);assert.ok(instances<26000);
 if(circuit.id==='monaco'){
  for(const metres of[70,160,250]){const t=track.tunnel.start+metres/track.length,p=track.roadPoint(t).addScaledVector(track.roadNormal(t),50);assert.equal(containsWater(p.x,p.z,track.waters),false,'The landward hotel/hairpin corridor must not become an inland sea pocket');}
  const h=track.group.userData.monacoHotel;assert.ok(h.coverLength<(track.tunnel.end-track.tunnel.start)*track.length);assert.equal(h.parapet,1.1);
  assert.ok(root.getObjectByName('monaco-hotel-underpass-roof'));assert.ok(root.getObjectByName('monaco-tunnel-columns'));assert.ok(root.getObjectByName('monaco-harbour-hotel'));
 }
 if(circuit.id==='spa')assert.ok(root.getObjectByName('spa-raidillon-terraces'));
 if(circuit.id==='interlagos')assert.ok(root.getObjectByName('interlagos-senna-event-court'));
 if(circuit.id==='suzuka')assert.ok(root.getObjectByName('suzuka-amusement-park'));
 if(circuit.id==='singapore'){assert.ok(root.getObjectByName('singapore-anderson-bridge'));assert.ok(root.getObjectByName('singapore-fullerton-colonnade'));}
 if(circuit.id==='montreal')assert.ok(root.getObjectByName('montreal-rowing-basin'));
 const forest=track.group.getObjectByName('woodland');for(const canopy of forest.children.filter(o=>o.userData.nearMaterial)){
  const far=canopy.userData.farGeometry;far.computeBoundingBox();for(let i=0;i<canopy.count;i++){canopy.getMatrixAt(i,stamp);const p=new THREE.Vector3().setFromMatrixPosition(stamp),scale=new THREE.Vector3().setFromMatrixScale(stamp),base=p.y+far.boundingBox.min.y*scale.y;assert.ok(Math.abs(base-track.sceneryHeight(p.x,p.z))<.002,'Far tree trunks must remain grounded after LOD replacement');}
 }
 track.updatePresentation(new THREE.Vector3(1e6,0,1e6),'low');assert.ok(root.userData.chunks.every(c=>!c.group.visible));root.traverse(o=>{if(o.userData.nearDetail)assert.equal(o.visible,false);});
 console.log('PASS: facility envelopes, full roof projections, static material/batch budgets, distinctive structures and tier culling',circuit.id,{sites:info.sites.map(s=>s.name),meshes,materials:materials.size,instances});
}
