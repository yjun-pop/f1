import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const js=ts.transpileModule(fs.readFileSync('src/game/AcademyLessons.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {LessonJudge,ActionGate}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sample={dt:.1,metres:20,speed:42,throttle:0,brake:0,steer:0,headingError:0,curvature:0,offRoad:false,impacts:0,boosting:false,energy:100,gap:12};
let gate=new ActionGate();assert.equal(gate.update(true),false);assert.equal(gate.update(false),false);assert.equal(gate.update(true),true);
let j=new LessonJudge(0,sample,100,200,20);j.update({...sample,speed:250/3.6,throttle:1});assert.equal(j.success,false);j.update({...sample,speed:250/3.6,throttle:1});assert.equal(j.success,true);
for(const invalid of [{offRoad:true},{impacts:1}]){j=new LessonJudge(0,sample,100,200,20);for(let i=0;i<4;i++)j.update({...sample,speed:80,throttle:1,...invalid});assert.equal(j.success,false);assert.ok(j.failed);}
j=new LessonJudge(1,sample,100,200,20);for(let i=0;i<4;i++)j.update({...sample,metres:75,speed:19,brake:1});assert.equal(j.success,false,'Straight braking alone cannot pass');j.update({...sample,metres:95,speed:19,steer:.2,curvature:.02});assert.equal(j.success,true);
j=new LessonJudge(1,sample,100,200,20);for(let i=0;i<4;i++)j.update({...sample,metres:95,speed:19,steer:.2,curvature:.02,impacts:1});assert.equal(j.success,false);
j=new LessonJudge(1,sample,100,200,20);j.update({...sample,metres:95,speed:19,steer:.2,curvature:.02});assert.equal(j.success,false,'Coasting into a corner cannot pass braking');
j=new LessonJudge(2,{...sample,speed:18},100,200,20);for(let i=0;i<8;i++)j.update({...sample,metres:260,speed:25,throttle:1,steer:.7,headingError:.4});assert.equal(j.success,false);for(let i=0;i<8;i++)j.update({...sample,metres:260,speed:25,throttle:1,steer:.1,headingError:.03});assert.equal(j.success,true);
j=new LessonJudge(3,sample,100,200,20);j.update({...sample,gap:-8,throttle:1,energy:70});assert.equal(j.success,false,'Passing without deployment cannot pass');j.update({...sample,gap:-8,throttle:1,energy:70,boosting:true});assert.equal(j.success,true);
console.log('PASS independent academy scoring: fresh input, 250km/h hold, actual corner/brake action, wall/grass rejection, aligned exit and energy-assisted pass');
