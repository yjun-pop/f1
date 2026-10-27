import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Distant rivals retain their colour/wheels/wings in three small batches. */
export function createTrafficCar(color:number){
  const group=new THREE.Group();group.name='traffic-silhouette';
  const paint:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[],rubber:THREE.BufferGeometry[]=[];
  const box=(parts:THREE.BufferGeometry[],w:number,h:number,d:number,x:number,y:number,z:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(g);};
  box(paint,1.1,.45,3.1,0,.48,-.4);box(paint,.4,.18,2.1,0,.54,1.5);
  box(dark,1.72,.12,4.8,0,.2,-.1);box(dark,2.12,.1,.65,0,.3,2.7);box(dark,2.1,.12,.65,0,1.25,-2.4);
  for(const side of [-1,1])box(dark,.06,.6,.6,side*1.02,.93,-2.4);
  const helmet=new THREE.IcosahedronGeometry(.25,0);helmet.translate(0,1.03,-.45);dark.push(helmet);
  for(const side of [-1,1])for(const front of [false,true]){const wheel=new THREE.CylinderGeometry(.455,.455,front?.34:.42,10);wheel.rotateZ(Math.PI/2);wheel.translate(side*.91,.5,front?1.55:-1.85);rubber.push(wheel);}
  for(const [parts,tint] of [[paint,color],[dark,0x202730],[rubber,0x11161b]] as const){const faces=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(faces);for(let i=0;i<parts.length;i++){if(faces[i]!==parts[i])faces[i].dispose();parts[i].dispose();}group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:tint,roughness:.75})));}
  return group;
}
