export interface DrivingSample {dt:number;elapsed:number;speed:number;throttle:number;brake:number;steer:number;offRoad:boolean;impacts:number;distance:number;finished:boolean;position:number;fieldSize:number;bestLap:number}
export interface RunResult {seconds:number;offRoadSeconds:number;contacts:number;bestLap:number;position:number;score:number}
export interface CareerSave {version:1;kind:'apex-career';saveId:string;driver:{name:string;country:string;number:number};phase:'academy'|'assessment'|'offers'|'season';trained:boolean;assessment?:RunResult;team?:string;year:number;round:number;money:number;points:number;history:{year:number;round:number;position:number;points:number;reward:number;goalBonus?:number;result:RunResult}[]}
export const TEAMS=[{id:'atlas',name:'ATLAS RACING',style:'육성형',description:'안정적인 완주를 중시합니다. 첫 시즌은 경험을 쌓는 데 집중합니다.',bonus:12000,goalBonus:3000,target:'3경기 완주'}, {id:'vector',name:'VECTOR MOTORSPORT',style:'균형형',description:'기록과 안정성을 함께 평가합니다. 포인트 획득을 목표로 합니다.',bonus:16000,goalBonus:6000,target:'한 경기 이상 상위 4위'}, {id:'helix',name:'HELIX PERFORMANCE',style:'도전형',description:'높은 목표와 성과 보너스를 제안합니다. 포디움에 도전하세요.',bonus:18000,goalBonus:10000,target:'한 경기 이상 포디움'}] as const;
export const SEASON=[{circuit:'monza',name:'이탈리아 · 몬자'},{circuit:'silverstone',name:'영국 · 실버스톤'},{circuit:'spa',name:'벨기에 · 스파'}] as const;
const stamp=()=>globalThis.crypto.randomUUID();
export function newCareer(name:string,country:string,number:number):CareerSave {if(!name.trim()||name.trim().length>24||!country.trim()||country.length>40||!Number.isInteger(number)||number<2||number>99)throw Error('이름·국적과 2~99번 번호를 확인하세요.');return {version:1,kind:'apex-career',saveId:stamp(),driver:{name:name.trim(),country:country.trim(),number},phase:'academy',trained:false,year:1,round:0,money:0,points:0,history:[]};}
export function readCareer(value:unknown):CareerSave|null {
 if(!value||typeof value!=='object')return null;const s=value as CareerSave;
 if(s.version!==1||s.kind!=='apex-career'||typeof s.saveId!=='string'||!s.driver||typeof s.driver.name!=='string'||!s.driver.name.trim()||s.driver.name.length>24||typeof s.driver.country!=='string'||s.driver.country.length>40||!Number.isInteger(s.driver.number)||s.driver.number<2||s.driver.number>99)return null;
 if(!['academy','assessment','offers','season'].includes(s.phase)||typeof s.trained!=='boolean'||![s.year,s.round,s.money,s.points].every(Number.isSafeInteger)||s.year<1||s.round<0||s.round>3||s.money<0||s.points<0||!Array.isArray(s.history)||s.history.length>120)return null;
 const validResult=(r:RunResult)=>r&&[r.seconds,r.offRoadSeconds,r.contacts,r.bestLap,r.position,r.score].every(Number.isFinite)&&r.seconds>0&&r.offRoadSeconds>=0&&r.contacts>=0&&r.score>=0&&r.score<=100&&r.position>=1;
 if(s.assessment&&!validResult(s.assessment)||s.phase!=='academy'&&!s.trained||['offers','season'].includes(s.phase)&&!s.assessment||s.phase==='season'&&!TEAMS.some(t=>t.id===s.team))return null;
 if(!s.history.every(h=>h&&[h.year,h.round,h.position,h.points,h.reward].every(Number.isSafeInteger)&&h.year>0&&h.round>=0&&h.round<3&&h.position>0&&h.points>=0&&h.reward>=0&&(h.goalBonus===undefined||Number.isSafeInteger(h.goalBonus)&&h.goalBonus>=0)&&validResult(h.result)))return null;
 return structuredClone(s);
}
function change(save:CareerSave,patch:Partial<CareerSave>){return {...structuredClone(save),...patch,saveId:stamp()};}
export function completeTraining(s:CareerSave){if(s.phase!=='academy')throw Error('훈련 단계가 아닙니다.');return change(s,{trained:true,phase:'assessment'});}
export function assess(s:CareerSave,result:RunResult){if(s.phase!=='assessment')throw Error('평가 단계가 아닙니다.');return change(s,{assessment:result,phase:'offers'});}
export function signingBonus(s:CareerSave,team:typeof TEAMS[number]){return team.bonus+Math.round((s.assessment?.score??0)/100*8000);}
export function signContract(s:CareerSave,id:string){const team=TEAMS.find(t=>t.id===id);if(s.phase!=='offers'||!team)throw Error('현재 계약할 수 없습니다.');return change(s,{team:id,phase:'season',money:s.money+signingBonus(s,team)});}
export function finishRound(s:CareerSave,result:RunResult){
 if(s.phase!=='season'||s.round>=SEASON.length)throw Error('진행 중인 경기가 없습니다.');
 const points=[25,18,15,12,10,8][result.position-1]??0,team=TEAMS.find(t=>t.id===s.team)!;
 const positions=[...s.history.filter(h=>h.year===s.year).map(h=>h.position),result.position];
 const goal=team.id==='atlas'||positions.some(p=>p<=(team.id==='vector'?4:3));
 const goalBonus=s.round===2&&goal?team.goalBonus:0,reward=2000+points*200+(result.contacts===0?1000:0)+goalBonus;
 return change(s,{round:s.round+1,points:s.points+points,money:s.money+reward,history:[...s.history,{year:s.year,round:s.round,position:result.position,points,reward,goalBonus,result}].slice(-120)});
}
export function nextSeason(s:CareerSave){if(s.phase!=='season'||s.round!==3)throw Error('시즌을 먼저 마치세요.');return change(s,{year:s.year+1,round:0,points:0});}
/** Read-only telemetry: no input injection or vehicle physics changes. */
export class AcademyRun {
 accelerated=false;braked=false;exited=false;turnSeconds=0;offRoadSeconds=0;contacts=0;seconds=0;retryHint='';private retryUntil=0;private lastImpacts=0;
 get lesson(){return !this.accelerated?0:!this.braked?1:this.turnSeconds<2?2:!this.exited?3:4;}
 update(s:DrivingSample){this.seconds+=s.dt;this.offRoadSeconds+=s.offRoad?s.dt:0;const impact=s.impacts>this.lastImpacts;this.contacts+=Math.max(0,s.impacts-this.lastImpacts);this.lastImpacts=s.impacts;
  // Only the current lesson can advance; off-track input never completes a task.
  if(s.offRoad||impact){this.retryHint=s.offRoad?'코스로 돌아오면 과제를 계속합니다.':this.lesson===2?'접촉했습니다. 2초 조향을 다시 시도하세요.':'접촉했습니다. 안전하게 과제를 계속하세요.';this.retryUntil=this.seconds+2;if(this.lesson===2)this.turnSeconds=0;return;}
  if(this.seconds>=this.retryUntil)this.retryHint='';
  switch(this.lesson){
   case 0:if(s.speed>=80/3.6&&s.throttle>.4)this.accelerated=true;break;
   case 1:if(s.speed<40/3.6&&s.brake>.3)this.braked=true;break;
   case 2:if(s.speed>20/3.6&&s.speed<130/3.6&&Math.abs(s.steer)>.15)this.turnSeconds=Math.min(2,this.turnSeconds+s.dt);break;
   case 3:if(s.speed>=100/3.6&&s.throttle>.4&&Math.abs(s.steer)<.18)this.exited=true;break;
  }
 }
 get trained(){return this.exited;}
 result(s:DrivingSample):RunResult {const seconds=Math.max(.01,s.elapsed),timeScore=Math.max(0,Math.min(100,100-(seconds-85)*.65)),penalty=this.offRoadSeconds*1.5+this.contacts*10;return {seconds,offRoadSeconds:Math.round(this.offRoadSeconds*10)/10,contacts:this.contacts,bestLap:s.bestLap||seconds,position:s.position,score:Math.round(Math.max(0,Math.min(100,timeScore-penalty)))};}
}

export const ACADEMY_LESSONS=[
 {title:'직선에서 가속',target:'80 km/h',hint:'W / ↑ 또는 가속 페달',cue:'차를 곧게 유지하며 가속하세요.'},
 {title:'브레이크로 감속',target:'40 km/h 이하',hint:'S / ↓ 또는 브레이크 페달',cue:'가속을 놓고 브레이크를 밟으세요.'},
 {title:'코너에서 조향',target:'코스 안 조향 2초',hint:'A / D 또는 스티어링 휠',cue:'20~130 km/h에서 코너를 따라 조향하세요.'},
 {title:'코너 탈출 · 재가속',target:'100 km/h',hint:'조향을 풀고 가속',cue:'차를 곧게 세운 뒤 다시 가속하세요.'}
] as const;
export function academyFeedback(run:AcademyRun,s?:DrivingSample){
 const index=Math.min(run.lesson,3),lesson=ACADEMY_LESSONS[index],speed=Math.max(0,(s?.speed??0)*3.6);
 const progress=run.trained?1:index===0?speed/80:index===1?(80-speed)/40:index===2?run.turnSeconds/2:speed/100;
 return {index,...lesson,progress:Math.max(0,Math.min(1,progress)),value:index===2?`${run.turnSeconds.toFixed(1)} / 2초`:`${Math.round(speed)} km/h`,feedback:s?.offRoad?'코스로 돌아오면 과제를 계속합니다.':run.retryHint||lesson.cue};
}
