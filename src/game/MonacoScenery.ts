import * as THREE from 'three';
import type {Track} from './Track';
import {containsWater} from './RegionalWaters';
import {sceneryFootprint,type SceneryFootprint} from './ScenerySpace';
import {createSpatialChunks} from './TrackChunks';

/** Original Mediterranean architecture and marina assets. Static instance cells
 * share atlases/materials; window detail does not create individual objects. */
export function createMonacoScenery(track:Track,register:(group:THREE.Group)=>void){
  if(track.circuit.id!=='monaco')return;
  let seed=7481;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const stone=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.87}),trim=new THREE.MeshStandardMaterial({color:0xe9e2d1,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0x374f51,roughness:.56,metalness:.35}),glass=new THREE.MeshStandardMaterial({color:0x274b5a,roughness:.28,metalness:.45}),roof=new THREE.MeshStandardMaterial({color:0xa86a51,roughness:.9}),green=new THREE.MeshStandardMaterial({color:0x446849,roughness:.94}),wood=new THREE.MeshStandardMaterial({color:0x9e8863,roughness:.86}),white=new THREE.MeshStandardMaterial({color:0xe9ede5,roughness:.4,metalness:.12}),navy=new THREE.MeshStandardMaterial({color:0x1e3c50,roughness:.42,metalness:.2});
  green.side=THREE.DoubleSide;
  const texture=(canvas:HTMLCanvasElement,srgb=false)=>{const t=new THREE.CanvasTexture(canvas);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.minFilter=THREE.LinearMipmapLinearFilter;return t;};
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d')!;
  const roughCanvas=document.createElement('canvas');roughCanvas.width=512;roughCanvas.height=512;const rc=roughCanvas.getContext('2d')!;
  ctx.fillStyle='#ded8c6';ctx.fillRect(0,0,512,512);rc.fillStyle='#ededed';rc.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=4)for(let x=0;x<512;x+=4){ctx.fillStyle=`rgba(89,68,47,${random()*.045})`;ctx.fillRect(x,y,4,4);}
  for(let row=0;row<8;row++){
    ctx.fillStyle='#c0b5a2';ctx.fillRect(0,row*64+60,512,2);ctx.fillStyle='#f0eada';ctx.fillRect(0,row*64+62,512,2);
    for(let col=0;col<4;col++){
      const x=col*128+42,y=row*64+10;ctx.fillStyle='#b5aa96';ctx.fillRect(x-4,y-3,50,46);ctx.fillStyle='#eee6d2';ctx.fillRect(x-2,y-2,46,42);
      ctx.fillStyle=(row+col)%3?'#3c6269':'#57737a';ctx.fillRect(x,y,42,37);rc.fillStyle='#555555';rc.fillRect(x,y,42,37);
      ctx.fillStyle='#182e38';ctx.fillRect(x,y,42,4);ctx.fillRect(x,y,3,37);ctx.fillStyle='#c2c4b4';ctx.fillRect(x+20,y,2,37);
      ctx.fillStyle='#586e63';for(const side of [-1,1]){const sx=x+(side<0?-18:44);ctx.fillRect(sx,y,15,37);ctx.fillStyle='#394f48';for(let k=0;k<8;k++)ctx.fillRect(sx+2,y+3+k*4,11,1);ctx.fillStyle='#586e63';}
      ctx.fillStyle='#f8edd6';ctx.fillRect(x-6,y+38,54,3);ctx.fillStyle='rgba(40,35,25,.25)';ctx.fillRect(x-6,y+41,54,3);
    }
  }
  const facade=new THREE.MeshStandardMaterial({map:texture(canvas,true),roughnessMap:texture(roughCanvas),roughness:.94,color:0xffffff});
  facade.map!.wrapT=facade.roughnessMap!.wrapT=THREE.RepeatWrapping;
  facade.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    #ifdef USE_INSTANCING
      #ifdef USE_MAP
        vMapUv.y *= length(instanceMatrix[1].xyz) / 25.6;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv.y *= length(instanceMatrix[1].xyz) / 25.6;
      #endif
    #endif`);};
  facade.customProgramCacheKey=()=> 'monaco-floor-atlas-v1';
  const box=new THREE.BoxGeometry(1,1,1),cone=new THREE.ConeGeometry(Math.SQRT1_2,1,4);cone.rotateY(Math.PI/4);
  const shapes={box,roof:cone,pole:new THREE.CylinderGeometry(1,1,1,7),dome:new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),ball:new THREE.IcosahedronGeometry(1,1),arch:new THREE.TorusGeometry(.5,.075,4,12,Math.PI),hull:yachtHull(),frond:palmFrond()};
  type Shape=keyof typeof shapes;
  const stamp=new THREE.Object3D(),buckets=new Map<string,{name:string;geometry:THREE.BufferGeometry;material:THREE.Material;detail:boolean;items:{matrix:THREE.Matrix4;color:number}[]}>();
  const emit=(name:string,shape:Shape,m:THREE.Material,p:THREE.Vector3,size:readonly number[],yaw=0,detail=false,color=0xffffff)=>{
    const key=`${name}/${shape}/${m.uuid}/${detail}/${Math.floor(p.x/220)}/${Math.floor(p.z/220)}`;let bucket=buckets.get(key);if(!bucket){bucket={name,geometry:shapes[shape],material:m,detail,items:[]};buckets.set(key,bucket);}
    stamp.position.copy(p);stamp.scale.set(size[0],size[1],size[2]);stamp.rotation.set(0,yaw,0);stamp.updateMatrix();bucket.items.push({matrix:stamp.matrix.clone(),color});
  };
  const local=(p:THREE.Vector3,yaw:number,x:number,y:number,z:number)=>p.clone().add(new THREE.Vector3(Math.cos(yaw)*x+Math.sin(yaw)*z,y,-Math.sin(yaw)*x+Math.cos(yaw)*z));
  const part=(name:string,p:THREE.Vector3,yaw:number,offset:readonly number[],size:readonly number[],m:THREE.Material=trim,shape:Shape='box',detail=false,color=0xffffff)=>emit(name,shape,m,local(p,yaw,...offset as [number,number,number]),size,yaw,detail,color);
  const lots:{footprint:SceneryFootprint;position:THREE.Vector3;height:number;kind:string}[]=[];
  const landCorners=(fp:SceneryFootprint)=>[-1,1].flatMap(x=>[-1,1].map(z=>local(new THREE.Vector3(fp.x,0,fp.z),fp.yaw,x*fp.halfX,0,z*fp.halfZ)));
  const valid=(p:THREE.Vector3,fp:SceneryFootprint)=>landCorners(fp).every(q=>!containsWater(q.x,q.z,track.waters))&&!track.scenerySpace.intersectsFootprint(fp,17)&&!track.scenerySpace.intersectsReserved(fp,1);
  const reserve=(p:THREE.Vector3,yaw:number,w:number,d:number,h:number,kind:string)=>{const fp=sceneryFootprint(p,yaw,-w/2-2,w/2+2,-d/2-3,d/2+2);if(!valid(p,fp))return false;track.scenerySpace.reserveFootprint(fp);p.y=Math.max(...landCorners(fp).map(q=>track.sceneryHeight(q.x,q.z)));lots.push({footprint:fp,position:p.clone(),height:h,kind});return true;};
  const tones=[0xf0d4b2,0xcfcabc,0xf4e6ce,0xc6d5cf,0xd6b39b,0xe3d6c4];
  const building=(p:THREE.Vector3,yaw:number,w:number,d:number,h:number,index:number,name='monaco-apartments')=>{
    const detailed=track.scenerySpace.distanceSquared(p.x,p.z,110)<110**2;
    const tone=tones[index%tones.length],base=Math.min(...[-1,1].flatMap(x=>[-1,1].map(z=>{const q=local(p,yaw,x*(w/2+2),0,z*(d/2+2.5));return track.sceneryHeight(q.x,q.z);}))),foundation=Math.max(.2,p.y-base+.15);
    part(name,p,yaw,[0,-foundation/2,0],[w+4,foundation,d+5],stone,'box',false,0xb1aaa0);part(name,p,yaw,[0,h/2,0],[w,h,d],facade,'box',false,tone);
    part(name,p,yaw,[0,.09,0],[w+4,.18,d+5],stone,'box',false,0xb1aaa0);
    part(name,p,yaw,[0,1.5,-d/2-.04],[w*.86,2.5,.12],glass);
    part(name,p,yaw,[0,3.1,-d/2-.6],[w*.98,.25,1.4],trim);
    const canopy=index%3===0?green:index%3===1?navy:roof;
    part(name,p,yaw,[0,2.9,-d/2-1],[w*.82,.12,1.9],canopy,'box',true);
    if(index%3){part(name,p,yaw,[0,h+.2,0],[w+1,.4,d+1],trim);part(name,p,yaw,[0,h+1.4,0],[w+1.2,2.2,d+1.2],roof,'roof');}
    else{part(name,p,yaw,[0,h+.2,0],[w+.6,.4,d+.6],trim);for(const x of [-.32,.28])part(name,p,yaw,[x*w,h+.9,d*.12],[2.2,1.3,2.7],metal,'box',true);}
    for(let y=6.4;detailed&&y<h-1;y+=3.2){
      part(name,p,yaw,[0,y,-d/2-.55],[w*.92,.18,1.5],trim,'box',true);
      part(name,p,yaw,[0,y+.75,-d/2-1.22],[w*.92,.08,.07],metal,'box',true);
      for(const x of[-.4,-.2,0,.2,.4])part(name,p,yaw,[x*w,y+.4,-d/2-1.22],[.055,.72,.055],metal,'box',true);
    }
    part(name,p,yaw,[0,h-.5,0],[w+.45,.35,d+.45],trim);
    if(detailed&&index%5===0){part(name,p,yaw,[w*.34,.8,-d/2-1.5],[1.5,1.6,.7],stone,'box',true,0x6b7774);part(name,p,yaw,[w*.34,1.7,-d/2-1.5],[1.7,.35,.9],green,'ball',true);}
  };
  // A recognizable, original Belle Époque terrace composition near Casino.
  const casinoSource=track.geographicPoint([7.4271,43.7390]);let casino:THREE.Vector3|undefined;
  for(let r=0;r<=240&&!casino;r+=24)for(let i=0;i<16;i++){
    const p=casinoSource.clone().add(new THREE.Vector3(Math.sin(i*Math.PI/8)*r,0,Math.cos(i*Math.PI/8)*r));if(reserve(p,.15,38,20,25,'casino')){casino=p;break;}
  }
  if(casino){
    const p=casino,yaw=.15,name='monaco-harbour-hotel';building(p,yaw,38,20,18,2,name);
    part(name,p,yaw,[0,19,0],[17,3,16],trim);part(name,p,yaw,[0,23,0],[7,6,7],roof,'dome');part(name,p,yaw,[0,30,0],[.18,4,.18],metal);
    for(const x of[-16,16]){part(name,p,yaw,[x,21,0],[7,8,9],facade,'box',false,0xf2dfc0);part(name,p,yaw,[x,25.2,0],[5,3.5,5],metal,'dome');}
    for(let x=-14;x<=14;x+=4){part(name,p,yaw,[x,3.5,-11.2],[2.6,3,.12],glass);part(name,p,yaw,[x,5,-11.3],[2.6,2.6,1],trim,'arch',true);part(name,p,yaw,[x-1.6,3,-11.1],[.35,5,.35],trim,'pole');}
    part(name,p,yaw,[0,.22,-7],[42,.3,12],stone,'box',false,0xbab3a5);
  }
  // Street frontage first, then compact terraced neighbourhoods on the hillside.
  let houses=0;
  for(let m=8;m<track.length;m+=19)for(const side of[-1,1]){
    const t=m/track.length,n=track.normal(t),f=track.tangent(t),yaw=Math.atan2(f.x,f.z)-side*Math.PI/2;
    const w=10+random()*8,d=9+random()*6,h=(5+Math.floor(random()*5))*3.2;
    for(const setback of[20,26,35,49]){const p=track.point(t).addScaledVector(n,side*(setback+d/2));if(reserve(p,yaw,w,d,h,'street')){building(p,yaw,w,d,h,houses++);break;}}
  }
  const districts:[[number,number],number,number,number][]=[[[7.422,43.739],7,5,29],[[7.4275,43.741],8,5,30],[[7.431,43.7395],6,6,29],[[7.4198,43.7353],5,5,28]];
  for(const [geo,cols,rows,spacing]of districts){const center=track.geographicPoint(geo);for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
    const p=center.clone().add(new THREE.Vector3((x-(cols-1)/2)*spacing+(random()-.5)*5,0,(z-(rows-1)/2)*spacing+(random()-.5)*5)),w=14+random()*8,d=13+random()*5,h=(5+Math.floor(random()*8))*3.2,yaw=.12;
    if(reserve(p,yaw,w,d,h,'hillside'))building(p,yaw,w,d,h,houses++);
  }}
  // Fill the urban hillside as connected neighbourhoods rather than a few
  // isolated landmark grids. Distant blocks retain atlas facades, not balconies.
  for(let x=track.bounds.min.x-180;x<track.bounds.max.x+200;x+=27)for(let z=track.bounds.min.z-200;z<track.bounds.max.z+180;z+=29){
    const p=new THREE.Vector3(x+(random()-.5)*4,0,z+(random()-.5)*4),w=14+random()*7,d=12+random()*7,h=(5+Math.floor(random()*9))*3.2,yaw=.12;
    if(reserve(p,yaw,w,d,h,'district'))building(p,yaw,w,d,h,houses++);
  }
  // Palms/lamps and benches belong to the pavement envelope of a checked lot.
  for(let i=0;i<lots.length;i+=3){const lot=lots[i];if(track.scenerySpace.distanceSquared(lot.position.x,lot.position.z,70)>=70**2)continue;const fp=lot.footprint,p=lot.position,yaw=fp.yaw,w=fp.halfX*2-4,d=fp.halfZ*2-5;
    const base=local(p,yaw,-w*.36,0,-d/2-1.65);
    emit('monaco-street-furniture','pole',metal,base.clone().add(new THREE.Vector3(0,3.1,0)),[.07,6.2,.07]);emit('monaco-street-furniture','box',trim,base.clone().add(new THREE.Vector3(0,6.2,0)),[.8,.15,.45]);
    if(i%2===0){const b=local(p,yaw,w*.32,0,-d/2-1.5);emit('monaco-palms','pole',wood,b.clone().add(new THREE.Vector3(0,3.5,0)),[.17,7,.17]);for(let leaf=0;leaf<7;leaf++)emit('monaco-palms','frond',green,b.clone().add(new THREE.Vector3(0,7,0)),[1,1,1],yaw+Math.PI/2+leaf*Math.PI/6);}
    part('monaco-street-furniture',p,yaw,[0,.6,-d/2-1.7],[2.4,.15,.6],wood,'box',true);
  }
  createUrbanGround(track,register);
  // Coastal retaining blocks follow the geographic harbour edge, not the road.
  const shore=[[7.4232,43.7349],[7.4245,43.7369],[7.4275,43.738],[7.4295,43.7374]] as const;
  for(let i=0;i<shore.length-1;i++){
    const a=track.geographicPoint(shore[i]),b=track.geographicPoint(shore[i+1]),dir=b.clone().sub(a),len=dir.length(),yaw=Math.atan2(dir.x,dir.z);dir.normalize();
    for(let m=0;m<len;m+=7){const p=a.clone().addScaledVector(dir,m+3.5),fp=sceneryFootprint(p,yaw,-1.5,1.5,-3.5,3.5);if(track.scenerySpace.intersectsFootprint(fp,17)||track.scenerySpace.intersectsReserved(fp,.5))continue;
      emit('monaco-quays','box',stone,p.clone().add(new THREE.Vector3(0,.4,0)),[3,1,7],yaw,false,0xaeafa0);emit('monaco-quays','box',trim,p.clone().add(new THREE.Vector3(0,.97,0)),[3.3,.15,7],yaw);
      emit('monaco-quays','pole',metal,p.clone().add(new THREE.Vector3(0,1.25,0)),[.12,.6,.12],0,true);
    }
  }
  let yachts=0;const boats:{footprint:SceneryFootprint;position:THREE.Vector3;width:number;length:number}[]=[];
  const moorings:{position:THREE.Vector3;yaw:number}[]=[];
  for(const geo of [[7.4267,43.7372],[7.4254,43.7359],[7.4235,43.7344]] as const){const center=track.geographicPoint(geo);for(let row=0;row<4;row++)for(let col=0;col<5;col++)moorings.push({position:center.clone().add(new THREE.Vector3((col-2)*23,0,(row-1.5)*29)),yaw:.22});}
  // Near-shore moorings stay visible from the street and the introduction views.
  for(const number of[6,10,17]){const section=track.sections.find(s=>s.number===number)!,p=track.point(section.progress),n=track.normal(section.progress),f=track.tangent(section.progress),yaw=Math.atan2(f.x,f.z);for(const offset of[-110,-80,-50,50,80,110])for(const along of[-50,-25,0,25,50])moorings.push({position:p.clone().addScaledVector(n,offset).addScaledVector(f,along),yaw});}
  for(const {position:p,yaw} of moorings){
      const w=5+random()*2.5,l=15+random()*8,fp=sceneryFootprint(p,yaw,-w/2,w/2,-l/2,l/2);
      const corners=[[-w/2,-l/2],[w/2,-l/2],[-w/2,l/2],[w/2,l/2]].map(([x,z])=>local(p,yaw,x,0,z));
      if(!corners.every(q=>containsWater(q.x,q.z,track.waters))||track.scenerySpace.intersectsFootprint(fp,38)||track.scenerySpace.intersectsReserved(fp,1))continue;
      track.scenerySpace.reserveFootprint(fp);yachts++;boats.push({footprint:fp,position:p.clone(),width:w,length:l});
      part('monaco-marina',p,yaw,[0,.6,0],[w,1.8,l],white,'hull');part('monaco-marina',p,yaw,[0,1.15,0],[w*1.015,.23,l*.96],navy,'hull');
      part('monaco-marina',p,yaw,[0,1.65,1],[w*.87,.25,l*.82],wood);part('monaco-marina',p,yaw,[0,2.3,1],[w*.75,1.3,l*.51],white);part('monaco-marina',p,yaw,[0,2.7,.9],[w*.77,.5,l*.49],glass);
      part('monaco-marina',p,yaw,[0,3.1,1.5],[w*.79,.2,l*.55],white);part('monaco-marina',p,yaw,[0,3.7,1.5],[w*.48,1,l*.3],glass);part('monaco-marina',p,yaw,[0,4.3,1.5],[w*.6,.2,l*.37],white);
      part('monaco-marina',p,yaw,[0,4.65,2],[.45,.45,.45],white,'ball',true);
      for(const side of[-1,1])part('monaco-marina',p,yaw,[side*w*.42,2.1,l*.03],[.055,.1,l*.72],metal,'box',true);
      for(const side of[-1,1])for(const z of[-.3,-.1,.1,.3])part('monaco-marina',p,yaw,[side*w*.42,1.95,l*z],[.055,.5,.055],metal,'box',true);
      // Mooring fingers share the static marina batches.
      const pier=local(p,yaw,w/2+1.6,.15,0);if(containsWater(pier.x,pier.z,track.waters))emit('monaco-marina','box',wood,pier,[1.2,.3,l*.9],yaw);
  }
  // Local instance cells allow frustum/distance culling; low tier hides accents.
  const color=new THREE.Color();for(const bucket of buckets.values())for(let start=0;start<bucket.items.length;start+=400){
    const items=bucket.items.slice(start,start+400),mesh=new THREE.InstancedMesh(bucket.geometry,bucket.material,items.length);mesh.name=bucket.name==='monaco-apartments'&&bucket.material===facade?'roadside-houses':bucket.name;mesh.userData.nearDetail=bucket.detail;
    items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,color.setHex(item.color));});mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=!bucket.detail&&bucket.material===facade;
    const group=new THREE.Group();group.name=bucket.name;group.add(mesh);register(group);
  }
  track.group.userData.monacoEnvironment={lots,boats,yachts,houses,atlasSize:512};
}

function createUrbanGround(track:Track,register:(g:THREE.Group)=>void){
  const a=track.geographicPoint([7.4175,43.742]),b=track.geographicPoint([7.434,43.732]),positions:number[]=[],colors:number[]=[],indices:number[]=[];const size=12,color=new THREE.Color();
  const tile=(x:number,z:number,step:number)=>{
    const center=new THREE.Vector3(x+step/2,0,z+step/2),corners=[[x,z],[x+step,z],[x,z+step],[x+step,z+step]];
    // The water renderer reserves a 30m shore/road safety strip. Pave it as
    // working quays rather than leaving an artificial grass beach in the port.
    const wet=corners.map(([px,pz])=>containsWater(px,pz,track.waters)),near=corners.some(([px,pz])=>track.scenerySpace.distanceSquared(px,pz,48)<48**2);
    if(step>3&&(wet.some(Boolean)&&!wet.every(Boolean)||wet.some(Boolean)&&near)){for(const dx of[0,step/2])for(const dz of[0,step/2])tile(x+dx,z+dz,step/2);return;}
    const fp=sceneryFootprint(center,0,-step/2,step/2,-step/2,step/2);
    if(track.scenerySpace.intersectsFootprint(fp,11.8)||!corners.every(([px,pz])=>!containsWater(px,pz,track.waters)||track.scenerySpace.distanceSquared(px,pz,37)<36**2))return;
    const k=positions.length/3,shade=.8+.1*Math.sin(x*.04)*Math.cos(z*.03);color.setHex(track.sceneryHeight(center.x,center.z)>8?0xb3ad9d:0xaaa99d).multiplyScalar(shade);
    for(const [px,pz]of corners){positions.push(px,track.sceneryHeight(px,pz)+.015,pz);colors.push(color.r,color.g,color.b);}indices.push(k,k+2,k+1,k+1,k+2,k+3);
  };
  for(let x=a.x;x<b.x;x+=size)for(let z=a.z;z<b.z;z+=size)tile(x,z,size);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const pixels=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,joint=x%32===0||y%32===0,v=joint?172:222+((x*13+y*23)%9);pixels[i]=v;pixels[i+1]=v;pixels[i+2]=v;pixels[i+3]=255;}const map=new THREE.DataTexture(pixels,128,128,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.needsUpdate=true;const uv:number[]=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]/12,positions[i+2]/12);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const group=createSpatialChunks(geometry,new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:.97}),220,'monaco-urban-ground');for(const child of [...group.children]){const tile=new THREE.Group();tile.name='monaco-urban-ground';tile.add(child);register(tile);}
}
function yachtHull(){
  const outline=[[-.38,.5],[.38,.5],[.5,.24],[.44,-.3],[0,-.5],[-.44,-.3],[-.5,.24]],p:number[]=[],indices:number[]=[];
  for(const y of[0,1])for(const [x,z]of outline)p.push(x*(y?1:.7),y-.5,z*(y?1:.88));
  const n=outline.length;for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,i+n,j,j+n,i+n);}for(let i=1;i<n-1;i++)indices.push(n,n+i,n+i+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function palmFrond(){
  const p:number[]=[],indices:number[]=[];for(let i=0;i<=5;i++){const t=i/5,w=.55*Math.sin(Math.PI*t);p.push(-w,-1.7*t*t,t*4,w,-1.7*t*t,t*4);if(i<5){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** Surface detail uses the existing environment reflection, not a second camera. */
export function monacoWaterMaterial(){
  const size=128,data=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=x/size*Math.PI*2,b=y/size*Math.PI*2,nx=.25*Math.cos(a*7+b*3)+.09*Math.sin(a*17-b*5),ny=.18*Math.sin(b*11-a*4),nz=Math.sqrt(Math.max(.01,1-nx*nx-ny*ny)),i=(y*size+x)*4;
    data[i]=(nx*.5+.5)*255;data[i+1]=(ny*.5+.5)*255;data[i+2]=(nz*.5+.5)*255;data[i+3]=255;
    rough[i]=rough[i+1]=rough[i+2]=175+30*Math.sin(a*5+b*7);rough[i+3]=255;
  }
  const map=(pixels:Uint8Array)=>{const t=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
  return new THREE.MeshStandardMaterial({color:0x347f91,normalMap:map(data),normalScale:new THREE.Vector2(.18,.18),roughnessMap:map(rough),roughness:.6,metalness:.25});
}
