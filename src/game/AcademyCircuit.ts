import * as THREE from 'three';
import type {CircuitDefinition} from './Circuits';
import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';

// A private layout using the flat daytime profile; never a race/record selection.
const points:number[][]=[[0,0],[0,300],[0,600],[0,900],[0,1200]];
const arc=(x:number,z:number,from:number)=>{for(let i=1;i<=8;i++){const angle=from-i*Math.PI/16;points.push([x+60*Math.cos(angle),z+60*Math.sin(angle)]);}};
arc(60,1200,Math.PI);points.push([200,1260],[340,1260]);arc(340,1200,Math.PI/2);
points.push([400,900],[400,600],[400,300],[400,0]);arc(340,0,0);points.push([200,-60],[60,-60]);arc(60,0,-Math.PI/2);points.pop();
export const ACADEMY_CIRCUIT:CircuitDefinition={
 id:'monza',training:true,drs:[],name:'ACADEMY',label:'아카데미 트랙',country:'TRAINING CENTER',
 length:3340,cornerCount:4,description:'가속·제동·코너링 전용 훈련장',tagline:'DRIVER ACADEMY',
 origin:[0,0],points,sections:[[1,'TRAINING CORNER',17.5,1242.5],[2,'RETURN TURN',382.5,1242.5],[3,'RETURN TURN',382.5,-42.5],[4,'RETURN TURN',17.5,-42.5]].map(([number,name,x,z])=>({number:Number(number),name:String(name),coordinate:[Number(x)/111320,-Number(z)/111320],braking:true})),
 formationEnd:100,referenceLap:95,woodlandDensity:0,pitProgress:.12,environment:'park'
};
export function academyGeometry(track:Track,planner:LinePlanner){
 const section=track.sections.find(s=>s.number===1)!.progress,apex=(planner.apices.filter(a=>Math.abs(a.progress-section)*track.length<180).sort((a,b)=>a.progress-b.progress)[0]?.progress??section)*track.length;
 const group=planner.apices.filter(a=>a.progress*track.length>=apex&&a.progress*track.length<apex+180);
 return {apex,brake:apex-80,exit:Math.max(apex+90,...group.map(a=>a.progress*track.length+55)),target:Math.max(14,Math.min(26,planner.speed(apex/track.length)*.9))};
}
export function createAcademyFacilities(track:Track){
 const group=new THREE.Group();group.name='academy-facilities';
 const concrete=new THREE.MeshStandardMaterial({color:0xabb9bf,roughness:.86}),glass=new THREE.MeshStandardMaterial({color:0x254d61,roughness:.35,metalness:.35});
 const center=track.point(.16).addScaledVector(track.normal(.16),-42),building=new THREE.Group();building.position.copy(center);building.rotation.y=Math.atan2(track.tangent(.16).x,track.tangent(.16).z);
 const box=new THREE.Mesh(new THREE.BoxGeometry(14,5,36),concrete);box.position.y=2.5;building.add(box);const window=new THREE.Mesh(new THREE.BoxGeometry(14.1,1.4,30),glass);window.position.y=3.4;building.add(window);group.add(building);
 const cone=new THREE.ConeGeometry(.3,.8,8),orange=new THREE.MeshStandardMaterial({color:0xf38d54,roughness:.9}),count=100,cones=new THREE.InstancedMesh(cone,orange,count),stamp=new THREE.Object3D();
 for(let i=0;i<count;i++){const t=(360+i*12)/track.length,p=track.point(t).addScaledVector(track.normal(t),i%2?12:-12);stamp.position.set(p.x,.4,p.z);stamp.updateMatrix();cones.setMatrixAt(i,stamp.matrix);}group.add(cones);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#173544';ctx.fillRect(0,0,512,96);ctx.fillStyle='#d7f4ee';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.fillText('DRIVER ACADEMY',256,62);
 const board=new THREE.Mesh(new THREE.PlaneGeometry(12,2.25),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));board.position.copy(center).add(new THREE.Vector3(0,6,0));board.rotation.y=building.rotation.y;group.add(board);return group;
}
