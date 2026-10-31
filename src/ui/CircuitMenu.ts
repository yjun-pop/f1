import {CIRCUITS,circuitById,type CircuitDefinition,type CircuitId} from '../game/Circuits';
import {transmissionMode,type TransmissionMode} from '../game/Powertrain';
import {DEFAULT_FIELD_SIZE} from '../game/RaceRoster';

const PRESENTATION={
  monza:{country:'이탈리아',theme:'SPEED',accent:'#ff795f',style:'긴 직선 · 강한 제동',description:'직선에서 속도를 쌓고, 시케인에서 승부하세요.',landmark:'RETTIFILO / ASCARI'},
  silverstone:{country:'영국',theme:'FLOW',accent:'#92baff',style:'고속 코너 · 연속 S자',description:'마곳츠와 베케츠를 하나의 리듬으로 연결하세요.',landmark:'MAGGOTTS / BECKETTS'},
  spa:{country:'벨기에',theme:'CHALLENGE',accent:'#9ee2ba',style:'긴 랩 · 다양한 코너',description:'케멜 직선의 추월과 라 소스의 제동을 공략하세요.',landmark:'LA SOURCE / KEMMEL'}
} as const;

/** Small vector previews use the same geographic data as the race, without
 * constructing a Three.js world, textures, vehicle models or AI planners. */
export function circuitPreview(circuit:CircuitDefinition){
  const points=circuit.points,minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  const scale=Math.min(332/Math.max(1,maxX-minX),188/Math.max(1,maxZ-minZ));
  const mapped=points.map(([x,z])=>[210+(x-(minX+maxX)/2)*scale,124+(z-(minZ+maxZ)/2)*scale]);
  const path=mapped.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')+' Z';
  const [x,y]=mapped[0];
  return `<svg class="circuit-outline" viewBox="0 0 420 250" aria-hidden="true" focusable="false"><path class="outline-shadow" d="${path}"/><path class="outline-road" d="${path}"/><path class="outline-line" d="${path}"/><circle class="outline-pin-halo" cx="${x}" cy="${y}" r="8"/><circle class="outline-pin" cx="${x}" cy="${y}" r="3.8"/></svg>`;
}
function flag(id:CircuitId){
  const stripes=id==='monza'?['#239b76','#f2f1e7','#ed6254']:['#28282c','#f2ce5c','#ed6254'];
  const shapes=id==='silverstone'?'<path fill="#263b73" d="M0 0h30v20H0z"/><path stroke="#f6f2ea" stroke-width="5" d="m0 0 30 20M30 0 0 20"/><path stroke="#d75b60" stroke-width="2" d="m0 0 30 20M30 0 0 20"/><path stroke="#f6f2ea" stroke-width="7" d="M15 0v20M0 10h30"/><path stroke="#d75b60" stroke-width="4" d="M15 0v20M0 10h30"/>':stripes.map((c,i)=>`<path fill="${c}" d="M${i*10} 0h10v20H${i*10}z"/>`).join('');
  return `<svg class="circuit-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
function record(id:CircuitId){
  let value=0;try{value=Number(localStorage.getItem(`apex-best-${id}-v3`));}catch{}
  return Number.isFinite(value)&&value>0?`${Math.floor(value/60)}:${(value%60).toFixed(3).padStart(6,'0')}`:'아직 기록 없음';
}
export function circuitMenuMarkup(selected:CircuitId,prefix=''){
  const circuit=circuitById(selected),info=PRESENTATION[selected],id=(value:string)=>prefix+value;
  return `<section class="race-menu" id="${id('menu-shell')}" aria-labelledby="${id('menu-title')}">
    <div class="menu-topbar"><div class="menu-brand" aria-label="APEX FORMULA"><i>Λ</i> APEX<span>FORMULA</span></div><span class="menu-mode"><i></i> QUICK RACE <span>/ SINGLE PLAYER</span></span></div>
    <div class="menu-heading"><div><div class="menu-kicker">01 <span> / </span> SELECT YOUR CIRCUIT</div><h1 id="${id('menu-title')}">어디서 <em>달릴까요?</em></h1><p id="${id('menu-description')}">서킷을 고르고, 당신의 다음 베스트 랩에 도전하세요.</p></div><div class="menu-session"><span><b id="${id('driver-count')}">${DEFAULT_FIELD_SIZE}</b> DRIVERS</span><i></i><span><b>03</b> LAPS</span><i></i><span class="menu-dry">☀ <b>DRY</b></span></div></div>
    <fieldset class="circuit-grid"><legend class="sr-only">레이스할 서킷 선택</legend>${CIRCUITS.map((c,i)=>{const p=PRESENTATION[c.id];return `<label class="circuit-card ${c.id===selected?'is-selected':''}" id="${id('card-'+c.id)}" style="--circuit-accent:${p.accent}"><input class="circuit-radio" type="radio" name="${id('circuit')}" id="${id('circuit-'+c.id)}" value="${c.id}" ${c.id===selected?'checked':''} aria-describedby="${id('facts-'+c.id)}"/><span class="card-topline"><span>${flag(c.id)} ${c.country}</span><span class="card-choice"><span class="choice-label">선택됨</span><i>✓</i></span></span><span class="card-title">${c.name}<small>${c.label}</small></span><span class="card-map"><span class="card-watermark">0${i+1}</span>${circuitPreview(c)}<span class="card-map-caption">${p.landmark}</span></span><span class="card-bottom" id="${id('facts-'+c.id)}"><span class="card-character">${p.theme}<small>${p.style}</small></span><span class="card-measure"><b>${(c.length/1000).toFixed(3)}<small>KM</small></b><span>${c.cornerCount} CORNERS</span></span></span></label>`;}).join('')}</fieldset>
    <div class="menu-bottom"><div class="selected-circuit" aria-live="polite"><span class="menu-kicker">YOUR NEXT CHALLENGE</span><h2 id="${id('selection-title')}">${info.country} · ${circuit.label}</h2><p id="${id('selection-description')}">${info.description}</p><span class="menu-record">PERSONAL BEST <b id="${id('selection-record')}">${record(selected)}</b></span></div><div class="menu-launch"><label class="menu-transmission" for="${id('start-transmission')}">변속 방식<select id="${id('start-transmission')}"><option value="auto">자동 변속</option><option value="manual">수동 변속 · Q / E</option></select></label><button type="button" class="menu-wheel-button" id="${id('wheel-settings')}">레이싱 휠 연결 · 입력 설정</button><button class="menu-start" id="${id('start')}"><span id="${id('start-label')}">${circuit.label}에서 시작</span><span aria-hidden="true">↗</span></button><span class="menu-launch-hint"><kbd>← →</kbd> 서킷 선택 <span>·</span> <kbd>ENTER</kbd> 레이스 시작</span></div></div>
    <div class="menu-footnote"><span>APEX FORMULA <i>/</i> CHASE YOUR NEXT APEX.</span><details><summary>조작 방법</summary><p>W / ↑ 가속 · S / ↓ 제동 · A D / ← → 조향<br>SHIFT ERS · F DRS · Q / E 변속 · T 변속 방식<br>C 시점 · G 주행선 · ESC 일시정지</p></details></div><p class="menu-status" id="${id('menu-status')}" role="status" hidden></p>
  </section>`;
}

interface MenuOptions {
  selected:CircuitId;mode:TransmissionMode;prefix?:string;render?:boolean;keyboard?:boolean;
  start:(id:CircuitId,mode:TransmissionMode)=>void;transmission?:(mode:TransmissionMode)=>void;wheel?:()=>void;
}
export class CircuitMenu {
  private selected:CircuitId;private loading=false;private failed=false;
  private keyboardHandler=(event:KeyboardEvent)=>{
    const target=event.target as HTMLElement;
    if(target?.closest?.('dialog[open]'))return;
    if(event.code==='ArrowLeft'||event.code==='ArrowRight'){
      if(target?.matches?.('input,select,textarea,button,summary,[contenteditable="true"]')||this.loading||this.failed)return;
      const index=CIRCUITS.findIndex(c=>c.id===this.selected),next=CIRCUITS[(index+(event.code==='ArrowRight'?1:CIRCUITS.length-1))%CIRCUITS.length];
      event.preventDefault();this.select(next.id);this.node('circuit-'+next.id).focus();return;
    }
    if(event.code!=='Enter'||event.repeat||target?.matches?.('button,a,summary,select,textarea,[contenteditable="true"]'))return;
    event.preventDefault();this.start();
  };
  constructor(private root:HTMLElement,private options:MenuOptions){
    this.selected=options.selected;
    if(options.render!==false)root.innerHTML=circuitMenuMarkup(options.selected,options.prefix);
    for(const circuit of CIRCUITS)this.node<HTMLInputElement>('circuit-'+circuit.id).addEventListener('change',()=>this.select(circuit.id));
    this.node('menu-shell').addEventListener('keydown',event=>{
      const e=event as KeyboardEvent;
      if(e.code==='Enter'&&!e.repeat&&(e.target as HTMLElement)?.matches?.('input[type="radio"]')){e.preventDefault();e.stopPropagation();this.start();}
    });
    this.node('start').addEventListener('click',()=>this.start());
    this.node('wheel-settings').addEventListener('click',()=>{if(!this.loading)options.wheel?.();});
    this.node<HTMLSelectElement>('start-transmission').addEventListener('change',event=>options.transmission?.(transmissionMode((event.target as HTMLSelectElement).value)));
    this.setTransmission(options.mode);
    if(options.keyboard)window.addEventListener('keydown',this.keyboardHandler);
  }
  private node<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>('#'+(this.options.prefix??'')+id)!;}
  select(id:CircuitId){
    if(this.loading||this.failed)return;
    this.selected=id;const circuit=circuitById(id),info=PRESENTATION[id];
    for(const c of CIRCUITS){this.node<HTMLInputElement>('circuit-'+c.id).checked=c.id===id;this.node('card-'+c.id).classList.toggle('is-selected',c.id===id);}
    this.node('selection-title').textContent=`${info.country} · ${circuit.label}`;
    this.node('selection-description').textContent=info.description;
    this.node('selection-record').textContent=record(id);
    this.node('start-label').textContent=`${circuit.label}에서 시작`;
  }
  setTransmission(mode:TransmissionMode){this.node<HTMLSelectElement>('start-transmission').value=mode;}
  start(){
    if(this.loading)return;
    if(this.failed){window.location.reload();return;}
    this.options.start(this.selected,transmissionMode(this.node<HTMLSelectElement>('start-transmission').value));
  }
  setLoading(label:string){
    this.node<HTMLButtonElement>('wheel-settings').disabled=true;
    this.loading=true;this.node('menu-shell').classList.toggle('is-loading',true);
    for(const c of CIRCUITS)this.node<HTMLInputElement>('circuit-'+c.id).disabled=true;
    this.node<HTMLSelectElement>('start-transmission').disabled=true;this.node<HTMLButtonElement>('start').disabled=true;
    this.node('start-label').textContent='그리드 준비 중…';
    const status=this.node('menu-status');status.hidden=false;status.textContent=`${label} 서킷과 주행선을 준비하고 있습니다…`;
  }
  setError(){
    this.failed=true;this.loading=false;this.node('menu-shell').classList.toggle('is-loading',false);
    const status=this.node('menu-status');status.hidden=false;status.textContent='레이스를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
    this.node('start-label').textContent='다시 불러오기';this.node<HTMLButtonElement>('start').disabled=false;
  }
  result(position:number,elapsed:string,best:string){
    this.node('menu-title').textContent=`P${position} · RACE FINISHED`;
    this.node('menu-description').textContent=`레이스 ${elapsed} · 베스트 랩 ${best}. 같은 서킷에 다시 도전하거나 다음 서킷을 선택하세요.`;
    this.select(this.selected);
  }
  reset(){this.node('menu-title').innerHTML='어디서 <em>달릴까요?</em>';this.node('menu-description').textContent='서킷을 고르고, 당신의 다음 베스트 랩에 도전하세요.';}
  dispose(){if(this.options.keyboard)window.removeEventListener('keydown',this.keyboardHandler);}
}
