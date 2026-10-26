import * as THREE from 'three';

/** A small HDR twilight sky used for both the background and filtered PBR reflections. */
export function setupWorldLighting(scene:THREE.Scene,renderer:THREE.WebGLRenderer){
  const width=512,height=256,data=new Float32Array(width*height*4);
  const zenith=new THREE.Color('#233b61'),horizon=new THREE.Color('#c4b6a5'),ground=new THREE.Color('#333e42');
  const sunDirection=new THREE.Vector3(-.55,.32,-.5).normalize();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=(1-(y+.5)/height)*Math.PI,theta=(x+.5)/width*Math.PI*2-Math.PI;
    const direction=new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
    const sky=direction.y>=0?horizon.clone().lerp(zenith,Math.pow(direction.y,.45)):horizon.clone().lerp(ground,Math.min(1,-direction.y*6));
    const glow=Math.pow(Math.max(0,direction.dot(sunDirection)),48)*1.4;
    sky.add(new THREE.Color(1,.7,.4).multiplyScalar(glow));
    const i=(y*width+x)*4;data[i]=sky.r*1.7;data[i+1]=sky.g*1.7;data[i+2]=sky.b*1.7;data[i+3]=1;
  }
  const half=new Uint16Array(data.length);for(let i=0;i<data.length;i++)half[i]=THREE.DataUtils.toHalfFloat(data[i]);
  const sky=new THREE.DataTexture(half,width,height,THREE.RGBAFormat,THREE.HalfFloatType);sky.mapping=THREE.EquirectangularReflectionMapping;sky.magFilter=THREE.LinearFilter;sky.minFilter=THREE.LinearFilter;sky.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(sky).texture;pmrem.dispose();
  scene.background=sky;scene.backgroundIntensity=.85;scene.environmentIntensity=.9;scene.fog=new THREE.Fog(0x9ca5ad,260,1500);
  scene.add(new THREE.HemisphereLight(0xb8cce7,0x484a35,1.45));
  const sun=new THREE.DirectionalLight(0xffe0b5,3.1);sun.position.set(-85,50,-77);sun.castShadow=true;
  sun.shadow.mapSize.set(window.innerWidth<700?1024:2048,window.innerWidth<700?1024:2048);
  Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:400});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;
  scene.add(sun,sun.target);return sun;
}
