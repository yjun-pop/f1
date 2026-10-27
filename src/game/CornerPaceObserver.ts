import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';
import type {Vehicle} from './Vehicle';

interface Turn {entry:number;exit:number}
interface Passage {turn:Turn;lap:number;entered:boolean;clean:boolean;turning:boolean;speed:number;reference:number}
/** Learn from a completed, clean corner, never an overspeed approach. */
export class CornerPaceObserver {
  private turns:Turn[]=[];
  private passage?:Passage;private previous?:number;
  constructor(private track:Track,private planner:LinePlanner){
    for(let i=0;i<planner.apices.length;i++){
      let last=i;
      while(last+1<planner.apices.length&&planner.apices[last].direction!==planner.apices[last+1].direction&&(planner.apices[last+1].progress-planner.apices[last].progress)*track.length<120)last++;
      this.turns.push({entry:planner.apices[i].progress*track.length-180,exit:planner.apices[last].progress*track.length+80});i=last;
    }
  }
  reset(){this.passage=undefined;this.previous=undefined;}
  sample(car:Vehicle,dt:number):{speed:number;reference:number}|null{
    const metres=car.distance*this.track.length,lap=Math.floor(car.distance),at=metres-lap*this.track.length;
    const turn=this.turns.find(t=>at>=t.entry&&at<=t.exit),old=this.passage;
    const continuous=this.previous!==undefined&&metres>=this.previous-.01&&metres-this.previous<=Math.max(3,car.speed*dt*2);
    let result:{speed:number;reference:number}|null=null;
    if(old&&(turn!==old.turn||lap!==old.lap)){
      const exit=old.lap*this.track.length+old.turn.exit;
      if(continuous&&metres>=exit&&metres-exit<Math.max(8,car.speed*dt*2)&&old.entered&&old.clean&&old.turning)result={speed:old.speed,reference:old.reference};
      this.passage=undefined;
    }
    if(turn){
      if(!this.passage)this.passage={turn,lap,entered:continuous&&(this.previous??Infinity)<=lap*this.track.length+turn.entry,clean:true,turning:false,speed:Infinity,reference:Infinity};
      const p=this.passage;
      p.clean&&=continuous&&!car.offRoad&&car.speed>8&&Math.abs(Math.atan2(car.lateralSpeed,Math.max(8,car.speed)))<.15;
      p.turning||=Math.abs(car.lateralAcceleration)>8;
      p.speed=Math.min(p.speed,car.speed);p.reference=Math.min(p.reference,this.planner.cornerLimit(car.progress));
    }
    this.previous=metres;return result;
  }
}
