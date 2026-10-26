import * as THREE from 'three';
import {Vehicle} from './Vehicle';
import {GRAPHICS_PROFILES,type GraphicsTier} from './Graphics';

/** A real rear-facing scene render, horizontally reflected like a mirror. */
export class RearViewMirror {
  readonly camera=new THREE.PerspectiveCamera(58,4,.1,900);
  private target=new THREE.WebGLRenderTarget(480,120,{depthBuffer:true});
  private overlay=new THREE.Scene();
  private overlayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private viewport=new THREE.Vector4();
  private quality=GRAPHICS_PROFILES.high as typeof GRAPHICS_PROFILES[GraphicsTier];private age=Infinity;
  constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private element:HTMLElement){
    this.target.texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(2,2),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
    this.overlay.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:this.target.texture,toneMapped:false,depthTest:false,depthWrite:false})));
    this.resize();
  }
  resize(){
    const rect=this.element.getBoundingClientRect(),canvas=this.renderer.domElement.getBoundingClientRect();
    const size=this.renderer.getSize(new THREE.Vector2());
    const sx=size.x/canvas.width,sy=size.y/canvas.height;
    const width=Math.max(1,rect.width*sx),height=Math.max(1,rect.height*sy);
    this.viewport.set((rect.left-canvas.left)*sx,(canvas.bottom-rect.bottom)*sy,width,height);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    // Bound the extra render cost independently of the main canvas pixel ratio.
    const scale=Math.min(1,this.quality.mirrorWidth/width,this.quality.mirrorHeight/height);
    this.target.setSize(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)));this.age=Infinity;
  }
  setQuality(tier:GraphicsTier){this.quality=GRAPHICS_PROFILES[tier];this.resize();}
  update(vehicle:Vehicle){
    const forward=new THREE.Vector3(Math.sin(vehicle.heading),0,Math.cos(vehicle.heading));
    this.camera.position.copy(vehicle.position).addScaledVector(forward,-3.8);this.camera.position.y+=1.7;
    this.camera.up.set(0,1,0);
    this.camera.lookAt(vehicle.position.clone().addScaledVector(forward,-40).add(new THREE.Vector3(0,1.1,0)));
  }
  render(vehicle:Vehicle,dt=1/60){
    this.update(vehicle);
    const interval=1/this.quality.mirrorFPS;
    this.age+=Math.max(0,dt);const refresh=this.age+1e-6>=interval;
    const previousTarget=this.renderer.getRenderTarget();
    const previousViewport=this.renderer.getViewport(new THREE.Vector4());
    const previousScissor=this.renderer.getScissor(new THREE.Vector4());
    const previousScissorTest=this.renderer.getScissorTest(),previousAutoClear=this.renderer.autoClear;
    const visible=vehicle.group.visible,shadowUpdate=this.renderer.shadowMap?.autoUpdate;
    try{
      if(refresh){
        vehicle.group.visible=false;
        if(this.renderer.shadowMap)this.renderer.shadowMap.autoUpdate=false;
        this.renderer.setScissorTest(false);this.renderer.setRenderTarget(this.target);
        this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);
        this.age=Number.isFinite(this.age)?Math.max(0,Math.min(interval,this.age-interval)):0;
        vehicle.group.visible=visible;
      }
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(this.viewport);this.renderer.setScissor(this.viewport);this.renderer.setScissorTest(true);
      this.renderer.autoClear=false;this.renderer.clearDepth();
      this.renderer.render(this.overlay,this.overlayCamera);
    }finally{
      vehicle.group.visible=visible;if(this.renderer.shadowMap&&shadowUpdate!==undefined)this.renderer.shadowMap.autoUpdate=shadowUpdate;this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(previousViewport);this.renderer.setScissor(previousScissor);
      this.renderer.setScissorTest(previousScissorTest);this.renderer.autoClear=previousAutoClear;
    }
  }
}
