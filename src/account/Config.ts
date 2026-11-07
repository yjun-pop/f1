export interface AccountConfig {supabaseUrl:string;publishableKey:string}
/** Only a public, RLS-constrained browser key belongs in the distributed build. */
export function accountConfig(value:unknown):AccountConfig|null{
 if(!value||typeof value!=='object')return null;
 const {supabaseUrl,publishableKey}=value as Record<string,unknown>;
 if(!supabaseUrl&&!publishableKey)return null;
 if(typeof supabaseUrl!=='string'||typeof publishableKey!=='string')throw Error('계정 서버 설정 형식이 올바르지 않습니다.');
 const url=new URL(supabaseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/')throw Error('올바른 Supabase HTTPS 프로젝트 주소가 필요합니다.');
 let valid=publishableKey.startsWith('sb_publishable_');
 if(publishableKey.startsWith('eyJ')){try{const body=JSON.parse(atob(publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));valid=body.role==='anon';}catch{valid=false;}}
 if(!valid)throw Error('publishable 또는 anon 공개 키만 사용할 수 있습니다. 비밀 키는 사용할 수 없습니다.');
 return {supabaseUrl:url.origin,publishableKey};
}
