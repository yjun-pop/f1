import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../src/account/Config.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {accountConfig}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
try{const config=accountConfig(JSON.parse(fs.readFileSync(new URL('../public/account-config.json',import.meta.url),'utf8')));console.log(config?'Account public configuration validated.':'Account server not configured; guest mode remains available.');}
catch(error){console.error('Account configuration rejected: '+error.message);process.exitCode=1;}
