import * as THREE from 'three';
import {GRAPHICS_PROFILES,type GraphicsTier} from './Graphics';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

/** Average HDR radiance in linear space, preserving bright sky energy on low tiers. */
export function resizeSkyTexture(source:THREE.DataTexture,width:number){
  width=Math.min(width,source.image.width);
  const src=source.image.data as Uint16Array,sw=source.image.width,sh=source.image.height,height=width/2,factor=sw/width;
  const data=new Uint16Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    for(let c=0;c<3;c++){
      let sum=0;for(let sy=0;sy<factor;sy++)for(let sx=0;sx<factor;sx++)sum+=THREE.DataUtils.fromHalfFloat(src[((Math.min(sh-1,y*factor+sy))*sw+Math.min(sw-1,x*factor+sx))*4+c]);
      data[i+c]=THREE.DataUtils.toHalfFloat(sum/(factor*factor));
    }
    data[i+3]=THREE.DataUtils.toHalfFloat(1);
  }
  const sky=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.HalfFloatType);sky.flipY=source.flipY;sky.mapping=THREE.EquirectangularReflectionMapping;sky.minFilter=sky.magFilter=THREE.LinearFilter;sky.needsUpdate=true;return sky;
}

/** Only sky belongs at infinity: photographed trees/ground cannot create parallax. */
export function createSkyBackdrop(photo:THREE.DataTexture|undefined,sun:THREE.Vector3){
  const width=512,height=256,data=new Uint16Array(width*height*4),direction=sun.clone().normalize();
  const horizon=new THREE.Color('#b0c0cc'),zenith=new THREE.Color('#456e9f'),ground=new THREE.Color('#506249'),color=new THREE.Color();
  const source=photo?.image.data as Uint16Array|undefined,sw=photo?.image.width??0,sh=photo?.image.height??0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=(y+.5)/height*Math.PI,theta=(x+.5)/width*Math.PI*2-Math.PI,elevation=Math.cos(phi),blend=THREE.MathUtils.smoothstep(elevation,.02,.65);
    color.copy(horizon).lerp(elevation>=0?zenith:ground,elevation>=0?blend:Math.min(1,-elevation*5));
    if(source&&elevation>0){const sy=Math.min(sh-1,Math.floor((1-elevation)*sh*.22)),sx=Math.min(sw-1,Math.floor(x/width*sw)),i=(sy*sw+sx)*4;for(const [channel,key] of ['r','g','b'].entries())color[key as 'r'|'g'|'b']=THREE.MathUtils.lerp(color[key as 'r'|'g'|'b'],THREE.DataUtils.fromHalfFloat(source[i+channel]),blend);}
    const dot=Math.sin(phi)*Math.cos(theta)*direction.x+elevation*direction.y+Math.sin(phi)*Math.sin(theta)*direction.z,glow=Math.pow(Math.max(0,dot),512)*3;
    const i=(y*width+x)*4;data[i]=THREE.DataUtils.toHalfFloat(color.r+glow);data[i+1]=THREE.DataUtils.toHalfFloat(color.g+glow*.83);data[i+2]=THREE.DataUtils.toHalfFloat(color.b+glow*.6);data[i+3]=THREE.DataUtils.toHalfFloat(1);
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.HalfFloatType);texture.flipY=true;texture.mapping=THREE.EquirectangularReflectionMapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

/** A small HDR twilight sky used for both the background and filtered PBR reflections. */
export function createSkyTexture(width:number){
  const height=width/2,data=new Float32Array(width*height*4);
  const zenith=new THREE.Color('#233b61'),horizon=new THREE.Color('#c4b6a5'),ground=new THREE.Color('#333e42');
  const sunDirection=new THREE.Vector3(-.55,.32,-.5).normalize(),direction=new THREE.Vector3(),skyColor=new THREE.Color();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=(1-(y+.5)/height)*Math.PI,theta=(x+.5)/width*Math.PI*2-Math.PI;
    direction.set(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
    const sky=skyColor.copy(horizon).lerp(direction.y>=0?zenith:ground,direction.y>=0?Math.pow(direction.y,.45):Math.min(1,-direction.y*6));
    const glow=Math.pow(Math.max(0,direction.dot(sunDirection)),48)*1.4;
    sky.r+=glow;sky.g+=glow*.7;sky.b+=glow*.4;
    const i=(y*width+x)*4;data[i]=sky.r*1.7;data[i+1]=sky.g*1.7;data[i+2]=sky.b*1.7;data[i+3]=1;
  }
  const half=new Uint16Array(data.length);for(let i=0;i<data.length;i++)half[i]=THREE.DataUtils.toHalfFloat(data[i]);
  const sky=new THREE.DataTexture(half,width,height,THREE.RGBAFormat,THREE.HalfFloatType);sky.mapping=THREE.EquirectangularReflectionMapping;sky.magFilter=THREE.LinearFilter;sky.minFilter=THREE.LinearFilter;sky.needsUpdate=true;
  return sky;
}
export class WorldLighting {
  readonly sun=new THREE.DirectionalLight(0xfff1dd,2.8);
  readonly sunOffset=new THREE.Vector3(-85,50,-77);
  private sky?:THREE.DataTexture;private environment?:THREE.WebGLRenderTarget;private tier?:GraphicsTier;
  private photograph?:THREE.DataTexture;private loadVersion=0;private disposed=false;
  private backdrop?:THREE.DataTexture;
  constructor(private scene:THREE.Scene,private renderer:THREE.WebGLRenderer,tier:GraphicsTier){
    scene.backgroundIntensity=.85;scene.environmentIntensity=.85;scene.fog=new THREE.Fog(0xb0c0cc,300,1800);
    scene.add(new THREE.HemisphereLight(0xbdd4e5,0x545649,.8));
    const sun=this.sun;sun.position.set(-85,50,-77);sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:400});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;
    scene.add(sun,sun.target);this.setQuality(tier);
  }
  async loadSky(url:string){
    const version=++this.loadVersion;
    try{
      const source=await new HDRLoader().loadAsync(url);
      if(this.disposed||version!==this.loadVersion){source.dispose();return false;}
      this.photograph?.dispose();this.photograph=source;
      const data=source.image.data as Uint16Array,w=source.image.width,h=source.image.height;let brightest=0,pixel=0;
      for(let i=0;i<w*h/2;i++){const value=THREE.DataUtils.fromHalfFloat(data[i*4])*.2126+THREE.DataUtils.fromHalfFloat(data[i*4+1])*.7152+THREE.DataUtils.fromHalfFloat(data[i*4+2])*.0722;if(value>brightest){brightest=value;pixel=i;}}
      const phi=(Math.floor(pixel/w)+.5)/h*Math.PI,theta=(pixel%w+.5)/w*Math.PI*2-Math.PI;
      this.sunOffset.set(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)).multiplyScalar(130);
      this.setQuality(this.tier!,true);return true;
    }catch{return false;}
  }
  setQuality(tier:GraphicsTier,force=false){
    if(tier===this.tier&&!force)return;
    const profile=GRAPHICS_PROFILES[tier];
    if(this.scene.fog instanceof THREE.Fog){this.scene.fog.near=profile.viewFar*.26;this.scene.fog.far=profile.viewFar*.96;}
    if(!force&&this.tier&&profile.reflectionWidth===GRAPHICS_PROFILES[this.tier].reflectionWidth){this.tier=tier;this.updateShadowSize(profile.shadowSize);return;}
    const sky=this.photograph?resizeSkyTexture(this.photograph,profile.reflectionWidth):createSkyTexture(profile.reflectionWidth),pmrem=new THREE.PMREMGenerator(this.renderer);
    let environment:THREE.WebGLRenderTarget;
    try{environment=pmrem.fromEquirectangular(sky);}catch(error){sky.dispose();throw error;}finally{pmrem.dispose();}
    if(!this.backdrop||force){const backdrop=createSkyBackdrop(this.photograph,this.sunOffset);this.backdrop?.dispose();this.backdrop=backdrop;this.scene.background=backdrop;}
    this.scene.environment=environment.texture;
    this.environment?.dispose();this.sky?.dispose();this.environment=environment;this.sky=sky;this.tier=tier;
    this.updateShadowSize(profile.shadowSize);
  }
  private updateShadowSize(size:number){if(this.sun.shadow.mapSize.x===size)return;this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(size,size);this.sun.shadow.needsUpdate=true;}
  dispose(){this.disposed=true;this.loadVersion++;this.photograph?.dispose();this.environment?.dispose();this.sky?.dispose();this.backdrop?.dispose();this.sun.shadow.dispose();this.scene.environment=null;this.scene.background=null;}
}
