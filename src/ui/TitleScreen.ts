import './TitleScreen.css';
import {mountAccountButton,openAccount} from './AccountPanel';
import {account} from '../account/Account';
import {QUICK_RACE_LAPS} from '../game/RaceLaps';
import {bootScreen} from './BootScreen';
import {openSettings} from './Settings';
import {CareerStore} from '../career/Store';
/** Live race-film background; gameplay starts only after a quick-race choice. */
export class TitleScreen {
 readonly ready:Promise<void>;
 private element=document.createElement('main');
 private backdrop?:import('./TitleRaceScene').TitleRaceScene;
 private cancelled=false;
 get active(){return this.element.isConnected;}
 constructor(private host:HTMLElement,private quick:(laps?:number)=>()=>void){
 this.element.className='title-screen';this.element.setAttribute('aria-label','APEX FORMULA 시작 화면');
 this.element.innerHTML=`<div class="title-scene" aria-hidden="true"><img class="title-race-poster" src="${import.meta.env.BASE_URL}title-race-poster.webp" alt="" fetchpriority="high"></div>
 <div class="title-shade"></div><div class="title-content"><div class="title-logo" role="img" aria-label="APEX FORMULA"><svg viewBox="0 0 72 72" aria-hidden="true"><path d="M8 62L31 10H48L64 62H48L37 26 22 62Z" fill="currentColor"/><path d="M22 48H58L54 39H26Z" fill="#101c28"/></svg><div>APEX<span>FORMULA</span></div></div><nav aria-label="메인 메뉴"><button id="title-new">새 게임</button><button id="title-continue">이어하기 <span>저장된 커리어 없음</span></button><div class="title-quick-group"><button id="title-quick" aria-expanded="false" aria-controls="title-lap-options">싱글 레이스 </button><div id="title-lap-options" class="title-lap-options" aria-label="싱글 레이스 랩 수" hidden>${QUICK_RACE_LAPS.map(laps=>`<button type="button" data-laps="${laps}">${laps} Lap</button>`).join('')}</div></div><button id="title-settings">환경설정</button></nav><p id="title-status" role="status" hidden></p></div><button type="button" class="title-account" id="title-account">로그인 / 회원가입</button>`;
 this.host.replaceChildren(this.element);
 this.ready=this.prepareBackdrop();bootScreen.allowSkip(()=>this.usePoster());
 const unmountAccount=mountAccountButton(this.element.querySelector<HTMLButtonElement>('#title-account')!);
 void account.initialize().then(()=>{if(account.recovering)void openAccount();});
 const newButton=this.element.querySelector<HTMLButtonElement>('#title-new')!,continueButton=this.element.querySelector<HTMLButtonElement>('#title-continue')!;
 continueButton.querySelector('span')!.textContent='';
 const status=this.element.querySelector<HTMLElement>('#title-status')!;
 const tell=(message:string)=>{status.hidden=false;status.textContent=message;};
 let entering=false;
 const career=async(fresh:boolean)=>{
  if(entering||!this.active)return;entering=true;newButton.disabled=continueButton.disabled=true;this.element.setAttribute('aria-busy','true');
  try{
   await account.initialize();if(!this.active)return;
   if(!account.session||account.recovering){await openAccount({reason:'커리어를 시작하거나 이어하려면 로그인해주세요.',onSignedIn:()=>{void career(fresh);}});return;}
   const owner=account.session.user.id;
   if(!fresh){tell('저장된 커리어를 확인하는 중…');const save=await new CareerStore(account).load();if(!this.active)return;if(account.session?.user.id!==owner)throw Error('계정이 변경됐습니다. 다시 선택해주세요.');if(!save){tell('저장된 커리어가 없습니다. 새 게임을 시작하세요.');newButton.focus();return;}}
   const url=new URL(location.href);url.search='';url.searchParams.set('career',fresh?'new':'continue');location.assign(url.href);
  }catch{tell('커리어를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.');}
  finally{entering=false;newButton.disabled=continueButton.disabled=false;this.element.removeAttribute('aria-busy');if(!status.hidden&&status.textContent?.includes('새 게임'))newButton.focus();}
 };
 newButton.addEventListener('click',()=>void career(true));continueButton.addEventListener('click',()=>void career(false));
 const entryURL=new URL(location.href),loginIntent=entryURL.searchParams.get('career-login');
 if(entryURL.searchParams.has('career-empty')){tell('저장된 커리어가 없습니다. 새 게임을 시작하세요.');entryURL.searchParams.delete('career-empty');history.replaceState(null,'',entryURL.href);}
 if(loginIntent){entryURL.searchParams.delete('career-login');history.replaceState(null,'',entryURL.href);void career(loginIntent==='new');}
 this.element.querySelector('#title-settings')!.addEventListener('click',openSettings);
 const group=this.element.querySelector<HTMLElement>('.title-quick-group')!,button=this.element.querySelector<HTMLButtonElement>('#title-quick')!,choices=this.element.querySelector<HTMLElement>('#title-lap-options')!;
 const expand=(open:boolean)=>{if(open&&!choices.hidden)return;choices.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open&&!matchMedia('(prefers-reduced-motion: reduce)').matches)choices.animate([{height:'0px',opacity:0},{height:choices.scrollHeight+'px',opacity:1}],{duration:180,easing:'ease-out'});};
 group.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')expand(true);});group.addEventListener('pointerleave',()=>{if(!group.contains(document.activeElement))expand(false);});
 group.addEventListener('focusin',()=>expand(true));group.addEventListener('focusout',()=>queueMicrotask(()=>{if(!group.contains(document.activeElement))expand(false);}));
 button.addEventListener('click',()=>{expand(true);choices.querySelector<HTMLButtonElement>('button')!.focus();});
 group.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();button.focus();expand(false);}if(event.key==='ArrowDown'&&event.target===button){event.preventDefault();expand(true);choices.querySelector<HTMLButtonElement>('button')!.focus();}});
 choices.querySelectorAll<HTMLButtonElement>('[data-laps]').forEach(choice=>choice.addEventListener('click',()=>{unmountAccount();this.cancelled=true;this.backdrop?.dispose();this.element.remove();this.quick(Number(choice.dataset.laps));}));
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
