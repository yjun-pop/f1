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
      const measured=THREE.MathUtils.clamp(player.speed/Math.max(18,referenceSpeed),.65,1.47);
      this.pace=THREE.MathUtils.damp(this.pace,measured,.12,dt);
      // Straights saturate at the car's speed cap and hide a fast driver's
      // corner advantage. Keep a separate estimate from actual corner speeds.
      if(referenceSpeed<60&&Math.abs(player.lateralAcceleration)>15&&Math.abs(player.acceleration)<6&&player.brake<.15){
        this.cornerPace=THREE.MathUtils.damp(this.cornerPace,measured,.65,dt);
      }
    }
  }
  targets(gap:number,rank:number,playerRank:number,basePace:number,attack:number,fieldSize=12){
    // Rank changes the challenge, not the car's engine. Neighbours remain
    // competitive; distant leaders leave room to progress through the field.
    // At the back, the next opponent is attainable rather than another wall.
    const tier=THREE.MathUtils.clamp((fieldSize-playerRank)/Math.max(1,fieldSize-1),0,1);
    const separation=Math.max(0,Math.abs(rank-playerRank)-1),behind=rank>playerRank;
    const neighbour=behind?THREE.MathUtils.lerp(-.012,.020,tier):THREE.MathUtils.lerp(-.008,.016,tier);
    const rankPenalty=separation*(behind?.004*(1-THREE.MathUtils.smoothstep(-gap,120,350)):.006);
    const pressure=behind?attack*.004*tier:0;
    // Broad distance bands allow duels and natural gaps, without assigning
    // each car a fixed slot relative to the player.
    const regroup=behind?.008*THREE.MathUtils.smoothstep(-gap,120,350):-.035*THREE.MathUtils.smoothstep(gap,100,350);
    const character=THREE.MathUtils.clamp((basePace-1.42)*.1,-.006,.006);
    const skill=THREE.MathUtils.clamp(neighbour-rankPenalty+pressure+regroup,-.1,.032);
    const pace=THREE.MathUtils.clamp(this.referencePace*(1+skill)+character,.65,1.47);
    // Tiny assistance is reserved for distant trailing cars. Race also checks
    // physical visibility and removes it while the player is using ERS.
    const hidden=behind?THREE.MathUtils.smoothstep(-gap,180,350):0;
    return {pace,cap:94+.25*hidden,power:1+.008*hidden};
  }
}
