import * as THREE from 'three';
import {Vehicle} from './Vehicle';
import type {DrivingFeedbackFrame} from './DrivingFeedback';
export class CockpitCamera {
  readonly camera=new THREE.PerspectiveCamera(76,1,.06,1800);
  mode=1;
  eyeHeight=1.8;
  private cockpit=new THREE.Group();private wheel=new THREE.Group();private initialized=false;
  private display=document.createElement('canvas');private displayTexture:THREE.CanvasTexture;
  private displayAge=0;
  constructor(scene:THREE.Scene){
    const carbon=new THREE.MeshStandardMaterial({color:0x11161b,roughness:.43,metalness:.35});
    const mesh=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material=carbon)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);return m;};
    const tube=(points:number[][],radius:number)=>new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),32,radius,8,false),carbon);
    this.cockpit.add(mesh(1.65,.32,.7,0,-.77,-1.2));
    this.cockpit.add(tube([[-1.05,-.65,-1.1],[-.82,-.31,-1.4],[-.4,-.19,-1.55],[0,-.16,-1.6],[.4,-.19,-1.55],[.82,-.31,-1.4],[1.05,-.65,-1.1]],.048));
    this.cockpit.add(tube([[0,-.16,-1.6],[0,-.20,-2.2],[0,-.28,-2.8]],.032));
    const red=new THREE.MeshStandardMaterial({color:0x8b969f,metalness:.35,roughness:.32});
    for(const side of [-1,1]){
      const rim=mesh(.22,.24,.94,side*.83,-.59,-1.1,red);rim.rotation.z=side*.18;this.cockpit.add(rim);
      this.wheel.add(mesh(.1,.32,.11,side*.29,0,0));
      this.wheel.add(mesh(.18,.07,.11,side*.23,.14,0));
      for(let i=0;i<3;i++){const button=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.015,12),new THREE.MeshBasicMaterial({color:[0x4bd8ff,0xffb836,0xe44854][i]}));button.rotation.x=Math.PI/2;button.position.set(side*.21,.08-i*.065,.07);this.wheel.add(button);}
    }
    const gloveMaterial=new THREE.MeshStandardMaterial({color:0xbdc6cc,roughness:.95});
    for(const side of [-1,1]){
      const glove=new THREE.Mesh(new THREE.CapsuleGeometry(.047,.105,4,12),gloveMaterial);glove.position.set(side*.31,-.015,.035);glove.rotation.z=side*-.2;this.wheel.add(glove);
      const sleeve=mesh(.095,.24,.11,side*.33,-.17,-.015,gloveMaterial);sleeve.rotation.z=side*.17;this.wheel.add(sleeve);
    }
    this.wheel.add(mesh(.49,.24,.09,0,0,0));
    this.display.width=384;this.display.height=256;this.displayTexture=new THREE.CanvasTexture(this.display);this.displayTexture.colorSpace=THREE.SRGBColorSpace;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.29,.19),new THREE.MeshBasicMaterial({map:this.displayTexture}));screen.position.set(0,.012,.052);this.wheel.add(screen);
    this.wheel.position.set(0,-.30,-.95);this.cockpit.add(this.wheel);this.cockpit.position.y=-.3;this.camera.add(this.cockpit);scene.add(this.camera);this.resize();
  }
  toggle(){this.mode=1-this.mode;this.initialized=false;}
  update(vehicle:Vehicle,dt=1/60,feedback?:DrivingFeedbackFrame){
    const forward=new THREE.Vector3(Math.sin(vehicle.heading),0,Math.cos(vehicle.heading));
    const desired=vehicle.position.clone().addScaledVector(forward,this.mode===0?-10:-.85).add(new THREE.Vector3(0,this.mode===0?5:this.eyeHeight,0));
    if(feedback){
      desired.y+=feedback.heave;
      desired.addScaledVector(new THREE.Vector3(-forward.z,0,forward.x),feedback.sway);
      desired.addScaledVector(forward,feedback.longitudinal);
    }
    if(!this.initialized||this.mode===1)this.camera.position.copy(desired);else this.camera.position.lerp(desired,1-Math.exp(-7*dt));
    this.initialized=true;this.camera.up.set(0,1,0);
    this.camera.lookAt(vehicle.position.clone().addScaledVector(forward,26).add(new THREE.Vector3(0,this.mode===0?1.3:-.35,0)));
    if(feedback){this.camera.rotateX(feedback.pitch);this.camera.rotateZ(feedback.roll);}
    this.camera.fov=THREE.MathUtils.damp(this.camera.fov,(this.mode===1?76:62)+vehicle.speed*.055+(feedback?.boostFov??0),4,dt);this.camera.updateProjectionMatrix();
    vehicle.group.visible=true;vehicle.group.traverse(child=>{if(child.name==='driver')child.visible=this.mode===0;});
    this.cockpit.visible=this.mode===1;this.wheel.rotation.z=vehicle.steer*.32;
    // Cockpit-only sprung motion stays small relative to the stabilized road view.
    this.cockpit.rotation.x=THREE.MathUtils.damp(this.cockpit.rotation.x,vehicle.acceleration*.0006,8,dt);
    this.cockpit.rotation.z=THREE.MathUtils.damp(this.cockpit.rotation.z,-vehicle.lateralAcceleration*.00045,8,dt);
    this.displayAge+=dt;if(this.displayAge>.08){this.displayAge=0;this.paintDisplay(vehicle,feedback?.engine);}
  }
  private paintDisplay(v:Vehicle,engine?:DrivingFeedbackFrame['engine']){
    const ctx=this.display.getContext('2d')!;ctx.fillStyle='#070c12';ctx.fillRect(0,0,384,256);
    for(let i=0;i<15;i++){ctx.fillStyle=i<(engine?Math.max(0,Math.min(1,(engine.rpm-6500)/5500)):(v.kmh%43)/43)*15?(i>10?'#a970ff':'#5cfc9c'):'#1d2c30';ctx.fillRect(12+i*24,7,17,13);}
    ctx.textAlign='center';ctx.fillStyle='#eaffef';ctx.font='bold 115px monospace';ctx.fillText(v.kmh<2?'N':String(engine?.gear??Math.min(8,1+Math.floor(v.kmh/43))),192,148);
    ctx.fillStyle='#a6b4bd';ctx.font='18px monospace';ctx.fillText('GEAR',192,178);
    ctx.fillStyle='#fff';ctx.font='bold 34px monospace';ctx.fillText(String(v.kmh).padStart(3,'0'),320,98);ctx.font='14px monospace';ctx.fillText('KM/H',320,122);
    ctx.strokeStyle='#e9ed43';ctx.lineWidth=10;ctx.beginPath();ctx.arc(65,98,39,.6*Math.PI,(.6+v.boost/100*1.8)*Math.PI);ctx.stroke();ctx.font='bold 23px monospace';ctx.fillStyle='#e9ed43';ctx.fillText(`${Math.round(v.boost)}%`,65,108);
    ctx.fillStyle='#607d84';ctx.fillRect(22,208,340,5);ctx.fillStyle=v.boosting?'#ffc141':'#5dffb3';ctx.fillRect(22,208,v.boost*3.4,5);ctx.font='16px monospace';ctx.fillStyle='#c5d3d6';ctx.fillText('ERS   /   APEX RACING',192,244);this.displayTexture.needsUpdate=true;
  }
  resize(){this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();}
}
