import * as THREE from 'three';
/** Shared dry-surface handling model used by the player, AI and line planner. */
export const HANDLING={mass:798,wheelbase:3.6,inertiaPerMass:2.7,baseGrip:22,downforce:.0052,maxSpeed:94,cornerStiffness:330};
export function lateralGrip(speed:number,offRoad=false){return (HANDLING.baseGrip+HANDLING.downforce*speed*speed)*(offRoad?.43:1);}
export function brakingDeceleration(speed:number,offRoad=false,gripScale=1){return Math.min(38*gripScale,lateralGrip(speed,offRoad)*gripScale*.88);}
export function cornerSpeed(curvature:number,maxSpeed=94){return Math.min(maxSpeed,Math.sqrt(HANDLING.baseGrip*.94/Math.max(.0001,curvature-HANDLING.downforce*.94)));}
export function steeringLock(speed:number,gripScale=1){const v=Math.abs(speed);
  // Keyboard input must not apply low-speed full lock at racing speeds.
  return Math.min(.43/(1+v*.025),Math.atan(HANDLING.wheelbase*lateralGrip(v)*gripScale*1.06/Math.max(36,v*v)));}
export interface Controls {throttle:number;brake:number;steer:number;boost?:boolean}
export interface DynamicBody {raceSpeedCap?:number;raceCruiseCap?:number;racePowerAssist?:number;gripScale?:number;powerScale?:number;position:THREE.Vector3;speed:number;lateralSpeed:number;yawRate:number;heading:number;steer:number;offRoad:boolean;acceleration:number;lateralAcceleration:number;gripUsage:number}
export function integrateBody(body:DynamicBody,controls:Controls,dt:number){
  if(dt<=0)return;
  body.steer=THREE.MathUtils.damp(body.steer,THREE.MathUtils.clamp(controls.steer,-1,1),10,dt);
  const speed=Math.max(0,body.speed),gripScale=body.gripScale??1,powerScale=body.powerScale??1;
  const grip=lateralGrip(speed,body.offRoad)*gripScale;
  const governed=body.raceSpeedCap!==undefined;
  const speedCap=governed?THREE.MathUtils.clamp(controls.boost?body.raceSpeedCap!:body.raceCruiseCap??87,72,110):(controls.boost?94:87);
  const pursuit=1+(THREE.MathUtils.clamp(body.racePowerAssist??1,1,1.35)-1)*THREE.MathUtils.smoothstep(speed,45,75);
  const throttle=THREE.MathUtils.clamp(controls.throttle,0,1)*(governed&&speed>=speedCap?0:1),brake=THREE.MathUtils.clamp(controls.brake,0,1);
  const engine=(controls.boost?23:17)*powerScale*pursuit*(1-speed/140);
  const drag=.00105*speed*speed+(body.offRoad?4.2:.35);
  const longitudinal=THREE.MathUtils.clamp(throttle*engine-brake*brakingDeceleration(speed,body.offRoad,gripScale)-drag,-grip*.91,grip*.91);
  const steerAngle=body.steer*steeringLock(speed,gripScale);
  // Lateral tire forces use front/rear slip angles, load transfer and a friction circle.
  const remaining=Math.sqrt(Math.max(.06,1-(longitudinal/grip)**2));
  const frontLoad=THREE.MathUtils.clamp(.5-longitudinal*.004,.38,.64);
  const frontLimit=grip*frontLoad*remaining,rearLimit=grip*(1-frontLoad)*remaining;
  const reference=Math.max(6,speed),half=HANDLING.wheelbase/2;
  const frontSlip=steerAngle-Math.atan2(body.lateralSpeed+body.yawRate*half,reference);
  const rearSlip=-Math.atan2(body.lateralSpeed-body.yawRate*half,reference);
  const frontForce=frontLimit*Math.tanh(HANDLING.cornerStiffness*frontSlip/Math.max(.1,frontLimit));
  const rearForce=rearLimit*Math.tanh(HANDLING.cornerStiffness*1.08*rearSlip/Math.max(.1,rearLimit));
  const lateral=frontForce+rearForce;
  if(speed<4){
    body.yawRate=THREE.MathUtils.damp(body.yawRate,speed*Math.tan(steerAngle)/HANDLING.wheelbase,12,dt);
    body.lateralSpeed=THREE.MathUtils.damp(body.lateralSpeed,0,12,dt);
  }else{
    body.yawRate+=(half*(frontForce-rearForce)/HANDLING.inertiaPerMass-body.yawRate*.75)*dt;
    body.lateralSpeed+=(lateral-body.yawRate*speed)*dt;
  }
  // Preserve momentum above a falling AI cap; drag and brakes ease it down.
  body.speed=THREE.MathUtils.clamp(speed+(longitudinal+body.yawRate*body.lateralSpeed)*dt,0,governed?Math.max(speed,speedCap):speedCap);
  if(body.speed<.15&&!throttle){body.speed=0;body.lateralSpeed*=Math.exp(-10*dt);body.yawRate*=Math.exp(-10*dt);}
  body.heading+=body.yawRate*dt;
  body.acceleration=longitudinal;body.lateralAcceleration=lateral;body.gripUsage=Math.min(2,Math.hypot(longitudinal,lateral)/grip);
  const sin=Math.sin(body.heading),cos=Math.cos(body.heading);
  body.position.x+=(sin*body.speed+cos*body.lateralSpeed)*dt;
  body.position.z+=(cos*body.speed-sin*body.lateralSpeed)*dt;
}
