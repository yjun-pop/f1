/** Guest records and each signed-in driver's cache are deliberately separate. */
let owner:string|null=null;
export function recordOwner(){return owner;}
export function setRecordOwner(id:string|null){owner=id;}
export function recordKey(key:string,id:string|null=owner){return id?`apex-user-${id}:${key}`:key;}
export function readBest(key:string,id:string|null=owner){try{const n=Number(localStorage.getItem(recordKey(key,id)));return Number.isFinite(n)&&n>0?n:0;}catch{return 0;}}
export function writeBest(key:string,seconds:number,id:string|null=owner,notify=true){
 if(!Number.isFinite(seconds)||seconds<=0)return false;
 const best=readBest(key,id);if(best&&best<=seconds)return true;
 let saved=true;try{localStorage.setItem(recordKey(key,id),String(seconds));}catch{saved=false;}
 if(notify&&id&&typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('apex-record-updated',{detail:{owner:id,key,seconds}}));
 return saved;
}
