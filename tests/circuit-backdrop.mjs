import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const three=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const mocks=url(`export * from '${three}';export class WebGLRenderer {
 constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.renders=0;globalThis.fixture.renderers.push(this);}
 setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}
 render(scene,camera){if(scene.userData.id===fixture.failRender)throw Error('GPU warmup failed');this.renders++;this.domElement.frame=scene.userData.id+':'+camera.position.toArray().join(',');}
 renderLists={dispose(){}};dispose(){this.disposed=true;}forceContextLoss(){this.lost=true;}
}`);
const deps=url(`import * as THREE from '${three}';export const CIRCUITS=['monza','silverstone','spa','monaco','suzuka','interlagos','singapore','montreal'].map(id=>({id}));export const circuitById=id=>({id});export const environmentFor=()=>({exposure:1});
 export class Track {constructor(scene,circuit){this.circuit=circuit;this.group=new THREE.Group();this.sections=Array.from({length:19},(_,i)=>({number:i+1,name:'AREA '+i,progress:i/19}));scene.userData.id=circuit.id;scene.add(this.group);fixture.built.push(circuit.id);const geometry=new THREE.BoxGeometry();geometry.addEventListener('dispose',()=>fixture.freed.push(circuit.id));fixture.shared??=new THREE.Texture();const material=new THREE.MeshBasicMaterial({map:fixture.shared});this.group.add(new THREE.Mesh(geometry,material));}roadPoint(t){return new THREE.Vector3(t*100,0,0);}tangent(){return new THREE.Vector3(0,0,1);}roadNormal(){return new THREE.Vector3(1,0,0);}updatePresentation(){}}
 export class WorldLighting {sun={target:new THREE.Object3D(),position:new THREE.Vector3()};sunOffset=new THREE.Vector3(0,10,0);dispose(){fixture.lightingFreed++;}}
`);
let js=ts.transpileModule(fs.readFileSync(new URL('../src/ui/CircuitBackdrop.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
js=js.replace(/from 'three'/g,`from '${mocks}'`).replace(/from '\.\.\/game\/\w+'/g,`from '${deps}'`);
const {CircuitBackdrop}=await import(url(js));
function environment(reduced=false,idleAPI=true){
 let now=0,serial=0;const timers=new Map(),frames=new Map(),idles=new Map(),listeners=new Map(),canvases=[];
 const opacity=e=>{const t=e.tween;if(!t)return e.classes?.has('is-ready')?1:0;if(t.duration===0)return t.to;return t.from+(t.to-t.from)*Math.min(1,(now-t.at)/Math.max(.001,t.duration));};
 function node(canvas=false){
  const classes=new Set(),e={classes,dataset:{},width:0,height:0,offsetWidth:1,children:[],ops:[],globalAlpha:1,
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
   setAttribute(){},append(c){e.children.push(c);},remove(){e.removed=true;}};
  const style={transition:''};Object.defineProperty(style,'opacity',{get:()=>String(e.tween?.to??0),set:value=>{e.tween={from:opacity(e),to:Number(value),at:now,duration:style.transition==='none'?0:600};}});e.style=style;
  e.getContext=()=>({get globalAlpha(){return e.globalAlpha;},set globalAlpha(v){e.globalAlpha=v;},drawImage(source){e.ops.push({source:source.frame,alpha:e.globalAlpha});e.frame=source.frame;}});
  if(canvas)canvases.push(e);return e;
 }
 globalThis.fixture={built:[],freed:[],lightingFreed:0,renderers:[]};
 globalThis.document={hidden:false,createElement:()=>node(true),addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 globalThis.window={innerWidth:1280,innerHeight:720,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),addEventListener(){},removeEventListener(){},setTimeout(f,ms){const id=++serial;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 if(idleAPI){window.requestIdleCallback=f=>{const id=++serial;idles.set(id,f);return id;};window.cancelIdleCallback=id=>idles.delete(id);}
 globalThis.getComputedStyle=e=>({opacity:String(opacity(e))});
 globalThis.requestAnimationFrame=f=>{const id=++serial;frames.set(id,f);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const host=node(),backdrop=new CircuitBackdrop(host);
 const advance=ms=>{const end=now+ms;for(let limit=0;limit<10000;limit++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;return;}now=next[1].at;timers.delete(next[0]);next[1].f();}throw Error('Timer loop');};
 const paint=()=>{now+=16;const next=frames.entries().next().value;if(next){frames.delete(next[0]);next[1](now);}};
 return {host,backdrop,advance,paint,canvases,opacity,idle(){const next=idles.entries().next().value;if(next){idles.delete(next[0]);next[1]();}},get idles(){return idles.size;},hide(value){document.hidden=value;listeners.get('visibilitychange')?.();},get timers(){return timers.size;},get frames(){return frames.size;}};
}
let e=environment(),b=e.backdrop;b.select('monza');e.advance(0);e.paint();
assert.equal(e.host.dataset.viewIndex,'0');e.advance(2999);assert.equal(e.host.dataset.viewIndex,'0');e.advance(1);
assert.equal(e.host.dataset.viewIndex,'1');assert.equal(e.host.classList.contains('is-ready'),true);assert.equal(e.opacity(b.overlap),1);assert.ok(b.overlap.width>1);
const outgoing=b.overlap.frame;e.paint();assert.notEqual(b.renderer.domElement.frame,outgoing);e.advance(300);
assert.ok(e.opacity(b.overlap)>.4&&e.opacity(b.overlap)<.6);assert.equal(e.opacity(e.host),1);assert.equal(fixture.renderers.length,1);
e.advance(332);assert.equal(b.overlap.width,1);assert.equal(e.host.dataset.transition,'idle');
e.advance(2999);assert.equal(e.host.dataset.viewIndex,'1');e.advance(1);assert.equal(e.host.dataset.viewIndex,'2');
console.log('PASS: opaque live incoming scene under a fading outgoing snapshot, one WebGL renderer, and 3s full visibility after each overlap');
e.paint();e.advance(300);b.select('spa');b.select('monaco');e.advance(0);assert.ok(e.canvases.some(c=>c.ops.some(op=>op.alpha>0&&op.alpha<1)),'A rapid selection preserves the visible composite');e.advance(0);e.paint();assert.deepEqual(fixture.built,['monza','monaco']);assert.equal(e.host.dataset.circuit,'monaco');assert.equal(e.host.classList.contains('is-ready'),true);
e.advance(632);b.setInteracting(true);const view=e.host.dataset.viewIndex;e.advance(10000);assert.equal(e.host.dataset.viewIndex,view);b.setInteracting(false);
e.hide(true);e.advance(10000);assert.equal(e.host.dataset.viewIndex,view);e.hide(false);e.advance(2999);assert.equal(e.host.dataset.viewIndex,view);e.advance(1);assert.notEqual(e.host.dataset.viewIndex,view);
console.log('PASS: latest map wins, mid-overlap selection retains the composite, and hidden/configuration states pause automatic cuts');
e.paint();const renderer=b.renderer,renders=renderer.renders;b.dispose();e.advance(20000);assert.equal(renderer.renders,renders);assert.equal(e.frames,0);assert.equal(e.timers,0);assert.equal(b.overlap.width,1);assert.ok(renderer.disposed&&renderer.lost&&e.host.removed);
console.log('PASS: disposing during an overlap releases the snapshot, render context, animation frame and pending timers');
e=environment(true);b=e.backdrop;b.select('monza');e.advance(0);e.paint();e.advance(15000);assert.equal(e.host.dataset.viewIndex,'0');b.select('spa');e.advance(0);e.paint();assert.equal(e.host.dataset.circuit,'spa');assert.equal(b.overlap.width,1);b.dispose();console.log('PASS: reduced motion keeps automatic tours still and changes maps without overlap animation');

// Adjacent worlds are prepared before the user clicks, with one renderer and
// bounded ownership. A warm switch never waits for a loading/debounce timer.
e=environment();b=e.backdrop;b.select('monza');e.advance(0);e.paint();
assert.equal(e.idles,1);const cameraBefore=b.camera.position.clone(),viewBefore=e.host.dataset.view;b.renderer.toneMappingExposure=1.23;const shadowsBefore=b.renderer.shadowMap.needsUpdate;e.idle();e.idle();assert.equal(b.renderer.toneMappingExposure,1.23);assert.equal(b.renderer.shadowMap.needsUpdate,shadowsBefore);assert.ok(b.camera.position.equals(cameraBefore));assert.equal(e.host.dataset.view,viewBefore);assert.ok(b.renderer.domElement.frame.startsWith('monza:'));assert.equal(b.worlds.size,3);assert.deepEqual(fixture.built,['monza','silverstone','montreal']);
let sharedFreed=0;fixture.shared.addEventListener('dispose',()=>sharedFreed++);
b.select('silverstone');assert.equal(e.host.dataset.circuit,'silverstone');assert.equal(e.opacity(b.overlap),1);assert.equal(fixture.built.length,3);assert.equal(b.changing,false);
e.paint();assert.equal(b.overlap.style.opacity,'0','A prepared map begins overlap in the first render after selection');e.advance(632);e.idle();
assert.ok(b.worlds.has('spa'));assert.equal(b.worlds.size,3);assert.ok(fixture.freed.includes('montreal'));assert.equal(sharedFreed,0,'Eviction must retain textures used by other cached worlds');
b.select('spa');b.select('silverstone');assert.equal(e.host.dataset.circuit,'silverstone');assert.equal(fixture.built.length,4);assert.equal(fixture.renderers.length,1);
b.select('monaco');const moving=b.renderer.renders;e.paint();assert.ok(b.renderer.renders>moving,'The outgoing world keeps rendering while a cold selection is pending');b.select('suzuka');e.advance(0);e.paint();assert.equal(e.host.dataset.circuit,'suzuka');assert.equal(fixture.built.includes('monaco'),false);assert.ok(b.worlds.size<=3);
b.dispose();assert.equal(e.idles,0);assert.equal(e.timers,0);assert.equal(sharedFreed,1);assert.equal(fixture.lightingFreed,fixture.built.length);assert.equal(new Set(fixture.freed).size,new Set(fixture.built).size);
console.log('PASS: prepared neighbours switch on selection, overlap in the next frame, retain one renderer and at most three worlds, and release cached/shared resources');
e=environment(false,false);b=e.backdrop;b.select('monza');e.advance(0);e.paint();e.advance(200);assert.ok(b.worlds.has('silverstone'));e.hide(true);const built=fixture.built.length;e.advance(10000);assert.equal(fixture.built.length,built);e.hide(false);b.setInteracting(true);e.advance(10000);assert.equal(fixture.built.length,built);b.dispose();assert.equal(e.timers,0);
console.log('PASS: idle-callback fallback, hidden tabs and open settings cancel background preparation');

e=environment();b=e.backdrop;b.select('monza');e.advance(0);e.paint();fixture.failRender='silverstone';const warn=console.warn;try{console.warn=()=>{};e.idle();}finally{console.warn=warn;}assert.equal(b.worlds.has('silverstone'),false);assert.equal(e.host.dataset.circuit,'monza');assert.ok(b.renderer.domElement.frame.startsWith('monza:'));assert.ok(fixture.freed.includes('silverstone'));b.dispose();
console.log('PASS: failed GPU preparation restores the live scene and releases the unusable cached world');
