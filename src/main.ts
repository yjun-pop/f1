import './style.css';
import './ui/CircuitMenu.css';
import './ui/RaceTiming.css';
import './ui/RacingTheme.css';
import {bootScreen} from './ui/BootScreen';
import {CircuitMenu} from './ui/CircuitMenu';
import {CircuitBackdrop,preloadCircuitPoster,warmCircuitPosters} from './ui/CircuitBackdrop';
import {quickRaceLaps,opponentCount} from './game/RaceLaps';
import {circuitById,circuitURL,selectedCircuit,type CircuitId} from './game/Circuits';
import {transmissionMode,type TransmissionMode} from './game/Powertrain';

bootScreen.stage('메뉴를 준비하는 중…',1);
const accountReady=import('./account/Account').then(async({account})=>{await account.initialize();return account;});
const app=document.querySelector<HTMLDivElement>('#app')!;
let posterCircuit:unknown;try{posterCircuit=localStorage.getItem('apex-circuit');}catch{}
void preloadCircuitPoster(selectedCircuit(window.location.search,posterCircuit).id).then(()=>window.setTimeout(warmCircuitPosters,400)).catch(()=>{});
function quickRace(totalLaps:number=quickRaceLaps(new URLSearchParams(window.location.search).get('laps'))){
totalLaps=quickRaceLaps(totalLaps);
const sessionURL=new URL(window.location.href);sessionURL.searchParams.set('laps',String(totalLaps));window.history.replaceState(null,'',sessionURL.href);
app.innerHTML='<div id="viewport"></div><div id="hud"></div><div id="menu-backdrop" class="circuit-backdrop" aria-hidden="true"></div><div id="front-menu"></div>';
const front=document.querySelector<HTMLElement>('#front-menu')!;
let savedCircuit:unknown,savedTransmission:unknown;
try{savedCircuit=localStorage.getItem('apex-circuit');savedTransmission=localStorage.getItem('apex-transmission-mode');}catch{}
const selected=selectedCircuit(window.location.search,savedCircuit),mode=transmissionMode(savedTransmission);
let rivals=opponentCount(new URLSearchParams(window.location.search).get('opponents'));
let launching=false,lobbyOpening=false;let lobby:import('./ui/RaceLobby').RaceLobby|undefined;
let backdrop:import('./ui/CircuitBackdrop').CircuitBackdrop|undefined;
let bootObserver:MutationObserver|undefined;
let previewDisabled=false;
const backdropHost=document.querySelector<HTMLElement>('#menu-backdrop')!;
bootScreen.allowSkip(()=>{previewDisabled=true;bootObserver?.disconnect();backdrop?.dispose();backdrop=undefined;});
function preview(id:CircuitId){
  if(launching||previewDisabled)return;
  try{
    backdrop??=new CircuitBackdrop(backdropHost);backdrop.select(id);
    if(document.querySelector('#boot-screen')){
      const finish=()=>{if(backdropHost.classList.contains('is-ready')){bootObserver?.disconnect();bootScreen.finish();}};
      bootObserver?.disconnect();bootObserver=new MutationObserver(finish);
      bootObserver.observe(backdropHost,{attributes:true,attributeFilter:['class']});finish();
    }
  }catch(error){console.warn('Menu background unavailable',error);bootObserver?.disconnect();bootScreen.finish();}
}
function start(id:CircuitId,transmission:TransmissionMode){
  if(launching)return;launching=true;bootObserver?.disconnect();backdrop?.dispose();backdrop=undefined;
  const raceURL=new URL(window.location.href);raceURL.searchParams.set('opponents',String(rivals));window.history.replaceState(null,'',raceURL.href);
  menu.setLoading(circuitById(id).label);
  try{localStorage.setItem('apex-circuit',id);localStorage.setItem('apex-transmission-mode',transmission);}catch{}
  try{window.history.replaceState(null,'',circuitURL(window.location.href,id));}catch{}
  // Preserve the start-button gesture for audio, before yielding a paint frame
  // and constructing the selected racing world. The scenery renderer is stopped first.
  let audioContext:AudioContext|undefined;
  try{audioContext=new AudioContext();void audioContext.resume().catch(()=>{});}catch{}
  requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    try{
      const activeAccount=await accountReady;await activeAccount.sync();
      const {Game}=await import('./game/Game');
      new Game(document.querySelector('#viewport')!,document.querySelector('#hud')!,{circuit:id,transmission,autoStart:true,audioContext,totalLaps,opponentCount:rivals});
      // Game queues its first rendered frame first. Keep loading visible until
      // that frame, rather than briefly revealing an empty canvas or old menu.
      requestAnimationFrame(()=>{window.removeEventListener('apex-account-change',refreshRecords);menu.dispose();front.remove();bootScreen.finish();});
    }catch(error){console.error(error);void audioContext?.close().catch(()=>{});menu.setError();bootScreen.finish();}
  }));
}
function configure(id:CircuitId,transmission:TransmissionMode){
  if(launching||lobbyOpening||lobby)return;lobbyOpening=true;
  void import('./ui/RaceLobby').then(({RaceLobby})=>{if(launching)return;lobbyOpening=false;
    lobby=new RaceLobby(circuitById(id).label,totalLaps,rivals,{start:count=>{lobby=undefined;rivals=count;start(id,transmission);},back:()=>{lobby=undefined;}});
  }).catch(error=>{lobbyOpening=false;console.error('Participant screen unavailable',error);menu.setError();});
}
const menu=new CircuitMenu(front,{selected:selected.id,mode,totalLaps,opponents:rivals,configure,prefix:'front-',start,preview,wheel:()=>{

  void import('./ui/Settings').then(module=>module.openSettings());
},account:()=>{void import('./ui/AccountPanel').then(m=>m.openAccount());},transmission:value=>{try{localStorage.setItem('apex-transmission-mode',value);}catch{}}});
// A confirmed choice from a completed race goes straight to its next grid.
// The intent is consumed by replaceState; refreshing returns to selection.
if(new URLSearchParams(window.location.search).get('race')==='start')start(selected.id,mode);
else preview(selected.id);

const refreshRecords=()=>menu.refreshRecords();window.addEventListener('apex-account-change',refreshRecords);
const syncSettings=()=>{try{menu.setTransmission(transmissionMode(localStorage.getItem('apex-transmission-mode')));}catch{}};
window.addEventListener('apex-settings-change',syncSettings);

return ()=>{launching=true;lobby?.dispose();bootObserver?.disconnect();window.removeEventListener('apex-account-change',refreshRecords);window.removeEventListener('apex-settings-change',syncSettings);menu.dispose();backdrop?.dispose();front.remove();};
}
if(new URLSearchParams(window.location.search).has('circuit')||new URLSearchParams(window.location.search).get('race')==='start')quickRace();
else void import('./ui/TitleScreen').then(({TitleScreen})=>{const title=new TitleScreen(app,quickRace);void title.ready.then(()=>{if(title.active)bootScreen.finish();});}).catch(error=>{console.error('Title screen unavailable',error);bootScreen.fail();});
