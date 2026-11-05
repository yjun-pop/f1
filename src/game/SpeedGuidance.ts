export interface GuideSample {progress:number;distance:number;limit:number;allowed:number;effort:number}
/** Negative effort is braking. Spread abrupt braking edges without raising them. */
export function smoothEffort(samples:GuideSample[]){
  const slope=.06;
  for(let i=1;i<samples.length;i++)samples[i].effort=Math.min(samples[i].effort,samples[i-1].effort+slope*(samples[i].distance-samples[i-1].distance));
  for(let i=samples.length-2;i>=0;i--)samples[i].effort=Math.min(samples[i].effort,samples[i+1].effort+slope*(samples[i+1].distance-samples[i].distance));
}
export class SpeedGuidance {
  readonly target:number;
  readonly cue:{distance:number;target:number}|null;
  constructor(readonly samples:GuideSample[],speed:number,brake:(speed:number)=>number){
    for(let i=samples.length-2;i>=0;i--){const a=samples[i],b=samples[i+1];a.allowed=Math.min(a.limit,Math.sqrt(b.allowed*b.allowed+2*brake(b.allowed)*(b.distance-a.distance)));}
    this.target=samples[0].allowed;
    const forecast=new Float64Array(samples.length);forecast[0]=Math.min(Math.max(0,speed),this.target);
    for(let i=1;i<samples.length;i++)forecast[i]=Math.min(samples[i].allowed,Math.sqrt(forecast[i-1]**2+10*(samples[i].distance-samples[i-1].distance)));
    for(let i=0;i<samples.length;i++){
      const lo=Math.max(0,i-3),hi=Math.min(samples.length-1,i+3),acceleration=(forecast[hi]**2-forecast[lo]**2)/(2*Math.max(.1,samples[hi].distance-samples[lo].distance));
      const excess=Math.max(0,(speed-this.target)/5)*Math.max(0,1-samples[i].distance/40);
      samples[i].effort=Math.min(Math.max(-1,Math.min(1,acceleration/(acceleration<0?brake(forecast[i]):5))),excess>.01?-Math.min(1,excess):1);
    }
    smoothEffort(samples);
    const index=speed<8?-1:samples.findIndex(s=>s.allowed<speed-.5);
    let cue:null|{distance:number;target:number}=null;
    if(index>=0&&samples[index].distance<=160){
      let end=index;while(end<samples.length-1&&samples[end].limit>samples[end].allowed+.05)end++;
      cue={distance:samples[index].distance,target:Math.round(samples[end].limit*3.6)};
    }
    this.cue=cue;
  }
  at(distance:number){
    let lo=0,hi=this.samples.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(this.samples[mid].distance>distance)hi=mid;else lo=mid;}
    const a=this.samples[lo],b=this.samples[hi],t=Math.max(0,Math.min(1,(distance-a.distance)/Math.max(.001,b.distance-a.distance)));
    return {allowed:a.allowed+(b.allowed-a.allowed)*t,effort:a.effort+(b.effort-a.effort)*t};
  }
}
