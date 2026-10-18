import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {RunResponse,type RunResult,ExportResponse} from '../src/contracts/business';
const base=process.env.APP_TEST_URL||'http://127.0.0.1:3210';
const id=process.env.APP_LIVE_RUN_ID;
const target=process.env.APP_LIVE_PLATFORM;
const reportFile=target?`live-case-${target}.json`:'live-controls.json';
const observations:unknown[]=[];
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function read(){const r=await fetch(`${base}/api/runs/${id}`);assert.equal(r.status,200);return RunResponse.parse(await r.json()).run;}
async function post(suffix:string,body:unknown){return fetch(`${base}/api/runs/${id}${suffix}`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function act(run:RunResult,action:string,patch?:unknown){const r=await post('/actions',{action,expectedVersion:run.currentVersion,...(patch?{patch}:{})});assert.ok(r.ok,'action HTTP '+r.status);let next=RunResponse.parse(await r.json()).run;const until=Date.now()+240000;while(next.activeOperationId&&Date.now()<until){await new Promise(r=>setTimeout(r,400));next=await read();}return next;}
async function archive(run:RunResult,label:string){
 const observation={label,runId:id,version:run.currentVersion,platform:run.brief.platform,scenario:run.brief.useScenario,status:run.exportable?'PASS':'FAIL',state:run.state,codes:run.issues.map(i=>i.code),images:run.draft?.selectedImages.length,model:run.executionEvidence.model,modelInvoked:run.executionEvidence.modelInvoked,generationMode:run.executionEvidence.generationMode,semanticMode:run.validation?.semanticMode,evidenceSetId:run.evidence?.evidenceSetId,retrievedAt:run.evidence?.retrievedAt,reusedVerifiedTaskSnapshot:true,sourceReadInThisOperation:false};observations.push(observation);
 await report();await mkdir('.local-data/stage2-results',{recursive:true,mode:0o700});await writeFile(`.local-data/stage2-results/${id}-v${run.currentVersion}.json`,JSON.stringify(run),{mode:0o600});if(!run.exportable)return false;const r=await post('/export',{expectedVersion:run.currentVersion,format:'markdown'});assert.equal(r.status,200);const output=ExportResponse.parse(await r.json());assert.equal(output.provenanceMode,'live');assert.ok(!/https?:\/\//.test(output.content));
 await mkdir('.local-data/stage2-results',{recursive:true,mode:0o700});await writeFile(`.local-data/stage2-results/${id}-v${run.currentVersion}.md`,output.content,{mode:0o600});await writeFile(`.local-data/stage2-results/${id}-v${run.currentVersion}.json`,JSON.stringify(run),{mode:0o600});return true;
}
async function report(){await mkdir('.local-evidence/stage2',{recursive:true});await writeFile('.local-evidence/stage2/'+reportFile,JSON.stringify({at:new Date().toISOString(),commit,mode:'live-model-with-current-task-live-snapshot',observations},null,2));}
async function main(){assert.ok(id,'APP_LIVE_RUN_ID must identify a real run with existing live evidence');let run=await read();assert.equal(run.mode,'live');assert.equal(run.evidence?.provenanceMode,'live');assert.equal(run.evidence?.product.displayName,'HUAWEI MateBook 14（鸿蒙版）');
 if(target){assert.ok(['wechat_article','wechat_moments','xiaohongshu'].includes(target));run=await act(run,'revise',{input:{...run.input,platform:target}});run=await act(run,'regenerate');const passed=await archive(run,'targeted platform regression -> '+target);console.log(JSON.stringify({status:passed?'PASS':'FAIL',reportFile}));if(!passed)process.exitCode=1;return;}
 if(run.input.platform!=='wechat_moments'||run.input.useScenario!=='新生开学')run=await act(run,'revise',{input:{...run.input,platform:'wechat_moments',useScenario:'新生开学',targetAudience:'新生'}});run=await act(run,'regenerate');assert.equal(await archive(run,'first real moments generation verification export'),true);
 const {version,contentDigest,...draft}=run.draft!;draft.title+=' · 资料整理';draft.selectedImages[0].caption+=' 产品资料';const stale=await act(run,'revise',{draft});assert.equal(stale.exportable,false);assert.equal(stale.validation?.status,'stale');assert.equal((await post('/export',{expectedVersion:stale.currentVersion})).status,409);run=await act(stale,'revalidate');assert.equal(await archive(run,'title caption revision invalidation revalidation export'),true);
 for(const [platform,scenario,audience,label] of [
 ['xiaohongshu','新生开学','新生','same task platform -> xiaohongshu'],
 ['xiaohongshu','出差办公','经常出差的职场用户','same platform scenario -> travel'],
 ['wechat_article','出差办公','经常出差的职场用户','same travel task platform -> article'],
 ['wechat_moments','出差办公','经常出差的职场用户','same travel task platform -> moments'],
 ] as const){const previous=run;run=await act(run,'revise',{input:{...run.input,platform,useScenario:scenario,targetAudience:audience}});assert.equal(run.exportable,false);assert.equal(run.validation,null);assert.equal(run.draft,null);run=await act(run,'regenerate');assert.notEqual(run.strategy?.strategyId,previous.strategy?.strategyId);if(scenario!==previous.brief.useScenario)assert.notDeepEqual(run.strategy?.priorityTopics,previous.strategy?.priorityTopics);await archive(run,label);}
 await report();const status=(observations as {status:string}[]).every(x=>x.status==='PASS')?'PASS':'FAIL';if(status==='FAIL')process.exitCode=1;console.log(JSON.stringify({status,cases:observations.length,artifact:'.local-evidence/stage2/live-controls.json'}));
}
main().catch(async error=>{await report();console.error('Live controls FAIL:',error instanceof Error?error.message:'assertion');process.exitCode=1;});
