export type GraphicsTier='low'|'medium'|'high';
export type GraphicsMode='auto'|GraphicsTier;
export const GRAPHICS_PROFILES={
  low:{pixelRatio:1,pixelBudget:1200000,shadowSize:512,reflectionWidth:256,mirrorWidth:512,mirrorHeight:144,mirrorScale:1.25,mirrorSamples:0,mirrorFPS:30,mirrorFar:220,viewFar:800,detailRange:160,forestRange:600,forestDetail:45},
  medium:{pixelRatio:1.1,pixelBudget:2100000,shadowSize:768,reflectionWidth:512,mirrorWidth:768,mirrorHeight:216,mirrorScale:1.75,mirrorSamples:2,mirrorFPS:60,mirrorFar:320,viewFar:1100,detailRange:240,forestRange:850,forestDetail:75},
  high:{pixelRatio:1.35,pixelBudget:3600000,shadowSize:1024,reflectionWidth:512,mirrorWidth:1024,mirrorHeight:288,mirrorScale:2,mirrorSamples:4,mirrorFPS:60,mirrorFar:500,viewFar:1400,detailRange:360,forestRange:1200,forestDetail:130}
} as const;
export function graphicsMode(value:unknown):GraphicsMode{return value==='low'||value==='medium'||value==='high'?value:'auto';}
export function recommendedTier(device:{memory?:number;cores?:number;maxTextureSize:number;width:number}):GraphicsTier {
  if(device.maxTextureSize<4096||(device.memory??8)<=2||(device.cores??8)<=2)return 'low';
  // RAM, CPU count and maximum texture size do not establish GPU throughput.
  return 'medium';
}
export function renderPixelRatio(deviceRatio:number,width:number,height:number,tier:GraphicsTier,scale=1){const p=GRAPHICS_PROFILES[tier];return Math.min(deviceRatio||1,p.pixelRatio,Math.sqrt(p.pixelBudget/Math.max(1,width*height)))*scale;}
/** Samples real frame time; never adjusts physics or a manually selected tier. */
export class GraphicsQuality {
  mode:GraphicsMode; tier:GraphicsTier;
  renderScale=1;
  private warmup=.75;private elapsed=0;private frames=0;private slowWindows=0;private heavyFrames=0;
  constructor(mode:GraphicsMode,private recommended:GraphicsTier){this.mode=mode;this.tier=mode==='auto'?recommended:mode;}
  get profile(){return GRAPHICS_PROFILES[this.tier];}
  select(mode:GraphicsMode){this.mode=mode;const tier=mode==='auto'?this.recommended:mode;const changed=tier!==this.tier||this.renderScale!==1;this.tier=tier;this.renderScale=1;this.resetSamples();return changed;}
  private resetSamples(){this.warmup=.75;this.elapsed=this.frames=this.slowWindows=this.heavyFrames=0;}
  private reduce(){
    if(this.tier==='low'){if(this.renderScale<=.65)return false;this.renderScale=Math.max(.65,this.renderScale*.9);}
    else this.tier=this.tier==='high'?'medium':'low';
    this.resetSamples();return true;
  }
  observe(seconds:number,active:boolean){
    if(this.mode!=='auto'||!active||!Number.isFinite(seconds)||seconds<=0){this.elapsed=this.frames=this.slowWindows=this.heavyFrames=0;return false;}
    if(seconds>.15){if(++this.heavyFrames<3)return false;return this.reduce();}else this.heavyFrames=0;
    if(this.warmup>0){this.warmup-=seconds;return false;}
    this.elapsed+=seconds;this.frames++;
    if(this.elapsed<.75)return false;
    const fps=this.frames/this.elapsed;this.elapsed=this.frames=0;
    this.slowWindows=fps<50?this.slowWindows+1:0;
    if(this.slowWindows<2&&fps>=28)return false;
    return this.reduce();
  }
}
