import './style.css';
import {Game} from './game/Game';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<div id="viewport"></div><div id="hud"></div><div class="boot-loading" role="status">서킷과 주행선을 준비하고 있습니다…</div>';
// Let the loading state paint before constructing a circuit and its AI lines.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  try{new Game(document.querySelector('#viewport')!,document.querySelector('#hud')!);document.querySelector('.boot-loading')?.remove();}
  catch(error){console.error(error);const loading=document.querySelector('.boot-loading');if(loading)loading.textContent='서킷을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.';}
}));
