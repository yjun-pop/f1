export const ACADEMY_TESTS=[
 {title:'직선 가속',goal:'몬자 직선에서 250 km/h 이상 가속',key:'W / ↑ · 가속 페달',instruction:'차를 곧게 유지하며 가속을 이어가세요.',action:'가속',code:'throttle'},
 {title:'코너 진입',goal:'제동 구간에서 감속하고 코너에 진입',key:'S / ↓ · 브레이크 페달',instruction:'표시 지점에서 제동하고, 속도가 줄면 브레이크를 놓으며 코너 방향으로 조향하세요.',action:'제동',code:'brake'},
 {title:'코너 탈출',goal:'출구 방향으로 조향을 풀며 재가속',key:'W / ↑ · 가속 페달',instruction:'안쪽 정점을 지난 뒤 출구를 향하세요. 차가 직선 방향에 가까워질수록 조향을 풀고 가속을 늘리세요.',action:'가속',code:'throttle'},
 {title:'ERS 활용',goal:'직선에서 ERS를 사용해 연습 차량 추월',key:'W + Shift · 가속 페달 + 지정 버튼',instruction:'ERS는 저장한 에너지로 추가 출력을 냅니다. 코너를 빠져나와 차가 곧게 섰을 때 사용하면 추월에 유리합니다.',action:'ERS',code:'boost'}
] as const;
export type TutorialPhase='approach'|'waiting'|'driving'|'success'|'failed';
export interface TutorialStatus {lesson:number;phase:TutorialPhase;cue:string;key:string;speed:number;distance:number;gap?:number}
/** A fresh press is required: holding an action before the cue cannot skip it. */
export class ActionGate {
 private released=false;
 update(active:boolean){if(!active)this.released=true;return this.released&&active;}
}
export interface LessonSample {dt:number;metres:number;speed:number;throttle:number;brake:number;steer:number;headingError:number;curvature:number;offRoad:boolean;impacts:number;boosting:boolean;energy:number;gap:number}
/** Test scoring uses measured motion, controls and contacts, never just speed loss. */
export class LessonJudge {
 success=false;failed='';private braking=0;private gas=0;private energy=0;private fast=0;
 constructor(readonly lesson:number,private start:LessonSample,readonly apex:number,readonly exit:number,readonly target:number){}
 update(s:LessonSample){
  if(this.success||this.failed)return;
  if(s.offRoad||s.impacts>this.start.impacts){this.failed=s.offRoad?'트랙을 벗어났습니다. 다시 시도하세요.':'접촉했습니다. 벽이나 차량으로 감속하면 성공으로 인정하지 않습니다.';return;}
  if(s.metres<this.start.metres-8||Math.abs(s.metres-this.start.metres)>1300){this.failed='훈련 구간을 벗어났습니다.';return;}
  if(this.lesson===0){this.fast=s.speed>=250/3.6&&s.throttle>.4?this.fast+s.dt:0;this.success=this.fast>=.2;}
  if(this.lesson===1){
   if(s.metres>=this.start.metres-2&&s.metres<=this.apex+20&&s.brake>.25)this.braking+=s.dt;
   this.success=this.braking>=.2&&this.start.speed-s.speed>=7&&s.speed>=7&&s.speed<=this.target*1.35&&s.metres>=this.apex-35&&s.metres<=this.apex+90&&s.curvature>.001&&Math.abs(s.steer)>.06&&Math.abs(s.headingError)<.45;
   if(s.metres>this.apex+110)this.failed='제동 후 코너에 진입하는 동작을 다시 연습하세요.';
  }
  if(this.lesson===2){
   if(s.metres>=this.exit&&s.throttle>.45&&Math.abs(s.headingError)<.2&&Math.abs(s.steer)<.4)this.gas+=s.dt;
   this.success=this.gas>=.6&&s.metres>this.exit+45&&s.speed>=this.start.speed+5&&Math.abs(s.headingError)<.16;
  }
  if(this.lesson===3){if(s.boosting)this.energy+=Math.max(0,this.start.energy-s.energy-this.energy);this.success=this.energy>=18&&s.gap< -5&&s.throttle>.4&&Math.abs(s.headingError)<.16;}
 }
}
