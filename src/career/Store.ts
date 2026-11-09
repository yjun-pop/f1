import {readCareer,type CareerSave} from './Career';
interface CareerAccount {session:{user:{id:string}}|null;loadCareer:()=>Promise<unknown>;saveCareer:(payload:unknown,revision:number)=>Promise<unknown>}
interface Cache {revision:number;payload:CareerSave;pending:boolean}
export class CareerStore {
 revision=0;readonly owner:string|null;private key:string;
 constructor(private account:CareerAccount){this.owner=account.session?.user.id??null;this.key=`apex-career-v1:${this.owner??'guest'}`;}
 private check(){if((this.account.session?.user.id??null)!==this.owner)throw Error('계정이 변경됐습니다. 메인 메뉴에서 다시 열어주세요.');}
 private cached():Cache|null{try{const c=JSON.parse(localStorage.getItem(this.key)??'null');return c&&Number.isSafeInteger(c.revision)&&c.revision>=0&&readCareer(c.payload)?c:null;}catch{return null;}}
 private cache(c:Cache){try{localStorage.setItem(this.key,JSON.stringify(c));}catch(error){if(!this.owner)throw error;}}
 private row(value:unknown){const row=(Array.isArray(value)?value[0]:value) as {revision?:number;payload?:unknown}|undefined;return row;}
 async load(serverOnly=false):Promise<CareerSave|null>{this.check();const local=this.cached();if(!this.owner){this.revision=0;return local?readCareer(local.payload):null;}
  const row=this.row(await this.account.loadCareer());this.check();this.revision=row?.revision??0;const saved=readCareer(row?.payload);
  if(row&&!saved)throw Error('호환되지 않는 커리어 저장 데이터입니다. 기존 저장을 덮어쓰지 않았습니다.');
  if(local?.pending&&!serverOnly&&local.payload.saveId!==saved?.saveId){if(local.revision!==this.revision)throw Error('다른 기기의 저장과 충돌했습니다. 서버 진행을 불러오거나 나중에 다시 확인하세요.');return this.save(local.payload);}
  if(saved)this.cache({revision:this.revision,payload:saved,pending:false});else try{localStorage.removeItem(this.key);}catch{}return saved;
 }
 async save(payload:CareerSave){this.check();if(!readCareer(payload))throw Error('저장 데이터 검증에 실패했습니다.');this.cache({revision:this.revision,payload,pending:!!this.owner});
  if(this.owner){let result:unknown;try{result=await this.account.saveCareer(payload,this.revision);}catch(error){
    // Resolve a response lost after the server committed; never overwrite a different save.
    try{const row=this.row(await this.account.loadCareer());this.check();if(readCareer(row?.payload)?.saveId===payload.saveId)result=row;else throw error;}catch{throw error;}
   }
   this.check();const row=this.row(result);if(!Number.isSafeInteger(row?.revision)||row!.revision!<=this.revision)throw Error('서버 저장 응답을 확인하지 못했습니다. 다시 불러오세요.');this.revision=row!.revision!;
  }
  this.cache({revision:this.revision,payload,pending:false});return structuredClone(payload);
 }
}
