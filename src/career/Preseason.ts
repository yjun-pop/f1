import type {CareerSave,DrivingSample} from './Career';
export interface PreseasonReport {year:number;circuit:'monza';seconds:number;contacts:number;offRoadSeconds:number;observedCorners:number;brakingCorners:number;cleanExits:number}
export function validPreseason(reports:CareerSave['preseason'],year:number){
 if(reports===undefined)return true;if(!Array.isArray(reports)||reports.length>12||new Set(reports.map(r=>r?.year)).size!==reports.length)return false;
 return reports.every(r=>r&&Number.isInteger(r.year)&&r.year>=1&&r.year<=year&&r.circuit==='monza'&&Number.isFinite(r.seconds)&&r.seconds>0&&r.seconds<=86400&&Number.isInteger(r.contacts)&&r.contacts>=0&&Number.isFinite(r.offRoadSeconds)&&r.offRoadSeconds>=0&&r.offRoadSeconds<=r.seconds&&[r.observedCorners,r.brakingCorners,r.cleanExits].every(n=>Number.isInteger(n)&&n>=0&&n<=11)&&r.brakingCorners<=r.observedCorners&&r.cleanExits<=r.observedCorners);
}
export const currentPreseason=(save:CareerSave)=>save.preseason?.find(r=>r.year===save.year);
export function preseasonFeedback(r:PreseasonReport){
 if(r.contacts>0)return {title:'접촉을 줄이는 주행',evidence:`접촉 ${r.contacts}회 · 코스 이탈 ${r.offRoadSeconds.toFixed(1)}초`,goal:'차간 거리를 확보하며 완주'};
 if(r.offRoadSeconds>1)return {title:'코스 안에서 속도 조절',evidence:`코스 이탈 ${r.offRoadSeconds.toFixed(1)}초`,goal:'코너 진입 전에 충분히 감속'};
 if(r.observedCorners>=3&&r.brakingCorners<Math.ceil(r.observedCorners/2))return {title:'코너 진입 제동에 집중',evidence:`관측 ${r.observedCorners}개 코너 중 제동 확인 ${r.brakingCorners}곳`,goal:'제동 구간에서 감속 후 코너 진입'};
 if(r.observedCorners>=3&&r.cleanExits<Math.ceil(r.observedCorners/2))return {title:'출구에서 조향을 풀고 가속',evidence:`관측 ${r.observedCorners}개 코너 중 안정된 탈출 ${r.cleanExits}곳`,goal:'출구 방향을 확보한 뒤 가속'};
 return {title:'안전한 완주를 이어가기',evidence:`접촉 ${r.contacts}회 · 코스 이탈 ${r.offRoadSeconds.toFixed(1)}초`,goal:'차분하게 한 코너씩 연결'};
}
/** One completed lap supplies observations, not a skill-growth or consistency rating. */
export class PreseasonRun{
 private contacts=0;private offRoad=0;private lastImpact=0;private previousSection?:number;private previousDistance?:number;
 private seen=new Set<number>();private brake=new Map<number,number>();private exit=new Map<number,number>();
 update(s:DrivingSample){
  if(!Number.isFinite(s.dt)||s.dt<=0||s.dt>1)return;
  const impact=s.impacts>this.lastImpact;this.contacts+=Math.max(0,s.impacts-this.lastImpact);this.lastImpact=s.impacts;this.offRoad+=s.offRoad?s.dt:0;
  const g=s.guide;if(!g||![g.section,g.currentSection].every(n=>Number.isInteger(n)&&n>=1&&n<=11))return;
  if(this.previousSection!==undefined&&g.currentSection!==this.previousSection&&this.previousDistance!==undefined&&s.distance>this.previousDistance&&!s.offRoad&&!impact)this.seen.add(g.currentSection);
  this.previousSection=g.currentSection;this.previousDistance=s.distance;
  if(s.offRoad||impact)return;
  if(g.distance>=0&&g.distance<160&&s.brake>.25&&s.speed>8)this.brake.set(g.section,(this.brake.get(g.section)??0)+s.dt);
  if(this.seen.has(g.currentSection)&&(g.sinceSection??Infinity)>=20&&(g.sinceSection??Infinity)<180&&s.throttle>.4&&Math.abs(s.steer)<.3&&s.speed>12)this.exit.set(g.currentSection,(this.exit.get(g.currentSection)??0)+s.dt);
 }
 finish(year:number,s:DrivingSample):PreseasonReport{
  if(!s.finished||!Number.isFinite(s.elapsed)||s.elapsed<=0)throw Error('한 랩을 완료한 뒤 기록할 수 있습니다.');
  return {year,circuit:'monza',seconds:s.elapsed,contacts:this.contacts,offRoadSeconds:Math.min(s.elapsed,Math.round(this.offRoad*10)/10),observedCorners:this.seen.size,brakingCorners:[...this.seen].filter(i=>(this.brake.get(i)??0)>=.25).length,cleanExits:[...this.seen].filter(i=>(this.exit.get(i)??0)>=.4).length};
 }
}
