import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import {accountConfig,type AccountConfig} from './Config';
import {readBest,writeBest,setRecordOwner} from '../game/RecordStore';
export const RECORD_CIRCUITS=['monza','silverstone','spa','monaco','suzuka','interlagos','singapore','montreal'] as const;
interface ServerRecord {circuit_id:string;best_seconds:number;updated_at:string}
export class Account extends EventTarget {
 recovering=false;client?:SupabaseClient;config:AccountConfig|null=null;session:Session|null=null;
 phase:'loading'|'unconfigured'|'ready'|'error'='loading';message='계정 서버 확인 중…';syncing=false;records:ServerRecord[]=[];
 private initialization?:Promise<void>;private generation=0;private running?:Promise<void>;private again=false;
 private pending=new Map<string,number>();
 initialize(){return this.initialization??=this.init();}
 private changed(){this.dispatchEvent(new Event('change'));if(typeof window!=='undefined')window.dispatchEvent(new Event('apex-account-change'));}
 private async init(){
  try{
   const response=await fetch(`${import.meta.env.BASE_URL}account-config.json`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('계정 설정을 불러오지 못했습니다.');
   this.config=accountConfig(await response.json());if(!this.config){this.phase='unconfigured';this.message='계정 서버 연결 준비 중입니다. 퀵 레이스는 게스트로 이용할 수 있습니다.';this.changed();return;}
   this.client=createClient(this.config.supabaseUrl,this.config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'apex-auth-session'},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(12000)})}});
   this.client.auth.onAuthStateChange((event,session)=>{const switched=this.session?.user.id!==session?.user.id;this.session=session;
    if(switched){if(!session)this.recovering=false;this.generation++;this.records=[];this.pending.clear();setRecordOwner(session?.user.id??null);}
    if(event==='PASSWORD_RECOVERY'){this.recovering=true;this.message='새 비밀번호를 설정하세요.';}
    this.changed();if(session&&switched)setTimeout(()=>void this.sync(),0);
   });
   const {data,error}=await this.client.auth.getSession();if(error)throw error;
   this.session=data.session;setRecordOwner(data.session?.user.id??null);this.phase='ready';this.message=this.recovering?'새 비밀번호를 설정하세요.':data.session?'기록을 불러오는 중…':'로그인하면 서킷별 기록을 서버에 저장합니다.';this.changed();
   window.addEventListener('apex-record-updated',event=>{const d=(event as CustomEvent).detail;if(d?.owner!==this.session?.user.id)return;const id=String(d.key).replace(/^apex-best-/,'').replace(/-v3$/,'');if(!RECORD_CIRCUITS.includes(id as typeof RECORD_CIRCUITS[number]))return;this.pending.set(id,Math.min(d.seconds,this.pending.get(id)??Infinity));void this.sync();});
   window.addEventListener('online',()=>void this.sync());
   if(this.session)await this.sync();
  }catch{this.phase='error';this.message='계정 서버 연결에 실패했습니다. 네트워크 또는 서버 설정을 확인하세요.';this.changed();}
 }
 get name(){const name=this.session?.user.user_metadata?.display_name;return typeof name==='string'&&name.trim()?name.slice(0,24):'드라이버';}
 private async data(path:string,token:string,body?:unknown){
  const response=await fetch(`${this.config!.supabaseUrl}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:this.config!.publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(response.status===401?'로그인이 만료됐습니다. 다시 로그인하세요.':response.status===409?'다른 기기에서 저장한 내용이 있습니다. 다시 불러오세요.':'서버 저장에 실패했습니다. 연결과 데이터베이스 구성을 확인한 뒤 다시 시도하세요.');
  return response.status===204?null:response.json();
 }
 sync(){
  if(this.running){this.again=true;return this.running;}
  this.running=this.syncOnce().finally(()=>{this.running=undefined;if(this.again){this.again=false;void this.sync();}});return this.running;
 }
 private async syncOnce(){
  const session=this.session,config=this.config;if(!session||!config)return;
  const generation=this.generation,uid=session.user.id,token=session.access_token;this.syncing=true;this.changed();
  try{
   const remote=await this.data(`race_records?user_id=eq.${encodeURIComponent(uid)}&select=circuit_id,best_seconds,updated_at`,token) as ServerRecord[];
   for(const id of RECORD_CIRCUITS){
    if(this.generation!==generation)return;
    const key=`apex-best-${id}-v3`,server=Number(remote.find(r=>r.circuit_id===id)?.best_seconds)||0;
    if(server>0)writeBest(key,server,uid,false);
    const local=Math.round(Math.min(readBest(key,uid)||Infinity,this.pending.get(id)??Infinity)*1000)/1000;
    if(local<Infinity&&(!server||local<server))await this.data('rpc/record_best_lap',token,{p_circuit:id,p_seconds:local});
    if(Math.round((this.pending.get(id)??Infinity)*1000)/1000>=local)this.pending.delete(id);
   }
   const result=await this.data(`race_records?user_id=eq.${encodeURIComponent(uid)}&select=circuit_id,best_seconds,updated_at`,token) as ServerRecord[];
   if(this.generation!==generation)return;this.records=result;this.message='서버 기록과 동기화했습니다.';
  }catch(error){if(this.generation===generation)this.message=(error as Error).message;}
  finally{this.syncing=false;this.changed();}
 }
 async signIn(email:string,password:string){await this.initialize();if(!this.client)throw Error(this.message);const {error}=await this.client.auth.signInWithPassword({email,password});if(error)throw Error(authError(error.message));await this.sync();}
 async signUp(email:string,password:string,name:string){await this.initialize();if(!this.client)throw Error(this.message);const {data,error}=await this.client.auth.signUp({email,password,options:{emailRedirectTo:redirectURL(),data:{display_name:name.trim().slice(0,24)}}});if(error)throw Error(authError(error.message));return data.session?'가입했습니다.':'가입 요청을 접수했습니다. 이메일의 인증 링크를 확인한 뒤 로그인하세요.';}
 async resetPassword(email:string){if(!this.client)throw Error(this.message);const {error}=await this.client.auth.resetPasswordForEmail(email,{redirectTo:redirectURL()});if(error)throw Error(authError(error.message));return '등록된 이메일이라면 비밀번호 재설정 안내가 전송됩니다.';}
 async changePassword(password:string){if(!this.client)throw Error(this.message);const {error}=await this.client.auth.updateUser({password});if(error)throw Error(authError(error.message));return '비밀번호를 변경했습니다.';}
 async signOut(){const {error}=await this.client!.auth.signOut({scope:'local'});if(error)throw Error('로그아웃하지 못했습니다. 다시 시도하세요.');this.session=null;this.generation++;this.records=[];this.pending.clear();setRecordOwner(null);this.message='로그아웃했습니다. 게스트 기록으로 돌아갑니다.';this.changed();}
 async importGuestRecords(){if(!this.session)return;for(const id of RECORD_CIRCUITS){const key=`apex-best-${id}-v3`,value=readBest(key,null);if(value)writeBest(key,value,this.session.user.id);}await this.sync();}
 async loadCareer(slot=1){if(!this.session)throw Error('로그인이 필요합니다.');return this.data(`career_saves?user_id=eq.${this.session.user.id}&slot=eq.${slot}&select=slot,revision,payload,updated_at`,this.session.access_token);}
 async saveCareer(payload:unknown,expectedRevision:number,slot=1){if(!this.session)throw Error('로그인이 필요합니다.');return this.data('rpc/save_career',this.session.access_token,{p_slot:slot,p_expected_revision:expectedRevision,p_payload:payload});}
}
function redirectURL(){const url=new URL(import.meta.env.BASE_URL,location.origin);return url.href;}
function authError(message:string){if(/invalid login/i.test(message))return '이메일 또는 비밀번호를 확인하세요.';if(/confirm/i.test(message))return '이메일 인증을 먼저 완료해주세요.';if(/rate|too many/i.test(message))return '요청이 많습니다. 잠시 후 다시 시도하세요.';if(/password/i.test(message))return '비밀번호 조건을 확인하세요. 최소 10자 이상을 권장합니다.';return '계정 요청을 처리하지 못했습니다. 입력 내용과 네트워크를 확인하세요.';}
export const account=new Account();
