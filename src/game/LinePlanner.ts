import * as THREE from 'three';
import {Track,ROAD_HALF_WIDTH} from './Track';
import {cornerSpeed,brakingDeceleration} from './Dynamics';
// Leave grip for steering transients and simultaneous braking/turning. The
// steady-state tire limit alone is not a usable keyboard driving target.
const CORNER_SPEED_MARGIN=.8;
const BRAKING_GRIP_USAGE=.65;
const REACTION_TIME=.4;
/** Offline constrained minimum-bending path and a conservative cyclic speed envelope. */
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
    // Offset samples are not equally spaced along the final path. Optimize
    // geometric curvature per metre instead of raw second differences, which
    // also penalized harmless spacing changes and trapped tight corners near
    // the centerline. A small length cost avoids unnecessary straight detours.
    const energy=(start:number,end:number)=>{
      let cost=0;
      for(let j=start;j<=end;j++){
        const a=this.points[wrap(j-1)],b=this.points[wrap(j)],c=this.points[wrap(j+1)];
        const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
        const cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
        const curvature=2*cross/Math.max(.001,ab*bc*ca);
        cost+=curvature*curvature*(ab+bc)*.5+.00001*bc;
      }
      return cost;
    };
    // Move smooth spans, coarse to fine: independent point moves would stall
    // on the high-frequency bending penalty and barely leave the centerline.
    for(const radius of [60,30,15,8,4,2,1])for(let pass=0;pass<30;pass++){
      const step=pass<10?.9:pass<20?.3:.1,stride=Math.max(1,Math.floor(radius/2));
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
      this.speeds[i]=this.cornerSpeeds[i]=Math.min(87,cornerSpeed(curvature/(CORNER_SPEED_MARGIN*CORNER_SPEED_MARGIN)));
    }
    // Two whole-lap passes propagate braking through the start/finish seam.
    for(let pass=0;pass<12;pass++){
      for(let i=this.count-1;i>=0;i--){const n=wrap(i+1);this.speeds[i]=Math.min(this.speeds[i],Math.sqrt(this.speeds[n]**2+2*brakingDeceleration(this.speeds[n])*BRAKING_GRIP_USAGE*this.distances[i]));}
      for(let i=0;i<this.count;i++){const n=wrap(i+1);this.speeds[n]=Math.min(this.speeds[n],Math.sqrt(this.speeds[i]**2+2*5*this.distances[i]));}
    }
  }
  point(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return this.points[i].clone().lerp(this.points[(i+1)%this.count],f-i);}
  cornerLimit(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return THREE.MathUtils.lerp(this.cornerSpeeds[i],this.cornerSpeeds[(i+1)%this.count],f-i);}
  advice(progress:number,speed:number,offRoad=false){
    let allowed=94;
    const decel=brakingDeceleration(speed,offRoad)*BRAKING_GRIP_USAGE;
    // Ask for braking only when the corner is within the actual stopping range.
    for(let distance=0;distance<=240;distance+=4){
      const t=progress+distance/this.track.length;
      const limit=Math.min(this.speed(t),this.cornerLimit(t));
      const usableDistance=Math.max(0,distance-speed*REACTION_TIME);
      allowed=Math.min(allowed,Math.sqrt(limit*limit+2*decel*usableDistance));
    }
    return allowed;
  }
  speed(t:number){const f=((t%1+1)%1)*this.count,i=Math.floor(f);return THREE.MathUtils.lerp(this.speeds[i],this.speeds[(i+1)%this.count],f-i);}
}
