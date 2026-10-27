import * as THREE from 'three';
import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';
import type {Rival} from './Race';
import type {TrafficSample} from './DriverAgent';
import type {Vehicle} from './Vehicle';

export type CornerRole='inside'|'defend'|'cutback';
export interface CornerPlan {
  role:CornerRole;opponent:Vehicle;apex:number;preview:number;exiting:boolean;
  laneAt:(progress:number)=>number;
}
interface Commitment {role:CornerRole;opponent:Vehicle;apex:number;amplitude:number;elite:boolean}

/** One committed manoeuvre per single corner; never reactively weave at the apex. */
export class CornerRacecraft {
  private corners:{progress:number;direction:number}[];
  private commitment?:Commitment;private blockedApex=-Infinity;
  current:CornerPlan|null=null;
  selections=0;
  constructor(private track:Track,private planner:LinePlanner,narrow:readonly {entry:number;exit:number}[]){
    this.corners=planner.apices.filter(a=>!narrow.some(n=>a.progress*track.length>=n.entry-1&&a.progress*track.length<=n.exit+1));
  }
  reset(){this.commitment=undefined;this.current=null;this.blockedApex=-Infinity;this.selections=0;}
  cancel(){if(this.commitment)this.blockedApex=this.commitment.apex;this.commitment=undefined;this.current=null;}
  private weight(role:CornerRole,metres:number){
    // A cutback stays on the entry line and opens its radius near the exit.
    const enter=role==='cutback'?THREE.MathUtils.smoothstep(metres,-35,22):THREE.MathUtils.smoothstep(metres,role==='defend'?-220:-180,-40);
    return enter*(1-THREE.MathUtils.smoothstep(metres,18,110));
  }
  update(driver:Omit<Rival,'agent'>,traffic:readonly TrafficSample[],enabled:boolean,elite:boolean):CornerPlan|null{
    const car=driver.car,length=this.track.length,metres=car.distance*length;
    const gap=(other:TrafficSample)=>{let t=other.progress-car.progress;if(t<-.5)t++;if(t>.5)t--;return t*length;};
    const bias=(other:Pick<Vehicle,'position'|'progress'>)=>other.position.clone().sub(this.planner.point(other.progress)).dot(this.track.normal(other.progress));
    if(!enabled||car.offRoad){this.cancel();return null;}
    if(this.commitment){
      const target=traffic.find(t=>t.car===this.commitment!.opponent);
      if(metres>this.commitment.apex+110||!target||Math.abs(gap(target))<11&&metres<this.commitment.apex-20||elite!==this.commitment.elite)this.cancel();
    }
    if(!this.commitment){
      const nearby=traffic.filter(t=>t.car!==car);
      if(nearby.some(t=>Math.abs(gap(t))<14))return this.current=null;
      const candidates=this.corners.map(c=>{let apex=(Math.floor(car.distance)+c.progress)*length;if(apex<metres-110)apex+=length;return {...c,apex};}).filter(c=>c.apex-metres>80&&c.apex-metres<Math.min(320,car.speed*3.2+70)&&Math.abs(c.apex-this.blockedApex)>1).sort((a,b)=>a.apex-b.apex);
      const corner=candidates[0];if(!corner)return this.current=null;
      const ahead=nearby.filter(t=>gap(t)>16&&gap(t)<48&&car.speed-t.speed>-.5).sort((a,b)=>gap(a)-gap(b))[0];
      const behind=nearby.filter(t=>gap(t)<-18&&gap(t)>-42&&t.speed-car.speed>.5).sort((a,b)=>gap(b)-gap(a))[0];
      let role:CornerRole,opponent:TrafficSample;
      if(ahead&&driver.aggression-driver.avoidance*.3>.45){role=bias(ahead)*corner.direction>.5?'cutback':'inside';opponent=ahead;}
      else if(behind&&driver.aggression-driver.avoidance*.35>.5){role='defend';opponent=behind;}
      else return this.current=null;
      let amplitude=elite?0:corner.direction*(role==='cutback'?-.95:role==='defend'?.85:1.15);
      // Do not add clipping to the already calibrated road-edge trajectory.
      for(const offset of [-220,-180,-140,-100,-60,-35,0,22,50,80,110]){
        const t=(corner.apex+offset)/length,base=this.planner.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
        if(Math.abs(base+amplitude*this.weight(role,offset))>Math.max(7.2,Math.abs(base))+.01){amplitude=0;break;}
      }
      this.commitment={role,opponent:opponent.car,apex:corner.apex,amplitude,elite};this.selections++;
    }
    const commitment=this.commitment,relative=metres-commitment.apex;
    this.current={role:commitment.role,opponent:commitment.opponent,apex:commitment.apex,exiting:relative>8,
      preview:relative>=-40||commitment.elite?.12:commitment.role==='inside'?.09:commitment.role==='cutback'?.15:.11,
      laneAt:progress=>{let at=progress*length-commitment.apex;while(at<-length/2)at+=length;while(at>length/2)at-=length;return commitment.amplitude*this.weight(commitment.role,at);}};
    return this.current;
  }
}
