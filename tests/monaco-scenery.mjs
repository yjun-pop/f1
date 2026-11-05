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
const scene=new THREE.Scene(),track=new Track(scene,CIRCUITS.find(c=>c.id==='monaco')),root=track.group.getObjectByName('circuit-landmarks'),info=track.group.userData.monacoEnvironment;
assert.ok(info.houses>=500&&info.yachts>=25);assert.ok(root.getObjectByName('monaco-harbour-hotel'));assert.ok(root.getObjectByName('monaco-marina'));assert.ok(root.getObjectByName('monaco-urban-ground'));console.log('PASS: dense Mediterranean blocks, hotel-underpass architecture, marina and paved neighbourhoods',{houses:info.houses,yachts:info.yachts});
const road=track.surfaceGeometries.get('asphalt-road').getAttribute('position');
for(const lot of info.lots){
 assert.equal(track.scenerySpace.intersectsFootprint(lot.footprint,17),false);
 const b=lot.footprint,c=Math.cos(b.yaw),s=Math.sin(b.yaw);
 for(let i=0;i<road.count;i++){const dx=road.getX(i)-b.x,dz=road.getZ(i)-b.z;assert.ok(Math.abs(c*dx-s*dz)>=b.halfX||Math.abs(s*dx+c*dz)>=b.halfZ,'The complete rendered road must clear the building/pavement envelope');}
 for(const x of[-1,1])for(const z of[-1,1]){const px=b.x+c*x*b.halfX+s*z*b.halfZ,pz=b.z-s*x*b.halfX+c*z*b.halfZ;assert.equal(containsWater(px,pz,track.waters),false);assert.ok(lot.position.y+1e-6>=track.sceneryHeight(px,pz));}
}
console.log('PASS: all full lot envelopes clear the actual asphalt and water, with terrace foundations at the highest ground corner');
for(const boat of info.boats){assert.equal(track.scenerySpace.intersectsFootprint(boat.footprint,38),false);const b=boat.footprint,c=Math.cos(b.yaw),s=Math.sin(b.yaw);for(const x of[-1,1])for(const z of[-1,1])assert.ok(containsWater(b.x+c*x*b.halfX+s*z*b.halfZ,b.z-s*x*b.halfX+c*z*b.halfZ,track.waters));}
console.log('PASS: moored yacht hulls remain within water and outside the road clearance');
let hullCount=0;const matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
root.traverse(mesh=>{if(!mesh.isInstancedMesh||mesh.name!=='monaco-marina'||mesh.geometry.attributes.position.count!==14)return;mesh.geometry.computeBoundingBox();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix);if(scale.y<1.5)continue;hullCount++;const y=matrix.elements[13];assert.ok(y+mesh.geometry.boundingBox.min.y*scale.y<-.045);assert.ok(y+mesh.geometry.boundingBox.max.y*scale.y>0);}});assert.equal(hullCount,info.yachts);console.log('PASS: every principal yacht hull intersects the waterline instead of hovering above it');
let instances=0,meshes=0,lights=0,triangles=0;const materials=new Set();root.traverse(o=>{if(o.isLight)lights++;if(o.isMesh){meshes++;materials.add(o.material);if(o.isInstancedMesh){assert.ok(o.count<=400);instances+=o.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*o.count;}if(o.geometry)for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));}});
assert.equal(lights,0);assert.ok(meshes<650);assert.ok(materials.size<=24);assert.ok(instances<25000);assert.ok(triangles<550000);
console.log('PASS: shared atlases/materials, finite geometry, local batches and bounded whole-scene complexity',{meshes,instances,materials:materials.size,triangles});
track.updatePresentation(track.point(.3),'low');root.traverse(o=>{if(o.userData.nearDetail)assert.equal(o.visible,false);});track.updatePresentation(new THREE.Vector3(1e6,0,1e6),'high');assert.ok(root.userData.chunks.every(c=>!c.group.visible));console.log('PASS: low-tier detail removal and distant chunk culling');
