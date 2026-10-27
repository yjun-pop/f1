import type {Vehicle} from './Vehicle';
import {ENGINE_TIMBRES} from './EngineTimbres';
export type SoundCar=Pick<Vehicle,'speed'|'throttle'|'brake'|'lateralSpeed'|'gripUsage'|'offRoad'>;
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
export const UPSHIFT_RPM=12000;
export const SHIFT_LIGHT_COUNT=15;
export const SHIFT_LIGHT_START_RPM=10500,SHIFT_LIGHT_FULL_RPM=UPSHIFT_RPM-200;
/** Shift warning lights show the approach to an upshift, not the full rev range. */
export function shiftLightCount(rpm:number){
  if(!Number.isFinite(rpm))return 0;
  return Math.floor(clamp((rpm-SHIFT_LIGHT_START_RPM)/(SHIFT_LIGHT_FULL_RPM-SHIFT_LIGHT_START_RPM),0,1)*SHIFT_LIGHT_COUNT);
}
// Monza gearing: full-load upshifts near 98/129/159/189/224/259/294km/h.
const RATIOS=[440,335,272,228,193,167,147,131];
/** Audio gearbox only: never alters vehicle physics, acceleration or ERS. */
export class EngineSoundState {
  gear=1;rpm=3800;private cooldown=0;private transient=0;private downshift=false;private lastSpeed=0;private initialized=false;
  advance(car:SoundCar,dt:number){
    dt=clamp(dt,0,.1);const speed=Math.max(0,car.speed),launchRPM=car.throttle*420*Math.max(0,1-speed/20);
    this.cooldown=Math.max(0,this.cooldown-dt);this.transient=Math.max(0,this.transient-dt);
    if(!this.initialized||speed<2||Math.abs(speed-this.lastSpeed)>22){
      this.gear=1;while(this.gear<8&&speed*RATIOS[this.gear-1]>UPSHIFT_RPM)this.gear++;
      this.transient=0;this.cooldown=.2;
      this.rpm=clamp(speed*RATIOS[this.gear-1]+launchRPM,3800,12800);this.initialized=true;
    }
    const wheelRPM=speed*RATIOS[this.gear-1]+launchRPM;
    if(this.cooldown===0){
      const previous=this.gear;
      if(wheelRPM>UPSHIFT_RPM&&this.gear<8)this.gear++;
      else if(this.gear>1&&speed<UPSHIFT_RPM/RATIOS[this.gear-2]*.84)this.gear--;
      if(this.gear!==previous){this.downshift=this.gear<previous;this.transient=this.downshift?.12:.085;this.cooldown=this.downshift?.13:.2;}
    }
    const phase=this.transient/(this.downshift?.12:.085);
    const blip=this.downshift&&this.transient>0?Math.sin(phase*Math.PI)*850:0;
    const desired=clamp(speed*RATIOS[this.gear-1]+launchRPM+blip,3800,12800);
    this.rpm+=(desired-this.rpm)*(1-Math.exp(-dt*(this.transient>0?40:19)));
    this.lastSpeed=speed;
    return {...soundTelemetry(car),rpm:this.rpm,gear:this.gear,
      cut:!this.downshift&&this.transient>0?.32+.68*(1-phase):1,blip:blip/850};
  }
}
export function soundTelemetry(car:SoundCar){
  const speed=Math.max(0,car.speed),moving=Math.min(1,speed/18);
  return {rpm:Math.min(12800,3800+speed*94+car.throttle*420),engine:.055+car.throttle*.12+moving*.02,
    load:clamp(car.throttle,0,1),brake:car.brake*moving*.03,
    tire:Math.min(1,Math.max(0,(car.gripUsage-.72)*1.5)+Math.abs(car.lateralSpeed)/9)*moving*.06,
    road:moving*(car.offRoad?.065:.008)};
}
export {ENGINE_TIMBRES};
