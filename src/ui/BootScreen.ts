/** The HTML shell is visible before JS bundles arrive. Milestones describe real work. */
const root=()=>document.querySelector<HTMLElement>('#boot-screen');
let finished=false;
export const bootScreen={
 stage(label:string,value:number){const element=root();if(!element||finished)return;const text=element.querySelector('#boot-label');if(text)text.textContent=label;const progress=element.querySelector<HTMLProgressElement>('progress');if(progress)progress.value=value;},
 allowSkip(action:()=>void){const button=root()?.querySelector<HTMLButtonElement>('#boot-skip');if(button){button.hidden=false;button.onclick=()=>{action();this.finish();};}},
 finish(){const element=root();if(!element||finished)return;finished=true;document.querySelector('#app')?.removeAttribute('inert');element.setAttribute('aria-hidden','true');element.classList.add('is-finished');setTimeout(()=>element.remove(),350);},
 fail(){const element=root();if(!element||finished)return;const label=element.querySelector('#boot-label');if(label)label.textContent='화면을 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.';const retry=element.querySelector<HTMLElement>('#boot-retry');if(retry)retry.hidden=false;},
};
