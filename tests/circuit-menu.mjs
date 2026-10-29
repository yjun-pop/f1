import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const cache=new Map();
function moduleURL(name){
  if(cache.has(name))return cache.get(name);
  let js=ts.transpileModule(fs.readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const folder=name.slice(0,name.lastIndexOf('/'));
  js=js.replace(/from '\.\.\/game\/(\w+)'/g,(_,dep)=>`from '${moduleURL('game/'+dep)}'`).replace(/from '\.\/(\w+)'/g,(_,dep)=>`from '${moduleURL(folder+'/'+dep)}'`);
  const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;cache.set(name,url);return url;
}
const {CircuitMenu,circuitPreview}=await import(moduleURL('ui/CircuitMenu'));
const {CIRCUITS}=await import(moduleURL('game/Circuits'));

function environment(href='https://example.test/f1/',saved={}){
  const nodes=new Map(),listeners=new Map(),frames=[],storage=new Map(Object.entries(saved)),launches=[],contexts=[];
  let locationURL=new URL(href),reloads=0;
  const node=(id,tag='div')=>{
    const classes=new Set(),events=new Map();let html='';
    const element={id,tag,events,value:'',textContent:'',checked:false,disabled:false,hidden:false,removed:false,
      classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
      addEventListener:(type,fn)=>events.set(type,fn),
      querySelector:selector=>nodes.get(selector.slice(1)),
      focus(){globalThis.document.activeElement=element;},remove(){element.removed=true;},
      matches:selector=>selector.split(',').some(part=>part.trim()===tag||part.trim()==='input[type="radio"]'&&tag==='input'&&element.type==='radio'),
      emit(type,extra={}){const event={target:element,preventDefault(){},stopPropagation(){},...extra};events.get(type)?.(event);},
      get innerHTML(){return html;},set innerHTML(value){html=value;
        for(const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
          const [,kind,attrs,key]=match,child=nodes.get(key)??node(key,kind);nodes.set(key,child);
          child.checked=/\bchecked\b/.test(attrs);child.type=/\btype="([^"]+)"/.exec(attrs)?.[1];
          child.value=/\bvalue="([^"]+)"/.exec(attrs)?.[1]??child.value;
        }
      }};nodes.set(id,element);return element;
  };
  const root=node('root'),app=node('app');
  globalThis.document={querySelector:selector=>nodes.get(selector.slice(1)),activeElement:null};
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  globalThis.window={
    addEventListener:(type,fn)=>{const set=listeners.get(type)??new Set();set.add(fn);listeners.set(type,set);},
    removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),
    history:{replaceState:(_,__,url)=>locationURL=new URL(url)},
    location:{get href(){return locationURL.href;},get search(){return locationURL.search;},reload:()=>reloads++}
  };
  globalThis.AudioContext=class {constructor(){contexts.push(this);}resume(){this.resumed=true;return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}};
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  globalThis.__loadMenuTestGame=async()=>({Game:class {constructor(viewport,hud,options){launches.push({viewport,hud,options});}}});
  return {root,app,nodes,storage,launches,contexts,frames,listeners,get reloads(){return reloads;},get href(){return locationURL.href;},
    async paint(){while(frames.length)await frames.shift()(0);},
    key(code,target={matches:()=>false},repeat=false){for(const fn of listeners.get('keydown')??[])fn({code,target,repeat,preventDefault(){}});}};
}

let env=environment(undefined,{'apex-best-spa-v3':'114.49'}),starts=[],modes=[];
const menu=new CircuitMenu(env.root,{selected:'monza',mode:'auto',keyboard:true,start:(...args)=>starts.push(args),transmission:mode=>modes.push(mode)});
assert.equal((env.root.innerHTML.match(/type="radio"/g)??[]).length,3);
assert.equal((env.root.innerHTML.match(/class="circuit-outline"/g)??[]).length,3);
const previews=CIRCUITS.map(c=>circuitPreview(c));assert.equal(new Set(previews).size,3);assert.ok(previews.every(p=>!p.includes('NaN')&&!p.includes('Infinity')));
env.nodes.get('circuit-spa').emit('change');
assert.equal(env.nodes.get('selection-title').textContent,'벨기에 · 스파');
assert.equal(env.nodes.get('selection-record').textContent,'1:54.490');
assert.equal(env.nodes.get('start-label').textContent,'스파에서 시작');
assert.equal(env.nodes.get('circuit-spa').checked,true);assert.equal(env.nodes.get('circuit-monza').checked,false);
assert.deepEqual(starts,[]);assert.equal(env.href,'https://example.test/f1/','Previewing must not navigate or begin a race');
env.nodes.get('start-transmission').value='manual';env.nodes.get('start-transmission').emit('change');env.nodes.get('start').emit('click');
assert.deepEqual(modes,['manual']);assert.deepEqual(starts,[['spa','manual']]);
console.log('PASS: three distinct geographic map cards, selected state, per-circuit record, no navigation on preview and one confirmed circuit/gearbox choice');

env.key('ArrowRight');assert.equal(env.nodes.get('circuit-monza').checked,true,'Circuit arrows wrap around');
assert.equal(document.activeElement,env.nodes.get('circuit-monza'));
env.key('Enter',env.nodes.get('start-transmission'));assert.equal(starts.length,1,'Enter in the gearbox dropdown must retain native behavior');
env.key('Enter',{matches:()=>false},true);assert.equal(starts.length,1,'Held Enter must not launch repeatedly');
env.nodes.get('menu-shell').emit('keydown',{code:'Enter',repeat:false,target:env.nodes.get('circuit-monza')});
assert.deepEqual(starts.at(-1),['monza','manual']);
menu.setLoading('몬자');menu.select('spa');menu.start();
assert.equal(starts.length,2);assert.equal(env.nodes.get('circuit-monza').checked,true);
assert.ok(env.nodes.get('start').disabled&&env.nodes.get('start-transmission').disabled&&CIRCUITS.every(c=>env.nodes.get('circuit-'+c.id).disabled));
assert.equal(env.nodes.get('menu-status').hidden,false);menu.dispose();assert.equal(env.listeners.get('keydown').size,0);
console.log('PASS: keyboard circuit navigation, Enter on a radio, native gearbox controls, loading lock and keyboard-listener cleanup');

menu.setError();assert.equal(env.nodes.get('start').disabled,false);menu.start();assert.equal(env.reloads,1,'A failed setup offers a clean reload, rather than creating a second renderer');
console.log('PASS: visible loading failure and clean retry');

async function bootstrap(unique){
  let js=ts.transpileModule(fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/import '\.\/[^']+\.css';/g,'').replace(/from '\.\/((?:ui|game)\/\w+)'/g,(_,dep)=>`from '${moduleURL(dep)}'`);
  js=js.replace("import('./game/Game')",'globalThis.__loadMenuTestGame()');
  await import(`data:text/javascript;base64,${Buffer.from(js+'\n// '+unique).toString('base64')}`);
}
env=environment('https://example.test/f1/?circuit=silverstone',{'apex-circuit':'spa','apex-transmission-mode':'manual'});
await bootstrap('initial-menu');
assert.equal(env.launches.length,0);assert.equal(env.contexts.length,0);assert.equal(env.frames.length,0,'Opening selection must not schedule a renderer or create audio');
assert.equal(env.nodes.get('front-circuit-silverstone').checked,true,'A circuit link still opens selection at the requested map');
env.nodes.get('front-circuit-spa').emit('change');env.nodes.get('front-circuit-monza').emit('change');
assert.equal(env.launches.length,0);assert.equal(env.frames.length,0);
env.nodes.get('front-start').emit('click');env.nodes.get('front-start').emit('click');
assert.equal(env.contexts.length,1);assert.equal(env.contexts[0].resumed,true,'Audio must be unlocked before asynchronous world setup');
assert.equal(env.launches.length,0,'Loading must be allowed to paint before construction');
await env.paint();assert.equal(env.launches.length,1);
assert.equal(env.launches[0].options.circuit,'monza');assert.equal(env.launches[0].options.transmission,'manual');assert.equal(env.launches[0].options.autoStart,true);
assert.equal(env.launches[0].options.audioContext,env.contexts[0]);assert.equal(env.nodes.get('front-menu').removed,true);
assert.equal(env.storage.get('apex-circuit'),'monza');assert.equal(env.listeners.get('keydown').size,0);
console.log('PASS: actual application bootstrap defers all world/audio setup, previews without reloads, paints loading and launches the confirmed map once with gesture-unlocked audio');

env=environment('https://example.test/f1/?circuit=spa&race=start');
await bootstrap('confirmed-next-race');await env.paint();
assert.equal(env.launches.length,1);assert.equal(env.launches[0].options.circuit,'spa');
assert.equal(new URL(env.href).searchParams.has('race'),false,'The next-race intent must be consumed so refresh returns to selection');
console.log('PASS: confirmed next-circuit start bypasses a second selection screen and consumes its one-time launch intent');
