import * as THREE from 'three';
import type {Vehicle} from './Vehicle';

/** Estimate the active player's pace; never treat a parked car as the field's
 * desired speed. It adjusts targets, not positions, velocities or lap progress. */
export class PackDirector {
  pace=1;active=false;
  private stopped=0;private cornerPace=.75;private lapPace=.75;
  get referencePace(){return Math.max(this.pace,this.cornerPace,this.lapPace);}
  recordLap(seconds:number,standing=false){
    if(!Number.isFinite(seconds)||seconds<=0)return;
    const flying=seconds-(standing?4:0);
    this.lapPace=seconds<94?THREE.MathUtils.clamp(1.3+(100-flying)*.012,.75,1.47):.75;
  }
  reset(){this.pace=1;this.active=false;this.stopped=0;this.cornerPace=.75;this.lapPace=.75;}
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
      // Straights saturate at the car's speed cap and hide a fast driver's
      // corner advantage. Keep a separate estimate from actual corner speeds.
      if(referenceSpeed<60&&Math.abs(player.lateralAcceleration)>15&&Math.abs(player.acceleration)<6&&player.brake<.15){
        this.cornerPace=THREE.MathUtils.damp(this.cornerPace,measured,.65,dt);
      }
    }
  }
  targets(gap:number,rank:number,playerRank:number,basePace:number,attack:number,freedom=0){
    // A leading player needs challengers, rather than five cars whose goals
    // are deliberately 14–70m behind. Aim the first two at a clean pass.
    const chasingLeader=playerRank===1&&gap<0;
    const desiredGap=playerRank===1?12-(rank-2)*9:THREE.MathUtils.clamp((playerRank-rank)*14,-70,70);
    const fast=THREE.MathUtils.smoothstep(this.referencePace,1.32,1.44);
    const paceCap=1.47+.06*fast;
    const delta=gap-desiredGap,error=Math.sign(delta)*Math.max(0,Math.abs(delta)-freedom);
    const catchup=THREE.MathUtils.smoothstep(-error,10,85);
    const anchor=this.referencePace+(basePace-1.42)*.15;
    let pace=THREE.MathUtils.clamp(THREE.MathUtils.lerp(anchor,Math.max(anchor,basePace),catchup)-Math.max(0,error)*.002,.75,paceCap);
    let cap=error>0?94-error*.055:94+Math.min(7,-error*.035)+attack*3;
    let power=error<0?1+Math.min(.15,-error*.0015)+attack*.015:1;
    if(chasingLeader){
      const urgency=THREE.MathUtils.smoothstep(-gap,5,65);
      // Sustain a pace advantage after reaching the leader, instead of
      // switching back to matching pace while still outside passing range.
      pace=Math.min(paceCap,Math.max(pace,anchor+.06+urgency*.10+attack*.04));
      cap=Math.max(cap,97+urgency*4+attack*3);
      power=Math.max(power,1.05+urgency*.10);
    }
    if(gap<0&&fast>0){
      pace=Math.max(pace,Math.min(paceCap,this.referencePace+.06*fast));
      const deficit=THREE.MathUtils.smoothstep(-gap,20,120);
      power=Math.max(power,1.15+.20*fast*deficit);
      cap=Math.max(cap,101+3*fast*deficit);
    }
    return {pace,cap:THREE.MathUtils.clamp(cap,76,104),power:Math.min(1.15+.20*fast,power),desiredGap};
  }
}
