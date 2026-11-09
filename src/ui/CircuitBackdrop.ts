import type {CircuitId} from '../game/Circuits';

const ids:readonly CircuitId[]=['monza','silverstone','spa','monaco','suzuka','interlagos','singapore','montreal'];
const cache=new Map<CircuitId,Promise<string>>();
export const circuitPosterURL=(id:CircuitId)=>`${import.meta.env.BASE_URL}circuit-posters/${id}.webp`;
/** Decode once, including while the title is visible. No racing world is created. */
export function preloadCircuitPoster(id:CircuitId){
 let ready=cache.get(id);if(ready)return ready;
 ready=new Promise<string>((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>{void image.decode().catch(()=>{}).then(()=>resolve(image.src));};image.onerror=()=>{cache.delete(id);reject(new Error(`Circuit image unavailable: ${id}`));};image.src=circuitPosterURL(id);});cache.set(id,ready);return ready;
}
export function warmCircuitPosters(){for(const id of ids)void preloadCircuitPoster(id).catch(()=>{});}

/** The menu displays pre-rendered images; Track/Three.js load only for racing. */
export class CircuitBackdrop {
 private selected?:CircuitId;private revision=0;private stopped=false;
 private current?:HTMLImageElement;private timers=new Set<number>();
 constructor(private host:HTMLElement){host.dataset.background='image';}
 select(id:CircuitId){
  if(this.stopped||this.selected===id)return;this.selected=id;const revision=++this.revision;
  void preloadCircuitPoster(id).then(src=>{
   if(this.stopped||revision!==this.revision)return;
   const image=new Image();image.alt='';image.decoding='async';image.className='circuit-poster';image.src=src;
   const outgoing=this.current;this.current=image;this.host.append(image);this.host.style.backgroundImage='';this.host.dataset.circuit=id;delete this.host.dataset.loadError;
   this.host.classList.add('is-ready');
   if(outgoing){image.style.opacity='0';requestAnimationFrame(()=>{if(!this.stopped&&this.current===image)image.style.opacity='1';});const timer=window.setTimeout(()=>{outgoing.remove();this.timers.delete(timer);},400);this.timers.add(timer);}
   else image.style.opacity='1';
  }).catch(()=>{
   if(this.stopped||revision!==this.revision)return;
   this.host.dataset.loadError=id;this.host.dataset.circuit=id;
   // A missing asset must not leave the boot overlay open indefinitely.
   this.host.replaceChildren();this.current=undefined;
   this.host.style.backgroundImage=`url("${import.meta.env.BASE_URL}title-race-poster.webp")`;
   this.host.classList.add('is-ready');
  });
 }
 dispose(){this.stopped=true;this.revision++;for(const timer of this.timers)window.clearTimeout(timer);this.timers.clear();this.host.replaceChildren();this.host.classList.remove('is-ready');}
}
