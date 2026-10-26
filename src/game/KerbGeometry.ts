import * as THREE from 'three';
import type {Track} from './Track';

// Same footprint as the wheel-contact test; the low crown blends into both edges.
export const KERB_PROFILE=[[9.65,.04],[9.82,.055],[10.3,.115],[10.82,.072],[11.05,-.078]] as const;
type KerbPath=Pick<Track,'point'|'roadNormal'|'length'>;
export function connectKerbSegments(mask:Uint8Array,length:number){
  const original=mask.slice(),count=mask.length;
  for(let i=0;i<count;i++)if(original[i]&&!original[(i+1)%count]){
    let gap=1;while(gap<count&&!original[(i+1+gap)%count])gap++;
    if(gap<count&&gap*length/count<=30)for(let j=1;j<=gap;j++)mask[(i+j)%count]=1;
  }
}
export interface KerbContactSegment {x:number;z:number;dx:number;dz:number;nx:number;nz:number;det:number}
export function createKerbContacts(track:KerbPath,mask:Uint8Array){
  return Array.from(mask,(active,cell)=>{
    const segments:KerbContactSegment[]=[];if(!active)return segments;
    for(const side of [-1,1])for(let slice=0;slice<4;slice++){
      const ta=(cell-.5+slice/4)/mask.length,tb=(cell-.5+(slice+1)/4)/mask.length;
      const na=track.roadNormal(ta).multiplyScalar(side),nb=track.roadNormal(tb).multiplyScalar(side);
      const a=track.point(ta).addScaledVector(na,10.35),b=track.point(tb).addScaledVector(nb,10.35),n=na.add(nb).multiplyScalar(.5);
      const dx=b.x-a.x,dz=b.z-a.z;segments.push({x:a.x,z:a.z,dx,dz,nx:n.x,nz:n.z,det:dx*n.z-dz*n.x});
    }
    return segments;
  });
}
/** A shared, curved ribbon. Red/white divisions are paint, never separate boxes. */
export function createKerbGeometry(track:KerbPath,mask:Uint8Array){
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],vertices=new Map<string,number>();
  const count=mask.length,steps=4,profile=KERB_PROFILE.length,left=new Uint16Array(count),right=new Uint16Array(count);
  let run=0;
  for(let k=0;k<count*2;k++){const i=k%count;run=mask[i]?Math.min(count,run+1):0;left[i]=Math.max(0,run-1);}
  run=0;for(let k=count*2-1;k>=0;k--){const i=k%count;run=mask[i]?Math.min(count,run+1):0;right[i]=Math.max(0,run-1);}
  for(const side of [-1,1])for(let cell=0;cell<count;cell++){
    if(!mask[cell])continue;
    const rows:number[][]=[];
    for(let slice=0;slice<=steps;slice++){
      const sample=cell*steps-steps/2+slice,t=sample/(count*steps),p=track.point(t),n=track.roadNormal(t);
      const edgeDistance=Math.min(left[cell]+slice/steps,right[cell]+1-slice/steps)*track.length/count;
      const blend=THREE.MathUtils.smoothstep(edgeDistance,0,3),row:number[]=[];
      for(let cross=0;cross<profile;cross++){
        const key=`${side}/${sample}/${cross}`;let index=vertices.get(key);
        if(index===undefined){
          const [offset,height]=KERB_PROFILE[cross],base=THREE.MathUtils.lerp(.04,-.078,(offset-9.65)/1.4);
          index=positions.length/3;vertices.set(key,index);positions.push(p.x+n.x*side*offset,THREE.MathUtils.lerp(base,height,blend),p.z+n.z*side*offset);
          uvs.push((sample+steps/2)/(steps*2),(offset-9.65)/1.4);
        }
        row.push(index);
      }
      rows.push(row);
    }
    for(let slice=0;slice<steps;slice++)for(let cross=0;cross<profile-1;cross++){
      const a=rows[slice][cross],b=rows[slice][cross+1],c=rows[slice+1][cross],d=rows[slice+1][cross+1];
      if(side===1)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
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
