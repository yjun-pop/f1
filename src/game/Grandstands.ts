import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Track} from './Track';
import type {GraphicsTier} from './Graphics';
import {sceneryFootprint,type SceneryFootprint} from './ScenerySpace';
import {containsWater} from './RegionalWaters';

export const GRANDSTAND_PROGRESS=[.007,.0175,.028,.040,.052,.15,.215,.35,.45,.59,.74,.9];

export function createGrandstands(track:Track){
  const seatMaterial=new THREE.MeshStandardMaterial({roughness:.85});
  const steps:THREE.BufferGeometry[]=[];
  for(let row=0;row<6;row++){const g=new THREE.BoxGeometry(55,.8,2.4);g.translate(0,row*.9+.8,row*2.1);steps.push(g);}
  const terraces=mergeGeometries(steps);for(const g of steps)g.dispose();
  const roof=new THREE.BoxGeometry(58,.3,17),seat=new THREE.BoxGeometry(.55,.16,.55),post=new THREE.BoxGeometry(.18,8.5,.18),bodyParts:THREE.BufferGeometry[]=[];
  for(const [w,h,d,x,y,z] of [[.4,.45,.24,0,.39,0],[.35,.17,.42,0,.08,-.1],[.095,.36,.12,-.245,.3,-.04],[.095,.36,.12,.245,.3,-.04]]){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);bodyParts.push(g);}
  const body=mergeGeometries(bodyParts);for(const g of bodyParts)g.dispose();
  const farBody=new THREE.PlaneGeometry(.48,.83);farBody.translate(0,.4,-.03);
  const crowdCanvas=document.createElement('canvas');crowdCanvas.width=32;crowdCanvas.height=64;const crowdContext=crowdCanvas.getContext('2d')!;
  crowdContext.fillStyle='#fff';crowdContext.beginPath();crowdContext.arc(16,11,8,0,Math.PI*2);crowdContext.fill();crowdContext.fillRect(7,20,18,42);
  const crowdMap=new THREE.CanvasTexture(crowdCanvas),farShirts=new THREE.MeshBasicMaterial({map:crowdMap,alphaTest:.5,side:THREE.DoubleSide});
  const benchParts:THREE.BufferGeometry[]=[];
  for(let row=0;row<6;row++)for(let band=0;band<3;band++){const g=new THREE.BoxGeometry(17.6,.16,.55);g.translate(-17.3+band*17.6,row*.9+1.29,row*2.1);const colors=new Float32Array(g.getAttribute('position').count*3),color=new THREE.Color([0x8a3136,0xbdc6bf,0x3b675d][band]);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));benchParts.push(g);}
  const benchGeometry=mergeGeometries(benchParts);for(const g of benchParts)g.dispose();const benchMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  body.computeBoundingBox();farBody.computeBoundingBox();const bodyBounds=body.boundingBox!.clone().union(farBody.boundingBox!);
  for(const geometry of [body,farBody]){geometry.boundingBox=bodyBounds.clone();geometry.boundingSphere=bodyBounds.getBoundingSphere(new THREE.Sphere());}
  const head=new THREE.IcosahedronGeometry(.125,0);head.translate(0,.75,0);
  const shirts=new THREE.MeshStandardMaterial({roughness:1}),skin=new THREE.MeshStandardMaterial({roughness:1}),stamp=new THREE.Object3D();
  const structureParts:THREE.BufferGeometry[]=[];
  const structurePart=(source:THREE.BufferGeometry,color:number,x:number,y:number,z:number)=>{const g=source.clone();g.translate(x,y,z);const c=new THREE.Color(color),values=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(values,3));structureParts.push(g);};
  structurePart(terraces,0x47545b,0,0,0);structurePart(roof,0xcbd6d5,0,9,5);
  for(let j=0;j<8;j++)structurePart(post,0x263b36,-26+(j%4)*17.3,4.4,j<4?-.6:12);
  const structureGeometry=mergeGeometries(structureParts);for(const g of structureParts)g.dispose();terraces.dispose();roof.dispose();post.dispose();
  const structureMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75});
  const colors=[0xc83b35,0xd4d7d4,0x325794,0xe7bd4d,0x323b47,0x58a396,0x795d9c,0xbd5c42],tones=[0xe4b18b,0xb97f59,0x81543e,0xc99573];
  // Every circuit uses the full canopy/support footprint, including curves
  // returning behind the stand. Keep safe stands close rather than removing
  // roadside scenery merely because its original placement was obstructed.
  return GRANDSTAND_PROGRESS.flatMap((t,standIndex)=>{
    const stand=new THREE.Group();stand.name='grandstand';stand.userData.progress=t;
    let footprint:SceneryFootprint|undefined,chosenYaw=0;
    for(const shift of [0,-15,15,-30,30,-60,60,-90,90]){
      const progress=((t+shift/track.length)%1+1)%1,yaw=Math.atan2(track.tangent(progress).x,track.tangent(progress).z)+Math.PI/2;
      for(let offset=37;offset<=109;offset+=6){
        stand.position.copy(track.point(progress)).addScaledVector(track.normal(progress),-offset);stand.position.y=track.sceneryHeight(stand.position.x,stand.position.z);
        const candidate=sceneryFootprint(stand.position,yaw,-29,29,-3.5,13.5);
        if(track.scenerySpace.intersectsFootprint(candidate,17)||track.scenerySpace.intersectsReserved(candidate,1.5))continue;
        const c=Math.cos(yaw),s=Math.sin(yaw);
        if([-1,0,1].some(x=>[-1,0,1].some(z=>containsWater(candidate.x+c*x*candidate.halfX+s*z*candidate.halfZ,candidate.z-s*x*candidate.halfX+c*z*candidate.halfZ,track.waters))))continue;
        footprint=candidate;chosenYaw=yaw;stand.userData.offset=offset;stand.userData.progress=progress;stand.userData.sourceProgress=t;break;
      }
      if(footprint)break;
    }
    if(!footprint)return [];
    track.scenerySpace.reserveFootprint(footprint);stand.rotation.y=chosenYaw;stand.updateMatrix();stand.userData.footprint=footprint;
    const structure=new THREE.Mesh(structureGeometry,structureMaterial);structure.name='grandstand-structure';structure.castShadow=structure.receiveShadow=true;
    const seats=new THREE.InstancedMesh(seat,seatMaterial,360),people=new THREE.InstancedMesh(body,shirts,360),heads=new THREE.InstancedMesh(head,skin,360);people.name='spectator-bodies';heads.name='spectator-heads';
    seats.name='grandstand-seats';people.userData.nearGeometry=body;people.userData.farGeometry=farBody;people.userData.nearMaterial=shirts;people.userData.farMaterial=farShirts;
    const benches=new THREE.Mesh(benchGeometry,benchMaterial);benches.name='grandstand-far-benches';
    for(let row=0;row<6;row++)for(let col=0;col<60;col++){
      const i=row*60+col;stamp.rotation.set(0,0,0);stamp.scale.setScalar(1);stamp.position.set(-26+col*.88,row*.9+1.29,row*2.1);stamp.updateMatrix();seats.setMatrixAt(i,stamp.matrix);seats.setColorAt(i,new THREE.Color([0x8a3136,0xbdc6bf,0x3b675d][Math.floor(col/20)]));
      const hash=((i+1)*2654435761+standIndex*1013904223)>>>0,height=.88+(hash%23)/100;stamp.position.x+=((hash>>>8)%11-5)*.012;stamp.position.y+=.09;stamp.scale.set(1,height,1);stamp.rotation.y=((hash>>>16)%15-7)*.025;stamp.updateMatrix();people.setMatrixAt(i,stamp.matrix);heads.setMatrixAt(i,stamp.matrix);people.setColorAt(i,new THREE.Color(colors[(hash>>>4)%colors.length]));heads.setColorAt(i,new THREE.Color(tones[(hash>>>12)%tones.length]));
    }
    stand.add(structure,seats,people,heads,benches);
    return [stand];
  });
}

export function updateGrandstands(stands:readonly THREE.Group[],position:THREE.Vector3,tier:GraphicsTier){
  const range={low:200,medium:320,high:500}[tier],detail={low:65,medium:100,high:160}[tier];
  for(const stand of stands){
    const distance=Math.max(0,stand.position.distanceTo(position)-32),people=stand.getObjectByName('spectator-bodies') as THREE.InstancedMesh,heads=stand.getObjectByName('spectator-heads')!;
    people.visible=distance<range;people.geometry=distance<detail?people.userData.nearGeometry:people.userData.farGeometry;people.material=distance<detail?people.userData.nearMaterial:people.userData.farMaterial;heads.visible=distance<detail;
    stand.getObjectByName('grandstand-seats')!.visible=distance<detail;
    stand.getObjectByName('grandstand-far-benches')!.visible=distance>=detail;
  }
}
