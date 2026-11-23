import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const js=ts.transpileModule(fs.readFileSync('src/game/AcademyLessons.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {LessonJudge,ActionGate,cornerExitAligned}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sample={dt:.1,metres:-140,speed:36,throttle:0,brake:0,steer:0,headingError:0,curvature:0,offRoad:false,impacts:0,boosting:false,energy:100,gap:12,lateralOffset:0};
let gate=new ActionGate();assert.equal(gate.update(true),false);assert.equal(gate.update(false),false);assert.equal(gate.update(true),true);
let j=new LessonJudge(0,sample,100,200,20);for(let i=0;i<15;i++)j.update({...sample,speed:42,throttle:1,lateralOffset:5});assert.equal(j.success,false);for(let i=0;i<11;i++)j.update({...sample,speed:42,throttle:1});assert.equal(j.success,true);
j=new LessonJudge(0,sample,100,200,20);j.update({...sample,offRoad:true});assert.equal(j.failed,'');j.update(sample);assert.equal(j.failed,'');for(let i=0;i<10;i++)j.update({...sample,offRoad:true});assert.ok(j.failed);
j=new LessonJudge(1,sample,100,200,20);j.update({...sample,impacts:1,brake:1,speed:15});assert.ok(j.failed);assert.equal(j.success,false);
j=new LessonJudge(1,sample,100,200,20);for(let i=0;i<4;i++)j.update({...sample,metres:-130,speed:19,brake:1});j.update({...sample,metres:95,speed:19,steer:.2,curvature:.02});assert.equal(j.success,false,'Early braking outside the corner zone does not pass');
for(const lesson of [1,2]){j=new LessonJudge(lesson,sample,100,200,20);for(let i=0;i<4;i++)j.update({...sample,metres:75,speed:19,brake:1});assert.equal(j.success,false);j.update({...sample,metres:95,speed:19,steer:.2,curvature:.02});assert.equal(j.entered,true);assert.equal(j.success,lesson===1);if(lesson===2){for(let i=0;i<8;i++)j.update({...sample,metres:260,speed:30,throttle:1,steer:.1,headingError:.03});assert.equal(j.success,true);}}
j=new LessonJudge(2,sample,100,200,20);for(let i=0;i<10;i++)j.update({...sample,metres:260,speed:30,throttle:1});assert.equal(j.success,false);
j=new LessonJudge(3,sample,100,200,20);j.update({...sample,gap:-8,throttle:1,energy:70});assert.equal(j.success,false);j.update({...sample,gap:-8,throttle:1,energy:70,boosting:true});assert.equal(j.success,true);
assert.equal(cornerExitAligned({...sample,metres:200,headingError:.3},200),false);assert.equal(cornerExitAligned({...sample,metres:200,steer:.5},200),false);assert.equal(cornerExitAligned({...sample,metres:201},200),true);
console.log('PASS sustained stable acceleration, brief excursion recovery, corner-zone braking, continuous corner exit, contact rejection and ERS use');
