import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Track} from './Track';

export function landscapeShade(x:number,z:number){return .9+.055*Math.sin(x*.019+Math.sin(z*.013)*2)+.035*Math.sin(z*.041+x*.009)+.025*Math.sin(x*.13-z*.07);}
/** Clustered crowns, leaf cutouts and local batches replace identical faceted cones. */
export function createWoodland(track:Track,isClear:(p:THREE.Vector3)=>boolean){
  const group=new THREE.Group();group.name='woodland';
  const buildings=[{t:.035,offset:31,along:130,minNormal:-16,maxNormal:16},...[.007,.028,.15,.215,.35,.45,.59,.74,.9].map(t=>({t,offset:-37,along:36,minNormal:-22,maxNormal:10}))].map(area=>({...area,center:track.point(area.t).addScaledVector(track.normal(area.t),area.offset),forward:track.tangent(area.t),normal:track.normal(area.t)}));
  const data=new Uint8Array(128*128*4);let seed=329;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4,vein=Math.sin(x*.8+Math.sin(y*.5)*2),shade=.7+random()*.45;
    data[i]=52*shade;data[i+1]=78*shade;data[i+2]=39*shade;data[i+3]=vein+random()*.9>-.55?255:0;
  }
  const texture=new THREE.DataTexture(data,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const leaves=new THREE.MeshStandardMaterial({map:texture,alphaTest:.3,alphaToCoverage:true,roughness:1,side:THREE.DoubleSide});
  const bark=new THREE.MeshStandardMaterial({color:0x615747,roughness:1});
  const crownParts:THREE.BufferGeometry[]=[];
  for(const [x,y,z,s] of [[0,1,0,3.8],[-2.2,.1,.4,2.8],[2.1,0,-.2,2.9],[.6,-.1,2.4,2.7],[-.4,-.4,-2.3,2.8]]){
    const geometry=new THREE.IcosahedronGeometry(s,1);geometry.scale(1,1.15,1);geometry.translate(x,y,z);crownParts.push(geometry);
  }
  const crown=mergeGeometries(crownParts);for(const geometry of crownParts)geometry.dispose();
  const farParts=[new THREE.IcosahedronGeometry(4.6,0),new THREE.IcosahedronGeometry(3.2,0),new THREE.IcosahedronGeometry(3,0)];farParts[1].translate(-2,0,1);farParts[2].translate(2,-.5,-1.5);const farCrown=mergeGeometries(farParts);for(const geometry of farParts)geometry.dispose();
  const trunk=new THREE.CylinderGeometry(.23,.48,7.8,7),stamp=new THREE.Object3D(),chunks=Math.ceil(track.length/180);
  for(let chunk=0;chunk<chunks;chunk++){
    const plans:{p:THREE.Vector3;s:number;angle:number;color:THREE.Color}[]=[];
    for(let j=0;j<26;j++){
      const id=chunk*26+j,t=(chunk+j/26)/chunks,side=j%2?1:-1,band=j%3,offset=band===0?24+random()*20:band===1?44+random()*40:80+random()*45,p=track.point(t).addScaledVector(track.normal(t),side*offset);
      if(!isClear(p))continue;
      const plan={p,s:.8+random()*.65,angle:id*2.39996,color:new THREE.Color().setHSL(.24+random()*.07,.26+random()*.12,.64+random()*.13)};
      if(buildings.some(area=>{const dx=p.x-area.center.x,dz=p.z-area.center.z,along=dx*area.forward.x+dz*area.forward.z,normal=dx*area.normal.x+dz*area.normal.z;return Math.abs(along)<area.along&&normal>area.minNormal&&normal<area.maxNormal;}))continue;
      plans.push(plan);
    }
    if(!plans.length)continue;
    const canopy=new THREE.InstancedMesh(crown,leaves,plans.length),trunks=new THREE.InstancedMesh(trunk,bark,plans.length);
    plans.forEach((plan,i)=>{
      stamp.rotation.set(0,plan.angle,0);stamp.scale.set(plan.s,plan.s*(.9+(i%3)*.12),plan.s);stamp.position.set(plan.p.x,8.1*plan.s,plan.p.z);stamp.updateMatrix();canopy.setMatrixAt(i,stamp.matrix);canopy.setColorAt(i,plan.color);
      stamp.scale.set(plan.s,plan.s,plan.s);stamp.position.y=3.9*plan.s;stamp.updateMatrix();trunks.setMatrixAt(i,stamp.matrix);
    });
    canopy.computeBoundingSphere();trunks.computeBoundingSphere();
    canopy.userData.worldBounds=canopy.boundingSphere!.clone();trunks.userData.worldBounds=trunks.boundingSphere!.clone();canopy.userData.nearGeometry=crown;canopy.userData.farGeometry=farCrown;
    canopy.castShadow=trunks.castShadow=true;canopy.receiveShadow=trunks.receiveShadow=true;group.add(canopy,trunks);
  }
  return group;
}
