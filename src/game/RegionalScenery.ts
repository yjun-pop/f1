import * as THREE from 'three';
import type {Track} from './Track';
import {environmentFor,type GeoPoint} from './CircuitEnvironment';
import {containsWater} from './RegionalWaters';
import {createSpatialChunks} from './TrackChunks';
import {monacoWaterMaterial} from './MonacoScenery';
import {sceneryFootprint} from './ScenerySpace';

type Shape='box'|'roof'|'pole'|'ball'|'hull'|'shrub'|'paving';
interface Part {matrix:THREE.Matrix4;shape:Shape;material:THREE.Material;detail:boolean;name:string;color?:number}
/** Static, spatially bounded instance batches. A skyline/window never adds a
 * light, reflection pass, animation callback or object per visible window. */
export function createRegionalScenery(track:Track,register:(group:THREE.Group)=>void){
  const env=environmentFor(track.circuit.id),night=!!track.circuit.night,stamp=new THREE.Object3D();
  const box=new THREE.BoxGeometry(1,1,1),roof=new THREE.ConeGeometry(Math.SQRT1_2,1,4);roof.rotateY(Math.PI/4);
  const shapes:Record<Shape,THREE.BufferGeometry>={box,roof,pole:new THREE.CylinderGeometry(1,1,1,6),ball:new THREE.IcosahedronGeometry(1,2),hull:new THREE.CylinderGeometry(.4,.55,1,6),shrub:new THREE.IcosahedronGeometry(1,0),paving:new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2)};
  shapes.hull.rotateX(Math.PI/2);
  const landmarkAnchors=new Map<string,{source:THREE.Vector3;placed:THREE.Vector3}>();
  const materials=new Map<string,THREE.Material>(),buckets=new Map<string,{name:string;parts:Part[];anchor?:THREE.Vector3}>();
  const material=(key:string,color:number,metalness=0)=>{
    let m=materials.get(key);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:metalness?.36:.86,metalness});materials.set(key,m);}return m;
  };
  const white=material('ivory',0xe1e1d7),steel=material('steel',0xb4c3c8,.45),dark=material('glass',night?0x263f5e:0x355567,.45),red=material('red',0xb94b36),green=material('green',0x5e795b);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=env.city==='riviera'?'#d8c6ad':night?'#162333':'#a4aba9';ctx.fillRect(0,0,128,256);
  const rows=env.city==='marina'?48:env.city==='riviera'?10:12,columns=env.city==='marina'?10:6;
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const hash=(Math.imul(x+1,73856093)^Math.imul(y+3,19349663))>>>0;
    ctx.fillStyle=night?(hash%7<5?'#c9b17d':'#162333'):env.city==='riviera'?'#6d847e':'#4c6474';
    ctx.fillRect((x+.23)*128/columns,(y+.2)*256/rows,128/columns*.54,256/rows*.58);
  }
  const facade=new THREE.CanvasTexture(canvas);facade.colorSpace=THREE.SRGBColorSpace;facade.anisotropy=2;facade.generateMipmaps=true;facade.minFilter=THREE.LinearMipmapLinearFilter;
  const cityMaterial=new THREE.MeshStandardMaterial({map:facade,color:night?0xa6b9d0:0xffffff,roughness:.79,emissiveMap:night?facade:null,emissive:night?0xd6dfff:0x000000,emissiveIntensity:night?.65:0});
  const roofs=material('roofs',env.city==='riviera'?0x9c6750:env.city==='paulista'?0xa36f52:0x617582);
  const blockers:THREE.Box3[]=[];track.group.updateMatrixWorld(true);
  for(const o of track.group.children)if(o.name==='pit-building'||o.name==='grandstand')blockers.push(new THREE.Box3().setFromObject(o).expandByScalar(5));
  const clear=(p:THREE.Vector3,radius:number)=>track.scenerySpace.clear(p,radius+14)&&!containsWater(p.x,p.z,track.waters)&&blockers.every(b=>p.x+radius<b.min.x||p.x-radius>b.max.x||p.z+radius<b.min.z||p.z-radius>b.max.z);
  const emit=(name:string,shape:Shape,m:THREE.Material,p:THREE.Vector3,size:THREE.Vector3,rotation=0,detail=false,quaternion?:THREE.Quaternion)=>{
    const cellSize=name.startsWith('roadside-')||name==='trackside-service'?450:300,key=`${name}/${Math.floor(p.x/cellSize)}/${Math.floor(p.z/cellSize)}`;let bucket=buckets.get(key);if(!bucket){bucket={name,parts:[]};buckets.set(key,bucket);}
    stamp.position.copy(p);stamp.scale.copy(size);stamp.rotation.set(0,rotation,0);if(quaternion)stamp.quaternion.copy(quaternion);stamp.updateMatrix();const item:Part={shape,material:m,matrix:stamp.matrix.clone(),detail,name:name==='regional-city'?'city-buildings':name};bucket.parts.push(item);return item;
  };
  const part=(name:string,p:THREE.Vector3,offset:number[],size:number[],m=white,shape:Shape='box',rotation=0,detail=false)=>emit(name,shape,m,p.clone().add(new THREE.Vector3(...offset)),new THREE.Vector3(...size),rotation,detail);
  const beam=(name:string,a:THREE.Vector3,b:THREE.Vector3,r:number,m=steel)=>{const direction=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());emit(name,'pole',m,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(r,direction.length(),r),0,false,q);};
  const anchor=(geo:GeoPoint,radius:number)=>{
    const original=track.geographicPoint(geo),p=original.clone();
    if(!clear(p,radius)){
      let found=false;
      for(let r=30;r<=300&&!found;r+=30)for(let i=0;i<16;i++){p.copy(original).add(new THREE.Vector3(Math.cos(i*Math.PI/8)*r,0,Math.sin(i*Math.PI/8)*r));if(clear(p,radius)){found=true;break;}}
      if(!found)return undefined;
    }
    p.y=track.sceneryHeight(p.x,p.z);return p;
  };
  const landmarkPositions=new Map<string,THREE.Vector3>();
  for(const landmark of (track.circuit.id==='monaco'?[]:env.landmarks)){
    if(landmark.kind==='banking')continue;
    const radius=landmark.kind==='hotel'?(landmark.id==='marina-bay-sands'?115:45):landmark.kind==='bridge'?185:landmark.kind==='hangar'?105:landmark.height*.52;
    const p=anchor(landmark.at,radius);if(!p)continue;
    landmarkPositions.set(landmark.id,p);track.scenerySpace.reserveFootprint(sceneryFootprint(p,0,-radius,radius,-radius,radius));
  }
  let seed=track.name.split('').reduce((a,c)=>a+c.charCodeAt(0),37);const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Rectangular neighbourhoods use geographic north/east, not offsets from
  // every section of the racing spline. Waterfronts remain open to the water.
  const city=(geo:GeoPoint,columns:number,rows:number,spacing:number)=>{
    const center=track.geographicPoint(geo);
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const p=center.clone().add(new THREE.Vector3((col-(columns-1)/2)*spacing+(random()-.5)*10,0,(row-(rows-1)/2)*spacing+(random()-.5)*10));
      const w=14+random()*14,d=14+random()*13;if(!clear(p,Math.hypot(w,d)*.5))continue;p.y=track.sceneryHeight(p.x,p.z);
      const footprint=sceneryFootprint(p,0,-w/2-1,w/2+1,-d/2-1,d/2+1);
      if(track.scenerySpace.intersectsFootprint(footprint,17)||track.scenerySpace.intersectsReserved(footprint,1))continue;
      track.scenerySpace.reserveFootprint(footprint);
      const h=env.city==='marina'?45+random()*140:env.city==='riviera'?12+random()*33:random()<.22?45+random()*55:7+random()*15;
      const base=p.clone();base.y+=h/2;emit('regional-city','box',cityMaterial,base,new THREE.Vector3(w,h,d));
      if(env.city!=='marina')part('regional-city',p,[0,h+1.5,0],[w+2,3,d+2],roofs,'roof');
      else part('regional-city',p,[0,h+1,0],[w*.6,2,d*.6],steel);
      // A handful of facade/rooftop accents are a separate near-only batch.
      for(let floor=1;floor<Math.min(6,h/4);floor++)part('regional-city',p,[0,floor*4,-d*.5-.5],[w+.8,.2,1],white,'box',0,true);
      part('regional-city',p,[w*.2,h+2,d*.1],[2,2,3],dark,'box',0,true);
    }
  };
  // Monaco uses the dedicated architecture/marina asset pack.
  if(env.city==='marina'){city([103.852,1.2814],7,5,48);city([103.855,1.294],6,4,48);city([103.8616,1.2975],5,4,45);}
  if(env.city==='paulista'){city([-46.694,-23.6975],8,5,44);city([-46.703,-23.702],8,4,42);city([-46.693,-23.707],8,5,37);city([-46.688,-23.698],5,5,55);}

  // A close layer gives parallax and a continuous neighbourhood scale. The
  // permanent Brazilian venue keeps its infield open; housing follows the
  // outer perimeter. Street circuits can have buildings on either land side.
  const boundary=Array.from({length:Math.ceil(track.length/20)},(_,i)=>track.point(i/Math.ceil(track.length/20)));
  const infield=(p:THREE.Vector3)=>{let inside=false;for(let i=0,j=boundary.length-1;i<boundary.length;j=i++)if((boundary[i].z>p.z)!==(boundary[j].z>p.z)&&p.x<(boundary[j].x-boundary[i].x)*(p.z-boundary[i].z)/(boundary[j].z-boundary[i].z)+boundary[i].x)inside=!inside;return inside;};
  if(env.city&&track.circuit.id!=='monaco'){
    const lowCanvas=document.createElement('canvas');lowCanvas.width=128;lowCanvas.height=128;const lowContext=lowCanvas.getContext('2d')!;
    lowContext.fillStyle=night?'#172532':'#e6dfd0';lowContext.fillRect(0,0,128,128);
    const floors=env.city==='paulista'?4:6;
    for(let y=0;y<floors;y++)for(let x=0;x<4;x++){lowContext.fillStyle=night?((x*17+y*23)%7<4?'#d9bd85':'#23354a'):'#526c71';lowContext.fillRect(x*32+8,(y+.18)*128/floors,16,128/floors*.6);}
    const lowFacade=new THREE.CanvasTexture(lowCanvas);lowFacade.colorSpace=THREE.SRGBColorSpace;lowFacade.anisotropy=2;
    const paving=material('neighbourhood-paving',0x848983);
    const houseColors=[0xdfd3b9,0xc1cbc3,0xc3b4a1],houseMaterial=cityMaterial.clone();houseMaterial.map=lowFacade;if(night)houseMaterial.emissiveMap=lowFacade;
    const step=env.city==='paulista'?18:23;
    for(let metres=4;metres<track.length;metres+=step)for(const side of [-1,1])for(let row=0;row<(env.city==='paulista'?2:1);row++){
      const t=(metres+row*8)/track.length,origin=track.point(t),normal=track.normal(t),heading=Math.atan2(track.tangent(t).x,track.tangent(t).z),yaw=heading-side*Math.PI/2;
      const w=9+random()*8,d=8+random()*5,h=env.city==='riviera'?12+random()*18:env.city==='marina'?7+random()*16:5+random()*12;
      let p:THREE.Vector3|undefined;
      for(const setback of [23,29,37,47]){
        const candidate=origin.clone().addScaledVector(normal,side*(setback+d/2+row*19)),fp=sceneryFootprint(candidate,yaw,-w/2-1,w/2+1,-d/2-3,d/2+1);
        if(env.city==='paulista'&&infield(candidate)||containsWater(candidate.x,candidate.z,track.waters)||track.scenerySpace.intersectsFootprint(fp,19)||track.scenerySpace.intersectsReserved(fp,1.2))continue;
        track.scenerySpace.reserveFootprint(fp);p=candidate;break;
      }
      if(!p)continue;p.y=track.sceneryHeight(p.x,p.z);
      emit('roadside-houses','paving',paving,p.clone().addScaledVector(normal,-side).add(new THREE.Vector3(0,.016,0)),new THREE.Vector3(w+2,1,d+4),yaw);
      emit('roadside-houses','box',houseMaterial,p.clone().add(new THREE.Vector3(0,h/2,0)),new THREE.Vector3(w,h,d),yaw).color=night?0xffffff:houseColors[Math.floor(random()*houseColors.length)];
      emit('roadside-houses','roof',roofs,p.clone().add(new THREE.Vector3(0,h+1.1,0)),new THREE.Vector3(w+1.8,2.2,d+1.8),yaw);
      const facadePoint=p.clone().addScaledVector(normal,-side*(d/2+.06));facadePoint.y+=2.2;
      emit('roadside-houses','box',dark,facadePoint,new THREE.Vector3(w*.68,1.8,.12),yaw);
      if((Math.floor(metres/step)+row)%4===0){facadePoint.y+=1.3;emit('roadside-houses','box',white,facadePoint,new THREE.Vector3(w*.9,.18,2),yaw);}
    }
  }else if(!env.city){
    const hedge=material('roadside-planting',env.foliage),serviceRoof=material('service-roof',track.circuit.id==='silverstone'?0x617b96:0x84785d);
    for(let metres=20;metres<track.length;metres+=track.circuit.id==='silverstone'?60:42)for(const side of [-1,1]){
      const t=metres/track.length,normal=track.normal(t),yaw=Math.atan2(track.tangent(t).x,track.tangent(t).z)-side*Math.PI/2;
      const p=track.point(t).addScaledVector(normal,side*(23+random()*6)),fp=sceneryFootprint(p,yaw,-4,4,-2.5,2.5);
      if(containsWater(p.x,p.z,track.waters)||track.scenerySpace.intersectsFootprint(fp,18)||track.scenerySpace.intersectsReserved(fp,2))continue;
      p.y=track.sceneryHeight(p.x,p.z);
      for(let i=-1;i<=1;i++){const bush=p.clone().addScaledVector(track.tangent(t),i*2.4);bush.y+=.8;emit('roadside-planting','shrub',hedge,bush,new THREE.Vector3(1.8,.8,1.5),yaw);}
    }
    for(let metres=160;metres<track.length;metres+=320){
      const t=metres/track.length,side=Math.floor(metres/320)%2?1:-1,normal=track.normal(t),yaw=Math.atan2(track.tangent(t).x,track.tangent(t).z)-side*Math.PI/2;
      const p=track.point(t).addScaledVector(normal,side*29),fp=sceneryFootprint(p,yaw,-4.5,4.5,-3.5,3.5);
      if(containsWater(p.x,p.z,track.waters)||track.scenerySpace.intersectsFootprint(fp,19)||track.scenerySpace.intersectsReserved(fp,2))continue;
      track.scenerySpace.reserveFootprint(fp);p.y=track.sceneryHeight(p.x,p.z);
      emit('trackside-service','box',white,p.clone().add(new THREE.Vector3(0,1.6,0)),new THREE.Vector3(6,3.2,4),yaw);
      emit('trackside-service','roof',serviceRoof,p.clone().add(new THREE.Vector3(0,3.9,0)),new THREE.Vector3(8,1.4,6),yaw);
      emit('trackside-service','box',dark,p.clone().add(new THREE.Vector3(0,2,0)).addScaledVector(normal,-side*2.06),new THREE.Vector3(4,1,.12),yaw);
    }
  }

  // Water uses local index tiles sharing one vertex buffer. No planar-reflection
  // camera or transparent full-screen water layer is needed in either view.
  const waterMaterial=track.circuit.id==='monaco'?monacoWaterMaterial():new THREE.MeshStandardMaterial({color:night?0x153e56:track.circuit.id==='montreal'?0x3c8793:0x287f9b,roughness:night?.28:.35,metalness:.25});
  for(const area of track.waters){
    const positions:number[]=[],indices:number[]=[],size=24;
    const waterTile=(x:number,z:number,step:number)=>{
      const corners=[[x,z],[x+step,z],[x,z+step],[x+step,z+step]],valid=corners.map(([a,b])=>containsWater(a,b,[area])&&track.scenerySpace.distanceSquared(a,b,30)>=900);
      if(!valid.every(Boolean)){
        if(track.circuit.id==='monaco'&&step>3&&(valid.some(Boolean)||containsWater(x+step/2,z+step/2,[area]))){for(const dx of[0,step/2])for(const dz of[0,step/2])waterTile(x+dx,z+dz,step/2);}return;
      }
      const i=positions.length/3;for(const [a,b]of corners)positions.push(a,-.045,b);indices.push(i,i+2,i+1,i+1,i+2,i+3);
    };
    for(let x=area.bounds.min.x;x<area.bounds.max.x;x+=size)for(let z=area.bounds.min.y;z<area.bounds.max.y;z+=size)waterTile(x,z,size);
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    if(track.circuit.id==='monaco'){const uv:number[]=[];for(let j=0;j<positions.length;j+=3)uv.push(positions[j]/64,positions[j+2]/64);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
    const group=createSpatialChunks(geometry,waterMaterial,320,'harbour-water');group.userData.region=area.name;
    // Register the local tiles separately; a large river bound must not make
    // the entire river visible whenever one shore enters the camera frustum.
    for(const child of [...group.children]){const tile=new THREE.Group();tile.name='harbour-water';tile.userData.region=area.name;tile.add(child);register(tile);}
  }
  if(track.circuit.id==='silverstone'){
    const center=track.geographicPoint([-1.017,52.079]),runway=material('runway',0x777d79),fieldA=material('field-a',0xa9b27f),fieldB=material('field-b',0xb6b88f);
    for(const angle of [.1,Math.PI*.34])for(let i=-24;i<=24;i++){
      const p=center.clone().add(new THREE.Vector3(Math.sin(angle)*i*12,.01,Math.cos(angle)*i*12));if(clear(p,20))emit('raf-airfield-remnants','box',runway,p,new THREE.Vector3(25,.035,12),angle);
    }
    const bounds=track.bounds;for(let x=bounds.min.x-400;x<bounds.max.x+400;x+=150)for(let z=bounds.min.z-400;z<bounds.max.z+400;z+=150){const p=new THREE.Vector3(x,-.055,z);if(clear(p,110))emit('northamptonshire-fields','box',(Math.round(x/150)+Math.round(z/150))%2?fieldA:fieldB,p,new THREE.Vector3(145,.02,145));}
    const pit=track.group.getObjectByName('pit-building')!,positions:number[]=[],indices:number[]=[];
    for(let i=0;i<12;i++){const z=-120+i*20,k=positions.length/3;positions.push(-11,8,z,11,10,z,-11,13,z+20,11,8,z+20);indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const wing=new THREE.Group();wing.name='silverstone-wing';wing.position.copy(pit.position);wing.rotation.copy(pit.rotation);wing.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xcbd0d0,metalness:.4,roughness:.45,side:THREE.DoubleSide})));register(wing);
  }
  for(const landmark of (track.circuit.id==='monaco'?[]:env.landmarks)){
    if(landmark.kind==='banking'){
      const center=track.geographicPoint(landmark.at),positions:number[]=[],indices:number[]=[];
      for(let i=0;i<=48;i++){const angle=-1.2+i/48*2.4;for(const outer of [false,true]){const r=145+(outer?8:-8),p=center.clone().add(new THREE.Vector3(Math.sin(angle)*r,outer?6.5:.7,Math.cos(angle)*r-100));positions.push(p.x,p.y,p.z);}}
      for(let i=0;i<48;i++){const k=i*2;if([k,k+1,k+2,k+3].every(v=>track.scenerySpace.distanceSquared(positions[v*3],positions[v*3+2],28)>=784))indices.push(k,k+1,k+2,k+1,k+3,k+2);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const g=new THREE.Group();g.name=landmark.id;g.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x8f938b,roughness:1,side:THREE.DoubleSide})));register(g);continue;
    }
    const p=landmarkPositions.get(landmark.id);if(!p)continue;const name=landmark.id,h=landmark.height;landmarkAnchors.set(name,{source:track.geographicPoint(landmark.at),placed:p.clone()});
    if(landmark.kind==='wheel'){
      const r=h*.45,cy=h*.53,count=48,point=(angle:number,z=0)=>p.clone().add(new THREE.Vector3(Math.cos(angle)*r,cy+Math.sin(angle)*r,z));
      for(let i=0;i<count;i++)for(const z of [-1.2,1.2])beam(name,point(i/count*Math.PI*2,z),point((i+1)/count*Math.PI*2,z),h*.005,steel);
      for(let i=0;i<16;i++){
        const angle=i/16*Math.PI*2,end=point(angle);beam(name,p.clone().add(new THREE.Vector3(0,cy,0)),end,h*.0025,white);
        emit(name,'box',i%3===0?red:i%3===1?white:dark,end.clone().add(new THREE.Vector3(0,-h*.025,0)),new THREE.Vector3(h*.04,h*.035,h*.04));
      }
      for(const x of [-h*.2,h*.2])for(const z of [-h*.13,h*.13])beam(name,p.clone().add(new THREE.Vector3(x,0,z)),p.clone().add(new THREE.Vector3(0,cy,0)),h*.015,track.circuit.id==='suzuka'?red:white);
    }else if(landmark.kind==='dome'){
      const dome=new THREE.MeshStandardMaterial({color:0xd1e5df,wireframe:true,roughness:.6});part(name,p,[0,h*.5,0],[h*.5,h*.5,h*.5],dome,'ball');part(name,p,[0,8,0],[30,16,24],dark);
    }else if(landmark.kind==='bridge'){
      part(name,p,[0,30,0],[18,3,300],green);for(const x of [-9,9])for(let i=-5;i<5;i++){
        const a=p.clone().add(new THREE.Vector3(x,33,i*30)),b=p.clone().add(new THREE.Vector3(x,50,(i+.5)*30)),c=p.clone().add(new THREE.Vector3(x,33,(i+1)*30));beam(name,a,b,.6,green);beam(name,b,c,.6,green);beam(name,a,c,.7,green);
      }
      for(const z of [-100,100])part(name,p,[0,14,z],[18,28,7],steel);
    }else if(landmark.kind==='hangar'){
      for(const x of [-65,0,65]){part(name,p,[x,6,0],[52,12,58],material('hangar',0xa5aca5));part(name,p,[x,13.5,0],[54,3,60],steel,'roof');part(name,p,[x,4.5,-29.2],[38,8,.4],dark);}
    }else if(name==='marina-bay-sands'){
      for(const x of [-66,0,66]){part(name,p,[x,h*.5,0],[31,h,40],cityMaterial);part(name,p,[x-17,h*.5,0],[2,h+2,42],white);}
      part(name,p,[0,h+4,0],[47,9,220],white,'hull',Math.PI/2);part(name,p,[0,h+9,0],[178,1,31],green);
    }else{
      part(name,p,[0,h*.5,0],[65,h,26],cityMaterial);part(name,p,[0,h+3,0],[69,6,30],env.city==='riviera'?roofs:steel,'roof');
      for(const x of [-23,-11,1,13,25])part(name,p,[x,3.5,-15],[1.4,7,1.4],white,'pole');
    }
  }
  for(const bucket of buckets.values()){
    const group=new THREE.Group();group.name=bucket.name;group.userData.geographicAnchor=landmarkAnchors.get(bucket.name);const grouped=new Map<string,Part[]>();
    for(const p of bucket.parts){const key=`${p.shape}/${p.material.uuid}/${p.detail}`;const list=grouped.get(key);if(list)list.push(p);else grouped.set(key,[p]);}
    for(const parts of grouped.values()){
      const first=parts[0],mesh=new THREE.InstancedMesh(shapes[first.shape],first.material,parts.length);mesh.name=first.name;mesh.userData.nearDetail=first.detail;
      const tinted=parts.some(p=>p.color!==undefined),color=new THREE.Color();parts.forEach((part,i)=>{mesh.setMatrixAt(i,part.matrix);if(tinted)mesh.setColorAt(i,color.setHex(part.color??0xffffff));});mesh.computeBoundingSphere();mesh.receiveShadow=!night;group.add(mesh);
    }
    register(group);
  }
}
