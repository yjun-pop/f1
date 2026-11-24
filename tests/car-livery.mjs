import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('src/game/CarLivery.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {CAR_LIVERIES,carIdentity}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const team of['academy','atlas','vector','helix'])for(const number of[2,27,99])assert.deepEqual(carIdentity(team,number),{team,number});
for(const [team,number]of[['unknown',27],['__proto__',27],['atlas',1],['vector',100],['helix',2.5],['atlas','27'],[undefined,27]])assert.equal(carIdentity(team,number),undefined);
assert.equal(new Set(Object.values(CAR_LIVERIES).map(l=>l.primary)).size,4);assert.equal(new Set(Object.values(CAR_LIVERIES).map(l=>l.pattern)).size,4);
console.log('PASS saved contract identities, driver-number bounds, distinct team schemes and unknown-input fallback');
