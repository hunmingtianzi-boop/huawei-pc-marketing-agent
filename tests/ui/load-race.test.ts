import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { fixture } from "../workflow/fixture";
import { generateDraft } from "../../src/server/workflow";
import { validateDraft } from "../../src/server/verification";
import { createSyntheticModelClient } from "../../src/server/llm";
import { RunResult, BUSINESS_CONTRACT_VERSION } from "../../src/contracts/business";

// Exercise the actual component callbacks in a deterministic hook scheduler;
// no browser dependency, network, private materials or parallel implementation.
for(const edit of ["audience","title"] as const)test(`late history/latest response preserves new ${edit} edit and export guard`,async t=>{
 const context=fixture(),model=createSyntheticModelClient();const draft=(await generateDraft(context,model)).draft;
 const validation=await validateDraft({...context,draft},model),at=new Date().toISOString();
 const run=RunResult.parse({contractVersion:BUSINESS_CONTRACT_VERSION,runId:context.brief.taskId,createdAt:at,updatedAt:at,mode:"synthetic",input:{productRequest:context.brief.productRequest,targetAudience:context.brief.targetAudience,useScenario:context.brief.useScenario,contentGoal:context.brief.contentGoal,platform:context.brief.platform},brief:context.brief,state:"ready",currentVersion:1,activeOperationId:null,strategy:context.strategy,evidence:context.evidence,draft,validation,finalContent:draft,issues:[],exportable:true,stageSummary:[],executionEvidence:{retrievalMode:"synthetic",generationMode:"synthetic",modelInvoked:false,model:"synthetic",endpointOrigin:null}});
 const sourcePath=path.join(process.cwd(),"src/components/marketing-workbench.tsx"),sourceRequire=createRequire(sourcePath);
 const slots:any[]=[];let cursor=0;
 const react={useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value:any)=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(){}};
 const compiled=ts.transpileModule(readFileSync(sourcePath,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{} as any};
 new Function("require","module","exports",compiled)((id:string)=>id==="react"?react:id==="@/contracts"?sourceRequire("../contracts/index.ts"):id==="@/contracts/business"?sourceRequire("../contracts/business.ts"):id==="./draft-preview"?{default:()=>null}:sourceRequire(id),mod,mod.exports);
 const render=()=>{cursor=0;return mod.exports.default();};
 const nodes=(tree:any):any[]=>!tree||typeof tree!=="object"?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
 let release!:()=>void;const originalFetch=global.fetch;t.after(()=>{global.fetch=originalFetch;});
 global.fetch=(()=>new Promise(resolve=>{release=()=>resolve(Response.json({run}));})) as typeof fetch;
 nodes(render()).find(n=>n.props?.id==="run-history").props.onChange({target:{value:run.runId}});release();await new Promise(resolve=>setTimeout(resolve,0));
 if(edit==="title")nodes(render()).find(n=>n.type==="button"&&n.props.children==="载入最新记录").props.onClick();
 else nodes(render()).find(n=>n.props?.id==="run-history").props.onChange({target:{value:run.runId}});
 const field=()=>nodes(render()).find(n=>n.type==="input"&&(edit==="audience"?n.props.placeholder==="例如：新生":n.props.maxLength===300&&!n.props.placeholder));
 const marker=edit==="audience"?"新的目标人群":"载入期间的新标题";field().props.onChange({target:{value:marker}});
 release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(field().props.value,marker);
 assert.equal(nodes(render()).find(n=>n.type==="button"&&n.props.children==="下载图文 HTML").props.disabled,true);
});
