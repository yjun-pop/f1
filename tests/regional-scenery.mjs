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
const skies=new Set();
for(const circuit of CIRCUITS){
 const scene=new THREE.Scene(),track=new Track(scene,circuit),env=environmentFor(circuit.id),root=track.group.getObjectByName('circuit-landmarks');
 assert.ok(root);for(const landmark of env.landmarks)assert.ok(root.getObjectByName(landmark.id),`${circuit.id}: missing ${landmark.id}`);
 if(circuit.id==='silverstone')assert.ok(root.getObjectByName('silverstone-wing'));
 let lights=0,instances=0,detail=0;root.traverse(o=>{if(o.isLight)lights++;if(o.isInstancedMesh){instances+=o.count;if(o.userData.nearDetail)detail++;assert.ok(o.count<500);assert.equal(o.matrixAutoUpdate,false);}if(o.geometry)assert.ok(o.geometry.getAttribute('position').array.every(Number.isFinite));});assert.equal(lights,0);
 for(const chunk of root.userData.chunks){assert.ok(Number.isFinite(chunk.radius)&&chunk.radius>0);const anchor=chunk.group.userData.geographicAnchor;if(anchor)assert.ok(anchor.source.distanceTo(anchor.placed)<350);}
 const terrain=track.surfaceGeometries.get('grass-terrain').getAttribute('position');
 const minX=terrain.getX(0),minZ=terrain.getZ(0),step=6500/96;
 for(let i=0;i<track.length;i+=20)for(const side of [-9,0,9]){
  const p=track.point(i/track.length).addScaledVector(track.normal(i/track.length),side),x=Math.floor((p.x-minX)/step),z=Math.floor((p.z-minZ)/step);
  for(const index of [z*97+x,z*97+x+1,(z+1)*97+x,(z+1)*97+x+1])assert.ok(Math.abs(terrain.getY(index)+.08)<.001,`${circuit.id}: background hills must leave all road-covering terrain triangles flat`);
  const near=track.scenerySpace.distanceSquared(p.x,p.z,40);assert.ok(near<110,'Road proximity uses a bounded local segment index');
 }
 let waterTiles=0;
 root.traverse(o=>{if(o.name==='harbour-water'&&o.isGroup){waterTiles++;const mesh=o.children[0],g=mesh.geometry,pos=g.getAttribute('position'),seen=new Set(g.index.array);for(const i of seen){assert.ok(containsWater(pos.getX(i),pos.getZ(i),track.waters));assert.ok(track.scenerySpace.distanceSquared(pos.getX(i),pos.getZ(i),29)>=841);}}});
 if(['monaco','singapore','montreal'].includes(circuit.id))assert.ok(waterTiles>1);
 for(const distance of [150,100,50])assert.ok(track.group.getObjectByName(`brake-boards-${distance}`) instanceof THREE.InstancedMesh);
 track.updatePresentation(new THREE.Vector3(1e6,0,1e6),'low');assert.ok(root.userData.chunks.every(c=>!c.group.visible));
 root.traverse(o=>{if(o.userData.nearDetail)assert.equal(o.visible,false);});
 const forest=track.group.getObjectByName('woodland');for(const leaf of forest.children.filter(o=>o.userData.nearGeometry)){assert.ok((leaf.userData.farGeometry.index?.count??leaf.userData.farGeometry.getAttribute('position').count)<(leaf.userData.nearGeometry.index?.count??leaf.userData.nearGeometry.getAttribute('position').count));assert.equal(leaf.material.map,null);assert.equal(leaf.castShadow,false);}
 const sky=circuit.night?createNightSkyTexture(128,env):createSkyBackdrop(undefined,new THREE.Vector3(-85,50,-77),env);let checksum=0;for(let i=0;i<sky.image.data.length;i+=53)checksum=(checksum+sky.image.data[i]*(i+1))%2147483647;skies.add(checksum);sky.dispose();
 console.log(`PASS: ${circuit.id} geographic landmarks, flat drivable corridor, shore-clipped water, bounded static batches and low-tier detail/shadow culling`,{instances,detail,waterTiles});
}
assert.equal(skies.size,8);console.log('PASS: eight distinct regional sky/reflection palettes with reusable filtered backgrounds');
