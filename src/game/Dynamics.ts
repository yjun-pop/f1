import * as THREE from 'three';
/** Shared dry-surface handling model used by the player, AI and line planner. */
export const HANDLING={mass:798,wheelbase:3.6,inertiaPerMass:2.7,baseGrip:22,downforce:.0052,maxSpeed:94,cornerStiffness:330};
export function lateralGrip(speed:number,offRoad=false){return (HANDLING.baseGrip+HANDLING.downforce*speed*speed)*(offRoad?.43:1);}
export function brakingDeceleration(speed:number,offRoad=false){return Math.min(38,lateralGrip(speed,offRoad)*.88);}
export function cornerSpeed(curvature:number){return Math.min(94,Math.sqrt(HANDLING.baseGrip*.94/Math.max(.0001,curvature-HANDLING.downforce*.94)));}
export function steeringLock(speed:number){const v=Math.abs(speed);
  // Keyboard input must not apply low-speed full lock at racing speeds.
  return Math.min(.43/(1+v*.025),Math.atan(HANDLING.wheelbase*lateralGrip(v)*1.06/Math.max(36,v*v)));}
export interface Controls {throttle:number;brake:number;steer:number;boost?:boolean}
export interface DynamicBody {position:THREE.Vector3;speed:number;lateralSpeed:number;yawRate:number;heading:number;steer:number;offRoad:boolean;acceleration:number;lateralAcceleration:number;gripUsage:number}
export function integrateBody(body:DynamicBody,controls:Controls,dt:number){
  if(dt<=0)return;
  body.steer=THREE.MathUtils.damp(body.steer,THREE.MathUtils.clamp(controls.steer,-1,1),10,dt);
  const speed=Math.max(0,body.speed),grip=lateralGrip(speed,body.offRoad);
  const throttle=THREE.MathUtils.clamp(controls.throttle,0,1),brake=THREE.MathUtils.clamp(controls.brake,0,1);
  const engine=(controls.boost?23:17)*(1-speed/140);
  const drag=.00105*speed*speed+(body.offRoad?4.2:.35);
  const longitudinal=THREE.MathUtils.clamp(throttle*engine-brake*brakingDeceleration(speed,body.offRoad)-drag,-grip*.91,grip*.91);
  const steerAngle=body.steer*steeringLock(speed);
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
  body.speed=THREE.MathUtils.clamp(speed+(longitudinal+body.yawRate*body.lateralSpeed)*dt,0,controls.boost?94:87);
  if(body.speed<.15&&!throttle){body.speed=0;body.lateralSpeed*=Math.exp(-10*dt);body.yawRate*=Math.exp(-10*dt);}
  body.heading+=body.yawRate*dt;
  body.acceleration=longitudinal;body.lateralAcceleration=lateral;body.gripUsage=Math.min(2,Math.hypot(longitudinal,lateral)/grip);
  const sin=Math.sin(body.heading),cos=Math.cos(body.heading);
  body.position.x+=(sin*body.speed+cos*body.lateralSpeed)*dt;
  body.position.z+=(cos*body.speed-sin*body.lateralSpeed)*dt;
}
