import {EngineSoundState} from './EngineSound';
import type {Vehicle} from './Vehicle';
import type {Track} from './Track';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function windLevel(speed:number){return Math.min(.14,Math.max(0,(speed-8)/96)**2*.135);}
export interface DrivingFeedbackFrame {
  pitch:number;roll:number;heave:number;sway:number;longitudinal:number;surfaceHeave:number;
  cockpitHeave:number;cockpitPitch:number;
  kerb:number;wind:number;boostFov:number;engine:ReturnType<EngineSoundState['advance']>;
}
/** Presentation only. It reads telemetry and never writes into the vehicle. */
export class DrivingFeedback {
  strength=.6;
  private engineState=new EngineSoundState();private previousGear=1;private previousDistance?:number;
  private pitch=0;private roll=0;private dive=0;private sway=0;private shiftAge=1;private shiftDirection=0;private kerb=0;
  private engine?:ReturnType<EngineSoundState['advance']>;
  reset(){this.engineState=new EngineSoundState();this.previousGear=1;this.previousDistance=undefined;this.pitch=this.roll=this.dive=this.sway=this.kerb=0;this.shiftAge=1;this.shiftDirection=0;this.engine=undefined;}
  update(vehicle:Vehicle,track:Track,dt:number,active:boolean):DrivingFeedbackFrame {
    dt=clamp(dt,0,.1);
    if(!this.engine)this.engine=this.engineState.advance(vehicle,0);
    if(!active){
      this.pitch=this.roll=this.dive=this.sway=this.kerb=0;this.shiftAge=1;this.shiftDirection=0;this.previousDistance=undefined;
      return {pitch:0,roll:0,heave:0,sway:0,longitudinal:0,surfaceHeave:0,cockpitHeave:0,cockpitPitch:0,kerb:0,wind:0,boostFov:0,engine:this.engine};
    }
    this.engine=this.engineState.advance(vehicle,dt);
    const teleported=this.previousDistance===undefined||Math.abs(vehicle.distance-this.previousDistance)*track.length>20;
    if(teleported){this.shiftAge=1;this.shiftDirection=0;this.previousGear=this.engine.gear;}
    if(this.engine.gear!==this.previousGear){this.shiftAge=0;this.shiftDirection=this.engine.gear>this.previousGear?-1:.65;}
    this.previousGear=this.engine.gear;this.previousDistance=vehicle.distance;this.shiftAge+=dt;
    // A short attack and rebound remain visible for several render frames.
    const kick=this.shiftAge<.4?this.shiftDirection*.105*(1-Math.exp(-this.shiftAge*65))*Math.exp(-this.shiftAge*10)*Math.cos(this.shiftAge*22):0;
    const smooth=(value:number,target:number,rate:number)=>value+(target-value)*(1-Math.exp(-rate*dt));
    const moving=Math.min(1,vehicle.speed/8),strength=clamp(this.strength,0,1);
    this.pitch=smooth(this.pitch,clamp(vehicle.acceleration,-40,25)*.0011*moving,9);
    this.roll=smooth(this.roll,-clamp(vehicle.lateralAcceleration,-55,55)*.00014*moving,9);
    this.dive=smooth(this.dive,clamp(vehicle.acceleration,-40,25)*.0018*moving,10);
    this.sway=smooth(this.sway,-clamp(vehicle.lateralAcceleration,-55,55)*.0006*moving,8);
    this.kerb=smooth(this.kerb,(vehicle.speed>1?track.kerbContact(vehicle.position,vehicle.heading,vehicle.progress):0)*moving,28);
    // Low painted kerbs cause a small suspension ripple rather than a raised-block impact.
    const metres=vehicle.distance*track.length,phase=metres/8*Math.PI*2;
    const bump=this.kerb*(Math.sin(phase)*.010+Math.sin(phase*.73)*.004);
    const road=(Math.sin(metres/12*Math.PI*2)*.003+Math.sin(metres/7.7*Math.PI*2)*.0015)*Math.min(1,vehicle.speed/70);
    return {pitch:(this.pitch+kick*.3+bump*.45+road*.3)*strength,roll:this.roll*strength,
      heave:(this.dive+bump+road)*strength,sway:this.sway*strength,
      longitudinal:(clamp(-vehicle.acceleration*.002,-.05,.08)+kick)*moving*strength,
      surfaceHeave:(bump+road)*strength,cockpitHeave:(bump*.65+road+kick*.2)*strength,cockpitPitch:kick*.35*strength,
      kerb:this.kerb,wind:windLevel(vehicle.speed),
      boostFov:vehicle.boosting?1.5*strength:0,engine:this.engine};
  }
}
