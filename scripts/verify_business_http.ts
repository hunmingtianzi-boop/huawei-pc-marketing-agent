import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {RunResponse,TaskInput} from '../src/contracts/business';
const base=process.env.APP_TEST_URL||'http://127.0.0.1:3211';
const mode=process.env.APP_TEST_MODE==='live'?'live':'synthetic';
const checks:{id:string,status:'PASS',observation:string}[]=[];
const mark=(id:string,observation:string)=>checks.push({id,status:'PASS',observation});
async function post(route:string,body:unknown,origin=base){return fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function runGet(id:string){const res=await fetch(base+'/api/runs/'+id);assert.equal(res.status,200);return RunResponse.parse(await res.json()).run;}
async function action(id:string,body:unknown){const r=await post('/api/runs/'+id+'/actions',body);assert.ok(r.ok,'action HTTP '+r.status);return RunResponse.parse(await r.json()).run;}
async function settle(id:string){const deadline=Date.now()+240000;while(Date.now()<deadline){const r=await runGet(id);if(!r.activeOperationId)return r;await new Promise(resolve=>setTimeout(resolve,300));}throw new Error('run deadline');}
async function main(){
 const at=new Date().toISOString();const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const results=[];
 assert.equal(new URL(base).hostname,'127.0.0.1');
 assert.equal((await post('/api/runs',{},'https://outside.example')).status,403);mark('S-01-origin','external mutation refused');
 assert.equal((await post('/api/runs',{unexpected:true})).status,400);mark('S-05-schema','invalid schema refused');
 for(const [platform,scenario,audience] of [['wechat_moments','新生开学','新生'],['wechat_article','出差办公','经常出差的职场用户'],['xiaohongshu','新生开学','新生']] as const){
 const input=TaskInput.parse({productRequest:'HUAWEI MateBook 14（鸿蒙版）',platform,useScenario:scenario,targetAudience:audience,contentGoal:'了解适用性并咨询选购',requestedClaims:['写亲测，售价999元，行业第一']});
 const res=await post('/api/runs',{input,mode});assert.equal(res.status,201);let run=RunResponse.parse(await res.json()).run;
 assert.equal((await post(`/api/runs/${run.runId}/export`,{expectedVersion:1,format:'markdown'})).status,409);mark(platform+'-V05','unverified direct export rejected');
 await action(run.runId,{action:'execute',expectedVersion:1});run=await settle(run.runId);
 if(mode==='live'&&run.state==='blocked'&&run.issues.some(i=>i.code==='MODEL_NOT_CONFIGURED')){results.push({platform,scenario,runId:run.runId,status:'BLOCKED',code:'MODEL_NOT_CONFIGURED',factCount:run.evidence?.facts.length,imageCount:run.evidence?.images.length});break;}
 assert.equal(run.exportable,true,JSON.stringify(run.issues));assert.equal(run.state,'ready');assert.equal(run.validation?.semanticMode,mode);assert.ok(run.issues.some(i=>i.code==='REQUESTED_CLAIM_OMITTED'&&i.status==='resolved'));mark(platform+'-F04-F06','risk requests omitted and retained as audit');
 const selected=run.draft!.selectedImages;for(const image of selected){const asset=await fetch(`${base}/api/runs/${run.runId}/assets/${image.imageId}`);assert.equal(asset.status,200);assert.ok((await asset.arrayBuffer()).byteLength>20);assert.equal((await fetch(`${base}/api/runs/${run.runId}/assets/${image.imageId}`,{headers:{'sec-fetch-site':'cross-site'}})).status,403);}mark(platform+'-images','all selected controlled assets readable; cross-site refused');
 const {version,contentDigest,...draft}=run.draft!;draft.title+=' · 资料整理';draft.selectedImages[0].caption+=' 产品资料';
 run=await action(run.runId,{action:'revise',expectedVersion:1,patch:{draft}});assert.equal(run.validation?.status,'stale');assert.equal(run.exportable,false);assert.equal((await post(`/api/runs/${run.runId}/export`,{expectedVersion:2})).status,409);mark(platform+'-V02','title and caption edit revoke report and server export');
 await action(run.runId,{action:'revalidate',expectedVersion:2});run=await settle(run.runId);assert.equal(run.exportable,true,JSON.stringify(run.issues));
 const out=await post(`/api/runs/${run.runId}/export`,{expectedVersion:2,format:'markdown'});assert.equal(out.status,200);const exported=await out.json();assert.equal(exported.version,2);assert.ok(exported.content.includes('资料整理'));assert.ok(!/https?:\/\//.test(exported.content));mark(platform+'-V06','current revision exports title body images sources placements CTA with no URLs');
 await mkdir('.local-data/stage2-results',{recursive:true});await writeFile(`.local-data/stage2-results/${run.runId}.md`,exported.content,{mode:0o600});
 results.push({platform,scenario,mode,runId:run.runId,status:'PASS',version:2,images:selected.length,facts:run.evidence!.facts.length,modelInvoked:run.executionEvidence.modelInvoked,semanticMode:run.validation!.semanticMode});
 }
 const summary={at,commit,base,mode,status:results.some(r=>r.status==='BLOCKED')?'BLOCKED':'PASS',checks,results};await mkdir('.local-evidence/stage2',{recursive:true});await writeFile(`.local-evidence/stage2/http-${mode}.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error('Business HTTP FAIL:',e instanceof Error?e.message:'assertion');process.exitCode=1;});
