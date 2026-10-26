import * as THREE from 'three';
import {Track,ROAD_HALF_WIDTH} from './Track';
import {cornerSpeed,brakingDeceleration} from './Dynamics';
// Leave grip for steering transients and simultaneous braking/turning. The
// steady-state tire limit alone is not a usable keyboard driving target.
const CORNER_SPEED_MARGIN=.8;
const BRAKING_GRIP_USAGE=.65;
const REACTION_TIME=.4;
/** Apex-constrained, time-aware path with a conservative cyclic speed envelope. */
export class LinePlanner {
  readonly count:number;
  readonly apices:{progress:number;direction:number;insideOffset:number}[]=[];
  readonly points:THREE.Vector3[]=[];
  readonly offsets:Float64Array;
  readonly speeds:Float64Array;
  readonly cornerSpeeds:Float64Array;
  readonly distances:Float64Array;
  constructor(private track:Track){
    this.count=Math.ceil(track.length/4);this.offsets=new Float64Array(this.count);this.speeds=new Float64Array(this.count);this.cornerSpeeds=new Float64Array(this.count);this.distances=new Float64Array(this.count);
    const centers=Array.from({length:this.count},(_,i)=>track.point(i/this.count));
    const normals=centers.map((_,i)=>track.normal(i/this.count));
    const apexWidths:number[]=[];
    const lower=new Float64Array(this.count).fill(-ROAD_HALF_WIDTH+2.2),upper=new Float64Array(this.count).fill(ROAD_HALF_WIDTH-2.2);
    // Signed heading changes distinguish inside from outside. Join small
    // straight gaps in polygonal source data, but never merge opposite turns.
    const angles=centers.map((_,i)=>{
      const a=track.tangent(i/this.count-16/track.length),b=track.tangent(i/this.count+16/track.length);
      return Math.atan2(a.x*b.z-a.z*b.x,a.dot(b));
    });
    const labels=angles.map(a=>Math.abs(a)>.035?Math.sign(a):0),original=[...labels];
    for(let i=0;i<this.count;i++)if(original[i]){
      let gap=1;while(gap<=12&&!original[(i+gap)%this.count])gap++;
      if(gap<=12&&original[(i+gap)%this.count]===original[i])for(let j=1;j<gap;j++)labels[(i+j)%this.count]=original[i];
    }
    const anchor=Math.max(0,labels.findIndex(value=>value===0));let from=anchor+1,direction=0;
    for(let step=1;step<=this.count+1;step++){
      const index=anchor+step,label=step<=this.count?labels[index%this.count]:0;
      if(label!==direction){
        if(direction!==0){
          const indices=Array.from({length:index-from},(_,k)=>(from+k)%this.count);
          const turn=indices.reduce((sum,i)=>sum+Math.abs(angles[i]),0);
          if(turn*track.length/this.count/32>.5){
            let accumulated=0,apex=indices[0];
            for(const i of indices){accumulated+=Math.abs(angles[i]);if(accumulated>=turn*.58){apex=i;break;}}
            const insideOffset=turn/32/(index-from)>.02?2.5:4.5;
            this.apices.push({progress:apex/this.count,direction,insideOffset});
            apexWidths.push(THREE.MathUtils.clamp((index-from)*track.length/this.count*.25,18,85));
            // One apex gate only: a flat run of fixed inner offsets forces
            // the car to trace a tight inner radius instead of cutting a
            // smooth tangent through the apex. Tight chicanes need more room.
            lower[apex]=upper[apex]=direction*insideOffset;
          }
        }
        from=index;direction=label;
      }
    }
    this.points=centers.map((p,i)=>{
      const seed=this.apices.reduce((sum,apex,j)=>{
        let delta=i/this.count-apex.progress;if(delta<-.5)delta++;if(delta>.5)delta--;
        return sum+apex.direction*apex.insideOffset*Math.exp(-((delta*track.length/apexWidths[j])**2));
      },0);
      this.offsets[i]=THREE.MathUtils.clamp(seed,lower[i],upper[i]);
      return p.clone().addScaledVector(normals[i],this.offsets[i]);
    });
    const wrap=(i:number)=>(i+this.count)%this.count;
    // Curvature regularization alone rewards a large outer radius throughout
    // the turn. Include distance/safe-speed travel time and constrain signed
    // inside apex gates while optimizing the entire connected lap smoothly.
    const energy=(start:number,end:number)=>{
      let cost=0;
      for(let j=start;j<=end;j++){
        const a=this.points[wrap(j-1)],b=this.points[wrap(j)],c=this.points[wrap(j+1)];
        const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
        const cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
        const curvature=2*cross/Math.max(.001,ab*bc*ca);
        const distance=(ab+bc)*.5;
        const speed=Math.min(87,cornerSpeed(Math.abs(curvature)/(CORNER_SPEED_MARGIN*CORNER_SPEED_MARGIN)));
        cost+=curvature*curvature*distance+.015*distance/speed;
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
          const offset=THREE.MathUtils.clamp(original[k]+amount*weight,lower[j],upper[j]);
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
