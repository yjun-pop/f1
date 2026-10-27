import * as THREE from 'three';

/** Periodic C2 spline for rendering. Physical progress and driving paths stay separate. */
export class VisualRoadCurve {
  private x:Float64Array;private z:Float64Array;private count:number;
  constructor(length:number,point:(t:number)=>THREE.Vector3){
    this.count=Math.ceil(length);const rawX=new Float64Array(this.count),rawZ=new Float64Array(this.count);
    for(let i=0;i<this.count;i++){const p=point(i/this.count);rawX[i]=p.x;rawZ[i]=p.z;}
    const sigma=6/(length/this.count),radius=Math.ceil(sigma*3),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),total=weights.reduce((a,b)=>a+b,0);
    this.x=new Float64Array(this.count);this.z=new Float64Array(this.count);
    for(let i=0;i<this.count;i++)for(let j=-radius;j<=radius;j++){
      const index=(i+j+this.count)%this.count,weight=weights[j+radius]/total;this.x[i]+=rawX[index]*weight;this.z[i]+=rawZ[index]*weight;
    }
  }
  private evaluate(t:number,derivative:boolean){
    const sample=((t%1+1)%1)*this.count,index=Math.floor(sample),u=sample-index,v=1-u;
    const weights=derivative?[-.5*v*v,1.5*u*u-2*u,-1.5*u*u+u+.5,.5*u*u]:[v*v*v/6,(3*u*u*u-6*u*u+4)/6,(-3*u*u*u+3*u*u+3*u+1)/6,u*u*u/6];
    let x=0,z=0;for(let j=0;j<4;j++){const k=(index+j-1+this.count)%this.count;x+=this.x[k]*weights[j];z+=this.z[k]*weights[j];}return new THREE.Vector3(x,0,z);
  }
  point(t:number){return this.evaluate(t,false);}
  normal(t:number){const tangent=this.evaluate(t,true).normalize();return new THREE.Vector3(-tangent.z,0,tangent.x);}
}
