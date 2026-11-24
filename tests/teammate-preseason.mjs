import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);let js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;js=js.replace(/from ['"]([^'"]+)['"]/g,(_,p)=>`from '${load(path.resolve(path.dirname(file),p)+'.ts')}'`);const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;}
const m=await import(load('src/career/Career.ts')),cal=await import(load('src/career/Calendar.ts')),t=await import(load('src/career/Teammate.ts')),p=await import(load('src/career/Preseason.ts'));
const result={seconds:270,offRoadSeconds:0,contacts:0,bestLap:88,position:1,score:90};
const start=(team='vector',number=27)=>m.signContract(m.assess(m.completeTraining(m.newCareer('테스트','대한민국',number)),result),team);
const ready=s=>{while(!cal.raceReady(s))s=cal.advanceCalendar(s);return s;};
const ids=['PLAYER','ai:nova','ai:vector','ai:solar','ai:polar','ai:orbit'];
const rows=order=>order.map((id,i)=>({id,position:i+1,completed:i<=order.indexOf('PLAYER')?3:2,finish:i<=order.indexOf('PLAYER')?265+i:null,best:88+i}));
const finish=(s,order)=>m.finishRound(ready(s),{...result,position:order.indexOf('PLAYER')+1},rows(order));
for(const [team,number,id]of[['atlas',14,'ai:nova'],['vector',22,'ai:solar'],['helix',63,'ai:orbit']]){
 const s=start(team,number),mate=t.teammateFor(s);assert.equal(mate.id,id);assert.notEqual(mate.number,number);assert.ok(m.readCareer(s));assert.deepEqual(t.teammateFor(m.readCareer(s)),mate);assert.equal(t.teammateAppearance(s).appearance.team,team);
 assert.ok(m.readCareer({...s,seasonPartner:undefined}));assert.equal(t.teammateFor({...s,seasonPartner:undefined}).id,id);
 assert.equal(m.readCareer({...s,seasonPartner:{...s.seasonPartner,number}}),null);assert.equal(m.readCareer({...s,seasonPartner:{...s.seasonPartner,year:2}}),null);
}
let s=start();assert.equal(t.teammateComparison(s).playerPoints,null);assert.equal(t.teammateComparison(s).gap,null);
s=finish(s,['PLAYER','ai:solar','ai:nova','ai:vector','ai:polar','ai:orbit']);assert.equal(t.teammateComparison(s).gap,7);assert.equal(t.teammateComparison(s).latest.partner.finish,null);
s=finish(s,['ai:solar','PLAYER','ai:nova','ai:vector','ai:polar','ai:orbit']);let comparison=t.teammateComparison(s);assert.equal(comparison.gap,0);assert.equal(comparison.playerPoints,43);assert.equal(comparison.partnerPoints,43);assert.equal(comparison.recent[0].round,1);
const sparse={...s,championship:s.championship.slice(1)};comparison=t.teammateComparison(sparse);assert.equal(comparison.games,1);assert.equal(comparison.playerPoints,18);assert.equal(comparison.partnerPoints,25);
for(let i=2;i<12;i++)s=finish(s,ids);s=cal.advanceCalendar(s);const oldId=t.teammateFor(s).id,yearTwo=m.nextSeason(s,'helix');assert.notEqual(t.teammateFor(yearTwo).id,oldId);assert.equal(t.teammateFor(yearTwo).id,'ai:orbit');assert.equal(yearTwo.championship.length,12);assert.equal(t.teammateComparison(yearTwo).games,0);assert.ok(m.readCareer(yearTwo));
const sample={dt:.3,elapsed:1,speed:25,throttle:0,brake:1,steer:0,offRoad:false,impacts:0,distance:0,finished:false,position:1,fieldSize:1,bestLap:0};
const run=new p.PreseasonRun();for(let i=1;i<=3;i++){run.update({...sample,distance:i/10-.01,guide:{section:i,currentSection:i===1?11:i-1,distance:90,sinceSection:220,targetKmh:100,brakeDistance:50}});run.update({...sample,dt:.5,distance:i/10+.01,throttle:1,brake:0,guide:{section:i+1,currentSection:i,distance:200,sinceSection:60,targetKmh:100,brakeDistance:null}});}
assert.throws(()=>run.finish(1,sample));const report=run.finish(1,{...sample,finished:true,elapsed:91});assert.equal(report.observedCorners,3);assert.equal(report.brakingCorners,3);assert.equal(report.cleanExits,3);
let preseason=cal.advanceCalendar(start());const original=structuredClone(preseason);preseason=m.completePreseason(preseason,report);assert.ok(m.readCareer(preseason));const {saveId:afterId,preseason:reports,...restAfter}=preseason,{saveId:beforeId,...restBefore}=original;assert.deepEqual(restAfter,restBefore);assert.equal(preseason.money,original.money);assert.equal(preseason.points,0);assert.equal(preseason.round,0);assert.equal(preseason.history.length,0);
preseason=m.completePreseason(preseason,{...report,seconds:92});assert.equal(preseason.preseason.length,1);assert.equal(p.currentPreseason(preseason).seconds,92);
assert.throws(()=>m.completePreseason(start(),report));assert.throws(()=>m.completePreseason(ready(start()),report));assert.equal(m.readCareer({...preseason,preseason:[{...report,year:2}]}),null);assert.equal(m.readCareer({...preseason,preseason:[{...report,cleanExits:4}]}),null);
const initial=new p.PreseasonRun();initial.update({...sample,dt:1,throttle:1,brake:0,distance:.01,guide:{section:1,currentSection:11,distance:500,sinceSection:50,targetKmh:100,brakeDistance:null}});assert.equal(initial.finish(1,{...sample,finished:true,elapsed:90}).cleanExits,0);
const incidents=new p.PreseasonRun();incidents.update({...sample,dt:1,offRoad:true,impacts:2});incidents.update({...sample,dt:1,offRoad:true,impacts:2});const incident=incidents.finish(1,{...sample,finished:true,elapsed:90});assert.equal(incident.contacts,2);assert.equal(incident.offRoadSeconds,2);assert.match(p.preseasonFeedback(incident).title,/접촉/);
assert.match(p.preseasonFeedback({...report,brakingCorners:0}).title,/제동/);assert.match(p.preseasonFeedback({...report,cleanExits:0}).title,/조향/);assert.match(p.preseasonFeedback({...report,observedCorners:0,brakingCorners:0,cleanExits:0}).evidence,/접촉 0회/);
assert.equal(p.currentPreseason({...yearTwo,preseason:[report]}),undefined);
console.log('PASS fixed season teammates, distinct numbers, legacy fallback, matched-round points/ties, measured finish status, transfers and yearly isolation');
console.log('PASS measured preseason braking/exit evidence, incident debounce, completed-lap saving, replacement/reload and unchanged dates/rewards/season records');
