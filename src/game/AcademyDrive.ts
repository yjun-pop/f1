import {VehiclePose} from './VehiclePose';
import * as THREE from 'three';
import {Vehicle,resolveCollision} from './Vehicle';import type {Track} from './Track';import type {LinePlanner} from './LinePlanner';import type {Input} from './Input';
import {HANDLING,steeringLock} from './Dynamics';
import {ACADEMY_TESTS,ActionGate,LessonJudge,type TutorialStatus,type LessonSample} from './AcademyLessons';
export class AcademyDrive {
 readonly opponent?:Vehicle;private opponentPose=new VehiclePose();phase:TutorialStatus['phase']='approach';private gate=new ActionGate();private judge?:LessonJudge;private apex:number;private exit:number;private cueAt=0;private target=20;private turnGate=false;
 constructor(private track:Track,private car:Vehicle,private planner:LinePlanner,readonly lesson:number,scene:THREE.Scene){
  if(!Number.isInteger(lesson)||lesson<0||lesson>3)throw Error('훈련 항목을 확인하세요.');
  const section=track.sections.find(s=>s.number===1)!.progress;
  this.apex=(planner.apices.filter(a=>Math.abs(a.progress-section)*track.length<180).sort((a,b)=>a.progress-b.progress)[0]?.progress??section)*track.length;
  const group=planner.apices.filter(a=>a.progress*track.length>=this.apex&&a.progress*track.length<this.apex+180);
  this.exit=Math.max(this.apex+90,...group.map(a=>a.progress*track.length+55));
  this.target=Math.max(14,Math.min(26,planner.speed(this.apex/track.length)*.9));
  if(lesson===3)this.opponent=new Vehicle(track,scene,0x30b9a4);
  this.reset();
 }
 get done(){return this.phase==='success';}
 reset(){
  this.phase='approach';this.gate=new ActionGate();this.judge=undefined;this.turnGate=false;
  const start=this.lesson===0?this.apex-850:this.lesson===1?this.apex-240:this.lesson===2?this.apex-55:this.apex-850;
  this.place(this.car,start,this.lesson===0?0:this.lesson===1?42:this.lesson===2?this.target:50);
  this.car.ersEnabled=this.lesson===3;this.car.boost=100;
  if(this.opponent){this.place(this.opponent,start+12,50);this.opponent.ersEnabled=false;this.opponentPose.capture(this.opponent);}
  this.cueAt=this.lesson===0?start:this.lesson===1?this.apex-80:this.lesson===2?this.exit:start+65;
 }
 private place(car:Vehicle,metres:number,speed:number){car.resetAt(metres/this.track.length);car.position.copy(this.lesson===3?this.track.point(car.progress).addScaledVector(this.track.normal(car.progress),car===this.car?-1.8:1.8):this.planner.point(car.progress));const t=this.lesson===3?this.track.tangent(car.progress):this.planner.point(car.progress+2/this.track.length).sub(this.planner.point(car.progress-2/this.track.length));car.heading=Math.atan2(t.x,t.z);car.speed=speed;car.setTransmissionMode('auto');car.sync();}
 private controls(input:Input){const a=input.analog();return {throttle:Math.max(a?.throttle??0,input.down('KeyW','ArrowUp')?1:0),brake:Math.max(a?.brake??0,input.down('KeyS','ArrowDown')?1:0),steer:input.down('KeyA','ArrowLeft')?1:input.down('KeyD','ArrowRight')?-1:a?.steer??0,boost:input.down('ShiftLeft','ShiftRight')};}
 private sample(dt:number):LessonSample {const c=this.car,t=this.track.tangent(c.progress),heading=Math.atan2(t.x,t.z),a=this.track.tangent(c.progress-10/this.track.length),b=this.track.tangent(c.progress+10/this.track.length);return {dt,metres:c.distance*this.track.length,speed:c.speed,throttle:c.throttle,brake:c.brake,steer:c.steer,headingError:Math.atan2(Math.sin(c.heading-heading),Math.cos(c.heading-heading)),curvature:a.angleTo(b)/20,offRoad:c.offRoad,impacts:c.impactSerial,boosting:c.boosting,energy:c.boost,gap:this.opponent?(this.opponent.distance-c.distance)*this.track.length:0};}
 private auto(car:Vehicle,dt:number,cap=65){const look=THREE.MathUtils.clamp(7+car.speed*.3,9,26),to=(this.lesson===3?this.track.point(car.progress+look/this.track.length).addScaledVector(this.track.normal(car.progress+look/this.track.length),car===this.car?-1.8:1.8):this.planner.point(car.progress+look/this.track.length)).sub(car.position),desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));const steer=THREE.MathUtils.clamp((angle-car.yawRate*.018)/steeringLock(car.speed,car.gripScale),-1,1),target=Math.min(cap,this.planner.speed(car.progress)*.85),difference=target-car.speed;car.drive(dt,{steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1),boost:false});}
 present(alpha:number){if(this.opponent)this.opponentPose.present(this.opponent,alpha);}
 step(dt:number,input:Input){
  if(this.opponent)this.opponentPose.capture(this.opponent);
  const controls=this.controls(input),metres=this.car.distance*this.track.length;
  if(this.phase==='success'){this.auto(this.car,dt);if(this.opponent)this.auto(this.opponent,dt,60);return;}
  if(this.phase==='failed')return;
  if(this.phase==='approach'&&metres>=this.cueAt){this.phase='waiting';this.gate=new ActionGate();}
  if(this.phase==='waiting'){
   const active=this.turnGate?Math.abs(controls.steer)>.15&&controls.brake<.1:this.lesson===3?controls.boost:this.lesson===1?controls.brake>.25:controls.throttle>.25;
   if(!this.gate.update(!!active)||this.lesson===3&&controls.throttle<=.3)return;
   this.phase='driving';if(!this.turnGate)this.judge=new LessonJudge(this.lesson,this.sample(0),this.apex,this.exit,this.target);
  }
  if(this.phase==='approach'&&(this.car.offRoad||this.car.impactSerial>0)){this.phase='failed';return;}
  if(this.phase==='approach'){this.auto(this.car,dt,this.lesson===1?42:this.lesson===2?this.target:55);if(this.opponent)this.auto(this.opponent,dt,60);return;}
  this.car.transmission.mode='auto';this.car.update(dt,input);if(this.opponent){this.auto(this.opponent,dt,60);resolveCollision(this.car,this.opponent);}
  this.judge!.update(this.sample(dt));
  if(this.judge!.success)this.phase='success';else if(this.judge!.failed)this.phase='failed';
  else if(this.lesson===1&&!this.turnGate&&this.car.speed<=this.target*1.15&&controls.brake>.25){this.turnGate=true;this.phase='waiting';this.gate=new ActionGate();}
  if(this.car.distance*this.track.length>this.apex+500&&!this.done)this.phase='failed';
 }
 get status():TutorialStatus {const s=this.sample(0),test=ACADEMY_TESTS[this.lesson];return {lesson:this.lesson,phase:this.phase,speed:this.car.kmh,distance:Math.max(0,this.cueAt-s.metres),gap:this.opponent?Math.round(s.gap):undefined,key:this.turnGate?'브레이크 놓기 + A / D · 휠 조향':test.key,cue:this.phase==='success'?'미션 성공':this.phase==='failed'?this.judge?.failed||'훈련 구간을 다시 시도하세요.':this.phase==='waiting'?(this.turnGate?'브레이크를 놓고 코너 방향으로 조향하세요.':`${test.action} 입력을 시작하세요. 입력 전까지 차량은 멈춰 있습니다.`):this.phase==='approach'?'시범 주행 중 · 입력 지점으로 이동합니다.':this.lesson===1?'속도를 줄인 뒤 브레이크를 놓으며 코너로 진입하세요.':this.lesson===2?'출구를 향해 조향을 풀고 가속하세요.':this.lesson===3?`직선에서 추가 출력을 유지하세요. 연습 차량과 ${Math.abs(Math.round(s.gap))}m`:test.instruction};}
}
