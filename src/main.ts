import './style.css';
import './ui/CircuitMenu.css';
import {CircuitMenu} from './ui/CircuitMenu';
import {circuitById,circuitURL,selectedCircuit,type CircuitId} from './game/Circuits';
import {transmissionMode,type TransmissionMode} from './game/Powertrain';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<div id="viewport"></div><div id="hud"></div><div id="front-menu"></div>';
const front=document.querySelector<HTMLElement>('#front-menu')!;
let savedCircuit:unknown,savedTransmission:unknown;
try{savedCircuit=localStorage.getItem('apex-circuit');savedTransmission=localStorage.getItem('apex-transmission-mode');}catch{}
const selected=selectedCircuit(window.location.search,savedCircuit),mode=transmissionMode(savedTransmission);
let launching=false;
function start(id:CircuitId,transmission:TransmissionMode){
  if(launching)return;launching=true;
  menu.setLoading(circuitById(id).label);
  try{localStorage.setItem('apex-circuit',id);localStorage.setItem('apex-transmission-mode',transmission);}catch{}
  try{window.history.replaceState(null,'',circuitURL(window.location.href,id));}catch{}
  // Preserve the start-button gesture for audio, before yielding a paint frame
  // and constructing the selected world. No renderer runs in the selection UI.
  let audioContext:AudioContext|undefined;
  try{audioContext=new AudioContext();void audioContext.resume().catch(()=>{});}catch{}
  requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    try{
      const {Game}=await import('./game/Game');
      new Game(document.querySelector('#viewport')!,document.querySelector('#hud')!,{circuit:id,transmission,autoStart:true,audioContext});
      // Game queues its first rendered frame first. Keep loading visible until
      // that frame, rather than briefly revealing an empty canvas or old menu.
      requestAnimationFrame(()=>{menu.dispose();front.remove();});
    }catch(error){console.error(error);void audioContext?.close().catch(()=>{});menu.setError();}
  }));
}
const menu=new CircuitMenu(front,{selected:selected.id,mode,prefix:'front-',keyboard:true,start,transmission:value=>{try{localStorage.setItem('apex-transmission-mode',value);}catch{}}});
// A confirmed choice from a completed race goes straight to its next grid.
// The intent is consumed by replaceState; refreshing returns to selection.
if(new URLSearchParams(window.location.search).get('race')==='start')start(selected.id,mode);
