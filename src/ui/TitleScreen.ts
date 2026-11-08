import './TitleScreen.css';
import {mountAccountButton,openAccount} from './AccountPanel';
import {account} from '../account/Account';
import {bootScreen} from './BootScreen';
import {openSettings} from './Settings';
/** Live race-film background; gameplay starts only after a quick-race choice. */
export class TitleScreen {
 readonly ready:Promise<void>;
 private element=document.createElement('main');
 private backdrop?:import('./TitleRaceScene').TitleRaceScene;
 private cancelled=false;
 get active(){return this.element.isConnected;}
 constructor(private host:HTMLElement,private quick:()=>()=>void){
 this.element.className='title-screen';this.element.setAttribute('aria-label','APEX FORMULA 시작 화면');
 this.element.innerHTML=`<div class="title-scene" aria-hidden="true"><img class="title-race-poster" src="${import.meta.env.BASE_URL}title-race-poster.webp" alt="" fetchpriority="high"></div>
 <div class="title-shade"></div><div class="title-content"><div class="title-logo" role="img" aria-label="APEX FORMULA"><svg viewBox="0 0 72 72" aria-hidden="true"><path d="M8 62L31 10H48L64 62H48L37 26 22 62Z" fill="currentColor"/><path d="M22 48H58L54 39H26Z" fill="#101c28"/></svg><div>APEX<span>FORMULA</span></div></div><p class="title-tagline">당신의 레이스가 시작되는 곳.</p><nav aria-label="메인 메뉴"><button id="title-new">새 게임 <span>CAREER</span></button><button id="title-continue" disabled>이어하기 <span>저장된 커리어 없음</span></button><button id="title-quick">퀵 레이스 <span>QUICK RACE ↗</span></button><button id="title-settings">환경설정 <span>SETTINGS</span></button></nav><p id="title-status" role="status">커리어 모드는 준비 중입니다. 퀵 레이스를 먼저 즐겨보세요.</p></div><button type="button" class="title-account" id="title-account">로그인 / 회원가입</button><div class="title-footer"><span>싱글플레이 · 8개 서킷</span><span>APEX FORMULA</span></div>`;
 this.host.replaceChildren(this.element);
 this.ready=this.prepareBackdrop();bootScreen.allowSkip(()=>this.usePoster());
 const unmountAccount=mountAccountButton(this.element.querySelector<HTMLButtonElement>('#title-account')!);
 void account.initialize().then(()=>{if(account.recovering)void openAccount();});
 this.element.querySelector('#title-new')!.addEventListener('click',()=>{this.element.querySelector('#title-status')!.textContent='커리어 모드는 개발 중입니다. 아카데미 훈련과 팀 계약부터 순차적으로 추가됩니다.';});
 this.element.querySelector('#title-settings')!.addEventListener('click',openSettings);
 this.element.querySelector('#title-quick')!.addEventListener('click',()=>{unmountAccount();this.cancelled=true;this.backdrop?.dispose();this.element.remove();this.quick();});
 }
 private async prepareBackdrop(){
  try{
   const {TitleRaceScene}=await import('./TitleRaceScene');if(this.cancelled)return;
   this.backdrop=new TitleRaceScene(this.element.querySelector('.title-scene')!);
   await this.backdrop.prepare((label,value)=>bootScreen.stage(label,value));
  }catch(error){console.warn('Title race background unavailable',error);this.usePoster();}
 }
 usePoster(){this.cancelled=true;this.backdrop?.dispose();this.element.querySelector<HTMLElement>('.title-scene')!.dataset.background='poster';}
}
