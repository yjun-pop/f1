import {openSettings,confirmRaceAction,applyHUDScale} from './Settings';
import {proximityCues} from './BattleAwareness';
import {Vehicle} from '../game/Vehicle';
import {transmissionMode,type TransmissionMode} from '../game/Powertrain';
import {Track} from '../game/Track';
import type {CircuitId} from '../game/Circuits';
import {RaceSessionPanel,raceSessionMarkup} from './RaceSessionPanel';
import {Race,formatTime} from '../game/Race';
import {type GraphicsMode,type GraphicsTier} from '../game/Graphics';
import {DEFAULT_FIELD_SIZE} from '../game/RaceRoster';
import {formatInterval} from '../game/RaceTiming';
export class HUD {
  private root:HTMLElement;
  private proximityRoot:HTMLElement;
  private proximityMarkers=new Map<string,HTMLElement>();
  private map:CanvasRenderingContext2D;
  private path:Path2D;
  private raceActive=false;private wasPaused=false;private session:RaceSessionPanel;private sessionState='';
  private textNodes=new Map<string,Element>();
  private mapPoint:(p:{x:number;z:number})=>{x:number;y:number};
  constructor(root:HTMLElement,track:Track,actions:{start:(id:CircuitId)=>void,restart:()=>void,camera:()=>void;resume:()=>void;recover:()=>void;volume:(value:number)=>void;audioLevel:number;motionLevel:number;motion:(value:number)=>void;graphicsMode:GraphicsMode;graphicsTier:GraphicsTier;graphics:(mode:GraphicsMode)=>void;transmissionMode?:TransmissionMode;transmission?:(mode:TransmissionMode)=>void;menu?:()=>void;wheel?:()=>void}) {
    this.root=root;
    root.innerHTML=`<header><div class="brand"><i>Λ</i> APEX<span>FORMULA</span><small>OPEN WHEEL RACING / 01</small></div><div class="session"><b>${track.name} · ${track.country}</b><small>RACE · 3 LAPS · DRY · ${track.circuit?.night?'NIGHT':'DAYLIGHT'}</small></div></header>
    <div class="rearview-frame" role="img" aria-label="차량 뒤쪽 실시간 백미러"><div id="rearview-viewport"></div><span>REAR VIEW</span></div>
    <aside class="timing"><div class="eyebrow">레이스 순위</div><div class="position"><strong id="position">${DEFAULT_FIELD_SIZE}</strong><span>/ <b id="field-size">${DEFAULT_FIELD_SIZE}</b><small>순위</small></span></div><div class="intervals" aria-label="앞뒤 차량 시간 차"><div class="interval-row"><span>앞차 <b id="gap-ahead-name">—</b></span><strong id="gap-ahead">—</strong></div><div class="interval-row"><span>뒤차 <b id="gap-behind-name">—</b></span><strong id="gap-behind">—</strong></div></div><div class="timingrow"><span>LAP</span><b id="lap">1 / 3</b></div><div class="timingrow"><span>현재 랩</span><b id="current"></b></div><div class="timingrow"><span>이전 랩</span><b id="last"></b></div><div class="timingrow best"><span title="개인 최고 랩">최고 랩</span><b id="best"></b></div></aside>
    <div class="mapbox"><canvas id="map" width="240" height="190"></canvas><span>${track.name} · ${track.country} · ${(track.length/1000).toFixed(2)} KM</span></div>
<div class="aero-status" aria-label="DRS와 슬립스트림 상태"><b id="drs-status">DRS · 선두 첫 랩 후</b><span id="draft-status"></span></div><div id="warning"></div><div id="proximity-ring" class="proximity-ring" hidden role="group" aria-label="주변 차량 접근 방향"></div><div id="wheel-notice" class="wheel-input-notice" role="status" hidden></div><footer><span id="gearbox-label">자동</span><span id="audio-state"></span><button id="camera">시점 변경 · C</button><button id="hud-settings">설정 / 도움말</button><button id="restart">다시 시작</button></footer>
    <div class="overlay race-session-overlay" id="overlay" hidden>${raceSessionMarkup()}</div>
    <div class="pause-shade" id="pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden><section class="pause-panel"><div class="eyebrow">APEX FORMULA / SESSION CONTROL</div><h2 id="pause-title">일시정지</h2><p>레이스와 랩 타이머가 멈췄습니다.</p><button id="resume" class="primary">레이스 계속 <span>ESC →</span></button><button id="recover">트랙으로 복귀 후 계속</button><button type="button" id="pause-settings">설정 <span>→</span></button><p id="controller-state" role="status"></p><button id="change-circuit" class="secondary">다른 서킷 선택 <span>→</span></button><p class="change-circuit-hint">현재 레이스를 종료하고 서킷 선택 화면으로 돌아갑니다.</p><button id="pause-restart" class="secondary">레이스 다시 시작</button></section></div>`;
    const restartRace=()=>{(document.activeElement as HTMLElement)?.blur?.();const restart=()=>{actions.restart();actions.start(track.circuit.id);};if(this.raceActive)confirmRaceAction('레이스를 다시 시작할까요?',restart);else restart();};
    root.querySelector('#restart')!.addEventListener('click',restartRace);root.querySelector('#camera')!.addEventListener('click',actions.camera);
    root.querySelector('#resume')!.addEventListener('click',actions.resume);root.querySelector('#recover')!.addEventListener('click',actions.recover);root.querySelector('#pause-restart')!.addEventListener('click',restartRace);root.querySelector('#pause-settings')!.addEventListener('click',()=>openSettings());root.querySelector('#hud-settings')!.addEventListener('click',()=>{actions.wheel?.();});applyHUDScale();
    root.querySelector('#pause-menu')!.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key!=='Tab')return;const elements=Array.from(root.querySelectorAll<HTMLElement>('#pause-menu button,#pause-menu input,#pause-menu select,#pause-menu summary'));const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    this.session=new RaceSessionPanel(root,{start:()=>actions.start(track.circuit.id),restart:restartRace,menu:()=>actions.menu?.()});
    root.querySelector('#change-circuit')!.addEventListener('click',()=>confirmRaceAction('레이스를 종료하고 메인 화면으로 돌아갈까요?',()=>actions.menu?.()));
    this.setTransmissionMode(actions.transmissionMode??'auto');
    for(const id of ['#start-transmission'])root.querySelector(id)!.addEventListener('change',event=>{
      const mode=transmissionMode((event.target as HTMLSelectElement).value);actions.transmission?.(mode);this.setTransmissionMode(mode);
    });
    this.setGraphics(actions.graphicsMode,actions.graphicsTier);
    this.proximityRoot=root.querySelector<HTMLElement>('#proximity-ring')!;
    this.map=(root.querySelector('#map') as HTMLCanvasElement).getContext('2d')!;
    const bounds=track.bounds,padding=18,width=240,height=190,scale=Math.min((width-padding*2)/(bounds.max.x-bounds.min.x),(height-padding*2)/(bounds.max.z-bounds.min.z));
    const centerX=(bounds.min.x+bounds.max.x)/2,centerZ=(bounds.min.z+bounds.max.z)/2;
    this.mapPoint=p=>({x:width/2+(p.x-centerX)*scale,y:height/2+(p.z-centerZ)*scale});
    this.path=new Path2D();for(let i=0;i<=1200;i++){const p=this.mapPoint(track.point(i/1200));i?this.path.lineTo(p.x,p.y):this.path.moveTo(p.x,p.y);}

  }
  showCircuitLoading(label:string){
    this.root.querySelector<HTMLElement>('#pause-menu')!.hidden=true;
    const overlay=this.root.querySelector<HTMLElement>('#overlay')!;overlay.hidden=false;
    this.session.loadingScreen(label);
  }
  startSelectedCircuit(){this.session.start();}
  setWheelStatus(status:string,attention=false){this.text('controller-state',status);this.text('wheel-notice',status);(this.root.querySelector('#wheel-notice') as HTMLElement).hidden=!attention;}
  setTransmissionMode(mode:TransmissionMode){
    for(const id of ['#start-transmission'])(this.root.querySelector(id) as HTMLSelectElement).value=mode;
    this.text('gearbox-label',mode==='auto'?'자동':'수동');
  }
  setGraphics(mode:GraphicsMode,tier:GraphicsTier){
    document.documentElement.dataset.graphicsTier=tier;
  }
  setMuted(muted:boolean){this.root.querySelector('#audio-state')!.innerHTML=`<kbd>M</kbd> ${muted?'소리 켜기':'음소거'}`;}
  private text(id:string,value:string){let node=this.textNodes.get(id);if(!node){node=this.root.querySelector('#'+id)!;this.textNodes.set(id,node);}if(node.textContent!==value)node.textContent=value;}
  updateProximity(v:Vehicle,r:Race,paused:boolean){
    const cues=r.state==='racing'&&!paused&&v.position?proximityCues(v,r.opponents):{cars:[]};
    const visible=new Set(cues.cars.map(other=>other.id));
    if(this.proximityRoot.hidden!==!visible.size)this.proximityRoot.hidden=!visible.size;
    for(const [id,node] of this.proximityMarkers)if(!visible.has(id)&&!node.hidden)node.hidden=true;
    for(const other of cues.cars){
      let node=this.proximityMarkers.get(other.id);
      if(!node){node=document.createElement('span');node.className='proximity-marker';this.proximityRoot.append(node);this.proximityMarkers.set(other.id,node);}
      if(node.hidden)node.hidden=false;
      node.style.setProperty('--bearing',`${other.bearing*180/Math.PI}deg`);
      node.classList.toggle('is-close',other.close);node.classList.toggle('is-approaching',other.approaching);
      const side=Math.abs(other.lateral)<.75?'':other.lateral<0?'왼쪽 ':'오른쪽 ';
      const longitudinal=other.forward>3?'앞 ':other.forward < -3?'뒤 ':'';
      node.setAttribute('aria-label',`${side}${longitudinal}차량 ${other.close?'근접':other.approaching?'접근':'주변'}`);
    }
  }
  update(v:Vehicle,r:Race,paused:boolean,track:Track,cameraMode:number){
    this.raceActive=r.state==='racing'||r.state==='countdown';
    if(paused||r.state!=='racing')this.updateProximity(v,r,paused);
    (this.root.querySelector('#pause-menu') as HTMLElement).hidden=!paused;
    if(paused&&!this.wasPaused)(this.root.querySelector('#resume') as HTMLElement).focus();
    if(!paused&&this.wasPaused)(document.activeElement as HTMLElement)?.blur();

    const standings=r.classification??[],playerStanding=standings.find(row=>row.id==='PLAYER');
    this.wasPaused=paused;this.setTransmissionMode(v.transmission.mode);
    this.root.classList.toggle('cockpit-view',cameraMode===1);
    this.text('field-size',String(r.fieldSize).padStart(2,'0'));this.text('driver-count',String(r.fieldSize).padStart(2,'0'));
    this.text('position',String(playerStanding?.position??r.position).padStart(2,'0'));this.text('lap',`${Math.min(v.lap,3)} / 3`);this.text('current',formatTime(r.lapTime));this.text('last',formatTime(r.lastLap));this.text('best',formatTime(r.best));
    const intervals=r.intervals,active=r.state==='racing'||r.state==='finished';
    this.text('gap-ahead-name',active?intervals.ahead?.name??'—':'—');this.text('gap-behind-name',active?intervals.behind?.name??'—':'—');
    this.text('gap-ahead',formatInterval(intervals.ahead,true,active));this.text('gap-behind',formatInterval(intervals.behind,false,active));
    this.text('drs-status',v.aero.active?'DRS 사용 중':v.aero.available?'DRS 사용 가능 · F':!r.aerodynamics.enabled?'DRS · 선두 첫 랩 후':v.aero.qualified?'DRS 다음 구간 대기':'DRS OFF');
    this.text('draft-status',v.aero.wake>.05?`슬립스트림 ${Math.round(v.aero.wake*100)}%`:'');
    this.text('warning',paused?'':v.offRoad?'트랙 이탈 · 속도를 줄이세요':v.boosting?'ERS DEPLOYING': '');
    (this.root.querySelector('#overlay') as HTMLElement).hidden=paused||r.state!=='ready'&&r.state!=='finished';
    if(this.sessionState!==r.state){
      if(r.state==='ready')this.session.ready(track.name);
      if(r.state==='finished')this.session.result(track.name,playerStanding?.position??r.position,r.fieldSize,formatTime(playerStanding?.finish??r.elapsed),formatTime(playerStanding?playerStanding.best:r.best),{rows:standings,previousBest:r.bestAtStart??0});
      this.sessionState=r.state;
    }
    const ctx=this.map;ctx.clearRect(0,0,240,190);ctx.lineWidth=7;ctx.strokeStyle='#ffffff18';ctx.stroke(this.path);ctx.lineWidth=2;ctx.strokeStyle='#b7c7c5';ctx.stroke(this.path);
    const dot=(t:number,color:string,size:number)=>{const p=this.mapPoint(track.point(t));ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
    r.opponents.forEach(o=>dot(o.distance,'#879caa',3));dot(v.progress,'#ff5746',5);
  }
}
