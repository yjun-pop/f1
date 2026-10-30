import * as THREE from 'three';
import type {GraphicsTier} from './Graphics';

type Surface='asphalt'|'grass'|'gravel'|'carbon'|'rubber';
type Terrain=Extract<Surface,'asphalt'|'grass'|'gravel'>;
interface SurfaceAsset {map:THREE.DataTexture;roughnessMap:THREE.DataTexture;height:Uint8Array;bumpMap?:THREE.DataTexture;normalMap?:THREE.DataTexture}
const cache=new Map<Surface,SurfaceAsset>();
let filtering=4;
const hash=(x:number,y:number,seed:number)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
/** Periodic value noise: all map layers and their baked normals wrap together. */
function noise(x:number,y:number,size:number,cellsX:number,cellsY:number,seed:number){
  const u=x/size*cellsX,v=y/size*cellsY,ix=Math.floor(u),iy=Math.floor(v),sx=u-ix,sy=v-iy;
  const a=sx*sx*(3-2*sx),b=sy*sy*(3-2*sy),at=(dx:number,dy:number)=>hash((ix+dx+cellsX)%cellsX,(iy+dy+cellsY)%cellsY,seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0,0),at(1,0),a),THREE.MathUtils.lerp(at(0,1),at(1,1),a),b);
}
function texture(data:Uint8Array,size:number,format:THREE.PixelFormat,colorSpace:THREE.ColorSpace=THREE.NoColorSpace){
  const t=new THREE.DataTexture(data,size,size,format);t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=filtering;t.needsUpdate=true;return t;
}
function asset(kind:Surface){
  const existing=cache.get(kind);if(existing)return existing;
  const size=kind==='asphalt'||kind==='grass'||kind==='gravel'?512:256,color=new Uint8Array(size*size*4),height=new Uint8Array(size*size),rough=new Uint8Array(size*size*2);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const pixel=y*size+x,i=pixel*4,n=hash(x,y,71237),fine=hash(x,y,1889);let rgb:number[],h:number,r:number;
    if(kind==='asphalt'){
      const binder=noise(x,y,size,6,6,732),aggregate=noise(x,y,size,256,256,911),stone=THREE.MathUtils.smoothstep(aggregate,.35,.85);
      const shade=68+binder*11+stone*17+(fine-.5)*10,chip=n>.97?6:0;
      rgb=[shade+chip,shade*1.012+chip,shade*1.025+chip];h=116+stone*32+(fine-.5)*19;r=181+binder*23+stone*31;
    }else if(kind==='grass'){
      const patch=noise(x,y,size,6,6,782),blade=noise(x,y,size,176,40,123),dry=THREE.MathUtils.smoothstep(patch,.58,.88)*.55;
      const shade=.86+patch*.24+(blade-.5)*.2;
      rgb=[(53+dry*39)*shade,(76+dry*13)*shade,(33+dry*24)*shade];h=95+blade*67+(n-.5)*20;r=232+n*20;
    }else if(kind==='gravel'){
      const cells=64,u=x/size*cells,v=y/size*cells,ix=Math.floor(u),iy=Math.floor(v);let first=Infinity,second=Infinity,tint=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const cx=(ix+dx+cells)%cells,cy=(iy+dy+cells)%cells;
        const distance=Math.hypot(u-(ix+dx+.15+hash(cx,cy,331)*.7),v-(iy+dy+.15+hash(cx,cy,744)*.7));
        if(distance<first){second=first;first=distance;tint=hash(cx,cy,998);}else second=Math.min(second,distance);
      }
      const edge=THREE.MathUtils.smoothstep(second-first,.015,.13),dome=1-THREE.MathUtils.smoothstep(first,.08,.8),shade=.72+edge*.22;
      rgb=[(162+tint*37)*shade,(151+tint*32)*shade,(132+tint*29)*shade];h=72+edge*40+dome*81+(n-.5)*10;r=226+tint*23;
    }else if(kind==='carbon'){
      const warp=((Math.floor(x/8)+Math.floor(y/8))%2===0),fibre=(warp?x:y)%8,shade=18+Math.sin(fibre/8*Math.PI)*16+fine*4;
      rgb=[shade*.83,shade*.92,shade];h=warp?118+fibre*3:132-fibre*2;r=115+fine*35;
    }else{
      const shade=28+n*3;rgb=[shade,shade+1,shade+2];h=115+fine*6;r=215+fine*12;
    }
    for(let c=0;c<3;c++)color[i+c]=rgb[c];color[i+3]=255;height[pixel]=h;rough[pixel*2]=rough[pixel*2+1]=r;
  }
  // Roughness uses green in the standard shader; RG keeps that channel while
  // halving this map's storage. Heights stay on the CPU until a map is needed.
  const result:SurfaceAsset={map:texture(color,size,THREE.RGBAFormat,THREE.SRGBColorSpace),roughnessMap:texture(rough,size,THREE.RGFormat),height};
  if(kind==='carbon'){result.map.repeat.set(8,8);result.roughnessMap.repeat.set(8,8);}
  if(kind==='grass'){result.map.repeat.set(800,800);result.roughnessMap.repeat.set(800,800);}
  cache.set(kind,result);return result;
}
/** Fine bump remains available for cockpit carbon and slick rubber. */
export function surfaceMaps(kind:Surface){
  const a=asset(kind),size=a.map.image.width;
  if(!a.bumpMap){
    const data=new Uint8Array(size*size*4);for(let i=0;i<a.height.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=a.height[i];data[i*4+3]=255;}
    a.bumpMap=texture(data,size,THREE.RGBAFormat);a.bumpMap.repeat.copy(a.map.repeat);
  }
  return {map:a.map,bumpMap:a.bumpMap,roughnessMap:a.roughnessMap};
}
/** One precomputed normal lookup replaces three height lookups per fragment. */
export function terrainMaps(kind:Terrain){
  const a=asset(kind),size=a.map.image.width;
  if(!a.normalMap){
    const data=new Uint8Array(size*size*4),strength={asphalt:1.2,grass:1.1,gravel:2.4}[kind];
    const at=(x:number,y:number)=>a.height[((y+size)%size)*size+(x+size)%size]/255;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const nx=(at(x-1,y)-at(x+1,y))*strength,ny=(at(x,y-1)-at(x,y+1))*strength,length=Math.hypot(nx,ny,1),i=(y*size+x)*4;
      data[i]=(nx/length*.5+.5)*255;data[i+1]=(ny/length*.5+.5)*255;data[i+2]=(1/length*.5+.5)*255;data[i+3]=255;
    }
    a.normalMap=texture(data,size,THREE.RGBAFormat);a.normalMap.repeat.copy(a.map.repeat);
  }
  return {map:a.map,normalMap:a.normalMap,roughnessMap:a.roughnessMap};
}
export function setSurfaceQuality(tier:GraphicsTier,maxAnisotropy:number){
  filtering=Math.max(1,Math.min(maxAnisotropy,{low:2,medium:4,high:8}[tier]));
  for(const a of cache.values())for(const map of [a.map,a.roughnessMap,a.normalMap,a.bumpMap])if(map&&map.anisotropy!==filtering){map.anisotropy=filtering;map.needsUpdate=true;}
}
