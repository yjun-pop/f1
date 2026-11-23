import './AcademyHUD.css';
import {ACADEMY_TESTS,type TutorialStatus,type AcademyAction} from '../game/AcademyLessons';

export function academyPrompt(state:TutorialStatus,lesson:number){
 const action=state.action??(lesson===1?'brake':lesson===3?'boost':'throttle'),wheel=state.device==='wheel',left=state.direction!=='right';
 const keys:Record<AcademyAction,string>={coast:wheel?'가속 페달 놓기':'W 놓기',throttle:wheel?'가속 페달':'W',brake:wheel?'브레이크 페달':'S',steer:wheel?(left?'휠을 왼쪽으로':'휠을 오른쪽으로'):(left?'A':'D'),boost:wheel&&state.boostButton!=null?`휠 버튼 ${state.boostButton+1}`:'Shift'};
 const instructions:Record<AcademyAction,string>={coast:'가속을 놓고 전방을 보세요',throttle:'가속을 시작하세요',brake:'브레이크를 밟으세요',steer:left?'왼쪽으로 조향하세요':'오른쪽으로 조향하세요',boost:'추가 출력을 사용하세요'};
 return {key:keys[action],instruction:state.ready?'준비되면 출발하세요':instructions[action],support:state.releaseRequired?'누르고 있는 입력을 놓은 뒤 다시 눌러주세요':action==='steer'?'브레이크를 놓고 조향하세요':action==='boost'?(wheel&&state.boostButton==null?'가속 페달을 유지하며 Shift를 누르세요':'가속을 유지한 채 누르세요'):'',action};
}

/** Stable HUD nodes, one native result dialog, and no per-frame focus changes. */
export class AcademyHUD {
 readonly overlay=document.createElement('section');
 private coach=document.createElement('section');private cue=document.createElement('section');private announcer=document.createElement('span');private result=document.createElement('dialog');
 private hud:HTMLElement;private phase?:TutorialStatus['phase'];private announcement='';
 constructor(root:HTMLElement,private lesson:number,private actions:{confirm:()=>void;retry:()=>void;leave:()=>void;practice?:boolean}){
  this.coach.className='academy-driving-cue';this.coach.hidden=true;this.coach.innerHTML='<kbd></kbd><span></span>';const test=ACADEMY_TESTS[lesson];this.hud=root.querySelector<HTMLElement>('#hud')!;
  this.overlay.className='academy-overlay academy-live-goal';this.overlay.setAttribute('aria-label','현재 연습 목표');
  this.overlay.innerHTML=`<div class="academy-heading"><span>연습 ${lesson+1} / 4</span><b class="academy-phase"></b></div><h3>${test.title}</h3><p class="academy-target"></p><div class="academy-checkpoints"></div>`;
  this.cue.className='academy-input-cue';this.cue.hidden=true;this.cue.setAttribute('role','group');this.cue.setAttribute('aria-labelledby','academy-cue-title');
  this.cue.innerHTML='<span class="academy-cue-state">입력 대기</span><h2 id="academy-cue-title"></h2><kbd class="academy-cue-key"></kbd><p class="academy-cue-support"></p><div class="academy-input-track" aria-hidden="true"><span></span></div>';
  this.announcer.className='academy-announcer';this.announcer.setAttribute('role','status');this.announcer.setAttribute('aria-live','polite');this.announcer.setAttribute('aria-atomic','true');
  this.result.className='academy-result';this.result.dataset.academyResult='true';this.result.setAttribute('aria-labelledby','academy-result-title');this.result.setAttribute('aria-describedby','academy-result-reason');
  this.result.addEventListener('cancel',e=>{e.preventDefault();if(this.phase==='failed')this.actions.leave();});
  this.result.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(this.phase==='failed')this.actions.leave();}});this.result.addEventListener('keyup',e=>e.stopPropagation());
  root.append(this.overlay,this.cue,this.coach,this.announcer);document.body.append(this.result);
 }
 update(state:TutorialStatus){
  const changed=this.phase!==state.phase,prompt=academyPrompt(state,this.lesson);this.phase=state.phase;this.coach.hidden=state.phase!=='driving';this.coach.dataset.urgent=String(!!state.urgent);this.coach.querySelector('kbd')!.textContent=prompt.key;this.coach.querySelector('span')!.textContent=state.cue;this.hud.dataset.tutorialPhase=state.phase;
  this.overlay.querySelector('.academy-phase')!.textContent=({approach:'시범 주행',waiting:'입력 대기',driving:'주행 중',success:'통과',failed:'재시도'} as const)[state.phase];
  this.overlay.querySelector('.academy-target')!.textContent=state.cue;
  const checks=state.checkpoints??[];const checkRoot=this.overlay.querySelector('.academy-checkpoints')!;
  if(checkRoot.children.length!==checks.length)checkRoot.replaceChildren(...checks.map(()=>document.createElement('span')));
  checks.forEach((check,i)=>{const node=checkRoot.children[i] as HTMLElement;node.textContent=`${check.complete?'✓':'○'} ${check.label}`;node.dataset.complete=String(check.complete);});
  if(changed){if(state.phase==='success'||state.phase==='failed'){this.cue.hidden=true;this.showResult(state);}else{this.closeResult();this.cue.hidden=state.phase!=='waiting';}}
  if(state.phase==='waiting'){
   this.cue.hidden=false;this.cue.classList.remove('is-received');this.cue.querySelector('.academy-cue-state')!.textContent=state.releaseRequired?'입력 놓기':'입력 대기';
   this.cue.querySelector('#academy-cue-title')!.textContent=state.releaseRequired?'입력을 놓았다가 다시 눌러주세요':prompt.instruction;
   this.cue.querySelector('.academy-cue-key')!.textContent=prompt.key;
   this.cue.querySelector('.academy-cue-support')!.textContent=prompt.support;
  }
  this.cue.querySelector<HTMLElement>('.academy-input-track span')!.style.width=`${Math.round(Math.max(0,Math.min(1,state.inputValue??0))*100)}%`;
  this.cue.classList.toggle('has-input',(state.inputValue??0)>.1);
  const announcement=`${state.phase}/${prompt.action}/${state.direction}/${state.releaseRequired}/${checks.map(c=>c.complete).join(',')}`;
  if(announcement!==this.announcement){this.announcement=announcement;if(state.phase==='waiting')this.announcer.textContent=`입력 대기. ${state.releaseRequired?'입력을 먼저 놓으세요.':prompt.instruction}. ${prompt.key}. ${prompt.support}`;else if(state.phase==='driving'||state.phase==='approach')this.announcer.textContent=state.cue;}
 }
 private showResult(state:TutorialStatus){
  const success=state.phase==='success';this.result.dataset.result=state.phase;this.result.innerHTML=`<div class="academy-trial-card"><span>${success?'✓ 연습 완료':'다시 도전'}</span><h2 id="academy-result-title">${success?'목표를 달성했습니다':'다시 시도하세요'}</h2><p id="academy-result-reason"></p><div class="academy-result-actions">${success?`<button id="academy-confirm" class="primary">${this.actions.practice?'준비 화면으로 →':'저장하고 준비 화면으로 →'}</button>`:'<button id="academy-retry" class="primary">다시 시도 →</button><button id="academy-leave">훈련 준비로 <small>Esc</small></button>'}</div></div>`;
  this.result.querySelector('#academy-result-reason')!.textContent=success?ACADEMY_TESTS[this.lesson].title:state.cue;
  const bind=(id:string,fn:()=>void)=>this.result.querySelector('#'+id)?.addEventListener('click',fn);bind('academy-confirm',this.actions.confirm);bind('academy-retry',()=>{this.closeResult();this.actions.retry();});bind('academy-leave',this.actions.leave);
  this.hud.inert=true;if(!this.result.open)this.result.showModal();this.result.querySelector<HTMLElement>(success?'#academy-confirm':'#academy-retry')!.focus();
 }
 private closeResult(){if(this.result.open)this.result.close();this.result.replaceChildren();this.hud.inert=false;}
 dispose(){this.closeResult();this.result.remove();this.cue.remove();this.coach.remove();this.announcer.remove();this.overlay.remove();}
}
