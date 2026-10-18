import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture";
import { generateDraft } from "../../src/server/workflow";
import { createSyntheticModelClient } from "../../src/server/llm";
import { validateDraft } from "../../src/server/verification";
import { mismatchedProductMentions } from "../../src/server/verification/model-mentions";
import { contentDigest } from "../../src/contracts/digests";

test("known model families, qualifiers and years cannot pass on substring identity", () => {
 const product = fixture().evidence.product;
 for (const name of ["MateBook Pro S", "MateBook Pro", "MateBook Fold 非凡大师", "MateBook D 14", "MateBook GT 14", "MateBook X Pro", "MateBook 14 Pro", "MateBook 14（Windows版）", "MateBook 14 酷睿 Ultra"]) assert.equal(mismatchedProductMentions(name, product).length, 1, name);
 assert.deepEqual(mismatchedProductMentions("HUAWEI MateBook 14（鸿蒙版）与 MateBook14", product), []);
 for (const [target, mention] of [["HUAWEI MateBook Pro S","MateBook Pro"],["HUAWEI MateBook D 14 2024","MateBook D 14 2023"],["HUAWEI MateBook Fold 非凡大师","MateBook Fold 企业版"]]) assert.equal(mismatchedProductMentions(mention,{...product,displayName:target}).length,1);
 assert.deepEqual(mismatchedProductMentions("MateBook D 14",{...product,displayName:"HUAWEI MateBook D 14 2024"}),[]);
 assert.deepEqual(mismatchedProductMentions("MateBook Pro S",{...product,displayName:"HUAWEI MateBook Pro S"}),[]);
});
test("wrong known model is code-blocked across all visible fields before approving semantic response", async () => {
 const context=fixture();const model=createSyntheticModelClient();const original=(await generateDraft(context,model)).draft;
 for (const field of ["title","lead","caption","purpose","body","cta","tag"]) {
  const draft=structuredClone(original);const wrong="MateBook Pro S";
  if(field==="caption")draft.selectedImages[0].caption=wrong;
  else if(field==="purpose")draft.selectedImages[0].purpose=wrong;
  else if(field==="body")draft.bodyBlocks[0].text+=" "+wrong;
  else if(field==="cta")draft.callToAction=wrong;
  else if(field==="tag")draft.tags=[wrong];
  else draft[field as "title"|"lead"]=wrong;
  draft.contentDigest=contentDigest(draft);let calls=0;
  const report=await validateDraft({...context,draft},async req=>{calls++;return model(req);});
  assert.ok(report.issues.some(i=>i.code==="MODEL_PARAMETER_MISMATCH"),field);assert.equal(calls,0);
 }
});
test("ordinary first-step wording is allowed, promotional first-place remains blocked", async () => {
 const context=fixture(),model=createSyntheticModelClient();const draft=(await generateDraft(context,model)).draft;
 draft.title="开学选电脑：第一步先列出需求";draft.contentDigest=contentDigest(draft);
 assert.equal((await validateDraft({...context,draft},model)).status,"passed");
 for(const title of ["行业第一","性能第一","销量第1"]){draft.title=title;draft.contentDigest=contentDigest(draft);assert.ok((await validateDraft({...context,draft},model)).issues.some(i=>i.code==="PROHIBITED_MARKETING_CLAIM"));}
});
