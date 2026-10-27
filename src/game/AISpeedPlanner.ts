import * as THREE from 'three';
import {brakingDeceleration,cornerSpeed,lateralGrip} from './Dynamics';
import {LinePlanner} from './LinePlanner';
import type {Track} from './Track';

const racingGeometry=new WeakMap<Track,LinePlanner>();

/** Physical speed plans for the actual path, independent of human advice.
 * Profiles share immutable geometry; drivers still choose their own pace. */
export class AISpeedPlanner {
  readonly points:THREE.Vector3[];
  private curvatures:Float64Array;private distances:Float64Array;
  private profiles=new Map<string,Float64Array>();
  private planner:LinePlanner;
  constructor(track:Track){
    // Optimize a separate full-car-clearance line, rather than hard-clipping
    // the human guide at the edge or smoothing away its curvature solution.
    let path=racingGeometry.get(track);
    if(!path){path=new LinePlanner(track,{halfWidth:7.2});racingGeometry.set(track,path);}
    this.planner=path;this.points=path.points;
    const n=path.count;this.curvatures=new Float64Array(n);this.distances=new Float64Array(n);
    for(let i=0;i<n;i++){
      const a=this.points[(i+n-1)%n],b=this.points[i],c=this.points[(i+1)%n];
      this.distances[i]=b.distanceTo(c);
      const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
      this.curvatures[i]=2*cross/Math.max(.001,a.distanceTo(b)*b.distanceTo(c)*c.distanceTo(a));
    }
  }
  private sample(values:Float64Array,t:number){
    const f=((t%1+1)%1)*values.length,i=Math.floor(f);
    return THREE.MathUtils.lerp(values[i],values[(i+1)%values.length],f-i);
  }
  point(t:number){
    const f=((t%1+1)%1)*this.points.length,i=Math.floor(f);
    return this.points[i].clone().lerp(this.points[(i+1)%this.points.length],f-i);
  }
  curvature(t:number){return this.sample(this.curvatures,t);}
  private budget(pace:number,grip:number){return Math.min(.64*pace*pace,grip*.96);}
  projectedGripUse(pace:number,grip:number){return this.budget(pace,grip)*.94/grip;}
  cornerLimit(t:number,pace:number,grip:number){
    return cornerSpeed(this.curvature(t)/this.budget(pace,grip),94);
  }
  private longitudinal(v:number,k:number,grip:number){
    const total=lateralGrip(v)*grip*.96,lateral=v*v*k;
    return Math.sqrt(Math.max(0,total*total-lateral*lateral));
  }
  braking(v:number,k:number,grip:number){return Math.min(brakingDeceleration(v,false,grip),this.longitudinal(v,k,grip))*.82;}
  private profile(pace:number,grip:number){
    const key=`${pace}:${grip}`,cached=this.profiles.get(key);if(cached)return cached;
    const n=this.planner.count,budget=this.budget(pace,grip);
    const speeds=Float64Array.from(this.curvatures,k=>cornerSpeed(k/budget,94));
    // Braking and acceleration both spend the grip remaining after turning.
    // Repeated cyclic passes include a corner beyond the start/finish seam.
    for(let pass=0;pass<3;pass++){
      for(let i=n-1;i>=0;i--){
        const next=(i+1)%n,v=speeds[next],k=Math.max(this.curvatures[i],this.curvatures[next]);
        const braking=this.braking(v,k,grip);
        speeds[i]=Math.min(speeds[i],Math.sqrt(v*v+2*braking*this.distances[i]));
      }
      for(let i=0;i<n;i++){
        const next=(i+1)%n,v=speeds[i],k=Math.max(this.curvatures[i],this.curvatures[next]);
        // Same engine and ERS as the player; a depleted battery simply means
        // the driver cannot attain this acceleration, never extra power.
        const engine=Math.max(0,23*(1-v/140)-.00105*v*v-.35);
        const acceleration=Math.min(engine,this.longitudinal(v,k,grip)*.82);
        speeds[next]=Math.min(speeds[next],Math.sqrt(v*v+2*acceleration*this.distances[i]));
      }
    }
    if(this.profiles.size>=64)this.profiles.delete(this.profiles.keys().next().value!);
    this.profiles.set(key,speeds);return speeds;
  }
  speed(t:number,pace:number,grip:number){
    // Interpolate cached skill levels so rank adaptation does not step the
    // brake target, and eleven agents do not rebuild profiles every frame.
    const f=THREE.MathUtils.clamp(pace,.65,1.6)*40,low=Math.floor(f)/40,high=low+.025;
    return THREE.MathUtils.lerp(this.sample(this.profile(low,grip),t),this.sample(this.profile(high,grip),t),f-Math.floor(f));
  }
}
