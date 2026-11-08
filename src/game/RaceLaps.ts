export const QUICK_RACE_LAPS=[1,3,5,10] as const;
export function quickRaceLaps(value:unknown){return QUICK_RACE_LAPS.find(laps=>String(laps)===String(value))??3;}
export interface LapSample {id:string;name:string;distance:number}
export interface LapRecord {lap:number;seconds:number|null;elapsed:number}
interface LapHistory {distance:number;time:number;next:number;start:number;valid:boolean;laps:LapRecord[]}
export interface RaceStanding extends LapSample {
  position:number;completed:number;current:number|null;last:number|null;best:number|null;finish:number|null;lapTimes:readonly LapRecord[];
}

/** Actual finish-line crossings, shared by the live tower and frozen results. */
export class RaceLaps {
  private history=new Map<string,LapHistory>();
  get started(){return this.history.size>0;}
  constructor(private length:number,readonly totalLaps=3){}
  reset(samples:readonly LapSample[]=[],elapsed=0){
    this.history.clear();
    for(const sample of samples)this.history.set(sample.id,{distance:sample.distance,time:elapsed,next:1,start:elapsed,valid:sample.distance<1,laps:[]});
  }
  update(samples:readonly LapSample[],elapsed:number){
    for(const sample of samples){
      if(!Number.isFinite(sample.distance)||!Number.isFinite(elapsed))continue;
      let previous=this.history.get(sample.id);
      if(!previous){previous={distance:sample.distance,time:elapsed,next:1,start:0,valid:sample.distance<1,laps:[]};this.history.set(sample.id,previous);continue;}
      if(previous.next>this.totalLaps)continue;
      const delta=sample.distance-previous.distance,dt=elapsed-previous.time;
      if(dt<0)continue;
      if(Math.abs(delta)*this.length>Math.max(50,dt*150)){
        // A teleport cannot create completed laps or a competitive partial lap.
        previous.valid=false;previous.next=Math.max(previous.next,Math.floor(sample.distance+1e-6)+1);
      }else if(delta>0){
        while(previous.next<=this.totalLaps&&sample.distance+1e-6>=previous.next){
          if(previous.distance>=previous.next+1e-6){previous.next++;previous.valid=false;continue;}
          const alpha=Math.max(0,Math.min(1,(previous.next-previous.distance)/delta)),crossing=previous.time+dt*alpha,seconds=crossing-previous.start;
          previous.laps.push({lap:previous.next,seconds:previous.valid&&seconds>0?seconds:null,elapsed:crossing});
          previous.next++;previous.start=crossing;previous.valid=true;
        }
      }
      previous.distance=sample.distance;previous.time=elapsed;
    }
  }
  lap(id:string,lap:number){return this.history.get(id)?.laps.find(record=>record.lap===lap);}
  standings(samples:readonly LapSample[],elapsed:number):RaceStanding[]{
    const rows=samples.map(sample=>{
      const entry=this.history.get(sample.id),lapTimes=entry?.laps??[],last=lapTimes.at(-1),finish=lapTimes.find(lap=>lap.lap===this.totalLaps)?.elapsed??null;
      const valid=lapTimes.flatMap(lap=>lap.seconds===null?[]:[lap.seconds]);
      return {...sample,position:0,completed:last?.lap??0,current:finish!==null?null:Math.max(0,elapsed-(entry?.start??0)),last:last?.seconds??null,best:valid.length?Math.min(...valid):null,finish,lapTimes:[...lapTimes]};
    });
    rows.sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish:a.finish!==null?-1:b.finish!==null?1:b.distance-a.distance);
    rows.forEach((row,index)=>row.position=index+1);return rows;
  }
}
export function formatTime(seconds:number|null|undefined){
  if(seconds==null||!Number.isFinite(seconds)||seconds<=0)return '—:——.———';
  const milliseconds=Math.round(seconds*1000),minutes=Math.floor(milliseconds/60000),remainder=milliseconds%60000;
  return `${minutes}:${Math.floor(remainder/1000).toString().padStart(2,'0')}.${(remainder%1000).toString().padStart(3,'0')}`;
}
