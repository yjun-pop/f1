import {Vehicle} from '../game/Vehicle';
import {transmissionMode,type TransmissionMode} from '../game/Powertrain';
import {Track} from '../game/Track';
import type {CircuitId} from '../game/Circuits';
import {CircuitMenu,circuitMenuMarkup} from './CircuitMenu';
import {Race,formatTime} from '../game/Race';
import {graphicsMode,type GraphicsMode,type GraphicsTier} from '../game/Graphics';
import {DEFAULT_FIELD_SIZE} from '../game/RaceRoster';
import {formatInterval} from '../game/RaceTiming';
export class HUD {
  private root:HTMLElement;
  private map:CanvasRenderingContext2D;
  private path:Path2D;
  private wasPaused=false;private menu:CircuitMenu;private menuState='';
  private textNodes=new Map<string,Element>();
  private mapPoint:(p:{x:number;z:number})=>{x:number;y:number};
  constructor(root:HTMLElement,track:Track,actions:{start:(id:CircuitId)=>void,restart:()=>void,camera:()=>void;resume:()=>void;recover:()=>void;volume:(value:number)=>void;audioLevel:number;motionLevel:number;motion:(value:number)=>void;graphicsMode:GraphicsMode;graphicsTier:GraphicsTier;graphics:(mode:GraphicsMode)=>void;transmissionMode?:TransmissionMode;transmission?:(mode:TransmissionMode)=>void;menu?:()=>void;wheel?:()=>void}) {
    this.root=root;
    root.innerHTML=`<header><div class="brand"><i>Λ</i> APEX<span>FORMULA</span><small>OPEN WHEEL RACING / 01</small></div><div class="session"><b>${track.name} · ${track.country}</b><small>RACE · 3 LAPS · DRY · LATE AFTERNOON</small></div></header>
    <div class="rearview-frame" role="img" aria-label="차량 뒤쪽 실시간 백미러"><div id="rearview-viewport"></div><span>REAR VIEW</span></div>
    <aside class="timing"><div class="eyebrow">RACE CLASSIFICATION</div><div class="position"><strong id="position">${DEFAULT_FIELD_SIZE}</strong><span>/ <b id="field-size">${DEFAULT_FIELD_SIZE}</b><small>POSITION</small></span></div><div class="intervals" aria-label="앞뒤 차량 시간 차"><div class="interval-row"><span>앞차 <b id="gap-ahead-name">—</b></span><strong id="gap-ahead">—</strong></div><div class="interval-row"><span>뒤차 <b id="gap-behind-name">—</b></span><strong id="gap-behind">—</strong></div></div><div class="timingrow"><span>LAP</span><b id="lap">1 / 3</b></div><div class="timingrow"><span>CURRENT</span><b id="current"></b></div><div class="timingrow"><span>LAST</span><b id="last"></b></div><div class="timingrow best"><span>BEST</span><b id="best"></b></div></aside>
    <div class="mapbox"><canvas id="map" width="240" height="190"></canvas><span>${track.name} · ${track.country} · ${(track.length/1000).toFixed(2)} KM</span></div>
<div class="aero-status" aria-label="DRS와 슬립스트림 상태"><b id="drs-status">DRS · 선두 첫 랩 후</b><span id="draft-status"></span></div><div id="warning"></div><div id="wheel-notice" class="wheel-input-notice" role="status" hidden></div><footer><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> 주행</span><span><kbd>Q / E</kbd> 기어 ↓ / ↑ · <kbd>T</kbd> <b id="gearbox-label">자동</b></span><span><kbd>F</kbd> DRS</span><span><kbd>C</kbd> 시점</span><span><kbd>G</kbd> 라인</span><span><kbd>R</kbd> 트랙 복귀</span><span><kbd>ESC</kbd> 일시정지</span><span id="audio-state"><kbd>M</kbd> 음소거</span><button id="camera">시점 변경</button><button id="restart">다시 시작</button></footer>
    <div class="overlay race-overlay" id="overlay">${circuitMenuMarkup(track.circuit.id)}</div>
    <div class="pause-shade" id="pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden><section class="pause-panel"><div class="eyebrow">APEX FORMULA / SESSION CONTROL</div><h2 id="pause-title">일시정지</h2><p>레이스와 랩 타이머가 멈췄습니다.</p><button id="resume" class="primary">레이스 계속 <span>ESC →</span></button><button id="recover">트랙으로 복귀 후 계속</button><button id="pause-camera">시점 변경 <span>C</span></button><button type="button" id="pause-wheel-settings">레이싱 휠 · 입력 설정 <span>→</span></button><p id="controller-state" role="status"></p><label for="transmission-mode">변속 방식</label><select id="transmission-mode" aria-describedby="transmission-hint"><option value="auto">자동</option><option value="manual">수동 · Q 내리기 / E 올리기</option></select><p id="transmission-hint">T 자동·수동 전환 · 수동은 Q / E로 변속합니다.<br>너무 높은 회전수가 되는 하향 변속은 보호됩니다.</p><label for="motion-strength">주행 진동 <output id="motion-value"></output></label><input id="motion-strength" type="range" min="0" max="100" step="5" aria-label="제동·연석·변속 화면 움직임 강도"/><label for="audio-volume">주행 사운드 <output id="audio-value"></output></label><input id="audio-volume" type="range" min="0" max="100" step="1" aria-label="주행 사운드 음량"/><label for="graphics-quality">그래픽 품질 <output id="graphics-value"></output></label><select id="graphics-quality" aria-describedby="graphics-hint"><option value="auto">자동</option><option value="low">낮음 · 성능 우선</option><option value="medium">보통 · 균형</option><option value="high">높음 · 화질 우선</option></select><p id="graphics-hint">자동 설정은 주행 성능에 맞춰 화질을 조절합니다.</p><div class="pause-controls">W / ↑ 가속 · S / ↓ 제동<br>A D / ← → 조향 · SHIFT 부스트 · F DRS · G 유도선<br>DRS: 선두 첫 랩 후 감지선에서 앞차 1초 이내 · 구간 안에서 F</div><details class="rival-summary"><summary>AI 성향 · 충돌 감점</summary><div id="rival-scores"></div></details><button id="change-circuit" class="secondary">다른 서킷 선택 <span>→</span></button><p class="change-circuit-hint">현재 레이스를 종료하고 서킷 선택 화면으로 돌아갑니다.</p><button id="pause-restart" class="secondary">레이스 다시 시작</button></section></div>`;
    root.querySelector('#restart')!.addEventListener('click',actions.restart);root.querySelector('#camera')!.addEventListener('click',actions.camera);
    root.querySelector('#resume')!.addEventListener('click',actions.resume);root.querySelector('#recover')!.addEventListener('click',actions.recover);root.querySelector('#pause-restart')!.addEventListener('click',actions.restart);root.querySelector('#pause-camera')!.addEventListener('click',actions.camera);
    root.querySelector('#pause-menu')!.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key!=='Tab')return;const elements=Array.from(root.querySelectorAll<HTMLElement>('#pause-menu button,#pause-menu input,#pause-menu select,#pause-menu summary'));const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    const volume=root.querySelector<HTMLInputElement>('#audio-volume')!;volume.value=String(Math.round(actions.audioLevel*100));
    const showVolume=()=>root.querySelector('#audio-value')!.textContent=`${volume.value}%`;showVolume();
    volume.addEventListener('input',()=>{actions.volume(Number(volume.value)/100);showVolume();});
    const motion=root.querySelector<HTMLInputElement>('#motion-strength')!;motion.value=String(Math.round(actions.motionLevel*100));
    const showMotion=()=>root.querySelector('#motion-value')!.textContent=Number(motion.value)===0?'꺼짐':`${motion.value}%`;showMotion();
    motion.addEventListener('input',()=>{actions.motion(Number(motion.value)/100);showMotion();});
    this.menu=new CircuitMenu(root,{selected:track.circuit.id,mode:actions.transmissionMode??'auto',render:false,start:id=>actions.start(id),wheel:actions.wheel,transmission:mode=>{actions.transmission?.(mode);this.setTransmissionMode(mode);}});
    root.querySelector('#pause-wheel-settings')!.addEventListener('click',()=>actions.wheel?.());
    root.querySelector('#change-circuit')!.addEventListener('click',()=>actions.menu?.());
    this.setTransmissionMode(actions.transmissionMode??'auto');
    for(const id of ['#transmission-mode'])root.querySelector(id)!.addEventListener('change',event=>{
      const mode=transmissionMode((event.target as HTMLSelectElement).value);actions.transmission?.(mode);this.setTransmissionMode(mode);
    });
    this.setGraphics(actions.graphicsMode,actions.graphicsTier);
    root.querySelector('#graphics-quality')!.addEventListener('change',event=>actions.graphics(graphicsMode((event.target as HTMLSelectElement).value)));
    this.map=(root.querySelector('#map') as HTMLCanvasElement).getContext('2d')!;
    const bounds=track.bounds,padding=18,width=240,height=190,scale=Math.min((width-padding*2)/(bounds.max.x-bounds.min.x),(height-padding*2)/(bounds.max.z-bounds.min.z));
    const centerX=(bounds.min.x+bounds.max.x)/2,centerZ=(bounds.min.z+bounds.max.z)/2;
    this.mapPoint=p=>({x:width/2+(p.x-centerX)*scale,y:height/2+(p.z-centerZ)*scale});
    this.path=new Path2D();for(let i=0;i<=1200;i++){const p=this.mapPoint(track.point(i/1200));i?this.path.lineTo(p.x,p.y):this.path.moveTo(p.x,p.y);}

  }
  showCircuitLoading(label:string){
    this.root.querySelector<HTMLElement>('#pause-menu')!.hidden=true;
    const overlay=this.root.querySelector<HTMLElement>('#overlay')!;overlay.hidden=false;
    this.menu.setLoading(label);
  }
  startSelectedCircuit(){this.menu.start();}
  setWheelStatus(status:string,attention=false){this.text('controller-state',status);this.text('wheel-notice',status);(this.root.querySelector('#wheel-notice') as HTMLElement).hidden=!attention;}
  setTransmissionMode(mode:TransmissionMode){
    for(const id of ['#transmission-mode','#start-transmission'])(this.root.querySelector(id) as HTMLSelectElement).value=mode;
    this.text('gearbox-label',mode==='auto'?'자동':'수동');
  }
  setGraphics(mode:GraphicsMode,tier:GraphicsTier){
    (this.root.querySelector('#graphics-quality') as HTMLSelectElement).value=mode;
    this.text('graphics-value',`${mode==='auto'?'자동 · ':''}${{low:'낮음',medium:'보통',high:'높음'}[tier]}`);
  }
  setMuted(muted:boolean){this.root.querySelector('#audio-state')!.innerHTML=`<kbd>M</kbd> ${muted?'소리 켜기':'음소거'}`;}
  private text(id:string,value:string){let node=this.textNodes.get(id);if(!node){node=this.root.querySelector('#'+id)!;this.textNodes.set(id,node);}if(node.textContent!==value)node.textContent=value;}
  update(v:Vehicle,r:Race,paused:boolean,track:Track,cameraMode:number){
    (this.root.querySelector('#pause-menu') as HTMLElement).hidden=!paused;
    if(paused&&!this.wasPaused)(this.root.querySelector('#resume') as HTMLElement).focus();
    if(!paused&&this.wasPaused)(document.activeElement as HTMLElement)?.blur();
    if(paused){const scores=this.root.querySelector('#rival-scores')!;scores.replaceChildren(...r.opponents.map(o=>{const row=document.createElement('div');row.textContent=`${o.name} · ${o.personality} · ${o.agent.status} · ${o.agent.strategy.status} · ERS ${Math.round(o.car.boost)}% / ${o.collisionScore.toFixed(0)}점 (${o.collisionCount}회)`;return row;}));}
    this.wasPaused=paused;this.setTransmissionMode(v.transmission.mode);
    this.root.classList.toggle('cockpit-view',cameraMode===1);
    this.text('field-size',String(r.fieldSize).padStart(2,'0'));this.text('driver-count',String(r.fieldSize).padStart(2,'0'));
    this.text('position',String(r.position).padStart(2,'0'));this.text('lap',`${Math.min(v.lap,3)} / 3`);this.text('current',formatTime(r.lapTime));this.text('last',formatTime(r.lastLap));this.text('best',formatTime(r.best));
    const intervals=r.intervals,active=r.state==='racing'||r.state==='finished';
    this.text('gap-ahead-name',active?intervals.ahead?.name??'—':'—');this.text('gap-behind-name',active?intervals.behind?.name??'—':'—');
    this.text('gap-ahead',formatInterval(intervals.ahead,true,active));this.text('gap-behind',formatInterval(intervals.behind,false,active));
    this.text('drs-status',v.aero.active?'DRS 사용 중':v.aero.available?'DRS 사용 가능 · F':!r.aerodynamics.enabled?'DRS · 선두 첫 랩 후':v.aero.qualified?'DRS 다음 구간 대기':'DRS OFF');
    this.text('draft-status',v.aero.wake>.05?`슬립스트림 ${Math.round(v.aero.wake*100)}%`:'');
    this.text('warning',paused?'':v.offRoad?'트랙 이탈 · 속도를 줄이세요':v.boosting?'ERS DEPLOYING': '');
    (this.root.querySelector('#overlay') as HTMLElement).hidden=paused||r.state!=='ready'&&r.state!=='finished';
    if(this.menuState!==r.state){
      if(r.state==='ready')this.menu.reset();
      if(r.state==='finished')this.menu.result(r.position,formatTime(r.elapsed),formatTime(r.best));
      this.menuState=r.state;
    }
    const ctx=this.map;ctx.clearRect(0,0,240,190);ctx.lineWidth=7;ctx.strokeStyle='#ffffff18';ctx.stroke(this.path);ctx.lineWidth=2;ctx.strokeStyle='#b7c7c5';ctx.stroke(this.path);
    const dot=(t:number,color:string,size:number)=>{const p=this.mapPoint(track.point(t));ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
    r.opponents.forEach(o=>dot(o.distance,'#879caa',3));dot(v.progress,'#ff5746',5);
  }
}
