import * as THREE from 'three';
import {Track,ROAD_HALF_WIDTH} from './Track';
import {cornerSpeed,brakingDeceleration} from './Dynamics';
/** Offline constrained minimum-bending path and a cyclic braking speed envelope. */
export class LinePlanner {
  readonly count:number;
  readonly points:THREE.Vector3[]=[];
  readonly offsets:Float64Array;
  readonly speeds:Float64Array;
  readonly cornerSpeeds:Float64Array;
  readonly distances:Float64Array;
  constructor(private track:Track){
    this.count=Math.ceil(track.length/4);this.offsets=new Float64Array(this.count);this.speeds=new Float64Array(this.count);this.cornerSpeeds=new Float64Array(this.count);this.distances=new Float64Array(this.count);
    const centers=Array.from({length:this.count},(_,i)=>track.point(i/this.count));
    const normals=centers.map((_,i)=>track.normal(i/this.count));
    this.points=centers.map(p=>p.clone());
    const wrap=(i:number)=>(i+this.count)%this.count;
    // Discrete bending energy with a small path length penalty. Adjacent segments
    // are evaluated together, and every candidate stays within usable road width.
    const energy=(start:number,end:number)=>{
      let cost=0;
      for(let j=start;j<=end;j++){
        const a=this.points[wrap(j-1)],b=this.points[wrap(j)],c=this.points[wrap(j+1)];
        const dx=a.x-2*b.x+c.x,dz=a.z-2*b.z+c.z;
        cost+=dx*dx+dz*dz+.002*b.distanceToSquared(c);
      }
      return cost;
    };
    // Move smooth spans, coarse to fine: independent point moves would stall
    // on the high-frequency bending penalty and barely leave the centerline.
    for(const radius of [40,20,10,5,2,1])for(let pass=0;pass<18;pass++){
      const step=pass<10?.9:.3,stride=Math.max(1,Math.floor(radius/2));
      for(let i=pass%stride;i<this.count;i+=stride){
        const indices=Array.from({length:radius*2+1},(_,k)=>wrap(i-radius+k));
        const original=indices.map(j=>this.offsets[j]);
        let best=0,cost=energy(i-radius-1,i+radius+1);
        const apply=(amount:number)=>indices.forEach((j,k)=>{
          const weight=.5+.5*Math.cos(Math.PI*(k-radius)/radius);
          const offset=THREE.MathUtils.clamp(original[k]+amount*weight,-ROAD_HALF_WIDTH+2.2,ROAD_HALF_WIDTH-2.2);
          this.offsets[j]=offset;this.points[j].copy(centers[j]).addScaledVector(normals[j],offset);
        });
        for(const sign of [-1,1]){apply(sign*step);const next=energy(i-radius-1,i+radius+1);if(next<cost){cost=next;best=sign*step;}}
        apply(best);
      }
    }
    for(let i=0;i<this.count;i++){
      const a=this.points[wrap(i-1)],b=this.points[i],c=this.points[wrap(i+1)];
      const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
      const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
      const curvature=2*cross/Math.max(.001,ab*bc*ca);
      this.distances[i]=bc;
      // Conservative dry grip, with a small downforce contribution.
      this.speeds[i]=this.cornerSpeeds[i]=cornerSpeed(curvature);
    }
    // Two whole-lap passes propagate braking through the start/finish seam.
    for(let pass=0;pass<12;pass++){
      for(let i=this.count-1;i>=0;i--){const n=wrap(i+1);this.speeds[i]=Math.min(this.speeds[i],Math.sqrt(this.speeds[n]**2+2*brakingDeceleration(this.speeds[n])*.88*this.distances[i]));}
      for(let i=0;i<this.count;i++){const n=wrap(i+1);this.speeds[n]=Math.min(this.speeds[n],Math.sqrt(this.speeds[i]**2+2*7*this.distances[i]));}
    }
  }
  point(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return this.points[i].clone().lerp(this.points[(i+1)%this.count],f-i);}
  cornerLimit(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return THREE.MathUtils.lerp(this.cornerSpeeds[i],this.cornerSpeeds[(i+1)%this.count],f-i);}
  advice(progress:number,speed:number,offRoad=false){
    let allowed=94;
    const decel=brakingDeceleration(speed,offRoad)*.86;
    // Ask for braking only when the corner is within the actual stopping range.
    for(let distance=0;distance<=240;distance+=4){
      const limit=this.cornerLimit(progress+distance/this.track.length);
      const usableDistance=Math.max(0,distance-speed*.22);
      allowed=Math.min(allowed,Math.sqrt(limit*limit+2*decel*usableDistance));
    }
    return allowed;
  }
  speed(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return THREE.MathUtils.lerp(this.speeds[i],this.speeds[(i+1)%this.count],f-i);}
}
