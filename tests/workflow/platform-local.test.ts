import test from "node:test";
import assert from "node:assert/strict";
import type { DraftContent, DraftEditable, ModelClient } from "../../src/contracts/business";
import { contentDigest, evidenceDigest } from "../../src/contracts/digests";
import { createSyntheticModelClient } from "../../src/server/llm";
import { generateDraft, modelPayload } from "../../src/server/workflow";
import { validateDraft } from "../../src/server/verification";
import { fixture } from "./fixture";

const synthetic = createSyntheticModelClient();
const edit = (draft: DraftContent, mutate: (value: DraftEditable) => void) => {
  const value = structuredClone(draft);
  mutate(value);
  value.contentDigest = contentDigest(value);
  return value;
};

test("platform generation payload exposes distinct writing guidance and bounded facts, full verification keeps all facts", () => {
  const modes = ["wechat_moments", "xiaohongshu", "wechat_article"] as const;
  const payloads = modes.map(platform => modelPayload(fixture(platform), "generate"));
  assert.deepEqual(payloads.map(p => p.facts.length), [1, 3, 4]);
  assert.equal(new Set(payloads.map(p => p.writingGuide.format)).size, 3);
  for (const platform of modes) assert.equal(modelPayload(fixture(platform), "verify").facts.length, 4);
  const school = modelPayload(fixture("xiaohongshu"), "generate");
  const travel = modelPayload(fixture("xiaohongshu", "出差办公"), "generate");
  assert.equal(school.facts[0].fieldKey, "system");
  assert.equal(travel.facts[0].fieldKey, "portable");
  assert.notDeepEqual(school.strategy.outline, modelPayload(fixture("wechat_article"), "generate").strategy.outline);
});

test("synthetic platform render fixtures exercise short social post, shopping checklist and substantive article", async () => {
  const moments = (await generateDraft(fixture("wechat_moments"), synthetic)).draft;
  const note = (await generateDraft(fixture("xiaohongshu"), synthetic)).draft;
  const article = (await generateDraft(fixture("wechat_article"), synthetic)).draft;
  assert.equal(moments.lead, "");
  assert.equal(moments.bodyBlocks.length, 1);
  assert.ok(note.bodyBlocks.every(block => block.text.startsWith("□")));
  assert.ok(note.title.length <= 36);
  assert.ok(note.tags.every(tag => !tag.startsWith("#")));
  assert.match(note.callToAction, /收藏.*留言/);
  assert.ok(article.bodyBlocks.every(block => block.text.startsWith("【")));
  assert.ok(article.bodyBlocks.map(b => b.text).join("").length > note.bodyBlocks.map(b => b.text).join("").length);
  assert.equal(new Set([moments.callToAction, note.callToAction, article.callToAction]).size, 3);
});

test("platform form regression is blocked before independent semantic model", async () => {
  for (const platform of ["wechat_moments", "xiaohongshu", "wechat_article"] as const) {
    const context = fixture(platform);
    const generated = (await generateDraft(context, synthetic)).draft;
    const draft = edit(generated, value => {
      if (platform === "wechat_moments") value.tags = ["选购清单"];
      if (platform === "xiaohongshu") value.callToAction = "欢迎咨询具体需求。";
      if (platform === "wechat_article") value.bodyBlocks.forEach(b => { b.text = b.text.replace(/^【[^】]+】\s*/, ""); });
    });
    const report = await validateDraft({ ...context, draft }, async () => { throw Error("must not call model"); });
    assert.equal(report.status, "failed");
    assert.equal(report.semanticMode, "not_run");
    assert.ok(report.issues.some(i => i.code === "PLATFORM_ADAPTATION_INCOMPLETE"));
  }
});

test("local evidence never accepts synthetic generation or independent semantic verification", async () => {
  const context = fixture();
  const draft = (await generateDraft(context, synthetic)).draft;
  context.evidence.provenanceMode = "local";
  context.evidence.snapshotDigest = evidenceDigest(context.evidence);
  await assert.rejects(generateDraft(context, synthetic), (e: unknown) => (e as { code: string }).code === "MODEL_MODE_MISMATCH");
  await assert.rejects(validateDraft({ ...context, draft }, synthetic), (e: unknown) => (e as { code: string }).code === "MODEL_MODE_MISMATCH");
});

test("local provenance remains local with separate live-mode model responses (simulated transport only)", async () => {
  const context = fixture("wechat_article");
  context.evidence.provenanceMode = "local";
  context.evidence.snapshotDigest = evidenceDigest(context.evidence);
  const calls: string[] = [];
  const simulatedModel: ModelClient = async request => {
    calls.push(request.purpose);
    assert.equal((JSON.parse(request.user).evidence || JSON.parse(request.user)).sourceMode, "local");
    return { ...await synthetic(request), mode: "live", model: "simulated-live-response-not-real-call" };
  };
  const result = await generateDraft(context, simulatedModel);
  const report = await validateDraft({ ...context, draft: result.draft }, simulatedModel);
  assert.deepEqual(calls, ["generate", "verify"]);
  assert.equal(result.generationMode, "live");
  assert.equal(report.semanticMode, "live");
  assert.equal(report.status, "passed", JSON.stringify(report.issues));
  assert.equal(context.evidence.provenanceMode, "local");
});

test("local copy cannot claim fresh ima retrieval even when semantic model would approve", async () => {
  const context = fixture();
  const generated = (await generateDraft(context, synthetic)).draft;
  context.evidence.provenanceMode = "local";
  context.evidence.snapshotDigest = evidenceDigest(context.evidence);
  const draft = edit(generated, value => { value.bodyBlocks[0].text += "刚从ima实时查询了资料。"; });
  const report = await validateDraft({ ...context, draft }, async () => { throw Error("must not call model"); });
  assert.equal(report.status, "failed");
  assert.ok(report.issues.some(i => i.code === "SOURCE_MODE_MISREPRESENTED"));
});

test("replay and synthetic preserve explicit fixture paths", async () => {
  const context = fixture();
  context.evidence.provenanceMode = "replay";
  context.evidence.snapshotDigest = evidenceDigest(context.evidence);
  const result = await generateDraft(context, synthetic);
  assert.equal(result.generationMode, "synthetic");
  assert.equal((await validateDraft({ ...context, draft: result.draft }, synthetic)).semanticMode, "synthetic");
});
