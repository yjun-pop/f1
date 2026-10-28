export type TransmissionMode='auto'|'manual';
export const UPSHIFT_RPM=12000,REV_LIMIT_RPM=12200,IDLE_RPM=3800;
// Engine revolutions per m/s, including the final drive and tire radius.
export const GEAR_RATIOS=[440,335,272,228,193,167,147,131] as const;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number,a:number,b:number)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
export function transmissionMode(value:unknown):TransmissionMode{return value==='manual'?'manual':'auto';}
export function automaticGear(speed:number){let gear=1;while(gear<8&&speed*GEAR_RATIOS[gear-1]>UPSHIFT_RPM)gear++;return gear;}
/** Gear reduction and a broad engine power curve. Normalize wheel torque to
 * the established full-power envelope, giving neither driver extra power. */
export function gearEfficiency(speed:number,gear:number){
  const wheelTorque=(g:number)=>{
    const ratio=GEAR_RATIOS[g-1],rpm=Math.max(IDLE_RPM,speed*ratio);
    if(rpm>REV_LIMIT_RPM+100)return 0;
    return ratio*(.16+.84*smooth(rpm,IDLE_RPM,9200))/rpm;
  };
  let best=0;for(let g=1;g<=8;g++)best=Math.max(best,wheelTorque(g));
  return clamp(wheelTorque(clamp(Math.round(gear),1,8))/Math.max(.000001,best),0,1);
}
export function engineAcceleration(speed:number,boost=false,efficiency=1){return (boost?23:17)*Math.max(0,1-speed/140)*efficiency;}
export interface PowertrainSample {gear:number;rpm:number;cut:number;blip:number;limiting:boolean;drive:number;mode:TransmissionMode}
/** Fixed-step physical gearbox. Presentation only reads its completed sample. */
export class Powertrain {
  mode:TransmissionMode='auto';gear=1;rpm=IDLE_RPM;simulated=false;
  private initialized=false;private lastSpeed=0;private cooldown=0;private transient=0;private downshift=false;
  private limiterTime=0;private limiting=false;
  sample:PowertrainSample={gear:1,rpm:IDLE_RPM,cut:1,blip:0,limiting:false,drive:1,mode:'auto'};
  reset(){this.gear=1;this.rpm=IDLE_RPM;this.simulated=this.initialized=false;this.lastSpeed=this.cooldown=this.transient=this.limiterTime=0;this.limiting=this.downshift=false;this.sample={gear:1,rpm:this.rpm,cut:1,blip:0,limiting:false,drive:1,mode:this.mode};}
  setMode(mode:TransmissionMode,speed:number){
    this.mode=mode;this.initialized=true;this.lastSpeed=speed;
    if(mode==='auto'){this.gear=automaticGear(speed);this.rpm=clamp(speed*GEAR_RATIOS[this.gear-1],IDLE_RPM,12800);}
    this.transient=this.cooldown=this.limiterTime=0;this.limiting=false;
    this.sample={...this.sample,gear:this.gear,rpm:this.rpm,mode,cut:1,blip:0,limiting:false,drive:gearEfficiency(speed,this.gear)};
  }
  private engage(gear:number){this.downshift=gear<this.gear;this.gear=gear;this.transient=this.downshift?.08:.04;this.cooldown=.12;this.limiting=false;this.limiterTime=0;}
  shift(direction:-1|1,speed:number){
    if(this.mode!=='manual'||this.cooldown>0)return false;
    const next=this.gear+direction;
    if(next<1||next>8||direction<0&&speed*GEAR_RATIOS[next-1]>REV_LIMIT_RPM-80)return false;
    this.engage(next);return true;
  }
  advance(speed:number,throttle:number,brake:number,dt:number,physical=true){
    dt=clamp(dt,0,.1);speed=Math.max(0,speed);if(physical)this.simulated=true;
    this.cooldown=Math.max(0,this.cooldown-dt);this.transient=Math.max(0,this.transient-dt);
    if(!this.initialized||this.mode==='auto'&&(speed<2||Math.abs(speed-this.lastSpeed)>22)){
      if(this.mode==='auto')this.gear=automaticGear(speed);
      this.rpm=clamp(speed*GEAR_RATIOS[this.gear-1],IDLE_RPM,12800);this.initialized=true;
      this.transient=0;this.cooldown=this.mode==='auto'?.12:0;this.limiterTime=0;this.limiting=false;
    }
    const wheelRPM=speed*GEAR_RATIOS[this.gear-1];
    if(this.mode==='auto'&&this.cooldown===0){
      if(wheelRPM>UPSHIFT_RPM&&this.gear<8)this.engage(this.gear+1);
      else if(this.gear>1&&speed<UPSHIFT_RPM/GEAR_RATIOS[this.gear-2]*.84)this.engage(this.gear-1);
    }
    const phase=this.transient/(this.downshift?.08:.04);
    const blip=this.downshift&&this.transient>0?Math.sin(phase*Math.PI)*850:0;
    const rawRPM=speed*GEAR_RATIOS[this.gear-1]+throttle*420*Math.max(0,1-speed/20);
    const wasLimiting=this.limiting;
    this.limiting=throttle>.65&&brake===0&&rawRPM>=(wasLimiting?REV_LIMIT_RPM-160:REV_LIMIT_RPM);
    this.limiterTime=this.limiting?(wasLimiting?(this.limiterTime+dt)%.12:0):0;
    const limiterCut=this.limiting&&this.limiterTime<.065;
    const desired=this.limiting?Math.min(rawRPM,REV_LIMIT_RPM)-(limiterCut?650:0):clamp(rawRPM+blip,IDLE_RPM,12800);
    this.rpm+=(desired-this.rpm)*(1-Math.exp(-dt*(this.limiting?65:this.transient>0?40:19)));
    const cut=Math.min(!this.downshift&&this.transient>0?.25+.75*(1-phase):1,limiterCut?.12:1);
    this.lastSpeed=speed;
    return this.sample={gear:this.gear,rpm:this.rpm,cut,blip:blip/850,limiting:this.limiting,drive:gearEfficiency(speed,this.gear)*cut,mode:this.mode};
  }
}
