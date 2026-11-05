import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Track} from './Track';
import {sceneryFootprint} from './ScenerySpace';
import {environmentFor} from './CircuitEnvironment';

export function landscapeShade(x:number,z:number){return .9+.055*Math.sin(x*.019+Math.sin(z*.013)*2)+.035*Math.sin(z*.041+x*.009)+.025*Math.sin(x*.13-z*.07);}
/** Clustered crowns, leaf cutouts and local batches replace identical faceted cones. */
export function createWoodland(track:Track,isClear:(p:THREE.Vector3)=>boolean){
  const group=new THREE.Group();group.name='woodland';const environment=environmentFor(track.circuit.id);if(!environment.density)return group;

  const data=new Uint8Array(128*128*4);let seed=329;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4,vein=Math.sin(x*.8+Math.sin(y*.5)*2),shade=.7+random()*.45;
    data[i]=64*shade;data[i+1]=94*shade;data[i+2]=48*shade;data[i+3]=vein+random()*.9>-.55?255:0;
  }
  const texture=new THREE.DataTexture(data,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const leaves=new THREE.MeshStandardMaterial({map:texture,alphaTest:.3,alphaToCoverage:true,roughness:1,side:THREE.DoubleSide});
  const bark=new THREE.MeshStandardMaterial({color:environment.trunk,roughness:1}),farLeaves=new THREE.MeshStandardMaterial({color:new THREE.Color(environment.foliage).multiplyScalar(.82),roughness:1});
  const crownParts:THREE.BufferGeometry[]=[];
  for(const [x,y,z,s] of [[0,1,0,3.8],[-2.2,.1,.4,2.8],[2.1,0,-.2,2.9],[.6,-.1,2.4,2.7],[-.4,-.4,-2.3,2.8]]){
    const geometry=new THREE.IcosahedronGeometry(s,1);geometry.scale(1,1.15,1);geometry.translate(x,y,z);crownParts.push(geometry);
  }
  let crown=mergeGeometries(crownParts);for(const geometry of crownParts)geometry.dispose();
  const farParts=[new THREE.IcosahedronGeometry(4.6,0),new THREE.IcosahedronGeometry(3.2,0),new THREE.IcosahedronGeometry(3,0)];farParts[1].translate(-2,0,1);farParts[2].translate(2,-.5,-1.5);let farCrown=mergeGeometries(farParts);for(const geometry of farParts)geometry.dispose();
  if(environment.trees==='conifer'){
    crown.dispose();farCrown.dispose();const layers=[];
    for(let i=0;i<3;i++){const g=new THREE.ConeGeometry(4.6-i*.85,7-i*.6,9);g.translate(0,i*2.2-1,0);layers.push(g);}
    crown=mergeGeometries(layers);for(const g of layers)g.dispose();farCrown=new THREE.ConeGeometry(4.4,12,5);farCrown.translate(0,1.5,0);
  }else if(environment.trees==='tropical'){crown.scale(1.1,.78,1.1);farCrown.scale(1.1,.78,1.1);}
  const trunk=new THREE.CylinderGeometry(.23,.48,7.8,7),farTrunk=new THREE.CylinderGeometry(.25,.48,7.8,4);farTrunk.translate(0,-4.2,0);
  const tint=(g:THREE.BufferGeometry,c:THREE.Color)=>{const colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));};
  const lowCrown=farCrown.index?farCrown.toNonIndexed():farCrown,lowTrunk=farTrunk.toNonIndexed();
  tint(lowCrown,new THREE.Color(0xffffff));tint(lowTrunk,new THREE.Color(0x8c8069));
  const farTree=mergeGeometries([lowCrown,lowTrunk]);if(lowCrown!==farCrown)lowCrown.dispose();lowTrunk.dispose();farCrown.dispose();farTrunk.dispose();farCrown=farTree;farLeaves.vertexColors=true;
  const hiddenTrunk=new THREE.BufferGeometry();hiddenTrunk.setAttribute('position',new THREE.Float32BufferAttribute([],3));hiddenTrunk.setIndex([]);
  const stamp=new THREE.Object3D(),chunks=Math.ceil(track.length/180);
  const cells=new Map<string,{p:THREE.Vector3;s:number;angle:number;color:THREE.Color}[]>();
  for(let chunk=0;chunk<chunks;chunk++){
    const deepForest=track.circuit.id==='monza'||track.circuit.id==='spa',density=deepForest?environment.density*3:environment.density;
    for(let j=0;j<density;j++){
      const id=chunk*density+j,t=(chunk+j/density)/chunks,side=j%2?1:-1,band=Math.floor(j/2)%4,offset=deepForest?(band===0?30+random()*25:band===1?60+random()*65:125+random()*150):(band===0?25+random()*20:band===1?44+random()*40:80+random()*45),p=track.point(t).addScaledVector(track.normal(t),side*offset);
      if(!isClear(p))continue;p.y=track.sceneryHeight(p.x,p.z);
      const plan={p,s:.8+random()*.65,angle:id*2.39996,color:new THREE.Color(environment.foliage).lerp(new THREE.Color(0xd8dcc2),.12).multiplyScalar(.85+random()*.3)};
      if(track.scenerySpace.intersectsReserved(sceneryFootprint(p,0,-8,8,-8,8),1))continue;
      const key=`${Math.floor(p.x/128)}/${Math.floor(p.z/128)}`,plans=cells.get(key);if(plans)plans.push(plan);else cells.set(key,[plan]);
    }
  }
  // Local world cells keep a distant tree from forcing a long roadside strip
  // into its expensive foliage/shadow LOD.
  for(const plans of cells.values()){
    if(!plans.length)continue;
    const canopy=new THREE.InstancedMesh(crown,leaves,plans.length),trunks=new THREE.InstancedMesh(trunk,bark,plans.length);
    plans.forEach((plan,i)=>{
      stamp.rotation.set(0,plan.angle,0);stamp.scale.set(plan.s,plan.s,plan.s);stamp.position.set(plan.p.x,plan.p.y+8.1*plan.s,plan.p.z);stamp.updateMatrix();canopy.setMatrixAt(i,stamp.matrix);canopy.setColorAt(i,plan.color);
      stamp.scale.set(plan.s,plan.s,plan.s);stamp.position.y=plan.p.y+3.9*plan.s;stamp.updateMatrix();trunks.setMatrixAt(i,stamp.matrix);
    });
    canopy.computeBoundingSphere();trunks.computeBoundingSphere();
    canopy.userData.worldBounds=canopy.boundingSphere!.clone();trunks.userData.worldBounds=trunks.boundingSphere!.clone();canopy.userData.nearGeometry=crown;canopy.userData.farGeometry=farCrown;canopy.userData.nearMaterial=leaves;canopy.userData.farMaterial=farLeaves;
    trunks.userData.nearGeometry=trunk;trunks.userData.farGeometry=hiddenTrunk;
    canopy.castShadow=trunks.castShadow=true;canopy.receiveShadow=trunks.receiveShadow=true;group.add(canopy,trunks);
  }
  return group;
}
