import * as THREE from 'three';
import type {Track} from './Track';
import {containsWater} from './RegionalWaters';
import {sceneryFootprint,type SceneryFootprint} from './ScenerySpace';
import {createSpatialChunks} from './TrackChunks';

type Frame={p:THREE.Vector3;yaw:number};
type Site={name:string;frame:Frame;footprint:SceneryFootprint};
type Register=(group:THREE.Group)=>void;
/** Architectural proportions are deliberate game adaptations. Source provenance
 * and the unchanged driving geometry are documented in CIRCUIT_AUTHENTICITY.md. */
class VenueBatch {
  private stamp=new THREE.Object3D();
  private box=new THREE.BoxGeometry(1,1,1);
  private buckets=new Map<string,{name:string;material:THREE.Material;detail:boolean;items:{matrix:THREE.Matrix4;color:number}[]}>();
  readonly stone=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.87});
  readonly metal=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.43,metalness:.45});
  readonly glass=new THREE.MeshStandardMaterial({color:0x294653,roughness:.24,metalness:.48});
  readonly wood=new THREE.MeshStandardMaterial({color:0x967a51,roughness:.85});
  readonly light=new THREE.MeshBasicMaterial({color:0xeef0e8});
  readonly facade:THREE.MeshStandardMaterial;
  constructor(private register:Register,night:boolean){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d')!;
    c.fillStyle=night?'#53606c':'#ece8dd';c.fillRect(0,0,256,256);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      c.fillStyle='#a29c8e';c.fillRect(x*32+6,y*32+5,21,24);
      c.fillStyle=night?(x*17+y*13)%5?'#f5cc86':'#233547':'#3d5c68';c.fillRect(x*32+8,y*32+7,17,20);
      c.fillStyle='#d7cfc0';c.fillRect(x*32+15,y*32+7,1,20);c.fillRect(x*32+6,y*32+28,21,2);
    }
    const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.wrapS=atlas.wrapT=THREE.RepeatWrapping;atlas.anisotropy=4;
    this.facade=new THREE.MeshStandardMaterial({map:atlas,roughness:.8,emissive:night?0xffd098:0,emissiveMap:night?atlas:null,emissiveIntensity:night?.35:0});
    this.facade.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_INSTANCING
#ifdef USE_MAP
vMapUv.y *= length(instanceMatrix[1].xyz) / 25.6;
#endif
#ifdef USE_EMISSIVEMAP
vEmissiveMapUv.y *= length(instanceMatrix[1].xyz) / 25.6;
#endif
#endif`);};
    this.facade.customProgramCacheKey=()=> 'venue-facade-floors-v1';
  }
  point(f:Frame,x:number,y:number,z:number){return f.p.clone().add(new THREE.Vector3(Math.cos(f.yaw)*x+Math.sin(f.yaw)*z,y,-Math.sin(f.yaw)*x+Math.cos(f.yaw)*z));}
  part(name:string,f:Frame,offset:readonly number[],size:readonly number[],material:THREE.Material=this.stone,color=0xffffff,detail=false,pitch=0,roll=0){
    const p=this.point(f,offset[0],offset[1],offset[2]),key=`${name}/${Math.floor(p.x/240)}/${Math.floor(p.z/240)}/${material.uuid}/${detail}`;
    let bucket=this.buckets.get(key);if(!bucket){bucket={name,material,detail,items:[]};this.buckets.set(key,bucket);}
    this.stamp.position.copy(p);this.stamp.scale.set(size[0],size[1],size[2]);this.stamp.rotation.set(0,f.yaw,0);this.stamp.rotateX(pitch);this.stamp.rotateZ(roll);this.stamp.updateMatrix();bucket.items.push({matrix:this.stamp.matrix.clone(),color});
  }
  beam(name:string,a:THREE.Vector3,b:THREE.Vector3,width:number,material:THREE.Material=this.metal,color=0xc5c9c6){
    const p=a.clone().add(b).multiplyScalar(.5),direction=b.clone().sub(a),f={p,yaw:Math.atan2(direction.x,direction.z)};
    this.part(name,f,[0,0,0],[width,width,direction.length()],material,color,false,-Math.atan2(direction.y,Math.hypot(direction.x,direction.z)));
  }
  finish(){
    const color=new THREE.Color();for(const bucket of this.buckets.values())for(let start=0;start<bucket.items.length;start+=384){
      const items=bucket.items.slice(start,start+384),mesh=new THREE.InstancedMesh(this.box,bucket.material,items.length);mesh.name=bucket.name;mesh.userData.nearDetail=bucket.detail;mesh.userData.venueArchitecture=true;
      items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,color.setHex(item.color));});mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=!bucket.detail&&bucket.material!==this.light&&bucket.material!==this.glass;
      const group=new THREE.Group();group.name=bucket.name;group.add(mesh);this.register(group);
    }
  }
}

export function createVenueArchitecture(track:Track,register:Register){
  const b=new VenueBatch(register,!!track.circuit.night),id=track.circuit.id,sites:Site[]=[];
  const pit=track.group.getObjectByName('pit-building') as THREE.Group;
  const f={p:pit.position.clone(),yaw:pit.rotation.y},front=pit.userData.offset>0?1:-1;
  const colors={monza:0xd4cfbd,silverstone:0xc4cace,spa:0xb5b6b0,monaco:0xddd7c5,suzuka:0xe0e1d8,interlagos:0xd7d9ce,singapore:0xb8c6ce,montreal:0xdadbd4};
  const name=`${id}-pit-architecture`;
  // Reuse the previously cleared pit envelope, including canopy overhangs.
  const shell=pit.children[0] as THREE.Mesh;shell.geometry.dispose();shell.geometry=new THREE.BoxGeometry(22,5,240);shell.position.y=2.5;(shell.material as THREE.MeshStandardMaterial).color.setHex(colors[id]);
  const oldWindows=pit.children[1] as THREE.Mesh;oldWindows.geometry.dispose();(oldWindows.material as THREE.Material).dispose();pit.remove(oldWindows);
  for(let z=-114;z<=114;z+=9.5){
    b.part(name,f,[front*11.04,2.1,z],[.15,3.7,8.2],b.glass);
    b.part(name,f,[front*11.2,4.3,z],[.6,.25,8.6],b.stone,0xf2f0e7);
    for(const y of[1,1.7,2.4,3.1])b.part(name,f,[front*11.14,y,z],[.08,.035,8],b.metal,0x687578,true);
    b.part(name,f,[front*11.25,.22,z],[.7,.4,8.7],b.stone,0x505c5d);
  }
  if(id==='silverstone'){
    // Faceted, rising Wing silhouette, continuous glass storey and red screen.
    b.part(name,f,[0,7.2,0],[21,4.4,238],b.glass);b.part(name,f,[front*11.15,9.4,0],[.3,.8,240],b.metal,0xa72424);
    const profile=[[-120,11],[-95,12],[-65,10.5],[-35,12.5],[-5,11],[25,13],[55,14],[85,18],[105,22],[120,26]],positions:number[]=[],indices:number[]=[];
    for(let i=0;i<profile.length;i++){
      const [z,y]=profile[i];for(const [x,h]of[[-11.5,y-1.5],[-2,y],[11.5,y-2.5]]){const p=b.point(f,x,h,z);positions.push(p.x,p.y,p.z);}
      if(i<profile.length-1)for(let j=0;j<2;j++){const k=i*3+j;indices.push(k,k+1,k+3,k+1,k+4,k+3);}
      if(i){const [prevZ,prevY]=profile[i-1],height=(y+prevY)/2-10;
        if(height>0)b.part('silverstone-wing',f,[-10,10+height/2,(z+prevZ)/2],[2,height,z-prevZ],b.metal,0x747e85);
      }
    }
    const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roof.setIndex(indices);roof.computeVertexNormals();
    const wing=new THREE.Group();wing.name='silverstone-wing';const mesh=new THREE.Mesh(roof,new THREE.MeshStandardMaterial({color:0xd0d5d7,metalness:.4,roughness:.45,side:THREE.DoubleSide}));mesh.castShadow=true;mesh.receiveShadow=true;wing.add(mesh);register(wing);
  }else if(id==='montreal'){
    // Open terraces, timber roof rhythm and Expo-inspired Y steel supports.
    for(const y of[5.2,9.2,13.2])b.part(name,f,[0,y,0],[23,.45,240],y===13.2?b.wood:b.stone,0xe3e2d8);
    for(let z=-114;z<=114;z+=12){
      b.part(name,f,[0,12.85,z],[23,.4,.3],b.wood);
      for(const side of[-1,1]){
        b.beam(name,b.point(f,side*8,5.4,z),b.point(f,side*10.6,9.1,z),.28);
        b.beam(name,b.point(f,side*8,5.4,z),b.point(f,side*5.4,9.1,z),.28);
        b.part(name,f,[side*10.3,11.2,z],[.24,4,.24],b.metal);
      }
    }
    for(const y of[6.3,10.3])b.part(name,f,[front*11.1,y,0],[.1,.85,236],b.glass);
  }else{
    const levels=id==='suzuka'||id==='singapore'?2:1;
    for(let floor=0;floor<levels;floor++){
      const y=5.3+floor*3.5;
      b.part(name,f,[0,y+1.5,0],[20,3,238],b.glass);
      b.part(name,f,[0,y+3.2,0],[23,.35,240],b.stone,colors[id]);
      for(let z=-114;z<=114;z+=12)b.part(name,f,[front*10.5,y+1.4,z],[.4,3.2,.45],b.stone,colors[id]);
    }
    const roofY=5.3+levels*3.5;
    if(id==='monza')for(const side of[-1,1])b.part(name,f,[side*5.8,roofY+1,0],[12,.35,240],b.stone,0x8b6554,false,0,side*.15);
    if(id==='spa')for(let z=-105;z<=105;z+=30)b.part(name,f,[0,roofY+.6,z],[23,.45,31],b.metal,0x52636d,false,.025);
    if(id==='interlagos'){
      b.part(name,f,[0,roofY+.25,0],[23,.45,240],b.metal,0x4b7198);
      for(let z=-114;z<=114;z+=9.5)b.part(name,f,[front*11.15,5.8,z],[.2,.8,8.5],b.stone,Math.round(z/9.5)%2?0xe3c73d:0x24764e);
    }
    if(id==='suzuka')for(let z=-105;z<=105;z+=30)b.part(name,f,[0,roofY+.6,z],[23,.8,29.5],b.stone,0xf0eee3);
    if(id==='singapore'){
      for(let z=-112;z<=112;z+=16)b.part(name,f,[front*10.8,roofY-1,z],[.12,.1,14],b.light);
      b.part(name,f,[0,roofY+.4,0],[23,.7,240],b.metal,0xb6c9d1);
    }
  }
  // A pit is part of a working paddock, not a long box placed on grass.
  // Clip each apron tile against all road branches; rear courts reserve their
  // complete envelope before city blocks/trees are generated.
  const apronReservations:SceneryFootprint[]=[];
  for(let z=-115;z<=115;z+=10){
    for(const [x,width,rear]of[[front*15.6,8.5,false],[-front*22.5,18,true]] as const){
      const p=b.point(f,x,0,z),fp=sceneryFootprint(p,f.yaw,-width/2,width/2,-5,5);
      const frame={p,yaw:f.yaw},wet=[-1,1].some(x=>[-1,1].some(z=>{const q=b.point(frame,x*width/2,0,z*5);return containsWater(q.x,q.z,track.waters);}));
      if(track.scenerySpace.intersectsFootprint(fp,10.8)||wet||rear&&track.scenerySpace.intersectsReserved(fp,.5))continue;
      const pavement={p,yaw:f.yaw};b.part(`${id}-paddock-aprons`,pavement,[0,.015,0],[width,.05,10],b.stone,id==='monaco'?0x9e9e92:0x747c7d);
      if(rear){
        apronReservations.push(fp);
        if(Math.round((z+115)/10)%3===0){b.part(`${id}-paddock-services`,pavement,[0,1.6,0],[3,3.1,8.5],b.stone,0xd8dedc);b.part(`${id}-paddock-services`,pavement,[1.55,1.8,0],[.12,1,7.8],b.glass);}
      }else b.part(`${id}-paddock-aprons`,pavement,[front*2.8,.048,0],[.12,.012,8.8],b.stone,0xdadbd2,true);
    }
  }
  apronReservations.forEach(fp=>track.scenerySpace.reserveFootprint(fp));
  const dry=(fp:SceneryFootprint)=>[-1,0,1].every(x=>[-1,0,1].every(z=>{const p=b.point({p:new THREE.Vector3(fp.x,0,fp.z),yaw:fp.yaw},x*fp.halfX,0,z*fp.halfZ);return !containsWater(p.x,p.z,track.waters);}));
  const site=(name:string,section:number,side:number,w:number,d:number):Frame|undefined=>{
    const t=track.sections.find(s=>s.number===section)!.progress;
    for(const shift of[0,-16,16,-32,32])for(const setback of[33,45,57,69,81]){
      const at=t+shift/track.length,p=track.point(at).addScaledVector(track.normal(at),side*(setback+d/2)),yaw=Math.atan2(track.tangent(at).x,track.tangent(at).z)-side*Math.PI/2;
      const fp=sceneryFootprint(p,yaw,-w/2-2,w/2+2,-d/2-2,d/2+2);
      if(track.scenerySpace.intersectsFootprint(fp,18)||track.scenerySpace.intersectsReserved(fp,1)||!dry(fp))continue;
      // Highest corner defines the foundation; do not leave supports in midair.
      p.y=Math.max(...[-1,1].flatMap(x=>[-1,1].map(z=>{const q=b.point({p,yaw},x*(w/2+2),0,z*(d/2+2));return track.sceneryHeight(q.x,q.z);})));track.scenerySpace.reserveFootprint(fp);
      const frame={p,yaw};sites.push({name,frame,footprint:fp});
      const base=Math.min(...[-1,1].flatMap(x=>[-1,1].map(z=>{const q=b.point(frame,x*(w/2+2),0,z*(d/2+2));return track.sceneryHeight(q.x,q.z);}))),depth=Math.max(.15,p.y-base+.15);
      b.part(name,frame,[0,-depth/2,0],[w+4,depth,d+4],b.stone,0x999b91);
      return frame;
    }
    return;
  };
  const pavilion=(name:string,f:Frame,w:number,d:number,h:number,brick=false)=>{
    b.part(name,f,[0,h/2,0],[w,h,d],b.facade,brick?0xc6aa8c:0xe2dfd1);
    b.part(name,f,[0,h+.2,0],[w+1,.4,d+1],b.metal,0x657678);
    for(let x=-w/2+2;x<w/2;x+=4){b.part(name,f,[x,1.6,-d/2-.07],[2.4,2.7,.12],b.glass);b.part(name,f,[x,2.8,-d/2-.9],[3,.16,2],b.stone,0xd3c8ab,true);}
  };
  if(id==='monaco')createHotelTunnel(track,b,register);
  if(id==='monza'){
    for(const s of[6,8,11]){const f=site('monza-park-service-courts',s,1,35,20);if(!f)continue;pavilion('monza-park-service-courts',f,28,12,5,true);
      for(const side of[-1,1])b.part('monza-park-service-courts',f,[side*7,6,0],[15,.4,14],b.stone,0x94705b,false,0,side*.13);
      for(let x=-12;x<=12;x+=6)b.part('monza-park-service-courts',f,[x,.6,-8],[3,.16,.6],b.wood);
    }
  }
  if(id==='silverstone'){
    const f=site('silverstone-airfield-operations',9,1,44,26);if(f){pavilion('silverstone-airfield-operations',f,36,18,5);b.part('silverstone-airfield-operations',f,[10,8,0],[12,6,12],b.stone,0xb6bcbc);b.part('silverstone-airfield-operations',f,[10,10,0],[12.4,2,12.4],b.glass);}
  }
  if(id==='spa'){
    const f=site('spa-raidillon-terraces',3,-1,94,28);if(f){
      for(let row=0;row<12;row++){
        b.part('spa-raidillon-terraces',f,[0,row*.8+.5,-10+row*1.8],[90,.75,1.9],b.stone,0xb6b8b2);
        b.part('spa-raidillon-terraces',f,[0,row*.8+1,-10+row*1.8],[88,.12,.6],b.metal,row%3?0x738988:0xb6aa77,true);
      }
      b.part('spa-raidillon-terraces',f,[0,12,4],[93,.6,29],b.metal,0x838d90,false,-.05);
      for(let x=-42;x<=42;x+=12)b.part('spa-raidillon-terraces',f,[x,5.5,12],[.4,11,.4],b.metal,0x6e797c);
      b.part('spa-raidillon-terraces',f,[0,4.5,11],[90,7.5,5],b.glass);
    }
  }
  if(id==='suzuka'){
    for(const [section,side]of[[18,-1],[1,-1]]){const f=site('suzuka-amusement-park',section,side,68,34);if(!f)continue;
      for(const x of[-23,0,23]){const g={p:b.point(f,x,0,4),yaw:f.yaw};pavilion('suzuka-amusement-park',g,18,16,4);b.part('suzuka-amusement-park',g,[0,4.6,0],[20,.4,18],b.stone,x<0?0xb84a41:x>0?0x4a8493:0xd9b55e);}
      for(let x=-29;x<=29;x+=8)b.part('suzuka-amusement-park',f,[x,1.5,-12],[.25,3,.25],b.metal,0xb9c5c3);
      // A compact coaster silhouette connects the park buildings to the wheel.
      const rail=(angle:number)=>b.point(f,Math.sin(angle)*29,9+3*Math.sin(angle*2),7+Math.cos(angle)*8);
      for(let i=0;i<72;i++){
        const angle=i/72*Math.PI*2;b.beam('suzuka-amusement-park',rail(angle),rail((i+1)/72*Math.PI*2),.18,b.metal,0xb9473d);
        if(i%6===0){const q=rail(angle),base=q.clone();base.y=f.p.y;b.beam('suzuka-amusement-park',base,q,.2,b.metal,0xadb6b3);}
      }

    }
  }
  if(id==='interlagos'){
    const f=site('interlagos-senna-event-court',1,-1,65,27)??site('interlagos-senna-event-court',2,1,65,27)??site('interlagos-senna-event-court',13,-1,65,27);if(f){pavilion('interlagos-senna-event-court',f,57,16,7);
      b.part('interlagos-senna-event-court',f,[0,8,0],[63,.4,24],b.metal,0x4a7994);
      for(let x=-25;x<=25;x+=5)b.part('interlagos-senna-event-court',f,[x,7,-9],[4.5,.8,.2],b.stone,Math.floor(x/5)%2?0xe4c442:0x267a4b);
    }
  }
  if(id==='singapore'){
    const f=site('singapore-fullerton-colonnade',12,1,80,38);if(f){
      pavilion('singapore-fullerton-colonnade',f,74,30,24);
      for(const y of[6,12,18,24])b.part('singapore-fullerton-colonnade',f,[0,y,-15.6],[78,.45,1.5],b.stone,0xf0dfbd);
      for(let x=-34;x<=34;x+=5.6){b.part('singapore-fullerton-colonnade',f,[x,3.2,-17],[.8,6.4,.8],b.stone,0xe8dbbf);b.part('singapore-fullerton-colonnade',f,[x,1,-17.2],[.12,.8,.12],b.light);}
      b.part('singapore-fullerton-colonnade',f,[0,25,0],[77,2,33],b.stone,0xb4afa1);
    }
    // Anderson Bridge stays aligned with its actual drivable approach. The
    // existing road/barriers are retained; the architectural rails sit outside.
    const bridgeT=track.sections.find(s=>s.number===12)!.progress;
    for(const side of[-1,1])for(let i=0;i<14;i++){
      const aT=bridgeT+(i/14-.5)*70/track.length,cT=bridgeT+((i+1)/14-.5)*70/track.length;
      const a=track.point(aT).addScaledVector(track.normal(aT),side*17),c=track.point(cT).addScaledVector(track.normal(cT),side*17);
      if(!track.scenerySpace.clear(a,16.8)||!track.scenerySpace.clear(c,16.8))continue;
      const topA=a.clone().add(new THREE.Vector3(0,2.4+2.8*Math.sin(i/14*Math.PI),0)),topC=c.clone().add(new THREE.Vector3(0,2.4+2.8*Math.sin((i+1)/14*Math.PI),0));
      b.beam('singapore-anderson-bridge',topA,topC,.22,b.stone,0xe0ddd0);b.beam('singapore-anderson-bridge',a,topA,.18,b.stone,0xe0ddd0);
      b.beam('singapore-anderson-bridge',a,topC,.12,b.stone,0xd5d4ca);
    }
    // Road-height paving and narrow arcades: no pitched Mediterranean house roofs.
    for(let m=0;m<track.length;m+=12)for(const side of[-1,1]){
      const t=m/track.length,p=track.point(t).addScaledVector(track.normal(t),side*23),yaw=Math.atan2(track.tangent(t).x,track.tangent(t).z),fp=sceneryFootprint(p,yaw,-2,2,-6,6);
      if(track.scenerySpace.intersectsFootprint(fp,18)||!dry(fp))continue;
      b.part('singapore-promenades',{p,yaw},[0,.06,0],[4,.12,12],b.stone,0x8b989e);
      if(m%48===0)b.part('singapore-promenades',{p,yaw},[side*1.5,.5,0],[.12,1,10],b.metal,0xa0afb0);
    }
  }
  if(id==='montreal'){
    const f=site('montreal-island-service-court',10,1,48,25);if(f){pavilion('montreal-island-service-court',f,39,15,4.8);
      b.part('montreal-island-service-court',f,[0,6,0],[43,.4,21],b.wood);
      for(let x=-18;x<=18;x+=6)b.part('montreal-island-service-court',f,[x,2.8,-9],[.25,5.6,.25],b.wood);
    }
  }
  if(id==='montreal'){
    const basin=track.waters.find(a=>a.name==='olympic-rowing-basin');
    if(basin){
      const [a,c,d,e]=basin.points,delta=c.clone().sub(a),length=delta.length();
      for(let lane=1;lane<7;lane++)for(let m=12;m<length-12;m+=24){
        const t=m/length,left=a.clone().lerp(c,t),right=e.clone().lerp(d,t),q=left.lerp(right,lane/7),p=new THREE.Vector3(q.x,.08,q.y);
        if(track.scenerySpace.clear(p,38))b.part('montreal-rowing-basin', {p,yaw:0},[0,0,0],[.35,.22,.35],b.stone,lane%2?0xe7bb3e:0xd65a43);
      }
    }
  }
  b.finish();track.group.userData.venueArchitecture={sites,pitEnvelope:pit.userData.footprint};
}

/** A low concrete parapet remains coincident with the existing collider. The
 * upper seaward wall is open. Only the covered portion carries the hotel. */
function createHotelTunnel(track:Track,b:VenueBatch,register:Register){
  const tunnel=track.tunnel!;const length=(tunnel.end-tunnel.start)*track.length;
  // Existing geographic road is not surveyed. Cover only the hotel span rather
  // than roof the entire Portier-to-chicane distance as the previous model did.
  const coverLength=Math.min(length,310),rows=tunnel.centers.length-1,coverRows=Math.floor(rows*coverLength/length),positions:number[]=[],indices:number[]=[];
  for(let i=0;i<=rows;i++){
    const h=i<=coverRows?tunnel.height:1.1;
    for(const [p,y]of[[tunnel.left[i],0],[tunnel.left[i],1.1],[tunnel.right[i],h],[tunnel.right[i],0],[tunnel.outerRight[i],0],[tunnel.outerRight[i],h+tunnel.thickness],[tunnel.outerLeft[i],1.1+tunnel.thickness],[tunnel.outerLeft[i],0]] as const)positions.push(p.x,p.y+y,p.z);
    if(i<rows){
      for(const face of[0,2,3,4,6,7]){const a=i*8+face,c=i*8+(face+1)%8;indices.push(a,c,a+8,c,c+8,a+8);}
    }
  }
  // Roof and its thickness use a separate mesh, so daylight can enter through
  // the actual side openings above the safety parapet.
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const walls=new THREE.Group();walls.name='monaco-tunnel';const shell=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xb6b4a6,roughness:.9,side:THREE.DoubleSide}));shell.castShadow=true;shell.receiveShadow=true;walls.add(shell);register(walls);
  const roofPositions:number[]=[],roofIndices:number[]=[];
  for(let i=0;i<=coverRows;i++){
    for(const p of[tunnel.outerLeft[i],tunnel.outerRight[i]])for(const y of[tunnel.height,tunnel.height+.45])roofPositions.push(p.x,p.y+y,p.z);
    if(i<coverRows){const k=i*4;for(const [a,c,d,e]of[[0,2,4,6],[1,5,3,7],[0,4,1,5],[2,3,6,7]])roofIndices.push(k+a,k+c,k+d,k+c,k+e,k+d);}
  }
  const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(roofPositions,3));roof.setIndex(roofIndices);roof.computeVertexNormals();
  const chunks=createSpatialChunks(roof,new THREE.MeshStandardMaterial({color:0xb4b3a5,roughness:.88,side:THREE.DoubleSide}),120,'monaco-hotel-underpass-roof');for(const mesh of [...chunks.children]){const g=new THREE.Group();g.name='monaco-hotel-underpass-roof';mesh.castShadow=true;g.add(mesh);register(g);}
  for(let metres=0;metres<coverLength;metres+=10){
    const t=tunnel.start+metres/track.length,p=track.roadPoint(t),f={p,yaw:Math.atan2(track.tangent(t).x,track.tangent(t).z)};
    b.part('monaco-tunnel-columns',f,[tunnel.halfWidth+.15,3.5,0],[.7,4.8,.95],b.stone,0xc6c3b1);
    b.part('monaco-tunnel-columns',f,[0,5.55,0],[25.4,.35,.55],b.stone,0xa5a69c);
    for(const side of[-1,1])b.part('monaco-tunnel-lighting',f,[side*8,5.35,0],[.3,.15,3],b.light);
  }
  for(let metres=45;metres<coverLength-20;metres+=10){
    const t=tunnel.start+metres/track.length,p=track.roadPoint(t),f={p,yaw:Math.atan2(track.tangent(t).x,track.tangent(t).z)};
    // Setback terraces bridge the road; all enclosed hotel volume is above 6m.
    track.scenerySpace.reserveFootprint(sceneryFootprint(p,f.yaw,-27,24,-6,6));
    b.part('monaco-harbour-hotel',f,[-2,6.25,0],[48,.5,10.5],b.stone,0xc6c3b1);
    for(let floor=0;floor<6;floor++){
      const y=7.8+floor*3.15,setback=floor>3?(floor-3)*2:0;
      b.part('monaco-harbour-hotel',f,[-4-setback/2,y,0],[38-setback,2.85,10.3],b.facade,0xe8dfc7);
      b.part('monaco-harbour-hotel',f,[18-setback,y-1.45,0],[7,.24,10.5],b.stone,0xe7dfcc);
      b.part('monaco-harbour-hotel',f,[21-setback,y-.9,0],[.12,1.1,10.4],b.glass);
      for(const z of[-4,0,4])b.part('monaco-harbour-hotel',f,[21-setback,y-.85,z],[.08,1.2,.08],b.metal,0x9a9b8e,true);
    }
    b.part('monaco-harbour-hotel',f,[-5,26.2,0],[34,.5,10.5],b.stone,0xe1dac8);
  }
  // Fairmont's published brochure identifies rooftop pool/restaurant use.
  // The compact pool shape and its position are original game approximations.
  const poolT=tunnel.start+175/track.length,pool={p:track.roadPoint(poolT),yaw:Math.atan2(track.tangent(poolT).x,track.tangent(poolT).z)};
  b.part('monaco-harbour-hotel',pool,[-3,26.5,0],[9,.1,22],b.metal,0x3da3b9);
  for(const x of[-7.75,1.75])b.part('monaco-harbour-hotel',pool,[x,26.6,0],[.5,.3,23],b.stone,0xeee8d9);
  for(const z of[-11.25,11.25])b.part('monaco-harbour-hotel',pool,[-3,26.6,z],[9,.3,.5],b.stone,0xeee8d9);
  const terraceT=tunnel.start+235/track.length,terrace={p:track.roadPoint(terraceT),yaw:Math.atan2(track.tangent(terraceT).x,track.tangent(terraceT).z)};
  for(const x of[-12,0])for(const z of[-7,7])b.part('monaco-harbour-hotel',terrace,[x,27.8,z],[.16,2.7,.16],b.metal,0xb8b2a0);
  for(let z=-8;z<=8;z+=2)b.part('monaco-harbour-hotel',terrace,[-6,29.2,z],[14,.15,.8],b.wood);
  track.group.userData.monacoHotel={coverLength,height:tunnel.height,parapet:1.1,source:'SGM / Fairmont: hotel above the tunnel, partially open seaward side',adaptation:'310m game cover and six terrace levels are approximate, not a measured survey'};
}
