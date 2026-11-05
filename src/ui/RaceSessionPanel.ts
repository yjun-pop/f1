/** Race results/ready state only. Circuit selection belongs to the main screen. */
export function raceSessionMarkup(){
  return `<section class="race-session-panel" role="dialog" aria-modal="true" aria-labelledby="race-session-title">
    <div class="race-session-brand">Λ <span>APEX FORMULA</span></div>
    <p class="race-session-circuit" id="race-session-circuit"></p>
    <h2 id="race-session-title">출발 준비</h2>
    <div class="race-session-results" id="race-session-results" hidden>
      <div><span>최종 순위</span><b id="race-session-position">—</b><small>/ <span id="driver-count">12</span>대</small></div>
      <div><span>레이스 시간</span><b id="race-session-time">—</b></div>
      <div><span>베스트 랩</span><b id="race-session-best">—</b></div>
    </div>
    <label class="race-session-gearbox" id="race-session-gearbox">변속 방식<select id="start-transmission"><option value="auto">자동 변속</option><option value="manual">수동 변속 · Q / E</option></select></label>
    <div class="race-session-actions"><button type="button" id="race-session-start">레이스 시작</button><button type="button" id="race-session-menu">메인 화면</button></div>
    <p id="race-session-status" role="status" hidden></p>
  </section>`;
}
export class RaceSessionPanel {
  private finished=false;private loading=false;private launched=false;
  constructor(private root:HTMLElement,private actions:{start:()=>void;restart:()=>void;menu:()=>void}){
    this.node('race-session-start').addEventListener('click',()=>this.start());
    this.node('race-session-menu').addEventListener('click',()=>{if(!this.loading&&!this.launched)this.actions.menu();});
    this.node('overlay').addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=Array.from(this.root.querySelectorAll<HTMLElement>('#overlay button:not(:disabled),#overlay select')).filter(node=>!node.closest('[hidden]'));
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
    this.node('race-session-results').hidden=true;this.node('race-session-gearbox').hidden=false;
  }
  result(label:string,position:number,fieldSize:number,elapsed:string,best:string){
    this.unlock();this.finished=true;this.node('race-session-circuit').textContent=label;
    this.node('race-session-title').textContent='레이스 완료';this.node('race-session-start').textContent='다시 레이스';
    this.node('race-session-position').textContent=`P${String(position).padStart(2,'0')}`;this.node('driver-count').textContent=String(fieldSize);
    this.node('race-session-time').textContent=elapsed;this.node('race-session-best').textContent=best;
    this.node('race-session-results').hidden=false;this.node('race-session-gearbox').hidden=true;
  }
  start(){
    if(this.loading||this.launched)return;this.launched=true;
    (this.node('race-session-start') as HTMLButtonElement).disabled=true;
    if(this.root.contains?.(document.activeElement))(document.activeElement as HTMLElement)?.blur();
    if(this.finished)this.actions.restart();else this.actions.start();
  }
  loadingScreen(label:string){
    this.loading=true;this.node('overlay').hidden=false;this.node('race-session-title').textContent='화면 전환 중';
    this.node('race-session-results').hidden=true;this.node('race-session-gearbox').hidden=true;
    this.node('race-session-status').hidden=false;this.node('race-session-status').textContent=`${label} · 화면을 준비하고 있습니다…`;
    for(const id of['race-session-start','race-session-menu'])(this.node(id) as HTMLButtonElement).disabled=true;
  }
}
