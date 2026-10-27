import * as THREE from 'three';
import type {Track} from './Track';

export const KERB_PROFILE=[[9.65,.035],[9.82,.043],[10.3,.055],[10.82,.044],[11.05,-.078]] as const;
export const KERB_PAINT_LENGTH=.75;
type KerbPath=Pick<Track,'roadPoint'|'roadNormal'|'length'>;
interface Row {coordinate:number;p:THREE.Vector3;n:THREE.Vector3}
export function connectKerbSegments(mask:Uint8Array,length:number){
  const original=mask.slice(),count=mask.length;
  for(let i=0;i<count;i++)if(original[i]&&!original[(i+1)%count]){
    let gap=1;while(gap<count&&!original[(i+1+gap)%count])gap++;
    if(gap<count&&gap*length/count<=30)for(let j=1;j<=gap;j++)mask[(i+j)%count]=1;
  }
}
/** Shared samples limit visible edge error to 1mm and heading change to two degrees. */
export function kerbRows(track:KerbPath,mask:Uint8Array){
  const cache=new Map<number,Row>(),sample=(coordinate:number)=>{
    let row=cache.get(coordinate);if(!row){row={coordinate,p:track.roadPoint(coordinate/mask.length),n:track.roadNormal(coordinate/mask.length)};cache.set(coordinate,row);}return row;
  };
  return Array.from(mask,(active,cell)=>{
    if(!active)return [];
    const rows:Row[]=[sample(cell-.5)];
    const split=(a:Row,b:Row,depth:number)=>{
      const mid=sample((a.coordinate+b.coordinate)/2);let refine=a.n.dot(b.n)<Math.cos(Math.PI/90);
      for(const offset of [-11.05,-9.65,9.65,11.05]){
        const pa=a.p.clone().addScaledVector(a.n,offset),pb=b.p.clone().addScaledVector(b.n,offset),pm=mid.p.clone().addScaledVector(mid.n,offset);
        if(pa.distanceToSquared(pb)>.6*.6||pm.distanceToSquared(pa.add(pb).multiplyScalar(.5))>.001*.001)refine=true;
      }
      if(refine&&depth<7){split(a,mid,depth+1);split(mid,b,depth+1);}else rows.push(b);
    };
    split(rows[0],sample(cell+.5),0);return rows;
  });
}
export interface KerbContactSegment {x:number;z:number;dx:number;dz:number;nx:number;nz:number;det:number}
export function createKerbContacts(track:KerbPath,mask:Uint8Array){
  return kerbRows(track,mask).map(rows=>{
    const segments:KerbContactSegment[]=[];
    for(const side of [-1,1])for(let j=1;j<rows.length;j++){
      const ra=rows[j-1],rb=rows[j],a=ra.p.clone().addScaledVector(ra.n,side*10.35),b=rb.p.clone().addScaledVector(rb.n,side*10.35),n=ra.n.clone().add(rb.n).multiplyScalar(side*.5);
      const dx=b.x-a.x,dz=b.z-a.z;segments.push({x:a.x,z:a.z,dx,dz,nx:n.x,nz:n.z,det:dx*n.z-dz*n.x});
    }return segments;
  });
}
/** A continuous C2 path with adaptive triangles; paint spacing follows each kerb's arc. */
export function createKerbGeometry(track:KerbPath,mask:Uint8Array){
  const positions:number[]=[],uvs:number[]=[],progress:number[]=[],indices:number[]=[],vertices=new Map<string,number>();
  const count=mask.length,profile=KERB_PROFILE.length,left=new Uint16Array(count),right=new Uint16Array(count),cells=kerbRows(track,mask);
  let run=0;for(let k=0;k<count*2;k++){const i=k%count;run=mask[i]?Math.min(count,run+1):0;left[i]=Math.max(0,run-1);}
  run=0;for(let k=count*2-1;k>=0;k--){const i=k%count;run=mask[i]?Math.min(count,run+1):0;right[i]=Math.max(0,run-1);}
  for(const side of [-1,1]){
    let distance=0,previous:THREE.Vector3|undefined;
    for(let cell=0;cell<count;cell++){
      if(!mask[cell]){previous=undefined;distance=0;continue;}
      const rows:number[][]=[];
      for(const sample of cells[cell]){
        const {p,n,coordinate}=sample,center=p.clone().addScaledVector(n,side*10.35),fraction=coordinate-cell+.5;
        if(previous)distance+=center.distanceTo(previous);previous=center;
        const edgeDistance=Math.min(left[cell]+fraction,right[cell]+1-fraction)*track.length/count,blend=THREE.MathUtils.smoothstep(edgeDistance,0,3),row:number[]=[];
        for(let cross=0;cross<profile;cross++){
          const key=`${side}/${coordinate}/${cross}`;let index=vertices.get(key);
          if(index===undefined){
            const [offset,height]=KERB_PROFILE[cross],base=THREE.MathUtils.lerp(.035,-.078,(offset-9.65)/1.4);
            index=positions.length/3;vertices.set(key,index);positions.push(p.x+n.x*side*offset,THREE.MathUtils.lerp(base,height,blend),p.z+n.z*side*offset);
            uvs.push(distance/(2*KERB_PAINT_LENGTH),(offset-9.65)/1.4);progress.push(coordinate/count);
          }row.push(index);
        }rows.push(row);
      }
      for(let slice=0;slice<rows.length-1;slice++)for(let cross=0;cross<profile-1;cross++){
        const a=rows[slice][cross],b=rows[slice][cross+1],c=rows[slice+1][cross],d=rows[slice+1][cross+1];
        if(side===1)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('progress',new THREE.Float32BufferAttribute(progress,1));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
let paintMap:THREE.DataTexture|undefined;
export function kerbPaintMap(){
  if(paintMap)return paintMap;
  const width=64,height=8,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const color=x<width/2?[214,73,59]:[245,243,232],i=(y*width+x)*4;
    for(let c=0;c<3;c++)data[i+c]=color[c];data[i+3]=255;
  }
  paintMap=new THREE.DataTexture(data,width,height);paintMap.colorSpace=THREE.SRGBColorSpace;paintMap.wrapS=THREE.RepeatWrapping;
  paintMap.magFilter=THREE.LinearFilter;paintMap.minFilter=THREE.LinearMipmapLinearFilter;paintMap.generateMipmaps=true;paintMap.anisotropy=4;paintMap.needsUpdate=true;return paintMap;
}
