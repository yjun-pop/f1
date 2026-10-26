import * as THREE from 'three';
import type {Vehicle} from './Vehicle';

/** Estimate the active player's pace; never treat a parked car as the field's
 * desired speed. It adjusts targets, not positions, velocities or lap progress. */
export class PackDirector {
  pace=1;active=false;
  private stopped=0;
  reset(){this.pace=1;this.active=false;this.stopped=0;}
  observe(player:Vehicle,referenceSpeed:number,onTrack:boolean,dt:number){
    if(!onTrack){this.active=false;return;}
    this.stopped=player.speed<5?this.stopped+dt:0;
    if(this.stopped>2){this.active=false;return;}
    if(player.speed>8)this.active=true;
    // Filter a normalized pace, so a chicane's 30m/s is not interpreted as a
    // request for every car to travel at 30m/s on a different straight.
    if(this.active&&player.speed>15){
      const measured=THREE.MathUtils.clamp(player.speed/Math.max(18,referenceSpeed),.75,1.47);
      this.pace=THREE.MathUtils.damp(this.pace,measured,.12,dt);
    }
  }
  targets(gap:number,rank:number,playerRank:number,basePace:number,attack:number){
    const desiredGap=THREE.MathUtils.clamp((playerRank-rank)*14,-70,70);
    const error=gap-desiredGap;
    const catchup=THREE.MathUtils.smoothstep(-error,10,85);
    const anchor=this.pace+(basePace-1.42)*.15;
    const pace=THREE.MathUtils.clamp(THREE.MathUtils.lerp(anchor,Math.max(anchor,basePace),catchup)-Math.max(0,error)*.002,.75,1.47);
    const cap=error>0?94-error*.055:94+Math.min(7,-error*.035)+attack*3;
    const power=error<0?1+Math.min(.15,-error*.0015)+attack*.015:1;
    return {pace,cap:THREE.MathUtils.clamp(cap,76,104),power:Math.min(1.15,power),desiredGap};
  }
}
