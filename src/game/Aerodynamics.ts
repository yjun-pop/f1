import type {Vehicle} from './Vehicle';
import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number,a:number,b:number)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
export class AeroState {
  wake=0;available=false;qualified=false;active=false;flap=0;zone:string|null=null;epoch=0;sampleTime?:number;
  close(){this.active=false;this.flap=0;}
  clear(){this.sampleTime=undefined;this.wake=0;this.available=this.qualified=false;this.zone=null;this.close();}
  reset(){this.clear();this.epoch++;}
}
export function aerodynamicDrag(speed:number,offRoad=false,aero?:AeroState){
  const reduction=aero&&!offRoad?1-(1-.10*clamp(aero.wake,0,1))*(1-.12*clamp(aero.flap,0,1)):0;
  return .00105*speed*speed*(1-reduction)+(offRoad?4.2:.35);
}
export function advanceAero(aero:AeroState|undefined,request:boolean,speed:number,brake:number,steer:number,lateralSpeed:number,offRoad:boolean,dt:number,yawRate=0){
  if(!aero)return;
  aero.active=request&&aero.available&&speed>35&&brake===0&&Math.abs(steer)<.25&&Math.abs(lateralSpeed)<2&&Math.abs(yawRate)<.12&&!offRoad;
  if(!aero.active)aero.flap=0;else aero.flap+=(1-aero.flap)*(1-Math.exp(-dt*16));
}
export interface DRSZone {id:string;detection:number;start:number;end:number}
interface Ticket {start:number;end:number;eligible:boolean}
interface History {distance:number;time:number;epoch:number;tickets:Map<string,Ticket>}
interface Crossing {car:Vehicle;zone:DRSZone;lap:number;time:number}
interface Passage {car:Vehicle;time:number}
/** Two Monza zones. Distances follow the game's scaled racing geometry. */
export function monzaDRSZones(length:number,apices:LinePlanner['apices']):DRSZone[]{
  const at=(index:number)=>apices[index].progress*length;
  return [{id:'SERRAGLIO',detection:at(6)-95,start:at(6)+190,end:at(7)-210},
    {id:'MAIN STRAIGHT',detection:at(10)-300,start:at(10)+290,end:at(0)-210}];
}
/** Shared pre-physics snapshot. DRS entitlement uses interpolated times at
 * each exact detection line, independently of ranking and current gap. */
export class RaceAerodynamics {
  readonly zones:readonly DRSZone[];enabled=false;
  private history=new Map<Vehicle,History>();private passages=new Map<string,Passage[]>();
  constructor(private track:Track,planner:LinePlanner){this.zones=monzaDRSZones(track.length,planner.apices);}
  reset(){for(const car of this.history.keys())car.aero.clear();this.history.clear();this.passages.clear();this.enabled=false;}
  update(cars:readonly Vehicle[],elapsed:number,racing:boolean){
    if(!racing){this.reset();for(const car of cars)car.aero.clear();return;}
    this.enabled=cars.some(car=>car.distance>=1&&!car.offRoad&&car.position.distanceToSquared(this.track.point(car.progress))<160);
    const live=new Set(cars),valid=new Set<Vehicle>(),crossings:Crossing[]=[];
    for(const car of this.history.keys())if(!live.has(car)){this.history.delete(car);car.aero.clear();}
    for(const car of cars){
      const onTrack=!car.offRoad&&car.position.distanceToSquared(this.track.point(car.progress))<160;
      const old=this.history.get(car),dt=old?elapsed-old.time:0,metres=old?(car.distance-old.distance)*this.track.length:0;
      const discontinuity=!old||old.epoch!==car.aero.epoch||dt<0||metres<-.5||Math.abs(metres)>Math.max(5,dt*150);
      let h=old;
      if(discontinuity||!onTrack){
        car.aero.clear();h={distance:car.distance,time:elapsed,epoch:car.aero.epoch,tickets:new Map()};this.history.set(car,h);
        for(const [id,records] of this.passages)this.passages.set(id,records.filter(record=>record.car!==car));
      }
      if(onTrack)valid.add(car);
      if(!discontinuity&&onTrack&&old&&metres>0){
        for(const zone of this.zones){
          const line=zone.detection/this.track.length,lap=Math.floor(old.distance-line)+1,gate=lap+line;
          if(gate<=car.distance+1e-10){
            const fraction=(gate-old.distance)/(car.distance-old.distance);
            crossings.push({car,zone,lap,time:old.time+dt*clamp(fraction,0,1)});
          }
        }
      }
      h!.distance=car.distance;h!.time=elapsed;
    }
    crossings.sort((a,b)=>a.time-b.time);
    for(const event of crossings){
      const records=this.passages.get(event.zone.id)??[];
      const eligible=this.enabled&&records.some(other=>other.car!==event.car&&valid.has(other.car)&&event.time-other.time>1e-6&&event.time-other.time<=1+1e-8);
      let start=event.lap+event.zone.start/this.track.length,end=event.lap+event.zone.end/this.track.length;
      if(end<start)end++;
      this.history.get(event.car)!.tickets.set(event.zone.id,{start,end,eligible});
      records.push({car:event.car,time:event.time});this.passages.set(event.zone.id,records);
    }
    for(const [id,records] of this.passages)this.passages.set(id,records.filter(record=>live.has(record.car)&&elapsed-record.time<3));
    for(const car of cars){
      const h=this.history.get(car)!,ticket=[...h.tickets.entries()].find(([,t])=>car.distance>=t.start&&car.distance<t.end);
      car.aero.qualified=this.enabled&&valid.has(car)&&[...h.tickets.values()].some(t=>t.eligible&&car.distance<t.end);
      car.aero.zone=ticket?.[0]??null;
      car.aero.available=this.enabled&&valid.has(car)&&!!ticket?.[1].eligible&&car.speed>35;
      if(!car.aero.available)car.aero.close();
      for(const [id,t] of h.tickets)if(car.distance>=t.end)h.tickets.delete(id);
      let wake=0;
      if(valid.has(car)&&car.speed>25){
        const fx=Math.sin(car.heading),fz=Math.cos(car.heading);
        for(const other of cars){
          if(other===car||!valid.has(other)||other.speed<25||Math.cos(other.heading-car.heading)<.985)continue;
          const dx=other.position.x-car.position.x,dz=other.position.z-car.position.z;
          const ahead=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);
          if(ahead<=6||ahead>=80||side>3.5)continue;
          const strength=smooth(ahead,6,14)*(1-smooth(ahead,20,80))*(1-smooth(side,.8,3.5))*smooth(car.speed,25,60);
          wake=Math.max(wake,strength);
        }
      }
      // Filter onset, but release immediately when pulling out of the wake.
      const step=car.aero.sampleTime===undefined?0:clamp(elapsed-car.aero.sampleTime,0,.1);
      car.aero.wake=wake<car.aero.wake?wake:car.aero.wake+(wake-car.aero.wake)*(1-Math.exp(-step*5));
      car.aero.sampleTime=elapsed;
    }
  }
}
