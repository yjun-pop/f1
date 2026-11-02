import * as THREE from 'three';
import type {Track} from './Track';
import {GRAPHICS_PROFILES,type GraphicsTier} from './Graphics';

/** Circuit landmarks use static meshes/local instance batches, never a light
 * or shadow map per building. They are simplified game scenery. */
export function createCircuitScenery(track:Track){
  const root=new THREE.Group();root.name='circuit-landmarks';
  const chunks:{group:THREE.Group;center:THREE.Vector3;radius:number}[]=[];
  const register=(group:THREE.Group)=>{group.updateMatrixWorld(true);const sphere=new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());chunks.push({group,center:sphere.center,radius:sphere.radius});root.add(group);};
  const city=track.circuit.environment==='city',night=!!track.circuit.night;
  const samples=Array.from({length:Math.ceil(track.length/12)},(_,i)=>track.point(i/Math.ceil(track.length/12)));
  const clear=(p:THREE.Vector3,radius:number)=>samples.every(q=>(p.x-q.x)**2+(p.z-q.z)**2>radius*radius);
  const stamp=new THREE.Object3D();
  if(city){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=night?'#101b2d':'#b9c2c5';ctx.fillRect(0,0,128,256);
    for(let y=0;y<16;y++)for(let x=0;x<8;x++){ctx.fillStyle=night?((x*7+y*3)%5?'#dfc890':'#182638'):'#536977';ctx.fillRect(x*16+4,y*16+4,8,8);}
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map,color:night?0x8996b2:0xe7ddd0,roughness:.86,emissiveMap:map,emissive:night?0xb7d6ff:0x000000,emissiveIntensity:night?.7:0});
    const geometry=new THREE.BoxGeometry(1,1,1),count=Math.ceil(track.length/250);
    for(let chunk=0;chunk<count;chunk++){
      const group=new THREE.Group();group.name='city-block';const buildings:{p:THREE.Vector3;w:number;h:number;d:number;angle:number}[]=[];
      for(let j=0;j<8;j++){
        const t=(chunk+(j+.5)/8)/count,p=track.point(t),n=track.normal(t),side=j%2?1:-1;
        p.addScaledVector(n,side*(43+(j%3)*18));const w=14+(j%3)*5,d=15+(j%2)*6,h=night?24+((chunk*17+j*11)%70):9+((chunk*7+j*5)%24);
        if(clear(p,Math.hypot(w,d)*.5+12))buildings.push({p,w,h,d,angle:Math.atan2(track.tangent(t).x,track.tangent(t).z)});
      }
      if(!buildings.length)continue;
      const mesh=new THREE.InstancedMesh(geometry,material,buildings.length);mesh.name='city-buildings';
      buildings.forEach((b,i)=>{stamp.position.set(b.p.x,b.h/2,b.p.z);stamp.rotation.set(0,b.angle,0);stamp.scale.set(b.w,b.h,b.d);stamp.updateMatrix();mesh.setMatrixAt(i,stamp.matrix);mesh.setColorAt(i,new THREE.Color().setHSL(.57+(i%3)*.025,.1,night?.63:.8));});
      mesh.computeBoundingSphere();group.add(mesh);register(group);
    }
    stamp.scale.set(1,1,1);
  }
  const water=(center:THREE.Vector3,width:number,depth:number)=>{
    const positions:number[]=[],indices:number[]=[];
    for(let x=-width/2;x<width/2;x+=20)for(let z=-depth/2;z<depth/2;z+=20){
      const corners=[[x,z],[x+20,z],[x,z+20],[x+20,z+20]].map(([a,b])=>new THREE.Vector3(center.x+a,-.045,center.z+b));
      if(!corners.every(p=>clear(p,28)))continue;const i=positions.length/3;for(const p of corners)positions.push(p.x,p.y,p.z);indices.push(i,i+2,i+1,i+1,i+2,i+3);
    }
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const group=new THREE.Group();group.name='harbour-water';group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:night?0x102c43:0x237b93,roughness:.22,metalness:.3})));register(group);
  };
  if(track.circuit.id==='monaco'){
    const tabac=track.sections.find(s=>s.number===12)!;water(track.point(tabac.progress).addScaledVector(track.normal(tabac.progress),-155),360,440);
  }
  if(track.circuit.id==='singapore')water(track.point(.52).addScaledVector(track.normal(.52),-180),480,350);
  if(track.circuit.id==='montreal'){water(track.point(.23).addScaledVector(track.normal(.23),150),360,600);water(track.point(.7).addScaledVector(track.normal(.7),150),360,600);}
  if(track.circuit.id==='interlagos'){
    const from=track.sections[0].progress-50/track.length,to=track.sections[2].progress+50/track.length,rows=Math.ceil((to-from)*track.length/3),positions:number[]=[],colors:number[]=[],indices:number[]=[];
    for(const side of[-1,1]){
      const base=positions.length/3;
      for(let i=0;i<=rows;i++){
        const t=THREE.MathUtils.lerp(from,to,i/rows),p=track.roadPoint(t),n=track.roadNormal(t);
        for(const [offset,color]of[[11.2,0x1b7950],[13.5,0x1b7950],[13.65,0xe5cd44],[14.2,0xe5cd44]]){positions.push(p.x+n.x*side*offset,p.y+.016,p.z+n.z*side*offset);const c=new THREE.Color(color);colors.push(c.r,c.g,c.b);}
        if(i<rows)for(let j=0;j<3;j++){const a=base+i*4+j;indices.push(a,a+1,a+4,a+1,a+5,a+4);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const group=new THREE.Group();group.name='senna-s-runoff';group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.95})));register(group);
  }
  if(track.circuit.id==='montreal'){
    const t=track.sections.find(s=>s.number===14)!.progress,group=new THREE.Group();group.name='wall-of-champions';group.position.copy(track.point(t)).addScaledVector(track.normal(t),-17.5);group.rotation.y=Math.atan2(track.tangent(t).x,track.tangent(t).z);
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f1ede1';ctx.fillRect(0,0,1024,96);ctx.fillStyle='#b51e37';ctx.font='bold 56px sans-serif';ctx.textAlign='center';ctx.fillText('WALL OF CHAMPIONS',512,67);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(30,1.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));panel.position.y=2;panel.rotation.y=-Math.PI/2;group.add(panel);register(group);
  }
  if(track.circuit.tunnel){
    const start=track.sections.find(s=>s.number===track.circuit.tunnel!.from)!.progress+30/track.length;
    const end=track.sections.find(s=>s.number===track.circuit.tunnel!.to)!.progress-65/track.length;
    const rows=Math.max(2,Math.ceil((end-start)*track.length/5)),positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=rows;i++){
      const t=THREE.MathUtils.lerp(start,end,i/rows),p=track.point(t),n=track.normal(t);
      for(const [side,height]of[[-1,0],[-1,5.8],[1,5.8],[1,0]])positions.push(p.x+n.x*side*12.4,p.y+height,p.z+n.z*side*12.4);
      if(i<rows)for(let face=0;face<3;face++){const k=i*4+face;indices.push(k,k+1,k+4,k+1,k+5,k+4);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const group=new THREE.Group();group.name='monaco-tunnel';const shell=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x5e6c78,roughness:.94,side:THREE.DoubleSide}));shell.castShadow=true;group.add(shell);
    const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,.12,2.8),new THREE.MeshBasicMaterial({color:0xf1f2d9}),Math.floor(rows/3)+1);
    for(let i=0;i<lamps.count;i++){const t=THREE.MathUtils.lerp(start,end,i/Math.max(1,lamps.count-1)),p=track.point(t);stamp.position.copy(p);stamp.position.y+=5.65;stamp.rotation.set(0,Math.atan2(track.tangent(t).x,track.tangent(t).z),0);stamp.updateMatrix();lamps.setMatrixAt(i,stamp.matrix);}group.add(lamps);register(group);
  }
  if(track.circuit.overpass){
    const b=track.circuit.overpass,positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=24;i++){
      const t=b.progress+(i/24-.5)*100/track.length,p=track.roadPoint(t),n=track.roadNormal(t);
      for(const [side,y]of[[-1,-.18],[1,-.18],[1,-.95],[-1,-.95]])positions.push(p.x+n.x*side*11.8,p.y+y,p.z+n.z*side*11.8);
      if(i<24)for(let j=0;j<4;j++){const a=i*4+j,c=i*4+(j+1)%4;indices.push(a,c,a+4,c,c+4,a+4);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const group=new THREE.Group();group.name='suzuka-overpass';group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x727e87,roughness:.9,side:THREE.DoubleSide})));
    const supports=new THREE.InstancedMesh(new THREE.BoxGeometry(1.4,1,1.4),new THREE.MeshStandardMaterial({color:0x9ca4a4,roughness:.9}),4);let i=0;
    for(const d of[-32,32])for(const side of[-1,1]){const t=b.progress+d/track.length,p=track.point(t).addScaledVector(track.normal(t),side*13),h=p.y-1;stamp.position.set(p.x,h/2,p.z);stamp.scale.set(1,h,1);stamp.rotation.set(0,0,0);stamp.updateMatrix();supports.setMatrixAt(i++,stamp.matrix);}stamp.scale.set(1,1,1);group.add(supports);register(group);
  }
  root.userData.chunks=chunks;return root;
}
export function updateCircuitScenery(root:THREE.Group,position:THREE.Vector3,tier:GraphicsTier){
  for(const c of root.userData.chunks as {group:THREE.Group;center:THREE.Vector3;radius:number}[])c.group.visible=c.center.distanceTo(position)-c.radius<GRAPHICS_PROFILES[tier].viewFar*.7;
}
