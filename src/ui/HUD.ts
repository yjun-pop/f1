import {RacingLine} from '../game/RacingLine';
import {Vehicle} from '../game/Vehicle';
import {Track} from '../game/Track';
import {Race,formatTime} from '../game/Race';
export class HUD {
  private root:HTMLElement;
  private map:CanvasRenderingContext2D;
  private path:Path2D;
  private wasPaused=false;
  private mapPoint:(p:{x:number;z:number})=>{x:number;y:number};
  constructor(root:HTMLElement,track:Track,actions:{start:()=>void,restart:()=>void,camera:()=>void;resume:()=>void;recover:()=>void;height:(value:number)=>void}) {
    this.root=root;
    root.innerHTML=`<header><div class="brand"><i>Λ</i> APEX<span>FORMULA</span><small>OPEN WHEEL RACING / 01</small></div><div class="session"><b>MONZA · ITALY</b><small>RACE · 3 LAPS · DRY · NIGHT</small></div></header>
    <aside class="timing"><div class="eyebrow">RACE CLASSIFICATION</div><div class="position"><strong id="position">06</strong><span>/ 06<small>POSITION</small></span></div><div class="timingrow"><span>LAP</span><b id="lap">1 / 3</b></div><div class="timingrow"><span>CURRENT</span><b id="current"></b></div><div class="timingrow"><span>LAST</span><b id="last"></b></div><div class="timingrow best"><span>BEST</span><b id="best"></b></div></aside>
    <div class="mapbox"><canvas id="map" width="240" height="190"></canvas><span>MONZA · ITALY · ${ (track.length/1000).toFixed(2) } KM</span></div>
    <div class="telemetry"><div class="rpm" id="rpm"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="instruments"><div class="gear"><b id="gear">N</b><small>GEAR</small></div><div class="velocity"><b id="speed">0</b><small>KM/H</small></div><div class="pedals"><label>THR <i id="throttle"></i></label><label>BRK <i id="brake"></i></label></div></div><div class="ers"><span>ERS <b id="ers">100%</b></span><div><i id="energy"></i></div><small>SHIFT · BOOST</small></div></div>
    <div class="linecoach"><span>3D RACING LINE</span><b id="target">0 <small>KM/H</small></b><strong id="instruction">ACCELERATE</strong><small class="next-turn" id="next-turn"></small><div><i></i> 가속 <i></i> 유지 <i></i> 제동</div></div><div id="warning"></div><footer><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> 주행</span><span><kbd>C</kbd> 시점</span><span><kbd>G</kbd> 라인</span><span><kbd>R</kbd> 트랙 복귀</span><span><kbd>ESC</kbd> 일시정지</span><button id="camera">시점 변경</button><button id="restart">다시 시작</button></footer>
    <div class="overlay" id="overlay"><div class="intro"><div class="eyebrow">THE GRID IS YOURS</div><h1>CHASE THE<br><em>APEX.</em></h1><p>긴 직선과 11개 코너, 몬차 3랩 스프린트.<br>실제 GP 레이아웃에서 가속과 제동을 연습하세요.</p><div class="specs"><span><b>06</b>DRIVERS</span><span><b>03</b>LAPS</span><span><b>320</b>KM/H MAX</span></div><button class="start" id="start">그리드 진입 <span>→</span></button><small>W / ↑ 가속 · S / ↓ 브레이크 · A D / ← → 조향 · SHIFT 부스트</small></div></div><div id="countdown"></div>
    <div class="pause-shade" id="pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden><section class="pause-panel"><div class="eyebrow">APEX FORMULA / SESSION CONTROL</div><h2 id="pause-title">일시정지</h2><p>레이스와 랩 타이머가 멈췄습니다.</p><button id="resume" class="primary">레이스 계속 <span>ESC →</span></button><button id="recover">트랙으로 복귀 후 계속</button><button id="pause-camera">시점 변경 <span>C</span></button><label for="seat-height">운전석 높이 <output id="seat-value">1.8 m</output></label><input id="seat-height" type="range" min="1.5" max="2.8" step="0.1" value="1.8"/><div class="pause-controls">W / ↑ 가속 · S / ↓ 제동<br>A D / ← → 조향 · SHIFT 부스트 · G 유도선</div><button id="pause-restart" class="secondary">레이스 다시 시작</button></section></div>`;
    root.querySelector('#start')!.addEventListener('click',actions.start);root.querySelector('#restart')!.addEventListener('click',actions.restart);root.querySelector('#camera')!.addEventListener('click',actions.camera);
    root.querySelector('#resume')!.addEventListener('click',actions.resume);root.querySelector('#recover')!.addEventListener('click',actions.recover);root.querySelector('#pause-restart')!.addEventListener('click',actions.restart);root.querySelector('#pause-camera')!.addEventListener('click',actions.camera);
    root.querySelector('#seat-height')!.addEventListener('input',event=>{const value=Number((event.target as HTMLInputElement).value);actions.height(value);root.querySelector('#seat-value')!.textContent=`${value.toFixed(1)} m`;});
    root.querySelector('#pause-menu')!.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key!=='Tab')return;const elements=Array.from(root.querySelectorAll<HTMLElement>('#pause-menu button,#pause-menu input'));const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    this.map=(root.querySelector('#map') as HTMLCanvasElement).getContext('2d')!;
    const bounds=track.bounds,padding=18,width=240,height=190,scale=Math.min((width-padding*2)/(bounds.max.x-bounds.min.x),(height-padding*2)/(bounds.max.z-bounds.min.z));
    const centerX=(bounds.min.x+bounds.max.x)/2,centerZ=(bounds.min.z+bounds.max.z)/2;
    this.mapPoint=p=>({x:width/2+(p.x-centerX)*scale,y:height/2+(p.z-centerZ)*scale});
    this.path=new Path2D();for(let i=0;i<=1200;i++){const p=this.mapPoint(track.point(i/1200));i?this.path.lineTo(p.x,p.y):this.path.moveTo(p.x,p.y);}

  }
  private text(id:string,value:string){this.root.querySelector('#'+id)!.textContent=value;}
  update(v:Vehicle,r:Race,paused:boolean,track:Track,line:RacingLine,cameraMode:number){
    (this.root.querySelector('#pause-menu') as HTMLElement).hidden=!paused;
    if(paused&&!this.wasPaused)(this.root.querySelector('#resume') as HTMLElement).focus();
    if(!paused&&this.wasPaused)(document.activeElement as HTMLElement)?.blur();
    this.wasPaused=paused;
    this.root.classList.toggle('cockpit-view',cameraMode===1);
    const next=track.nextSection(v.progress),distance=((next.progress-v.progress+1)%1)*track.length;this.text('next-turn',`T${next.number} ${next.name} · ${Math.round(distance)} m`);
    this.text('target',`${line.targetKmh} KM/H`);this.text('instruction',line.instruction==='BRAKE'?'브레이크':line.instruction==='HOLD'?'속도 유지':'가속');
    (this.root.querySelector('.linecoach') as HTMLElement).style.setProperty('--guide',line.instruction==='BRAKE'?'#ff4134':line.instruction==='HOLD'?'#ffdd28':'#63ff46');
    this.text('position',String(r.position).padStart(2,'0'));this.text('lap',`${Math.min(v.lap,3)} / 3`);this.text('current',formatTime(r.lapTime));this.text('last',formatTime(r.lastLap));this.text('best',formatTime(r.best));this.text('speed',String(v.kmh));this.text('gear',v.kmh<2?'N':String(Math.min(8,1+Math.floor(v.kmh/43))));this.text('ers',`${Math.round(v.boost)}%`);
    for(const [id,value] of [['energy',v.boost],['throttle',v.throttle*100],['brake',v.brake*100]] as const)(this.root.querySelector('#'+id) as HTMLElement).style.width=`${value}%`;
    this.root.querySelectorAll('#rpm i').forEach((led,i)=>led.classList.toggle('on',v.speed>0&&i<(v.kmh%43)/43*16));
    this.text('warning',paused?'':v.offRoad?'트랙 이탈 · 속도를 줄이세요':v.boosting?'ERS DEPLOYING': '');
    (this.root.querySelector('#overlay') as HTMLElement).hidden=r.state!=='ready'&&r.state!=='finished';
    if(r.state==='ready'){this.root.querySelector('.intro h1')!.innerHTML='CHASE THE<br><em>APEX.</em>';this.root.querySelector('.intro p')!.innerHTML='긴 직선과 11개 코너, 몬차 3랩 스프린트.<br>실제 GP 레이아웃에서 가속과 제동을 연습하세요.';this.root.querySelector('#start')!.innerHTML='그리드 진입 →';}
    if(r.state==='finished'){this.root.querySelector('.intro h1')!.innerHTML=`P${r.position}<br><em>FINISH.</em>`;this.root.querySelector('.intro p')!.innerHTML=`레이스 완료 · ${formatTime(r.elapsed)}<br>베스트 랩 ${formatTime(r.best)}`;this.root.querySelector('#start')!.innerHTML='다시 도전 →';}
    this.text('countdown',r.state==='countdown'?(r.countdown>1?String(Math.ceil(r.countdown)-1):'GO'):'');
    const ctx=this.map;ctx.clearRect(0,0,240,190);ctx.lineWidth=7;ctx.strokeStyle='#ffffff18';ctx.stroke(this.path);ctx.lineWidth=2;ctx.strokeStyle='#b7c7c5';ctx.stroke(this.path);
    const dot=(t:number,color:string,size:number)=>{const p=this.mapPoint(track.point(t));ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
    r.opponents.forEach(o=>dot(o.distance,'#879caa',3));dot(v.progress,'#ff5746',5);
  }
}
