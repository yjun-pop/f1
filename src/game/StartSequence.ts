export interface StartSignal {run:number;phase:'idle'|'lights'|'go';lights:number}
/** Simulation time only: pausing cannot leave a wall-clock start timer running. */
export class StartSequence {
  private elapsed=0;private duration=0;private armed=false;private run=0;
  reset(){this.elapsed=this.duration=0;this.armed=false;}
  arm(random=Math.random()){this.elapsed=0;this.duration=4.6+.8+Math.max(0,Math.min(1,Number.isFinite(random)?random:.5))*1.6;this.armed=true;this.run++;}
  advance(dt:number){if(this.armed)this.elapsed=Math.min(this.duration,this.elapsed+Math.max(0,dt));}
  get remaining(){return Math.max(0,this.duration-this.elapsed);}
  get signal():StartSignal {
    if(!this.armed)return {run:this.run,phase:'idle',lights:0};
    if(this.remaining<=1e-8)return {run:this.run,phase:'go',lights:0};
    return {run:this.run,phase:'lights',lights:Math.min(5,Math.max(0,1+Math.floor(this.elapsed-.6+1e-8)))};
  }
}
