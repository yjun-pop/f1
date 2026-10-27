export interface TimingSample {id:string;name:string;distance:number}
export interface RaceInterval {id:string;name:string;seconds:number|null;laps:number}
interface PassageHistory {distance:number;time:number;gate:number;passages:Map<number,number>}

/** Compare interpolated passage times at the same circuit point, not metres/speed. */
export class RaceTiming {
  readonly gateCount:number;
  private history=new Map<string,PassageHistory>();
  constructor(private length:number){this.gateCount=Math.ceil(length/10);}
  reset(){this.history.clear();}
  update(samples:readonly TimingSample[],elapsed:number){
    const retention=Math.ceil(this.gateCount*1.25);
    for(const sample of samples){
      if(!Number.isFinite(sample.distance)||!Number.isFinite(elapsed))continue;
      const previous=this.history.get(sample.id),gate=Math.floor(sample.distance*this.gateCount+1e-8);
      if(!previous||elapsed<previous.time||Math.abs(sample.distance-previous.distance)*this.length>Math.max(50,(elapsed-previous.time)*150)){
        const passages=new Map<number,number>();
        if(!previous&&Math.abs(sample.distance*this.gateCount-gate)<1e-7)passages.set(gate,elapsed);
        this.history.set(sample.id,{distance:sample.distance,time:elapsed,gate,passages});continue;
      }
      if(sample.distance>previous.distance){
        for(let next=previous.gate+1;next<=gate;next++){
          const alpha=(next/this.gateCount-previous.distance)/(sample.distance-previous.distance);
          if(alpha>=-1e-7&&alpha<=1+1e-7)previous.passages.set(next,previous.time+(elapsed-previous.time)*Math.max(0,Math.min(1,alpha)));
        }
        previous.gate=Math.max(previous.gate,gate);
        while(previous.passages.size>retention)previous.passages.delete(previous.passages.keys().next().value!);
      }
      previous.distance=sample.distance;previous.time=elapsed;
    }
  }
  between(ahead:TimingSample,behind:TimingSample,elapsed:number):number|null{
    const a=this.history.get(ahead.id),b=this.history.get(behind.id);if(!a?.passages.size||!b?.passages.size)return null;
    const gate=Math.min(a.gate,b.gate),ta=a.passages.get(gate),tb=b.passages.get(gate);
    if(ta===undefined||tb===undefined||tb<ta-1e-6||elapsed-tb>2.5)return null;
    return Math.max(0,tb-ta);
  }
  neighbours(samples:readonly TimingSample[],playerID:string,elapsed:number){
    const order=[...samples].sort((a,b)=>b.distance-a.distance),index=order.findIndex(s=>s.id===playerID),player=order[index];
    if(!player)return {ahead:null,behind:null};
    const interval=(other:TimingSample|undefined,ahead:boolean):RaceInterval|null=>{
      if(!other)return null;
      const laps=Math.max(0,Math.floor(Math.abs(other.distance-player.distance)+1e-6));
      return {id:other.id,name:other.name,laps,seconds:laps?null:this.between(ahead?other:player,ahead?player:other,elapsed)};
    };
    return {ahead:interval(order[index-1],true),behind:interval(order[index+1],false)};
  }
}

export function formatInterval(interval:RaceInterval|null,ahead:boolean,active=true){
  if(!active)return '—';
  if(!interval)return ahead?'선두':'최후미';
  const sign=ahead?'+':'−';
  if(interval.laps)return `${sign}${interval.laps}랩`;
  return interval.seconds===null?'측정 중':`${sign}${interval.seconds.toFixed(2)}s`;
}
