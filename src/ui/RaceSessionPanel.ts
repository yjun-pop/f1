import {formatTime,type RaceStanding} from '../game/RaceLaps';
import {fastestLapLabel,playerLapCards,resultTable} from './LapTables';
/** Race results/ready state only. Circuit selection belongs to the main screen. */
export function raceSessionMarkup(){
  return `<section id="race-session-panel" class="race-session-panel" role="dialog" aria-modal="true" aria-labelledby="race-session-title">
    <div class="race-session-brand">Λ <span>APEX FORMULA</span></div>
    <p class="race-session-circuit" id="race-session-circuit"></p>
    <h2 id="race-session-title" tabindex="-1">출발 준비</h2>
    <p id="race-session-record" class="race-session-record" hidden></p>
    <div class="race-session-results" id="race-session-results" hidden>
      <div><span>최종 순위</span><b id="race-session-position">—</b><small>/ <span id="driver-count">12</span>대</small></div>
      <div><span>레이스 시간</span><b id="race-session-time">—</b></div>
      <div><span>이번 레이스 베스트</span><b id="race-session-best">—</b></div>
      <div><span>개인 최고 대비</span><b id="race-session-delta">—</b><small id="race-session-previous"></small></div>
    </div>
    <div id="race-session-details" class="race-session-details" hidden>
      <div class="race-fastest"><span>전체 패스티스트 랩</span><b id="race-session-fastest"></b></div>

      <section aria-labelledby="race-classification-title"><h3 id="race-classification-title">전체 차량 결과</h3><p class="table-scroll-hint">좌우로 밀어 전체 랩 기록을 확인하세요.</p><div class="result-table-scroll" tabindex="0" role="region" aria-label="전체 차량 랩 기록 표"><table class="result-classification"><thead id="race-session-columns"><tr><th scope="col">순위</th><th scope="col">차량</th><th scope="col">LAP 01</th><th scope="col">LAP 02</th><th scope="col">LAP 03</th><th scope="col">최고 랩</th><th scope="col">완주 시간 / 진행</th></tr></thead><tbody id="race-session-classification"></tbody></table></div><p class="race-result-note" id="race-session-note"></p></section>
      <section aria-labelledby="player-laps-title"><h3 id="player-laps-title">내 랩 기록</h3><div class="player-laps" id="race-session-laps"></div></section>
    </div>
    <label class="race-session-gearbox" id="race-session-gearbox">변속 방식<select id="start-transmission"><option value="auto">자동 변속</option><option value="manual">수동 변속 · Q / E</option></select></label>
    <div class="race-session-actions"><button type="button" id="race-session-start">레이스 시작</button><button type="button" id="race-session-menu">서킷 선택</button></div>
    <p id="race-session-status" role="status" hidden></p>
  </section>`;
}
export class RaceSessionPanel {
  private finished=false;private loading=false;private launched=false;
  constructor(private root:HTMLElement,private actions:{start:()=>void;restart:()=>void;menu:()=>void}){
    this.node('race-session-start').addEventListener('click',()=>this.start());
    this.node('race-session-menu').addEventListener('click',()=>{if(!this.loading&&!this.launched)this.actions.menu();});
    this.node('overlay').addEventListener('keydown',event=>{
      if((event.target as HTMLElement)?.closest?.('.result-table-scroll')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){event.stopPropagation();return;}
      if(event.key!=='Tab')return;
      const controls=Array.from(this.root.querySelectorAll<HTMLElement>('#overlay button:not(:disabled),#overlay select,#overlay [tabindex="0"]')).filter(node=>!node.closest('[hidden]'));
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
  }
  private node(id:string){return this.root.querySelector<HTMLElement>('#'+id)!;}
  private unlock(){
    this.loading=this.launched=false;this.node('race-session-status').hidden=true;
    for(const id of['race-session-start','race-session-menu'])(this.node(id) as HTMLButtonElement).disabled=false;
  }
  ready(label:string){
    this.unlock();this.finished=false;this.node('race-session-circuit').textContent=label;
    this.node('race-session-title').textContent='출발 준비';this.node('race-session-start').textContent='레이스 시작';
    this.node('race-session-results').hidden=true;this.node('race-session-details').hidden=true;this.node('race-session-record').hidden=true;this.node('race-session-panel').classList.toggle('has-results',false);this.node('race-session-gearbox').hidden=false;
  }
  result(label:string,position:number,fieldSize:number,elapsed:string,best:string,report?:{rows:readonly RaceStanding[];previousBest:number;totalLaps?:number}){
    this.unlock();this.finished=true;this.node('race-session-circuit').textContent=label;
    this.node('race-session-title').textContent='레이스 완료';this.node('race-session-start').textContent='다시 레이스';
    this.node('race-session-position').textContent=`P${String(position).padStart(2,'0')}`;this.node('driver-count').textContent=String(fieldSize);
    this.node('race-session-time').textContent=elapsed;this.node('race-session-best').textContent=best;
    const rows=report?.rows??[],player=rows.find(row=>row.id==='PLAYER'),previous=report?.previousBest??0,raceBest=player?.best;
    const delta=raceBest!=null&&previous>0?(Math.round(raceBest*1000)-Math.round(previous*1000))/1000:null,newRecord=raceBest!=null&&(!previous||Math.round(raceBest*1000)<Math.round(previous*1000));
    this.node('race-session-delta').textContent=delta===null?(raceBest==null?'—':'첫 기록'):delta===0?'동일 기록':`${delta<0?'−':'+'}${Math.abs(delta).toFixed(3)}s`;
    this.node('race-session-previous').textContent=previous>0?`이전 ${formatTime(previous)}`:'';
    this.node('race-session-delta').classList.toggle('is-improved',delta!==null&&delta<0);
    this.node('race-session-record').hidden=!newRecord;this.node('race-session-record').textContent=previous>0?'새 개인 최고 기록':'첫 랩 기록 저장';
    this.node('race-session-fastest').textContent=fastestLapLabel(rows);this.node('race-session-laps').innerHTML=playerLapCards(player,report?.totalLaps??3);
    this.node('race-session-columns').innerHTML='<tr><th scope="col">순위</th><th scope="col">차량</th>'+Array.from({length:report?.totalLaps??3},(_,i)=>`<th scope="col">LAP ${String(i+1).padStart(2,'0')}</th>`).join('')+'<th scope="col">최고 랩</th><th scope="col">완주 시간 / 진행</th></tr>';
    this.node('race-session-classification').innerHTML=resultTable(rows,report?.totalLaps??3);
    this.node('race-session-note').textContent=rows.some(row=>row.finish===null)?'플레이어 완주 시점 기준 · 미완료 차량은 진행 거리순으로 분류합니다.':`모든 차량이 ${report?.totalLaps??3}랩을 완주했습니다.`;
    this.node('race-session-details').hidden=rows.length===0;this.node('race-session-panel').classList.toggle('has-results',rows.length>0);
    this.node('race-session-results').hidden=false;this.node('race-session-gearbox').hidden=true;this.node('race-session-title').focus({preventScroll:true});
  }
  start(){
    if(this.loading||this.launched)return;this.launched=true;
    (this.node('race-session-start') as HTMLButtonElement).disabled=true;
    if(this.root.contains?.(document.activeElement))(document.activeElement as HTMLElement)?.blur();
    if(this.finished)this.actions.restart();else this.actions.start();
  }
  loadingScreen(label:string){
    this.loading=true;this.node('overlay').hidden=false;this.node('race-session-title').textContent='화면 전환 중';
    this.node('race-session-results').hidden=true;this.node('race-session-details').hidden=true;this.node('race-session-record').hidden=true;this.node('race-session-panel').classList.toggle('has-results',false);this.node('race-session-gearbox').hidden=true;
    this.node('race-session-status').hidden=false;this.node('race-session-status').textContent=`${label} · 화면을 준비하고 있습니다…`;
    for(const id of['race-session-start','race-session-menu'])(this.node(id) as HTMLButtonElement).disabled=true;
  }
}
