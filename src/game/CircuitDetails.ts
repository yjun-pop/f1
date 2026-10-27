import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GRAPHICS_PROFILES,type GraphicsTier} from './Graphics';
import type {Track} from './Track';

/** Local batches keep detail near either view without drawing the whole circuit. */
export class CircuitDetails {
  readonly group=new THREE.Group();
  private chunks:{group:THREE.Group;center:THREE.Vector3;radius:number}[]=[];
  constructor(track:Track){
    this.group.name='circuit-details';
    const wireData=new Uint8Array(32*32*4);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4;wireData[i]=155;wireData[i+1]=166;wireData[i+2]=174;
      wireData[i+3]=(x+y)%16===0||(x-y+32)%16===0?255:0;
    }
    const wireMap=new THREE.DataTexture(wireData,32,32);wireMap.wrapS=wireMap.wrapT=THREE.RepeatWrapping;
    wireMap.magFilter=THREE.LinearFilter;wireMap.minFilter=THREE.LinearMipmapLinearFilter;wireMap.generateMipmaps=true;wireMap.needsUpdate=true;wireMap.colorSpace=THREE.SRGBColorSpace;
    const wireMaterial=new THREE.MeshStandardMaterial({map:wireMap,alphaTest:.35,side:THREE.DoubleSide,roughness:.7,metalness:.35});
    const steel=new THREE.MeshStandardMaterial({color:0x7b878b,roughness:.55,metalness:.65});
    const poleGeometry=new THREE.BoxGeometry(.075,2.9,.075),stamp=new THREE.Object3D();
    const chunks=Math.ceil(track.length/120);
    for(let chunk=0;chunk<chunks;chunk++){
      const group=new THREE.Group();group.name='catch-fence';
      const segments=12,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
      const posts=new THREE.InstancedMesh(poleGeometry,steel,(segments+1)*2);let post=0;
      for(const side of [-1,1]){
        const start=positions.length/3,path=track.barrierPaths[side===1?1:0],from=chunk/chunks,to=(chunk+1)/chunks;
        // Fence rows share every wall bend; sparse post spacing must not turn
        // the wire mesh into a chord cutting through a tight barrier corner.
        const rows=[from,...path.distances.slice(1,-1).map(d=>d/path.length).filter(t=>t>from+1e-8&&t<to-1e-8),to];
        for(let j=0;j<rows.length;j++){
          const t=rows[j],p=path.point(t,side*.35);positions.push(p.x,1.15,p.z,p.x,3.75,p.z);uvs.push(t*path.length*1.6,0,t*path.length*1.6,4);
          if(j<rows.length-1){const i=start+j*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
        }
        for(let j=0;j<=segments;j++){
          const t=(chunk+j/segments)/chunks,p=path.point(t,side*.35);
          const forward=path.point(t+.5/path.length).sub(path.point(t-.5/path.length));stamp.position.set(p.x,2.45,p.z);stamp.rotation.set(0,Math.atan2(forward.x,forward.z),0);stamp.updateMatrix();posts.setMatrixAt(post++,stamp.matrix);
        }
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry,wireMaterial),posts);
      const box=new THREE.Box3().setFromObject(group),sphere=box.getBoundingSphere(new THREE.Sphere());
      this.chunks.push({group,center:sphere.center,radius:sphere.radius});this.group.add(group);
    }
    // Pit openings face the road. All shutters and all frames use one batch each.
    const pit=new THREE.Group();pit.name='pit-garage-details';pit.position.copy(track.point(.035)).addScaledVector(track.normal(.035),31);pit.rotation.y=Math.atan2(track.tangent(.035).x,track.tangent(.035).z);
    const shutters=new THREE.InstancedMesh(new THREE.BoxGeometry(.06,3.25,8.5),new THREE.MeshStandardMaterial({color:0x35434c,roughness:.78}),24);
    const trimPieces:THREE.BufferGeometry[]=[];
    const trim=(w:number,h:number,d:number,x:number,y:number,z:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);trimPieces.push(g);};
    for(let garage=0;garage<24;garage++){
      const z=-115+garage*10;stamp.position.set(8.54,1.75,z);stamp.rotation.set(0,0,0);stamp.updateMatrix();shutters.setMatrixAt(garage,stamp.matrix);
      shutters.setColorAt(garage,new THREE.Color([0x344854,0x445a58,0x594953,0x394e60][garage%4]));
      trim(.16,.18,9,8.65,3.55,z);trim(.16,3.5,.15,8.65,1.8,z-4.5);trim(.16,3.5,.15,8.65,1.8,z+4.5);
      for(let slat=0;slat<8;slat++)trim(.075,.025,8.4,8.585,.35+slat*.39,z);
    }
    trim(.4,.22,240,8.6,7.12,0);
    const trimGeometry=mergeGeometries(trimPieces);for(const part of trimPieces)part.dispose();
    pit.add(shutters,new THREE.Mesh(trimGeometry,steel));this.group.add(pit);pit.updateMatrixWorld(true);
    this.chunks.push({group:pit,center:pit.position.clone(),radius:125});
    track.group.add(this.group);
  }
  update(position:THREE.Vector3,tier:GraphicsTier){
    const range=GRAPHICS_PROFILES[tier].detailRange;
    for(const chunk of this.chunks)chunk.group.visible=chunk.center.distanceToSquared(position)<(range+chunk.radius)**2;
  }
}
