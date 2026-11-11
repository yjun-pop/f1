import {SEASON} from './Calendar';
import {DRIVER_PROFILES} from '../game/RaceRoster';
import type {CareerSave} from './Career';
import type {RaceStanding} from '../game/RaceLaps';

export const CAREER_ROSTER=[{id:'PLAYER',name:'플레이어'},...DRIVER_PROFILES.slice(0,5).map(p=>({id:`ai:${p.name.toLowerCase()}`,name:p.name}))];
export const SEASON_POINTS=[25,18,15,12,10,8] as const;
export interface SeasonEntry {id:string;position:number;points:number;completed:number;finish:number|null;best:number|null}
export interface SeasonRace {year:number;round:number;entries:SeasonEntry[]}
type ClassifiedCar=Pick<RaceStanding,'id'|'position'|'completed'|'finish'|'best'>;

/** Store measured classification; trailing cars retain a null finish time. */
export function captureSeasonRace(year:number,round:number,rows:readonly ClassifiedCar[],playerPosition:number):SeasonRace {
  const validTime=(n:number|null)=>n===null||Number.isFinite(n)&&n>0;
  if(rows.length!==CAREER_ROSTER.length||new Set(rows.map(r=>r.id)).size!==rows.length||
    new Set(rows.map(r=>r.position)).size!==rows.length||!rows.every(r=>
      CAREER_ROSTER.some(p=>p.id===r.id)&&Number.isInteger(r.position)&&r.position>=1&&r.position<=6&&
      Number.isInteger(r.completed)&&r.completed>=0&&r.completed<=3&&validTime(r.finish)&&validTime(r.best)&&
      (r.finish===null?r.completed<3:r.completed===3))||
    rows.find(r=>r.id==='PLAYER')?.position!==playerPosition||rows.find(r=>r.id==='PLAYER')?.finish===null)throw Error('전체 차량의 경기 결과를 확인하지 못했습니다.');
  return {year,round,entries:rows.map(r=>({id:r.id,position:r.position,points:SEASON_POINTS[r.position-1],completed:r.completed,finish:r.finish,best:r.best})).sort((a,b)=>a.position-b.position)};
}

export function validChampionship(value:unknown,history:CareerSave['history']){
  if(value===undefined)return true;
  if(!Array.isArray(value)||value.length>120)return false;
  const keys=new Set<string>();
  return value.every((r:SeasonRace)=>{
    if(!r||!Number.isInteger(r.year)||r.year<1||!Number.isInteger(r.round)||r.round<0||r.round>=SEASON.length||!Array.isArray(r.entries))return false;
    const key=`${r.year}:${r.round}`;
    if(keys.has(key))return false;
    keys.add(key);
    const player=history.find(h=>h.year===r.year&&h.round===r.round);
    if(!player||player.points!==SEASON_POINTS[player.position-1])return false;
    try{captureSeasonRace(r.year,r.round,r.entries,player.position);}catch{return false;}
    return r.entries.every(e=>e.points===SEASON_POINTS[e.position-1]);
  });
}

export function seasonStandings(save:CareerSave,rounds=save.round){
  const races=(save.championship??[]).filter(r=>r.year===save.year&&r.round<rounds);
  const complete=races.length===rounds,history=save.history.filter(h=>h.year===save.year&&h.round<rounds);
  const rows=CAREER_ROSTER.map(driver=>{
    const results=races.flatMap(r=>r.entries.filter(e=>e.id===driver.id));
    return {...driver,name:driver.id==='PLAYER'?save.driver.name:driver.name,
      points:driver.id==='PLAYER'?history.reduce((s,h)=>s+h.points,0):results.reduce((s,e)=>s+e.points,0),
      counts:Array.from({length:6},(_,i)=>results.filter(e=>e.position===i+1).length),rank:null as number|null,tied:false,results};
  });
  const compare=(a:typeof rows[number],b:typeof rows[number])=>b.points-a.points||a.counts.reduce((d,n,i)=>d||b.counts[i]-n,0);
  rows.sort((a,b)=>compare(a,b)||CAREER_ROSTER.findIndex(p=>p.id===a.id)-CAREER_ROSTER.findIndex(p=>p.id===b.id));
  // A stable display order is not a sporting tiebreak. Identical results share rank.
  if(complete&&rounds>0)rows.forEach((row,i)=>{
    row.rank=i&&compare(rows[i-1],row)===0?rows[i-1].rank:i+1;
    row.tied=rows.some(other=>other!==row&&compare(other,row)===0);
  });
  return {rows,complete,races};
}

export function seasonMovement(save:CareerSave,id='PLAYER'){
  const after=seasonStandings(save),before=seasonStandings(save,Math.max(0,save.round-1));
  const now=after.rows.find(r=>r.id===id)!,previous=before.rows.find(r=>r.id===id)!;
  return now.rank===null?'집계 대기':previous.rank===null?'첫 집계':previous.rank>now.rank?`↑ ${previous.rank-now.rank}`:previous.rank<now.rank?`↓ ${now.rank-previous.rank}`:'유지';
}

/** Adjacent championship positions, including shared ranks; no invented legacy gaps. */
export function championshipRivals(save:CareerSave){
  const table=seasonStandings(save);
  if(!table.complete||save.round===0)return [];
  const index=table.rows.findIndex(r=>r.id==='PLAYER');
  return table.rows.filter(r=>r.id!=='PLAYER').sort((a,b)=>
    Math.abs(table.rows.indexOf(a)-index)-Math.abs(table.rows.indexOf(b)-index)||
    Math.abs(a.points-save.points)-Math.abs(b.points-save.points)).slice(0,2);
}
