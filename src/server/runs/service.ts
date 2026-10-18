import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {IMAGE_COUNTS} from "../../contracts";
import {BUSINESS_CONTRACT_VERSION,ProductEvidence,RunResult,TaskInput,type CreateRunRequest,type RunActionRequest,type RunResult as Run,type ExportResponse,type RuntimeModules,type RetrievalServices,type ModelSettings} from "../../contracts/business";
import {contentDigest,evidenceDigest} from "../../contracts/digests";
import {BusinessError} from "./business-error";
import {ImaError} from "../ima/errors";
import {RunRepository} from "./repository";
import {runtimeModules} from "./runtime";
import {dataRoot} from "./probe-store";
import {readModelSettings} from "./model-config";
import {inspectSkill,officialTransport} from "../ima/transport";
import {fetchMedia,decodeImage} from "../assets/media";
import {cacheRunAssets,readRunAsset} from "../assets/run-assets";
import {canExport,markdownForRun} from "./export-gate";

type Services = { modules:RuntimeModules; root:string; syntheticEnabled:boolean; modelSettings:()=>ModelSettings|null; retrievalServices:(run:Run,privateDir:string)=>Promise<RetrievalServices> };
const now=()=>new Date().toISOString();
function issue(code:string,message:string,category:"system"|"fact"|"image"="system") {return {issueId:randomUUID(),code,severity:"blocker" as const,category,location:"run",message,evidenceKeys:[],resolution:"retry" as const,status:"open" as const};}
function invalidate(run:Run){run.exportable=false;run.finalContent=null;run.activeOperationId=null;if(run.validation)run.validation={...run.validation,status:"stale"};}
class StaleOperation extends Error {}
export function createRunService(deps:Services){
 const repo=new RunRepository(deps.root);const pending=new Set<Promise<void>>();
 async function getRun(id:string){const run=await repo.get(id);run.exportable=canExport(run);run.finalContent=run.exportable?run.draft:null;return RunResult.parse(run);}
 async function createRun(request:CreateRunRequest){
  if(request.mode==="synthetic"&&!deps.syntheticEnabled)throw new BusinessError("SYNTHETIC_DISABLED","本机未启用合成测试。",403);
  const runId=randomUUID(),at=now();const input=TaskInput.parse(request.input);const brief=deps.modules.clarifyTask(input,{taskId:runId,briefVersion:1});
  const run:Run={contractVersion:BUSINESS_CONTRACT_VERSION,runId,createdAt:at,updatedAt:at,mode:request.mode,input,brief,state:brief.missingFields.length?"needs_input":"draft",currentVersion:1,activeOperationId:null,strategy:null,evidence:null,draft:null,validation:null,finalContent:null,issues:[],exportable:false,stageSummary:[],executionEvidence:{retrievalMode:request.mode,generationMode:"not_run",modelInvoked:false,model:null,endpointOrigin:null}};
  return repo.save(run);
 }
 async function tokenUpdate(id:string,version:number,operationId:string,change:(run:Run)=>void){
  const result=await repo.update(id,run=>{if(run.currentVersion!==version||run.activeOperationId!==operationId)return null;change(run);run.updatedAt=now();return run;});if(!result)throw new StaleOperation();return result;
 }
 async function perform(start:Run,operation:"execute"|"regenerate"|"revalidate"){
  const version=start.currentVersion,operationId=start.activeOperationId!,id=start.runId;
  const update=(change:(run:Run)=>void)=>tokenUpdate(id,version,operationId,change);
  const stage=(state:Run["state"],summary:string)=>update(run=>{run.state=state;run.stageSummary.push({stage:state,at:now(),status:"running",summary});});
  try{
   let current=await repo.get(id);
   if(operation!=="revalidate"){
    const strategy=deps.modules.planContent(current.brief);
    await update(run=>{run.strategy=strategy;});
    await stage("retrieving","正在只读获取产品原文、事实与型号图片。");
    const privateDir=path.join(repo.directory(id),"private",operationId);const services=await deps.retrievalServices(current,privateDir);
    const retrieved=await deps.modules.retrieveEvidence({runId:id,productRequest:current.brief.productRequest,mode:current.mode},services);
    const evidence=ProductEvidence.parse(retrieved.evidence);
    if(evidence.provenanceMode!==current.mode||evidence.snapshotDigest!==evidenceDigest(evidence))throw new BusinessError("EVIDENCE_INVALID","取证模式或摘要不一致。",409);
    const sources=new Set(evidence.sources.map(s=>s.citationKey));
    if(evidence.facts.some(f=>f.productKey!==evidence.product.productKey||!f.sourceIds.length||f.sourceIds.some(s=>!sources.has(s))))throw new BusinessError("EVIDENCE_INVALID","事实型号或来源引用不一致。",409);
    await cacheRunAssets(repo.directory(id),evidence,retrieved.assets);
    for(const doc of retrieved.documents){z.uuid().parse(doc.sourceId);await mkdir(privateDir,{recursive:true,mode:0o700});await writeFile(path.join(privateDir,`document-${doc.sourceId}.txt`),doc.text,{mode:0o600});}
    current=await update(run=>{run.evidence=evidence;run.brief={...run.brief,productSelection:evidence.product};run.executionEvidence.retrievalMode=evidence.provenanceMode;run.stageSummary.push({stage:"retrieving",at:now(),status:"passed",summary:`已读取 ${evidence.facts.length} 条事实与 ${evidence.images.length} 张不重复候选图。`});});
    if(evidence.conflicts.length||evidence.facts.some(f=>f.status==="conflicted"))throw new BusinessError("SOURCE_CONFLICT","产品资料存在冲突，已停止当前成稿。",409,true);
    if(!evidence.facts.some(f=>f.status==="supported"))throw new BusinessError("NO_SUPPORTED_FACTS","没有可用于成稿的已支持事实。",409,true);
    const platform=current.brief.platform!;if(evidence.images.length<IMAGE_COUNTS[platform].min)throw new BusinessError("INSUFFICIENT_IMAGES",`当前只有 ${evidence.images.length} 张型号可证图片，所选平台至少需要 ${IMAGE_COUNTS[platform].min} 张。`,409,true);
    await stage("generating","正在从已支持事实生成平台图文。");
    const model=current.mode==="synthetic"?deps.modules.createSyntheticModelClient():deps.modules.createLiveModelClient(deps.modelSettings());
    const outcome=await deps.modules.generateDraft({brief:current.brief,strategy:current.strategy!,evidence,version},model);
    if(outcome.draft.version!==version||outcome.draft.contentDigest!==contentDigest(outcome.draft)||outcome.generationMode!==current.mode)throw new BusinessError("DRAFT_INVALID","生成版本、摘要或模式不一致。",409);
    current=await update(run=>{run.draft=outcome.draft;run.executionEvidence={retrievalMode:evidence.provenanceMode,generationMode:outcome.generationMode,modelInvoked:outcome.modelInvoked,model:outcome.model,endpointOrigin:outcome.endpointOrigin};});
   }
   current=await stage("validating","正在独立核验所有文案、事实引用与图片。");
   if(!current.draft||!current.evidence||!current.strategy)throw new BusinessError("DRAFT_MISSING","没有可核验的草稿。",409);
   const model=current.mode==="synthetic"?deps.modules.createSyntheticModelClient():deps.modules.createLiveModelClient(deps.modelSettings());
   const validation=await deps.modules.validateDraft({brief:current.brief,strategy:current.strategy,evidence:current.evidence,version,draft:current.draft},model);
   await update(run=>{
    run.validation=validation;run.issues=validation.issues;run.activeOperationId=null;run.state=validation.status==="passed"?"ready":validation.issues.some(i=>i.severity==="blocker"&&i.status==="open")?"blocked":"needs_revision";
    run.exportable=canExport(run);run.finalContent=run.exportable?run.draft:null;
    if(validation.status==="passed"&&!run.exportable){run.state="failed";run.validation={...validation,status:"failed"};run.issues=[...run.issues,issue("STALE_VALIDATION","核验未绑定当前完整版本，已拒绝导出。")];}
    run.stageSummary.push({stage:"validating",at:now(),status:run.exportable?"passed":"blocked",summary:run.exportable?"当前版本核验通过，可请求服务端导出。":"当前稿尚不满足导出条件。"});
   });
  }catch(error){
   if(error instanceof StaleOperation)return;
   const safe=error instanceof BusinessError?{code:error.code,message:error.message,blocked:error.blocked}:error instanceof ImaError?{...error.safe(),blocked:error.blocked}:{code:"INTERNAL_ERROR",message:"本机业务执行失败，请检查私有诊断。",blocked:false};
   try{await update(run=>{invalidate(run);run.state=safe.blocked?"blocked":"failed";run.issues=[issue(safe.code,safe.message,safe.code.includes("IMAGE")?"image":safe.code.includes("SOURCE")?"fact":"system")];run.stageSummary.push({stage:run.state,at:now(),status:safe.blocked?"blocked":"failed",summary:safe.message});});}catch(e){if(!(e instanceof StaleOperation))throw e;}
  }
 }
 async function actOnRun(id:string,action:RunActionRequest){
  const updated=await repo.update(id,run=>{
   if(run.currentVersion!==action.expectedVersion)throw new BusinessError("VERSION_CONFLICT","任务已有新版本，请重新读取。",409);
   if(action.action==="revise"){
    if(action.patch.input&&action.patch.draft)throw new BusinessError("INVALID_INPUT","任务条件和稿件请分开修改。",400);
    if(action.patch.draft&&!run.draft)throw new BusinessError("DRAFT_MISSING","当前没有可编辑的草稿。",409);
    invalidate(run);run.currentVersion++;run.issues=[];
    if(action.patch.input){run.input=TaskInput.parse(action.patch.input);run.brief=deps.modules.clarifyTask(run.input,{taskId:id,briefVersion:run.brief.briefVersion+1});run.strategy=null;run.evidence=null;run.draft=null;run.validation=null;run.executionEvidence={retrievalMode:run.mode,generationMode:"not_run",modelInvoked:false,model:null,endpointOrigin:null};run.state=run.brief.missingFields.length?"needs_input":"draft";}
    else if(action.patch.draft){run.draft={...action.patch.draft,version:run.currentVersion,contentDigest:contentDigest(action.patch.draft)};run.state="needs_revision";}
    run.stageSummary.push({stage:"revision",at:now(),status:"blocked",summary:"内容或任务已修改，旧核验与导出立即失效。"});
   }else{
    if(run.activeOperationId)throw new BusinessError("RUN_BUSY","当前任务正在执行；修改任务可使旧操作失效。",409);
    if(run.brief.missingFields.length){run.state="needs_input";return run;}
    if(action.action==="revalidate"&&(!run.draft||!run.evidence||!run.strategy))throw new BusinessError("DRAFT_MISSING","当前没有可重新核验的草稿。",409);
    if(action.action==="execute"&&!["draft","needs_input","blocked","failed"].includes(run.state))throw new BusinessError("ACTION_INVALID","请使用重新生成或重新核验。",409);
    invalidate(run);if(action.action==="regenerate"){run.currentVersion++;run.draft=null;}
    if(action.action!=="revalidate"){run.draft=null;run.evidence=null;run.strategy=null;run.executionEvidence={retrievalMode:run.mode,generationMode:"not_run",modelInvoked:false,model:null,endpointOrigin:null};}
    run.issues=[];run.activeOperationId=randomUUID();run.state=action.action==="revalidate"?"validating":"planning";
   }
   run.updatedAt=now();return run;
  });
  if(!updated)throw new BusinessError("RUN_NOT_FOUND","任务不存在。",404);
  if(action.action!=="revise"&&updated.activeOperationId){const job=perform(updated,action.action);pending.add(job);void job.then(()=>pending.delete(job),()=>pending.delete(job));}
  return getRun(id);
 }
 async function exportRun(id:string,version:number,format:"markdown"|"text"):Promise<ExportResponse>{
  // Re-check under the same per-run lock used by edits. No stale export races.
  let result:ExportResponse|undefined;
  await repo.update(id,run=>{if(run.currentVersion!==version)throw new BusinessError("VERSION_CONFLICT","请求的导出版本已失效。",409);if(!canExport(run))throw new BusinessError("EXPORT_NOT_READY","当前版本尚未核验通过。",409);result={runId:id,version,fileName:`marketing-${id}-v${version}.${format==="markdown"?"md":"txt"}`,mimeType:format==="markdown"?"text/markdown":"text/plain",content:markdownForRun(run,format),provenanceMode:run.evidence!.provenanceMode};return run;});
  const snapshot=await repo.get(id);
  try{for(const image of snapshot.draft!.selectedImages)await readRunAsset(repo.directory(id),snapshot,image.imageId);}
  catch(error){await repo.update(id,run=>{if(run.currentVersion!==version)return null;invalidate(run);run.state="blocked";run.issues=[issue("MEDIA_UNAVAILABLE","当前图片原件不可用，已撤销导出。","image")];return run;});throw error;}
  // An edit during async file validation must invalidate this response too.
  const current=await repo.get(id);if(current.currentVersion!==version||!canExport(current)||current.draft!.contentDigest!==snapshot.draft!.contentDigest)throw new BusinessError("VERSION_CONFLICT","导出检查期间任务已修改。",409);
  return result!;
 }
 return {createRun,getRun,listRuns:()=>repo.list(),actOnRun,exportRun,repository:repo,async waitForIdle(){while(pending.size)await Promise.allSettled([...pending]);}};
}
let singleton:ReturnType<typeof createRunService>|undefined;
function service(){return singleton??=createRunService({modules:runtimeModules(),root:dataRoot(),syntheticEnabled:process.env.APP_ENABLE_SYNTHETIC==="true",modelSettings:()=>readModelSettings(),retrievalServices:async(run,privateDir)=>{
 const persistPrivate=async(fileName:string,data:string|Uint8Array)=>{if(path.basename(fileName)!==fileName||fileName.includes("..")||fileName.length>180)throw new BusinessError("PRIVATE_PATH_INVALID","私有证据文件路径不合法。",400);await mkdir(privateDir,{recursive:true,mode:0o700});await writeFile(path.join(privateDir,fileName),data,{mode:0o600});};
 if(run.mode==="synthetic")return {callIma:async()=>{throw new BusinessError("SYNTHETIC_NETWORK_DENIED","合成任务不能调用真实 ima。",409);},fetchMedia,decodeImage,persistPrivate};
 const skill=await inspectSkill(process.env.IMA_SKILL_PATH||"vendor/ima-skill/ima_api.cjs");const call=officialTransport(skill.script,dataRoot());let count=0;const started=Date.now();
 return {callIma:async(method,params)=>{if(++count>80||Date.now()-started>150000)throw new BusinessError("BUDGET_EXCEEDED","本次只读取证预算已用完。",409,true);const response=await call(method,params);await persistPrivate(`response-${count}-${method}.json`,JSON.stringify(response));return response;},fetchMedia,decodeImage,persistPrivate};
}});}
export async function createRun(request:CreateRunRequest){return service().createRun(request);}
export async function getRun(id:string){return service().getRun(id);}
export async function listRuns(){return service().listRuns();}
export async function actOnRun(id:string,request:RunActionRequest){return service().actOnRun(id,request);}
export async function exportRun(id:string,version:number,format:"markdown"|"text"){return service().exportRun(id,version,format);}
