import type {RaceInterval} from '../game/RaceTiming';
export interface BattleCar {id:string;name:string;x:number;z:number;intent:string;targetsPlayer:boolean;offRoad:boolean}
export interface BattleFrame {time:number;active:boolean;paused:boolean;x:number;z:number;heading:number;ahead?:RaceInterval|null;behind?:RaceInterval|null;cars:readonly BattleCar[]}
interface GapHistory {id:string;time:number;seconds:number;trend:string}
/** Read-only presentation memory; never feeds steering, pace or race order. */
export class BattleAwareness {
  private gaps=new Map<string,GapHistory>();
  private lastTime=-Infinity;private nextRadio=0;private expires=0;private message='';
  private seen=new Map<string,string>();
  reset(){this.gaps.clear();this.seen.clear();this.nextRadio=0;this.expires=0;this.message='';this.lastTime=-Infinity;}
  private trend(key:string,gap:RaceInterval|null|undefined,time:number){
    if(!gap||gap.seconds===null||gap.laps){this.gaps.delete(key);return '';}
    const old=this.gaps.get(key);
    if(!old||old.id!==gap.id){this.gaps.set(key,{id:gap.id,time,seconds:gap.seconds,trend:''});return '';}
    if(time-old.time>=2){const rate=(gap.seconds-old.seconds)/(time-old.time);old.trend=Math.abs(rate)<.06?'간격 유지':rate<0?'간격 감소':'간격 증가';old.time=time;old.seconds=gap.seconds;}
    return old.trend;
  }
  update(f:BattleFrame){
    if(f.time<this.lastTime||!f.active){this.reset();return {left:'',right:'',ahead:'',behind:'',radio:''};}
    this.lastTime=f.time;
    if(f.paused)return {left:'',right:'',ahead:'',behind:'',radio:''};
    let left=false,right=false,leftClose=false,rightClose=false;
    let candidate='';let priority=0;
    for(const car of f.cars){
      const dx=car.x-f.x,dz=car.z-f.z;
      const longitudinal=dx*Math.sin(f.heading)+dz*Math.cos(f.heading),lateral=dx*Math.cos(f.heading)-dz*Math.sin(f.heading);
      // World-space proximity also works beside a spun car, without circuit-wrap errors.
      if(Math.abs(longitudinal)<9&&Math.abs(lateral)>1.2&&Math.abs(lateral)<7){if(lateral<0){left=true;leftClose ||=Math.abs(longitudinal)<5&&Math.abs(lateral)<4;}else{right=true;rightClose ||=Math.abs(longitudinal)<5&&Math.abs(lateral)<4;}}
      const relevant=Math.hypot(dx,dz)<55;
      const recovery=car.intent==='recover'||car.intent==='merge';
      const involved=car.targetsPlayer||car.intent==='defend'&&f.ahead?.id===car.id;
      const state=relevant?car.offRoad?'offroad':recovery||involved?car.intent:'':'';
      const previous=this.seen.get(car.id);this.seen.set(car.id,state);
      if(!state||state===previous)continue;
      const event=state==='offroad'?{p:3,text:`${car.name} 코스 이탈 · 복귀 주의`}:state==='prepare'?{p:1,text:`${car.name} 추월 준비 중`}:state==='overtake'?{p:2,text:`${car.name} 추월 시도 중`}:state==='defend'?{p:1,text:`${car.name} 방어 중 · 다른 라인을 살펴보세요`}:state==='merge'||state==='recover'?{p:3,text:`${car.name} 도로 복귀 중`}:null;
      if(event&&event.p>priority){priority=event.p;candidate=event.text;}
    }
    if(candidate&&f.time>=this.nextRadio){this.message=candidate;this.expires=f.time+3.5;this.nextRadio=f.time+8;}
    return {left:left?leftClose?'근접':'차량':'',right:right?rightClose?'근접':'차량':'',ahead:this.trend('ahead',f.ahead,f.time),behind:this.trend('behind',f.behind,f.time),radio:f.time<this.expires?this.message:''};
  }
}
