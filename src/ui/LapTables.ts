import {formatTime,type RaceStanding} from '../game/RaceLaps';
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export const displayLap=(time:number|null|undefined)=>time!=null&&time>0?formatTime(time):'—';
export const sameLap=(a:number|null|undefined,b:number|null|undefined)=>a!=null&&b!=null&&Math.round(a*1000)===Math.round(b*1000);
export function resultTable(rows:readonly RaceStanding[]){
  const times=rows.flatMap(row=>row.best===null?[]:[row.best]),fastest=times.length?Math.min(...times):null,leader=rows.find(row=>row.finish!==null)?.finish;
  return rows.map(row=>{
    const gap=row.finish!==null&&leader!=null&&row.position>1?`+${(row.finish-leader).toFixed(3)}s`:row.finish!==null?'1위':'미완료';
    return `<tr class="${row.id==='PLAYER'?'is-player':''}"><td>${String(row.position).padStart(2,'0')}</td><th scope="row">${escape(row.name)}${row.id==='PLAYER'?'<small>나</small>':''}</th>${[1,2,3].map(number=>{const time=row.lapTimes.find(lap=>lap.lap===number)?.seconds;return `<td class="${sameLap(time,fastest)?'session-fastest':''}">${displayLap(time)}</td>`;}).join('')}<td class="${sameLap(row.best,fastest)?'session-fastest':''}">${displayLap(row.best)}</td><td class="finish-cell"><b>${row.finish===null?`${row.completed} / 3랩`:formatTime(row.finish)}</b><small>${gap}</small></td></tr>`;
  }).join('');
}
export function playerLapCards(player:RaceStanding|undefined){
  return [1,2,3].map(number=>{
    const time=player?.lapTimes.find(lap=>lap.lap===number)?.seconds,best=player?.best;
    const detail=time==null?'완료 기록 없음':sameLap(time,best)?'이번 레이스 베스트':`베스트 대비 +${(time-(best??time)).toFixed(3)}s`;
    return `<div class="player-lap ${sameLap(time,best)?'is-best':''}"><span>LAP ${String(number).padStart(2,'0')}${number===1?'<small>출발 포함</small>':''}</span><b>${displayLap(time)}</b><small>${detail}</small></div>`;
  }).join('');
}
export function fastestLapLabel(rows:readonly RaceStanding[]){
  const fastest=rows.filter(row=>row.best!==null).sort((a,b)=>a.best!-b.best!)[0];
  return fastest?`${fastest.name} · ${formatTime(fastest.best)}`:'완료된 랩 없음';
}
