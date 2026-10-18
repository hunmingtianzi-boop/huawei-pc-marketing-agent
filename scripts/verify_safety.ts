import {parse} from 'dotenv';
import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
async function main(){const env=parse(await readFile('.env.local'));const values=['IMA_OPENAPI_CLIENTID','IMA_OPENAPI_APIKEY','LLM_API_KEY'].map(k=>env[k]).filter(v=>v&&v.length>8);assert.equal(values.length,3);
 const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);let checked=0;for(const file of tracked){const bytes=await readFile(file);assert.ok(!values.some(v=>bytes.includes(v)),`credential leak in tracked ${file}`);checked++;}
 const chunks:string[]=[];async function walk(dir:string){for(const f of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())await walk(p);else if(f.name.endsWith('.js'))chunks.push(p);}}await walk('.next/static');for(const file of chunks){const bytes=await readFile(file);assert.ok(!values.some(v=>bytes.includes(v)),`credential leak in client ${file}`);}
 for(const route of ['/api/model','/api/connection','/api/runs']){const res=await fetch('http://127.0.0.1:3210'+route);assert.equal(res.status,200);const body=await res.text();assert.ok(!values.some(v=>body.includes(v)),`secret DTO ${route}`);assert.ok(!/"(?:headers|raw|kb_id|media_id|accessToken|apiKey)"\s*:/.test(body),'provider-private field in '+route);}
 assert.equal((await stat('.env.local')).mode&0o777,0o600);assert.ok(!tracked.includes('.env.local'));const report={at:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'PASS',trackedFiles:checked,clientChunks:chunks.length,checkedDTOs:3,credentialValuesPrinted:false,envPermission:'0600'};await mkdir('.local-evidence/stage2',{recursive:true});await writeFile('.local-evidence/stage2/safety.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
main().catch(e=>{console.error('Safety check FAIL:',e instanceof Error?e.message:'assertion');process.exitCode=1;});
