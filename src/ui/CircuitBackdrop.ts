import type {CircuitId} from '../game/Circuits';

const ids:readonly CircuitId[]=['monza','silverstone','spa','monaco','suzuka','interlagos','singapore','montreal'];
export const CIRCUIT_SHOTS=4,SHOT_HOLD_MS=3000,OVERLAP_MS=600;
const cache=new Map<string,Promise<string>>();
export const circuitPosterURL=(id:CircuitId,shot=0)=>`${import.meta.env.BASE_URL}circuit-posters/${id}${shot?`-${shot}`:''}.webp`;
/** Decode before display. Capturing these views never happens on the player's device. */
export function preloadCircuitPoster(id:CircuitId,shot=0){
 const key=`${id}:${shot}`;let ready=cache.get(key);if(ready)return ready;
 ready=new Promise<string>((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>{void image.decode().catch(()=>{}).then(()=>resolve(image.src));};image.onerror=()=>{cache.delete(key);reject(new Error(`Circuit image unavailable: ${key}`));};image.src=circuitPosterURL(id,shot);});cache.set(key,ready);return ready;
}
export function warmCircuitPosters(){for(const id of ids)void preloadCircuitPoster(id).catch(()=>{});}

/** Four baked views with compositor-only camera drift and overlapping cuts. */
export class CircuitBackdrop {
 private selected?:CircuitId;private revision=0;private stopped=false;private shot=0;
 private current?:HTMLImageElement;private timers=new Set<number>();private tourTimer=0;
 private reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 private visibility=()=>{this.cancelTour();if(!document.hidden&&this.selected)this.schedule(this.selected,(this.shot+1)%CIRCUIT_SHOTS,this.revision,SHOT_HOLD_MS);};
 constructor(private host:HTMLElement){host.dataset.background='image-tour';document.addEventListener('visibilitychange',this.visibility);this.reduced.addEventListener?.('change',this.visibility);}
 select(id:CircuitId){
  if(this.stopped||this.selected===id)return;this.selected=id;this.cancelTour();this.shot=0;
  void this.show(id,0,++this.revision);
 }
 private later(action:()=>void,delay:number){const timer=window.setTimeout(()=>{this.timers.delete(timer);action();},delay);this.timers.add(timer);return timer;}
 private cancelTour(){if(this.tourTimer){window.clearTimeout(this.tourTimer);this.timers.delete(this.tourTimer);this.tourTimer=0;}}
 private schedule(id:CircuitId,shot:number,revision:number,delay:number){
  this.cancelTour();if(this.stopped||document.hidden||this.reduced.matches)return;
  this.tourTimer=this.later(()=>{this.tourTimer=0;void this.show(id,shot,revision);},delay);
 }
 private async show(id:CircuitId,shot:number,revision:number){
  try{
   const src=await preloadCircuitPoster(id,shot);
   if(this.stopped||revision!==this.revision)return;
   const image=new Image();image.alt='';image.decoding='async';image.className=`circuit-poster motion-${shot%2}`;image.src=src;
   const outgoing=this.current;this.current=image;this.shot=shot;
   this.host.replaceChildren(...outgoing?[outgoing,image]:[image]);this.host.style.backgroundImage='';this.host.dataset.circuit=id;this.host.dataset.viewIndex=String(shot);delete this.host.dataset.loadError;
   this.host.classList.add('is-ready');
   const overlap=outgoing&&!this.reduced.matches?OVERLAP_MS:0;
   if(overlap){
    image.style.opacity='0';void image.offsetWidth;
    requestAnimationFrame(()=>{if(!this.stopped&&this.current===image){image.style.opacity='1';this.later(()=>outgoing!.remove(),OVERLAP_MS);this.schedule(id,(shot+1)%CIRCUIT_SHOTS,revision,SHOT_HOLD_MS+OVERLAP_MS);}});
   }else{
    image.style.opacity='1';outgoing?.remove();this.schedule(id,(shot+1)%CIRCUIT_SHOTS,revision,SHOT_HOLD_MS);
   }
   // The hold starts after the incoming layer has completed its overlap.
   for(let next=1;next<CIRCUIT_SHOTS;next++)void preloadCircuitPoster(id,next).catch(()=>{});
  }catch{
   if(this.stopped||revision!==this.revision)return;
   this.host.dataset.loadError=`${id}:${shot}`;
   if(!this.current||this.host.dataset.circuit!==id){this.host.replaceChildren();this.current=undefined;this.host.dataset.circuit=id;this.host.style.backgroundImage=`url("${import.meta.env.BASE_URL}title-race-poster.webp")`;this.host.classList.add('is-ready');}
   this.schedule(id,(shot+1)%CIRCUIT_SHOTS,revision,SHOT_HOLD_MS);
  }
 }
 dispose(){this.stopped=true;this.revision++;document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener?.('change',this.visibility);this.cancelTour();for(const timer of this.timers)window.clearTimeout(timer);this.timers.clear();this.host.replaceChildren();this.host.classList.remove('is-ready');}
}
