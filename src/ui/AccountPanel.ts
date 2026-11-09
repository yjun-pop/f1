import './Settings.css';
import './RacingTheme.css';
import './AccountPanel.css';
import {account,RECORD_CIRCUITS} from '../account/Account';
import {formatTime} from '../game/RaceLaps';
let afterLogin:(()=>void)|undefined;
let dialog:HTMLDialogElement;let mode:'login'|'signup'|'reset'|'password'='login';let busy=false;let previous:HTMLElement|null=null;
function node<T extends HTMLElement=HTMLElement>(id:string){return dialog.querySelector<T>('#'+id)!;}
export async function openAccount(options?:{reason?:string;onSignedIn?:()=>void}){
 if(!dialog){dialog=document.createElement('dialog');dialog.className='settings-dialog account-dialog';dialog.setAttribute('aria-labelledby','account-title');dialog.innerHTML=`<div class="settings-head"><div><span class="ui-eyebrow">APEX FORMULA</span><h2 id="account-title">드라이버 계정</h2></div><button id="account-close" aria-label="계정 창 닫기">닫기 ✕</button></div><nav class="settings-tabs" id="account-tabs" aria-label="계정 메뉴"><button data-auth="login" aria-pressed="true">로그인</button><button data-auth="signup" aria-pressed="false">회원가입</button><button data-auth="reset" aria-pressed="false">비밀번호 찾기</button></nav><div class="settings-content"><section id="account-unavailable" hidden><h3>계정 서버 연결 준비 중</h3><p>현재는 게스트로 퀵 레이스를 이용할 수 있습니다. 계정 생성과 서버 저장은 서버 연결 후 활성화됩니다.</p></section><form id="account-form"><label id="account-name-label" hidden>드라이버 이름<input id="account-name" autocomplete="nickname" maxlength="24"></label><label id="account-email-label">이메일<input id="account-email" type="email" autocomplete="email" maxlength="254" required></label><label id="account-password-label">비밀번호<input id="account-password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><label id="account-password-confirm-label" hidden>비밀번호 확인<input id="account-password-confirm" type="password" autocomplete="new-password" maxlength="128"></label><p id="account-password-hint" hidden>비밀번호는 10자 이상 입력하세요. 이메일 인증이 필요할 수 있습니다.</p><button id="account-submit" class="ui-primary" type="submit">로그인</button></form><section id="account-signed-in" hidden><h3 id="account-driver"></h3><p id="account-email-info"></p><div class="account-sync-actions"><button id="account-sync">서버 기록 다시 확인</button><button id="account-import">이 기기의 게스트 기록 가져오기</button></div><p>계정별 기록은 게스트 및 다른 계정과 분리됩니다. 더 빠른 기록을 유지하며 동기화합니다.</p><p id="account-empty">저장된 서킷 기록이 없습니다.</p><dl class="account-records" id="account-records"></dl><button id="account-signout">로그아웃</button></section></div><div class="settings-bottom"><p id="account-status" role="status" aria-live="polite"></p></div>`;
 document.body.append(dialog);node('account-close').onclick=()=>dialog.close();dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());dialog.addEventListener('close',()=>{if(dialog.open)return;afterLogin=undefined;node<HTMLInputElement>('account-password').value='';node<HTMLInputElement>('account-password-confirm').value='';queueMicrotask(()=>previous?.isConnected&&previous.focus());});
 dialog.querySelectorAll<HTMLButtonElement>('[data-auth]').forEach(button=>button.onclick=()=>{mode=button.dataset.auth as typeof mode;node<HTMLInputElement>('account-password').value='';node<HTMLInputElement>('account-password-confirm').value='';render();});
 node<HTMLFormElement>('account-form').onsubmit=event=>{event.preventDefault();void perform(async()=>{const email=node<HTMLInputElement>('account-email').value.trim(),password=node<HTMLInputElement>('account-password').value;
  if(mode==='signup'||mode==='password'){if(password.length<10)throw Error('비밀번호는 10자 이상 입력해주세요.');if(password!==node<HTMLInputElement>('account-password-confirm').value)throw Error('비밀번호 확인이 일치하지 않습니다.');}
  if(mode==='signup'){const name=node<HTMLInputElement>('account-name').value.trim();if(!name)throw Error('드라이버 이름을 입력해주세요.');return account.signUp(email,password,name);}
  if(mode==='reset')return account.resetPassword(email);
  if(mode==='password'){const message=await account.changePassword(password);mode='login';account.recovering=false;return message;}
  await account.signIn(email,password);if(account.session&&afterLogin){const next=afterLogin;afterLogin=undefined;dialog.close();queueMicrotask(next);}return account.message;
 });};
 node('account-signout').onclick=()=>void perform(async()=>{await account.signOut();return account.message;});
 node('account-sync').onclick=()=>void perform(async()=>{await account.sync();return account.message;});
 node('account-import').onclick=()=>void perform(async()=>{await account.importGuestRecords();return account.message;});
 account.addEventListener('change',()=>{if(dialog.open){if(account.recovering)mode='password';render();}});
 }
 if(dialog.open){node('account-close').focus();return;}
 afterLogin=options?.onSignedIn;if(afterLogin&&!account.session)mode='login';previous=document.activeElement as HTMLElement;render();dialog.showModal();await account.initialize();if(account.recovering)mode='password';render();if(options?.reason&&!account.session)node('account-status').textContent=options.reason;
}
async function perform(action:()=>Promise<string>){if(busy)return;busy=true;render();node('account-status').textContent='처리 중…';try{node('account-status').textContent=await action();node<HTMLInputElement>('account-password').value='';node<HTMLInputElement>('account-password-confirm').value='';}catch(error){node('account-status').textContent=(error as Error).message;}finally{busy=false;render(false);}}
function render(status=true){
 if(!account.session&&!account.recovering&&mode==='password')mode='login';
 const ready=account.phase==='ready',logged=!!account.session,auth=!logged||mode==='password';
 node('account-unavailable').hidden=ready;node('account-form').hidden=!ready||!auth;node('account-tabs').hidden=!ready||logged;node('account-signed-in').hidden=!ready||auth;
 node('account-name-label').hidden=mode!=='signup';node<HTMLInputElement>('account-name').required=mode==='signup';
 node('account-email-label').hidden=mode==='password';node<HTMLInputElement>('account-email').required=mode!=='password';
 node('account-password-label').hidden=mode==='reset';node<HTMLInputElement>('account-password').required=mode!=='reset';node<HTMLInputElement>('account-password').minLength=mode==='login'?1:10;node<HTMLInputElement>('account-password').autocomplete=mode==='login'?'current-password':'new-password';
 node('account-password-confirm-label').hidden=mode!=='signup'&&mode!=='password';node<HTMLInputElement>('account-password-confirm').required=mode==='signup'||mode==='password';node('account-password-hint').hidden=mode!=='signup'&&mode!=='password';
 node('account-submit').textContent=busy?'처리 중…':{login:'로그인',signup:'계정 만들기',reset:'재설정 이메일 받기',password:'새 비밀번호 저장'}[mode];
 dialog.querySelectorAll<HTMLButtonElement>('[data-auth]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.auth===mode));button.disabled=busy;});
 for(const id of ['account-submit','account-signout','account-sync','account-import'])node<HTMLButtonElement>(id).disabled=busy||!ready;
 node('account-driver').textContent=account.name;node('account-email-info').textContent=account.session?.user.email??'';
 node('account-records').replaceChildren(...RECORD_CIRCUITS.flatMap(id=>{const record=account.records.find(r=>r.circuit_id===id);if(!record)return [];const row=document.createElement('div'),name=document.createElement('dt'),time=document.createElement('dd');name.textContent=id.toUpperCase();time.textContent=formatTime(Number(record.best_seconds));row.append(name,time);return [row];}));node('account-empty').hidden=account.records.length>0;
 if(status)node('account-status').textContent=account.syncing?'서버 기록을 동기화하는 중…':account.message;
}
export function mountAccountButton(button:HTMLButtonElement){
 button.onclick=()=>void openAccount();const update=()=>{button.textContent=account.phase==='loading'?'계정 확인 중…':account.phase==='unconfigured'?'계정 · 연결 준비 중':account.phase==='error'?'계정 · 연결 오류':account.session?`${account.name} · 계정`:'로그인 / 회원가입';};account.addEventListener('change',update);update();void account.initialize();
 return ()=>account.removeEventListener('change',update);
}
