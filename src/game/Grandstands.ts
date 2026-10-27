import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Track} from './Track';
import type {GraphicsTier} from './Graphics';

export const GRANDSTAND_PROGRESS=[.007,.0175,.028,.040,.052,.15,.215,.35,.45,.59,.74,.9];

export function createGrandstands(track:Track){
  const steel=new THREE.MeshStandardMaterial({color:0x263b36}),standMaterial=new THREE.MeshStandardMaterial({color:0x47545b}),seatMaterial=new THREE.MeshStandardMaterial({roughness:.85}),roofMaterial=new THREE.MeshStandardMaterial({color:0xcbd6d5,roughness:.65});
  const steps:THREE.BufferGeometry[]=[];
  for(let row=0;row<6;row++){const g=new THREE.BoxGeometry(55,.8,2.4);g.translate(0,row*.9+.8,row*2.1);steps.push(g);}
  const terraces=mergeGeometries(steps);for(const g of steps)g.dispose();
  const roof=new THREE.BoxGeometry(58,.3,17),seat=new THREE.BoxGeometry(.55,.16,.55),post=new THREE.BoxGeometry(.18,8.5,.18),bodyParts:THREE.BufferGeometry[]=[];
  for(const [w,h,d,x,y,z] of [[.4,.45,.24,0,.39,0],[.35,.17,.42,0,.08,-.1],[.095,.36,.12,-.245,.3,-.04],[.095,.36,.12,.245,.3,-.04]]){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);bodyParts.push(g);}
  const body=mergeGeometries(bodyParts);for(const g of bodyParts)g.dispose();
  const farBody=new THREE.BoxGeometry(.48,.83,.3);farBody.translate(0,.4,-.03);
  body.computeBoundingBox();farBody.computeBoundingBox();const bodyBounds=body.boundingBox!.clone().union(farBody.boundingBox!);
  for(const geometry of [body,farBody]){geometry.boundingBox=bodyBounds.clone();geometry.boundingSphere=bodyBounds.getBoundingSphere(new THREE.Sphere());}
  const head=new THREE.IcosahedronGeometry(.125,0);head.translate(0,.75,0);
  const shirts=new THREE.MeshStandardMaterial({roughness:1}),skin=new THREE.MeshStandardMaterial({roughness:1}),stamp=new THREE.Object3D();
  const colors=[0xc83b35,0xd4d7d4,0x325794,0xe7bd4d,0x323b47,0x58a396,0x795d9c,0xbd5c42],tones=[0xe4b18b,0xb97f59,0x81543e,0xc99573];
  return GRANDSTAND_PROGRESS.map((t,standIndex)=>{
    const stand=new THREE.Group();stand.name='grandstand';stand.userData.progress=t;
    const tier=new THREE.Mesh(terraces,standMaterial);tier.receiveShadow=true;
    const canopy=new THREE.Mesh(roof,roofMaterial);canopy.position.set(0,9,5);canopy.castShadow=canopy.receiveShadow=true;
    const seats=new THREE.InstancedMesh(seat,seatMaterial,360),supports=new THREE.InstancedMesh(post,steel,8),people=new THREE.InstancedMesh(body,shirts,360),heads=new THREE.InstancedMesh(head,skin,360);people.name='spectator-bodies';heads.name='spectator-heads';
    people.userData.nearGeometry=body;people.userData.farGeometry=farBody;
    for(let row=0;row<6;row++)for(let col=0;col<60;col++){
      const i=row*60+col;stamp.rotation.set(0,0,0);stamp.scale.setScalar(1);stamp.position.set(-26+col*.88,row*.9+1.29,row*2.1);stamp.updateMatrix();seats.setMatrixAt(i,stamp.matrix);seats.setColorAt(i,new THREE.Color([0x8a3136,0xbdc6bf,0x3b675d][Math.floor(col/20)]));
      const hash=((i+1)*2654435761+standIndex*1013904223)>>>0,height=.88+(hash%23)/100;stamp.position.x+=((hash>>>8)%11-5)*.012;stamp.position.y+=.09;stamp.scale.set(1,height,1);stamp.rotation.y=((hash>>>16)%15-7)*.025;stamp.updateMatrix();people.setMatrixAt(i,stamp.matrix);heads.setMatrixAt(i,stamp.matrix);people.setColorAt(i,new THREE.Color(colors[(hash>>>4)%colors.length]));heads.setColorAt(i,new THREE.Color(tones[(hash>>>12)%tones.length]));
    }
    for(let j=0;j<8;j++){stamp.scale.setScalar(1);stamp.rotation.set(0,0,0);stamp.position.set(-26+(j%4)*17.3,4.4,j<4?-.6:12);stamp.updateMatrix();supports.setMatrixAt(j,stamp.matrix);}
    stand.add(tier,canopy,seats,supports,people,heads);stand.position.copy(track.point(t)).addScaledVector(track.normal(t),-37);stand.rotation.y=Math.atan2(track.tangent(t).x,track.tangent(t).z)+Math.PI/2;
    return stand;
  });
}

export function updateGrandstands(stands:readonly THREE.Group[],position:THREE.Vector3,tier:GraphicsTier){
  const range={low:200,medium:320,high:500}[tier],detail={low:65,medium:100,high:160}[tier];
  for(const stand of stands){
    const distance=Math.max(0,stand.position.distanceTo(position)-32),people=stand.getObjectByName('spectator-bodies') as THREE.InstancedMesh,heads=stand.getObjectByName('spectator-heads')!;
    people.visible=distance<range;people.geometry=distance<detail?people.userData.nearGeometry:people.userData.farGeometry;heads.visible=distance<detail;
  }
}
