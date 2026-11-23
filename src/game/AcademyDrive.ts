import * as THREE from 'three';
import {academyGeometry} from './AcademyCircuit';
import {VehiclePose} from './VehiclePose';
import {Vehicle,resolveCollision} from './Vehicle';
import type {Track} from './Track';import type {LinePlanner} from './LinePlanner';import type {Input} from './Input';
import {HANDLING,steeringLock} from './Dynamics';
import {ActionGate,LessonJudge,cornerExitAligned,type TutorialStatus,type LessonSample,type AcademyAction} from './AcademyLessons';
export class AcademyDrive {
 readonly opponent?:Vehicle;private opponentPose=new VehiclePose();phase:TutorialStatus['phase']='waiting';
 private gate=new ActionGate();private judge?:LessonJudge;private apex:number;private exit:number;private cueAt:number;private target:number;
 private device:'keyboard'|'wheel'='keyboard';private inputValue=0;private boostButton:number|null=null;private guide=new THREE.Group();
 constructor(private track:Track,private car:Vehicle,private planner:LinePlanner,readonly lesson:number,scene:THREE.Scene){
  if(!Number.isInteger(lesson)||lesson<0||lesson>3)throw Error('훈련 항목을 확인하세요.');
  const geometry=academyGeometry(track,planner,lesson===2?3:1);this.apex=geometry.apex;this.exit=geometry.exit;this.cueAt=geometry.brake;this.target=geometry.target;
  if(lesson===3)this.opponent=new Vehicle(track,scene,0x30b9a4);
  if(lesson===1||lesson===2){
   const positions:number[]=[],indices:number[]=[];
   for(let i=0;i<=30;i++){const t=(this.cueAt+i*(this.apex-35-this.cueAt)/30)/track.length,p=planner.point(t),n=track.normal(t);for(const side of[-1,1])positions.push(p.x+n.x*side*2.8,.055,p.z+n.z*side*2.8);if(i<30){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
   this.guide.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xffc66b,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide})));scene.add(this.guide);
  }
  this.reset();
 }
 get done(){return this.phase==='success';}
 reset(){
  this.phase='waiting';this.gate=new ActionGate();this.judge=undefined;
  const start=this.lesson===2?this.cueAt-30:this.apex-(this.lesson===1?240:700);
  this.place(this.car,start,this.lesson===0?0:this.lesson===3?42:this.lesson===2?28:36);this.car.ersEnabled=this.lesson===3;this.car.boost=100;
  if(this.opponent){this.place(this.opponent,start+12,42);this.opponent.ersEnabled=false;this.opponentPose.capture(this.opponent);}
 }
 private place(car:Vehicle,metres:number,speed:number){car.resetAt(metres/this.track.length);car.position.copy(this.lesson===3?this.track.point(car.progress).addScaledVector(this.track.normal(car.progress),car===this.car?-1.8:1.8):this.planner.point(car.progress));const t=this.lesson===3?this.track.tangent(car.progress):this.planner.point(car.progress+2/this.track.length).sub(this.planner.point(car.progress-2/this.track.length));car.heading=Math.atan2(t.x,t.z);car.speed=speed;car.setTransmissionMode('auto');car.sync();}
 private get action():AcademyAction {
  if(this.phase==='waiting')return 'throttle';if(this.lesson===3)return 'boost';
  if(this.lesson===1||this.lesson===2){if(this.car.distance*this.track.length<this.cueAt)return 'coast';if(!this.judge?.braked)return 'brake';if(!this.judge.entered||!cornerExitAligned(this.sample(0),this.exit))return 'steer';}
  return 'throttle';
 }
 private controls(input:Input){const a=input.analog();return {throttle:Math.max(a?.throttle??0,input.down('KeyW','ArrowUp')?1:0),brake:Math.max(a?.brake??0,input.down('KeyS','ArrowDown')?1:0),steer:input.down('KeyA','ArrowLeft')?1:input.down('KeyD','ArrowRight')?-1:a?.steer??0,boost:input.down('ShiftLeft','ShiftRight')};}
 private sample(dt:number):LessonSample {const c=this.car,t=this.track.tangent(c.progress),heading=Math.atan2(t.x,t.z),a=this.track.tangent(c.progress-10/this.track.length),b=this.track.tangent(c.progress+10/this.track.length);return {dt,metres:c.distance*this.track.length,speed:c.speed,throttle:c.throttle,brake:c.brake,steer:c.steer,headingError:Math.atan2(Math.sin(c.heading-heading),Math.cos(c.heading-heading)),curvature:a.angleTo(b)/20,lateralOffset:c.position.clone().sub(this.planner.point(c.progress)).dot(this.track.normal(c.progress)),offRoad:c.offRoad,impacts:c.impactSerial,boosting:c.boosting,energy:c.boost,gap:this.opponent?(this.opponent.distance-c.distance)*this.track.length:0};}
 private auto(car:Vehicle,dt:number,cap=65){const look=THREE.MathUtils.clamp(7+car.speed*.3,9,26),to=(this.lesson===3?this.track.point(car.progress+look/this.track.length).addScaledVector(this.track.normal(car.progress+look/this.track.length),car===this.car?-1.8:1.8):this.planner.point(car.progress+look/this.track.length)).sub(car.position),desired=Math.atan2(to.x,to.z),error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));const steer=THREE.MathUtils.clamp((angle-car.yawRate*.018)/steeringLock(car.speed,car.gripScale),-1,1),target=Math.min(cap,this.planner.speed(car.progress)*.85),difference=target-car.speed;car.drive(dt,{steer,throttle:THREE.MathUtils.clamp(difference/3,0,1),brake:THREE.MathUtils.clamp(-difference/4,0,1),boost:false});}
 present(alpha:number){if(this.opponent)this.opponentPose.present(this.opponent,alpha);}
 step(dt:number,input:Input){
  if(this.opponent)this.opponentPose.capture(this.opponent);
  const controls=this.controls(input);this.device=input.controlDevice??(input.analog()?'wheel':'keyboard');this.boostButton=input.wheel?.profile?.buttons.boost??null;
  this.inputValue=this.action==='steer'?Math.abs(controls.steer):this.action==='brake'?controls.brake:this.action==='boost'?(controls.boost?1:0):controls.throttle;
  if(this.phase==='success'){this.auto(this.car,dt);if(this.opponent)this.auto(this.opponent,dt,55);return;}if(this.phase==='failed')return;
  if(this.phase==='waiting'){if(!this.gate.update(controls.throttle>.25))return;this.phase='driving';this.judge=new LessonJudge(this.lesson,this.sample(0),this.apex,this.exit,this.target);}
  this.car.transmission.mode='auto';this.car.update(dt,input);if(this.opponent){this.auto(this.opponent,dt,55);resolveCollision(this.car,this.opponent);}
  this.judge!.update(this.sample(dt));if(this.judge!.success)this.phase='success';else if(this.judge!.failed)this.phase='failed';
  if(this.car.distance*this.track.length>this.apex+500&&!this.done){this.judge?.failAtEnd(this.sample(0));this.phase='failed';}
 }
 get status():TutorialStatus {
  const s=this.sample(0),to=this.planner.point(this.car.progress+30/this.track.length).sub(this.car.position),desired=Math.atan2(to.x,to.z),turn=Math.atan2(Math.sin(desired-this.car.heading),Math.cos(desired-this.car.heading)),direction=turn>=0?'left':'right',action=this.action,ready=this.phase==='waiting',distance=Math.max(0,this.cueAt-s.metres);
  const checkpoints=this.lesson===0?[{label:'140 km/h · 직진 유지',complete:this.done}]:this.lesson===1?[{label:'구간 제동',complete:this.judge?.braked??false},{label:'안전한 진입',complete:this.done}]:this.lesson===2?[{label:'제동',complete:this.judge?.braked??false},{label:'S자 연결',complete:this.judge?.entered??false},{label:'조향 풀기',complete:this.judge?.aligned??false},{label:'재가속',complete:this.done}]:[{label:'ERS 활용',complete:(this.judge?.usedEnergy??0)>=18||this.done},{label:'추월',complete:this.done}];
  const cue=this.done?'연습 완료':this.phase==='failed'?this.judge?.failed||'구간 앞에서 다시 연습하세요.':ready?'준비되면 출발하세요.':s.offRoad?'속도를 줄이고 코스로 돌아오세요.':this.lesson===0?'140 km/h까지 가속하며 차를 곧게 유지하세요.':this.lesson===3?((this.judge?.usedEnergy??0)<18?'가속하며 ERS로 추가 출력을 사용하세요.':'초록 차량을 완전히 지나가세요.'):(distance>0?`가속을 놓고 제동 구간까지 ${Math.round(distance)}m`:action==='brake'?'지금 제동하세요.':action==='steer'?'다음 코너를 보며 조향하고 출구에서 핸들을 풀어주세요.':'차가 곧게 서면 가속을 늘리세요.');
  return {lesson:this.lesson,phase:this.phase,speed:this.car.kmh,distance,gap:this.opponent?Math.round(s.gap):undefined,action,direction,device:this.device,inputValue:Math.round(this.inputValue*100)/100,ready,urgent:action==='brake'&&s.speed>this.target*1.35,releaseRequired:ready&&this.gate.needsRelease&&this.inputValue>.25,boostButton:this.boostButton,checkpoints,key:action==='steer'?`${direction==='left'?'A / ←':'D / →'} · 휠 조향`:action==='brake'?'S / ↓ · 브레이크 페달':action==='boost'?'W + Shift · 지정 버튼':action==='coast'?'W / ↑ 놓기 · 가속 해제':'W / ↑ · 가속 페달',cue};
 }
}
