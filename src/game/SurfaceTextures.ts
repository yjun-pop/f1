import * as THREE from 'three';

type Surface='asphalt'|'grass'|'gravel'|'carbon'|'rubber';
const cache=new Map<Surface,{map:THREE.DataTexture;bumpMap:THREE.DataTexture;roughnessMap:THREE.DataTexture}>();
/** Deterministic, locally generated material maps; no remote asset requests. */
export function surfaceMaps(kind:Surface){
  const existing=cache.get(kind);if(existing)return existing;
  const size=kind==='asphalt'||kind==='grass'||kind==='gravel'?512:256,color=new Uint8Array(size*size*4),height=new Uint8Array(color.length),rough=new Uint8Array(color.length);
  let seed=71237;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,n=random(),fine=random();let rgb:number[],h:number,r:number;
    if(kind==='asphalt'){
      const grain=n<.07?1.45:n<.22?.65:1;
      const shade=(.84+fine*.32)*grain*(.96+.045*Math.sin(x*.043+y*.015)*Math.sin(y*.03));
      rgb=[83*shade,86*shade,89*shade];h=90+n*100;r=202+n*42;
    }else if(kind==='grass'){
      const blade=(Math.sin(x*1.7+Math.sin(y*.3)*3)>0?.09:-.04),patch=.82+.1*Math.sin(x*.023+Math.sin(y*.017)*2)+n*.2+blade;
      rgb=[65*patch,79*patch,44*patch];h=90+n*55+blade*95;r=230+n*24;
    }else if(kind==='gravel'){
      const pebble=Math.sin(x*.7+Math.sin(y*.8))*Math.cos(y*.64),shade=.87+n*.17+pebble*.12;
      rgb=[174*shade,161*shade,135*shade];h=110+pebble*45+n*30;r=232+n*22;
    }else if(kind==='carbon'){
      const warp=((Math.floor(x/8)+Math.floor(y/8))%2===0);
      const fibre=(warp?x:y)%8,shade=18+Math.sin(fibre/8*Math.PI)*16+fine*4;
      rgb=[shade*.83,shade*.92,shade];h=warp?118+fibre*3:132-fibre*2;r=115+fine*35;
    }else{
      const shade=28+n*3;rgb=[shade,shade+1,shade+2];h=115+fine*6;r=215+fine*12;
    }
    for(let k=0;k<3;k++){color[i+k]=rgb[k];height[i+k]=h;rough[i+k]=r;}
    color[i+3]=height[i+3]=rough[i+3]=255;
  }
  const texture=(data:Uint8Array,colorSpace:THREE.ColorSpace)=>{
    const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
    t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;
  };
  const maps={map:texture(color,THREE.SRGBColorSpace),bumpMap:texture(height,THREE.NoColorSpace),roughnessMap:texture(rough,THREE.NoColorSpace)};
  if(kind==='carbon')for(const t of Object.values(maps))t.repeat.set(8,8);
  if(kind==='grass')for(const t of Object.values(maps))t.repeat.set(800,800);
  cache.set(kind,maps);return maps;
}
