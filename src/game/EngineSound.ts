import type {Vehicle} from './Vehicle';
import {ENGINE_TIMBRES} from './EngineTimbres';
import {Powertrain,UPSHIFT_RPM} from './Powertrain';
export {UPSHIFT_RPM,REV_LIMIT_RPM} from './Powertrain';
export type SoundCar=Pick<Vehicle,'speed'|'throttle'|'brake'|'lateralSpeed'|'gripUsage'|'offRoad'>&{transmission?:Powertrain};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
export const SHIFT_LIGHT_COUNT=15;
export const SHIFT_LIGHT_START_RPM=10500,SHIFT_LIGHT_FULL_RPM=UPSHIFT_RPM-200;
/** Shift warning lights show the approach to an upshift, not the full rev range. */
export function shiftLightCount(rpm:number){
  if(!Number.isFinite(rpm))return 0;
  return Math.floor(clamp((rpm-SHIFT_LIGHT_START_RPM)/(SHIFT_LIGHT_FULL_RPM-SHIFT_LIGHT_START_RPM),0,1)*SHIFT_LIGHT_COUNT);
}
/** Compatibility for unsimulated telemetry; real cars share the physical sample. */
export class EngineSoundState {
  private fallback=new Powertrain();
  get gear(){return this.current.gear;}
  get rpm(){return this.current.rpm;}
  private current=this.fallback.sample;
  advance(car:SoundCar,dt:number){
    this.current=car.transmission&&(car.transmission.simulated||car.transmission.mode==='manual')?car.transmission.sample:this.fallback.advance(car.speed,car.throttle,car.brake,dt,false);
    return {...soundTelemetry(car),...this.current};
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
