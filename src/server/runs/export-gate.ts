import {IMAGE_COUNTS} from "../../contracts";
import type {RunResult} from "../../contracts/business";
import {contentDigest,evidenceDigest,strategyDigest} from "../../contracts/digests";
export function canExport(run:RunResult):boolean{
 const {draft,validation:v,evidence:e,strategy:s,brief:b}=run;
 if(run.state!=="ready"||run.activeOperationId||!draft||!v||!e||!s||!b.platform)return false;
 if(v.status!=="passed"||v.checkedVersion!==run.currentVersion||draft.version!==run.currentVersion||v.checkedContentDigest!==contentDigest(draft)||draft.contentDigest!==contentDigest(draft))return false;
 if(v.checkedEvidenceSetId!==e.evidenceSetId||v.checkedEvidenceDigest!==evidenceDigest(e)||e.snapshotDigest!==evidenceDigest(e)||v.checkedStrategyId!==s.strategyId||v.checkedStrategyDigest!==strategyDigest(s)||v.checkedBriefVersion!==b.briefVersion)return false;
 if(v.semanticMode==="not_run"||v.checks.length===0||v.checks.some(c=>c.status!=="passed")||[...run.issues,...v.issues].some(i=>i.status==="open"&&i.severity!=="warning")||e.conflicts.length)return false;
 if(run.mode==="live"&&(e.provenanceMode!=="live"||run.executionEvidence.generationMode!=="live"||!run.executionEvidence.modelInvoked||v.semanticMode!=="live"))return false;
 if(run.mode==="synthetic"&&(e.provenanceMode!=="synthetic"||v.semanticMode!=="synthetic"))return false;
 const ids=draft.selectedImages.map(i=>i.imageId);const range=IMAGE_COUNTS[b.platform];if(ids.length<range.min||ids.length>range.max||new Set(ids).size!==ids.length)return false;
 const images=ids.map(id=>e.images.find(i=>i.imageId===id));if(images.some(i=>!i||i.productKey!==e.product.productKey||i.availability!=="verified"||i.modelMatch!=="confirmed"))return false;
 if(new Set(images.map(i=>i!.contentDigest)).size!==images.length)return false;
 return true;
}
export function markdownForRun(run:RunResult,format:"markdown"|"text"){
 const d=run.draft!,e=run.evidence!;const blocks:string[]=[`# ${d.title}`,`模式：${run.mode}；版本：${run.currentVersion}；核验：已通过`,d.lead];
 for(const block of d.bodyBlocks){
  const renderImages=(position:string)=>d.selectedImages.filter(i=>i.placement.blockKey===block.blockKey&&i.placement.position===position).map(i=>{const asset=e.images.find(a=>a.imageId===i.imageId)!;return `[图片：${asset.fileName}]\n说明：${i.caption}\n用途：${i.purpose}\n来源：${asset.sourceView.sourceTitle} / ${asset.sourceView.locatorLabel}\n位置：${block.blockKey} / ${position}`;});
  blocks.push(...renderImages("before"),block.text,...renderImages("after"));
 }
 blocks.push(d.callToAction,d.tags.join(" "),"来源依据：");
 const used=new Set(d.bodyBlocks.flatMap(b=>b.factIds));for(const fact of e.facts.filter(f=>used.has(f.factId))){for(const source of e.sources.filter(s=>fact.sourceIds.includes(s.citationKey)))blocks.push(`- ${source.sourceTitle} / ${source.locatorLabel}：${source.supportingExcerpt??fact.supportedStatement}`);}
 const output=blocks.filter(Boolean).join("\n\n");return format==="text"?output.replace(/^# /,""):output;
}
