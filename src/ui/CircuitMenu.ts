import {readBest} from '../game/RecordStore';
import {CIRCUITS,circuitById,type CircuitDefinition,type CircuitId} from '../game/Circuits';
import {transmissionMode,type TransmissionMode} from '../game/Powertrain';

const PRESENTATION={
  monza:{country:'이탈리아',theme:'SPEED',accent:'#ff795f',style:'긴 직선 · 강한 제동',description:'직선에서 속도를 쌓고, 시케인에서 승부하세요.',landmark:'RETTIFILO / ASCARI'},
  silverstone:{country:'영국',theme:'FLOW',accent:'#92baff',style:'고속 코너 · 연속 S자',description:'마곳츠와 베케츠를 하나의 리듬으로 연결하세요.',landmark:'MAGGOTTS / BECKETTS'},
  spa:{country:'벨기에',theme:'CHALLENGE',accent:'#9ee2ba',style:'긴 랩 · 다양한 코너',description:'케멜 직선의 추월과 라 소스의 제동을 공략하세요.',landmark:'LA SOURCE / KEMMEL'},
  monaco:{country:'모나코',theme:'PRECISION',accent:'#ff9ba4',style:'항구 시가지 · 헤어핀',description:'터널을 빠져나와 시케인을 제동하고, 헤어핀을 정밀하게 통과하세요.',landmark:'FAIRMONT / TUNNEL'},
  suzuka:{country:'일본',theme:'RHYTHM',accent:'#ffaf86',style:'연속 S자 · 입체 교차',description:'S자 코너의 리듬과 스푼 탈출, 130R 진입을 연결하세요.',landmark:'S CURVES / 130R'},
  interlagos:{country:'브라질',theme:'BATTLE',accent:'#b8e882',style:'짧은 랩 · 근접 경쟁',description:'세나 S의 제동과 준상 코너 탈출로 직선의 추월 기회를 만드세요.',landmark:'S DO SENNA / JUNCAO'},
  singapore:{country:'싱가포르',theme:'NIGHT RACE',accent:'#b6a0ff',style:'야간 시가지 · 강한 제동',description:'마리나 베이의 조명 아래, 반복되는 제동과 코너 탈출에 집중하세요.',landmark:'RAFFLES / MARINA BAY'},
  montreal:{country:'캐나다',theme:'ATTACK',accent:'#90dfe5',style:'헤어핀 · 고속 시케인',description:'헤어핀에서 속도를 모으고 챔피언의 벽 앞 마지막 시케인을 공략하세요.',landmark:'L EPINGLE / CHAMPIONS'}
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
  const extra:Partial<Record<CircuitId,string>>={
    monaco:'<path fill="#d94b59" d="M0 0h30v10H0z"/><path fill="#f6f2ea" d="M0 10h30v10H0z"/>',
    suzuka:'<path fill="#f6f2ea" d="M0 0h30v20H0z"/><circle fill="#d94b59" cx="15" cy="10" r="5.5"/>',
    interlagos:'<path fill="#248951" d="M0 0h30v20H0z"/><path fill="#edd15b" d="m15 2 12 8-12 8L3 10z"/><circle fill="#294c94" cx="15" cy="10" r="5"/>',
    singapore:'<path fill="#db4a58" d="M0 0h30v10H0z"/><path fill="#f6f2ea" d="M0 10h30v10H0z"/><circle fill="#fff" cx="7" cy="5" r="3.3"/><circle fill="#db4a58" cx="8.5" cy="4.5" r="2.7"/>',
    montreal:'<path fill="#db4a58" d="M0 0h30v20H0z"/><path fill="#f6f2ea" d="M7 0h16v20H7z"/><path fill="#db4a58" d="m15 3 2 4 3-1-1 4 3 2-6 2v3h-2v-3l-6-2 3-2-1-4 3 1z"/>'
  };
  if(extra[id])return `<svg class="circuit-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false">${extra[id]}</svg>`;
  const stripes=id==='monza'?['#239b76','#f2f1e7','#ed6254']:['#28282c','#f2ce5c','#ed6254'];
  const shapes=id==='silverstone'?'<path fill="#263b73" d="M0 0h30v20H0z"/><path stroke="#f6f2ea" stroke-width="5" d="m0 0 30 20M30 0 0 20"/><path stroke="#d75b60" stroke-width="2" d="m0 0 30 20M30 0 0 20"/><path stroke="#f6f2ea" stroke-width="7" d="M15 0v20M0 10h30"/><path stroke="#d75b60" stroke-width="4" d="M15 0v20M0 10h30"/>':stripes.map((c,i)=>`<path fill="${c}" d="M${i*10} 0h10v20H${i*10}z"/>`).join('');
  return `<svg class="circuit-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
function record(id:CircuitId){
  const value=readBest(`apex-best-${id}-v3`);
  return Number.isFinite(value)&&value>0?`${Math.floor(value/60)}:${(value%60).toFixed(3).padStart(6,'0')}`:'아직 기록 없음';
}
function circuitMenuMarkup(selected:CircuitId,prefix='',totalLaps=3,opponents=0){
  const circuit=circuitById(selected),info=PRESENTATION[selected],id=(value:string)=>prefix+value;
  return `<section class="race-menu" id="${id('menu-shell')}" aria-labelledby="${id('menu-title')}">
    <div class="menu-topbar"><div class="menu-brand" aria-label="APEX FORMULA"><i>Λ</i> APEX<span>FORMULA</span></div><span class="menu-mode"><i></i> SINGLE RACE <span>/ SINGLE PLAYER</span></span></div>
    <div class="menu-heading"><div><div class="menu-kicker">01 <span> / </span> SELECT YOUR CIRCUIT</div><h1 id="${id('menu-title')}">서킷 선택</h1><p id="${id('menu-description')}">서킷을 고르고, 당신의 다음 베스트 랩에 도전하세요.</p></div><div class="menu-session"><span><b id="${id('driver-count')}">${opponents+1}</b> DRIVERS</span><i></i><span><b>${String(totalLaps).padStart(2,'0')}</b> LAPS</span><i></i><span class="menu-dry" id="${id('conditions')}">${circuit.night?'☾ <b>NIGHT · DRY</b>':'☀ <b>DRY</b>'}</span></div></div>
    <fieldset class="circuit-gallery" id="${id('gallery')}" aria-roledescription="갤러리"><legend class="sr-only">레이스할 서킷 선택</legend><div class="gallery-stage" id="${id('gallery-stage')}">${CIRCUITS.map((c,i)=>{const p=PRESENTATION[c.id];return `<label class="circuit-card ${c.id===selected?'is-selected':''}" id="${id('card-'+c.id)}" style="--circuit-accent:${p.accent}"><input class="circuit-radio" type="radio" name="${id('circuit')}" id="${id('circuit-'+c.id)}" value="${c.id}" ${c.id===selected?'checked':''} aria-describedby="${id('facts-'+c.id)}"/><span class="card-topline"><span>${flag(c.id)} ${c.country}</span><span class="card-choice"><span class="choice-label">선택됨</span><i>✓</i></span></span><span class="card-title">${c.name}<small>${c.label}</small></span><span class="card-map"><span class="card-watermark">0${i+1}</span>${circuitPreview(c)}<span class="card-map-caption">${p.landmark}</span></span><span class="card-bottom" id="${id('facts-'+c.id)}"><span class="card-character">${p.theme}<small>${p.style}</small></span><span class="card-measure"><b>${(c.length/1000).toFixed(3)}<small>KM</small></b><span>${c.cornerCount} CORNERS</span></span></span></label>`;}).join('')}</div><div class="gallery-controls"><button type="button" class="gallery-arrow" id="${id('gallery-prev')}" aria-label="이전 서킷"><span aria-hidden="true">&lt;</span><small class="gallery-neighbor" id="${id('prev-name')}"></small></button><div class="gallery-pagination" aria-label="서킷 바로 선택">${CIRCUITS.map(c=>`<button type="button" class="gallery-dot" id="${id('dot-'+c.id)}" aria-label="${PRESENTATION[c.id].country} · ${c.label} 선택"></button>`).join('')}</div><button type="button" class="gallery-arrow" id="${id('gallery-next')}" aria-label="다음 서킷"><span aria-hidden="true">&gt;</span><small class="gallery-neighbor" id="${id('next-name')}"></small></button><span class="gallery-counter" id="${id('gallery-counter')}" aria-live="polite" aria-atomic="true"></span></div></fieldset>
    <div class="menu-bottom"><div class="selected-circuit" id="${id('selection-summary')}" aria-live="polite"><span class="menu-kicker">YOUR NEXT CHALLENGE</span><h2 id="${id('selection-title')}">${info.country} · ${circuit.label}</h2><p id="${id('selection-description')}">${info.description}</p><span class="menu-record">최고 기록 <b id="${id('selection-record')}">${record(selected)}</b></span></div><div class="menu-launch"><div class="menu-setup-summary"><label class="menu-transmission" for="${id('start-transmission')}">변속 방식<select id="${id('start-transmission')}"><option value="auto">자동 변속</option><option value="manual">수동 변속 · Q / E</option></select></label><label class="menu-transmission" for="${id('opponents')}">상대 차량<select id="${id('opponents')}">${Array.from({length:12},(_,i)=>`<option value="${i}" ${i===opponents?'selected':''}>${i===0?'상대 없음':'상대 '+i+'대'}</option>`).join('')}</select></label><span class="launch-race-facts" id="${id('race-facts')}">${opponents+1}대 · ${totalLaps}랩</span></div><button type="button" class="menu-wheel-button" id="${id('wheel-settings')}">설정</button><button class="menu-start" id="${id('start')}"><span id="${id('start-label')}">${circuit.label}에서 시작</span><span aria-hidden="true">↗</span></button><span class="menu-launch-hint"><kbd>← →</kbd> 서킷 선택 <span>·</span> <kbd>ENTER</kbd> 레이스 시작</span></div></div>
    <div class="menu-footnote"><a class="menu-home" href="./" aria-label="메인 화면으로 돌아가기">← 메인 화면</a><button type="button" class="menu-account" id="${id('account')}">계정 · 서버 기록</button><details><summary>조작 방법</summary><p>W / ↑ 가속 · S / ↓ 제동 · A D / ← → 조향<br>SHIFT ERS · F DRS · Q / E 변속 · T 변속 방식<br>C 시점 · G 주행선 · ESC 일시정지</p></details></div><p class="menu-status" id="${id('menu-status')}" role="status" hidden></p>
  </section>`;
}

interface MenuOptions {
  totalLaps?:number;opponents?:number;opponentsChanged?:(count:number)=>void;
  selected:CircuitId;mode:TransmissionMode;prefix?:string;
  start:(id:CircuitId,mode:TransmissionMode)=>void;preview?:(id:CircuitId)=>void;transmission?:(mode:TransmissionMode)=>void;wheel?:()=>void;account?:()=>void;
}
export class CircuitMenu {
  private selected:CircuitId;private loading=false;private failed=false;
  private keyboardHandler=(event:KeyboardEvent)=>{
    if(event.defaultPrevented)return;
    const target=event.target as HTMLElement;
    if(target?.closest?.('dialog[open]'))return;
    if(event.code==='ArrowLeft'||event.code==='ArrowRight'){
      if(target?.matches?.('input:not(.circuit-radio),select,textarea,button,summary,[contenteditable="true"]')||this.loading||this.failed)return;
      event.preventDefault();this.move(event.code==='ArrowRight'?1:-1);this.node('circuit-'+this.selected).focus({preventScroll:true});return;
    }
    if(event.code!=='Enter'||event.repeat||target?.matches?.('button,a,summary,select,textarea,[contenteditable="true"]'))return;
    event.preventDefault();this.start();
  };
  constructor(private root:HTMLElement,private options:MenuOptions){
    this.selected=options.selected;
    root.innerHTML=circuitMenuMarkup(options.selected,options.prefix,options.totalLaps,options.opponents);
    for(const circuit of CIRCUITS){
      this.node<HTMLInputElement>('circuit-'+circuit.id).addEventListener('change',()=>this.select(circuit.id));
      this.node('dot-'+circuit.id).addEventListener('click',()=>this.select(circuit.id));
    }
    this.node('gallery-prev').addEventListener('click',()=>this.move(-1));
    this.node('gallery-next').addEventListener('click',()=>this.move(1));
    const stage=this.node('gallery-stage');let touch:{id:number;x:number;y:number}|undefined,swiped=false;
    stage.addEventListener('pointerdown',event=>{swiped=false;if(event.pointerType==='touch')touch={id:event.pointerId,x:event.clientX,y:event.clientY};});
    stage.addEventListener('pointerup',event=>{
      if(!touch||event.pointerId!==touch.id)return;
      const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=undefined;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4){swiped=true;this.move(dx<0?1:-1);}
    });
    stage.addEventListener('pointercancel',()=>{touch=undefined;});
    stage.addEventListener('click',event=>{if(swiped){event.preventDefault();event.stopPropagation();swiped=false;}},true);
    this.node('menu-shell').addEventListener('keydown',event=>{
      const e=event as KeyboardEvent;
      if(e.code==='Enter'&&!e.repeat&&(e.target as HTMLElement)?.matches?.('input[type="radio"]')){e.preventDefault();e.stopPropagation();this.start();}
    });
    this.node('start').addEventListener('click',()=>this.start());
    this.node('account').addEventListener('click',()=>{if(!this.loading)options.account?.();});
    this.node('wheel-settings').addEventListener('click',()=>{if(!this.loading)options.wheel?.();});
    this.node<HTMLSelectElement>('start-transmission').addEventListener('change',event=>options.transmission?.(transmissionMode((event.target as HTMLSelectElement).value)));
    this.node<HTMLSelectElement>('opponents').addEventListener('change',event=>{const count=Number((event.target as HTMLSelectElement).value);options.opponentsChanged?.(count);this.node('driver-count').textContent=String(count+1);this.node('race-facts').textContent=`${count+1}대 · ${options.totalLaps??3}랩`;});
    this.setTransmission(options.mode);
    window.addEventListener('keydown',this.keyboardHandler);
    this.updateGallery();
  }
  refreshRecords(){this.node('selection-record').textContent=record(this.selected);this.updateGallery();}
  private node<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>('#'+(this.options.prefix??'')+id)!;}
  private move(direction:number){
    const index=CIRCUITS.findIndex(c=>c.id===this.selected);
    this.select(CIRCUITS[(index+direction+CIRCUITS.length)%CIRCUITS.length].id);
  }
  private updateGallery(){
    const index=CIRCUITS.findIndex(c=>c.id===this.selected),total=CIRCUITS.length;
    CIRCUITS.forEach((c,i)=>{
      let offset=(i-index+total)%total;if(offset>total/2)offset-=total;
      const card=this.node('card-'+c.id),radio=this.node<HTMLInputElement>('circuit-'+c.id),dot=this.node('dot-'+c.id);
      card.style.setProperty('--slot',String(Math.max(-2,Math.min(2,offset))));
      card.classList.toggle('is-selected',offset===0);card.classList.toggle('is-neighbor',Math.abs(offset)===1);card.classList.toggle('is-away',Math.abs(offset)>1);
      card.setAttribute('aria-hidden',String(Math.abs(offset)>1));radio.checked=offset===0;radio.tabIndex=offset===0?0:-1;
      dot.setAttribute('aria-current',offset===0?'true':'false');dot.classList.toggle('is-current',offset===0);
    });
    this.node('prev-name').textContent=circuitById(CIRCUITS[(index+total-1)%total].id).label;
    this.node('next-name').textContent=circuitById(CIRCUITS[(index+1)%total].id).label;
    this.node('gallery-prev').setAttribute('aria-label',`이전 서킷 · ${this.node('prev-name').textContent}`);
    this.node('gallery-next').setAttribute('aria-label',`다음 서킷 · ${this.node('next-name').textContent}`);
    this.node('selection-summary').classList.toggle('has-record',record(this.selected)!=='아직 기록 없음');
    this.node('gallery-counter').textContent=`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  }
  select(id:CircuitId){
    if(this.loading||this.failed)return;
    this.selected=id;const circuit=circuitById(id),info=PRESENTATION[id];
    this.updateGallery();this.options.preview?.(id);
    this.node('selection-title').textContent=`${info.country} · ${circuit.label}`;
    this.node('conditions').innerHTML=circuit.night?'☾ <b>NIGHT · DRY</b>':'☀ <b>DRY</b>';
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
    for(const c of CIRCUITS){this.node<HTMLInputElement>('circuit-'+c.id).disabled=true;this.node<HTMLButtonElement>('dot-'+c.id).disabled=true;}
    this.node<HTMLButtonElement>('gallery-prev').disabled=true;this.node<HTMLButtonElement>('gallery-next').disabled=true;
    this.node<HTMLSelectElement>('start-transmission').disabled=true;this.node<HTMLButtonElement>('start').disabled=true;
    this.node('start-label').textContent='그리드 준비 중…';
    const status=this.node('menu-status');status.hidden=false;status.textContent=`${label} 서킷과 주행선을 준비하고 있습니다…`;
  }
  setError(){
    this.failed=true;this.loading=false;this.node('menu-shell').classList.toggle('is-loading',false);
    const status=this.node('menu-status');status.hidden=false;status.textContent='레이스를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
    this.node('start-label').textContent='다시 불러오기';this.node<HTMLButtonElement>('start').disabled=false;
  }
  dispose(){window.removeEventListener('keydown',this.keyboardHandler);}
}
