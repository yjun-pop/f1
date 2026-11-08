import './RaceLobby.css';
import {opponentCount} from '../game/RaceLaps';
/** A separate participant screen. Slot edits are committed only on race start. */
export class RaceLobby {
 private dialog=document.createElement('dialog');private slots:boolean[];private previous=document.activeElement as HTMLElement|null;private closed=false;
 constructor(label:string,laps:number,count:number,private actions:{start:(count:number)=>void;back:()=>void}){
  this.slots=Array.from({length:11},(_,i)=>i<opponentCount(count));
  this.dialog.className='race-lobby';this.dialog.setAttribute('aria-labelledby','lobby-title');
  this.dialog.innerHTML=`<div class="lobby-shell"><header><button type="button" id="lobby-back">‹ 서킷 선택</button><span>APEX FORMULA</span></header><section class="lobby-heading"><p>SINGLE RACE</p><h1 id="lobby-title">참가 차량</h1><div id="lobby-circuit"></div></section><div class="lobby-tools"><p id="lobby-count" role="status"></p><div><button type="button" id="lobby-fill">모두 추가</button><button type="button" id="lobby-clear">모두 비우기</button></div></div><div class="lobby-slots" aria-label="참가 차량 슬롯"><article class="lobby-player"><span>YOU</span><b>플레이어</b><small>참가 확정</small></article>${this.slots.map((_,i)=>`<button type="button" data-slot="${i}" aria-pressed="false"></button>`).join('')}</div><footer><p>빈 슬롯을 눌러 AI를 추가하세요.</p><button type="button" id="lobby-start" class="ui-primary">레이스 시작 ↗</button></footer></div>`;
  this.dialog.querySelector('#lobby-circuit')!.textContent=`${label} · ${laps} Lap`;
  this.dialog.querySelector('#lobby-back')!.addEventListener('click',()=>this.back());
  this.dialog.querySelector('#lobby-fill')!.addEventListener('click',()=>{this.slots.fill(true);this.render();});
  this.dialog.querySelector('#lobby-clear')!.addEventListener('click',()=>{this.slots.fill(false);this.render();});
  this.dialog.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.slot);this.slots[i]=!this.slots[i];this.render();}));
  this.dialog.querySelector('#lobby-start')!.addEventListener('click',()=>{if(this.closed)return;const count=this.slots.filter(Boolean).length;this.dispose();this.actions.start(count);});
  this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.back();});
  this.dialog.addEventListener('keydown',e=>e.stopPropagation());this.dialog.addEventListener('keyup',e=>e.stopPropagation());
  document.body.append(this.dialog);this.render();this.dialog.showModal();(this.dialog.querySelector('#lobby-back') as HTMLElement).focus();
 }
 private render(){
  const count=this.slots.filter(Boolean).length;this.dialog.querySelector('#lobby-count')!.textContent=`플레이어 1대 + AI ${count}대 · 총 ${count+1}대`;
  this.dialog.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button,i)=>{const filled=this.slots[i];button.classList.toggle('is-filled',filled);button.setAttribute('aria-pressed',String(filled));button.setAttribute('aria-label',`${i+1}번 슬롯 · ${filled?'AI 제거':'AI 추가'}`);button.innerHTML=filled?'<span>AI</span><b>AI 차량</b><small>제거 −</small>':'<span class="slot-add">＋</span><b>AI 추가</b><small>빈 슬롯</small>';});
 }
 private back(){if(this.closed)return;this.dispose();this.actions.back();if(this.previous?.isConnected)this.previous.focus();}
 dispose(){if(this.closed)return;this.closed=true;this.dialog.close();this.dialog.remove();}
}
