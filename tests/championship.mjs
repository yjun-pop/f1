import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);let js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;js=js.replace(/from ['"]([^'"]+)['"]/g,(_,p)=>`from '${load(path.resolve(path.dirname(file),p)+'.ts')}'`);const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;}
const m=await import(load('src/career/Career.ts'));
const {CAREER_ROSTER,SEASON_POINTS,captureSeasonRace,seasonStandings,seasonMovement,championshipRivals}=await import(load('src/career/Championship.ts'));
const {RaceLaps}=await import(load('src/game/RaceLaps.ts'));
const cal=await import(load('src/career/Calendar.ts'));const ready=s=>{while(!cal.raceReady(s))s=cal.advanceCalendar(s);return s;};
const result={seconds:270,offRoadSeconds:0,contacts:0,bestLap:89,position:1,score:90};
const ids=CAREER_ROSTER.map(r=>r.id),[player,nova,vector,solar,polar,orbit]=ids;
const start=()=>m.signContract(m.assess(m.completeTraining(m.newCareer('드라이버','대한민국',27)),result),'vector');
const classification=order=>order.map((id,i)=>({id,position:i+1,completed:i>order.indexOf(player)?2:3,finish:i>order.indexOf(player)?null:268+i,best:i===5?null:88+i}));
const finish=(save,order)=>m.finishRound(ready(save),{...result,position:order.indexOf(player)+1},classification(order));
let s=start();assert.equal(seasonStandings(s).rows.length,6);assert.ok(seasonStandings(s).rows.every(r=>r.rank===null&&r.points===0));
s=finish(s,[nova,vector,player,solar,polar,orbit]);
assert.equal(s.championship.length,1);assert.throws(()=>m.finishRound(s,result));assert.deepEqual(s.championship[0].entries.map(e=>e.points),SEASON_POINTS);assert.equal(s.championship[0].entries.reduce((n,e)=>n+e.points,0),88);
assert.equal(seasonStandings(s).rows.find(r=>r.id===player).rank,3);assert.equal(seasonMovement(s),'첫 집계');
s=finish(s,[player,solar,polar,orbit,vector,nova]);
assert.equal(seasonStandings(s).rows.find(r=>r.id===player).points,40);assert.equal(seasonMovement(s),'↑ 2');assert.equal(seasonMovement(s,nova),'↓ 1');
assert.ok(m.readCareer(JSON.parse(JSON.stringify(s))));assert.equal(s.championship[1].entries.at(-1).finish,null);assert.equal(s.championship[1].entries.at(-1).best,null);
s=finish(s,[nova,player,vector,solar,polar,orbit]);assert.equal(s.championship.length,3);while(s.round<12)s=finish(s,ids);assert.throws(()=>finish(s,ids));const next=m.nextSeason(cal.advanceCalendar(s));assert.equal(next.championship.length,12);assert.equal(next.history.length,12);assert.ok(seasonStandings(next).rows.every(r=>r.points===0&&r.rank===null));
// Equal points use countback; identical sets of results remain joint ranks.
let tie=finish(finish(start(),[player,nova,vector,solar,polar,orbit]),[nova,player,solar,vector,orbit,polar]);let table=seasonStandings(tie);assert.equal(table.rows[0].rank,1);assert.equal(table.rows[1].rank,1);assert.equal(table.rows[2].rank,3);assert.ok(table.rows[0].tied&&table.rows[1].tied);
let countback=finish(finish(finish(start(),[player,nova,solar,polar,vector,orbit]),[solar,polar,nova,vector,player,orbit]),[solar,polar,vector,orbit,nova,player]);table=seasonStandings(countback);const a=table.rows.find(r=>r.id===player),b=table.rows.find(r=>r.id===nova);assert.equal(a.points,43);assert.equal(b.points,43);assert.ok(a.rank<b.rank);assert.equal(a.tied,false);
// Older player-only saves stay readable without inventing results for AI.
let legacy=m.finishRound(ready(start()),{...result,position:2});assert.ok(m.readCareer(legacy));assert.equal(legacy.championship,undefined);legacy=finish(legacy,ids);table=seasonStandings(legacy);assert.equal(table.complete,false);assert.ok(table.rows.every(r=>r.rank===null));assert.equal(table.rows.find(r=>r.id===player).points,43);assert.equal(table.rows.find(r=>r.id===nova).points,18);legacy=finish(legacy,ids);while(legacy.round<12)legacy=finish(legacy,ids);legacy=finish(m.nextSeason(cal.advanceCalendar(legacy)),ids);assert.equal(seasonStandings(legacy).complete,true);assert.equal(seasonStandings(legacy).rows[0].rank,1);
for(const mutate of [r=>r.push(r[0]),r=>r[0].id='unknown',r=>r[0].position=2,r=>r[0].completed=4,r=>r[0].completed=2,r=>r[0].finish=null,r=>r[0].finish=-1,r=>r[0].best=NaN]){const rows=classification(ids);mutate(rows);assert.throws(()=>captureSeasonRace(1,0,rows,1));}
assert.throws(()=>captureSeasonRace(1,0,classification(ids),2));
for(const mutate of [s=>s.championship.push(s.championship[0]),s=>s.championship[0].entries[0].points++,s=>s.championship[0].entries[0]=null,s=>s.championship[0].round=2,s=>s.championship[0].year=2,s=>s.championship[0].entries[0].id=player]){const bad=structuredClone(s);mutate(bad);assert.equal(m.readCareer(bad),null);}
// Retention remains consistent and within the existing server payload size.
let long=start();for(let i=0;i<126;i++){if(long.round===12)long=m.nextSeason(cal.advanceCalendar(long));long=finish(long,ids);}assert.equal(long.history.length,120);assert.equal(long.championship.length,120);assert.ok(m.readCareer(long));const bytes=Buffer.byteLength(JSON.stringify(long).replace(/,/g,', ').replace(/:/g,': '));assert.ok(bytes<131072,`${bytes} bytes`);
// Measured lap crossings feed a six-car snapshot; no synthetic finish times.
const clock=new RaceLaps(1000,3),samples=ids.map((id,i)=>({id,name:id,distance:-.02*i}));clock.reset(samples);
for(let t=1;t<=270;t++){samples.forEach((row,i)=>row.distance=-.02*i+t*(i===0?3/270:i===1?3/265:3/285));clock.update(samples,t);}
const measured=clock.standings(samples,270),saved=captureSeasonRace(1,0,measured,measured.find(r=>r.id===player).position);assert.equal(saved.entries.find(r=>r.id===player).finish,270);assert.equal(saved.entries.find(r=>r.id===nova).finish!==null,true);assert.equal(saved.entries.find(r=>r.id===vector).finish,null);
console.log('PASS championship: fixed six drivers, twelve-round points, countback/shared ties, rank movement, measured crossings, null finish times, reload validation, legacy migration and 120-race retention ('+bytes+' bytes)');

assert.deepEqual(championshipRivals(start()),[]);assert.deepEqual(championshipRivals(m.finishRound(ready(start()),result)),[]);
const middle=finish(start(),[nova,vector,player,solar,polar,orbit]);assert.deepEqual(championshipRivals(middle).map(r=>r.id),[vector,solar]);
assert.deepEqual(championshipRivals(finish(start(),ids)).map(r=>r.id),[nova,vector]);
assert.deepEqual(championshipRivals(finish(start(),[nova,vector,solar,polar,orbit,player])).map(r=>r.id),[orbit,polar]);
assert.equal(championshipRivals(tie)[0].id,nova);console.log('PASS preparation rivals: adjacent championship positions, leaders/trailers/shared ranks, first round and missing legacy results');
