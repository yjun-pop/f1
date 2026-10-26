export type GraphicsTier='low'|'medium'|'high';
export type GraphicsMode='auto'|GraphicsTier;
export const GRAPHICS_PROFILES={
  low:{pixelRatio:1,shadowSize:512,reflectionWidth:256,mirrorWidth:320,mirrorHeight:90,mirrorFPS:20,detailRange:160},
  medium:{pixelRatio:1.35,shadowSize:1024,reflectionWidth:512,mirrorWidth:480,mirrorHeight:135,mirrorFPS:30,detailRange:260},
  high:{pixelRatio:1.75,shadowSize:2048,reflectionWidth:1024,mirrorWidth:640,mirrorHeight:180,mirrorFPS:60,detailRange:400}
} as const;
export function graphicsMode(value:unknown):GraphicsMode{return value==='low'||value==='medium'||value==='high'?value:'auto';}
export function recommendedTier(device:{memory?:number;cores?:number;maxTextureSize:number;width:number}):GraphicsTier {
  if(device.maxTextureSize<4096||(device.memory??8)<=2||(device.cores??8)<=2)return 'low';
  if(device.width>=900&&(device.memory??0)>=8&&(device.cores??0)>=8&&device.maxTextureSize>=8192)return 'high';
  return 'medium';
}
/** Samples real frame time; never adjusts physics or a manually selected tier. */
export class GraphicsQuality {
  mode:GraphicsMode; tier:GraphicsTier;
  private warmup=3;private elapsed=0;private frames=0;private slowWindows=0;
  constructor(mode:GraphicsMode,private recommended:GraphicsTier){this.mode=mode;this.tier=mode==='auto'?recommended:mode;}
  get profile(){return GRAPHICS_PROFILES[this.tier];}
  select(mode:GraphicsMode){this.mode=mode;const tier=mode==='auto'?this.recommended:mode;const changed=tier!==this.tier;this.tier=tier;this.resetSamples();return changed;}
  private resetSamples(){this.warmup=3;this.elapsed=this.frames=this.slowWindows=0;}
  observe(seconds:number,active:boolean){
    if(this.mode!=='auto'||!active||!Number.isFinite(seconds)||seconds<=0||seconds>.2){this.elapsed=this.frames=this.slowWindows=0;return false;}
    if(this.warmup>0){this.warmup-=seconds;return false;}
    this.elapsed+=seconds;this.frames++;
    if(this.elapsed<2)return false;
    const fps=this.frames/this.elapsed;this.elapsed=this.frames=0;
    this.slowWindows=fps<46?this.slowWindows+1:0;
    if(this.slowWindows<2||this.tier==='low')return false;
    this.tier=this.tier==='high'?'medium':'low';this.resetSamples();return true;
  }
}
