import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRunService} from '../../src/server/runs/service';
import {runtimeModules} from '../../src/server/runs/runtime';
import {decodeImage} from '../../src/server/assets/media';
import {TaskInput,type RuntimeModules,type RunResult,type DraftEditable} from '../../src/contracts/business';
import {evidenceDigest} from '../../src/contracts/digests';
import {readModelSettings} from '../../src/server/runs/model-config';
import {BusinessError} from '../../src/server/runs/business-error';
const input=(platform:'wechat_moments'|'wechat_article'|'xiaohongshu'='wechat_moments')=>TaskInput.parse({productRequest:'HUAWEI MateBook 14（鸿蒙版）',targetAudience:'新生',useScenario:'开学学习',contentGoal:'咨询适用性',platform});
async function setup(t:TestContext, overrides:Partial<RuntimeModules>={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'huawei-s2-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const modules={...runtimeModules(),...overrides};
 return createRunService({root,modules,syntheticEnabled:true,modelSettings:()=>null,retrievalServices:async()=>({callIma:async()=>{throw new Error('synthetic network forbidden');},fetchMedia:async()=>{throw new Error('synthetic network forbidden');},decodeImage,persistPrivate:async()=>{}})});
}
async function ready(service:Awaited<ReturnType<typeof setup>>,platform:ReturnType<typeof input>['platform']='wechat_moments'){
 const run=await service.createRun({input:input(platform!),mode:'synthetic'});await service.actOnRun(run.runId,{action:'execute',expectedVersion:1});await service.waitForIdle();const done=await service.getRun(run.runId);assert.equal(done.state,'ready',JSON.stringify(done.issues));assert.equal(done.exportable,true);return done;
}
function editable(run:RunResult):DraftEditable{const {version,contentDigest,...draft}=run.draft!;return draft;}
for(const platform of ['wechat_moments','wechat_article','xiaohongshu'] as const)test(`synthetic integrated ${platform}: retrieve generate independently verify export`,async t=>{
 const s=await setup(t);const r=await ready(s,platform);const result=await s.exportRun(r.runId,1,'markdown');assert.equal(result.provenanceMode,'synthetic');assert.match(result.content,/synthetic/);assert.match(result.content,/来源/);assert.equal(r.executionEvidence.modelInvoked,false);assert.equal(r.validation!.semanticMode,'synthetic');assert.equal(r.draft!.selectedImages.length,platform==='wechat_moments'?1:platform==='wechat_article'?2:3);
});
for(const field of ['title','caption','image','order','position'] as const)test(`V-02/V-03 ${field} change invalidates until current revision is checked`,async t=>{
 const s=await setup(t);const r=await ready(s,'xiaohongshu');const draft=editable(r);
 if(field==='title')draft.title+=' 选购资料';if(field==='caption')draft.selectedImages[0].caption+=' 产品资料图';if(field==='image')draft.selectedImages[0].imageId=r.evidence!.images[3].imageId;if(field==='order')draft.selectedImages.reverse();if(field==='position')draft.selectedImages[0].placement.position='before';
 const changed=await s.actOnRun(r.runId,{action:'revise',expectedVersion:1,patch:{draft}});assert.equal(changed.currentVersion,2);assert.equal(changed.validation!.status,'stale');assert.equal(changed.exportable,false);
 await assert.rejects(s.exportRun(r.runId,2,'markdown'),{code:'EXPORT_NOT_READY'});await assert.rejects(s.exportRun(r.runId,1,'markdown'),{code:'VERSION_CONFLICT'});
 await s.actOnRun(r.runId,{action:'revalidate',expectedVersion:2});await s.waitForIdle();const checked=await s.getRun(r.runId);assert.equal(checked.exportable,true,JSON.stringify(checked.issues));assert.equal(checked.validation!.checkedVersion,2);assert.equal((await s.exportRun(r.runId,2,'text')).version,2);
});
test('V-03 platform change clears prior draft, evidence and report; regenerates strategy and images',async t=>{
 const s=await setup(t);const r=await ready(s);const changed=await s.actOnRun(r.runId,{action:'revise',expectedVersion:1,patch:{input:input('wechat_article')}});assert.equal(changed.evidence!.evidenceSetId,r.evidence!.evidenceSetId);assert.equal(changed.validation,null);assert.equal(changed.draft,null);assert.equal(changed.brief.briefVersion,2);await s.actOnRun(r.runId,{action:'regenerate',expectedVersion:2});await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(done.exportable,true);assert.equal(done.draft!.selectedImages.length,2);assert.notEqual(done.strategy!.strategyId,r.strategy!.strategyId);
});
test('V-04 delayed old generation cannot replace a new task revision',async t=>{
 let release!:()=>void;let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);const gate=new Promise<void>(resolve=>release=resolve);const actual=runtimeModules();let calls=0;
 const s=await setup(t,{generateDraft:async(...args)=>{if(++calls===1){started();await gate;}return actual.generateDraft(...args);}});
 const r=await s.createRun({input:input(),mode:'synthetic'});await s.actOnRun(r.runId,{action:'execute',expectedVersion:1});await entered;
 const revised=await s.actOnRun(r.runId,{action:'revise',expectedVersion:1,patch:{input:{...input('wechat_article'),useScenario:'出差办公',targetAudience:'经常出差的职场用户'}}});await s.actOnRun(r.runId,{action:'execute',expectedVersion:2});release();await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(done.currentVersion,2);assert.equal(done.input.useScenario,'出差办公');assert.equal(done.exportable,true);assert.equal(done.draft!.version,2);assert.match(done.strategy!.contentAngle,/出行/);assert.equal(revised.activeOperationId,null);
});
test('V-05 direct export unverified run is refused',async t=>{const s=await setup(t);const r=await s.createRun({input:input(),mode:'synthetic'});await assert.rejects(s.exportRun(r.runId,1,'markdown'),{code:'EXPORT_NOT_READY'});});
test('V-07 tampered image blocks export and revokes passed result',async t=>{const s=await setup(t);const r=await ready(s);await writeFile(path.join(s.repository.directory(r.runId),'assets',r.draft!.selectedImages[0].imageId+'.bin'),'tampered');await assert.rejects(s.exportRun(r.runId,1,'markdown'),{code:'MEDIA_UNAVAILABLE'});const done=await s.getRun(r.runId);assert.equal(done.state,'blocked');assert.equal(done.exportable,false);assert.equal(done.validation!.status,'stale');});
for(const kind of ['conflict','images','model'] as const)test(`explicit ${kind} failure cannot export`,async t=>{
 const real=runtimeModules();const s=await setup(t,kind==='model'?{generateDraft:async()=>{throw new BusinessError('MODEL_RATE_LIMITED','模型限流',503,true);}}:{retrieveEvidence:async(...args)=>{const r=await real.retrieveEvidence(...args);if(kind==='conflict')r.evidence.conflicts=[{fieldKey:'屏幕',message:'synthetic conflict',sourceIds:[r.evidence.sources[0].citationKey]}];else {r.evidence.images=r.evidence.images.slice(0,1);r.assets=r.assets.slice(0,1);}r.evidence.snapshotDigest=evidenceDigest(r.evidence);return r;}});
 const r=await s.createRun({input:input('xiaohongshu'),mode:'synthetic'});await s.actOnRun(r.runId,{action:'execute',expectedVersion:1});await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(done.state,'blocked');assert.equal(done.exportable,false);assert.equal(done.issues[0].code,kind==='conflict'?'SOURCE_CONFLICT':kind==='images'?'INSUFFICIENT_IMAGES':'MODEL_RATE_LIMITED');await assert.rejects(s.exportRun(r.runId,1,'markdown'),{code:'EXPORT_NOT_READY'});
});
test('B-01 incomplete input asks only missing fields and never executes model',async t=>{const s=await setup(t);const r=await s.createRun({input:TaskInput.parse({productRequest:'新生想买轻薄本'}),mode:'synthetic'});assert.equal(r.state,'needs_input');assert.ok(r.brief.missingFields.includes('productRequest'));await s.actOnRun(r.runId,{action:'execute',expectedVersion:1});await s.waitForIdle();assert.equal((await s.getRun(r.runId)).executionEvidence.modelInvoked,false);});
test('invalid model URL is safe absent configuration, never throws private URL',()=>{assert.equal(readModelSettings({NODE_ENV:'test',LLM_BASE_URL:'not a URL',LLM_API_KEY:'synthetic',LLM_MODEL:'synthetic'}),null);});

test('same-task validated snapshot reuse is explicit; new product must retrieve independently',async t=>{
 const actual=runtimeModules();let calls=0;const s=await setup(t,{retrieveEvidence:async(...args)=>{calls++;return actual.retrieveEvidence(...args);}});const r=await ready(s);
 await s.actOnRun(r.runId,{action:'regenerate',expectedVersion:1});await s.waitForIdle();const regenerated=await s.getRun(r.runId);assert.equal(calls,1);assert.equal(regenerated.exportable,true);assert.ok(regenerated.stageSummary.some(x=>x.summary.includes('复用本任务')&&x.summary.includes('本次未重新读取来源')&&x.summary.includes('synthetic')));
 await s.actOnRun(r.runId,{action:'revise',expectedVersion:2,patch:{input:{...input(),productRequest:'HUAWEI MateBook 16'}}});const changed=await s.getRun(r.runId);assert.equal(changed.evidence,null);await s.actOnRun(r.runId,{action:'execute',expectedVersion:3});await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(calls,2);assert.notEqual(done.evidence!.product.productKey,r.evidence!.product.productKey);assert.ok(done.evidence!.images.every(i=>i.productKey===done.evidence!.product.productKey));
});
test('same-task snapshot with broken image cannot regenerate through silent retrieval fallback',async t=>{const s=await setup(t);const r=await ready(s);await writeFile(path.join(s.repository.directory(r.runId),'assets',r.evidence!.images[0].imageId+'.bin'),'broken');await s.actOnRun(r.runId,{action:'regenerate',expectedVersion:1});await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(done.state,'blocked');assert.equal(done.issues[0].code,'MEDIA_UNAVAILABLE');assert.equal(done.exportable,false);});

test('fresh execute bypasses even valid task cache and issues a new content revision',async t=>{const actual=runtimeModules();let calls=0;const s=await setup(t,{retrieveEvidence:async(...args)=>{calls++;return actual.retrieveEvidence(...args);}});const r=await ready(s);await s.actOnRun(r.runId,{action:'execute',expectedVersion:1});await s.waitForIdle();const done=await s.getRun(r.runId);assert.equal(calls,2);assert.equal(done.currentVersion,2);assert.equal(done.exportable,true);assert.notEqual(done.evidence!.evidenceSetId,r.evidence!.evidenceSetId);});

test('conflicted snapshot never traps a retry after upstream correction',async t=>{const actual=runtimeModules();let calls=0;const s=await setup(t,{retrieveEvidence:async(...args)=>{const r=await actual.retrieveEvidence(...args);if(++calls===1){r.evidence.conflicts=[{fieldKey:'synthetic',message:'synthetic conflict',sourceIds:[r.evidence.sources[0].citationKey]}];r.evidence.snapshotDigest=evidenceDigest(r.evidence);}return r;}});const r=await s.createRun({input:input(),mode:'synthetic'});await s.actOnRun(r.runId,{action:'execute',expectedVersion:1});await s.waitForIdle();assert.equal((await s.getRun(r.runId)).state,'blocked');await s.actOnRun(r.runId,{action:'regenerate',expectedVersion:1});await s.waitForIdle();assert.equal(calls,2);assert.equal((await s.getRun(r.runId)).exportable,true);});

test('portable HTML export embeds verified originals, no external request or scripts',async t=>{
 const s=await setup(t);const r=await ready(s,'xiaohongshu');const output=await s.exportRun(r.runId,1,'html');
 assert.equal(output.mimeType,'text/html');assert.match(output.content,/data:image\/png;base64,/);assert.match(output.content,/小红书模拟预览/);assert.match(output.content,/未发布/);assert.match(output.content,/default-src 'none'/);assert.ok(!/<script|https?:\/\//.test(output.content));
 await s.actOnRun(r.runId,{action:'revise',expectedVersion:1,patch:{draft:{...editable(r),title:'新的标题'}}});await assert.rejects(s.exportRun(r.runId,2,'html'),{code:'EXPORT_NOT_READY'});
});
test('HTML escaping covers user/model text and attributes',async t=>{
 const s=await setup(t);const r=await ready(s);const {htmlForRun}=await import('../../src/server/runs/html-export');
 r.draft!.title='<script>alert(1)</script>';r.draft!.selectedImages[0].caption='" onerror="attack';
 const image=r.evidence!.images[0];const html=htmlForRun(r,new Map([[image.imageId,{bytes:Buffer.from('synthetic'),mimeType:'image/png'}]]));
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&quot; onerror=&quot;attack'));
});
test('local evidence cannot export with synthetic generation or synthetic semantic verdict',async t=>{
 const s=await setup(t);const r=await ready(s);const {canExport}=await import('../../src/server/runs/export-gate');
 r.mode='local';r.evidence!.provenanceMode='local';r.evidence!.snapshotDigest=evidenceDigest(r.evidence!);r.validation!.checkedEvidenceDigest=r.evidence!.snapshotDigest;
 assert.equal(canExport(r),false);r.executionEvidence.generationMode='live';r.executionEvidence.modelInvoked=true;assert.equal(canExport(r),false);r.validation!.semanticMode='live';assert.equal(canExport(r),true);
});
