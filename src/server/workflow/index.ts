import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ContentStrategy, IMAGE_COUNTS, TaskBrief } from "../../contracts";
import { DraftContent, DraftEditable, ProductEvidence, TaskInput, type GenerationContext, type ModelClient, type GenerationOutcome } from "../../contracts/business";
import { contentDigest, evidenceDigest } from "../../contracts/digests";
import { BusinessError } from "../runs/business-error";
import { runtimePrompt } from "./prompts";

export function clarifyTask(input: TaskInput, meta: { taskId: string; briefVersion: number }): z.infer<typeof TaskBrief> {
  input = TaskInput.parse(input);
  const missing: string[] = []; const questions: string[] = [];
  const require = (field: string, absent: boolean, question: string) => { if (absent) { missing.push(field); questions.push(question); } };
  require("productRequest", !input.productRequest?.trim() || !/(?:\d|MateBook\s*(?:X\s*Pro|Pro(?:\s*S)?|Fold(?:\s*非凡大师)?))/i.test(input.productRequest), "请提供知识库中的具体产品型号和版本，例如 HUAWEI MateBook 14（鸿蒙版）。");
  require("targetAudience", !input.targetAudience?.trim(), "本次内容面向哪类人群？");
  require("useScenario", !input.useScenario?.trim(), "本次主要使用场景是什么？");
  require("platform", !input.platform, "需要朋友圈、公众号还是小红书内容？");
  require("contentGoal", !input.contentGoal?.trim(), "希望读者了解适用性、咨询还是到店体验？");
  return TaskBrief.parse({ ...meta, productRequest: input.productRequest?.trim() || "待确认具体型号", productSelection: null, targetAudience: input.targetAudience?.trim() || null, useScenario: input.useScenario?.trim() || null, purchaseStage: input.purchaseStage, contentGoal: input.contentGoal?.trim() || null, platform: input.platform, requestedClaims: input.requestedClaims, constraints: input.constraints, missingFields: missing, clarifyingQuestions: questions, assumptions: input.purchaseStage === "unknown" ? ["购买阶段未知，先以了解适用性为目标，不假设优惠或库存。"] : [] });
}

export function planContent(brief: z.infer<typeof TaskBrief>): z.infer<typeof ContentStrategy> {
  brief = TaskBrief.parse(brief);
  if (brief.missingFields.length || !brief.platform) throw new BusinessError("MISSING_INPUT", "请先补齐影响执行的任务条件。", 409, true);
  const travel = /出差|差旅|商务|移动办公|职场/.test(`${brief.useScenario} ${brief.targetAudience}`);
  const school = /新生|开学|校园|学生/.test(`${brief.useScenario} ${brief.targetAudience}`);
  const topics = travel ? [["便携与移动使用", "往返通勤与差旅先确认携带条件"], ["办公协作及兼容边界", "移动办公需先核对软件及连接适用范围"], ["显示与使用条件", "长期办公关注显示条件"]] : school ? [["学习应用与使用边界", "开学选购先确认课程软件与学习需求"], ["显示与阅读条件", "阅读资料需了解可证显示信息"], ["便携与日常携带", "校园日常关注携带条件"]] : [["任务适用性", "先核对场景需求与资料支持范围"], ["关键配置及条件", "根据证据排序，不预设参数"], ["使用与携带条件", "确认日常使用边界"]];
  const platform = brief.platform;
  const outline = platform === "wechat_moments" ? [{ blockKey: "core", purpose: "围绕一个已证核心事实回应场景" }] : [{ blockKey: "scene", purpose: "场景问题与选购关注点" }, { blockKey: "facts", purpose: "有出处的事实与适用条件" }, { blockKey: "boundary", purpose: "使用边界与待咨询事项" }, { blockKey: "decision", purpose: "选购判断与下一步" }];
  const min = IMAGE_COUNTS[platform].min;
  return ContentStrategy.parse({ strategyId: randomUUID(), briefVersion: brief.briefVersion,
    audienceProblem: travel ? "出差往返与移动办公时，如何先确认携带和工作需求的适用性？" : school ? "新生开学选电脑，如何先确认学习需求和课程使用条件？" : `面向${brief.targetAudience}，如何确认${brief.useScenario}的实际适用性？`,
    contentAngle: travel ? "以出行与办公任务清单组织可证信息" : school ? "以开学学习任务清单组织选购依据" : "以用户任务对应资料依据",
    priorityTopics: topics.map(([topic, reason], i) => ({ topic, rank: i + 1, reason })), retrievalQuestions: topics.map(([topic]) => `${brief.productRequest} 在${brief.useScenario}场景下有哪些关于${topic}的可证原文与限制条件？`), outline,
    tone: brief.constraints.tone || (platform === "wechat_article" ? "客观解释，分段呈现资料与边界" : platform === "xiaohongshu" ? "轻松短段，提供选购清单，不使用伪造亲测" : "简洁克制，只突出一个核心事实"),
    imagePlan: Array.from({ length: min }, (_, i) => ({ purpose: `${travel ? "差旅办公" : school ? "新生学习" : brief.useScenario}选购资料：${i === 0 ? "核对产品外观与型号" : i === 1 ? "补充另一独立产品视角" : "补充不同细节视角"}，图片不作为未证功能依据`, suggestedBlockKey: outline[Math.min(i, outline.length - 1)].blockKey })),
    imageCountRange: IMAGE_COUNTS[platform], callToActionGoal: platform === "wechat_article" ? "可咨询课程或办公需求的适用条件，再预约了解。" : platform === "xiaohongshu" ? "收藏选购清单，留言或咨询自己的使用需求。" : "欢迎咨询适用性或预约到店了解。",
    reasoningSummary: `按${travel ? "移动办公先看携带与协作" : school ? "学习先看应用与阅读" : "任务适用性"}排序；${platform}使用${min}张起的独立 ima 图片，所有方向须取证后确认。` });
}

export function usableEvidence(context: GenerationContext) {
  const evidence = ProductEvidence.parse(context.evidence);
  if (evidence.conflicts.length || evidence.facts.some(f => f.status === "conflicted")) throw new BusinessError("SOURCE_CONFLICT", "产品资料存在冲突，请人工确认来源和条件后继续。", 409, true);
  if (evidence.snapshotDigest !== evidenceDigest(evidence)) throw new BusinessError("EVIDENCE_DIGEST_MISMATCH", "资料快照已变化，请重新取证。", 409, true);
  const sourceIds = new Set(evidence.sources.filter(s => s.reviewAccess !== "unavailable").map(s => s.citationKey));
  const facts = evidence.facts.filter(f => f.status === "supported" && f.productKey === evidence.product.productKey && f.sourceIds.length && f.sourceIds.every(id => sourceIds.has(id)));
  if (!facts.length) throw new BusinessError("NO_SUPPORTED_FACTS", "没有型号与来源均可确认的产品事实。", 409, true);
  const seen = new Set<string>();
  const images = evidence.images.filter(i => {
    if (i.productKey !== evidence.product.productKey || i.modelMatch !== "confirmed" || i.availability !== "verified" || i.previewAssetKey !== i.imageId || i.sourceView.reviewAccess === "unavailable" || !i.modelMatchSummary || !i.contentDigest || seen.has(i.contentDigest)) return false;
    seen.add(i.contentDigest); return true;
  });
  const range = context.brief.platform ? IMAGE_COUNTS[context.brief.platform] : null;
  if (!range || images.length < range.min) throw new BusinessError("INSUFFICIENT_IMAGES", `当前有${images.length}张独立且型号可证的图片，平台至少需要${range?.min ?? 1}张，缺少${Math.max(0, (range?.min ?? 1) - images.length)}张。`, 409, true);
  return { facts, images };
}

/** Explicit minimal evidence projection. No full documents or provider refs. */
export function modelPayload(context: GenerationContext, purpose: "generate" | "verify" = "verify") {
  const { facts, images } = usableEvidence(context);
  const travel = /出差|差旅|商务|移动办公|职场/.test(`${context.brief.useScenario} ${context.brief.targetAudience}`);
  const ordered = facts.map((fact, n) => ({ fact, n, score: travel ? /便携|重量|轻|携带/.test(`${fact.fieldKey} ${fact.supportedStatement}`) ? 0 : /办公|协作|连接/.test(fact.supportedStatement) ? 1 : 2 : /学习|应用|软件|系统/.test(`${fact.fieldKey} ${fact.supportedStatement}`) ? 0 : /显示|屏|阅读/.test(fact.supportedStatement) ? 1 : 2 })).sort((a, b) => a.score - b.score || a.n - b.n).map(x => x.fact);
  return { brief: { targetAudience: context.brief.targetAudience, useScenario: context.brief.useScenario, contentGoal: context.brief.contentGoal, platform: context.brief.platform, requestedClaims: context.brief.requestedClaims, constraints: context.brief.constraints }, strategy: context.strategy, product: { displayName: context.evidence.product.displayName, variant: context.evidence.product.variant }, facts: (purpose === "generate" && context.brief.platform === "wechat_moments" ? ordered.slice(0, 1) : purpose === "generate" ? ordered.slice(0, 3) : ordered).map(f => ({ factId: f.factId, fieldKey: f.fieldKey, supportedStatement: f.supportedStatement, qualifiers: f.qualifiers, value: f.value, unit: f.unit })), images: images.map(i => ({ imageId: i.imageId, description: i.sourceView.supportingExcerpt || "产品外观资料图", modelMatchSummary: i.modelMatchSummary })) };
}

export async function generateDraft(context: GenerationContext, model: ModelClient): Promise<GenerationOutcome> {
  if (context.brief.missingFields.length || !context.brief.platform) throw new BusinessError("MISSING_INPUT", "任务条件尚未补齐。", 409, true);
  if (context.strategy.briefVersion !== context.brief.briefVersion) throw new BusinessError("STALE_STRATEGY", "策略与当前任务不一致，请重新规划。", 409, true);
  const response = await model({ purpose: "generate", system: await runtimePrompt("generate"), user: JSON.stringify(modelPayload(context, "generate")) });
  if (context.evidence.provenanceMode === "live" && response.mode !== "live") throw new BusinessError("MODEL_MODE_MISMATCH", "真实资料任务不能使用 synthetic 模型结果。", 409, true);
  let editable: DraftEditable;
  try { editable = DraftEditable.parse(JSON.parse(response.text)); }
  catch { throw new BusinessError("MODEL_RESPONSE_INVALID", "模型输出未符合草稿结构，请重新生成。", 502); }
  return { draft: DraftContent.parse({ ...editable, version: context.version, contentDigest: contentDigest(editable) }), generationMode: response.mode, modelInvoked: response.mode === "live", model: response.model, endpointOrigin: response.endpointOrigin };
}
