import './style.css';
import './ui/CircuitMenu.css';
import './ui/RaceTiming.css';
import {CircuitMenu} from './ui/CircuitMenu';
import {circuitById,circuitURL,selectedCircuit,type CircuitId} from './game/Circuits';
import {transmissionMode,type TransmissionMode} from './game/Powertrain';

const app=document.querySelector<HTMLDivElement>('#app')!;
function quickRace(){
app.innerHTML='<div id="viewport"></div><div id="hud"></div><div id="menu-backdrop" class="circuit-backdrop" aria-hidden="true"></div><div id="front-menu"></div>';
const front=document.querySelector<HTMLElement>('#front-menu')!;
let savedCircuit:unknown,savedTransmission:unknown;
try{savedCircuit=localStorage.getItem('apex-circuit');savedTransmission=localStorage.getItem('apex-transmission-mode');}catch{}
const selected=selectedCircuit(window.location.search,savedCircuit),mode=transmissionMode(savedTransmission);
let launching=false;
let previewInteraction=false;
let backdrop:import('./ui/CircuitBackdrop').CircuitBackdrop|undefined,previewId=selected.id;
const backdropHost=document.querySelector<HTMLElement>('#menu-backdrop')!;
function preview(id:CircuitId){
  previewId=id;
  void import('./ui/CircuitBackdrop').then(({CircuitBackdrop})=>{
    if(launching||previewId!==id)return;
    try{backdrop??=new CircuitBackdrop(backdropHost);backdrop.setInteracting(previewInteraction);backdrop.select(id);}catch(error){console.warn('Menu background unavailable',error);}
  }).catch(error=>console.warn('Menu background unavailable',error));
}
function start(id:CircuitId,transmission:TransmissionMode){
  if(launching)return;launching=true;backdrop?.dispose();backdrop=undefined;
  menu.setLoading(circuitById(id).label);
  try{localStorage.setItem('apex-circuit',id);localStorage.setItem('apex-transmission-mode',transmission);}catch{}
  try{window.history.replaceState(null,'',circuitURL(window.location.href,id));}catch{}
  // Preserve the start-button gesture for audio, before yielding a paint frame
  // and constructing the selected racing world. The scenery renderer is stopped first.
  let audioContext:AudioContext|undefined;
  try{audioContext=new AudioContext();void audioContext.resume().catch(()=>{});}catch{}
  requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    try{
      const {Game}=await import('./game/Game');
      new Game(document.querySelector('#viewport')!,document.querySelector('#hud')!,{circuit:id,transmission,autoStart:true,audioContext});
      // Game queues its first rendered frame first. Keep loading visible until
      // that frame, rather than briefly revealing an empty canvas or old menu.
      requestAnimationFrame(()=>{dialogObserver.disconnect();menu.dispose();front.remove();});
    }catch(error){console.error(error);void audioContext?.close().catch(()=>{});menu.setError();}
  }));
}
const menu=new CircuitMenu(front,{selected:selected.id,mode,prefix:'front-',start,preview,wheel:()=>{
  previewInteraction=true;backdrop?.setInteracting(true);
  void import('./ui/Settings').then(module=>module.openSettings());
},transmission:value=>{try{localStorage.setItem('apex-transmission-mode',value);}catch{}}});
// Defer tour cuts while the user reads settings; camera drift stays active.
const updatePreviewInteraction=()=>{
  const focused=document.activeElement as HTMLElement|null;
  previewInteraction=!!document.querySelector('dialog[open]')||!!front.querySelector('details[open]')||!!focused?.closest?.('.menu-setup-summary');
  backdrop?.setInteracting(previewInteraction);
};
front.addEventListener('focusin',updatePreviewInteraction);
front.addEventListener('focusout',()=>queueMicrotask(updatePreviewInteraction));
front.addEventListener('toggle',updatePreviewInteraction,true);
// Wheel settings is a lazy dialog outside the menu subtree.
const dialogObserver=new MutationObserver(updatePreviewInteraction);
dialogObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
// A confirmed choice from a completed race goes straight to its next grid.
// The intent is consumed by replaceState; refreshing returns to selection.
if(new URLSearchParams(window.location.search).get('race')==='start')start(selected.id,mode);
else preview(selected.id);

const syncSettings=()=>{try{menu.setTransmission(transmissionMode(localStorage.getItem('apex-transmission-mode')));}catch{}};
window.addEventListener('apex-settings-change',syncSettings);

return ()=>{launching=true;window.removeEventListener('apex-settings-change',syncSettings);dialogObserver.disconnect();menu.dispose();backdrop?.dispose();front.remove();};
}
if(new URLSearchParams(window.location.search).has('circuit')||new URLSearchParams(window.location.search).get('race')==='start')quickRace();
else void import('./ui/TitleScreen').then(({TitleScreen})=>new TitleScreen(app,quickRace));
