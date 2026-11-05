interface Character {aggression:number;caution:number;avoidance?:number}
/** Private manoeuvre memory. These decisions move real steering targets; they
 * never change engine output, tyre grip, ranking or another driver's state. */
export class RacecraftBehavior {
  private preparation?:{target:object;started:number;origin:number;side:number};
  private lastOffRoad=-Infinity;
  recoveryWaiting=false;
  get recovering(){return this.lastOffRoad!==-Infinity;}
  constructor(private character:Character){}
  reset(){this.preparation=undefined;this.lastOffRoad=-Infinity;this.recoveryWaiting=false;}
  cancelPass(){this.preparation=undefined;}
  prepare(target:object,time:number,from:number,goal:number,gap:number,closing:number){
    const side=Math.sign(goal-from),c=this.character;
    // Immediate evasive action and an already developing overlap take priority.
    if(gap<32||closing>8||closing<0||Math.abs(goal-from)<1.5){this.cancelPass();return null;}
    if(!this.preparation||this.preparation.target!==target||this.preparation.side!==side)this.preparation={target,started:time,origin:from,side};
    const wait=.45+(1-c.aggression)*.6+c.caution*.3+(c.avoidance??0)*.15;
    if(time-this.preparation.started>=wait)return null;
    const width=.75+c.aggression*.65;
    return this.preparation.origin+side*Math.min(width,Math.abs(goal-this.preparation.origin));
  }
  defence(distance:number,speed:number){
    const c=this.character;
    return {width:1.1+c.aggression*.8,hold:Math.max(1.2,Math.min(2.8,(distance-90)/Math.max(20,speed))),cooldown:8+c.caution*2};
  }
  recover(time:number,offRoad:boolean,from:number,edge:number,racingLane:number,speed:number,clear:boolean){
    if(offRoad)this.lastOffRoad=time;
    const age=time-this.lastOffRoad;
    this.recoveryWaiting=false;
    if(this.lastOffRoad===-Infinity)return null;
    if(!offRoad&&age>2.2&&clear){this.lastOffRoad=-Infinity;return null;}
    if(!clear){this.recoveryWaiting=offRoad;return {lane:from,speed:offRoad?4:Math.max(24,speed),outside:offRoad,waiting:true};}
    const blend=offRoad?0:Math.max(0,Math.min(1,age/2.2));
    return {lane:edge+(racingLane-edge)*blend,speed:offRoad?14:18+42*blend,outside:false,waiting:false};
  }
}
