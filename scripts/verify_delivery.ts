import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {RunResponse,ExportResponse,LocalCatalog,TaskInput,type RunResult} from "../src/contracts/business";
const base=process.env.APP_TEST_URL||"http://127.0.0.1:3210";
const folder=".local-evidence/delivery", outputs=".local-data/delivery-results";
const observations:Record<string,unknown>[]=[];
const commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
async function report(){await mkdir(folder,{recursive:true});await writeFile(`${folder}/business.json`,JSON.stringify({at:new Date().toISOString(),commit,sourceMode:"local",modelMode:"live",observations},null,2));}
async function post(route:string,body:unknown){return fetch(base+route,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify(body)});}
async function read(id:string){const response=await fetch(`${base}/api/runs/${id}`);assert.equal(response.status,200);return RunResponse.parse(await response.json()).run;}
async function act(run:RunResult,action:string,patch?:unknown){const response=await post(`/api/runs/${run.runId}/actions`,{action,expectedVersion:run.currentVersion,...(patch?{patch}:{})});assert.ok(response.ok,`action ${response.status}`);let current=RunResponse.parse(await response.json()).run;const deadline=Date.now()+240000;while(current.activeOperationId&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,600));current=await read(run.runId);}assert.equal(current.activeOperationId,null,"operation timeout");return current;}
async function archive(run:RunResult,label:string){
 const entry={label,runId:run.runId,version:run.currentVersion,product:run.evidence?.product.displayName,platform:run.input.platform,scenario:run.input.useScenario,state:run.state,status:run.exportable?"PASS":"FAIL",issues:run.issues.map(i=>({code:i.code,message:i.message})),images:run.draft?.selectedImages.length,sourceMode:run.evidence?.provenanceMode,generationMode:run.executionEvidence.generationMode,modelInvoked:run.executionEvidence.modelInvoked,model:run.executionEvidence.model,semanticMode:run.validation?.semanticMode,evidenceSetId:run.evidence?.evidenceSetId,retrievedAt:run.evidence?.retrievedAt,previewURL:`${base}/?run=${run.runId}#platform-preview`};
 observations.push(entry);await report();await mkdir(outputs,{recursive:true,mode:0o700});await writeFile(`${outputs}/${run.runId}-v${run.currentVersion}.json`,JSON.stringify(run),{mode:0o600});
 if(!run.exportable)return false;
 assert.equal(run.mode,"local");assert.equal(run.evidence?.provenanceMode,"local");assert.equal(run.executionEvidence.generationMode,"live");assert.equal(run.validation?.semanticMode,"live");assert.equal(run.executionEvidence.modelInvoked,true);
 for(const format of ["markdown","html"] as const){const response=await post(`/api/runs/${run.runId}/export`,{expectedVersion:run.currentVersion,format});assert.equal(response.status,200);const output=ExportResponse.parse(await response.json());assert.equal(output.provenanceMode,"local");if(format==="html"){assert.ok(!/<script|https?:\/\//.test(output.content));assert.equal((output.content.match(/<img src="data:image\//g)||[]).length,run.draft!.selectedImages.length);}await writeFile(`${outputs}/${run.runId}-v${run.currentVersion}.${format==="html"?"html":"md"}`,output.content,{mode:0o600});}
 const unique=new Set<string>();for(const selected of run.draft!.selectedImages){const image=run.evidence!.images.find(i=>i.imageId===selected.imageId)!;assert.ok(!unique.has(image.contentDigest));unique.add(image.contentDigest);const response=await fetch(`${base}/api/runs/${run.runId}/assets/${image.imageId}`);assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),image.mimeType);}
 return true;
}
async function generated(run:RunResult,label:string){for(let attempt=1;attempt<=3;attempt++){run=await act(run,attempt===1?"execute":"regenerate");if(await archive(run,`${label} attempt${attempt}`))return run;}throw new Error(`${label}: generation did not pass after 3 attempts`);}
async function create(platform:"wechat_moments"|"wechat_article"|"xiaohongshu",scenario:string,product="HUAWEI MateBook 14（鸿蒙版）"){
 const input=TaskInput.parse({productRequest:product,targetAudience:scenario==="新生开学"?"大学新生":"经常出差的职场用户",useScenario:scenario,contentGoal:"帮助读者核对需求并咨询适用性",platform,requestedClaims:["请写到手999元和亲测最好用"]});const response=await post("/api/runs",{input,mode:"local"});assert.equal(response.status,201);return RunResponse.parse(await response.json()).run;
}
async function main(){
 const response=await fetch(base+"/api/local-catalog");assert.equal(response.status,200);const catalog=LocalCatalog.parse(await response.json());assert.equal(catalog.available,true);assert.ok(catalog.products.length>1);observations.push({label:"actual local catalog",status:"PASS",products:catalog.products});await report();
 let first=await create("wechat_moments","新生开学");assert.equal((await post(`/api/runs/${first.runId}/export`,{expectedVersion:1,format:"html"})).status,409);first=await generated(first,"moments school");
 const {version,contentDigest,...editable}=first.draft!;editable.title+=" · 选购前核对";editable.selectedImages[0].caption+=" 产品资料图";let revised=await act(first,"revise",{draft:editable});assert.equal(revised.exportable,false);assert.equal(revised.validation?.status,"stale");assert.equal((await post(`/api/runs/${first.runId}/export`,{expectedVersion:revised.currentVersion,format:"html"})).status,409);revised=await act(revised,"revalidate");assert.equal(await archive(revised,"title caption invalidation revalidation"),true);
 await generated(await create("xiaohongshu","新生开学"),"xiaohongshu school");
 await generated(await create("wechat_article","出差办公"),"article travel");
 let travel=await act(revised,"revise",{input:{...revised.input,useScenario:"出差办公",targetAudience:"经常出差的职场用户"}});travel=await act(travel,"regenerate");assert.notDeepEqual(travel.strategy?.priorityTopics,revised.strategy?.priorityTopics);if(!await archive(travel,"same product/platform different scenario"))travel=await generated(travel,"moments travel retry");
 const different=await generated(await create("wechat_moments","出差办公","HUAWEI MateBook Pro S"),"different model Pro S");assert.notEqual(different.evidence?.product.displayName,first.evidence?.product.displayName);
 const short=await act(await create("xiaohongshu","新生开学","HUAWEI MateBook D 16 2024"),"execute");assert.equal(short.state,"blocked");assert.ok(short.issues.some(i=>i.code==="INSUFFICIENT_IMAGES"));assert.equal((await post(`/api/runs/${short.runId}/export`,{expectedVersion:short.currentVersion,format:"html"})).status,409);observations.push({label:"actual D16 insufficient images",status:"PASS",runId:short.runId,images:short.evidence?.images.length,required:3,exportBlocked:true});await report();
 console.log(JSON.stringify({status:"PASS",observations:observations.length,report:`${folder}/business.json`,outputs}));
}
main().catch(async error=>{await report();console.error(error instanceof Error?error.message:"delivery verification failed");process.exitCode=1;});
