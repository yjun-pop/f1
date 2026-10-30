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
let terrainBytes=0;
for(const kind of ['asphalt','grass','gravel']){
  const maps=terrainMaps(kind);assert.equal(maps.bumpMap,undefined,'Terrain must use baked normals instead of a runtime bump-height path');
  assert.equal(maps.normalMap,terrainMaps(kind).normalMap,'All cars/views/circuits must share each material map');
  assert.equal(maps.map.colorSpace,THREE.SRGBColorSpace);assert.equal(maps.normalMap.colorSpace,THREE.NoColorSpace);
  assert.equal(maps.roughnessMap.format,THREE.RGFormat,'Packed roughness must retain the green channel used by the standard shader');
  assert.equal(maps.roughnessMap.image.data.length,512*512*2);
  const normals=maps.normalMap.image.data,rough=maps.roughnessMap.image.data;
  for(let i=0;i<normals.length;i+=4*31){
    const x=normals[i]/255*2-1,y=normals[i+1]/255*2-1,z=normals[i+2]/255*2-1;
    assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.025&&z>0,'Every sampled normal must be a finite outward unit vector');
  }
  assert.ok(rough.every((v,i)=>i%2===0||v>=170),'Dry surfaces must not acquire mirror-like roughness');
  for(const map of Object.values(maps)){assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.wrapT,THREE.RepeatWrapping);assert.equal(map.generateMipmaps,true);terrainBytes+=map.image.data.byteLength;}
}
assert.equal(terrainBytes,512*512*3*10);
setSurfaceQuality('high',2);assert.equal(terrainMaps('asphalt').map.anisotropy,2,'Filtering must respect hardware capability');
setSurfaceQuality('low',16);assert.equal(terrainMaps('grass').normalMap.anisotropy,2);
setSurfaceQuality('high',16);assert.equal(terrainMaps('gravel').roughnessMap.anisotropy,8);
setSurfaceQuality('medium',16);
console.log('PASS: shared terrain normals, linear packed roughness, valid mipmaps/filtering and 16.7% less map storage',{terrainMiB:terrainBytes/1024**2,previousMiB:9});

for(const circuit of CIRCUITS){
  const track=new Track(new THREE.Scene(),circuit),names=['grass-terrain','curved-rubber','gravel-runoff'];
  for(const name of names){
    const source=track.surfaceGeometries.get(name),group=track.group.getObjectByName(name),position=source.getAttribute('position');
    assert.ok(group.children.length>1&&group.children.length<=64,'Local batches must keep a bounded draw-call budget');
    assert.equal(group.children.reduce((sum,m)=>sum+m.geometry.index.count,0),source.index.count,'Culling must retain every source triangle');
    const original=new Map();for(let i=0;i<source.index.count;i+=3){const key=[0,1,2].map(k=>source.index.getX(i+k)).join('/');original.set(key,(original.get(key)??0)+1);}
    for(const mesh of group.children){
      assert.equal(mesh.geometry.getAttribute('position'),position,'Local tiles must share their source vertex buffers');
      assert.ok(mesh.geometry.boundingSphere.radius<(name==='grass-terrain'?850:250));
      const index=mesh.geometry.index;
      for(let i=0;i<index.count;i+=3){
        const key=[0,1,2].map(k=>index.getX(i+k)).join('/'),count=original.get(key);assert.ok(count>0,'No local triangle may be dropped, duplicated or rewound');original.set(key,count-1);
        for(let k=0;k<3;k++)assert.ok(mesh.geometry.boundingBox.containsPoint(new THREE.Vector3().fromBufferAttribute(position,index.getX(i+k))));
      }
    }
    assert.ok([...original.values()].every(n=>n===0));
  }
  const checkers=track.group.getObjectByName('start-checkers');assert.ok(checkers instanceof THREE.InstancedMesh);assert.equal(checkers.count,40);
  console.log(`PASS: ${circuit.id} local terrain/rubber/gravel preserve all triangles, share attributes and batch forty start tiles`);
  const metrics=[];
  for(const rear of [false,true])for(const tier of ['low','medium','high']){
    let submitted=0,draws=0;const profile=GRAPHICS_PROFILES[tier],full=names.reduce((sum,name)=>sum+track.surfaceGeometries.get(name).index.count/3,0);
    for(const t of [0,.18,.38,.58,.78,.93]){
      const p=track.point(t),f=track.tangent(t),camera=new THREE.PerspectiveCamera(rear?58:80,rear?4:16/9,.1,rear?profile.mirrorFar:profile.viewFar);
      camera.position.copy(p).setY(1.7);camera.lookAt(p.clone().addScaledVector(f,rear?-26:26).setY(1.1));camera.updateMatrixWorld(true);
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      for(const name of names)for(const mesh of track.group.getObjectByName(name).children)if(frustum.intersectsObject(mesh)){submitted+=mesh.geometry.index.count/3;draws++;}
    }
    assert.ok(submitted/6<full*.6,'The main and mirror views must exclude most distant terrain/decorative triangles');
    assert.ok(draws/6<30,'Spatial culling must not replace the old terrain pass with excessive visible draw calls');
    metrics.push({view:rear?'rear':'main',tier,triangles:Math.round(submitted/6),previous:full,draws:Math.round(draws/6)});
  }
  console.log(`PASS: ${circuit.id} representative forward/rear frusta reduce decorative geometry on all tiers`,metrics);
}
